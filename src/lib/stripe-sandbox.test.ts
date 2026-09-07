import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStripeSandboxCheckout,
  receiveStripeSandboxWebhook,
  stripeSandboxConfig,
  stripeSandboxCheckoutInput,
  STRIPE_SANDBOX_BODY_LIMIT,
} from "./stripe-sandbox.server";
const env = {
  MILO_STRIPE_SANDBOX_ENABLED: "true",
  STRIPE_SANDBOX_SECRET_KEY: "sk_test_fixture",
  STRIPE_SANDBOX_PRICE_ID: "price_fixture",
  STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_fixture",
};
const user = "00000000-0000-4000-8000-000000000011",
  requestId = "00000000-0000-4000-8000-000000000012";
const now = Date.parse("2026-09-07T14:30:00Z"),
  ts = now / 1000;
const event = {
  id: "evt_fixture",
  type: "customer.subscription.updated",
  created: ts,
  livemode: false,
  data: {
    object: {
      id: "sub_fixture",
      customer_email: "private@example.test",
      metadata: { secret: "planted" },
    },
  },
};
const sign = (raw: string, time = ts) =>
  `t=${time},v1=${createHmac("sha256", env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(`${time}.${raw}`).digest("hex")}`;
const request = (raw = JSON.stringify(event), signature: string | null = sign(raw)) =>
  new Request("https://milogrowth.com/api/public/webhooks/stripe-sandbox", {
    method: "POST",
    body: raw,
    headers: signature ? { "stripe-signature": signature } : {},
  });
