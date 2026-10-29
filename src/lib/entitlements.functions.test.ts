/**
 * The owner-gated manual override, called the way an attacker or a stale tab
 * would call it: DIRECTLY, with a real owner role and no UI in the way.
 *
 * A disabled button on the billing screen proves nothing here. What has to
 * hold is that the server refuses a manual grant or a Free reset while the
 * account's Stripe state is live, unresolved or simply unreadable — and that
 * it still permits the legitimate manual and Paddle cases it always has.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  middlewares: [] as unknown[],
  clearance: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  hasRole: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  /** Flipped on by the A1 block so the endpoint runs the REAL clearance. */
  realClearance: { on: false },
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
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("./stripe-commercial.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe-commercial.server")>();
  return {
    // The guard block pins the endpoint's own contract against a stub clearance,
    // so a clearance change can never silently rewrite what the endpoint does
    // with one. The A1 block flips the switch and runs the PRODUCTION clearance
    // end to end, because a standalone predicate test would not prove that this
    // owner endpoint actually refuses the write.
    evaluateManualEntitlementClearance: (userId: string) =>
      mocks.realClearance.on
        ? actual.evaluateManualEntitlementClearance(userId)
        : mocks.clearance(userId),
  };
});
vi.mock("./entitlements.server", () => ({
  writeEntitlement: mocks.write,
  readEntitlement: mocks.read,
}));

import { setManualEntitlementFn } from "./entitlements.functions";

const OWNER = "00000000-0000-4000-8000-00000000c001";

const call = (data: unknown, { owner = true }: { owner?: boolean } = {}) =>
  (setManualEntitlementFn as unknown as (args: unknown) => Promise<unknown>)({
    context: {
      userId: OWNER,
      supabase: { rpc: mocks.hasRole.mockResolvedValue({ data: owner }) },
    },
    data,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.realClearance.on = false;
  mocks.clearance.mockResolvedValue({ allowed: true, reason: "clear" });
  mocks.write.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue({
    planId: "growth",
    status: "manualBeta",
    cancelAtPeriodEnd: false,
    provider: "manual",
  });
});

