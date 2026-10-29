/**
 * Stripe COMMERCIAL operations — SERVER ONLY.
 *
 * Plan and seat changes with provider-calculated proration, cancellation and
 * its reversal, and operator-approved support refunds. Every one of them is
 * DORMANT: live mode is refused by a code constant before any provider or
 * database access, and test mode is reachable only for an explicitly
 * allowlisted sandbox owner (the allowlist is empty by default).
 *
 * The trust boundary is the foundation's, unchanged and extended:
 *
 *  - NO TABLE ACCESS FROM TYPESCRIPT. Every database touch is a service-role
 *    SQL function from 20261028223000 (or the foundation's 20261028183000).
 *    Ownership, the single-open-operation rule, the monotone state machine, the
 *    quote binding, the refund reservation arithmetic and the projection gate
 *    are enforced in SQL, not by booleans here.
 *  - NOTHING FROM THE CLIENT IS AUTHORITY. The owner comes from the
 *    authenticated session; the account, mode, customer, subscription, item ids,
 *    prices and every monetary amount are resolved on the server. The caller may
 *    send a target plan, a seat count and the amount it was shown — and the
 *    amount is only ever COMPARED with the durable quote, never used.
 *  - THE MARKET COMES FROM THE PERSISTED BILLING COUNTRY, read on the server,
 *    never from a UI locale. `workspace_meta.billing_profile` is user-editable,
 *    so the derived market is validated and compared with the currency the paid
 *    subscription is actually locked to; an attempted currency switch is held.
 *  - A SUCCESSFUL HTTP STATUS GRANTS NOTHING. An increase requires the EXACT
 *    update invoice to be authoritatively paid AND the subscription items to be
 *    authoritatively applied. SCA, a decline, a pending payment, a timeout or an
 *    unknown outcome all leave the previously verified allowance in place,
 *    because the SQL projection gate refuses to widen it while the operation is
 *    unresolved.
 *  - UNCERTAINTY IS NON-TERMINAL. Past Stripe's 24h idempotency retention an
 *    unknown outcome is FENCED (slot held, no dispatch) and only an
 *    authoritative read may settle it.
 */
import { createHash } from "node:crypto";
import {
  COMMERCIAL_OPERATION_KINDS,
  COMMERCIAL_OPERATION_STATES,
  appliedSelectionMatches,
  buildReductionPayload,
  checkTargetCapacity,
  classifyChange,
  classifyRefundStatus,
  committedRefundTotal,
  dispositionSupported,
  evaluateRefundPolicy,
  isTerminalOperationState,
  itemStateFingerprintInput,
  parseSelectionDetail,
  parseStoredReductionPayload,
  readAdoptedScheduleProfile,
  readCommercialSubscriptionSnapshot,
  readCommercialSubscriptionState,
  readProrationPreview,
  readRecurringPreview,
  readRefundObject,
  readSubscriptionSchedule,
  readUpdateInvoiceIdentity,
  reductionPayloadEqual,
  refundReleasesReservation,
  resolveRefundableAllocation,
  resolveServerMarket,
  scheduleMatchesReduction,
  seatMarketSupported,
  selectionFingerprintInput,
  validateBaseTerms,
  validateSeatTerms,
  REFUND_SUPPORT_COPY,
  type ChangeDirection,
  type CommercialSelection,
  type CommercialSubscriptionSnapshot,
  type CommercialSubscriptionState,
  type MembershipUsage,
  type ReductionDispatchPayload,
  type RefundPolicyBasis,
} from "./stripe-commercial";
import {
  IDEMPOTENCY_RETENTION_MS,
  LIST_LIMIT,
  StripeLifecycleError,
  planPrices,
  stripeAccountVerifier,
  stripeClockFrom,
  stripeLifecycleConfig,
  stripeLifecycleRpc as call,
  stripeProviderCall,
  verifyStripeAccount,
  type Clock,
  type StripeAccountVerify,
  type StripeLifecycleConfig,
} from "./stripe-lifecycle.server";
import {
  completeListData,
  invoicePaymentEvidence,
  type PriceRegistryEntry,
  type StripeMode,
} from "./stripe-lifecycle";
import { effectivePlanId, isPlanId, type Entitlement } from "./entitlements";
import type {
  BillingProvider,
  BillingSummary,
  BillingSummaryActions,
  BillingSummaryResult,
  DiscoveredOperation,
  OperationEvidence,
  OperationTerms,
  SellablePlanId,
} from "./stripe-commercial-ui";
import type { BillingMarket, PlanId, SubscriptionStatus } from "./billing";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

/** The dormant hold for every commercial mutation. Deliberately a constant: no
 * environment variable, header, role or input can open live plan changes,
 * cancellations or refunds from here. Removing it is a code change plus a
 * release decision. */
export function liveCommercialMutationsAllowed(): boolean {
  return false;
}

/** Quote lifetime. Long enough for a person to read and confirm, short enough
 * that the provider-calculated proration it shows is still the one that will be
 * charged. A confirmation past it is refused, never silently re-priced. */
export const COMMERCIAL_QUOTE_TTL_SECONDS = 900;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELLABLE: readonly PlanId[] = ["starter", "growth", "pro", "agency"];

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function idOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string")
    return (value as { id: string }).id.trim();
  return "";
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function row(data: unknown): Json | null {
  const first = Array.isArray(data) ? (data as Json[])[0] : (data as Json | null);
  return first && typeof first === "object" ? first : null;
}

export interface CommercialDeps {
  env?: Env;
  fetch?: typeof fetch;
  now?: number | Clock;
}

export type Held = { ok: false; reason: string };

/* -------------------------------------------------------------------------- */
/* Server-resolved context                                                    */
/* -------------------------------------------------------------------------- */

/**
 * THE TWO-LAYER CONTEXT, and why it is two layers.
 *
 * Everything a commercial path may rely on used to be resolved in one pass that
 * ended with parsing the authoritative subscription against TODAY'S approved
 * price registry. For a FRESH intent that is exactly right: nothing may be sold
 * at a price the catalogue does not recognise.
 *
 * For RECOVERY it was a defect. An operation the customer already confirmed
 * carries its own prices, item ids, boundaries and request body durably, and
 * those terms were approved when the quote was issued. Once the catalogue is
 * rotated — a price replaced, an entry removed — the one-pass context refused
 * the subscription read with `state_item_unknown_price` BEFORE the durable
 * operation was ever read, so a retained increase replay and a captured
 * reduction could never complete and the slot and projection gate stayed held
 * forever.
 *
 * So the layers are:
 *
 *  - `CommercialIdentity` — the hold, configuration, the AUTHENTICATED owner's
 *    own mapping, and the VERIFIED key-owning account. Nothing mutable about
 *    the catalogue or the market. This is the authority layer and it is never
 *    weakened: a foreign owner, an unmapped customer, an unconfigured mode or an
 *    unverifiable account still stops everything here.
 *  - `RecoveryContext` — identity plus the CATALOGUE-FREE authoritative
 *    snapshot. Enough to recover, settle or report any existing operation.
 *  - `CommercialContext` — the recovery context plus the registry-resolved
 *    state and the resolved market. Required for a fresh intent, and ONLY for a
 *    fresh intent.
 *
 * The raw subscription response is read once and shared by both upper layers,
 * so this costs no extra provider call.
 */
interface CommercialIdentity {
  config: StripeLifecycleConfig;
  accountId: string;
  mode: StripeMode;
  customerId: string;
  /** The owner's mapped subscription, from the server mapping only. */
  subscriptionId: string;
  /** The stored, previously VERIFIED allowance. */
  stored: {
    subscriptionId: string | null;
    planId: PlanId | null;
    seatQuantity: number;
    status: string;
  };
  verify: StripeAccountVerify;
  fetchImpl: typeof fetch;
  clock: Clock;
}

interface RecoveryContext extends CommercialIdentity {
  /** The authoritative subscription with NO catalogue dependency. */
  snapshot: CommercialSubscriptionSnapshot;
  /** The exact response the snapshot was read from, so the strict catalogue
   * parse below needs no second GET. */
  raw: Json;
}

interface CommercialContext extends RecoveryContext {
  /** The registry-resolved state a FRESH intent must be built from. */
  state: CommercialSubscriptionState;
  market: BillingMarket;
  currency: string;
}

/**
 * Layer 1: authority only. The dormant hold is applied before any provider or
 * database access, and nothing here consults the price catalogue or the market.
 */
async function commercialIdentity(
  input: { userId: string; mode: StripeMode },
  deps: CommercialDeps,
): Promise<{ ok: true; identity: CommercialIdentity } | Held> {
  const { mode } = input;
  if (mode === "live") return { ok: false, reason: "live_commercial_held" };
  if (!liveCommercialMutationsAllowed() && mode !== "test")
    return { ok: false, reason: "live_commercial_held" };
  const config = stripeLifecycleConfig(deps.env ?? process.env);
  if (!config.checkoutReady(mode)) return { ok: false, reason: "not_configured" };
  if (!UUID.test(input.userId)) return { ok: false, reason: "request_invalid" };

  const accountId = config.accountIds[mode];
  const fetchImpl = deps.fetch ?? fetch;
  const clock = stripeClockFrom(deps.now);
  const verify = stripeAccountVerifier(mode, config, fetchImpl);

  let current: Json | null;
  try {
    current = row(
      await call("stripe_commercial_current_subscription", {
        p_user: input.userId,
        p_account: accountId,
        p_mode: mode,
      }),
    );
  } catch {
    return { ok: false, reason: "subscription_mapping_uncertain" };
  }
  const customerId = str(current?.customer_id);
  if (!customerId) return { ok: false, reason: "no_customer" };
  const storedSubscriptionId = str(current?.subscription_id) || null;
  const storedPlanId = (str(current?.plan_id) || null) as PlanId | null;
  if (!storedSubscriptionId || !storedPlanId) return { ok: false, reason: "no_paid_subscription" };
  const seatQuantity = Number(current?.seat_quantity ?? 0);

  // The verified key-owning account, before any provider read is trusted.
  try {
    await verify();
  } catch {
    return { ok: false, reason: "account_unverified" };
  }

  return {
    ok: true,
    identity: {
      config,
      accountId,
      mode,
      customerId,
      subscriptionId: storedSubscriptionId,
      stored: {
        subscriptionId: storedSubscriptionId,
        planId: storedPlanId,
        seatQuantity: Number.isInteger(seatQuantity) ? seatQuantity : 0,
        status: str(current?.status),
      },
      verify,
      fetchImpl,
      clock,
    },
  };
}

/** One authoritative subscription GET, parsed WITHOUT the catalogue. */
async function readSubscriptionSnapshot(
  identity: CommercialIdentity,
): Promise<{ ok: true; snapshot: CommercialSubscriptionSnapshot; raw: Json } | Held> {
  let raw: Json;
  try {
    raw = await stripeProviderCall(
      `subscriptions/${encodeURIComponent(identity.subscriptionId)}?expand[]=latest_invoice`,
      { mode: identity.mode, method: "GET" },
      identity.config,
      identity.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "provider_read_failed" };
  }
  const snapshot = readCommercialSubscriptionSnapshot({
    raw,
    mode: identity.mode,
    customerId: identity.customerId,
  });
  if (!snapshot.ok) return { ok: false, reason: `state_${snapshot.reason}` };
  if (snapshot.value.subscriptionId !== identity.subscriptionId)
    return { ok: false, reason: "state_subscription_identity" };
  return { ok: true, snapshot: snapshot.value, raw };
}

/** Layer 2: identity plus the catalogue-free snapshot. */
async function recoveryContext(
  input: { userId: string; mode: StripeMode },
  deps: CommercialDeps,
): Promise<{ ok: true; ctx: RecoveryContext } | Held> {
  const resolved = await commercialIdentity(input, deps);
  if (!resolved.ok) return resolved;
  const read = await readSubscriptionSnapshot(resolved.identity);
  if (!read.ok) return read;
  return { ok: true, ctx: { ...resolved.identity, snapshot: read.snapshot, raw: read.raw } };
}

/**
 * Layer 3: the registry-resolved state and the market, for a FRESH intent.
 *
 * This is where today's catalogue eligibility lives, deliberately: only a
 * currently granting projection may be priced against, every item must resolve
 * to an approved price, and the market must agree with the currency the
 * subscription is locked to.
 */
async function commercialContext(
  input: { userId: string; mode: StripeMode },
  deps: CommercialDeps,
  reuse?: RecoveryContext,
): Promise<{ ok: true; ctx: CommercialContext } | Held> {
  let base = reuse;
  if (!base) {
    const resolved = await recoveryContext(input, deps);
    if (!resolved.ok) return resolved;
    base = resolved.ctx;
  }
  // Only a currently granting projection may be CHANGED. `past_due`, `unpaid`,
  // `incomplete` and anything unrecognised are not a base to price against.
  // This is a fresh-intent rule: it must never block the recovery of an
  // operation that was accepted while the projection was still granting.
  if (base.stored.status !== "active" && base.stored.status !== "trialing")
    return { ok: false, reason: "subscription_not_current" };
  const registry = base.config.registries[base.mode];
  if (!registry.ok) return { ok: false, reason: `registry_${registry.reason}` };
  const state = readCommercialSubscriptionState({
    raw: base.raw,
    mode: base.mode,
    customerId: base.customerId,
    registry: registry.registry,
    nowSeconds: Math.floor(base.clock() / 1000),
  });
  if (!state.ok) return { ok: false, reason: `state_${state.reason}` };
  if (state.value.subscriptionId !== base.subscriptionId)
    return { ok: false, reason: "state_subscription_identity" };

  // The market is derived from the PERSISTED billing country on the server and
  // compared with the currency this subscription is locked to.
  let country: Json | null;
  try {
    country = row(await call("stripe_commercial_billing_country", { p_user: input.userId }));
  } catch {
    return { ok: false, reason: "billing_country_uncertain" };
  }
  const market = resolveServerMarket({
    billingCountry: str(country?.country),
    needsReview: country?.needs_review === true,
    lockedCurrency: state.value.currency,
  });
  if (!market.ok) return { ok: false, reason: market.reason };

  return {
    ok: true,
    ctx: { ...base, state: state.value, market: market.market, currency: market.currency },
  };
}

/** Read one provider price object and validate it against the approved terms. */
async function validatedPrice(
  ctx: CommercialContext,
  entry: PriceRegistryEntry,
  planId: PlanId,
): Promise<{ ok: true } | Held> {
  let price: Json;
  try {
    price = await stripeProviderCall(
      `prices/${encodeURIComponent(entry.priceId)}`,
      { mode: ctx.mode, method: "GET" },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "price_read_failed" };
  }
  if (price.object !== undefined && price.object !== "price")
    return { ok: false, reason: "price_object" };
  if (idOf(price.id) !== entry.priceId) return { ok: false, reason: "price_identity" };
  if (price.livemode !== (ctx.mode === "live")) return { ok: false, reason: "price_mode" };
  const recurring = (price.recurring ?? {}) as Json;
  const shared = {
    planId,
    market: ctx.market,
    entry,
    providerAmountMinor: price.unit_amount,
    providerCurrency: price.currency,
    providerProductId: idOf(price.product),
    providerActive: price.active,
    providerInterval: recurring.interval,
    providerIntervalCount: recurring.interval_count,
  };
  const check = entry.kind === "base" ? validateBaseTerms(shared) : validateSeatTerms(shared);
  return check.ok ? { ok: true } : { ok: false, reason: `terms_${check.reason}` };
}

/** A count that must be a plain non-negative integer inside a sane bound. A
 * string, a float, a negative or an absurd value is UNKNOWN, never coerced. */
function usageCount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const count = typeof value === "number" ? value : Number(value.trim());
  return Number.isInteger(count) && count >= 0 && count <= 1_000_000 ? count : null;
}

/**
 * Current seat AND project usage, from the frozen `membership_usage` RPC.
 *
 * The two halves are SEPARATELY known: the released seat counter (distinct
 * people plus pending invitations, account-wide) can be perfectly readable
 * while the project store is not, and the reverse. Either half being unreadable
 * is UNKNOWN for that half — never "nobody is affected" and never a convenient
 * zero — and `checkTargetCapacity` then HOLDS the reduction.
 */
async function membershipUsage(userId: string): Promise<MembershipUsage> {
  const unknown: MembershipUsage = {
    workingSeats: 0,
    viewerSeats: 0,
    known: false,
    projects: 0,
    projectsKnown: false,
  };
  try {
    const data = row(await call("stripe_commercial_membership_usage", { p_owner: userId }));
    const working = usageCount(data?.working);
    const viewer = usageCount(data?.viewer);
    const projects = usageCount(data?.projects);
    const seatsKnown = data?.known === true && working !== null && viewer !== null;
    const projectsKnown = data?.projects_known === true && projects !== null;
    return {
      workingSeats: seatsKnown ? (working as number) : 0,
      viewerSeats: seatsKnown ? (viewer as number) : 0,
      known: seatsKnown,
      projects: projectsKnown ? (projects as number) : 0,
      projectsKnown,
    };
  } catch {
    return unknown;
  }
}

/* -------------------------------------------------------------------------- */
/* Target resolution shared by preparation and confirmation                   */
/* -------------------------------------------------------------------------- */

interface ChangeTarget {
  direction: Exclude<ChangeDirection, "unchanged" | "mixed">;
  /** The EXACT selection the customer confirmed: target plan and seats plus the
   * existing item ids and prices the update will name. On a resumed attempt
   * this comes from the operation's own durable `selection_detail`, never from
   * the current subscription or the current price configuration. */
  selection: CommercialSelection;
  /** The canonical `plan#seats#baseItemId#basePriceId#seatItemId#seatPriceId`
   * form, which is what `begin_operation` persists and re-asserts. */
  selectionDetail: string;
  selectionFingerprint: string;
  /** The durable quote these terms are bound to. */
  quoteId: string;
}

const changeTarget = (
  direction: ChangeTarget["direction"],
  selection: CommercialSelection,
  quoteId: string,
): ChangeTarget => {
  const detail = selectionFingerprintInput(selection);
  return {
    direction,
    selection,
    selectionDetail: detail,
    selectionFingerprint: digest(detail),
    quoteId,
  };
};

async function resolveChangeTarget(
  ctx: CommercialContext,
  userId: string,
  quoteId: string,
  targetPlanId: PlanId,
  targetSeatQuantity: number,
): Promise<{ ok: true; target: ChangeTarget; usage: MembershipUsage } | Held> {
  if (!SELLABLE.includes(targetPlanId)) return { ok: false, reason: "plan_not_sellable" };
  if (!Number.isInteger(targetSeatQuantity) || targetSeatQuantity < 0 || targetSeatQuantity > 1000)
    return { ok: false, reason: "seat_quantity_invalid" };
  if (ctx.state.pendingUpdate !== "absent")
    return { ok: false, reason: `pending_update_${ctx.state.pendingUpdate}` };
  // An existing schedule was not created by this packet (a reduction releases
  // its schedule when it completes), so it is a conflict for review.
  if (ctx.state.scheduleId) return { ok: false, reason: "schedule_conflict" };
  if (ctx.state.cancelAtPeriodEnd) return { ok: false, reason: "cancellation_pending" };

  const direction = classifyChange({
    currentPlanId: ctx.state.planId,
    currentSeatQuantity: ctx.state.seatQuantity,
    targetPlanId,
    targetSeatQuantity,
  });
  if (direction === "unchanged") return { ok: false, reason: "change_unchanged" };
  // A plan increase combined with a seat decrease would need two effective
  // dates in one confirmation; held for review rather than guessed.
  if (direction === "mixed") return { ok: false, reason: "mixed_change_held" };

  const prices = planPrices(ctx.config, ctx.mode, targetPlanId);
  if (!prices) return { ok: false, reason: "plan_not_configured" };
  if (targetSeatQuantity > 0) {
    if (!seatMarketSupported(ctx.market)) return { ok: false, reason: "seat_market_unapproved" };
    if (!prices.seat) return { ok: false, reason: "seat_price_not_configured" };
  }

  const base = await validatedPrice(ctx, prices.base, targetPlanId);
  if (!base.ok) return base;
  if (targetSeatQuantity > 0 && prices.seat) {
    const seat = await validatedPrice(ctx, prices.seat, targetPlanId);
    if (!seat.ok) return seat;
  }

  // A reduction below the account's CURRENT active working/viewer membership is
  // a capacity conflict: preserving members and their data takes priority over
  // scheduling a silent removal or an unreviewed over-limit transition.
  const usage = await membershipUsage(userId);
  if (direction === "decrease") {
    const capacity = checkTargetCapacity({ targetPlanId, targetSeatQuantity, usage });
    if (!capacity.ok) return { ok: false, reason: capacity.reason };
  }

  return {
    ok: true,
    usage,
    target: changeTarget(
      direction,
      {
        targetPlanId,
        targetSeatQuantity,
        baseItemId: ctx.state.base.itemId,
        basePriceId: prices.base.priceId,
        seatItemId: ctx.state.seat?.itemId ?? null,
        seatPriceId: targetSeatQuantity > 0 ? (prices.seat?.priceId ?? null) : null,
      },
      quoteId,
    ),
  };
}

/**
 * Stripe's bracket form encoding, built from a path rather than string
 * concatenation: `formKey("subscription_details","items",0,"id")` is
 * `subscription_details[items][0][id]`. Concatenating a prefix onto an
 * already-bracketed key would produce `subscription_details[items[0][id]]`,
 * which the provider reads as a different (meaningless) field — the preview
 * would then be calculated for the wrong item set.
 */
function formKey(...path: (string | number)[]): string {
  return path.map((part, index) => (index === 0 ? String(part) : `[${part}]`)).join("");
}

/**
 * THE ONE canonical encoder for an item set, used for both the preview and the
 * update so the two can never drift.
 *
 * Every parameter derives from the IMMUTABLE selection: the existing base item
 * id at the selected base price with its explicit quantity 1, and either the
 * exact existing seat item, exactly ONE newly added approved seat item, or the
 * deletion of the exact existing seat item. `deleted` is only ever used on the
 * EXACT existing seat item id, never on a current id looked up later.
 */
function selectionItemForm(selection: CommercialSelection, ...prefix: string[]): URLSearchParams {
  const form = new URLSearchParams();
  const key = (...path: (string | number)[]) => formKey(...prefix, "items", ...path);
  form.set(key(0, "id"), selection.baseItemId);
  form.set(key(0, "price"), selection.basePriceId);
  form.set(key(0, "quantity"), "1");
  if (selection.targetSeatQuantity > 0 && selection.seatPriceId) {
    if (selection.seatItemId) form.set(key(1, "id"), selection.seatItemId);
    form.set(key(1, "price"), selection.seatPriceId);
    form.set(key(1, "quantity"), String(selection.targetSeatQuantity));
  } else if (selection.seatItemId) {
    form.set(key(1, "id"), selection.seatItemId);
    form.set(key(1, "deleted"), "true");
  }
  return form;
}

