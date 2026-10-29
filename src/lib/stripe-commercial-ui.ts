/**
 * Billing UI contract and controller — PURE, client + server safe.
 *
 * This module owns three things the billing route and the commercial panel must
 * NOT re-invent in JSX:
 *
 *  1. The exact shape of the caller-owned read adapter's answer
 *     (`BillingSummaryResult`), shared by `stripe-commercial.server.ts`,
 *     `stripe-commercial.functions.ts`, the route and the browser harness, so
 *     there is one contract rather than four lookalikes.
 *  2. A FINITE translation of the caller API's open `reason: string` into
 *     localized keys, plus a conservative disposition for anything unknown. The
 *     API has no closed enum and composed reasons can embed a field name, so no
 *     suffix is ever rendered, interpolated or logged.
 *  3. A reducer for the parts of the flow that are easy to get dangerously
 *     wrong: one dispatch per confirmation, a durable operation identity that
 *     survives an ambiguous answer, discovery-driven reentry, and the rejection
 *     of a late response that belongs to an earlier user or request.
 *
 * Deliberate absences, each of them a product rule rather than an oversight:
 *
 *  - No current billed amount is ever derived here. The local schema has none,
 *    so `currentAmountEvidence: "unknown"` is the production answer and a
 *    catalogue price, the store's reconstructed `priceMonthly` or a previous
 *    quote may not fill the gap.
 *  - No optimistic access. Nothing in this module can set a plan, a seat count
 *    or an entitlement; only a verified refreshed summary changes what is shown.
 *  - No replacement intent. Once a mutation has been dispatched, every failure
 *    keeps the SAME operation id and quote binding; a new one can only come
 *    from a deliberate new intent after discovery says the slot is free.
 */
import { isPlanId } from "./entitlements";
import type { PlanId } from "./billing";

/* -------------------------------------------------------------------------- */
/* The caller-owned read adapter's contract                                   */
/* -------------------------------------------------------------------------- */

/** Free is not a sellable input to the commercial API. */
export type SellablePlanId = "starter" | "growth" | "pro" | "agency";

export const SELLABLE_PLAN_IDS: readonly SellablePlanId[] = ["starter", "growth", "pro", "agency"];

export function isSellablePlanId(value: unknown): value is SellablePlanId {
  return typeof value === "string" && (SELLABLE_PLAN_IDS as readonly string[]).includes(value);
}

/**
 * The accepted supported-currency exponents, in a CLIENT-SAFE module.
 *
 * `stripe-commercial.ts` owns the authoritative map, but it reaches
 * `stripe-lifecycle.ts`, which imports `node:crypto` — so the browser cannot
 * import it. This copy is pinned to the accepted one by
 * `stripe-commercial-ui.test.ts`, which imports both and compares them, so a
 * future catalogue change cannot silently desynchronise the two.
 *
 * An unlisted currency is HELD, never divided by a guessed exponent: getting
 * that wrong is a hundredfold error on a real customer's money.
 */
export const UI_SUPPORTED_CURRENCY_EXPONENT: Readonly<Record<string, number>> = Object.freeze({
  eur: 2,
  pln: 2,
  sek: 2,
  dkk: 2,
  gbp: 2,
});

/**
 * Where a displayed current amount came from. The production read adapter has
 * NO source for the customer's proven debit and must always report `"unknown"`;
 * `"fixture"` exists only so the local browser harness can exercise the money
 * presentation without the product pretending it has that evidence.
 */
export type MoneyEvidence = "unknown" | "fixture";

/** Display provider, from VALIDATED raw entitlement — never guessed from the
 * presence of a test customer mapping or from a paddle-labelled store field. */
export type BillingProvider = "stripe" | "paddle" | "manual" | "none" | "unknown";

/** What the read established about the caller's own durable operation slot. */
export type OperationEvidence = "none" | "open" | "ambiguous" | "unknown";

export interface BillingSummaryActions {
  /** The existing caller-owned Paddle portal, for a VERIFIED Paddle agreement. */
  paddlePortal: boolean;
  /** A NEW commercial intent may be prepared. */
  prepareChange: boolean;
  /** An explicit cancellation intent may be started. */
  cancel: boolean;
  /** Reversal of the exact eligible applied cancellation. */
  reverseCancellation: boolean;
  /** An explicit recovery of the EXISTING operation is authorised. */
  recoverOperation: boolean;
  /** The owner's manual beta/comped/reset is locally clear. */
  manualOverride: boolean;
}

export const NO_ACTIONS: BillingSummaryActions = {
  paddlePortal: false,
  prepareChange: false,
  cancel: false,
  reverseCancellation: false,
  recoverOperation: false,
  manualOverride: false,
};

/** The original terms an operation is bound to. Unknown fields stay null; a
 * null amount is UNKNOWN and a zero amount is a real zero. */
export interface OperationTerms {
  planId: SellablePlanId | null;
  seatQuantity: number | null;
  amountMinor: number | null;
  recurringEstimateMinor: number | null;
  currency: string | null;
  direction: "increase" | "decrease" | null;
  effectiveAt: string | null;
  expiresAt: string | null;
}

export interface DiscoveredOperation {
  /** Opaque caller identity. No provider id ever reaches here. */
  operationId: string;
  kind: string;
  state: string;
  quoteId: string | null;
  /** For a reversal: the exact eligible applied cancellation. */
  cancelOperationId: string | null;
  terms: OperationTerms | null;
}

export interface BillingSummary {
  provider: BillingProvider;
  /** Only for a Stripe display provider with a validated mapping. */
  mode: "test" | "live" | null;
  /** Raw validated plan; null is UNKNOWN, not Free. */
  planId: PlanId | null;
  /** Effective access under the existing rules; unknown stays unknown. */
  access: "free" | "paid" | "unknown";
  status: string | null;
  /** Verified purchased EXTRA seats; null is unknown, 0 is a real zero. */
  purchasedSeats: number | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  /** The customer's proven current debit. Production: always null/unknown. */
  currentAmountMinor: number | null;
  currentCurrency: string | null;
  currentAmountEvidence: MoneyEvidence;
  operation: DiscoveredOperation | null;
  operationEvidence: OperationEvidence;
  /** The exact eligible applied cancellation a reversal may name. */
  eligibleCancellationId: string | null;
  actions: BillingSummaryActions;
  /** Why mutations are unavailable, when they are. */
  heldReason: string | null;
}

export type BillingSummaryResult =
  { ok: true; summary: BillingSummary } | { ok: false; reason: string };

/** The preview, exactly as the accepted caller API returns it. */
export interface CommercialQuote {
  quoteId: string;
  direction: "increase" | "decrease";
  amountMinor: number;
  recurringEstimateMinor: number;
  recurringEstimateIncludesAdjustments: boolean;
  recurringEstimateNote: string;
  currency: string;
  effectiveAt: string | null;
  immediate: boolean;
  expiresAt: string;
  planId: SellablePlanId;
  seatQuantity: number;
  workingSeatAllowance: number;
  viewerSeatAllowance: number;
  projectAllowance: number;
  effectiveNote: string;
}

export type CommercialQuoteResult = { ok: true } & CommercialQuote;
export type CommercialConfirmResult =
  | {
      ok: true;
      state: "applied" | "awaiting_payment" | "scheduled";
      direction: "increase" | "decrease";
      effectiveAt: string | null;
      currency: string;
      amountMinor: number;
      note: string;
    }
  | { ok: false; reason: string };
export type CommercialCancelResult =
  | { ok: true; cancelAtPeriodEnd: boolean; effectiveAt: string | null; note: string }
  | { ok: false; reason: string };

/* -------------------------------------------------------------------------- */
/* Strict wire readers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a runtime response actually turned out to be.
 *
 * A TypeScript return type is a compile-time promise about a value that
 * crossed a network boundary; it validates nothing. These three outcomes are
 * deliberately distinct because they are treated differently:
 *
 *  - `value`      a response we could read completely.
 *  - `refusal`    a well-formed `{ ok:false, reason }`.
 *  - `unreadable` anything else. BEFORE a dispatch that is unavailable/held;
 *                 AFTER a dispatch it is uncertain, and the original intent is
 *                 retained rather than settled.
 */
