/**
 * Stripe subscription lifecycle — pure, client+server safe helpers.
 *
 * No network, no DB, no secrets. Everything here fails CLOSED: an unmapped
 * price, a bad signature, an unexpected status, a missing billing period or a
 * non-live mode never resolves to a paid grant.
 *
 * The REST callers in `stripe-lifecycle.server.ts` pin Stripe-Version to
 * STRIPE_LIFECYCLE_API_VERSION. That value is the FULL current stable version
 * string including its release suffix (https://docs.stripe.com/api-versions);
 * the bare date is not a valid version. The legacy isolated sandbox adapter
 * (`stripe-sandbox.server.ts`) keeps its own, deliberately unchanged pin.
 *
 * Schema assumptions that this module encodes explicitly, because they changed
 * in the current API and silently returning `undefined` would grant access:
 *  - an invoice's subscription lives at `parent.subscription_details.subscription`;
 *  - the removed `invoice.paid` boolean is NEVER consulted — payment proof is
 *    `status === 'paid'` plus the identity/livemode cross-checks below;
 *  - the current billing period lives on subscription ITEMS, not on the
 *    subscription object.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isPlanId } from "./entitlements";
import type { PlanId } from "./billing";

/** Full current stable API version string, suffix included. */
export const STRIPE_LIFECYCLE_API_VERSION = "2026-09-30.endive";
export type StripeMode = "live" | "test";

/** Paid plans that can be sold through Stripe (freePreview is never sold). */
export const STRIPE_SELLABLE_PLANS: readonly PlanId[] = ["starter", "growth", "pro", "agency"];

/** The only currency the approved extra-seat prices exist in (owner-approved
 * seat model: EUR 15/15/12/10). A seat price configured in anything else is a
 * configuration error rather than an invented conversion. */
export const STRIPE_SEAT_CURRENCY = "eur";

export function modeFromLivemode(livemode: boolean): StripeMode {
  return livemode ? "live" : "test";
}
/** The `livemode` value an object MUST carry to belong to this mode. */
export function livemodeFor(mode: StripeMode): boolean {
  return mode === "live";
}

export function isRestrictedKey(value: string, mode: StripeMode): boolean {
  return new RegExp(`^rk_${mode}_[A-Za-z0-9]+$`).test(value);
}

export function isStripeAccountId(value: string): boolean {
  return /^acct_[A-Za-z0-9]+$/.test(value);
}

/**
 * `integration_identifier` suffix. The current API requires a stable, stored
 * identifier suffix of exactly eight LETTERS — a UUID fragment (which contains
 * digits and hyphens) is not accepted. The value itself is operator-configured
 * and stored, never generated per request, so retries reuse it verbatim.
 */
export function isIntegrationIdentifierSuffix(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]{8}$/.test(value);
}
export function integrationIdentifier(suffix: string): string {
  if (!isIntegrationIdentifierSuffix(suffix)) throw new Error("stripe_integration_identifier");
  return `milo_${suffix.toLowerCase()}`;
}

/** Verify a Stripe-Signature header: "t=<ts>,v1=<hex>[,v1=<hex>...]". Rotation
 * secrets are supported by accepting any matching v1 scheme. */
