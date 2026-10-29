/**
 * Stripe COMMERCIAL operations — pure decisions and the mocked server paths.
 *
 * Nothing here reaches a network or a database: `fetch` is a local fake routing
 * synthetic Stripe payloads, and every database call is the mocked service-role
 * RPC. No real provider call is possible from this suite, and no Stripe object,
 * credential or sandbox exists in the authorized scope.
 *
 * What the server half proves is DECISIONS and REFUSALS: which object is
 * authoritative, what is sent on the wire, and — most of the assertions here —
 * when nothing is dispatched and nothing is settled at all.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_LIMITS, PLAN_PRICING, PLAN_SEATS } from "./billing";
import { buildPriceRegistry } from "./stripe-lifecycle";
import {
  FIRST_PAYMENT_REFUND_WINDOW_MS,
  PLAN_RANK,
  REFUND_SUPPORT_COPY,
  appliedSelectionMatches,
  buildReductionPayload,
  canonicalJson,
  checkTargetCapacity,
  classifyChange,
  classifyRefundStatus,
  committedRefundTotal,
  dispositionSupported,
  evaluateRefundPolicy,
  isOpenOperationState,
  isTerminalOperationState,
  itemStateFingerprintInput,
  parseSelectionDetail,
  parseStoredReductionPayload,
  pendingChangeWouldWiden,
  planRank,
  readAdoptedScheduleProfile,
  readCommercialSubscriptionSnapshot,
  readCommercialSubscriptionState,
  readProrationPreview,
  readRecurringPreview,
  readRefundObject,
  readSubscriptionSchedule,
  readUpdateInvoiceIdentity,
  reductionPayloadEqual,
  refundConsumesFunds,
  refundReleasesReservation,
  resolveRefundableAllocation,
  resolveServerMarket,
  scheduleMatchesReduction,
  seatMarketSupported,
  selectionFingerprintInput,
  toMinorUnits,
  validateBaseTerms,
  validateSeatTerms,
} from "./stripe-commercial";
import {
  APPROVED_MINOR,
  COMMERCIAL_ACCOUNT_TEST,
  COMMERCIAL_CUSTOMER,
  COMMERCIAL_ENV,
  COMMERCIAL_OWNER,
  COMMERCIAL_SUBSCRIPTION,
  DEFAULT_PRICE_OBJECTS,
  PRICE_IDS,
  PRODUCT_IDS,
  REFUND_INVOICE,
  REFUND_PAYMENT_INTENT,
  adoptedSchedule,
  growthSubscription,
  invoicePayment,
  list,
  paidInvoice,
  paymentIntent,
  priceObject,
  proWithSeatsSubscription,
  prorationPreview,
  recurringPreview,
  reductionSchedule,
  refundObject,
  refundableInvoice,
  scheduleDefaultSettings,
  schedulePhaseItem,
  schedulePhaseSettings,
  subscriptionItem,
  updateInvoice,
} from "./stripe-commercial-fixtures";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

import {
  COMMERCIAL_QUOTE_TTL_SECONDS,
  confirmSubscriptionChange,
  evaluateManualEntitlementClearance,
  executeApprovedRefund,
  liveCommercialMutationsAllowed,
  prepareSubscriptionChange,
  readBillingDeletionBarrier,
  readCommercialAccountSummary,
  recordApprovedRefundCase,
  requestSubscriptionCancellation,
  reverseSubscriptionCancellation,
} from "./stripe-commercial.server";

const NOW_MS = 1_793_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);
const QUOTE = "00000000-0000-4000-8000-0000000000b1";
const OPERATION = "00000000-0000-4000-8000-0000000000a1";
const CANCEL_OPERATION = "00000000-0000-4000-8000-0000000000a9";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const registry = () => {
  const built = buildPriceRegistry("test", COMMERCIAL_ENV);
  if (!built.ok) throw new Error(`fixture registry: ${built.reason}`);
  return built.registry;
};

/** Read a fixture subscription through the real reader, so the fingerprints the
 * tests assert are the ones the server computes. */
const stateOf = (raw: unknown) => {
  const read = readCommercialSubscriptionState({
    raw,
    mode: "test",
    customerId: COMMERCIAL_CUSTOMER,
    registry: registry(),
    nowSeconds: NOW_S,
  });
  if (!read.ok) throw new Error(`fixture state: ${read.reason}`);
  return read.value;
};

/* ========================================================================== */
/* Pure decisions                                                             */
/* ========================================================================== */

describe("markets and the approved catalogue", () => {
  it("derives the market from the PERSISTED billing country only", () => {
    expect(
      resolveServerMarket({ billingCountry: "DE", needsReview: false, lockedCurrency: "eur" }),
    ).toEqual({ ok: true, market: "European Union", currency: "eur" });
    expect(
      resolveServerMarket({ billingCountry: "pl", needsReview: false, lockedCurrency: "pln" }),
    ).toEqual({ ok: true, market: "Poland", currency: "pln" });
    // A country with no locked subscription currency yet is still resolvable.
    expect(
      resolveServerMarket({ billingCountry: "GB", needsReview: false, lockedCurrency: null }),
    ).toEqual({ ok: true, market: "United Kingdom", currency: "gbp" });
  });

  it("holds an unknown, unlisted or review-flagged market, and any currency switch", () => {
    for (const country of ["", "   ", "OTHER", "D", "DEU", "12", undefined, null])
      expect(
        resolveServerMarket({ billingCountry: country, needsReview: false, lockedCurrency: "eur" }),
        String(country),
      ).toEqual({ ok: false, reason: "billing_country_unknown" });
    expect(
      resolveServerMarket({ billingCountry: "DE", needsReview: true, lockedCurrency: "eur" }),
    ).toEqual({ ok: false, reason: "market_review_required" });
    // The paid subscription is locked to EUR; a Polish billing country would
    // need a currency switch, which is held rather than performed.
    expect(
      resolveServerMarket({ billingCountry: "PL", needsReview: false, lockedCurrency: "eur" }),
    ).toEqual({ ok: false, reason: "currency_switch_held" });
    expect(
      resolveServerMarket({ billingCountry: "DE", needsReview: false, lockedCurrency: "sek" }),
    ).toEqual({ ok: false, reason: "currency_switch_held" });
  });

  it("converts whole catalogue units to integer smallest units, or refuses", () => {
    expect(toMinorUnits(149, "eur")).toEqual({ ok: true, minor: 14_900 });
    expect(toMinorUnits(1999, "pln")).toEqual({ ok: true, minor: 199_900 });
    // An unlisted currency is never given a guessed exponent.
    expect(toMinorUnits(100, "jpy")).toEqual({ ok: false, reason: "currency_unsupported" });
    expect(toMinorUnits(100, "usd")).toEqual({ ok: false, reason: "currency_unsupported" });
    expect(toMinorUnits(-1, "eur")).toEqual({ ok: false, reason: "amount_invalid" });
  });

  it("offers extra working seats only in the approved EUR markets", () => {
    expect(seatMarketSupported("European Union")).toBe(true);
    expect(seatMarketSupported("Other")).toBe(true);
    for (const market of ["Poland", "Sweden", "Denmark", "United Kingdom"] as const)
      expect(seatMarketSupported(market), market).toBe(false);
  });

  it("keeps the owner-approved plan and seat catalogue exactly as decided", () => {
    expect(PLAN_PRICING["European Union"]).toMatchObject({
      starter: 79,
      growth: 149,
      pro: 299,
      agency: 449,
    });
    expect(PLAN_SEATS.starter).toEqual({
      workingSeats: 2,
      viewerSeats: 2,
      extraWorkingSeatEur: 15,
    });
    expect(PLAN_SEATS.growth).toEqual({ workingSeats: 3, viewerSeats: 5, extraWorkingSeatEur: 15 });
    expect(PLAN_SEATS.pro).toEqual({ workingSeats: 5, viewerSeats: 10, extraWorkingSeatEur: 12 });
    expect(PLAN_SEATS.agency).toEqual({
      workingSeats: 10,
      viewerSeats: 50,
      extraWorkingSeatEur: 10,
    });
    expect(PLAN_RANK).toEqual({ freePreview: 0, starter: 1, growth: 2, pro: 3, agency: 4 });
    expect(planRank("enterprise")).toBe(-1);
  });

  const entry = (kind: "base" | "seat") => ({
    kind,
    planId: "pro" as const,
    priceId: kind === "base" ? PRICE_IDS.proBase : PRICE_IDS.proSeat,
    productId: PRODUCT_IDS.pro,
    currency: "eur",
    interval: "month" as const,
    intervalCount: 1,
  });
  const baseArgs = {
    planId: "pro" as const,
    market: "European Union" as const,
    entry: entry("base"),
    providerAmountMinor: APPROVED_MINOR.proBase,
    providerCurrency: "eur",
    providerProductId: PRODUCT_IDS.pro,
    providerActive: true,
    providerInterval: "month",
    providerIntervalCount: 1,
  };

  it("accepts a configured price that matches the approved terms exactly", () => {
    expect(validateBaseTerms(baseArgs)).toEqual({ ok: true });
    expect(
      validateSeatTerms({
        ...baseArgs,
        entry: entry("seat"),
        providerAmountMinor: APPROVED_MINOR.proSeat,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a configured price whose amount, currency, product, interval or state disagrees", () => {
    for (const [label, over] of [
      ["an unapproved amount", { providerAmountMinor: 19_900 }],
      ["a fractional amount", { providerAmountMinor: 29_900.5 }],
      ["a missing amount", { providerAmountMinor: undefined }],
      ["a foreign currency", { providerCurrency: "pln" }],
      ["another product", { providerProductId: PRODUCT_IDS.growth }],
      ["an archived price", { providerActive: false }],
      ["a yearly interval", { providerInterval: "year" }],
      ["a two-month interval", { providerIntervalCount: 2 }],
    ] as const) {
      const result = validateBaseTerms({ ...baseArgs, ...over });
      expect(result.ok, label).toBe(false);
    }
    // The approved seat model is EUR-only; a non-EUR market would need a price
    // this packet is not allowed to invent.
    expect(validateSeatTerms({ ...baseArgs, market: "Poland", entry: entry("seat") })).toEqual({
      ok: false,
      reason: "seat_market_unapproved",
    });
    // Free Preview has no extra-seat price at all.
    expect(
      validateSeatTerms({
        ...baseArgs,
        planId: "freePreview",
        entry: { ...entry("seat"), planId: "freePreview" },
      }),
    ).toEqual({ ok: false, reason: "seat_plan_unapproved" });
    expect(validateBaseTerms({ ...baseArgs, planId: "freePreview" })).toEqual({
      ok: false,
      reason: "plan_not_sellable",
    });
  });
});

describe("the exact current item state", () => {
  it("reads the base item, its id and the conservative period", () => {
    const state = stateOf(growthSubscription(NOW_S));
    expect(state.base.itemId).toBe("si_base");
    expect(state.base.quantity).toBe(1);
    expect(state.planId).toBe("growth");
    expect(state.seatQuantity).toBe(0);
    expect(state.seat).toBeNull();
    expect(state.pendingUpdate).toBe("absent");
    expect(state.scheduleId).toBeNull();
    expect(state.latestInvoiceId).toBe("in_base");
    const withSeats = stateOf(proWithSeatsSubscription(NOW_S, 3));
    expect(withSeats.seat?.itemId).toBe("si_seat");
    expect(withSeats.seatQuantity).toBe(3);
    expect(withSeats.planId).toBe("pro");
  });

  const read = (raw: unknown) =>
    readCommercialSubscriptionState({
      raw,
      mode: "test",
      customerId: COMMERCIAL_CUSTOMER,
      registry: registry(),
      nowSeconds: NOW_S,
    });

  it.each([
    ["an unreadable object", null, "subscription_unreadable"],
    ["the wrong object kind", { object: "invoice", id: "sub_test_x" }, "subscription_object"],
    ["a bad id shape", growthSubscription(NOW_S, { id: "cus_1" }), "subscription_id"],
    ["the wrong mode", growthSubscription(NOW_S, { livemode: true }), "subscription_mode"],
    [
      "another customer",
      growthSubscription(NOW_S, { customer: "cus_other" }),
      "subscription_customer",
    ],
    [
      "a missing cancel flag",
      growthSubscription(NOW_S, { cancel_at_period_end: null }),
      "subscription_cancel_flag",
    ],
    ["a missing currency", growthSubscription(NOW_S, { currency: "" }), "subscription_currency"],
    [
      "an unsupported collection method",
      growthSubscription(NOW_S, { collection_method: "send_invoice" }),
      "collection_method_unsupported",
    ],
    [
      "an unreadable schedule link",
      growthSubscription(NOW_S, { schedule: 5 }),
      "schedule_unreadable",
    ],
    ["a missing item list", growthSubscription(NOW_S, { items: null }), "items_unreadable"],
    [
      "a paginated item list",
      growthSubscription(NOW_S, { items: { object: "list", has_more: true, data: [] } }),
      "items_incomplete",
    ],
    [
      "a data-less item list",
      growthSubscription(NOW_S, { items: { object: "list", has_more: false } }),
      "items_data_missing",
    ],
    [
      "an empty item list",
      growthSubscription(NOW_S, { items: { object: "list", has_more: false, data: [] } }),
      "items_unexpected_count",
    ],
  ])("refuses %s", (_label, raw, reason) => {
    const result = read(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("refuses an unreadable item id, because a mutation must name the real item", () => {
    const result = read(
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              { id: "", priceId: PRICE_IDS.growthBase, productId: PRODUCT_IDS.growth, quantity: 1 },
              NOW_S,
            ),
          ],
        },
      }),
    );
    expect(result).toEqual({ ok: false, reason: "item_id_unreadable" });
  });

  it("refuses a second base item, a base quantity other than 1 and a foreign seat plan", () => {
    const twoBases = read(
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              {
                id: "si_base",
                priceId: PRICE_IDS.growthBase,
                productId: PRODUCT_IDS.growth,
                quantity: 1,
              },
              NOW_S,
            ),
            subscriptionItem(
              {
                id: "si_base2",
                priceId: PRICE_IDS.proBase,
                productId: PRODUCT_IDS.pro,
                quantity: 1,
              },
              NOW_S,
            ),
          ],
        },
      }),
    );
    expect(twoBases).toEqual({ ok: false, reason: "item_duplicate_base" });

    const multiplied = read(
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              {
                id: "si_base",
                priceId: PRICE_IDS.growthBase,
                productId: PRODUCT_IDS.growth,
                quantity: 2,
              },
              NOW_S,
            ),
          ],
        },
      }),
    );
    expect(multiplied).toEqual({ ok: false, reason: "item_base_quantity" });

    const foreignSeat = read(
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              {
                id: "si_base",
                priceId: PRICE_IDS.growthBase,
                productId: PRODUCT_IDS.growth,
                quantity: 1,
              },
              NOW_S,
            ),
            subscriptionItem(
              {
                id: "si_seat",
                priceId: PRICE_IDS.proSeat,
                productId: PRODUCT_IDS.pro,
                quantity: 2,
              },
              NOW_S,
            ),
          ],
        },
      }),
    );
    expect(foreignSeat).toEqual({ ok: false, reason: "item_seat_plan_mismatch" });
  });

  it("refuses an elapsed or missing item period", () => {
    expect(
      read(
        growthSubscription(NOW_S, {
          items: {
            object: "list",
            has_more: false,
            data: [
              subscriptionItem(
                {
                  id: "si_base",
                  priceId: PRICE_IDS.growthBase,
                  productId: PRODUCT_IDS.growth,
                  quantity: 1,
                },
                NOW_S,
                { current_period_end: NOW_S - 1 },
              ),
            ],
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "item_period_elapsed" });
    expect(
      read(
        growthSubscription(NOW_S, {
          items: {
            object: "list",
            has_more: false,
            data: [
              subscriptionItem(
                {
                  id: "si_base",
                  priceId: PRICE_IDS.growthBase,
                  productId: PRODUCT_IDS.growth,
                  quantity: 1,
                },
                NOW_S,
                { current_period_end: null },
              ),
            ],
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "item_period_missing" });
  });

  it("reports a present or unreadable pending update distinctly from an absent one", () => {
    expect(stateOf(growthSubscription(NOW_S, { pending_update: {} })).pendingUpdate).toBe(
      "present",
    );
    expect(stateOf(growthSubscription(NOW_S, { pending_update: 7 })).pendingUpdate).toBe("unknown");
    expect(stateOf(growthSubscription(NOW_S, { pending_update: undefined })).pendingUpdate).toBe(
      "absent",
    );
  });

  it("fingerprints the state so a moved item, period, invoice or schedule is detected", () => {
    const base = itemStateFingerprintInput(stateOf(growthSubscription(NOW_S)));
    for (const over of [
      { latest_invoice: paidInvoice(NOW_S, { id: "in_other" }) },
      { cancel_at_period_end: true },
      { pending_update: {} },
      { schedule: "sub_sched_9" },
      { status: "past_due" },
    ])
      expect(
        itemStateFingerprintInput(stateOf(growthSubscription(NOW_S, over))),
        JSON.stringify(over),
      ).not.toBe(base);
    // The same state fingerprints identically.
    expect(itemStateFingerprintInput(stateOf(growthSubscription(NOW_S)))).toBe(base);
  });

  it("fingerprints the selection without the proration date", () => {
    const selection = {
      targetPlanId: "pro" as const,
      targetSeatQuantity: 2,
      baseItemId: "si_base",
      basePriceId: PRICE_IDS.proBase,
      seatItemId: null,
      seatPriceId: PRICE_IDS.proSeat,
    };
    expect(selectionFingerprintInput(selection)).toBe(
      `pro#2#si_base#${PRICE_IDS.proBase}#-#${PRICE_IDS.proSeat}`,
    );
    expect(selectionFingerprintInput({ ...selection, targetSeatQuantity: 3 })).not.toBe(
      selectionFingerprintInput(selection),
    );
  });
});

describe("the applied-selection proof, item by item", () => {
  // The snapshot is produced by the production reader from a provider fixture,
  // never handwritten, so these cases exercise the real pair.
  const snapshotOf = (raw: unknown) => {
    const read = readCommercialSubscriptionSnapshot({
      raw,
      mode: "test",
      customerId: COMMERCIAL_CUSTOMER,
    });
    if (!read.ok) throw new Error(`snapshot: ${read.reason}`);
    return read.value;
  };
  /** The confirmed selection for pro + 3 extra seats on the EXISTING seat item. */
  const existingSeat = {
    targetPlanId: "pro" as const,
    targetSeatQuantity: 3,
    baseItemId: "si_base",
    basePriceId: PRICE_IDS.proBase,
    seatItemId: "si_seat",
    seatPriceId: PRICE_IDS.proSeat,
  };
  /** The same selection for a seat item being ADDED, which has no id yet. */
  const newSeat = { ...existingSeat, seatItemId: null };
  /** The selection that REMOVES the seat item entirely. */
  const removedSeat = {
    targetPlanId: "pro" as const,
    targetSeatQuantity: 0,
    baseItemId: "si_base",
    basePriceId: PRICE_IDS.proBase,
    seatItemId: null,
    seatPriceId: null,
  };
  const seatItem = (over: Record<string, unknown> = {}) =>
    subscriptionItem(
      { id: "si_seat", priceId: PRICE_IDS.proSeat, productId: PRODUCT_IDS.pro, quantity: 3 },
      NOW_S,
      over,
    );
  const baseItem = (over: Record<string, unknown> = {}) =>
    subscriptionItem(
      { id: "si_base", priceId: PRICE_IDS.proBase, productId: PRODUCT_IDS.pro, quantity: 1 },
      NOW_S,
      over,
    );
  const withItems = (items: unknown[], over: Record<string, unknown> = {}) =>
    growthSubscription(NOW_S, { items: { object: "list", has_more: false, data: items }, ...over });

  it("accepts the three supported outcomes, and ONLY on exact items", () => {
    // An existing seat item, matched on id, price and quantity.
    expect(
      appliedSelectionMatches({
        snapshot: snapshotOf(withItems([baseItem(), seatItem()])),
        selection: existingSeat,
      }),
    ).toEqual({ ok: true });
    // A NEWLY ADDED seat item: its provider-assigned id cannot be predicted, so
    // only its price, quantity and single cardinality are pinned.
    expect(
      appliedSelectionMatches({
        snapshot: snapshotOf(withItems([baseItem(), seatItem({ id: "si_brandnew" })])),
        selection: newSeat,
      }),
    ).toEqual({ ok: true });
    // A REMOVAL is proved only by the seat item really being gone.
    expect(
      appliedSelectionMatches({
        snapshot: snapshotOf(withItems([baseItem()])),
        selection: removedSeat,
      }),
    ).toEqual({ ok: true });
  });

  type Selection = Parameters<typeof appliedSelectionMatches>[0]["selection"];
  it.each<[string, unknown[], Selection, string]>([
    // EXISTING seat: every field is pinned.
    [
      "the existing seat item is a DIFFERENT item",
      [baseItem(), seatItem({ id: "si_other" })],
      existingSeat,
      "seat_item",
    ],
    [
      "the existing seat item is at a DIFFERENT price",
      [
        baseItem(),
        subscriptionItem(
          { id: "si_seat", priceId: PRICE_IDS.growthSeat, productId: PRODUCT_IDS.pro, quantity: 3 },
          NOW_S,
        ),
      ],
      existingSeat,
      "seat_price",
    ],
    [
      "the existing seat item has a DIFFERENT quantity",
      [baseItem(), seatItem({ quantity: 2 })],
      existingSeat,
      "seat_quantity",
    ],
    // REMOVAL: the seat must be gone.
    ["a removed seat item is still present", [baseItem(), seatItem()], removedSeat, "seat_present"],
    // ADDITION: present, single, and at the quoted terms.
    ["an added seat item is MISSING", [baseItem()], newSeat, "seat_missing"],
    [
      "an added seat item is at the WRONG price",
      [
        baseItem(),
        subscriptionItem(
          {
            id: "si_brandnew",
            priceId: PRICE_IDS.growthSeat,
            productId: PRODUCT_IDS.pro,
            quantity: 3,
          },
          NOW_S,
        ),
      ],
      newSeat,
      "seat_price",
    ],
    [
      "an added seat item has the WRONG quantity",
      [baseItem(), seatItem({ id: "si_brandnew", quantity: 4 })],
      newSeat,
      "seat_quantity",
    ],
    // THE BASE ITEM is pinned the same way.
    [
      "the base item was replaced",
      [baseItem({ id: "si_replaced" }), seatItem()],
      existingSeat,
      "base_item",
    ],
    [
      "the base item moved to another price",
      [
        subscriptionItem(
          { id: "si_base", priceId: PRICE_IDS.growthBase, productId: PRODUCT_IDS.pro, quantity: 1 },
          NOW_S,
        ),
        seatItem(),
      ],
      existingSeat,
      "base_price",
    ],
    [
      "the base item carries a quantity other than one",
      [baseItem({ quantity: 2 }), seatItem()],
      existingSeat,
      "base_quantity",
    ],
  ])("refuses to call the change applied when %s", (_label, items, selection, reason) => {
    expect(appliedSelectionMatches({ snapshot: snapshotOf(withItems(items)), selection })).toEqual({
      ok: false,
      reason,
    });
  });

  it("refuses a pending update, and a second seat item that would double-bill", () => {
    // Anything pending means the provider has applied nothing yet.
    expect(
      appliedSelectionMatches({
        snapshot: snapshotOf(withItems([baseItem(), seatItem()], { pending_update: {} })),
        selection: existingSeat,
      }),
    ).toEqual({ ok: false, reason: "pending_update" });
    // Two seat items is a cardinality failure in its own right. The reader caps
    // a subscription at two items, so this is asserted against a snapshot built
    // from a three-item list — which the READER refuses outright.
    const three = readCommercialSubscriptionSnapshot({
      raw: withItems([baseItem(), seatItem(), seatItem({ id: "si_seat2" })]),
      mode: "test",
      customerId: COMMERCIAL_CUSTOMER,
    });
    expect(three).toEqual({ ok: false, reason: "items_unexpected_count" });
    // And the matcher itself refuses a two-seat snapshot if one is ever built.
    expect(
      appliedSelectionMatches({
        snapshot: {
          ...snapshotOf(withItems([baseItem(), seatItem()])),
          items: [
            {
              itemId: "si_base",
              priceId: PRICE_IDS.proBase,
              quantity: 1,
              currentPeriodStart: NOW_S - 10,
              currentPeriodEnd: NOW_S + 10,
            },
            {
              itemId: "si_seat",
              priceId: PRICE_IDS.proSeat,
              quantity: 3,
              currentPeriodStart: NOW_S - 10,
              currentPeriodEnd: NOW_S + 10,
            },
            {
              itemId: "si_seat2",
              priceId: PRICE_IDS.proSeat,
              quantity: 3,
              currentPeriodStart: NOW_S - 10,
              currentPeriodEnd: NOW_S + 10,
            },
          ],
        },
        selection: existingSeat,
      }),
    ).toEqual({ ok: false, reason: "seat_duplicate" });
  });
});

describe("direction and capacity", () => {
  it("classifies increases, decreases, no-ops and mixed changes", () => {
    const at = (plan: "growth" | "pro", seats: number) => ({
      currentPlanId: plan,
      currentSeatQuantity: seats,
    });
    expect(classifyChange({ ...at("growth", 0), targetPlanId: "pro", targetSeatQuantity: 0 })).toBe(
      "increase",
    );
    expect(
      classifyChange({ ...at("growth", 0), targetPlanId: "growth", targetSeatQuantity: 2 }),
    ).toBe("increase");
    expect(classifyChange({ ...at("pro", 3), targetPlanId: "growth", targetSeatQuantity: 0 })).toBe(
      "decrease",
    );
    expect(classifyChange({ ...at("pro", 3), targetPlanId: "pro", targetSeatQuantity: 3 })).toBe(
      "unchanged",
    );
    // A plan increase with a seat decrease needs two effective dates.
    expect(classifyChange({ ...at("growth", 4), targetPlanId: "pro", targetSeatQuantity: 1 })).toBe(
      "mixed",
    );
    expect(classifyChange({ ...at("pro", 0), targetPlanId: "growth", targetSeatQuantity: 5 })).toBe(
      "mixed",
    );
  });

  it("holds a reduction that would not fit the current team, and an unknown count", () => {
    const usage = (workingSeats: number, viewerSeats: number, known = true) => ({
      workingSeats,
      viewerSeats,
      known,
      projects: 0,
      projectsKnown: true,
    });
    const growthProjects = PLAN_LIMITS.growth.maxProjects;
    // Growth bundles 3 working and 5 viewer seats.
    expect(
      checkTargetCapacity({ targetPlanId: "growth", targetSeatQuantity: 0, usage: usage(3, 5) }),
    ).toEqual({
      ok: true,
      workingAllowance: 3,
      viewerAllowance: 5,
      projectAllowance: growthProjects,
    });
    expect(
      checkTargetCapacity({ targetPlanId: "growth", targetSeatQuantity: 0, usage: usage(4, 1) }),
    ).toMatchObject({ ok: false, reason: "capacity_conflict_working" });
    expect(
      checkTargetCapacity({ targetPlanId: "growth", targetSeatQuantity: 0, usage: usage(1, 6) }),
    ).toMatchObject({ ok: false, reason: "capacity_conflict_viewer" });
    // Purchased seats count toward the working allowance.
    expect(
      checkTargetCapacity({ targetPlanId: "growth", targetSeatQuantity: 2, usage: usage(5, 1) }),
    ).toEqual({
      ok: true,
      workingAllowance: 5,
      viewerAllowance: 5,
      projectAllowance: growthProjects,
    });
    // An unreadable membership count is never "nobody is affected".
    expect(
      checkTargetCapacity({
        targetPlanId: "agency",
        targetSeatQuantity: 0,
        usage: usage(0, 0, false),
      }),
    ).toMatchObject({ ok: false, reason: "capacity_unknown" });
  });

  it("holds a reduction whose SEATS fit but whose PROJECTS overflow, and an unknown project count", () => {
    // A plan is all three bundles. The released seat counter does not express
    // the project bundle at all, which is why this case was invisible.
    const seatsFit = { workingSeats: 1, viewerSeats: 1, known: true };
    expect(
      checkTargetCapacity({
        targetPlanId: "starter",
        targetSeatQuantity: 0,
        usage: { ...seatsFit, projects: PLAN_LIMITS.starter.maxProjects + 1, projectsKnown: true },
      }),
    ).toEqual({
      ok: false,
      reason: "capacity_conflict_projects",
      workingAllowance: PLAN_SEATS.starter.workingSeats,
      viewerAllowance: PLAN_SEATS.starter.viewerSeats,
      projectAllowance: PLAN_LIMITS.starter.maxProjects,
    });
    // Exactly at the allowance is not an overflow.
    expect(
      checkTargetCapacity({
        targetPlanId: "starter",
        targetSeatQuantity: 0,
        usage: { ...seatsFit, projects: PLAN_LIMITS.starter.maxProjects, projectsKnown: true },
      }).ok,
    ).toBe(true);
    // The project half is a SEPARATE unknown: readable seats, unreadable
    // projects. No workspace_meta row means unknown usage, never zero.
    expect(
      checkTargetCapacity({
        targetPlanId: "starter",
        targetSeatQuantity: 0,
        usage: { ...seatsFit, projects: 0, projectsKnown: false },
      }),
    ).toMatchObject({ ok: false, reason: "capacity_projects_unknown" });
  });
});

describe("provider previews: charged now versus the recurring estimate", () => {
  const args = {
    mode: "test" as const,
    customerId: COMMERCIAL_CUSTOMER,
    subscriptionId: COMMERCIAL_SUBSCRIPTION,
    currency: "eur",
    prorationDate: NOW_S,
  };
  const immediate = (over: Record<string, unknown> = {}) =>
    prorationPreview(
      { prorationDate: NOW_S, amountDue: 12_300, creditMinor: -5_000, chargeMinor: 18_000 },
      over,
    );

  it("reads the provider-calculated IMMEDIATE amount from realistic proration lines", () => {
    // `amount_due`, `subtotal` and `total` are three different figures here, and
    // only `amount_due` is what the customer pays now.
    const raw = immediate();
    expect(raw.amount_due).toBe(12_300);
    expect(raw.subtotal).toBe(13_000);
    expect(raw.total).toBe(13_000);
    expect(readProrationPreview({ ...args, raw })).toEqual({
      ok: true,
      value: {
        amountDueMinor: 12_300,
        currency: "eur",
        prorationDate: NOW_S,
        prorationLines: 2,
      },
    });
  });

  it("accepts both documented proration shapes and refuses an unclassifiable line", () => {
    // The newer `parent.subscription_item_details.proration` contract is used by
    // the second line of the fixture above; a line expressing NEITHER shape is
    // not classified by guesswork.
    const mixed = immediate({
      lines: {
        object: "list",
        has_more: false,
        data: [{ id: "il_x", amount: 1, period: { start: NOW_S, end: NOW_S + 1 } }],
      },
    });
    expect(readProrationPreview({ ...args, raw: mixed })).toEqual({
      ok: false,
      reason: "preview_line_proration_unknown",
    });
    // A RENEWAL line mixed into the immediate figure is held, not apportioned:
    // no documented field separates "charged now" from "charged at renewal"
    // inside one `amount_due`.
    const renewal = immediate({
      lines: {
        object: "list",
        has_more: false,
        data: [
          {
            id: "il_renewal",
            amount: 29_900,
            proration: false,
            period: { start: NOW_S, end: NOW_S + 30 * 86_400 },
          },
        ],
      },
    });
    expect(readProrationPreview({ ...args, raw: renewal })).toEqual({
      ok: false,
      reason: "preview_renewal_lines_present",
    });
  });

  it("B-F1 — a line whose two proration fields CONTRADICT each other is held", () => {
    // Stripe's legacy `line.proration` and the current
    // `line.parent.subscription_item_details.proration` describe the SAME fact.
    // When they disagree the line is not classified: taking either one on its
    // own put a genuinely prorated line into a "recurring" estimate, or
    // apportioned a renewal line into the immediate `amount_due`.
    const contradiction = (legacy: boolean) => ({
      id: "il_conflict",
      amount: 18_000,
      proration: legacy,
      period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
      parent: {
        type: "subscription_item_details",
        subscription_item_details: { proration: !legacy },
      },
    });
    const sharedRecurring = {
      mode: "test" as const,
      customerId: COMMERCIAL_CUSTOMER,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      currency: "eur",
    };
    // BOTH directions of the contradiction, in BOTH readers.
    for (const legacy of [true, false]) {
      const lines = { object: "list", has_more: false, data: [contradiction(legacy)] };
      expect(readProrationPreview({ ...args, raw: immediate({ lines }) })).toEqual({
        ok: false,
        reason: "preview_line_proration_conflict",
      });
      expect(
        readRecurringPreview({
          ...sharedRecurring,
          raw: recurringPreview({ subtotalMinor: 29_900, totalMinor: 29_900 }, { lines }),
        }),
      ).toEqual({ ok: false, reason: "preview_line_proration_conflict" });
    }
    // AGREEMENT is still read, from either field alone or from both together.
    const agreeing = (value: boolean) => ({
      id: "il_agree",
      amount: 18_000,
      proration: value,
      period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
      parent: {
        type: "subscription_item_details",
        subscription_item_details: { proration: value },
      },
    });
    expect(
      readProrationPreview({
        ...args,
        raw: immediate({
          lines: { object: "list", has_more: false, data: [agreeing(true)] },
          amount_due: 18_000,
        }),
      }),
    ).toEqual({
      ok: true,
      value: {
        amountDueMinor: 18_000,
        currency: "eur",
        prorationDate: NOW_S,
        prorationLines: 1,
      },
    });
    expect(
      readRecurringPreview({
        ...sharedRecurring,
        raw: recurringPreview(
          { subtotalMinor: 18_000, totalMinor: 18_000 },
          { lines: { object: "list", has_more: false, data: [agreeing(false)] } },
        ),
      }),
    ).toEqual({
      ok: true,
      value: { estimateMinor: 18_000, currency: "eur", includesInvoiceAdjustments: false },
    });
    // A single marker is believed only when the OTHER property is GENUINELY
    // ABSENT — not stated as null, which is a present value that is not the
    // required boolean.
    expect(
      readProrationPreview({
        ...args,
        raw: immediate({
          amount_due: 18_000,
          lines: {
            object: "list",
            has_more: false,
            data: [
              {
                id: "il_legacy_only",
                amount: 18_000,
                proration: true,
                period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
                parent: {
                  type: "subscription_item_details",
                  // The marker property is not present at all.
                  subscription_item_details: {},
                },
              },
            ],
          },
        }),
      }).ok,
    ).toBe(true);
    // The same with no `parent` key whatsoever, and with the nested marker as
    // the only one present.
    expect(
      readProrationPreview({
        ...args,
        raw: immediate({
          amount_due: 18_000,
          lines: {
            object: "list",
            has_more: false,
            data: [
              {
                id: "il_no_parent",
                amount: 18_000,
                proration: true,
                period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
              },
            ],
          },
        }),
      }).ok,
    ).toBe(true);
    expect(
      readProrationPreview({
        ...args,
        raw: immediate({
          amount_due: 18_000,
          lines: {
            object: "list",
            has_more: false,
            data: [
              {
                id: "il_nested_only",
                amount: 18_000,
                period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
                parent: {
                  type: "subscription_item_details",
                  subscription_item_details: { proration: true },
                },
              },
            ],
          },
        }),
      }).ok,
    ).toBe(true);
  });

  it("B-F1 — a PRESENT but unreadable proration marker is held, not ignored", () => {
    // Absence and unreadability are different facts. Accepting one marker alone
    // is only sound when the other is genuinely ABSENT; a present non-boolean
    // cannot be compared, so believing the readable one let `true` + nested
    // `"false"` be charged now and `"true"` + nested `false` be accepted as a
    // recurring estimate.
    const unreadable: [string, Record<string, unknown>][] = [
      [
        "a boolean legacy marker against a STRING nested one",
        { proration: true, parent: { subscription_item_details: { proration: "false" } } },
      ],
      [
        "a STRING legacy marker against a boolean nested one",
        { proration: "true", parent: { subscription_item_details: { proration: false } } },
      ],
      ["a STRING legacy marker with no nested form at all", { proration: "true" }],
      [
        "a NUMBER nested marker with no legacy form",
        { parent: { subscription_item_details: { proration: 1 } } },
      ],
      // A PRESENT null is a stated value that is not the required boolean, in
      // either position — never an alternative spelling of absence.
      [
        "a boolean legacy marker against a NULL nested one",
        { proration: true, parent: { subscription_item_details: { proration: null } } },
      ],
      [
        "a NULL legacy marker against a boolean nested one",
        { proration: null, parent: { subscription_item_details: { proration: false } } },
      ],
      ["a NULL legacy marker with no nested form at all", { proration: null }],
      [
        "a NULL nested marker with no legacy form",
        { parent: { subscription_item_details: { proration: null } } },
      ],
      [
        "a nested container that is not an object",
        { proration: true, parent: { subscription_item_details: "proration" } },
      ],
    ];
    for (const [label, markers] of unreadable) {
      const line = {
        id: "il_unreadable",
        amount: 18_000,
        period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
        ...markers,
      };
      const lines = { object: "list", has_more: false, data: [line] };
      expect(
        readProrationPreview({ ...args, raw: immediate({ lines, amount_due: 18_000 }) }),
        label,
      ).toEqual({ ok: false, reason: "preview_line_proration_unreadable" });
      expect(
        readRecurringPreview({
          mode: "test",
          customerId: COMMERCIAL_CUSTOMER,
          subscriptionId: COMMERCIAL_SUBSCRIPTION,
          currency: "eur",
          raw: recurringPreview({ subtotalMinor: 18_000, totalMinor: 18_000 }, { lines }),
        }),
        label,
      ).toEqual({ ok: false, reason: "preview_line_proration_unreadable" });
    }
  });

  it.each([
    ["an unreadable preview", null, "preview_unreadable"],
    ["the wrong mode", immediate({ livemode: true }), "preview_mode"],
    ["another customer", immediate({ customer: "cus_other" }), "preview_customer"],
    ["another currency", immediate({ currency: "pln" }), "preview_currency_mismatch"],
    [
      "another subscription",
      immediate({
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_test_x" },
        },
      }),
      "preview_subscription",
    ],
    [
      "a paginated line list",
      immediate({ lines: { object: "list", has_more: true, data: [] } }),
      "preview_lines_incomplete",
    ],
    ["a missing amount", immediate({ amount_due: undefined }), "preview_amount_unreadable"],
    [
      "proration lines on another date",
      prorationPreview({
        prorationDate: NOW_S - 5_000,
        amountDue: 1,
        creditMinor: -1,
        chargeMinor: 2,
      }),
      "preview_proration_date_mismatch",
    ],
  ])("refuses %s", (_label, raw, reason) => {
    const result = readProrationPreview({ ...args, raw });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("reads the recurring estimate from `total`, NOT from `subtotal`", () => {
    // The Invoice object defines `subtotal` as the line sum BEFORE
    // invoice-level discounts and exclusive tax, so a discounted or taxed
    // period makes the two differ — and `total` is what the customer is billed.
    const raw = recurringPreview({ subtotalMinor: 29_900, totalMinor: 26_910 });
    expect(
      readRecurringPreview({
        raw,
        mode: "test",
        customerId: COMMERCIAL_CUSTOMER,
        subscriptionId: COMMERCIAL_SUBSCRIPTION,
        currency: "eur",
      }),
    ).toEqual({
      ok: true,
      value: { estimateMinor: 26_910, currency: "eur", includesInvoiceAdjustments: true },
    });
    // Equal figures mean there is nothing unitemised to flag.
    const plain = recurringPreview({ subtotalMinor: 29_900, totalMinor: 29_900 });
    expect(
      readRecurringPreview({
        raw: plain,
        mode: "test",
        customerId: COMMERCIAL_CUSTOMER,
        subscriptionId: COMMERCIAL_SUBSCRIPTION,
        currency: "eur",
      }),
    ).toEqual({
      ok: true,
      value: { estimateMinor: 29_900, currency: "eur", includesInvoiceAdjustments: false },
    });
  });

  it("refuses a 'recurring' preview that carries prorations, or an unreadable one", () => {
    const shared = {
      mode: "test" as const,
      customerId: COMMERCIAL_CUSTOMER,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      currency: "eur",
    };
    expect(readRecurringPreview({ ...shared, raw: immediate() })).toEqual({
      ok: false,
      reason: "preview_recurring_has_proration",
    });
    expect(
      readRecurringPreview({
        ...shared,
        raw: recurringPreview({ subtotalMinor: 1, totalMinor: 1 }, { total: undefined }),
      }),
    ).toEqual({ ok: false, reason: "preview_recurring_unreadable" });
    expect(
      readRecurringPreview({
        ...shared,
        raw: recurringPreview(
          { subtotalMinor: 1, totalMinor: 1 },
          { lines: { object: "list", has_more: false, data: [] } },
        ),
      }),
    ).toEqual({ ok: false, reason: "preview_recurring_no_lines" });
    expect(
      readRecurringPreview({
        ...shared,
        raw: recurringPreview({ subtotalMinor: 1, totalMinor: 1 }, { customer: "cus_other" }),
      }).ok,
    ).toBe(false);
  });
});

describe("schedule verification against the stored original terms", () => {
  const scheduleArgs = {
    mode: "test" as const,
    subscriptionId: COMMERCIAL_SUBSCRIPTION,
    customerId: COMMERCIAL_CUSTOMER,
  };
  const periodEnd = NOW_S + 20 * 86_400;
  const periodStart = NOW_S - 10 * 86_400;
  const current = [
    { priceId: PRICE_IDS.proBase, quantity: 1 },
    { priceId: PRICE_IDS.proSeat, quantity: 3 },
  ];
  const next = [{ priceId: PRICE_IDS.growthBase, quantity: 1 }];
  const selection = {
    targetPlanId: "growth" as const,
    targetSeatQuantity: 0,
    baseItemId: "si_base",
    basePriceId: PRICE_IDS.growthBase,
    seatItemId: "si_seat",
    seatPriceId: null,
  };

  /** The durable payload a dispatched reduction would have captured, built from
   * the real adoption reply through the real builder. */
  const storedPayload = (over: { phaseOver?: Record<string, unknown> } = {}) => {
    const adoption = readAdoptedScheduleProfile({
      ...scheduleArgs,
      currency: "eur",
      raw: adoptedSchedule({ periodStart, periodEnd, items: current, ...over }),
    });
    if (!adoption.ok) throw new Error(`fixture adoption: ${adoption.reason}`);
    const built = buildReductionPayload({
      operationId: OPERATION,
      quoteId: QUOTE,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selection,
      selectionDetail: selectionFingerprintInput(selection),
      effectiveBoundary: periodEnd,
      adoption: adoption.value,
    });
    if (!built.ok) throw new Error(`fixture payload: ${built.reason}`);
    return built.payload;
  };

  const verify = (
    over: Record<string, unknown> = {},
    payload = storedPayload(),
    phaseOver?: Record<string, unknown>,
  ) => {
    const schedule = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: reductionSchedule(
        {
          nowSeconds: NOW_S,
          currentItems: current,
          nextItems: next,
          periodEnd,
          periodStart,
          phaseOver,
        },
        over,
      ),
    });
    if (!schedule.ok) return { ok: false as const, reason: `read_${schedule.reason}` };
    return scheduleMatchesReduction({ schedule: schedule.value, payload });
  };

  it("accepts a schedule that preserves the paid phase and carries the reduced one", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("REJECTS a changed CURRENT phase price or quantity, which a future-only check could not see", () => {
    // The exact defect: the paid period's own items were never compared.
    expect(verify({}, storedPayload(), undefined) && undefined).toBeUndefined();
    const wrongQuantity = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: reductionSchedule({
        nowSeconds: NOW_S,
        currentItems: [
          { priceId: PRICE_IDS.proBase, quantity: 1 },
          { priceId: PRICE_IDS.proSeat, quantity: 999 },
        ],
        nextItems: next,
        periodEnd,
        periodStart,
      }),
    });
    expect(wrongQuantity.ok).toBe(true);
    if (!wrongQuantity.ok) return;
    expect(
      scheduleMatchesReduction({ schedule: wrongQuantity.value, payload: storedPayload() }),
    ).toEqual({ ok: false, reason: "phase0_items_unexpected" });

    const wrongPrice = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: reductionSchedule({
        nowSeconds: NOW_S,
        currentItems: [
          { priceId: "price_WRONG_CURRENT", quantity: 1 },
          { priceId: PRICE_IDS.proSeat, quantity: 3 },
        ],
        nextItems: next,
        periodEnd,
        periodStart,
      }),
    });
    expect(wrongPrice.ok).toBe(true);
    if (!wrongPrice.ok) return;
    expect(
      scheduleMatchesReduction({ schedule: wrongPrice.value, payload: storedPayload() }),
    ).toEqual({ ok: false, reason: "phase0_items_unexpected" });
  });

  it("REJECTS changed material settings on either phase and changed schedule defaults", () => {
    // A phase update replaces the phases it is given, so a dropped or altered
    // payment/collection/tax arrangement is exactly what must be caught.
    expect(verify({}, storedPayload(), { collection_method: "charge_automatically" })).toEqual({
      ok: false,
      reason: "phase0_settings_changed",
    });
    expect(verify({}, storedPayload(), { default_payment_method: "pm_other" })).toEqual({
      ok: false,
      reason: "phase0_settings_changed",
    });
    // An enabled tax, a trial or a non-empty item tax rate is not "different":
    // it is outside the supported profile, so it HOLDS with its own reason.
    expect(verify({}, storedPayload(), { trial_end: 123 })).toEqual({
      ok: false,
      reason: "phase0_phase_unsupported_trial_end",
    });
    expect(verify({}, storedPayload(), { default_tax_rates: ["txr_1"] })).toEqual({
      ok: false,
      reason: "phase0_phase_unsupported_default_tax_rates",
    });
    expect(
      verify({ default_settings: scheduleDefaultSettings({ default_payment_method: "pm_moved" }) }),
    ).toEqual({ ok: false, reason: "default_settings_changed" });
  });

  it("refuses a schedule that cancels, moves the boundary, prorates or is foreign", () => {
    // `cancel` after the final phase would end a subscription nobody cancelled.
    expect(verify({ end_behavior: "cancel" })).toEqual({
      ok: false,
      reason: "end_behavior_unexpected",
    });
    expect(verify({ status: "released" })).toEqual({ ok: false, reason: "status_unexpected" });
    // A single phase is the ADOPTED shape, not the reduction.
    const adopted = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: adoptedSchedule({ periodStart, periodEnd, items: current }),
    });
    expect(adopted.ok).toBe(true);
    if (adopted.ok)
      expect(
        scheduleMatchesReduction({ schedule: adopted.value, payload: storedPayload() }),
      ).toEqual({ ok: false, reason: "phase_count" });
    // An earlier boundary would reduce the plan inside a period already paid for.
    const early = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: reductionSchedule({
        nowSeconds: NOW_S,
        currentItems: current,
        nextItems: next,
        periodEnd: NOW_S + 86_400,
        periodStart,
      }),
    });
    expect(early.ok).toBe(true);
    if (early.ok)
      expect(scheduleMatchesReduction({ schedule: early.value, payload: storedPayload() })).toEqual(
        { ok: false, reason: "phase0_end_unexpected" },
      );
    // A proration behaviour on either phase would charge or credit.
    const prorated = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: reductionSchedule(
        { nowSeconds: NOW_S, currentItems: current, nextItems: next, periodEnd, periodStart },
        {
          phases: [
            {
              ...schedulePhaseSettings(),
              start_date: periodStart,
              end_date: periodEnd,
              proration_behavior: "create_prorations",
              items: current.map((i) => schedulePhaseItem(i)),
            },
            {
              ...schedulePhaseSettings(),
              start_date: periodEnd,
              end_date: null,
              proration_behavior: "none",
              items: next.map((i) => schedulePhaseItem(i)),
            },
          ],
        },
      ),
    });
    expect(prorated.ok).toBe(true);
    if (prorated.ok)
      expect(
        scheduleMatchesReduction({ schedule: prorated.value, payload: storedPayload() }),
      ).toEqual({ ok: false, reason: "phase0_proration_unexpected" });
    // A FOREIGN schedule is refused at the read, never overwritten.
    expect(verify({ subscription: "sub_test_other" }).ok).toBe(false);
    expect(verify({ livemode: true }).ok).toBe(false);
    expect(verify({ customer: "cus_other" }).ok).toBe(false);
    expect(verify({ id: "sub_sched_FOREIGN" })).toEqual({
      ok: false,
      reason: "identity_unexpected",
    });
  });

  it("rejects a reduced phase that is not what the original selection implies", () => {
    const wrongTarget = readSubscriptionSchedule({
      ...scheduleArgs,
      raw: reductionSchedule({
        nowSeconds: NOW_S,
        currentItems: current,
        nextItems: [{ priceId: PRICE_IDS.proBase, quantity: 1 }],
        periodEnd,
        periodStart,
      }),
    });
    expect(wrongTarget.ok).toBe(true);
    if (!wrongTarget.ok) return;
    expect(
      scheduleMatchesReduction({ schedule: wrongTarget.value, payload: storedPayload() }),
    ).toEqual({ ok: false, reason: "phase1_items_unexpected" });
  });
});

