/**
 * Stripe subscription lifecycle — SERVER ONLY.
 *
 * Owns: account/mode configuration, the product/price registry, authoritative
 * provider reads, the single webhook entry point, the bounded durable replay,
 * and caller-scoped checkout/portal creation. Never import from client code.
 *
 * Shape of the trust boundary:
 *  - Every database touch goes through a service-role SQL function from the
 *    20261028183000 migration. This module performs NO table reads or writes,
 *    so ownership, fencing, receipt state and the entitlement predicate cannot
 *    be bypassed from TypeScript, and legacy `claimWebhookEvent` is untouched.
 *  - A webhook payload is used only for: signature verification, mode
 *    detection, and the retained (event id, type, object id) triple. Every
 *    decision is taken from a fresh authoritative read, never from payload
 *    metadata and never from `event.created` alone.
 *  - Ownership of a Stripe customer comes only from the server-side mapping
 *    written during checkout creation.
 *  - The account that owns the restricted key is VERIFIED before every provider
 *    mutation (customer, Checkout Session, Portal Session) and before any
 *    returned object is trusted; a key prefix proves live/test, not which
 *    account.
 *  - The grant computed here is only half the gate: the SQL projection
 *    re-derives it from the projected facts and refuses a claim it cannot
 *    confirm.
 *  - Uncertainty never grants and never revokes: incomplete, ambiguous, foreign
 *    or unreadable evidence leaves the receipt retryable and answers the
 *    provider with a retryable failure. An unknown result is never a success.
 */
import { createHash, randomUUID } from "node:crypto";
import { manualRedirectFetch } from "./provider-fetch.server";
import {
  ENTITLEMENT_GRANT_STATUSES,
  RELEVANT_STRIPE_EVENT_TYPES,
  STRIPE_LIFECYCLE_API_VERSION,
  TERMINAL_STRIPE_STATUSES,
  authoritativeReadTarget,
  blocksNewSubscription,
  buildPriceRegistry,
  completeListData,
  grantsPaidAccess,
  integrationIdentifier,
  isIntegrationIdentifierSuffix,
  isRestrictedKey,
  isRevocableStripeStatus,
  isStripeAccountId,
  livemodeFor,
  modeFromLivemode,
  readBillingPortalUrl,
  readCheckoutSession,
  readCreatedCustomerId,
  readSubscriptionEvidence,
  stripeEventEnvelope,
  targetKindForEventType,
  verifyStripeSignature,
  type AuthoritativeTargetKind,
  type CheckoutSessionView,
  type PriceRegistryEntry,
  type PriceRegistryResult,
  type StripeMode,
  type SubscriptionEvidence,
} from "./stripe-lifecycle";
import type { PlanId } from "./billing";

type Env = Record<string, string | undefined>;
const BODY_LIMIT = 262_144;
const READ_TIMEOUT_MS = 15_000;
/**
 * Lease TTL. One reconciliation makes up to three authoritative calls, each
 * bounded by READ_TIMEOUT_MS, so a 30-second lease could expire mid-read and
 * leave a worker writing without ownership. The lease is additionally RENEWED
 * (never re-fenced, never stolen) immediately before the projection write.
 */
const LEASE_TTL_SECONDS = 60;
/** Stripe retains idempotency keys for 24h. Past that a "retry" would be a NEW
 * attempt, so an ambiguous checkout attempt is FENCED — kept non-terminal, with
 * its unique slot still held — and only an authoritative read may settle it.
 * The window is measured from the request's immutable creation time and
 * re-evaluated against a fresh clock before every duplicable mutation, never
 * once at the start of an attempt whose later steps all await. */
export const IDEMPOTENCY_RETENTION_MS = 24 * 3600 * 1000;
const MAX_REPLAY_LIMIT = 25;
export const LIST_LIMIT = 100;

/**
 * The single write entry point for the projection.
 *
 * It names the GUARDED wrapper from the additive commercial migration
 * (20261028223000), which requires this exact lease, refuses a projection that
 * would widen an allowance while a paid plan/seat change is unresolved, and
 * otherwise delegates to the accepted foundation's
 * `stripe_apply_subscription_projection` UNCHANGED and in the same transaction.
 * The foundation function is not modified, re-created or re-granted; it is
 * simply no longer called directly, so the gate cannot be bypassed from
 * application code.
 */
export const STRIPE_PROJECTION_RPC = "stripe_commercial_guarded_projection";

export class StripeLifecycleError extends Error {
  /**
   * The underlying database/transport message, when there was one.
   *
   * `code` stays the stable `<rpc>_failed` label every existing caller matches
   * on. `detail` is additive and purely informational to this module: a caller
   * that must distinguish a DETERMINISTIC SQL rejection (a `RAISE EXCEPTION`
   * the frozen functions define) from a transport failure that proves nothing
   * cannot do it from `code` alone, and guessing "rejection" for both is how an
   * ambiguous error became a terminal refusal.
   */
  detail = "";
  constructor(readonly code: string) {
    super(code);
    this.name = "StripeLifecycleError";
  }
}

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A wall clock, read FRESHLY at every point a decision needs "now".
 *
 * Reusing one timestamp across a batch would let a replay judge a billing
 * period, a lease or an idempotency window against a time that has already
 * passed, so the clock is a function and never a captured value.
 */
export type Clock = () => number;
function millis(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new StripeLifecycleError("clock_unavailable");
  return Math.floor(value);
}
function clockFrom(now: number | Clock | undefined): Clock {
  if (typeof now === "function") return () => millis(now());
  if (typeof now === "number") return () => millis(now);
  return () => millis(Date.now());
}
function idOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string")
    return (value as { id: string }).id.trim();
  return "";
}

export interface StripeLifecycleConfig {
  /** Mode-specific account ids: an isolated sandbox is its own account, so the
   * live and test account ids are NOT assumed to be the same. */
  accountIds: Record<StripeMode, string>;
  keys: Record<StripeMode, string>;
  webhookSecrets: Record<StripeMode, string>;
  registries: Record<StripeMode, PriceRegistryResult>;
  integrationSuffix: string;
  sandboxOwners: ReadonlySet<string>;
  returnBase: string;
  configError(mode: StripeMode): string | null;
  webhookReady(mode: StripeMode): boolean;
  checkoutReady(mode: StripeMode): boolean;
}