/**
 * The IMMUTABLE increase body. Every parameter comes from the original
 * selection, the original quote's stable proration date and supported fixed
 * constants — nothing from a current read — so a lost acknowledgment can be
 * recovered by an identical retained replay under the same idempotency key.
 *
 * `always_invoice` makes the proration a real invoice the customer must pay;
 * `pending_if_incomplete` means an incomplete payment leaves the items
 * UNCHANGED with a `pending_update` set, so a declined card or an unfinished
 * SCA step cannot widen the allowance.
 */
function increaseUpdateForm(
  selection: CommercialSelection,
  prorationDate: number,
): URLSearchParams {
  const form = selectionItemForm(selection);
  form.set("proration_behavior", "always_invoice");
  form.set("proration_date", String(prorationDate));
  form.set("payment_behavior", "pending_if_incomplete");
  form.append("expand[]", "latest_invoice");
  return form;
}

/** The IMMUTABLE adoption body, which is the whole body: `from_subscription`
 * cannot be combined with phase modifications in one request. */
function adoptionForm(subscriptionId: string): URLSearchParams {
  return new URLSearchParams({ from_subscription: subscriptionId });
}

/**
 * The phase-update body, serialised from the STORED v1 payload and nothing
 * else.
 *
 * The field order is fixed rather than derived from object key order, so the
 * first call and every permissible retry produce the identical parameter
 * multiset across a registry change, a period rollover and a process restart.
 */
function reductionPhasesForm(payload: ReductionDispatchPayload): URLSearchParams {
  const form = new URLSearchParams();
  form.set("end_behavior", payload.request.end_behavior);
  form.set("proration_behavior", payload.request.proration_behavior);
  payload.request.phases.forEach((phase, index) => {
    const key = (...path: (string | number)[]) => formKey("phases", index, ...path);
    form.set(key("start_date"), String(phase.start_date));
    if (phase.end_date !== undefined) form.set(key("end_date"), String(phase.end_date));
    form.set(key("proration_behavior"), phase.proration_behavior);
    // Preserved EXPLICITLY, in both phases, exactly as the original carried
    // them. An inherited original is restated in neither phase, because naming
    // it would turn an inherited setting into an override it never had.
    if (phase.collection_method !== undefined)
      form.set(key("collection_method"), phase.collection_method);
    if (phase.default_payment_method !== undefined)
      form.set(key("default_payment_method"), phase.default_payment_method);
    phase.items.forEach((item, position) => {
      form.set(key("items", position, "price"), item.price);
      form.set(key("items", position, "quantity"), String(item.quantity));
    });
  });
  return form;
}

/* -------------------------------------------------------------------------- */
/* Preparation: a provider-calculated, bound, single-use quote                */
/* -------------------------------------------------------------------------- */

export interface PreparedChange {
  ok: true;
  quoteId: string;
  direction: "increase" | "decrease";
  /** Charged NOW, in the subscription's own currency, integer smallest units,
   * exactly as the provider calculated it from the immediate proration preview.
   * For a period-end reduction it is 0: nothing is charged now. */
  amountDueMinor: number;
  /**
   * The provider's LONG-TERM RECURRING BILL ESTIMATE for one full period at the
   * target items, from a separate `preview_mode=recurring` preview.
   *
   * It is an ESTIMATE, not a promise of the next debit and not a statement of
   * what was actually billed: one-time items, one-time discounts, a coupon
   * ending or a tax change all make the next actual invoice different. It is
   * also unrelated to `amountDueMinor` — a period-end reduction legitimately
   * has zero to pay now and a positive recurring estimate.
   */
  recurringEstimateMinor: number;
  /** True when the estimate includes an invoice-level discount or exclusive tax
   * that the packet reports inside `total` without itemising. */
  recurringEstimateIncludesAdjustments: boolean;
  currency: string;
  /** When the change takes effect. `null` means immediately on payment. */
  effectiveAt: string | null;
  immediate: boolean;
  expiresAt: string;
  targetPlanId: PlanId;
  targetSeatQuantity: number;
  workingSeatAllowance: number;
  viewerSeatAllowance: number;
  /** The target plan's PROJECT bundle. A plan is all three bundles, and a
   * reduction can fit the team while exceeding this one. */
  projectAllowance: number;
  /** Plain-language explanation of WHEN this takes effect, for the caller to
   * show verbatim. No price is restated here. */
  effectiveNote: string;
  /** Honest wording for the recurring figure, so no caller can turn an estimate
   * into a promised next charge. */
  recurringEstimateNote: string;
}

/**
 * Prepare a plan or seat change: resolve everything on the server, have the
 * PROVIDER calculate the proration, and persist a bound, short-lived,
 * single-use quote the customer must explicitly confirm.
 *
 * Nothing is mutated at the provider by this call. The preview is a preview;
 * the only provider write in the whole change flow happens in
 * `confirmSubscriptionChange`.
 */
export async function prepareSubscriptionChange(
  input: {
    userId: string;
    quoteId: string;
    mode: StripeMode;
    targetPlanId: PlanId;
    targetSeatQuantity: number;
  },
  deps: CommercialDeps = {},
): Promise<PreparedChange | Held> {
  if (!UUID.test(input.quoteId)) return { ok: false, reason: "request_invalid" };
  const resolved = await commercialContext(input, deps);
  if (!resolved.ok) return resolved;
  const { ctx } = resolved;

  const targeted = await resolveChangeTarget(
    ctx,
    input.userId,
    input.quoteId,
    input.targetPlanId,
    input.targetSeatQuantity,
  );
  if (!targeted.ok) return targeted;
  const { target } = targeted;

  // A STABLE proration date, chosen once and stored with the quote, so the
  // confirmation charges exactly the preview the customer saw.
  const prorationDate = Math.floor(ctx.clock() / 1000);
  let amountDueMinor = 0;

  if (target.direction === "increase") {
    // THE IMMEDIATE PREVIEW. The default `next` preview mode, with the stable
    // proration date this quote is bound to and verified immediate-charge
    // semantics. `readProrationPreview` holds any preview that mixes renewal
    // lines into the figure, because no documented field separates "charged
    // now" from "charged at renewal" inside one `amount_due`.
    const preview = selectionItemForm(target.selection, "subscription_details");
    preview.set("subscription", ctx.state.subscriptionId);
    preview.set("customer", ctx.customerId);
    preview.set("subscription_details[proration_behavior]", "always_invoice");
    preview.set("subscription_details[proration_date]", String(prorationDate));
    let raw: Json;
    try {
      raw = await stripeProviderCall(
        "invoices/create_preview",
        { mode: ctx.mode, method: "POST", body: preview },
        ctx.config,
        ctx.fetchImpl,
      );
    } catch {
      return { ok: false, reason: "preview_unavailable" };
    }
    const read = readProrationPreview({
      raw,
      mode: ctx.mode,
      customerId: ctx.customerId,
      subscriptionId: ctx.state.subscriptionId,
      currency: ctx.state.currency,
      prorationDate,
    });
    if (!read.ok) return { ok: false, reason: `preview_${read.reason}` };
    amountDueMinor = read.value.amountDueMinor;
  }
  // A reduction takes effect at the paid period end with NO refund of unused
  // time, so nothing is charged now, nothing is prorated, and no immediate
  // preview is taken at all. A positive upcoming renewal is NOT an immediate
  // charge and must never be read as one — which is exactly what rejecting any
  // positive `amount_due` from a `next`-mode preview used to do.

  // THE RECURRING ESTIMATE, a SEPARATE preview in the documented `recurring`
  // mode. It carries no immediate proration date and no proration parameters —
  // prorations are not supported in that mode — and it is a long-term estimate
  // of one full period at the target items, not a promised next debit.
  const recurring = selectionItemForm(target.selection, "subscription_details");
  recurring.set("subscription", ctx.state.subscriptionId);
  recurring.set("customer", ctx.customerId);
  recurring.set("preview_mode", "recurring");
  let recurringRaw: Json;
  try {
    recurringRaw = await stripeProviderCall(
      "invoices/create_preview",
      { mode: ctx.mode, method: "POST", body: recurring },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "preview_recurring_unavailable" };
  }
  const recurringRead = readRecurringPreview({
    raw: recurringRaw,
    mode: ctx.mode,
    customerId: ctx.customerId,
    subscriptionId: ctx.state.subscriptionId,
    currency: ctx.state.currency,
  });
  if (!recurringRead.ok) return { ok: false, reason: `preview_${recurringRead.reason}` };
  const recurringEstimateMinor = recurringRead.value.estimateMinor;

  const effectiveAt =
    target.direction === "decrease" ? new Date(ctx.state.currentPeriodEnd * 1000) : null;
  const bundleAllowance = checkTargetCapacity({
    targetPlanId: target.selection.targetPlanId,
    targetSeatQuantity: target.selection.targetSeatQuantity,
    usage: targeted.usage,
  });

  let issued: Json | null;
  try {
    issued = row(
      await call("stripe_commercial_issue_quote", {
        p_quote: input.quoteId,
        p_user: input.userId,
        p_account: ctx.accountId,
        p_mode: ctx.mode,
        p_kind: target.selection.targetPlanId === ctx.state.planId ? "seat_change" : "plan_change",
        p_subscription: ctx.state.subscriptionId,
        p_state_fingerprint: digest(itemStateFingerprintInput(ctx.state)),
        p_selection_fingerprint: target.selectionFingerprint,
        p_target_plan: target.selection.targetPlanId,
        p_target_seats: target.selection.targetSeatQuantity,
        p_direction: target.direction,
        p_proration_date:
          target.direction === "increase" ? prorationDate : ctx.state.currentPeriodEnd,
        p_currency: ctx.state.currency,
        p_amount_due: amountDueMinor,
        p_recurring_amount: recurringEstimateMinor,
        p_effective_at: effectiveAt ? effectiveAt.toISOString() : null,
        p_ttl_seconds: COMMERCIAL_QUOTE_TTL_SECONDS,
      }),
    );
  } catch {
    // Includes `stripe_commercial_operation_open`: an unresolved operation holds
    // this owner's slot, so no quote may be issued against a state it is about
    // to change.
    return { ok: false, reason: "quote_unavailable" };
  }
  const expiresAt = str(issued?.expires_at);
  if (!expiresAt) return { ok: false, reason: "quote_unavailable" };

  return {
    ok: true,
    quoteId: input.quoteId,
    direction: target.direction,
    amountDueMinor,
    recurringEstimateMinor,
    recurringEstimateIncludesAdjustments: recurringRead.value.includesInvoiceAdjustments,
    currency: ctx.state.currency,
    effectiveAt: effectiveAt ? effectiveAt.toISOString() : null,
    immediate: target.direction === "increase",
    expiresAt: new Date(expiresAt).toISOString(),
    targetPlanId: target.selection.targetPlanId,
    targetSeatQuantity: target.selection.targetSeatQuantity,
    workingSeatAllowance: bundleAllowance.workingAllowance,
    viewerSeatAllowance: bundleAllowance.viewerAllowance,
    projectAllowance: bundleAllowance.projectAllowance,
    effectiveNote:
      target.direction === "increase"
        ? "This change takes effect once the prorated amount shown is paid. Until then your current plan and seats stay exactly as they are."
        : "This change takes effect at the end of the period you have already paid for. Unused time is not refunded, and nothing is charged now.",
    recurringEstimateNote:
      "This is an estimate of one full period at the new plan and seats. It is not a promise of your next charge: one-off items, a discount ending or a tax change can make the next invoice different.",
  };
}

/* -------------------------------------------------------------------------- */
/* Confirmation                                                               */
/* -------------------------------------------------------------------------- */

export interface ConfirmedChange {
  ok: true;
  state: "applied" | "awaiting_payment" | "scheduled";
  direction: "increase" | "decrease";
  effectiveAt: string | null;
  currency: string;
  amountDueMinor: number;
  note: string;
}

/** What `begin_operation` returns, including the frozen allowance baseline and
 * the canonical selection this operation was created for. */
interface OperationRow {
  state: string;
  attempts: number;
  createdAt: number;
  invoiceId: string | null;
  refundId: string | null;
  scheduleId: string | null;
  /** The latest invoice observed BEFORE this operation dispatched anything,
   * recorded durably on the first attempt and never overwritten. */
  baselineInvoiceId: string | null;
  /** The canonical `plan#seats#baseItemId#basePriceId#seatItemId#seatPriceId`
   * this operation is bound to. */
  selectionDetail: string | null;
  /** The IMMUTABLE, re-proved allowance baseline. `false` is an explicit HOLD —
   * not a zero allowance, not a smaller plan to assume, and not a signal to
   * pick fresh prices. */
  baselineKnown: boolean;
  baselinePlanId: PlanId | null;
  baselineSeatQuantity: number | null;
  baselineSubscriptionId: string | null;
  resumed: boolean;
}
function operationRow(data: unknown): OperationRow | null {
  const first = row(data);
  if (!first) return null;
  const seats = Number(first.baseline_seat_quantity);
  return {
    state: str(first.state),
    attempts: Number(first.attempts ?? 0),
    createdAt: Date.parse(str(first.created_at)),
    invoiceId: str(first.invoice_id) || null,
    refundId: str(first.refund_id) || null,
    scheduleId: str(first.schedule_id) || null,
    baselineInvoiceId: str(first.baseline_invoice_id) || null,
    selectionDetail: str(first.selection_detail) || null,
    baselineKnown: first.baseline_known === true,
    baselinePlanId: (str(first.baseline_plan_id) || null) as PlanId | null,
    baselineSeatQuantity: Number.isInteger(seats) ? seats : null,
    baselineSubscriptionId: str(first.baseline_subscription_id) || null,
    resumed: first.resumed === true,
  };
}

type OperationScope = {
  p_operation: string;
  p_user: string;
  p_account: string;
  p_mode: StripeMode;
};

/** What `read_operation` returns. It deliberately carries no selection,
 * fingerprint, idempotency key or quote identity — those are read separately,
 * scoped, when a recovery needs them. */
interface DurableOperation {
  kind: string;
  state: string;
  subscriptionId: string | null;
  invoiceId: string | null;
  refundId: string | null;
  scheduleId: string | null;
  refusalCode: string | null;
  attempts: number;
  createdAt: number;
  reductionPayload: unknown;
}

/**
 * Read the operation's own durable state.
 *
 * A transport failure here is UNCERTAINTY, never "no operation": the whole
 * point of this read is to distinguish a successful mutation from a rejected
 * compare-and-set and from an unknown database outcome.
 */
async function readDurableOperation(
  scope: OperationScope,
): Promise<{ ok: true; value: DurableOperation } | Held> {
  let data: Json | null;
  try {
    data = row(await call("stripe_commercial_read_operation", scope));
  } catch {
    return { ok: false, reason: "operation_uncertain" };
  }
  if (!data) return { ok: false, reason: "operation_uncertain" };
  return {
    ok: true,
    value: {
      kind: str(data.kind),
      state: str(data.state),
      subscriptionId: str(data.subscription_id) || null,
      invoiceId: str(data.invoice_id) || null,
      refundId: str(data.refund_id) || null,
      scheduleId: str(data.schedule_id) || null,
      refusalCode: str(data.refusal_code) || null,
      attempts: Number(data.attempts ?? 0),
      createdAt: Date.parse(str(data.created_at)),
      reductionPayload: data.reduction_dispatch_payload ?? null,
    },
  };
}

/** The original, immutable terms `read_operation` does not expose. */
interface OriginalOperationTerms {
  state: string;
  kind: string;
  subscriptionId: string;
  quoteId: string | null;
  selectionDetail: string | null;
  idempotencyKey: string;
  baselineInvoiceId: string | null;
}

interface ScopedFilter {
  eq(column: string, value: unknown): ScopedFilter;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
}
interface ScopedClient {
  from(table: string): { select(columns: string): ScopedFilter };
}

/**
 * The ONE minimal, service-only table read in this module.
 *
 * `read_operation` deliberately omits the selection, the params fingerprint,
 * the idempotency key and the quote identity — and a recovery has to re-assert
 * the ORIGINAL selection to `begin_operation` BEFORE it may learn anything
 * else, so there is a genuine ordering gap no RPC closes. It is closed by a
 * SELECT scoped to the exact operation plus the AUTHENTICATED owner, the
 * VERIFIED account and the mode, over a fixed column list, that writes nothing:
 * every state change still goes through the RPCs, no table WRITE bypasses them,
 * and none of these fields is ever returned to a caller.
 *
 * An absent row means "no such operation for this owner", which is the normal
 * first attempt. A transport failure is uncertainty, never absence.
 */
async function readOriginalOperationTerms(
  scope: OperationScope,
): Promise<OriginalOperationTerms | null | "uncertain"> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as ScopedClient)
      .from("stripe_commercial_operations")
      .select(
        "state,kind,subscription_id,quote_id,selection_detail,idempotency_key,baseline_invoice_id",
      )
      .eq("operation_id", scope.p_operation)
      .eq("user_id", scope.p_user)
      .eq("account_id", scope.p_account)
      .eq("mode", scope.p_mode)
      .maybeSingle();
    if (error) return "uncertain";
    const record = data && typeof data === "object" ? (data as Json) : null;
    if (!record) return null;
    const subscriptionId = str(record.subscription_id);
    if (!subscriptionId || !str(record.state)) return "uncertain";
    return {
      state: str(record.state),
      kind: str(record.kind),
      subscriptionId,
      quoteId: str(record.quote_id) || null,
      selectionDetail: str(record.selection_detail) || null,
      idempotencyKey: str(record.idempotency_key),
      baselineInvoiceId: str(record.baseline_invoice_id) || null,
    };
  } catch {
    return "uncertain";
  }
}

/**
 * Is a retry of THIS operation still covered by Stripe's idempotency retention?
 *
 * Identical discipline to the foundation's checkout guard and for the same
 * reason: the deadline belongs to the operation's IMMUTABLE creation time, the
 * clock is read freshly on every call, and the comparison is STRICT because
 * retention is documented as "at least 24 hours", after which reusing a key
 * executes a NEW request. The answer is re-taken immediately before each
 * duplicable dispatch, never once at the start of an attempt whose later steps
 * all await.
 */
function retentionGuard(createdAt: number, clock: Clock): () => boolean {
  return () => {
    if (!Number.isFinite(createdAt)) return false;
    try {
      return clock() - createdAt < IDEMPOTENCY_RETENTION_MS;
    } catch {
      // An unreadable clock is an unusable deadline, never a free pass.
      return false;
    }
  };
}

/**
 * The three outcomes of a durable write, kept apart deliberately.
 *
 *  - `ok` — SQL returned true: the mutation happened.
 *  - `stale` — SQL returned FALSE: the compare-and-set was rejected, nothing was
 *    written, and another instance owns the current state. This is never
 *    success, and never a licence to send a newly parameterised request or to
 *    finish from this instance's stale validation.
 *  - `uncertain` — the call threw: the outcome is UNKNOWN and must be resolved
 *    by re-reading the exact scoped row, or reported as uncertainty.
 */
type WriteOutcome = "ok" | "stale" | "uncertain";

interface StepDeps {
  advance: (
    state: "dispatching" | "awaiting_payment" | "awaiting_apply" | "fenced",
    evidence: {
      invoice?: string | null;
      refund?: string | null;
      schedule?: string | null;
      payload?: ReductionDispatchPayload | null;
      /** ALWAYS supplied: an advance without an expected state is a worker
       * moving an operation it has not proved it still owns. */
      expected: string;
    },
  ) => Promise<WriteOutcome>;
  finish: (
    state: "applied" | "refused" | "failed",
    refusal: string | null,
    expected: string,
  ) => Promise<WriteOutcome>;
  stillRetainable: () => boolean;
  idempotencyKey: string;
}

async function durableWrite(name: string, args: Json): Promise<WriteOutcome> {
  try {
    return (await call(name, args)) === true ? "ok" : "stale";
  } catch {
    return "uncertain";
  }
}

function stepDeps(scope: OperationScope, createdAt: number, clock: Clock, key: string): StepDeps {
  return {
    advance: (state, evidence) =>
      durableWrite("stripe_commercial_advance_operation", {
        ...scope,
        p_state: state,
        p_invoice: evidence.invoice ?? null,
        p_refund: evidence.refund ?? null,
        p_schedule: evidence.schedule ?? null,
        p_expected_state: evidence.expected,
        p_reduction_payload: evidence.payload ?? null,
      }),
    finish: (state, refusal, expected) =>
      durableWrite("stripe_commercial_finish_operation", {
        ...scope,
        p_state: state,
        p_refusal: refusal ?? null,
        p_expected_state: expected,
      }),
    stillRetainable: retentionGuard(createdAt, clock),
    idempotencyKey: key,
  };
}

interface QuoteTerms {
  planId: PlanId;
  seats: number;
  direction: "increase" | "decrease";
  /** For an increase, the stable proration date. For a reduction it IS the paid
   * period end the change was calculated for — the fixed effective boundary. */
  prorationDate: number;
  currency: string;
  amountDue: number;
  stateFingerprint: string;
  selectionFingerprint: string;
  effectiveAt: string | null;
  consumedBy: string | null;
}

const appliedIncrease = (terms: QuoteTerms): ConfirmedChange => ({
  ok: true,
  state: "applied",
  direction: "increase",
  effectiveAt: null,
  currency: terms.currency,
  amountDueMinor: terms.amountDue,
  note: "The new plan and seat count are active, and the prorated amount shown has been paid.",
});
const scheduledReduction = (terms: QuoteTerms): ConfirmedChange => ({
  ok: true,
  state: "scheduled",
  direction: "decrease",
  effectiveAt: terms.effectiveAt,
  currency: terms.currency,
  amountDueMinor: 0,
  note: "The reduction is scheduled for the end of the period you have already paid for. Nothing is charged now, unused time is not refunded, and no team member is removed by this change.",
});

/** The durable reservation, read scoped and used as evidence rather than
 * rediscovered from the provider. */
interface RefundReservationRow {
  state: string;
  refundId: string | null;
  refundStatus: string | null;
  amount: number;
  currency: string;
  invoiceId: string;
  paymentId: string;
  operationId: string;
}