describe("the ORIGINAL adoption reply and the durable reduction payload", () => {
  const periodEnd = NOW_S + 20 * 86_400;
  const periodStart = NOW_S - 10 * 86_400;
  const items = [
    { priceId: PRICE_IDS.proBase, quantity: 1 },
    { priceId: PRICE_IDS.proSeat, quantity: 3 },
  ];
  const selection = {
    targetPlanId: "growth" as const,
    targetSeatQuantity: 0,
    baseItemId: "si_base",
    basePriceId: PRICE_IDS.growthBase,
    seatItemId: "si_seat",
    seatPriceId: null,
  };
  const detail = selectionFingerprintInput(selection);
  const read = (over: Parameters<typeof adoptedSchedule>[0] | null = null, raw?: unknown) =>
    readAdoptedScheduleProfile({
      raw: raw ?? adoptedSchedule(over ?? { periodStart, periodEnd, items }),
      mode: "test",
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      customerId: COMMERCIAL_CUSTOMER,
      currency: "eur",
    });

  it("maps the ORDINARY documented reply field-for-field — this profile must WORK", () => {
    const adoption = read();
    expect(adoption.ok).toBe(true);
    if (!adoption.ok) return;
    // The ordinary response's `automatic` default anchor and `self` issuer are
    // RETAINED, not replaced by fabricated nulls; the phase's inherited
    // (null) collection method stays inherited; the legacy item `plan` mirror is
    // normalised away only because it agrees with `price`.
    expect(adoption.value.expectedSettings).toEqual({
      profile: "automaticChargeNoTaxNoDiscount",
      defaultSettings: {
        application_fee_percent: null,
        automatic_tax: false,
        billing_cycle_anchor: "automatic",
        collection_method: "charge_automatically",
        default_payment_method: null,
        default_source: null,
        description: null,
        invoice_settings: { issuer: { type: "self" } },
        on_behalf_of: null,
        transfer_data: null,
      },
      paidPhase: {
        add_invoice_items: [],
        application_fee_percent: null,
        billing_cycle_anchor: null,
        collection_method: null,
        currency: "eur",
        default_payment_method: null,
        default_tax_rates: [],
        description: null,
        invoice_settings: null,
        metadata: {},
        on_behalf_of: null,
        transfer_data: null,
        trial_end: null,
      },
      paidItems: [
        { price: PRICE_IDS.proBase, quantity: 1, metadata: {}, tax_rates: [] },
        { price: PRICE_IDS.proSeat, quantity: 3, metadata: {}, tax_rates: [] },
      ],
    });
    expect(adoption.value.paidPhaseStart).toBe(periodStart);
  });

  it("builds a canonical payload inside the 4096-byte bound, with both phases explicit", () => {
    const adoption = read();
    if (!adoption.ok) throw new Error(adoption.reason);
    const built = buildReductionPayload({
      operationId: OPERATION,
      quoteId: QUOTE,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selection,
      selectionDetail: detail,
      effectiveBoundary: periodEnd,
      adoption: adoption.value,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(canonicalJson(built.payload).length).toBeLessThanOrEqual(4096);
    expect(built.payload.request).toEqual({
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          start_date: periodStart,
          end_date: periodEnd,
          proration_behavior: "none",
          items: [
            { price: PRICE_IDS.proBase, quantity: 1 },
            { price: PRICE_IDS.proSeat, quantity: 3 },
          ],
        },
        {
          start_date: periodEnd,
          proration_behavior: "none",
          items: [{ price: PRICE_IDS.growthBase, quantity: 1 }],
        },
      ],
    });
    // The reduced phase carries NO end_date: it is open-ended, and `release`
    // hands the subscription back still running.
    expect("end_date" in built.payload.request.phases[1]).toBe(false);
    // A stored document round-trips and is re-proved against this operation.
    const parsed = parseStoredReductionPayload({
      stored: JSON.parse(JSON.stringify(built.payload)),
      operationId: OPERATION,
      quoteId: QUOTE,
      scheduleId: "sub_sched_1",
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selectionDetail: detail,
      effectiveBoundary: periodEnd,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(reductionPayloadEqual(parsed.payload, built.payload)).toBe(true);
  });

  it("restates an EXPLICIT phase payment and collection method in BOTH phases", () => {
    const adoption = read({
      periodStart,
      periodEnd,
      items,
      phaseOver: {
        collection_method: "charge_automatically",
        default_payment_method: "pm_card_1",
      },
    });
    if (!adoption.ok) throw new Error(adoption.reason);
    const built = buildReductionPayload({
      operationId: OPERATION,
      quoteId: QUOTE,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selection,
      selectionDetail: detail,
      effectiveBoundary: periodEnd,
      adoption: adoption.value,
    });
    if (!built.ok) throw new Error(built.reason);
    for (const phase of built.payload.request.phases) {
      expect(phase.collection_method).toBe("charge_automatically");
      expect(phase.default_payment_method).toBe("pm_card_1");
    }
  });

  it("HOLDS a known unsupported setting rather than deleting it for compatibility", () => {
    const held = (
      over: Record<string, unknown>,
      where: "phase" | "defaults" | "item" = "phase",
    ) => {
      const base = { periodStart, periodEnd, items };
      const raw =
        where === "item"
          ? adoptedSchedule(base, {
              phases: [
                {
                  ...schedulePhaseSettings(),
                  start_date: periodStart,
                  end_date: periodEnd,
                  proration_behavior: "create_prorations",
                  items: [schedulePhaseItem(items[0], over)],
                },
              ],
            })
          : adoptedSchedule(
              where === "phase" ? { ...base, phaseOver: over } : { ...base, defaultsOver: over },
            );
      const result = read(null, raw);
      return result.ok ? "accepted" : result.reason;
    };
    expect(held({ trial_end: 1 })).toBe("adoption_phase_unsupported_trial_end");
    expect(held({ default_tax_rates: ["txr_1"] })).toBe(
      "adoption_phase_unsupported_default_tax_rates",
    );
    expect(held({ metadata: { note: "x" } })).toBe("adoption_phase_unsupported_metadata");
    expect(held({ collection_method: "send_invoice" })).toBe(
      "adoption_phase_unsupported_collection_method",
    );
    // A field v1 cannot represent at all is refused where it is PRESENT, even
    // looking inert: deleting it would make the stored document claim to
    // describe an arrangement it cannot express.
    expect(held({ discounts: [] })).toBe("adoption_phase_unsupported_discounts");
    expect(held({ billing_thresholds: null })).toBe(
      "adoption_phase_unsupported_billing_thresholds",
    );
    expect(held({ automatic_tax: { enabled: false } })).toBe(
      "adoption_phase_unsupported_automatic_tax",
    );
    // An ENABLED tax or a non-null liability is never collapsed to `false` by
    // reading one field.
    expect(held({ automatic_tax: { enabled: true, liability: null } }, "defaults")).toBe(
      "adoption_default_settings_unsupported_automatic_tax",
    );
    expect(
      held({ automatic_tax: { enabled: false, liability: { type: "account" } } }, "defaults"),
    ).toBe("adoption_default_settings_unsupported_automatic_tax");
    // A fabricated null anchor or a `phase_start` anchor is NOT the ordinary
    // default and does not pass.
    expect(held({ billing_cycle_anchor: null }, "defaults")).toBe(
      "adoption_default_settings_unsupported_billing_cycle_anchor",
    );
    expect(
      held({ invoice_settings: { issuer: { type: "account", account: "acct_x" } } }, "defaults"),
    ).toBe("adoption_default_settings_unsupported_invoice_settings");
    expect(held({ default_source: "card_legacy" }, "defaults")).toBe(
      "adoption_default_settings_unsupported_default_source",
    );
    // An unknown NEW material setting holds too.
    expect(held({ brand_new_control: true }, "defaults")).toBe(
      "adoption_default_settings_unknown_brand_new_control",
    );
    expect(held({ brand_new_phase_control: true })).toBe(
      "adoption_phase_unknown_brand_new_phase_control",
    );
    // Item-level terms.
    expect(held({ tax_rates: ["txr_1"] }, "item")).toBe(
      "adoption_phase_item_unsupported_tax_rates",
    );
    expect(held({ plan: "price_DISAGREES" }, "item")).toBe("adoption_phase_item_plan_disagrees");
    // An ABSENT required key is MALFORMED, never a convenient neutral value:
    // "the adoption returned nothing we understood" must not be recorded as
    // "there was nothing there".
    const withoutMetadata = (() => {
      const phase = {
        ...schedulePhaseSettings(),
        start_date: periodStart,
        end_date: periodEnd,
        proration_behavior: "create_prorations",
        items: items.map((item) => schedulePhaseItem(item)),
      } as Record<string, unknown>;
      delete phase.metadata;
      return adoptedSchedule({ periodStart, periodEnd, items }, { phases: [phase] });
    })();
    expect(read(null, withoutMetadata)).toEqual({
      ok: false,
      reason: "adoption_phase_absent_metadata",
    });
  });

  it("refuses an adoption whose identity does not match this operation", () => {
    const base = { periodStart, periodEnd, items };
    expect(read(null, adoptedSchedule(base, { subscription: "sub_other" })).ok).toBe(false);
    expect(read(null, adoptedSchedule(base, { customer: "cus_other" })).ok).toBe(false);
    expect(read(null, adoptedSchedule(base, { livemode: true })).ok).toBe(false);
    expect(read(null, adoptedSchedule(base, { end_behavior: "cancel" })).ok).toBe(false);
    // More than one phase is not a fresh adoption.
    expect(
      read(
        null,
        reductionSchedule({
          nowSeconds: NOW_S,
          currentItems: items,
          nextItems: [{ priceId: PRICE_IDS.growthBase, quantity: 1 }],
          periodEnd,
          periodStart,
        }),
      ),
    ).toEqual({ ok: false, reason: "adoption_phase_count" });
    // The paid phase must be in the DURABLE quote's currency.
    expect(
      readAdoptedScheduleProfile({
        raw: adoptedSchedule(base),
        mode: "test",
        subscriptionId: COMMERCIAL_SUBSCRIPTION,
        customerId: COMMERCIAL_CUSTOMER,
        currency: "pln",
      }),
    ).toEqual({ ok: false, reason: "adoption_phase_currency_mismatch" });
  });

  it("rejects a stored payload whose linkage, boundary or target has been altered", () => {
    const adoption = read();
    if (!adoption.ok) throw new Error(adoption.reason);
    const built = buildReductionPayload({
      operationId: OPERATION,
      quoteId: QUOTE,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selection,
      selectionDetail: detail,
      effectiveBoundary: periodEnd,
      adoption: adoption.value,
    });
    if (!built.ok) throw new Error(built.reason);
    const args = {
      operationId: OPERATION,
      quoteId: QUOTE,
      scheduleId: "sub_sched_1",
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selectionDetail: detail,
      effectiveBoundary: periodEnd,
    };
    const tampered = (patch: Record<string, unknown>) =>
      parseStoredReductionPayload({
        ...args,
        stored: { ...JSON.parse(JSON.stringify(built.payload)), ...patch },
      });
    expect(tampered({ v: 2 })).toEqual({ ok: false, reason: "payload_version" });
    expect(tampered({ subscriptionId: "sub_other" })).toEqual({
      ok: false,
      reason: "payload_linkage",
    });
    expect(tampered({ scheduleId: "sub_sched_other" })).toEqual({
      ok: false,
      reason: "payload_schedule_mismatch",
    });
    expect(tampered({ effectiveBoundary: periodEnd + 86_400 })).toEqual({
      ok: false,
      reason: "payload_linkage",
    });
    expect(parseStoredReductionPayload({ ...args, stored: null })).toEqual({
      ok: false,
      reason: "payload_absent",
    });
    // A later boundary cannot be smuggled in through the body either.
    const moved = JSON.parse(JSON.stringify(built.payload));
    moved.request.phases[1].start_date = periodEnd + 86_400;
    expect(parseStoredReductionPayload({ ...args, stored: moved })).toEqual({
      ok: false,
      reason: "payload_boundary_mismatch",
    });
    // Nor a different reduced target.
    const retargeted = JSON.parse(JSON.stringify(built.payload));
    retargeted.request.phases[1].items = [{ price: PRICE_IDS.proBase, quantity: 1 }];
    expect(parseStoredReductionPayload({ ...args, stored: retargeted })).toEqual({
      ok: false,
      reason: "payload_target_items_mismatch",
    });
  });
});

describe("refund evidence", () => {
  it("classifies every documented status and keeps the unknown ones uncertain", () => {
    for (const status of ["pending", "requires_action", "succeeded", "failed", "canceled"])
      expect(classifyRefundStatus(status), status).toBe(status);
    expect(classifyRefundStatus("cancelled")).toBe("canceled");
    for (const status of [null, undefined, "", "weird_new", 7, {}])
      expect(classifyRefundStatus(status), String(status)).toBe("unknown");
  });

  it("releases reserved funds ONLY for an authoritative failure", () => {
    expect(refundReleasesReservation("failed")).toBe(true);
    expect(refundReleasesReservation("canceled")).toBe(true);
    for (const status of ["pending", "requires_action", "succeeded", "unknown"] as const) {
      expect(refundReleasesReservation(status), status).toBe(false);
      expect(refundConsumesFunds(status), status).toBe(true);
    }
  });

  it("verifies a refund by its linked payment and APPROVED CASE, never by an invented livemode field", () => {
    const raw = refundObject();
    expect("livemode" in raw).toBe(false);
    const args = {
      expectedPaymentIntentId: REFUND_PAYMENT_INTENT,
      expectedChargeId: "ch_1",
      expectedCurrency: "eur",
      expectedCaseId: "CASE-1",
    };
    expect(readRefundObject({ raw, ...args })).toEqual({
      ok: true,
      value: {
        id: "re_1",
        amount: APPROVED_MINOR.growthBase,
        currency: "eur",
        status: "succeeded",
        paymentIntentId: REFUND_PAYMENT_INTENT,
        chargeId: "ch_1",
      },
    });
    for (const [label, over, reason] of [
      ["a foreign payment", { payment_intent: "pi_other" }, "refund_payment_link"],
      ["a foreign charge", { charge: "ch_other" }, "refund_charge_link"],
      ["a foreign currency", { currency: "pln" }, "refund_currency"],
      ["a bad id", { id: "ref_1" }, "refund_id"],
      ["a zero amount", { amount: 0 }, "refund_amount"],
      ["the wrong object", { object: "charge" }, "refund_object"],
      // THE CASE BINDING. A well-formed refund for the same payment, currency
      // and amount is still not THIS case's evidence unless it says so.
      ["another case", { metadata: { milo_refund_case: "CASE-OTHER" } }, "refund_case_link"],
      ["no case metadata at all", { metadata: {} }, "refund_case_link"],
      ["unreadable metadata", { metadata: null }, "refund_case_link"],
      ["a case id with padding only", { metadata: { milo_refund_case: " " } }, "refund_case_link"],
    ] as const) {
      const result = readRefundObject({ raw: refundObject(over), ...args });
      expect(result, label).toEqual({ ok: false, reason });
    }
    // An empty expectation can never be satisfied either: the caller must name
    // the case.
    expect(readRefundObject({ raw, ...args, expectedCaseId: "" })).toEqual({
      ok: false,
      reason: "refund_case_link",
    });
  });

  it("resolves exactly one payment whose allocation equals the whole received total", () => {
    expect(
      resolveRefundableAllocation({
        invoicePayments: [invoicePayment()],
        invoiceId: REFUND_INVOICE,
        mode: "test",
        paymentIntent: paymentIntent(),
        customerId: COMMERCIAL_CUSTOMER,
      }),
    ).toEqual({
      ok: true,
      value: {
        invoicePaymentId: "inpay_1",
        paymentIntentId: REFUND_PAYMENT_INTENT,
        allocatedMinor: APPROVED_MINOR.growthBase,
        currency: "eur",
      },
    });
  });

  it("HOLDS a payment that settled more than this invoice, rather than refunding another invoice's funds", () => {
    // The InvoicePayment allocated 14_900 to this invoice, but the PaymentIntent
    // received 29_800: the rest belongs to another invoice.
    expect(
      resolveRefundableAllocation({
        invoicePayments: [invoicePayment()],
        invoiceId: REFUND_INVOICE,
        mode: "test",
        paymentIntent: paymentIntent({ amount_received: 29_800 }),
        customerId: COMMERCIAL_CUSTOMER,
      }),
    ).toEqual({ ok: false, reason: "payment_allocation_ambiguous" });
  });

  it("HOLDS multiple paid InvoicePayments instead of guessing one", () => {
    expect(
      resolveRefundableAllocation({
        invoicePayments: [
          invoicePayment(),
          invoicePayment({
            id: "inpay_2",
            payment: { type: "payment_intent", payment_intent: "pi_second" },
          }),
        ],
        invoiceId: REFUND_INVOICE,
        mode: "test",
        paymentIntent: paymentIntent(),
        customerId: COMMERCIAL_CUSTOMER,
      }),
    ).toEqual({ ok: false, reason: "invoice_payment_ambiguous" });
  });

  it.each([
    [
      "no paid payment",
      { invoicePayments: [invoicePayment({ status: "open" })] },
      "invoice_payment_absent",
    ],
    [
      "a foreign invoice link",
      { invoicePayments: [invoicePayment({ invoice: "in_other" })] },
      "invoice_payment_foreign",
    ],
    [
      "an unsupported payment type",
      { invoicePayments: [invoicePayment({ payment: { type: "out_of_band_payment" } })] },
      "invoice_payment_type_unsupported",
    ],
    ["an unreadable payment intent", { paymentIntent: null }, "payment_intent_unreadable"],
    [
      "a wrong-mode payment intent",
      { paymentIntent: paymentIntent({ livemode: true }) },
      "payment_intent_mode",
    ],
    [
      "a foreign-customer payment intent",
      { paymentIntent: paymentIntent({ customer: "cus_other" }) },
      "payment_intent_customer",
    ],
    [
      "an unsucceeded payment intent",
      { paymentIntent: paymentIntent({ status: "requires_payment_method" }) },
      "payment_intent_not_succeeded",
    ],
  ])("refuses %s", (_label, over, reason) => {
    const result = resolveRefundableAllocation({
      invoicePayments: [invoicePayment()],
      invoiceId: REFUND_INVOICE,
      mode: "test",
      paymentIntent: paymentIntent(),
      customerId: COMMERCIAL_CUSTOMER,
      ...over,
    });
    expect(result).toEqual({ ok: false, reason });
  });

  it("counts pending, requires_action, succeeded AND unknown refunds against the remaining funds", () => {
    const total = committedRefundTotal({
      refunds: [
        refundObject({ id: "re_a", amount: 1_000, status: "succeeded" }),
        refundObject({ id: "re_b", amount: 2_000, status: "pending" }),
        refundObject({ id: "re_c", amount: 3_000, status: "requires_action" }),
        refundObject({ id: "re_d", amount: 4_000, status: "weird_new_status" }),
        refundObject({ id: "re_e", amount: 5_000, status: "failed" }),
        refundObject({ id: "re_f", amount: 6_000, status: "canceled" }),
      ],
      paymentIntentId: REFUND_PAYMENT_INTENT,
      currency: "eur",
    });
    expect(total).toMatchObject({ ok: true, committedMinor: 10_000 });
    // A foreign or unreadable entry makes the whole total untrustworthy.
    expect(
      committedRefundTotal({
        refunds: [refundObject({ payment_intent: "pi_other" })],
        paymentIntentId: REFUND_PAYMENT_INTENT,
        currency: "eur",
      }),
    ).toEqual({ ok: false, reason: "refund_list_foreign" });
    expect(
      committedRefundTotal({
        refunds: [null],
        paymentIntentId: REFUND_PAYMENT_INTENT,
        currency: "eur",
      }),
    ).toEqual({ ok: false, reason: "refund_list_unreadable" });
  });
});

describe("the published refund policy", () => {
  const base = {
    basis: "firstPayment14Day" as const,
    requestedAtMs: NOW_MS,
    firstPaymentAtMs: NOW_MS - 3 * 86_400_000,
    invoiceIsFirstPayment: true,
    amountMinor: APPROVED_MINOR.growthBase,
    allocatedMinor: APPROVED_MINOR.growthBase,
    termsBreached: false,
  };

  it("honours the 14-day full first-payment guarantee", () => {
    expect(evaluateRefundPolicy(base)).toEqual({ ok: true, full: true });
    // Exactly on the boundary is still inside the published promise.
    expect(
      evaluateRefundPolicy({ ...base, firstPaymentAtMs: NOW_MS - FIRST_PAYMENT_REFUND_WINDOW_MS }),
    ).toEqual({ ok: true, full: true });
  });

  it("refuses it outside the window, on a renewal, partially, or after a terms breach", () => {
    expect(
      evaluateRefundPolicy({
        ...base,
        firstPaymentAtMs: NOW_MS - FIRST_PAYMENT_REFUND_WINDOW_MS - 1,
      }),
    ).toEqual({ ok: false, reason: "outside_14_day_window" });
    expect(evaluateRefundPolicy({ ...base, invoiceIsFirstPayment: false })).toEqual({
      ok: false,
      reason: "not_first_payment",
    });
    // The published guarantee is the payment refunded IN FULL.
    expect(evaluateRefundPolicy({ ...base, amountMinor: 5_000 })).toEqual({
      ok: false,
      reason: "guarantee_requires_full_refund",
    });
    expect(evaluateRefundPolicy({ ...base, termsBreached: true })).toEqual({
      ok: false,
      reason: "terms_breach_exception",
    });
    expect(evaluateRefundPolicy({ ...base, firstPaymentAtMs: null })).toEqual({
      ok: false,
      reason: "first_payment_time_unknown",
    });
    expect(evaluateRefundPolicy({ ...base, requestedAtMs: base.firstPaymentAtMs - 1 })).toEqual({
      ok: false,
      reason: "request_precedes_payment",
    });
  });

  it("allows an approved legal or outage exception, partial or full, within the payment", () => {
    expect(
      evaluateRefundPolicy({
        ...base,
        basis: "outage",
        invoiceIsFirstPayment: false,
        amountMinor: 5_000,
      }),
    ).toEqual({ ok: true, full: false });
    expect(
      evaluateRefundPolicy({ ...base, basis: "legalRequired", invoiceIsFirstPayment: false }),
    ).toEqual({ ok: true, full: true });
    // Never more than the funds that payment allocated to this invoice.
    expect(
      evaluateRefundPolicy({
        ...base,
        basis: "outage",
        amountMinor: APPROVED_MINOR.growthBase + 1,
      }),
    ).toEqual({ ok: false, reason: "amount_exceeds_payment" });
  });

  it("never turns the abuse exception into a refund", () => {
    expect(evaluateRefundPolicy({ ...base, basis: "abuseException" })).toEqual({
      ok: false,
      reason: "abuse_exception_refuses_refund",
    });
  });

  it("requires both dispositions and refuses the ones this packet cannot honour", () => {
    expect(
      dispositionSupported({
        subscription: "cancelAtPeriodEndSeparately",
        access: "retainUntilPeriodEnd",
      }),
    ).toEqual({ ok: true });
    expect(dispositionSupported({ subscription: undefined, access: "unchanged" })).toEqual({
      ok: false,
      reason: "subscription_disposition_missing",
    });
    expect(dispositionSupported({ subscription: "retainSubscription", access: "" })).toEqual({
      ok: false,
      reason: "access_disposition_missing",
    });
    expect(
      dispositionSupported({ subscription: "cancelImmediatelyHeld", access: "unchanged" }),
    ).toEqual({ ok: false, reason: "subscription_disposition_held" });
    expect(
      dispositionSupported({ subscription: "retainSubscription", access: "revokeOnRefundHeld" }),
    ).toEqual({ ok: false, reason: "access_disposition_held" });
  });

  it("keeps the published support timings as copy, claiming no execution", () => {
    expect(REFUND_SUPPORT_COPY.responseTime).toContain("2 business days");
    expect(REFUND_SUPPORT_COPY.settlementTime).toContain("5–10 business days");
    expect(REFUND_SUPPORT_COPY.settlementTime).toContain("original payment method");
  });
});

describe("the application half of the projection gate", () => {
  // The threshold is the operation's IMMUTABLE, re-proved baseline — NOT the
  // latest observed `stripe_subscriptions` row, which every accepted
  // projection (including a non-granting one) rewrites.
  const base = {
    openOperationSubscriptionId: COMMERCIAL_SUBSCRIPTION,
    baselineKnown: true,
    baselinePlanId: "growth" as const,
    baselineSeatQuantity: 1,
    baselineSubscriptionId: COMMERCIAL_SUBSCRIPTION,
    projectedSubscriptionId: COMMERCIAL_SUBSCRIPTION,
    projectedPlanId: "growth" as const,
    projectedSeatQuantity: 1,
    projectedGrants: true,
  };
  it("mirrors the SQL wrapper: holds increases, allows equal, decreases and revokes", () => {
    expect(pendingChangeWouldWiden(base)).toBe(false);
    expect(pendingChangeWouldWiden({ ...base, projectedPlanId: "pro" })).toBe(true);
    expect(pendingChangeWouldWiden({ ...base, projectedSeatQuantity: 2 })).toBe(true);
    expect(pendingChangeWouldWiden({ ...base, projectedPlanId: "starter" })).toBe(false);
    expect(pendingChangeWouldWiden({ ...base, projectedSeatQuantity: 0 })).toBe(false);
    // A revoke is never held.
    expect(
      pendingChangeWouldWiden({ ...base, projectedPlanId: "pro", projectedGrants: false }),
    ).toBe(false);
    // No open operation: the gate does not apply and the foundation decides alone.
    expect(
      pendingChangeWouldWiden({
        ...base,
        openOperationSubscriptionId: null,
        projectedPlanId: "pro",
      }),
    ).toBe(false);
    // A baseline for a different subscription, or a projection naming a
    // subscription the pending operation is not about: ambiguous, so held.
    expect(pendingChangeWouldWiden({ ...base, baselineSubscriptionId: null })).toBe(true);
    expect(pendingChangeWouldWiden({ ...base, projectedSubscriptionId: "sub_test_other" })).toBe(
      true,
    );
    expect(
      pendingChangeWouldWiden({ ...base, openOperationSubscriptionId: "sub_test_other" }),
    ).toBe(true);
    // An unrecognised plan is not ranked and cannot be compared.
    expect(
      pendingChangeWouldWiden({
        ...base,
        projectedPlanId: "brandNewPlan" as unknown as typeof base.projectedPlanId,
      }),
    ).toBe(true);
  });

  it("HOLDS every grant when the baseline is UNPROVED, however the observed row looks", () => {
    // `baselineKnown: false` is an explicit hold: not a zero allowance, not a
    // smaller plan to assume, and not a signal to pick fresh prices. This is the
    // poisoning sequence — a non-granting observation of a LARGER plan can no
    // longer raise the bar, because the bar is not the observed row.
    for (const plan of ["starter", "growth", "pro", "agency"] as const)
      for (const seats of [0, 1, 4])
        expect(
          pendingChangeWouldWiden({
            ...base,
            baselineKnown: false,
            baselinePlanId: null,
            baselineSeatQuantity: null,
            baselineSubscriptionId: null,
            projectedPlanId: plan,
            projectedSeatQuantity: seats,
          }),
          `${plan}/${seats}`,
        ).toBe(true);
    // A non-granting projection still takes effect while the baseline is
    // unproved: a payment failure or a cancellation must not be blocked.
    expect(
      pendingChangeWouldWiden({
        ...base,
        baselineKnown: false,
        baselinePlanId: null,
        baselineSeatQuantity: null,
        baselineSubscriptionId: null,
        projectedPlanId: "pro",
        projectedSeatQuantity: 4,
        projectedGrants: false,
      }),
    ).toBe(false);
  });

  it("treats an unrecognised operation state as OPEN, never as released", () => {
    for (const state of ["applied", "refused", "failed"]) {
      expect(isTerminalOperationState(state), state).toBe(true);
      expect(isOpenOperationState(state), state).toBe(false);
    }
    for (const state of [
      "prepared",
      "dispatching",
      "awaiting_payment",
      "awaiting_apply",
      "fenced",
      "",
      null,
      "future_state",
    ])
      expect(isOpenOperationState(state), String(state)).toBe(true);
  });
});

/* ========================================================================== */
/* Mocked server paths                                                        */
/* ========================================================================== */

type Handler = (url: URL, init: RequestInit) => unknown;
let routes: Record<string, Handler>;
let calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string }>;
let subscriptionQueue: unknown[];
/** Successive schedule GETs, so a verify-then-dispatch-then-verify sequence can
 * be driven exactly as the provider would answer it. */
let scheduleQueue: unknown[];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

class RpcError {
  constructor(readonly message = "synthetic rpc failure") {}
}

const GROWTH_STATE = () => stateOf(growthSubscription(NOW_S));
const PRO_SEATS_STATE = (seats = 3) => stateOf(proWithSeatsSubscription(NOW_S, seats));
const PERIOD_END = NOW_S + 20 * 86_400;
const PERIOD_START = NOW_S - 10 * 86_400;

/** The quote row the mocked `read_quote` / `consume_quote` return: a growth →
 * pro increase, bound to the growth state's fingerprint. */
const increaseQuoteRow = (over: Record<string, unknown> = {}) => ({
  kind: "plan_change",
  subscription_id: COMMERCIAL_SUBSCRIPTION,
  state_fingerprint: digest(itemStateFingerprintInput(GROWTH_STATE())),
  selection_fingerprint: digest(
    selectionFingerprintInput({
      targetPlanId: "pro",
      targetSeatQuantity: 0,
      baseItemId: "si_base",
      basePriceId: PRICE_IDS.proBase,
      seatItemId: null,
      seatPriceId: null,
    }),
  ),
  target_plan_id: "pro",
  target_seat_quantity: 0,
  direction: "increase",
  proration_date: NOW_S,
  currency: "eur",
  amount_due: 12_300,
  recurring_amount: APPROVED_MINOR.proBase,
  effective_at: null,
  expires_at: new Date(NOW_MS + 900_000).toISOString(),
  consumed_by: null,
  ...over,
});

/** A pro(3 seats) → growth(0 seats) reduction quote. */
const decreaseQuoteRow = (over: Record<string, unknown> = {}) => ({
  kind: "plan_change",
  subscription_id: COMMERCIAL_SUBSCRIPTION,
  state_fingerprint: digest(itemStateFingerprintInput(PRO_SEATS_STATE())),
  selection_fingerprint: digest(
    selectionFingerprintInput({
      targetPlanId: "growth",
      targetSeatQuantity: 0,
      baseItemId: "si_base",
      basePriceId: PRICE_IDS.growthBase,
      seatItemId: "si_seat",
      seatPriceId: null,
    }),
  ),
  target_plan_id: "growth",
  target_seat_quantity: 0,
  direction: "decrease",
  proration_date: PERIOD_END,
  currency: "eur",
  amount_due: 0,
  recurring_amount: APPROVED_MINOR.growthBase,
  effective_at: new Date(PERIOD_END * 1000).toISOString(),
  expires_at: new Date(NOW_MS + 900_000).toISOString(),
  consumed_by: null,
  ...over,
});

const refundCaseRow = (over: Record<string, unknown> = {}) => ({
  user_id: COMMERCIAL_OWNER,
  invoice_id: REFUND_INVOICE,
  subscription_id: COMMERCIAL_SUBSCRIPTION,
  plan_id: "growth",
  amount: APPROVED_MINOR.growthBase,
  currency: "eur",
  policy_basis: "firstPayment14Day",
  subscription_disposition: "cancelAtPeriodEndSeparately",
  access_disposition: "retainUntilPeriodEnd",
  approved_by: "operator:rafal",
  requested_at: new Date(NOW_MS - 2 * 86_400_000).toISOString(),
  approved_at: new Date(NOW_MS - 86_400_000).toISOString(),
  state: "approved",
  ...over,
});

/** The canonical selection detail each quote is bound to. */
const INCREASE_SELECTION = selectionFingerprintInput({
  targetPlanId: "pro",
  targetSeatQuantity: 0,
  baseItemId: "si_base",
  basePriceId: PRICE_IDS.proBase,
  seatItemId: null,
  seatPriceId: null,
});
const DECREASE_SELECTION = selectionFingerprintInput({
  targetPlanId: "growth",
  targetSeatQuantity: 0,
  baseItemId: "si_base",
  basePriceId: PRICE_IDS.growthBase,
  seatItemId: "si_seat",
  seatPriceId: null,
});

/**
 * A REAL in-memory operation store for the mocked suite.
 *
 * It implements the frozen state machine rather than approving everything: the
 * same transition table, the same compare-and-set, append-only evidence ids and
 * append-once payload. A mock that returned `true` for every advance would make
 * the recovery assertions meaningless — and did.
 *
 * The actual SQL is exercised separately, in `stripe-commercial-server-sql.test.ts`.
 */
interface StoredOperation {
  state: string;
  attempts: number;
  createdAt: string;
  kind: string;
  subscriptionId: string;
  quoteId: string | null;
  selectionDetail: string | null;
  idempotencyKey: string;
  invoiceId: string | null;
  refundId: string | null;
  scheduleId: string | null;
  baselineInvoiceId: string | null;
  payload: unknown;
  baselineKnown: boolean;
  baselinePlanId: string | null;
  baselineSeatQuantity: number | null;
  baselineSubscriptionId: string | null;
}
let operations: Map<string, StoredOperation>;
/** Mirrors `stripe_commercial_transition` exactly. */
const TRANSITIONS = new Set(
  [
    ["prepared", "dispatching"],
    ["prepared", "fenced"],
    ["prepared", "refused"],
    ["prepared", "failed"],
    ["dispatching", "awaiting_payment"],
    ["dispatching", "awaiting_apply"],
    ["dispatching", "fenced"],
    ["dispatching", "applied"],
    ["dispatching", "refused"],
    ["dispatching", "failed"],
    ["awaiting_payment", "awaiting_apply"],
    ["awaiting_payment", "fenced"],
    ["awaiting_payment", "applied"],
    ["awaiting_payment", "refused"],
    ["awaiting_payment", "failed"],
    ["awaiting_apply", "fenced"],
    ["awaiting_apply", "applied"],
    ["awaiting_apply", "refused"],
    ["awaiting_apply", "failed"],
    ["fenced", "dispatching"],
    ["fenced", "awaiting_payment"],
    ["fenced", "awaiting_apply"],
    ["fenced", "applied"],
    ["fenced", "refused"],
    ["fenced", "failed"],
  ].map(([from, to]) => `${from}>${to}`),
);
const OPEN_STATES = new Set([
  "prepared",
  "dispatching",
  "awaiting_payment",
  "awaiting_apply",
  "fenced",
]);

/** Seed a durable operation as a resumed attempt would find it. */
const seedOperation = (over: Partial<StoredOperation> & { operation?: string } = {}) => {
  const id = over.operation ?? OPERATION;
  operations.set(id, {
    state: "prepared",
    attempts: 1,
    createdAt: new Date(NOW_MS).toISOString(),
    kind: "plan_change",
    subscriptionId: COMMERCIAL_SUBSCRIPTION,
    quoteId: QUOTE,
    selectionDetail: INCREASE_SELECTION,
    idempotencyKey: `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${id}`,
    invoiceId: null,
    refundId: null,
    scheduleId: null,
    baselineInvoiceId: "in_base",
    payload: null,
    baselineKnown: true,
    baselinePlanId: "growth",
    baselineSeatQuantity: 0,
    baselineSubscriptionId: COMMERCIAL_SUBSCRIPTION,
    ...over,
  });
  return operations.get(id) as StoredOperation;
};

const beginRow = (row: StoredOperation) => [
  {
    state: row.state,
    attempts: row.attempts,
    created_at: row.createdAt,
    invoice_id: row.invoiceId,
    refund_id: row.refundId,
    schedule_id: row.scheduleId,
    baseline_invoice_id: row.baselineInvoiceId,
    selection_detail: row.selectionDetail,
    baseline_known: row.baselineKnown,
    baseline_plan_id: row.baselinePlanId,
    baseline_seat_quantity: row.baselineSeatQuantity,
    baseline_subscription_id: row.baselineSubscriptionId,
    resumed: row.attempts > 1,
  },
];

class RpcThrow {
  constructor(readonly message = "synthetic rpc failure") {}
}

/** Operation RPCs implemented against the store above. `overrides` can force a
 * single call to throw or return false, which is how a lost acknowledgment and a
 * compare-and-set loss are reproduced. */
const operationRpc = (name: string, args: Record<string, unknown>): unknown => {
  const id = String(args.p_operation ?? "");
  const existing = operations.get(id);
  if (name === "stripe_commercial_begin_operation") {
    if (existing) {
      if (
        existing.kind !== args.p_kind ||
        existing.subscriptionId !== args.p_subscription ||
        existing.idempotencyKey !== args.p_idempotency_key ||
        (existing.quoteId ?? null) !== ((args.p_quote as string | null) ?? null) ||
        (existing.selectionDetail ?? null) !== ((args.p_selection as string | null) ?? null)
      )
        throw new RpcThrow("stripe_commercial_mismatch");
      if (OPEN_STATES.has(existing.state)) existing.attempts += 1;
      return beginRow(existing);
    }
    if (
      (args.p_kind === "plan_change" || args.p_kind === "seat_change") &&
      !String(args.p_selection ?? "")
    )
      throw new RpcThrow("stripe_commercial_selection_missing");
    return beginRow(
      seedOperation({
        operation: id,
        kind: String(args.p_kind),
        subscriptionId: String(args.p_subscription),
        quoteId: (args.p_quote as string | null) ?? null,
        selectionDetail: (args.p_selection as string | null) ?? null,
        idempotencyKey: String(args.p_idempotency_key),
        baselineInvoiceId: (args.p_baseline_invoice as string | null) ?? null,
      }),
    );
  }
  if (name === "stripe_commercial_advance_operation") {
    if (!existing) return false;
    const expected = args.p_expected_state as string | null;
    if (expected !== null && expected !== undefined && existing.state !== expected) return false;
    if (!TRANSITIONS.has(`${existing.state}>${String(args.p_state)}`)) return false;
    const evidence = (key: "invoiceId" | "refundId" | "scheduleId", value: unknown) => {
      const next = (value as string | null) ?? null;
      if (next !== null && existing[key] !== null && existing[key] !== next)
        throw new RpcThrow("stripe_commercial_evidence_conflict");
      if (next !== null) existing[key] = next;
    };
    evidence("invoiceId", args.p_invoice);
    evidence("refundId", args.p_refund);
    evidence("scheduleId", args.p_schedule);
    const offered = args.p_reduction_payload ?? null;
    if (offered !== null) {
      if (existing.payload !== null) {
        if (canonicalJson(existing.payload) !== canonicalJson(offered))
          throw new RpcThrow("stripe_commercial_evidence_conflict");
      } else {
        if (args.p_state !== "awaiting_apply" || expected !== "dispatching")
          throw new RpcThrow("stripe_commercial_payload_unsupported");
        existing.payload = offered;
      }
    }
    existing.state = String(args.p_state);
    return true;
  }
  if (name === "stripe_commercial_finish_operation") {
    if (!existing) return false;
    const expected = args.p_expected_state as string | null;
    if (expected !== null && expected !== undefined && existing.state !== expected) return false;
    if (!TRANSITIONS.has(`${existing.state}>${String(args.p_state)}`)) return false;
    existing.state = String(args.p_state);
    return true;
  }
  // stripe_commercial_read_operation
  if (!existing) return [];
  return [
    {
      kind: existing.kind,
      state: existing.state,
      subscription_id: existing.subscriptionId,
      invoice_id: existing.invoiceId,
      refund_id: existing.refundId,
      schedule_id: existing.scheduleId,
      refusal_code: null,
      attempts: existing.attempts,
      created_at: existing.createdAt,
      resolved_at: OPEN_STATES.has(existing.state) ? null : new Date(NOW_MS).toISOString(),
      reduction_dispatch_payload: existing.payload,
    },
  ];
};

const OPERATION_RPCS = new Set([
  "stripe_commercial_begin_operation",
  "stripe_commercial_advance_operation",
  "stripe_commercial_finish_operation",
  "stripe_commercial_read_operation",
]);

const DEFAULT_RPC: Record<string, unknown> = {
  stripe_commercial_current_subscription: [
    {
      customer_id: COMMERCIAL_CUSTOMER,
      subscription_id: COMMERCIAL_SUBSCRIPTION,
      plan_id: "growth",
      status: "active",
      seat_quantity: 0,
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
      cancel_at_period_end: false,
      latest_invoice_paid: true,
    },
  ],
  stripe_commercial_billing_country: [
    { country: "DE", needs_review: false, stored_market: "European Union" },
  ],
  stripe_commercial_membership_usage: [
    { working: 2, viewer: 1, known: true, projects: 1, projects_known: true },
  ],
  stripe_commercial_issue_quote: [
    { quote_id: QUOTE, expires_at: new Date(NOW_MS + 900_000).toISOString() },
  ],
  stripe_commercial_read_quote: [increaseQuoteRow()],
  stripe_commercial_consume_quote: [increaseQuoteRow()],
  stripe_commercial_read_refund_case: [refundCaseRow()],
  stripe_commercial_record_refund_case: "approved",
  stripe_commercial_reserve_refund: [{ reserved: APPROVED_MINOR.growthBase, remaining: 0 }],
  stripe_commercial_settle_refund: "settled",
  stripe_commercial_deletion_barrier: [
    { blocked: false, reason: "clear", mode: null, subscription_id: null },
  ],
};

const rpcTable = (over: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...DEFAULT_RPC, ...over };
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name in data) {
      const value = data[name];
      if (value instanceof RpcError)
        return Promise.resolve({ data: null, error: { message: value.message } });
      if (value instanceof Error) return Promise.reject(value);
      return Promise.resolve({
        data: typeof value === "function" ? (value as (a: unknown) => unknown)(args) : value,
        error: null,
      });
    }
    if (OPERATION_RPCS.has(name)) {
      try {
        return Promise.resolve({ data: operationRpc(name, args ?? {}), error: null });
      } catch (error) {
        return Promise.resolve({
          data: null,
          error: { message: error instanceof RpcThrow ? error.message : "rpc_failed" },
        });
      }
    }
    return Promise.resolve({ data: null, error: null });
  });
};