export function stripeLifecycleConfig(env: Env = process.env): StripeLifecycleConfig {
  const accountIds: Record<StripeMode, string> = {
    live: trimmed(env.STRIPE_ACCOUNT_ID_LIVE),
    test: trimmed(env.STRIPE_ACCOUNT_ID_TEST),
  };
  const keys: Record<StripeMode, string> = {
    live: trimmed(env.STRIPE_RESTRICTED_KEY_LIVE),
    test: trimmed(env.STRIPE_RESTRICTED_KEY_TEST),
  };
  const webhookSecrets: Record<StripeMode, string> = {
    live: trimmed(env.STRIPE_WEBHOOK_SECRET_LIVE),
    test: trimmed(env.STRIPE_WEBHOOK_SECRET_TEST),
  };
  const registries: Record<StripeMode, PriceRegistryResult> = {
    live: buildPriceRegistry("live", env),
    test: buildPriceRegistry("test", env),
  };
  const integrationSuffix = trimmed(env.STRIPE_INTEGRATION_IDENTIFIER_SUFFIX);
  const returnBase = trimmed(env.MILO_STRIPE_LIFECYCLE_RETURN_BASE);
  const sandboxOwners = new Set(
    trimmed(env.MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value),
      ),
  );
  const returnBaseValid = (() => {
    if (!returnBase) return false;
    try {
      const url = new URL(returnBase);
      return url.protocol === "https:" && !url.username && !url.password && !url.search;
    } catch {
      return false;
    }
  })();

  /** A configuration problem is reported as an explicit error, never silently
   * downgraded to "price unknown". Absent configuration is `not_configured`. */
  const configError = (mode: StripeMode): string | null => {
    const registry = registries[mode];
    if (!registry.ok) return `registry_${registry.reason}`;
    if (!isStripeAccountId(accountIds[mode])) return "account_not_configured";
    if (!isRestrictedKey(keys[mode], mode)) return "key_not_configured";
    if (!/^whsec_[A-Za-z0-9+/=_-]+$/.test(webhookSecrets[mode])) return "webhook_not_configured";
    return null;
  };
  const webhookReady = (mode: StripeMode) => configError(mode) === null;
  const checkoutReady = (mode: StripeMode) =>
    webhookReady(mode) &&
    isIntegrationIdentifierSuffix(integrationSuffix) &&
    returnBaseValid &&
    (registries[mode].ok ? registries[mode].registry.size > 0 : false);

  return {
    accountIds,
    keys,
    webhookSecrets,
    registries,
    integrationSuffix,
    sandboxOwners,
    returnBase,
    configError,
    webhookReady,
    checkoutReady,
  };
}

/** The base/seat registry entries for one plan, or null when unconfigured. */
export function planPrices(
  config: StripeLifecycleConfig,
  mode: StripeMode,
  planId: PlanId,
): { base: PriceRegistryEntry; seat: PriceRegistryEntry | null } | null {
  const registry = config.registries[mode];
  if (!registry.ok) return null;
  let base: PriceRegistryEntry | null = null;
  let seat: PriceRegistryEntry | null = null;
  for (const entry of registry.registry.values()) {
    if (entry.planId !== planId) continue;
    if (entry.kind === "base") base = entry;
    else seat = entry;
  }
  return base ? { base, seat } : null;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StripeLifecycleError("body_timeout")), READ_TIMEOUT_MS);
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) throw new StripeLifecycleError("body_too_large");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

type Json = Record<string, unknown>;

async function stripeCall(
  path: string,
  init: {
    mode: StripeMode;
    method: "GET" | "POST";
    body?: URLSearchParams;
    idempotencyKey?: string;
  },
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Promise<Json> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.keys[init.mode]}`,
    "Stripe-Version": STRIPE_LIFECYCLE_API_VERSION,
  };
  if (init.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const response = await manualRedirectFetch(fetchImpl)(`https://api.stripe.com/v1/${path}`, {
    method: init.method,
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    headers,
    body: init.body,
  });
  const raw = await boundedText(response);
  // Status only — never the URL, body or any credential.
  if (!response.ok) throw new StripeLifecycleError(`provider_status_${response.status}`);
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new StripeLifecycleError("provider_unreadable");
  return parsed as Json;
}

/**
 * Verify the account that actually OWNS the key for this mode. A key prefix
 * only proves live/test, not which account, so the account object is read and
 * compared with the mode-specific configured id. An unreadable account is a
 * configuration gap and leaves processing uncertain rather than trusting it.
 */
async function verifyAccount(
  mode: StripeMode,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Promise<void> {
  const account = await stripeCall("account", { mode, method: "GET" }, config, fetchImpl);
  if (account.object !== undefined && account.object !== "account")
    throw new StripeLifecycleError("account_unreadable");
  if (idOf(account.id) !== config.accountIds[mode])
    throw new StripeLifecycleError("account_mismatch");
}

/**
 * A once-per-operation account verification, awaited before every provider
 * MUTATION (customer creation, Checkout Session creation, Portal Session
 * creation) and before trusting any read. Memoised so one caller-facing
 * operation verifies once instead of per call, and it throws — never returns a
 * "probably fine" — when the key's account cannot be confirmed.
 */
type Verify = () => Promise<void>;
function accountVerifier(
  mode: StripeMode,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Verify {
  let started: Promise<void> | null = null;
  return () => (started ??= verifyAccount(mode, config, fetchImpl));
}

/* -------------------------------------------------------------------------- */
/* Database access (service-role SQL functions only)                          */
/* -------------------------------------------------------------------------- */

type Rpc = (name: string, args: Json) => PromiseLike<{ data: unknown; error: unknown }>;
async function rpc(): Promise<Rpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as { rpc: Rpc }).rpc.bind(supabaseAdmin) as Rpc;
}
async function call(name: string, args: Json): Promise<unknown> {
  const invoke = await rpc();
  const { data, error } = await invoke(name, args);
  if (error) {
    const failure = new StripeLifecycleError(`${name}_failed`);
    // Carried, not interpreted, and never returned to a caller.
    const message = (error as { message?: unknown } | null)?.message;
    failure.detail = typeof message === "string" ? message : "";
    throw failure;
  }
  return data;
}

export interface CustomerProjection {
  userId: string;
  subscriptionId: string | null;
  planId: PlanId | null;
  status: string | null;
}