/**
 * The exact scoped refund reservation, read ONLY through the service client and
 * ONLY as a fixed column list.
 *
 * The reservation is the durable record of a dispatched refund: its state text,
 * its immutable refund id and the amount/currency/invoice/payment it is bound
 * to. Two paths need it as EVIDENCE rather than as something to be rediscovered
 * from a provider list:
 *
 *  - an ambiguous `reserve_refund` error, where closing the operation would
 *    terminate an in-flight refund;
 *  - a committed settlement whose acknowledgment was lost twice, where the
 *    provider list may be empty while SQL already holds the exact result.
 *
 * It writes nothing; `settle_refund` and `finish_operation` remain the only
 * ways the reservation or the operation can change.
 */
async function readRefundReservation(input: {
  caseId: string;
  accountId: string;
  mode: StripeMode;
}): Promise<RefundReservationRow | null | "uncertain"> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as ScopedClient)
      .from("stripe_refund_reservations")
      .select("state,refund_id,refund_status,amount,currency,invoice_id,payment_id,operation_id")
      .eq("case_id", input.caseId)
      .eq("account_id", input.accountId)
      .eq("mode", input.mode)
      .maybeSingle();
    if (error) return "uncertain";
    const record = data && typeof data === "object" ? (data as Json) : null;
    if (!record) return null;
    const state = str(record.state);
    const amount = Number(record.amount);
    if (!state || !Number.isInteger(amount)) return "uncertain";
    return {
      state,
      refundId: str(record.refund_id) || null,
      refundStatus: str(record.refund_status) || null,
      amount,
      currency: str(record.currency),
      invoiceId: str(record.invoice_id),
      paymentId: str(record.payment_id),
      operationId: str(record.operation_id),
    };
  } catch {
    return "uncertain";
  }
}

/**
 * The DETERMINISTIC rejections `stripe_commercial_reserve_refund` itself
 * raises.
 *
 * Every one of these is a decision the frozen function made and committed to:
 * an over-reservation against the paid allocation, a case that is not approved
 * any more, a spent once-per-plan guarantee, a case/reservation that does not
 * match, an unknown case, a released reservation, or arguments it refuses
 * outright. A caught error carrying one of these is proof that nothing was
 * reserved. A caught error carrying anything else — a socket failure, a timeout,
 * a transport fault before the write — proves NOTHING, and must not be turned
 * into a terminal business refusal.
 */
const RESERVE_REJECTIONS = [
  "stripe_commercial_refund_over_reserved",
  "stripe_commercial_refund_case_spent",
  "stripe_commercial_refund_policy_spent",
  "stripe_commercial_refund_case_mismatch",
  "stripe_commercial_refund_case_unknown",
  "stripe_commercial_refund_released",
  "stripe_commercial_refund_unavailable",
] as const;

function provedReserveRejection(error: unknown): boolean {
  const detail = (error as { detail?: unknown } | null)?.detail;
  if (typeof detail !== "string" || !detail) return false;
  return RESERVE_REJECTIONS.some((code) => detail.includes(code));
}

/** Is this reservation row provably THIS operation's, for exactly the approved
 * terms? Anything less is not evidence. */
function reservationMatches(
  reservation: RefundReservationRow,
  expected: {
    operationId: string;
    invoiceId: string;
    paymentIntentId: string;
    amountMinor: number;
    currency: string;
  },
): boolean {
  return (
    reservation.operationId.toLowerCase() === expected.operationId.toLowerCase() &&
    reservation.invoiceId === expected.invoiceId &&
    reservation.paymentId === expected.paymentIntentId &&
    reservation.amount === expected.amountMinor &&
    reservation.currency === expected.currency.toLowerCase()
  );
}

/**
 * Separate a GENUINE quote rejection from a committed consumption whose
 * acknowledgment was lost.
 *
 * `consume_quote` raises for both, and the RPC wrapper cannot tell them apart.
 * So the exact owner/account/mode-scoped quote is re-read, and ONLY the two
 * conditions this readback can actually PROVE are treated as the refusal:
 *
 *  - another operation already holds `consumed_by` → REAL. That is the exact
 *    single-use violation, recorded by SQL itself;
 *  - the quote is unconsumed and its TTL has provably passed → REAL. The slot
 *    is then released and the operation is closed under its `prepared`
 *    compare-and-set;
 *  - `consumed_by` is exactly this operation and every bound term agrees → the
 *    write COMMITTED and the attempt may continue;
 *  - everything else is UNCERTAIN: an unreadable read, an ABSENT row, a row
 *    whose required fields cannot be read, and a row whose bound terms
 *    disagree. None of those establishes that `consume_quote` rejected this
 *    call rather than committing and losing its acknowledgment, and a refusal
 *    here is terminal — it burns the quote and the operation. Absence in
 *    particular is not proof: this is a recovery read, not the tamper check.
 *    The tamper and binding comparisons that DO refuse are the fresh ones made
 *    before dispatch, against the quote this confirmation claims to be using.
 */
type QuoteResolution = "consumed" | "rejected" | "uncertain";

/**
 * An integer this code may actually rely on.
 *
 * `Number()` reads `null`, `false` and `""` as 0, so a degraded row with an
 * unreadable amount looked like a legitimate ZERO-DUE quote — and a zero-due
 * confirmation is a real case, which is exactly why the two must not be
 * conflated. A JSON number that is an integer is accepted, and so is the
 * decimal string form a bigint arrives as over HTTP; nothing else is.
 */
function readableInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Read a quote's single-use consumption identity, keeping the three facts
 * apart:
 *
 *  - `"unconsumed"` — the property is PRESENT and explicitly `null`. That is
 *    the ONLY supported statement that nothing has consumed this quote: the
 *    column is a nullable uuid, so an unconsumed row says `null`;
 *  - the lower-cased operation UUID — a supported recorded consumer;
 *  - `"unreadable"` — the property is OMITTED, or present as anything that is
 *    neither of those: a non-string, a non-UUID string, and an EMPTY or
 *    whitespace-only string. An omitted property is not a statement that
 *    nothing consumed the quote, a malformed consumer identifies nobody, and an
 *    empty uuid string is not SQL `NULL` — accepting it as one let a degraded
 *    readback with a passed TTL close an unresolved operation `quote_refused`
 *    instead of leaving it recoverable.
 */
function quoteConsumer(quote: Json): string | "unconsumed" | "unreadable" {
  if (!("consumed_by" in quote)) return "unreadable";
  const value = quote.consumed_by;
  if (value === null) return "unconsumed";
  if (typeof value !== "string") return "unreadable";
  const text = value.trim();
  return UUID.test(text) ? text.toLowerCase() : "unreadable";
}

async function resolveQuoteConsumption(input: {
  quoteId: string;
  userId: string;
  accountId: string;
  mode: StripeMode;
  operationId: string;
  subscriptionId: string;
  stateFingerprint: string;
  selectionFingerprint: string;
  currency: string;
  amountDue: number;
  nowMs: number;
}): Promise<QuoteResolution> {
  let quote: Json | null;
  try {
    quote = row(
      await call("stripe_commercial_read_quote", {
        p_quote: input.quoteId,
        p_user: input.userId,
        p_account: input.accountId,
        p_mode: input.mode,
      }),
    );
  } catch {
    return "uncertain";
  }
  // An ABSENT row proves nothing about the write whose response was lost, so it
  // is held for recovery instead of burning a possibly healthy approval.
  if (!quote) return "uncertain";

  // THE WHOLE ROW IS VALIDATED BEFORE ANY VERDICT IS DERIVED FROM IT — in
  // either direction. Reading the consumption identity first and refusing on it
  // meant a malformed consumer, or a valid other consumer on a row whose own
  // bound terms could not be read, closed the operation; and a missing property
  // read as "unconsumed" turned an unreadable row into a definitive expiry
  // refusal. Evidence is either complete and exact, or it is not evidence.
  const consumption = quoteConsumer(quote);
  if (consumption === "unreadable") return "uncertain";
  const amountDue = readableInteger(quote.amount_due);
  const expiresAt = Date.parse(str(quote.expires_at));
  if (
    !str(quote.subscription_id) ||
    !str(quote.state_fingerprint) ||
    !str(quote.selection_fingerprint) ||
    !str(quote.currency) ||
    amountDue === null ||
    !Number.isFinite(expiresAt)
  )
    return "uncertain";
  const bindingsAgree =
    str(quote.subscription_id) === input.subscriptionId &&
    str(quote.state_fingerprint) === input.stateFingerprint &&
    str(quote.selection_fingerprint) === input.selectionFingerprint &&
    str(quote.currency) === input.currency &&
    amountDue === input.amountDue;
  // Bound terms that disagree mean this readback is not evidence about THIS
  // call. Held, not refused.
  if (!bindingsAgree) return "uncertain";
  // ANOTHER operation's consumption, on an otherwise exact and readable row, is
  // the one thing absence cannot be confused with: SQL recorded a different
  // single use of this exact quote.
  if (consumption !== "unconsumed" && consumption !== input.operationId.toLowerCase())
    return "rejected";
  if (consumption !== "unconsumed") return "consumed";
  // Explicitly unconsumed and still bound. A provably passed TTL is the
  // remaining deterministic rejection; otherwise the call should have
  // succeeded, so the absence of a response is uncertainty, not a verdict.
  if (expiresAt <= input.nowMs) return "rejected";
  return "uncertain";
}

/**
 * Confirm a prepared change.
 *
 * The caller echoes the target and the amount it displayed; both are COMPARED
 * with the durable quote in SQL and a mismatch is a tamper refusal. The quote is
 * single-use and bound to the exact item state it was computed from, so a stale,
 * replayed, foreign or altered confirmation cannot dispatch anything.
 *
 * The ORDER below is the recovery contract: the DURABLE context is resolved
 * first, before any current-registry or current-subscription eligibility check
 * that could reject the original prices after a configuration change. A resumed
 * attempt therefore carries the selection the customer actually confirmed, read
 * from the operation's own row — never one rebuilt from today's item ids and
 * today's price configuration.
 */
export async function confirmSubscriptionChange(
  input: {
    userId: string;
    operationId: string;
    quoteId: string;
    mode: StripeMode;
    targetPlanId: PlanId;
    targetSeatQuantity: number;
    expectedAmountMinor: number;
    expectedCurrency: string;
  },
  deps: CommercialDeps = {},
): Promise<ConfirmedChange | Held> {
  if (!UUID.test(input.operationId) || !UUID.test(input.quoteId))
    return { ok: false, reason: "request_invalid" };
  if (!Number.isInteger(input.expectedAmountMinor) || input.expectedAmountMinor < 0)
    return { ok: false, reason: "request_invalid" };
  // LAYER 2 ONLY, deliberately. The authenticated owner, the configured
  // account/mode, the verified key-owning account and the catalogue-FREE
  // authoritative snapshot are everything a recovery may need. Today's price
  // registry and the market are resolved later, and only for a fresh intent —
  // otherwise rotating a catalogue entry would make the durable operation
  // unreachable and leave its slot and the projection gate held forever.
  const resolved = await recoveryContext(input, deps);
  if (!resolved.ok) return resolved;
  const { ctx } = resolved;

  // The bound quote, read WITHOUT consuming it: a resumed operation must learn
  // its terms without re-asserting a state fingerprint its own dispatch may
  // already have changed. A same-operation consumed quote replays from these
  // PERSISTED terms and never from the caller's replacement fields.
  let quote: Json | null;
  try {
    quote = row(
      await call("stripe_commercial_read_quote", {
        p_quote: input.quoteId,
        p_user: input.userId,
        p_account: ctx.accountId,
        p_mode: ctx.mode,
      }),
    );
  } catch {
    return { ok: false, reason: "quote_unavailable" };
  }
  if (!quote) return { ok: false, reason: "quote_unknown" };
  if (str(quote.subscription_id) !== ctx.subscriptionId)
    return { ok: false, reason: "quote_foreign" };
  // The KIND comes from the quote, not from the current state: on a resumed
  // attempt the subscription may already carry the new plan, and re-deriving
  // "plan_change" vs "seat_change" from it would turn a legitimate resume into
  // an operation mismatch.
  const quoteKind = str(quote.kind);
  if (quoteKind !== "plan_change" && quoteKind !== "seat_change")
    return { ok: false, reason: "quote_unreadable" };
  const terms: QuoteTerms = {
    planId: str(quote.target_plan_id) as PlanId,
    seats: Number(quote.target_seat_quantity ?? 0),
    direction: str(quote.direction) as "increase" | "decrease",
    prorationDate: Number(quote.proration_date ?? 0),
    currency: str(quote.currency),
    amountDue: Number(quote.amount_due ?? 0),
    stateFingerprint: str(quote.state_fingerprint),
    selectionFingerprint: str(quote.selection_fingerprint),
    effectiveAt: str(quote.effective_at) || null,
    consumedBy: str(quote.consumed_by) || null,
  };
  if (terms.direction !== "increase" && terms.direction !== "decrease")
    return { ok: false, reason: "quote_unreadable" };
  // What the customer confirmed must be what the quote holds.
  if (
    terms.planId !== input.targetPlanId ||
    terms.seats !== input.targetSeatQuantity ||
    terms.currency !== input.expectedCurrency.toLowerCase() ||
    terms.amountDue !== input.expectedAmountMinor
  )
    return { ok: false, reason: "quote_tampered" };

  const fingerprint = digest({
    mode: ctx.mode,
    quoteId: input.quoteId,
    subscription: ctx.subscriptionId,
    plan: terms.planId,
    seats: terms.seats,
    direction: terms.direction,
    prorationDate: terms.prorationDate,
  });
  const idempotencyKey = `milo-chg:${ctx.accountId}:${ctx.mode}:${input.operationId}`;
  const scope: OperationScope = {
    p_operation: input.operationId,
    p_user: input.userId,
    p_account: ctx.accountId,
    p_mode: ctx.mode,
  };

  // THE DURABLE CONTEXT FIRST. An existing row supplies the ORIGINAL selection,
  // which `begin_operation` requires on every resume and rejects if it differs
  // by a single character.
  const original = await readOriginalOperationTerms(scope);
  if (original === "uncertain") return { ok: false, reason: "operation_uncertain" };

  let target: ChangeTarget;
  /** The FRESH-intent context, built lazily: only a first attempt or a resumed
   * `prepared` operation needs today's catalogue and market. */
  let full: CommercialContext | null = null;
  const freshContext = async (): Promise<{ ok: true; ctx: CommercialContext } | Held> => {
    if (full) return { ok: true, ctx: full };
    const built = await commercialContext(input, deps, ctx);
    if (!built.ok) return built;
    full = built.ctx;
    return built;
  };
  let fresh: Awaited<ReturnType<typeof resolveChangeTarget>> | null = null;
  if (original) {
    if (
      original.kind !== quoteKind ||
      original.subscriptionId !== ctx.subscriptionId ||
      (original.quoteId ?? "").toLowerCase() !== input.quoteId.toLowerCase() ||
      original.idempotencyKey !== idempotencyKey
    )
      return { ok: false, reason: "operation_mismatch" };
    const selection = parseSelectionDetail(original.selectionDetail);
    if (!selection) return { ok: false, reason: "operation_selection_unreadable" };
    const recovered = changeTarget(terms.direction, selection, input.quoteId);
    // The durable selection must be the one the DURABLE QUOTE was priced for.
    // That binding is what makes the recovered item ids, prices and quantities
    // evidence rather than a plausible guess — and it is why a changed registry
    // or a changed item id cannot rewrite the original intent. Note that
    // NOTHING here consults the current catalogue: the prices come from the
    // operation's own row and are proved against the quote's fingerprint.
    if (
      recovered.selectionFingerprint !== terms.selectionFingerprint ||
      selection.targetPlanId !== terms.planId ||
      selection.targetSeatQuantity !== terms.seats
    )
      return { ok: false, reason: "operation_selection_unbound" };
    target = recovered;
  } else {
    // A first attempt: there is no durable selection yet, so it is derived from
    // the authoritative current state against TODAY'S catalogue and PROVED
    // against the quote's own selection fingerprint before anything is created.
    // A refusal here closes nothing, because nothing has been begun.
    const built = await freshContext();
    if (!built.ok) return built;
    fresh = await resolveChangeTarget(
      built.ctx,
      input.userId,
      input.quoteId,
      terms.planId,
      terms.seats,
    );
    if (!fresh.ok) return fresh;
    if (fresh.target.selectionFingerprint !== terms.selectionFingerprint)
      return { ok: false, reason: "quote_selection_changed" };
    target = fresh.target;
  }

  let operation: OperationRow | null;
  try {
    operation = operationRow(
      await call("stripe_commercial_begin_operation", {
        ...scope,
        p_kind: quoteKind,
        p_subscription: ctx.subscriptionId,
        p_fingerprint: fingerprint,
        p_idempotency_key: idempotencyKey,
        p_quote: input.quoteId,
        // Recorded on the FIRST attempt only, and never overwritten: this is
        // the pre-dispatch latest invoice that makes "the exact update invoice"
        // provable on a later attempt.
        p_baseline_invoice: ctx.snapshot.latestInvoiceId,
        // REQUIRED for plan/seat changes at the first begin, and identical on
        // every resume.
        p_selection: target.selectionDetail,
      }),
    );
  } catch {
    // Includes `stripe_commercial_operation_open` (another unresolved operation
    // holds the slot), `stripe_commercial_mismatch`,
    // `stripe_commercial_selection_missing` and
    // `stripe_commercial_attempts_exhausted`.
    return { ok: false, reason: "operation_unavailable" };
  }
  if (!operation) return { ok: false, reason: "operation_unavailable" };
  if (operation.selectionDetail !== target.selectionDetail)
    return { ok: false, reason: "operation_selection_unbound" };

  // A terminal replay stays terminal and is reported accurately.
  if (operation.state === "applied")
    return terms.direction === "increase" ? appliedIncrease(terms) : scheduledReduction(terms);
  if (operation.state === "refused" || operation.state === "failed")
    return { ok: false, reason: `operation_${operation.state}` };

  const step = stepDeps(scope, operation.createdAt, ctx.clock, idempotencyKey);

  // Nothing has been dispatched yet: re-validate the target, RE-CHECK capacity,
  // and consume the quote (which is the SQL check that the item state is still
  // the one priced).
  if (operation.state === "prepared") {
    // Every pre-dispatch refusal asserts `prepared`. That compare-and-set is
    // what stops a stale worker — one that read `prepared`, paused, and then
    // failed a capacity, price or quote check — from closing an operation
    // another instance has meanwhile DISPATCHED.
    const close = async (state: "refused" | "failed", reason: string): Promise<Held> => {
      const closed = await step.finish(state, reason, "prepared");
      if (closed === "stale") return { ok: false, reason: "operation_conflict" };
      if (closed === "uncertain") return { ok: false, reason: "operation_uncertain" };
      return { ok: false, reason };
    };

    // A `prepared` operation has provably dispatched nothing, so it is still a
    // FRESH intent and today's catalogue, market and capacity all apply.
    const built = await freshContext();
    if (!built.ok) return close("refused", built.reason);
    const revalidated =
      fresh ??
      (await resolveChangeTarget(
        built.ctx,
        input.userId,
        input.quoteId,
        terms.planId,
        terms.seats,
      ));
    if (!revalidated.ok) return close("refused", revalidated.reason);
    if (revalidated.target.selectionDetail !== target.selectionDetail)
      return close("refused", "quote_selection_changed");

    // The retention deadline is checked BEFORE the quote is consumed, so an
    // attempt that can no longer be dispatched does not spend the quote. A
    // `prepared` operation has provably never dispatched anything — the advance
    // to `dispatching` happens before every POST — so this is settled `failed`
    // rather than fenced: the slot is released and the customer can simply
    // prepare again, instead of waiting for an operator.
    if (!step.stillRetainable()) {
      const closed = await close("failed", "retention_elapsed_undispatched");
      return closed.reason === "retention_elapsed_undispatched"
        ? { ok: false, reason: "operation_expired" }
        : closed;
    }

    // A quote THIS operation already consumed is not consumed again: an attempt
    // that spent it and then lost its acknowledgment before advancing must
    // still be able to dispatch.
    const stateFingerprint = digest(itemStateFingerprintInput(built.ctx.state));
    if ((terms.consumedBy ?? "").toLowerCase() !== input.operationId.toLowerCase()) {
      try {
        await call("stripe_commercial_consume_quote", {
          p_quote: input.quoteId,
          p_user: input.userId,
          p_account: ctx.accountId,
          p_mode: ctx.mode,
          p_subscription: ctx.subscriptionId,
          p_state_fingerprint: stateFingerprint,
          p_selection_fingerprint: target.selectionFingerprint,
          p_currency: input.expectedCurrency.toLowerCase(),
          p_amount_due: input.expectedAmountMinor,
          p_operation: input.operationId,
        });
      } catch {
        // AMBIGUOUS. `consume_quote` raises for a genuine rejection (expired,
        // already spent by another operation, foreign scope, a stale item
        // state, altered terms) AND for a transport failure whose transaction
        // may already have COMMITTED. Treating both as a definitive refusal
        // permanently closed a valid, already-consumed quote and operation on a
        // lost acknowledgment, with nothing dispatched — so the exact scoped
        // quote is re-read and the two cases are separated on evidence.
        const resolution = await resolveQuoteConsumption({
          quoteId: input.quoteId,
          userId: input.userId,
          accountId: ctx.accountId,
          mode: ctx.mode,
          operationId: input.operationId,
          subscriptionId: ctx.subscriptionId,
          stateFingerprint,
          selectionFingerprint: target.selectionFingerprint,
          currency: input.expectedCurrency.toLowerCase(),
          amountDue: input.expectedAmountMinor,
          nowMs: ctx.clock(),
        });
        if (resolution === "rejected") return close("refused", "quote_refused");
        // The write committed, or nothing can prove it did not: either way this
        // is not a definitive refusal. `consumed` continues; `uncertain` leaves
        // the operation recoverable rather than closing it.
        if (resolution === "uncertain") return { ok: false, reason: "quote_consumption_uncertain" };
        // The deadline is re-taken after the recovery read, before any dispatch.
        if (!step.stillRetainable()) {
          await step.advance("fenced", { expected: "prepared" });
          return { ok: false, reason: "operation_fenced" };
        }
      }
    }

    return terms.direction === "increase"
      ? dispatchIncrease(ctx, scope, target, terms, operation, step)
      : dispatchReduction(ctx, scope, target, terms, operation, step);
  }

  // A RESUMED operation. Recovery follows the CURRENT durable state and never
  // asks for a transition the state machine does not have.
  return terms.direction === "increase"
    ? recoverIncrease(ctx, scope, target, terms, operation, step)
    : recoverReduction(ctx, scope, target, terms, operation, step, true);
}

