/**
 * Caller-facing Stripe COMMERCIAL functions: authentication, the dormant hold,
 * the empty-by-default sandbox allowlist, strict input scoping and the absence
 * of any refund endpoint.
 *
 * The server module is mocked here, so a passing test also proves these
 * handlers reach no provider and no database on the held paths.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  middlewares: [] as unknown[],
  config: vi.fn(),
  prepare: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  reverse: vi.fn(),
  refund: vi.fn(),
  summary: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __auth: true },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const builder = {
      middleware: (list: unknown[]) => {
        mocks.middlewares.push(...list);
        return builder;
      },
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data?: unknown; context: unknown }) =>
        fn({ ...args, data: args.data === undefined ? undefined : validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./stripe-lifecycle.server", () => ({ stripeLifecycleConfig: mocks.config }));
vi.mock("./stripe-commercial.server", () => ({
  prepareSubscriptionChange: mocks.prepare,
  confirmSubscriptionChange: mocks.confirm,
  requestSubscriptionCancellation: mocks.cancel,
  reverseSubscriptionCancellation: mocks.reverse,
  executeApprovedRefund: mocks.refund,
  readCommercialAccountSummary: mocks.summary,
}));

import * as commercialFunctions from "./stripe-commercial.functions";
import {
  cancelStripeSubscriptionFn,
  confirmStripeSubscriptionChangeFn,
  getStripeCommercialStatusFn,
  getStripeCommercialSummaryFn,
  liveCommercialMutationsAllowed,
  prepareStripeSubscriptionChangeFn,
  reverseStripeCancellationFn,
  stripeChangeConfirmInput,
  stripeChangePreviewInput,
} from "./stripe-commercial.functions";

const OWNER = "00000000-0000-4000-8000-00000000c001";
const OTHER = "00000000-0000-4000-8000-00000000c002";
const QUOTE = "00000000-0000-4000-8000-0000000000b1";
const OPERATION = "00000000-0000-4000-8000-0000000000a1";
const CANCEL_OPERATION = "00000000-0000-4000-8000-0000000000a9";

const call = (fn: unknown, userId: string, data?: unknown) =>
  (fn as (args: unknown) => Promise<Record<string, unknown>>)({ context: { userId }, data });

const configFor = (owners: string[], ready = true) => ({
  sandboxOwners: new Set(owners.map((owner) => owner.toLowerCase())),
  checkoutReady: () => ready,
});

const PREPARED = {
  ok: true,
  quoteId: QUOTE,
  direction: "increase" as const,
  amountDueMinor: 12_300,
  // The provider's LONG-TERM recurring estimate, kept separate from the amount
  // charged now and carrying its own honest wording.
  recurringEstimateMinor: 26_910,
  recurringEstimateIncludesAdjustments: true,
  recurringEstimateNote:
    "This is an estimate of one full period at the new plan and seats. It is not a promise of your next charge.",
  currency: "eur",
  effectiveAt: null,
  immediate: true,
  expiresAt: "2026-10-28T23:15:00.000Z",
  targetPlanId: "pro" as const,
  targetSeatQuantity: 0,
  workingSeatAllowance: 5,
  viewerSeatAllowance: 10,
  projectAllowance: 5,
  effectiveNote: "This change takes effect once the prorated amount shown is paid.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.config.mockReturnValue(configFor([OWNER]));
  mocks.prepare.mockResolvedValue(PREPARED);
  mocks.confirm.mockResolvedValue({
    ok: true,
    state: "applied",
    direction: "increase",
    effectiveAt: null,
    currency: "eur",
    amountDueMinor: 12_300,
    note: "The new plan and seat count are active.",
  });
  mocks.cancel.mockResolvedValue({
    ok: true,
    cancelAtPeriodEnd: true,
    effectiveAt: "2026-11-27T00:00:00.000Z",
    operationId: OPERATION,
    note: "Your plan stays active until the end of the period you have paid for.",
  });
  mocks.reverse.mockResolvedValue({
    ok: true,
    cancelAtPeriodEnd: false,
    effectiveAt: "2026-11-27T00:00:00.000Z",
    operationId: OPERATION,
    note: "The cancellation has been withdrawn.",
  });
});

describe("authentication and the dormant hold", () => {
  it("puts the authenticated-session middleware on every endpoint", () => {
    expect(mocks.middlewares.length).toBe(6);
    for (const middleware of mocks.middlewares) expect(middleware).toEqual({ __auth: true });
  });

  it("holds live commercial mutations in code, with no configuration escape", () => {
    expect(liveCommercialMutationsAllowed()).toBe(false);
  });

  it("exposes NO refund endpoint at all", () => {
    const exported = Object.keys(commercialFunctions);
    expect(exported.filter((name) => /refund/i.test(name))).toEqual([]);
    // Everything callable here is a change, a cancellation or a read.
    expect(exported.filter((name) => name.endsWith("Fn")).sort()).toEqual([
      "cancelStripeSubscriptionFn",
      "confirmStripeSubscriptionChangeFn",
      "getStripeCommercialStatusFn",
      "getStripeCommercialSummaryFn",
      "prepareStripeSubscriptionChangeFn",
      "reverseStripeCancellationFn",
    ]);
  });

  it("reports the hold without leaking configuration", async () => {
    expect(await call(getStripeCommercialStatusFn, OWNER)).toEqual({
      liveChangesHeld: true,
      sandboxAvailable: true,
      refundSelfServiceAvailable: false,
      message: expect.stringContaining("held"),
    });
    mocks.config.mockReturnValue(configFor([]));
    expect(await call(getStripeCommercialStatusFn, OWNER)).toMatchObject({
      liveChangesHeld: true,
      sandboxAvailable: false,
    });
  });

  it("serves the summary READ as a read, even while every mutation is held", async () => {
    mocks.config.mockReturnValue(configFor([])); // the default empty allowlist
    const verified = {
      ok: true,
      summary: {
        provider: "stripe",
        mode: "test",
        planId: "growth",
        access: "paid",
        status: "active",
        purchasedSeats: 2,
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
          prepareChange: false,
          cancel: false,
          reverseCancellation: false,
          recoverOperation: false,
          manualOverride: false,
        },
        heldReason: "held",
      },
    };
    mocks.summary.mockResolvedValue(verified);
    expect(await call(getStripeCommercialSummaryFn, OWNER)).toEqual(verified);
    // Scoped to the authenticated caller, with no client-supplied identity.
    expect(mocks.summary).toHaveBeenCalledExactlyOnceWith(OWNER);
    expect(mocks.fetch).not.toHaveBeenCalled();
    for (const mock of [mocks.prepare, mocks.confirm, mocks.cancel, mocks.reverse, mocks.refund])
      expect(mock).not.toHaveBeenCalled();
  });

  it("passes an unavailable read through without inventing Free or a provider", async () => {
    mocks.summary.mockResolvedValue({ ok: false, reason: "billing_read_unavailable" });
    expect(await call(getStripeCommercialSummaryFn, OWNER)).toEqual({
      ok: false,
      reason: "billing_read_unavailable",
    });
  });

  it.each([
    [
      "preparing a change",
      prepareStripeSubscriptionChangeFn,
      { quoteId: QUOTE, planId: "pro", seatQuantity: 0 },
    ],
    [
      "confirming a change",
      confirmStripeSubscriptionChangeFn,
      {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 12_300,
        currency: "eur",
      },
    ],
    ["cancelling", cancelStripeSubscriptionFn, { operationId: OPERATION }],
    [
      "reversing a cancellation",
      reverseStripeCancellationFn,
      { operationId: OPERATION, cancelOperationId: CANCEL_OPERATION },
    ],
  ])("refuses %s for anyone outside the empty-by-default allowlist", async (_label, fn, data) => {
    mocks.config.mockReturnValue(configFor([]));
    expect(await call(fn, OWNER, data)).toEqual({ ok: false, reason: "held" });
    // An allowlisted OTHER owner does not help this caller.
    mocks.config.mockReturnValue(configFor([OTHER]));
    expect(await call(fn, OWNER, data)).toEqual({ ok: false, reason: "held" });
    // Allowlisted but test mode unconfigured: still held.
    mocks.config.mockReturnValue(configFor([OWNER], false));
    expect(await call(fn, OWNER, data)).toEqual({ ok: false, reason: "held" });
    for (const mock of [mocks.prepare, mocks.confirm, mocks.cancel, mocks.reverse, mocks.refund])
      expect(mock).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("caller scoping", () => {
  it("uses the authenticated identity and a server-chosen test mode", async () => {
    await call(prepareStripeSubscriptionChangeFn, OWNER, {
      quoteId: QUOTE,
      planId: "pro",
      seatQuantity: 2,
    });
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      quoteId: QUOTE,
      mode: "test",
      targetPlanId: "pro",
      targetSeatQuantity: 2,
    });
    await call(confirmStripeSubscriptionChangeFn, OWNER, {
      operationId: OPERATION,
      quoteId: QUOTE,
      planId: "pro",
      seatQuantity: 2,
      amountMinor: 12_300,
      currency: "eur",
    });
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      operationId: OPERATION,
      quoteId: QUOTE,
      mode: "test",
      targetPlanId: "pro",
      targetSeatQuantity: 2,
      expectedAmountMinor: 12_300,
      expectedCurrency: "eur",
    });
  });

  it("returns UI-safe fields only from the preview", async () => {
    const result = await call(prepareStripeSubscriptionChangeFn, OWNER, {
      quoteId: QUOTE,
      planId: "pro",
      seatQuantity: 0,
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        "ok",
        "quoteId",
        "direction",
        "amountMinor",
        "recurringEstimateMinor",
        "recurringEstimateIncludesAdjustments",
        "recurringEstimateNote",
        "currency",
        "effectiveAt",
        "immediate",
        "expiresAt",
        "planId",
        "seatQuantity",
        "workingSeatAllowance",
        "viewerSeatAllowance",
        "projectAllowance",
        "effectiveNote",
      ].sort(),
    );
    // The two amounts stay SEPARATE: what is charged now, and a long-term
    // estimate that is explicitly not a promised next debit.
    expect(result).toMatchObject({
      amountMinor: 12_300,
      recurringEstimateMinor: 26_910,
      recurringEstimateIncludesAdjustments: true,
      projectAllowance: 5,
    });
    expect(String(result.recurringEstimateNote)).toContain("not a promise of your next charge");
    // Still no id, price, account or operator state crosses the boundary.
    const serialized = JSON.stringify(result);
    for (const secret of ["acct_", "cus_", "sub_", "price_", "si_", "rk_test"])
      expect(serialized, secret).not.toContain(secret);
  });

  it("passes a refusal reason through without inventing access", async () => {
    mocks.prepare.mockResolvedValue({ ok: false, reason: "capacity_conflict_working" });
    expect(
      await call(prepareStripeSubscriptionChangeFn, OWNER, {
        quoteId: QUOTE,
        planId: "growth",
        seatQuantity: 0,
      }),
    ).toEqual({ ok: false, reason: "capacity_conflict_working" });
    mocks.confirm.mockResolvedValue({ ok: false, reason: "quote_tampered" });
    expect(
      await call(confirmStripeSubscriptionChangeFn, OWNER, {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 1,
        currency: "eur",
      }),
    ).toEqual({ ok: false, reason: "quote_tampered" });
  });

  it("scopes cancellation and reversal to the caller's own identity", async () => {
    await call(cancelStripeSubscriptionFn, OWNER, { operationId: OPERATION });
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      operationId: OPERATION,
      mode: "test",
    });
    await call(reverseStripeCancellationFn, OWNER, {
      operationId: OPERATION,
      cancelOperationId: CANCEL_OPERATION,
    });
    expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      operationId: OPERATION,
      cancelOperationId: CANCEL_OPERATION,
      mode: "test",
    });
  });

  it.each([
    ["an injected price", { quoteId: QUOTE, planId: "pro", seatQuantity: 0, priceId: "price_x" }],
    [
      "an injected customer",
      { quoteId: QUOTE, planId: "pro", seatQuantity: 0, customerId: "cus_x" },
    ],
    ["an injected owner", { quoteId: QUOTE, planId: "pro", seatQuantity: 0, userId: OTHER }],
    [
      "an injected account",
      { quoteId: QUOTE, planId: "pro", seatQuantity: 0, accountId: "acct_x" },
    ],
    ["an injected mode", { quoteId: QUOTE, planId: "pro", seatQuantity: 0, mode: "live" }],
    [
      "an injected subscription",
      { quoteId: QUOTE, planId: "pro", seatQuantity: 0, subscriptionId: "sub_x" },
    ],
    ["an injected item id", { quoteId: QUOTE, planId: "pro", seatQuantity: 0, itemId: "si_x" }],
    [
      "an injected proration date",
      { quoteId: QUOTE, planId: "pro", seatQuantity: 0, prorationDate: 1 },
    ],
    ["a free plan", { quoteId: QUOTE, planId: "freePreview", seatQuantity: 0 }],
    ["an unknown plan", { quoteId: QUOTE, planId: "enterprise", seatQuantity: 0 }],
    ["a missing plan", { quoteId: QUOTE, seatQuantity: 0 }],
    ["a missing quote id", { planId: "pro", seatQuantity: 0 }],
    ["a non-uuid quote id", { quoteId: "1", planId: "pro", seatQuantity: 0 }],
    ["a negative seat count", { quoteId: QUOTE, planId: "pro", seatQuantity: -1 }],
    ["a fractional seat count", { quoteId: QUOTE, planId: "pro", seatQuantity: 1.5 }],
    ["an oversized seat count", { quoteId: QUOTE, planId: "pro", seatQuantity: 1001 }],
  ])("rejects %s on the preview endpoint before any server work", async (_label, data) => {
    expect(() => call(prepareStripeSubscriptionChangeFn, OWNER, data)).toThrow();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an injected owner",
      {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 1,
        currency: "eur",
        userId: OTHER,
      },
    ],
    [
      "an injected approval flag",
      {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 1,
        currency: "eur",
        approved: true,
      },
    ],
    [
      "a negative amount",
      {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: -1,
        currency: "eur",
      },
    ],
    [
      "a fractional amount",
      {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 1.5,
        currency: "eur",
      },
    ],
    [
      "a malformed currency",
      {
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 1,
        currency: "EUR",
      },
    ],
    [
      "a missing amount",
      { operationId: OPERATION, quoteId: QUOTE, planId: "pro", seatQuantity: 0, currency: "eur" },
    ],
    [
      "a missing operation id",
      { quoteId: QUOTE, planId: "pro", seatQuantity: 0, amountMinor: 1, currency: "eur" },
    ],
  ])("rejects %s on the confirm endpoint before any server work", async (_label, data) => {
    expect(() => call(confirmStripeSubscriptionChangeFn, OWNER, data)).toThrow();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects an injected owner or subscription on the cancellation endpoints", () => {
    expect(() =>
      call(cancelStripeSubscriptionFn, OWNER, { operationId: OPERATION, userId: OTHER }),
    ).toThrow();
    expect(() =>
      call(cancelStripeSubscriptionFn, OWNER, {
        operationId: OPERATION,
        subscriptionId: "sub_other",
      }),
    ).toThrow();
    expect(() => call(reverseStripeCancellationFn, OWNER, { operationId: OPERATION })).toThrow();
    expect(() =>
      call(reverseStripeCancellationFn, OWNER, {
        operationId: OPERATION,
        cancelOperationId: "1",
      }),
    ).toThrow();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("keeps the validators strict about their whole shape", () => {
    expect(
      stripeChangePreviewInput.safeParse({ quoteId: QUOTE, planId: "pro", seatQuantity: 0 })
        .success,
    ).toBe(true);
    expect(stripeChangePreviewInput.safeParse({}).success).toBe(false);
    expect(
      stripeChangeConfirmInput.safeParse({
        operationId: OPERATION,
        quoteId: QUOTE,
        planId: "pro",
        seatQuantity: 0,
        amountMinor: 0,
        currency: "eur",
      }).success,
    ).toBe(true);
    expect(stripeChangeConfirmInput.safeParse({}).success).toBe(false);
  });
});
