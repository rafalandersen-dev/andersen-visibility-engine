import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_MARKETS, PLAN_IDS } from "./billing";
const mocks = vi.hoisted(() => ({ read: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./entitlements.server", () => ({ readEntitlement: mocks.read }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const builder = {
      middleware: () => builder,
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
import {
  createPaddleCheckoutFn,
  createPaddlePortalSessionFn,
  getPaddleStatusFn,
} from "./billing.functions";
const call = (fn: unknown, data?: unknown) =>
  (fn as (args: unknown) => Promise<Record<string, unknown>>)({
    context: { userId: "caller" },
    data,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("PADDLE_API_KEY", "synthetic-test-key");
  for (const plan of ["FREE", "STARTER", "GROWTH", "PRO", "AGENCY"])
    for (const market of ["PL", "SE", "DK", "UK", "EU"])
      vi.stubEnv(`PADDLE_PRICE_${plan}_${market}`, "pri_fixture");
  mocks.read.mockResolvedValue({
    provider: "paddle",
    providerCustomerId: "ctm_caller",
    providerSubscriptionId: "sub_caller",
  });
  mocks.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          urls: {
            general: { overview: "https://example.invalid/manage" },
            subscriptions: [
              { id: "sub_caller", cancel_subscription: "https://example.invalid/cancel" },
            ],
          },
        },
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("new paid checkout is closed independently of legacy configuration", () => {
  it.each(["sandbox", "production"])(
    "refuses every plan/market in %s without a provider call or entitlement read",
    async (environment) => {
      vi.stubEnv("PADDLE_ENVIRONMENT", environment);
      for (const planId of PLAN_IDS)
        for (const billingMarket of BILLING_MARKETS) {
          const result = await call(createPaddleCheckoutFn, {
            planId,
            billingMarket,
            billingEmail: "billing@example.invalid",
          });
          expect(result).toMatchObject({ configured: false, checkoutAvailable: false });
          expect(result.checkoutUrl).toBeUndefined();
          expect(result.message).toContain("on hold");
        }
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );
  it("refuses absent credentials and reports configuration separately from availability", async () => {
    expect(await call(getPaddleStatusFn)).toMatchObject({
      configured: true,
      checkoutAvailable: false,
    });
    vi.stubEnv("PADDLE_API_KEY", "");
    expect(await call(getPaddleStatusFn)).toMatchObject({
      configured: false,
      checkoutAvailable: false,
    });
    expect(
      await call(createPaddleCheckoutFn, { planId: "pro", billingMarket: "Poland" }),
    ).toMatchObject({ configured: false, checkoutAvailable: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("still validates legacy request inputs", () => {
    expect(() =>
      call(createPaddleCheckoutFn, { planId: "invented", billingMarket: "Poland" }),
    ).toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
describe("existing subscriber management survives the checkout hold", () => {
  it.each(["sandbox", "production"])(
    "uses only the caller's stored IDs in %s",
    async (environment) => {
      vi.stubEnv("PADDLE_ENVIRONMENT", environment);
      const result = await call(createPaddlePortalSessionFn, {
        customerId: "ctm_other",
        subscriptionId: "sub_other",
      });
      expect(mocks.read).toHaveBeenCalledExactlyOnceWith("caller");
      expect(result).toMatchObject({
        configured: true,
        overviewUrl: "https://example.invalid/manage",
        cancelUrl: "https://example.invalid/cancel",
      });
      expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
        `https://${environment === "production" ? "api" : "sandbox-api"}.paddle.com/customers/ctm_caller/portal-sessions`,
        expect.objectContaining({ body: JSON.stringify({ subscription_ids: ["sub_caller"] }) }),
      );
    },
  );
  it("does not contact a provider for unlinked accounts", async () => {
    mocks.read.mockResolvedValue({ provider: "none" });
    expect((await call(createPaddlePortalSessionFn)).overviewUrl).toBeUndefined();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not read account IDs or call a provider when legacy management is unconfigured", async () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    expect(await call(createPaddlePortalSessionFn)).toMatchObject({ configured: false });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
