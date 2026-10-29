/**
 * The billing UI controller: the parts of the commercial flow where a bug is a
 * money bug rather than a layout bug.
 *
 * These tests drive the REAL reducer, the REAL wire readers and the REAL
 * selectors the route and the panel use. Nothing here re-implements a parallel
 * state machine, and nothing asserts on source text.
 *
 * Several cases below exist because an independent probe reproduced them
 * against the previous candidate: a late completion for one account settling
 * another's operation, an empty discovery discarding a dispatched intent, a
 * failed refresh still authorising a charge, a malformed success being
 * recorded as settled, and a foreign/unsupported/negative quote remaining
 * confirmable.
 */
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_CURRENCY_EXPONENT } from "./stripe-commercial";
import {
  UI_SUPPORTED_CURRENCY_EXPONENT,
  accessClaim,
  canConfirmQuote,
  canOpenPaddlePortal,
  canPrepareQuote,
  canResumeIntent,
  canStartCancellation,
  canStartReversal,
  canUseManualOverride,
  cancellationAvailable,
  commercialReasonDisposition,
  commercialReasonKey,
  commercialUiReducer,
  confirmChangeRequest,
  createSessionGuard,
  createSingleFlight,
  evidenceCurrent,
  freeSelectionAvailable,
  initialCommercialUiState,
  intentVerified,
  quoteExpired,
  quoteMatchesSelection,
  readCancelResponse,
  readConfirmResponse,
  readQuoteResponse,
  readSummaryResponse,
  recoverableIntentKind,
  routeCancellation,
  routeFreeSelection,
  termsFromQuote,
  type BillingSummary,
  type CommercialQuote,
  type CommercialUiAction,
  type CommercialUiState,
} from "./stripe-commercial-ui";
import { UI_CATALOGS } from "@/i18n/catalogs";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OP_A = "11111111-1111-4111-8111-111111111111";
const OP_B = "22222222-2222-4222-8222-222222222222";
const QUOTE_A = "33333333-3333-4333-8333-333333333333";
const QUOTE_B = "44444444-4444-4444-8444-444444444444";
const CANCEL_OP = "55555555-5555-4555-8555-555555555555";
const EXPIRES = "2026-10-29T12:00:00.000Z";
const NOW = Date.parse("2026-10-29T11:45:00.000Z");

/* -------------------------------------------------------------------------- */
/* Wire-shaped builders: these are RAW responses, not typed values            */
/* -------------------------------------------------------------------------- */

const summaryBody = (over: Record<string, unknown> = {}) => ({
  provider: "stripe",
  mode: "test",
  planId: "growth",
  access: "paid",
  status: "active",
  purchasedSeats: 0,
  periodEnd: "2026-11-27T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  currentAmountMinor: null,
  currentCurrency: null,
  currentAmountEvidence: "unknown",
  operation: null,
  operationEvidence: "none",
  eligibleCancellationId: null,
  actions: {
    paddlePortal: false,
    prepareChange: true,
    cancel: true,
    reverseCancellation: false,
    recoverOperation: false,
    manualOverride: false,
  },
  heldReason: null,
  ...over,
});
const summaryResponse = (over: Record<string, unknown> = {}) => ({
  ok: true,
  summary: summaryBody(over),
});

const quoteBody = (over: Record<string, unknown> = {}) => ({
  ok: true,
  quoteId: QUOTE_A,
  direction: "increase",
  amountMinor: 12_345,
  recurringEstimateMinor: 26_910,
  recurringEstimateIncludesAdjustments: true,
  recurringEstimateNote: "server note",
  currency: "eur",
  effectiveAt: null,
  immediate: true,
  expiresAt: EXPIRES,
  planId: "pro",
  seatQuantity: 2,
  workingSeatAllowance: 5,
  viewerSeatAllowance: 10,
  projectAllowance: 5,
  effectiveNote: "server note",
  ...over,
});

const confirmBody = (over: Record<string, unknown> = {}) => ({
  ok: true,
  state: "applied",
  direction: "increase",
  effectiveAt: null,
  currency: "eur",
  amountMinor: 12_345,
  note: "server note",
  ...over,
});
const cancelBody = (over: Record<string, unknown> = {}) => ({
  ok: true,
  cancelAtPeriodEnd: true,
  effectiveAt: "2026-11-27T00:00:00.000Z",
  note: "server note",
  ...over,
});

const PREPARE_REQUEST = { quoteId: QUOTE_A, planId: "pro" as const, seatQuantity: 2 };

const run = (actions: CommercialUiAction[], from = initialCommercialUiState): CommercialUiState =>
  actions.reduce(commercialUiReducer, from);

/** A signed-in caller (generation 1) with one verified summary. */
function verified(over: Record<string, unknown> = {}): CommercialUiState {
  return run([
    { type: "identity", userId: USER_A, epoch: 1 },
    { type: "summary/request", epoch: 1, token: 1 },
    { type: "summary/resolved", epoch: 1, token: 1, response: summaryResponse(over) },
  ]);
}

/** …and one prepared, bound, unexpired quote. */
function readyToConfirm(over: Record<string, unknown> = {}): CommercialUiState {
  return run(
    [
      { type: "selection/changed", planId: "pro", seatQuantity: 2 },
      { type: "quote/request", epoch: 1, token: 1, request: PREPARE_REQUEST },
      { type: "quote/resolved", epoch: 1, token: 1, response: quoteBody() },
    ],
    verified(over),
  );
}

/**
 * The reviewer's decisive C2 shape: Starter / 0 extra seats / 0 EUR charged
 * now, taking effect at the END of the paid period — a deferred reduction,
 * whose answer must arrive as `scheduled` on exactly that instant.
 */
const EFFECTIVE_AT = "2026-11-28T00:00:00.000Z";
const DEFERRED_REQUEST = { quoteId: QUOTE_A, planId: "starter" as const, seatQuantity: 0 };

function deferredReady(over: Record<string, unknown> = {}): CommercialUiState {
  return run(
    [
      { type: "selection/changed", planId: "starter", seatQuantity: 0 },
      { type: "quote/request", epoch: 1, token: 1, request: DEFERRED_REQUEST },
      {
        type: "quote/resolved",
        epoch: 1,
        token: 1,
        response: quoteBody({
          planId: "starter",
          seatQuantity: 0,
          direction: "decrease",
          amountMinor: 0,
          recurringEstimateMinor: 0,
          immediate: false,
          effectiveAt: EFFECTIVE_AT,
        }),
      },
    ],
    verified(over),
  );
}

const quoteOf = (state: CommercialUiState): CommercialQuote => {
  if (!state.quote) throw new Error("expected a prepared quote");
  return state.quote;
};

describe("the supported-currency contract is one contract", () => {
  it("pins the client-safe exponent map to the accepted server map", () => {
    expect({ ...UI_SUPPORTED_CURRENCY_EXPONENT }).toEqual({ ...SUPPORTED_CURRENCY_EXPONENT });
  });
});

describe("reason codes resolve to finite localized keys", () => {
  it("keeps the doubled-prefix proration failures unreadable, never a zero amount", () => {
    for (const code of [
      "preview_preview_line_proration_conflict",
      "preview_preview_line_proration_unreadable",
      "preview_preview_line_proration_unknown",
    ]) {
      expect(commercialReasonKey(code)).toBe("billingScreen.reason.previewUnreadable");
      expect(commercialReasonDisposition(code)).toBe("held");
    }
    for (const code of [
      "preview_preview_renewal_lines_present",
      "preview_unavailable",
      "preview_recurring_unavailable",
    ])
      expect(commercialReasonKey(code)).toBe("billingScreen.reason.previewUnavailable");
  });

  it("separates the one known payment result from the generic invoice family", () => {
    expect(commercialReasonKey("change_invoice_unpaid")).toBe(
      "billingScreen.reason.paymentDeclined",
    );
    for (const code of ["change_invoice_identity", "change_invoice_amount", "invoice_read_failed"])
      expect(commercialReasonKey(code)).toBe("billingScreen.reason.dispatchUncertain");
    expect(commercialReasonKey("change_requires_payment")).toBe(
      "billingScreen.reason.paymentPending",
    );
    expect(commercialReasonDisposition("change_requires_payment")).toBe("uncertain");
  });

  it("distinguishes an undispatched expiry from a post-dispatch fence", () => {
    expect(commercialReasonKey("operation_expired")).toBe("billingScreen.reason.operationExpired");
    expect(commercialReasonDisposition("operation_expired")).toBe("negative");
    expect(commercialReasonKey("operation_fenced")).toBe("billingScreen.reason.operationFenced");
    expect(commercialReasonDisposition("operation_fenced")).toBe("uncertain");
    expect(commercialReasonDisposition("quote_consumption_uncertain")).toBe("uncertain");
    expect(commercialReasonDisposition("operation_mismatch")).toBe("uncertain");
  });

  it("treats an unreadable post-dispatch answer as uncertain, not terminal", () => {
    expect(commercialReasonDisposition("response_unreadable")).toBe("uncertain");
    expect(commercialReasonKey("response_unreadable")).toBe(
      "billingScreen.reason.outcomeUncertain",
    );
  });

  it("holds a schedule failure without treating the suffix as permission", () => {
    for (const code of [
      "schedule_phase_default_tax_rates",
      "schedule_update_uncertain",
      "reduction_adoption_absent",
    ])
      expect(commercialReasonDisposition(code)).toBe("uncertain");
    expect(commercialReasonKey("schedule_conflict")).toBe("billingScreen.reason.scheduleConflict");
  });

  it("falls back conservatively for unknown, composed and empty reasons", () => {
    for (const code of ["", "   ", "something_new", undefined, null, 7, {}])
      expect(commercialReasonKey(code)).toBe("billingScreen.reason.unknown");
    expect(commercialReasonDisposition("something_new")).toBe("unknown");
    for (const code of [
      "provider_read_failed",
      "subscription_mapping_uncertain",
      "state_item_unknown_price",
      "registry_incomplete",
      "terms_unapproved",
      "price_read_failed",
      "pending_update_present",
      "no_customer",
      "no_paid_subscription",
      "plan_not_configured",
      "seat_price_not_configured",
    ])
      expect(commercialReasonKey(code)).not.toBe("billingScreen.reason.unknown");
  });

  it("never claims that nothing changed when the outcome is unknown", () => {
    // The unknown fallback is rendered AFTER a dispatch, where the operation
    // may well exist at the provider.
    for (const locale of ["en", "pl", "sv", "da"] as const) {
      const unknown = UI_CATALOGS[locale]["billingScreen.reason.unknown"];
      const unavailable = UI_CATALOGS[locale]["billingScreen.commercial.unavailable"];
      for (const claim of [
        "Nothing was changed",
        "Nic nie zostało zmienione",
        "Inget ändrades",
        "Intet blev ændret",
        "Nothing has been changed",
        "Nic nie zostało zmienione",
        "Inget har ändrats",
        "Intet er ændret",
      ]) {
        expect(unknown, `${locale} unknown`).not.toContain(claim);
        expect(unavailable, `${locale} unavailable`).not.toContain(claim);
      }
    }
  });

  it("only ever produces keys that exist in all four active catalogs", () => {
    const codes = [
      "held",
      "not_configured",
      "capacity_conflict_working",
      "market_review_required",
      "currency_switch_held",
      "seat_market_unapproved",
      "quote_refused",
      "quote_foreign",
      "quote_tampered",
      "operation_refused",
      "cancellation_recreated",
      "subscription_canceled_irreversible",
      "preview_preview_line_proration_unknown",
      "update_ack_unrecoverable",
      "reduction_boundary_elapsed",
      "response_unreadable",
      "billing_read_unreadable",
      "an_unknown_future_code_with_a_field_name",
    ];
    for (const locale of ["en", "pl", "sv", "da"] as const)
      for (const code of codes) {
        const key = commercialReasonKey(code);
        expect(UI_CATALOGS[locale][key], `${locale}:${key}`).toBeTypeOf("string");
        expect(UI_CATALOGS[locale][key]).not.toContain("field_name");
      }
  });
});

