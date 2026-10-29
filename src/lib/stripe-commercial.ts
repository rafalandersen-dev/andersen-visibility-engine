/**
 * Stripe COMMERCIAL operations — pure, client+server safe decisions.
 *
 * No network, no database, no secrets, no amounts invented. Everything here
 * fails CLOSED: an unknown market, an unapproved seat currency, an item state
 * that cannot be read exactly, an ambiguous payment allocation, an unrecognised
 * refund status or a capacity conflict all resolve to a HOLD, never to a
 * mutation and never to a wider allowance.
 *
 * Three rules this module exists to make unavoidable:
 *
 *  1. MONEY IS THE PROVIDER'S. Every amount compared here comes from a
 *     provider object or from the owner-approved catalogue in `billing.ts`.
 *     Nothing converts a currency, derives a non-EUR seat price from an example
 *     market ratio, or re-states a price Stripe owns.
 *
 *  2. EVIDENCE IS NOT A BOOLEAN. A refund outcome, a payment allocation and an
 *     item state each have an explicit "unknown" that is neither success nor
 *     failure, exactly like the foundation's invoice evidence.
 *
 *  3. THE CALLER IS NOT AUTHORITY. Nothing in this module accepts a customer,
 *     account, subscription, price, owner or amount from a client; the server
 *     resolves those and passes them in.
 */
import {
  MARKET_CURRENCY,
  PLAN_LIMITS,
  PLAN_PRICING,
  PLAN_SEATS,
  deriveBillingMarket,
  type BillingMarket,
  type PlanId,
} from "./billing";
import {
  STRIPE_SEAT_CURRENCY,
  livemodeFor,
  type PriceRegistryEntry,
  type StripeMode,
} from "./stripe-lifecycle";

/* -------------------------------------------------------------------------- */
/* Operation vocabulary                                                       */
/* -------------------------------------------------------------------------- */

export const COMMERCIAL_OPERATION_KINDS = [
  "plan_change",
  "seat_change",
  "cancel",
  "reverse_cancel",
  "refund",
] as const;
export type CommercialOperationKind = (typeof COMMERCIAL_OPERATION_KINDS)[number];

/** Mirrors the SQL CHECK exactly. `fenced` is non-terminal on purpose. */
export const COMMERCIAL_OPERATION_STATES = [
  "prepared",
  "dispatching",
  "awaiting_payment",
  "awaiting_apply",
  "fenced",
  "applied",
  "refused",
  "failed",
] as const;
export type CommercialOperationState = (typeof COMMERCIAL_OPERATION_STATES)[number];

const TERMINAL_OPERATION_STATES: ReadonlySet<string> = new Set(["applied", "refused", "failed"]);
export function isTerminalOperationState(state: unknown): boolean {
  return typeof state === "string" && TERMINAL_OPERATION_STATES.has(state);
}
/** The states that hold the owner's single operation slot AND the projection
 * gate. Anything unrecognised is treated as open, because an unreadable state
 * must not release a slot. */
export function isOpenOperationState(state: unknown): boolean {
  return !isTerminalOperationState(state);
}

/** Plan order. Used ONLY to decide whether something would widen an allowance;
 * it is not a price and not a feature list. Mirrors
 * `stripe_commercial_plan_rank`. */
export const PLAN_RANK: Record<PlanId, number> = {
  freePreview: 0,
  starter: 1,
  growth: 2,
  pro: 3,
  agency: 4,
};
export function planRank(planId: unknown): number {
  return typeof planId === "string" && planId in PLAN_RANK ? PLAN_RANK[planId as PlanId] : -1;
}

/* -------------------------------------------------------------------------- */
/* Markets, currencies and the approved catalogue                             */
/* -------------------------------------------------------------------------- */

/**
 * Currencies this packet can compare against the approved catalogue, with their
 * minor-unit exponent. All five billing markets are two-decimal, and an
 * unlisted currency (including every zero-decimal currency) is an explicit
 * refusal rather than a guessed exponent — getting that wrong would be a
 * hundredfold pricing error.
 */
export const SUPPORTED_CURRENCY_EXPONENT: Record<string, number> = {
  eur: 2,
  pln: 2,
  sek: 2,
  dkk: 2,
  gbp: 2,
};

export function toMinorUnits(
  amount: number,
  currency: string,
): { ok: true; minor: number } | { ok: false; reason: string } {
  const exponent = SUPPORTED_CURRENCY_EXPONENT[currency.toLowerCase()];
  if (exponent === undefined) return { ok: false, reason: "currency_unsupported" };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: "amount_invalid" };
  const minor = Math.round(amount * 10 ** exponent);
  // The catalogue holds whole units, so a value that does not round-trip is a
  // catalogue fault, not something to absorb silently.
  if (Math.abs(minor / 10 ** exponent - amount) > 1e-9)
    return { ok: false, reason: "amount_not_representable" };
  return { ok: true, minor };
}

/**
 * The market a paid change may be priced in, resolved on the SERVER from the
 * caller's PERSISTED billing country.
 *
 * `workspace_meta.billing_profile` is user-editable, so the country is
 * validated here and the derived market is compared with the currency the paid
 * subscription is actually locked to. An unknown or review-flagged market, or
 * any attempt to move to a different currency, is HELD — a currency switch on
 * an existing subscription is not a price change this packet performs.
 */
export type MarketResolution =
  { ok: true; market: BillingMarket; currency: string } | { ok: false; reason: string };

export function resolveServerMarket(input: {
  billingCountry: string | null | undefined;
  needsReview: boolean;
  /** Lowercase ISO currency observed on the LOCKED paid subscription's items. */
  lockedCurrency: string | null;
}): MarketResolution {
  if (input.needsReview) return { ok: false, reason: "market_review_required" };
  const country = (input.billingCountry ?? "").trim().toUpperCase();
  // "Not listed" and "absent" are both unknown: neither may pick a market.
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, reason: "billing_country_unknown" };
  const market = deriveBillingMarket(country);
  const currency = (MARKET_CURRENCY[market] ?? "").toLowerCase();
  if (!(currency in SUPPORTED_CURRENCY_EXPONENT))
    return { ok: false, reason: "currency_unsupported" };
  if (input.lockedCurrency && input.lockedCurrency.toLowerCase() !== currency)
    return { ok: false, reason: "currency_switch_held" };
  return { ok: true, market, currency };
}

/**
 * Whether extra working seats may be SOLD in this market.
 *
 * The owner approved extra working seats at EUR 15/15/12/10 only. The research
 * document's "suggested market scaling" is an example, explicitly not approved
 * numbers, so a PLN/SEK/DKK/GBP seat price would have to be invented — which is
 * refused here instead. The plan itself may still be changed in those markets;
 * only the seat ITEM is unavailable.
 */
export function seatMarketSupported(market: BillingMarket): boolean {
  return (MARKET_CURRENCY[market] ?? "").toLowerCase() === STRIPE_SEAT_CURRENCY;
}

/** The owner-approved extra working seat price for a plan, in EUR whole units,
 * or null where the plan has none (Free Preview). */
export function approvedSeatPriceEur(planId: PlanId): number | null {
  return PLAN_SEATS[planId]?.extraWorkingSeatEur ?? null;
}

/**
 * Validate what is CONFIGURED at the provider against the owner-approved terms,
 * before a quote may be issued or confirmed.
 *
 * A configured price whose currency, product, recurrence or AMOUNT disagrees
 * with the approved catalogue is a configuration error: it must never be sold,
 * and it must never be "corrected" here. The amount comes from the provider's
 * own price object; the expectation comes from `PLAN_PRICING` / `PLAN_SEATS`.
 */
export type TermsCheck = { ok: true } | { ok: false; reason: string };

export function validateBaseTerms(input: {
  planId: PlanId;
  market: BillingMarket;
  entry: PriceRegistryEntry;
  providerAmountMinor: unknown;
  providerCurrency: unknown;
  providerProductId: unknown;
  providerActive: unknown;
  providerInterval: unknown;
  providerIntervalCount: unknown;
}): TermsCheck {
  const expectedCurrency = (MARKET_CURRENCY[input.market] ?? "").toLowerCase();
  const catalogue = (PLAN_PRICING[input.market] ?? PLAN_PRICING.Other)[input.planId];
  if (!(typeof catalogue === "number") || catalogue <= 0)
    return { ok: false, reason: "plan_not_sellable" };
  const expected = toMinorUnits(catalogue, expectedCurrency);
  if (!expected.ok) return { ok: false, reason: `expected_${expected.reason}` };
  if (input.entry.planId !== input.planId) return { ok: false, reason: "price_plan_mismatch" };
  if (input.entry.currency !== expectedCurrency)
    return { ok: false, reason: "configured_currency_unapproved" };
  if (input.providerActive !== true) return { ok: false, reason: "price_inactive" };
  if (
    typeof input.providerCurrency !== "string" ||
    input.providerCurrency.toLowerCase() !== expectedCurrency
  )
    return { ok: false, reason: "provider_currency_mismatch" };
  if (input.providerProductId !== input.entry.productId)
    return { ok: false, reason: "provider_product_mismatch" };
  if (input.providerInterval !== input.entry.interval)
    return { ok: false, reason: "provider_interval_mismatch" };
  if ((input.providerIntervalCount ?? 1) !== input.entry.intervalCount)
    return { ok: false, reason: "provider_interval_count_mismatch" };
  if (
    typeof input.providerAmountMinor !== "number" ||
    !Number.isInteger(input.providerAmountMinor) ||
    input.providerAmountMinor !== expected.minor
  )
    return { ok: false, reason: "provider_amount_unapproved" };
  return { ok: true };
}

export function validateSeatTerms(input: {
  planId: PlanId;
  market: BillingMarket;
  entry: PriceRegistryEntry;
  providerAmountMinor: unknown;
  providerCurrency: unknown;
  providerProductId: unknown;
  providerActive: unknown;
  providerInterval: unknown;
  providerIntervalCount: unknown;
}): TermsCheck {
  if (!seatMarketSupported(input.market)) return { ok: false, reason: "seat_market_unapproved" };
  const approved = approvedSeatPriceEur(input.planId);
  if (approved === null) return { ok: false, reason: "seat_plan_unapproved" };
  const expected = toMinorUnits(approved, STRIPE_SEAT_CURRENCY);
  if (!expected.ok) return { ok: false, reason: `expected_${expected.reason}` };
  if (input.entry.planId !== input.planId) return { ok: false, reason: "price_plan_mismatch" };
  if (input.entry.kind !== "seat") return { ok: false, reason: "price_kind_mismatch" };
  if (input.entry.currency !== STRIPE_SEAT_CURRENCY)
    return { ok: false, reason: "configured_currency_unapproved" };
  if (input.providerActive !== true) return { ok: false, reason: "price_inactive" };
  if (
    typeof input.providerCurrency !== "string" ||
    input.providerCurrency.toLowerCase() !== STRIPE_SEAT_CURRENCY
  )
    return { ok: false, reason: "provider_currency_mismatch" };
  if (input.providerProductId !== input.entry.productId)
    return { ok: false, reason: "provider_product_mismatch" };
  if (input.providerInterval !== input.entry.interval)
    return { ok: false, reason: "provider_interval_mismatch" };
  if ((input.providerIntervalCount ?? 1) !== input.entry.intervalCount)
    return { ok: false, reason: "provider_interval_count_mismatch" };
  if (
    typeof input.providerAmountMinor !== "number" ||
    !Number.isInteger(input.providerAmountMinor) ||
    input.providerAmountMinor !== expected.minor
  )
    return { ok: false, reason: "provider_amount_unapproved" };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* The exact current item state                                               */
/* -------------------------------------------------------------------------- */

export interface CommercialItem {
  /** The EXISTING subscription item id. An update must reuse it; adding a
   * second base item instead would double-bill the plan. */
  itemId: string;
  priceId: string;
  productId: string;
  currency: string;
  interval: string;
  intervalCount: number;
  quantity: number;
  kind: "base" | "seat";
  planId: PlanId;
  currentPeriodStart: number;
  currentPeriodEnd: number;
}

export interface CommercialSubscriptionState {
  subscriptionId: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: number | null;
  currency: string;
  collectionMethod: string;
  planId: PlanId;
  seatQuantity: number;
  base: CommercialItem;
  seat: CommercialItem | null;
  currentPeriodEnd: number;
  /** A provider-side payment-dependent update already in flight. Any value
   * other than "absent" blocks a new change. */
  pendingUpdate: "absent" | "present" | "unknown";
  /** A subscription schedule already attached. An existing schedule we did not
   * create is a conflict, not something to overwrite. */
  scheduleId: string | null;
  latestInvoiceId: string | null;
}

export type ItemStateResult =
  { ok: true; value: CommercialSubscriptionState } | { ok: false; reason: string };

function idOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string")
    return (value as { id: string }).id.trim();
  return "";
}
function unixSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1e11
    ? value
    : null;
}
function integerIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9_]+$/;
const ITEM_ID = /^si_[A-Za-z0-9_]+$/;

