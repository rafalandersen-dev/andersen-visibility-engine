/**
 * Stripe lifecycle — pure helpers and the mocked server paths.
 *
 * Nothing here reaches a network or a database: `fetch` is a stub that routes
 * synthetic Stripe payloads, and every database call is the mocked service-role
 * RPC. The point of the server half is to prove the DECISIONS (which object is
 * authoritative, what is pinned on the wire, when nothing is written at all),
 * not to prove Stripe's behaviour.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_SEATS } from "./billing";
import {
  ENTITLEMENT_GRANT_STATUSES,
  KNOWN_STRIPE_STATUSES,
  RELEVANT_STRIPE_EVENT_TYPES,
  STRIPE_LIFECYCLE_API_VERSION,
  TERMINAL_STRIPE_STATUSES,
  authoritativeReadTarget,
  blocksNewSubscription,
  buildPriceRegistry,
  completeListData,
  grantsPaidAccess,
  httpsUrlOn,
  integrationIdentifier,
  invoicePaymentEvidence,
  isIntegrationIdentifierSuffix,
  isRestrictedKey,
  isRevocableStripeStatus,
  isStripeAccountId,
  modeFromLivemode,
  priceRegistryEnvKey,
  readBillingPortalUrl,
  readCheckoutSession,
  readCreatedCustomerId,
  readSubscriptionEvidence,
  resolveSubscriptionItems,
  stripeEventEnvelope,
  targetKindForEventType,
  verifyStripeSignature,
  type PriceRegistry,
} from "./stripe-lifecycle";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import {
  createStripeLifecycleCheckout,
  createStripeLifecyclePortal,
  readPurchasedWorkingSeats,
  receiveStripeWebhook,
  replayPendingStripeReceipts,
  stripeLifecycleConfig,
} from "./stripe-lifecycle.server";

/* ========================================================================== */
/* Pure helpers                                                               */
/* ========================================================================== */

const NOW_MS = 1_793_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

describe("pinned API version", () => {
  it("is the full current stable version string, suffix included", () => {
    expect(STRIPE_LIFECYCLE_API_VERSION).toBe("2026-09-30.endive");
    // The bare date is not a valid version and must never be what we pin.
    expect(STRIPE_LIFECYCLE_API_VERSION).not.toBe("2026-09-30");
    expect(STRIPE_LIFECYCLE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
  });
  it("accepts an event envelope carrying the full version", () => {
    const parsed = stripeEventEnvelope.parse({
      id: "evt_1",
      type: "customer.subscription.updated",
      created: NOW_S,
      livemode: true,
      api_version: STRIPE_LIFECYCLE_API_VERSION,
      data: { object: { id: "sub_1", object: "subscription" } },
    });
    expect(parsed.api_version).toBe(STRIPE_LIFECYCLE_API_VERSION);
  });
  it("leaves the legacy isolated sandbox adapter pinned where it was", async () => {
    const { STRIPE_SANDBOX_API_VERSION } = await import("./stripe-sandbox.server");
    expect(STRIPE_SANDBOX_API_VERSION).toBe("2024-06-20");
  });
});

describe("signature verification", () => {
  const body = '{"id":"evt_1"}';
  const sign = (secret: string, ts: number, payload = body) =>
    `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex")}`;

  it("accepts a fresh signature and any matching rotation secret", () => {
    expect(verifyStripeSignature(sign("whsec_a", NOW_S), body, "whsec_a", NOW_MS)).toBe(true);
    const rotated = `${sign("whsec_a", NOW_S)},v1=${createHmac("sha256", "whsec_b")
      .update(`${NOW_S}.${body}`)
      .digest("hex")}`;
    expect(verifyStripeSignature(rotated, body, "whsec_b", NOW_MS)).toBe(true);
  });
  it("refuses a stale, forged, altered, duplicated or absent signature", () => {
    expect(verifyStripeSignature(sign("whsec_a", NOW_S - 400), body, "whsec_a", NOW_MS)).toBe(
      false,
    );
    expect(verifyStripeSignature(sign("whsec_a", NOW_S), body, "whsec_b", NOW_MS)).toBe(false);
    expect(verifyStripeSignature(sign("whsec_a", NOW_S), `${body} `, "whsec_a", NOW_MS)).toBe(
      false,
    );
    expect(
      verifyStripeSignature(`${sign("whsec_a", NOW_S)},t=${NOW_S}`, body, "whsec_a", NOW_MS),
    ).toBe(false);
    expect(verifyStripeSignature(null, body, "whsec_a", NOW_MS)).toBe(false);
    expect(verifyStripeSignature(sign("whsec_a", NOW_S), body, "", NOW_MS)).toBe(false);
    expect(verifyStripeSignature(`t=${NOW_S},v1=zz`, body, "whsec_a", NOW_MS)).toBe(false);
    expect(verifyStripeSignature("x".repeat(5000), body, "whsec_a", NOW_MS)).toBe(false);
  });
});

describe("identity helpers", () => {
  it("keeps mode, key and account checks strict", () => {
    expect(modeFromLivemode(true)).toBe("live");
    expect(modeFromLivemode(false)).toBe("test");
    expect(isRestrictedKey("rk_live_abc", "live")).toBe(true);
    expect(isRestrictedKey("rk_test_abc", "live")).toBe(false);
    expect(isRestrictedKey("sk_live_abc", "live")).toBe(false);
    expect(isStripeAccountId("acct_1UG25BR3iZxco14q")).toBe(true);
    expect(isStripeAccountId("acct")).toBe(false);
  });
  it("requires a stable eight-LETTER integration identifier suffix", () => {
    expect(isIntegrationIdentifierSuffix("abcdefgh")).toBe(true);
    expect(integrationIdentifier("ABCDEFGH")).toBe("milo_abcdefgh");
    // A UUID fragment is rejected: digits and hyphens are not letters.
    for (const bad of ["3f2a1b4c", "abcdefg", "abcdefghi", "abcdef-h", "", "12345678"])
      expect(isIntegrationIdentifierSuffix(bad)).toBe(false);
    expect(() => integrationIdentifier("3f2a1b4c")).toThrow(/stripe_integration_identifier/);
  });
  it("derives a read target from the object discriminator only", () => {
    expect(authoritativeReadTarget({ object: "subscription", id: "sub_1" })).toEqual({
      kind: "subscription",
      id: "sub_1",
    });
    expect(authoritativeReadTarget({ object: "invoice", id: "in_1" })?.kind).toBe("invoice");
    expect(authoritativeReadTarget({ object: "checkout.session", id: "cs_1" })?.kind).toBe(
      "checkout_session",
    );
    expect(authoritativeReadTarget({ object: "charge", id: "ch_1" })).toBeNull();
    expect(authoritativeReadTarget({ object: "subscription" })).toBeNull();
    expect(targetKindForEventType("customer.subscription.deleted")).toBe("subscription");
    expect(targetKindForEventType("invoice.paid")).toBe("invoice");
    expect(targetKindForEventType("checkout.session.completed")).toBe("checkout_session");
    expect(targetKindForEventType("charge.refunded")).toBeNull();
    for (const type of RELEVANT_STRIPE_EVENT_TYPES)
      expect(targetKindForEventType(type)).toBeTruthy();
  });
});

describe("configured product/price registry", () => {
  const base = {
    STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:month",
    STRIPE_PRICE_PRO_SEAT_LIVE: "price_proseat:prod_pro:eur:month",
    STRIPE_PRICE_AGENCY_BASE_LIVE: "price_agency:prod_agency:pln:year:1",
  };
  it("names its environment keys per plan, role and mode", () => {
    expect(priceRegistryEnvKey("pro", "base", "live")).toBe("STRIPE_PRICE_PRO_BASE_LIVE");
    expect(priceRegistryEnvKey("agency", "seat", "test")).toBe("STRIPE_PRICE_AGENCY_SEAT_TEST");
  });
  it("represents the configured product, currency, interval and plan-specific seat item", () => {
    const result = buildPriceRegistry("live", base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.registry.get("price_pro")).toEqual({
      kind: "base",
      planId: "pro",
      priceId: "price_pro",
      productId: "prod_pro",
      currency: "eur",
      interval: "month",
      intervalCount: 1,
    });
    expect(result.registry.get("price_proseat")).toMatchObject({ kind: "seat", planId: "pro" });
    // A different plan keeps its own currency/interval — nothing is hardcoded to USD.
    expect(result.registry.get("price_agency")).toMatchObject({
      currency: "pln",
      interval: "year",
      planId: "agency",
    });
    // The other mode is independent and may be entirely unconfigured.
    expect(buildPriceRegistry("test", base)).toEqual({ ok: true, registry: new Map() });
  });
  it("treats a duplicate price id as a configuration error instead of keeping the first", () => {
    expect(
      buildPriceRegistry("live", {
        STRIPE_PRICE_PRO_BASE_LIVE: "price_same:prod_pro:eur:month",
        STRIPE_PRICE_GROWTH_BASE_LIVE: "price_same:prod_growth:eur:month",
      }),
    ).toEqual({ ok: false, reason: "duplicate_price_price_same" });
    expect(
      buildPriceRegistry("live", {
        STRIPE_PRICE_PRO_BASE_LIVE: "price_x:prod_pro:eur:month",
        STRIPE_PRICE_PRO_SEAT_LIVE: "price_x:prod_pro:eur:month",
      }).ok,
    ).toBe(false);
  });
  it.each([
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "price_pro" }],
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur" }],
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "pri_pro:prod_pro:eur:month" }],
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:pro_x:eur:month" }],
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:euro:month" }],
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:decade" }],
    ["malformed_price_pro_base", { STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:month:0" }],
    ["seat_without_base_pro", { STRIPE_PRICE_PRO_SEAT_LIVE: "price_s:prod_pro:eur:month" }],
    [
      "seat_terms_mismatch_pro",
      {
        STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:month",
        STRIPE_PRICE_PRO_SEAT_LIVE: "price_s:prod_pro:eur:year",
      },
    ],
    [
      "seat_currency_unapproved_pro",
      {
        STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:pln:month",
        STRIPE_PRICE_PRO_SEAT_LIVE: "price_s:prod_pro:pln:month",
      },
    ],
  ])("fails configuration with %s", (reason, env) => {
    expect(buildPriceRegistry("live", env)).toEqual({ ok: false, reason });
  });
  it("keeps the owner-approved seat model as the only seat policy", () => {
    expect(PLAN_SEATS).toMatchObject({
      starter: { workingSeats: 2, viewerSeats: 2, extraWorkingSeatEur: 15 },
      growth: { workingSeats: 3, viewerSeats: 5, extraWorkingSeatEur: 15 },
      pro: { workingSeats: 5, viewerSeats: 10, extraWorkingSeatEur: 12 },
      agency: { workingSeats: 10, viewerSeats: 50, extraWorkingSeatEur: 10 },
    });
  });
});