/**
 * Re-read the authoritative subscription for a SETTLEMENT decision.
 *
 * Deliberately the catalogue-free snapshot: settlement compares the provider's
 * raw item ids, price ids and quantities against the operation's own durable
 * selection, so it must not depend on today's registry still classifying those
 * prices. The strict registry parse stays where it belongs — pricing a fresh
 * intent.
 */
async function readSnapshot(
  ctx: RecoveryContext,
): Promise<{ ok: true; snapshot: CommercialSubscriptionSnapshot } | Held> {
  const read = await readSubscriptionSnapshot(ctx);
  if (!read.ok) return read;
  return { ok: true, snapshot: read.snapshot };
}

/* -------------------------------------------------------------------------- */
/* Increase: record the invoice origin, then prove the exact outcome          */
/* -------------------------------------------------------------------------- */

async function dispatchIncrease(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  step: StepDeps,
): Promise<ConfirmedChange | Held> {
  const moved = await step.advance("dispatching", { expected: "prepared" });
  if (moved === "stale") return { ok: false, reason: "operation_conflict" };
  if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
  return postIncrease(ctx, scope, target, terms, operation, step);
}

/**
 * The single duplicable update POST, and the compare-and-set that records WHERE
 * its invoice came from before any success is declared.
 *
 * The body is rebuilt from the IMMUTABLE selection and the original quote's
 * stable proration date, so this is also the exact retained replay a lost
 * acknowledgment is recovered with: same endpoint, same idempotency key, same
 * encoded parameter multiset, whatever the current registry or period now says.
 */
async function postIncrease(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  step: StepDeps,
): Promise<ConfirmedChange | Held> {
  // Re-read the deadline against a FRESH clock with only synchronous work
  // since: the account verification, the mapping read, the authoritative
  // subscription read, the price reads and every awaited compare-and-set can
  // each cross the boundary.
  if (!step.stillRetainable()) {
    await step.advance("fenced", { expected: "dispatching" });
    return { ok: false, reason: "operation_fenced" };
  }
  let response: Json;
  try {
    response = await stripeProviderCall(
      `subscriptions/${encodeURIComponent(ctx.subscriptionId)}`,
      {
        mode: ctx.mode,
        method: "POST",
        body: increaseUpdateForm(target.selection, terms.prorationDate),
        idempotencyKey: step.idempotencyKey,
      },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    // Unknown outcome. The operation stays `dispatching`, the allowance stays
    // exactly as it was, and a later attempt recovers the origin by replaying
    // this identical request while retention lasts.
    return { ok: false, reason: "change_uncertain" };
  }
  // The POST response is not evidence of the OUTCOME — but it is the only place
  // this update's own invoice identity exists, so its identity is checked
  // before it is believed about anything.
  if (idOf(response.id) !== ctx.subscriptionId) return { ok: false, reason: "update_identity" };
  if (response.livemode !== (ctx.mode === "live")) return { ok: false, reason: "update_mode" };
  if (idOf(response.customer) !== ctx.customerId) return { ok: false, reason: "update_customer" };
  // An expanded invoice object is accepted; only its id is taken.
  const invoiceId = idOf(response.latest_invoice);
  // A supported result that created NO invoice is HELD, not treated as a
  // zero-charge success: the proof of a zero-due change is still a paid
  // invoice, and skipping that proof is exactly how an unproved change used to
  // open the projection gate.
  if (!invoiceId) return { ok: false, reason: "update_invoice_absent" };

  // RECORD THE ORIGIN FIRST, even when the response already says `paid`. The
  // captured id is append-only, so no later attempt can swap which invoice this
  // operation is about and `latest_invoice` can never replace it.
  const captured = await step.advance("awaiting_payment", {
    invoice: invoiceId,
    expected: "dispatching",
  });
  if (captured === "stale")
    // Another instance owns the current state. Recover only the durable winner;
    // never send a newly parameterised request, and never finish from this
    // instance's stale validation. The ORIGINAL response's invoice id is carried
    // in, because this instance is the only place it exists: dropping it stranded
    // an operation whose update had provably landed (see `recoverIncrease`).
    return recoverIncrease(ctx, scope, target, terms, operation, step, invoiceId);
  if (captured === "uncertain") {
    // The capture may have succeeded with a lost acknowledgment. Re-read and
    // require THE SAME invoice id in the state actually reached; a prohibited
    // same-state write is never repeated.
    const durable = await readDurableOperation(scope);
    if (!durable.ok) return durable;
    if (durable.value.invoiceId !== invoiceId)
      return { ok: false, reason: "update_invoice_capture_uncertain" };
    return settleIncrease(
      ctx,
      scope,
      target,
      terms,
      operation,
      invoiceId,
      durable.value.state,
      step,
    );
  }
  return settleIncrease(ctx, scope, target, terms, operation, invoiceId, "awaiting_payment", step);
}

/**
 * Resume an increase from the DURABLE state, with no POST unless an exact
 * retained replay is the only way to learn the invoice identity.
 *
 * A post-dispatch unchanged subscription fingerprint — including past retention
 * — is deliberately NOT used anywhere below. It is UNKNOWN, not proof that
 * nothing was dispatched: a concurrent provider request may still complete, so
 * settling such an attempt `failed` would release the projection gate for a
 * change that then lands.
 */
async function recoverIncrease(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  step: StepDeps,
  /**
   * The invoice id from THIS instance's own successful update response, when it
   * has one. It is not a "current invoice" guess and it is never read from a
   * later subscription: it is the identity the provider returned for the exact
   * request this operation dispatched.
   */
  knownInvoiceId: string | null = null,
): Promise<ConfirmedChange | Held> {
  const durable = await readDurableOperation(scope);
  if (!durable.ok) return durable;
  const { state, invoiceId } = durable.value;
  if (state === "applied") return appliedIncrease(terms);
  if (state === "refused" || state === "failed") return { ok: false, reason: `operation_${state}` };
  if (invoiceId)
    return settleIncrease(ctx, scope, target, terms, operation, invoiceId, state, step);

  // THE ORIGINAL RESPONSE IS NOT LOST BECAUSE ANOTHER INSTANCE MOVED THE ROW.
  //
  // A concurrent recovery that observed `dispatching` may fence this operation
  // while this instance's own POST is still unanswered. When that POST then
  // succeeds, the capture's compare-and-set is legitimately stale — and
  // discarding the response at that point threw away the ONLY existence of this
  // update's invoice identity. Past retention there is no admissible replay, so
  // the operation was left fenced with no invoice and could never be settled by
  // anyone: an update that had really landed became permanently unresolvable.
  //
  // So the known original identity is recorded against the state actually
  // observed, under that state's compare-and-set. It is append-only (a row that
  // already records an invoice keeps it, above), it is this operation's own
  // evidence rather than a plausible `latest_invoice`, it adds no provider call,
  // and it does not reopen or extend anything: the settlement that follows is
  // the same authoritative two-halves proof as always.
  if (knownInvoiceId && (state === "dispatching" || state === "fenced")) {
    const captured = await step.advance("awaiting_payment", {
      invoice: knownInvoiceId,
      expected: state,
    });
    if (captured === "ok")
      return settleIncrease(
        ctx,
        scope,
        target,
        terms,
        operation,
        knownInvoiceId,
        "awaiting_payment",
        step,
      );
    // Stale or unknown: re-read and use whatever the durable row now records,
    // never this instance's assumption about it.
    const again = await readDurableOperation(scope);
    if (!again.ok) return { ok: false, reason: "update_invoice_capture_uncertain" };
    if (again.value.invoiceId)
      return settleIncrease(
        ctx,
        scope,
        target,
        terms,
        operation,
        again.value.invoiceId,
        again.value.state,
        step,
      );
    return { ok: false, reason: "update_invoice_capture_uncertain" };
  }
  if (state === "dispatching" || state === "fenced") {
    // The acknowledgment was lost before the origin could be recorded. The only
    // admissible recovery is an IDENTICAL retained replay whose body is
    // reconstructed entirely from durable evidence. Past retention the slot and
    // the gate stay held for an operator.
    if (!step.stillRetainable()) {
      if (state === "dispatching") await step.advance("fenced", { expected: "dispatching" });
      return { ok: false, reason: "update_ack_unrecoverable" };
    }
    if (state === "fenced") {
      const reopened = await step.advance("dispatching", { expected: "fenced" });
      if (reopened === "stale") return { ok: false, reason: "operation_conflict" };
      if (reopened === "uncertain") return { ok: false, reason: "operation_uncertain" };
    }
    return postIncrease(ctx, scope, target, terms, operation, step);
  }
  // `awaiting_payment` or `awaiting_apply` with NO captured invoice is an
  // inconsistent row: provenance cannot be inferred from a later subscription
  // read, so it is held for an operator rather than settled from a plausible
  // `latest_invoice`.
  return { ok: false, reason: "update_invoice_provenance_missing" };
}

/**
 * Settle an increase from AUTHORITATIVE reads only.
 *
 * Both halves are mandatory and independent of the POST:
 *
 *  - the EXACT CAPTURED invoice — not an arbitrary `latest_invoice`, not any
 *    invoice that merely differs from the baseline — must be this
 *    subscription's, in this currency, raised by `subscription_update`,
 *    authoritatively paid, with nothing remaining and for exactly the quoted
 *    amount. An unrelated renewal fails that, and so does a zero-due quote with
 *    no paid invoice;
 *  - the subscription must carry EXACTLY the confirmed selection: the same base
 *    item at the same price with quantity 1, the same seat item at the same
 *    price and quantity, a removed seat actually removed and a single added
 *    seat actually added. Equal plan and seat COUNTS are not proof.
 */
async function settleIncrease(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  invoiceId: string,
  currentState: string,
  step: StepDeps,
): Promise<ConfirmedChange | Held> {
  const after = await readSnapshot(ctx);
  if (!after.ok) return after;
  const applied = appliedSelectionMatches({
    snapshot: after.snapshot,
    selection: target.selection,
  });

  let raw: Json;
  try {
    raw = await stripeProviderCall(
      `invoices/${encodeURIComponent(invoiceId)}`,
      { mode: ctx.mode, method: "GET" },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "invoice_read_failed" };
  }
  const identity = readUpdateInvoiceIdentity({
    raw,
    mode: ctx.mode,
    customerId: ctx.customerId,
    subscriptionId: ctx.subscriptionId,
    expectedInvoiceId: invoiceId,
    expectedCurrency: terms.currency,
    baselineInvoiceId: operation.baselineInvoiceId,
  });
  if (!identity.ok) return { ok: false, reason: `change_${identity.reason}` };
  const evidence = invoicePaymentEvidence({
    invoice: raw,
    mode: ctx.mode,
    customerId: ctx.customerId,
    subscriptionId: ctx.subscriptionId,
  });
  const settled = evidence.state === "paid" && identity.value.amountRemainingMinor === 0;
  // Even a ZERO-due quote needs this: the proof is a paid invoice for exactly
  // the quoted amount, never the absence of a charge.
  if (settled && identity.value.amountPaidMinor !== terms.amountDue)
    return { ok: false, reason: "change_invoice_amount_unexpected" };

  let state = currentState;
  if (!settled) {
    // A fenced row may take the documented `fenced -> awaiting_payment` edge now
    // that the exact invoice is proved to be this operation's.
    if (state === "fenced") {
      const moved = await step.advance("awaiting_payment", {
        invoice: invoiceId,
        expected: "fenced",
      });
      if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
      if (moved === "ok") state = "awaiting_payment";
    }
    // `awaiting_payment` with the payment still pending only READS and RETURNS
    // pending: there is no same-state transition, and `awaiting_apply` never
    // regresses to `awaiting_payment`.
    return { ok: false, reason: `change_invoice_${evidence.state}` };
  }
  if (!applied.ok) {
    // The payment is proved and the item application is not — SCA settled
    // asynchronously, or a provider-side application still in flight. The
    // previously verified allowance stands, and the SQL projection gate keeps it
    // standing.
    if (state === "awaiting_payment" || state === "fenced") {
      const moved = await step.advance("awaiting_apply", {
        invoice: invoiceId,
        expected: state,
      });
      if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
      if (moved === "ok") state = "awaiting_apply";
    }
    return {
      ok: false,
      reason:
        after.snapshot.pendingUpdate === "present"
          ? "change_requires_payment"
          : `change_not_applied_${applied.reason}`,
    };
  }

  // Both proofs hold. `finish` asserts the state actually reached.
  const closed = await step.finish("applied", null, state);
  if (closed !== "ok") {
    // A false or thrown finish is NOT success. Re-read the exact scoped durable
    // outcome; if that cannot be read either, report recoverable uncertainty.
    const again = await readDurableOperation(scope);
    if (again.ok && again.value.state === "applied") return appliedIncrease(terms);
    return { ok: false, reason: "change_settlement_uncertain" };
  }
  return appliedIncrease(terms);
}

/* -------------------------------------------------------------------------- */
/* Reduction: adopt, capture the terms durably, then apply the phases          */
/* -------------------------------------------------------------------------- */

/**
 * Dispatch a REDUCTION as two separate durable steps.
 *
 * `from_subscription` cannot be combined with phase modifications in one
 * request, so adoption and the phase update are distinct provider calls with
 * distinct idempotency keys. BETWEEN them, the complete canonical phase
 * request, the validated ORIGINAL settings, the fixed effective boundary and
 * the target are persisted ATOMICALLY with the adopted schedule id, under an
 * explicit `dispatching -> awaiting_apply` compare-and-set, BEFORE the first
 * `:phases` POST.
 *
 * That durable document is then the only body any first or permitted retry may
 * send, and the only expectation any read-back is verified against. The current
 * registry, the current period and a later GET may not redefine the body, the
 * start, the settings or the prices. `proration_behavior` is `none` at BOTH the
 * request level and the phase level — they are different settings, and only one
 * of them being right would still charge or credit.
 */
async function dispatchReduction(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  step: StepDeps,
): Promise<ConfirmedChange | Held> {
  const moved = await step.advance("dispatching", { expected: "prepared" });
  if (moved === "stale") return { ok: false, reason: "operation_conflict" };
  if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
  return adoptAndCapture(ctx, scope, target, terms, operation, step, "dispatching", null);
}

/**
 * Resume a reduction from the DURABLE state.
 *
 * A stored payload is authoritative: it is validated against this operation and
 * then used verbatim. Without one, the adoption itself is unproved — and a
 * latest-schedule GET is NOT original-phase evidence, because it cannot show
 * what the ORIGINAL phase carried — so the only admissible recovery is a
 * strictly retained identical `:adopt` replay.
 */
async function recoverReduction(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  step: StepDeps,
  mayAdopt: boolean,
): Promise<ConfirmedChange | Held> {
  const durable = await readDurableOperation(scope);
  if (!durable.ok) return durable;
  const { state, scheduleId, reductionPayload } = durable.value;
  if (state === "applied") return scheduledReduction(terms);
  if (state === "refused" || state === "failed") return { ok: false, reason: `operation_${state}` };

  if (reductionPayload !== null && reductionPayload !== undefined) {
    const parsed = parseStoredReductionPayload({
      stored: reductionPayload,
      operationId: scope.p_operation,
      quoteId: target.quoteId,
      scheduleId,
      subscriptionId: ctx.subscriptionId,
      selectionDetail: target.selectionDetail,
      effectiveBoundary: terms.prorationDate,
    });
    if (!parsed.ok) return { ok: false, reason: `reduction_${parsed.reason}` };
    return applyStoredPhases(ctx, scope, terms, parsed.payload, state, step, false);
  }
  if (state === "dispatching" || state === "fenced") {
    if (!mayAdopt) return { ok: false, reason: "reduction_payload_missing" };
    if (!step.stillRetainable()) {
      if (state === "dispatching")
        await step.advance("fenced", { schedule: scheduleId, expected: "dispatching" });
      // An unchanged subscription, or no schedule at all, does NOT prove the
      // adoption had no effect — a provider mutation may still be in flight —
      // so the slot and the projection gate stay held.
      return { ok: false, reason: "schedule_adopt_unrecoverable" };
    }
    return adoptAndCapture(ctx, scope, target, terms, operation, step, state, scheduleId);
  }
  // `awaiting_apply` without a payload cannot be reached through the RPCs, and
  // an operation with no durable evidence of WHAT it sent is never treated as
  // dispatched.
  return { ok: false, reason: "reduction_payload_missing" };
}

async function adoptAndCapture(
  ctx: RecoveryContext,
  scope: OperationScope,
  target: ChangeTarget,
  terms: QuoteTerms,
  operation: OperationRow,
  step: StepDeps,
  observedState: string,
  recordedScheduleId: string | null,
): Promise<ConfirmedChange | Held> {
  if (observedState === "fenced") {
    const reopened = await step.advance("dispatching", {
      expected: "fenced",
      schedule: recordedScheduleId,
    });
    if (reopened === "stale") return { ok: false, reason: "operation_conflict" };
    if (reopened === "uncertain") return { ok: false, reason: "operation_uncertain" };
  }
  // BOTH guards, re-taken against a fresh clock immediately before the POST.
  if (!step.stillRetainable()) {
    await step.advance("fenced", { expected: "dispatching", schedule: recordedScheduleId });
    return { ok: false, reason: "operation_fenced" };
  }
  // A missed effective boundary is never moved to a new date and never
  // authorises a late reduction.
  if (terms.prorationDate <= Math.floor(ctx.clock() / 1000)) {
    await step.advance("fenced", { expected: "dispatching", schedule: recordedScheduleId });
    return { ok: false, reason: "reduction_boundary_elapsed" };
  }
  // An existing schedule the packet did not create is a conflict for review,
  // never something to overwrite — but that judgement needs DURABLE knowledge.
  // On a FIRST dispatch `resolveChangeTarget` has already refused an attached
  // schedule. On a RESUMED attempt the attached schedule may well be this
  // operation's own adoption whose acknowledgment was lost, and a GET cannot
  // tell the two apart: only the retained identical `:adopt` replay can, and
  // the id IT returns is the only schedule this operation will ever send phases
  // to. So a conflict is raised here only against a schedule id this operation
  // itself recorded.
  if (
    ctx.snapshot.scheduleId &&
    recordedScheduleId &&
    ctx.snapshot.scheduleId !== recordedScheduleId
  )
    return { ok: false, reason: "schedule_conflict" };

  let created: Json;
  try {
    created = await stripeProviderCall(
      "subscription_schedules",
      {
        mode: ctx.mode,
        method: "POST",
        body: adoptionForm(ctx.subscriptionId),
        idempotencyKey: `${step.idempotencyKey}:adopt`,
      },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "schedule_adopt_uncertain" };
  }
  // The ORIGINAL reply, validated BEFORE anything is normalised away: identity,
  // every material source setting and the paid phase's own item terms. A known
  // unsupported setting HOLDS even when a current read would look ordinary, and
  // an unknown new material setting HOLDS too.
  const adoption = readAdoptedScheduleProfile({
    raw: created,
    mode: ctx.mode,
    subscriptionId: ctx.subscriptionId,
    customerId: ctx.customerId,
    currency: terms.currency,
  });
  if (!adoption.ok) return { ok: false, reason: `reduction_${adoption.reason}` };
  if (recordedScheduleId && adoption.value.scheduleId !== recordedScheduleId)
    return { ok: false, reason: "reduction_schedule_identity" };

  const built = buildReductionPayload({
    operationId: scope.p_operation,
    quoteId: target.quoteId,
    subscriptionId: ctx.subscriptionId,
    selection: target.selection,
    selectionDetail: target.selectionDetail,
    effectiveBoundary: terms.prorationDate,
    adoption: adoption.value,
  });
  if (!built.ok) return { ok: false, reason: `reduction_${built.reason}` };

  const captured = await step.advance("awaiting_apply", {
    schedule: adoption.value.scheduleId,
    payload: built.payload,
    expected: "dispatching",
  });
  if (captured === "stale")
    // A COMPARE-AND-SET LOSER MAY NOT POST ITS OWN CANDIDATE. Only the durable
    // winner's stored body may be sent, so recovery re-reads and never re-adopts.
    return recoverReduction(ctx, scope, target, terms, operation, step, false);
  if (captured === "uncertain") {
    // Lost persistence acknowledgment: resolved by an EXACT scoped readback of
    // the schedule and the payload, before any POST.
    const durable = await readDurableOperation(scope);
    if (!durable.ok) return durable;
    if (durable.value.scheduleId !== adoption.value.scheduleId)
      return { ok: false, reason: "reduction_capture_uncertain" };
    const parsed = parseStoredReductionPayload({
      stored: durable.value.reductionPayload,
      operationId: scope.p_operation,
      quoteId: target.quoteId,
      scheduleId: durable.value.scheduleId,
      subscriptionId: ctx.subscriptionId,
      selectionDetail: target.selectionDetail,
      effectiveBoundary: terms.prorationDate,
    });
    if (!parsed.ok) return { ok: false, reason: "reduction_capture_uncertain" };
    if (!reductionPayloadEqual(parsed.payload, built.payload))
      return { ok: false, reason: "reduction_payload_conflict" };
    return applyStoredPhases(ctx, scope, terms, parsed.payload, durable.value.state, step, false);
  }
  return applyStoredPhases(ctx, scope, terms, built.payload, "awaiting_apply", step, true);
}

/**
 * Send and verify the phase update using ONLY the stored payload.
 *
 * `dispatchFirst` is true exactly once — in the attempt that just captured the
 * terms, where the schedule provably still carries only its single adopted
 * phase. Every RESUMED attempt verifies FIRST, which is what lets a completed
 * update whose acknowledgment was lost complete READ-ONLY, with zero POST,
 * after a process restart, a period rollover and the expiry of idempotency
 * retention.
 */
async function applyStoredPhases(
  ctx: RecoveryContext,
  scope: OperationScope,
  terms: QuoteTerms,
  payload: ReductionDispatchPayload,
  durableState: string,
  step: StepDeps,
  dispatchFirst: boolean,
): Promise<ConfirmedChange | Held> {
  if (dispatchFirst) {
    const sent = await sendReductionPhases(ctx, payload, step);
    if (sent) {
      if (sent.reason !== "schedule_update_uncertain")
        await step.advance("fenced", { schedule: payload.scheduleId, expected: durableState });
      return sent;
    }
    return verifyReduction(ctx, scope, terms, payload, durableState, step, false);
  }
  return verifyReduction(ctx, scope, terms, payload, durableState, step, true);
}

/** The `:phases` POST. Returns a Held when it must not be sent or did not
 * complete, and `null` when it was sent successfully. */
async function sendReductionPhases(
  ctx: RecoveryContext,
  payload: ReductionDispatchPayload,
  step: StepDeps,
): Promise<Held | null> {
  // BOTH guards immediately before the duplicable POST, re-taken after every
  // awaited compare-and-set and read.
  if (!step.stillRetainable()) return { ok: false, reason: "operation_fenced" };
  if (payload.effectiveBoundary <= Math.floor(ctx.clock() / 1000))
    return { ok: false, reason: "reduction_boundary_elapsed" };
  try {
    await stripeProviderCall(
      `subscription_schedules/${encodeURIComponent(payload.scheduleId)}`,
      {
        mode: ctx.mode,
        method: "POST",
        body: reductionPhasesForm(payload),
        idempotencyKey: `${step.idempotencyKey}:phases`,
      },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "schedule_update_uncertain" };
  }
  return null;
}

/**
 * Settle a reduction by reading the schedule back and verifying it against the
 * STORED ORIGINAL TERMS — both phases, their boundaries, their items and their
 * material settings. `release` preserves the subscription; finite phases do not
 * imply a cancellation and are not treated as one.
 */
async function verifyReduction(
  ctx: RecoveryContext,
  scope: OperationScope,
  terms: QuoteTerms,
  payload: ReductionDispatchPayload,
  durableState: string,
  step: StepDeps,
  mayDispatch: boolean,
): Promise<ConfirmedChange | Held> {
  let raw: Json;
  try {
    raw = await stripeProviderCall(
      `subscription_schedules/${encodeURIComponent(payload.scheduleId)}`,
      { mode: ctx.mode, method: "GET" },
      ctx.config,
      ctx.fetchImpl,
    );
  } catch {
    return { ok: false, reason: "schedule_read_failed" };
  }
  const schedule = readSubscriptionSchedule({
    raw,
    mode: ctx.mode,
    subscriptionId: payload.subscriptionId,
    customerId: ctx.customerId,
  });
  if (!schedule.ok) return { ok: false, reason: `schedule_${schedule.reason}` };
  const matches = scheduleMatchesReduction({ schedule: schedule.value, payload });
  if (matches.ok) {
    const closed = await step.finish("applied", null, durableState);
    if (closed !== "ok") {
      const again = await readDurableOperation(scope);
      if (again.ok && again.value.state === "applied") return scheduledReduction(terms);
      return { ok: false, reason: "reduction_settlement_uncertain" };
    }
    return scheduledReduction(terms);
  }
  if (mayDispatch) {
    // Retention and the original boundary are re-taken HERE, after the awaited
    // read: crossing either means ZERO POST. The reported reason is still the
    // actual finding — what the schedule does not say — because that is what an
    // operator needs; the slot simply stays held either way.
    if (!step.stillRetainable() || payload.effectiveBoundary <= Math.floor(ctx.clock() / 1000)) {
      await step.advance("fenced", { schedule: payload.scheduleId, expected: durableState });
      return { ok: false, reason: `schedule_${matches.reason}` };
    }
    const sent = await sendReductionPhases(ctx, payload, step);
    if (sent) {
      if (sent.reason !== "schedule_update_uncertain")
        await step.advance("fenced", { schedule: payload.scheduleId, expected: durableState });
      return sent;
    }
    return verifyReduction(ctx, scope, terms, payload, durableState, step, false);
  }
  if (!step.stillRetainable())
    // Past retention an unmatched snapshot still does not prove "no effect": a
    // dispatched phase update may yet land, so this is fenced for an operator,
    // never failed and never released.
    await step.advance("fenced", { schedule: payload.scheduleId, expected: durableState });
  return { ok: false, reason: `schedule_${matches.reason}` };
}

/* -------------------------------------------------------------------------- */
/* Cancellation and reversal                                                  */
/* -------------------------------------------------------------------------- */

export interface CancellationResult {
  ok: true;
  cancelAtPeriodEnd: boolean;
  effectiveAt: string | null;
  operationId: string;
  note: string;
}

/**
 * Schedule cancellation at the AUTHORITATIVE current period end.
 *
 * Access keeps following the paid period: nothing here writes an entitlement.
 * Only the webhook projection, from an authoritative `canceled` status, may
 * revoke, exactly as the accepted foundation already does.
 *
 * THE DURABLE OPERATION IS RESOLVED FIRST. Returning success straight from the
 * provider's current `cancel_at_period_end` flag used to strand the operation:
 * a lost acknowledgment left it `dispatching`, holding the owner's single slot
 * and the projection gate forever while the caller was told the cancellation
 * was done. The flag is still what the outcome is proved from — but only after
 * this operation has been read and settled.
 */
export async function requestSubscriptionCancellation(
  input: { userId: string; operationId: string; mode: StripeMode },
  deps: CommercialDeps = {},
): Promise<CancellationResult | Held> {
  if (!UUID.test(input.operationId)) return { ok: false, reason: "request_invalid" };
  // Cancellation prices nothing, so it needs no catalogue and no market: the
  // authority layer plus the catalogue-free snapshot is exactly its evidence.
  // Requiring today's registry here would also let a rotated price veto a
  // terminal replay of an already applied cancellation.
  const resolved = await recoveryContext(input, deps);
  if (!resolved.ok) return resolved;
  const { ctx } = resolved;

  const scope: OperationScope = {
    p_operation: input.operationId,
    p_user: input.userId,
    p_account: ctx.accountId,
    p_mode: ctx.mode,
  };
  const idempotencyKey = `milo-can:${ctx.accountId}:${ctx.mode}:${input.operationId}`;
  let operation: OperationRow | null;
  try {
    operation = operationRow(
      await call("stripe_commercial_begin_operation", {
        ...scope,
        p_kind: "cancel",
        p_subscription: ctx.subscriptionId,
        p_fingerprint: digest({ kind: "cancel", subscription: ctx.subscriptionId }),
        p_idempotency_key: idempotencyKey,
      }),
    );
  } catch {
    return { ok: false, reason: "operation_unavailable" };
  }
  if (!operation) return { ok: false, reason: "operation_unavailable" };
  const applied = (snapshot: CommercialSubscriptionSnapshot): CancellationResult => ({
    ok: true,
    cancelAtPeriodEnd: true,
    effectiveAt: new Date(snapshot.currentPeriodEnd * 1000).toISOString(),
    operationId: input.operationId,
    note: "Your plan stays active until the end of the period you have paid for and then stops. You will not be charged again.",
  });
  // A terminal replay is reported accurately and stays terminal.
  if (operation.state === "applied") {
    if (!ctx.snapshot.cancelAtPeriodEnd)
      // The operation says applied and the provider says otherwise: something
      // reversed it, and this call does not re-cancel on that basis.
      return { ok: false, reason: "cancellation_reversed" };
    return applied(ctx.snapshot);
  }
  if (operation.state === "refused" || operation.state === "failed")
    return { ok: false, reason: `operation_${operation.state}` };

  const step = stepDeps(scope, operation.createdAt, ctx.clock, idempotencyKey);

  // The flag is ALREADY set and this operation is still open. Which of the two
  // it is depends entirely on the DURABLE state, not on the flag:
  //  - `prepared` means this operation provably never dispatched anything, so
  //    the cancellation is somebody else's (or an earlier operation's) and this
  //    one is refused rather than credited with it;
  //  - `dispatching`/`fenced` means our own POST may well have landed and lost
  //    its acknowledgment, so the flag IS our evidence and the operation is
  //    settled from it.
  if (ctx.snapshot.cancelAtPeriodEnd && operation.state === "prepared") {
    const closed = await step.finish("refused", "cancellation_preexisting", "prepared");
    if (closed === "stale") return { ok: false, reason: "operation_conflict" };
    if (closed === "uncertain") return { ok: false, reason: "operation_uncertain" };
    return { ok: false, reason: "cancellation_preexisting" };
  }

  if (!ctx.snapshot.cancelAtPeriodEnd) {
    if (operation.state === "prepared" || operation.state === "fenced") {
      const moved = await step.advance("dispatching", { expected: operation.state });
      if (moved === "stale") return { ok: false, reason: "operation_conflict" };
      if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
    }
    // The retention deadline is re-taken against a fresh clock immediately
    // before the duplicable POST.
    if (!step.stillRetainable()) {
      await step.advance("fenced", { expected: "dispatching" });
      return { ok: false, reason: "operation_fenced" };
    }
    try {
      await stripeProviderCall(
        `subscriptions/${encodeURIComponent(ctx.subscriptionId)}`,
        {
          mode: ctx.mode,
          method: "POST",
          body: new URLSearchParams({ cancel_at_period_end: "true" }),
          idempotencyKey,
        },
        ctx.config,
        ctx.fetchImpl,
      );
    } catch {
      // Unknown outcome: the operation stays open and a later attempt settles
      // it from an authoritative read or an identical retained replay.
      return { ok: false, reason: "cancellation_uncertain" };
    }
  }

  const after = await readSnapshot(ctx);
  if (!after.ok) return after;
  if (!after.snapshot.cancelAtPeriodEnd) return { ok: false, reason: "cancellation_not_applied" };
  // The state actually reached is re-read, because the advance above may have
  // been won by another instance.
  const durable = await readDurableOperation(scope);
  if (!durable.ok) return durable;
  if (durable.value.state === "applied") return applied(after.snapshot);
  if (durable.value.state === "refused" || durable.value.state === "failed")
    return { ok: false, reason: `operation_${durable.value.state}` };
  const closed = await step.finish("applied", null, durable.value.state);
  if (closed !== "ok") {
    const again = await readDurableOperation(scope);
    if (again.ok && again.value.state === "applied") return applied(after.snapshot);
    // A false or thrown finish is never success: the cancellation is at the
    // provider but this operation is not settled, which is recoverable
    // uncertainty rather than a completed operation.
    return { ok: false, reason: "cancellation_settlement_uncertain" };
  }
  return applied(after.snapshot);
}

/**
 * Reverse a cancellation this caller actually made, before it takes effect.
 *
 * The reversal is bound in SQL to an APPLIED cancel operation for this exact
 * owner, account, mode and subscription, and one cancellation can be reversed at
 * most once. A subscription the provider already shows as `canceled` is NOT
 * recreated: that is refused outright, and no entitlement is reset here.
 *
 * As with the cancellation, the DURABLE OPERATION IS RESOLVED FIRST. Returning
 * `cancellation_absent` straight from the provider's flag used to report a
 * false failure for a reversal that had ALREADY succeeded and merely lost its
 * acknowledgment, leaving the operation open forever. An absent flag is now
 * read against the durable state: with nothing dispatched it genuinely means
 * "there is no cancellation to reverse"; after a dispatch it is this
 * operation's own evidence of success.
 */
export async function reverseSubscriptionCancellation(
  input: { userId: string; operationId: string; cancelOperationId: string; mode: StripeMode },
  deps: CommercialDeps = {},
): Promise<CancellationResult | Held> {
  if (!UUID.test(input.operationId) || !UUID.test(input.cancelOperationId))
    return { ok: false, reason: "request_invalid" };
  // Catalogue-free, for the same reason as the cancellation: a reversal prices
  // nothing, and a rotated price must not veto a terminal replay.
  const resolved = await recoveryContext(input, deps);
  if (!resolved.ok) return resolved;
  const { ctx } = resolved;
  // A subscription that is already over cannot be reversed, only bought again.
  // Nothing here recreates a cancelled subscription.
  if (ctx.snapshot.status === "canceled" || ctx.snapshot.status === "incomplete_expired")
    return { ok: false, reason: "subscription_canceled_irreversible" };

  const scope: OperationScope = {
    p_operation: input.operationId,
    p_user: input.userId,
    p_account: ctx.accountId,
    p_mode: ctx.mode,
  };
  const idempotencyKey = `milo-rev:${ctx.accountId}:${ctx.mode}:${input.operationId}`;
  let operation: OperationRow | null;
  try {
    operation = operationRow(
      await call("stripe_commercial_begin_operation", {
        ...scope,
        p_kind: "reverse_cancel",
        p_subscription: ctx.subscriptionId,
        p_fingerprint: digest({
          kind: "reverse_cancel",
          subscription: ctx.subscriptionId,
          reverses: input.cancelOperationId,
        }),
        p_idempotency_key: idempotencyKey,
        p_reverses: input.cancelOperationId,
      }),
    );
  } catch {
    // Includes `stripe_commercial_reversal_target_invalid`: the named
    // cancellation is not an APPLIED cancellation this owner made on this exact
    // subscription. A caller-supplied id can never manufacture one.
    return { ok: false, reason: "reversal_unavailable" };
  }
  if (!operation) return { ok: false, reason: "reversal_unavailable" };
  const reversed = (snapshot: CommercialSubscriptionSnapshot): CancellationResult => ({
    ok: true,
    cancelAtPeriodEnd: false,
    effectiveAt: new Date(snapshot.currentPeriodEnd * 1000).toISOString(),
    operationId: input.operationId,
    note: "The cancellation has been withdrawn and the subscription will renew as before.",
  });
  if (operation.state === "applied") {
    if (ctx.snapshot.cancelAtPeriodEnd) return { ok: false, reason: "cancellation_recreated" };
    return reversed(ctx.snapshot);
  }
  if (operation.state === "refused" || operation.state === "failed")
    return { ok: false, reason: `operation_${operation.state}` };

  const step = stepDeps(scope, operation.createdAt, ctx.clock, idempotencyKey);

  // Nothing dispatched and no cancellation present: there is genuinely nothing
  // to reverse, which is a refusal of THIS operation rather than a strand.
  if (!ctx.snapshot.cancelAtPeriodEnd && operation.state === "prepared") {
    const closed = await step.finish("refused", "cancellation_absent", "prepared");
    if (closed === "stale") return { ok: false, reason: "operation_conflict" };
    if (closed === "uncertain") return { ok: false, reason: "operation_uncertain" };
    return { ok: false, reason: "cancellation_absent" };
  }

  if (ctx.snapshot.cancelAtPeriodEnd) {
    if (operation.state === "prepared" || operation.state === "fenced") {
      const moved = await step.advance("dispatching", { expected: operation.state });
      if (moved === "stale") return { ok: false, reason: "operation_conflict" };
      if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
    }
    if (!step.stillRetainable()) {
      await step.advance("fenced", { expected: "dispatching" });
      return { ok: false, reason: "operation_fenced" };
    }
    try {
      await stripeProviderCall(
        `subscriptions/${encodeURIComponent(ctx.subscriptionId)}`,
        {
          mode: ctx.mode,
          method: "POST",
          body: new URLSearchParams({ cancel_at_period_end: "false" }),
          idempotencyKey,
        },
        ctx.config,
        ctx.fetchImpl,
      );
    } catch {
      return { ok: false, reason: "reversal_uncertain" };
    }
  }

  const after = await readSnapshot(ctx);
  if (!after.ok) return after;
  if (after.snapshot.cancelAtPeriodEnd) return { ok: false, reason: "reversal_not_applied" };
  const durable = await readDurableOperation(scope);
  if (!durable.ok) return durable;
  if (durable.value.state === "applied") return reversed(after.snapshot);
  if (durable.value.state === "refused" || durable.value.state === "failed")
    return { ok: false, reason: `operation_${durable.value.state}` };
  const closed = await step.finish("applied", null, durable.value.state);
  if (closed !== "ok") {
    const again = await readDurableOperation(scope);
    if (again.ok && again.value.state === "applied") return reversed(after.snapshot);
    return { ok: false, reason: "reversal_settlement_uncertain" };
  }
  return reversed(after.snapshot);
}

/* -------------------------------------------------------------------------- */
/* Operator-approved support refunds (service-only)                           */
/* -------------------------------------------------------------------------- */

/**
 * Record a trusted operator's refund approval.
 *
 * SERVICE-ONLY. There is no caller endpoint for this and no "approved" flag an
 * end user could set: the durable row IS the approval, and it must carry the
 * actor, the case id, the amount and currency, the policy basis, the original
 * request time and BOTH dispositions. The database CHECK constraints refuse a
 * missing or unrecognised basis or disposition, so neither can be inferred.
 *
 * No external support message is sent from here.
 */
export async function recordApprovedRefundCase(
  input: {
    caseId: string;
    userId: string;
    mode: StripeMode;
    invoiceId: string;
    subscriptionId: string | null;
    planId: PlanId;
    amountMinor: number;
    currency: string;
    policyBasis: RefundPolicyBasis;
    subscriptionDisposition: string;
    accessDisposition: string;
    operatorActor: string;
    requestedAtMs: number;
  },
  deps: CommercialDeps = {},
): Promise<{ ok: true; state: string } | Held> {
  if (input.mode === "live") return { ok: false, reason: "live_refund_held" };
  const config = stripeLifecycleConfig(deps.env ?? process.env);
  if (!UUID.test(input.userId) || !input.caseId.trim() || !input.operatorActor.trim())
    return { ok: false, reason: "request_invalid" };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)
    return { ok: false, reason: "amount_invalid" };
  if (!Number.isFinite(input.requestedAtMs) || input.requestedAtMs <= 0)
    return { ok: false, reason: "requested_at_invalid" };
  const disposition = dispositionSupported({
    subscription: input.subscriptionDisposition,
    access: input.accessDisposition,
  });
  // A disposition this packet cannot honour is still RECORDED faithfully (so an
  // operator's decision is not lost) but can never be executed; a missing or
  // unrecognised one is refused outright here.
  if (
    !disposition.ok &&
    (disposition.reason === "subscription_disposition_missing" ||
      disposition.reason === "access_disposition_missing")
  )
    return { ok: false, reason: disposition.reason };

  try {
    const state = await call("stripe_commercial_record_refund_case", {
      p_case: input.caseId.trim(),
      p_user: input.userId,
      p_account: config.accountIds[input.mode],
      p_mode: input.mode,
      p_invoice: input.invoiceId.trim(),
      p_subscription: input.subscriptionId,
      p_plan: input.planId,
      p_amount: input.amountMinor,
      p_currency: input.currency.toLowerCase(),
      p_basis: input.policyBasis,
      p_subscription_disposition: input.subscriptionDisposition,
      p_access_disposition: input.accessDisposition,
      p_actor: input.operatorActor.trim(),
      p_requested_at: new Date(input.requestedAtMs).toISOString(),
    });
    return { ok: true, state: str(state) || "approved" };
  } catch {
    return { ok: false, reason: "refund_case_unavailable" };
  }
}