/**
 * Read the EXACT current item state a change must be built from.
 *
 * Stricter than the foundation's `readSubscriptionEvidence` on purpose: that one
 * answers "may this grant?", this one answers "may this be MUTATED?". A mutation
 * needs the real subscription item ids, so an unreadable item id, a paginated
 * item list, an unexpected second base item, a pending update, an attached
 * schedule or an unrecognised collection method all refuse the whole read.
 */
export function readCommercialSubscriptionState(input: {
  raw: unknown;
  mode: StripeMode;
  customerId: string;
  registry: ReadonlyMap<string, PriceRegistryEntry>;
  nowSeconds: number;
}): ItemStateResult {
  const { raw, mode, customerId, registry, nowSeconds } = input;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "subscription_unreadable" };
  const subscription = raw as Record<string, unknown>;
  if (subscription.object !== undefined && subscription.object !== "subscription")
    return { ok: false, reason: "subscription_object" };
  const subscriptionId = idOf(subscription.id);
  if (!SUBSCRIPTION_ID.test(subscriptionId)) return { ok: false, reason: "subscription_id" };
  if (subscription.livemode !== livemodeFor(mode))
    return { ok: false, reason: "subscription_mode" };
  if (!customerId || idOf(subscription.customer) !== customerId)
    return { ok: false, reason: "subscription_customer" };
  const status = typeof subscription.status === "string" ? subscription.status : "";
  if (!status) return { ok: false, reason: "subscription_status_unknown" };
  if (typeof subscription.cancel_at_period_end !== "boolean")
    return { ok: false, reason: "subscription_cancel_flag" };
  const currency =
    typeof subscription.currency === "string" ? subscription.currency.toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(currency)) return { ok: false, reason: "subscription_currency" };
  // `send_invoice` subscriptions dun and prorate differently; this packet does
  // not change a payment cycle or a collection method it has not verified.
  if (subscription.collection_method !== "charge_automatically")
    return { ok: false, reason: "collection_method_unsupported" };

  const pendingRaw = subscription.pending_update;
  const pendingUpdate: CommercialSubscriptionState["pendingUpdate"] =
    pendingRaw === null || pendingRaw === undefined
      ? "absent"
      : typeof pendingRaw === "object"
        ? "present"
        : "unknown";

  const scheduleId = idOf(subscription.schedule) || null;
  if (subscription.schedule !== undefined && subscription.schedule !== null && !scheduleId)
    return { ok: false, reason: "schedule_unreadable" };

  const itemList = (subscription.items ?? null) as Record<string, unknown> | null;
  if (!itemList || typeof itemList !== "object") return { ok: false, reason: "items_unreadable" };
  if (itemList.object !== undefined && itemList.object !== "list")
    return { ok: false, reason: "items_object" };
  // A full page is treated as incomplete, exactly as the foundation does.
  if (itemList.has_more !== false) return { ok: false, reason: "items_incomplete" };
  const rows = Array.isArray(itemList.data) ? (itemList.data as Record<string, unknown>[]) : null;
  if (rows === null) return { ok: false, reason: "items_data_missing" };
  if (rows.length < 1 || rows.length > 2) return { ok: false, reason: "items_unexpected_count" };

  let base: CommercialItem | null = null;
  let seat: CommercialItem | null = null;
  let periodEnd = Number.POSITIVE_INFINITY;
  const seenItems = new Set<string>();

  for (const row of rows) {
    const itemId = idOf(row.id);
    if (!ITEM_ID.test(itemId)) return { ok: false, reason: "item_id_unreadable" };
    if (seenItems.has(itemId)) return { ok: false, reason: "item_duplicate" };
    seenItems.add(itemId);
    const price = (row.price ?? {}) as Record<string, unknown>;
    const recurring = (price.recurring ?? {}) as Record<string, unknown>;
    const entry = registry.get(idOf(price.id));
    if (!entry) return { ok: false, reason: "item_unknown_price" };
    if (idOf(price.product) !== entry.productId)
      return { ok: false, reason: "item_unknown_product" };
    const itemCurrency = typeof price.currency === "string" ? price.currency.toLowerCase() : "";
    if (itemCurrency !== entry.currency || itemCurrency !== currency)
      return { ok: false, reason: "item_currency_mismatch" };
    if (recurring.interval !== entry.interval)
      return { ok: false, reason: "item_interval_mismatch" };
    if ((recurring.interval_count ?? 1) !== entry.intervalCount)
      return { ok: false, reason: "item_interval_count_mismatch" };
    const quantity = integerIn(row.quantity, 1, 1000);
    if (quantity === null) return { ok: false, reason: "item_quantity_unreadable" };
    const start = unixSeconds(row.current_period_start);
    const end = unixSeconds(row.current_period_end);
    if (start === null || end === null || end <= start)
      return { ok: false, reason: "item_period_missing" };
    if (end <= nowSeconds) return { ok: false, reason: "item_period_elapsed" };
    periodEnd = Math.min(periodEnd, end);

    const item: CommercialItem = {
      itemId,
      priceId: entry.priceId,
      productId: entry.productId,
      currency: entry.currency,
      interval: entry.interval,
      intervalCount: entry.intervalCount,
      quantity,
      kind: entry.kind,
      planId: entry.planId,
      currentPeriodStart: start,
      currentPeriodEnd: end,
    };
    if (entry.kind === "base") {
      if (base) return { ok: false, reason: "item_duplicate_base" };
      // The base quantity is ALWAYS 1. Anything else means the base is being
      // multiplied, which no approved plan does.
      if (quantity !== 1) return { ok: false, reason: "item_base_quantity" };
      base = item;
    } else {
      if (seat) return { ok: false, reason: "item_duplicate_seat" };
      seat = item;
    }
  }

  if (!base) return { ok: false, reason: "item_base_missing" };
  if (seat && seat.planId !== base.planId) return { ok: false, reason: "item_seat_plan_mismatch" };
  if (!Number.isFinite(periodEnd)) return { ok: false, reason: "item_period_missing" };

  return {
    ok: true,
    value: {
      subscriptionId,
      customerId,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: unixSeconds(subscription.cancel_at),
      currency,
      collectionMethod: "charge_automatically",
      planId: base.planId,
      seatQuantity: seat?.quantity ?? 0,
      base,
      seat,
      currentPeriodEnd: periodEnd,
      pendingUpdate,
      scheduleId,
      latestInvoiceId: idOf(subscription.latest_invoice) || null,
    },
  };
}

/**
 * A stable, order-independent fingerprint of the exact state a quote was
 * computed against. A quote whose fingerprint no longer matches is STALE — the
 * items, status, period, pending update or schedule moved under it — which is a
 * different failure from a tampered quote and is reported as such.
 */
export function itemStateFingerprintInput(state: CommercialSubscriptionState): string {
  const items = [state.base, state.seat]
    .filter((item): item is CommercialItem => item !== null)
    .map((item) => `${item.itemId}|${item.priceId}|${item.quantity}|${item.currentPeriodEnd}`)
    .sort()
    .join(";");
  return [
    state.subscriptionId,
    state.status,
    state.currency,
    String(state.cancelAtPeriodEnd),
    String(state.currentPeriodEnd),
    state.pendingUpdate,
    state.scheduleId ?? "-",
    // The latest invoice is part of the state so a STALE quote is detected: the
    // fingerprint answers "is this still the state the quote was priced
    // against?".
    //
    // It is deliberately NOT evidence about a dispatch. An unchanged
    // fingerprint after an unknown-outcome POST is UNKNOWN, not proof that the
    // mutation did not happen: a concurrent provider request may still be in
    // flight, and the provider is not required to have published the result by
    // the time this read returns. Settling such an attempt `failed` would
    // release the projection gate for a change that then lands.
    state.latestInvoiceId ?? "-",
    items,
  ].join("#");
}

/** The exact selection a confirmation must repeat: the target plan and seat
 * count plus the EXISTING item ids and prices the update will name. The stable
 * proration date is deliberately not part of this input — it lives in the
 * durable quote, which is the only authority for it. */
export interface CommercialSelection {
  targetPlanId: PlanId;
  targetSeatQuantity: number;
  baseItemId: string;
  basePriceId: string;
  seatItemId: string | null;
  seatPriceId: string | null;
}

export function selectionFingerprintInput(input: CommercialSelection): string {
  return [
    input.targetPlanId,
    String(input.targetSeatQuantity),
    input.baseItemId,
    input.basePriceId,
    input.seatItemId ?? "-",
    input.seatPriceId ?? "-",
  ].join("#");
}

/**
 * Read back the canonical selection recorded DURABLY on the operation.
 *
 * Recovery needs the exact item ids, prices and quantities the customer
 * confirmed — not a selection rebuilt from the current subscription and the
 * current configuration, which would happily "match" items that were never
 * quoted. The parse is strict and round-trips through the canonical form, so a
 * truncated, re-ordered or hand-edited value is rejected rather than
 * half-understood.
 */
export function parseSelectionDetail(detail: unknown): CommercialSelection | null {
  if (typeof detail !== "string" || !detail) return null;
  const parts = detail.split("#");
  if (parts.length !== 6) return null;
  const [plan, seats, baseItemId, basePriceId, seatItemId, seatPriceId] = parts;
  if (planRank(plan) < 1) return null;
  if (!/^\d{1,4}$/.test(seats)) return null;
  const targetSeatQuantity = Number(seats);
  if (targetSeatQuantity > 1000) return null;
  if (!baseItemId || baseItemId === "-" || !basePriceId || basePriceId === "-") return null;
  const selection: CommercialSelection = {
    targetPlanId: plan as PlanId,
    targetSeatQuantity,
    baseItemId,
    basePriceId,
    seatItemId: seatItemId === "-" ? null : seatItemId,
    seatPriceId: seatPriceId === "-" ? null : seatPriceId,
  };
  // A seat quantity above zero must name a seat price, and a zero-seat selection
  // must not name one.
  if (targetSeatQuantity > 0 !== (selection.seatPriceId !== null)) return null;
  return selectionFingerprintInput(selection) === detail ? selection : null;
}

/* -------------------------------------------------------------------------- */
/* The CATALOGUE-FREE snapshot that recovery is allowed to depend on           */
/* -------------------------------------------------------------------------- */

/**
 * One subscription item as the PROVIDER reports it, with no catalogue lookup.
 *
 * `readCommercialSubscriptionState` above refuses an item whose price is not in
 * today's approved registry, which is exactly right for pricing a FRESH intent:
 * nothing may be sold at a price the catalogue does not recognise. It is exactly
 * wrong for RECOVERY. An operation the customer already confirmed carries its
 * own prices durably, and those prices were approved when the quote was issued;
 * if the catalogue is later rotated or an entry removed, a recovery that insists
 * on registry membership can no longer read the subscription at all and the
 * operation's slot and the projection gate stay held forever.
 *
 * So recovery compares the provider's RAW price ids against the ids recorded in
 * the operation's own canonical selection. That is strictly stronger than the
 * plan comparison it replaces — a plan is derived from a price id, so proving
 * the exact price id proves the plan — and it depends on nothing mutable.
 */
export interface CommercialItemSnapshot {
  itemId: string;
  priceId: string;
  quantity: number;
  currentPeriodStart: number;
  currentPeriodEnd: number;
}

export interface CommercialSubscriptionSnapshot {
  subscriptionId: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: number | null;
  currency: string;
  collectionMethod: string;
  /** Every item, in the provider's own order. One or two, as the approved
   * shapes allow. */
  items: CommercialItemSnapshot[];
  /** The earliest item period end, which is the boundary a reduction is scoped
   * to. Recovery does NOT take its boundary from here — that comes from the
   * durable payload — but a fresh intent does. */
  currentPeriodEnd: number;
  pendingUpdate: "absent" | "present" | "unknown";
  scheduleId: string | null;
  latestInvoiceId: string | null;
}

export type SnapshotResult =
  { ok: true; value: CommercialSubscriptionSnapshot } | { ok: false; reason: string };

/**
 * Read the authoritative subscription WITHOUT consulting the price catalogue.
 *
 * Every identity and structural check the strict reader makes is kept: object
 * discriminator, id shape, `livemode`, the expected customer, a known status, a
 * readable cancellation flag, a three-letter currency, `charge_automatically`
 * collection, a complete item list of one or two readable items with integer
 * quantities and present periods, no duplicate item ids, a readable schedule
 * link and a classifiable `pending_update`.
 *
 * The ONLY thing it does not do is map a price to a plan — and an elapsed item
 * period is reported rather than refused, because a recovery after a period
 * rollover is precisely when it is needed.
 */
