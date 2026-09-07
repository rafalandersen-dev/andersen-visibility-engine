import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), config: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
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
vi.mock("./stripe-sandbox.server", () => ({
  createStripeSandboxCheckout: mocks.create,
  stripeSandboxConfig: mocks.config,
}));
import {
  getStripeSandboxStatusFn,
  createStripeSandboxCheckoutFn,
} from "./stripe-sandbox.functions";
const user = "00000000-0000-4000-8000-000000000011",
  requestId = "00000000-0000-4000-8000-000000000012";
const context = (result: unknown) => ({
  userId: user,
  supabase: { rpc: vi.fn(async () => result) },
});
const call = (fn: unknown, ctx: unknown, data?: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ context: ctx, data });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({
    checkoutReady: true,
    webhookReady: true,
    apiKey: "must-not-leak",
  });
  mocks.create.mockResolvedValue({
    checkoutUrl: "https://checkout.stripe.com/c/pay/test",
    sessionId: "cs_test_fixture",
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("owner-only Stripe acceptance actions", () => {
  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: "failed" } },
  ])(
    "rejects non-owner and unverifiable roles before configuration or API access",
    async (role) => {
      for (const fn of [getStripeSandboxStatusFn, createStripeSandboxCheckoutFn])
        await expect(
          call(fn, context(role), fn === createStripeSandboxCheckoutFn ? { requestId } : undefined),
        ).rejects.toThrow("Forbidden");
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.config).not.toHaveBeenCalled();
    },
  );
  it("returns only availability, never keys or account configuration", async () => {
    expect(await call(getStripeSandboxStatusFn, context({ data: true, error: null }))).toEqual({
      available: true,
    });
  });
  it("requires webhook readiness before checkout and uses server-authenticated identity", async () => {
    const ctx = context({ data: true, error: null });
    mocks.config.mockReturnValue({ checkoutReady: true, webhookReady: false });
    expect(await call(createStripeSandboxCheckoutFn, ctx, { requestId })).toEqual({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.config.mockReturnValue({ checkoutReady: true, webhookReady: true });
    await call(createStripeSandboxCheckoutFn, ctx, { requestId });
    expect(mocks.create).toHaveBeenCalledWith(user, requestId);
    expect(ctx.supabase.rpc).toHaveBeenCalledWith("has_role", { _user_id: user, _role: "owner" });
  });
  it("rejects injected account or price data without external effects", async () => {
    expect(() =>
      call(createStripeSandboxCheckoutFn, context({ data: true, error: null }), {
        requestId,
        priceId: "price_injected",
      }),
    ).toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("hides provider errors and keeps the UI retryable", async () => {
    mocks.create.mockRejectedValue(new Error("private-provider-information"));
    expect(
      await call(createStripeSandboxCheckoutFn, context({ data: true, error: null }), {
        requestId,
      }),
    ).toEqual({ ok: false });
  });
});