export function verifyStripeSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  now: number,
  toleranceSeconds = 300,
): boolean {
  if (!header || header.length > 4096 || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([name]) => name === "t").map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0] ?? "")) return false;
  const ts = Number(timestamps[0]);
  if (!Number.isFinite(now) || Math.abs(now / 1000 - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamps[0]}.${rawBody}`).digest();
  return parts.some(
    ([name, value]) =>
      name === "v1" &&
      /^[a-fA-F0-9]{64}$/.test(value ?? "") &&
      timingSafeEqual(expected, Buffer.from(value, "hex")),
  );
}

export const stripeEventEnvelope = z.object({
  id: z
    .string()
    .regex(/^evt_[A-Za-z0-9]+$/)
    .max(255),
  type: z.string().min(1).max(120),
  created: z.number().int().nonnegative(),
  livemode: z.boolean(),
  api_version: z.string().max(64).nullable().optional(),
  account: z.string().max(255).nullable().optional(),
  data: z.object({ object: z.object({ id: z.string().min(1).max(255) }).passthrough() }),
});
export type StripeEventEnvelope = z.infer<typeof stripeEventEnvelope>;

/** Relevant event types: a tight allowlist, everything else is ignored (acked, not applied). */
export const RELEVANT_STRIPE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
  "checkout.session.expired",
]);

export type AuthoritativeTargetKind = "subscription" | "invoice" | "checkout_session";

/** The authoritative-read target derived from the webhook's object. Only the
 * object's own `object` discriminator and `id` are used; no other payload field
 * is ever trusted. The retained (kind, id) pair is what makes a later REPLAY
 * able to re-fetch the same object without storing the raw event. */
export function authoritativeReadTarget(object: {
  object?: unknown;
  id?: unknown;
}): { kind: AuthoritativeTargetKind; id: string } | null {
  const id = typeof object.id === "string" ? object.id : "";
  if (!id) return null;
  if (object.object === "subscription") return { kind: "subscription", id };
  if (object.object === "invoice") return { kind: "invoice", id };
  if (object.object === "checkout.session") return { kind: "checkout_session", id };
  return null;
}

/** The object kind implied by a relevant event type, used to re-derive the read
 * target during replay from the retained event type + object id alone. */
export function targetKindForEventType(type: string): AuthoritativeTargetKind | null {
  if (type.startsWith("customer.subscription.")) return "subscription";
  if (type.startsWith("invoice.")) return "invoice";
  if (type.startsWith("checkout.session.")) return "checkout_session";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Product / price registry                                                   */
/* -------------------------------------------------------------------------- */

export interface PriceRegistryEntry {
  kind: "base" | "seat";
  planId: PlanId;
  priceId: string;
  productId: string;
  /** Lowercase ISO currency actually configured on the Stripe price. */
  currency: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
}
export type PriceRegistry = ReadonlyMap<string, PriceRegistryEntry>;
export type PriceRegistryResult =
  { ok: true; registry: PriceRegistry } | { ok: false; reason: string };

const PRICE_ID = /^price_[A-Za-z0-9_]+$/;
const PRODUCT_ID = /^prod_[A-Za-z0-9_]+$/;
const INTERVALS = new Set(["day", "week", "month", "year"]);

/**
 * One configured Stripe recurring price, expressed as an explicit descriptor:
 * `price_id:product_id:currency:interval[:interval_count]`.
 *
 * The descriptor exists so the registry represents what is actually configured
 * in Stripe — product, price, currency AND interval, per plan, per mode, with
 * plan-specific seat items — instead of a hardcoded currency or one generic
 * seat price. Amounts are deliberately absent: prices are authoritative in
 * Stripe and this foundation never re-states or converts them.
 */
function parseDescriptor(
  value: string,
  kind: "base" | "seat",
  planId: PlanId,
): PriceRegistryEntry | null {
  const parts = value.split(":").map((part) => part.trim());
  if (parts.length < 4 || parts.length > 5) return null;
  const [priceId, productId, currencyRaw, interval, countRaw] = parts;
  const currency = currencyRaw.toLowerCase();
  const intervalCount = countRaw === undefined ? 1 : Number(countRaw);
  if (!PRICE_ID.test(priceId) || !PRODUCT_ID.test(productId)) return null;
  if (!/^[a-z]{3}$/.test(currency) || !INTERVALS.has(interval)) return null;
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 12) return null;
  return {
    kind,
    planId,
    priceId,
    productId,
    currency,
    interval: interval as PriceRegistryEntry["interval"],
    intervalCount,
  };
}

export function priceRegistryEnvKey(
  planId: PlanId,
  kind: "base" | "seat",
  mode: StripeMode,
): string {
  return `STRIPE_PRICE_${planId.toUpperCase()}_${kind.toUpperCase()}_${mode.toUpperCase()}`;
}

/**
 * Build the server-configured product/price registry for one mode.
 *
 * Fails as an explicit CONFIGURATION ERROR (never a silent drop or
 * "keep the first") for: a malformed descriptor, a duplicate price id across
 * roles/plans/modes, a seat price without its plan's base price, a seat price
 * whose currency/interval disagrees with the base price, or a seat price in a
 * currency the approved seat model does not define. An entirely unconfigured
 * mode is NOT an error — it yields an empty registry, which resolves every
 * subscription to "unknown price" and therefore to no grant.
 */
export function buildPriceRegistry(mode: StripeMode, env: Record<string, string | undefined>) {
  const registry = new Map<string, PriceRegistryEntry>();
  const base = new Map<PlanId, PriceRegistryEntry>();
  const seats: PriceRegistryEntry[] = [];
  for (const planId of STRIPE_SELLABLE_PLANS) {
    for (const kind of ["base", "seat"] as const) {
      const raw = env[priceRegistryEnvKey(planId, kind, mode)]?.trim();
      if (!raw) continue;
      const entry = parseDescriptor(raw, kind, planId);
      if (!entry) return { ok: false as const, reason: `malformed_price_${planId}_${kind}` };
      if (registry.has(entry.priceId))
        return { ok: false as const, reason: `duplicate_price_${entry.priceId}` };
      registry.set(entry.priceId, entry);
      if (kind === "base") base.set(planId, entry);
      else seats.push(entry);
    }
  }
  for (const seat of seats) {
    const plan = base.get(seat.planId);
    if (!plan) return { ok: false as const, reason: `seat_without_base_${seat.planId}` };
    if (
      seat.currency !== plan.currency ||
      seat.interval !== plan.interval ||
      seat.intervalCount !== plan.intervalCount
    )
      return { ok: false as const, reason: `seat_terms_mismatch_${seat.planId}` };
    if (seat.currency !== STRIPE_SEAT_CURRENCY)
      return { ok: false as const, reason: `seat_currency_unapproved_${seat.planId}` };
  }
  return { ok: true as const, registry: registry as PriceRegistry };
}

/* -------------------------------------------------------------------------- */
/* Subscription item resolution                                               */
/* -------------------------------------------------------------------------- */

export interface SubscriptionItemInput {
  priceId: unknown;
  productId: unknown;
  currency: unknown;
  interval: unknown;
  intervalCount?: unknown;
  quantity: unknown;
  /** Unix seconds — the current period lives on the ITEM in the current API. */
  currentPeriodStart: unknown;
  currentPeriodEnd: unknown;
}
export interface ResolvedSubscriptionItems {
  planId: PlanId;
  seatQuantity: number;
  /** Unix seconds; the conservative MINIMUM across the base and seat items. */
  currentPeriodEnd: number;
}
export type ResolvedItemsResult =
  { ok: true; value: ResolvedSubscriptionItems } | { ok: false; reason: string };

const MAX_SEAT_QUANTITY = 1000;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function unixSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1e11
    ? value
    : null;
}

/**
 * Resolve a subscription's line items against the registry.
 *
 * Fails closed (`{ ok: false }`, no grant, event stays uncertain) on: an
 * unexpected `has_more` page, an unknown price or product, a currency/interval
 * that disagrees with the configured price (base OR seat), a malformed or
 * out-of-range quantity, a base quantity other than 1, a duplicated item, a
 * seat item belonging to another plan, a missing/elapsed billing period, or a
 * missing base item. A missing period NEVER yields an indefinite grant.
 */
export function resolveSubscriptionItems(input: {
  items: SubscriptionItemInput[];
  hasMore: unknown;
  registry: PriceRegistry;
  nowSeconds: number;
}): ResolvedItemsResult {
  const { items, registry, nowSeconds } = input;
  if (input.hasMore !== false) return { ok: false, reason: "unexpected_has_more" };
  if (!Array.isArray(items) || items.length < 1 || items.length > 2)
    return { ok: false, reason: "unexpected_item_count" };

  let planId: PlanId | null = null;
  let seatQuantity = 0;
  let seatPlan: PlanId | null = null;
  let periodEnd = Number.POSITIVE_INFINITY;
  const seen = new Set<string>();

  for (const item of items) {
    const entry = registry.get(str(item.priceId));
    if (!entry) return { ok: false, reason: "unknown_price" };
    if (seen.has(entry.priceId)) return { ok: false, reason: "duplicate_item" };
    seen.add(entry.priceId);
    if (str(item.productId) !== entry.productId) return { ok: false, reason: "unknown_product" };
    if (
      str(item.currency).toLowerCase() !== entry.currency ||
      str(item.interval) !== entry.interval ||
      (item.intervalCount === undefined ? 1 : item.intervalCount) !== entry.intervalCount
    )
      return { ok: false, reason: "currency_interval_mismatch" };
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_SEAT_QUANTITY
    )
      return { ok: false, reason: "malformed_quantity" };

    const start = unixSeconds(item.currentPeriodStart);
    const end = unixSeconds(item.currentPeriodEnd);
    if (start === null || end === null || end <= start)
      return { ok: false, reason: "missing_period" };
    if (end <= nowSeconds) return { ok: false, reason: "period_elapsed" };
    periodEnd = Math.min(periodEnd, end);

    if (entry.kind === "base") {
      if (planId) return { ok: false, reason: "duplicate_base_item" };
      if (item.quantity !== 1) return { ok: false, reason: "unexpected_base_quantity" };
      planId = entry.planId;
    } else {
      if (seatPlan) return { ok: false, reason: "duplicate_seat_item" };
      seatPlan = entry.planId;
      seatQuantity = item.quantity;
    }
  }

  if (!planId || !isPlanId(planId) || planId === "freePreview")
    return { ok: false, reason: "missing_base_item" };
  if (seatPlan && seatPlan !== planId) return { ok: false, reason: "seat_plan_mismatch" };
  if (!Number.isFinite(periodEnd)) return { ok: false, reason: "missing_period" };
  return { ok: true, value: { planId, seatQuantity, currentPeriodEnd: periodEnd } };
}

/* -------------------------------------------------------------------------- */
/* Payment evidence                                                           */
/* -------------------------------------------------------------------------- */

const invoiceShape = z
  .object({
    object: z.literal("invoice").optional(),
    status: z.string().optional(),
    livemode: z.boolean().optional(),
    customer: z.union([z.string(), z.object({ id: z.string() }).passthrough()]).optional(),
    amount_remaining: z.number().optional(),
    status_transitions: z
      .object({ paid_at: z.number().nullable().optional() })
      .passthrough()
      .optional(),
    parent: z
      .object({
        type: z.string().optional(),
        subscription_details: z
          .object({
            subscription: z
              .union([z.string(), z.object({ id: z.string() }).passthrough()])
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

function idOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string")
    return (value as { id: string }).id.trim();
  return "";
}

/**
 * Invoice statuses whose meaning is unambiguous. A status outside both sets —
 * missing, misspelled or newly introduced — is NOT evidence of non-payment; it
 * is unknown, and unknown may neither grant nor revoke.
 */
export const PAID_INVOICE_STATUS = "paid";
export const UNPAID_INVOICE_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "open",
  "void",
  "uncollectible",
]);

export type InvoiceEvidence =
  { state: "paid" } | { state: "unpaid"; reason: string } | { state: "unknown"; reason: string };

/**
 * Classify the latest-invoice evidence for a subscription, PRESERVING the
 * difference between "authoritatively not paid" and "we could not tell".
 *
 * Unreadable, unexpanded, foreign-identity (other customer, other subscription,
 * other mode), malformed or unknown-status invoices are `unknown`: they are
 * missing evidence, not proof of non-payment, so they can never justify a
 * revoke. Only a genuinely non-paying invoice status, or a `paid` invoice that
 * still has an amount outstanding, is `unpaid`.
 *
 * This is the SINGLE payment rule in the packet, so "paid" cannot mean two
 * different things in two places. The removed `invoice.paid` boolean is never
 * consulted: an object carrying only `paid: true` is unknown, and a `paid:
 * false` next to a genuinely paid invoice cannot veto it. The subscription link
 * is read from `parent.subscription_details.subscription`; a legacy top-level
 * `subscription` field is ignored. The LENGTH of a grant never comes from the
 * invoice — it comes from the subscription items' current period (see
 * `resolveSubscriptionItems`), so a paid invoice can never grant indefinitely.
 */
export function invoicePaymentEvidence(input: {
  invoice: unknown;
  mode: StripeMode;
  customerId: string;
  subscriptionId: string;
}): InvoiceEvidence {
  if (input.invoice === null || input.invoice === undefined)
    return { state: "unknown", reason: "invoice_absent" };
  const parsed = invoiceShape.safeParse(input.invoice);
  if (!parsed.success) return { state: "unknown", reason: "invoice_unreadable" };
  const invoice = parsed.data;
  // Identity first: an invoice that is not this subscription's, this customer's
  // and this mode's carries no evidence about this subscription at all.
  if (invoice.livemode !== livemodeFor(input.mode))
    return { state: "unknown", reason: "invoice_mode" };
  if (idOf(invoice.customer) !== input.customerId)
    return { state: "unknown", reason: "invoice_customer" };
  if (invoice.parent?.type !== "subscription_details")
    return { state: "unknown", reason: "invoice_parent" };
  if (idOf(invoice.parent?.subscription_details?.subscription) !== input.subscriptionId)
    return { state: "unknown", reason: "invoice_subscription" };

  const status = typeof invoice.status === "string" ? invoice.status : "";
  if (status === PAID_INVOICE_STATUS) {
    if (typeof invoice.amount_remaining === "number" && invoice.amount_remaining !== 0)
      return { state: "unpaid", reason: "invoice_amount_remaining" };
    if (unixSeconds(invoice.status_transitions?.paid_at) === null)
      return { state: "unknown", reason: "invoice_paid_at" };
    return { state: "paid" };
  }
  if (UNPAID_INVOICE_STATUSES.has(status)) return { state: "unpaid", reason: `invoice_${status}` };
  return { state: "unknown", reason: "invoice_status_unknown" };
}

/* -------------------------------------------------------------------------- */
/* Subscription status policy                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The statuses that may carry a paid ENTITLEMENT. Deliberately narrower than
 * "the subscription exists": `past_due` keeps a subscription alive in Stripe
 * while granting nothing here.
 */
export const ENTITLEMENT_GRANT_STATUSES: ReadonlySet<string> = new Set(["active", "trialing"]);

/**
 * The only statuses that confidently mean "this subscription is over, a new one
 * may be created". Everything else — including `incomplete`, `past_due`,
 * `unpaid`, `paused` and anything unrecognised — must block a second checkout,
 * because creating one could produce a duplicate paid subscription.
 */
export const TERMINAL_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "incomplete_expired",
]);

/** Every subscription status this code understands. An unrecognised status is
 * handled as unknown evidence, never silently as "not current". */
export const KNOWN_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export function isKnownStripeStatus(value: unknown): value is string {
  return typeof value === "string" && KNOWN_STRIPE_STATUSES.has(value);
}
/** True unless the status is a CONFIDENTLY terminal one. Unknown blocks. */
export function blocksNewSubscription(status: unknown): boolean {
  return !(typeof status === "string" && TERMINAL_STRIPE_STATUSES.has(status));
}
/** A known status that explicitly does not grant: the only kind of state that
 * may revoke its own exact mapped subscription. */
export function isRevocableStripeStatus(status: unknown): boolean {
  return isKnownStripeStatus(status) && !ENTITLEMENT_GRANT_STATUSES.has(status);
}

/**
 * True only for a genuinely active, currently paid subscription in LIVE mode
 * with a billing period that has not elapsed. Trialing is granted only when
 * Stripe marks its (possibly zero-amount) invoice paid. `paid` must come from
 * `invoicePaymentEvidence` being exactly `paid` — never from an assumption that
 * "not unpaid" is good enough.
 *
 * The database re-derives this predicate independently
 * (`stripe_apply_subscription_projection`); this is the application half, not
 * the only gate.
 */
export function grantsPaidAccess(input: {
  mode: StripeMode;
  status: string;
  paid: boolean;
  currentPeriodEnd: number;
  nowSeconds: number;
}): boolean {
  return (
    input.mode === "live" &&
    ENTITLEMENT_GRANT_STATUSES.has(input.status) &&
    input.paid === true &&
    unixSeconds(input.currentPeriodEnd) !== null &&
    input.currentPeriodEnd > input.nowSeconds
  );
}

/* -------------------------------------------------------------------------- */
/* Authoritative object readers (identity before content)                     */
/* -------------------------------------------------------------------------- */

/** One authoritative subscription, with its evidence kept separable: the
 * identity is either trustworthy or the whole object is refused, while the
 * item and payment evidence carry their own reasons. */
export interface SubscriptionEvidence {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  items: ResolvedItemsResult;
  payment: InvoiceEvidence;
}
export type SubscriptionEvidenceResult =
  { ok: true; value: SubscriptionEvidence } | { ok: false; reason: string };

/** Object id shapes. The tail may contain underscores (test-mode ids do), so
 * these prove the KIND of object, not its mode; `livemode` does that. */
const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9_]+$/;

/**
 * Read one subscription from an authoritative response.
 *
 * Identity is checked FIRST and strictly: object discriminator, id shape,
 * `livemode` for this mode, the expected customer and a recognised status. A
 * failure here means the object cannot be interpreted at all (`ok: false`), so
 * the caller must stay uncertain — it is never downgraded to "no subscription".
 * Unresolvable items or unreadable invoices do NOT fail the read: they are
 * returned as explicit evidence so the caller can keep a grant retryable
 * instead of mistaking missing evidence for a cancellation.
 */
export function readSubscriptionEvidence(input: {
  raw: unknown;
  mode: StripeMode;
  registry: PriceRegistryResult;
  customerId: string;
  nowSeconds: number;
}): SubscriptionEvidenceResult {
  const { raw, mode, customerId, nowSeconds } = input;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "subscription_unreadable" };
  const subscription = raw as Record<string, unknown>;
  if (subscription.object !== undefined && subscription.object !== "subscription")
    return { ok: false, reason: "subscription_object" };
  const id = idOf(subscription.id);
  if (!SUBSCRIPTION_ID.test(id)) return { ok: false, reason: "subscription_id" };
  if (subscription.livemode !== livemodeFor(mode))
    return { ok: false, reason: "subscription_mode" };
  if (!customerId || idOf(subscription.customer) !== customerId)
    return { ok: false, reason: "subscription_customer" };
  const status = typeof subscription.status === "string" ? subscription.status : "";
  if (!isKnownStripeStatus(status)) return { ok: false, reason: "subscription_status_unknown" };
  if (typeof subscription.cancel_at_period_end !== "boolean")
    return { ok: false, reason: "subscription_cancel_flag" };

  const itemList = (subscription.items ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(itemList.data) ? (itemList.data as Record<string, unknown>[]) : null;
  const items: ResolvedItemsResult = !input.registry.ok
    ? { ok: false, reason: `registry_${input.registry.reason}` }
    : rows === null
      ? { ok: false, reason: "items_unreadable" }
      : resolveSubscriptionItems({
          items: rows.map((item) => {
            const price = (item.price ?? {}) as Record<string, unknown>;
            const recurring = (price.recurring ?? {}) as Record<string, unknown>;
            return {
              priceId: idOf(price.id),
              productId: idOf(price.product),
              currency: price.currency,
              interval: recurring.interval,
              intervalCount: recurring.interval_count,
              quantity: item.quantity,
              currentPeriodStart: item.current_period_start,
              currentPeriodEnd: item.current_period_end,
            };
          }),
          hasMore: itemList.has_more,
          registry: input.registry.registry,
          nowSeconds,
        });

  return {
    ok: true,
    value: {
      id,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items,
      payment: invoicePaymentEvidence({
        invoice: subscription.latest_invoice,
        mode,
        customerId,
        subscriptionId: id,
      }),
    },
  };
}

/**
 * A complete authoritative list. A missing or non-array `data` is NOT an empty
 * list, and `has_more` must be exactly `false`: either would otherwise let a
 * partial answer look like "this customer has no subscriptions".
 */
export function completeListData(
  raw: unknown,
): { ok: true; data: unknown[] } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "list_unreadable" };
  const list = raw as Record<string, unknown>;
  if (list.object !== undefined && list.object !== "list")
    return { ok: false, reason: "list_object" };
  if (list.has_more !== false) return { ok: false, reason: "list_incomplete" };
  if (!Array.isArray(list.data)) return { ok: false, reason: "list_data_missing" };
  return { ok: true, data: list.data };
}

export type CheckoutSessionStatus = "open" | "complete" | "expired";
export interface CheckoutSessionView {
  id: string;
  /** `null` when Stripe reported a status this code does not recognise. */
  status: CheckoutSessionStatus | null;
  /** Only a validated `https://checkout.stripe.com` URL, else `null`. */
  url: string | null;
  customerId: string;
  subscriptionId: string;
  clientReferenceId: string;
}