/* -------------------------------------------------------------------------- */
/* Strict wire readers                                                        */
/* -------------------------------------------------------------------------- */

describe("the summary reader never trusts a runtime payload", () => {
  it("reads a complete, well-formed answer", () => {
    const read = readSummaryResponse(summaryResponse());
    expect(read.kind).toBe("value");
    if (read.kind === "value") expect(read.value.planId).toBe("growth");
  });

  it("does not throw on null, a missing summary or a non-object", () => {
    for (const payload of [null, undefined, 7, "ok", [], { ok: true }, { ok: true, summary: 3 }])
      expect(readSummaryResponse(payload).kind, JSON.stringify(payload) ?? "undefined").toBe(
        "unreadable",
      );
  });

  it("refuses a truthy non-boolean ok and a falsy non-boolean ok", () => {
    expect(readSummaryResponse({ ok: "true", summary: summaryBody() }).kind).toBe("unreadable");
    expect(readSummaryResponse({ ok: 1, summary: summaryBody() }).kind).toBe("unreadable");
    expect(readSummaryResponse({ ok: 0, reason: "x" }).kind).toBe("unreadable");
    expect(readSummaryResponse({ ok: false, reason: "billing_read_failed" })).toEqual({
      kind: "refusal",
      reason: "billing_read_failed",
    });
  });

  it.each([
    ["an unknown plan the catalogue cannot index", { planId: "nonexistent-plan" }],
    ["an unknown provider", { provider: "trustme" }],
    ["an unknown access value", { access: "maybe" }],
    ["an unknown mode", { mode: "sandbox" }],
    ["an unreadable period end", { periodEnd: "not-a-date" }],
    ["a negative seat count", { purchasedSeats: -1 }],
    ["a non-boolean cancellation flag", { cancelAtPeriodEnd: "false" }],
    ["an unknown operation evidence", { operationEvidence: "maybe" }],
    ["a non-uuid eligible cancellation", { eligibleCancellationId: "fixture-cancel-operation" }],
    ["missing action booleans", { actions: { paddlePortal: true } }],
    ["a non-boolean action", { actions: { ...summaryBody().actions, cancel: "yes" } }],
    ["an amount with no currency", { currentAmountMinor: 14_900 }],
    ["a currency with no amount", { currentCurrency: "eur" }],
    ["an unsupported current currency", { currentAmountMinor: 100, currentCurrency: "jpy" }],
    [
      "money claimed with no evidence tag",
      { currentAmountMinor: 14_900, currentCurrency: "eur", currentAmountEvidence: "unknown" },
    ],
    ["a non-uuid operation id", { operation: { operationId: "op-1", kind: "x", state: "y" } }],
  ])("refuses %s", (_label, over) => {
    expect(readSummaryResponse(summaryResponse(over)).kind).toBe("unreadable");
  });

  it("accepts fixture-tagged money and a real zero seat count", () => {
    const read = readSummaryResponse(
      summaryResponse({
        currentAmountMinor: 14_900,
        currentCurrency: "eur",
        currentAmountEvidence: "fixture",
        purchasedSeats: 0,
      }),
    );
    expect(read.kind).toBe("value");
    if (read.kind === "value") {
      expect(read.value.currentAmountMinor).toBe(14_900);
      expect(read.value.purchasedSeats).toBe(0);
    }
  });

  it("holds recovery when the discovered ORIGINAL terms cannot be read", () => {
    const read = readSummaryResponse(
      summaryResponse({
        operationEvidence: "open",
        operation: {
          operationId: OP_A,
          kind: "plan_change",
          state: "awaiting_payment",
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: { planId: "pro", seatQuantity: 2, amountMinor: -1, currency: "eur" },
        },
        actions: { ...summaryBody().actions, recoverOperation: true },
      }),
    );
    expect(read.kind).toBe("value");
    if (read.kind !== "value") return;
    // The operation is still reported — it exists — but with no fabricated
    // terms, no recovery action and an explicitly unknown evidence state.
    expect(read.value.operation?.operationId).toBe(OP_A);
    expect(read.value.operation?.terms).toBeNull();
    expect(read.value.operationEvidence).toBe("unknown");
    expect(read.value.actions.recoverOperation).toBe(false);
  });
});

describe("the mutation readers never turn a malformed answer into a settlement", () => {
  it("reads a complete confirmation", () => {
    expect(readConfirmResponse(confirmBody())).toMatchObject({
      kind: "value",
      value: { state: "applied" },
    });
  });

  it.each([
    ["a bare ok", { ok: true }],
    ["an unknown state", confirmBody({ state: "probably_fine" })],
    ["a missing state", confirmBody({ state: undefined })],
    ["an unsupported currency", confirmBody({ currency: "jpy" })],
    ["a negative amount", confirmBody({ amountMinor: -1 })],
    ["an unreadable effective date", confirmBody({ effectiveAt: "soon" })],
    ["a truthy non-boolean ok", { ...confirmBody(), ok: "true" }],
  ])("treats %s as unreadable", (_label, payload) => {
    expect(readConfirmResponse(payload).kind).toBe("unreadable");
  });

  it("refuses a bare ok cancellation and reads a complete one", () => {
    expect(readCancelResponse({ ok: true }).kind).toBe("unreadable");
    expect(readCancelResponse(cancelBody({ cancelAtPeriodEnd: "yes" })).kind).toBe("unreadable");
    expect(readCancelResponse(cancelBody({ effectiveAt: "whenever" })).kind).toBe("unreadable");
    expect(readCancelResponse(cancelBody())).toMatchObject({
      kind: "value",
      value: { cancelAtPeriodEnd: true },
    });
    expect(readCancelResponse({ ok: false, reason: "cancellation_not_applied" })).toEqual({
      kind: "refusal",
      reason: "cancellation_not_applied",
    });
  });
});