describe("subscription item resolution", () => {
  const registry = (() => {
    const built = buildPriceRegistry("live", {
      STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:month",
      STRIPE_PRICE_PRO_SEAT_LIVE: "price_proseat:prod_pro:eur:month",
      STRIPE_PRICE_GROWTH_BASE_LIVE: "price_growth:prod_growth:eur:month",
      STRIPE_PRICE_GROWTH_SEAT_LIVE: "price_growthseat:prod_growth:eur:month",
    });
    if (!built.ok) throw new Error(built.reason);
    return built.registry as PriceRegistry;
  })();
  const item = (over: Record<string, unknown> = {}) => ({
    priceId: "price_pro",
    productId: "prod_pro",
    currency: "eur",
    interval: "month",
    intervalCount: 1,
    quantity: 1,
    currentPeriodStart: NOW_S - 100,
    currentPeriodEnd: NOW_S + 86_400,
    ...over,
  });
  const seat = (over: Record<string, unknown> = {}) =>
    item({ priceId: "price_proseat", quantity: 4, ...over });
  const resolve = (items: ReturnType<typeof item>[], hasMore: unknown = false) =>
    resolveSubscriptionItems({ items, hasMore, registry, nowSeconds: NOW_S });

  it("resolves a base item and a plan-specific seat item", () => {
    expect(resolve([item()])).toEqual({
      ok: true,
      value: { planId: "pro", seatQuantity: 0, currentPeriodEnd: NOW_S + 86_400 },
    });
    expect(resolve([item(), seat()])).toEqual({
      ok: true,
      value: { planId: "pro", seatQuantity: 4, currentPeriodEnd: NOW_S + 86_400 },
    });
  });
  it("takes the conservative minimum period across items and never grants indefinitely", () => {
    expect(resolve([item(), seat({ currentPeriodEnd: NOW_S + 60 })])).toMatchObject({
      ok: true,
      value: { currentPeriodEnd: NOW_S + 60 },
    });
    expect(resolve([item({ currentPeriodEnd: undefined })])).toEqual({
      ok: false,
      reason: "missing_period",
    });
    expect(resolve([item({ currentPeriodEnd: null })]).ok).toBe(false);
    expect(resolve([item({ currentPeriodEnd: "1793000000" })]).ok).toBe(false);
    expect(resolve([item({ currentPeriodEnd: NOW_S - 1 })])).toEqual({
      ok: false,
      reason: "period_elapsed",
    });
    expect(resolve([item({ currentPeriodStart: NOW_S + 90_000 })]).ok).toBe(false);
    expect(resolve([item({ currentPeriodStart: undefined })]).ok).toBe(false);
    expect(resolve([item(), seat({ currentPeriodEnd: NOW_S - 1 })])).toEqual({
      ok: false,
      reason: "period_elapsed",
    });
  });
  it("refuses an unexpected extra page and an empty or oversized item set", () => {
    // `has_more` must be exactly false: a truthy, absent or non-boolean page
    // flag means the item set we resolved may be incomplete.
    for (const hasMore of [true, null, "false", 0])
      expect(
        resolveSubscriptionItems({ items: [item()], hasMore, registry, nowSeconds: NOW_S }),
      ).toEqual({ ok: false, reason: "unexpected_has_more" });
    expect(
      resolveSubscriptionItems({
        items: [item()],
        hasMore: undefined,
        registry,
        nowSeconds: NOW_S,
      }),
    ).toEqual({ ok: false, reason: "unexpected_has_more" });
    expect(resolve([])).toEqual({ ok: false, reason: "unexpected_item_count" });
  });
  it.each([
    ["unknown_price", [{ priceId: "price_unlisted" }]],
    ["unknown_product", [{ productId: "prod_other" }]],
    ["currency_interval_mismatch", [{ currency: "usd" }]],
    ["currency_interval_mismatch", [{ interval: "year" }]],
    ["currency_interval_mismatch", [{ intervalCount: 3 }]],
    ["malformed_quantity", [{ quantity: 0 }]],
    ["malformed_quantity", [{ quantity: 1.5 }]],
    ["malformed_quantity", [{ quantity: "1" }]],
    ["malformed_quantity", [{ quantity: undefined }]],
    ["malformed_quantity", [{ quantity: 1001 }]],
    ["unexpected_base_quantity", [{ quantity: 2 }]],
  ])("refuses %s", (reason, overrides) => {
    expect(resolve(overrides.map((over) => item(over)))).toEqual({ ok: false, reason });
  });
  it("refuses duplicates, a second base item, a foreign seat item and too many items", () => {
    expect(resolve([item(), item()])).toEqual({ ok: false, reason: "duplicate_item" });
    expect(resolve([item(), item({ priceId: "price_growth", productId: "prod_growth" })])).toEqual({
      ok: false,
      reason: "duplicate_base_item",
    });
    expect(
      resolve([item(), seat({ priceId: "price_growthseat", productId: "prod_growth" })]),
    ).toEqual({ ok: false, reason: "seat_plan_mismatch" });
    expect(resolve([seat()])).toEqual({ ok: false, reason: "missing_base_item" });
    expect(resolve([item(), seat(), seat({ priceId: "price_growthseat" })])).toEqual({
      ok: false,
      reason: "unexpected_item_count",
    });
  });
});

describe("paid access decision", () => {
  const base = {
    mode: "live" as const,
    status: "active",
    paid: true,
    currentPeriodEnd: NOW_S + 60,
    nowSeconds: NOW_S,
  };
  it("grants only a live, active-or-trialing, paid, unexpired subscription", () => {
    expect(grantsPaidAccess(base)).toBe(true);
    expect(grantsPaidAccess({ ...base, status: "trialing" })).toBe(true);
    expect(grantsPaidAccess({ ...base, mode: "test" })).toBe(false);
    expect(grantsPaidAccess({ ...base, status: "past_due" })).toBe(false);
    expect(grantsPaidAccess({ ...base, status: "canceled" })).toBe(false);
    expect(grantsPaidAccess({ ...base, paid: false })).toBe(false);
    expect(grantsPaidAccess({ ...base, currentPeriodEnd: NOW_S - 1 })).toBe(false);
    expect(grantsPaidAccess({ ...base, currentPeriodEnd: 0 })).toBe(false);
  });
});

describe("status policy distinguishes granting from merely existing", () => {
  it("grants only active and trialing", () => {
    expect([...ENTITLEMENT_GRANT_STATUSES]).toEqual(["active", "trialing"]);
  });
  it("treats only canceled and incomplete_expired as confidently over", () => {
    expect([...TERMINAL_STRIPE_STATUSES]).toEqual(["canceled", "incomplete_expired"]);
    // Everything else blocks a second checkout, including statuses that grant
    // nothing: a second subscription is not recoverable by retrying.
    for (const status of ["incomplete", "past_due", "unpaid", "paused", "trialing", "active"])
      expect(blocksNewSubscription(status)).toBe(true);
    for (const status of ["canceled", "incomplete_expired"])
      expect(blocksNewSubscription(status)).toBe(false);
    // An unknown, empty or non-string status is never "safe to replace".
    for (const status of ["cancelled", "", undefined, null, 42, {}])
      expect(blocksNewSubscription(status)).toBe(true);
  });
  it("allows a revoke only from an explicit non-granting status", () => {
    for (const status of [
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "paused",
    ])
      expect(isRevocableStripeStatus(status)).toBe(true);
    // active/trialing are grant-eligible: a non-grant there means missing
    // evidence, not a cancellation. Unknown statuses revoke nothing.
    for (const status of ["active", "trialing", "cancelled", "weird", "", null])
      expect(isRevocableStripeStatus(status)).toBe(false);
  });
  it("covers the documented Stripe status set exactly once", () => {
    expect([...KNOWN_STRIPE_STATUSES].sort()).toEqual([
      "active",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "past_due",
      "paused",
      "trialing",
      "unpaid",
    ]);
  });
});

describe("invoice evidence keeps unpaid and unknown apart", () => {
  const invoice = (over: Record<string, unknown> = {}) => ({
    id: "in_1",
    object: "invoice",
    status: "paid",
    livemode: true,
    customer: "cus_1",
    amount_remaining: 0,
    status_transitions: { paid_at: NOW_S - 10 },
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
    ...over,
  });
  const evidence = (over: Record<string, unknown> = {}) =>
    invoicePaymentEvidence({
      invoice: invoice(over),
      mode: "live",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });

  it("reports a genuinely paid invoice as paid", () => {
    expect(evidence()).toEqual({ state: "paid" });
    // An expanded customer/subscription object is equivalent to its id.
    expect(
      evidence({
        customer: { id: "cus_1" },
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: { id: "sub_1" } },
        },
      }),
    ).toEqual({ state: "paid" });
  });
  it("never consults the removed invoice.paid boolean", () => {
    // An object carrying only `paid: true` proves nothing...
    expect(
      invoicePaymentEvidence({
        invoice: { object: "invoice", paid: true, livemode: true, customer: "cus_1" },
        mode: "live",
        customerId: "cus_1",
        subscriptionId: "sub_1",
      }),
    ).toEqual({ state: "unknown", reason: "invoice_parent" });
    // ... and a `paid: false` flag cannot veto a genuinely paid invoice.
    expect(evidence({ paid: false })).toEqual({ state: "paid" });
  });
  it("reads the subscription from parent.subscription_details only", () => {
    expect(evidence({ parent: { type: "quote_details" } })).toEqual({
      state: "unknown",
      reason: "invoice_parent",
    });
    // A legacy top-level `subscription` is ignored, not trusted.
    expect(
      evidence({
        subscription: "sub_1",
        parent: { type: "subscription_details", subscription_details: {} },
      }),
    ).toEqual({ state: "unknown", reason: "invoice_subscription" });
  });
  it.each([
    ["draft", "invoice_draft"],
    ["open", "invoice_open"],
    ["void", "invoice_void"],
    ["uncollectible", "invoice_uncollectible"],
  ])("reports %s as authoritatively unpaid", (status, reason) => {
    expect(evidence({ status })).toEqual({ state: "unpaid", reason });
  });
  it("reports an outstanding amount on a paid invoice as unpaid", () => {
    expect(evidence({ amount_remaining: 500 })).toEqual({
      state: "unpaid",
      reason: "invoice_amount_remaining",
    });
  });
  it.each([
    ["an absent invoice", undefined, "invoice_absent"],
    ["a null invoice", null, "invoice_absent"],
    ["an unexpanded id", "in_1", "invoice_unreadable"],
    ["a non-object", 42, "invoice_unreadable"],
  ])("reports %s as unknown, never as unpaid", (_label, value, reason) => {
    expect(
      invoicePaymentEvidence({
        invoice: value,
        mode: "live",
        customerId: "cus_1",
        subscriptionId: "sub_1",
      }),
    ).toEqual({ state: "unknown", reason });
  });
  it.each([
    ["the other mode", { livemode: false }, "invoice_mode"],
    ["another customer", { customer: "cus_other" }, "invoice_customer"],
    ["no subscription parent", { parent: null }, "invoice_parent"],
    [
      "another subscription",
      {
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_x" } },
      },
      "invoice_subscription",
    ],
    ["an unrecognised status", { status: "scheduled" }, "invoice_status_unknown"],
    ["a missing status", { status: undefined }, "invoice_status_unknown"],
    ["a paid invoice without paid_at", { status_transitions: {} }, "invoice_paid_at"],
  ])("reports %s as unknown evidence", (_label, over, reason) => {
    // Foreign or malformed evidence must never justify a revoke.
    expect(evidence(over)).toEqual({ state: "unknown", reason });
  });
});