describe("the narrow manual guard", () => {
  it("keeps the authenticated-session middleware on both endpoints", () => {
    expect(mocks.middlewares.length).toBe(2);
    for (const middleware of mocks.middlewares) expect(middleware).toEqual({ __auth: true });
  });

  it("still refuses a non-owner before anything else", async () => {
    await expect(
      call({ planId: "growth", status: "manualBeta" }, { owner: false }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.clearance).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("preserves the legitimate owner manual beta and comped grants", async () => {
    for (const status of ["manualBeta", "manualComped"] as const) {
      await call({ planId: "pro", status });
      expect(mocks.write).toHaveBeenCalledWith({
        userId: OWNER,
        planId: "pro",
        status,
        provider: "manual",
      });
      mocks.write.mockClear();
    }
  });

  it("preserves the owner's Free reset and its existing return shape", async () => {
    const result = await call({ planId: "growth", status: "freePreview" });
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      planId: "freePreview",
      status: "freePreview",
      provider: "manual",
    });
    expect(result).toEqual({
      entitlement: {
        planId: "freePreview",
        status: "freePreview",
        cancelAtPeriodEnd: false,
        provider: "none",
      },
    });
  });

  it("runs the clearance for the authenticated owner on EVERY manual status", async () => {
    for (const status of ["manualBeta", "manualComped", "freePreview"] as const) {
      mocks.clearance.mockClear();
      await call({ planId: "growth", status });
      expect(mocks.clearance, status).toHaveBeenCalledExactlyOnceWith(OWNER);
    }
  });

  it.each([
    ["an active or unresolved Stripe subscription", "stripe_subscription_unresolved"],
    ["an open commercial operation", "commercial_operation_open"],
    ["an unresolved checkout", "checkout_unresolved"],
    ["a raw Stripe entitlement with no terminal projection", "stripe_entitlement_unresolved"],
    ["an unknown billing state", "billing_state_unknown"],
    ["an unreadable billing state", "billing_read_unavailable"],
    ["a missing relation", "billing_read_failed"],
    ["a truncated safety scan", "billing_read_truncated"],
    ["a blocking deletion barrier", "billing_barrier_blocked"],
  ])("refuses a forced owner call for %s", async (_label, reason) => {
    mocks.clearance.mockResolvedValue({ allowed: false, reason });
    for (const status of ["manualBeta", "manualComped", "freePreview"] as const) {
      await expect(call({ planId: "growth", status })).rejects.toThrow(
        `manual_override_held:${reason}`,
      );
    }
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("fails closed when the clearance itself throws", async () => {
    mocks.clearance.mockRejectedValue(new Error("unavailable"));
    await expect(call({ planId: "growth", status: "manualBeta" })).rejects.toThrow();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("keeps the input validator rejecting an unknown plan or status before any work", () => {
    for (const data of [
      {},
      { planId: "growth" },
      { status: "manualBeta" },
      { planId: "enterprise", status: "manualBeta" },
      { planId: "growth", status: "active" },
      { planId: "growth", status: "cancelled" },
    ])
      expect(() => call(data), JSON.stringify(data)).toThrow();
    expect(mocks.clearance).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* A1 — the real clearance, through the real owner endpoint                   */
/* -------------------------------------------------------------------------- */

/**
 * Effective Free is NOT a terminated agreement.
 *
 * Three raw Stripe rows grant no access while the agreement behind them is
 * still open: an `active` row whose period has merely lapsed, a `pastDue` row,
 * and a `checkoutPending` row. Each one used to satisfy the "does not grant
 * paid access" half of the raw-entitlement gate and clear a manual write on top
 * of a live Stripe relationship.
 *
 * These cases run the PRODUCTION clearance inside the PRODUCTION owner handler:
 * the real validator, the real owner-role check, the real owner-scoped reads
 * against a store that returns ONLY the named columns, and a recording write
 * sink. A standalone predicate assertion would not show that the endpoint
 * itself declines to write, which is the only thing a forced direct call cares
 * about.
 */
describe("A1 — the owner endpoint against the production clearance", () => {
  const ACCOUNT = "acct_commercialA1";
  const CUSTOMER = "cus_a1";
  const SUBSCRIPTION = "sub_a1";
  /** Long past, so "it lapsed" is unmistakably the only thing that changed. */
  const LAPSED = "2019-01-01T00:00:00.000Z";
  /** Far future, so a hold can never be mistaken for an age heuristic. */
  const FUTURE = "2099-01-01T00:00:00.000Z";
  const MANUAL_STATUSES = ["manualBeta", "manualComped", "freePreview"] as const;

  type Row = Record<string, unknown>;

  /** Every row the production reader was actually handed, for the shape check. */
  const served: { table: string; columns: string[]; rows: Row[] }[] = [];

  /**
   * The owner-scoped SELECTs, projected to the NAMED COLUMNS ONLY.
   *
   * A permissive full-row fixture would quietly supply identifiers the real
   * query never asked for, so a reader that depends on an unselected column
   * would pass here and fail in production.
   */
  const tables = (over: Record<string, Row[]> = {}) => {
    const store: Record<string, Row[]> = {
      entitlements: [],
      stripe_customers: [],
      stripe_subscriptions: [],
      stripe_commercial_operations: [],
      stripe_checkout_requests: [],
      ...over,
    };
    mocks.from.mockImplementation((table: string) => ({
      select: (columns: string) => {
        const named = columns.split(",");
        const filters: Row = {};
        const builder = {
          eq(column: string, value: unknown) {
            filters[column] = value;
            return builder;
          },
          limit(count: number) {
            const owned = (store[table] ?? []).filter((row) =>
              Object.entries(filters).every(([column, value]) => row[column] === value),
            );
            const rows = owned
              .slice(0, count)
              .map((row) => Object.fromEntries(named.map((c) => [c, row[c] ?? null])));
            served.push({ table, columns: named, rows });
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return builder;
      },
    }));
  };

  /** A raw Stripe entitlement naming the exact agreement below. */
  const entitlementRow = (over: Row = {}): Row => ({
    user_id: OWNER,
    plan_id: "growth",
    status: "cancelled",
    provider: "stripe",
    provider_customer_id: CUSTOMER,
    provider_subscription_id: SUBSCRIPTION,
    current_period_end: LAPSED,
    cancel_at_period_end: true,
    updated_at: LAPSED,
    ...over,
  });
  /** The exact mapping and the exact terminal projection it names. */
  const terminalEvidence = (entitlement: Row): Record<string, Row[]> => ({
    entitlements: [entitlement],
    stripe_customers: [
      { user_id: OWNER, account_id: ACCOUNT, mode: "test", customer_id: CUSTOMER },
    ],
    stripe_subscriptions: [
      {
        user_id: OWNER,
        account_id: ACCOUNT,
        mode: "test",
        subscription_id: SUBSCRIPTION,
        plan_id: "growth",
        status: "canceled",
        seat_quantity: 2,
        current_period_end: LAPSED,
        cancel_at_period_end: true,
      },
    ],
  });

  beforeEach(() => {
    mocks.realClearance.on = true;
    served.length = 0;
    tables();
    // The read-only deletion barrier is open; its own blocking cases stay in
    // the guard block above and in the adapter suite.
    mocks.rpc.mockResolvedValue({
      data: { blocked: false, reason: "clear", mode: null, subscription_id: null },
      error: null,
    });
    mocks.read.mockResolvedValue({
      planId: "growth",
      status: "manualBeta",
      cancelAtPeriodEnd: false,
      provider: "manual",
    });
  });

  it("asks for named owner-scoped columns only, and is served nothing more", async () => {
    tables(terminalEvidence(entitlementRow()));
    await call({ planId: "growth", status: "manualBeta" });
    expect(served.map((read) => read.table)).toEqual([
      "entitlements",
      "stripe_customers",
      "stripe_subscriptions",
      "stripe_commercial_operations",
      "stripe_checkout_requests",
    ]);
    for (const read of served) {
      expect(read.columns, read.table).not.toContain("*");
      for (const row of read.rows)
        expect(Object.keys(row).sort(), read.table).toEqual([...read.columns].sort());
    }
  });

  it.each([
    ["an active agreement whose period merely lapsed", { status: "active" }],
    ["a past-due agreement with a live future period", { status: "pastDue", c: FUTURE }],
    ["an unresolved checkout with a live future period", { status: "checkoutPending", c: FUTURE }],
  ])("writes nothing for %s, even beside exact terminal evidence", async (_label, over) => {
    const { c, ...raw } = over as { status: string; c?: string };
    for (const status of MANUAL_STATUSES) {
      tables(terminalEvidence(entitlementRow({ ...raw, current_period_end: c ?? LAPSED })));
      await expect(call({ planId: "growth", status }), status).rejects.toThrow(
        "manual_override_held:stripe_entitlement_unresolved",
      );
    }
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("writes nothing for an active row that merely maps to the Free plan", async () => {
    tables(
      terminalEvidence(
        entitlementRow({ status: "active", plan_id: "freePreview", current_period_end: FUTURE }),
      ),
    );
    await expect(call({ planId: "growth", status: "manualBeta" })).rejects.toThrow(
      "manual_override_held:stripe_entitlement_unresolved",
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    ["a cancelled raw row", { status: "cancelled" }],
    ["an explicit Free raw row", { status: "freePreview", plan_id: "freePreview" }],
  ])("still writes exactly once for %s over a terminal projection", async (_label, raw) => {
    tables(terminalEvidence(entitlementRow(raw)));
    await call({ planId: "pro", status: "manualBeta" });
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      planId: "pro",
      status: "manualBeta",
      provider: "manual",
    });
  });

  it("still writes for a clean absence and for a manual account", async () => {
    await call({ planId: "pro", status: "manualComped" });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    tables({ entitlements: [entitlementRow({ provider: "manual", status: "manualBeta" })] });
    await call({ planId: "pro", status: "manualComped" });
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });

  it("refuses a non-owner before it reads any billing evidence at all", async () => {
    tables(terminalEvidence(entitlementRow()));
    await expect(
      call({ planId: "growth", status: "freePreview" }, { owner: false }),
    ).rejects.toThrow("Forbidden");
    expect(served).toHaveLength(0);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("writes nothing when the barrier blocks the owner's Free reset", async () => {
    tables(terminalEvidence(entitlementRow()));
    mocks.rpc.mockResolvedValue({
      data: { blocked: true, reason: "refund_reserved", mode: "test", subscription_id: "sub_a1" },
      error: null,
    });
    await expect(call({ planId: "growth", status: "freePreview" })).rejects.toThrow(
      "manual_override_held:billing_barrier_blocked",
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