describe("a quote answer is bound to the exact question", () => {
  it("accepts the answer to this request", () => {
    expect(readQuoteResponse(quoteBody(), PREPARE_REQUEST)).toMatchObject({
      kind: "value",
      value: { quoteId: QUOTE_A, amountMinor: 12_345 },
    });
  });

  it("refuses a different quote id than the one requested", () => {
    expect(readQuoteResponse(quoteBody({ quoteId: QUOTE_B }), PREPARE_REQUEST)).toEqual({
      kind: "refusal",
      reason: "quote_foreign",
    });
    // With no recorded request there is nothing to bind to.
    expect(readQuoteResponse(quoteBody(), null)).toEqual({
      kind: "refusal",
      reason: "quote_foreign",
    });
  });

  it("refuses terms that are not the ones asked for", () => {
    expect(readQuoteResponse(quoteBody({ planId: "agency" }), PREPARE_REQUEST)).toEqual({
      kind: "refusal",
      reason: "quote_tampered",
    });
    expect(readQuoteResponse(quoteBody({ seatQuantity: 9 }), PREPARE_REQUEST)).toEqual({
      kind: "refusal",
      reason: "quote_tampered",
    });
  });

  it.each([
    ["an unsupported currency", { currency: "jpy" }],
    ["an uppercase currency", { currency: "EUR" }],
    ["a negative amount", { amountMinor: -1 }],
    ["an unsafe amount", { amountMinor: Number.MAX_SAFE_INTEGER + 2 }],
    ["a negative allowance", { projectAllowance: -1 }],
    ["an unreadable expiry", { expiresAt: "not-a-date" }],
    ["a missing expiry", { expiresAt: undefined }],
    ["an unreadable effective date", { effectiveAt: "not-a-date" }],
    ["a deferred change with no effective date", { immediate: false, effectiveAt: null }],
    ["a non-uuid quote id", { quoteId: "quote-1" }],
    ["a free plan", { planId: "freePreview" }],
    ["a fractional seat count", { seatQuantity: 1.5 }],
  ])("treats %s as unreadable", (_label, over) => {
    expect(readQuoteResponse(quoteBody(over), PREPARE_REQUEST).kind).toBe("unreadable");
  });

  it("passes a genuine refusal through unchanged", () => {
    expect(
      readQuoteResponse({ ok: false, reason: "capacity_conflict_working" }, PREPARE_REQUEST),
    ).toEqual({ kind: "refusal", reason: "capacity_conflict_working" });
  });

  it("never leaves an unconfirmable offer confirmable", () => {
    // The exact cases an independent probe confirmed on the previous
    // candidate: a foreign id, jpy, a negative amount, a bad effective date.
    for (const over of [
      { quoteId: QUOTE_B },
      { currency: "jpy" },
      { amountMinor: -1 },
      { immediate: false, effectiveAt: "not-a-date" },
    ]) {
      const state = run(
        [
          { type: "selection/changed", planId: "pro", seatQuantity: 2 },
          { type: "quote/request", epoch: 1, token: 1, request: PREPARE_REQUEST },
          { type: "quote/resolved", epoch: 1, token: 1, response: quoteBody(over) },
        ],
        verified(),
      );
      expect(state.quotePhase, JSON.stringify(over)).toBe("failed");
      expect(state.quote).toBeNull();
      expect(canConfirmQuote(state, NOW)).toBe(false);
      expect(confirmChangeRequest(state, NOW, OP_A)).toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Identity generations and late completions                                  */
/* -------------------------------------------------------------------------- */

describe("the session guard", () => {
  it("gives A → B → A three distinct generations", () => {
    const guard = createSessionGuard();
    const first = guard.next();
    expect(guard.current(first)).toBe(true);
    const second = guard.next();
    expect(guard.current(first)).toBe(false);
    const third = guard.next();
    expect(guard.current(second)).toBe(false);
    expect(guard.current(third)).toBe(true);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("makes every generation obsolete after unmount", () => {
    const guard = createSessionGuard();
    const epoch = guard.next();
    guard.stop();
    expect(guard.current(epoch)).toBe(false);
    expect(guard.current(guard.epoch())).toBe(false);
  });
});

describe("a late completion belongs to exactly one operation and one session", () => {
  /** A's change is dispatched, then B signs in and has a pending cancellation. */
  function switchedToB(): CommercialUiState {
    const aDispatched = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(readyToConfirm())),
        },
      ],
      readyToConfirm(),
    );
    return run(
      [
        { type: "identity", userId: USER_B, epoch: 2 },
        { type: "summary/request", epoch: 2, token: 2 },
        {
          type: "summary/resolved",
          epoch: 2,
          token: 2,
          response: summaryResponse({
            operationEvidence: "open",
            operation: {
              operationId: OP_B,
              kind: "cancel",
              state: "dispatching",
              quoteId: null,
              cancelOperationId: null,
              terms: null,
            },
            actions: { ...summaryBody().actions, recoverOperation: true, cancel: false },
          }),
        },
      ],
      aDispatched,
    );
  }

  it("does not let A's successful change settle B's cancellation", () => {
    const b = switchedToB();
    expect(b.intent).toMatchObject({ operationId: OP_B, kind: "cancel", status: "uncertain" });
    const late = commercialUiReducer(b, {
      type: "intent/confirmed",
      epoch: 1, // A's generation
      operationId: OP_A,
      response: confirmBody(),
    });
    expect(late).toBe(b);
    expect(late.intent).toMatchObject({ operationId: OP_B, status: "uncertain" });
    expect(late.intent?.applied).toBeNull();
  });

  it("does not let a same-session answer settle a different operation", () => {
    const b = switchedToB();
    const wrongOperation = commercialUiReducer(b, {
      type: "intent/confirmed",
      epoch: 2,
      operationId: OP_A, // not B's operation
      response: confirmBody(),
    });
    expect(wrongOperation).toBe(b);
    const ownOperation = commercialUiReducer(b, {
      type: "intent/cancelled",
      epoch: 2,
      operationId: OP_B,
      response: cancelBody(),
    });
    expect(ownOperation.intent?.status).toBe("settled");
  });

  it("does not let A's transport failure or resume touch B", () => {
    const b = switchedToB();
    expect(
      commercialUiReducer(b, { type: "intent/transportFailed", epoch: 1, operationId: OP_A }),
    ).toBe(b);
    expect(commercialUiReducer(b, { type: "intent/resume", epoch: 1, operationId: OP_A })).toBe(b);
  });

  it("does not let A's follow-up read start or land in B's session", () => {
    const b = switchedToB();
    // A's callback tries to begin a refresh with its own generation.
    const attempted = commercialUiReducer(b, { type: "summary/request", epoch: 1, token: 3 });
    expect(attempted).toBe(b);
    expect(attempted.summaryToken).toBe(2);
    // And its response cannot land either.
    const landed = commercialUiReducer(b, {
      type: "summary/resolved",
      epoch: 1,
      token: 2,
      response: summaryResponse({ planId: "agency" }),
    });
    expect(landed).toBe(b);
    expect(b.summary?.planId).toBe("growth");
  });

  it("treats a returning user as a NEW generation, not the original one", () => {
    const backToA = run([{ type: "identity", userId: USER_A, epoch: 3 }], switchedToB());
    expect(backToA.summary).toBeNull();
    expect(backToA.intent).toBeNull();
    // The first A session's answer is still obsolete.
    expect(
      commercialUiReducer(backToA, {
        type: "summary/resolved",
        epoch: 1,
        token: 1,
        response: summaryResponse(),
      }),
    ).toBe(backToA);
  });

  it("ignores an older request from the SAME session", () => {
    const base = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        { type: "summary/request", epoch: 1, token: 3 },
      ],
      verified(),
    );
    const stale = commercialUiReducer(base, {
      type: "summary/resolved",
      epoch: 1,
      token: 2,
      response: summaryResponse({ planId: "agency" }),
    });
    expect(stale.summary?.planId).toBe("growth");
    const current = commercialUiReducer(base, {
      type: "summary/resolved",
      epoch: 1,
      token: 3,
      response: summaryResponse({ planId: "pro" }),
    });
    expect(current.summary?.planId).toBe("pro");
  });
});

/* -------------------------------------------------------------------------- */
/* Evidence freshness and action authority                                    */
/* -------------------------------------------------------------------------- */

describe("a failed or pending refresh keeps the facts and withdraws permission", () => {
  const failedRefresh = (from: CommercialUiState) =>
    run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: { ok: false, reason: "billing_read_unavailable" },
        },
      ],
      from,
    );

  it("still shows the last verified facts", () => {
    const state = failedRefresh(readyToConfirm());
    expect(state.summary?.planId).toBe("growth");
    expect(state.summaryPhase).toBe("ready");
    expect(state.summaryReason).toBe("billing_read_unavailable");
  });

  it("withdraws every action, including a direct confirm payload", () => {
    const state = failedRefresh(readyToConfirm());
    expect(evidenceCurrent(state)).toBe(false);
    expect(canPrepareQuote(state)).toBe(false);
    expect(canConfirmQuote(state, NOW)).toBe(false);
    expect(canStartCancellation(state)).toBe(false);
    expect(canResumeIntent(state)).toBe(false);
    expect(confirmChangeRequest(state, NOW, OP_A)).toBeNull();
    expect(routeCancellation(state)).toBe("held");
  });

  it("withdraws the owner's manual override and its Free route", () => {
    const manual = verified({
      provider: "manual",
      mode: null,
      status: "manualBeta",
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        manualOverride: true,
      },
    });
    expect(canUseManualOverride(manual)).toBe(true);
    expect(routeFreeSelection(manual, { isOwner: true })).toBe("manualReset");
    const stale = failedRefresh(manual);
    expect(canUseManualOverride(stale)).toBe(false);
    expect(routeFreeSelection(stale, { isOwner: true })).toBe("held");
  });

  it("withdraws permission while a refresh is merely in flight", () => {
    const refreshing = run([{ type: "summary/request", epoch: 1, token: 2 }], readyToConfirm());
    expect(refreshing.summary).not.toBeNull();
    expect(evidenceCurrent(refreshing)).toBe(false);
    expect(canConfirmQuote(refreshing, NOW)).toBe(false);
  });

  it("restores the right actions on the next SUCCESSFUL read", () => {
    const recovered = run(
      [
        { type: "summary/request", epoch: 1, token: 3 },
        { type: "summary/resolved", epoch: 1, token: 3, response: summaryResponse() },
      ],
      failedRefresh(readyToConfirm()),
    );
    expect(evidenceCurrent(recovered)).toBe(true);
    expect(canConfirmQuote(recovered, NOW)).toBe(true);
    expect(canStartCancellation(recovered)).toBe(true);
  });

  it("does not restore anything from a failed discovery", () => {
    const stillFailing = failedRefresh(failedRefresh(readyToConfirm()));
    expect(evidenceCurrent(stillFailing)).toBe(false);
    expect(canStartCancellation(stillFailing)).toBe(false);
  });

  it("reports unavailable rather than Free when there was never a verified read", () => {
    const failed = run([
      { type: "identity", userId: USER_A, epoch: 1 },
      { type: "summary/request", epoch: 1, token: 1 },
      {
        type: "summary/resolved",
        epoch: 1,
        token: 1,
        response: { ok: false, reason: "billing_read_unavailable" },
      },
    ]);
    expect(failed.summary).toBeNull();
    expect(failed.summaryPhase).toBe("unavailable");
    expect(accessClaim(failed)).toBe("unknown");
    expect(routeFreeSelection(failed, { isOwner: true })).toBe("unavailable");
  });
});

/* -------------------------------------------------------------------------- */
/* The catalogue form and the confirmed subscription                          */
/* -------------------------------------------------------------------------- */