export type WireRead<T> =
  { kind: "value"; value: T } | { kind: "refusal"; reason: string } | { kind: "unreadable" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An opaque caller identity: exactly the UUID shape the accepted validators
 * require, so the UI can never submit something the endpoint will reject. */
export function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
function optionalOpaqueId(value: unknown): value is string | null {
  return value === null || isOpaqueId(value);
}
/** A non-negative safe integer. `-1` and `1e21` are not counts or amounts. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
/** A date string the product can actually show. */
function isReadableDate(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}
function isNullableReadableDate(value: unknown): value is string | null {
  return value === null || isReadableDate(value);
}
/** A currency this product can present AND compare against the catalogue.
 * An unsupported code is not a formatting inconvenience: an amount the screen
 * can only show as unknown must never become a confirmable offer. */
export function isSupportedCurrency(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z]{3}$/.test(value) &&
    Object.prototype.hasOwnProperty.call(UI_SUPPORTED_CURRENCY_EXPONENT, value)
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function refusalOf(raw: Record<string, unknown>, fallback: string): WireRead<never> {
  // `ok` must be exactly `false`. A truthy non-boolean is not a success and a
  // falsy non-boolean is not a refusal; both are unreadable.
  if (raw.ok !== false) return { kind: "unreadable" };
  const reason = typeof raw.reason === "string" && raw.reason.trim() !== "" ? raw.reason : fallback;
  return { kind: "refusal", reason };
}

/** The terms an operation is bound to, validated as a whole. */
function readOperationTerms(value: unknown): OperationTerms | "unreadable" | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return "unreadable";
  const { planId, seatQuantity, amountMinor, recurringEstimateMinor, currency } = value;
  const direction = value.direction;
  if (
    !isSellablePlanId(planId) ||
    !isCount(seatQuantity) ||
    !isCount(amountMinor) ||
    !isCount(recurringEstimateMinor) ||
    !isSupportedCurrency(currency) ||
    (direction !== "increase" && direction !== "decrease") ||
    !isNullableReadableDate(value.effectiveAt) ||
    !isNullableReadableDate(value.expiresAt)
  )
    return "unreadable";
  return {
    planId,
    seatQuantity,
    amountMinor,
    recurringEstimateMinor,
    currency,
    direction,
    effectiveAt: value.effectiveAt as string | null,
    expiresAt: value.expiresAt as string | null,
  };
}

const PROVIDERS: readonly BillingProvider[] = ["stripe", "paddle", "manual", "none", "unknown"];
const ACCESS_VALUES: readonly BillingSummary["access"][] = ["free", "paid", "unknown"];
const OPERATION_EVIDENCE: readonly OperationEvidence[] = ["none", "open", "ambiguous", "unknown"];
const MONEY_EVIDENCE: readonly MoneyEvidence[] = ["unknown", "fixture"];
const ACTION_KEYS: readonly (keyof BillingSummaryActions)[] = [
  "paddlePortal",
  "prepareChange",
  "cancel",
  "reverseCancellation",
  "recoverOperation",
  "manualOverride",
];

/**
 * Validate a summary response.
 *
 * Nothing here may throw and nothing may be half-read: an unknown plan that
 * the route would later index into the catalogue, a truthy non-boolean `ok`,
 * an unparseable period end or a malformed operation identity all make the
 * whole answer unreadable, which the reducer shows as unavailable while
 * keeping any previously verified facts on screen.
 */
export function readSummaryResponse(value: unknown): WireRead<BillingSummary> {
  if (!isRecord(value)) return { kind: "unreadable" };
  if (value.ok !== true) return refusalOf(value, "billing_read_unreadable");
  const raw = value.summary;
  if (!isRecord(raw)) return { kind: "unreadable" };

  const provider = raw.provider;
  const access = raw.access;
  const mode = raw.mode;
  const planId = raw.planId;
  const operationEvidence = raw.operationEvidence;
  const currentAmountEvidence = raw.currentAmountEvidence;
  const actions = raw.actions;
  if (
    !PROVIDERS.includes(provider as BillingProvider) ||
    !ACCESS_VALUES.includes(access as BillingSummary["access"]) ||
    (mode !== null && mode !== "test" && mode !== "live") ||
    (planId !== null && !isPlanId(planId)) ||
    (raw.status !== null && typeof raw.status !== "string") ||
    (raw.purchasedSeats !== null && !isCount(raw.purchasedSeats)) ||
    !isNullableReadableDate(raw.periodEnd) ||
    (raw.cancelAtPeriodEnd !== null && typeof raw.cancelAtPeriodEnd !== "boolean") ||
    (raw.currentAmountMinor !== null && !isCount(raw.currentAmountMinor)) ||
    (raw.currentCurrency !== null && !isSupportedCurrency(raw.currentCurrency)) ||
    !MONEY_EVIDENCE.includes(currentAmountEvidence as MoneyEvidence) ||
    !OPERATION_EVIDENCE.includes(operationEvidence as OperationEvidence) ||
    !optionalOpaqueId(raw.eligibleCancellationId) ||
    (raw.heldReason !== null && typeof raw.heldReason !== "string") ||
    !isRecord(actions) ||
    ACTION_KEYS.some((key) => typeof actions[key] !== "boolean")
  )
    return { kind: "unreadable" };
  // A stated amount needs its currency and vice versa: half a price is not a
  // price, and the evidence tag has to agree with both.
  const hasAmount = raw.currentAmountMinor !== null;
  if (hasAmount !== (raw.currentCurrency !== null)) return { kind: "unreadable" };
  if (hasAmount && currentAmountEvidence === "unknown") return { kind: "unreadable" };

  let operation: DiscoveredOperation | null = null;
  let evidenceState = operationEvidence as OperationEvidence;
  let termsUnreadable = false;
  if (raw.operation !== null && raw.operation !== undefined) {
    const found = raw.operation;
    if (!isRecord(found)) return { kind: "unreadable" };
    if (
      !isOpaqueId(found.operationId) ||
      typeof found.kind !== "string" ||
      found.kind.trim() === "" ||
      typeof found.state !== "string" ||
      found.state.trim() === "" ||
      !optionalOpaqueId(found.quoteId) ||
      !optionalOpaqueId(found.cancelOperationId)
    )
      return { kind: "unreadable" };
    const terms = readOperationTerms(found.terms);
    // Malformed ORIGINAL terms do not invalidate the whole read, but they do
    // hold recovery: the operation is reported, with no fabricated terms.
    termsUnreadable = terms === "unreadable";
    operation = {
      operationId: found.operationId,
      kind: found.kind,
      state: found.state,
      quoteId: (found.quoteId as string | null) ?? null,
      cancelOperationId: (found.cancelOperationId as string | null) ?? null,
      terms: terms === "unreadable" ? null : terms,
    };
    if (termsUnreadable) evidenceState = "unknown";
  }

  return {
    kind: "value",
    value: coherentSummary({
      provider: provider as BillingProvider,
      mode: mode as "test" | "live" | null,
      planId: (planId as PlanId | null) ?? null,
      access: access as BillingSummary["access"],
      status: raw.status as string | null,
      purchasedSeats: raw.purchasedSeats as number | null,
      periodEnd: raw.periodEnd as string | null,
      cancelAtPeriodEnd: raw.cancelAtPeriodEnd as boolean | null,
      currentAmountMinor: raw.currentAmountMinor as number | null,
      currentCurrency: raw.currentCurrency as string | null,
      currentAmountEvidence: currentAmountEvidence as MoneyEvidence,
      operation,
      operationEvidence: evidenceState,
      eligibleCancellationId: (raw.eligibleCancellationId as string | null) ?? null,
      actions: actions as unknown as BillingSummaryActions,
      heldReason: termsUnreadable
        ? "operation_unavailable"
        : ((raw.heldReason as string | null) ?? null),
    }),
  };
}

/**
 * Normalise a structurally valid summary against what it actually claims.
 *
 * Field types being individually legal is not enough. A payload can say
 * `provider:"unknown", access:"unknown", planId:null` and still set
 * `prepareChange:true`, and nothing downstream would question it — the reducer
 * would mark it fresh and the selectors would trust the booleans. That is an
 * unknown account acquiring the authority to charge somebody.
 *
 * So every action is re-derived from the evidence that would have to be true
 * for it to make sense. This is deliberately conservative and one-directional:
 * it can only ever REMOVE an action, never add one, and the displayed facts
 * are left exactly as read. When something is removed the answer also carries
 * a held reason, so the screen explains itself instead of silently offering
 * less than the server said.
 */
/**
 * The operation kinds this screen can actually carry out, and the UI intent
 * each one resumes as.
 *
 * `refund` is a real server kind and is deliberately absent: refunds are
 * operator-led and there is no caller endpoint for them, so encountering one
 * must hold rather than fall through to a plan change. Anything unrecognised
 * holds for the same reason — an operation we cannot name is not one we can
 * safely re-dispatch.
 */
const RECOVERABLE_KINDS: Readonly<Record<string, CommercialIntentKind>> = {
  plan_change: "change",
  seat_change: "change",
  cancel: "cancel",
  reverse_cancel: "reverse",
};

/** The states in which an operation is still open. `applied`, `refused` and
 * `failed` are finished and can never advertise a callable recovery, whatever
 * else the payload says. */
const NONTERMINAL_OPERATION_STATES: ReadonlySet<string> = new Set([
  "prepared",
  "dispatching",
  "awaiting_payment",
  "awaiting_apply",
  "fenced",
]);

export function recoverableIntentKind(serverKind: string): CommercialIntentKind | null {
  return Object.prototype.hasOwnProperty.call(RECOVERABLE_KINDS, serverKind)
    ? RECOVERABLE_KINDS[serverKind]
    : null;
}