export function readCommercialSubscriptionSnapshot(input: {
  raw: unknown;
  mode: StripeMode;
  customerId: string;
}): SnapshotResult {
  const { raw, mode, customerId } = input;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "subscription_unreadable" };
  const subscription = raw as Record<string, unknown>;
  if (subscription.object !== undefined && subscription.object !== "subscription")
    return { ok: false, reason: "subscription_object" };
  const subscriptionId = idOf(subscription.id);
  if (!SUBSCRIPTION_ID.test(subscriptionId)) return { ok: false, reason: "subscription_id" };
  if (subscription.livemode !== livemodeFor(mode))
    return { ok: false, reason: "subscription_mode" };
  if (!customerId || idOf(subscription.customer) !== customerId)
    return { ok: false, reason: "subscription_customer" };
  const status = typeof subscription.status === "string" ? subscription.status : "";
  if (!status) return { ok: false, reason: "subscription_status_unknown" };
  if (typeof subscription.cancel_at_period_end !== "boolean")
    return { ok: false, reason: "subscription_cancel_flag" };
  const currency =
    typeof subscription.currency === "string" ? subscription.currency.toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(currency)) return { ok: false, reason: "subscription_currency" };
  if (subscription.collection_method !== "charge_automatically")
    return { ok: false, reason: "collection_method_unsupported" };

  const pendingRaw = subscription.pending_update;
  const pendingUpdate: CommercialSubscriptionSnapshot["pendingUpdate"] =
    pendingRaw === null || pendingRaw === undefined
      ? "absent"
      : typeof pendingRaw === "object"
        ? "present"
        : "unknown";

  const scheduleId = idOf(subscription.schedule) || null;
  if (subscription.schedule !== undefined && subscription.schedule !== null && !scheduleId)
    return { ok: false, reason: "schedule_unreadable" };

  const itemList = (subscription.items ?? null) as Record<string, unknown> | null;
  if (!itemList || typeof itemList !== "object") return { ok: false, reason: "items_unreadable" };
  if (itemList.object !== undefined && itemList.object !== "list")
    return { ok: false, reason: "items_object" };
  if (itemList.has_more !== false) return { ok: false, reason: "items_incomplete" };
  const rows = Array.isArray(itemList.data) ? (itemList.data as Record<string, unknown>[]) : null;
  if (rows === null) return { ok: false, reason: "items_data_missing" };
  if (rows.length < 1 || rows.length > 2) return { ok: false, reason: "items_unexpected_count" };

  const items: CommercialItemSnapshot[] = [];
  const seen = new Set<string>();
  let periodEnd = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const itemId = idOf(row.id);
    if (!ITEM_ID.test(itemId)) return { ok: false, reason: "item_id_unreadable" };
    if (seen.has(itemId)) return { ok: false, reason: "item_duplicate" };
    seen.add(itemId);
    const price = (row.price ?? {}) as Record<string, unknown>;
    const priceId = idOf(price.id);
    if (!priceId) return { ok: false, reason: "item_price_unreadable" };
    const quantity = integerIn(row.quantity, 1, 1000);
    if (quantity === null) return { ok: false, reason: "item_quantity_unreadable" };
    const start = unixSeconds(row.current_period_start);
    const end = unixSeconds(row.current_period_end);
    if (start === null || end === null || end <= start)
      return { ok: false, reason: "item_period_missing" };
    periodEnd = Math.min(periodEnd, end);
    items.push({ itemId, priceId, quantity, currentPeriodStart: start, currentPeriodEnd: end });
  }
  if (!Number.isFinite(periodEnd)) return { ok: false, reason: "item_period_missing" };

  return {
    ok: true,
    value: {
      subscriptionId,
      customerId,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: unixSeconds(subscription.cancel_at),
      currency,
      collectionMethod: "charge_automatically",
      items,
      currentPeriodEnd: periodEnd,
      pendingUpdate,
      scheduleId,
      latestInvoiceId: idOf(subscription.latest_invoice) || null,
    },
  };
}

export type SelectionMatch = { ok: true } | { ok: false; reason: string };

/**
 * Does the AUTHORITATIVE subscription carry exactly the selection that was
 * quoted and confirmed?
 *
 * Equal plan and seat COUNTS are not proof, and neither is a plan derived from
 * today's catalogue. The subscription must carry the same base item id at the
 * same PRICE ID with quantity 1, and either no second item at all or the quoted
 * seat price at the quoted quantity on the quoted item (a seat item that is
 * being ADDED has no id yet, so only its price and quantity can be pinned). A
 * `pending_update` means the provider has not applied anything.
 *
 * This reads the catalogue-free snapshot on purpose: the ids it compares come
 * from the operation's own durable selection, so the proof survives a rotated
 * or shrunken price registry.
 */
export function appliedSelectionMatches(input: {
  snapshot: CommercialSubscriptionSnapshot;
  selection: CommercialSelection;
}): SelectionMatch {
  const { snapshot, selection } = input;
  if (snapshot.pendingUpdate !== "absent") return { ok: false, reason: "pending_update" };
  const base = snapshot.items.find((item) => item.itemId === selection.baseItemId) ?? null;
  if (!base) return { ok: false, reason: "base_item" };
  if (base.priceId !== selection.basePriceId) return { ok: false, reason: "base_price" };
  if (base.quantity !== 1) return { ok: false, reason: "base_quantity" };
  const others = snapshot.items.filter((item) => item.itemId !== base.itemId);
  if (!selection.seatPriceId) {
    // A removal is only done when the seat item is really gone.
    if (others.length > 0) return { ok: false, reason: "seat_present" };
    return { ok: true };
  }
  if (others.length === 0) return { ok: false, reason: "seat_missing" };
  // Exactly ONE seat item. Two would double-bill the seats.
  if (others.length > 1) return { ok: false, reason: "seat_duplicate" };
  const seat = others[0];
  if (selection.seatItemId && seat.itemId !== selection.seatItemId)
    return { ok: false, reason: "seat_item" };
  if (seat.priceId !== selection.seatPriceId) return { ok: false, reason: "seat_price" };
  if (seat.quantity !== selection.targetSeatQuantity) return { ok: false, reason: "seat_quantity" };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Direction and capacity                                                     */
/* -------------------------------------------------------------------------- */

export type ChangeDirection = "increase" | "decrease" | "unchanged" | "mixed";

/**
 * Classify a requested change.
 *
 * `mixed` (for example plan up but seats down) is NOT split into two
 * operations here: an immediate increase combined with a period-end decrease
 * would need two different effective dates in one confirmation, so it is held
 * for review instead of guessed.
 */
export function classifyChange(input: {
  currentPlanId: PlanId;
  currentSeatQuantity: number;
  targetPlanId: PlanId;
  targetSeatQuantity: number;
}): ChangeDirection {
  const planDelta = planRank(input.targetPlanId) - planRank(input.currentPlanId);
  const seatDelta = input.targetSeatQuantity - input.currentSeatQuantity;
  if (planDelta === 0 && seatDelta === 0) return "unchanged";
  if (planDelta >= 0 && seatDelta >= 0) return "increase";
  if (planDelta <= 0 && seatDelta <= 0) return "decrease";
  return "mixed";
}

export interface MembershipUsage {
  workingSeats: number;
  viewerSeats: number;
  known: boolean;
  /** The owner's CURRENT project count, and whether it could be read at all.
   * The seat counter does not express the project bundle, so a reduction can fit
   * the team and still exceed the target plan's project allowance. */
  projects: number;
  projectsKnown: boolean;
}

/**
 * Would the target plan be SMALLER than what the account currently uses?
 *
 * Three bundles are checked, because a plan is all three: working seats, viewer
 * seats and PROJECTS. The seat halves come from the released account-wide
 * counter (distinct people plus pending invitations), the project half from the
 * owner's own project store. A reduction that fits the team but not the target
 * plan's project allowance is just as much a capacity conflict — and it was the
 * one this check previously could not see at all.
 *
 * A conflict is HELD at preparation and re-checked at confirmation. The
 * alternatives would be to schedule a silent member removal or project deletion
 * (which destroys people's access and their work) or to let the account run over
 * its limit unreviewed; neither is an approved behaviour, and automatic
 * invitation billing is prohibited. Nothing here removes a member or a project.
 *
 * Unknown usage is a conflict too, for either half: an unreadable count must
 * never be read as "nothing would be lost".
 */
export type CapacityCheck =
  | { ok: true; workingAllowance: number; viewerAllowance: number; projectAllowance: number }
  | {
      ok: false;
      reason: string;
      workingAllowance: number;
      viewerAllowance: number;
      projectAllowance: number;
    };

export function checkTargetCapacity(input: {
  targetPlanId: PlanId;
  targetSeatQuantity: number;
  usage: MembershipUsage;
}): CapacityCheck {
  const bundle = PLAN_SEATS[input.targetPlanId] ?? PLAN_SEATS.freePreview;
  const workingAllowance = bundle.workingSeats + Math.max(0, input.targetSeatQuantity);
  const viewerAllowance = bundle.viewerSeats;
  const projectAllowance = (PLAN_LIMITS[input.targetPlanId] ?? PLAN_LIMITS.freePreview).maxProjects;
  const allowances = { workingAllowance, viewerAllowance, projectAllowance };
  if (!input.usage.known) return { ok: false, reason: "capacity_unknown", ...allowances };
  if (input.usage.workingSeats > workingAllowance)
    return { ok: false, reason: "capacity_conflict_working", ...allowances };
  if (input.usage.viewerSeats > viewerAllowance)
    return { ok: false, reason: "capacity_conflict_viewer", ...allowances };
  // The project bundle is a SEPARATE unknown: the seat counter can be perfectly
  // readable while the project store is not.
  if (!input.usage.projectsKnown)
    return { ok: false, reason: "capacity_projects_unknown", ...allowances };
  if (input.usage.projects > projectAllowance)
    return { ok: false, reason: "capacity_conflict_projects", ...allowances };
  return { ok: true, ...allowances };
}

/* -------------------------------------------------------------------------- */
/* Provider preview, pending update and schedule                              */
/* -------------------------------------------------------------------------- */

/** The amount charged NOW by a change, read from the provider's proration
 * preview. It is never the next period's price. */
export interface ProrationPreview {
  amountDueMinor: number;
  currency: string;
  prorationDate: number;
  /** How many of the preview's lines are prorations of THIS change. */
  prorationLines: number;
}
/**
 * The provider's LONG-TERM RECURRING BILL ESTIMATE for the target items.
 *
 * This is what `preview_mode=recurring` is documented to be: the recurring
 * subscription items, their taxes and repeating/forever coupons. It is NOT a
 * promise of the next debit — a one-time invoice item, a proration or a
 * discount that ends makes the next actual invoice different — and prorations,
 * cancellations, trials and pauses are not supported in that mode at all.
 */
export interface RecurringPreview {
  /** The provider's `total` for one full recurring period, as an ESTIMATE. */
  estimateMinor: number;
  currency: string;
  /** True when the provider's `total` differs from the sum of the line items,
   * i.e. an invoice-level discount or exclusive tax is part of the figure. The
   * estimate reported is always `total`, which is what the customer would
   * actually be billed; this flag records that the packet does not itemise the
   * difference. */
  includesInvoiceAdjustments: boolean;
}
export type PreviewReadResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * The shared, strict part of reading any preview invoice: it must belong to this
 * mode, this customer and this subscription, be in the subscription's own
 * currency, and carry a COMPLETE line list — a paginated preview would
 * under-state what the customer is about to be charged.
 */
function previewEnvelope(input: {
  raw: unknown;
  mode: StripeMode;
  customerId: string;
  subscriptionId: string;
  currency: string;
}):
  | {
      ok: true;
      invoice: Record<string, unknown>;
      currency: string;
      lines: Record<string, unknown>[];
    }
  | { ok: false; reason: string } {
  const { raw, mode, customerId, subscriptionId } = input;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "preview_unreadable" };
  const invoice = raw as Record<string, unknown>;
  if (invoice.object !== undefined && invoice.object !== "invoice")
    return { ok: false, reason: "preview_object" };
  if (invoice.livemode !== livemodeFor(mode)) return { ok: false, reason: "preview_mode" };
  if (idOf(invoice.customer) !== customerId) return { ok: false, reason: "preview_customer" };
  const currency = typeof invoice.currency === "string" ? invoice.currency.toLowerCase() : "";
  if (currency !== input.currency.toLowerCase())
    return { ok: false, reason: "preview_currency_mismatch" };
  const parent = (invoice.parent ?? null) as Record<string, unknown> | null;
  const details = (parent?.subscription_details ?? null) as Record<string, unknown> | null;
  if (parent?.type !== "subscription_details" || idOf(details?.subscription) !== subscriptionId)
    return { ok: false, reason: "preview_subscription" };
  const lines = (invoice.lines ?? null) as Record<string, unknown> | null;
  if (!lines || lines.has_more !== false || !Array.isArray(lines.data))
    return { ok: false, reason: "preview_lines_incomplete" };
  return { ok: true, invoice, currency, lines: lines.data as Record<string, unknown>[] };
}