describe("the catalogue form never edits the confirmed subscription", () => {
  const confirmedMoney = {
    currentAmountMinor: 14_900,
    currentCurrency: "eur",
    currentAmountEvidence: "fixture",
  };

  it("keeps a confirmed EUR 149 current while the target selection changes", () => {
    const state = run(
      [
        { type: "selection/changed", planId: "pro", seatQuantity: 3 },
        { type: "selection/changed", planId: "agency", seatQuantity: 0 },
      ],
      verified(confirmedMoney),
    );
    expect(state.summary?.currentAmountMinor).toBe(14_900);
    expect(state.summary?.currentCurrency).toBe("eur");
    expect(state.summary?.planId).toBe("growth");
    expect(state.selection).toEqual({ planId: "agency", seatQuantity: 0 });
  });

  it("keeps it across a billing-country edit and save, which only retire the preview", () => {
    const prepared = readyToConfirm(confirmedMoney);
    expect(canConfirmQuote(prepared, NOW)).toBe(true);
    // The country Select and the Save button both dispatch this.
    const edited = commercialUiReducer(prepared, { type: "preview/invalidated" });
    expect(edited.summary?.currentAmountMinor).toBe(14_900);
    expect(edited.summary?.currentCurrency).toBe("eur");
    expect(edited.quote).toBeNull();
    expect(edited.quotePhase).toBe("idle");
    expect(canConfirmQuote(edited, NOW)).toBe(false);
    expect(confirmChangeRequest(edited, NOW, OP_A)).toBeNull();
    // Saving again changes nothing further.
    expect(commercialUiReducer(edited, { type: "preview/invalidated" })).toBe(edited);
  });

  it("drops a preview that lands AFTER the country changed", () => {
    const inFlight = run(
      [
        { type: "selection/changed", planId: "pro", seatQuantity: 2 },
        { type: "quote/request", epoch: 1, token: 1, request: PREPARE_REQUEST },
        { type: "preview/invalidated" },
      ],
      verified(confirmedMoney),
    );
    const late = commercialUiReducer(inFlight, {
      type: "quote/resolved",
      epoch: 1,
      token: 1,
      response: quoteBody(),
    });
    expect(late.quote).toBeNull();
    expect(canConfirmQuote(late, NOW)).toBe(false);
  });

  it("leaves a DISPATCHED intent and its original terms alone", () => {
    const dispatched = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(readyToConfirm())),
        },
        { type: "preview/invalidated" },
      ],
      readyToConfirm(confirmedMoney),
    );
    expect(dispatched.intent).toMatchObject({ operationId: OP_A, quoteId: QUOTE_A });
    expect(dispatched.intent?.terms?.amountMinor).toBe(12_345);
  });

  it("invalidates only the unconfirmed preview when the selection changes", () => {
    const changed = commercialUiReducer(readyToConfirm(), {
      type: "selection/changed",
      planId: "agency",
      seatQuantity: 2,
    });
    expect(changed.quote).toBeNull();
    expect(changed.summary?.planId).toBe("growth");
    expect(canConfirmQuote(changed, NOW)).toBe(false);
    const late = commercialUiReducer(changed, {
      type: "quote/resolved",
      epoch: 1,
      token: 1,
      response: quoteBody(),
    });
    expect(late.quote).toBeNull();
  });
});

describe("a quote is confirmable only while it is exactly what was shown", () => {
  it("accepts a fresh matching quote, including a real zero amount", () => {
    expect(canConfirmQuote(readyToConfirm(), NOW)).toBe(true);
    const zero = run(
      [
        { type: "quote/request", epoch: 1, token: 2, request: PREPARE_REQUEST },
        {
          type: "quote/resolved",
          epoch: 1,
          token: 2,
          response: quoteBody({
            amountMinor: 0,
            direction: "decrease",
            immediate: false,
            effectiveAt: "2026-11-27T00:00:00.000Z",
          }),
        },
      ],
      readyToConfirm(),
    );
    expect(zero.quote?.amountMinor).toBe(0);
    expect(canConfirmQuote(zero, NOW)).toBe(true);
    expect(confirmChangeRequest(zero, NOW, OP_A)?.amountMinor).toBe(0);
  });

  it("refuses an expired, unreadable-expiry, mismatched or unavailable quote", () => {
    const fresh = readyToConfirm();
    expect(canConfirmQuote(fresh, Date.parse(EXPIRES))).toBe(false);
    expect(canConfirmQuote(fresh, Date.parse(EXPIRES) + 1)).toBe(false);
    expect(quoteExpired({ ...quoteOf(fresh), expiresAt: "not-a-date" }, NOW)).toBe(true);
    expect(quoteExpired(null, NOW)).toBe(true);

    const selectionMoved = commercialUiReducer(fresh, {
      type: "selection/changed",
      planId: "agency",
      seatQuantity: 2,
    });
    expect(quoteMatchesSelection(selectionMoved)).toBe(false);
    expect(canConfirmQuote(selectionMoved, NOW)).toBe(false);

    const held = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({
            heldReason: "held",
            actions: { ...summaryBody().actions, prepareChange: false, cancel: false },
          }),
        },
      ],
      fresh,
    );
    expect(canConfirmQuote(held, NOW)).toBe(false);
    expect(canPrepareQuote(held)).toBe(false);
    expect(confirmChangeRequest(held, NOW, OP_A)).toBeNull();
  });

  it("refuses a confirm payload built with a non-uuid operation id", () => {
    expect(confirmChangeRequest(readyToConfirm(), NOW, "operation-1")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* One operation identity                                                     */
/* -------------------------------------------------------------------------- */

describe("one operation identity, kept across every uncertain answer", () => {
  const dispatchChange = (from = readyToConfirm()) =>
    commercialUiReducer(from, {
      type: "intent/begin",
      epoch: 1,
      kind: "change",
      operationId: OP_A,
      quoteId: QUOTE_A,
      cancelOperationId: null,
      terms: termsFromQuote(quoteOf(from)),
    });

  it("creates exactly one operation and refuses a second begin", () => {
    const first = dispatchChange();
    expect(first.intent?.operationId).toBe(OP_A);
    expect(first.intent?.inFlight).toBe(true);
    const second = commercialUiReducer(first, {
      type: "intent/begin",
      epoch: 1,
      kind: "change",
      operationId: OP_B,
      quoteId: QUOTE_A,
      cancelOperationId: null,
      terms: null,
    });
    expect(second.intent?.operationId).toBe(OP_A);
    expect(canPrepareQuote(second)).toBe(false);
    expect(canStartCancellation(second)).toBe(false);
    expect(canStartReversal(second)).toBe(false);
  });

  it("sends one request when a deferred confirmation is clicked twice", async () => {
    const singleFlight = createSingleFlight();
    const send = vi.fn();
    let release: (() => void) | null = null;
    const deferred = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = async () => {
      send();
      await deferred;
    };
    const first = singleFlight(task);
    const second = singleFlight(task);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await second).toBeNull();
    release!();
    await first;
    // Only after the first answer may another dispatch begin.
    await singleFlight(async () => send());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps the identity after a timeout and replays the ORIGINAL binding", () => {
    const dispatched = commercialUiReducer(dispatchChange(), {
      type: "intent/transportFailed",
      epoch: 1,
      operationId: OP_A,
    });
    expect(dispatched.intent).toMatchObject({
      operationId: OP_A,
      status: "uncertain",
      inFlight: false,
      dispatched: true,
    });
    expect(canResumeIntent(dispatched)).toBe(false);
    const recoverable = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({
            operationEvidence: "open",
            operation: {
              operationId: OP_A,
              kind: "plan_change",
              state: "awaiting_payment",
              quoteId: QUOTE_A,
              cancelOperationId: null,
              terms: termsFromQuote(quoteOf(readyToConfirm())),
            },
            actions: { ...summaryBody().actions, recoverOperation: true },
          }),
        },
      ],
      dispatched,
    );
    expect(canResumeIntent(recoverable)).toBe(true);
    // Long after the preview's own expiry: expiry never authorises a new one.
    const replay = confirmChangeRequest(recoverable, Date.parse(EXPIRES) + 86_400_000, OP_B);
    expect(replay).toEqual({
      operationId: OP_A,
      quoteId: QUOTE_A,
      planId: "pro",
      seatQuantity: 2,
      amountMinor: 12_345,
      currency: "eur",
    });
  });

  it("KEEPS a dispatched intent when discovery simply reports nothing", () => {
    // An empty open-operation list is not an outcome for a request whose
    // answer was lost: it may still be arriving or not yet durable.
    const dispatched = commercialUiReducer(dispatchChange(), {
      type: "intent/transportFailed",
      epoch: 1,
      operationId: OP_A,
    });
    const afterEmptyDiscovery = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({ operationEvidence: "none" }),
        },
      ],
      dispatched,
    );
    expect(afterEmptyDiscovery.intent).toMatchObject({
      operationId: OP_A,
      quoteId: QUOTE_A,
      status: "uncertain",
      discoveryMissing: true,
    });
    // And no replacement operation can be built against the same quote.
    expect(confirmChangeRequest(afterEmptyDiscovery, NOW, OP_B)).toBeNull();
    expect(canPrepareQuote(afterEmptyDiscovery)).toBe(false);
    expect(canStartCancellation(afterEmptyDiscovery)).toBe(false);
    expect(canResumeIntent(afterEmptyDiscovery)).toBe(false);
  });

  it("holds an unresolved intent when discovery is ambiguous or unknown", () => {
    const dispatched = commercialUiReducer(dispatchChange(), {
      type: "intent/transportFailed",
      epoch: 1,
      operationId: OP_A,
    });
    for (const evidence of ["ambiguous", "unknown"] as const) {
      const after = run(
        [
          { type: "summary/request", epoch: 1, token: 3 },
          {
            type: "summary/resolved",
            epoch: 1,
            token: 3,
            response: summaryResponse({ operationEvidence: evidence }),
          },
        ],
        dispatched,
      );
      expect(after.intent?.operationId, evidence).toBe(OP_A);
      expect(canPrepareQuote(after), evidence).toBe(false);
    }
  });

  it("adopts a durable operation discovered after a remount, without creating one", () => {
    const reentry = run([
      { type: "identity", userId: USER_A, epoch: 1 },
      { type: "summary/request", epoch: 1, token: 1 },
      {
        type: "summary/resolved",
        epoch: 1,
        token: 1,
        response: summaryResponse({
          operationEvidence: "open",
          operation: {
            operationId: OP_A,
            kind: "cancel",
            state: "dispatching",
            quoteId: null,
            cancelOperationId: null,
            terms: null,
          },
          actions: { ...summaryBody().actions, recoverOperation: true, cancel: false },
        }),
      },
    ]);
    expect(reentry.intent).toMatchObject({
      operationId: OP_A,
      kind: "cancel",
      discovered: true,
      status: "uncertain",
      discoveryMissing: false,
    });
    expect(canStartCancellation(reentry)).toBe(false);
    expect(canResumeIntent(reentry)).toBe(true);
  });

  it("settles only on a definite negative, and never on a close or a dialog", () => {
    const dispatched = dispatchChange();
    const uncertain = commercialUiReducer(dispatched, {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: { ok: false, reason: "quote_consumption_uncertain" },
    });
    expect(uncertain.intent).toMatchObject({ status: "uncertain", operationId: OP_A });
    expect(commercialUiReducer(uncertain, { type: "intent/dismiss" }).intent).not.toBeNull();

    const refused = commercialUiReducer(dispatched, {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: { ok: false, reason: "operation_refused" },
    });
    expect(refused.intent?.status).toBe("refused");
    expect(commercialUiReducer(refused, { type: "intent/dismiss" }).intent).toBeNull();

    const closed = commercialUiReducer(uncertain, { type: "dialog/close" });
    expect(closed.dialog).toBeNull();
    expect(closed.intent?.operationId).toBe(OP_A);
  });

  it("keeps a malformed success UNCERTAIN instead of recording a settlement", () => {
    for (const payload of [{ ok: true }, confirmBody({ state: "probably_fine" })]) {
      const after = commercialUiReducer(dispatchChange(), {
        type: "intent/confirmed",
        epoch: 1,
        operationId: OP_A,
        response: payload,
      });
      expect(after.intent, JSON.stringify(payload)).toMatchObject({
        operationId: OP_A,
        status: "uncertain",
        reason: "response_unreadable",
      });
      expect(after.intent?.applied).toBeNull();
    }
  });

  it("never claims paid access from a dispatch, only from a verified read", () => {
    const applied = commercialUiReducer(dispatchChange(), {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: confirmBody(),
    });
    expect(applied.intent?.status).toBe("settled");
    expect(accessClaim(applied)).toBe("pendingProjection");
    expect(applied.summary?.planId).toBe("growth");
    for (const state of ["awaiting_payment", "scheduled"] as const) {
      const pending = commercialUiReducer(dispatchChange(), {
        type: "intent/confirmed",
        epoch: 1,
        operationId: OP_A,
        response: confirmBody({ state }),
      });
      expect(accessClaim(pending)).toBe("pendingProjection");
    }
  });
});