/**
 * Can this discovered operation actually be resumed, as a whole?
 *
 * Not "is there an operation object" — that is what let an `invented_kind`
 * payload, a terminal `applied` state dressed as open, and a reversal with no
 * cancellation to name all reach a confirm. Each kind has a binding it cannot
 * be replayed without, and that binding has to be present and readable.
 *
 * Note what is deliberately NOT required: a Stripe display provider, paid
 * access, or an unexpired preview. The real adapter legitimately reports a
 * recoverable operation with `provider:"unknown"` and every display fact null
 * when there is no raw entitlement but a coherent mapping and projection, and
 * a dispatched operation keeps its original terms long past the quote's
 * expiry.
 */
function operationRecoverable(summary: BillingSummary): boolean {
  const found = summary.operation;
  if (!found) return false;
  if (summary.operationEvidence !== "open") return false;
  // Recovery targets one exact agreement, so the caller needs a resolved mode
  // to target it in.
  if (summary.mode === null) return false;
  if (!NONTERMINAL_OPERATION_STATES.has(found.state)) return false;
  const kind = recoverableIntentKind(found.kind);
  if (kind === null) return false;
  if (kind === "reverse") return isOpaqueId(found.cancelOperationId);
  if (kind === "cancel") return true;
  // A change replays its ORIGINAL quote and terms; without them there is
  // nothing to replay.
  const terms = found.terms;
  return (
    isOpaqueId(found.quoteId) &&
    terms !== null &&
    terms.planId !== null &&
    isCount(terms.seatQuantity) &&
    isCount(terms.amountMinor) &&
    isSupportedCurrency(terms.currency)
  );
}

function coherentSummary(summary: BillingSummary): BillingSummary {
  const established = summary.provider !== "unknown" && summary.access !== "unknown";
  // A NEW commercial action targets the current agreement, so it needs the
  // mode that agreement was resolved in. An unresolved mode means the server
  // could not place it, and a change dispatched into that gap would be aimed
  // at nothing in particular.
  const stripeAgreement = established && summary.provider === "stripe" && summary.mode !== null;
  const actions: BillingSummaryActions = {
    // Only a verified Paddle agreement has a Paddle portal.
    paddlePortal: summary.actions.paddlePortal && established && summary.provider === "paddle",
    // Commercial changes need a known, currently paid Stripe agreement.
    prepareChange: summary.actions.prepareChange && stripeAgreement && summary.access === "paid",
    cancel: summary.actions.cancel && stripeAgreement && summary.access === "paid",
    // A reversal needs the exact cancellation identity to name.
    reverseCancellation:
      summary.actions.reverseCancellation &&
      stripeAgreement &&
      isOpaqueId(summary.eligibleCancellationId),
    // Recovery needs an operation whose whole contract we can honour.
    recoverOperation: summary.actions.recoverOperation && operationRecoverable(summary),
    // A manual grant replaces whatever the row says, so an unestablished
    // provider or access tier cannot authorise one either. An ENDED Stripe
    // agreement legitimately can: that is access "free" with a known provider.
    manualOverride: summary.actions.manualOverride && established,
  };
  const weakened = ACTION_KEYS.some((key) => summary.actions[key] !== actions[key]);
  if (!weakened) return summary;
  return {
    ...summary,
    actions,
    heldReason:
      summary.heldReason ?? (established ? "evidence_incoherent" : "billing_state_unknown"),
  };
}

/** What the client asked for, so the answer can be bound to the question. */
export interface QuoteRequestBinding {
  quoteId: string;
  planId: SellablePlanId;
  seatQuantity: number;
}

/**
 * Validate a preview response and bind it to the EXACT request.
 *
 * A response whose shape cannot be read exactly is unreadable, not a quote
 * with blanks: a missing amount must never render as zero and a missing
 * currency must never be guessed. On top of that the answer must be the answer
 * to this question — same quote id, same plan, same seat count — because the
 * confirmation that follows echoes these values back as the terms the customer
 * was shown.
 */
export function readQuoteResponse(
  value: unknown,
  request: QuoteRequestBinding | null,
): WireRead<CommercialQuote> {
  if (!isRecord(value)) return { kind: "unreadable" };
  if (value.ok !== true) return refusalOf(value, "quote_unreadable");
  const raw = value;
  const quoteId = raw.quoteId;
  const currency = raw.currency;
  const direction = raw.direction;
  if (
    !isOpaqueId(quoteId) ||
    !isSupportedCurrency(currency) ||
    (direction !== "increase" && direction !== "decrease") ||
    !isSellablePlanId(raw.planId) ||
    typeof raw.immediate !== "boolean" ||
    typeof raw.recurringEstimateIncludesAdjustments !== "boolean" ||
    !isCount(raw.amountMinor) ||
    !isCount(raw.recurringEstimateMinor) ||
    !isCount(raw.seatQuantity) ||
    !isCount(raw.workingSeatAllowance) ||
    !isCount(raw.viewerSeatAllowance) ||
    !isCount(raw.projectAllowance) ||
    !isReadableDate(raw.expiresAt) ||
    !isNullableReadableDate(raw.effectiveAt) ||
    // A change that is not immediate must say exactly when it takes effect.
    (raw.immediate === false && !isReadableDate(raw.effectiveAt))
  )
    return { kind: "unreadable" };
  if (!request) return { kind: "refusal", reason: "quote_foreign" };
  if (quoteId !== request.quoteId) return { kind: "refusal", reason: "quote_foreign" };
  if (raw.planId !== request.planId || raw.seatQuantity !== request.seatQuantity)
    return { kind: "refusal", reason: "quote_tampered" };
  return {
    kind: "value",
    value: {
      quoteId,
      direction,
      amountMinor: raw.amountMinor,
      recurringEstimateMinor: raw.recurringEstimateMinor,
      recurringEstimateIncludesAdjustments: raw.recurringEstimateIncludesAdjustments,
      recurringEstimateNote:
        typeof raw.recurringEstimateNote === "string" ? raw.recurringEstimateNote : "",
      currency,
      effectiveAt: (raw.effectiveAt as string | null) ?? null,
      immediate: raw.immediate,
      expiresAt: raw.expiresAt,
      planId: raw.planId,
      seatQuantity: raw.seatQuantity,
      workingSeatAllowance: raw.workingSeatAllowance,
      viewerSeatAllowance: raw.viewerSeatAllowance,
      projectAllowance: raw.projectAllowance,
      effectiveNote: typeof raw.effectiveNote === "string" ? raw.effectiveNote : "",
    },
  };
}

export interface ConfirmedChange {
  state: "applied" | "awaiting_payment" | "scheduled";
  direction: "increase" | "decrease";
  effectiveAt: string | null;
  currency: string;
  amountMinor: number;
  note: string;
}

/** Validate a confirmation response. An unknown state is NOT a success. */
export function readConfirmResponse(value: unknown): WireRead<ConfirmedChange> {
  if (!isRecord(value)) return { kind: "unreadable" };
  if (value.ok !== true) return refusalOf(value, "change_uncertain");
  const state = value.state;
  const direction = value.direction;
  if (
    (state !== "applied" && state !== "awaiting_payment" && state !== "scheduled") ||
    (direction !== "increase" && direction !== "decrease") ||
    !isSupportedCurrency(value.currency) ||
    !isCount(value.amountMinor) ||
    !isNullableReadableDate(value.effectiveAt)
  )
    return { kind: "unreadable" };
  return {
    kind: "value",
    value: {
      state,
      direction,
      effectiveAt: (value.effectiveAt as string | null) ?? null,
      currency: value.currency,
      amountMinor: value.amountMinor,
      note: typeof value.note === "string" ? value.note : "",
    },
  };
}

export interface ConfirmedCancellation {
  cancelAtPeriodEnd: boolean;
  effectiveAt: string | null;
  note: string;
}

/** Validate a cancellation/reversal response. A bare `{ok:true}` is not a
 * cancellation: the flag and the effective date are the whole answer. */
