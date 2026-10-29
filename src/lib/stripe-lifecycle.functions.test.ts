/**
 * Caller-facing Stripe lifecycle functions: authentication, the paid-activation
 * hold, the empty-by-default sandbox allowlist and strict input scoping.
 *
 * The server module is mocked here, so a passing test also proves these
 * handlers reach no provider and no database on the held paths.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  middlewares: [] as unknown[],
  config: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
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
vi.mock("./stripe-lifecycle.server", () => ({
  stripeLifecycleConfig: mocks.config,
  createStripeLifecycleCheckout: mocks.checkout,
  createStripeLifecyclePortal: mocks.portal,
}));

import {
  createStripeLifecycleCheckoutFn,
  createStripeLifecyclePortalFn,
  getStripeLifecycleStatusFn,
  liveModeAllowed,
  stripeCheckoutInput,
} from "./stripe-lifecycle.functions";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const call = (fn: unknown, userId: string, data?: unknown) =>
  (fn as (args: unknown) => Promise<Record<string, unknown>>)({ context: { userId }, data });

const configFor = (owners: string[], ready = true) => ({
  sandboxOwners: new Set(owners.map((owner) => owner.toLowerCase())),
  checkoutReady: () => ready,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.config.mockReturnValue(configFor([OWNER]));
  mocks.checkout.mockResolvedValue({
    ok: true,
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
    sessionId: "cs_test_1",
    reused: false,
  });
  mocks.portal.mockResolvedValue({ ok: true, portalUrl: "https://billing.stripe.com/p/x" });
});

describe("authentication and the activation hold", () => {
  it("puts the authenticated-session middleware on every endpoint", () => {
    expect(mocks.middlewares.length).toBe(3);
    for (const middleware of mocks.middlewares) expect(middleware).toEqual({ __auth: true });
  });

  it("holds live paid activation in code, with no configuration escape", () => {
    expect(liveModeAllowed()).toBe(false);
  });

  it("reports the hold without leaking configuration", async () => {
    expect(await call(getStripeLifecycleStatusFn, OWNER)).toEqual({
      liveCheckoutHeld: true,
      sandboxAvailable: true,
      portalAvailable: true,
      message: expect.stringContaining("held"),
    });
    mocks.config.mockReturnValue(configFor([]));
    expect(await call(getStripeLifecycleStatusFn, OWNER)).toMatchObject({
      liveCheckoutHeld: true,
      sandboxAvailable: false,
      portalAvailable: false,
    });
  });

  it("refuses checkout for anyone outside the empty-by-default allowlist", async () => {
    mocks.config.mockReturnValue(configFor([]));
    expect(
      await call(createStripeLifecycleCheckoutFn, OWNER, { requestId: REQUEST, planId: "pro" }),
    ).toEqual({
      ok: false,
      reason: "held",
    });
    // An allowlisted OTHER owner does not help this caller.
    mocks.config.mockReturnValue(configFor([OTHER]));
    expect(
      await call(createStripeLifecycleCheckoutFn, OWNER, { requestId: REQUEST, planId: "pro" }),
    ).toEqual({
      ok: false,
      reason: "held",
    });
    // Allowlisted but test mode unconfigured: still held.
    mocks.config.mockReturnValue(configFor([OWNER], false));
    expect(
      await call(createStripeLifecycleCheckoutFn, OWNER, { requestId: REQUEST, planId: "pro" }),
    ).toEqual({
      ok: false,
      reason: "held",
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses portal access on the held path too", async () => {
    mocks.config.mockReturnValue(configFor([]));
    expect(await call(createStripeLifecyclePortalFn, OWNER, { requestId: REQUEST })).toEqual({
      ok: false,
      reason: "held",
    });
    expect(mocks.portal).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("caller scoping", () => {
  it("uses the authenticated identity and a server-chosen test mode", async () => {
    expect(
      await call(createStripeLifecycleCheckoutFn, OWNER, {
        requestId: REQUEST,
        planId: "pro",
        seatQuantity: 2,
      }),
    ).toEqual({
      ok: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      reused: false,
    });
    expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      requestId: REQUEST,
      planId: "pro",
      seatQuantity: 2,
      mode: "test",
    });
    // The session id is not returned to the client; only the URL it must open.
    expect(
      Object.keys(
        await call(createStripeLifecycleCheckoutFn, OWNER, { requestId: REQUEST, planId: "pro" }),
      ),
    ).toEqual(["ok", "checkoutUrl", "reused"]);
  });

  it("passes a refusal reason through without inventing access", async () => {
    mocks.checkout.mockResolvedValue({ ok: false, reason: "subscription_exists" });
    expect(
      await call(createStripeLifecycleCheckoutFn, OWNER, { requestId: REQUEST, planId: "pro" }),
    ).toEqual({
      ok: false,
      reason: "subscription_exists",
    });
  });

  it("scopes the portal to the caller's own identity", async () => {
    expect(await call(createStripeLifecyclePortalFn, OWNER, { requestId: REQUEST })).toEqual({
      ok: true,
      portalUrl: "https://billing.stripe.com/p/x",
    });
    expect(mocks.portal).toHaveBeenCalledExactlyOnceWith({
      userId: OWNER,
      requestId: REQUEST,
      mode: "test",
    });
  });

  it.each([
    ["an injected price", { requestId: REQUEST, planId: "pro", priceId: "price_injected" }],
    ["an injected customer", { requestId: REQUEST, planId: "pro", customerId: "cus_other" }],
    ["an injected owner", { requestId: REQUEST, planId: "pro", userId: OTHER }],
    ["an injected account", { requestId: REQUEST, planId: "pro", accountId: "acct_other" }],
    ["an injected mode", { requestId: REQUEST, planId: "pro", mode: "live" }],
    ["a free plan", { requestId: REQUEST, planId: "freePreview" }],
    ["an unknown plan", { requestId: REQUEST, planId: "enterprise" }],
    ["a missing plan", { requestId: REQUEST }],
    ["a non-uuid request", { requestId: "1", planId: "pro" }],
    ["a negative seat count", { requestId: REQUEST, planId: "pro", seatQuantity: -1 }],
    ["a fractional seat count", { requestId: REQUEST, planId: "pro", seatQuantity: 1.5 }],
    ["an oversized seat count", { requestId: REQUEST, planId: "pro", seatQuantity: 1001 }],
  ])("rejects %s before any server work", async (_label, data) => {
    expect(() => call(createStripeLifecycleCheckoutFn, OWNER, data)).toThrow();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects an injected customer on the portal endpoint as well", () => {
    expect(() =>
      call(createStripeLifecyclePortalFn, OWNER, { requestId: REQUEST, customerId: "cus_other" }),
    ).toThrow();
    expect(mocks.portal).not.toHaveBeenCalled();
  });

  it("keeps the checkout validator strict about its whole shape", () => {
    expect(stripeCheckoutInput.safeParse({ requestId: REQUEST, planId: "pro" }).success).toBe(true);
    expect(stripeCheckoutInput.safeParse({}).success).toBe(false);
  });
});