describe("cancellation and reversal", () => {
  it("offers a reversal only with the exact eligible cancellation identity", () => {
    const withoutId = verified({
      actions: { ...summaryBody().actions, reverseCancellation: true },
      eligibleCancellationId: null,
    });
    expect(canStartReversal(withoutId)).toBe(false);
    const eligible = verified({
      actions: { ...summaryBody().actions, reverseCancellation: true },
      eligibleCancellationId: CANCEL_OP,
    });
    expect(canStartReversal(eligible)).toBe(true);
  });

  it("records a confirmed cancellation without manufacturing a plan change", () => {
    const cancelled = run(
      [
        { type: "dialog/open", kind: "cancel" },
        {
          type: "intent/begin",
          epoch: 1,
          kind: "cancel",
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: null,
          terms: null,
        },
        { type: "intent/cancelled", epoch: 1, operationId: OP_A, response: cancelBody() },
      ],
      verified(),
    );
    expect(cancelled.intent?.applied).toEqual({
      state: "cancelled",
      effectiveAt: "2026-11-27T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });
    expect(cancelled.summary?.planId).toBe("growth");
    expect(accessClaim(cancelled)).toBe("pendingProjection");
  });

  it("does not record a cancellation from a bare ok", () => {
    const bare = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "cancel",
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: null,
          terms: null,
        },
        { type: "intent/cancelled", epoch: 1, operationId: OP_A, response: { ok: true } },
      ],
      verified(),
    );
    expect(bare.intent).toMatchObject({ status: "uncertain", reason: "response_unreadable" });
    expect(bare.intent?.applied).toBeNull();
  });

  it("keeps a not-applied cancellation uncertain rather than failed", () => {
    const pending = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "cancel",
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: null,
          terms: null,
        },
        {
          type: "intent/cancelled",
          epoch: 1,
          operationId: OP_A,
          response: { ok: false, reason: "cancellation_not_applied" },
        },
      ],
      verified(),
    );
    expect(pending.intent).toMatchObject({ status: "uncertain", operationId: OP_A });
    expect(commercialReasonKey("cancellation_not_applied")).toBe("billingScreen.reason.notApplied");
  });
});

describe("provider routing decisions", () => {
  it("sends a verified Stripe account's Free choice to a cancellation intent", () => {
    const stripe = verified();
    expect(routeFreeSelection(stripe, { isOwner: true })).toBe("cancelIntent");
    expect(routeFreeSelection(stripe, { isOwner: false })).toBe("cancelIntent");
    expect(routeCancellation(stripe)).toBe("cancelIntent");
  });

  it("holds a Stripe account whose cancellation action is unavailable", () => {
    const held = verified({
      heldReason: "held",
      actions: { ...summaryBody().actions, cancel: false, prepareChange: false },
    });
    expect(routeCancellation(held)).toBe("held");
    expect(routeFreeSelection(held, { isOwner: true })).toBe("cancelIntent");
  });

  it("keeps the existing Paddle portal for a verified Paddle agreement", () => {
    const paddle = verified({
      provider: "paddle",
      mode: null,
      actions: {
        ...summaryBody().actions,
        paddlePortal: true,
        prepareChange: false,
        cancel: false,
      },
    });
    expect(routeFreeSelection(paddle, { isOwner: true })).toBe("paddlePortal");
    expect(routeCancellation(paddle)).toBe("paddlePortal");
  });

  it("allows an owner's manual reset only for a cleared manual or free account", () => {
    const manualClear = verified({
      provider: "manual",
      mode: null,
      status: "manualBeta",
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        manualOverride: true,
      },
    });
    expect(routeFreeSelection(manualClear, { isOwner: true })).toBe("manualReset");
    expect(routeFreeSelection(manualClear, { isOwner: false })).toBe("unavailable");

    const manualHeld = verified({
      provider: "manual",
      mode: null,
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        manualOverride: false,
      },
    });
    expect(routeFreeSelection(manualHeld, { isOwner: true })).toBe("unavailable");
  });

  it("routes nowhere at all while the summary is unknown or unavailable", () => {
    const unknown = run([{ type: "identity", userId: USER_A, epoch: 1 }]);
    expect(routeFreeSelection(unknown, { isOwner: true })).toBe("unavailable");
    expect(routeCancellation(unknown)).toBe("unavailable");
    const unestablished = verified({
      provider: "unknown",
      mode: null,
      planId: null,
      access: "unknown",
      status: null,
      actions: { ...summaryBody().actions, prepareChange: false, cancel: false },
    });
    expect(routeFreeSelection(unestablished, { isOwner: true })).toBe("unavailable");
    expect(routeCancellation(unestablished)).toBe("unavailable");
  });
});

/* -------------------------------------------------------------------------- */
/* Correction 2 residuals                                                     */
/* -------------------------------------------------------------------------- */

describe("the Paddle portal needs current evidence like everything else", () => {
  const paddle = () =>
    verified({
      provider: "paddle",
      mode: null,
      actions: {
        ...summaryBody().actions,
        paddlePortal: true,
        prepareChange: false,
        cancel: false,
      },
    });

  it("allows the portal for a fresh verified Paddle agreement", () => {
    const fresh = paddle();
    expect(canOpenPaddlePortal(fresh)).toBe(true);
    expect(routeCancellation(fresh)).toBe("paddlePortal");
    expect(cancellationAvailable(fresh)).toBe(true);
    expect(freeSelectionAvailable(fresh, { isOwner: false })).toBe(true);
  });

  it("withdraws it after a failed refresh, and restores it after a fresh one", () => {
    const stale = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: { ok: false, reason: "billing_read_unavailable" },
        },
      ],
      paddle(),
    );
    // The facts are still shown…
    expect(stale.summary?.provider).toBe("paddle");
    expect(stale.summary?.actions.paddlePortal).toBe(true);
    // …and the portal is not permitted.
    expect(canOpenPaddlePortal(stale)).toBe(false);
    expect(routeCancellation(stale)).toBe("held");
    expect(cancellationAvailable(stale)).toBe(false);
    expect(freeSelectionAvailable(stale, { isOwner: true })).toBe(false);

    const refreshing = run([{ type: "summary/request", epoch: 1, token: 3 }], paddle());
    expect(canOpenPaddlePortal(refreshing)).toBe(false);

    const recovered = run(
      [
        { type: "summary/request", epoch: 1, token: 4 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 4,
          response: summaryResponse({
            provider: "paddle",
            mode: null,
            actions: {
              ...summaryBody().actions,
              paddlePortal: true,
              prepareChange: false,
              cancel: false,
            },
          }),
        },
      ],
      stale,
    );
    expect(canOpenPaddlePortal(recovered)).toBe(true);
  });

  it("never opens it for a non-Paddle provider, however the flag is set", () => {
    const stripeWithFlag = verified({
      actions: { ...summaryBody().actions, paddlePortal: true },
    });
    // The reader strips an incoherent Paddle flag from a Stripe account.
    expect(stripeWithFlag.summary?.actions.paddlePortal).toBe(false);
    expect(canOpenPaddlePortal(stripeWithFlag)).toBe(false);
  });
});