describe("authoritative object readers", () => {
  const registry = buildPriceRegistry("live", {
    STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:month",
  });
  const item = {
    id: "si_1",
    quantity: 1,
    price: {
      id: "price_pro",
      product: "prod_pro",
      currency: "eur",
      recurring: { interval: "month", interval_count: 1 },
    },
    current_period_start: NOW_S - 10,
    current_period_end: NOW_S + 86_400,
  };
  const raw = (over: Record<string, unknown> = {}) => ({
    id: "sub_1",
    object: "subscription",
    status: "active",
    livemode: true,
    customer: "cus_1",
    cancel_at_period_end: false,
    items: { object: "list", has_more: false, data: [item] },
    latest_invoice: {
      object: "invoice",
      status: "paid",
      livemode: true,
      customer: "cus_1",
      amount_remaining: 0,
      status_transitions: { paid_at: NOW_S - 10 },
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
    },
    ...over,
  });
  const read = (over: Record<string, unknown> = {}) =>
    readSubscriptionEvidence({
      raw: raw(over),
      mode: "live",
      registry,
      customerId: "cus_1",
      nowSeconds: NOW_S,
    });

  it("returns separable item and payment evidence for a readable subscription", () => {
    const result = read();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ id: "sub_1", status: "active", cancelAtPeriodEnd: false });
    expect(result.value.items).toEqual({
      ok: true,
      value: { planId: "pro", seatQuantity: 0, currentPeriodEnd: NOW_S + 86_400 },
    });
    expect(result.value.payment).toEqual({ state: "paid" });
  });
  it.each([
    ["a non-object", { raw: 1 }, "subscription_unreadable"],
    ["another object kind", { object: "charge" }, "subscription_object"],
    ["a malformed id", { id: "sub-1" }, "subscription_id"],
    ["a missing id", { id: undefined }, "subscription_id"],
    ["the other mode", { livemode: false }, "subscription_mode"],
    ["a missing livemode", { livemode: undefined }, "subscription_mode"],
    ["another customer", { customer: "cus_other" }, "subscription_customer"],
    ["an unknown status", { status: "hibernating" }, "subscription_status_unknown"],
    ["a missing status", { status: undefined }, "subscription_status_unknown"],
    ["a missing cancel flag", { cancel_at_period_end: undefined }, "subscription_cancel_flag"],
  ])("refuses %s outright", (_label, over, reason) => {
    const result =
      "raw" in over
        ? readSubscriptionEvidence({
            raw: over.raw,
            mode: "live",
            registry,
            customerId: "cus_1",
            nowSeconds: NOW_S,
          })
        : read(over);
    expect(result).toEqual({ ok: false, reason });
  });
  it("keeps an unreadable item set as item evidence, not as a refusal", () => {
    // The subscription is genuinely this customer's and genuinely active; only
    // its plan/period evidence is missing, which must stay retryable.
    const result = read({ items: { object: "list", has_more: false } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual({ ok: false, reason: "items_unreadable" });
    const unknownPrice = read({
      items: {
        object: "list",
        has_more: false,
        data: [{ ...item, price: { ...item.price, id: "price_unlisted" } }],
      },
    });
    expect(unknownPrice.ok && unknownPrice.value.items).toEqual({
      ok: false,
      reason: "unknown_price",
    });
  });
  it("treats a missing or paginated list as incomplete, never as empty", () => {
    expect(completeListData({ object: "list", data: [], has_more: false })).toEqual({
      ok: true,
      data: [],
    });
    expect(completeListData({ object: "list", has_more: false })).toEqual({
      ok: false,
      reason: "list_data_missing",
    });
    expect(completeListData({ object: "list", data: [], has_more: true })).toEqual({
      ok: false,
      reason: "list_incomplete",
    });
    expect(completeListData({ data: [] })).toEqual({ ok: false, reason: "list_incomplete" });
    expect(completeListData({ object: "search_result", data: [], has_more: false })).toEqual({
      ok: false,
      reason: "list_object",
    });
    expect(completeListData(null)).toEqual({ ok: false, reason: "list_unreadable" });
  });
  it("reads a checkout session only for its own mode and known statuses", () => {
    const session = (over: Record<string, unknown> = {}) =>
      readCheckoutSession(
        {
          id: "cs_test_1",
          object: "checkout.session",
          livemode: false,
          status: "open",
          url: "https://checkout.stripe.com/c/pay/cs_test_1",
          customer: "cus_1",
          subscription: "sub_1",
          client_reference_id: "req-1",
          ...over,
        },
        "test",
      );
    expect(session()).toEqual({
      id: "cs_test_1",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      clientReferenceId: "req-1",
    });
    expect(session({ status: "complete" })?.status).toBe("complete");
    expect(session({ status: "expired" })?.status).toBe("expired");
    // An unrecognised status is uncertainty, not expiry.
    expect(session({ status: "settling" })?.status).toBeNull();
    expect(session({ status: undefined })?.status).toBeNull();
    for (const over of [
      { id: "cs_live_1" },
      { livemode: true },
      { object: "payment_intent" },
      { id: "cs_test" },
    ])
      expect(session(over)).toBeNull();
    for (const url of [
      "https://checkout.stripe.com.evil.test/c",
      "http://checkout.stripe.com/c",
      "https://a:b@checkout.stripe.com/c",
      "https://checkout.stripe.com:8443/c",
      "not-a-url",
      undefined,
    ])
      expect(session({ url })?.url).toBeNull();
  });
  it("accepts only the exact billing portal host for the caller's own customer", () => {
    const portal = (over: Record<string, unknown> = {}) =>
      readBillingPortalUrl(
        {
          id: "bps_1",
          object: "billing_portal.session",
          livemode: false,
          customer: "cus_1",
          url: "https://billing.stripe.com/p/session/x",
          ...over,
        },
        "test",
        "cus_1",
      );
    expect(portal()).toBe("https://billing.stripe.com/p/session/x");
    // The old `endsWith('stripe.com')` test would have accepted these.
    for (const url of [
      "https://billing.stripe.com.evil.test/p",
      "https://evilstripe.com/p",
      "https://checkout.stripe.com/p",
      "http://billing.stripe.com/p",
      "https://billing.stripe.com:444/p",
      "https://u:p@billing.stripe.com/p",
    ])
      expect(portal({ url })).toBeNull();
    for (const over of [
      { livemode: true },
      { customer: "cus_other" },
      { id: "prt_1" },
      { object: "checkout.session" },
    ])
      expect(portal(over)).toBeNull();
    expect(
      readBillingPortalUrl({ id: "bps_1", livemode: false, customer: "cus_1" }, "test", ""),
    ).toBeNull();
  });
  it("validates a created customer's identity and mode", () => {
    expect(
      readCreatedCustomerId({ id: "cus_1", object: "customer", livemode: false }, "test"),
    ).toBe("cus_1");
    for (const raw of [
      { id: "cus_1", object: "customer", livemode: true },
      { id: "cust_1", object: "customer", livemode: false },
      { id: "cus_1", object: "account", livemode: false },
      { object: "customer", livemode: false },
      null,
    ])
      expect(readCreatedCustomerId(raw, "test")).toBeNull();
  });
  it("accepts an https url only on the exact host", () => {
    expect(httpsUrlOn("https://a.test/x", "a.test")).toBe("https://a.test/x");
    expect(httpsUrlOn("https://b.a.test/x", "a.test")).toBeNull();
    expect(httpsUrlOn(42, "a.test")).toBeNull();
  });
});

/* ========================================================================== */
/* Mocked server paths                                                        */
/* ========================================================================== */

const ACCOUNT_LIVE = "acct_fixtureLIVE";
const ACCOUNT_TEST = "acct_fixtureTEST";
const OWNER = "00000000-0000-4000-8000-000000000001";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const ENV: Record<string, string> = {
  STRIPE_ACCOUNT_ID_LIVE: ACCOUNT_LIVE,
  STRIPE_ACCOUNT_ID_TEST: ACCOUNT_TEST,
  STRIPE_RESTRICTED_KEY_LIVE: "rk_live_fixture",
  STRIPE_RESTRICTED_KEY_TEST: "rk_test_fixture",
  STRIPE_WEBHOOK_SECRET_LIVE: "whsec_live_fixture",
  STRIPE_WEBHOOK_SECRET_TEST: "whsec_test_fixture",
  STRIPE_PRICE_PRO_BASE_LIVE: "price_pro:prod_pro:eur:month",
  STRIPE_PRICE_PRO_SEAT_LIVE: "price_proseat:prod_pro:eur:month",
  STRIPE_PRICE_PRO_BASE_TEST: "price_tpro:prod_tpro:eur:month",
  STRIPE_PRICE_PRO_SEAT_TEST: "price_tproseat:prod_tpro:eur:month",
  STRIPE_INTEGRATION_IDENTIFIER_SUFFIX: "abcdefgh",
  MILO_STRIPE_LIFECYCLE_RETURN_BASE: "https://milogrowth.com/app/billing",
  MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS: OWNER,
};

type Handler = (url: URL, init: RequestInit) => unknown;
let routes: Record<string, Handler>;
let calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string }>;

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/* ------------------------------- fixtures ------------------------------- */

const subscriptionItem = (over: Record<string, unknown> = {}) => ({
  id: "si_1",
  quantity: 1,
  price: {
    id: "price_pro",
    product: "prod_pro",
    currency: "eur",
    recurring: { interval: "month", interval_count: 1 },
  },
  current_period_start: NOW_S - 100,
  current_period_end: NOW_S + 86_400,
  ...over,
});
const paidInvoice = (subscriptionId = "sub_live_1", over: Record<string, unknown> = {}) => ({
  id: "in_1",
  object: "invoice",
  status: "paid",
  livemode: true,
  customer: "cus_1",
  amount_remaining: 0,
  status_transitions: { paid_at: NOW_S - 10 },
  parent: { type: "subscription_details", subscription_details: { subscription: subscriptionId } },
  ...over,
});
const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_live_1",
  object: "subscription",
  status: "active",
  livemode: true,
  customer: "cus_1",
  cancel_at_period_end: false,
  items: { object: "list", has_more: false, data: [subscriptionItem()] },
  latest_invoice: paidInvoice(),
  ...over,
});
const testSubscription = (over: Record<string, unknown> = {}) =>
  subscription({
    id: "sub_test_1",
    livemode: false,
    items: {
      object: "list",
      has_more: false,
      data: [
        subscriptionItem({
          price: {
            id: "price_tpro",
            product: "prod_tpro",
            currency: "eur",
            recurring: { interval: "month", interval_count: 1 },
          },
        }),
      ],
    },
    latest_invoice: paidInvoice("sub_test_1", { livemode: false }),
    ...over,
  });
const list = (data: unknown[], hasMore = false) => ({ object: "list", data, has_more: hasMore });
const liveSession = (over: Record<string, unknown> = {}) => ({
  id: "cs_live_1",
  object: "checkout.session",
  livemode: true,
  status: "open",
  url: "https://checkout.stripe.com/c/pay/cs_live_1",
  customer: "cus_1",
  subscription: "sub_live_1",
  client_reference_id: REQUEST,
  ...over,
});
const testSession = (over: Record<string, unknown> = {}) =>
  liveSession({
    id: "cs_test_1",
    livemode: false,
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
    subscription: "",
    ...over,
  });

const sign = (body: string, secret: string, ts = NOW_S) =>
  `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;

const event = (over: Record<string, unknown> = {}) => ({
  id: "evt_1",
  type: "customer.subscription.updated",
  created: NOW_S,
  livemode: true,
  api_version: STRIPE_LIFECYCLE_API_VERSION,
  data: { object: { id: "sub_live_1", object: "subscription" } },
  ...over,
});

const deliver = (
  body: unknown,
  opts: {
    secret?: string;
    env?: Record<string, string>;
    signature?: string;
    now?: number | (() => number);
  } = {},
) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return receiveStripeWebhook(
    new Request("https://milogrowth.com/api/public/webhooks/stripe", {
      method: "POST",
      body: raw,
      headers: {
        "stripe-signature":
          opts.signature ?? sign(raw, opts.secret ?? ENV.STRIPE_WEBHOOK_SECRET_LIVE),
      },
    }),
    {
      env: opts.env ?? ENV,
      now: opts.now ?? NOW_MS,
      fetch: mocks.fetch as unknown as typeof fetch,
    },
  );
};

/* ---------------------------- the mocked RPC ---------------------------- */

/** A service-role RPC that answers with an ERROR (the transport worked, the
 * function refused) rather than with a value. */
class RpcError {
  constructor(readonly message = "synthetic rpc failure") {}
}
const rpcFails = (message?: string) => new RpcError(message);

/** The permissive default: a new receipt, a granted and still-live lease, a
 * mapped owner, a pending request. Each test overrides only what it is about,
 * so a forgotten override can never silently look like a grant. */
const DEFAULT_RPC: Record<string, unknown> = {
  stripe_record_webhook_receipt: "recorded",
  stripe_claim_account_lease: 7,
  stripe_renew_account_lease: true,
  stripe_release_account_lease: null,
  stripe_finish_webhook_receipt: true,
  stripe_customer_projection: [
    { user_id: OWNER, subscription_id: null, plan_id: null, status: null },
  ],
  stripe_apply_subscription_projection: "applied_grant",
  stripe_claim_replay_receipt: [],
  stripe_owner_customer: "cus_1",
  stripe_upsert_customer: null,
  stripe_claim_checkout_request: [
    { status: "pending", session_id: null, created_at: new Date(NOW_MS).toISOString() },
  ],
  stripe_open_checkout_request: true,
  stripe_fence_checkout_request: true,
  stripe_settle_checkout_request: true,
  stripe_expire_checkout_session: true,
  stripe_purchased_working_seats: 0,
};
const rpcTable = (over: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...DEFAULT_RPC, ...over };
  mocks.rpc.mockImplementation((name: string) => {
    const value = name in data ? data[name] : null;
    if (value instanceof RpcError)
      return Promise.resolve({ data: null, error: { message: value.message } });
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve({
      data: typeof value === "function" ? (value as () => unknown)() : value,
      error: null,
    });
  });
};
/** The stored projection row for the mapped customer. */
const stored = (over: Record<string, unknown> = {}) => [
  { user_id: OWNER, subscription_id: null, plan_id: null, status: null, ...over },
];

const rpcArgs = (name: string) =>
  mocks.rpc.mock.calls.filter((call) => call[0] === name).map((call) => call[1]);
const rpcNames = () => mocks.rpc.mock.calls.map((call) => call[0]);
const applied = () => rpcArgs("stripe_apply_subscription_projection");
const finished = () => rpcArgs("stripe_finish_webhook_receipt");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  calls = [];
  routes = {
    "GET /v1/account": () => json({ id: ACCOUNT_LIVE, object: "account" }),
    "GET /v1/subscriptions/sub_live_1": () => json(subscription()),
    "GET /v1/subscriptions": () => json(list([subscription()])),
  };
  mocks.fetch.mockImplementation((input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>),
    );
    calls.push({ url: url.href, method, headers, body: init.body ? String(init.body) : "" });
    const key = `${method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) return Promise.resolve(json({ error: { message: "unrouted" } }, 404));
    const result = handler(url, init);
    return Promise.resolve(result instanceof Response ? result : json(result));
  });
  rpcTable();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuration gating", () => {
  it("reports an explicit configuration error instead of silently ignoring prices", () => {
    const config = stripeLifecycleConfig({
      ...ENV,
      STRIPE_PRICE_GROWTH_BASE_LIVE: "price_pro:prod_growth:eur:month",
    });
    expect(config.configError("live")).toBe("registry_duplicate_price_price_pro");
    expect(config.webhookReady("live")).toBe(false);
    expect(config.checkoutReady("live")).toBe(false);
  });
  it("keeps live and test account ids separate and never assumes one account", () => {
    const config = stripeLifecycleConfig(ENV);
    expect(config.accountIds).toEqual({ live: ACCOUNT_LIVE, test: ACCOUNT_TEST });
    expect(config.configError("live")).toBeNull();
    expect(config.configError("test")).toBeNull();
    expect(stripeLifecycleConfig({ ...ENV, STRIPE_ACCOUNT_ID_TEST: "" }).configError("test")).toBe(
      "account_not_configured",
    );
    expect(
      stripeLifecycleConfig({ ...ENV, STRIPE_RESTRICTED_KEY_TEST: "rk_live_x" }).configError(
        "test",
      ),
    ).toBe("key_not_configured");
  });
  it("defaults the sandbox owner allowlist to empty and ignores malformed entries", () => {
    expect(
      stripeLifecycleConfig({ ...ENV, MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS: "" }).sandboxOwners
        .size,
    ).toBe(0);
    expect(stripeLifecycleConfig({}).sandboxOwners.size).toBe(0);
    expect(
      stripeLifecycleConfig({ ...ENV, MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS: "owner,42" })
        .sandboxOwners.size,
    ).toBe(0);
  });
  it("requires an https return base and a letter suffix before checkout is ready", () => {
    expect(
      stripeLifecycleConfig({
        ...ENV,
        MILO_STRIPE_LIFECYCLE_RETURN_BASE: "http://x.test",
      }).checkoutReady("test"),
    ).toBe(false);
    expect(
      stripeLifecycleConfig({
        ...ENV,
        STRIPE_INTEGRATION_IDENTIFIER_SUFFIX: "3f2a1b4c",
      }).checkoutReady("test"),
    ).toBe(false);
    expect(stripeLifecycleConfig(ENV).checkoutReady("test")).toBe(true);
  });
});