/** Ownership + the stored current projection for an authoritative customer id. */
async function customerProjection(
  accountId: string,
  mode: StripeMode,
  customerId: string,
): Promise<CustomerProjection | null> {
  const data = await call("stripe_customer_projection", {
    p_account: accountId,
    p_mode: mode,
    p_customer: customerId,
  });
  const rows = Array.isArray(data) ? (data as Json[]) : [];
  const row = rows[0];
  if (!row || !str(row.user_id)) return null;
  return {
    userId: str(row.user_id),
    subscriptionId: str(row.subscription_id) || null,
    planId: (str(row.plan_id) || null) as PlanId | null,
    status: str(row.status) || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Authoritative reconciliation                                               */
/* -------------------------------------------------------------------------- */

interface ReceiptRef {
  eventId: string;
  eventType: string;
  objectId: string;
  eventCreated: number;
}
interface Lease {
  accountId: string;
  mode: StripeMode;
  holder: string;
  fence: number;
}
export type ReconcileOutcome =
  | { status: "applied"; result: string }
  | { status: "ignored"; reason: string }
  | { status: "uncertain"; reason: string };

/**
 * What the projection should do, derived from COMPLETE evidence only.
 *
 * The three outcomes are deliberately not collapsible: `apply` is a decision,
 * `ignore` is "there is provably nothing to do", and `uncertain` is "the
 * evidence does not support either a grant or a revoke" — which keeps the
 * receipt retryable and leaves any existing entitlement exactly as it is.
 */
type ProjectionDecision =
  | {
      kind: "apply";
      subscription: SubscriptionEvidence;
      replaces: string | null;
      grants: boolean;
      planId: PlanId;
    }
  | { kind: "ignore"; reason: string }
  | { kind: "uncertain"; reason: string };

/**
 * Choose the current subscription and decide grant/revoke from the authoritative
 * list.
 *
 * Rules, in the order they are applied:
 *  - two grant-eligible subscriptions are ambiguous: neither grants nor revokes;
 *  - a stored subscription that is ABSENT from the (complete) read proves
 *    nothing — absence is never used as evidence of cancellation or replacement;
 *  - a grant needs COMPLETE evidence: resolvable items (hence a real, future
 *    billing period) plus an authoritatively paid latest invoice. Missing,
 *    foreign or unreadable evidence on an active subscription stays uncertain,
 *    so the entitlement it already has survives;
 *  - only an EXPLICIT non-granting status (`past_due`, `unpaid`, `canceled`,
 *    `incomplete`, `incomplete_expired`, `paused`) on the exact mapped
 *    subscription may revoke it;
 *  - a replacement requires the stored subscription to be shown TERMINAL in the
 *    same complete read.
 */
function decideProjection(input: {
  mode: StripeMode;
  views: SubscriptionEvidence[];
  storedSubscriptionId: string | null;
  storedPlanId: PlanId | null;
  nowSeconds: number;
}): ProjectionDecision {
  const { mode, views, nowSeconds } = input;
  const stored = input.storedSubscriptionId;

  const applyCandidate = (
    view: SubscriptionEvidence,
    replaces: string | null,
  ): ProjectionDecision => {
    if (!view.items.ok) return { kind: "uncertain", reason: `items_${view.items.reason}` };
    if (view.payment.state !== "paid")
      return { kind: "uncertain", reason: `payment_${view.payment.reason}` };
    return {
      kind: "apply",
      subscription: view,
      replaces,
      planId: view.items.value.planId,
      grants: grantsPaidAccess({
        mode,
        status: view.status,
        paid: view.payment.state === "paid",
        currentPeriodEnd: view.items.value.currentPeriodEnd,
        nowSeconds,
      }),
    };
  };

  const grantable = views.filter((view) => ENTITLEMENT_GRANT_STATUSES.has(view.status));
  if (grantable.length > 1) return { kind: "uncertain", reason: "ambiguous_current_subscription" };
  const candidate = grantable[0] ?? null;

  if (!stored)
    return candidate
      ? applyCandidate(candidate, null)
      : { kind: "ignore", reason: "no_current_subscription" };

  const storedView = views.find((view) => view.id === stored) ?? null;
  if (!storedView) return { kind: "uncertain", reason: "current_subscription_absent" };
  if (candidate && candidate.id === stored) return applyCandidate(candidate, null);
  if (candidate) {
    if (!TERMINAL_STRIPE_STATUSES.has(storedView.status))
      return { kind: "uncertain", reason: "ambiguous_current_subscription" };
    return applyCandidate(candidate, stored);
  }
  if (!isRevocableStripeStatus(storedView.status))
    return { kind: "uncertain", reason: "current_subscription_unclear" };
  const planId = storedView.items.ok ? storedView.items.value.planId : input.storedPlanId;
  if (!planId) return { kind: "uncertain", reason: "plan_unresolved" };
  return { kind: "apply", subscription: storedView, replaces: null, grants: false, planId };
}

/** The authoritative target object, reduced to the identity facts ownership and
 * settlement need. Every field is cross-checked against what we asked for. */
interface TargetRead {
  customerId: string;
  session: CheckoutSessionView | null;
}

async function readTarget(
  kind: AuthoritativeTargetKind,
  objectId: string,
  mode: StripeMode,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Promise<TargetRead> {
  const path =
    kind === "subscription"
      ? `subscriptions/${encodeURIComponent(objectId)}`
      : kind === "invoice"
        ? `invoices/${encodeURIComponent(objectId)}`
        : `checkout/sessions/${encodeURIComponent(objectId)}`;
  const object = await stripeCall(path, { mode, method: "GET" }, config, fetchImpl);
  if (kind === "checkout_session") {
    const session = readCheckoutSession(object, mode);
    if (!session || session.id !== objectId)
      throw new StripeLifecycleError("object_identity_mismatch");
    return { customerId: session.customerId, session };
  }
  const expected = kind === "subscription" ? "subscription" : "invoice";
  if (object.object !== undefined && object.object !== expected)
    throw new StripeLifecycleError("object_kind_mismatch");
  if (object.livemode !== livemodeFor(mode)) throw new StripeLifecycleError("object_mode_mismatch");
  if (idOf(object.id) !== objectId) throw new StripeLifecycleError("object_identity_mismatch");
  return { customerId: idOf(object.customer), session: null };
}

/**
 * Reconcile ONE receipt against the authoritative provider state and apply the
 * atomic projection. This is the single processing path: live delivery and the
 * bounded replay both call it with the same retained identifiers, which is what
 * makes the replay a real recovery path rather than a backlog count.
 *
 * The lease is RENEWED (not re-fenced) immediately before the write, so a
 * worker whose lease expired during the provider reads stops instead of
 * applying; and the observation timestamp is taken from a FRESH clock read
 * after the reads, never from a batch start time.
 */
async function reconcileReceipt(
  receipt: ReceiptRef,
  lease: Lease,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
  clock: Clock,
): Promise<ReconcileOutcome> {
  const { mode, accountId } = lease;
  const kind = targetKindForEventType(receipt.eventType);
  const fence = { p_holder: lease.holder, p_fence: lease.fence };

  const finish = async (
    status: "uncertain" | "ignored",
    reason: string,
  ): Promise<ReconcileOutcome> => {
    await call("stripe_finish_webhook_receipt", {
      p_event: receipt.eventId,
      p_account: accountId,
      p_mode: mode,
      p_status: status,
      ...fence,
    });
    return status === "ignored" ? { status: "ignored", reason } : { status: "uncertain", reason };
  };
  const uncertain = (reason: string) => finish("uncertain", reason);
  const ignore = (reason: string) => finish("ignored", reason);

  // Irrelevant or unmappable types are acknowledged, never applied.
  if (!kind || !RELEVANT_STRIPE_EVENT_TYPES.has(receipt.eventType))
    return ignore("irrelevant_type");

  let target: TargetRead;
  let rows: unknown[];
  try {
    await verifyAccount(mode, config, fetchImpl);
    target = await readTarget(kind, receipt.objectId, mode, config, fetchImpl);
    if (!target.customerId)
      // Every session WE create names a customer, so a session without one is
      // not ours and carries nothing to reconcile: ignore rather than retry.
      return kind === "checkout_session"
        ? ignore("session_without_customer")
        : uncertain("customer_unresolved");
    const list = completeListData(
      await stripeCall(
        `subscriptions?customer=${encodeURIComponent(target.customerId)}&status=all` +
          `&limit=${LIST_LIMIT}&expand[]=data.latest_invoice`,
        { mode, method: "GET" },
        config,
        fetchImpl,
      ),
    );
    // An unreadable, paginated or `data`-less list is NOT an empty list.
    if (!list.ok) return uncertain(`subscription_${list.reason}`);
    if (list.data.length >= LIST_LIMIT) return uncertain("subscription_list_incomplete");
    rows = list.data;
  } catch (error) {
    // A failed authoritative read must never revoke or grant.
    console.error("[stripe-lifecycle] authoritative read failed", {
      mode,
      type: receipt.eventType,
      code: error instanceof StripeLifecycleError ? error.code : "unknown",
    });
    return uncertain("provider_read_failed");
  }

  // Fresh wall clock AFTER the reads: this is the observation time the
  // monotonicity guard compares, and the instant the periods are judged at.
  const observedMs = clock();
  const observedAt = new Date(observedMs).toISOString();
  const nowSeconds = Math.floor(observedMs / 1000);
  const views: SubscriptionEvidence[] = [];
  for (const raw of rows) {
    const read = readSubscriptionEvidence({
      raw,
      mode,
      registry: config.registries[mode],
      customerId: target.customerId,
      nowSeconds,
    });
    // One malformed, foreign or wrong-mode row makes the whole list
    // uninterpretable: we cannot tell what this customer actually has.
    if (!read.ok) return uncertain(read.reason);
    views.push(read.value);
  }

  const owner = await customerProjection(accountId, mode, target.customerId);
  if (!owner) return uncertain("unknown_customer");

  // A Checkout request is identified ONLY by the session's own
  // client_reference_id, cross-checked against the server-resolved owner. No
  // payload metadata, and no other request, can be settled from here.
  const session = target.session;
  const sessionRequest =
    session && UUID.test(session.clientReferenceId) && session.customerId === target.customerId
      ? session.clientReferenceId
      : null;
  // Only an authoritatively EXPIRED session may release its own slot. A
  // completed session is never expired here.
  if (session && sessionRequest && session.status === "expired")
    await call("stripe_expire_checkout_session", {
      p_request: sessionRequest,
      p_user: owner.userId,
      p_account: accountId,
      p_mode: mode,
      p_session: session.id,
      ...fence,
    });

  const decision = decideProjection({
    mode,
    views,
    storedSubscriptionId: owner.subscriptionId,
    storedPlanId: owner.planId,
    nowSeconds,
  });
  if (decision.kind === "ignore") return ignore(decision.reason);
  if (decision.kind === "uncertain") return uncertain(decision.reason);

  // The lease must still be ours at this fence; a renewal cannot steal one.
  const renewed = await call("stripe_renew_account_lease", {
    p_account: accountId,
    p_mode: mode,
    ...fence,
    p_ttl_seconds: LEASE_TTL_SECONDS,
  });
  if (renewed !== true) return { status: "uncertain", reason: "lease_lost" };

  const items = decision.subscription.items;
  const period = items.ok ? new Date(items.value.currentPeriodEnd * 1000).toISOString() : null;
  // A COMPLETED session settles its own request in the same transaction as the
  // projection, and only when the subscription it names is the one being applied.
  const settles =
    session &&
    sessionRequest &&
    session.status === "complete" &&
    session.subscriptionId === decision.subscription.id
      ? { p_session_request: sessionRequest, p_session_id: session.id }
      : { p_session_request: null, p_session_id: null };

  let result: unknown;
  try {
    // The GUARDED wrapper (20261028223000) is the write entry point: it holds
    // this exact lease, refuses to widen an allowance while a paid plan/seat
    // change is still unresolved, and otherwise delegates to the accepted
    // foundation's stripe_apply_subscription_projection unchanged, in the same
    // transaction. Both migrations are therefore applied together.
    result = await call(STRIPE_PROJECTION_RPC, {
      p_account: accountId,
      p_mode: mode,
      ...fence,
      p_event_id: receipt.eventId,
      p_customer: target.customerId,
      p_subscription: decision.subscription.id,
      p_replaces: decision.replaces,
      p_plan_id: decision.planId,
      p_status: decision.subscription.status,
      p_seat_quantity: items.ok ? items.value.seatQuantity : 0,
      p_period_end: period,
      p_cancel_at_period_end: decision.subscription.cancelAtPeriodEnd,
      p_invoice_paid: decision.subscription.payment.state === "paid",
      p_grants: decision.grants,
      p_observed_at: observedAt,
      p_event_created: receipt.eventCreated,
      ...settles,
    });
  } catch (error) {
    console.error("[stripe-lifecycle] projection refused", {
      mode,
      code: error instanceof StripeLifecycleError ? error.code : "unknown",
    });
    return { status: "uncertain", reason: "projection_refused" };
  }
  const outcome = str(result);
  // An unknown customer, a grant the database would not confirm, and a
  // projection held behind an unresolved commercial operation are all UNCERTAIN
  // results, never successes. `operation_pending_hold` wrote NOTHING and left the
  // receipt retryable, so the previously verified allowance stands: a paid
  // historical invoice, a replay or an out-of-order redelivery cannot widen it.
  if (
    outcome === "unknown_customer" ||
    outcome === "grant_unverified" ||
    outcome === "operation_pending_hold"
  )
    return { status: "uncertain", reason: outcome };
  if (outcome === "superseded_ignored" || outcome === "stale_ignored")
    return { status: "ignored", reason: outcome };
  if (
    outcome !== "applied_grant" &&
    outcome !== "applied_no_grant" &&
    outcome !== "grant_withheld_manual" &&
    outcome !== "revoke_not_applicable"
  )
    return { status: "uncertain", reason: "projection_unknown_result" };
  return { status: "applied", result: outcome };
}

/* -------------------------------------------------------------------------- */
/* Webhook entry point                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The single Stripe webhook entry point.
 *
 * Verifies the signature against BOTH configured secrets to determine the mode,
 * cross-checks livemode/account/api_version, records a metadata-only receipt
 * BEFORE any processing, takes the fenced per-account/mode lease (serializing
 * processing), reconciles against a fresh authoritative read and applies the
 * atomic projection.
 *
 * Acknowledgment policy: 2xx only when the receipt reached a terminal state
 * (applied/ignored) or was already terminal. A duplicate delivery of a
 * pending/uncertain receipt is PROCESSED again, and anything inconclusive
 * answers 503 so the provider retries — with the durable receipt and the
 * bounded replay as the backstop. A crash or a lost acknowledgment therefore
 * never loses an event.
 */
export async function receiveStripeWebhook(
  request: Request,
  deps: { env?: Env; now?: number | Clock; fetch?: typeof fetch } = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const config = stripeLifecycleConfig(env);
  const clock = clockFrom(deps.now);
  if (!config.webhookReady("live") && !config.webhookReady("test"))
    return new Response("Webhook not configured", { status: 503 });

  let raw: string;
  try {
    raw = await boundedText(new Response(request.body));
  } catch {
    return new Response("Invalid body", { status: 413 });
  }

  const signature = request.headers.get("stripe-signature");
  const now = clock();
  const mode: StripeMode | null =
    (["live", "test"] as StripeMode[]).find(
      (candidate) =>
        config.webhookReady(candidate) &&
        verifyStripeSignature(signature, raw, config.webhookSecrets[candidate], now),
    ) ?? null;
  if (!mode) return new Response("Invalid signature", { status: 401 });

  let event;
  try {
    event = stripeEventEnvelope.parse(JSON.parse(raw));
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  const accountId = config.accountIds[mode];
  if (
    modeFromLivemode(event.livemode) !== mode ||
    (event.account && event.account !== accountId) ||
    (event.api_version && event.api_version !== STRIPE_LIFECYCLE_API_VERSION)
  )
    return new Response("Unexpected account/mode/version", { status: 400 });
  // The payload's own object discriminator must agree with the event type. This
  // is a consistency check on a malformed delivery, not a source of decisions:
  // the retained type is what the authoritative re-read follows.
  const declared = authoritativeReadTarget(event.data.object as { object?: unknown; id?: unknown });
  const declaredKind = targetKindForEventType(event.type);
  if (declared && declaredKind && declared.kind !== declaredKind)
    return new Response("Unexpected object type", { status: 400 });

  const fingerprint = createHash("sha256").update(raw).digest("hex");
  let recorded: unknown;
  try {
    recorded = await call("stripe_record_webhook_receipt", {
      p_event: event.id,
      p_account: accountId,
      p_mode: mode,
      p_type: event.type,
      p_created: event.created,
      p_object: event.data.object.id,
      p_fingerprint: fingerprint,
    });
  } catch {
    // Nothing durable was written: ask for a retry rather than acknowledge.
    return new Response("Receipt unavailable", { status: 503 });
  }
  if (recorded === "completed") return Response.json({ ok: true, duplicate: true });
  if (recorded === "exhausted") {
    console.error("[stripe-lifecycle] receipt past its attempt limit", { mode, type: event.type });
    return Response.json({ ok: true, pending: true, exhausted: true });
  }

  const receipt: ReceiptRef = {
    eventId: event.id,
    eventType: event.type,
    objectId: event.data.object.id,
    eventCreated: event.created,
  };
  let outcome: ReconcileOutcome | null;
  try {
    const held = await withLease(accountId, mode, (lease) =>
      reconcileReceipt(receipt, lease, config, deps.fetch ?? fetch, clock),
    );
    outcome = held.leased ? held.value : null;
  } catch (error) {
    // The receipt is durable and still retryable; ask for a retry.
    console.error("[stripe-lifecycle] reconciliation threw", {
      mode,
      type: event.type,
      code: error instanceof StripeLifecycleError ? error.code : "unknown",
    });
    return new Response("Reconciliation unavailable", { status: 503 });
  }
  if (!outcome) return new Response("Reconciliation busy", { status: 503 });
  if (outcome.status === "applied") return Response.json({ ok: true, applied: outcome.result });
  if (outcome.status === "ignored") return Response.json({ ok: true, ignored: outcome.reason });
  return new Response("Pending reconciliation", { status: 503 });
}

/** Run `work` under a FRESH fenced account/mode lease. `leased: false` means
 * another live worker holds it, which is not an outcome: the caller leaves the
 * receipt retryable. The lease is always released, so the next worker does not
 * have to wait out the TTL. */
async function withLease<T>(
  accountId: string,
  mode: StripeMode,
  work: (lease: Lease) => Promise<T>,
): Promise<{ leased: true; value: T } | { leased: false }> {
  const holder = randomUUID();
  let fence: number;
  try {
    fence = Number(
      await call("stripe_claim_account_lease", {
        p_account: accountId,
        p_mode: mode,
        p_holder: holder,
        p_ttl_seconds: LEASE_TTL_SECONDS,
      }),
    );
  } catch {
    return { leased: false };
  }
  if (!Number.isFinite(fence)) return { leased: false };
  try {
    return { leased: true, value: await work({ accountId, mode, holder, fence }) };
  } finally {
    await call("stripe_release_account_lease", {
      p_account: accountId,
      p_mode: mode,
      p_holder: holder,
      p_fence: fence,
    }).catch(() => undefined);
  }
}

/**
 * Bounded, service-only replay of receipts left pending/uncertain by a crash, a
 * lost acknowledgment or a failed provider read. It re-fetches the current
 * object using the RETAINED identifiers and runs exactly the same processing as
 * a live delivery; no raw event body is needed or stored. No cron: an operator
 * or a service task calls this directly.
 *
 * Recovery is per receipt, not per batch: each iteration claims exactly ONE
 * receipt under its OWN fresh fenced lease and reads the clock again. That is
 * what makes "attempts" mean attempts — a batch claim charges an attempt to
 * receipts a lease expiry never processed — and it keeps every provider read
 * inside a lease this worker still owns.
 *
 * Each receipt gets AT MOST ONE turn per invocation. The claim excludes the
 * event ids this invocation already processed, so a transient provider outage
 * can no longer spend a whole run — and a whole slice of the bounded attempt
 * budget — re-attempting the same oldest receipt while newer pending rows wait
 * behind it. Nothing is acknowledged, downgraded or discarded by that
 * exclusion: it lives only in this call, and a later invocation starts with an
 * empty set, so an uncertain receipt is simply retried then, with its own fresh
 * lease and clock. There is no inner retry loop: one pass is one claim is one
 * attempt.
 */
export async function replayPendingStripeReceipts(options: {
  mode: StripeMode;
  limit?: number;
  env?: Env;
  now?: number | Clock;
  fetch?: typeof fetch;
}): Promise<{ attempted: number; applied: number; ignored: number; uncertain: number }> {
  const limit = options.limit ?? MAX_REPLAY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REPLAY_LIMIT)
    throw new StripeLifecycleError("replay_limit_invalid");
  const config = stripeLifecycleConfig(options.env ?? process.env);
  const error = config.configError(options.mode);
  if (error) throw new StripeLifecycleError(error);
  const accountId = config.accountIds[options.mode];
  const clock = clockFrom(options.now);
  const fetchImpl = options.fetch ?? fetch;
  const tally = { attempted: 0, applied: 0, ignored: 0, uncertain: 0 };
  /** The receipts this invocation has already given their one turn. Bounded by
   * `limit` (itself bounded by MAX_REPLAY_LIMIT), which is the same bound the
   * claim function validates, and sent as a copy so a later pass cannot alter
   * what an earlier claim was asked. */
  const processed: string[] = [];

  for (let pass = 0; pass < limit; pass += 1) {
    const claimed = await withLease(
      accountId,
      options.mode,
      async (lease): Promise<{ eventId: string; outcome: ReconcileOutcome } | null> => {
        const data = await call("stripe_claim_replay_receipt", {
          p_account: accountId,
          p_mode: options.mode,
          p_exclude: [...processed],
        });
        const row = (Array.isArray(data) ? (data as Json[])[0] : (data as Json | null)) ?? null;
        if (!row) return null;
        const receipt: ReceiptRef = {
          eventId: str(row.event_id),
          eventType: str(row.event_type),
          objectId: str(row.object_id),
          eventCreated: Number(row.event_created ?? 0),
        };
        // A claimed row we cannot even identify is not re-attempted blindly: the
        // attempt is already recorded and an operator still has the receipt.
        if (!receipt.eventId || !receipt.eventType || !receipt.objectId)
          return {
            eventId: receipt.eventId,
            outcome: { status: "uncertain", reason: "receipt_unidentifiable" },
          };
        return {
          eventId: receipt.eventId,
          outcome: await reconcileReceipt(receipt, lease, config, fetchImpl, clock).catch(() => ({
            status: "uncertain" as const,
            reason: "replay_failed",
          })),
        };
      },
    );
    // Another worker holds the lease, or there is nothing left to claim.
    if (!claimed.leased || claimed.value === null) break;
    tally.attempted += 1;
    tally[claimed.value.outcome.status] += 1;
    // A receipt without a usable id cannot be excluded, so continuing would
    // claim it again: this invocation stops instead. The attempt is recorded and
    // the receipt is still there, retryable, for the next invocation.
    if (!claimed.value.eventId) break;
    processed.push(claimed.value.eventId);
  }
  return tally;
}

/* -------------------------------------------------------------------------- */
/* Caller-scoped checkout / portal                                            */
/* -------------------------------------------------------------------------- */

/** Resolve the caller's OWN mapped customer, creating one only when the mapping
 * read definitively reported none. A failed mapping read fails UNCERTAIN: it
 * must never cause a second customer to be created for the same user. Creating
 * one is a provider MUTATION, so the key's account is verified first and the
 * created object's own identity and mode are re-checked.
 *
 * `stillRetainable` is the caller's idempotency-retention deadline, re-read
 * against a fresh clock IMMEDIATELY before the creation POST. The mapping read
 * and the account verification above are both awaited, so an answer taken
 * before them may already be stale by the time this mutation would dispatch;
 * `false` means dispatch nothing and let the caller hold its request. */
export async function resolveOwnCustomer(
  userId: string,
  mode: StripeMode,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
  verify: Verify,
  email?: string,
  stillRetainable?: () => boolean,
): Promise<string> {
  const accountId = config.accountIds[mode];
  let existing: unknown;
  try {
    existing = await call("stripe_owner_customer", {
      p_user: userId,
      p_account: accountId,
      p_mode: mode,
    });
  } catch {
    throw new StripeLifecycleError("customer_mapping_uncertain");
  }
  if (str(existing)) return str(existing);

  await verify();
  // The mapping read said "none", so the next call CREATES a customer. Nothing
  // awaited before this point may authorise that dispatch on its own.
  if (stillRetainable && !stillRetainable()) throw new StripeLifecycleError("request_expired");
  const form = new URLSearchParams({ "metadata[milo_user_id]": userId });
  if (email) form.set("email", email);
  const created = await stripeCall(
    "customers",
    {
      mode,
      method: "POST",
      body: form,
      // Persistent per account/mode/user: a retry never mints a second customer.
      idempotencyKey: `milo-cus:${accountId}:${mode}:${userId}`,
    },
    config,
    fetchImpl,
  );
  // Metadata is written for human traceability only; ownership comes from the
  // mapping below, never from any metadata we or anyone else can set.
  const customerId = readCreatedCustomerId(created, mode);
  if (!customerId) throw new StripeLifecycleError("customer_unexpected");
  await call("stripe_upsert_customer", {
    p_user: userId,
    p_account: accountId,
    p_mode: mode,
    p_customer: customerId,
  });
  return customerId;
}

export interface CheckoutSelection {
  userId: string;
  requestId: string;
  planId: PlanId;
  seatQuantity: number;
  mode: StripeMode;
}
export type CheckoutResult =
  | { ok: true; checkoutUrl: string; sessionId: string; reused: boolean }
  | { ok: false; reason: string };

function paramsFingerprint(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** The durable state of one checkout/portal request. */
interface RequestState {
  status: string;
  sessionId: string;
  createdAt: number;
}
function requestState(data: unknown): RequestState {
  const row = (Array.isArray(data) ? (data as Json[])[0] : (data as Json)) ?? {};
  return {
    status: str(row.status),
    sessionId: str(row.session_id),
    createdAt: Date.parse(str(row.created_at)),
  };
}

type RequestScope = {
  p_request: string;
  p_user: string;
  p_account: string;
  p_mode: StripeMode;
  p_kind: "checkout" | "portal";
};

/**
 * Find the Checkout Session an ambiguous attempt may (or may not) have created,
 * from a COMPLETE authoritative list for the caller's own customer. This is the
 * only evidence that can release a fenced request: either a session exists (and
 * is adopted, with its own identity re-checked) or a complete list proves none
 * does. A partial, oversized or unreadable list proves nothing and leaves the
 * request fenced.
 */
async function findRequestSession(
  requestId: string,
  customerId: string,
  mode: StripeMode,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; session: CheckoutSessionView | null } | { ok: false; reason: string }> {
  let raw: Json;
  try {
    raw = await stripeCall(
      `checkout/sessions?customer=${encodeURIComponent(customerId)}&limit=${LIST_LIMIT}`,
      { mode, method: "GET" },
      config,
      fetchImpl,
    );
  } catch {
    return { ok: false, reason: "session_list_unavailable" };
  }
  const list = completeListData(raw);
  if (!list.ok) return { ok: false, reason: `session_${list.reason}` };
  if (list.data.length >= LIST_LIMIT) return { ok: false, reason: "session_list_incomplete" };
  const mine: CheckoutSessionView[] = [];
  for (const row of list.data) {
    const view = readCheckoutSession(row, mode);
    if (!view) return { ok: false, reason: "session_unreadable" };
    if (view.clientReferenceId === requestId && view.customerId === customerId) mine.push(view);
  }
  if (mine.length > 1) return { ok: false, reason: "session_ambiguous" };
  return { ok: true, session: mine[0] ?? null };
}

/**
 * Create (or safely resume) a Checkout Session for the AUTHENTICATED caller.
 *
 * The caller supplies only a request id, a plan and a seat count: the customer,
 * the account, the mode, the prices and the URLs are all resolved on the server.
 * Live-mode activation is held by the caller in `stripe-lifecycle.functions.ts`
 * and additionally refused here, so this path is reachable only for an
 * explicitly allowlisted sandbox owner in test mode.
 *
 * Idempotency is persistent and account/mode/request scoped: a retry resumes
 * the same request with the identical parameters and the identical Stripe
 * idempotency key, and a successfully created session stays OPEN (so no second
 * session can be started before the webhook mapping arrives). An aged uncertain
 * attempt — one whose immutable creation time is past Stripe's idempotency
 * retention, or unreadable — is FENCED: non-terminal, its unique slot still
 * held, settleable only by an authoritative read. It is never failed by age.
 *
 * That deadline is re-read against a FRESH clock immediately before EVERY
 * provider mutation this attempt could duplicate (the customer POST when no
 * mapping exists, and the Checkout POST), because the steps in between —
 * account verification, the customer mapping and its creation acknowledgment,
 * the authoritative subscription list — are all awaited and may each take long
 * enough to cross the boundary. A created session grants nothing: only a
 * reconciled webhook projection can.
 */
export async function createStripeLifecycleCheckout(
  selection: CheckoutSelection,
  deps: { env?: Env; fetch?: typeof fetch; now?: number | Clock } = {},
): Promise<CheckoutResult> {
  const config = stripeLifecycleConfig(deps.env ?? process.env);
  const { mode } = selection;
  // The paid-launch hold is applied BEFORE any provider or database access.
  if (mode === "live") return { ok: false, reason: "live_checkout_held" };
  if (!config.checkoutReady(mode)) return { ok: false, reason: "not_configured" };
  if (!UUID.test(selection.requestId) || !UUID.test(selection.userId))
    return { ok: false, reason: "request_invalid" };
  const prices = planPrices(config, mode, selection.planId);
  if (!prices) return { ok: false, reason: "plan_not_configured" };
  if (
    !Number.isInteger(selection.seatQuantity) ||
    selection.seatQuantity < 0 ||
    selection.seatQuantity > 1000
  )
    return { ok: false, reason: "seat_quantity_invalid" };
  if (selection.seatQuantity > 0 && !prices.seat)
    return { ok: false, reason: "seat_price_not_configured" };

  const accountId = config.accountIds[mode];
  const fetchImpl = deps.fetch ?? fetch;
  const clock = clockFrom(deps.now);
  const verify = accountVerifier(mode, config, fetchImpl);
  const successUrl = `${config.returnBase}?stripe=returned`;
  const cancelUrl = `${config.returnBase}?stripe=cancelled`;
  const fingerprint = paramsFingerprint({
    mode,
    planId: selection.planId,
    base: prices.base.priceId,
    seat: selection.seatQuantity > 0 ? prices.seat?.priceId : null,
    seatQuantity: selection.seatQuantity,
    successUrl,
    cancelUrl,
  });

  const scope: RequestScope = {
    p_request: selection.requestId,
    p_user: selection.userId,
    p_account: accountId,
    p_mode: mode,
    p_kind: "checkout",
  };
  let claimed: RequestState;
  try {
    claimed = requestState(
      await call("stripe_claim_checkout_request", { ...scope, p_fingerprint: fingerprint }),
    );
  } catch {
    // Includes `stripe_checkout_open`: another non-terminal request of this
    // kind holds the slot, so no second session may be created.
    return { ok: false, reason: "request_unavailable" };
  }

  // An existing session, or an ambiguous attempt held open: recover it instead
  // of creating anything.
  if (claimed.status === "open" || claimed.status === "fenced")
    return resumeCheckoutRequest(selection, config, fetchImpl, verify, scope, claimed);
  if (claimed.status !== "pending")
    return { ok: false, reason: `request_${claimed.status || "unknown"}` };

  /**
   * Is a retry of THIS attempt still covered by Stripe's idempotency retention?
   *
   * The deadline belongs to the request, not to the step: it is derived from the
   * immutable stored creation time, so no amount of waiting can restart it, and
   * the clock is read FRESHLY here on every call. Past the retention a repeated
   * idempotency key would be a NEW attempt that could produce a second session
   * and a second subscription, which is not recoverable by retrying — so the
   * answer is re-taken immediately before each such dispatch rather than once,
   * up front, before the awaits that can cross the boundary.
   *
   * The comparison is STRICT. Stripe documents retention as "at least 24 hours",
   * after which a key may be removed and a reuse can execute a NEW request, so
   * the boundary itself is already outside the guarantee: elapsed time exactly
   * equal to the retention is not retainable.
   */
  const stillRetainable = (): boolean => {
    if (!Number.isFinite(claimed.createdAt)) return false;
    try {
      return clock() - claimed.createdAt < IDEMPOTENCY_RETENTION_MS;
    } catch {
      // An unreadable clock is an unusable deadline, never a free pass.
      return false;
    }
  };
  /** Hold the ambiguous attempt: FENCED is non-terminal, so the unique slot
   * stays taken (no second subscription can be started) and only an
   * authoritative read may settle it. No provider mutation is dispatched, and
   * anything already dispatched is left exactly as unknown as it was — nothing
   * here assumes a cancellation. */
  const fenceAttempt = async (): Promise<CheckoutResult> => {
    const fenced = await call("stripe_fence_checkout_request", scope).catch(() => false);
    return { ok: false, reason: fenced === true ? "request_fenced" : "request_conflict" };
  };
  if (!stillRetainable()) return fenceAttempt();

  // Everything below touches the provider, so the key's own account is
  // confirmed first — a key pointing at another account must mutate nothing.
  try {
    await verify();
  } catch {
    return { ok: false, reason: "account_unverified" };
  }

  let customerId: string;
  try {
    customerId = await resolveOwnCustomer(
      selection.userId,
      mode,
      config,
      fetchImpl,
      verify,
      undefined,
      stillRetainable,
    );
  } catch (error) {
    // The deadline crossed while the account was being verified or the mapping
    // read: the customer POST was NOT dispatched, and the attempt is held.
    if (error instanceof StripeLifecycleError && error.code === "request_expired")
      return fenceAttempt();
    // Uncertain: keep the request pending for an identical retry.
    return { ok: false, reason: "customer_uncertain" };
  }

  // Duplicate protection. Only a CONFIDENTLY terminal subscription set allows a
  // new checkout: `incomplete`, `past_due`, `unpaid`, `paused` and any status or
  // object this code cannot read all block, because creating a second
  // subscription for the same customer is not recoverable by retrying.
  try {
    const list = completeListData(
      await stripeCall(
        `subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=${LIST_LIMIT}`,
        { mode, method: "GET" },
        config,
        fetchImpl,
      ),
    );
    if (!list.ok) return { ok: false, reason: `subscription_${list.reason}` };
    if (list.data.length >= LIST_LIMIT)
      return { ok: false, reason: "subscription_list_incomplete" };
    const nowSeconds = Math.floor(clock() / 1000);
    let blocking = false;
    for (const raw of list.data) {
      const read = readSubscriptionEvidence({
        raw,
        mode,
        registry: config.registries[mode],
        customerId,
        nowSeconds,
      });
      if (!read.ok) return { ok: false, reason: "subscription_state_unknown" };
      if (blocksNewSubscription(read.value.status)) blocking = true;
    }
    if (blocking) {
      // A refusal BEFORE any mutation is a real terminal outcome, so the slot is
      // released and the caller may start a different request later.
      await call("stripe_settle_checkout_request", { ...scope, p_status: "failed" }).catch(
        () => undefined,
      );
      return { ok: false, reason: "subscription_exists" };
    }
  } catch {
    return { ok: false, reason: "provider_unavailable" };
  }

  const form = new URLSearchParams({
    mode: "subscription",
    customer: customerId,
    "line_items[0][price]": prices.base.priceId,
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: selection.requestId,
    integration_identifier: integrationIdentifier(config.integrationSuffix),
    "subscription_data[metadata][milo_user_id]": selection.userId,
  });
  if (selection.seatQuantity > 0 && prices.seat) {
    form.set("line_items[1][price]", prices.seat.priceId);
    form.set("line_items[1][quantity]", String(selection.seatQuantity));
  }

  // The mapping resolution and the authoritative subscription list were both
  // awaited since the deadline was last read, and either can be slow. The
  // answer that authorises THIS dispatch is therefore taken here, from a fresh
  // clock, with only the (synchronous) form construction in between. The
  // parameters and the idempotency key are unchanged, so a retry inside the
  // window still resumes the same request rather than starting a new one.
  if (!stillRetainable()) return fenceAttempt();

  let session: Json;
  try {
    session = await stripeCall(
      "checkout/sessions",
      {
        mode,
        method: "POST",
        body: form,
        // Persistent and request-scoped: an uncertain timeout is retried with
        // this exact key and these exact parameters.
        idempotencyKey: `milo-chk:${accountId}:${mode}:${selection.requestId}`,
      },
      config,
      fetchImpl,
    );
  } catch {
    return { ok: false, reason: "provider_uncertain" };
  }
  const view = readCheckoutSession(session, mode);
  if (!view || view.customerId !== customerId || view.clientReferenceId !== selection.requestId)
    return { ok: false, reason: "session_unexpected" };
  // Record the session BEFORE answering: a crash after this point leaves a
  // recoverable open request, not an invisible session.
  const opened = await call("stripe_open_checkout_request", {
    ...scope,
    p_session: view.id,
  }).catch(() => false);
  if (opened !== true) return { ok: false, reason: "request_conflict" };
  if (view.status !== "open") return { ok: false, reason: "session_not_open" };
  if (!view.url) return { ok: false, reason: "session_url_unexpected" };
  return { ok: true, checkoutUrl: view.url, sessionId: view.id, reused: false };
}

/**
 * Resume an `open` or `fenced` checkout request from AUTHORITATIVE state.
 *
 * `open` means a session exists: it is re-read and its identity (id, mode,
 * customer, request) re-checked before it is reused. `fenced` means the outcome
 * is unknown: a complete session list for the caller's own customer either finds
 * the session (which is then adopted) or proves there is none (the only thing
 * that may release the slot).
 *
 * A `complete` session is NEVER marked expired and never released on its own:
 * it stays blocked until the projection proves the subscription exists, which is
 * what stops a paid checkout from being followed by a second one.
 */
async function resumeCheckoutRequest(
  selection: CheckoutSelection,
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
  verify: Verify,
  scope: RequestScope,
  claimed: RequestState,
): Promise<CheckoutResult> {
  const { mode } = selection;
  const accountId = config.accountIds[mode];
  try {
    await verify();
  } catch {
    return { ok: false, reason: "account_unverified" };
  }

  let customerId: string;
  try {
    customerId = str(
      await call("stripe_owner_customer", {
        p_user: selection.userId,
        p_account: accountId,
        p_mode: mode,
      }),
    );
  } catch {
    return { ok: false, reason: "customer_mapping_uncertain" };
  }
  // No mapped customer: nothing authoritative can be listed, so nothing can be
  // proven. The request stays as it is rather than being released.
  if (!customerId) return { ok: false, reason: "request_unresolved" };

  let view: CheckoutSessionView | null = null;
  if (claimed.sessionId) {
    try {
      view = readCheckoutSession(
        await stripeCall(
          `checkout/sessions/${encodeURIComponent(claimed.sessionId)}`,
          { mode, method: "GET" },
          config,
          fetchImpl,
        ),
        mode,
      );
    } catch {
      return { ok: false, reason: "session_unavailable" };
    }
    if (!view || view.id !== claimed.sessionId)
      return { ok: false, reason: "session_identity_unexpected" };
  } else {
    const found = await findRequestSession(
      selection.requestId,
      customerId,
      mode,
      config,
      fetchImpl,
    );
    if (!found.ok) return { ok: false, reason: found.reason };
    if (!found.session) {
      // A complete list proves the ambiguous attempt created nothing: this is
      // the authoritative recovery that may release the slot.
      const settled = await call("stripe_settle_checkout_request", {
        ...scope,
        p_status: "failed",
      }).catch(() => false);
      return { ok: false, reason: settled === true ? "request_failed" : "request_conflict" };
    }
    const opened = await call("stripe_open_checkout_request", {
      ...scope,
      p_session: found.session.id,
    }).catch(() => false);
    if (opened !== true) return { ok: false, reason: "request_conflict" };
    view = found.session;
  }

  if (view.customerId !== customerId || view.clientReferenceId !== selection.requestId)
    return { ok: false, reason: "session_identity_unexpected" };

  if (view.status === "open")
    return view.url
      ? { ok: true, checkoutUrl: view.url, sessionId: view.id, reused: true }
      : { ok: false, reason: "session_url_unexpected" };

  if (view.status === "expired") {
    const settled = await call("stripe_settle_checkout_request", {
      ...scope,
      p_status: "expired",
      p_session: view.id,
    }).catch(() => false);
    return { ok: false, reason: settled === true ? "session_expired" : "request_conflict" };
  }

  if (view.status === "complete") {
    const projection = await customerProjection(accountId, mode, customerId).catch(() => null);
    const reconciled =
      projection !== null &&
      projection.userId === selection.userId &&
      view.subscriptionId !== "" &&
      projection.subscriptionId === view.subscriptionId;
    if (!reconciled) return { ok: false, reason: "checkout_awaiting_reconciliation" };
    await call("stripe_settle_checkout_request", {
      ...scope,
      p_status: "completed",
      p_session: view.id,
    }).catch(() => undefined);
    return { ok: false, reason: "checkout_completed" };
  }
  // An unrecognised status is uncertainty, not expiry.
  return { ok: false, reason: "session_status_unknown" };
}

export type PortalResult = { ok: true; portalUrl: string } | { ok: false; reason: string };

/**
 * A Billing Portal session for the caller's OWN, PRE-EXISTING mapped customer.
 * No customer id ever comes from the client, and no customer is created here —
 * an unmapped caller simply has nothing to manage.
 *
 * The live hold applies here too, at the service entrypoint and before any
 * provider or database access: while public activation is held there is no live
 * Stripe customer to manage, and the legacy Paddle subscriber path is untouched
 * by this module. An ambiguous portal attempt keeps its RETRY safety: a portal
 * session is a short-lived link, not a billable object, so age never fences or
 * fails the request — the worst case is a second link for the same owner.
 */
export async function createStripeLifecyclePortal(
  input: { userId: string; requestId: string; mode: StripeMode },
  deps: { env?: Env; fetch?: typeof fetch } = {},
): Promise<PortalResult> {
  const config = stripeLifecycleConfig(deps.env ?? process.env);
  const { mode } = input;
  if (mode === "live") return { ok: false, reason: "live_portal_held" };
  if (!config.checkoutReady(mode)) return { ok: false, reason: "not_configured" };
  if (!UUID.test(input.requestId) || !UUID.test(input.userId))
    return { ok: false, reason: "request_invalid" };
  const accountId = config.accountIds[mode];
  const fetchImpl = deps.fetch ?? fetch;
  const verify = accountVerifier(mode, config, fetchImpl);

  let customerId: string;
  try {
    customerId = str(
      await call("stripe_owner_customer", {
        p_user: input.userId,
        p_account: accountId,
        p_mode: mode,
      }),
    );
  } catch {
    return { ok: false, reason: "customer_mapping_uncertain" };
  }
  if (!customerId) return { ok: false, reason: "no_customer" };

  const scope: RequestScope = {
    p_request: input.requestId,
    p_user: input.userId,
    p_account: accountId,
    p_mode: mode,
    p_kind: "portal",
  };
  const fingerprint = paramsFingerprint({ mode, customerId, returnBase: config.returnBase });
  try {
    const claimed = requestState(
      await call("stripe_claim_checkout_request", { ...scope, p_fingerprint: fingerprint }),
    );
    if (claimed.status !== "pending")
      return { ok: false, reason: `request_${claimed.status || "unknown"}` };
  } catch {
    return { ok: false, reason: "request_unavailable" };
  }

  // Creating a portal session is a provider mutation: verify the key's account.
  try {
    await verify();
  } catch {
    return { ok: false, reason: "account_unverified" };
  }

  let session: Json;
  try {
    session = await stripeCall(
      "billing_portal/sessions",
      {
        mode,
        method: "POST",
        body: new URLSearchParams({ customer: customerId, return_url: config.returnBase }),
        idempotencyKey: `milo-prt:${accountId}:${mode}:${input.requestId}`,
      },
      config,
      fetchImpl,
    );
  } catch {
    // Unknown outcome: the request stays pending and retries with the same key.
    return { ok: false, reason: "provider_unavailable" };
  }
  // Exact host, exact mode, exact customer, real session id — a suffix match on
  // `stripe.com` would accept `billing.stripe.com.example.test`.
  const portalUrl = readBillingPortalUrl(session, mode, customerId);
  if (!portalUrl) return { ok: false, reason: "session_unexpected" };
  await call("stripe_settle_checkout_request", { ...scope, p_status: "completed" }).catch(
    () => undefined,
  );
  return { ok: true, portalUrl };
}

/* -------------------------------------------------------------------------- */
/* Seat reads                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Extra PURCHASED working seats for a user, from the authoritative LIVE
 * projection only. This is a SEPARATE read on purpose: before the migration is
 * applied (or on any transport failure) it resolves to 0 extra seats, so the
 * plan's seat bundle keeps working exactly as it does today. Manual, free and
 * legacy accounts always resolve to 0.
 */
export async function readPurchasedWorkingSeats(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const data = await call("stripe_purchased_working_seats", { p_user: userId });
    const seats = Number(data);
    return Number.isInteger(seats) && seats > 0 && seats <= 1000 ? seats : 0;
  } catch {
    return 0;
  }
}

export { call as stripeLifecycleRpc };

/* -------------------------------------------------------------------------- */
/* Shared transport for the commercial operations module                      */
/* -------------------------------------------------------------------------- */

/**
 * The provider transport and the account verification, exported for
 * `stripe-commercial.server.ts` so the commercial operations reuse EXACTLY this
 * module's pinned API version, mode-specific key, bounded body, redirect
 * handling, timeout and status policy — rather than a second, slightly
 * different HTTP path. Behaviour is unchanged; these are the existing internals
 * under names the commercial module can import.
 *
 * `fetchImpl` is always injected, so tests drive a local fake and no real
 * provider call is possible from this code path.
 */
export const stripeProviderCall = stripeCall;
export const verifyStripeAccount = verifyAccount;
export const stripeAccountVerifier = accountVerifier;
export { clockFrom as stripeClockFrom };
export type { Verify as StripeAccountVerify, Json as StripeJson };