describe("a readable success must agree with the request it answers", () => {
  const dispatchChange = (from = readyToConfirm()) =>
    commercialUiReducer(from, {
      type: "intent/begin",
      epoch: 1,
      kind: "change",
      operationId: OP_A,
      quoteId: QUOTE_A,
      cancelOperationId: null,
      terms: termsFromQuote(quoteOf(from)),
    });
  const dispatchCancellation = (kind: "cancel" | "reverse") =>
    commercialUiReducer(verified(), {
      type: "intent/begin",
      epoch: 1,
      kind,
      operationId: OP_A,
      quoteId: null,
      cancelOperationId: kind === "reverse" ? CANCEL_OP : null,
      terms: null,
    });

  it("settles a change whose amount, currency and direction match the binding", () => {
    const settled = commercialUiReducer(dispatchChange(), {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: confirmBody(),
    });
    expect(settled.intent).toMatchObject({ status: "settled", reason: null });
  });

  it.each([
    ["a different currency", { currency: "pln", amountMinor: 1 }],
    ["a different amount", { amountMinor: 1 }],
    ["a different direction", { direction: "decrease" }],
    ["a scheduled change with no effective date", { state: "scheduled", effectiveAt: null }],
  ])("keeps a change uncertain when the answer claims %s", (_label, over) => {
    const after = commercialUiReducer(dispatchChange(), {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: confirmBody(over),
    });
    expect(after.intent).toMatchObject({
      operationId: OP_A,
      quoteId: QUOTE_A,
      status: "uncertain",
      reason: "response_incoherent",
    });
    expect(after.intent?.applied).toBeNull();
    // The original binding is untouched and no replacement is possible.
    expect(after.intent?.terms?.amountMinor).toBe(12_345);
    expect(confirmChangeRequest(after, NOW, OP_B)).toBeNull();
    expect(commercialReasonDisposition("response_incoherent")).toBe("uncertain");
  });

  it("settles a cancellation only when it reports the cancellation it asked for", () => {
    const good = commercialUiReducer(dispatchCancellation("cancel"), {
      type: "intent/cancelled",
      epoch: 1,
      operationId: OP_A,
      response: cancelBody({ cancelAtPeriodEnd: true }),
    });
    expect(good.intent).toMatchObject({ status: "settled" });
    expect(good.intent?.applied?.state).toBe("cancelled");

    const contradictory = commercialUiReducer(dispatchCancellation("cancel"), {
      type: "intent/cancelled",
      epoch: 1,
      operationId: OP_A,
      response: cancelBody({ cancelAtPeriodEnd: false }),
    });
    expect(contradictory.intent).toMatchObject({
      status: "uncertain",
      reason: "response_incoherent",
    });
    expect(contradictory.intent?.applied).toBeNull();
  });

  it("settles a reversal only when it reports the subscription is no longer ending", () => {
    const good = commercialUiReducer(dispatchCancellation("reverse"), {
      type: "intent/cancelled",
      epoch: 1,
      operationId: OP_A,
      response: cancelBody({ cancelAtPeriodEnd: false }),
    });
    expect(good.intent).toMatchObject({ status: "settled" });
    expect(good.intent?.applied?.state).toBe("reversed");

    const contradictory = commercialUiReducer(dispatchCancellation("reverse"), {
      type: "intent/cancelled",
      epoch: 1,
      operationId: OP_A,
      response: cancelBody({ cancelAtPeriodEnd: true }),
    });
    expect(contradictory.intent).toMatchObject({
      status: "uncertain",
      reason: "response_incoherent",
    });
    expect(contradictory.intent?.cancelOperationId).toBe(CANCEL_OP);
  });

  it("settles a DEFERRED change only on exactly the instant it was quoted for", () => {
    const base = deferredReady();
    const dispatchDeferred = () =>
      commercialUiReducer(base, {
        type: "intent/begin",
        epoch: 1,
        kind: "change",
        operationId: OP_A,
        quoteId: QUOTE_A,
        cancelOperationId: null,
        terms: termsFromQuote(quoteOf(base)),
      });
    const coherent = confirmBody({
      state: "scheduled",
      direction: "decrease",
      amountMinor: 0,
      effectiveAt: EFFECTIVE_AT,
    });

    // The same instant, differently spelled, is the same instant.
    for (const date of [EFFECTIVE_AT, "2026-11-28T00:00:00Z"]) {
      const settled = commercialUiReducer(dispatchDeferred(), {
        type: "intent/confirmed",
        epoch: 1,
        operationId: OP_A,
        response: { ...coherent, effectiveAt: date },
      });
      expect(settled.intent?.status, date).toBe("settled");
      expect(settled.intent?.applied?.effectiveAt).toBe(date);
    }

    // The reviewer's exact case: a December answer for a November request.
    const wrongDate = commercialUiReducer(dispatchDeferred(), {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: { ...coherent, effectiveAt: "2026-12-31T00:00:00.000Z" },
    });
    expect(wrongDate.intent).toMatchObject({
      operationId: OP_A,
      quoteId: QUOTE_A,
      status: "uncertain",
      reason: "response_incoherent",
    });
    expect(wrongDate.intent?.applied).toBeNull();
    expect(wrongDate.intent?.terms?.effectiveAt).toBe(EFFECTIVE_AT);

    // …and a deferred request cannot come back as something immediate.
    for (const over of [
      { state: "applied", effectiveAt: null },
      { state: "awaiting_payment", effectiveAt: null },
      { state: "scheduled", effectiveAt: null },
      { state: "scheduled", effectiveAt: "not-a-date" },
    ]) {
      const after = commercialUiReducer(dispatchDeferred(), {
        type: "intent/confirmed",
        epoch: 1,
        operationId: OP_A,
        response: { ...coherent, ...over },
      });
      expect(after.intent?.status, JSON.stringify(over)).toBe("uncertain");
      expect(after.intent?.applied).toBeNull();
    }
  });

  it("refuses a future date or a schedule on an IMMEDIATE change", () => {
    const dispatchImmediate = () =>
      commercialUiReducer(readyToConfirm(), {
        type: "intent/begin",
        epoch: 1,
        kind: "change",
        operationId: OP_A,
        quoteId: QUOTE_A,
        cancelOperationId: null,
        terms: termsFromQuote(quoteOf(readyToConfirm())),
      });
    for (const over of [
      { effectiveAt: "2026-12-31T00:00:00.000Z" },
      { state: "scheduled", effectiveAt: "2026-12-31T00:00:00.000Z" },
      { state: "scheduled", effectiveAt: null },
    ]) {
      const after = commercialUiReducer(dispatchImmediate(), {
        type: "intent/confirmed",
        epoch: 1,
        operationId: OP_A,
        response: confirmBody(over),
      });
      expect(after.intent, JSON.stringify(over)).toMatchObject({
        operationId: OP_A,
        status: "uncertain",
        reason: "response_incoherent",
      });
    }
    // Applied now, and awaiting payment now, both remain coherent.
    for (const state of ["applied", "awaiting_payment"] as const) {
      const after = commercialUiReducer(dispatchImmediate(), {
        type: "intent/confirmed",
        epoch: 1,
        operationId: OP_A,
        response: confirmBody({ state }),
      });
      expect(after.intent?.status, state).toBe("settled");
    }
  });

  it("cannot settle a change it has no binding to check against", () => {
    const unbound = commercialUiReducer(verified(), {
      type: "intent/begin",
      epoch: 1,
      kind: "change",
      operationId: OP_A,
      quoteId: QUOTE_A,
      cancelOperationId: null,
      terms: null,
    });
    const after = commercialUiReducer(unbound, {
      type: "intent/confirmed",
      epoch: 1,
      operationId: OP_A,
      response: confirmBody(),
    });
    expect(after.intent).toMatchObject({ status: "uncertain", reason: "response_incoherent" });
  });
});