/**
 * Is this preview line a PRORATION of the change being previewed?
 *
 * Both documented shapes are accepted: the invoice line item's own legacy
 * `proration` boolean, and the current
 * `parent.subscription_item_details.proration`. Either one ALONE is believed.
 *
 * When BOTH are present they must AGREE. Preferring the legacy field — which is
 * what this reader used to do — let a line whose current contract says
 * "renewal" be counted as a proration charged now, and a line whose current
 * contract says "proration" be counted into a recurring estimate. Mistaking one
 * for the other is precisely the confusion this reader exists to prevent, so a
 * disagreement is `conflict` and the caller HOLDS. A line that expresses
 * NEITHER form is `unknown` and also holds: nothing here classifies a money
 * line by guesswork.
 *
 * ABSENCE AND UNREADABILITY ARE NOT THE SAME THING. Accepting one form alone is
 * only sound when the other form is genuinely ABSENT — that is the documented
 * single-marker shape. A field that is PRESENT but not a boolean (a string, a
 * number, an object) is an unreadable marker: this reader cannot tell whether it
 * agrees or disagrees with the other one, so it can neither be ignored nor
 * believed. Collapsing it into the absent sentinel let `proration: true` with a
 * nested `"false"` be charged immediately, and a nested `false` with a legacy
 * `"true"` be accepted into a recurring estimate. Both now HOLD.
 *
 * A PRESENT `null` is unreadable too, not absent. A property whose value is
 * null has been stated — and what it states is not the boolean this reader
 * requires. Nothing in the documented contract offers null as an alternative
 * spelling of "this form is not used", so treating it as absence meant the
 * other marker was believed on the strength of a field that said nothing.
 * Absence is the property genuinely not being there.
 */
type ProrationMarker = boolean | "absent" | "unreadable";

/** Read ONE marker out of the object that documents it. */
function prorationMarker(container: Record<string, unknown>): ProrationMarker {
  if (!("proration" in container)) return "absent";
  const value = container.proration;
  if (typeof value === "boolean") return value;
  // `undefined` is indistinguishable from an unset property in JSON.
  if (value === undefined) return "absent";
  return "unreadable";
}

type LineProration = boolean | "unknown" | "unreadable" | "conflict";

function lineProration(line: Record<string, unknown>): LineProration {
  const legacy = prorationMarker(line);
  const parent = (line.parent ?? null) as Record<string, unknown> | null;
  const details = parent === null ? undefined : parent.subscription_item_details;
  const current: ProrationMarker =
    details === undefined || details === null
      ? "absent"
      : typeof details === "object" && !Array.isArray(details)
        ? prorationMarker(details as Record<string, unknown>)
        : // A present `subscription_item_details` that is not an object cannot
          // be read for the marker it is supposed to carry.
          "unreadable";
  if (legacy === "unreadable" || current === "unreadable") return "unreadable";
  if (typeof legacy === "boolean" && typeof current === "boolean")
    return legacy === current ? legacy : "conflict";
  if (typeof legacy === "boolean") return legacy;
  if (typeof current === "boolean") return current;
  return "unknown";
}

function integerField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * Read what the provider will charge NOW for an immediate change.
 *
 * `amount_due` is the authoritative figure, taken as-is. The whole point of this
 * reader is the line check around it: a `create_preview` in the documented
 * default `next` mode previews the next invoice and may legitimately contain
 * UPCOMING RENEWAL lines as well as prorations, and there is no documented
 * field that separates "charged now" from "charged at renewal" inside one
 * `amount_due`. Rather than invent that arithmetic, a preview that mixes
 * renewal lines into the immediate charge is HELD
 * (`preview_renewal_lines_present`) — an explicitly unresolved provider shape
 * for the sandbox matrix, never a charge the customer did not confirm.
 *
 * The lines must also be prorations of THIS change: at least one of them has to
 * sit on the stable proration date the quote is bound to.
 */
export function readProrationPreview(input: {
  raw: unknown;
  mode: StripeMode;
  customerId: string;
  subscriptionId: string;
  currency: string;
  prorationDate: number;
}): PreviewReadResult<ProrationPreview> {
  const envelope = previewEnvelope(input);
  if (!envelope.ok) return envelope;
  const { invoice, currency, lines } = envelope;
  if (unixSeconds(input.prorationDate) === null)
    return { ok: false, reason: "preview_proration_date" };

  const amountDue = integerField(invoice.amount_due);
  if (amountDue === null || amountDue < 0)
    return { ok: false, reason: "preview_amount_unreadable" };

  let prorations = 0;
  let onProrationDate = 0;
  for (const line of lines) {
    const proration = lineProration(line);
    if (proration === "conflict") return { ok: false, reason: "preview_line_proration_conflict" };
    if (proration === "unreadable")
      return { ok: false, reason: "preview_line_proration_unreadable" };
    if (proration === "unknown") return { ok: false, reason: "preview_line_proration_unknown" };
    if (!proration) return { ok: false, reason: "preview_renewal_lines_present" };
    prorations += 1;
    const period = (line.period ?? null) as Record<string, unknown> | null;
    if (integerField(period?.start) === input.prorationDate) onProrationDate += 1;
  }
  if (prorations === 0) return { ok: false, reason: "preview_no_proration_lines" };
  if (onProrationDate === 0) return { ok: false, reason: "preview_proration_date_mismatch" };

  return {
    ok: true,
    value: {
      amountDueMinor: amountDue,
      currency,
      prorationDate: input.prorationDate,
      prorationLines: prorations,
    },
  };
}

/**
 * Read the provider's LONG-TERM RECURRING BILL ESTIMATE for the target items,
 * from a `create_preview` in the documented `recurring` preview mode.
 *
 * What the official parameter definition says that this reader is built around:
 * `preview_mode=recurring` estimates the RECURRING bill — the recurring
 * subscription items, their taxes and repeating/forever coupons. It is
 * explicitly NOT necessarily the actual next-period amount, because one-time
 * items and one-time discounts differ, and prorations, cancellations, trials and
 * pauses are not supported in that mode. So this figure must never be presented
 * as "what you will be charged next" or "what was actually billed"; it is an
 * estimate of one full recurring period at the target items.
 *
 * `total` is the figure, because `total` is what the customer would be billed:
 * after invoice-level discounts and taxes. `subtotal` is explicitly NOT used —
 * the Invoice object defines it as the sum of line items INCLUDING prorations
 * and BEFORE invoice-level discounts and exclusive tax, so using it both leaked
 * proration into a "recurring" figure and ignored tax and discounts. When
 * `total` and `subtotal` differ the difference is reported as a flag rather than
 * itemised, and a preview carrying proration lines is refused: a recurring
 * estimate is not a proration preview, and the request that produced it must
 * carry no immediate `proration_date`.
 */