export function readCancelResponse(value: unknown): WireRead<ConfirmedCancellation> {
  if (!isRecord(value)) return { kind: "unreadable" };
  if (value.ok !== true) return refusalOf(value, "cancellation_uncertain");
  if (typeof value.cancelAtPeriodEnd !== "boolean" || !isNullableReadableDate(value.effectiveAt))
    return { kind: "unreadable" };
  return {
    kind: "value",
    value: {
      cancelAtPeriodEnd: value.cancelAtPeriodEnd,
      effectiveAt: (value.effectiveAt as string | null) ?? null,
      note: typeof value.note === "string" ? value.note : "",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Finite reason translation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a refusal means for the CALLER'S INTENT, not for the subscription.
 *
 *  - `held`     nothing was dispatched; the action is simply unavailable.
 *  - `uncertain` a request may exist at the provider; preserve the operation
 *               and settle it only through discovery or an authorised
 *               same-operation recovery.
 *  - `negative` a recorded negative outcome for THIS exact operation. It is
 *               still not permission to invent a replacement: discovery comes
 *               first.
 *  - `unknown`  an unrecognised or composed reason. Treated conservatively.
 *
 * A reason alone never classifies durable state; the read adapter does.
 */
export type ReasonDisposition = "held" | "uncertain" | "negative" | "unknown";

interface ReasonRule {
  key: string;
  disposition: ReasonDisposition;
}

/** Exact codes win over every prefix below. */
const EXACT_REASONS: ReadonlyMap<string, ReasonRule> = new Map<string, ReasonRule>([
  // Held, configuration and identity. Nothing was dispatched.
  ["held", { key: "billingScreen.reason.held", disposition: "held" }],
  ["not_configured", { key: "billingScreen.reason.notConfigured", disposition: "held" }],
  ["plan_not_configured", { key: "billingScreen.reason.notConfigured", disposition: "held" }],
  ["seat_price_not_configured", { key: "billingScreen.reason.notConfigured", disposition: "held" }],
  ["account_unverified", { key: "billingScreen.reason.accountUnverified", disposition: "held" }],
  [
    "subscription_not_current",
    { key: "billingScreen.reason.subscriptionNotCurrent", disposition: "held" },
  ],
  ["schedule_conflict", { key: "billingScreen.reason.scheduleConflict", disposition: "held" }],
  [
    "cancellation_pending",
    { key: "billingScreen.reason.cancellationPending", disposition: "held" },
  ],
  ["mixed_change_held", { key: "billingScreen.reason.mixedChange", disposition: "held" }],
  ["no_customer", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["no_paid_subscription", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  [
    "subscription_mapping_uncertain",
    { key: "billingScreen.reason.unavailable", disposition: "held" },
  ],
  ["provider_read_failed", { key: "billingScreen.reason.unavailable", disposition: "held" }],

  // Market and currency.
  ["market_review_required", { key: "billingScreen.reason.marketReview", disposition: "held" }],
  ["billing_country_unknown", { key: "billingScreen.reason.billingCountry", disposition: "held" }],
  [
    "billing_country_uncertain",
    { key: "billingScreen.reason.billingCountry", disposition: "held" },
  ],
  [
    "currency_unsupported",
    { key: "billingScreen.reason.currencyUnsupported", disposition: "held" },
  ],
  ["currency_switch_held", { key: "billingScreen.reason.currencySwitch", disposition: "held" }],
  ["seat_market_unapproved", { key: "billingScreen.reason.seatMarket", disposition: "held" }],

  // Account capacity. Working capacity already counts pending invitations.
  ["capacity_unknown", { key: "billingScreen.reason.capacityUnknown", disposition: "held" }],
  [
    "capacity_conflict_working",
    { key: "billingScreen.reason.capacityWorking", disposition: "held" },
  ],
  ["capacity_conflict_viewer", { key: "billingScreen.reason.capacityViewer", disposition: "held" }],
  [
    "capacity_projects_unknown",
    { key: "billingScreen.reason.capacityProjectsUnknown", disposition: "held" },
  ],
  [
    "capacity_conflict_projects",
    { key: "billingScreen.reason.capacityProjects", disposition: "held" },
  ],

  // Quote and preview problems, all BEFORE a dispatch.
  ["request_invalid", { key: "billingScreen.reason.requestInvalid", disposition: "held" }],
  ["quote_unknown", { key: "billingScreen.reason.quoteInvalid", disposition: "held" }],
  ["quote_foreign", { key: "billingScreen.reason.quoteInvalid", disposition: "held" }],
  ["quote_tampered", { key: "billingScreen.reason.quoteInvalid", disposition: "held" }],
  ["quote_unreadable", { key: "billingScreen.reason.quoteInvalid", disposition: "held" }],
  [
    "quote_selection_changed",
    { key: "billingScreen.reason.quoteSelectionChanged", disposition: "held" },
  ],
  ["preview_unavailable", { key: "billingScreen.reason.previewUnavailable", disposition: "held" }],
  [
    "preview_recurring_unavailable",
    { key: "billingScreen.reason.previewUnavailable", disposition: "held" },
  ],

  // Recorded negative outcomes for THIS exact operation.
  ["quote_refused", { key: "billingScreen.reason.quoteRefused", disposition: "negative" }],
  ["operation_refused", { key: "billingScreen.reason.operationRefused", disposition: "negative" }],
  ["operation_failed", { key: "billingScreen.reason.operationFailed", disposition: "negative" }],
  ["operation_expired", { key: "billingScreen.reason.operationExpired", disposition: "negative" }],
  [
    "cancellation_preexisting",
    { key: "billingScreen.reason.cancellationPreexisting", disposition: "negative" },
  ],
  [
    "cancellation_absent",
    { key: "billingScreen.reason.cancellationAbsent", disposition: "negative" },
  ],
  [
    "cancellation_reversed",
    { key: "billingScreen.reason.cancellationReversed", disposition: "negative" },
  ],
  [
    "cancellation_recreated",
    { key: "billingScreen.reason.cancellationRecreated", disposition: "negative" },
  ],
  [
    "subscription_canceled_irreversible",
    { key: "billingScreen.reason.cancelIrreversible", disposition: "negative" },
  ],

  // Pending payment / application. Not a terminal decline.
  [
    "change_requires_payment",
    { key: "billingScreen.reason.paymentPending", disposition: "uncertain" },
  ],
  // The ONE exact known payment result. A generic `change_invoice_*` match is
  // not proof of a decline and must not borrow this copy.
  [
    "change_invoice_unpaid",
    { key: "billingScreen.reason.paymentDeclined", disposition: "uncertain" },
  ],
  [
    "invoice_read_failed",
    { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" },
  ],
  ["update_identity", { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" }],
  ["update_mode", { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" }],
  ["update_customer", { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" }],
  [
    "update_invoice_absent",
    { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" },
  ],

  // Outcome uncertain. Preserve the original operation and quote.
  [
    "quote_consumption_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "operation_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "operation_conflict",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "operation_unavailable",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  ["change_uncertain", { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" }],
  [
    "update_invoice_capture_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "change_settlement_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "reduction_capture_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "reduction_settlement_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "cancellation_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "cancellation_settlement_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "reversal_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  [
    "reversal_settlement_uncertain",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],

  // No verified success, exact identity retained.
  [
    "cancellation_not_applied",
    { key: "billingScreen.reason.notApplied", disposition: "uncertain" },
  ],
  ["reversal_not_applied", { key: "billingScreen.reason.notApplied", disposition: "uncertain" }],
  ["reversal_unavailable", { key: "billingScreen.reason.notApplied", disposition: "uncertain" }],

  // Inconsistent or unavailable binding/recovery evidence. Not a failure.
  ["operation_mismatch", { key: "billingScreen.reason.bindingHeld", disposition: "uncertain" }],
  [
    "operation_selection_unreadable",
    { key: "billingScreen.reason.bindingHeld", disposition: "uncertain" },
  ],
  [
    "operation_selection_unbound",
    { key: "billingScreen.reason.bindingHeld", disposition: "uncertain" },
  ],
  [
    "update_invoice_provenance_missing",
    { key: "billingScreen.reason.bindingHeld", disposition: "uncertain" },
  ],

  // Fenced / elapsed dispatch window. Non-terminal, no replacement.
  // A post-dispatch answer we could not read at all. Non-terminal, like every
  // other uncertainty: the operation keeps its identity and its binding.
  [
    "response_unreadable",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  // A readable answer whose VALUES contradict the request it claims to
  // answer. Also non-terminal: it establishes nothing either way.
  [
    "response_incoherent",
    { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" },
  ],
  // The read came back, but what it describes does not hang together well
  // enough to act on.
  ["evidence_incoherent", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["billing_state_unknown", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["billing_read_unreadable", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["operation_fenced", { key: "billingScreen.reason.operationFenced", disposition: "uncertain" }],
  [
    "update_ack_unrecoverable",
    { key: "billingScreen.reason.operationFenced", disposition: "uncertain" },
  ],
  [
    "schedule_adopt_unrecoverable",
    { key: "billingScreen.reason.operationFenced", disposition: "uncertain" },
  ],
  [
    "reduction_boundary_elapsed",
    { key: "billingScreen.reason.operationFenced", disposition: "uncertain" },
  ],
  [
    "reduction_schedule_identity",
    { key: "billingScreen.reason.scheduleHeld", disposition: "uncertain" },
  ],
]);

/** Prefix families, longest first. Only reached when no exact code matched. */
const PREFIX_REASONS: readonly [string, ReasonRule][] = [
  // The doubled prefix belongs to the validated helper readers; a line-proration
  // failure is an unreadable preview, never a zero amount due.
  [
    "preview_preview_line_proration_",
    { key: "billingScreen.reason.previewUnreadable", disposition: "held" },
  ],
  ["preview_preview_", { key: "billingScreen.reason.previewUnavailable", disposition: "held" }],
  ["preview_", { key: "billingScreen.reason.previewUnavailable", disposition: "held" }],
  ["capacity_", { key: "billingScreen.reason.capacityUnknown", disposition: "held" }],
  ["quote_", { key: "billingScreen.reason.quoteInvalid", disposition: "held" }],
  ["registry_", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["state_", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["terms_", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["price_", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  ["pending_update_", { key: "billingScreen.reason.unavailable", disposition: "held" }],
  // Pending application family.
  [
    "change_not_applied_",
    { key: "billingScreen.reason.changeNotApplied", disposition: "uncertain" },
  ],
  // Everything else about the update invoice may have happened AFTER dispatch.
  ["change_invoice_", { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" }],
  ["update_invoice_", { key: "billingScreen.reason.dispatchUncertain", disposition: "uncertain" }],
  ["reduction_payload_", { key: "billingScreen.reason.operationFenced", disposition: "uncertain" }],
  ["reduction_adoption_", { key: "billingScreen.reason.scheduleHeld", disposition: "uncertain" }],
  ["reduction_", { key: "billingScreen.reason.scheduleHeld", disposition: "uncertain" }],
  ["schedule_", { key: "billingScreen.reason.scheduleHeld", disposition: "uncertain" }],
  ["change_", { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" }],
  ["operation_", { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" }],
  ["cancellation_", { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" }],
  ["reversal_", { key: "billingScreen.reason.outcomeUncertain", disposition: "uncertain" }],
];

const UNKNOWN_REASON: ReasonRule = {
  key: "billingScreen.reason.unknown",
  disposition: "unknown",
};

/**
 * Resolve a caller reason to a FINITE localized key and a disposition.
 *
 * The suffix of a composed reason can contain a returned provider field name,
 * so it is never part of the answer. An unrecognised string stays conservative:
 * unavailable to the reader, non-terminal to the controller.
 */
export function resolveCommercialReason(reason: unknown): ReasonRule {
  if (typeof reason !== "string" || reason.trim() === "") return UNKNOWN_REASON;
  const code = reason.trim();
  const exact = EXACT_REASONS.get(code);
  if (exact) return exact;
  for (const [prefix, rule] of PREFIX_REASONS) if (code.startsWith(prefix)) return rule;
  return UNKNOWN_REASON;
}

export function commercialReasonKey(reason: unknown): string {
  return resolveCommercialReason(reason).key;
}

export function commercialReasonDisposition(reason: unknown): ReasonDisposition {
  return resolveCommercialReason(reason).disposition;
}

/* -------------------------------------------------------------------------- */
/* The controller                                                             */
/* -------------------------------------------------------------------------- */

export type CommercialIntentKind = "change" | "cancel" | "reverse";

/**
 * A durable intent. Its `operationId` is created ONCE, before the first
 * dispatch, and then survives every ambiguous answer, remount and reentry until
 * discovery says the slot is free.
 */
export interface CommercialIntent {
  kind: CommercialIntentKind;
  /**
   * This intent maps to an operation kind this screen can actually resume.
   *
   * A locally created intent always can — we only create the three we can
   * carry out. A DISCOVERED one may not: an operator-only `refund`, or a kind
   * this build does not recognise, is held and reported rather than quietly
   * replayed as a plan change.
   */
  recoverySupported: boolean;
  operationId: string;
  quoteId: string | null;
  cancelOperationId: string | null;
  terms: OperationTerms | null;
  /** A request has left the client and no definitive answer settled it. */
  dispatched: boolean;
  inFlight: boolean;
  /**
   * `settled`  the provider acknowledged this exact request, and the
   *            acknowledgement was coherent with what was asked. Access has
   *            NOT changed yet: the projection is still unverified.
   * `verified` a later authoritative read established the projection that
   *            acknowledgement implies. Only this ends the waiting state.
   */
  status: "ready" | "pending" | "uncertain" | "settled" | "refused" | "verified";
  /** The last caller reason, kept as a CODE; never rendered raw. */
  reason: string | null;
  /** Verified success payload, for honest display only. */
  applied: {
    state: "applied" | "awaiting_payment" | "scheduled" | "cancelled" | "reversed";
    effectiveAt: string | null;
    cancelAtPeriodEnd: boolean | null;
  } | null;
  /** Adopted from the read adapter rather than created here. */
  discovered: boolean;
  /**
   * The last successful discovery did not report this operation.
   *
   * That is NOT an outcome. An exact request whose answer was lost may still
   * be arriving, executing, or waiting to become durable, so the intent is
   * retained and every action stays held until exact evidence settles it.
   */
  discoveryMissing: boolean;
}

/**
 * Request tokens are owned by the CALLER and strictly increasing from 1. Zero
 * is the "no request is current" sentinel the reducer writes when an identity
 * change or an edited selection invalidates whatever is in flight, so a late
 * response can never match it.
 */
/**
 * How current the read evidence behind the displayed facts is.
 *
 *  - `none`   nothing verified yet.
 *  - `fresh`  the most recent read succeeded and nothing has invalidated it.
 *  - `stale`  a refresh is in flight, or the most recent read failed. The
 *             facts stay on screen and honestly labelled, but they are no
 *             longer AUTHORITY: a boolean read some time ago is not
 *             permission to charge somebody now.
 */
export type EvidenceFreshness = "none" | "fresh" | "stale";

export interface CommercialUiState {
  /** The user this state belongs to. A change clears everything. */
  identity: string | null;
  /**
   * The identity GENERATION. It increases on every sign-in change, so an
   * A → B → A sequence produces three distinct generations and a callback
   * captured during the first A can never be mistaken for the second.
   */
  epoch: number;
  summaryToken: number;
  summaryPhase: "idle" | "loading" | "ready" | "unavailable";
  evidence: EvidenceFreshness;
  /** The last VERIFIED summary, retained across a transient same-user failure. */
  summary: BillingSummary | null;
  /** The read failure, if the last read failed. Independent of `summary`. */
  summaryReason: string | null;
  selection: { planId: SellablePlanId; seatQuantity: number } | null;
  quoteToken: number;
  /** Exactly what the in-flight preview asked for, so the answer can be bound
   * to the question rather than merely parsed. */
  quoteRequest: QuoteRequestBinding | null;
  quotePhase: "idle" | "loading" | "ready" | "failed";
  quote: CommercialQuote | null;
  quoteReason: string | null;
  intent: CommercialIntent | null;
  dialog: CommercialIntentKind | null;
}

export const initialCommercialUiState: CommercialUiState = {
  identity: null,
  epoch: 0,
  summaryToken: 0,
  summaryPhase: "idle",
  evidence: "none",
  summary: null,
  summaryReason: null,
  selection: null,
  quoteToken: 0,
  quoteRequest: null,
  quotePhase: "idle",
  quote: null,
  quoteReason: null,
  intent: null,
  dialog: null,
};

/**
 * Every asynchronous completion carries the generation it STARTED in, and
 * every mutation completion also carries the exact operation it belongs to.
 * The reducer validates both before applying anything, so a late answer for
 * one account can neither settle another account's operation nor disturb its
 * in-flight read.
 *
 * The raw `response` values are deliberately `unknown`: validation happens in
 * one place, inside the reducer, where no caller can skip it.
 */
export type CommercialUiAction =
  /** The signed-in user changed (or first appeared). Clears verified data. */
  | { type: "identity"; userId: string | null; epoch: number }
  | { type: "summary/request"; epoch: number; token: number }
  | { type: "summary/resolved"; epoch: number; token: number; response: unknown }
  | { type: "selection/changed"; planId: SellablePlanId; seatQuantity: number }
  /** A billing-country edit or save: the unconfirmed preview no longer
   * applies, while verified money and any dispatched intent are untouched. */
  | { type: "preview/invalidated" }
  | { type: "quote/request"; epoch: number; token: number; request: QuoteRequestBinding }
  | { type: "quote/resolved"; epoch: number; token: number; response: unknown }
  | { type: "dialog/open"; kind: CommercialIntentKind }
  /** Close, Escape, Back and the overlay all land here. Never a mutation. */
  | { type: "dialog/close" }
  | {
      type: "intent/begin";
      epoch: number;
      kind: CommercialIntentKind;
      operationId: string;
      quoteId: string | null;
      cancelOperationId: string | null;
      terms: OperationTerms | null;
    }
  | { type: "intent/resume"; epoch: number; operationId: string }
  | { type: "intent/confirmed"; epoch: number; operationId: string; response: unknown }
  | { type: "intent/cancelled"; epoch: number; operationId: string; response: unknown }
  /** A transport rejection: no answer at all. The dispatch may still exist. */
  | { type: "intent/transportFailed"; epoch: number; operationId: string }
  /** Deliberately clearing a settled or discovery-cleared intent. */
  | { type: "intent/dismiss" };

function clearedQuote(state: CommercialUiState): CommercialUiState {
  return {
    ...state,
    quoteToken: 0,
    quoteRequest: null,
    quotePhase: "idle",
    quote: null,
    quoteReason: null,
  };
}

/** The completion belongs to this session AND to the operation it names. */
function ownsCompletion(
  state: CommercialUiState,
  action: { epoch: number; operationId: string },
): boolean {
  return (
    action.epoch === state.epoch &&
    state.intent !== null &&
    state.intent.operationId === action.operationId
  );
}

/**
 * Does this readable success actually answer the request it claims to?
 *
 * A well-formed response is not the same as a true one. A cancellation that
 * reports `cancelAtPeriodEnd:false`, a reversal that reports `true`, or a
 * change bound to 12345 EUR that comes back as 1 PLN are all parseable — and
 * all describe something other than what this operation asked for. Recording
 * any of them as a settlement would tell the customer their request succeeded
 * on the strength of a response about something else.
 *
 * A contradiction is therefore UNCERTAIN, under the original identity and
 * terms, to be settled by authoritative discovery.
 *
 * Is this intent done with — in the sense that it no longer holds the slot?
 *
 * `settled` is included because the provider acknowledged it; `verified`
 * because a read has since confirmed it; `refused` because it was explicitly
 * rejected. `pending` and `uncertain` are NOT: those still own the slot.
 */
function isFinishedIntent(intent: CommercialIntent): boolean {
  return intent.status === "settled" || intent.status === "refused" || intent.status === "verified";
}

/** Two server timestamps describing the same instant. */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

/**
 * Does the answer describe the SAME change, on the same timetable?
 *
 * The quote already said when its change takes effect, and the accepted
 * response contract keeps to it: an applied increase carries a null effective
 * date, and a scheduled reduction carries the quote's own date. So the
 * retained `effectiveAt` tells us which of the two this operation is, and an
 * answer that disagrees is describing a different change.
 *
 * Without this, a reduction bound to 28 November settled happily on a
 * response that said 31 December, and the customer was told their request had
 * succeeded on terms they never saw.
 */
function changeMatchesIntent(intent: CommercialIntent, applied: ConfirmedChange): boolean {
  const terms = intent.terms;
  // A change always carries the binding it was dispatched with. Without one
  // there is nothing to check the answer against, so it cannot be verified.
  if (!terms) return false;
  if (terms.currency !== null && terms.currency !== applied.currency) return false;
  if (terms.amountMinor !== null && terms.amountMinor !== applied.amountMinor) return false;
  if (terms.direction !== null && terms.direction !== applied.direction) return false;
  if (terms.effectiveAt === null) {
    // An IMMEDIATE intent. It may be applied now or waiting on payment, but
    // it does not acquire a future date and it does not become a schedule.
    if (applied.state === "scheduled") return false;
    return applied.effectiveAt === null;
  }
  // A DEFERRED intent takes effect on exactly the instant it was quoted for.
  if (applied.state !== "scheduled") return false;
  return sameInstant(applied.effectiveAt, terms.effectiveAt);
}

/** A cancellation must report the period-end cancellation it asked for; a
 * reversal must report that it is no longer cancelling. */
function cancellationMatchesIntent(
  intent: CommercialIntent,
  applied: ConfirmedCancellation,
): boolean {
  return applied.cancelAtPeriodEnd === (intent.kind === "cancel");
}

/**
 * The evidence EVERY acknowledged outcome below shares: a Stripe agreement
 * that is currently granting access, and whose period is readable.
 *
 * A terminal `status` beside paid `access`, or an unknown period, is an
 * internally contradictory read — and a contradiction cannot be proof of any
 * of these operations. This is deliberately the same bar for a change, a
 * cancellation and a reversal; the branch-specific plan, seats and
 * cancellation flag are checked ON TOP of it, not instead of it.
 *
 * "Known period" means the existing readable, non-null public `periodEnd`.
 * Nothing here compares it to a clock: no date, expiry or current-time
 * eligibility policy is introduced.
 */
function grantingProjection(summary: BillingSummary): boolean {
  return summary.access === "paid" && summary.status === "active" && summary.periodEnd !== null;
}

/**
 * Has a fresh authoritative read established the projection that this
 * acknowledged application implies?
 *
 * Only an operation we SETTLED can reach here — that is, one the provider
 * acknowledged for this exact id with a coherent answer. An `uncertain`
 * operation never qualifies, however well the current facts happen to line
 * up: a target coincidence is not an outcome for a request whose answer was
 * lost, and treating it as one would undo the retention this flow exists for.
 *
 * `awaiting_payment` and `scheduled` are acknowledgements that the change has
 * NOT applied yet, so they keep waiting too.
 */
function projectionVerifies(intent: CommercialIntent, summary: BillingSummary): boolean {
  if (intent.status !== "settled" || !intent.applied) return false;
  // The server must positively say nothing is open any more.
  if (summary.operationEvidence !== "none" || summary.operation !== null) return false;
  // Every outcome below is an outcome of a STRIPE agreement, and the adapter
  // only reports a Stripe projection for a resolved scope. A manual, Paddle
  // or unestablished provider — or a provider with no resolved mode —
  // asserting a matching Stripe seat count is internally contradictory, and
  // a contradiction cannot be proof of this operation.
  if (summary.provider !== "stripe" || summary.mode === null) return false;
  switch (intent.applied.state) {
    case "applied": {
      const terms = intent.terms;
      if (!terms || terms.planId === null || terms.seatQuantity === null) return false;
      // An applied change leaves a granting agreement on the new terms.
      return (
        grantingProjection(summary) &&
        summary.planId === terms.planId &&
        summary.purchasedSeats === terms.seatQuantity
      );
    }
    case "cancelled":
      // A period-end cancellation still GRANTS until the period it is ending
      // at. An agreement the read already calls `cancelled` has not ended at
      // a period end — it has ended — so it proves nothing about this
      // request, and neither does paid access with no period to end at.
      return grantingProjection(summary) && summary.cancelAtPeriodEnd === true;
    case "reversed":
      // A withdrawn cancellation leaves exactly the granting agreement that
      // was there before, no longer cancelling. A terminal status or an
      // unknown period contradicts that just as it does the other two.
      return grantingProjection(summary) && summary.cancelAtPeriodEnd === false;
    // A payment is still required, or the change starts on a later date.
    // Neither is applied, so neither can be verified yet.
    default:
      return false;
  }
}

/**
 * Reconcile local memory with what the READ ADAPTER discovered.
 *
 * A discovered operation is authoritative about what exists. Its ABSENCE is
 * not: an empty current open-operation list says nothing about an exact
 * request whose answer was lost, which may still be in flight at the provider
 * or not yet durable. So a dispatched intent is never dropped here — it is
 * marked `discoveryMissing` and held, and only an exact outcome (an explicit
 * refusal or a verified success for that operation) resolves it.
 */
function adoptDiscovered(
  state: CommercialUiState,
  summary: BillingSummary,
): CommercialIntent | null {
  const found = summary.operation;
  const local = state.intent;
  if (!found) {
    if (!local) return null;
    // The one case where waiting legitimately ends: this exact acknowledged
    // application is now backed by a fresh authoritative projection.
    if (projectionVerifies(local, summary))
      return { ...local, status: "verified", discoveryMissing: false, reason: null };
    // Otherwise: held, with the original identity and quote binding intact.
    return local.discoveryMissing ? local : { ...local, discoveryMissing: true };
  }
  // An unrecognised or operator-only kind is NOT a plan change. It is adopted
  // so it still holds the slot and is reported, but with no supported intent
  // to resume: `recoverySupported` is the flag every resume path consults.
  const mapped = recoverableIntentKind(found.kind);
  const kind: CommercialIntentKind = mapped ?? local?.kind ?? "change";
  const recoverySupported = mapped !== null;
  if (local && local.operationId === found.operationId) {
    return {
      ...local,
      kind,
      recoverySupported,
      quoteId: found.quoteId ?? local.quoteId,
      cancelOperationId: found.cancelOperationId ?? local.cancelOperationId,
      terms: found.terms ?? local.terms,
      dispatched: true,
      // A read must not clear a request that is still awaiting its answer.
      inFlight: local.inFlight,
      status:
        local.status === "settled" || local.status === "refused" || local.status === "verified"
          ? local.status
          : local.inFlight
            ? local.status
            : "uncertain",
      discovered: true,
      discoveryMissing: false,
    };
  }
  if (local && local.inFlight) {
    // Another operation is reported while ours is still awaiting an answer.
    // Keep ours; the next read settles which one survives.
    return { ...local, discoveryMissing: true };
  }
  return {
    kind,
    recoverySupported,
    operationId: found.operationId,
    quoteId: found.quoteId,
    cancelOperationId: found.cancelOperationId,
    terms: found.terms,
    dispatched: true,
    inFlight: false,
    status: "uncertain",
    reason: null,
    applied: null,
    discovered: true,
    discoveryMissing: false,
  };
}

export function commercialUiReducer(
  state: CommercialUiState,
  action: CommercialUiAction,
): CommercialUiState {
  switch (action.type) {
    case "identity": {
      if (state.identity === action.userId && state.epoch === action.epoch) return state;
      // A different user must never inherit the previous one's verified
      // summary, quote or operation, and the new generation discards every
      // response still in flight for the old one.
      return { ...initialCommercialUiState, identity: action.userId, epoch: action.epoch };
    }

    case "summary/request":
      if (action.epoch !== state.epoch) return state;
      return {
        ...state,
        summaryToken: action.token,
        // A refresh keeps the previously verified summary visible, but its
        // action authority is suspended until the read comes back.
        summaryPhase: state.summary ? "ready" : "loading",
        evidence: state.summary ? "stale" : "none",
      };

    case "summary/resolved": {
      // A response from an earlier request, or from an earlier generation, is
      // ignored: both the token and the generation must still be current.
      if (action.token !== state.summaryToken || action.epoch !== state.epoch) return state;
      const read = readSummaryResponse(action.response);
      if (read.kind !== "value") {
        return {
          ...state,
          summaryPhase: state.summary ? "ready" : "unavailable",
          evidence: state.summary ? "stale" : "none",
          summaryReason: read.kind === "refusal" ? read.reason : "billing_read_unreadable",
        };
      }
      return {
        ...state,
        summaryPhase: "ready",
        evidence: "fresh",
        summary: read.value,
        summaryReason: null,
        intent: adoptDiscovered(state, read.value),
      };
    }

    case "selection/changed": {
      const same =
        state.selection?.planId === action.planId &&
        state.selection?.seatQuantity === action.seatQuantity;
      if (same) return state;
      // Changing an UNCONFIRMED target invalidates only its preview. A
      // dispatched intent keeps its own original terms.
      return clearedQuote({
        ...state,
        selection: { planId: action.planId, seatQuantity: action.seatQuantity },
      });
    }

    case "preview/invalidated":
      // The billing country decides which catalogue a preview was priced
      // from, so editing or saving it retires an unconfirmed preview and its
      // pending generation. Verified current money and any dispatched
      // original intent are deliberately untouched.
      if (state.quotePhase === "idle" && state.quoteToken === 0 && state.quoteRequest === null)
        return state;
      return clearedQuote(state);

    case "quote/request":
      if (action.epoch !== state.epoch) return state;
      return {
        ...state,
        quoteToken: action.token,
        quoteRequest: action.request,
        quotePhase: "loading",
        quote: null,
        quoteReason: null,
      };

    case "quote/resolved": {
      if (action.token !== state.quoteToken || action.epoch !== state.epoch) return state;
      const read = readQuoteResponse(action.response, state.quoteRequest);
      if (read.kind !== "value")
        return {
          ...state,
          quotePhase: "failed",
          quote: null,
          quoteReason: read.kind === "refusal" ? read.reason : "quote_unreadable",
        };
      return { ...state, quotePhase: "ready", quote: read.value, quoteReason: null };
    }

    case "dialog/open":
      return { ...state, dialog: action.kind };

    case "dialog/close":
      // Closing is never a mutation and never discards a durable intent.
      return { ...state, dialog: null };

    case "intent/begin": {
      if (action.epoch !== state.epoch) return state;
      // A second begin while one is in flight, or while another operation is
      // unresolved, is refused: one slot, one identity.
      if (state.intent && !isFinishedIntent(state.intent)) return state;
      return {
        ...state,
        intent: {
          kind: action.kind,
          // Locally created intents are always one of the three this screen
          // carries out.
          recoverySupported: true,
          operationId: action.operationId,
          quoteId: action.quoteId,
          cancelOperationId: action.cancelOperationId,
          terms: action.terms,
          dispatched: true,
          inFlight: true,
          status: "pending",
          reason: null,
          applied: null,
          discovered: false,
          discoveryMissing: false,
        },
      };
    }

    case "intent/resume": {
      // An explicit recovery of the SAME operation. No new identity, no new
      // quote, and the original terms are untouched.
      if (!ownsCompletion(state, action)) return state;
      if (state.intent!.inFlight) return state;
      return { ...state, intent: { ...state.intent!, inFlight: true, status: "pending" } };
    }

    case "intent/confirmed": {
      if (!ownsCompletion(state, action)) return state;
      const intent = state.intent!;
      const read = readConfirmResponse(action.response);
      if (read.kind !== "value") {
        // An unreadable post-dispatch answer is UNCERTAIN, never a settled
        // success and never a terminal failure.
        const reason = read.kind === "refusal" ? read.reason : "response_unreadable";
        const disposition = commercialReasonDisposition(reason);
        return {
          ...state,
          intent: {
            ...intent,
            inFlight: false,
            // A dispatched operation is never downgraded to "ready": the only
            // negative that settles it is an exact-operation refusal, and even
            // that needs discovery before a new intent.
            status: disposition === "negative" ? "refused" : "uncertain",
            reason,
          },
        };
      }
      if (!changeMatchesIntent(intent, read.value))
        return {
          ...state,
          intent: {
            ...intent,
            inFlight: false,
            status: "uncertain",
            reason: "response_incoherent",
          },
        };
      return {
        ...state,
        intent: {
          ...intent,
          inFlight: false,
          status: "settled",
          reason: null,
          applied: {
            state: read.value.state,
            effectiveAt: read.value.effectiveAt,
            cancelAtPeriodEnd: null,
          },
        },
      };
    }

    case "intent/cancelled": {
      if (!ownsCompletion(state, action)) return state;
      const intent = state.intent!;
      const read = readCancelResponse(action.response);
      if (read.kind !== "value") {
        const reason = read.kind === "refusal" ? read.reason : "response_unreadable";
        const disposition = commercialReasonDisposition(reason);
        return {
          ...state,
          intent: {
            ...intent,
            inFlight: false,
            status: disposition === "negative" ? "refused" : "uncertain",
            reason,
          },
        };
      }
      if (!cancellationMatchesIntent(intent, read.value))
        return {
          ...state,
          intent: {
            ...intent,
            inFlight: false,
            status: "uncertain",
            reason: "response_incoherent",
          },
        };
      return {
        ...state,
        intent: {
          ...intent,
          inFlight: false,
          status: "settled",
          reason: null,
          applied: {
            state: intent.kind === "reverse" ? "reversed" : "cancelled",
            effectiveAt: read.value.effectiveAt,
            cancelAtPeriodEnd: read.value.cancelAtPeriodEnd,
          },
        },
      };
    }

    case "intent/transportFailed": {
      if (!ownsCompletion(state, action)) return state;
      // No answer at all. The request may exist at the provider, so the
      // identity is preserved and the state is uncertain, never failed.
      return { ...state, intent: { ...state.intent!, inFlight: false, status: "uncertain" } };
    }

    case "intent/dismiss": {
      if (!state.intent) return state;
      if (!isFinishedIntent(state.intent)) return state;
      return { ...state, intent: null, dialog: null };
    }

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Selectors — the same answers the panel and the tests use                   */
/* -------------------------------------------------------------------------- */

export function quoteExpired(quote: CommercialQuote | null, nowMs: number): boolean {
  if (!quote) return true;
  const expiry = Date.parse(quote.expiresAt);
  // An unreadable expiry is treated as expired: it cannot be proven valid.
  return !Number.isFinite(expiry) || expiry <= nowMs;
}

/** Does the ready quote still describe exactly what the form is asking for? */
export function quoteMatchesSelection(state: CommercialUiState): boolean {
  const { quote, selection } = state;
  if (!quote || !selection) return false;
  return quote.planId === selection.planId && quote.seatQuantity === selection.seatQuantity;
}

/**
 * THE gate every mutation and every provider route passes through.
 *
 * Displaying the last verified facts through a failed refresh is honest.
 * Continuing to act on them is not: the action booleans in a retained summary
 * were true when that read happened, and a read that has since failed or is
 * still in flight cannot renew them. A later successful read restores them;
 * a failed discovery never does.
 */
export function evidenceCurrent(state: CommercialUiState): boolean {
  return state.summary !== null && state.evidence === "fresh";
}

/** A NEW preview may be prepared. */
export function canPrepareQuote(state: CommercialUiState): boolean {
  if (!evidenceCurrent(state)) return false;
  if (!state.summary?.actions.prepareChange) return false;
  if (state.quotePhase === "loading") return false;
  if (state.intent) return false; // one durable slot; resume it instead
  return state.selection !== null;
}

/**
 * The FIRST confirmation of a change. Requires an unexpired quote that still
 * matches the selection, an available action and no existing operation.
 */
export function canConfirmQuote(state: CommercialUiState, nowMs: number): boolean {
  if (!evidenceCurrent(state)) return false;
  if (!state.summary?.actions.prepareChange) return false;
  if (state.intent) return false;
  if (state.quotePhase !== "ready") return false;
  if (!quoteMatchesSelection(state)) return false;
  // An amount the screen can only render as unknown may never be confirmed.
  if (!state.quote || !isSupportedCurrency(state.quote.currency)) return false;
  return !quoteExpired(state.quote, nowMs);
}

/** An explicit recovery of the EXISTING operation. Expiry does not apply: a
 * passed preview expiry is not permission to create a replacement. */
export function canResumeIntent(state: CommercialUiState): boolean {
  if (!evidenceCurrent(state)) return false;
  const intent = state.intent;
  if (!intent || intent.inFlight) return false;
  if (isFinishedIntent(intent)) return false;
  // Discovery that did not report this operation cannot authorise touching it.
  if (intent.discoveryMissing) return false;
  // An operation kind this screen cannot carry out is never resumable here,
  // whatever the server flag says.
  if (!intent.recoverySupported) return false;
  return state.summary?.actions.recoverOperation === true;
}

export function canStartCancellation(state: CommercialUiState): boolean {
  if (!evidenceCurrent(state)) return false;
  return !state.intent && state.summary?.actions.cancel === true;
}

export function canStartReversal(state: CommercialUiState): boolean {
  if (!evidenceCurrent(state)) return false;
  if (state.intent) return false;
  if (!state.summary?.actions.reverseCancellation) return false;
  // Only an EXACT eligible cancellation identity makes a reversal offerable.
  return isOpaqueId(state.summary.eligibleCancellationId);
}

/** The owner's manual beta/comped/reset. Same gate, same reasons. */
export function canUseManualOverride(state: CommercialUiState): boolean {
  if (!evidenceCurrent(state)) return false;
  return state.summary?.actions.manualOverride === true;
}

/**
 * Opening the legacy Paddle portal. Same gate again.
 *
 * Creating a portal session is a provider call, so it needs the same current
 * coherent evidence as any other action. A `paddlePortal` flag that was true
 * when a read succeeded says nothing after a refresh has failed or while one
 * is still in flight.
 */
export function canOpenPaddlePortal(state: CommercialUiState): boolean {
  if (!evidenceCurrent(state)) return false;
  return state.summary?.provider === "paddle" && state.summary.actions.paddlePortal === true;
}

/**
 * The live session generation, readable synchronously from any callback.
 *
 * Asynchronous billing work outlives the screen that started it. A plan
 * change dispatched for account A can answer after the user has switched to
 * account B, and `A → B → A` makes the user id itself useless as a guard. So
 * every generation gets a number: a callback captures one when it starts and
 * is obsolete the moment it no longer matches, even if the id came back.
 *
 * `stop()` is unmount. Nothing resumed after it is current again.
 */
export interface SessionGuard {
  /** Begin a new generation and return it. */
  next(): number;
  /** The generation currently in effect. */
  epoch(): number;
  /** Is this generation still the live one, on a mounted screen? */
  current(epoch: number): boolean;
  /** Unmount. Every generation becomes obsolete. */
  stop(): void;
}

export function createSessionGuard(): SessionGuard {
  let epoch = 0;
  let alive = true;
  return {
    next: () => (epoch += 1),
    epoch: () => epoch,
    current: (candidate) => alive && candidate === epoch,
    stop: () => {
      alive = false;
    },
  };
}

/**
 * Return focus to a remembered control, if it is still in the document.
 *
 * Closing a dialog with Escape should put the keyboard back where it was, not
 * on the body. The element is duck-typed rather than a `HTMLElement` so this
 * stays in the pure module and so the two cases that matter — the control was
 * removed while the dialog was open, or the session changed underneath it —
 * are directly testable. `false` means "nothing safe to focus": the caller
 * then leaves the library's own fallback alone instead of focusing something
 * stale.
 */
export function focusIfConnected(
  element: { isConnected?: boolean; focus?: () => void } | null | undefined,
): boolean {
  if (!element || element.isConnected !== true || typeof element.focus !== "function") return false;
  element.focus();
  return true;
}

/**
 * One dispatch at a time.
 *
 * A second call that arrives BEFORE the first awaited response resolves is
 * dropped and returns null, so a double click on a confirmation sends one
 * request rather than two. A disabled button is not a substitute: the state
 * that disables it is only applied on the next render.
 */
export function createSingleFlight(): <T>(task: () => Promise<T>) => Promise<T | null> {
  let busy = false;
  return async <T>(task: () => Promise<T>): Promise<T | null> => {
    if (busy) return null;
    busy = true;
    try {
      return await task();
    } finally {
      busy = false;
    }
  };
}

/**
 * Where "move me to Free" goes, for a VERIFIED provider.
 *
 * For Stripe this is a cancellation intent with its own explicit confirmation
 * and verified date — never the manual entitlement setter, which would write a
 * local grant that contradicts a live provider agreement. An unread,
 * unavailable or unestablished summary routes nowhere at all.
 */
export type FreeSelectionRoute =
  | "cancelIntent"
  | "paddlePortal"
  | "manualReset"
  /** The provider is known, but current evidence does not authorise acting. */
  | "held"
  | "unavailable";

export function routeFreeSelection(
  state: CommercialUiState,
  options: { isOwner: boolean },
): FreeSelectionRoute {
  const summary = state.summary;
  if (!summary) return "unavailable";
  // Facts stay on screen through a failed or pending refresh; permission does
  // not travel with them.
  if (!evidenceCurrent(state)) return "held";
  if (summary.provider === "stripe") return "cancelIntent";
  if (summary.actions.paddlePortal) return "paddlePortal";
  if (options.isOwner && canUseManualOverride(state)) return "manualReset";
  return "unavailable";
}

/** Where an explicit "end my subscription" control goes. `held` means the
 * provider is known but the server currently offers no cancellation action. */
export type CancellationRoute = "cancelIntent" | "paddlePortal" | "held" | "unavailable";

export function routeCancellation(state: CommercialUiState): CancellationRoute {
  const summary = state.summary;
  if (!summary) return "unavailable";
  if (!evidenceCurrent(state)) return "held";
  if (summary.provider === "stripe") return canStartCancellation(state) ? "cancelIntent" : "held";
  if (canOpenPaddlePortal(state)) return "paddlePortal";
  return "unavailable";
}

/**
 * Will an "end my subscription" control actually do something?
 *
 * The handlers already hold correctly, but a control that looks available and
 * then only produces a notice is its own small dishonesty — and it invites a
 * reader to believe the account is in a state it is not. These two predicates
 * exist so the VISIBLE disabled state is computed from the same routing the
 * handler will take, rather than from an unrelated local flag.
 */
export function cancellationAvailable(state: CommercialUiState): boolean {
  const route = routeCancellation(state);
  return route === "cancelIntent" || route === "paddlePortal";
}

/**
 * …and the same for the catalogue's Free choice.
 *
 * `routeFreeSelection` alone is not enough: it sends any fresh Stripe account
 * to the cancellation flow before `routeCancellation` decides whether a
 * cancellation is actually eligible, so a Stripe account with no cancel
 * action would still look actionable.
 */
export function freeSelectionAvailable(
  state: CommercialUiState,
  options: { isOwner: boolean },
): boolean {
  switch (routeFreeSelection(state, options)) {
    case "manualReset":
      return true;
    case "cancelIntent":
    case "paddlePortal":
      return cancellationAvailable(state);
    default:
      return false;
  }
}

/** The exact confirm payload, or null when confirming is not allowed. */
export function confirmChangeRequest(
  state: CommercialUiState,
  nowMs: number,
  newOperationId: string,
): {
  operationId: string;
  quoteId: string;
  planId: SellablePlanId;
  seatQuantity: number;
  amountMinor: number;
  currency: string;
} | null {
  const intent = state.intent;
  if (intent) {
    // A resumed operation replays its ORIGINAL binding, never a fresh quote.
    if (intent.kind !== "change" || !canResumeIntent(state)) return null;
    const terms = intent.terms;
    if (
      !isOpaqueId(intent.quoteId) ||
      !terms ||
      !terms.planId ||
      !isCount(terms.seatQuantity) ||
      !isCount(terms.amountMinor) ||
      !isSupportedCurrency(terms.currency)
    )
      return null;
    return {
      operationId: intent.operationId,
      quoteId: intent.quoteId,
      planId: terms.planId,
      seatQuantity: terms.seatQuantity,
      amountMinor: terms.amountMinor,
      currency: terms.currency,
    };
  }
  if (!canConfirmQuote(state, nowMs) || !state.quote) return null;
  if (!isOpaqueId(newOperationId)) return null;
  const quote = state.quote;
  return {
    operationId: newOperationId,
    quoteId: quote.quoteId,
    planId: quote.planId,
    seatQuantity: quote.seatQuantity,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
  };
}

/** The terms a confirmed change is bound to, for the durable intent record. */
export function termsFromQuote(quote: CommercialQuote): OperationTerms {
  return {
    planId: quote.planId,
    seatQuantity: quote.seatQuantity,
    amountMinor: quote.amountMinor,
    recurringEstimateMinor: quote.recurringEstimateMinor,
    currency: quote.currency,
    direction: quote.direction,
    effectiveAt: quote.effectiveAt,
    expiresAt: quote.expiresAt,
  };
}

/**
 * What the screen may claim about paid access right now.
 *
 * `pendingProjection` is the honest answer after any dispatch that has not
 * been re-verified: an HTTP 200, a success toast, a provider-applied status or
 * a portal return grants nothing until the authoritative summary says so.
 *
 * It is equally dishonest the other way round. Once a later authoritative read
 * HAS established the projection for an acknowledged application, continuing
 * to say "waiting for verification" misdescribes a finished change — and it
 * never stops, because nothing else would ever clear it. A `verified` intent
 * therefore shows the access the summary actually reports.
 */
export function accessClaim(
  state: CommercialUiState,
): "free" | "paid" | "unknown" | "pendingProjection" {
  const intent = state.intent;
  if (
    intent &&
    (intent.status === "settled" || intent.status === "pending" || intent.status === "uncertain")
  )
    return "pendingProjection";
  return state.summary?.access ?? "unknown";
}

/** Is this operation finished AND backed by a read that confirms it? */
export function intentVerified(state: CommercialUiState): boolean {
  return state.intent?.status === "verified";
}