describe("an unestablished account cannot acquire authority", () => {
  const unknownWithActions = () =>
    verified({
      provider: "unknown",
      mode: null,
      access: "unknown",
      planId: null,
      status: null,
      purchasedSeats: null,
      periodEnd: null,
      cancelAtPeriodEnd: null,
      actions: {
        paddlePortal: true,
        prepareChange: true,
        cancel: true,
        reverseCancellation: true,
        recoverOperation: true,
        manualOverride: true,
      },
    });

  it("strips every action an unknown provider claims, and says why", () => {
    const state = unknownWithActions();
    expect(state.summary).not.toBeNull();
    expect(state.summary?.actions).toEqual({
      paddlePortal: false,
      prepareChange: false,
      cancel: false,
      reverseCancellation: false,
      recoverOperation: false,
      manualOverride: false,
    });
    expect(state.summary?.heldReason).toBe("billing_state_unknown");
    // The facts it did establish are still displayed.
    expect(state.summary?.provider).toBe("unknown");
    expect(evidenceCurrent(state)).toBe(true);
  });

  it("refuses to prepare, confirm, cancel, reverse, recover or grant from it", () => {
    const state = run(
      [{ type: "selection/changed", planId: "pro", seatQuantity: 2 }],
      unknownWithActions(),
    );
    expect(canPrepareQuote(state)).toBe(false);
    expect(canConfirmQuote(state, NOW)).toBe(false);
    expect(canStartCancellation(state)).toBe(false);
    expect(canStartReversal(state)).toBe(false);
    expect(canResumeIntent(state)).toBe(false);
    expect(canUseManualOverride(state)).toBe(false);
    expect(canOpenPaddlePortal(state)).toBe(false);
    expect(routeFreeSelection(state, { isOwner: true })).toBe("unavailable");
    expect(routeCancellation(state)).toBe("unavailable");
  });

  it.each([
    [
      "a Stripe account claiming a Paddle portal",
      { actions: { ...summaryBody().actions, paddlePortal: true } },
      "paddlePortal",
    ],
    [
      "a free Stripe account claiming a paid change",
      { access: "free", actions: { ...summaryBody().actions, prepareChange: true } },
      "prepareChange",
    ],
    [
      "a reversal with no cancellation identity",
      {
        eligibleCancellationId: null,
        actions: { ...summaryBody().actions, reverseCancellation: true },
      },
      "reverseCancellation",
    ],
    [
      "recovery with no discovered operation",
      {
        operationEvidence: "none",
        operation: null,
        actions: { ...summaryBody().actions, recoverOperation: true },
      },
      "recoverOperation",
    ],
  ])("drops %s", (_label, over, action) => {
    const state = verified(over);
    expect(
      state.summary?.actions[action as keyof NonNullable<typeof state.summary>["actions"]],
    ).toBe(false);
    expect(state.summary?.heldReason).not.toBeNull();
  });

  it("leaves a coherent summary exactly as the server sent it", () => {
    const coherent = verified();
    expect(coherent.summary?.actions).toEqual(summaryBody().actions);
    expect(coherent.summary?.heldReason).toBeNull();
    expect(
      canPrepareQuote(
        run([{ type: "selection/changed", planId: "pro", seatQuantity: 2 }], coherent),
      ),
    ).toBe(true);
  });

  it("withholds the manual action from an unestablished provider, even when the server clears it", () => {
    // A bare test customer mapping with no entitlement row: the server's own
    // clearance legitimately stays clear, but the screen cannot say whose
    // agreement this is, so it does not offer the write. Refusing is always
    // allowed; only the server may permit.
    const mappingOnly = verified({
      provider: "unknown",
      mode: null,
      access: "unknown",
      planId: null,
      status: null,
      purchasedSeats: null,
      periodEnd: null,
      cancelAtPeriodEnd: null,
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        manualOverride: true,
      },
    });
    expect(mappingOnly.summary?.actions.manualOverride).toBe(false);
    expect(canUseManualOverride(mappingOnly)).toBe(false);
    expect(routeFreeSelection(mappingOnly, { isOwner: true })).toBe("unavailable");
  });

  it("will not start a Stripe change or cancellation without a resolved mode", () => {
    const noMode = run(
      [{ type: "selection/changed", planId: "pro", seatQuantity: 2 }],
      verified({ mode: null }),
    );
    expect(noMode.summary?.provider).toBe("stripe");
    expect(noMode.summary?.access).toBe("paid");
    expect(noMode.summary?.actions.prepareChange).toBe(false);
    expect(noMode.summary?.actions.cancel).toBe(false);
    expect(canPrepareQuote(noMode)).toBe(false);
    expect(canStartCancellation(noMode)).toBe(false);
    expect(routeCancellation(noMode)).toBe("held");
    expect(noMode.summary?.heldReason).toBe("evidence_incoherent");
    // A reversal is a Stripe change too.
    const noModeReversal = verified({
      mode: null,
      eligibleCancellationId: CANCEL_OP,
      actions: { ...summaryBody().actions, reverseCancellation: true },
    });
    expect(canStartReversal(noModeReversal)).toBe(false);
  });

  it("refuses recovery of an operation this screen cannot carry out", () => {
    const openOperation = (over: Record<string, unknown> = {}) => ({
      operationId: OP_A,
      kind: "plan_change",
      state: "awaiting_payment",
      quoteId: QUOTE_A,
      cancelOperationId: null,
      terms: {
        planId: "pro",
        seatQuantity: 2,
        amountMinor: 12_345,
        recurringEstimateMinor: 26_910,
        currency: "eur",
        direction: "increase",
        effectiveAt: null,
        expiresAt: EXPIRES,
      },
      ...over,
    });
    const discovered = (
      operation: Record<string, unknown>,
      summaryOver: Record<string, unknown> = {},
    ) =>
      verified({
        operationEvidence: "open",
        operation,
        actions: { ...summaryBody().actions, recoverOperation: true },
        ...summaryOver,
      });

    for (const [label, operation, summaryOver] of [
      ["an unrecognised kind", openOperation({ kind: "invented_kind" }), {}],
      ["the operator-only refund kind", openOperation({ kind: "refund" }), {}],
      ["a terminal state dressed as open", openOperation({ state: "applied" }), {}],
      ["a refused state", openOperation({ state: "refused" }), {}],
      [
        "a reversal with no cancellation to name",
        openOperation({ kind: "reverse_cancel", quoteId: null, terms: null }),
        {},
      ],
      ["a change with no bound quote", openOperation({ quoteId: null }), {}],
      ["a change with no original terms", openOperation({ terms: null }), {}],
      ["an unresolved mode", openOperation(), { mode: null }],
    ] as [string, Record<string, unknown>, Record<string, unknown>][]) {
      const state = discovered(operation, summaryOver);
      expect(state.summary?.actions.recoverOperation, label).toBe(false);
      expect(canResumeIntent(state), label).toBe(false);
      expect(confirmChangeRequest(state, NOW, OP_B), label).toBeNull();
      // The operation is still reported and still holds the slot.
      expect(state.intent, label).not.toBeNull();
      expect(canPrepareQuote(state), label).toBe(false);
      expect(canStartCancellation(state), label).toBe(false);
    }
  });

  it("never re-labels an unsupported operation kind as a plan change", () => {
    const refund = verified({
      operationEvidence: "open",
      operation: {
        operationId: OP_A,
        kind: "refund",
        state: "awaiting_apply",
        quoteId: null,
        cancelOperationId: null,
        terms: null,
      },
      actions: { ...summaryBody().actions, recoverOperation: true },
    });
    expect(refund.intent?.recoverySupported).toBe(false);
    expect(canResumeIntent(refund)).toBe(false);
    // A supported kind keeps its own identity and stays resumable.
    const cancelOp = verified({
      operationEvidence: "open",
      operation: {
        operationId: OP_A,
        kind: "cancel",
        state: "dispatching",
        quoteId: null,
        cancelOperationId: null,
        terms: null,
      },
      actions: { ...summaryBody().actions, recoverOperation: true },
    });
    expect(cancelOp.intent).toMatchObject({ kind: "cancel", recoverySupported: true });
    expect(canResumeIntent(cancelOp)).toBe(true);
    expect(recoverableIntentKind("seat_change")).toBe("change");
    expect(recoverableIntentKind("reverse_cancel")).toBe("reverse");
    expect(recoverableIntentKind("refund")).toBeNull();
    expect(recoverableIntentKind("invented_kind")).toBeNull();
  });

  /**
   * The exact adapter output the reviewers pinned as a MUST-PRESERVE
   * positive: no raw entitlement at all, so every display fact is null and
   * the provider is unestablished — but a coherent mapping, a non-granting
   * projection and an exactly bound operation make the recovery real.
   *
   * Copied field for field from
   * `r21-ui-correction2-client-independent/adapter-projection-only-recovery.json`
   * (adapter record `A2_positive_projection_only_recovery`).
   */
  it("preserves projection-only recovery with an unestablished provider", () => {
    const PINNED_OPERATION = "00000000-0000-4000-8000-0000000000d1";
    const PINNED_QUOTE = "00000000-0000-4000-8000-0000000000e1";
    const pinned = {
      ok: true,
      summary: {
        provider: "unknown",
        mode: "test",
        planId: null,
        access: "unknown",
        status: null,
        purchasedSeats: null,
        periodEnd: null,
        cancelAtPeriodEnd: null,
        currentAmountMinor: null,
        currentCurrency: null,
        currentAmountEvidence: "unknown",
        operation: {
          operationId: PINNED_OPERATION,
          kind: "plan_change",
          state: "awaiting_payment",
          quoteId: PINNED_QUOTE,
          cancelOperationId: null,
          terms: {
            planId: "pro",
            seatQuantity: 3,
            amountMinor: 12_300,
            recurringEstimateMinor: 26_910,
            currency: "eur",
            direction: "increase",
            effectiveAt: null,
            expiresAt: "2099-10-29T12:00:00.000Z",
          },
        },
        operationEvidence: "open",
        eligibleCancellationId: null,
        actions: {
          paddlePortal: false,
          prepareChange: false,
          cancel: false,
          reverseCancellation: false,
          recoverOperation: true,
          manualOverride: false,
        },
        heldReason: "billing_state_unknown",
      },
    };
    const read = readSummaryResponse(pinned);
    expect(read.kind).toBe("value");
    if (read.kind !== "value") return;
    // The generic held reason does not veto the established recovery.
    expect(read.value.actions.recoverOperation).toBe(true);
    expect(read.value.heldReason).toBe("billing_state_unknown");

    const state = run([
      { type: "identity", userId: USER_A, epoch: 1 },
      { type: "summary/request", epoch: 1, token: 1 },
      { type: "summary/resolved", epoch: 1, token: 1, response: pinned },
    ]);
    expect(state.intent).toMatchObject({
      operationId: PINNED_OPERATION,
      quoteId: PINNED_QUOTE,
      kind: "change",
      recoverySupported: true,
    });
    expect(canResumeIntent(state)).toBe(true);
    // The exact six-field payload, still available long after the original
    // preview would have expired.
    const beyondExpiry = Date.parse("2099-12-31T00:00:00.000Z");
    expect(confirmChangeRequest(state, beyondExpiry, OP_B)).toEqual({
      operationId: PINNED_OPERATION,
      quoteId: PINNED_QUOTE,
      planId: "pro",
      seatQuantity: 3,
      amountMinor: 12_300,
      currency: "eur",
    });
    // No new commercial work is offered from this unestablished state.
    expect(canPrepareQuote(state)).toBe(false);
    expect(canStartCancellation(state)).toBe(false);
    expect(canUseManualOverride(state)).toBe(false);
  });

  it("preserves recovery for an effective-Free Stripe agreement", () => {
    const endedWithOperation = verified({
      access: "free",
      status: "cancelled",
      operationEvidence: "open",
      operation: {
        operationId: OP_A,
        kind: "plan_change",
        state: "fenced",
        quoteId: QUOTE_A,
        cancelOperationId: null,
        terms: {
          planId: "pro",
          seatQuantity: 2,
          amountMinor: 12_345,
          recurringEstimateMinor: 26_910,
          currency: "eur",
          direction: "increase",
          effectiveAt: null,
          expiresAt: EXPIRES,
        },
      },
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        recoverOperation: true,
      },
    });
    expect(canResumeIntent(endedWithOperation)).toBe(true);
    expect(
      confirmChangeRequest(endedWithOperation, Date.parse(EXPIRES) + 86_400_000, OP_B),
    ).toMatchObject({ operationId: OP_A, quoteId: QUOTE_A });
  });

  it("preserves an ENDED Stripe agreement's identity and its manual route", () => {
    // Effective-Free is an access tier, not a loss of provider identity: the
    // owner may still reset it manually.
    const ended = verified({
      access: "free",
      status: "cancelled",
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        manualOverride: true,
      },
    });
    expect(ended.summary?.provider).toBe("stripe");
    expect(ended.summary?.actions.manualOverride).toBe(true);
    expect(canUseManualOverride(ended)).toBe(true);
    expect(routeFreeSelection(ended, { isOwner: true })).toBe("cancelIntent");
    expect(freeSelectionAvailable(ended, { isOwner: true })).toBe(false);
  });
});