export function readRecurringPreview(input: {
  raw: unknown;
  mode: StripeMode;
  customerId: string;
  subscriptionId: string;
  currency: string;
}): PreviewReadResult<RecurringPreview> {
  const envelope = previewEnvelope(input);
  if (!envelope.ok) return envelope;
  const { invoice, currency, lines } = envelope;
  const total = integerField(invoice.total);
  if (total === null) return { ok: false, reason: "preview_recurring_unreadable" };
  const subtotal = integerField(invoice.subtotal);
  if (subtotal === null) return { ok: false, reason: "preview_recurring_unreadable" };
  if (lines.length === 0) return { ok: false, reason: "preview_recurring_no_lines" };
  for (const line of lines) {
    const proration = lineProration(line);
    if (proration === "conflict") return { ok: false, reason: "preview_line_proration_conflict" };
    if (proration === "unreadable")
      return { ok: false, reason: "preview_line_proration_unreadable" };
    if (proration === "unknown") return { ok: false, reason: "preview_line_proration_unknown" };
    if (proration) return { ok: false, reason: "preview_recurring_has_proration" };
  }
  return {
    ok: true,
    value: {
      estimateMinor: Math.max(total, 0),
      currency,
      includesInvoiceAdjustments: total !== subtotal,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Subscription schedules and the DURABLE REDUCTION DISPATCH PAYLOAD (v1)      */
/* -------------------------------------------------------------------------- */

/**
 * The ONE schedule arrangement a period-end reduction supports, named so the
 * durable payload says which arrangement it was built for.
 *
 * A phase update REPLACES the phases it is given, so any phase term that is not
 * restated is unset or falls back to the schedule's default settings. Rather
 * than restate arbitrary provider JSON — which would mean silently dropping
 * whatever this packet does not understand — exactly one arrangement is
 * supported: the ordinary documented schedule for an automatically charged,
 * untaxed, undiscounted subscription. Everything else is HELD, with a reason,
 * for the sandbox matrix.
 */
export const REDUCTION_PAYLOAD_PROFILE = "automaticChargeNoTaxNoDiscount" as const;
export const REDUCTION_PAYLOAD_VERSION = 1 as const;
/** The canonical document's byte bound, mirroring the SQL CHECK exactly. */
export const REDUCTION_PAYLOAD_MAX_BYTES = 4096;

/** The schedule's own `default_settings`, normalised to the supported profile.
 * The provider's field names are used deliberately, so the stored bytes name
 * the fields they were read from. */
export interface ReductionDefaultSettings {
  application_fee_percent: null;
  automatic_tax: false;
  billing_cycle_anchor: "automatic";
  collection_method: "charge_automatically";
  /** VARIABLE: an identity or an explicit null. Recorded exactly, never
   * restated into the request — a phase update does not replace
   * `default_settings`. */
  default_payment_method: string | null;
  default_source: null;
  description: null;
  invoice_settings: { issuer: { type: "self" } } | null;
  on_behalf_of: null;
  transfer_data: null;
}

/** The ORIGINAL paid phase's own settings, normalised. The four fields that
 * become the request body (`start_date`, `end_date`, `items`,
 * `proration_behavior`) are deliberately not here. */
export interface ReductionPhaseSettings {
  add_invoice_items: never[];
  application_fee_percent: null;
  billing_cycle_anchor: null;
  /** An explicit null INHERITS the defaults' verified `charge_automatically`,
   * and then no canonical phase may name a method. An explicit
   * `charge_automatically` is a phase override, and then BOTH canonical phases
   * must restate it. These are different facts and are kept apart. */
  collection_method: "charge_automatically" | null;
  currency: string;
  default_payment_method: string | null;
  default_tax_rates: never[];
  description: null;
  invoice_settings: null;
  metadata: Record<string, never>;
  on_behalf_of: null;
  transfer_data: null;
  trial_end: null;
}

export interface ReductionPaidItem {
  price: string;
  quantity: number;
  metadata: Record<string, never>;
  tax_rates: never[];
}

export interface ReductionExpectedSettings {
  profile: typeof REDUCTION_PAYLOAD_PROFILE;
  defaultSettings: ReductionDefaultSettings;
  paidPhase: ReductionPhaseSettings;
  paidItems: ReductionPaidItem[];
}

export interface ReductionPhaseRequest {
  start_date: number;
  end_date?: number;
  proration_behavior: "none";
  collection_method?: "charge_automatically";
  default_payment_method?: string;
  items: { price: string; quantity: number }[];
}

export interface ReductionDispatchPayload {
  v: typeof REDUCTION_PAYLOAD_VERSION;
  operationId: string;
  quoteId: string;
  scheduleId: string;
  subscriptionId: string;
  selectionDetail: string;
  targetPlanId: PlanId;
  targetSeatQuantity: number;
  effectiveBoundary: number;
  expectedSettings: ReductionExpectedSettings;
  request: {
    end_behavior: "release";
    proration_behavior: "none";
    phases: [ReductionPhaseRequest, ReductionPhaseRequest];
  };
}

/** A key-sorted, whitespace-free rendering, used for byte bounding and for
 * EXACT equality against a document read back out of `jsonb` (which does not
 * preserve the key order it was given). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

/** Exact document equality, order-independent, for an append-once payload. */
export function reductionPayloadEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

type Normalized<T> = { ok: true; value: T } | { ok: false; reason: string };

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function isEmptyObject(value: unknown): boolean {
  const record = objectOf(value);
  return record !== null && Object.keys(record).length === 0;
}
function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}
/** A field that is present must be explicitly `null` — an ABSENT key is a
 * response this reader did not understand, never a convenient neutral value. */
function presentAndNull(record: Record<string, unknown>, key: string): boolean {
  return key in record && record[key] === null;
}
function optionalIdentity(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string" && value.trim() && value.length <= 255)
    return { ok: true, value: value.trim() };
  const nested = objectOf(value);
  const id = nested ? idOf(nested.id) : "";
  return id && id.length <= 255 ? { ok: true, value: id } : { ok: false };
}

/**
 * The fields the v1 canonical payload has NO representation for at all.
 *
 * These are refused whenever they are PRESENT, even carrying an apparently inert
 * `null` or `[]`. Dropping an unsupported field to obtain apparent
 * compatibility is precisely the failure this reader exists to prevent: the
 * stored document would then claim to describe an arrangement it cannot
 * express. A real provider response that carries one of these is an explicit
 * sandbox-matrix entry, not something to normalise away.
 */
const UNREPRESENTABLE_PHASE_KEYS = [
  "discounts",
  "billing_thresholds",
  "automatic_tax",
  "pause_collection",
] as const;
const UNREPRESENTABLE_ITEM_KEYS = ["discounts", "billing_thresholds"] as const;

const DEFAULT_SETTINGS_KEYS = [
  "application_fee_percent",
  "automatic_tax",
  "billing_cycle_anchor",
  "collection_method",
  "default_payment_method",
  "default_source",
  "description",
  "invoice_settings",
  "on_behalf_of",
  "transfer_data",
] as const;

/** The paid phase's own seventeen documented fields: the thirteen recorded as
 * settings plus the four that become the request body. */
const PHASE_KEYS = [
  "add_invoice_items",
  "application_fee_percent",
  "billing_cycle_anchor",
  "collection_method",
  "currency",
  "default_payment_method",
  "default_tax_rates",
  "description",
  "end_date",
  "invoice_settings",
  "items",
  "metadata",
  "on_behalf_of",
  "proration_behavior",
  "start_date",
  "transfer_data",
  "trial_end",
] as const;

const ITEM_KEYS = ["price", "quantity", "metadata", "tax_rates", "plan"] as const;

/**
 * `default_settings.automatic_tax` collapses to `false` ONLY after the whole
 * object is checked: `enabled` exactly `false`, `liability` null (or absent),
 * and no further key. An enabled tax, a non-null liability or an unknown key is
 * a real tax arrangement and HOLDS — it is never turned into `false` by reading
 * one field.
 */
function automaticTaxIsOff(value: unknown): boolean {
  // An exact `false` is the ALREADY-COLLAPSED canonical form, accepted so a
  // stored document can be re-validated by the same reader. The provider's own
  // response never carries a boolean here — it carries an AutomaticTax object —
  // so this cannot let a source response through uninspected.
  if (value === false) return true;
  const record = objectOf(value);
  if (!record) return false;
  if (record.enabled !== false) return false;
  if ("liability" in record && record.liability !== null) return false;
  return Object.keys(record).every((key) => key === "enabled" || key === "liability");
}

export function normalizeScheduleDefaultSettings(
  raw: unknown,
): Normalized<ReductionDefaultSettings> {
  const record = objectOf(raw);
  if (!record) return { ok: false, reason: "default_settings_unreadable" };
  for (const key of Object.keys(record))
    if (!(DEFAULT_SETTINGS_KEYS as readonly string[]).includes(key))
      return { ok: false, reason: `default_settings_unknown_${key}` };
  for (const key of DEFAULT_SETTINGS_KEYS)
    if (!(key in record)) return { ok: false, reason: `default_settings_absent_${key}` };
  for (const key of [
    "application_fee_percent",
    "default_source",
    "description",
    "on_behalf_of",
    "transfer_data",
  ] as const)
    if (!presentAndNull(record, key))
      return { ok: false, reason: `default_settings_unsupported_${key}` };
  if (!automaticTaxIsOff(record.automatic_tax))
    return { ok: false, reason: "default_settings_unsupported_automatic_tax" };
  if (record.billing_cycle_anchor !== "automatic")
    return { ok: false, reason: "default_settings_unsupported_billing_cycle_anchor" };
  if (record.collection_method !== "charge_automatically")
    return { ok: false, reason: "default_settings_unsupported_collection_method" };
  // Retained EXACTLY: the ordinary `self` issuer, or an explicit null for a
  // response that genuinely carried none. A due-date override, a custom field
  // or a connected-account issuer is a real invoicing arrangement and HOLDS.
  const invoiceSettings = ((): ReductionDefaultSettings["invoice_settings"] | "held" => {
    if (record.invoice_settings === null) return null;
    const settings = objectOf(record.invoice_settings);
    const issuer = settings ? objectOf(settings.issuer) : null;
    if (
      settings &&
      issuer &&
      Object.keys(settings).length === 1 &&
      Object.keys(issuer).length === 1 &&
      issuer.type === "self"
    )
      return { issuer: { type: "self" } };
    return "held";
  })();
  if (invoiceSettings === "held")
    return { ok: false, reason: "default_settings_unsupported_invoice_settings" };
  const method = optionalIdentity(record.default_payment_method);
  if (!method.ok) return { ok: false, reason: "default_settings_payment_method_unreadable" };
  return {
    ok: true,
    value: {
      application_fee_percent: null,
      automatic_tax: false,
      billing_cycle_anchor: "automatic",
      collection_method: "charge_automatically",
      default_payment_method: method.value,
      default_source: null,
      description: null,
      invoice_settings: invoiceSettings,
      on_behalf_of: null,
      transfer_data: null,
    },
  };
}

export function normalizeSchedulePhaseSettings(raw: unknown): Normalized<ReductionPhaseSettings> {
  const record = objectOf(raw);
  if (!record) return { ok: false, reason: "phase_unreadable" };
  for (const key of UNREPRESENTABLE_PHASE_KEYS)
    if (key in record) return { ok: false, reason: `phase_unsupported_${key}` };
  for (const key of Object.keys(record))
    if (!(PHASE_KEYS as readonly string[]).includes(key))
      return { ok: false, reason: `phase_unknown_${key}` };
  for (const key of [
    "add_invoice_items",
    "application_fee_percent",
    "billing_cycle_anchor",
    "collection_method",
    "currency",
    "default_payment_method",
    "default_tax_rates",
    "description",
    "invoice_settings",
    "metadata",
    "on_behalf_of",
    "transfer_data",
    "trial_end",
  ] as const)
    if (!(key in record)) return { ok: false, reason: `phase_absent_${key}` };
  for (const key of [
    "application_fee_percent",
    "billing_cycle_anchor",
    "description",
    "invoice_settings",
    "on_behalf_of",
    "transfer_data",
    "trial_end",
  ] as const)
    if (!presentAndNull(record, key)) return { ok: false, reason: `phase_unsupported_${key}` };
  if (!isEmptyArray(record.add_invoice_items))
    return { ok: false, reason: "phase_unsupported_add_invoice_items" };
  // An item's `tax_rates` OVERRIDES this field, so the two are distinct facts
  // and both have to be empty for the untaxed profile.
  if (!isEmptyArray(record.default_tax_rates))
    return { ok: false, reason: "phase_unsupported_default_tax_rates" };
  if (!isEmptyObject(record.metadata)) return { ok: false, reason: "phase_unsupported_metadata" };
  if (record.collection_method !== null && record.collection_method !== "charge_automatically")
    return { ok: false, reason: "phase_unsupported_collection_method" };
  const currency = typeof record.currency === "string" ? record.currency.toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(currency)) return { ok: false, reason: "phase_currency_unreadable" };
  const method = optionalIdentity(record.default_payment_method);
  if (!method.ok) return { ok: false, reason: "phase_payment_method_unreadable" };
  return {
    ok: true,
    value: {
      add_invoice_items: [],
      application_fee_percent: null,
      billing_cycle_anchor: null,
      collection_method: record.collection_method === null ? null : "charge_automatically",
      currency,
      default_payment_method: method.value,
      default_tax_rates: [],
      description: null,
      invoice_settings: null,
      metadata: {},
      on_behalf_of: null,
      transfer_data: null,
      trial_end: null,
    },
  };
}

export function normalizeSchedulePhaseItems(raw: unknown): Normalized<ReductionPaidItem[]> {
  if (!Array.isArray(raw)) return { ok: false, reason: "phase_items_unreadable" };
  if (raw.length < 1 || raw.length > 2) return { ok: false, reason: "phase_items_count" };
  const items: ReductionPaidItem[] = [];
  for (const entry of raw) {
    const record = objectOf(entry);
    if (!record) return { ok: false, reason: "phase_item_unreadable" };
    for (const key of UNREPRESENTABLE_ITEM_KEYS)
      if (key in record) return { ok: false, reason: `phase_item_unsupported_${key}` };
    for (const key of Object.keys(record))
      if (!(ITEM_KEYS as readonly string[]).includes(key))
        return { ok: false, reason: `phase_item_unknown_${key}` };
    const price = idOf(record.price);
    if (!price || price.length > 255) return { ok: false, reason: "phase_item_price" };
    // The legacy `plan` mirror carries no independent fact and is normalised
    // away — but only after confirming it really does mirror `price`.
    if ("plan" in record && record.plan !== null && idOf(record.plan) !== price)
      return { ok: false, reason: "phase_item_plan_disagrees" };
    const quantity = integerIn(record.quantity, 1, 1000);
    if (quantity === null) return { ok: false, reason: "phase_item_quantity" };
    if (!("metadata" in record) || !isEmptyObject(record.metadata))
      return { ok: false, reason: "phase_item_unsupported_metadata" };
    if (!("tax_rates" in record) || !isEmptyArray(record.tax_rates))
      return { ok: false, reason: "phase_item_unsupported_tax_rates" };
    items.push({ price, quantity, metadata: {}, tax_rates: [] });
  }
  return { ok: true, value: items };
}

/**
 * The ORIGINAL `from_subscription` adoption reply, validated before anything is
 * normalised away.
 *
 * This is the half of the payload that cannot be re-derived from anything
 * durable, which is exactly why it is stored — and why every material source
 * setting and the whole identity chain are checked HERE, on the original reply,
 * rather than inferred later from a current GET. A known unsupported setting
 * HOLDS even when a fresh read looks ordinary; an unknown new field HOLDS; and
 * no apparent compatibility is obtained by deleting a field, defaulting an
 * absent one or accepting a fabricated null.
 */
export interface AdoptedScheduleProfile {
  scheduleId: string;
  status: string;
  subscriptionId: string;
  customerId: string;
  /** The adopted phase's own start, which the canonical request restates. */
  paidPhaseStart: number;
  paidPhaseEnd: number | null;
  expectedSettings: ReductionExpectedSettings;
}
export type AdoptedScheduleResult =
  { ok: true; value: AdoptedScheduleProfile } | { ok: false; reason: string };

export function readAdoptedScheduleProfile(input: {
  raw: unknown;
  mode: StripeMode;
  subscriptionId: string;
  customerId: string;
  /** The DURABLE quote currency. The adopted phase must be in it, so a recorded
   * original cannot belong to a differently priced subscription. */
  currency: string;
}): AdoptedScheduleResult {
  const schedule = objectOf(input.raw);
  if (!schedule) return { ok: false, reason: "adoption_unreadable" };
  if (schedule.object !== undefined && schedule.object !== "subscription_schedule")
    return { ok: false, reason: "adoption_object" };
  const scheduleId = idOf(schedule.id);
  if (!/^sub_sched_[A-Za-z0-9_]+$/.test(scheduleId)) return { ok: false, reason: "adoption_id" };
  if (schedule.livemode !== livemodeFor(input.mode)) return { ok: false, reason: "adoption_mode" };
  if (!input.customerId || idOf(schedule.customer) !== input.customerId)
    return { ok: false, reason: "adoption_customer" };
  if (!input.subscriptionId || idOf(schedule.subscription) !== input.subscriptionId)
    return { ok: false, reason: "adoption_subscription" };
  const status = typeof schedule.status === "string" ? schedule.status : "";
  if (status !== "active" && status !== "not_started")
    return { ok: false, reason: "adoption_status" };
  // `from_subscription` adopts with `release`, which keeps the subscription
  // running. Anything else is an arrangement this packet has not specified.
  if (schedule.end_behavior !== "release") return { ok: false, reason: "adoption_end_behavior" };

  const defaults = normalizeScheduleDefaultSettings(schedule.default_settings);
  if (!defaults.ok) return { ok: false, reason: `adoption_${defaults.reason}` };

  const phases = Array.isArray(schedule.phases) ? schedule.phases : null;
  // A freshly adopted schedule mirrors the subscription as its single current
  // phase. More than one phase is not an adoption this packet produced.
  if (!phases || phases.length !== 1) return { ok: false, reason: "adoption_phase_count" };
  const phase = objectOf(phases[0]);
  if (!phase) return { ok: false, reason: "adoption_phase_unreadable" };
  const settings = normalizeSchedulePhaseSettings(phase);
  if (!settings.ok) return { ok: false, reason: `adoption_${settings.reason}` };
  if (settings.value.currency !== input.currency.toLowerCase())
    return { ok: false, reason: "adoption_phase_currency_mismatch" };
  const items = normalizeSchedulePhaseItems(phase.items);
  if (!items.ok) return { ok: false, reason: `adoption_${items.reason}` };
  const start = unixSeconds(phase.start_date);
  if (start === null) return { ok: false, reason: "adoption_phase_start" };
  const end = unixSeconds(phase.end_date);

  return {
    ok: true,
    value: {
      scheduleId,
      status,
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
      paidPhaseStart: start,
      paidPhaseEnd: end,
      expectedSettings: {
        profile: REDUCTION_PAYLOAD_PROFILE,
        defaultSettings: defaults.value,
        paidPhase: settings.value,
        paidItems: items.value,
      },
    },
  };
}

/** The reduced phase's items, derived ONLY from the canonical selection and the
 * quote's target — the one part of the body that IS re-derivable, and the part
 * the frozen SQL rebuilds and compares exactly. */
export function reductionTargetItems(
  selection: CommercialSelection,
): { price: string; quantity: number }[] {
  const items = [{ price: selection.basePriceId, quantity: 1 }];
  if (selection.targetSeatQuantity > 0 && selection.seatPriceId)
    items.push({ price: selection.seatPriceId, quantity: selection.targetSeatQuantity });
  return items;
}

/**
 * Build the complete v1 durable dispatch payload.
 *
 * Every value comes from the ORIGINAL adoption reply, the durable quote, the
 * canonical selection and the operation's own identity — never from a current
 * registry read, a current period or a later GET. The result is the only body
 * any first or retried `:phases` POST may send.
 */
export type ReductionPayloadBuild =
  { ok: true; payload: ReductionDispatchPayload } | { ok: false; reason: string };

export function buildReductionPayload(input: {
  operationId: string;
  quoteId: string;
  subscriptionId: string;
  selection: CommercialSelection;
  selectionDetail: string;
  /** The quote's fixed boundary: for a reduction its proration date IS the paid
   * period end it was calculated for. */
  effectiveBoundary: number;
  adoption: AdoptedScheduleProfile;
}): ReductionPayloadBuild {
  const { adoption, selection } = input;
  if (unixSeconds(input.effectiveBoundary) === null)
    return { ok: false, reason: "payload_boundary_invalid" };
  if (adoption.paidPhaseStart >= input.effectiveBoundary)
    return { ok: false, reason: "payload_boundary_not_after_phase_start" };
  if (parseSelectionDetail(input.selectionDetail) === null)
    return { ok: false, reason: "payload_selection_unreadable" };
  if (selectionFingerprintInput(selection) !== input.selectionDetail)
    return { ok: false, reason: "payload_selection_mismatch" };

  const method = adoption.expectedSettings.paidPhase.default_payment_method;
  const collection = adoption.expectedSettings.paidPhase.collection_method;
  // The PHASE-level terms are the ones a phase update would drop, so they are
  // the ones the canonical request restates — in BOTH phases when the original
  // carried them, and in NEITHER when the original inherited them. Naming an
  // inherited setting would turn it into an override the original never had.
  const restate = <T extends ReductionPhaseRequest>(phase: T): T => ({
    ...phase,
    ...(collection === null ? {} : { collection_method: collection }),
    ...(method === null ? {} : { default_payment_method: method }),
  });

  const payload: ReductionDispatchPayload = {
    v: REDUCTION_PAYLOAD_VERSION,
    operationId: input.operationId,
    quoteId: input.quoteId,
    scheduleId: adoption.scheduleId,
    subscriptionId: input.subscriptionId,
    selectionDetail: input.selectionDetail,
    targetPlanId: selection.targetPlanId,
    targetSeatQuantity: selection.targetSeatQuantity,
    effectiveBoundary: input.effectiveBoundary,
    expectedSettings: adoption.expectedSettings,
    request: {
      end_behavior: "release",
      // Both levels are explicit on purpose: only one of them being right would
      // still charge or credit for a change that prorates nothing.
      proration_behavior: "none",
      phases: [
        restate({
          start_date: adoption.paidPhaseStart,
          end_date: input.effectiveBoundary,
          proration_behavior: "none",
          items: adoption.expectedSettings.paidItems.map((item) => ({
            price: item.price,
            quantity: item.quantity,
          })),
        }),
        restate({
          // No `end_date`: the reduced phase is open-ended, and `release` hands
          // the subscription back still running. A finite final boundary is an
          // unsupported shape, not a cancellation guard.
          start_date: input.effectiveBoundary,
          proration_behavior: "none",
          items: reductionTargetItems(selection),
        }),
      ],
    },
  };
  if (canonicalJson(payload).length > REDUCTION_PAYLOAD_MAX_BYTES)
    return { ok: false, reason: "payload_too_large" };
  return { ok: true, payload };
}

/**
 * Validate a payload read back out of the database against THIS operation.
 *
 * A stored document is the authority for the retry body, so it is checked, not
 * trusted: version, the whole identity chain, the fixed boundary at both phase
 * boundaries, and that the reduced phase still equals what the canonical
 * selection and the quote's target imply.
 */
export type StoredPayloadResult =
  { ok: true; payload: ReductionDispatchPayload } | { ok: false; reason: string };

export function parseStoredReductionPayload(input: {
  stored: unknown;
  operationId: string;
  quoteId: string;
  scheduleId: string | null;
  subscriptionId: string;
  selectionDetail: string;
  effectiveBoundary: number;
}): StoredPayloadResult {
  const stored = objectOf(input.stored);
  if (!stored) return { ok: false, reason: "payload_absent" };
  if (stored.v !== REDUCTION_PAYLOAD_VERSION) return { ok: false, reason: "payload_version" };
  const selection = parseSelectionDetail(input.selectionDetail);
  if (!selection) return { ok: false, reason: "payload_selection_unreadable" };
  const lower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : "");
  if (
    lower(stored.operationId) !== input.operationId.toLowerCase() ||
    lower(stored.quoteId) !== input.quoteId.toLowerCase() ||
    stored.subscriptionId !== input.subscriptionId ||
    stored.selectionDetail !== input.selectionDetail ||
    stored.targetPlanId !== selection.targetPlanId ||
    stored.targetSeatQuantity !== selection.targetSeatQuantity ||
    stored.effectiveBoundary !== input.effectiveBoundary
  )
    return { ok: false, reason: "payload_linkage" };
  if (typeof stored.scheduleId !== "string" || !stored.scheduleId)
    return { ok: false, reason: "payload_schedule_unreadable" };
  // The column and the document's own `scheduleId` are persisted together, so a
  // disagreement means the stored evidence contradicts itself.
  if (input.scheduleId !== null && stored.scheduleId !== input.scheduleId)
    return { ok: false, reason: "payload_schedule_mismatch" };

  const settings = objectOf(stored.expectedSettings);
  if (!settings || settings.profile !== REDUCTION_PAYLOAD_PROFILE)
    return { ok: false, reason: "payload_profile_unsupported" };
  const defaults = normalizeScheduleDefaultSettings(settings.defaultSettings);
  if (!defaults.ok) return { ok: false, reason: `payload_${defaults.reason}` };
  const paidPhase = normalizeSchedulePhaseSettings(settings.paidPhase);
  if (!paidPhase.ok) return { ok: false, reason: `payload_${paidPhase.reason}` };
  const paidItems = normalizeSchedulePhaseItems(settings.paidItems);
  if (!paidItems.ok) return { ok: false, reason: `payload_${paidItems.reason}` };

  const request = objectOf(stored.request);
  const phases = request && Array.isArray(request.phases) ? request.phases : null;
  if (
    !request ||
    request.end_behavior !== "release" ||
    request.proration_behavior !== "none" ||
    !phases ||
    phases.length !== 2
  )
    return { ok: false, reason: "payload_request_invalid" };
  const parsedPhases: ReductionPhaseRequest[] = [];
  for (const [index, entry] of phases.entries()) {
    const phase = objectOf(entry);
    if (!phase) return { ok: false, reason: "payload_phase_invalid" };
    if (phase.proration_behavior !== "none")
      return { ok: false, reason: "payload_phase_proration" };
    const start = unixSeconds(phase.start_date);
    if (start === null) return { ok: false, reason: "payload_phase_start" };
    const end = index === 0 ? unixSeconds(phase.end_date) : null;
    if (index === 0 && end === null) return { ok: false, reason: "payload_phase_end" };
    if (index === 1 && "end_date" in phase) return { ok: false, reason: "payload_phase_end" };
    const expectedBoundary = index === 0 ? end : start;
    if (expectedBoundary !== input.effectiveBoundary)
      return { ok: false, reason: "payload_boundary_mismatch" };
    if (index === 0 && start >= input.effectiveBoundary)
      return { ok: false, reason: "payload_boundary_mismatch" };
    // The restatement rule is part of the stored evidence, not a preference.
    const wantsMethod = paidPhase.value.default_payment_method !== null;
    const wantsCollection = paidPhase.value.collection_method !== null;
    if ("default_payment_method" in phase !== wantsMethod)
      return { ok: false, reason: "payload_phase_payment_method" };
    if (wantsMethod && phase.default_payment_method !== paidPhase.value.default_payment_method)
      return { ok: false, reason: "payload_phase_payment_method" };
    if ("collection_method" in phase !== wantsCollection)
      return { ok: false, reason: "payload_phase_collection_method" };
    if (wantsCollection && phase.collection_method !== paidPhase.value.collection_method)
      return { ok: false, reason: "payload_phase_collection_method" };
    const items = Array.isArray(phase.items) ? phase.items : null;
    if (!items || items.length < 1 || items.length > 2)
      return { ok: false, reason: "payload_phase_items" };
    const parsedItems: { price: string; quantity: number }[] = [];
    for (const raw of items) {
      const item = objectOf(raw);
      const price = item && typeof item.price === "string" ? item.price : "";
      const quantity = item ? integerIn(item.quantity, 1, 1000) : null;
      if (!item || Object.keys(item).length !== 2 || !price || quantity === null)
        return { ok: false, reason: "payload_phase_item" };
      parsedItems.push({ price, quantity });
    }
    parsedPhases.push({
      start_date: start,
      ...(index === 0 && end !== null ? { end_date: end } : {}),
      proration_behavior: "none",
      ...(wantsCollection ? { collection_method: "charge_automatically" as const } : {}),
      ...(wantsMethod
        ? { default_payment_method: paidPhase.value.default_payment_method as string }
        : {}),
      items: parsedItems,
    });
  }
  // The settings expectation and the body it was built with must describe the
  // same paid items, in the same order, or the stored evidence contradicts
  // itself.
  if (
    canonicalJson(parsedPhases[0].items) !==
    canonicalJson(paidItems.value.map((item) => ({ price: item.price, quantity: item.quantity })))
  )
    return { ok: false, reason: "payload_paid_items_disagree" };
  if (canonicalJson(parsedPhases[1].items) !== canonicalJson(reductionTargetItems(selection)))
    return { ok: false, reason: "payload_target_items_mismatch" };

  return {
    ok: true,
    payload: {
      v: REDUCTION_PAYLOAD_VERSION,
      operationId: input.operationId,
      quoteId: input.quoteId,
      scheduleId: stored.scheduleId,
      subscriptionId: input.subscriptionId,
      selectionDetail: input.selectionDetail,
      targetPlanId: selection.targetPlanId,
      targetSeatQuantity: selection.targetSeatQuantity,
      effectiveBoundary: input.effectiveBoundary,
      expectedSettings: {
        profile: REDUCTION_PAYLOAD_PROFILE,
        defaultSettings: defaults.value,
        paidPhase: paidPhase.value,
        paidItems: paidItems.value,
      },
      request: {
        end_behavior: "release",
        proration_behavior: "none",
        phases: [parsedPhases[0], parsedPhases[1]],
      },
    },
  };
}