describe("webhook admission", () => {
  it("refuses an unconfigured deployment without touching the database", async () => {
    const response = await deliver(event(), { env: {} });
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("refuses a bad signature, a malformed body and a foreign account/mode/version", async () => {
    expect((await deliver(event(), { secret: "whsec_wrong" })).status).toBe(401);
    expect((await deliver("not-json")).status).toBe(400);
    expect((await deliver(event({ id: "sub_1" }))).status).toBe(400);
    // The test secret verifies, but the envelope claims live mode.
    expect((await deliver(event(), { secret: ENV.STRIPE_WEBHOOK_SECRET_TEST })).status).toBe(400);
    expect((await deliver(event({ account: "acct_someoneelse" }))).status).toBe(400);
    // The bare date is not the pinned version.
    expect((await deliver(event({ api_version: "2026-09-30" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("acknowledges a completed duplicate but reprocesses a pending one", async () => {
    rpcTable({ stripe_record_webhook_receipt: "completed" });
    expect(await (await deliver(event())).json()).toEqual({ ok: true, duplicate: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(rpcNames()).toEqual(["stripe_record_webhook_receipt"]);
  });
  it("holds an exhausted receipt for an operator instead of discarding it", async () => {
    rpcTable({ stripe_record_webhook_receipt: "exhausted" });
    expect(await (await deliver(event())).json()).toMatchObject({ exhausted: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("asks for a retry when the receipt cannot be recorded", async () => {
    rpcTable({ stripe_record_webhook_receipt: rpcFails("down") });
    expect((await deliver(event())).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("refuses a payload whose object type disagrees with the event type", async () => {
    const response = await deliver(
      event({
        type: "invoice.paid",
        data: { object: { id: "sub_live_1", object: "subscription" } },
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("asks for a retry when reconciliation itself throws", async () => {
    rpcTable({ stripe_finish_webhook_receipt: new Error("synthetic database outage") });
    routes["GET /v1/account"] = () => json({ id: "acct_other" });
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).toContain("stripe_release_account_lease");
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("acknowledges a checkout session that names no customer", async () => {
    routes["GET /v1/checkout/sessions/cs_live_1"] = () =>
      json(liveSession({ customer: null, status: "expired" }));
    const response = await deliver(
      event({
        type: "checkout.session.expired",
        data: { object: { id: "cs_live_1", object: "checkout.session" } },
      }),
    );
    expect(await response.json()).toEqual({ ok: true, ignored: "session_without_customer" });
    expect(finished()[0]).toMatchObject({ p_status: "ignored" });
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
    // With no resolvable owner there is nothing to settle, and nothing is guessed.
    expect(rpcNames()).not.toContain("stripe_expire_checkout_session");
  });
  it("records then ignores an irrelevant event without a provider call", async () => {
    const response = await deliver(event({ type: "charge.refunded" }));
    expect(await response.json()).toEqual({ ok: true, ignored: "irrelevant_type" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(finished()[0]).toMatchObject({ p_status: "ignored" });
  });
  it("leaves the receipt retryable when the lease is held elsewhere", async () => {
    rpcTable({ stripe_claim_account_lease: rpcFails("stripe_lease_held") });
    expect((await deliver(event())).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("fences every receipt transition with the lease it actually holds", async () => {
    await deliver(event({ type: "charge.refunded" }));
    const holder = rpcArgs("stripe_claim_account_lease")[0].p_holder;
    expect(finished()[0]).toMatchObject({ p_holder: holder, p_fence: 7 });
  });
});

describe("authoritative reconciliation", () => {
  it("re-reads the provider and applies a granted live projection", async () => {
    const response = await deliver(event());
    expect(await response.json()).toEqual({ ok: true, applied: "applied_grant" });
    // Every call is pinned to the full API version and the mode's own key.
    for (const call of calls) {
      expect(call.headers["Stripe-Version"]).toBe(STRIPE_LIFECYCLE_API_VERSION);
      expect(call.headers.Authorization).toBe("Bearer rk_live_fixture");
    }
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "GET /v1/account",
      "GET /v1/subscriptions/sub_live_1",
      "GET /v1/subscriptions",
    ]);
    expect(applied()[0]).toMatchObject({
      p_account: ACCOUNT_LIVE,
      p_mode: "live",
      p_holder: expect.any(String),
      p_fence: 7,
      p_event_id: "evt_1",
      p_customer: "cus_1",
      p_subscription: "sub_live_1",
      p_replaces: null,
      p_plan_id: "pro",
      p_status: "active",
      p_seat_quantity: 0,
      p_cancel_at_period_end: false,
      p_invoice_paid: true,
      p_grants: true,
      p_event_created: NOW_S,
      p_session_request: null,
      p_session_id: null,
    });
    expect(applied()[0].p_period_end).toBe(new Date((NOW_S + 86_400) * 1000).toISOString());
    expect(rpcNames()).toContain("stripe_release_account_lease");
    // Ownership is never created or repointed from a webhook.
    expect(rpcNames()).not.toContain("stripe_upsert_customer");
  });
  it("renews the lease before writing and writes nothing without it", async () => {
    rpcTable({ stripe_renew_account_lease: false });
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
    // Not even an acknowledgement: the receipt stays exactly as it was.
    expect(rpcNames()).not.toContain("stripe_finish_webhook_receipt");
  });
  it("observes the clock freshly after the reads, not at request start", async () => {
    const ticks = [NOW_MS, NOW_MS + 7_000];
    let index = 0;
    await deliver(event(), { now: () => ticks[Math.min(index++, ticks.length - 1)] });
    expect(applied()[0].p_observed_at).toBe(new Date(NOW_MS + 7_000).toISOString());
  });
  it("reports purchased seats from the resolved seat item", async () => {
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription({
            items: {
              object: "list",
              has_more: false,
              data: [
                subscriptionItem(),
                subscriptionItem({
                  id: "si_2",
                  quantity: 6,
                  price: {
                    id: "price_proseat",
                    product: "prod_pro",
                    currency: "eur",
                    recurring: { interval: "month", interval_count: 1 },
                  },
                }),
              ],
            },
          }),
        ]),
      );
    await deliver(event());
    expect(applied()[0]).toMatchObject({ p_seat_quantity: 6, p_grants: true });
  });
  it("follows an invoice to the same authoritative subscription", async () => {
    routes["GET /v1/invoices/in_1"] = () => json(paidInvoice("sub_live_1"));
    const response = await deliver(
      event({ type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } }),
    );
    expect(await response.json()).toMatchObject({ applied: "applied_grant" });
    expect(calls.map((call) => new URL(call.url).pathname)).toContain("/v1/invoices/in_1");
  });
  it.each([
    [
      "an account that does not own the key",
      { "GET /v1/account": () => json({ id: "acct_other" }) },
    ],
    ["an unreadable account object", { "GET /v1/account": () => json({ object: "person" }) }],
    ["a failed object read", { "GET /v1/subscriptions/sub_live_1": () => json({}, 500) }],
    [
      "an object that is not the one we asked for",
      { "GET /v1/subscriptions/sub_live_1": () => json(subscription({ id: "sub_other" })) },
    ],
    [
      "an object of the wrong kind",
      { "GET /v1/subscriptions/sub_live_1": () => json(subscription({ object: "invoice" })) },
    ],
    ["a failed list read", { "GET /v1/subscriptions": () => json({}, 503) }],
    [
      "an incomplete subscription list",
      { "GET /v1/subscriptions": () => json(list([subscription()], true)) },
    ],
    [
      "a list without data",
      { "GET /v1/subscriptions": () => json({ object: "list", has_more: false }) },
    ],
    [
      "an object from the wrong mode",
      { "GET /v1/subscriptions/sub_live_1": () => json(subscription({ livemode: false })) },
    ],
    [
      "a subscription belonging to another customer",
      { "GET /v1/subscriptions": () => json(list([subscription({ customer: "cus_other" })])) },
    ],
    [
      "a subscription with an unrecognised status",
      { "GET /v1/subscriptions": () => json(list([subscription({ status: "hibernating" })])) },
    ],
  ])("never grants or revokes on %s", async (_label, override) => {
    Object.assign(routes, override);
    const response = await deliver(event());
    expect(response.status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
    expect(finished()[0]).toMatchObject({ p_status: "uncertain" });
  });
  it("stays uncertain when the customer is not mapped to a user", async () => {
    rpcTable({ stripe_customer_projection: [] });
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("stays uncertain when two grant-eligible subscriptions are plausible", async () => {
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription(),
          subscription({ id: "sub_live_2", latest_invoice: paidInvoice("sub_live_2") }),
        ]),
      );
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });

  /* --- incomplete evidence on a live subscription: retry, never revoke --- */
  it.each([
    [
      "an unknown price",
      {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem({
              price: {
                id: "price_unlisted",
                product: "prod_pro",
                currency: "eur",
                recurring: { interval: "month", interval_count: 1 },
              },
            }),
          ],
        },
      },
    ],
    [
      "a missing billing period",
      {
        items: {
          object: "list",
          has_more: false,
          data: [subscriptionItem({ current_period_end: undefined })],
        },
      },
    ],
    ["an unreadable item list", { items: { object: "list", has_more: false } }],
    [
      "a paginated item list",
      { items: { object: "list", has_more: true, data: [subscriptionItem()] } },
    ],
    ["no invoice at all", { latest_invoice: null }],
    ["an unexpanded invoice", { latest_invoice: "in_1" }],
    ["an invoice for another subscription", { latest_invoice: paidInvoice("sub_other") }],
    [
      "an invoice from the other mode",
      { latest_invoice: paidInvoice("sub_live_1", { livemode: false }) },
    ],
    [
      "an invoice with an unrecognised status",
      { latest_invoice: paidInvoice("sub_live_1", { status: "scheduled" }) },
    ],
  ])("keeps an ACTIVE mapped subscription retryable with %s", async (_label, over) => {
    rpcTable({
      stripe_customer_projection: stored({
        subscription_id: "sub_live_1",
        plan_id: "pro",
        status: "active",
      }),
    });
    routes["GET /v1/subscriptions"] = () => json(list([subscription(over)]));
    // Nothing is granted AND nothing is revoked: the entitlement it already has
    // survives, and the receipt is retried.
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
    expect(finished()[0]).toMatchObject({ p_status: "uncertain" });
  });
  it("does not grant an active subscription whose invoice is authoritatively unpaid", async () => {
    routes["GET /v1/subscriptions"] = () =>
      json(list([subscription({ latest_invoice: paidInvoice("sub_live_1", { status: "open" }) })]));
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });

  /* ------------------------ replacement and revoke ----------------------- */
  it("applies a replacement only when the stored subscription is shown terminal", async () => {
    const withStored = () =>
      rpcTable({
        stripe_customer_projection: stored({
          subscription_id: "sub_old",
          plan_id: "growth",
          status: "active",
        }),
      });
    // The stored subscription is still past_due (non-terminal) alongside the
    // new one: ambiguous, so nothing is written.
    withStored();
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription(),
          subscription({
            id: "sub_old",
            status: "past_due",
            latest_invoice: paidInvoice("sub_old", { status: "open" }),
          }),
        ]),
      );
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");

    // Absent from a complete list is not proof of replacement either.
    vi.clearAllMocks();
    withStored();
    routes["GET /v1/subscriptions"] = () => json(list([subscription()]));
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");

    // Shown canceled in the same complete read: an explicitly verified
    // replacement, named in p_replaces.
    vi.clearAllMocks();
    withStored();
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription(),
          subscription({
            id: "sub_old",
            status: "canceled",
            latest_invoice: paidInvoice("sub_old", { status: "void" }),
          }),
        ]),
      );
    expect((await deliver(event())).status).toBe(200);
    expect(applied()[0]).toMatchObject({
      p_subscription: "sub_live_1",
      p_replaces: "sub_old",
      p_grants: true,
    });
  });
  it("does not revoke the stored subscription while its replacement is unclear", async () => {
    rpcTable({
      stripe_customer_projection: stored({
        subscription_id: "sub_old",
        plan_id: "growth",
        status: "active",
      }),
    });
    // Stored is terminal, but the only candidate's own evidence is incomplete.
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription({ latest_invoice: null }),
          subscription({
            id: "sub_old",
            status: "canceled",
            latest_invoice: paidInvoice("sub_old", { status: "void" }),
          }),
        ]),
      );
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it.each([
    ["canceled", "void"],
    ["unpaid", "open"],
    ["past_due", "open"],
    ["paused", "open"],
    ["incomplete", "open"],
    ["incomplete_expired", "void"],
  ])("revokes an explicitly non-granting %s subscription", async (status, invoiceStatus) => {
    rpcTable({
      stripe_customer_projection: stored({
        subscription_id: "sub_live_1",
        plan_id: "pro",
        status: "active",
      }),
      stripe_apply_subscription_projection: "applied_no_grant",
    });
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription({
            status,
            latest_invoice: paidInvoice("sub_live_1", { status: invoiceStatus }),
          }),
        ]),
      );
    expect((await deliver(event())).status).toBe(200);
    expect(applied()[0]).toMatchObject({
      p_subscription: "sub_live_1",
      p_status: status,
      p_grants: false,
      p_invoice_paid: false,
      p_plan_id: "pro",
    });
  });
  it("revokes with the stored plan when a terminal subscription's items no longer resolve", async () => {
    rpcTable({
      stripe_customer_projection: stored({
        subscription_id: "sub_live_1",
        plan_id: "growth",
        status: "active",
      }),
      stripe_apply_subscription_projection: "applied_no_grant",
    });
    routes["GET /v1/subscriptions"] = () =>
      json(
        list([
          subscription({
            status: "canceled",
            items: {
              object: "list",
              has_more: false,
              data: [subscriptionItem({ current_period_end: NOW_S - 10 })],
            },
            latest_invoice: paidInvoice("sub_live_1", { status: "void" }),
          }),
        ]),
      );
    expect((await deliver(event())).status).toBe(200);
    expect(applied()[0]).toMatchObject({
      p_plan_id: "growth",
      p_grants: false,
      p_period_end: null,
      p_seat_quantity: 0,
    });
  });
  it("never revokes when the mapped subscription is absent from the read", async () => {
    rpcTable({
      stripe_customer_projection: stored({
        subscription_id: "sub_live_1",
        plan_id: "pro",
        status: "active",
      }),
    });
    routes["GET /v1/subscriptions"] = () => json(list([]));
    expect((await deliver(event())).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("acknowledges an event for a customer that has no subscription at all", async () => {
    routes["GET /v1/subscriptions"] = () => json(list([]));
    const response = await deliver(event());
    expect(await response.json()).toEqual({ ok: true, ignored: "no_current_subscription" });
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("acknowledges an unmapped customer whose only subscription is incomplete", async () => {
    routes["GET /v1/subscriptions"] = () =>
      json(list([subscription({ status: "incomplete", latest_invoice: null })]));
    const response = await deliver(event());
    expect(await response.json()).toEqual({ ok: true, ignored: "no_current_subscription" });
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it.each(["unknown_customer", "grant_unverified", "something_new"])(
    "treats the projection result %s as uncertain, never as success",
    async (result) => {
      rpcTable({ stripe_apply_subscription_projection: result });
      expect((await deliver(event())).status).toBe(503);
    },
  );
  it("passes a stale projection through as acknowledged", async () => {
    rpcTable({ stripe_apply_subscription_projection: "stale_ignored" });
    expect(await (await deliver(event())).json()).toEqual({ ok: true, ignored: "stale_ignored" });
  });
  it("never grants in test mode even for an active, paid subscription", async () => {
    routes["GET /v1/account"] = () => json({ id: ACCOUNT_TEST, object: "account" });
    routes["GET /v1/subscriptions/sub_test_1"] = () => json(testSubscription());
    routes["GET /v1/subscriptions"] = () => json(list([testSubscription()]));
    rpcTable({
      stripe_claim_account_lease: 2,
      stripe_apply_subscription_projection: "applied_no_grant",
    });
    const response = await deliver(
      event({ livemode: false, data: { object: { id: "sub_test_1", object: "subscription" } } }),
      { secret: ENV.STRIPE_WEBHOOK_SECRET_TEST },
    );
    expect(response.status).toBe(200);
    expect(applied()[0]).toMatchObject({
      p_mode: "test",
      p_account: ACCOUNT_TEST,
      p_grants: false,
    });
    for (const call of calls) expect(call.headers.Authorization).toBe("Bearer rk_test_fixture");
  });
});

describe("checkout session events settle only their own request", () => {
  const sessionEvent = (type: string) =>
    event({ type, data: { object: { id: "cs_live_1", object: "checkout.session" } } });

  it("settles a completed request atomically with the projection", async () => {
    routes["GET /v1/checkout/sessions/cs_live_1"] = () => json(liveSession({ status: "complete" }));
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(applied()[0]).toMatchObject({
      p_session_request: REQUEST,
      p_session_id: "cs_live_1",
      p_subscription: "sub_live_1",
      p_grants: true,
    });
    // A completed session is never marked expired.
    expect(rpcNames()).not.toContain("stripe_expire_checkout_session");
  });
  it("settles nothing unless the session names the subscription being applied", async () => {
    routes["GET /v1/checkout/sessions/cs_live_1"] = () =>
      json(liveSession({ status: "complete", subscription: "sub_somewhere_else" }));
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(applied()[0]).toMatchObject({ p_session_request: null, p_session_id: null });
  });
  it.each([
    ["no client reference", { client_reference_id: null }],
    ["a non-uuid client reference", { client_reference_id: "not-a-uuid" }],
  ])("settles no request for a session with %s", async (_label, over) => {
    routes["GET /v1/checkout/sessions/cs_live_1"] = () =>
      json(liveSession({ status: "complete", ...over }));
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(applied()[0]).toMatchObject({ p_session_request: null });
    expect(rpcNames()).not.toContain("stripe_expire_checkout_session");
  });
  it("cannot reconcile a session that names another customer", async () => {
    routes["GET /v1/checkout/sessions/cs_live_1"] = () =>
      json(liveSession({ status: "complete", customer: "cus_other" }));
    // The listed subscription belongs to cus_1, so nothing about cus_other is
    // readable here: uncertain, and no request is touched.
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(503);
    expect(rpcNames()).not.toContain("stripe_expire_checkout_session");
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("expires a request only when the provider itself reports the session expired", async () => {
    routes["GET /v1/checkout/sessions/cs_live_1"] = () =>
      json(liveSession({ status: "expired", subscription: "" }));
    routes["GET /v1/subscriptions"] = () => json(list([]));
    const response = await deliver(sessionEvent("checkout.session.expired"));
    expect(await response.json()).toEqual({ ok: true, ignored: "no_current_subscription" });
    expect(rpcArgs("stripe_expire_checkout_session")[0]).toMatchObject({
      p_request: REQUEST,
      p_user: OWNER,
      p_account: ACCOUNT_LIVE,
      p_mode: "live",
      p_session: "cs_live_1",
      p_fence: 7,
    });
  });
  it.each(["open", "complete", "settling"])(
    "does not expire a session whose status is %s",
    async (status) => {
      routes["GET /v1/checkout/sessions/cs_live_1"] = () => json(liveSession({ status }));
      await deliver(sessionEvent("checkout.session.completed"));
      expect(rpcNames()).not.toContain("stripe_expire_checkout_session");
    },
  );
});

describe("bounded durable replay", () => {
  const replayRow = (over: Record<string, unknown> = {}) => [
    {
      event_id: "evt_1",
      event_type: "customer.subscription.updated",
      object_id: "sub_live_1",
      event_created: NOW_S,
      attempts: 1,
      ...over,
    },
  ];
  /** A queue: each claim returns the next receipt, then nothing. That is what a
   * one-at-a-time claim looks like, and it is why the replay cannot loop. */
  const queue = (...rows: unknown[][]) => {
    let index = 0;
    return () => rows[index++] ?? [];
  };
  const replay = (over: Record<string, unknown> = {}) =>
    replayPendingStripeReceipts({
      mode: "live",
      env: ENV,
      now: NOW_MS,
      fetch: mocks.fetch as unknown as typeof fetch,
      ...over,
    });
  /** What each claim in this invocation was asked to skip. */
  const exclusions = () =>
    rpcArgs("stripe_claim_replay_receipt").map((args) => args.p_exclude as string[]);

  it("re-fetches the retained object under its own lease and completes the receipt", async () => {
    rpcTable({ stripe_claim_account_lease: 9, stripe_claim_replay_receipt: queue(replayRow()) });
    const result = await replayPendingStripeReceipts({
      mode: "live",
      limit: 5,
      env: ENV,
      now: NOW_MS,
      fetch: mocks.fetch as unknown as typeof fetch,
    });
    expect(result).toEqual({ attempted: 1, applied: 1, ignored: 0, uncertain: 0 });
    expect(rpcArgs("stripe_claim_replay_receipt")[0]).toEqual({
      p_account: ACCOUNT_LIVE,
      p_mode: "live",
      p_exclude: [],
    });
    expect(applied()[0]).toMatchObject({ p_event_id: "evt_1", p_fence: 9, p_grants: true });
    expect(calls.map((call) => new URL(call.url).pathname)).toContain(
      "/v1/subscriptions/sub_live_1",
    );
    // One receipt, one claim, one lease — plus the empty pass that ends the loop.
    expect(rpcNames().filter((name) => name === "stripe_claim_account_lease")).toHaveLength(2);
    expect(rpcNames().filter((name) => name === "stripe_claim_replay_receipt")).toHaveLength(2);
  });
  it("gives each receipt a fresh fenced lease and a fresh observation time", async () => {
    const ticks = [NOW_MS, NOW_MS + 60_000];
    let index = 0;
    rpcTable({
      stripe_claim_replay_receipt: queue(replayRow(), replayRow({ event_id: "evt_2" })),
    });
    const result = await replayPendingStripeReceipts({
      mode: "live",
      limit: 5,
      env: ENV,
      now: () => ticks[Math.min(index++, ticks.length - 1)],
      fetch: mocks.fetch as unknown as typeof fetch,
    });
    expect(result).toEqual({ attempted: 2, applied: 2, ignored: 0, uncertain: 0 });
    // The second receipt is judged by a later clock, not by the batch start.
    expect(applied().map((args) => args.p_observed_at)).toEqual([
      new Date(NOW_MS).toISOString(),
      new Date(NOW_MS + 60_000).toISOString(),
    ]);
    expect(rpcNames().filter((name) => name === "stripe_claim_account_lease")).toHaveLength(3);
    expect(rpcNames().filter((name) => name === "stripe_release_account_lease")).toHaveLength(3);
  });
  it("stops applying when the lease was lost during the reads", async () => {
    rpcTable({
      stripe_claim_replay_receipt: queue(replayRow()),
      stripe_renew_account_lease: false,
    });
    expect(
      await replayPendingStripeReceipts({
        mode: "live",
        limit: 3,
        env: ENV,
        now: NOW_MS,
        fetch: mocks.fetch as unknown as typeof fetch,
      }),
    ).toEqual({ attempted: 1, applied: 0, ignored: 0, uncertain: 1 });
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("counts an uncertain re-attempt without writing anything", async () => {
    rpcTable({ stripe_claim_replay_receipt: queue(replayRow()) });
    routes["GET /v1/subscriptions"] = () => json({}, 500);
    const result = await replayPendingStripeReceipts({
      mode: "live",
      env: ENV,
      now: NOW_MS,
      fetch: mocks.fetch as unknown as typeof fetch,
    });
    expect(result).toEqual({ attempted: 1, applied: 0, ignored: 0, uncertain: 1 });
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("does nothing when there is no backlog", async () => {
    expect(
      await replayPendingStripeReceipts({
        mode: "live",
        env: ENV,
        now: NOW_MS,
        fetch: mocks.fetch as unknown as typeof fetch,
      }),
    ).toEqual({ attempted: 0, applied: 0, ignored: 0, uncertain: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("validates the bound and the configuration before claiming anything", async () => {
    for (const limit of [0, 26, 1.5, -1])
      await expect(replayPendingStripeReceipts({ mode: "live", limit, env: ENV })).rejects.toThrow(
        /replay_limit_invalid/,
      );
    await expect(
      replayPendingStripeReceipts({ mode: "test", env: { ...ENV, STRIPE_ACCOUNT_ID_TEST: "" } }),
    ).rejects.toThrow(/account_not_configured/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("gives up quietly when another worker holds the lease", async () => {
    rpcTable({ stripe_claim_account_lease: rpcFails("held") });
    expect(await replayPendingStripeReceipts({ mode: "live", env: ENV, now: NOW_MS })).toEqual({
      attempted: 0,
      applied: 0,
      ignored: 0,
      uncertain: 0,
    });
    expect(rpcNames()).not.toContain("stripe_claim_replay_receipt");
  });
  it("records an attempt for an unidentifiable claimed receipt instead of looping", async () => {
    rpcTable({
      stripe_claim_replay_receipt: queue([{ event_id: "", event_type: "", object_id: "" }]),
    });
    expect(
      await replayPendingStripeReceipts({ mode: "live", limit: 4, env: ENV, now: NOW_MS }),
    ).toEqual({ attempted: 1, applied: 0, ignored: 0, uncertain: 1 });
    // An unnamed receipt cannot be excluded, so the invocation stops rather than
    // claiming it again. The attempt is recorded and the row is still there.
    expect(exclusions()).toEqual([[]]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  /* ------- one turn per receipt per invocation (reproduced starvation) ------ */

  it("gives a newer queued receipt its turn after a transient provider failure", async () => {
    // The first authoritative list read fails; the next one succeeds.
    let listReads = 0;
    routes["GET /v1/subscriptions"] = () =>
      listReads++ === 0 ? json({}, 500) : json(list([subscription()]));
    rpcTable({
      stripe_claim_replay_receipt: queue(replayRow(), replayRow({ event_id: "evt_2" })),
    });
    expect(await replay({ limit: 5 })).toEqual({
      attempted: 2,
      applied: 1,
      ignored: 0,
      uncertain: 1,
    });
    // evt_1 is attempted exactly once in this invocation; evt_2 is not starved.
    expect(exclusions()).toEqual([[], ["evt_1"], ["evt_1", "evt_2"]]);
    expect(applied()).toHaveLength(1);
    expect(applied()[0]).toMatchObject({ p_event_id: "evt_2", p_grants: true });
    expect(finished().map((args) => [args.p_event, args.p_status])).toEqual([
      ["evt_1", "uncertain"],
    ]);
  });
  it("spends one attempt per receipt when the whole batch stays uncertain", async () => {
    routes["GET /v1/subscriptions"] = () => json({}, 503);
    rpcTable({
      stripe_claim_replay_receipt: queue(
        replayRow(),
        replayRow({ event_id: "evt_2" }),
        replayRow({ event_id: "evt_3" }),
      ),
    });
    // Five passes were allowed; three receipts existed; each got one turn, and
    // no receipt's attempt budget was spent on a second pass.
    expect(await replay({ limit: 5 })).toEqual({
      attempted: 3,
      applied: 0,
      ignored: 0,
      uncertain: 3,
    });
    expect(exclusions()).toEqual([[], ["evt_1"], ["evt_1", "evt_2"], ["evt_1", "evt_2", "evt_3"]]);
    expect(finished().map((args) => args.p_event)).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
  });
  it("excludes a receipt whose lease was reclaimed during its own reads", async () => {
    // The first receipt loses its lease while reading (so it writes nothing and
    // acknowledges nothing); the second keeps a live lease and applies.
    let renewals = 0;
    rpcTable({
      stripe_claim_replay_receipt: queue(replayRow(), replayRow({ event_id: "evt_2" })),
      stripe_renew_account_lease: () => renewals++ > 0,
    });
    expect(await replay({ limit: 5 })).toEqual({
      attempted: 2,
      applied: 1,
      ignored: 0,
      uncertain: 1,
    });
    expect(exclusions()).toEqual([[], ["evt_1"], ["evt_1", "evt_2"]]);
    // Each receipt ran under its own fresh fenced lease.
    expect(rpcNames().filter((name) => name === "stripe_claim_account_lease")).toHaveLength(3);
    expect(applied()).toHaveLength(1);
    expect(applied()[0]).toMatchObject({ p_event_id: "evt_2" });
    // The lease-lost receipt was neither applied nor acknowledged.
    expect(finished()).toHaveLength(0);
  });
  it("retries the receipt in a LATER invocation, with its budget intact", async () => {
    rpcTable({ stripe_claim_replay_receipt: queue(replayRow()) });
    routes["GET /v1/subscriptions"] = () => json({}, 500);
    expect(await replay({ limit: 5 })).toEqual({
      attempted: 1,
      applied: 0,
      ignored: 0,
      uncertain: 1,
    });
    // Two claims, not five: the one receipt was not re-attempted to exhaustion
    // in the first pass.
    expect(exclusions()).toEqual([[], ["evt_1"]]);

    // A LATER invocation starts from an empty exclusion set, so the same receipt
    // is claimed again — now on its second attempt — and completes.
    vi.clearAllMocks();
    rpcTable({ stripe_claim_replay_receipt: queue(replayRow({ attempts: 2 })) });
    routes["GET /v1/subscriptions"] = () => json(list([subscription()]));
    expect(await replay({ limit: 5 })).toEqual({
      attempted: 1,
      applied: 1,
      ignored: 0,
      uncertain: 0,
    });
    expect(exclusions()).toEqual([[], ["evt_1"]]);
    expect(applied()[0]).toMatchObject({ p_event_id: "evt_1", p_grants: true });
  });
});

describe("caller-scoped checkout creation", () => {
  const create = (over: Partial<Parameters<typeof createStripeLifecycleCheckout>[0]> = {}) =>
    createStripeLifecycleCheckout(
      { userId: OWNER, requestId: REQUEST, planId: "pro", seatQuantity: 0, mode: "test", ...over },
      { env: ENV, now: NOW_MS, fetch: mocks.fetch as unknown as typeof fetch },
    );
  const openRequest = (over: Record<string, unknown> = {}) => [
    {
      status: "open",
      session_id: "cs_test_1",
      created_at: new Date(NOW_MS).toISOString(),
      ...over,
    },
  ];
  const fencedRequest = [{ status: "fenced", session_id: null, created_at: null }];
  const agedRequest = (over: Record<string, unknown> = {}) => [
    {
      status: "pending",
      session_id: null,
      created_at: new Date(NOW_MS - 48 * 3600 * 1000).toISOString(),
      ...over,
    },
  ];

  beforeEach(() => {
    routes["GET /v1/account"] = () => json({ id: ACCOUNT_TEST, object: "account" });
    routes["GET /v1/subscriptions"] = () => json(list([]));
    routes["GET /v1/checkout/sessions/cs_test_1"] = () => json(testSession());
    routes["POST /v1/checkout/sessions"] = () => json(testSession());
  });

  it("refuses live mode in code before any provider or database access", async () => {
    expect(await create({ mode: "live" })).toEqual({ ok: false, reason: "live_checkout_held" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("creates a session from server-resolved prices with a persistent idempotency key", async () => {
    expect(await create()).toEqual({
      ok: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      sessionId: "cs_test_1",
      reused: false,
    });
    // The key's own account is verified BEFORE any mutation.
    expect(new URL(calls[0].url).pathname).toBe("/v1/account");
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.headers["Idempotency-Key"]).toBe(`milo-chk:${ACCOUNT_TEST}:test:${REQUEST}`);
    expect(Object.fromEntries(new URLSearchParams(post.body))).toEqual({
      mode: "subscription",
      customer: "cus_1",
      "line_items[0][price]": "price_tpro",
      "line_items[0][quantity]": "1",
      success_url: "https://milogrowth.com/app/billing?stripe=returned",
      cancel_url: "https://milogrowth.com/app/billing?stripe=cancelled",
      client_reference_id: REQUEST,
      integration_identifier: "milo_abcdefgh",
      "subscription_data[metadata][milo_user_id]": OWNER,
    });
    // Neither parameter may be sent on the current API.
    expect(post.body).not.toContain("payment_method_types");
    expect(post.body).not.toContain("automatic_tax");
    // The session is OPEN, not completed: nothing is granted by creation.
    expect(rpcArgs("stripe_open_checkout_request")[0]).toMatchObject({
      p_session: "cs_test_1",
      p_user: OWNER,
      p_account: ACCOUNT_TEST,
      p_mode: "test",
      p_kind: "checkout",
    });
    expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
    expect(rpcArgs("stripe_claim_checkout_request")[0].p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
  it("verifies the account before creating a customer or a session", async () => {
    routes["GET /v1/account"] = () => json({ id: "acct_someone_else", object: "account" });
    expect(await create()).toEqual({ ok: false, reason: "account_unverified" });
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/v1/account"]);
    expect(rpcNames()).not.toContain("stripe_open_checkout_request");
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(rpcNames()).not.toContain("stripe_upsert_customer");
  });
  it("adds the plan's own seat item only when seats are requested", async () => {
    await create({ seatQuantity: 3 });
    const body = new URLSearchParams(calls.find((call) => call.method === "POST")!.body);
    expect(body.get("line_items[1][price]")).toBe("price_tproseat");
    expect(body.get("line_items[1][quantity]")).toBe("3");
  });
  it("refuses a malformed request, owner or seat count before any work", async () => {
    expect(await create({ requestId: "not-a-uuid" })).toEqual({
      ok: false,
      reason: "request_invalid",
    });
    expect(await create({ userId: "nobody" })).toEqual({ ok: false, reason: "request_invalid" });
    for (const seatQuantity of [1.5, -1, 1001])
      expect(await create({ seatQuantity })).toEqual({
        ok: false,
        reason: "seat_quantity_invalid",
      });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refuses a plan or seat price that is not configured", async () => {
    expect(await create({ planId: "agency" })).toEqual({
      ok: false,
      reason: "plan_not_configured",
    });
    expect(
      await createStripeLifecycleCheckout(
        { userId: OWNER, requestId: REQUEST, planId: "pro", seatQuantity: 2, mode: "test" },
        {
          env: { ...ENV, STRIPE_PRICE_PRO_SEAT_TEST: "" },
          now: NOW_MS,
          fetch: mocks.fetch as unknown as typeof fetch,
        },
      ),
    ).toEqual({ ok: false, reason: "seat_price_not_configured" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  /* ------------------------------ open requests --------------------------- */
  it("reuses an existing open session instead of creating a second one", async () => {
    rpcTable({ stripe_claim_checkout_request: openRequest() });
    expect(await create()).toEqual({
      ok: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      sessionId: "cs_test_1",
      reused: true,
    });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    // Even a reuse verifies the account first.
    expect(new URL(calls[0].url).pathname).toBe("/v1/account");
  });
  it.each([
    ["another customer", { customer: "cus_other" }],
    ["another request", { client_reference_id: "00000000-0000-4000-8000-0000000000ff" }],
    ["another session id", { id: "cs_test_2" }],
    ["the live mode", { livemode: true }],
  ])("refuses to reuse a session naming %s", async (_label, over) => {
    rpcTable({ stripe_claim_checkout_request: openRequest() });
    routes["GET /v1/checkout/sessions/cs_test_1"] = () => json(testSession(over));
    expect(await create()).toEqual({ ok: false, reason: "session_identity_unexpected" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("expires an open request only when the provider says the session expired", async () => {
    rpcTable({ stripe_claim_checkout_request: openRequest() });
    routes["GET /v1/checkout/sessions/cs_test_1"] = () => json(testSession({ status: "expired" }));
    expect(await create()).toEqual({ ok: false, reason: "session_expired" });
    expect(rpcArgs("stripe_settle_checkout_request")[0]).toMatchObject({
      p_status: "expired",
      p_session: "cs_test_1",
    });
  });
  it("keeps a COMPLETED session blocked until its projection exists", async () => {
    rpcTable({ stripe_claim_checkout_request: openRequest() });
    routes["GET /v1/checkout/sessions/cs_test_1"] = () =>
      json(testSession({ status: "complete", subscription: "sub_test_1" }));
    // Not reconciled yet: nothing expired, nothing failed, no second session.
    expect(await create()).toEqual({ ok: false, reason: "checkout_awaiting_reconciliation" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    // Reconciled: the request is settled completed, so it stops blocking.
    vi.clearAllMocks();
    rpcTable({
      stripe_claim_checkout_request: openRequest(),
      stripe_customer_projection: stored({
        subscription_id: "sub_test_1",
        plan_id: "pro",
        status: "active",
      }),
    });
    expect(await create()).toEqual({ ok: false, reason: "checkout_completed" });
    expect(rpcArgs("stripe_settle_checkout_request")[0]).toMatchObject({
      p_status: "completed",
      p_session: "cs_test_1",
    });
  });
  it("does not settle a completed session reconciled for somebody else", async () => {
    rpcTable({
      stripe_claim_checkout_request: openRequest(),
      stripe_customer_projection: [
        {
          user_id: "00000000-0000-4000-8000-00000000ffff",
          subscription_id: "sub_test_1",
          plan_id: "pro",
          status: "active",
        },
      ],
    });
    routes["GET /v1/checkout/sessions/cs_test_1"] = () =>
      json(testSession({ status: "complete", subscription: "sub_test_1" }));
    expect(await create()).toEqual({ ok: false, reason: "checkout_awaiting_reconciliation" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("treats an unrecognised session status as uncertainty, not expiry", async () => {
    rpcTable({ stripe_claim_checkout_request: openRequest() });
    routes["GET /v1/checkout/sessions/cs_test_1"] = () => json(testSession({ status: "settling" }));
    expect(await create()).toEqual({ ok: false, reason: "session_status_unknown" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("stays uncertain when the open session cannot be read", async () => {
    rpcTable({ stripe_claim_checkout_request: openRequest() });
    routes["GET /v1/checkout/sessions/cs_test_1"] = () => json({}, 500);
    expect(await create()).toEqual({ ok: false, reason: "session_unavailable" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });

  /* ------------------------- aged, ambiguous attempts --------------------- */
  it("FENCES an aged ambiguous attempt instead of failing it", async () => {
    rpcTable({ stripe_claim_checkout_request: agedRequest() });
    expect(await create()).toEqual({ ok: false, reason: "request_fenced" });
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual({
      p_request: REQUEST,
      p_user: OWNER,
      p_account: ACCOUNT_TEST,
      p_mode: "test",
      p_kind: "checkout",
    });
    // Nothing terminal, nothing released, and no provider call at all.
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fences an attempt whose creation time cannot be read", async () => {
    rpcTable({ stripe_claim_checkout_request: agedRequest({ created_at: "not-a-date" }) });
    expect(await create()).toEqual({ ok: false, reason: "request_fenced" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  /* ------- the retention deadline is re-read before EVERY dispatch -------- */

  /**
   * An attempt created 23h ago: INSIDE Stripe's 24h idempotency retention when
   * it starts, and one hour from the boundary — so a slow awaited step can
   * cross it while the attempt is in flight. The reproduced defect was a single
   * pre-await check: the guard said "allowed", the account verification, the
   * customer mapping and the authoritative list were awaited, and the dispatch
   * then happened past the boundary, where a repeated idempotency key is a NEW
   * attempt that can create a second session and a second subscription.
   */
  const nearDeadlineRequest = () => [
    {
      status: "pending",
      session_id: null,
      created_at: new Date(NOW_MS - 23 * 3600 * 1000).toISOString(),
    },
  ];
  const BEYOND_DEADLINE_MS = NOW_MS + 2 * 3600 * 1000;
  const createWith = (now: number | (() => number)) =>
    createStripeLifecycleCheckout(
      { userId: OWNER, requestId: REQUEST, planId: "pro", seatQuantity: 0, mode: "test" },
      { env: ENV, now, fetch: mocks.fetch as unknown as typeof fetch },
    );
  const fencedScope = {
    p_request: REQUEST,
    p_user: OWNER,
    p_account: ACCOUNT_TEST,
    p_mode: "test",
    p_kind: "checkout",
  };

  it("still creates the session for an attempt that stays inside the window", async () => {
    rpcTable({ stripe_claim_checkout_request: nearDeadlineRequest() });
    expect(await createWith(NOW_MS)).toMatchObject({ ok: true, sessionId: "cs_test_1" });
    expect(rpcNames()).not.toContain("stripe_fence_checkout_request");
  });
  it("fences when the deadline passes while the account is being verified", async () => {
    let nowMs = NOW_MS;
    rpcTable({ stripe_claim_checkout_request: nearDeadlineRequest() });
    routes["GET /v1/account"] = () => {
      // The verification round trip itself crossed the 24h boundary.
      nowMs = BEYOND_DEADLINE_MS;
      return json({ id: ACCOUNT_TEST, object: "account" });
    };
    const result = await createWith(() => nowMs);
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
    // Non-terminal: the slot stays held and nothing is settled or opened.
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(rpcNames()).not.toContain("stripe_open_checkout_request");
  });
  it("fences when the deadline passes while the customer mapping is read", async () => {
    let nowMs = NOW_MS;
    rpcTable({
      stripe_claim_checkout_request: nearDeadlineRequest(),
      stripe_owner_customer: () => {
        nowMs = BEYOND_DEADLINE_MS;
        return null;
      },
    });
    routes["POST /v1/customers"] = () =>
      json({ id: "cus_new", object: "customer", livemode: false });
    const result = await createWith(() => nowMs);
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    // The mapping said "no customer", but creating one is a MUTATION and the
    // deadline had passed: it was never dispatched, and nothing was mapped.
    expect(calls.some((call) => new URL(call.url).pathname === "/v1/customers")).toBe(false);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(rpcNames()).not.toContain("stripe_upsert_customer");
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
  });
  it("fences after a created customer is acknowledged past the deadline", async () => {
    let nowMs = NOW_MS;
    rpcTable({
      stripe_claim_checkout_request: nearDeadlineRequest(),
      stripe_owner_customer: null,
      stripe_upsert_customer: () => {
        // The customer POST succeeded; recording the mapping crossed the boundary.
        nowMs = BEYOND_DEADLINE_MS;
        return null;
      },
    });
    routes["POST /v1/customers"] = () =>
      json({ id: "cus_new", object: "customer", livemode: false });
    routes["POST /v1/checkout/sessions"] = () => json(testSession({ customer: "cus_new" }));
    const result = await createWith(() => nowMs);
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    // The customer really was created and really was mapped: that dispatched
    // outcome is kept, not retracted and not assumed cancelled.
    expect(rpcArgs("stripe_upsert_customer")[0]).toMatchObject({ p_customer: "cus_new" });
    // Only the Checkout Session — the duplicable mutation — was withheld.
    expect(
      calls.filter((call) => new URL(call.url).pathname === "/v1/checkout/sessions"),
    ).toHaveLength(0);
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
  });
  it("fences when the deadline passes while the subscription list is read", async () => {
    let nowMs = NOW_MS;
    rpcTable({ stripe_claim_checkout_request: nearDeadlineRequest() });
    routes["GET /v1/subscriptions"] = () => {
      nowMs = BEYOND_DEADLINE_MS;
      return json(list([]));
    };
    const result = await createWith(() => nowMs);
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("fences rather than dispatching when the clock becomes unreadable mid-attempt", async () => {
    // Reads: 1 the initial deadline check, 2 the list's `now`, 3 the check that
    // would authorise the Checkout dispatch — and that one cannot be read.
    let reads = 0;
    rpcTable({ stripe_claim_checkout_request: nearDeadlineRequest() });
    const result = await createWith(() => {
      reads += 1;
      return reads >= 3 ? Number.NaN : NOW_MS;
    });
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
  });
  /* ------------ the retention boundary itself is OUTSIDE the window ------- */

  /**
   * EXACTLY the immutable creation time + 24h.
   *
   * Stripe's current primary documentation
   * (https://docs.stripe.com/error-low-level#idempotency) states that keys are
   * retained for **at least** 24 hours and may then be removed, and that
   * reusing a removed key executes a NEW request. The boundary itself therefore
   * carries no guarantee: the earlier `<=` authorised a dispatch at exactly 24h
   * whose "retry" could create a second session and a second subscription. The
   * guard now requires strictly less, so such an attempt is held instead. This
   * is a local synthetic clock test; nothing here was verified against Stripe.
   */
  const CUTOFF_MS = 24 * 3600 * 1000;
  const requestCreatedAt = (createdAt: number) => [
    { status: "pending", session_id: null, created_at: new Date(createdAt).toISOString() },
  ];

  it("fences at exactly createdAt + 24h on the initial check, dispatching nothing", async () => {
    rpcTable({ stripe_claim_checkout_request: requestCreatedAt(NOW_MS - CUTOFF_MS) });
    const result = await createWith(NOW_MS);
    // The provider spies are asserted here, at the top level of the test —
    // never inside a `catch`, where a swallowed throw could hide a dispatch.
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    // Non-terminal and still fenced: the unique slot stays held.
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
    expect(rpcNames()).not.toContain("stripe_upsert_customer");
    expect(rpcNames()).not.toContain("stripe_open_checkout_request");
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("fences when an awaited mapping read lands on exactly createdAt + 24h", async () => {
    const createdAt = NOW_MS - 23 * 3600 * 1000;
    let nowMs = NOW_MS;
    rpcTable({
      stripe_claim_checkout_request: requestCreatedAt(createdAt),
      stripe_owner_customer: () => {
        // The awaited read consumed the last hour exactly.
        nowMs = createdAt + CUTOFF_MS;
        return null;
      },
    });
    routes["POST /v1/customers"] = () =>
      json({ id: "cus_new", object: "customer", livemode: false });
    const result = await createWith(() => nowMs);
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    // The mapping said "no customer", but creating one is a MUTATION under a
    // key that is no longer guaranteed retained: neither POST was dispatched.
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    expect(calls.some((call) => new URL(call.url).pathname === "/v1/customers")).toBe(false);
    expect(
      calls.filter((call) => new URL(call.url).pathname === "/v1/checkout/sessions"),
    ).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_upsert_customer");
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("fences when an awaited list read lands on exactly createdAt + 24h", async () => {
    const createdAt = NOW_MS - 23 * 3600 * 1000;
    let nowMs = NOW_MS;
    rpcTable({ stripe_claim_checkout_request: requestCreatedAt(createdAt) });
    routes["GET /v1/subscriptions"] = () => {
      nowMs = createdAt + CUTOFF_MS;
      return json(list([]));
    };
    const result = await createWith(() => nowMs);
    expect(result).toEqual({ ok: false, reason: "request_fenced" });
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    expect(rpcArgs("stripe_fence_checkout_request")[0]).toEqual(fencedScope);
    expect(rpcNames()).not.toContain("stripe_open_checkout_request");
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("still dispatches one millisecond inside the window (the boundary is exact)", async () => {
    rpcTable({ stripe_claim_checkout_request: requestCreatedAt(NOW_MS - CUTOFF_MS + 1) });
    expect(await createWith(NOW_MS)).toMatchObject({ ok: true, sessionId: "cs_test_1" });
    expect(rpcNames()).not.toContain("stripe_fence_checkout_request");
  });

  it("reports a conflict, not a fence, when the hold itself cannot be taken", async () => {
    let nowMs = NOW_MS;
    rpcTable({
      stripe_claim_checkout_request: nearDeadlineRequest(),
      stripe_fence_checkout_request: rpcFails("stripe_checkout_unavailable"),
    });
    routes["GET /v1/subscriptions"] = () => {
      nowMs = BEYOND_DEADLINE_MS;
      return json(list([]));
    };
    expect(await createWith(() => nowMs)).toEqual({ ok: false, reason: "request_conflict" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("recovers a fenced attempt by adopting the session it really created", async () => {
    rpcTable({ stripe_claim_checkout_request: fencedRequest });
    routes["GET /v1/checkout/sessions"] = () => json(list([testSession()]));
    expect(await create()).toEqual({
      ok: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      sessionId: "cs_test_1",
      reused: true,
    });
    expect(rpcArgs("stripe_open_checkout_request")[0]).toMatchObject({ p_session: "cs_test_1" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("completes a fenced attempt whose session was paid and reconciled", async () => {
    rpcTable({
      stripe_claim_checkout_request: fencedRequest,
      stripe_customer_projection: stored({
        subscription_id: "sub_test_1",
        plan_id: "pro",
        status: "active",
      }),
    });
    routes["GET /v1/checkout/sessions"] = () =>
      json(list([testSession({ status: "complete", subscription: "sub_test_1" })]));
    expect(await create()).toEqual({ ok: false, reason: "checkout_completed" });
    expect(rpcArgs("stripe_settle_checkout_request")[0]).toMatchObject({ p_status: "completed" });
  });
  it("fails a fenced attempt only when a complete list proves no session exists", async () => {
    rpcTable({ stripe_claim_checkout_request: fencedRequest });
    routes["GET /v1/checkout/sessions"] = () =>
      json(list([testSession({ id: "cs_test_9", client_reference_id: "another" })]));
    expect(await create()).toEqual({ ok: false, reason: "request_failed" });
    expect(rpcArgs("stripe_settle_checkout_request")[0]).toMatchObject({ p_status: "failed" });
  });
  it.each([
    ["an incomplete list", () => json(list([testSession()], true))],
    ["a list without data", () => json({ object: "list", has_more: false })],
    ["an unreadable session in the list", () => json(list([{ id: "cs_test_1" }]))],
    [
      "two sessions for the same request",
      () => json(list([testSession(), testSession({ id: "cs_test_2" })])),
    ],
    ["a failed list read", () => json({}, 500)],
  ])("keeps a fenced attempt fenced on %s", async (_label, handler) => {
    rpcTable({ stripe_claim_checkout_request: fencedRequest });
    routes["GET /v1/checkout/sessions"] = handler as Handler;
    expect((await create()).ok).toBe(false);
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("keeps a fenced attempt fenced while the caller has no mapped customer", async () => {
    rpcTable({ stripe_claim_checkout_request: fencedRequest, stripe_owner_customer: null });
    expect(await create()).toEqual({ ok: false, reason: "request_unresolved" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("refuses while another request of the same kind holds the slot", async () => {
    rpcTable({ stripe_claim_checkout_request: rpcFails("stripe_checkout_open") });
    expect(await create({ requestId: "00000000-0000-4000-8000-0000000000bb" })).toEqual({
      ok: false,
      reason: "request_unavailable",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["completed", "expired", "failed"])("does not reopen a %s request", async (status) => {
    rpcTable({ stripe_claim_checkout_request: [{ status, session_id: "cs_test_1" }] });
    expect(await create()).toEqual({ ok: false, reason: `request_${status}` });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  /* ------------------------------- customers ------------------------------ */
  it("fails uncertain on a customer mapping error instead of creating a customer", async () => {
    rpcTable({ stripe_owner_customer: rpcFails("down") });
    expect(await create()).toEqual({ ok: false, reason: "customer_uncertain" });
    expect(calls.some((call) => new URL(call.url).pathname === "/v1/customers")).toBe(false);
  });
  it("creates the customer once, idempotently, after verifying the account", async () => {
    rpcTable({ stripe_owner_customer: null });
    routes["POST /v1/customers"] = () =>
      json({ id: "cus_new", object: "customer", livemode: false });
    routes["POST /v1/checkout/sessions"] = () => json(testSession({ customer: "cus_new" }));
    expect((await create()).ok).toBe(true);
    const post = calls.find((call) => new URL(call.url).pathname === "/v1/customers")!;
    expect(post.headers["Idempotency-Key"]).toBe(`milo-cus:${ACCOUNT_TEST}:test:${OWNER}`);
    expect(new URL(calls[0].url).pathname).toBe("/v1/account");
    expect(rpcArgs("stripe_upsert_customer")[0]).toEqual({
      p_user: OWNER,
      p_account: ACCOUNT_TEST,
      p_mode: "test",
      p_customer: "cus_new",
    });
  });
  it.each([
    ["the wrong mode", { id: "cus_new", object: "customer", livemode: true }],
    ["another object kind", { id: "cus_new", object: "account", livemode: false }],
    ["a malformed id", { id: "customer_new", object: "customer", livemode: false }],
  ])("refuses a created customer with %s", async (_label, body) => {
    rpcTable({ stripe_owner_customer: null });
    routes["POST /v1/customers"] = () => json(body);
    expect(await create()).toEqual({ ok: false, reason: "customer_uncertain" });
    expect(rpcNames()).not.toContain("stripe_upsert_customer");
  });

  /* --------------------------- duplicate protection ----------------------- */
  it.each(["active", "trialing", "past_due", "incomplete", "unpaid", "paused"])(
    "refuses a second checkout while a %s subscription exists",
    async (status) => {
      routes["GET /v1/subscriptions"] = () =>
        json(list([testSubscription({ status, latest_invoice: null })]));
      expect(await create()).toEqual({ ok: false, reason: "subscription_exists" });
      expect(calls.some((call) => call.method === "POST")).toBe(false);
      expect(rpcArgs("stripe_settle_checkout_request")[0]).toMatchObject({ p_status: "failed" });
    },
  );
  it.each(["canceled", "incomplete_expired"])(
    "allows a new checkout after a confidently terminal %s subscription",
    async (status) => {
      routes["GET /v1/subscriptions"] = () =>
        json(list([testSubscription({ status, latest_invoice: null })]));
      expect((await create()).ok).toBe(true);
    },
  );
  it.each([
    ["an unrecognised status", () => json(list([testSubscription({ status: "hibernating" })]))],
    ["an unreadable subscription", () => json(list([{ id: "sub_x", status: "canceled" }]))],
    [
      "a subscription from the other mode",
      () => json(list([testSubscription({ livemode: true })])),
    ],
    [
      "a subscription for another customer",
      () => json(list([testSubscription({ customer: "cus_z" })])),
    ],
  ])("refuses to create a session when the existing state shows %s", async (_label, handler) => {
    routes["GET /v1/subscriptions"] = handler as Handler;
    expect(await create()).toEqual({ ok: false, reason: "subscription_state_unknown" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    // Unknown state is not a terminal failure: the request stays retryable.
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it.each([
    ["an incomplete list", () => json(list([], true)), "subscription_list_incomplete"],
    [
      "a list without data",
      () => json({ object: "list", has_more: false }),
      "subscription_list_data_missing",
    ],
  ])("refuses to create a session on %s", async (_label, handler, reason) => {
    routes["GET /v1/subscriptions"] = handler as Handler;
    expect(await create()).toEqual({ ok: false, reason });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });

  /* ------------------------------ session results ------------------------- */
  it("keeps an uncertain creation retryable with the same key and parameters", async () => {
    routes["POST /v1/checkout/sessions"] = () => {
      throw new Error("synthetic timeout");
    };
    expect(await create()).toEqual({ ok: false, reason: "provider_uncertain" });
    // The request stays pending: no settlement, so the retry resumes it.
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
    expect(rpcNames()).not.toContain("stripe_open_checkout_request");
    expect(rpcNames()).not.toContain("stripe_fence_checkout_request");
  });
  it("retries the SAME request id with the identical key and body, creating one session", async () => {
    const posted = () =>
      calls.filter((call) => new URL(call.url).pathname === "/v1/checkout/sessions");
    routes["POST /v1/checkout/sessions"] = () => {
      throw new Error("synthetic timeout");
    };
    expect(await create()).toEqual({ ok: false, reason: "provider_uncertain" });
    const first = posted()[0];

    // The retry resumes the same pending request: Stripe's idempotency replay
    // returns the one session that may already exist behind the timeout.
    calls = [];
    routes["POST /v1/checkout/sessions"] = () => json(testSession());
    expect(await create()).toMatchObject({ ok: true, sessionId: "cs_test_1" });
    const second = posted()[0];
    expect(second.headers["Idempotency-Key"]).toBe(first.headers["Idempotency-Key"]);
    expect(second.body).toBe(first.body);
    // Exactly one session was ever recorded for this request.
    expect(rpcArgs("stripe_open_checkout_request")).toHaveLength(1);
  });
  it.each([
    ["a live session id in test mode", { id: "cs_live_1" }],
    ["a mismatched livemode", { livemode: true }],
    ["another customer", { customer: "cus_other" }],
    ["another request id", { client_reference_id: "00000000-0000-4000-8000-0000000000ff" }],
  ])("refuses %s without recording anything", async (_label, over) => {
    routes["POST /v1/checkout/sessions"] = () => json(testSession(over));
    expect(await create()).toEqual({ ok: false, reason: "session_unexpected" });
    expect(rpcNames()).not.toContain("stripe_open_checkout_request");
  });
  it.each([
    ["a foreign checkout host", { url: "https://evil.test/c/pay/cs_test_1" }],
    ["a non-https url", { url: "http://checkout.stripe.com/c/pay/cs_test_1" }],
    ["a url with credentials", { url: "https://a:b@checkout.stripe.com/c" }],
    ["a host that merely ends in stripe.com", { url: "https://checkout.stripe.com.evil.test/c" }],
  ])("records the session but refuses to hand back %s", async (_label, over) => {
    routes["POST /v1/checkout/sessions"] = () => json(testSession(over));
    expect(await create()).toEqual({ ok: false, reason: "session_url_unexpected" });
    // The session exists at the provider, so its id is recorded for recovery.
    expect(rpcArgs("stripe_open_checkout_request")[0]).toMatchObject({ p_session: "cs_test_1" });
  });
  it("records a session that came back already complete rather than losing it", async () => {
    routes["POST /v1/checkout/sessions"] = () =>
      json(testSession({ status: "complete", subscription: "sub_test_1" }));
    expect(await create()).toEqual({ ok: false, reason: "session_not_open" });
    expect(rpcArgs("stripe_open_checkout_request")[0]).toMatchObject({ p_session: "cs_test_1" });
  });
  it("reports a conflict without claiming success when the slot was taken meanwhile", async () => {
    rpcTable({ stripe_open_checkout_request: false });
    expect(await create()).toEqual({ ok: false, reason: "request_conflict" });
  });
});

describe("portal sessions", () => {
  const portal = (mode: "live" | "test" = "test", requestId = REQUEST) =>
    createStripeLifecyclePortal(
      { userId: OWNER, requestId, mode },
      { env: ENV, fetch: mocks.fetch as unknown as typeof fetch },
    );
  const portalSession = (over: Record<string, unknown> = {}) => ({
    id: "bps_1",
    object: "billing_portal.session",
    livemode: false,
    customer: "cus_1",
    url: "https://billing.stripe.com/p/session/x",
    ...over,
  });
  beforeEach(() => {
    routes["GET /v1/account"] = () => json({ id: ACCOUNT_TEST, object: "account" });
    routes["POST /v1/billing_portal/sessions"] = () => json(portalSession());
  });

  it("opens a portal for the caller's own mapped customer only", async () => {
    expect(await portal()).toEqual({
      ok: true,
      portalUrl: "https://billing.stripe.com/p/session/x",
    });
    const post = calls.find((call) => call.method === "POST")!;
    expect(Object.fromEntries(new URLSearchParams(post.body))).toEqual({
      customer: "cus_1",
      return_url: ENV.MILO_STRIPE_LIFECYCLE_RETURN_BASE,
    });
    expect(post.headers["Idempotency-Key"]).toBe(`milo-prt:${ACCOUNT_TEST}:test:${REQUEST}`);
    expect(rpcArgs("stripe_owner_customer")[0]).toEqual({
      p_user: OWNER,
      p_account: ACCOUNT_TEST,
      p_mode: "test",
    });
    expect(rpcArgs("stripe_settle_checkout_request")[0]).toMatchObject({
      p_status: "completed",
      p_kind: "portal",
    });
    // The account is verified before the mutation.
    expect(new URL(calls[0].url).pathname).toBe("/v1/account");
  });
  it("holds the live portal in code before any provider or database access", async () => {
    expect(await portal("live")).toEqual({ ok: false, reason: "live_portal_held" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("verifies the account before creating a portal session", async () => {
    routes["GET /v1/account"] = () => json({ id: "acct_someone_else", object: "account" });
    expect(await portal()).toEqual({ ok: false, reason: "account_unverified" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("never creates a customer and reports nothing to manage", async () => {
    rpcTable({ stripe_owner_customer: null });
    expect(await portal()).toEqual({ ok: false, reason: "no_customer" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails uncertain rather than guessing when the mapping read fails", async () => {
    rpcTable({ stripe_owner_customer: rpcFails("down") });
    expect(await portal()).toEqual({ ok: false, reason: "customer_mapping_uncertain" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["a host that only ends in stripe.com", { url: "https://billing.stripe.com.evil.test/p" }],
    ["the checkout host", { url: "https://checkout.stripe.com/p/session/x" }],
    ["a non-https url", { url: "http://billing.stripe.com/p/session/x" }],
    ["a port", { url: "https://billing.stripe.com:444/p" }],
    ["credentials", { url: "https://u:p@billing.stripe.com/p" }],
    ["the wrong mode", { livemode: true }],
    ["another customer", { customer: "cus_other" }],
    ["a malformed session id", { id: "sess_1" }],
  ])("refuses a portal session with %s", async (_label, over) => {
    routes["POST /v1/billing_portal/sessions"] = () => json(portalSession(over));
    expect(await portal()).toEqual({ ok: false, reason: "session_unexpected" });
    // Nothing is settled, so the caller may retry the identical request.
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
  it("keeps an aged ambiguous portal attempt retryable rather than fencing it", async () => {
    rpcTable({
      stripe_claim_checkout_request: [
        {
          status: "pending",
          session_id: null,
          created_at: new Date(NOW_MS - 72 * 3600 * 1000).toISOString(),
        },
      ],
    });
    // A portal link is not a billable object: a retry simply mints another.
    expect(await portal()).toEqual({
      ok: true,
      portalUrl: "https://billing.stripe.com/p/session/x",
    });
    expect(rpcNames()).not.toContain("stripe_fence_checkout_request");
  });
  it("refuses a malformed request id before any work", async () => {
    expect(await portal("test", "not-a-uuid")).toEqual({ ok: false, reason: "request_invalid" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not reopen an already terminal portal request", async () => {
    rpcTable({ stripe_claim_checkout_request: [{ status: "completed", session_id: null }] });
    expect(await portal()).toEqual({ ok: false, reason: "request_completed" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("stays uncertain when the provider call fails", async () => {
    routes["POST /v1/billing_portal/sessions"] = () => json({}, 503);
    expect(await portal()).toEqual({ ok: false, reason: "provider_unavailable" });
    expect(rpcNames()).not.toContain("stripe_settle_checkout_request");
  });
});

describe("purchased seat read", () => {
  it("returns the projection's seats and fails to zero", async () => {
    mocks.rpc.mockResolvedValue({ data: 4, error: null });
    expect(await readPurchasedWorkingSeats(OWNER)).toBe(4);
    expect(rpcArgs("stripe_purchased_working_seats")[0]).toEqual({ p_user: OWNER });
    for (const data of [0, null, "many", -2, 1.5, 1001, undefined]) {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect(await readPurchasedWorkingSeats(OWNER)).toBe(0);
    }
    // A missing function (pre-migration) or a transport failure is 0 extra seats.
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "does not exist" } });
    expect(await readPurchasedWorkingSeats(OWNER)).toBe(0);
    mocks.rpc.mockRejectedValue(new Error("transport"));
    expect(await readPurchasedWorkingSeats(OWNER)).toBe(0);
    expect(await readPurchasedWorkingSeats("")).toBe(0);
  });
});