describe("an acknowledged application stops waiting once a read confirms it", () => {
  const applied = () => {
    const base = readyToConfirm();
    return run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(base)),
        },
        { type: "intent/confirmed", epoch: 1, operationId: OP_A, response: confirmBody() },
      ],
      base,
    );
  };
  /** The authoritative read that matches the Pro / 2-seat target. */
  const matchingRead = (over: Record<string, unknown> = {}) =>
    summaryResponse({
      planId: "pro",
      purchasedSeats: 2,
      access: "paid",
      status: "active",
      periodEnd: "2026-11-28T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      operationEvidence: "none",
      operation: null,
      ...over,
    });
  const read = (state: CommercialUiState, response: unknown, token = 2) =>
    run(
      [
        { type: "summary/request", epoch: 1, token },
        { type: "summary/resolved", epoch: 1, token, response },
      ],
      state,
    );

  it("CONTROL: an applied answer with no later read keeps waiting", () => {
    const state = applied();
    expect(state.intent?.status).toBe("settled");
    expect(accessClaim(state)).toBe("pendingProjection");
    expect(intentVerified(state)).toBe(false);
  });

  it("CONTROL: an old or mismatched projection keeps waiting", () => {
    for (const over of [
      { planId: "growth", purchasedSeats: 2 },
      { planId: "pro", purchasedSeats: 0 },
      { planId: "pro", purchasedSeats: 2, access: "free" },
    ]) {
      const state = read(applied(), matchingRead(over));
      expect(state.intent?.status, JSON.stringify(over)).toBe("settled");
      expect(accessClaim(state)).toBe("pendingProjection");
      expect(state.intent?.discoveryMissing).toBe(true);
    }
  });

  it("CONTROL: an UNCERTAIN original is never resolved by a coincidental match", () => {
    const base = readyToConfirm();
    const uncertain = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(base)),
        },
        { type: "intent/transportFailed", epoch: 1, operationId: OP_A },
      ],
      base,
    );
    const after = read(uncertain, matchingRead());
    expect(after.intent).toMatchObject({
      operationId: OP_A,
      quoteId: QUOTE_A,
      status: "uncertain",
      discoveryMissing: true,
    });
    expect(after.intent?.terms?.amountMinor).toBe(12_345);
    expect(accessClaim(after)).toBe("pendingProjection");
    expect(intentVerified(after)).toBe(false);
    expect(confirmChangeRequest(after, NOW, OP_B)).toBeNull();
  });

  it("CONTROL: an acknowledgement that has not applied yet keeps waiting", () => {
    // An immediate intent awaiting payment: coherent (no date), but not
    // applied, so it cannot be verified by any projection.
    const base = readyToConfirm();
    const awaitingPayment = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(base)),
        },
        {
          type: "intent/confirmed",
          epoch: 1,
          operationId: OP_A,
          response: confirmBody({ state: "awaiting_payment" }),
        },
      ],
      base,
    );
    expect(awaitingPayment.intent?.status).toBe("settled");
    expect(accessClaim(read(awaitingPayment, matchingRead()))).toBe("pendingProjection");

    // A deferred intent scheduled on exactly its quoted instant: coherent,
    // and still not applied.
    const deferredBase = deferredReady();
    const scheduled = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(deferredBase)),
        },
        {
          type: "intent/confirmed",
          epoch: 1,
          operationId: OP_A,
          response: confirmBody({
            state: "scheduled",
            direction: "decrease",
            amountMinor: 0,
            effectiveAt: EFFECTIVE_AT,
          }),
        },
      ],
      deferredBase,
    );
    expect(scheduled.intent?.status).toBe("settled");
    expect(accessClaim(read(scheduled, matchingRead()))).toBe("pendingProjection");
  });

  it("stops waiting when a fresh matching projection is established", () => {
    const after = read(applied(), matchingRead());
    expect(after.intent?.status).toBe("verified");
    expect(after.intent?.discoveryMissing).toBe(false);
    expect(intentVerified(after)).toBe(true);
    // The authoritative access is shown, not an endless waiting state.
    expect(accessClaim(after)).toBe("paid");
    expect(after.summary?.planId).toBe("pro");
    // A second identical read does not undo it.
    const again = read(after, matchingRead(), 3);
    expect(again.intent?.status).toBe("verified");
    expect(accessClaim(again)).toBe("paid");
  });

  it("CONTROL: an internally contradictory matching summary is NOT verification", () => {
    // Each of these finds the Pro / 2-seat target, and each is incoherent
    // with the adapter's own contract: the seat count it asserts could only
    // come from a resolved Stripe scope.
    for (const [label, over] of [
      ["a manual provider", { provider: "manual", mode: null }],
      ["a Paddle provider", { provider: "paddle", mode: null }],
      ["an unestablished provider", { provider: "unknown", mode: null, access: "unknown" }],
      ["a Stripe agreement with no resolved mode", { mode: null }],
      ["an unknown current period", { periodEnd: null }],
      ["a terminal status beside paid access", { status: "cancelled" }],
      ["a checkout-pending status", { status: "checkoutPending" }],
    ] as [string, Record<string, unknown>][]) {
      const state = read(applied(), matchingRead(over));
      expect(state.intent?.status, label).toBe("settled");
      expect(intentVerified(state), label).toBe(false);
      expect(accessClaim(state), label).toBe("pendingProjection");
      // The original binding survives untouched.
      expect(state.intent?.operationId, label).toBe(OP_A);
      expect(state.intent?.terms?.amountMinor, label).toBe(12_345);
    }
  });

  it("CONTROL: a cancellation or reversal also needs coherent projection evidence", () => {
    const cancelled = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "cancel",
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: null,
          terms: null,
        },
        { type: "intent/cancelled", epoch: 1, operationId: OP_A, response: cancelBody() },
      ],
      verified(),
    );
    for (const over of [
      { cancelAtPeriodEnd: true, provider: "manual", mode: null },
      { cancelAtPeriodEnd: true, mode: null },
      { cancelAtPeriodEnd: true, periodEnd: null },
      { cancelAtPeriodEnd: true, access: "free" },
    ]) {
      const state = read(cancelled, summaryResponse(over));
      expect(state.intent?.status, JSON.stringify(over)).toBe("settled");
      expect(intentVerified(state)).toBe(false);
    }
    // The coherent one still resolves.
    expect(intentVerified(read(cancelled, summaryResponse({ cancelAtPeriodEnd: true })))).toBe(
      true,
    );
  });

  /** A settled cancellation or reversal, acknowledged for this exact id. */
  const settledCancellation = (kind: "cancel" | "reverse") =>
    run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind,
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: kind === "reverse" ? CANCEL_OP : null,
          terms: null,
        },
        {
          type: "intent/cancelled",
          epoch: 1,
          operationId: OP_A,
          response: cancelBody({ cancelAtPeriodEnd: kind === "cancel" }),
        },
      ],
      verified({ cancelAtPeriodEnd: kind === "reverse" }),
    );

  it("CONTROL: a terminal or period-less read cannot verify a cancellation or reversal", () => {
    // Each of these is a fresh Stripe/test read that carries the branch's own
    // cancellation flag and still contradicts itself. An agreement the read
    // already calls `cancelled` has not ended AT a period end, and one with no
    // readable period has no period to end at — so neither is evidence that
    // this request took effect, whichever way the flag happens to point.
    for (const [label, kind, over] of [
      [
        "a cancellation answered by an already-cancelled agreement",
        "cancel",
        { cancelAtPeriodEnd: true, status: "cancelled" },
      ],
      [
        "a cancellation with no readable period",
        "cancel",
        { cancelAtPeriodEnd: true, periodEnd: null },
      ],
      [
        "a cancellation on a checkout-pending agreement",
        "cancel",
        { cancelAtPeriodEnd: true, status: "checkoutPending" },
      ],
      [
        "a reversal answered by an already-cancelled agreement",
        "reverse",
        { cancelAtPeriodEnd: false, status: "cancelled" },
      ],
      [
        "a reversal with no readable period",
        "reverse",
        { cancelAtPeriodEnd: false, periodEnd: null },
      ],
      [
        "a reversal on a checkout-pending agreement",
        "reverse",
        { cancelAtPeriodEnd: false, status: "checkoutPending" },
      ],
    ] as [string, "cancel" | "reverse", Record<string, unknown>][]) {
      const state = read(settledCancellation(kind), summaryResponse(over));
      expect(state.intent?.status, label).toBe("settled");
      expect(intentVerified(state), label).toBe(false);
      expect(accessClaim(state), label).toBe("pendingProjection");
      // The acknowledged intent and its original identity survive untouched.
      expect(state.intent?.kind, label).toBe(kind);
      expect(state.intent?.operationId, label).toBe(OP_A);
      expect(state.intent?.applied?.cancelAtPeriodEnd, label).toBe(kind === "cancel");
      expect(state.intent?.cancelOperationId, label).toBe(kind === "reverse" ? CANCEL_OP : null);
      // And the contradiction makes nothing else dispatchable: the held intent
      // still owns the slot, so no second mutation can be started from here.
      expect(canStartCancellation(state), label).toBe(false);
      expect(canStartReversal(state), label).toBe(false);
      expect(canResumeIntent(state), label).toBe(false);
      expect(confirmChangeRequest(state, NOW, OP_B), label).toBeNull();
    }

    // Both coherent answers still resolve, on exactly the evidence a granting
    // Stripe agreement provides.
    for (const kind of ["cancel", "reverse"] as const) {
      const ok = read(
        settledCancellation(kind),
        summaryResponse({ cancelAtPeriodEnd: kind === "cancel" }),
      );
      expect(ok.intent?.status, kind).toBe("verified");
      expect(intentVerified(ok), kind).toBe(true);
      expect(accessClaim(ok), kind).toBe("paid");
    }
  });

  it("does not treat an open operation as verification", () => {
    const after = read(
      applied(),
      matchingRead({
        operationEvidence: "open",
        operation: {
          operationId: OP_A,
          kind: "plan_change",
          state: "awaiting_apply",
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: null,
        },
      }),
    );
    expect(after.intent?.status).toBe("settled");
    expect(accessClaim(after)).toBe("pendingProjection");
  });

  it("verifies a cancellation and a reversal by their own evidence", () => {
    const cancelled = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "cancel",
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: null,
          terms: null,
        },
        { type: "intent/cancelled", epoch: 1, operationId: OP_A, response: cancelBody() },
      ],
      verified(),
    );
    expect(read(cancelled, summaryResponse({ cancelAtPeriodEnd: false })).intent?.status).toBe(
      "settled",
    );
    const confirmedCancel = read(cancelled, summaryResponse({ cancelAtPeriodEnd: true }));
    expect(confirmedCancel.intent?.status).toBe("verified");
    expect(accessClaim(confirmedCancel)).toBe("paid");

    const reversed = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "reverse",
          operationId: OP_A,
          quoteId: null,
          cancelOperationId: CANCEL_OP,
          terms: null,
        },
        {
          type: "intent/cancelled",
          epoch: 1,
          operationId: OP_A,
          response: cancelBody({ cancelAtPeriodEnd: false }),
        },
      ],
      verified({ cancelAtPeriodEnd: true }),
    );
    expect(read(reversed, summaryResponse({ cancelAtPeriodEnd: true })).intent?.status).toBe(
      "settled",
    );
    expect(read(reversed, summaryResponse({ cancelAtPeriodEnd: false })).intent?.status).toBe(
      "verified",
    );
  });

  it("lets a verified operation be dismissed, and never an unresolved one", () => {
    const verifiedState = read(applied(), matchingRead());
    expect(commercialUiReducer(verifiedState, { type: "intent/dismiss" }).intent).toBeNull();
    // An operation whose outcome is still unknown is not dismissible: it owns
    // the slot until exact evidence settles it.
    const base = readyToConfirm();
    const unresolved = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OP_A,
          quoteId: QUOTE_A,
          cancelOperationId: null,
          terms: termsFromQuote(quoteOf(base)),
        },
        { type: "intent/transportFailed", epoch: 1, operationId: OP_A },
      ],
      base,
    );
    expect(commercialUiReducer(unresolved, { type: "intent/dismiss" }).intent).not.toBeNull();
  });
});