/**
 * The schedule that must exist after a period-end reduction, read back and
 * verified rather than assumed.
 *
 * Both phases are represented, including their own settings and item terms, so
 * the verifier can compare the exact paid CURRENT phase — not only the future
 * target — against the stored original. A phase whose settings cannot be read
 * inside the supported profile carries its reason rather than silently
 * reporting "no settings".
 */
export interface SchedulePhaseView {
  startDate: number | null;
  endDate: number | null;
  prorationBehavior: string | null;
  items: Normalized<ReductionPaidItem[]>;
  settings: Normalized<ReductionPhaseSettings>;
}
export interface ScheduleView {
  id: string;
  status: string;
  endBehavior: string;
  subscriptionId: string;
  customerId: string;
  defaultSettings: Normalized<ReductionDefaultSettings>;
  phases: SchedulePhaseView[];
}
export type ScheduleReadResult = { ok: true; value: ScheduleView } | { ok: false; reason: string };

export function readSubscriptionSchedule(input: {
  raw: unknown;
  mode: StripeMode;
  subscriptionId: string;
  customerId: string;
}): ScheduleReadResult {
  const { raw, mode } = input;
  const schedule = objectOf(raw);
  if (!schedule) return { ok: false, reason: "schedule_unreadable" };
  if (schedule.object !== undefined && schedule.object !== "subscription_schedule")
    return { ok: false, reason: "schedule_object" };
  const id = idOf(schedule.id);
  if (!/^sub_sched_[A-Za-z0-9_]+$/.test(id)) return { ok: false, reason: "schedule_id" };
  if (schedule.livemode !== livemodeFor(mode)) return { ok: false, reason: "schedule_mode" };
  if (!input.customerId || idOf(schedule.customer) !== input.customerId)
    return { ok: false, reason: "schedule_customer" };
  if (!input.subscriptionId || idOf(schedule.subscription) !== input.subscriptionId)
    return { ok: false, reason: "schedule_subscription" };
  const status = typeof schedule.status === "string" ? schedule.status : "";
  if (!status) return { ok: false, reason: "schedule_status" };
  const endBehavior = typeof schedule.end_behavior === "string" ? schedule.end_behavior : "";
  if (!endBehavior) return { ok: false, reason: "schedule_end_behavior" };
  const phasesRaw = Array.isArray(schedule.phases) ? schedule.phases : null;
  if (phasesRaw === null || phasesRaw.length < 1) return { ok: false, reason: "schedule_phases" };
  const phases: SchedulePhaseView[] = [];
  for (const entry of phasesRaw) {
    const phase = objectOf(entry);
    if (!phase) return { ok: false, reason: "schedule_phase_unreadable" };
    phases.push({
      startDate: unixSeconds(phase.start_date),
      endDate: unixSeconds(phase.end_date),
      prorationBehavior:
        typeof phase.proration_behavior === "string" ? phase.proration_behavior : null,
      items: normalizeSchedulePhaseItems(phase.items),
      settings: normalizeSchedulePhaseSettings(phase),
    });
  }
  return {
    ok: true,
    value: {
      id,
      status,
      endBehavior,
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
      defaultSettings: normalizeScheduleDefaultSettings(schedule.default_settings),
      phases,
    },
  };
}