afterEach(() => vi.useRealTimers());
describe("isolated Stripe checkout", () => {
  it.each([
    {},
    { ...env, MILO_STRIPE_SANDBOX_ENABLED: "false" },
    { ...env, STRIPE_SANDBOX_SECRET_KEY: "sk_live_fixture" },
    { ...env, STRIPE_SANDBOX_PRICE_ID: "" },
  ])(
    "fails closed before external calls when configuration is incomplete or live",
    async (configuration) => {
      const fetcher = vi.fn();
      await expect(
        createStripeSandboxCheckout(user, requestId, { env: configuration, fetch: fetcher }),
      ).rejects.toThrow("not_configured");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("uses a fixed destination, server price/company address and stable user-scoped retry key", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        id: "cs_test_fixture",
        livemode: false,
        url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
      }),
    );
    const a = await createStripeSandboxCheckout(user, requestId, { env, fetch: fetcher });
    await createStripeSandboxCheckout(user, requestId, { env, fetch: fetcher });
    expect(a.sessionId).toBe("cs_test_fixture");
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("https://api.stripe.com/v1/checkout/sessions");
    const init = calls[0][1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      new Headers(calls[1][1].headers).get("Idempotency-Key"),
    );
    const form = new URLSearchParams(String(init.body));
    expect(form.get("line_items[0][price]")).toBe("price_fixture");
    expect(form.get("customer_email")).toBe("rafi@anderseninnovations.com");
    expect(form.has("subscription_data[metadata][plan_id]")).toBe(false);
  });
  it.each([
    { id: "cs_live_fixture", livemode: true, url: "https://checkout.stripe.com/c/pay/test" },
    { id: "cs_test_fixture", livemode: false, url: "https://evil.example.test" },
    {
      id: "cs_test_fixture",
      livemode: false,
      url: "https://user:password@checkout.stripe.com/c/pay/test",
    },
    { id: "cs_test_fixture", livemode: false, url: "http://checkout.stripe.com/c/pay/test" },
  ])("refuses live or unsafe checkout responses", async (data) => {
    await expect(
      createStripeSandboxCheckout(user, requestId, {
        env,
        fetch: vi.fn(async () => Response.json(data)),
      }),
    ).rejects.toThrow();
  });
  it("never retries an uncertain provider request and discards provider errors", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("private-provider-error");
    });
    await expect(
      createStripeSandboxCheckout(user, requestId, { env, fetch: fetcher }),
    ).rejects.toThrow("provider_unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects caller-supplied price, customer, user or return URL", () => {
    for (const field of ["priceId", "customerEmail", "userId", "successUrl", "planId"])
      expect(stripeSandboxCheckoutInput.safeParse({ requestId, [field]: "injected" }).success).toBe(
        false,
      );
  });
});
describe("signed test webhook receipts", () => {
  it("accepts signed metadata, discards private body values, and records without entitlement change", async () => {
    const record = vi.fn(async (_receipt: unknown) => "recorded" as const);
    const response = await receiveStripeSandboxWebhook(request(), record, { env, now });
    expect(await response.json()).toEqual({
      testMode: true,
      receipt: "recorded",
      entitlementChanged: false,
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      eventId: event.id,
      eventType: event.type,
      objectId: "sub_fixture",
      eventCreated: ts,
    });
    expect(JSON.stringify(record.mock.calls)).not.toMatch(
      /private@example|planted|customer_email|metadata/,
    );
  });
  it.each([
    null,
    "bad",
    `t=${ts},v1=${"0".repeat(64)}`,
    sign(JSON.stringify(event), ts - 301),
    `${sign(JSON.stringify(event))},t=${ts}`,
  ])(
    "rejects missing, bad, stale or ambiguous signatures before persistence",
    async (signature) => {
      const record = vi.fn();
      expect(
        (await receiveStripeSandboxWebhook(request(undefined, signature), record, { env, now }))
          .status,
      ).toBe(401);
      expect(record).not.toHaveBeenCalled();
    },
  );
  it("accepts one valid rotation signature without accepting a modified body", async () => {
    const raw = JSON.stringify(event),
      header = `${sign(raw)},v1=${"0".repeat(64)}`;
    const record = vi.fn(async () => "duplicate" as const);
    expect(
      (await receiveStripeSandboxWebhook(request(raw, header), record, { env, now })).status,
    ).toBe(200);
    expect(
      (await receiveStripeSandboxWebhook(request(raw + " ", header), record, { env, now })).status,
    ).toBe(401);
    expect(record).toHaveBeenCalledTimes(1);
  });
  it("rejects even correctly signed live events", async () => {
    const raw = JSON.stringify({ ...event, livemode: true }),
      record = vi.fn();
    expect((await receiveStripeSandboxWebhook(request(raw), record, { env, now })).status).toBe(
      400,
    );
    expect(record).not.toHaveBeenCalled();
  });
  it("returns retryable failure when receipt persistence is unavailable", async () => {
    expect(
      (
        await receiveStripeSandboxWebhook(
          request(),
          async () => {
            throw new Error("database secret");
          },
          { env, now },
        )
      ).status,
    ).toBe(503);
  });
  it("does not consume body or persist with the feature off or a live key", async () => {
    for (const config of [{}, { ...env, STRIPE_SANDBOX_SECRET_KEY: "sk_live_fixture" }]) {
      const record = vi.fn();
      const req = request();
      expect((await receiveStripeSandboxWebhook(req, record, { env: config, now })).status).toBe(
        503,
      );
      expect(req.bodyUsed).toBe(false);
      expect(record).not.toHaveBeenCalled();
    }
    expect(stripeSandboxConfig({}).webhookReady).toBe(false);
  });
  it("bounds unsigned request bodies", async () => {
    const record = vi.fn();
    expect(
      (
        await receiveStripeSandboxWebhook(
          request("x".repeat(STRIPE_SANDBOX_BODY_LIMIT + 1), null),
          record,
          { env, now },
        )
      ).status,
    ).toBe(413);
    expect(record).not.toHaveBeenCalled();
  });
  it("bounds stalled request streams", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream({ start() {} });
    const req = new Request("https://example.test", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    const record = vi.fn();
    const result = receiveStripeSandboxWebhook(req, record, { env, now });
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await result).status).toBe(413);
    expect(record).not.toHaveBeenCalled();
  });
});