/** The scoped, service-only SELECT the server uses to recover the ORIGINAL
 * selection before `begin_operation`. Backed by the same store. */
const scopedSelect = () => {
  mocks.from.mockImplementation(() => ({
    select: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        maybeSingle() {
          const row = operations.get(String(filters.operation_id ?? ""));
          if (!row || filters.user_id !== COMMERCIAL_OWNER)
            return Promise.resolve({ data: null, error: null });
          return Promise.resolve({
            data: {
              state: row.state,
              kind: row.kind,
              subscription_id: row.subscriptionId,
              quote_id: row.quoteId,
              selection_detail: row.selectionDetail,
              idempotency_key: row.idempotencyKey,
              baseline_invoice_id: row.baselineInvoiceId,
            },
            error: null,
          });
        },
      };
      return builder;
    },
  }));
};

const rpcArgs = (name: string) =>
  mocks.rpc.mock.calls.filter((call) => call[0] === name).map((call) => call[1]);
const rpcNames = () => mocks.rpc.mock.calls.map((call) => call[0]);
const providerPosts = () => calls.filter((call) => call.method === "POST");
const postsTo = (path: string) =>
  providerPosts().filter((call) => new URL(call.url).pathname === path);
const bodyOf = (path: string) => new URLSearchParams(postsTo(path)[0]?.body ?? "");