/**
 * Does this schedule express exactly the reduction that was DISPATCHED?
 *
 * The comparison is against the stored v1 payload — the original terms — and
 * nothing else. A current registry read, the current period or this GET's own
 * content may not redefine what was expected:
 *
 *  - `end_behavior` must be `release`, so the subscription is handed back still
 *    running after the final phase; `cancel` would end one nobody cancelled.
 *    Finite phases do NOT imply a cancellation, and this check does not treat
 *    them as one.
 *  - the CURRENT (already paid) phase must still carry the original items, in
 *    order, at the original quantities, over the original boundary — a changed
 *    price or quantity there rewrites a period the customer has already paid
 *    for, which was invisible when only the future phase was compared;
 *  - both phases' material settings must equal the recorded original, so a
 *    discount, tax, trial or payment arrangement cannot be silently dropped by
 *    the phase replacement;
 *  - `proration_behavior` must be `none` on both phases.
 *
 * `billing_cycle_anchor` is the one phase term the canonical request never
 * names, so it is compared through the shared profile (which requires the
 * ordinary phase-level null) rather than against the paid phase a second time.
 */
export function scheduleMatchesReduction(input: {
  schedule: ScheduleView;
  payload: ReductionDispatchPayload;
}): { ok: true } | { ok: false; reason: string } {
  const { schedule, payload } = input;
  const expected = payload.request.phases;
  if (schedule.id !== payload.scheduleId) return { ok: false, reason: "identity_unexpected" };
  if (schedule.subscriptionId !== payload.subscriptionId)
    return { ok: false, reason: "subscription_unexpected" };
  if (schedule.endBehavior !== "release") return { ok: false, reason: "end_behavior_unexpected" };
  if (schedule.status !== "active" && schedule.status !== "not_started")
    return { ok: false, reason: "status_unexpected" };
  if (!schedule.defaultSettings.ok)
    return { ok: false, reason: `${schedule.defaultSettings.reason}` };
  // The defaults are compared with the ORIGINAL recorded ones. A phase update
  // does not replace them, so any difference means something else moved them.
  if (
    canonicalJson(schedule.defaultSettings.value) !==
    canonicalJson(payload.expectedSettings.defaultSettings)
  )
    return { ok: false, reason: "default_settings_changed" };
  if (schedule.phases.length !== 2) return { ok: false, reason: "phase_count" };

  for (const [index, phase] of schedule.phases.entries()) {
    const want = expected[index];
    if (phase.prorationBehavior !== "none")
      return { ok: false, reason: `phase${index}_proration_unexpected` };
    if (phase.startDate !== want.start_date)
      return { ok: false, reason: `phase${index}_start_unexpected` };
    if ((want.end_date ?? null) !== phase.endDate)
      return { ok: false, reason: `phase${index}_end_unexpected` };
    if (!phase.settings.ok) return { ok: false, reason: `phase${index}_${phase.settings.reason}` };
    if (canonicalJson(phase.settings.value) !== canonicalJson(payload.expectedSettings.paidPhase))
      return { ok: false, reason: `phase${index}_settings_changed` };
    if (!phase.items.ok) return { ok: false, reason: `phase${index}_${phase.items.reason}` };
    const actual = phase.items.value.map((item) => ({
      price: item.price,
      quantity: item.quantity,
    }));
    if (canonicalJson(actual) !== canonicalJson(want.items))
      return { ok: false, reason: `phase${index}_items_unexpected` };
  }
  // The paid phase's recorded item terms are part of what must be preserved, so
  // they are compared with the stored expectation as well as with the body.
  const paid = schedule.phases[0].items;
  if (paid.ok && canonicalJson(paid.value) !== canonicalJson(payload.expectedSettings.paidItems))
    return { ok: false, reason: "phase0_item_terms_changed" };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* The exact update invoice                                                   */
/* -------------------------------------------------------------------------- */

/** The identity half of "this is the invoice THIS update produced". The payment
 * half is `invoicePaymentEvidence`, deliberately separate: an invoice can be
 * provably the right one and provably not paid yet. */
export interface UpdateInvoiceIdentity {
  id: string;
  currency: string;
  billingReason: string;
  amountPaidMinor: number;
  amountRemainingMinor: number | null;
}
export type UpdateInvoiceResult =
  { ok: true; value: UpdateInvoiceIdentity } | { ok: false; reason: string };

/**
 * Is this invoice the EXACT invoice the confirmed update created?
 *
 * Neither "the subscription's current `latest_invoice`" nor "some invoice that
 * differs from the baseline" is proof. An unrelated renewal is a perfectly
 * valid, paid, newer invoice on the same subscription — it is just not this
 * change's invoice — so the linkage is proved by all of:
 *
 *  - the id equals the one CAPTURED on the operation from the update response,
 *    before any success was declared (never a later `latest_invoice`);
 *  - the mode, customer, subscription parent and currency are this operation's;
 *  - the invoice is NOT the durable pre-dispatch baseline, which is the only
 *    thing that can still tell an update invoice from a historical paid one;
 *  - `billing_reason` is `subscription_update` — a `subscription_cycle`
 *    renewal, a manual invoice or an unreadable reason is refused rather than
 *    accepted because the amount happened to be paid.
 *
 * An absent baseline is uncertainty, not permission.
 */
export function readUpdateInvoiceIdentity(input: {
  raw: unknown;
  mode: StripeMode;
  customerId: string;
  subscriptionId: string;
  expectedInvoiceId: string;
  expectedCurrency: string;
  baselineInvoiceId: string | null;
}): UpdateInvoiceResult {
  if (!input.expectedInvoiceId) return { ok: false, reason: "invoice_not_captured" };
  if (!input.baselineInvoiceId) return { ok: false, reason: "invoice_baseline_absent" };
  if (input.baselineInvoiceId === input.expectedInvoiceId)
    return { ok: false, reason: "invoice_is_baseline" };
  const invoice = objectOf(input.raw);
  if (!invoice) return { ok: false, reason: "invoice_unreadable" };
  if (invoice.object !== undefined && invoice.object !== "invoice")
    return { ok: false, reason: "invoice_object" };
  if (idOf(invoice.id) !== input.expectedInvoiceId)
    return { ok: false, reason: "invoice_identity" };
  if (invoice.livemode !== livemodeFor(input.mode)) return { ok: false, reason: "invoice_mode" };
  if (!input.customerId || idOf(invoice.customer) !== input.customerId)
    return { ok: false, reason: "invoice_customer" };
  const parent = objectOf(invoice.parent);
  const details = parent ? objectOf(parent.subscription_details) : null;
  if (
    parent?.type !== "subscription_details" ||
    idOf(details?.subscription) !== input.subscriptionId
  )
    return { ok: false, reason: "invoice_subscription" };
  const currency = typeof invoice.currency === "string" ? invoice.currency.toLowerCase() : "";
  if (currency !== input.expectedCurrency.toLowerCase())
    return { ok: false, reason: "invoice_currency" };
  const billingReason = typeof invoice.billing_reason === "string" ? invoice.billing_reason : "";
  if (billingReason !== "subscription_update")
    return { ok: false, reason: `invoice_billing_reason_${billingReason || "unknown"}` };
  const amountPaid = integerField(invoice.amount_paid);
  if (amountPaid === null || amountPaid < 0) return { ok: false, reason: "invoice_amount_paid" };
  return {
    ok: true,
    value: {
      id: input.expectedInvoiceId,
      currency,
      billingReason,
      amountPaidMinor: amountPaid,
      amountRemainingMinor: integerField(invoice.amount_remaining),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Refunds                                                                    */
/* -------------------------------------------------------------------------- */

export const REFUND_STATUSES = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number] | "unknown";

/** Classify a refund status. Absent, null or unrecognised is `unknown`, which is
 * uncertainty — never success and never a release of reserved funds. */
export function classifyRefundStatus(value: unknown): RefundStatus {
  if (typeof value !== "string") return "unknown";
  const status = value.trim();
  if (status === "cancelled") return "canceled";
  return (REFUND_STATUSES as readonly string[]).includes(status)
    ? (status as RefundStatus)
    : "unknown";
}

/** Only an AUTHORITATIVE negative terminal releases a reservation. Mirrors
 * `stripe_commercial_refund_releases`. */
export function refundReleasesReservation(status: RefundStatus): boolean {
  return status === "failed" || status === "canceled";
}
/** The statuses that still consume funds: everything that is not an
 * authoritative release, including `unknown`. */
export function refundConsumesFunds(status: RefundStatus): boolean {
  return !refundReleasesReservation(status);
}

export interface RefundView {
  id: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  paymentIntentId: string;
  chargeId: string;
}
export type RefundReadResult = { ok: true; value: RefundView } | { ok: false; reason: string };

/**
 * Read a Refund object.
 *
 * The current Refund object does NOT expose `livemode`, so mode is never read
 * from the refund: it is established by the verified key-owning account plus the
 * exact linked payment/charge, both of which this read insists on matching. An
 * invented `refund.livemode` check would silently pass on every object.
 */
export function readRefundObject(input: {
  raw: unknown;
  expectedPaymentIntentId: string;
  expectedChargeId: string | null;
  expectedCurrency: string;
  /** The APPROVED case this refund must name in its own metadata. A refund is
   * only this case's evidence if it says so: the dispatch writes
   * `metadata[milo_refund_case]`, so a response that names another case — or
   * none — belongs to a different financial intent and must never settle this
   * reservation. */
  expectedCaseId: string;
}): RefundReadResult {
  const { raw } = input;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "refund_unreadable" };
  const refund = raw as Record<string, unknown>;
  if (refund.object !== undefined && refund.object !== "refund")
    return { ok: false, reason: "refund_object" };
  const metadata = (refund.metadata ?? null) as Record<string, unknown> | null;
  const caseId =
    metadata && typeof metadata.milo_refund_case === "string"
      ? metadata.milo_refund_case.trim()
      : "";
  if (!input.expectedCaseId || caseId !== input.expectedCaseId)
    return { ok: false, reason: "refund_case_link" };
  const id = idOf(refund.id);
  if (!/^re_[A-Za-z0-9_]+$/.test(id)) return { ok: false, reason: "refund_id" };
  const amount =
    typeof refund.amount === "number" && Number.isInteger(refund.amount) ? refund.amount : null;
  if (amount === null || amount <= 0) return { ok: false, reason: "refund_amount" };
  const currency = typeof refund.currency === "string" ? refund.currency.toLowerCase() : "";
  if (currency !== input.expectedCurrency.toLowerCase())
    return { ok: false, reason: "refund_currency" };
  const paymentIntentId = idOf(refund.payment_intent);
  if (!paymentIntentId || paymentIntentId !== input.expectedPaymentIntentId)
    return { ok: false, reason: "refund_payment_link" };
  const chargeId = idOf(refund.charge);
  if (input.expectedChargeId && chargeId && chargeId !== input.expectedChargeId)
    return { ok: false, reason: "refund_charge_link" };
  return {
    ok: true,
    value: {
      id,
      amount,
      currency,
      status: classifyRefundStatus(refund.status),
      paymentIntentId,
      chargeId,
    },
  };
}

export interface PaymentAllocation {
  /** The InvoicePayment's own id. */
  invoicePaymentId: string;
  paymentIntentId: string;
  /** The amount this InvoicePayment allocated to THIS invoice. It may be
   * SMALLER than the PaymentIntent's received total. */
  allocatedMinor: number;
  currency: string;
}
export type AllocationResult =
  { ok: true; value: PaymentAllocation } | { ok: false; reason: string };

/**
 * Resolve the single payment a refund may be taken from, from the modern
 * InvoicePayment links.
 *
 * `amount_paid` on an InvoicePayment is an ALLOCATION to that invoice, so it can
 * be smaller than the linked PaymentIntent's received total — for example when
 * one payment settled several invoices. Refunding against that PaymentIntent
 * would then take another invoice's money. This packet does not support
 * splitting such a payment, so anything other than "exactly one paid
 * InvoicePayment whose allocation equals the PaymentIntent's received total" is
 * HELD, not guessed.
 */
export function resolveRefundableAllocation(input: {
  invoicePayments: unknown[];
  invoiceId: string;
  mode: StripeMode;
  paymentIntent: unknown;
  customerId: string;
}): AllocationResult {
  const paid: PaymentAllocation[] = [];
  for (const row of input.invoicePayments) {
    if (!row || typeof row !== "object") return { ok: false, reason: "invoice_payment_unreadable" };
    const entry = row as Record<string, unknown>;
    if (entry.object !== undefined && entry.object !== "invoice_payment")
      return { ok: false, reason: "invoice_payment_object" };
    if (idOf(entry.invoice) !== input.invoiceId)
      return { ok: false, reason: "invoice_payment_foreign" };
    const status = typeof entry.status === "string" ? entry.status : "";
    if (status !== "paid") continue;
    const payment = (entry.payment ?? null) as Record<string, unknown> | null;
    if (!payment || payment.type !== "payment_intent")
      return { ok: false, reason: "invoice_payment_type_unsupported" };
    const paymentIntentId = idOf(payment.payment_intent);
    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId))
      return { ok: false, reason: "invoice_payment_link" };
    const allocated =
      typeof entry.amount_paid === "number" && Number.isInteger(entry.amount_paid)
        ? entry.amount_paid
        : null;
    if (allocated === null || allocated <= 0)
      return { ok: false, reason: "invoice_payment_amount" };
    const currency = typeof entry.currency === "string" ? entry.currency.toLowerCase() : "";
    if (!/^[a-z]{3}$/.test(currency)) return { ok: false, reason: "invoice_payment_currency" };
    paid.push({
      invoicePaymentId: idOf(entry.id),
      paymentIntentId,
      allocatedMinor: allocated,
      currency,
    });
  }
  if (paid.length === 0) return { ok: false, reason: "invoice_payment_absent" };
  if (paid.length > 1) return { ok: false, reason: "invoice_payment_ambiguous" };
  const allocation = paid[0];

  const intent = input.paymentIntent;
  if (!intent || typeof intent !== "object")
    return { ok: false, reason: "payment_intent_unreadable" };
  const pi = intent as Record<string, unknown>;
  if (pi.object !== undefined && pi.object !== "payment_intent")
    return { ok: false, reason: "payment_intent_object" };
  if (idOf(pi.id) !== allocation.paymentIntentId)
    return { ok: false, reason: "payment_intent_identity" };
  if (pi.livemode !== livemodeFor(input.mode)) return { ok: false, reason: "payment_intent_mode" };
  if (idOf(pi.customer) !== input.customerId)
    return { ok: false, reason: "payment_intent_customer" };
  if (pi.status !== "succeeded") return { ok: false, reason: "payment_intent_not_succeeded" };
  const currency = typeof pi.currency === "string" ? pi.currency.toLowerCase() : "";
  if (currency !== allocation.currency) return { ok: false, reason: "payment_intent_currency" };
  const received =
    typeof pi.amount_received === "number" && Number.isInteger(pi.amount_received)
      ? pi.amount_received
      : null;
  if (received === null || received <= 0) return { ok: false, reason: "payment_intent_amount" };
  // The decisive hold: this allocation is only safe to refund in full when the
  // payment received nothing beyond it.
  if (received !== allocation.allocatedMinor)
    return { ok: false, reason: "payment_allocation_ambiguous" };
  return { ok: true, value: allocation };
}