export interface RefundOutcome {
  ok: true;
  state: "succeeded" | "pending" | "requires_action" | "unknown";
  refundedMinor: number;
  currency: string;
  /** The approved case's dispositions, reported back unchanged. A refund never
   * performs them: a cancellation is a SEPARATE explicit operation and access
   * is unchanged by this call. */
  subscriptionDisposition: string;
  accessDisposition: string;
  responseCopy: string;
  settlementCopy: string;
}

/**
 * Execute an operator-approved support refund.
 *
 * SERVICE-ONLY: no server function exposes this, and the caller must pass the
 * trusted operator actor, which is compared with the one recorded on the
 * durable approval. Nothing an end user can send reaches this path.
 *
 * Evidence requirements, all mandatory:
 *  - the invoice is this owner's, in this mode, for this subscription, and paid;
 *  - exactly ONE paid InvoicePayment links it to exactly ONE succeeded
 *    PaymentIntent, and that payment's received total equals the allocation to
 *    this invoice (otherwise another invoice's money is in the same payment and
 *    the case is HELD);
 *  - a COMPLETE refund list bounds the amount by the funds actually remaining,
 *    counting pending, requires_action, succeeded and every unknown outcome;
 *  - the published policy allows it, from the authoritative first-payment time
 *    and the recorded case request time.
 *
 * No entitlement is written, no cancellation is performed, no access is granted
 * or revoked, and no message is sent.
 */