const UPDATED_INVOICE = "in_update";
const QUOTED_INCREASE = 12_300;
const proAfterUpdate = (over: Record<string, unknown> = {}) =>
  growthSubscription(NOW_S, {
    items: {
      object: "list",
      has_more: false,
      data: [
        subscriptionItem(
          { id: "si_base", priceId: PRICE_IDS.proBase, productId: PRODUCT_IDS.pro, quantity: 1 },
          NOW_S,
        ),
      ],
    },
    latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE),
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  calls = [];
  subscriptionQueue = [];
  scheduleQueue = [];
  operations = new Map();
  routes = {
    "GET /v1/account": () => json({ id: COMMERCIAL_ACCOUNT_TEST, object: "account" }),
    [`GET /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`]: () =>
      json(subscriptionQueue.length > 0 ? subscriptionQueue.shift() : growthSubscription(NOW_S)),
    [`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`]: () => json(proAfterUpdate()),
    // The TWO previews are routed apart on `preview_mode`, exactly as the
    // server sends them: the immediate proration preview carries the stable
    // proration date, the recurring estimate carries neither that date nor any
    // proration parameter.
    "POST /v1/invoices/create_preview": (_url, init) => {
      const body = new URLSearchParams(String(init.body ?? ""));
      if (body.get("preview_mode") === "recurring")
        return json(
          recurringPreview({ subtotalMinor: APPROVED_MINOR.proBase, totalMinor: 26_910 }),
        );
      return json(
        prorationPreview({
          prorationDate: NOW_S,
          amountDue: QUOTED_INCREASE,
          creditMinor: -5_000,
          chargeMinor: 18_000,
        }),
      );
    },
    [`GET /v1/invoices/${UPDATED_INVOICE}`]: () => json(updateInvoice(NOW_S, QUOTED_INCREASE)),
    [`GET /v1/invoices/${REFUND_INVOICE}`]: () => json(refundableInvoice(NOW_S)),
    "GET /v1/invoices": () => json(list([refundableInvoice(NOW_S)])),
    "GET /v1/invoice_payments": () => json(list([invoicePayment()])),
    [`GET /v1/payment_intents/${REFUND_PAYMENT_INTENT}`]: () => json(paymentIntent()),
    "GET /v1/refunds": () => json(list([])),
    "POST /v1/refunds": () => json(refundObject()),
    "POST /v1/subscription_schedules": () => json(adoptedScheduleFixture()),
    "POST /v1/subscription_schedules/sub_sched_1": () => json(reducedScheduleFixture()),
    "GET /v1/subscription_schedules/sub_sched_1": () =>
      json(scheduleQueue.length > 0 ? scheduleQueue.shift() : reducedScheduleFixture()),
  };
  for (const id of Object.keys(DEFAULT_PRICE_OBJECTS))
    routes[`GET /v1/prices/${id}`] = () => json(DEFAULT_PRICE_OBJECTS[id]);

  mocks.fetch.mockImplementation((input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>),
    );
    calls.push({ url: url.href, method, headers, body: init.body ? String(init.body) : "" });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return Promise.resolve(json({ error: { message: "unrouted" } }, 404));
    const result = handler(url, init);
    return Promise.resolve(result instanceof Response ? result : json(result));
  });
  rpcTable();
  scopedSelect();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const PAID_ITEMS = [
  { priceId: PRICE_IDS.proBase, quantity: 1 },
  { priceId: PRICE_IDS.proSeat, quantity: 3 },
];
const TARGET_ITEMS = [{ priceId: PRICE_IDS.growthBase, quantity: 1 }];

const adoptedScheduleFixture = (over: Record<string, unknown> = {}) =>
  adoptedSchedule({ periodStart: PERIOD_START, periodEnd: PERIOD_END, items: PAID_ITEMS }, over);

const reducedScheduleFixture = (over: Record<string, unknown> = {}) =>
  reductionSchedule(
    {
      nowSeconds: NOW_S,
      currentItems: PAID_ITEMS,
      nextItems: TARGET_ITEMS,
      periodEnd: PERIOD_END,
      periodStart: PERIOD_START,
    },
    over,
  );

/** The payload a dispatched reduction captures, through the REAL builder. */
const expectedReductionPayload = (operation = OPERATION) => {
  const adoption = readAdoptedScheduleProfile({
    raw: adoptedScheduleFixture(),
    mode: "test",
    subscriptionId: COMMERCIAL_SUBSCRIPTION,
    customerId: COMMERCIAL_CUSTOMER,
    currency: "eur",
  });
  if (!adoption.ok) throw new Error(`fixture adoption: ${adoption.reason}`);
  const selection = parseSelectionDetail(DECREASE_SELECTION);
  if (!selection) throw new Error("fixture selection");
  const built = buildReductionPayload({
    operationId: operation,
    quoteId: QUOTE,
    subscriptionId: COMMERCIAL_SUBSCRIPTION,
    selection,
    selectionDetail: DECREASE_SELECTION,
    effectiveBoundary: PERIOD_END,
    adoption: adoption.value,
  });
  if (!built.ok) throw new Error(`fixture payload: ${built.reason}`);
  return built.payload;
};

const deps = (over: { now?: number | (() => number); env?: Record<string, string> } = {}) => ({
  env: over.env ?? COMMERCIAL_ENV,
  now: over.now ?? NOW_MS,
  fetch: mocks.fetch as unknown as typeof fetch,
});

/** Start a second, independent attempt inside one test: fresh call records and a
 * fresh durable store, with the provider routes left as the test set them. */
const resetServerMocks = (over: Record<string, unknown> = {}) => {
  mocks.rpc.mockClear();
  mocks.from.mockClear();
  mocks.fetch.mockClear();
  calls = [];
  subscriptionQueue = [];
  scheduleQueue = [];
  operations = new Map();
  rpcTable(over);
  scopedSelect();
};

const prepare = (
  over: {
    planId?: "starter" | "growth" | "pro" | "agency";
    seats?: number;
    mode?: "live" | "test";
    now?: number | (() => number);
    env?: Record<string, string>;
  } = {},
) =>
  prepareSubscriptionChange(
    {
      userId: COMMERCIAL_OWNER,
      quoteId: QUOTE,
      mode: over.mode ?? "test",
      targetPlanId: over.planId ?? "pro",
      targetSeatQuantity: over.seats ?? 0,
    },
    deps(over),
  );

const confirm = (
  over: {
    planId?: "starter" | "growth" | "pro" | "agency";
    seats?: number;
    amount?: number;
    currency?: string;
    mode?: "live" | "test";
    now?: number | (() => number);
    env?: Record<string, string>;
    operationId?: string;
  } = {},
) =>
  confirmSubscriptionChange(
    {
      userId: COMMERCIAL_OWNER,
      operationId: over.operationId ?? OPERATION,
      quoteId: QUOTE,
      mode: over.mode ?? "test",
      targetPlanId: over.planId ?? "pro",
      targetSeatQuantity: over.seats ?? 0,
      expectedAmountMinor: over.amount ?? 12_300,
      expectedCurrency: over.currency ?? "eur",
    },
    deps(over),
  );