/**
 * The total already committed against a payment, from a COMPLETE refund list.
 *
 * Every non-releasing outcome counts — pending, requires_action, succeeded and
 * every unknown or unreadable status — because ambiguous money is spent money
 * until an authoritative failure says otherwise.
 */
export type CommittedResult =
  | { ok: true; committedMinor: number; byStatus: Record<string, number> }
  | { ok: false; reason: string };

export function committedRefundTotal(input: {
  refunds: unknown[];
  paymentIntentId: string;
  currency: string;
}): CommittedResult {
  let committed = 0;
  const byStatus: Record<string, number> = {};
  for (const row of input.refunds) {
    if (!row || typeof row !== "object") return { ok: false, reason: "refund_list_unreadable" };
    const refund = row as Record<string, unknown>;
    if (refund.object !== undefined && refund.object !== "refund")
      return { ok: false, reason: "refund_list_object" };
    if (idOf(refund.payment_intent) !== input.paymentIntentId)
      return { ok: false, reason: "refund_list_foreign" };
    const currency = typeof refund.currency === "string" ? refund.currency.toLowerCase() : "";
    if (currency !== input.currency.toLowerCase())
      return { ok: false, reason: "refund_list_currency" };
    const amount =
      typeof refund.amount === "number" && Number.isInteger(refund.amount) ? refund.amount : null;
    if (amount === null || amount < 0) return { ok: false, reason: "refund_list_amount" };
    const status = classifyRefundStatus(refund.status);
    byStatus[status] = (byStatus[status] ?? 0) + amount;
    if (refundConsumesFunds(status)) committed += amount;
  }
  return { ok: true, committedMinor: committed, byStatus };
}

export const REFUND_POLICY_BASES = [
  "firstPayment14Day",
  "legalRequired",
  "outage",
  "abuseException",
] as const;
export type RefundPolicyBasis = (typeof REFUND_POLICY_BASES)[number];

export const REFUND_SUBSCRIPTION_DISPOSITIONS = [
  "cancelAtPeriodEndSeparately",
  "retainSubscription",
  "cancelImmediatelyHeld",
] as const;
export const REFUND_ACCESS_DISPOSITIONS = [
  "retainUntilPeriodEnd",
  "unchanged",
  "revokeOnRefundHeld",
] as const;
export type RefundSubscriptionDisposition = (typeof REFUND_SUBSCRIPTION_DISPOSITIONS)[number];
export type RefundAccessDisposition = (typeof REFUND_ACCESS_DISPOSITIONS)[number];

/** Dispositions this packet can actually honour. The `…Held` ones are recorded
 * faithfully but refused at execution: inferring an immediate cancellation or an
 * entitlement revoke from a refund is exactly what must not happen. */
export function dispositionSupported(input: {
  subscription: unknown;
  access: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (
    typeof input.subscription !== "string" ||
    !(REFUND_SUBSCRIPTION_DISPOSITIONS as readonly string[]).includes(input.subscription)
  )
    return { ok: false, reason: "subscription_disposition_missing" };
  if (
    typeof input.access !== "string" ||
    !(REFUND_ACCESS_DISPOSITIONS as readonly string[]).includes(input.access)
  )
    return { ok: false, reason: "access_disposition_missing" };
  if (input.subscription === "cancelImmediatelyHeld")
    return { ok: false, reason: "subscription_disposition_held" };
  if (input.access === "revokeOnRefundHeld")
    return { ok: false, reason: "access_disposition_held" };
  return { ok: true };
}

export const FIRST_PAYMENT_REFUND_WINDOW_MS = 14 * 24 * 3600 * 1000;

/**
 * The published refund policy, evaluated from AUTHORITATIVE payment facts and
 * the recorded case timing.
 *
 * - the 14-day first-payment guarantee is FULL, on the FIRST payment only,
 *   REQUESTED (not approved) within 14 days of it, once per customer and plan,
 *   and it does not apply to an account that breached the Terms;
 * - renewals and unused time are not refundable, so a renewal invoice needs an
 *   explicit approved legal or outage exception;
 * - an approved exception may be partial, but never more than the funds that
 *   payment actually allocated to this invoice.
 *
 * This is policy evaluation only. It states no legal advice, changes no
 * consumer terms, and claims nothing about execution.
 */
export type PolicyDecision = { ok: true; full: boolean } | { ok: false; reason: string };

export function evaluateRefundPolicy(input: {
  basis: RefundPolicyBasis;
  /** Milliseconds. The ORIGINAL support request time, recorded on the case. */
  requestedAtMs: number;
  /** Milliseconds. Authoritative payment time of the FIRST payment for the plan. */
  firstPaymentAtMs: number | null;
  /** Is the invoice being refunded the first payment for this plan? */
  invoiceIsFirstPayment: boolean;
  amountMinor: number;
  allocatedMinor: number;
  /** Terms breach recorded on the account (abusive AI usage, unlawful content). */
  termsBreached: boolean;
}): PolicyDecision {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)
    return { ok: false, reason: "amount_invalid" };
  if (!Number.isInteger(input.allocatedMinor) || input.allocatedMinor <= 0)
    return { ok: false, reason: "allocation_invalid" };
  if (input.amountMinor > input.allocatedMinor)
    return { ok: false, reason: "amount_exceeds_payment" };
  if (!Number.isFinite(input.requestedAtMs) || input.requestedAtMs <= 0)
    return { ok: false, reason: "requested_at_unknown" };

  switch (input.basis) {
    case "firstPayment14Day": {
      if (input.termsBreached) return { ok: false, reason: "terms_breach_exception" };
      if (!input.invoiceIsFirstPayment) return { ok: false, reason: "not_first_payment" };
      if (input.firstPaymentAtMs === null || !Number.isFinite(input.firstPaymentAtMs))
        return { ok: false, reason: "first_payment_time_unknown" };
      const elapsed = input.requestedAtMs - input.firstPaymentAtMs;
      if (elapsed < 0) return { ok: false, reason: "request_precedes_payment" };
      if (elapsed > FIRST_PAYMENT_REFUND_WINDOW_MS)
        return { ok: false, reason: "outside_14_day_window" };
      // The published guarantee is the payment refunded IN FULL.
      if (input.amountMinor !== input.allocatedMinor)
        return { ok: false, reason: "guarantee_requires_full_refund" };
      return { ok: true, full: true };
    }
    case "legalRequired":
    case "outage":
      // Explicitly approved exceptions to the no-renewal-refund rule. They may
      // be partial; the amount bound above still applies.
      return { ok: true, full: input.amountMinor === input.allocatedMinor };
    case "abuseException":
      // The abuse exception REMOVES the guarantee; it never creates a refund.
      return { ok: false, reason: "abuse_exception_refuses_refund" };
    default:
      return { ok: false, reason: "policy_basis_unknown" };
  }
}

/** Support copy returned with a refund result. It reports the published
 * response and settlement timings and deliberately makes no claim that money
 * has moved; no message is sent from this packet. */
export const REFUND_SUPPORT_COPY = {
  responseTime: "We reply to refund requests within 2 business days.",
  settlementTime:
    "Approved refunds are returned to the original payment method; banks typically post them within 5–10 business days.",
} as const;

/* -------------------------------------------------------------------------- */
/* Access projection gate (the application half)                              */
/* -------------------------------------------------------------------------- */

/**
 * Would this projection WIDEN the allowance while a paid change is still
 * unresolved?
 *
 * This is the application half of `stripe_commercial_guarded_projection`, kept
 * in sync with it deliberately: the SQL wrapper is the gate that actually
 * enforces the rule inside the projection transaction, and this function exists
 * so the same rule can be reasoned about and tested as a pure decision. A
 * helper on its own would prove nothing — see the wrapper for the enforcement.
 *
 * THE THRESHOLD IS THE OPERATION'S IMMUTABLE BASELINE, not the latest observed
 * `stripe_subscriptions` row. That distinction is the whole correction: the
 * stored row records the latest OBSERVED state, granting or not, so a
 * legitimate non-granting observation of a larger plan (an observed
 * `past_due` pro/4) used to raise the bar it was compared against, and the next
 * granting pro/4 then compared equal and passed while the operation that pays
 * for it was still unresolved.
 *
 * So the baseline is captured once, at `begin_operation`, from
 * `stripe_commercial_verified_baseline` — which re-proves the foundation's own
 * grant predicate — and never updated. `baselineKnown: false` is an explicit
 * HOLD of every granting projection: it is not a zero allowance, not a smaller
 * plan to assume, and not a signal to pick fresh prices. Decreases,
 * projections equal to the baseline, and every revoke or non-granting
 * projection are deliberately NOT held.
 */
export function pendingChangeWouldWiden(input: {
  /** The subscription the unresolved plan/seat operation is about, or null when
   * no operation holds this owner's slot. */
  openOperationSubscriptionId: string | null;
  /** The operation's frozen, re-proved allowance baseline. */
  baselineKnown: boolean;
  baselinePlanId: PlanId | null;
  baselineSeatQuantity: number | null;
  baselineSubscriptionId: string | null;
  projectedSubscriptionId: string;
  projectedPlanId: PlanId;
  projectedSeatQuantity: number;
  projectedGrants: boolean;
}): boolean {
  if (!input.projectedGrants) return false;
  if (!input.openOperationSubscriptionId) return false;
  // No proved allowance, a baseline for a different subscription, a projection
  // naming a subscription the pending operation is not about, or a plan this
  // policy does not recognise: all ambiguous, so all held.
  if (!input.baselineKnown) return true;
  if (!input.baselineSubscriptionId) return true;
  if (input.baselineSubscriptionId !== input.projectedSubscriptionId) return true;
  if (input.openOperationSubscriptionId !== input.projectedSubscriptionId) return true;
  if (planRank(input.projectedPlanId) < 0) return true;
  if (planRank(input.projectedPlanId) > planRank(input.baselinePlanId)) return true;
  return input.projectedSeatQuantity > (input.baselineSeatQuantity ?? 0);
}