export async function executeApprovedRefund(
  input: { caseId: string; operationId: string; mode: StripeMode; operatorActor: string },
  deps: CommercialDeps = {},
): Promise<RefundOutcome | Held> {
  if (input.mode === "live") return { ok: false, reason: "live_refund_held" };
  if (!UUID.test(input.operationId) || !input.caseId.trim())
    return { ok: false, reason: "request_invalid" };
  const config = stripeLifecycleConfig(deps.env ?? process.env);
  if (!config.checkoutReady(input.mode)) return { ok: false, reason: "not_configured" };
  const accountId = config.accountIds[input.mode];
  const fetchImpl = deps.fetch ?? fetch;
  const clock = stripeClockFrom(deps.now);

  let approved: Json | null;
  try {
    approved = row(
      await call("stripe_commercial_read_refund_case", {
        p_case: input.caseId.trim(),
        p_account: accountId,
        p_mode: input.mode,
      }),
    );
  } catch {
    return { ok: false, reason: "refund_case_unavailable" };
  }
  if (!approved) return { ok: false, reason: "refund_case_unknown" };
  // The approval must be a live approval by the named trusted operator.
  if (str(approved.approved_by) !== input.operatorActor.trim())
    return { ok: false, reason: "refund_actor_mismatch" };
  const caseState = str(approved.state);
  // A CONSUMED case is NOT automatically a new failure. The frozen
  // `reserve_refund` recognises an existing same-operation reservation BEFORE
  // it checks the case state, so an operation whose refund succeeded and whose
  // result response was lost must be able to re-read its own durable outcome.
  // Bailing out here is what turned a proved success into
  // `refund_case_consumed`. Only a state that is neither approved nor
  // recoverable is refused, and that decision is made below, once this
  // operation's own row has been read.
  //
  // A REFUSED case is recoverable for exactly the same reason. `finish_operation`
  // is what marks a case refused, so that state means this case's own operation
  // reached a negative terminal — possibly while its response was lost, and
  // possibly leaving a released reservation whose operation was never closed.
  // The EXACT persisted reservation and operation determine the replay; a
  // generic `refund_case_refused` here reported the mutable case status instead
  // of the durable result, and made the release recovery below unreachable.
  if (caseState !== "approved" && caseState !== "consumed" && caseState !== "refused")
    return { ok: false, reason: `refund_case_${caseState || "unknown"}` };
  const disposition = dispositionSupported({
    subscription: str(approved.subscription_disposition),
    access: str(approved.access_disposition),
  });
  if (!disposition.ok) return { ok: false, reason: `refund_${disposition.reason}` };

  const userId = str(approved.user_id);
  const invoiceId = str(approved.invoice_id);
  const amountMinor = Number(approved.amount ?? 0);
  const currency = str(approved.currency);
  const basis = str(approved.policy_basis) as RefundPolicyBasis;
  const requestedAtMs = Date.parse(str(approved.requested_at));
  if (!UUID.test(userId) || !invoiceId || !Number.isInteger(amountMinor) || amountMinor <= 0)
    return { ok: false, reason: "refund_case_unreadable" };

  try {
    await verifyStripeAccount(input.mode, config, fetchImpl);
  } catch {
    return { ok: false, reason: "account_unverified" };
  }

  // Ownership comes from the server mapping, never from the case alone.
  let current: Json | null;
  try {
    current = row(
      await call("stripe_commercial_current_subscription", {
        p_user: userId,
        p_account: accountId,
        p_mode: input.mode,
      }),
    );
  } catch {
    return { ok: false, reason: "subscription_mapping_uncertain" };
  }
  const customerId = str(current?.customer_id);
  if (!customerId) return { ok: false, reason: "no_customer" };

  let invoice: Json;
  try {
    invoice = await stripeProviderCall(
      `invoices/${encodeURIComponent(invoiceId)}`,
      { mode: input.mode, method: "GET" },
      config,
      fetchImpl,
    );
  } catch {
    return { ok: false, reason: "invoice_read_failed" };
  }
  if (idOf(invoice.id) !== invoiceId) return { ok: false, reason: "invoice_identity" };
  if (idOf(invoice.customer) !== customerId) return { ok: false, reason: "invoice_foreign" };
  const parent = (invoice.parent ?? null) as Json | null;
  const details = (parent?.subscription_details ?? null) as Json | null;
  const invoiceSubscriptionId = idOf(details?.subscription);
  if (parent?.type !== "subscription_details" || !invoiceSubscriptionId)
    return { ok: false, reason: "invoice_not_subscription" };
  const evidence = invoicePaymentEvidence({
    invoice,
    mode: input.mode,
    customerId,
    subscriptionId: invoiceSubscriptionId,
  });
  // An invoice whose "remaining paid" looks fine is not refund evidence; a
  // genuinely paid status with a real paid_at is.
  if (evidence.state !== "paid") return { ok: false, reason: `invoice_${evidence.state}` };
  if (str(invoice.currency).toLowerCase() !== currency)
    return { ok: false, reason: "invoice_currency_mismatch" };

  // The modern InvoicePayment links. `amount_paid` is an ALLOCATION to this
  // invoice and may be smaller than the PaymentIntent's received total.
  let payments: unknown[];
  try {
    const list = completeListData(
      await stripeProviderCall(
        `invoice_payments?invoice=${encodeURIComponent(invoiceId)}&limit=${LIST_LIMIT}`,
        { mode: input.mode, method: "GET" },
        config,
        fetchImpl,
      ),
    );
    if (!list.ok) return { ok: false, reason: `invoice_payments_${list.reason}` };
    if (list.data.length >= LIST_LIMIT) return { ok: false, reason: "invoice_payments_incomplete" };
    payments = list.data;
  } catch {
    return { ok: false, reason: "invoice_payments_unavailable" };
  }
  const paymentIntentId = (() => {
    for (const entry of payments) {
      const record = (entry ?? {}) as Json;
      const payment = (record.payment ?? {}) as Json;
      if (record.status === "paid" && payment.type === "payment_intent")
        return idOf(payment.payment_intent);
    }
    return "";
  })();
  if (!paymentIntentId) return { ok: false, reason: "invoice_payment_absent" };

  let paymentIntent: Json;
  try {
    paymentIntent = await stripeProviderCall(
      `payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { mode: input.mode, method: "GET" },
      config,
      fetchImpl,
    );
  } catch {
    return { ok: false, reason: "payment_intent_read_failed" };
  }
  const allocation = resolveRefundableAllocation({
    invoicePayments: payments,
    invoiceId,
    mode: input.mode,
    paymentIntent,
    customerId,
  });
  if (!allocation.ok) return { ok: false, reason: `refund_${allocation.reason}` };

  // The COMPLETE refund list for that payment. Every non-releasing outcome
  // counts against the remaining funds.
  let committed: number;
  try {
    const list = completeListData(
      await stripeProviderCall(
        `refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=${LIST_LIMIT}`,
        { mode: input.mode, method: "GET" },
        config,
        fetchImpl,
      ),
    );
    if (!list.ok) return { ok: false, reason: `refund_list_${list.reason}` };
    if (list.data.length >= LIST_LIMIT) return { ok: false, reason: "refund_list_incomplete" };
    const total = committedRefundTotal({
      refunds: list.data,
      paymentIntentId,
      currency,
    });
    if (!total.ok) return { ok: false, reason: `refund_${total.reason}` };
    committed = total.committedMinor;
  } catch {
    return { ok: false, reason: "refund_list_unavailable" };
  }

  // Is this invoice the FIRST payment for the plan, and when was it paid?
  const firstPayment = await resolveFirstPaymentEvidence(
    { mode: input.mode, customerId, subscriptionId: invoiceSubscriptionId, invoiceId },
    config,
    fetchImpl,
  );
  if (!firstPayment.ok) return firstPayment;

  const policy = evaluateRefundPolicy({
    basis,
    requestedAtMs,
    firstPaymentAtMs: firstPayment.firstPaymentAtMs,
    invoiceIsFirstPayment: firstPayment.isFirstPayment,
    amountMinor,
    allocatedMinor: allocation.value.allocatedMinor,
    termsBreached: firstPayment.termsBreached,
  });
  // A policy refusal happens BEFORE any operation is begun and before any
  // reservation, so nothing is held and nothing is dispatched.
  if (!policy.ok) return { ok: false, reason: `policy_${policy.reason}` };

  const scope: OperationScope = {
    p_operation: input.operationId,
    p_user: userId,
    p_account: accountId,
    p_mode: input.mode,
  };
  const idempotencyKey = `milo-ref:${accountId}:${input.mode}:${input.caseId.trim()}`;
  let operation: OperationRow | null;
  try {
    operation = operationRow(
      await call("stripe_commercial_begin_operation", {
        ...scope,
        p_kind: "refund",
        p_subscription: invoiceSubscriptionId,
        p_fingerprint: digest({
          case: input.caseId.trim(),
          invoice: invoiceId,
          payment: paymentIntentId,
          amount: amountMinor,
          currency,
        }),
        p_idempotency_key: idempotencyKey,
        p_case: input.caseId.trim(),
      }),
    );
  } catch {
    return { ok: false, reason: "operation_unavailable" };
  }
  if (!operation) return { ok: false, reason: "operation_unavailable" };
  const step = stepDeps(scope, operation.createdAt, clock, idempotencyKey);
  const context = { accountId, amountMinor, currency, invoiceId, approved };

  const approvedTerms = {
    operationId: input.operationId,
    invoiceId,
    paymentIntentId,
    amountMinor,
    currency,
  };

  // A terminal replay is reported from the DURABLE row, so a proved success
  // whose response was lost is never re-reported as a consumed-case failure and
  // never re-dispatched.
  if (operation.state === "applied") return refundOutcome("succeeded", context);
  if (operation.state === "refused" || operation.state === "failed") {
    // A NEGATIVE terminal is replayed just as exactly. When this operation's own
    // reservation was released against an authoritative failed/canceled refund,
    // that released status IS the result and is reported as such; only without
    // that evidence is the bare operation state reported.
    const terminal = await readRefundReservation({
      caseId: input.caseId.trim(),
      accountId,
      mode: input.mode,
    });
    if (
      terminal &&
      terminal !== "uncertain" &&
      terminal.state === "released" &&
      terminal.refundId &&
      reservationMatches(terminal, approvedTerms)
    )
      return { ok: false, reason: `refund_${classifyRefundStatus(terminal.refundStatus)}` };
    return { ok: false, reason: `operation_${operation.state}` };
  }

  // A DURABLE NEGATIVE TERMINAL against an operation that is still OPEN.
  //
  // `settle_refund` releases the funds and `finish_operation` closes the
  // operation; between those two writes a lost or failed acknowledgment leaves a
  // released reservation with an open operation. The released result is already
  // authoritative, so it resolves this operation here — before `reserve_refund`
  // is asked to reserve against a reservation that no longer holds anything, and
  // with no provider POST and no new reservation. Only a state past `prepared`
  // can have reached a settlement at all, so a first attempt is untouched.
  if (operation.state !== "prepared") {
    const released = await readRefundReservation({
      caseId: input.caseId.trim(),
      accountId,
      mode: input.mode,
    });
    if (released === "uncertain") return { ok: false, reason: "refund_reservation_uncertain" };
    if (
      released &&
      released.state === "released" &&
      released.refundId &&
      reservationMatches(released, approvedTerms)
    )
      return closeReleasedRefund(
        classifyRefundStatus(released.refundStatus),
        scope,
        step,
        operation.state,
      );
  }
  // Only now, with this operation known to be open, is a non-approved case
  // decided — and `reserve_refund` is what decides it, because it recognises an
  // existing same-operation reservation first.

  // RESERVE under the per-invoice lock. This is where cumulative over-refunding,
  // cross-case concurrency and the once-per-customer-per-plan guarantee are
  // actually enforced. The returned pair is READ, not assumed: a reservation
  // that is not exactly the approved amount is not the reservation this refund
  // may be taken against.
  let reserved: Json | null;
  try {
    reserved = row(
      await call("stripe_commercial_reserve_refund", {
        p_case: input.caseId.trim(),
        p_operation: input.operationId,
        p_user: userId,
        p_account: accountId,
        p_mode: input.mode,
        p_invoice: invoiceId,
        p_payment: paymentIntentId,
        p_amount: amountMinor,
        p_currency: currency,
        p_allocated_paid: allocation.value.allocatedMinor,
        p_provider_reserved: committed,
      }),
    );
  } catch (error) {
    // AMBIGUOUS. `reserve_refund` raises both for a deterministic rejection — an
    // over-reservation by a competing case, a spent once-per-plan use, a
    // genuinely spent case — and for a transport failure that proves nothing.
    //
    // Classifying every exception as a refusal TERMINATED AN IN-FLIGHT REFUND:
    // a recovery reader that had observed `dispatching` passed that state to
    // `finish`, the compare-and-set legitimately succeeded, and the operation
    // closed `refused` while the provider POST was still running. So the exact
    // scoped reservation decides, and an operation that is past `prepared` is
    // never closed on this path at all.
    const reservation = await readRefundReservation({
      caseId: input.caseId.trim(),
      accountId,
      mode: input.mode,
    });
    if (reservation === "uncertain") return { ok: false, reason: "refund_reservation_uncertain" };
    if (
      reservation &&
      reservationMatches(reservation, {
        operationId: input.operationId,
        invoiceId,
        paymentIntentId,
        amountMinor,
        currency,
      })
    ) {
      // THIS operation already holds the reservation: the write committed (or
      // an earlier attempt made it) and the refund continues from it.
      if (reservation.state === "released")
        return { ok: false, reason: "refund_reservation_released" };
      reserved = { reserved: reservation.amount, remaining: 0 };
    } else if (
      reservation &&
      !reservationMatches(reservation, {
        operationId: input.operationId,
        invoiceId,
        paymentIntentId,
        amountMinor,
        currency,
      })
    ) {
      // Someone else's reservation on this case. That is deterministic and this
      // operation may not proceed — but it still may not close a dispatched
      // operation, so only a `prepared` one is refused.
      if (operation.state !== "prepared")
        return { ok: false, reason: "refund_reservation_uncertain" };
      const closed = await step.finish("refused", "reservation_refused", "prepared");
      if (closed === "stale") return { ok: false, reason: "operation_conflict" };
      if (closed === "uncertain") return { ok: false, reason: "operation_uncertain" };
      return { ok: false, reason: "refund_reservation_refused" };
    } else {
      // NO RESERVATION EXISTS, which on its own says only that this reservation
      // does not exist right now. It does NOT establish an over-reservation, a
      // spent case or any other business rejection, so the raised error decides:
      //
      //  - a deterministic `reserve_refund` rejection is proof that nothing was
      //    reserved, and a still-`prepared` operation is refused on it, under
      //    the compare-and-set that protects a worker which has since advanced;
      //  - anything else — a transport failure before the write, a timeout — is
      //    UNCERTAINTY. The operation stays `prepared` and recoverable, the
      //    approval stays usable and nothing is dispatched. Refusing here
      //    permanently burned a healthy approved refund for a lost connection.
      //
      // For any state past `prepared` this is uncertainty either way: a
      // dispatched refund must never be closed because a read came back empty.
      if (operation.state !== "prepared" || !provedReserveRejection(error))
        return { ok: false, reason: "refund_reservation_uncertain" };
      const closed = await step.finish("refused", "reservation_refused", "prepared");
      if (closed === "stale") return { ok: false, reason: "operation_conflict" };
      if (closed === "uncertain") return { ok: false, reason: "operation_uncertain" };
      return { ok: false, reason: "refund_reservation_refused" };
    }
  }
  if (Number(reserved?.reserved) !== amountMinor)
    return { ok: false, reason: "refund_reservation_unreadable" };

  if (operation.state === "prepared" || operation.state === "fenced") {
    const moved = await step.advance("dispatching", {
      invoice: invoiceId,
      expected: operation.state,
    });
    if (moved === "stale") return { ok: false, reason: "operation_conflict" };
    if (moved === "uncertain") return { ok: false, reason: "operation_uncertain" };
    // The strict deadline is re-taken against a fresh clock immediately before
    // the duplicable POST. Beyond it nothing is dispatched: a new financial
    // intent is never created, only recovery and fencing.
    if (!step.stillRetainable()) {
      await step.advance("fenced", { invoice: invoiceId, expected: "dispatching" });
      return { ok: false, reason: "operation_fenced" };
    }
    try {
      const created = await stripeProviderCall(
        "refunds",
        {
          mode: input.mode,
          method: "POST",
          body: new URLSearchParams({
            payment_intent: paymentIntentId,
            amount: String(amountMinor),
            "metadata[milo_refund_case]": input.caseId.trim(),
          }),
          idempotencyKey,
        },
        config,
        fetchImpl,
      );
      const refund = readRefundObject({
        raw: created,
        expectedPaymentIntentId: paymentIntentId,
        expectedChargeId: null,
        expectedCurrency: currency,
        // THE APPROVED CASE IS PART OF THE IDENTITY. The creation response used
        // to be checked for amount, currency and payment but not for the case
        // it names, so a well-formed refund carrying another case's metadata
        // settled THIS case's approved reservation. Recovery always checked the
        // case; the two paths now have the same provenance requirement.
        expectedCaseId: input.caseId.trim(),
      });
      if (!refund.ok) {
        // The refund exists at the provider but cannot be interpreted. The
        // reservation STAYS held and the operation stays non-terminal.
        await step.advance("awaiting_apply", { invoice: invoiceId, expected: "dispatching" });
        return { ok: false, reason: `refund_${refund.reason}` };
      }
      // THE CREATION RESPONSE IS CHECKED EXACTLY, not merely for being
      // positive: an amount other than the approved one must never settle the
      // approved reservation.
      if (refund.value.amount !== amountMinor) {
        await step.advance("awaiting_apply", {
          invoice: invoiceId,
          refund: refund.value.id,
          expected: "dispatching",
        });
        return { ok: false, reason: "refund_amount_unexpected" };
      }
      return settleRefund(
        input,
        scope,
        step,
        refund.value.id,
        refund.value.status,
        context,
        "dispatching",
      );
    } catch {
      // Unknown outcome: the funds stay reserved, the operation stays
      // non-terminal, and recovery re-reads authoritatively.
      await step.advance("awaiting_apply", { invoice: invoiceId, expected: "dispatching" });
      return { ok: false, reason: "refund_uncertain" };
    }
  }

  // RESUMED. THE DURABLE RESERVATION IS CONSULTED FIRST.
  //
  // When a settlement commits and both its own acknowledgment and the identical
  // retry's acknowledgment are lost, SQL already holds the exact terminal
  // result — state text and immutable refund id. Going straight to provider
  // rediscovery left that operation open indefinitely behind an empty list,
  // even though nothing further needed to be discovered. So the scoped
  // reservation is read, validated against the approved terms, and used to
  // finish THIS operation with no refund POST and no new reservation.
  const durableReservation = await readRefundReservation({
    caseId: input.caseId.trim(),
    accountId,
    mode: input.mode,
  });
  if (durableReservation === "uncertain")
    return { ok: false, reason: "refund_reservation_uncertain" };
  if (
    durableReservation &&
    durableReservation.refundId &&
    (durableReservation.state === "settled" || durableReservation.state === "released") &&
    reservationMatches(durableReservation, {
      operationId: input.operationId,
      invoiceId,
      paymentIntentId,
      amountMinor,
      currency,
    })
  ) {
    const settledStatus = classifyRefundStatus(durableReservation.refundStatus);
    if (durableReservation.state === "settled") {
      // The money moved and SQL says so. Close the operation from its ACTUAL
      // current state; a terminal that is not the one requested is reported
      // accurately rather than collapsed into success.
      const closed = await step.finish("applied", null, operation.state);
      if (closed === "ok") return refundOutcome("succeeded", context);
      const again = await readDurableOperation(scope);
      if (!again.ok) return { ok: false, reason: "refund_settlement_uncertain" };
      if (again.value.state === "applied") return refundOutcome("succeeded", context);
      if (again.value.state === "refused" || again.value.state === "failed")
        return { ok: false, reason: `refund_settled_but_operation_${again.value.state}` };
      const retried = await step.finish("applied", null, again.value.state);
      if (retried === "ok") return refundOutcome("succeeded", context);
      return { ok: false, reason: "refund_settlement_uncertain" };
    }
    // Released: an authoritative negative terminal already recorded.
    return closeReleasedRefund(settledStatus, scope, step, operation.state);
  }

  // Otherwise the outcome genuinely is not durable yet: find OUR refund
  // authoritatively at the provider.
  const recovered = await recoverDispatchedRefund(
    { mode: input.mode, caseId: input.caseId.trim(), paymentIntentId, currency, amountMinor },
    config,
    fetchImpl,
  );
  if (!recovered.ok) return recovered;
  if (!recovered.refundId) {
    // A COMPLETE EMPTY LIST IS UNKNOWN, NOT A CANCELLED REFUND. Another
    // execution of this same operation may still have a POST in flight, or the
    // provider may simply not have published the object yet, so fabricating a
    // `canceled` status here released real funds and closed the operation
    // `failed` while the money was on its way out.
    //
    // Past retention it is still unknown — the earlier POST may yet complete —
    // so the reservation and the slot stay held for operator recovery instead
    // of being settled as "no effect".
    await step.advance("awaiting_apply", { invoice: invoiceId, expected: operation.state });
    return { ok: false, reason: "refund_outcome_unknown" };
  }
  return settleRefund(
    input,
    scope,
    step,
    recovered.refundId,
    recovered.status,
    context,
    operation.state,
  );
}

/**
 * Record the provider's refund id and CLASSIFIED status against the
 * reservation, then settle the operation.
 *
 * `settle_refund` returns the reservation's STATE TEXT — `reserved`, `settled`
 * or `released` — not a boolean, and that text is validated: an unexpected
 * value, an unreadable response or an exception is uncertainty, never success.
 * It is idempotent for an already terminal reservation and never repoints a
 * recorded refund id, so a lost settlement acknowledgment is resolved by
 * repeating the IDENTICAL settlement — which is a re-read of the same
 * reservation, never a second refund.
 */
async function settleRefund(
  input: { caseId: string; operationId: string; mode: StripeMode },
  scope: OperationScope,
  step: StepDeps,
  refundId: string,
  status: ReturnType<typeof classifyRefundStatus>,
  context: {
    accountId: string;
    amountMinor: number;
    currency: string;
    invoiceId: string;
    approved: Json;
  },
  /** The state this instance last OBSERVED, asserted on every write below. */
  observedState: string,
): Promise<RefundOutcome | Held> {
  const settle = async (): Promise<string | null> => {
    try {
      return str(
        await call("stripe_commercial_settle_refund", {
          p_case: input.caseId.trim(),
          p_operation: input.operationId,
          p_account: context.accountId,
          p_mode: input.mode,
          p_refund: refundId,
          p_status: status,
        }),
      );
    } catch {
      return null;
    }
  };
  // One identical retry, which `settle_refund`'s idempotence makes a pure
  // re-read of this exact reservation.
  let reservation = await settle();
  if (reservation === null) reservation = await settle();
  if (reservation === null) {
    // BOTH acknowledgments are gone. A bounded repeat is not a substitute for
    // evidence, so the exact scoped reservation is read: if the settlement did
    // commit, SQL holds its state text and immutable refund id.
    const durable = await readRefundReservation({
      caseId: input.caseId.trim(),
      accountId: context.accountId,
      mode: input.mode,
    });
    if (
      durable &&
      durable !== "uncertain" &&
      durable.refundId === refundId &&
      durable.amount === context.amountMinor &&
      durable.operationId.toLowerCase() === input.operationId.toLowerCase() &&
      (durable.state === "settled" || durable.state === "released")
    )
      reservation = durable.state;
    else return { ok: false, reason: "refund_settlement_unavailable" };
  }
  if (reservation !== "reserved" && reservation !== "settled" && reservation !== "released")
    return { ok: false, reason: "refund_settlement_unreadable" };

  if (status === "succeeded" && reservation === "settled") {
    const closed = await step.finish("applied", null, observedState);
    if (closed !== "ok") {
      // The money moved and this instance did not close the operation. ONLY the
      // exact requested terminal establishes success: collapsing every terminal
      // into a boolean reported `succeeded` for an operation another worker had
      // closed `refused`, and the next replay then contradicted it.
      const again = await readDurableOperation(scope);
      if (!again.ok) return { ok: false, reason: "refund_settlement_uncertain" };
      if (again.value.state === "applied") return refundOutcome("succeeded", context);
      if (again.value.state === "refused" || again.value.state === "failed")
        // Accurately represented and held, never reopened and never success.
        return { ok: false, reason: `refund_settled_but_operation_${again.value.state}` };
      const retried = await step.finish("applied", null, again.value.state);
      if (retried === "ok") return refundOutcome("succeeded", context);
      return { ok: false, reason: "refund_settlement_uncertain" };
    }
    return refundOutcome("succeeded", context);
  }
  if (refundReleasesReservation(status))
    // Only an AUTHORITATIVE matching failed/canceled refund releases dispatched
    // funds, and `settle_refund` is what performed that release.
    return closeReleasedRefund(status, scope, step, observedState);
  // pending / requires_action / unknown: NON-TERMINAL, funds stay reserved.
  // A `succeeded` that reached here means the reservation was not in a state
  // that could settle it, which is uncertainty, not success.
  await step.advance("awaiting_apply", {
    invoice: context.invoiceId,
    refund: refundId,
    expected: observedState,
  });
  const reported: RefundOutcome["state"] =
    status === "pending" || status === "requires_action" ? status : "unknown";
  return refundOutcome(reported, context);
}

/**
 * Close an operation whose reservation was AUTHORITATIVELY RELEASED.
 *
 * The money outcome is known and negative: `settle_refund` released the funds
 * against a failed/canceled refund. What may still be unknown is whether THIS
 * operation got closed, so that is resolved on evidence rather than assumed:
 *
 *  - the compare-and-set succeeds → the accurate negative result;
 *  - it is stale/uncertain and the durable row is already a negative terminal →
 *    the same accurate negative result (a committed `finish` whose
 *    acknowledgment was lost);
 *  - the row is still open → one retry from the state actually observed;
 *  - the row is `applied` → a genuine contradiction, reported as such;
 *  - the row cannot be read, or the retry cannot be proved → the release is
 *    reported WITH its unresolved completion
 *    (`refund_release_completion_uncertain`). Returning a plain
 *    `refund_failed`/`refund_canceled` there claimed the operation had been
 *    finished when nothing established that.
 */
async function closeReleasedRefund(
  status: ReturnType<typeof classifyRefundStatus>,
  scope: OperationScope,
  step: StepDeps,
  observedState: string,
): Promise<Held> {
  const closed = await step.finish("refused", `refund_${status}`, observedState);
  if (closed === "ok") return { ok: false, reason: `refund_${status}` };
  const again = await readDurableOperation(scope);
  if (!again.ok) return { ok: false, reason: "refund_release_completion_uncertain" };
  if (again.value.state === "applied")
    // An `applied` operation against a released reservation is a genuine
    // contradiction: report it instead of silently agreeing with either.
    return { ok: false, reason: "refund_released_but_operation_applied" };
  if (isTerminalOperationState(again.value.state)) return { ok: false, reason: `refund_${status}` };
  const retried = await step.finish("refused", `refund_${status}`, again.value.state);
  if (retried === "ok") return { ok: false, reason: `refund_${status}` };
  return { ok: false, reason: "refund_release_completion_uncertain" };
}

function refundOutcome(
  state: RefundOutcome["state"],
  context: { amountMinor: number; currency: string; approved: Json },
): RefundOutcome {
  return {
    ok: true,
    state,
    refundedMinor: context.amountMinor,
    currency: context.currency,
    subscriptionDisposition: str(context.approved.subscription_disposition),
    accessDisposition: str(context.approved.access_disposition),
    responseCopy: REFUND_SUPPORT_COPY.responseTime,
    settlementCopy: REFUND_SUPPORT_COPY.settlementTime,
  };
}

/**
 * Find OUR refund for a case from a COMPLETE authoritative list.
 *
 * An incomplete, unreadable or ambiguous list proves nothing and leaves the
 * reservation held — and so does a COMPLETE EMPTY one. `refundId: null` means
 * UNKNOWN, not "no refund exists": a same-operation POST may still be in
 * flight, so the caller must keep the funds and the slot reserved. Only an
 * authoritative matching `failed`/`canceled` refund releases them.
 *
 * The recovered amount is compared with the approved amount exactly, so a
 * refund for the wrong amount can never settle the approved reservation.
 */
async function recoverDispatchedRefund(
  input: {
    mode: StripeMode;
    caseId: string;
    paymentIntentId: string;
    currency: string;
    amountMinor: number;
  },
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Promise<
  { ok: true; refundId: string | null; status: ReturnType<typeof classifyRefundStatus> } | Held
> {
  let rows: unknown[];
  try {
    const list = completeListData(
      await stripeProviderCall(
        `refunds?payment_intent=${encodeURIComponent(input.paymentIntentId)}&limit=${LIST_LIMIT}`,
        { mode: input.mode, method: "GET" },
        config,
        fetchImpl,
      ),
    );
    if (!list.ok) return { ok: false, reason: `refund_list_${list.reason}` };
    if (list.data.length >= LIST_LIMIT) return { ok: false, reason: "refund_list_incomplete" };
    rows = list.data;
  } catch {
    return { ok: false, reason: "refund_list_unavailable" };
  }
  const mine: { id: string; status: ReturnType<typeof classifyRefundStatus> }[] = [];
  for (const entry of rows) {
    const refund = (entry ?? {}) as Json;
    const metadata = (refund.metadata ?? {}) as Json;
    if (str(metadata.milo_refund_case) !== input.caseId) continue;
    const read = readRefundObject({
      raw: refund,
      expectedPaymentIntentId: input.paymentIntentId,
      expectedChargeId: null,
      expectedCurrency: input.currency,
      expectedCaseId: input.caseId,
    });
    if (!read.ok) return { ok: false, reason: `refund_${read.reason}` };
    if (read.value.amount !== input.amountMinor)
      return { ok: false, reason: "refund_amount_unexpected" };
    mine.push({ id: read.value.id, status: read.value.status });
  }
  if (mine.length > 1) return { ok: false, reason: "refund_ambiguous" };
  return { ok: true, refundId: mine[0]?.id ?? null, status: mine[0]?.status ?? "unknown" };
}

/**
 * Was this invoice the FIRST payment for the subscription, and when was it paid?
 *
 * Read from a COMPLETE invoice list for the exact customer and subscription. An
 * incomplete or unreadable list is `first_payment_unknown`, which holds the
 * 14-day guarantee rather than assuming it applies.
 *
 * `termsBreached` is not inferred here: it is carried on the approval as the
 * `abuseException` basis (which refuses a refund outright), so this read never
 * invents an abuse finding.
 */
async function resolveFirstPaymentEvidence(
  input: { mode: StripeMode; customerId: string; subscriptionId: string; invoiceId: string },
  config: StripeLifecycleConfig,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; isFirstPayment: boolean; firstPaymentAtMs: number | null; termsBreached: boolean }
  | Held
> {
  let rows: unknown[];
  try {
    const list = completeListData(
      await stripeProviderCall(
        `invoices?customer=${encodeURIComponent(input.customerId)}` +
          `&subscription=${encodeURIComponent(input.subscriptionId)}&limit=${LIST_LIMIT}`,
        { mode: input.mode, method: "GET" },
        config,
        fetchImpl,
      ),
    );
    if (!list.ok) return { ok: false, reason: `invoice_history_${list.reason}` };
    if (list.data.length >= LIST_LIMIT) return { ok: false, reason: "invoice_history_incomplete" };
    rows = list.data;
  } catch {
    return { ok: false, reason: "invoice_history_unavailable" };
  }
  let earliestId = "";
  let earliestAt = Number.POSITIVE_INFINITY;
  for (const entry of rows) {
    const invoice = (entry ?? {}) as Json;
    if (invoice.status !== "paid") continue;
    const transitions = (invoice.status_transitions ?? {}) as Json;
    const paidAt = transitions.paid_at;
    if (typeof paidAt !== "number" || !Number.isInteger(paidAt) || paidAt <= 0)
      return { ok: false, reason: "invoice_history_paid_at" };
    if (paidAt < earliestAt) {
      earliestAt = paidAt;
      earliestId = idOf(invoice.id);
    }
  }
  if (!earliestId) return { ok: false, reason: "invoice_history_no_payment" };
  return {
    ok: true,
    isFirstPayment: earliestId === input.invoiceId,
    firstPaymentAtMs: earliestAt * 1000,
    termsBreached: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Pre-deletion billing barrier                                               */
/* -------------------------------------------------------------------------- */

export interface DeletionBarrier {
  ok: true;
  blocked: boolean;
  reason: string;
  mode: string | null;
  subscriptionId: string | null;
}

/**
 * The SAFE side of the public promise that deleting an account ends the
 * subscription.
 *
 * This is a READ-ONLY barrier: it deletes nothing, cancels nothing and touches
 * no auth row. `blocked: true` means an account or data deletion MUST NOT
 * proceed, because a subscription is still live, a commercial operation is
 * unresolved or refund funds are still reserved. A transport failure is
 * `blocked: true` as well — an unreadable billing state must never be read as
 * "safe to delete".
 *
 * ACCEPTANCE GAP, retained deliberately: no real account-deletion handler
 * exists in this product, so nothing calls this on a deletion path today. This
 * helper is NOT proof that the public promise works.
 */
export async function readBillingDeletionBarrier(userId: string): Promise<DeletionBarrier> {
  if (!UUID.test(userId))
    return { ok: true, blocked: true, reason: "owner_invalid", mode: null, subscriptionId: null };
  try {
    const data = row(await call("stripe_commercial_deletion_barrier", { p_user: userId }));
    if (!data)
      return {
        ok: true,
        blocked: true,
        reason: "barrier_unreadable",
        mode: null,
        subscriptionId: null,
      };
    return {
      ok: true,
      blocked: data.blocked !== false,
      reason: str(data.reason) || "barrier_unreadable",
      mode: str(data.mode) || null,
      subscriptionId: str(data.subscription_id) || null,
    };
  } catch {
    return {
      ok: true,
      blocked: true,
      reason: "barrier_unavailable",
      mode: null,
      subscriptionId: null,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Caller-owned read adapter: current summary, discovery and the manual guard */
/* -------------------------------------------------------------------------- */

/**
 * WHY THIS SECTION SELECTS FROM TABLES, and exactly how far that goes.
 *
 * The module header's rule — every database touch is a service-role SQL
 * function — is about MUTATION, and it is untouched: nothing below writes,
 * dispatches, transitions an operation, consumes a quote or calls a provider.
 *
 * Discovery has no RPC to use. `stripe_commercial_read_operation` reads an
 * operation whose id the caller already has, which is precisely what a customer
 * returning after a refresh, a crash or a new device does NOT have.
 * `stripe_commercial_current_subscription` answers for ONE account and mode and
 * omits `observed_at`, so it cannot even tell a caller whether another scope
 * holds an unresolved agreement. Answering "what, if anything, is open for this
 * owner" therefore needs an owner-wide read, and the honest way to add one
 * without new SQL is a minimal, named-column, owner-scoped, BOUNDED SELECT.
 *
 * The bounds that make that safe:
 *
 *  - `user_id` is always the AUTHENTICATED owner, passed down from the caller
 *    middleware. No account, mode, subscription or operation id from a client
 *    ever enters a filter.
 *  - Named columns only. Dispatch payloads, idempotency keys, fingerprints,
 *    invoice/refund/schedule ids, case ids and selection details are not
 *    selected at all, so they cannot leak by accident.
 *  - Every read is bounded and TRUNCATION-AWARE. A result at the bound is
 *    "I could not see all of it", never "that is all there is".
 *  - Every failure is UNAVAILABLE. A missing relation, a denied read, a
 *    malformed row or an unrecognised state is unknown — never Free, never
 *    zero, never a clear manual override.
 *
 * What crosses back to a caller is the opaque operation/quote UUIDs it already
 * owns plus the safe terms it was shown. Provider ids stay here.
 */

/** Bounded owner-wide scan. One more row than this is TRUNCATION. */
const OWNER_SCAN_LIMIT = 100;

interface ListFilter {
  eq(column: string, value: unknown): ListFilter;
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
}
interface ListClient {
  from(table: string): { select(columns: string): ListFilter };
}

type RowsRead = { ok: true; rows: Json[] } | { ok: false; reason: string };

async function readOwnerRows(table: string, columns: string, userId: string): Promise<RowsRead> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as ListClient)
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .limit(OWNER_SCAN_LIMIT + 1);
    if (error) return { ok: false, reason: "billing_read_failed" };
    // ONLY an array is a readable SELECT result. `[]` is a real empty table;
    // `null`/`undefined` with no error is a payload we could not read, and
    // treating it as absence would turn an unavailable relation into a
    // verified Free account with a clear manual override.
    if (!Array.isArray(data)) return { ok: false, reason: "billing_read_unreadable" };
    if (data.length > OWNER_SCAN_LIMIT) return { ok: false, reason: "billing_read_truncated" };
    const rows: Json[] = [];
    for (const entry of data) {
      if (!entry || typeof entry !== "object")
        return { ok: false, reason: "billing_read_unreadable" };
      rows.push(entry as Json);
    }
    return { ok: true, rows };
  } catch {
    return { ok: false, reason: "billing_read_unavailable" };
  }
}

/** Strict booleans. A null, a string or a missing column is UNKNOWN. */
function boolOf(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}
/** A readable timestamp, normalised. Anything unparseable is unknown. */
function isoOf(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
/** A non-negative integer, from a JSON number or an exact digit string
 * (bigint columns may arrive either way). Nothing else is readable. */
function intOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}
function modeOf(value: unknown): StripeMode | null {
  const text = str(value);
  return text === "live" || text === "test" ? text : null;
}
function uuidOf(value: unknown): string | null {
  const text = str(value);
  return UUID.test(text) ? text.toLowerCase() : null;
}
function sellableOf(value: unknown): SellablePlanId | null {
  const text = str(value);
  return (SELLABLE as readonly string[]).includes(text) ? (text as SellablePlanId) : null;
}

/** Statuses whose meaning is a coherent, FINISHED Stripe agreement. */
const TERMINAL_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "cancelled",
  "incomplete_expired",
]);
/** Statuses that are explicitly a live or unsettled agreement. Everything
 * unrecognised falls through to UNKNOWN, which also holds. */
const NONTERMINAL_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "incomplete",
  "past_due",
  "unpaid",
  "paused",
]);
const OPEN_CHECKOUT_STATUSES: ReadonlySet<string> = new Set(["pending", "open", "fenced"]);
/** The complete CHECK set from the foundation migration. An unrecognised value
 * is malformed evidence, not "some other resolved state". */
const CHECKOUT_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "open",
  "fenced",
  "completed",
  "expired",
  "failed",
]);
const CHECKOUT_KINDS: ReadonlySet<string> = new Set(["checkout", "portal"]);
const RECOGNISED_PROVIDERS: ReadonlySet<string> = new Set(["stripe", "paddle", "manual", "none"]);
/**
 * Raw entitlement statuses that themselves assert a FINISHED agreement.
 *
 * `cancelled` is the ended agreement; an explicit `freePreview` row asserts
 * no paid agreement at all. Everything else — `active` (however long its
 * period has been over), `pastDue`, `checkoutPending`, and a manual status on
 * a Stripe row — leaves the agreement unresolved or contradicts the provider
 * it claims, and unresolved is held regardless of age.
 */
const TERMINAL_RAW_STATUSES: ReadonlySet<string> = new Set<SubscriptionStatus>([
  "cancelled",
  "freePreview",
]);
const RECOGNISED_STATUSES: ReadonlySet<string> = new Set<SubscriptionStatus>([
  "freePreview",
  "checkoutPending",
  "active",
  "pastDue",
  "cancelled",
  "manualBeta",
  "manualComped",
]);

interface RawEntitlementEvidence {
  /** A row was successfully read. */
  present: boolean;
  /** Every required field validated. A present-but-malformed row is NOT valid
   * and may not be mapped to Paddle or Free the way the display mapper does. */
  valid: boolean;
  provider: BillingProvider | null;
  planId: PlanId | null;
  status: SubscriptionStatus | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  /** Private provider identities, kept SERVER-SIDE. They exist only so the
   * entitlement can be joined to the projection and mapping it claims; none of
   * them is ever placed in a caller payload. */
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

interface CustomerEvidence {
  accountId: string;
  mode: StripeMode;
  /** Server-side only, for the owner/account/mode/customer coherence join. */
  customerId: string;
}

interface SubscriptionEvidence {
  accountId: string;
  mode: StripeMode;
  /** Server-side only, for the exact subscription join. */
  subscriptionId: string;
  planId: SellablePlanId;
  status: string;
  seatQuantity: number;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  terminal: boolean;
  nonterminal: boolean;
}

interface OperationEvidenceRow {
  operationId: string;
  accountId: string;
  mode: StripeMode;
  kind: string;
  subscriptionId: string;
  quoteId: string | null;
  reversesOperation: string | null;
  state: string;
  open: boolean;
}

interface OwnerBillingEvidence {
  entitlement: RawEntitlementEvidence;
  customers: CustomerEvidence[];
  subscriptions: SubscriptionEvidence[];
  operations: OperationEvidenceRow[];
  completedCheckoutScopes: string[];
  openCheckouts: number;
  /**
   * A row existed but could not be validated field by field, or a required
   * list could not be read completely. The owner-wide scan is then INCOMPLETE,
   * and every decision that depends on seeing all of it is held — including
   * discovery of an operation that looked fine on its own, because an
   * unreadable sibling could be hiding another applicable one.
   */
  malformed: boolean;
}

/**
 * The ONE coherent current agreement, when exactly one can be established.
 *
 * Action readiness, reversal eligibility and the displayed mode are all derived
 * from this and nothing else: a displayed live agreement may not borrow the
 * readiness of a configured test account, and two applicable scopes are an
 * ambiguity rather than a choice.
 */
interface ResolvedScope {
  accountId: string;
  mode: StripeMode;
  subscriptionId: string;
  projection: SubscriptionEvidence;
}

const scopeKey = (accountId: string, mode: string) => `${accountId}#${mode}`;

/**
 * One owner-wide, read-only pass over every relevant source.
 *
 * It reads ALL of the owner's scopes deliberately: narrowing the safety scan to
 * today's configured account and test mode would let an unresolved agreement in
 * another scope pass unseen, which is exactly the state the manual guard exists
 * to refuse.
 */
async function collectOwnerBillingEvidence(
  userId: string,
): Promise<{ ok: true; evidence: OwnerBillingEvidence } | Held> {
  if (!UUID.test(userId)) return { ok: false, reason: "request_invalid" };

  const entitlementRead = await readOwnerRows(
    "entitlements",
    "plan_id,status,provider,provider_customer_id,provider_subscription_id,current_period_end,cancel_at_period_end,updated_at",
    userId,
  );
  if (!entitlementRead.ok) return { ok: false, reason: entitlementRead.reason };
  const customerRead = await readOwnerRows(
    "stripe_customers",
    "account_id,mode,customer_id",
    userId,
  );
  if (!customerRead.ok) return { ok: false, reason: customerRead.reason };
  const subscriptionRead = await readOwnerRows(
    "stripe_subscriptions",
    "account_id,mode,subscription_id,plan_id,status,seat_quantity,current_period_end,cancel_at_period_end",
    userId,
  );
  if (!subscriptionRead.ok) return { ok: false, reason: subscriptionRead.reason };
  const operationRead = await readOwnerRows(
    "stripe_commercial_operations",
    "operation_id,account_id,mode,kind,subscription_id,quote_id,reverses_operation,state",
    userId,
  );
  if (!operationRead.ok) return { ok: false, reason: operationRead.reason };
  const checkoutRead = await readOwnerRows(
    "stripe_checkout_requests",
    "account_id,mode,kind,status",
    userId,
  );
  if (!checkoutRead.ok) return { ok: false, reason: checkoutRead.reason };

  let malformed = false;

  // More than one entitlement row for one owner is not a shape this product
  // has; it is an ambiguity, not a row to pick from.
  if (entitlementRead.rows.length > 1) malformed = true;
  const entitlementRow = entitlementRead.rows[0] ?? null;
  const entitlement: RawEntitlementEvidence = {
    present: false,
    valid: false,
    provider: null,
    planId: null,
    status: null,
    periodEnd: null,
    cancelAtPeriodEnd: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
  };
  if (entitlementRow) {
    entitlement.present = true;
    const provider = str(entitlementRow.provider);
    const planId = str(entitlementRow.plan_id);
    const status = str(entitlementRow.status);
    const cancelAtPeriodEnd = boolOf(entitlementRow.cancel_at_period_end);
    const periodEndPresent = entitlementRow.current_period_end != null;
    const periodEnd = periodEndPresent ? isoOf(entitlementRow.current_period_end) : null;
    const providerValid = RECOGNISED_PROVIDERS.has(provider);
    const planValid = isPlanId(planId);
    const statusValid = RECOGNISED_STATUSES.has(status as SubscriptionStatus);
    const periodValid = !periodEndPresent || periodEnd !== null;
    // The two provider identities are nullable in the schema, so present-null
    // is legitimate; a present non-string is not.
    const customerPresent = entitlementRow.provider_customer_id != null;
    const subscriptionPresent = entitlementRow.provider_subscription_id != null;
    const providerCustomerId = customerPresent ? str(entitlementRow.provider_customer_id) : "";
    const providerSubscriptionId = subscriptionPresent
      ? str(entitlementRow.provider_subscription_id)
      : "";
    const identityValid =
      (!customerPresent || providerCustomerId !== "") &&
      (!subscriptionPresent || providerSubscriptionId !== "");
    entitlement.provider = providerValid ? (provider as BillingProvider) : null;
    entitlement.planId = planValid ? (planId as PlanId) : null;
    entitlement.status = statusValid ? (status as SubscriptionStatus) : null;
    entitlement.periodEnd = periodEnd;
    entitlement.cancelAtPeriodEnd = cancelAtPeriodEnd;
    entitlement.providerCustomerId = providerCustomerId || null;
    entitlement.providerSubscriptionId = providerSubscriptionId || null;
    entitlement.valid =
      providerValid &&
      planValid &&
      statusValid &&
      periodValid &&
      identityValid &&
      cancelAtPeriodEnd !== null;
    if (!entitlement.valid) malformed = true;
  }

  const customers: CustomerEvidence[] = [];
  for (const row of customerRead.rows) {
    const accountId = str(row.account_id);
    const mode = modeOf(row.mode);
    const customerId = str(row.customer_id);
    // All three are NOT NULL in the schema; a missing one is unreadable.
    if (!accountId || !mode || !customerId) {
      malformed = true;
      continue;
    }
    customers.push({ accountId, mode, customerId });
  }

  const subscriptions: SubscriptionEvidence[] = [];
  for (const row of subscriptionRead.rows) {
    const accountId = str(row.account_id);
    const mode = modeOf(row.mode);
    const status = str(row.status);
    const subscriptionId = str(row.subscription_id);
    const planId = sellableOf(row.plan_id);
    const seatQuantity = intOf(row.seat_quantity);
    const cancelAtPeriodEnd = boolOf(row.cancel_at_period_end);
    const periodPresent = row.current_period_end != null;
    const periodEnd = periodPresent ? isoOf(row.current_period_end) : null;
    const terminal = TERMINAL_SUBSCRIPTION_STATUSES.has(status);
    const nonterminal = NONTERMINAL_SUBSCRIPTION_STATUSES.has(status);
    // Every one of these is NOT NULL with a CHECK in the frozen migration, so
    // an unrecognised plan, a string boolean, a missing seat count or an
    // unknown status is MALFORMED evidence — never normalised to absence and
    // never a terminal agreement. A real zero seat count stays a zero.
    if (
      !accountId ||
      !mode ||
      !subscriptionId ||
      !status ||
      planId === null ||
      seatQuantity === null ||
      cancelAtPeriodEnd === null ||
      (periodPresent && periodEnd === null) ||
      (!terminal && !nonterminal)
    ) {
      malformed = true;
      continue;
    }
    subscriptions.push({
      accountId,
      mode,
      subscriptionId,
      planId,
      status,
      seatQuantity,
      periodEnd,
      cancelAtPeriodEnd,
      terminal,
      nonterminal,
    });
  }

  const operations: OperationEvidenceRow[] = [];
  for (const row of operationRead.rows) {
    const operationId = uuidOf(row.operation_id);
    const accountId = str(row.account_id);
    const mode = modeOf(row.mode);
    const state = str(row.state);
    const kind = str(row.kind);
    const subscriptionId = str(row.subscription_id);
    const stateKnown = (COMMERCIAL_OPERATION_STATES as readonly string[]).includes(state);
    const kindKnown = (COMMERCIAL_OPERATION_KINDS as readonly string[]).includes(kind);
    // A present but malformed quote/reversal reference is unreadable evidence.
    // Normalising it to `null` would silently claim the operation has no quote
    // and no reversal relationship.
    const quotePresent = row.quote_id != null;
    const reversesPresent = row.reverses_operation != null;
    const quoteId = quotePresent ? uuidOf(row.quote_id) : null;
    const reversesOperation = reversesPresent ? uuidOf(row.reverses_operation) : null;
    if (
      !operationId ||
      !accountId ||
      !mode ||
      !stateKnown ||
      !kindKnown ||
      !subscriptionId ||
      (quotePresent && quoteId === null) ||
      (reversesPresent && reversesOperation === null)
    ) {
      malformed = true;
      continue;
    }
    operations.push({
      operationId,
      accountId,
      mode,
      kind,
      subscriptionId,
      quoteId,
      reversesOperation,
      state,
      open: !isTerminalOperationState(state),
    });
  }

  const completedCheckoutScopes: string[] = [];
  let openCheckouts = 0;
  for (const row of checkoutRead.rows) {
    const accountId = str(row.account_id);
    const mode = modeOf(row.mode);
    const status = str(row.status);
    const kind = str(row.kind);
    // The CHECK sets are finite. An unrecognised status is not "some other
    // resolved state" — it is evidence we cannot read.
    if (!accountId || !mode || !CHECKOUT_STATUSES.has(status) || !CHECKOUT_KINDS.has(kind)) {
      malformed = true;
      continue;
    }
    if (OPEN_CHECKOUT_STATUSES.has(status)) openCheckouts += 1;
    // A completed CHECKOUT implies a subscription should exist in its scope. A
    // completed PORTAL visit implies nothing of the sort.
    if (status === "completed" && kind === "checkout")
      completedCheckoutScopes.push(scopeKey(accountId, mode));
  }

  return {
    ok: true,
    evidence: {
      entitlement,
      customers,
      subscriptions,
      operations,
      completedCheckoutScopes,
      openCheckouts,
      malformed,
    },
  };
}

/**
 * The EXACT configured target this owner could currently mutate in.
 *
 * Mode alone is not the target. Two different Stripe accounts are both "test",
 * and the accepted mutation path resolves the configured account for the mode
 * it runs in — so advertising an action for an agreement that lives in another
 * account would point the customer at something those handlers cannot
 * legitimately touch. Account and mode travel together from here on.
 *
 * Unreadable configuration, the standing hold and the empty-by-default sandbox
 * allowlist all produce `null`.
 */
interface CommercialTarget {
  accountId: string;
  mode: StripeMode;
}

function commercialTargetFor(userId: string, env?: Env): CommercialTarget | null {
  try {
    const config = stripeLifecycleConfig(env ?? process.env);
    const mode: StripeMode | null = liveCommercialMutationsAllowed()
      ? "live"
      : config.sandboxOwners.has(userId.toLowerCase()) && config.checkoutReady("test")
        ? "test"
        : null;
    if (mode === null) return null;
    const accountId = config.accountIds[mode];
    return accountId ? { accountId, mode } : null;
  } catch {
    return null;
  }
}

export interface ManualEntitlementClearance {
  allowed: boolean;
  /** A finite local code. No provider text, id or operator detail. */
  reason: string;
}

/**
 * Resolve the single coherent current agreement, or nothing.
 *
 * A Stripe entitlement names the subscription and customer it claims, so the
 * join is exact: the projection must be the one it names, in a scope that also
 * holds the mapping it names. Without an entitlement pointer a single
 * projection with its own mapping is the scope. Two candidates, a pointer with
 * no matching projection, or a projection whose mapping is absent or disagrees
 * are all AMBIGUOUS, and ambiguity holds every action.
 */
function resolveCurrentScope(evidence: OwnerBillingEvidence): ResolvedScope | null {
  if (evidence.malformed) return null;
  const raw = evidence.entitlement;
  const named = raw.valid && raw.provider === "stripe" ? raw.providerSubscriptionId : null;
  const candidates =
    raw.valid && raw.provider === "stripe"
      ? named === null
        ? // A Stripe entitlement that names no subscription cannot be joined to
          // anything; that is missing evidence, not a free choice.
          []
        : evidence.subscriptions.filter((s) => s.subscriptionId === named)
      : evidence.subscriptions;
  if (candidates.length !== 1) return null;
  const projection = candidates[0];
  const mapping = evidence.customers.filter(
    (c) => c.accountId === projection.accountId && c.mode === projection.mode,
  );
  if (mapping.length !== 1) return null;
  if (raw.valid && raw.providerCustomerId && raw.providerCustomerId !== mapping[0].customerId)
    return null;
  return {
    accountId: projection.accountId,
    mode: projection.mode,
    subscriptionId: projection.subscriptionId,
    projection,
  };
}

/**
 * The evidence half of the manual/Free clearance decision.
 *
 * Conservative by construction: anything nonterminal, unresolved, orphaned,
 * unexplained, malformed or unreadable HOLDS. Age is never used — `observed_at`
 * and `updated_at` mean different things and neither certifies current provider
 * truth, so there is no invented freshness window here.
 *
 * What changed after review: a terminal projection *somewhere* is no longer
 * accepted as cover for a Stripe entitlement that names a different
 * subscription, a LIVE customer mapping with no lifecycle evidence behind it no
 * longer passes, and an operation whose subscription has no projection at all
 * is orphaned history rather than resolved history.
 */
function evidenceClearance(evidence: OwnerBillingEvidence): ManualEntitlementClearance {
  if (evidence.malformed) return { allowed: false, reason: "billing_state_unknown" };
  if (evidence.subscriptions.some((s) => s.nonterminal))
    return { allowed: false, reason: "stripe_subscription_unresolved" };
  if (evidence.operations.some((o) => o.open))
    return { allowed: false, reason: "commercial_operation_open" };
  if (evidence.openCheckouts > 0) return { allowed: false, reason: "checkout_unresolved" };

  const projected = new Set(evidence.subscriptions.map((s) => scopeKey(s.accountId, s.mode)));
  // A completed checkout whose scope has no projection row means the agreement
  // it created is unaccounted for. That is missing evidence, not absence.
  if (evidence.completedCheckoutScopes.some((scope) => !projected.has(scope)))
    return { allowed: false, reason: "billing_state_unknown" };

  // A LIVE customer mapping is a real provider relationship. Without any
  // lifecycle evidence in its own scope, what that relationship currently holds
  // is simply unknown. A test mapping alone stays clear, as the policy
  // explicitly requires.
  if (
    evidence.customers.some(
      (c) => c.mode === "live" && !projected.has(scopeKey(c.accountId, c.mode)),
    )
  )
    return { allowed: false, reason: "billing_state_unknown" };

  // Orphaned history: an operation — even a resolved one — names a
  // subscription that no projection accounts for.
  const subscriptionScopes = new Set(
    evidence.subscriptions.map((s) => `${scopeKey(s.accountId, s.mode)}#${s.subscriptionId}`),
  );
  if (
    evidence.operations.some(
      (o) => !subscriptionScopes.has(`${scopeKey(o.accountId, o.mode)}#${o.subscriptionId}`),
    )
  )
    return { allowed: false, reason: "billing_state_unknown" };

  // A raw Stripe entitlement needs the EXACT agreement it names to be present,
  // coherently terminal, and joined to the customer mapping it claims — and
  // the raw row itself must agree that the agreement has ended.
  //
  // Each clause closes a case an independent probe cleared: a still-granting
  // raw row beside a long-canceled projection, a terminal pointer whose only
  // mapping names a different customer, and a terminal pointer with no mapping
  // at all. A terminal projection somewhere is not an explanation for any of
  // them, and the forced owner endpoint reaches the manual write directly, so
  // this is the gate that has to hold.
  const raw = evidence.entitlement;
  if (raw.present && raw.provider === "stripe") {
    const named = raw.providerSubscriptionId;
    const terminal =
      named === null
        ? undefined
        : evidence.subscriptions.find((s) => s.subscriptionId === named && s.terminal);
    if (!terminal) return { allowed: false, reason: "stripe_entitlement_unresolved" };
    // A row that still grants paid access contradicts its own terminal
    // projection; which of the two is current is exactly what we cannot tell.
    if (rawEntitlementAccess(raw, "stripe") !== "free")
      return { allowed: false, reason: "stripe_entitlement_unresolved" };
    // Effective access is NOT the same question as agreement state. An
    // `active` row whose period has merely lapsed, a `pastDue` row and a
    // `checkoutPending` row all read as effective Free while the agreement
    // behind them is still unresolved — and age is explicitly never evidence
    // of termination. The raw status has to say the agreement ended too.
    if (!TERMINAL_RAW_STATUSES.has(raw.status ?? ""))
      return { allowed: false, reason: "stripe_entitlement_unresolved" };
    const mapping = evidence.customers.filter(
      (c) => c.accountId === terminal.accountId && c.mode === terminal.mode,
    );
    if (mapping.length !== 1) return { allowed: false, reason: "stripe_entitlement_unresolved" };
    if (raw.providerCustomerId !== null && raw.providerCustomerId !== mapping[0].customerId)
      return { allowed: false, reason: "stripe_entitlement_unresolved" };
  }
  // A present row that failed validation was already caught by `malformed`.
  return { allowed: true, reason: "clear" };
}

/**
 * The narrow guard the owner's manual beta/comped/reset must pass.
 *
 * It adds the existing read-only deletion barrier to the evidence decision.
 * The barrier returns `blocked: true` for an unreadable state as well, so
 * `ok: true` alone never permits a reset — and it is a READ, not an atomic lock
 * over a later manual upsert. That limit is deliberate and documented rather
 * than papered over with an invented one.
 */
export async function evaluateManualEntitlementClearance(
  userId: string,
): Promise<ManualEntitlementClearance> {
  const collected = await collectOwnerBillingEvidence(userId);
  if (!collected.ok) return { allowed: false, reason: collected.reason };
  const clearance = evidenceClearance(collected.evidence);
  if (!clearance.allowed) return clearance;
  const barrier = await readBillingDeletionBarrier(userId);
  if (barrier.blocked) return { allowed: false, reason: "billing_barrier_blocked" };
  return clearance;
}

/**
 * The display provider, from VALIDATED raw entitlement only.
 *
 * A test customer mapping never reclassifies a manual or Paddle account, and a
 * read that could not establish the provider says so instead of guessing
 * Paddle or Free.
 *
 * The ABSENCE claim is the delicate half. "No entitlement row" only means Free
 * when the rest of the owner-wide evidence is complete and contains nothing
 * that an absent row fails to explain. Any discarded malformed row, any
 * mapping, projection, operation — resolved or not — or any checkout history
 * makes absence unproven, and unproven is `unknown`, never Free.
 */
function displayProvider(evidence: OwnerBillingEvidence): BillingProvider {
  const raw = evidence.entitlement;
  if (raw.present) return raw.valid && raw.provider ? raw.provider : "unknown";
  const unexplained =
    evidence.malformed ||
    evidence.customers.length > 0 ||
    evidence.subscriptions.length > 0 ||
    evidence.operations.length > 0 ||
    evidence.completedCheckoutScopes.length > 0 ||
    evidence.openCheckouts > 0;
  return unexplained ? "unknown" : "none";
}

/** The effective access a VALIDATED raw row grants, independent of display. */
function rawEntitlementAccess(
  raw: RawEntitlementEvidence,
  provider: BillingProvider,
): BillingSummary["access"] {
  if (!raw.present) return "free";
  if (!raw.valid || !raw.planId || !raw.status) return "unknown";
  const entitlement: Entitlement = {
    planId: raw.planId,
    status: raw.status,
    currentPeriodEnd: raw.periodEnd ?? undefined,
    cancelAtPeriodEnd: raw.cancelAtPeriodEnd === true,
    provider,
  };
  return effectivePlanId(entitlement) === "freePreview" ? "free" : "paid";
}

function summaryAccess(
  raw: RawEntitlementEvidence,
  provider: BillingProvider,
): BillingSummary["access"] {
  if (provider === "unknown") return "unknown";
  return rawEntitlementAccess(raw, provider);
}

/**
 * Read the quote an open operation is bound to, in that operation's EXACT
 * owner/account/mode/subscription/kind scope.
 *
 * A same-owner UUID is not sufficient. A row carrying the right id but another
 * account, mode, subscription or kind is a different agreement's quote, and a
 * row already consumed by another operation is another operation's terms.
 * Either of those, a half-written consumption pair, or any unreadable required
 * term, is `"uncertain"`: the operation stays held with no fabricated original
 * terms and no replacement intent.
 *
 * Expiry is deliberately NOT a rejection here. A dispatched operation retains
 * its original terms past the preview deadline; the deadline never becomes
 * permission to regenerate the intent.
 */
async function readBoundQuoteTerms(
  userId: string,
  operation: OperationEvidenceRow,
): Promise<OperationTerms | null | "uncertain"> {
  const quoteId = operation.quoteId;
  if (!quoteId) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as ScopedClient)
      .from("stripe_commercial_quotes")
      .select(
        "account_id,mode,kind,subscription_id,target_plan_id,target_seat_quantity,direction,currency,amount_due,recurring_amount,effective_at,expires_at,consumed_at,consumed_by",
      )
      .eq("quote_id", quoteId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "uncertain";
    const record = data && typeof data === "object" ? (data as Json) : null;
    if (!record) return null;

    // The exact binding, before any term is read.
    if (
      str(record.account_id) !== operation.accountId ||
      modeOf(record.mode) !== operation.mode ||
      str(record.subscription_id) !== operation.subscriptionId ||
      str(record.kind) !== operation.kind
    )
      return "uncertain";

    // The accepted consumed/unconsumed contract: both columns are set together
    // and the consumer is THIS operation, or neither is set.
    const consumedAtPresent = record.consumed_at != null;
    const consumedByPresent = record.consumed_by != null;
    if (consumedAtPresent !== consumedByPresent) return "uncertain";
    if (consumedByPresent) {
      const consumer = uuidOf(record.consumed_by);
      if (consumer === null || consumer !== operation.operationId) return "uncertain";
      if (isoOf(record.consumed_at) === null) return "uncertain";
    }

    const planId = sellableOf(record.target_plan_id);
    const seatQuantity = intOf(record.target_seat_quantity);
    const amountMinor = intOf(record.amount_due);
    const recurringEstimateMinor = intOf(record.recurring_amount);
    const currencyText = str(record.currency);
    const currency = /^[a-z]{3}$/.test(currencyText) ? currencyText : null;
    const directionText = str(record.direction);
    const direction =
      directionText === "increase" || directionText === "decrease" ? directionText : null;
    const expiresAt = isoOf(record.expires_at);
    const effectivePresent = record.effective_at != null;
    const effectiveAt = effectivePresent ? isoOf(record.effective_at) : null;
    if (
      planId === null ||
      seatQuantity === null ||
      amountMinor === null ||
      recurringEstimateMinor === null ||
      currency === null ||
      direction === null ||
      expiresAt === null ||
      (effectivePresent && effectiveAt === null)
    )
      return "uncertain";

    return {
      planId,
      seatQuantity,
      amountMinor,
      recurringEstimateMinor,
      currency,
      direction,
      effectiveAt,
      expiresAt,
    };
  } catch {
    return "uncertain";
  }
}

/**
 * The caller-owned current summary and durable discovery.
 *
 * This is the ONE authoritative read for billing decisions in the UI.
 * `getMyEntitlementFn` is not a substitute: it turns a read failure into Free,
 * and the display mapper behind it normalises a malformed provider to Paddle
 * and an unknown plan to Free. Both are exactly wrong for a billing screen.
 *
 * The current BILLED AMOUNT is not in this schema and is therefore reported as
 * unknown. A catalogue price, the editable billing country, the store's
 * reconstructed `priceMonthly`, `latest_invoice_paid` and a previous quote are
 * all refused as substitutes: none of them is the customer's proven debit.
 */
export async function readCommercialAccountSummary(
  userId: string,
  deps: CommercialDeps = {},
): Promise<BillingSummaryResult> {
  const collected = await collectOwnerBillingEvidence(userId);
  if (!collected.ok) return { ok: false, reason: collected.reason };
  const evidence = collected.evidence;
  const provider = displayProvider(evidence);
  const access = summaryAccess(evidence.entitlement, provider);
  const target = commercialTargetFor(userId, deps.env);
  const mutationsAvailable = target !== null;

  // The one coherent current agreement, or nothing. Everything below that can
  // start or resume a mutation is derived from it.
  const scope = resolveCurrentScope(evidence);

  // Discovery. More than one open operation, an unreadable binding, or ANY
  // incomplete owner-wide scan is held: an unreadable sibling row could be
  // hiding a second applicable operation.
  const open = evidence.operations.filter((o) => o.open);
  let operationEvidence: OperationEvidence = open.length === 0 ? "none" : "open";
  let operation: DiscoveredOperation | null = null;
  if (evidence.malformed) operationEvidence = "unknown";
  else if (open.length > 1) operationEvidence = "ambiguous";
  else if (open.length === 1) {
    const found = open[0];
    const read = await readBoundQuoteTerms(userId, found);
    if (read === "uncertain") operationEvidence = "unknown";
    else if (read === null && found.quoteId !== null) operationEvidence = "ambiguous";
    else
      operation = {
        operationId: found.operationId,
        kind: found.kind,
        state: found.state,
        quoteId: found.quoteId,
        cancelOperationId: found.reversesOperation,
        terms: read,
      };
  }

  // Reversal eligibility: the EXACT applied cancellation of the CURRENT
  // agreement, in that same account/mode/subscription, while the projection is
  // still nonterminal and actually scheduled to cancel, with no reversal —
  // resolved or open — already pointing at it.
  const inScope = scope
    ? evidence.operations.filter(
        (o) =>
          o.accountId === scope.accountId &&
          o.mode === scope.mode &&
          o.subscriptionId === scope.subscriptionId,
      )
    : [];
  const reversed = new Set(
    inScope
      .filter((o) => o.kind === "reverse_cancel" && o.reversesOperation)
      .map((o) => o.reversesOperation as string),
  );
  const reversalPending = inScope.some((o) => o.kind === "reverse_cancel" && o.open);
  const cancellationEligible =
    scope !== null &&
    !evidence.malformed &&
    scope.projection.nonterminal &&
    scope.projection.cancelAtPeriodEnd &&
    !reversalPending;
  const appliedCancellations = cancellationEligible
    ? inScope.filter(
        (o) => o.kind === "cancel" && o.state === "applied" && !reversed.has(o.operationId),
      )
    : [];
  const eligibleCancellationId =
    appliedCancellations.length === 1 ? appliedCancellations[0].operationId : null;

  const clearance = evidenceClearance(evidence);
  const barrier = clearance.allowed ? await readBillingDeletionBarrier(userId) : null;
  const manualOverride = clearance.allowed && barrier !== null && !barrier.blocked;

  // Readiness belongs to the resolved scope AND the configured target, not to
  // the configuration in general: a displayed live agreement may not borrow a
  // configured test account's readiness, two accounts that happen to share a
  // mode are still two accounts, and an ambiguous scope offers nothing.
  const scopeActionable =
    scope !== null &&
    target !== null &&
    scope.mode === target.mode &&
    scope.accountId === target.accountId;
  const changesPossible =
    scopeActionable && provider === "stripe" && operationEvidence === "none" && !evidence.malformed;

  // Recovery targets one exact operation, so it must live in the configured
  // account and mode AND belong to the resolved current agreement. A lone open
  // operation with no entitlement, mapping or projection behind it has no
  // agreement to recover against.
  const openOperation = open.length === 1 ? open[0] : undefined;
  const recoverable =
    operationEvidence === "open" &&
    operation !== null &&
    openOperation !== undefined &&
    target !== null &&
    scope !== null &&
    openOperation.accountId === target.accountId &&
    openOperation.mode === target.mode &&
    openOperation.accountId === scope.accountId &&
    openOperation.mode === scope.mode &&
    openOperation.subscriptionId === scope.subscriptionId;

  const actions: BillingSummaryActions = {
    paddlePortal: provider === "paddle",
    prepareChange: changesPossible && access === "paid",
    cancel: changesPossible && access === "paid",
    reverseCancellation: changesPossible && eligibleCancellationId !== null,
    recoverOperation: recoverable,
    manualOverride,
  };

  const heldReason = !mutationsAvailable
    ? "held"
    : operationEvidence === "ambiguous"
      ? "operation_conflict"
      : operationEvidence === "unknown"
        ? "operation_unavailable"
        : provider === "unknown"
          ? "billing_state_unknown"
          : provider === "stripe" && !scopeActionable
            ? "subscription_mapping_uncertain"
            : operationEvidence === "open" && !recoverable
              ? "subscription_mapping_uncertain"
              : null;

  return {
    ok: true,
    summary: {
      provider,
      mode: scope ? scope.mode : null,
      planId: evidence.entitlement.valid ? evidence.entitlement.planId : null,
      access,
      status: evidence.entitlement.valid ? evidence.entitlement.status : null,
      purchasedSeats: provider === "stripe" && scope ? scope.projection.seatQuantity : null,
      periodEnd: evidence.entitlement.valid ? evidence.entitlement.periodEnd : null,
      cancelAtPeriodEnd: evidence.entitlement.valid ? evidence.entitlement.cancelAtPeriodEnd : null,
      // No local source of the customer's proven debit exists. See above.
      currentAmountMinor: null,
      currentCurrency: null,
      currentAmountEvidence: "unknown",
      operation,
      operationEvidence,
      eligibleCancellationId,
      actions,
      heldReason,
    },
  };
}

export { StripeLifecycleError as StripeCommercialError };