describe("the dormant hold", () => {
  it("is a code constant with no configuration escape", () => {
    expect(liveCommercialMutationsAllowed()).toBe(false);
  });

  it("refuses every live-mode operation before any provider or database access", async () => {
    expect(await prepare({ mode: "live" })).toEqual({ ok: false, reason: "live_commercial_held" });
    expect(await confirm({ mode: "live" })).toEqual({ ok: false, reason: "live_commercial_held" });
    expect(
      await requestSubscriptionCancellation(
        { userId: COMMERCIAL_OWNER, operationId: OPERATION, mode: "live" },
        deps(),
      ),
    ).toEqual({ ok: false, reason: "live_commercial_held" });
    expect(
      await reverseSubscriptionCancellation(
        {
          userId: COMMERCIAL_OWNER,
          operationId: OPERATION,
          cancelOperationId: CANCEL_OPERATION,
          mode: "live",
        },
        deps(),
      ),
    ).toEqual({ ok: false, reason: "live_commercial_held" });
    expect(
      await executeApprovedRefund(
        { caseId: "CASE-1", operationId: OPERATION, mode: "live", operatorActor: "operator:rafal" },
        deps(),
      ),
    ).toEqual({ ok: false, reason: "live_refund_held" });
    expect(
      await recordApprovedRefundCase(
        {
          caseId: "CASE-1",
          userId: COMMERCIAL_OWNER,
          mode: "live",
          invoiceId: REFUND_INVOICE,
          subscriptionId: COMMERCIAL_SUBSCRIPTION,
          planId: "growth",
          amountMinor: APPROVED_MINOR.growthBase,
          currency: "eur",
          policyBasis: "firstPayment14Day",
          subscriptionDisposition: "cancelAtPeriodEndSeparately",
          accessDisposition: "retainUntilPeriodEnd",
          operatorActor: "operator:rafal",
          requestedAtMs: NOW_MS,
        },
        deps(),
      ),
    ).toEqual({ ok: false, reason: "live_refund_held" });
    // Zero provider calls and zero database calls on every held path.
    expect(calls).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses an unconfigured mode without touching anything", async () => {
    expect(await prepare({ env: {} })).toEqual({ ok: false, reason: "not_configured" });
    expect(calls).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("preparing a change", () => {
  it("resolves the server state, previews with the provider and persists a bound quote", async () => {
    const result = await prepare();
    expect(result).toMatchObject({
      ok: true,
      quoteId: QUOTE,
      direction: "increase",
      amountDueMinor: QUOTED_INCREASE,
      // The LONG-TERM recurring estimate, from the provider's `total` in a
      // separate `preview_mode=recurring` preview — deliberately NOT the
      // immediate figure and NOT the line subtotal.
      recurringEstimateMinor: 26_910,
      recurringEstimateIncludesAdjustments: true,
      currency: "eur",
      effectiveAt: null,
      immediate: true,
      targetPlanId: "pro",
      targetSeatQuantity: 0,
      workingSeatAllowance: PLAN_SEATS.pro.workingSeats,
      viewerSeatAllowance: PLAN_SEATS.pro.viewerSeats,
      projectAllowance: PLAN_LIMITS.pro.maxProjects,
    });
    expect(result.ok && result.recurringEstimateNote).toContain(
      "not a promise of your next charge",
    );
    // The account is verified before anything else is trusted.
    expect(new URL(calls[0].url).pathname).toBe("/v1/account");
    // The mode's own restricted key, and this packet's pinned API version.
    expect(calls[0].headers.Authorization).toBe("Bearer rk_test_commercialfixture");
    expect(calls[0].headers["Stripe-Version"]).toBe("2026-09-30.endive");
    // TWO SEPARATE previews, in this order.
    const previews = postsTo("/v1/invoices/create_preview").map(
      (call) => new URLSearchParams(call.body),
    );
    expect(previews).toHaveLength(2);
    // 1. The IMMEDIATE preview names the EXISTING base item, an explicit
    //    quantity 1, and the stable proration date.
    const [immediate, recurring] = previews;
    expect(immediate.get("subscription")).toBe(COMMERCIAL_SUBSCRIPTION);
    expect(immediate.get("subscription_details[items][0][id]")).toBe("si_base");
    expect(immediate.get("subscription_details[items][0][price]")).toBe(PRICE_IDS.proBase);
    expect(immediate.get("subscription_details[items][0][quantity]")).toBe("1");
    expect(immediate.get("subscription_details[proration_behavior]")).toBe("always_invoice");
    expect(immediate.get("subscription_details[proration_date]")).toBe(String(NOW_S));
    expect(immediate.get("preview_mode")).toBeNull();
    // 2. The RECURRING estimate carries the documented mode and NO immediate
    //    proration date or proration parameter: prorations are not supported
    //    there, so passing one would imply they were.
    expect(recurring.get("preview_mode")).toBe("recurring");
    expect(recurring.get("subscription_details[proration_date]")).toBeNull();
    expect(recurring.get("subscription_details[proration_behavior]")).toBeNull();
    expect(recurring.get("subscription_details[items][0][price]")).toBe(PRICE_IDS.proBase);
    // The quote carries the provider's amount, the stable proration date and a TTL.
    const [issued] = rpcArgs("stripe_commercial_issue_quote");
    expect(issued).toMatchObject({
      p_quote: QUOTE,
      p_user: COMMERCIAL_OWNER,
      p_account: COMMERCIAL_ACCOUNT_TEST,
      p_mode: "test",
      p_kind: "plan_change",
      p_subscription: COMMERCIAL_SUBSCRIPTION,
      p_target_plan: "pro",
      p_target_seats: 0,
      p_direction: "increase",
      p_proration_date: NOW_S,
      p_currency: "eur",
      p_amount_due: QUOTED_INCREASE,
      p_recurring_amount: 26_910,
      p_ttl_seconds: COMMERCIAL_QUOTE_TTL_SECONDS,
    });
    expect(issued.p_state_fingerprint).toBe(digest(itemStateFingerprintInput(GROWTH_STATE())));
    expect(issued.p_selection_fingerprint).toBe(digest(INCREASE_SELECTION));
    // No provider MUTATION happened: the only POSTs are the two previews.
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
  });

  it("returns UI-safe fields only, never an id, price or account", async () => {
    const result = await prepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result);
    for (const secret of [
      COMMERCIAL_ACCOUNT_TEST,
      COMMERCIAL_CUSTOMER,
      COMMERCIAL_SUBSCRIPTION,
      PRICE_IDS.proBase,
      "si_base",
      "rk_test_commercialfixture",
    ])
      expect(serialized, secret).not.toContain(secret);
  });

  it("explains the effective date for both directions", async () => {
    const increase = await prepare();
    expect(increase.ok && increase.effectiveNote).toContain(
      "once the prorated amount shown is paid",
    );
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcTable({
      stripe_commercial_current_subscription: [
        {
          customer_id: COMMERCIAL_CUSTOMER,
          subscription_id: COMMERCIAL_SUBSCRIPTION,
          plan_id: "pro",
          status: "active",
          seat_quantity: 3,
        },
      ],
    });
    const decrease = await prepare({ planId: "growth", seats: 0 });
    expect(decrease).toMatchObject({
      ok: true,
      direction: "decrease",
      amountDueMinor: 0,
      immediate: false,
      effectiveAt: new Date(PERIOD_END * 1000).toISOString(),
    });
    expect(decrease.ok && decrease.effectiveNote).toContain(
      "end of the period you have already paid for",
    );
    expect(decrease.ok && decrease.effectiveNote).toContain("Unused time is not refunded");
  });

  it("takes NO immediate preview for a reduction, and accepts a POSITIVE recurring estimate", async () => {
    // The corrected semantics: a period-end reduction charges nothing now, so
    // no immediate preview is taken at all — and a perfectly ordinary positive
    // upcoming renewal is NOT an immediate charge. Rejecting any positive
    // `amount_due` from a `next`-mode preview refused legitimate reductions.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcTable({
      stripe_commercial_current_subscription: [
        {
          customer_id: COMMERCIAL_CUSTOMER,
          subscription_id: COMMERCIAL_SUBSCRIPTION,
          plan_id: "pro",
          status: "active",
          seat_quantity: 3,
        },
      ],
    });
    const result = await prepare({ planId: "growth", seats: 0 });
    expect(result).toMatchObject({
      ok: true,
      direction: "decrease",
      amountDueMinor: 0,
      recurringEstimateMinor: 26_910,
    });
    const previews = postsTo("/v1/invoices/create_preview").map(
      (call) => new URLSearchParams(call.body),
    );
    expect(previews).toHaveLength(1);
    expect(previews[0].get("preview_mode")).toBe("recurring");
    expect(previews[0].get("subscription_details[proration_date]")).toBeNull();
    expect(previews[0].get("subscription_details[proration_behavior]")).toBeNull();
  });

  it("holds a MIXED or unreadable recurring estimate rather than reporting a number", async () => {
    // The unsupported provider shapes stay explicit, for the sandbox matrix.
    routes["POST /v1/invoices/create_preview"] = (_url, init) => {
      const body = new URLSearchParams(String(init.body ?? ""));
      if (body.get("preview_mode") === "recurring")
        return json(
          recurringPreview(
            { subtotalMinor: 1, totalMinor: 1 },
            {
              lines: {
                object: "list",
                has_more: false,
                data: [{ id: "il_mixed", amount: 1, period: { start: 0, end: 0 } }],
              },
            },
          ),
        );
      return json(
        prorationPreview({
          prorationDate: NOW_S,
          amountDue: QUOTED_INCREASE,
          creditMinor: -5_000,
          chargeMinor: 18_000,
        }),
      );
    };
    expect(await prepare()).toEqual({
      ok: false,
      reason: "preview_preview_line_proration_unknown",
    });
    routes["POST /v1/invoices/create_preview"] = () => json({ error: "nope" }, 500);
    expect(await prepare()).toEqual({ ok: false, reason: "preview_unavailable" });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it.each([
    [
      "a market that needs review",
      { stripe_commercial_billing_country: [{ country: "DE", needs_review: true }] },
      "market_review_required",
    ],
    [
      "an unknown billing country",
      { stripe_commercial_billing_country: [{ country: "", needs_review: false }] },
      "billing_country_unknown",
    ],
    [
      "a 'not listed' billing country",
      { stripe_commercial_billing_country: [{ country: "OTHER", needs_review: false }] },
      "billing_country_unknown",
    ],
    [
      "an attempted currency switch",
      { stripe_commercial_billing_country: [{ country: "PL", needs_review: false }] },
      "currency_switch_held",
    ],
    ["no profile row at all", { stripe_commercial_billing_country: [] }, "billing_country_unknown"],
    [
      "an unreadable profile",
      { stripe_commercial_billing_country: new RpcError() },
      "billing_country_uncertain",
    ],
    ["no mapped customer", { stripe_commercial_current_subscription: [] }, "no_customer"],
    [
      "no paid subscription",
      { stripe_commercial_current_subscription: [{ customer_id: COMMERCIAL_CUSTOMER }] },
      "no_paid_subscription",
    ],
    [
      "a subscription that is not current",
      {
        stripe_commercial_current_subscription: [
          {
            customer_id: COMMERCIAL_CUSTOMER,
            subscription_id: COMMERCIAL_SUBSCRIPTION,
            plan_id: "growth",
            status: "past_due",
          },
        ],
      },
      "subscription_not_current",
    ],
  ])("holds %s, dispatching nothing", async (_label, over, reason) => {
    rpcTable(over);
    expect(await prepare()).toEqual({ ok: false, reason });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it.each([
    ["a pending provider update", { pending_update: {} }, "pending_update_present"],
    ["an unreadable pending update", { pending_update: 7 }, "pending_update_unknown"],
    ["an attached schedule", { schedule: "sub_sched_9" }, "schedule_conflict"],
    ["a pending cancellation", { cancel_at_period_end: true }, "cancellation_pending"],
  ])("holds %s", async (_label, over, reason) => {
    subscriptionQueue = [growthSubscription(NOW_S, over)];
    expect(await prepare()).toEqual({ ok: false, reason });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it("holds an unchanged and a mixed change", async () => {
    expect(await prepare({ planId: "growth", seats: 0 })).toEqual({
      ok: false,
      reason: "change_unchanged",
    });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await prepare({ planId: "agency", seats: 1 })).toEqual({
      ok: false,
      reason: "mixed_change_held",
    });
  });

  it("holds a configured price whose provider amount is not the approved one", async () => {
    routes[`GET /v1/prices/${PRICE_IDS.proBase}`] = () =>
      json(priceObject(PRICE_IDS.proBase, PRODUCT_IDS.pro, 19_900));
    expect(await prepare()).toEqual({ ok: false, reason: "terms_provider_amount_unapproved" });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it("holds an archived price and a price read failure", async () => {
    routes[`GET /v1/prices/${PRICE_IDS.proBase}`] = () =>
      json(
        priceObject(PRICE_IDS.proBase, PRODUCT_IDS.pro, APPROVED_MINOR.proBase, { active: false }),
      );
    expect(await prepare()).toEqual({ ok: false, reason: "terms_price_inactive" });
    routes[`GET /v1/prices/${PRICE_IDS.proBase}`] = () => json({ error: "nope" }, 500);
    expect(await prepare()).toEqual({ ok: false, reason: "price_read_failed" });
  });

  it("holds a reduction below the current team, projects or an unknown count", async () => {
    const usage = (over: Record<string, unknown>) => {
      subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
      rpcTable({ stripe_commercial_membership_usage: [over] });
      return prepare({ planId: "growth", seats: 0 });
    };
    expect(
      await usage({ working: 6, viewer: 1, known: true, projects: 0, projects_known: true }),
    ).toEqual({ ok: false, reason: "capacity_conflict_working" });
    expect(await usage({ known: false, projects_known: false })).toEqual({
      ok: false,
      reason: "capacity_unknown",
    });
    // The PROJECT bundle: seats fit, projects overflow. Growth allows
    // PLAN_LIMITS.growth.maxProjects.
    expect(
      await usage({
        working: 1,
        viewer: 1,
        known: true,
        projects: PLAN_LIMITS.growth.maxProjects + 1,
        projects_known: true,
      }),
    ).toEqual({ ok: false, reason: "capacity_conflict_projects" });
    // An unmigrated workspace reports UNKNOWN projects, never zero.
    expect(await usage({ working: 1, viewer: 1, known: true, projects_known: false })).toEqual({
      ok: false,
      reason: "capacity_projects_unknown",
    });
    // A non-integer or negative count is unknown too, never coerced.
    expect(
      await usage({
        working: 1,
        viewer: 1,
        known: true,
        projects: 2.5,
        projects_known: true,
      }),
    ).toEqual({ ok: false, reason: "capacity_projects_unknown" });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it("accepts valid seat and project counts from the frozen usage RPC", async () => {
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcTable({
      stripe_commercial_current_subscription: [
        {
          customer_id: COMMERCIAL_CUSTOMER,
          subscription_id: COMMERCIAL_SUBSCRIPTION,
          plan_id: "pro",
          status: "active",
          seat_quantity: 3,
        },
      ],
      // The RPC returns counts as strings over the wire for bigint-ish columns;
      // integer strings are accepted, anything else is unknown.
      stripe_commercial_membership_usage: [
        { working: "2", viewer: "1", known: true, projects: "3", projects_known: true },
      ],
    });
    const result = await prepare({ planId: "growth", seats: 0 });
    expect(result).toMatchObject({ ok: true, direction: "decrease" });
    expect(result.ok && result.projectAllowance).toBe(PLAN_LIMITS.growth.maxProjects);
  });

  it("refuses to issue a quote while an unresolved operation holds the slot", async () => {
    rpcTable({ stripe_commercial_issue_quote: new RpcError("stripe_commercial_operation_open") });
    expect(await prepare()).toEqual({ ok: false, reason: "quote_unavailable" });
  });

  it("holds an unverifiable account before any read of the subscription", async () => {
    routes["GET /v1/account"] = () => json({ id: "acct_someoneelse", object: "account" });
    expect(await prepare()).toEqual({ ok: false, reason: "account_unverified" });
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/v1/account"]);
  });
});

describe("confirming an increase: exact invoice provenance and exact applied selection", () => {
  it("updates the existing base item, records the invoice origin, then proves both halves", async () => {
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    const result = await confirm();
    expect(result).toMatchObject({
      ok: true,
      state: "applied",
      direction: "increase",
      currency: "eur",
      amountDueMinor: QUOTED_INCREASE,
    });
    const body = bodyOf(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    // The EXISTING base item id, with its explicit quantity 1.
    expect(body.get("items[0][id]")).toBe("si_base");
    expect(body.get("items[0][price]")).toBe(PRICE_IDS.proBase);
    expect(body.get("items[0][quantity]")).toBe("1");
    expect(body.get("items[1][price]")).toBeNull();
    // Payment-dependent update with the stable proration date.
    expect(body.get("proration_behavior")).toBe("always_invoice");
    expect(body.get("proration_date")).toBe(String(NOW_S));
    expect(body.get("payment_behavior")).toBe("pending_if_incomplete");
    // A durable idempotency key, scoped to account/mode/operation.
    expect(
      postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)[0].headers["Idempotency-Key"],
    ).toBe(`milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`);
    // THE ORIGIN IS RECORDED FIRST, with an explicit compare-and-set, and from
    // the POST response rather than from a later `latest_invoice`.
    const advances = rpcArgs("stripe_commercial_advance_operation");
    expect(advances[0]).toMatchObject({ p_state: "dispatching", p_expected_state: "prepared" });
    expect(advances[1]).toMatchObject({
      p_state: "awaiting_payment",
      p_invoice: UPDATED_INVOICE,
      p_expected_state: "dispatching",
    });
    // Then the exact invoice AND the subscription are read authoritatively.
    expect(
      calls.some((call) => new URL(call.url).pathname === `/v1/invoices/${UPDATED_INVOICE}`),
    ).toBe(true);
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "applied",
      p_expected_state: "awaiting_payment",
    });
    // No entitlement is written from this path, in any mode.
    expect(rpcNames()).not.toContain("stripe_commercial_guarded_projection");
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
    expect(rpcNames()).not.toContain("writeEntitlement");
  });

  it("records the pre-dispatch baseline AND the canonical selection on the operation", async () => {
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    await confirm();
    expect(rpcArgs("stripe_commercial_begin_operation")[0]).toMatchObject({
      p_kind: "plan_change",
      p_baseline_invoice: "in_base",
      p_quote: QUOTE,
      p_idempotency_key: `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
      p_selection: INCREASE_SELECTION,
    });
  });

  it("REJECTS the same plan and seat count carried by a DIFFERENT item or price", async () => {
    // The reproduced defect: `planId` and the seat COUNT matched, so a
    // substituted subscription item or price was accepted as the confirmed
    // change. Exact item/price identity is now part of the proof.
    const substituted = (over: Record<string, unknown>) =>
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              {
                id: "si_base",
                priceId: PRICE_IDS.proBase,
                productId: PRODUCT_IDS.pro,
                quantity: 1,
                ...over,
              } as Parameters<typeof subscriptionItem>[0],
              NOW_S,
            ),
          ],
        },
        latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE),
      });
    subscriptionQueue = [growthSubscription(NOW_S), substituted({ id: "si_REPLACED_NOT_QUOTED" })];
    expect(await confirm()).toEqual({ ok: false, reason: "change_not_applied_base_item" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);

    resetServerMocks();
    // A different PRICE for the same plan: the registry maps `price_tgrowth` to
    // growth, so the read reports the growth plan — still not the confirmed
    // selection, and still not applied.
    subscriptionQueue = [
      growthSubscription(NOW_S),
      substituted({ priceId: PRICE_IDS.growthBase, productId: PRODUCT_IDS.growth }),
    ];
    const result = await confirm();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.startsWith("change_not_applied")).toBe(true);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("REJECTS an unrelated paid RENEWAL as proof of the update", async () => {
    // Quoted 12300; the subscription's newest invoice is a genuine, paid, newer
    // renewal for 1 minor unit. It differs from the baseline and it is paid —
    // and it is still not this change's invoice.
    const renewal = paidInvoice(NOW_S, {
      id: "in_UNRELATED_RENEWAL",
      billing_reason: "subscription_cycle",
      amount_paid: 1,
      status_transitions: { paid_at: NOW_S },
    });
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: renewal }));
    routes["GET /v1/invoices/in_UNRELATED_RENEWAL"] = () => json(renewal);
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate({ latest_invoice: renewal })];
    expect(await confirm()).toEqual({
      ok: false,
      reason: "change_invoice_billing_reason_subscription_cycle",
    });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("REJECTS a paid update invoice whose amount is not the quoted one", async () => {
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () =>
      json(updateInvoice(NOW_S, QUOTED_INCREASE + 1));
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "change_invoice_amount_unexpected" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("requires exact paid-invoice evidence even for a ZERO-DUE quote", async () => {
    // A zero-due change is still proved by a paid invoice for exactly zero, not
    // by the absence of a charge. An old, open or unreadable invoice is refused.
    const zeroQuote = {
      stripe_commercial_read_quote: [increaseQuoteRow({ amount_due: 0 })],
      stripe_commercial_consume_quote: [increaseQuoteRow({ amount_due: 0 })],
    };
    rpcTable(zeroQuote);
    const stale = paidInvoice(NOW_S, {
      id: "in_base",
      status: "open",
      amount_remaining: APPROVED_MINOR.proBase,
    });
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: stale }));
    routes["GET /v1/invoices/in_base"] = () => json(stale);
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate({ latest_invoice: stale })];
    // The captured id IS the durable baseline, which can never be the update's
    // own invoice.
    expect(await confirm({ amount: 0 })).toEqual({
      ok: false,
      reason: "change_invoice_is_baseline",
    });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);

    // The positive control: a real zero-due update invoice.
    resetServerMocks(zeroQuote);
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: updateInvoice(NOW_S, 0) }));
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () => json(updateInvoice(NOW_S, 0));
    subscriptionQueue = [
      growthSubscription(NOW_S),
      proAfterUpdate({ latest_invoice: updateInvoice(NOW_S, 0) }),
    ];
    expect(await confirm({ amount: 0 })).toMatchObject({ ok: true, state: "applied" });
  });

  it("refuses a ZERO-DUE change whose invoice is a NON-BASELINE OPEN one", async () => {
    // Separate from the baseline case above: this invoice is genuinely a new
    // `subscription_update` invoice, for exactly zero, and it is NOT paid. A
    // zero-due quote must still be proved by a PAID invoice — "nothing to pay"
    // is not the same fact as "nothing was charged yet".
    const zeroQuote = {
      stripe_commercial_read_quote: [increaseQuoteRow({ amount_due: 0 })],
      stripe_commercial_consume_quote: [increaseQuoteRow({ amount_due: 0 })],
    };
    rpcTable(zeroQuote);
    const openZero = updateInvoice(NOW_S, 0, {
      status: "open",
      amount_remaining: 0,
      status_transitions: { paid_at: null },
    });
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: openZero }));
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () => json(openZero);
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate({ latest_invoice: openZero })];
    expect(await confirm({ amount: 0 })).toEqual({ ok: false, reason: "change_invoice_unpaid" });
    // Nothing terminal: the operation waits for the real payment evidence.
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("awaiting_payment");
  });

  it("refuses a ZERO-DUE change whose captured invoice is UNREADABLE", async () => {
    const zeroQuote = {
      stripe_commercial_read_quote: [increaseQuoteRow({ amount_due: 0 })],
      stripe_commercial_consume_quote: [increaseQuoteRow({ amount_due: 0 })],
    };
    rpcTable(zeroQuote);
    const zero = updateInvoice(NOW_S, 0);
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: zero }));
    // The captured invoice cannot be read back as an invoice at all.
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () => json({ id: UPDATED_INVOICE });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate({ latest_invoice: zero })];
    // Refused on the first thing that cannot be read — here the mode — and not
    // treated as "no charge, so nothing to prove".
    expect(await confirm({ amount: 0 })).toEqual({ ok: false, reason: "change_invoice_mode" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);

    // The same holds when the read fails outright.
    resetServerMocks(zeroQuote);
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: zero }));
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () => {
      throw new Error("socket timeout");
    };
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate({ latest_invoice: zero })];
    expect(await confirm({ amount: 0 })).toEqual({ ok: false, reason: "invoice_read_failed" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("HOLDS a supported result that created no invoice at all", async () => {
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proAfterUpdate({ latest_invoice: null }));
    expect(await confirm()).toEqual({ ok: false, reason: "update_invoice_absent" });
    // The slot and the projection gate stay held: no terminal state at all.
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("dispatching");
  });

  it("never replaces a CAPTURED invoice with a newer `latest_invoice`", async () => {
    seedOperation({ state: "awaiting_payment", invoiceId: UPDATED_INVOICE, attempts: 2 });
    const newer = paidInvoice(NOW_S, { id: "in_NEWER", billing_reason: "subscription_update" });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate({ latest_invoice: newer })];
    await confirm();
    // The invoice READ is the captured one; the newer invoice is never fetched
    // and never recorded.
    const paths = calls.map((call) => new URL(call.url).pathname);
    expect(paths).toContain(`/v1/invoices/${UPDATED_INVOICE}`);
    expect(paths).not.toContain("/v1/invoices/in_NEWER");
    expect(operations.get(OPERATION)?.invoiceId).toBe(UPDATED_INVOICE);
  });

  it.each([
    ["another plan", { planId: "agency" as const }],
    ["another seat count", { seats: 4 }],
    ["another amount", { amount: 1 }],
    ["another currency", { currency: "pln" }],
  ])("refuses a confirmation naming %s, dispatching nothing", async (_label, over) => {
    expect(await confirm(over)).toEqual({ ok: false, reason: "quote_tampered" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_begin_operation");
    expect(rpcNames()).not.toContain("stripe_commercial_consume_quote");
  });

  it("refuses an unknown, foreign or unreadable quote", async () => {
    rpcTable({ stripe_commercial_read_quote: [] });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_unknown" });
    rpcTable({
      stripe_commercial_read_quote: [increaseQuoteRow({ subscription_id: "sub_test_x" })],
    });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_foreign" });
    rpcTable({ stripe_commercial_read_quote: [increaseQuoteRow({ kind: "refund" })] });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_unreadable" });
    rpcTable({ stripe_commercial_read_quote: new RpcError() });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_unavailable" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
  });

  it("refuses a quote the re-read PROVES was expired, releasing the slot under CAS", async () => {
    // A deterministic rejection: the consumption raises AND the scoped re-read
    // shows an unconsumed quote whose TTL has passed. That is a real refusal,
    // not a lost acknowledgment.
    rpcTable({
      stripe_commercial_consume_quote: new RpcError("stripe_commercial_quote_expired"),
      stripe_commercial_read_quote: [
        increaseQuoteRow({ expires_at: new Date(NOW_MS - 1).toISOString() }),
      ],
    });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_refused" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    // The operation is settled `refused`, so the customer can prepare afresh —
    // and the refusal asserts `prepared`, so it cannot close a dispatched one.
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "refused",
      p_refusal: "quote_refused",
      p_expected_state: "prepared",
    });
  });

  it("refuses a quote the re-read PROVES another operation consumed", async () => {
    rpcTable({
      stripe_commercial_consume_quote: new RpcError("stripe_commercial_quote_consumed"),
      stripe_commercial_read_quote: [
        increaseQuoteRow({ consumed_by: "00000000-0000-4000-8000-0000000000af" }),
      ],
    });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_refused" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "refused",
      p_refusal: "quote_refused",
    });
  });

  it("is UNCERTAIN, never refused, when a healthy quote's consumption LOSES its response", async () => {
    // The decisive correction. The consumption raises, but the scoped re-read
    // shows a quote that is unconsumed, unexpired and still bound to exactly
    // these terms — so the call should have worked and its missing response
    // cannot be read as a verdict. Finalising this as `refused` permanently
    // destroyed a valid confirmation with nothing dispatched.
    rpcTable({ stripe_commercial_consume_quote: new RpcError("transport failure") });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_consumption_uncertain" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    // NOTHING terminal: the operation stays open and recoverable.
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("CONTINUES when the re-read proves THIS operation already consumed the quote", async () => {
    // Committed, acknowledgment lost. The quote is spent by this exact
    // operation, so the attempt dispatches instead of being refused.
    let consumed = false;
    rpcTable({
      stripe_commercial_consume_quote: () => {
        consumed = true;
        throw new Error("lost acknowledgment");
      },
      stripe_commercial_read_quote: () =>
        consumed ? [increaseQuoteRow({ consumed_by: OPERATION })] : [increaseQuoteRow()],
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);
  });

  it("is UNCERTAIN when the recovery re-read itself cannot be performed", async () => {
    let first = true;
    rpcTable({
      stripe_commercial_consume_quote: new RpcError("transport failure"),
      stripe_commercial_read_quote: () => {
        if (first) {
          first = false;
          return [increaseQuoteRow()];
        }
        throw new Error("read failed");
      },
    });
    expect(await confirm()).toEqual({ ok: false, reason: "quote_consumption_uncertain" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(providerPosts()).toHaveLength(0);
  });

  it("does NOT re-consume a quote this exact operation already spent", async () => {
    // An attempt that spent the quote and then lost its acknowledgment before
    // advancing must still be able to dispatch.
    rpcTable({ stripe_commercial_read_quote: [increaseQuoteRow({ consumed_by: OPERATION })] });
    seedOperation();
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(rpcNames()).not.toContain("stripe_commercial_consume_quote");
  });

  it("refuses when the item state moved under the quote", async () => {
    // A different seat item id makes the selection fingerprint disagree.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 2)];
    rpcTable({
      stripe_commercial_current_subscription: [
        {
          customer_id: COMMERCIAL_CUSTOMER,
          subscription_id: COMMERCIAL_SUBSCRIPTION,
          plan_id: "pro",
          status: "active",
          seat_quantity: 2,
        },
      ],
    });
    const result = await confirm();
    expect(result.ok).toBe(false);
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
  });

  it("refuses a duplicate or concurrent confirmation held by another operation", async () => {
    rpcTable({
      stripe_commercial_begin_operation: new RpcError("stripe_commercial_operation_open"),
    });
    expect(await confirm()).toEqual({ ok: false, reason: "operation_unavailable" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_consume_quote");
  });

  it("reports an already-applied operation without dispatching again", async () => {
    seedOperation({ state: "applied", attempts: 2 });
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_consume_quote");
  });

  it("reports refused and failed replays accurately and keeps them terminal", async () => {
    seedOperation({ state: "refused", attempts: 2 });
    expect(await confirm()).toEqual({ ok: false, reason: "operation_refused" });
    operations = new Map();
    seedOperation({ state: "failed", attempts: 2 });
    expect(await confirm()).toEqual({ ok: false, reason: "operation_failed" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses to resume an operation whose durable selection is not the quote's", async () => {
    // A changed registry or a changed item id cannot rewrite the original
    // intent: the stored selection must be the one the DURABLE QUOTE priced.
    seedOperation({ selectionDetail: "pro#0#si_OTHER#price_tpro#-#-", attempts: 2 });
    expect(await confirm()).toEqual({ ok: false, reason: "operation_selection_unbound" });
    expect(providerPosts()).toHaveLength(0);
    // An unparseable stored selection is held, never half-understood.
    operations = new Map();
    seedOperation({ selectionDetail: "pro#0#si_base", attempts: 2 });
    expect(await confirm()).toEqual({ ok: false, reason: "operation_selection_unreadable" });
  });

  it("a CHANGED REGISTRY cannot rewrite the original intent of a resumed attempt", async () => {
    // The configured `pro` base price has moved since the quote was issued, and
    // the subscription now carries the NEW price. A resumed attempt must still
    // name the ORIGINAL price — the one the customer confirmed and paid for —
    // and must therefore report the change as NOT applied rather than quietly
    // accepting today's configuration as the confirmed selection.
    seedOperation({ state: "dispatching", attempts: 2 });
    const movedEnv = {
      ...COMMERCIAL_ENV,
      STRIPE_PRICE_PRO_BASE_TEST: `price_tpro_v2:${PRODUCT_IDS.pro}:eur:month`,
    };
    routes["GET /v1/prices/price_tpro_v2"] = () =>
      json(priceObject("price_tpro_v2", PRODUCT_IDS.pro, APPROVED_MINOR.proBase));
    const onNewPrice = growthSubscription(NOW_S, {
      items: {
        object: "list",
        has_more: false,
        data: [
          subscriptionItem(
            {
              id: "si_base",
              priceId: "price_tpro_v2",
              productId: PRODUCT_IDS.pro,
              quantity: 1,
            },
            NOW_S,
          ),
        ],
      },
      latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE),
    });
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(onNewPrice);
    subscriptionQueue = [growthSubscription(NOW_S), onNewPrice];
    const result = await confirmSubscriptionChange(
      {
        userId: COMMERCIAL_OWNER,
        operationId: OPERATION,
        quoteId: QUOTE,
        mode: "test",
        targetPlanId: "pro",
        targetSeatQuantity: 0,
        expectedAmountMinor: QUOTED_INCREASE,
        expectedCurrency: "eur",
      },
      deps({ env: movedEnv }),
    );
    expect(result).toEqual({ ok: false, reason: "change_not_applied_base_price" });
    // The replay named the ORIGINAL price, not today's.
    expect(bodyOf(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`).get("items[0][price]")).toBe(
      PRICE_IDS.proBase,
    );
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("preserves the previous allowance on an SCA / pending update", async () => {
    const pending = updateInvoice(NOW_S, QUOTED_INCREASE, {
      status: "open",
      amount_paid: 0,
      amount_remaining: QUOTED_INCREASE,
    });
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(growthSubscription(NOW_S, { pending_update: {}, latest_invoice: pending }));
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () => json(pending);
    subscriptionQueue = [
      growthSubscription(NOW_S),
      // The provider accepted the update but the payment is incomplete: items
      // unchanged, pending_update set.
      growthSubscription(NOW_S, { pending_update: {}, latest_invoice: pending }),
    ];
    expect(await confirm()).toEqual({ ok: false, reason: "change_invoice_unpaid" });
    // Non-terminal, nothing applied, and NO prohibited same-state write.
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("awaiting_payment");
    expect(
      rpcArgs("stripe_commercial_advance_operation").filter(
        (args) =>
          args.p_state === "awaiting_payment" && args.p_expected_state === "awaiting_payment",
      ),
    ).toEqual([]);
  });

  it("SETTLES an SCA flow that later pays and applies, through awaiting_apply", async () => {
    // The sequence the old code could not express at all: a resumed
    // `awaiting_payment` asked for `awaiting_payment` again, which SQL rejects.
    seedOperation({ state: "awaiting_payment", invoiceId: UPDATED_INVOICE, attempts: 2 });
    // Payment proved, items not yet applied: the base item still carries the
    // OLD price, which is what the exact selection comparison reports.
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm()).toEqual({ ok: false, reason: "change_not_applied_base_price" });
    expect(operations.get(OPERATION)?.state).toBe("awaiting_apply");

    // The next attempt sees both proofs and finishes from awaiting_apply.
    calls = [];
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(operations.get(OPERATION)?.state).toBe("applied");
    // ZERO new POSTs: the whole settlement was read-only.
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
  });

  it("never regresses awaiting_apply back to awaiting_payment", async () => {
    seedOperation({ state: "awaiting_apply", invoiceId: UPDATED_INVOICE, attempts: 2 });
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () =>
      json(
        updateInvoice(NOW_S, QUOTED_INCREASE, {
          status: "open",
          amount_paid: 0,
          amount_remaining: QUOTED_INCREASE,
        }),
      );
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm()).toEqual({ ok: false, reason: "change_invoice_unpaid" });
    expect(operations.get(OPERATION)?.state).toBe("awaiting_apply");
    expect(
      rpcArgs("stripe_commercial_advance_operation").filter(
        (args) => args.p_state === "awaiting_payment",
      ),
    ).toEqual([]);
  });

  it("HOLDS awaiting_payment with no captured invoice instead of inferring provenance", async () => {
    seedOperation({ state: "awaiting_payment", invoiceId: null, attempts: 2 });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "update_invoice_provenance_missing" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses to apply without a durable baseline to compare against", async () => {
    seedOperation({ baselineInvoiceId: null });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "change_invoice_baseline_absent" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("recovers a lost POST acknowledgment by an IDENTICAL retained replay", async () => {
    seedOperation({ state: "dispatching", invoiceId: null, attempts: 2 });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    const replays = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(replays).toHaveLength(1);
    // Same endpoint, same key, same parameters — no repricing.
    expect(replays[0].headers["Idempotency-Key"]).toBe(
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
    );
    const body = new URLSearchParams(replays[0].body);
    expect(body.get("items[0][price]")).toBe(PRICE_IDS.proBase);
    expect(body.get("proration_date")).toBe(String(NOW_S));
    expect(operations.get(OPERATION)?.invoiceId).toBe(UPDATED_INVOICE);
  });

  it("re-reads the SAME invoice id after a lost capture acknowledgment", async () => {
    let advances = 0;
    rpcTable({
      stripe_commercial_advance_operation: (args: unknown) => {
        const call = args as Record<string, unknown>;
        // The compare-and-set SUCCEEDS in the database; its response is lost.
        operationRpc("stripe_commercial_advance_operation", call);
        advances += 1;
        if (call.p_state === "awaiting_payment" && advances === 2)
          throw new Error("lost acknowledgment");
        return true;
      },
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    // The readback found the same captured id, so settlement continued without
    // repeating a prohibited same-state write.
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(operations.get(OPERATION)?.invoiceId).toBe(UPDATED_INVOICE);
  });

  it("is UNCERTAIN, never failed, when the dispatch times out", async () => {
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => {
      throw new Error("socket timeout");
    };
    expect(await confirm()).toEqual({ ok: false, reason: "change_uncertain" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("dispatching");
  });

  it("an UNCHANGED fingerprint past retention is UNKNOWN: held, never failed", async () => {
    // The corrected rule. A deferred POST, an unchanged GET and expired
    // retention do NOT prove the dispatch did not happen — a concurrent
    // provider request may still complete — so the slot and the projection gate
    // stay held and ZERO new mutation is sent.
    seedOperation({ state: "dispatching", invoiceId: null, attempts: 2 });
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm({ now: NOW_MS + 24 * 3600 * 1000 + 1 })).toEqual({
      ok: false,
      reason: "update_ack_unrecoverable",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("fenced");
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("settles an undispatched attempt at exactly the 24h boundary, with zero mutations", async () => {
    // The comparison is STRICT: retention is documented as "at least 24 hours",
    // so the boundary itself is already outside the guarantee. A `prepared`
    // operation provably never dispatched, so it is settled `failed` (slot
    // released) rather than fenced, and the quote is not spent.
    expect(await confirm({ now: NOW_MS + 24 * 3600 * 1000 })).toEqual({
      ok: false,
      reason: "operation_expired",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_consume_quote");
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "failed",
      p_refusal: "retention_elapsed_undispatched",
      p_expected_state: "prepared",
    });
    // One millisecond inside the window is the positive control.
    resetServerMocks();
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm({ now: NOW_MS + 24 * 3600 * 1000 - 1 })).toMatchObject({ ok: true });
  });

  it("FENCES when the boundary is crossed during the awaited reads, before the POST", async () => {
    // The clock stays inside the window for the context read and the
    // pre-consumption check, then crosses it before the dispatch guard — which
    // is exactly the window the awaited price read and quote consumption open.
    const clock = (() => {
      let call = 0;
      return () => (call++ < 2 ? NOW_MS : NOW_MS + 24 * 3600 * 1000 + 5);
    })();
    expect(await confirm({ now: clock })).toEqual({ ok: false, reason: "operation_fenced" });
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_advance_operation")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ p_state: "fenced", p_expected_state: "dispatching" }),
      ]),
    );
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  const decreaseContext = (over: Record<string, unknown> = {}) => ({
    stripe_commercial_current_subscription: [
      {
        customer_id: COMMERCIAL_CUSTOMER,
        subscription_id: COMMERCIAL_SUBSCRIPTION,
        plan_id: "pro",
        status: "active",
        seat_quantity: 3,
      },
    ],
    stripe_commercial_read_quote: [decreaseQuoteRow()],
    stripe_commercial_consume_quote: [decreaseQuoteRow()],
    ...over,
  });

  it("A STALE PREPARED WORKER cannot close an operation another instance dispatched", async () => {
    // Instance B has already moved the operation to `dispatching`. Instance A,
    // which read `prepared` and then failed its capacity check, must NOT refuse
    // it: A's compare-and-set is rejected and B's operation stays open.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcTable(
      decreaseContext({
        stripe_commercial_membership_usage: () => {
          const row = operations.get(OPERATION);
          if (row) row.state = "dispatching";
          return [{ working: 7, viewer: 1, known: true, projects: 1, projects_known: true }];
        },
      }),
    );
    seedOperation({ selectionDetail: DECREASE_SELECTION });
    expect(await confirm({ planId: "growth", seats: 0, amount: 0 })).toEqual({
      ok: false,
      reason: "operation_conflict",
    });
    expect(operations.get(OPERATION)?.state).toBe("dispatching");
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
    expect(providerPosts()).toHaveLength(0);
  });

  it("holds when the capacity check fails at CONFIRMATION even though preparation passed", async () => {
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcTable(
      decreaseContext({
        // The team grew between preparation and confirmation.
        stripe_commercial_membership_usage: [
          { working: 7, viewer: 1, known: true, projects: 1, projects_known: true },
        ],
      }),
    );
    // A FIRST attempt that fails its re-check creates no operation at all, so
    // there is no slot to hold and nothing to close.
    expect(await confirm({ planId: "growth", seats: 0, amount: 0 })).toEqual({
      ok: false,
      reason: "capacity_conflict_working",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_begin_operation");
    expect(rpcNames()).not.toContain("stripe_commercial_consume_quote");

    // A RESUMED `prepared` operation does hold the slot, so its refusal is
    // written — under the compare-and-set that protects a dispatched one.
    resetServerMocks(
      decreaseContext({
        stripe_commercial_membership_usage: [
          { working: 7, viewer: 1, known: true, projects: 1, projects_known: true },
        ],
      }),
    );
    seedOperation({ selectionDetail: DECREASE_SELECTION });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirm({ planId: "growth", seats: 0, amount: 0 })).toEqual({
      ok: false,
      reason: "capacity_conflict_working",
    });
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "refused",
      p_refusal: "capacity_conflict_working",
      p_expected_state: "prepared",
    });
  });

  it("returns recoverable uncertainty when finish returns false or throws", async () => {
    rpcTable({ stripe_commercial_finish_operation: () => false });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "change_settlement_uncertain" });

    resetServerMocks({
      stripe_commercial_finish_operation: () => {
        throw new Error("lost acknowledgment");
      },
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "change_settlement_uncertain" });
  });

  it("reports the durable `applied` outcome after a lost FINISH acknowledgment", async () => {
    rpcTable({
      stripe_commercial_finish_operation: (args: unknown) => {
        operationRpc("stripe_commercial_finish_operation", args as Record<string, unknown>);
        throw new Error("lost acknowledgment");
      },
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(operations.get(OPERATION)?.state).toBe("applied");
  });
});

describe("confirming a reduction: durable two-step dispatch and read-only recovery", () => {
  const decreaseRpc = (over: Record<string, unknown> = {}) => ({
    stripe_commercial_current_subscription: [
      {
        customer_id: COMMERCIAL_CUSTOMER,
        subscription_id: COMMERCIAL_SUBSCRIPTION,
        plan_id: "pro",
        status: "active",
        seat_quantity: 3,
      },
    ],
    stripe_commercial_read_quote: [decreaseQuoteRow()],
    stripe_commercial_consume_quote: [decreaseQuoteRow()],
    ...over,
  });
  const confirmDecrease = (over: Parameters<typeof confirm>[0] = {}) =>
    confirm({ planId: "growth", seats: 0, amount: 0, ...over });
  const decreaseState = () => {
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
  };
  /** A resumed reduction whose terms are already captured durably. */
  const seedCaptured = (over: Partial<StoredOperation> = {}) =>
    seedOperation({
      state: "awaiting_apply",
      attempts: 2,
      selectionDetail: DECREASE_SELECTION,
      scheduleId: "sub_sched_1",
      payload: JSON.parse(JSON.stringify(expectedReductionPayload())),
      ...over,
    });

  it("CAPTURES the complete terms atomically BEFORE the first phases POST", async () => {
    decreaseState();
    rpcTable(decreaseRpc());
    const result = await confirmDecrease();
    expect(result).toMatchObject({
      ok: true,
      state: "scheduled",
      direction: "decrease",
      amountDueMinor: 0,
      effectiveAt: new Date(PERIOD_END * 1000).toISOString(),
    });
    // from_subscription is never combined with phase modifications.
    const adopt = postsTo("/v1/subscription_schedules");
    expect(adopt).toHaveLength(1);
    const adoptBody = new URLSearchParams(adopt[0].body);
    expect(adoptBody.get("from_subscription")).toBe(COMMERCIAL_SUBSCRIPTION);
    expect([...adoptBody.keys()]).toEqual(["from_subscription"]);
    expect(adopt[0].headers["Idempotency-Key"]).toBe(
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}:adopt`,
    );
    // THE CAPTURE: one atomic dispatching -> awaiting_apply compare-and-set
    // carrying the schedule AND the complete payload, and it happens BEFORE the
    // phases POST.
    const capture = rpcArgs("stripe_commercial_advance_operation").find(
      (args) => args.p_reduction_payload !== null && args.p_reduction_payload !== undefined,
    );
    expect(capture).toMatchObject({
      p_state: "awaiting_apply",
      p_expected_state: "dispatching",
      p_schedule: "sub_sched_1",
    });
    expect(capture?.p_reduction_payload).toEqual(expectedReductionPayload());
    const captureCall = mocks.rpc.mock.calls.findIndex(
      (call) =>
        call[0] === "stripe_commercial_advance_operation" &&
        (call[1] as Record<string, unknown>).p_reduction_payload,
    );
    expect(captureCall).toBeGreaterThanOrEqual(0);
    // The phase update is its own durable step with its own key.
    const phases = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(phases).toHaveLength(1);
    expect(phases[0].headers["Idempotency-Key"]).toBe(
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}:phases`,
    );
    const body = new URLSearchParams(phases[0].body);
    // Release, never cancel, after the final phase.
    expect(body.get("end_behavior")).toBe("release");
    // BOTH proration levels are set, and they are different settings.
    expect(body.get("proration_behavior")).toBe("none");
    expect(body.get("phases[0][proration_behavior]")).toBe("none");
    expect(body.get("phases[1][proration_behavior]")).toBe("none");
    // The paid phase is restated from the VALIDATED ORIGINAL adoption reply.
    expect(body.get("phases[0][start_date]")).toBe(String(PERIOD_START));
    expect(body.get("phases[0][end_date]")).toBe(String(PERIOD_END));
    expect(body.get("phases[0][items][0][price]")).toBe(PRICE_IDS.proBase);
    expect(body.get("phases[0][items][1][price]")).toBe(PRICE_IDS.proSeat);
    expect(body.get("phases[0][items][1][quantity]")).toBe("3");
    // The next phase starts exactly at the paid period end, with the reduced
    // items and NO end_date.
    expect(body.get("phases[1][start_date]")).toBe(String(PERIOD_END));
    expect(body.get("phases[1][items][0][price]")).toBe(PRICE_IDS.growthBase);
    expect(body.get("phases[1][items][1][price]")).toBeNull();
    expect(body.get("phases[1][end_date]")).toBeNull();
    // The original INHERITED its collection method, so neither phase names one.
    expect(body.get("phases[0][collection_method]")).toBeNull();
    expect(body.get("phases[1][collection_method]")).toBeNull();
    // No subscription mutation at all, and no immediate charge.
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
    expect(result.ok && result.note).toContain("no team member is removed");
  });

  it("preserves an EXPLICIT phase payment and collection method in both phases", async () => {
    decreaseState();
    rpcTable(decreaseRpc());
    const explicit = adoptedSchedule({
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      items: PAID_ITEMS,
      phaseOver: {
        collection_method: "charge_automatically",
        default_payment_method: "pm_card_1",
      },
    });
    routes["POST /v1/subscription_schedules"] = () => json(explicit);
    const preserved = reducedScheduleFixture({
      phases: reducedScheduleFixture().phases.map((phase) => ({
        ...phase,
        collection_method: "charge_automatically",
        default_payment_method: "pm_card_1",
      })),
    });
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () => json(preserved);
    routes["POST /v1/subscription_schedules/sub_sched_1"] = () => json(preserved);
    expect(await confirmDecrease()).toMatchObject({ ok: true, state: "scheduled" });
    const body = new URLSearchParams(postsTo("/v1/subscription_schedules/sub_sched_1")[0].body);
    for (const index of [0, 1]) {
      expect(body.get(`phases[${index}][collection_method]`)).toBe("charge_automatically");
      expect(body.get(`phases[${index}][default_payment_method]`)).toBe("pm_card_1");
    }
  });

  it("HOLDS an adoption reply outside the supported profile, capturing nothing", async () => {
    decreaseState();
    rpcTable(decreaseRpc());
    routes["POST /v1/subscription_schedules"] = () =>
      json(
        adoptedSchedule({
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          items: PAID_ITEMS,
          phaseOver: { default_tax_rates: ["txr_1"] },
        }),
      );
    expect(await confirmDecrease()).toEqual({
      ok: false,
      reason: "reduction_adoption_phase_unsupported_default_tax_rates",
    });
    // Nothing captured, no phases POST, slot still held.
    expect(operations.get(OPERATION)?.payload).toBeNull();
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("deletes the exact existing seat item when seats drop to zero", async () => {
    decreaseState();
    const seatOnlySelection = selectionFingerprintInput({
      targetPlanId: "pro",
      targetSeatQuantity: 0,
      baseItemId: "si_base",
      basePriceId: PRICE_IDS.proBase,
      seatItemId: "si_seat",
      seatPriceId: null,
    });
    const seatOnlyQuote = decreaseQuoteRow({
      target_plan_id: "pro",
      selection_fingerprint: digest(seatOnlySelection),
    });
    rpcTable(
      decreaseRpc({
        stripe_commercial_read_quote: [seatOnlyQuote],
        stripe_commercial_consume_quote: [seatOnlyQuote],
      }),
    );
    const proOnly = () =>
      json(
        reductionSchedule({
          nowSeconds: NOW_S,
          currentItems: PAID_ITEMS,
          nextItems: [{ priceId: PRICE_IDS.proBase, quantity: 1 }],
          periodEnd: PERIOD_END,
          periodStart: PERIOD_START,
        }),
      );
    routes["GET /v1/subscription_schedules/sub_sched_1"] = proOnly;
    routes["POST /v1/subscription_schedules/sub_sched_1"] = proOnly;
    expect(await confirm({ planId: "pro", seats: 0, amount: 0 })).toMatchObject({
      ok: true,
      state: "scheduled",
    });
    const body = new URLSearchParams(postsTo("/v1/subscription_schedules/sub_sched_1")[0].body);
    expect(body.get("phases[1][items][0][price]")).toBe(PRICE_IDS.proBase);
    expect(body.get("phases[1][items][1][price]")).toBeNull();
  });

  it("refuses a resulting schedule that cancels instead of releasing", async () => {
    decreaseState();
    rpcTable(decreaseRpc());
    const cancelling = () => json(reducedScheduleFixture({ end_behavior: "cancel" }));
    routes["POST /v1/subscription_schedules/sub_sched_1"] = cancelling;
    routes["GET /v1/subscription_schedules/sub_sched_1"] = cancelling;
    expect(await confirmDecrease()).toEqual({
      ok: false,
      reason: "schedule_end_behavior_unexpected",
    });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("REJECTS a read-back whose PAID phase was altered (price or quantity 999)", async () => {
    seedCaptured();
    decreaseState();
    rpcTable(decreaseRpc());
    const altered = () =>
      json(
        reductionSchedule({
          nowSeconds: NOW_S,
          currentItems: [
            { priceId: PRICE_IDS.proBase, quantity: 1 },
            { priceId: PRICE_IDS.proSeat, quantity: 999 },
          ],
          nextItems: TARGET_ITEMS,
          periodEnd: PERIOD_END,
          periodStart: PERIOD_START,
        }),
      );
    routes["GET /v1/subscription_schedules/sub_sched_1"] = altered;
    routes["POST /v1/subscription_schedules/sub_sched_1"] = altered;
    expect(await confirmDecrease()).toEqual({
      ok: false,
      reason: "schedule_phase0_items_unexpected",
    });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("REJECTS a read-back whose material phase settings changed", async () => {
    seedCaptured();
    decreaseState();
    rpcTable(decreaseRpc());
    const moved = () =>
      json(
        reducedScheduleFixture({
          default_settings: scheduleDefaultSettings({ default_payment_method: "pm_moved" }),
        }),
      );
    routes["GET /v1/subscription_schedules/sub_sched_1"] = moved;
    routes["POST /v1/subscription_schedules/sub_sched_1"] = moved;
    expect(await confirmDecrease()).toEqual({
      ok: false,
      reason: "schedule_default_settings_changed",
    });
  });

  it("refuses to adopt or overwrite a FOREIGN schedule", async () => {
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3, { schedule: "sub_sched_SOMEONE" })];
    rpcTable(decreaseRpc());
    expect(await confirmDecrease()).toEqual({ ok: false, reason: "schedule_conflict" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("stays uncertain when the adoption or the phase update times out", async () => {
    decreaseState();
    rpcTable(decreaseRpc());
    routes["POST /v1/subscription_schedules"] = () => {
      throw new Error("socket timeout");
    };
    expect(await confirmDecrease()).toEqual({ ok: false, reason: "schedule_adopt_uncertain" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("dispatching");

    resetServerMocks(decreaseRpc());
    decreaseState();
    routes["POST /v1/subscription_schedules"] = () => json(adoptedScheduleFixture());
    routes["POST /v1/subscription_schedules/sub_sched_1"] = () => {
      throw new Error("socket timeout");
    };
    expect(await confirmDecrease()).toEqual({ ok: false, reason: "schedule_update_uncertain" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    // The terms were still captured BEFORE the POST, so recovery is possible.
    expect(operations.get(OPERATION)?.payload).toEqual(expectedReductionPayload());
  });

  it("recovers an adoption that succeeded then lost its ACK, by an IDENTICAL replay", async () => {
    // Dispatching, no schedule and no payload: the adoption may or may not have
    // happened, and a latest-schedule GET is NOT original-phase evidence.
    seedOperation({ state: "dispatching", attempts: 2, selectionDetail: DECREASE_SELECTION });
    decreaseState();
    rpcTable(decreaseRpc());
    expect(await confirmDecrease()).toMatchObject({ ok: true, state: "scheduled" });
    const adopt = postsTo("/v1/subscription_schedules");
    expect(adopt).toHaveLength(1);
    expect(adopt[0].headers["Idempotency-Key"]).toBe(
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}:adopt`,
    );
    // The replay's reply is what the captured terms were built from.
    expect(operations.get(OPERATION)?.payload).toEqual(expectedReductionPayload());
  });

  it("requires an EXACT readback after a lost capture ACK, before any phases POST", async () => {
    let advances = 0;
    rpcTable(
      decreaseRpc({
        stripe_commercial_advance_operation: (args: unknown) => {
          const call = args as Record<string, unknown>;
          operationRpc("stripe_commercial_advance_operation", call);
          advances += 1;
          // The capture COMMITS and its acknowledgment is lost.
          if (call.p_reduction_payload) throw new Error("lost acknowledgment");
          return advances > 0;
        },
      }),
    );
    decreaseState();
    // The schedule still carries only its adopted phase when recovery verifies.
    scheduleQueue = [adoptedScheduleFixture()];
    expect(await confirmDecrease()).toMatchObject({ ok: true, state: "scheduled" });
    // Exactly one phases POST, and it came AFTER the readback proved the stored
    // schedule and payload.
    const phases = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(phases).toHaveLength(1);
    const names = rpcNames();
    expect(names).toContain("stripe_commercial_read_operation");
    const readIndex = names.indexOf("stripe_commercial_read_operation");
    const captureIndex = mocks.rpc.mock.calls.findIndex(
      (call) =>
        call[0] === "stripe_commercial_advance_operation" &&
        (call[1] as Record<string, unknown>).p_reduction_payload,
    );
    expect(readIndex).toBeGreaterThan(captureIndex);
  });

  it("a CAS LOSER never POSTs its own candidate body", async () => {
    // Instance A adopts and builds its terms; instance B has already captured a
    // DIFFERENT (earlier) schedule and payload, so A's capture is rejected and A
    // must dispatch only the durable winner's body.
    const winner = expectedReductionPayload();
    rpcTable(
      decreaseRpc({
        stripe_commercial_advance_operation: (args: unknown) => {
          const call = args as Record<string, unknown>;
          if (call.p_reduction_payload) {
            // B won the race in between.
            const row = operations.get(OPERATION);
            if (row) {
              row.state = "awaiting_apply";
              row.scheduleId = "sub_sched_1";
              row.payload = JSON.parse(JSON.stringify(winner));
            }
            return false;
          }
          return operationRpc("stripe_commercial_advance_operation", call);
        },
      }),
    );
    decreaseState();
    scheduleQueue = [adoptedScheduleFixture()];
    expect(await confirmDecrease()).toMatchObject({ ok: true, state: "scheduled" });
    const phases = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(phases).toHaveLength(1);
    const body = new URLSearchParams(phases[0].body);
    // The winner's stored body, serialised deterministically.
    expect(body.get("phases[0][start_date]")).toBe(String(winner.request.phases[0].start_date));
    expect(body.get("phases[1][start_date]")).toBe(String(winner.effectiveBoundary));
    // Only ONE payload was ever stored.
    expect(operations.get(OPERATION)?.payload).toEqual(winner);
  });

  it("HOLDS a resumed reduction with no durable payload and no admissible replay", async () => {
    seedOperation({ state: "dispatching", attempts: 2, selectionDetail: DECREASE_SELECTION });
    decreaseState();
    rpcTable(decreaseRpc());
    // Past retention: no POST at all, and an unchanged subscription/absent
    // schedule does NOT prove the adoption had no effect.
    expect(await confirmDecrease({ now: NOW_MS + 24 * 3600 * 1000 + 1 })).toEqual({
      ok: false,
      reason: "schedule_adopt_unrecoverable",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(operations.get(OPERATION)?.state).toBe("fenced");
  });

  it("completes READ-ONLY after a lost phases ACK, a restart, a rollover and expired retention", async () => {
    // The whole point of the durable payload: the schedule already carries the
    // dispatched reduction, the process restarted, the period rolled over and
    // idempotency retention has expired. Completion must be a pure read.
    seedCaptured();
    const rolled = proWithSeatsSubscription(NOW_S + 40 * 86_400, 3);
    subscriptionQueue = [rolled];
    rpcTable(decreaseRpc());
    const result = await confirmDecrease({ now: NOW_MS + 30 * 86_400_000 });
    expect(result).toMatchObject({ ok: true, state: "scheduled" });
    // ZERO POSTs of any kind.
    expect(providerPosts()).toHaveLength(0);
    expect(operations.get(OPERATION)?.state).toBe("applied");
  });

  it("serialises the IDENTICAL phase parameters across a registry and period change", async () => {
    const serialise = async (env: Record<string, string>, subscription: unknown) => {
      resetServerMocks(decreaseRpc());
      seedCaptured();
      subscriptionQueue = [subscription];
      // Force a dispatch by making the first read-back not match.
      routes["GET /v1/subscription_schedules/sub_sched_1"] = () => json(adoptedScheduleFixture());
      routes["POST /v1/subscription_schedules/sub_sched_1"] = () => json(reducedScheduleFixture());
      await confirmDecrease({ env });
      const posts = postsTo("/v1/subscription_schedules/sub_sched_1");
      return posts.length > 0 ? [...new URLSearchParams(posts[0].body)].sort() : null;
    };
    const first = await serialise(COMMERCIAL_ENV, proWithSeatsSubscription(NOW_S, 3));
    const retry = await serialise(
      {
        ...COMMERCIAL_ENV,
        STRIPE_PRICE_GROWTH_BASE_TEST: `price_tgrowth_v2:${PRODUCT_IDS.growth}:eur:month`,
      },
      proWithSeatsSubscription(NOW_S + 5 * 86_400, 3),
    );
    expect(first).not.toBeNull();
    expect(retry).toEqual(first);
    // And the body still names the ORIGINAL target price.
    expect(JSON.stringify(first)).toContain(PRICE_IDS.growthBase);
  });

  it("sends ZERO POSTs when retention or the boundary is crossed during the awaited work", async () => {
    seedCaptured();
    decreaseState();
    rpcTable(decreaseRpc());
    // The read-back does not match, so a POST would otherwise follow — but the
    // guards are re-taken after the awaited read, so the attempt is fenced and
    // reports what the schedule actually does not say.
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () => json(adoptedScheduleFixture());
    expect(await confirmDecrease({ now: NOW_MS + 24 * 3600 * 1000 + 1 })).toEqual({
      ok: false,
      reason: "schedule_phase_count",
    });
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
    expect(operations.get(OPERATION)?.state).toBe("fenced");

    // A MISSED effective boundary is never moved to a new date and never
    // authorises a late reduction. The operation is still inside retention —
    // only the boundary has passed — and the subscription has rolled on.
    resetServerMocks(decreaseRpc());
    seedCaptured({ createdAt: new Date((PERIOD_END - 3600) * 1000).toISOString() });
    subscriptionQueue = [proWithSeatsSubscription(PERIOD_END + 60, 3)];
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () => json(adoptedScheduleFixture());
    expect(await confirmDecrease({ now: (PERIOD_END + 60) * 1000 })).toEqual({
      ok: false,
      reason: "schedule_phase_count",
    });
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
    expect(operations.get(OPERATION)?.state).toBe("fenced");
  });

  it("an unmatched read-back after a dispatch is HELD with its reason, never failed", async () => {
    seedCaptured();
    decreaseState();
    rpcTable(decreaseRpc());
    // Both the pre-dispatch and the post-dispatch read show a shape that is not
    // what was confirmed.
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () =>
      json(reducedScheduleFixture({ status: "released" }));
    expect(await confirmDecrease()).toEqual({ ok: false, reason: "schedule_status_unexpected" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    // One attempt is one dispatch: no inner retry loop.
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(1);
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("rejects a stored payload that no longer matches this operation", async () => {
    const foreign = JSON.parse(JSON.stringify(expectedReductionPayload()));
    foreign.subscriptionId = "sub_other";
    seedCaptured({ payload: foreign });
    decreaseState();
    rpcTable(decreaseRpc());
    expect(await confirmDecrease()).toEqual({ ok: false, reason: "reduction_payload_linkage" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("returns recoverable uncertainty when the reduction finish fails", async () => {
    seedCaptured();
    decreaseState();
    rpcTable(decreaseRpc({ stripe_commercial_finish_operation: () => false }));
    expect(await confirmDecrease()).toEqual({
      ok: false,
      reason: "reduction_settlement_uncertain",
    });
  });
});

describe("cancellation and reversal", () => {
  const cancel = (over: { now?: number | (() => number) } = {}) =>
    requestSubscriptionCancellation(
      { userId: COMMERCIAL_OWNER, operationId: OPERATION, mode: "test" },
      deps(over),
    );
  const reverse = () =>
    reverseSubscriptionCancellation(
      {
        userId: COMMERCIAL_OWNER,
        operationId: OPERATION,
        cancelOperationId: CANCEL_OPERATION,
        mode: "test",
      },
      deps(),
    );

  it("schedules cancellation at the authoritative period end and verifies it", async () => {
    const cancelled = growthSubscription(NOW_S, {
      cancel_at_period_end: true,
      cancel_at: PERIOD_END,
    });
    subscriptionQueue = [growthSubscription(NOW_S), cancelled];
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(cancelled);
    const result = await cancel();
    expect(result).toMatchObject({
      ok: true,
      cancelAtPeriodEnd: true,
      effectiveAt: new Date(PERIOD_END * 1000).toISOString(),
    });
    expect(result.ok && result.note).toContain("until the end of the period you have paid for");
    const body = bodyOf(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(body.get("cancel_at_period_end")).toBe("true");
    expect(
      postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)[0].headers["Idempotency-Key"],
    ).toBe(`milo-can:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`);
    expect(rpcArgs("stripe_commercial_begin_operation")[0]).toMatchObject({ p_kind: "cancel" });
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({ p_state: "applied" });
    // Access is NOT revoked here; only the webhook projection may do that.
    expect(rpcNames()).not.toContain("stripe_commercial_guarded_projection");
  });

  it("resolves its OWN operation before trusting the provider's current flag", async () => {
    // A preexisting cancellation plus a `prepared` operation means the
    // cancellation is not this operation's: it is refused under a
    // compare-and-set rather than credited with somebody else's flag.
    subscriptionQueue = [growthSubscription(NOW_S, { cancel_at_period_end: true })];
    expect(await cancel()).toEqual({ ok: false, reason: "cancellation_preexisting" });
    expect(providerPosts()).toHaveLength(0);
    // The operation IS resolved — it is no longer left open and holding the slot.
    expect(rpcNames()).toContain("stripe_commercial_begin_operation");
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "refused",
      p_refusal: "cancellation_preexisting",
      p_expected_state: "prepared",
    });
    expect(isTerminalOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("SETTLES a cancellation whose POST landed but whose ACK was lost", async () => {
    // The exact strand: the flag is set, the operation is still `dispatching`,
    // and the old code returned success without ever closing it.
    seedOperation({
      state: "dispatching",
      kind: "cancel",
      attempts: 2,
      quoteId: null,
      selectionDetail: null,
      idempotencyKey: `milo-can:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
    });
    const cancelled = growthSubscription(NOW_S, {
      cancel_at_period_end: true,
      cancel_at: PERIOD_END,
    });
    subscriptionQueue = [cancelled, cancelled];
    expect(await cancel()).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    // ZERO new POSTs, and the operation is now terminal: the slot is released.
    expect(providerPosts()).toHaveLength(0);
    expect(operations.get(OPERATION)?.state).toBe("applied");
  });

  it("reports an applied cancellation replay without dispatching again", async () => {
    seedOperation({
      state: "applied",
      kind: "cancel",
      attempts: 2,
      quoteId: null,
      selectionDetail: null,
      idempotencyKey: `milo-can:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
    });
    subscriptionQueue = [growthSubscription(NOW_S, { cancel_at_period_end: true })];
    expect(await cancel()).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses to report a cancellation the provider did not actually apply", async () => {
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await cancel()).toEqual({ ok: false, reason: "cancellation_not_applied" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("returns recoverable uncertainty when the cancellation finish fails", async () => {
    const cancelled = growthSubscription(NOW_S, { cancel_at_period_end: true });
    subscriptionQueue = [growthSubscription(NOW_S), cancelled];
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(cancelled);
    rpcTable({ stripe_commercial_finish_operation: () => false });
    expect(await cancel()).toEqual({ ok: false, reason: "cancellation_settlement_uncertain" });
  });

  it("fences a cancellation past the retention boundary without dispatching", async () => {
    expect(await cancel({ now: NOW_MS + 24 * 3600 * 1000 })).toEqual({
      ok: false,
      reason: "operation_fenced",
    });
    expect(providerPosts()).toHaveLength(0);
  });

  it("stays uncertain when the cancellation dispatch times out", async () => {
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => {
      throw new Error("socket timeout");
    };
    expect(await cancel()).toEqual({ ok: false, reason: "cancellation_uncertain" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("reverses only a pending cancellation on a subscription that still exists", async () => {
    const cancelled = growthSubscription(NOW_S, {
      cancel_at_period_end: true,
      cancel_at: PERIOD_END,
    });
    subscriptionQueue = [cancelled, growthSubscription(NOW_S)];
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(growthSubscription(NOW_S));
    const result = await reverse();
    expect(result).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    expect(bodyOf(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`).get("cancel_at_period_end")).toBe(
      "false",
    );
    expect(rpcArgs("stripe_commercial_begin_operation")[0]).toMatchObject({
      p_kind: "reverse_cancel",
      p_reverses: CANCEL_OPERATION,
    });
  });

  it("NEVER recreates a subscription the provider already cancelled", async () => {
    subscriptionQueue = [
      growthSubscription(NOW_S, { status: "canceled", cancel_at_period_end: true }),
    ];
    expect(await reverse()).toEqual({ ok: false, reason: "subscription_canceled_irreversible" });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_begin_operation");
  });

  it("refuses a reversal when there is GENUINELY no cancellation to reverse", async () => {
    expect(await reverse()).toEqual({ ok: false, reason: "cancellation_absent" });
    expect(providerPosts()).toHaveLength(0);
    // The refusal RESOLVES this operation instead of leaving it open, and it
    // asserts `prepared` so it cannot close a dispatched one.
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "refused",
      p_refusal: "cancellation_absent",
      p_expected_state: "prepared",
    });
  });

  it("SETTLES a reversal whose POST landed but whose ACK was lost", async () => {
    // The absent flag is read against the DURABLE state: after a dispatch it is
    // this operation's own evidence of success, not a false failure.
    seedOperation({
      state: "dispatching",
      kind: "reverse_cancel",
      attempts: 2,
      quoteId: null,
      selectionDetail: null,
      idempotencyKey: `milo-rev:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
    });
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    expect(providerPosts()).toHaveLength(0);
    expect(operations.get(OPERATION)?.state).toBe("applied");
  });

  it("reports an applied reversal replay, and refuses one the provider undid", async () => {
    const seed = () =>
      seedOperation({
        state: "applied",
        kind: "reverse_cancel",
        attempts: 2,
        quoteId: null,
        selectionDetail: null,
        idempotencyKey: `milo-rev:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
      });
    seed();
    subscriptionQueue = [growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    operations = new Map();
    seed();
    // A cancellation that exists again is NOT silently reversed a second time.
    subscriptionQueue = [growthSubscription(NOW_S, { cancel_at_period_end: true })];
    expect(await reverse()).toEqual({ ok: false, reason: "cancellation_recreated" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("returns recoverable uncertainty when the reversal finish fails", async () => {
    subscriptionQueue = [
      growthSubscription(NOW_S, { cancel_at_period_end: true }),
      growthSubscription(NOW_S),
    ];
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(growthSubscription(NOW_S));
    rpcTable({ stripe_commercial_finish_operation: () => false });
    expect(await reverse()).toEqual({ ok: false, reason: "reversal_settlement_uncertain" });
  });

  it("refuses a reversal the database will not bind to an applied cancellation", async () => {
    subscriptionQueue = [growthSubscription(NOW_S, { cancel_at_period_end: true })];
    rpcTable({
      stripe_commercial_begin_operation: new RpcError("stripe_commercial_reversal_target_invalid"),
    });
    expect(await reverse()).toEqual({ ok: false, reason: "reversal_unavailable" });
    expect(providerPosts()).toHaveLength(0);
  });
});

describe("operator-approved support refunds", () => {
  const execute = (over: { caseId?: string; actor?: string; now?: number | (() => number) } = {}) =>
    executeApprovedRefund(
      {
        caseId: over.caseId ?? "CASE-1",
        operationId: OPERATION,
        mode: "test",
        operatorActor: over.actor ?? "operator:rafal",
      },
      deps(over),
    );
  /** A durable refund operation as a resumed attempt would find it. */
  const seedRefundOperation = (over: Partial<StoredOperation> = {}) =>
    seedOperation({
      kind: "refund",
      quoteId: null,
      selectionDetail: null,
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      idempotencyKey: `milo-ref:${COMMERCIAL_ACCOUNT_TEST}:test:CASE-1`,
      invoiceId: REFUND_INVOICE,
      baselineInvoiceId: null,
      attempts: 2,
      ...over,
    });

  it("refunds the full first payment to the original payment method and reports the copy", async () => {
    const result = await execute();
    expect(result).toMatchObject({
      ok: true,
      state: "succeeded",
      refundedMinor: APPROVED_MINOR.growthBase,
      currency: "eur",
      subscriptionDisposition: "cancelAtPeriodEndSeparately",
      accessDisposition: "retainUntilPeriodEnd",
      responseCopy: REFUND_SUPPORT_COPY.responseTime,
      settlementCopy: REFUND_SUPPORT_COPY.settlementTime,
    });
    const body = bodyOf("/v1/refunds");
    // Refunded against the exact linked payment, with a durable per-case key.
    expect(body.get("payment_intent")).toBe(REFUND_PAYMENT_INTENT);
    expect(body.get("amount")).toBe(String(APPROVED_MINOR.growthBase));
    expect(body.get("metadata[milo_refund_case]")).toBe("CASE-1");
    // Nothing about a payment method, tax, or a destination is set.
    expect(body.get("payment_method")).toBeNull();
    expect(body.get("reverse_transfer")).toBeNull();
    expect(body.get("refund_application_fee")).toBeNull();
    expect(postsTo("/v1/refunds")[0].headers["Idempotency-Key"]).toBe(
      `milo-ref:${COMMERCIAL_ACCOUNT_TEST}:test:CASE-1`,
    );
    // The reservation carried the authoritative allocation and the provider total.
    expect(rpcArgs("stripe_commercial_reserve_refund")[0]).toMatchObject({
      p_case: "CASE-1",
      p_payment: REFUND_PAYMENT_INTENT,
      p_amount: APPROVED_MINOR.growthBase,
      p_allocated_paid: APPROVED_MINOR.growthBase,
      p_provider_reserved: 0,
    });
    expect(rpcArgs("stripe_commercial_settle_refund")[0]).toMatchObject({ p_status: "succeeded" });
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({ p_state: "applied" });
    // No entitlement, no cancellation, no access change.
    expect(rpcNames()).not.toContain("stripe_commercial_guarded_projection");
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(0);
  });

  it("refuses an actor who is not the recorded approver, an unknown case and an unusable state", async () => {
    expect(await execute({ actor: "operator:someone-else" })).toEqual({
      ok: false,
      reason: "refund_actor_mismatch",
    });
    rpcTable({ stripe_commercial_read_refund_case: [] });
    expect(await execute()).toEqual({ ok: false, reason: "refund_case_unknown" });
    // A state that is neither approved nor recoverable is still refused here,
    // before anything is read or reserved.
    rpcTable({ stripe_commercial_read_refund_case: [refundCaseRow({ state: "withdrawn" })] });
    expect(await execute()).toEqual({ ok: false, reason: "refund_case_withdrawn" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("a REFUSED case replays its operation's durable negative, not the case status", async () => {
    // `finish_operation` is what marks a case refused, so a refused case means
    // this case's own operation already reached a negative terminal. Reporting
    // the mutable case status hid that durable result — and made the released
    // reservation recovery below unreachable.
    seedRefundOperation({ state: "refused" });
    rpcTable({ stripe_commercial_read_refund_case: [refundCaseRow({ state: "refused" })] });
    expect(await execute()).toEqual({ ok: false, reason: "operation_refused" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_reserve_refund");
  });

  it("a CONSUMED case whose operation APPLIED replays the durable success, not a new failure", async () => {
    // The defect this closes: a refund that provably succeeded and whose result
    // response was lost came back as `refund_case_consumed`, i.e. a brand-new
    // failure for money that had already moved. The durable operation decides.
    seedRefundOperation({ state: "applied" });
    rpcTable({ stripe_commercial_read_refund_case: [refundCaseRow({ state: "consumed" })] });
    expect(await execute()).toMatchObject({
      ok: true,
      state: "succeeded",
      refundedMinor: APPROVED_MINOR.growthBase,
    });
    // Nothing was re-dispatched and nothing was re-reserved.
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_reserve_refund");
  });

  it("a consumed case with NO reservation for this operation is still refused", async () => {
    rpcTable({
      stripe_commercial_read_refund_case: [refundCaseRow({ state: "consumed" })],
      stripe_commercial_reserve_refund: new RpcError("stripe_commercial_refund_case_spent"),
    });
    expect(await execute()).toEqual({ ok: false, reason: "refund_reservation_refused" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses a disposition this packet cannot honour, rather than inferring one", async () => {
    rpcTable({
      stripe_commercial_read_refund_case: [
        refundCaseRow({ subscription_disposition: "cancelImmediatelyHeld" }),
      ],
    });
    expect(await execute()).toEqual({
      ok: false,
      reason: "refund_subscription_disposition_held",
    });
    rpcTable({
      stripe_commercial_read_refund_case: [
        refundCaseRow({ access_disposition: "revokeOnRefundHeld" }),
      ],
    });
    expect(await execute()).toEqual({ ok: false, reason: "refund_access_disposition_held" });
    rpcTable({
      stripe_commercial_read_refund_case: [refundCaseRow({ subscription_disposition: "" })],
    });
    expect(await execute()).toEqual({
      ok: false,
      reason: "refund_subscription_disposition_missing",
    });
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses an invoice that is not this owner's, not a subscription invoice or not paid", async () => {
    routes[`GET /v1/invoices/${REFUND_INVOICE}`] = () =>
      json(refundableInvoice(NOW_S, { customer: "cus_other" }));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_foreign" });
    routes[`GET /v1/invoices/${REFUND_INVOICE}`] = () =>
      json(refundableInvoice(NOW_S, { parent: null }));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_not_subscription" });
    routes[`GET /v1/invoices/${REFUND_INVOICE}`] = () =>
      json(refundableInvoice(NOW_S, { status: "open", amount_remaining: 100 }));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_unpaid" });
    // "Invoice remaining paid" is not refund success: a paid status without a
    // real paid_at is UNKNOWN, not evidence.
    routes[`GET /v1/invoices/${REFUND_INVOICE}`] = () =>
      json(refundableInvoice(NOW_S, { status_transitions: { paid_at: null } }));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_unknown" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("HOLDS an ambiguous multi-invoice payment allocation instead of refunding another invoice's funds", async () => {
    routes[`GET /v1/payment_intents/${REFUND_PAYMENT_INTENT}`] = () =>
      json(paymentIntent({ amount_received: 44_700 }));
    expect(await execute()).toEqual({ ok: false, reason: "refund_payment_allocation_ambiguous" });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_reserve_refund");
  });

  it("HOLDS multiple paid InvoicePayments and an incomplete payment list", async () => {
    routes["GET /v1/invoice_payments"] = () =>
      json(
        list([
          invoicePayment(),
          invoicePayment({
            id: "inpay_2",
            payment: { type: "payment_intent", payment_intent: "pi_second" },
          }),
        ]),
      );
    expect(await execute()).toEqual({ ok: false, reason: "refund_invoice_payment_ambiguous" });
    routes["GET /v1/invoice_payments"] = () => json(list([invoicePayment()], true));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_payments_list_incomplete" });
    routes["GET /v1/invoice_payments"] = () => json({ object: "list", has_more: false });
    expect(await execute()).toEqual({ ok: false, reason: "invoice_payments_list_data_missing" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("HOLDS an incomplete refund list rather than under-counting committed funds", async () => {
    routes["GET /v1/refunds"] = () => json(list([], true));
    expect(await execute()).toEqual({ ok: false, reason: "refund_list_list_incomplete" });
    routes["GET /v1/refunds"] = () => json({ object: "list", has_more: false });
    expect(await execute()).toEqual({ ok: false, reason: "refund_list_list_data_missing" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("HOLDS an incomplete or payment-less invoice history instead of assuming the 14-day window", async () => {
    routes["GET /v1/invoices"] = () => json(list([refundableInvoice(NOW_S)], true));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_history_list_incomplete" });
    routes["GET /v1/invoices"] = () => json(list([]));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_history_no_payment" });
    routes["GET /v1/invoices"] = () =>
      json(list([refundableInvoice(NOW_S, { status_transitions: { paid_at: null } })]));
    expect(await execute()).toEqual({ ok: false, reason: "invoice_history_paid_at" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses the guarantee for a renewal and outside the 14-day window", async () => {
    // An earlier paid invoice makes this one a renewal.
    routes["GET /v1/invoices"] = () =>
      json(
        list([
          refundableInvoice(NOW_S),
          refundableInvoice(NOW_S, {
            id: "in_earlier",
            status_transitions: { paid_at: NOW_S - 40 * 86_400 },
          }),
        ]),
      );
    expect(await execute()).toEqual({ ok: false, reason: "policy_not_first_payment" });
    routes["GET /v1/invoices"] = () =>
      json(
        list([refundableInvoice(NOW_S, { status_transitions: { paid_at: NOW_S - 40 * 86_400 } })]),
      );
    expect(await execute()).toEqual({ ok: false, reason: "policy_outside_14_day_window" });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_begin_operation");
  });

  it("refuses a partial amount under the full-refund guarantee, and allows an approved outage exception", async () => {
    rpcTable({ stripe_commercial_read_refund_case: [refundCaseRow({ amount: 5_000 })] });
    expect(await execute()).toEqual({ ok: false, reason: "policy_guarantee_requires_full_refund" });
    expect(providerPosts()).toHaveLength(0);

    rpcTable({
      stripe_commercial_read_refund_case: [
        refundCaseRow({ amount: 5_000, policy_basis: "outage" }),
      ],
      stripe_commercial_reserve_refund: [{ reserved: 5_000, remaining: 9_900 }],
    });
    routes["POST /v1/refunds"] = () => json(refundObject({ amount: 5_000 }));
    expect(await execute()).toMatchObject({ ok: true, state: "succeeded", refundedMinor: 5_000 });
    expect(bodyOf("/v1/refunds").get("amount")).toBe("5000");
  });

  it("never lets the abuse exception produce a refund", async () => {
    rpcTable({
      stripe_commercial_read_refund_case: [refundCaseRow({ policy_basis: "abuseException" })],
    });
    expect(await execute()).toEqual({ ok: false, reason: "policy_abuse_exception_refuses_refund" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses when the database refuses the reservation (over-refund, spent policy, concurrency)", async () => {
    rpcTable({
      stripe_commercial_reserve_refund: new RpcError("stripe_commercial_refund_over_reserved"),
    });
    expect(await execute()).toEqual({ ok: false, reason: "refund_reservation_refused" });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "refused",
      p_refusal: "reservation_refused",
    });
  });

  it("counts the provider's committed refunds when reserving", async () => {
    routes["GET /v1/refunds"] = () =>
      json(
        list([
          refundObject({ id: "re_old", amount: 4_000, status: "pending" }),
          refundObject({ id: "re_fail", amount: 9_000, status: "failed" }),
        ]),
      );
    await execute();
    expect(rpcArgs("stripe_commercial_reserve_refund")[0]).toMatchObject({
      p_provider_reserved: 4_000,
    });
  });

  it("keeps a pending or requires_action refund NON-TERMINAL with the funds reserved", async () => {
    for (const status of ["pending", "requires_action"] as const) {
      resetServerMocks({ stripe_commercial_settle_refund: "reserved" });
      routes["POST /v1/refunds"] = () => json(refundObject({ status }));
      expect(await execute(), status).toMatchObject({ ok: true, state: status });
      expect(rpcArgs("stripe_commercial_finish_operation"), status).toEqual([]);
      expect(rpcArgs("stripe_commercial_advance_operation"), status).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            p_state: "awaiting_apply",
            p_refund: "re_1",
            p_expected_state: "dispatching",
          }),
        ]),
      );
      expect(isOpenOperationState(operations.get(OPERATION)?.state), status).toBe(true);
    }
  });

  it("treats an unknown refund status as uncertain, not as success", async () => {
    rpcTable({ stripe_commercial_settle_refund: "reserved" });
    routes["POST /v1/refunds"] = () => json(refundObject({ status: "weird_new_status" }));
    expect(await execute()).toMatchObject({ ok: true, state: "unknown" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("releases the reservation only on an authoritative failed or canceled refund", async () => {
    for (const status of ["failed", "canceled"] as const) {
      resetServerMocks({ stripe_commercial_settle_refund: "released" });
      routes["POST /v1/refunds"] = () => json(refundObject({ status }));
      expect(await execute(), status).toEqual({ ok: false, reason: `refund_${status}` });
      expect(rpcArgs("stripe_commercial_settle_refund")[0], status).toMatchObject({
        p_status: status,
        p_refund: "re_1",
      });
      expect(rpcArgs("stripe_commercial_finish_operation")[0], status).toMatchObject({
        p_state: "refused",
        p_expected_state: "dispatching",
      });
    }
  });

  it("REJECTS a created refund whose amount is not the approved one, settling nothing", async () => {
    // Verified on the CREATION response too, not only on recovery: a refund for
    // the wrong amount must never settle the approved reservation.
    routes["POST /v1/refunds"] = () =>
      json(refundObject({ amount: APPROVED_MINOR.growthBase - 1 }));
    expect(await execute()).toEqual({ ok: false, reason: "refund_amount_unexpected" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    // The refund identity IS recorded so a later recovery cannot be repointed.
    expect(rpcArgs("stripe_commercial_advance_operation")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ p_state: "awaiting_apply", p_refund: "re_1" }),
      ]),
    );
  });

  it("REJECTS a recovered refund whose amount or currency is not the approved one", async () => {
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () =>
      json(
        list([
          refundObject({
            metadata: { milo_refund_case: "CASE-1" },
            amount: APPROVED_MINOR.growthBase - 1,
          }),
        ]),
      );
    expect(await execute()).toEqual({ ok: false, reason: "refund_amount_unexpected" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);

    resetServerMocks();
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () =>
      json(list([refundObject({ metadata: { milo_refund_case: "CASE-1" }, currency: "pln" })]));
    // A foreign-currency refund against this payment makes the whole committed
    // total uninterpretable, so it is held even earlier than the per-refund
    // amount check.
    expect(await execute()).toEqual({ ok: false, reason: "refund_refund_list_currency" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);

    resetServerMocks();
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () =>
      json(
        list([
          refundObject({ metadata: { milo_refund_case: "CASE-1" }, payment_intent: "pi_other" }),
        ]),
      );
    // A refund in this payment's own list that names another PaymentIntent makes
    // the list itself uninterpretable; it is never read as "ours".
    expect(await execute()).toEqual({ ok: false, reason: "refund_refund_list_foreign" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
  });

  it("treats an UNEXPECTED settle response or a settle exception as uncertainty", async () => {
    rpcTable({ stripe_commercial_settle_refund: "something_new" });
    expect(await execute()).toEqual({ ok: false, reason: "refund_settlement_unreadable" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);

    resetServerMocks({ stripe_commercial_settle_refund: new RpcError("transport") });
    expect(await execute()).toEqual({ ok: false, reason: "refund_settlement_unavailable" });
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    // Exactly one identical retry, which `settle_refund`'s idempotence makes a
    // re-read of this reservation rather than a second refund.
    expect(rpcArgs("stripe_commercial_settle_refund")).toHaveLength(2);
    expect(rpcArgs("stripe_commercial_settle_refund")[0]).toEqual(
      rpcArgs("stripe_commercial_settle_refund")[1],
    );
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("resolves a LOST SETTLE acknowledgment by repeating the identical settlement", async () => {
    let settles = 0;
    rpcTable({
      stripe_commercial_settle_refund: () => {
        settles += 1;
        if (settles === 1) throw new Error("lost acknowledgment");
        return "settled";
      },
    });
    expect(await execute()).toMatchObject({ ok: true, state: "succeeded" });
    expect(settles).toBe(2);
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("returns uncertainty when the refund FINISH returns false or throws", async () => {
    rpcTable({ stripe_commercial_finish_operation: () => false });
    expect(await execute()).toEqual({ ok: false, reason: "refund_settlement_uncertain" });

    resetServerMocks({
      stripe_commercial_finish_operation: () => {
        throw new Error("lost acknowledgment");
      },
    });
    expect(await execute()).toEqual({ ok: false, reason: "refund_settlement_uncertain" });
  });

  it("reports the durable `applied` outcome after a lost refund FINISH acknowledgment", async () => {
    rpcTable({
      stripe_commercial_finish_operation: (args: unknown) => {
        operationRpc("stripe_commercial_finish_operation", args as Record<string, unknown>);
        throw new Error("lost acknowledgment");
      },
    });
    expect(await execute()).toMatchObject({ ok: true, state: "succeeded" });
    expect(operations.get(OPERATION)?.state).toBe("applied");
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("keeps the funds reserved when the dispatch times out", async () => {
    routes["POST /v1/refunds"] = () => {
      throw new Error("socket timeout");
    };
    expect(await execute()).toEqual({ ok: false, reason: "refund_uncertain" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(rpcArgs("stripe_commercial_advance_operation")).toEqual(
      expect.arrayContaining([expect.objectContaining({ p_state: "awaiting_apply" })]),
    );
  });

  it("keeps the funds reserved when the created refund cannot be interpreted", async () => {
    routes["POST /v1/refunds"] = () => json(refundObject({ payment_intent: "pi_elsewhere" }));
    expect(await execute()).toEqual({ ok: false, reason: "refund_refund_payment_link" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("recovers a LOST ACKNOWLEDGMENT by finding our own refund in the provider's list", async () => {
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () =>
      json(list([refundObject({ metadata: { milo_refund_case: "CASE-1" } })]));
    expect(await execute()).toMatchObject({ ok: true, state: "succeeded" });
    // No second refund was dispatched.
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_settle_refund")[0]).toMatchObject({
      p_refund: "re_1",
      p_status: "succeeded",
    });
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "applied",
      p_expected_state: "awaiting_apply",
    });
  });

  it("a COMPLETE EMPTY refund list is UNKNOWN: no synthetic cancel, no release, no failure", async () => {
    // THE CORRECTED RULE. An empty list does not prove that no refund exists —
    // another execution of this same operation may still have a POST in flight,
    // or the provider may simply not have published the object yet. Fabricating
    // a `canceled` status here released real funds and closed the operation
    // `failed` while the money was on its way out.
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execute()).toEqual({ ok: false, reason: "refund_outcome_unknown" });
    // No status was invented, nothing was released, nothing became terminal.
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("an empty list PAST RETENTION is still held and fenced, never 'no effect'", async () => {
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execute({ now: NOW_MS + 24 * 3600 * 1000 + 1 })).toEqual({
      ok: false,
      reason: "refund_outcome_unknown",
    });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
    // Beyond retention nothing is dispatched: no new financial intent is ever
    // created, only recovery and fencing.
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("an OVERLAPPING same-operation recovery holds, and the eventual success reconciles ONCE", async () => {
    // Execution A is still inside its POST; execution B resumes the same
    // operation, sees a complete empty list and must keep the reservation.
    seedRefundOperation({ state: "dispatching" });
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execute()).toEqual({ ok: false, reason: "refund_outcome_unknown" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(postsTo("/v1/refunds")).toHaveLength(0);

    // A's refund then appears. The next execution reconciles it exactly once.
    calls = [];
    mocks.rpc.mockClear();
    routes["GET /v1/refunds"] = () =>
      json(list([refundObject({ metadata: { milo_refund_case: "CASE-1" } })]));
    expect(await execute()).toMatchObject({ ok: true, state: "succeeded" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_settle_refund")).toHaveLength(1);
    expect(operations.get(OPERATION)?.state).toBe("applied");
  });

  it("refuses two of our own refunds for one case rather than guessing", async () => {
    seedRefundOperation({ state: "awaiting_apply", invoiceId: null });
    routes["GET /v1/refunds"] = () =>
      json(
        list([
          refundObject({ id: "re_1", metadata: { milo_refund_case: "CASE-1" } }),
          refundObject({ id: "re_2", metadata: { milo_refund_case: "CASE-1" } }),
        ]),
      );
    expect(await execute()).toEqual({ ok: false, reason: "refund_ambiguous" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
  });

  it("holds an unreadable or incomplete recovery list instead of releasing", async () => {
    seedRefundOperation({ state: "awaiting_apply" });
    routes["GET /v1/refunds"] = () => json(list([], true));
    expect(await execute()).toEqual({ ok: false, reason: "refund_list_list_incomplete" });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(isOpenOperationState(operations.get(OPERATION)?.state)).toBe(true);
  });

  it("fences a refund past the retention boundary without dispatching", async () => {
    expect(await execute({ now: NOW_MS + 24 * 3600 * 1000 })).toEqual({
      ok: false,
      reason: "operation_fenced",
    });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(operations.get(OPERATION)?.state).toBe("fenced");
  });

  it("validates the RESERVED amount the database returns before dispatching", async () => {
    rpcTable({
      stripe_commercial_reserve_refund: [{ reserved: APPROVED_MINOR.growthBase - 1, remaining: 0 }],
    });
    expect(await execute()).toEqual({ ok: false, reason: "refund_reservation_unreadable" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    resetServerMocks({ stripe_commercial_reserve_refund: [] });
    expect(await execute()).toEqual({ ok: false, reason: "refund_reservation_unreadable" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
  });

  it("records an approval only with a complete, trusted operator decision", async () => {
    const record = (over: Record<string, unknown> = {}) =>
      recordApprovedRefundCase(
        {
          caseId: "CASE-1",
          userId: COMMERCIAL_OWNER,
          mode: "test",
          invoiceId: REFUND_INVOICE,
          subscriptionId: COMMERCIAL_SUBSCRIPTION,
          planId: "growth",
          amountMinor: APPROVED_MINOR.growthBase,
          currency: "eur",
          policyBasis: "firstPayment14Day",
          subscriptionDisposition: "cancelAtPeriodEndSeparately",
          accessDisposition: "retainUntilPeriodEnd",
          operatorActor: "operator:rafal",
          requestedAtMs: NOW_MS - 86_400_000,
          ...over,
        } as Parameters<typeof recordApprovedRefundCase>[0],
        deps(),
      );
    expect(await record()).toEqual({ ok: true, state: "approved" });
    expect(rpcArgs("stripe_commercial_record_refund_case")[0]).toMatchObject({
      p_case: "CASE-1",
      p_actor: "operator:rafal",
      p_basis: "firstPayment14Day",
      p_subscription_disposition: "cancelAtPeriodEndSeparately",
      p_access_disposition: "retainUntilPeriodEnd",
    });
    expect(await record({ operatorActor: "  " })).toEqual({ ok: false, reason: "request_invalid" });
    expect(await record({ amountMinor: 0 })).toEqual({ ok: false, reason: "amount_invalid" });
    expect(await record({ requestedAtMs: 0 })).toEqual({
      ok: false,
      reason: "requested_at_invalid",
    });
    expect(await record({ subscriptionDisposition: "whatever" })).toEqual({
      ok: false,
      reason: "subscription_disposition_missing",
    });
    expect(await record({ accessDisposition: "" })).toEqual({
      ok: false,
      reason: "access_disposition_missing",
    });
    // A disposition this packet cannot EXECUTE is still recorded faithfully.
    expect(await record({ subscriptionDisposition: "cancelImmediatelyHeld" })).toEqual({
      ok: true,
      state: "approved",
    });
  });
});

describe("the pre-deletion billing barrier", () => {
  it("reports a clear state, and blocks on a live subscription or reserved funds", async () => {
    expect(await readBillingDeletionBarrier(COMMERCIAL_OWNER)).toEqual({
      ok: true,
      blocked: false,
      reason: "clear",
      mode: null,
      subscriptionId: null,
    });
    rpcTable({
      stripe_commercial_deletion_barrier: [
        {
          blocked: true,
          reason: "subscription_live",
          mode: "live",
          subscription_id: COMMERCIAL_SUBSCRIPTION,
        },
      ],
    });
    expect(await readBillingDeletionBarrier(COMMERCIAL_OWNER)).toMatchObject({
      blocked: true,
      reason: "subscription_live",
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
    });
  });

  it("BLOCKS on an unreadable billing state, never reads it as safe to delete", async () => {
    rpcTable({ stripe_commercial_deletion_barrier: new RpcError() });
    expect(await readBillingDeletionBarrier(COMMERCIAL_OWNER)).toMatchObject({
      blocked: true,
      reason: "barrier_unavailable",
    });
    rpcTable({ stripe_commercial_deletion_barrier: [] });
    expect(await readBillingDeletionBarrier(COMMERCIAL_OWNER)).toMatchObject({
      blocked: true,
      reason: "barrier_unreadable",
    });
    expect(await readBillingDeletionBarrier("not-a-uuid")).toMatchObject({
      blocked: true,
      reason: "owner_invalid",
    });
    // It never deletes or cancels anything.
    expect(providerPosts()).toHaveLength(0);
  });
});

describe("isolation from manual, legacy and test-mode state", () => {
  it("uses the test key and the test account on every call, and writes no entitlement", async () => {
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    await confirm();
    for (const call of calls) {
      expect(call.headers.Authorization).toBe("Bearer rk_test_commercialfixture");
      expect(call.headers["Stripe-Version"]).toBe("2026-09-30.endive");
    }
    for (const args of rpcArgs("stripe_commercial_begin_operation"))
      expect(args).toMatchObject({ p_mode: "test", p_account: COMMERCIAL_ACCOUNT_TEST });
    // Not one entitlement, Paddle or manual-grant RPC is reachable from here.
    for (const name of rpcNames()) expect(name.startsWith("stripe_commercial_")).toBe(true);
  });

  it("never touches a projection, a receipt or a lease", async () => {
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcTable({
      stripe_commercial_current_subscription: [
        {
          customer_id: COMMERCIAL_CUSTOMER,
          subscription_id: COMMERCIAL_SUBSCRIPTION,
          plan_id: "pro",
          status: "active",
          seat_quantity: 3,
        },
      ],
      stripe_commercial_read_quote: [decreaseQuoteRow()],
      stripe_commercial_consume_quote: [decreaseQuoteRow()],
    });
    await confirm({ planId: "growth", seats: 0, amount: 0 });
    for (const forbidden of [
      "stripe_apply_subscription_projection",
      "stripe_commercial_guarded_projection",
      "stripe_record_webhook_receipt",
      "stripe_claim_account_lease",
      "stripe_upsert_customer",
      "stripe_purchased_working_seats",
    ])
      expect(rpcNames(), forbidden).not.toContain(forbidden);
  });
});

/* -------------------------------------------------------------------------- */
/* The caller-owned read adapter and the manual guard                         */
/* -------------------------------------------------------------------------- */

/**
 * The adapter is a READ. These tests drive the production functions against a
 * synthetic owner-scoped table store and assert the two decisions that matter:
 * what a billing screen is allowed to state, and when an owner's manual
 * override must be refused.
 *
 * Nothing here contacts a provider, and the suite asserts that too: an
 * unreadable local state must never be resolved by going and asking Stripe.
 */
describe("the caller-owned billing summary and the manual clearance", () => {
  const OWNER_ROW = { user_id: COMMERCIAL_OWNER };
  const OTHER_ACCOUNT = "acct_commercialOTHER";
  const CANCEL_OP = "00000000-0000-4000-8000-0000000000c9";
  const OPEN_OP = "00000000-0000-4000-8000-0000000000d1";
  const SECOND_OP = "00000000-0000-4000-8000-0000000000d2";
  const REVERSAL_OP = "00000000-0000-4000-8000-0000000000d3";
  const OPEN_QUOTE = "00000000-0000-4000-8000-0000000000e1";

  // `"null"` is the PostgREST shape that has no error and no array either —
  // the one an unavailable relation can produce, and the one that must never
  // read as an empty table.
  type TableValue = Record<string, unknown>[] | "error" | "throw" | "null";

  /** The owner-scoped SELECTs, backed by a synthetic store. */
  const tables = (over: Record<string, TableValue> = {}) => {
    const store: Record<string, TableValue> = {
      entitlements: [],
      stripe_customers: [],
      stripe_subscriptions: [],
      stripe_commercial_operations: [],
      stripe_checkout_requests: [],
      stripe_commercial_quotes: [],
      ...over,
    };
    mocks.from.mockImplementation((table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const value = store[table] ?? [];
        const builder = {
          eq(column: string, filter: unknown) {
            filters[column] = filter;
            return builder;
          },
          limit(count: number) {
            if (value === "error")
              return Promise.resolve({ data: null, error: { message: "relation_missing" } });
            if (value === "throw") return Promise.reject(new Error("unavailable"));
            if (value === "null") return Promise.resolve({ data: null, error: null });
            const owned = value.filter((row) => row.user_id === filters.user_id);
            return Promise.resolve({ data: owned.slice(0, count), error: null });
          },
          maybeSingle() {
            if (value === "error")
              return Promise.resolve({ data: null, error: { message: "relation_missing" } });
            if (value === "throw") return Promise.reject(new Error("unavailable"));
            if (value === "null") return Promise.resolve({ data: null, error: null });
            const row = value.find((candidate) =>
              Object.entries(filters).every(([column, filter]) => candidate[column] === filter),
            );
            return Promise.resolve({ data: row ?? null, error: null });
          },
        };
        return builder;
      },
    }));
  };

  // The private identities exist so owner/account/mode/customer/subscription
  // coherence can actually be joined. None of them may reach a caller.
  const CUSTOMER = "cus_current";
  const SUBSCRIPTION = "sub_current";

  const entitlementRow = (over: Record<string, unknown> = {}) => ({
    ...OWNER_ROW,
    plan_id: "growth",
    status: "active",
    provider: "stripe",
    provider_customer_id: CUSTOMER,
    provider_subscription_id: SUBSCRIPTION,
    current_period_end: "2026-11-27T00:00:00.000Z",
    cancel_at_period_end: false,
    updated_at: "2026-10-01T00:00:00.000Z",
    ...over,
  });
  const customerRow = (over: Record<string, unknown> = {}) => ({
    ...OWNER_ROW,
    account_id: COMMERCIAL_ACCOUNT_TEST,
    mode: "test",
    customer_id: CUSTOMER,
    ...over,
  });
  const subscriptionRow = (over: Record<string, unknown> = {}) => ({
    ...OWNER_ROW,
    account_id: COMMERCIAL_ACCOUNT_TEST,
    mode: "test",
    subscription_id: SUBSCRIPTION,
    plan_id: "growth",
    status: "active",
    seat_quantity: 2,
    current_period_end: "2026-11-27T00:00:00.000Z",
    cancel_at_period_end: false,
    ...over,
  });
  /** A coherent paid Stripe account: entitlement, mapping and projection all
   * naming the same customer and subscription in one test-mode scope. */
  const coherentStripe = (over: Record<string, unknown> = {}) => ({
    entitlements: [entitlementRow()],
    stripe_customers: [customerRow()],
    stripe_subscriptions: [subscriptionRow()],
    ...over,
  });
  const operationRow = (over: Record<string, unknown> = {}) => ({
    ...OWNER_ROW,
    operation_id: OPEN_OP,
    account_id: COMMERCIAL_ACCOUNT_TEST,
    mode: "test",
    kind: "plan_change",
    subscription_id: SUBSCRIPTION,
    quote_id: null,
    reverses_operation: null,
    state: "awaiting_payment",
    ...over,
  });
  const checkoutRow = (over: Record<string, unknown> = {}) => ({
    ...OWNER_ROW,
    account_id: COMMERCIAL_ACCOUNT_TEST,
    mode: "test",
    kind: "checkout",
    status: "completed",
    ...over,
  });
  const quoteRow = (over: Record<string, unknown> = {}) => ({
    ...OWNER_ROW,
    quote_id: OPEN_QUOTE,
    // The binding the operation must match exactly.
    account_id: COMMERCIAL_ACCOUNT_TEST,
    mode: "test",
    kind: "plan_change",
    subscription_id: SUBSCRIPTION,
    target_plan_id: "pro",
    target_seat_quantity: 3,
    direction: "increase",
    currency: "eur",
    amount_due: 12_300,
    recurring_amount: 26_910,
    effective_at: null,
    expires_at: "2026-10-29T12:00:00.000Z",
    consumed_at: "2026-10-29T11:50:00.000Z",
    consumed_by: OPEN_OP,
    ...over,
  });

  /** The allowlisted sandbox owner, so the "actions are available" branch is
   * reachable. The live hold is unchanged and is asserted separately. */
  const summary = (deps: { env?: Record<string, string> } = {}) =>
    readCommercialAccountSummary(COMMERCIAL_OWNER, { env: deps.env ?? COMMERCIAL_ENV });

  beforeEach(() => {
    rpcTable();
    tables();
  });

  it("reads a complete clean absence as verified free, with no money claimed", async () => {
    const result = await summary();
    expect(result).toMatchObject({
      ok: true,
      summary: {
        provider: "none",
        access: "free",
        operationEvidence: "none",
        currentAmountMinor: null,
        currentCurrency: null,
        currentAmountEvidence: "unknown",
        eligibleCancellationId: null,
      },
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: true,
      reason: "clear",
    });
    // A read never reaches the provider.
    expect(calls).toHaveLength(0);
  });

  it("never states a current billed amount, because the schema has none", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow()],
    });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.currentAmountMinor).toBeNull();
    expect(result.summary.currentCurrency).toBeNull();
    expect(result.summary.currentAmountEvidence).toBe("unknown");
    // The verified facts that DO exist are reported.
    expect(result.summary).toMatchObject({
      provider: "stripe",
      mode: "test",
      planId: "growth",
      access: "paid",
      purchasedSeats: 2,
      periodEnd: "2026-11-27T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
  });

  it("keeps a raw manual or Paddle entitlement, even with a test customer mapping", async () => {
    for (const provider of ["manual", "paddle"] as const) {
      tables({
        entitlements: [entitlementRow({ provider, status: "manualBeta" })],
        stripe_customers: [customerRow()],
      });
      const result = await summary();
      expect(result.ok, provider).toBe(true);
      if (!result.ok) continue;
      expect(result.summary.provider, provider).toBe(provider);
      expect(result.summary.access, provider).toBe("paid");
      expect(result.summary.actions.paddlePortal, provider).toBe(provider === "paddle");
      // Mapping alone does not block a valid manual action.
      expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
        allowed: true,
        reason: "clear",
      });
    }
  });

  it("holds the manual override for any nonterminal projection, at any age", async () => {
    for (const status of ["active", "trialing", "incomplete", "past_due", "unpaid", "paused"]) {
      tables({
        entitlements: [entitlementRow()],
        stripe_customers: [customerRow()],
        stripe_subscriptions: [
          subscriptionRow({ status, current_period_end: "2019-01-01T00:00:00.000Z" }),
        ],
      });
      expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER), status).toEqual({
        allowed: false,
        reason: "stripe_subscription_unresolved",
      });
      const result = await summary();
      expect(result.ok && result.summary.actions.manualOverride, status).toBe(false);
    }
  });

  it("clears a coherent terminal projection without inventing a freshness window", async () => {
    for (const status of ["canceled", "cancelled", "incomplete_expired"]) {
      tables({
        entitlements: [entitlementRow({ status: "cancelled" })],
        stripe_customers: [customerRow()],
        stripe_subscriptions: [subscriptionRow({ status })],
      });
      expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER), status).toEqual({
        allowed: true,
        reason: "clear",
      });
    }
  });

  it("clears an explicitly Free raw row over the agreement it names", async () => {
    // Terminal evidence is not reducible to `status === "cancelled"`: an
    // explicit `freePreview` row is the other way a Stripe agreement ends.
    tables({
      entitlements: [entitlementRow({ status: "freePreview", plan_id: "freePreview" })],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow({ status: "canceled" })],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: true,
      reason: "clear",
    });
  });

  it.each([
    ["an active row whose period merely lapsed", "active", "2019-01-01T00:00:00.000Z"],
    ["a past-due row with a live future period", "pastDue", "2099-01-01T00:00:00.000Z"],
    ["an unresolved checkout row", "checkoutPending", "2099-01-01T00:00:00.000Z"],
  ])("holds %s, which grants nothing but has not ended either", async (_l, status, periodEnd) => {
    // Effective access is not agreement state. Each of these reads as Free, so
    // the non-granting clause alone would have cleared a manual write on top of
    // a Stripe relationship that is still open — and age is never the evidence.
    tables({
      entitlements: [entitlementRow({ status, current_period_end: periodEnd })],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow({ status: "canceled" })],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER), status).toEqual({
      allowed: false,
      reason: "stripe_entitlement_unresolved",
    });
    const result = await summary();
    expect(result.ok && result.summary.actions.manualOverride, status).toBe(false);
  });

  it("holds a raw Stripe entitlement that no terminal projection accounts for", async () => {
    tables({ entitlements: [entitlementRow()], stripe_customers: [customerRow()] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "stripe_entitlement_unresolved",
    });
  });

  it("scans every account and mode, not just today's configured one", async () => {
    tables({
      stripe_subscriptions: [
        subscriptionRow({ account_id: OTHER_ACCOUNT, mode: "live", status: "active" }),
      ],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "stripe_subscription_unresolved",
    });
    tables({
      stripe_commercial_operations: [
        operationRow({ account_id: OTHER_ACCOUNT, mode: "live", state: "fenced" }),
      ],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "commercial_operation_open",
    });
  });

  it("holds an unresolved checkout and a completed checkout with no projection", async () => {
    for (const status of ["pending", "open", "fenced"]) {
      tables({ stripe_checkout_requests: [checkoutRow({ status })] });
      expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER), status).toEqual({
        allowed: false,
        reason: "checkout_unresolved",
      });
    }
    tables({ stripe_checkout_requests: [checkoutRow({ status: "completed" })] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_state_unknown",
    });
    // A completed PORTAL visit implies no subscription at all.
    tables({ stripe_checkout_requests: [checkoutRow({ kind: "portal", status: "completed" })] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: true,
      reason: "clear",
    });
  });

  it("treats a missing relation, a denied read and a thrown read as unavailable", async () => {
    for (const table of [
      "entitlements",
      "stripe_customers",
      "stripe_subscriptions",
      "stripe_commercial_operations",
      "stripe_checkout_requests",
    ])
      for (const failure of ["error", "throw"] as const) {
        tables({ [table]: failure });
        const result = await summary();
        expect(result.ok, `${table}:${failure}`).toBe(false);
        if (result.ok) continue;
        expect(result.reason).toMatch(/^billing_read_/);
        const clearance = await evaluateManualEntitlementClearance(COMMERCIAL_OWNER);
        expect(clearance.allowed, `${table}:${failure}`).toBe(false);
      }
    expect(calls).toHaveLength(0);
  });

  it("refuses a truncated owner scan rather than calling it a clean account", async () => {
    tables({
      stripe_commercial_operations: Array.from({ length: 101 }, (_, index) =>
        operationRow({
          operation_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          state: "applied",
        }),
      ),
    });
    const result = await summary();
    expect(result).toEqual({ ok: false, reason: "billing_read_truncated" });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_read_truncated",
    });
  });

  it("treats a malformed row as unknown, never as Paddle, Free or zero", async () => {
    for (const broken of [
      { provider: "trustme" },
      { plan_id: "enterprise" },
      { status: "whatever" },
      { cancel_at_period_end: "false" },
      { current_period_end: "not-a-date" },
    ]) {
      tables({ entitlements: [entitlementRow(broken)] });
      const result = await summary();
      expect(result.ok, JSON.stringify(broken)).toBe(true);
      if (!result.ok) continue;
      expect(result.summary.provider, JSON.stringify(broken)).toBe("unknown");
      expect(result.summary.access, JSON.stringify(broken)).toBe("unknown");
      expect(result.summary.planId, JSON.stringify(broken)).toBeNull();
      expect(result.summary.actions.paddlePortal).toBe(false);
      expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
        allowed: false,
        reason: "billing_state_unknown",
      });
    }
    // An unrecognised projection status is unknown too, not terminal.
    tables({ stripe_subscriptions: [subscriptionRow({ status: "something_new" })] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_state_unknown",
    });
  });

  it("holds the manual override when the read-only deletion barrier blocks", async () => {
    rpcTable({
      stripe_commercial_deletion_barrier: [
        { blocked: true, reason: "refund_reserved", mode: "test", subscription_id: "sub_x" },
      ],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_barrier_blocked",
    });
    // An unreadable barrier is also blocked, never clear.
    rpcTable({ stripe_commercial_deletion_barrier: new RpcError("missing") });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_barrier_blocked",
    });
  });

  it("discovers exactly one open operation and binds its original terms", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
      stripe_commercial_quotes: [quoteRow()],
    });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.operationEvidence).toBe("open");
    expect(result.summary.operation).toEqual({
      operationId: OPEN_OP,
      kind: "plan_change",
      state: "awaiting_payment",
      quoteId: OPEN_QUOTE,
      cancelOperationId: null,
      terms: {
        planId: "pro",
        seatQuantity: 3,
        amountMinor: 12_300,
        recurringEstimateMinor: 26_910,
        currency: "eur",
        direction: "increase",
        effectiveAt: null,
        expiresAt: "2026-10-29T12:00:00.000Z",
      },
    });
    // A new intent is not offered while one is open; recovery of THIS one is.
    expect(result.summary.actions.prepareChange).toBe(false);
    expect(result.summary.actions.cancel).toBe(false);
    expect(result.summary.actions.recoverOperation).toBe(true);
  });

  it("holds two open operations as ambiguous rather than picking one", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [
        operationRow(),
        operationRow({ operation_id: SECOND_OP, account_id: OTHER_ACCOUNT, state: "prepared" }),
      ],
    });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.operationEvidence).toBe("ambiguous");
    expect(result.summary.operation).toBeNull();
    expect(result.summary.heldReason).toBe("operation_conflict");
    expect(result.summary.actions.recoverOperation).toBe(false);
    expect(result.summary.actions.prepareChange).toBe(false);
  });

  it("holds an open operation whose bound quote cannot be read", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
      stripe_commercial_quotes: "error",
    });
    const unreadable = await summary();
    expect(unreadable.ok).toBe(true);
    if (!unreadable.ok) return;
    expect(unreadable.summary.operationEvidence).toBe("unknown");
    expect(unreadable.summary.operation).toBeNull();
    expect(unreadable.summary.heldReason).toBe("operation_unavailable");

    // A quote that is simply absent is a broken binding, not a fresh slot.
    tables({
      entitlements: [entitlementRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
      stripe_commercial_quotes: [],
    });
    const absent = await summary();
    expect(absent.ok && absent.summary.operationEvidence).toBe("ambiguous");
    expect(absent.ok && absent.summary.operation).toBeNull();
  });

  it("offers a reversal only for one exact, not-yet-reversed applied cancellation", async () => {
    const applied = operationRow({
      operation_id: CANCEL_OP,
      kind: "cancel",
      state: "applied",
      quote_id: null,
    });
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow({ cancel_at_period_end: true })],
      stripe_commercial_operations: [applied],
    });
    const eligible = await summary();
    expect(eligible.ok && eligible.summary.eligibleCancellationId).toBe(CANCEL_OP);
    expect(eligible.ok && eligible.summary.actions.reverseCancellation).toBe(true);

    // Already reversed: no longer eligible.
    tables({
      entitlements: [entitlementRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [
        applied,
        operationRow({
          operation_id: REVERSAL_OP,
          kind: "reverse_cancel",
          state: "applied",
          reverses_operation: CANCEL_OP,
        }),
      ],
    });
    const reversed = await summary();
    expect(reversed.ok && reversed.summary.eligibleCancellationId).toBeNull();
    expect(reversed.ok && reversed.summary.actions.reverseCancellation).toBe(false);

    // Two candidates: ambiguous, so nothing is offered.
    tables({
      entitlements: [entitlementRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [
        applied,
        operationRow({ operation_id: SECOND_OP, kind: "cancel", state: "applied" }),
      ],
    });
    const ambiguous = await summary();
    expect(ambiguous.ok && ambiguous.summary.eligibleCancellationId).toBeNull();
  });

  it("still reads when mutations are held, and offers no action then", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow()],
    });
    // No sandbox allowlist entry: the default state of every environment.
    const held = await readCommercialAccountSummary(COMMERCIAL_OWNER, {
      env: { ...COMMERCIAL_ENV, MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS: "" },
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.summary.provider).toBe("stripe");
    expect(held.summary.access).toBe("paid");
    expect(held.summary.heldReason).toBe("held");
    expect(held.summary.actions).toMatchObject({
      prepareChange: false,
      cancel: false,
      reverseCancellation: false,
      recoverOperation: false,
    });
    // The allowlisted owner in a configured test mode does get the actions.
    const allowed = await summary();
    expect(allowed.ok && allowed.summary.actions.prepareChange).toBe(true);
    expect(allowed.ok && allowed.summary.heldReason).toBeNull();
  });

  it("refuses an owner id that is not a uuid before touching anything", async () => {
    expect(await readCommercialAccountSummary("not-a-uuid")).toEqual({
      ok: false,
      reason: "request_invalid",
    });
    expect(await evaluateManualEntitlementClearance("")).toEqual({
      allowed: false,
      reason: "request_invalid",
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ */
  /* Coherence: the cases an independent probe cleared on the first pass  */
  /* ------------------------------------------------------------------ */

  const LIVE_ACCOUNT = "acct_commercialLIVE";

  it("holds a LIVE customer mapping that no lifecycle evidence explains", async () => {
    tables({
      entitlements: [entitlementRow({ provider: "manual", status: "manualBeta" })],
      stripe_customers: [customerRow({ account_id: LIVE_ACCOUNT, mode: "live" })],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_state_unknown",
    });
    // A TEST mapping on its own still clears, as the policy requires.
    tables({
      entitlements: [entitlementRow({ provider: "manual", status: "manualBeta" })],
      stripe_customers: [customerRow()],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: true,
      reason: "clear",
    });
  });

  it("holds an active Stripe entitlement that only an UNRELATED terminal projection accompanies", async () => {
    tables({
      entitlements: [entitlementRow()], // names sub_current
      stripe_customers: [customerRow(), customerRow({ account_id: LIVE_ACCOUNT, mode: "live" })],
      stripe_subscriptions: [
        subscriptionRow({
          subscription_id: "sub_old",
          status: "canceled",
          current_period_end: "2019-01-01T00:00:00.000Z",
        }),
      ],
    });
    const clearance = await evaluateManualEntitlementClearance(COMMERCIAL_OWNER);
    expect(clearance.allowed).toBe(false);
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No coherent scope, so no action is advertised for it either.
    expect(result.summary.actions.prepareChange).toBe(false);
    expect(result.summary.actions.cancel).toBe(false);
    expect(result.summary.mode).toBeNull();
    expect(result.summary.heldReason).toBe("subscription_mapping_uncertain");
  });

  it("holds an operation whose subscription no projection accounts for", async () => {
    tables({
      stripe_commercial_operations: [
        operationRow({ operation_id: CANCEL_OP, kind: "cancel", state: "applied", quote_id: null }),
      ],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_state_unknown",
    });
    const result = await summary();
    expect(result.ok && result.summary.eligibleCancellationId).toBeNull();
  });

  it("treats a null SELECT payload as unreadable, never as an empty table", async () => {
    tables({
      entitlements: "null",
      stripe_customers: "null",
      stripe_subscriptions: "null",
      stripe_commercial_operations: "null",
      stripe_checkout_requests: "null",
    });
    expect(await summary()).toEqual({ ok: false, reason: "billing_read_unreadable" });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_read_unreadable",
    });
  });

  it("treats an unknown checkout status or kind as malformed, not resolved", async () => {
    for (const row of [{ status: "new_unknown_state" }, { kind: "something_else" }]) {
      tables({ stripe_checkout_requests: [checkoutRow(row)] });
      expect(
        await evaluateManualEntitlementClearance(COMMERCIAL_OWNER),
        JSON.stringify(row),
      ).toEqual({ allowed: false, reason: "billing_state_unknown" });
    }
  });

  it("treats a malformed terminal projection as unknown, not terminal", async () => {
    tables({
      stripe_subscriptions: [
        subscriptionRow({
          status: "canceled",
          plan_id: "unknown_plan",
          cancel_at_period_end: "false",
        }),
      ],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_state_unknown",
    });
    for (const broken of [
      { seat_quantity: null },
      { seat_quantity: "two" },
      { subscription_id: "" },
      { current_period_end: "not-a-date" },
      { cancel_at_period_end: null },
    ]) {
      tables({ stripe_subscriptions: [subscriptionRow({ status: "canceled", ...broken })] });
      expect(
        (await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).allowed,
        JSON.stringify(broken),
      ).toBe(false);
    }
  });

  it("does not let a LIVE agreement borrow a configured TEST account's readiness", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow({ account_id: LIVE_ACCOUNT, mode: "live" })],
      stripe_subscriptions: [subscriptionRow({ account_id: LIVE_ACCOUNT, mode: "live" })],
    });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The live state is readable and displayed…
    expect(result.summary.provider).toBe("stripe");
    expect(result.summary.mode).toBe("live");
    expect(result.summary.access).toBe("paid");
    // …but the caller's resolvable mode is test, so nothing is offered.
    expect(result.summary.actions.prepareChange).toBe(false);
    expect(result.summary.actions.cancel).toBe(false);
    expect(result.summary.heldReason).toBe("subscription_mapping_uncertain");
  });

  it("holds two applicable scopes rather than choosing one", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow(), customerRow({ account_id: LIVE_ACCOUNT, mode: "live" })],
      stripe_subscriptions: [
        subscriptionRow(),
        subscriptionRow({ account_id: LIVE_ACCOUNT, mode: "live" }),
      ],
    });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.mode).toBeNull();
    expect(result.summary.purchasedSeats).toBeNull();
    expect(result.summary.actions.prepareChange).toBe(false);
    expect(result.summary.actions.cancel).toBe(false);
  });

  it("holds a mapping that disagrees with the entitlement's own customer", async () => {
    tables(
      coherentStripe({ stripe_customers: [customerRow({ customer_id: "cus_somebody_else" })] }),
    );
    const result = await summary();
    expect(result.ok && result.summary.actions.prepareChange).toBe(false);
  });

  it("refuses a quote that is not THIS operation's, in scope or in consumption", async () => {
    for (const foreign of [
      { account_id: LIVE_ACCOUNT, mode: "live" },
      { subscription_id: "sub_other" },
      { kind: "seat_change" },
      { consumed_by: "00000000-0000-4000-8000-000000000099" },
      { consumed_by: null }, // consumed_at set, consumer missing
      { consumed_at: null }, // consumer set, timestamp missing
      { consumed_by: "not-a-uuid" },
      { amount_due: "lots" },
      { currency: "" },
      { expires_at: "not-a-date" },
      { target_plan_id: "enterprise" },
    ]) {
      tables(
        coherentStripe({
          stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
          stripe_commercial_quotes: [quoteRow(foreign)],
        }),
      );
      const result = await summary();
      expect(result.ok, JSON.stringify(foreign)).toBe(true);
      if (!result.ok) continue;
      expect(result.summary.operationEvidence, JSON.stringify(foreign)).toBe("unknown");
      expect(result.summary.operation).toBeNull();
      expect(result.summary.actions.recoverOperation).toBe(false);
    }
  });

  it("accepts an UNCONSUMED quote and keeps recovery valid past the preview expiry", async () => {
    tables(
      coherentStripe({
        stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
        stripe_commercial_quotes: [
          quoteRow({
            consumed_at: null,
            consumed_by: null,
            expires_at: "2019-01-01T00:00:00.000Z",
          }),
        ],
      }),
    );
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.operationEvidence).toBe("open");
    // Expiry is not a reason to discard the original terms.
    expect(result.summary.operation?.terms).toMatchObject({
      planId: "pro",
      seatQuantity: 3,
      amountMinor: 12_300,
      currency: "eur",
    });
    expect(result.summary.actions.recoverOperation).toBe(true);
  });

  it("holds discovery when a malformed sibling row sits beside a good open one", async () => {
    tables(
      coherentStripe({
        stripe_commercial_operations: [
          operationRow({ kind: "cancel", quote_id: null }),
          operationRow({ operation_id: "bad" }),
        ],
      }),
    );
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.operationEvidence).toBe("unknown");
    expect(result.summary.operation).toBeNull();
    expect(result.summary.actions.recoverOperation).toBe(false);
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "billing_state_unknown",
    });
  });

  it("treats an unknown operation kind or a malformed reference as malformed", async () => {
    for (const broken of [
      { kind: "something_new" },
      { quote_id: "not-a-uuid" },
      { reverses_operation: "not-a-uuid" },
    ]) {
      tables(coherentStripe({ stripe_commercial_operations: [operationRow(broken)] }));
      const result = await summary();
      expect(result.ok && result.summary.operationEvidence, JSON.stringify(broken)).toBe("unknown");
    }
  });

  it("offers no reversal for a cancellation outside the current agreement", async () => {
    const applied = {
      operation_id: CANCEL_OP,
      kind: "cancel",
      state: "applied",
      quote_id: null,
    };
    // A different account, mode and subscription entirely.
    tables(
      coherentStripe({
        stripe_subscriptions: [subscriptionRow({ cancel_at_period_end: false })],
        stripe_commercial_operations: [
          operationRow({
            ...applied,
            account_id: LIVE_ACCOUNT,
            mode: "live",
            subscription_id: "sub_old",
          }),
        ],
      }),
    );
    const unrelated = await summary();
    expect(unrelated.ok && unrelated.summary.eligibleCancellationId).toBeNull();
    expect(unrelated.ok && unrelated.summary.actions.reverseCancellation).toBe(false);

    // In scope, but the current projection is not actually cancelling.
    tables(
      coherentStripe({
        stripe_subscriptions: [subscriptionRow({ cancel_at_period_end: false })],
        stripe_commercial_operations: [operationRow(applied)],
      }),
    );
    const notCancelling = await summary();
    expect(notCancelling.ok && notCancelling.summary.eligibleCancellationId).toBeNull();

    // In scope and cancelling, but the agreement has already ended.
    tables(
      coherentStripe({
        stripe_subscriptions: [subscriptionRow({ status: "canceled", cancel_at_period_end: true })],
        stripe_commercial_operations: [operationRow(applied)],
      }),
    );
    const terminal = await summary();
    expect(terminal.ok && terminal.summary.eligibleCancellationId).toBeNull();

    // In scope and cancelling, but a reversal is already in flight.
    tables(
      coherentStripe({
        stripe_subscriptions: [subscriptionRow({ cancel_at_period_end: true })],
        stripe_commercial_operations: [
          operationRow(applied),
          operationRow({
            operation_id: REVERSAL_OP,
            kind: "reverse_cancel",
            state: "dispatching",
            quote_id: null,
          }),
        ],
      }),
    );
    const competing = await summary();
    expect(competing.ok && competing.summary.eligibleCancellationId).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /* Correction 2: coherence the first correction still left open        */
  /* ------------------------------------------------------------------ */

  it("holds terminal clearance when the raw row still grants paid access", async () => {
    // The named projection ended in 2019; the entitlement says active Growth
    // with a future paid period. Which of the two is current is exactly what
    // this evidence cannot say.
    tables({
      entitlements: [entitlementRow({ current_period_end: "2099-11-27T00:00:00.000Z" })],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [
        subscriptionRow({ status: "canceled", current_period_end: "2019-01-01T00:00:00.000Z" }),
      ],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "stripe_entitlement_unresolved",
    });
  });

  it("holds terminal clearance when the customer mapping is wrong or missing", async () => {
    const ended = {
      entitlements: [entitlementRow({ status: "cancelled" })],
      stripe_subscriptions: [subscriptionRow({ status: "canceled" })],
    };
    // A mapping that names somebody else.
    tables({ ...ended, stripe_customers: [customerRow({ customer_id: "cus_other" })] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "stripe_entitlement_unresolved",
    });
    // No mapping at all for the scope the projection lives in.
    tables({ ...ended, stripe_customers: [] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "stripe_entitlement_unresolved",
    });
    // Two mappings in the same scope is an ambiguity, not a choice.
    tables({
      ...ended,
      stripe_customers: [customerRow(), customerRow({ customer_id: "cus_second" })],
    });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: false,
      reason: "stripe_entitlement_unresolved",
    });
    // The coherent case still clears.
    tables({ ...ended, stripe_customers: [customerRow()] });
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: true,
      reason: "clear",
    });
  });

  it("does not let one test account's configuration act on another's agreement", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow({ account_id: OTHER_ACCOUNT })],
      stripe_subscriptions: [subscriptionRow({ account_id: OTHER_ACCOUNT })],
    });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both scopes are "test", but they are different accounts.
    expect(result.summary.mode).toBe("test");
    expect(result.summary.actions.prepareChange).toBe(false);
    expect(result.summary.actions.cancel).toBe(false);
    expect(result.summary.heldReason).toBe("subscription_mapping_uncertain");
  });

  it("offers recovery only for an operation in the configured account and the current agreement", async () => {
    // The agreement is configured and current, but the operation is not in it.
    tables(
      coherentStripe({
        stripe_commercial_operations: [
          operationRow({ account_id: OTHER_ACCOUNT, quote_id: OPEN_QUOTE }),
        ],
        stripe_commercial_quotes: [quoteRow({ account_id: OTHER_ACCOUNT })],
      }),
    );
    const foreignAccount = await summary();
    expect(foreignAccount.ok && foreignAccount.summary.actions.recoverOperation).toBe(false);
    expect(foreignAccount.ok && foreignAccount.summary.heldReason).toBe(
      "subscription_mapping_uncertain",
    );

    // The operation names a subscription the current agreement is not.
    tables(
      coherentStripe({
        stripe_commercial_operations: [
          operationRow({ subscription_id: "sub_other", quote_id: OPEN_QUOTE }),
        ],
        stripe_commercial_quotes: [quoteRow({ subscription_id: "sub_other" })],
      }),
    );
    const foreignSubscription = await summary();
    expect(foreignSubscription.ok && foreignSubscription.summary.actions.recoverOperation).toBe(
      false,
    );

    // A lone open operation with no agreement behind it at all.
    tables({ stripe_commercial_operations: [operationRow({ kind: "cancel", quote_id: null })] });
    const orphanOpen = await summary();
    expect(orphanOpen.ok).toBe(true);
    if (!orphanOpen.ok) return;
    expect(orphanOpen.summary.mode).toBeNull();
    expect(orphanOpen.summary.actions.recoverOperation).toBe(false);

    // …and the in-scope operation still recovers.
    tables(
      coherentStripe({
        stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
        stripe_commercial_quotes: [quoteRow()],
      }),
    );
    const inScope = await summary();
    expect(inScope.ok && inScope.summary.actions.recoverOperation).toBe(true);
  });

  it("never reports malformed or orphaned Stripe evidence as verified Free", async () => {
    for (const [label, store] of [
      [
        "an invalid terminal projection",
        {
          stripe_subscriptions: [
            subscriptionRow({
              status: "canceled",
              plan_id: "unknown_plan",
              cancel_at_period_end: "false",
            }),
          ],
        },
      ],
      [
        "an unknown checkout status",
        { stripe_checkout_requests: [checkoutRow({ status: "new" })] },
      ],
      [
        "an applied orphan cancellation",
        {
          stripe_commercial_operations: [
            operationRow({
              operation_id: CANCEL_OP,
              kind: "cancel",
              state: "applied",
              quote_id: null,
            }),
          ],
        },
      ],
    ] as [string, Record<string, TableValue>][]) {
      tables(store);
      const result = await summary();
      expect(result.ok, label).toBe(true);
      if (!result.ok) continue;
      expect(result.summary.provider, label).toBe("unknown");
      expect(result.summary.access, label).toBe("unknown");
      expect(result.summary.heldReason, label).not.toBeNull();
      expect(result.summary.actions.prepareChange, label).toBe(false);
      expect(result.summary.actions.manualOverride, label).toBe(false);
    }
  });

  it("keeps a test-mapping-only account unestablished for display but clear for manual", async () => {
    // The accepted policy is explicit: a test mapping alone neither proves a
    // subscription nor blocks a legitimate manual action, so the SERVER
    // clearance stays clear. What it does do is stop the screen claiming a
    // PROVEN absence, so the provider is reported as unestablished.
    //
    // The client is stricter still: `coherentSummary` withholds the visible
    // manual action for an unestablished provider. That is deliberate —
    // refusing is always allowed, and only the server may permit.
    tables({ stripe_customers: [customerRow()] });
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.provider).toBe("unknown");
    expect(result.summary.access).toBe("unknown");
    expect(result.summary.actions.prepareChange).toBe(false);
    expect(result.summary.actions.manualOverride).toBe(true);
    expect(await evaluateManualEntitlementClearance(COMMERCIAL_OWNER)).toEqual({
      allowed: true,
      reason: "clear",
    });
  });

  it("still reports a genuinely clean account as verified Free", async () => {
    tables();
    const result = await summary();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.provider).toBe("none");
    expect(result.summary.access).toBe("free");
    expect(result.summary.heldReason).toBeNull();
    expect(result.summary.actions.manualOverride).toBe(true);
  });

  it("still reports a verified manual or Paddle account by its own provider", async () => {
    for (const provider of ["manual", "paddle"] as const) {
      tables({
        entitlements: [entitlementRow({ provider, status: "manualBeta" })],
        stripe_customers: [customerRow()],
      });
      const result = await summary();
      expect(result.ok, provider).toBe(true);
      if (!result.ok) continue;
      expect(result.summary.provider, provider).toBe(provider);
      expect(result.summary.access, provider).toBe("paid");
      expect(result.summary.actions.paddlePortal, provider).toBe(provider === "paddle");
      expect(result.summary.actions.manualOverride, provider).toBe(true);
    }
  });

  it("exposes no provider identifier, key or dispatch evidence to a caller", async () => {
    tables({
      entitlements: [entitlementRow()],
      stripe_customers: [customerRow()],
      stripe_subscriptions: [subscriptionRow()],
      stripe_commercial_operations: [operationRow({ quote_id: OPEN_QUOTE })],
      stripe_commercial_quotes: [quoteRow()],
    });
    const result = await summary();
    const serialized = JSON.stringify(result);
    for (const secret of [
      COMMERCIAL_ACCOUNT_TEST,
      COMMERCIAL_CUSTOMER,
      COMMERCIAL_SUBSCRIPTION,
      "acct_",
      "cus_",
      "sub_",
      "price_",
      "rk_test",
      "idempotency",
      "fingerprint",
    ])
      expect(serialized, secret).not.toContain(secret);
    // Only the columns it needs are ever selected.
    const selected = mocks.from.mock.calls.map(([table]) => table);
    expect(new Set(selected)).toEqual(
      new Set([
        "entitlements",
        "stripe_customers",
        "stripe_subscriptions",
        "stripe_commercial_operations",
        "stripe_checkout_requests",
        "stripe_commercial_quotes",
      ]),
    );
  });
});