/** Read a Checkout Session, refusing anything whose identity does not match the
 * mode (`cs_<mode>_…` id plus `livemode`). The caller still has to compare the
 * customer, the request id and the stored session id. */
export function readCheckoutSession(raw: unknown, mode: StripeMode): CheckoutSessionView | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Record<string, unknown>;
  if (session.object !== undefined && session.object !== "checkout.session") return null;
  const id = idOf(session.id);
  if (!new RegExp(`^cs_${mode}_[A-Za-z0-9]+$`).test(id)) return null;
  if (session.livemode !== livemodeFor(mode)) return null;
  const status = typeof session.status === "string" ? session.status : "";
  return {
    id,
    status: status === "open" || status === "complete" || status === "expired" ? status : null,
    url: httpsUrlOn(session.url, "checkout.stripe.com"),
    customerId: idOf(session.customer),
    subscriptionId: idOf(session.subscription),
    clientReferenceId:
      typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "",
  };
}

/** A validated customer id from a `POST /v1/customers` response. */
export function readCreatedCustomerId(raw: unknown, mode: StripeMode): string | null {
  if (!raw || typeof raw !== "object") return null;
  const customer = raw as Record<string, unknown>;
  if (customer.object !== undefined && customer.object !== "customer") return null;
  if (customer.livemode !== livemodeFor(mode)) return null;
  const id = idOf(customer.id);
  return /^cus_[A-Za-z0-9]+$/.test(id) ? id : null;
}

/**
 * The Billing Portal URL for a session, or `null`.
 *
 * The host must be EXACTLY `billing.stripe.com` — a suffix test such as
 * `endsWith('stripe.com')` would accept `billing.stripe.com.evil.test` — with
 * no port, username or password, and the session must name this customer in
 * this mode.
 */
export function readBillingPortalUrl(
  raw: unknown,
  mode: StripeMode,
  customerId: string,
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Record<string, unknown>;
  if (session.object !== undefined && session.object !== "billing_portal.session") return null;
  if (!/^bps_[A-Za-z0-9]+$/.test(idOf(session.id))) return null;
  if (session.livemode !== livemodeFor(mode)) return null;
  if (!customerId || idOf(session.customer) !== customerId) return null;
  return httpsUrlOn(session.url, "billing.stripe.com");
}

/** An https URL on EXACTLY this hostname, with no port or credentials. */
export function httpsUrlOn(value: unknown, hostname: string): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== hostname) return null;
    if (url.port || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
