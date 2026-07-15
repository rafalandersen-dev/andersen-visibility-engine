import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmMarketplaceOrder,
  createMarketplaceQuote,
  getMarketplaceIntegrationStatus,
  linkhouseMarketplaceProvider,
} from "./link-marketplace.server";
import { DEMO_MARKETPLACE_OFFERS, MARKETPLACE_QUOTE_TTL_MS } from "./link-marketplace";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("link marketplace server safety", () => {
  it("keeps ordering locked until credentials, verified mapping, signing and kill switch are all ready", () => {
    vi.stubEnv("LINKHOUSE_API_BASE_URL", "https://api.example.test");
    vi.stubEnv("LINKHOUSE_API_KEY", "test-key");
    vi.stubEnv("LINKHOUSE_ACCOUNT_ID", "account-1");
    vi.stubEnv("LINKHOUSE_API_MAPPING_VERIFIED", "true");
    expect(getMarketplaceIntegrationStatus()).toMatchObject({
      credentialsPresent: true,
      catalogConnected: true,
      signingReady: false,
      marginConfigured: false,
      orderingEnabled: false,
    });
    vi.stubEnv("LINK_MARKETPLACE_SIGNING_SECRET", "test-signing-secret");
    vi.stubEnv("LINK_MARKETPLACE_MARGIN_PERCENT", "20");
    vi.stubEnv("LINKHOUSE_ORDERING_ENABLED", "true");
    expect(getMarketplaceIntegrationStatus().orderingEnabled).toBe(true);
  });

  it("issues a signed, user-bound demo quote with a 15 minute TTL", async () => {
    vi.stubEnv("LINK_MARKETPLACE_MARGIN_PERCENT", "25");
    const now = new Date("2026-07-15T12:00:00.000Z");
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
      targetUrl: "https://client.example/page",
      now,
    });
    expect(quote.live).toBe(false);
    expect(quote.basePrice).toBe(390);
    expect(quote.serviceFee).toBe(97.5);
    expect(quote.totalPrice).toBe(487.5);
    expect(Date.parse(quote.expiresAt) - now.getTime()).toBe(MARKETPLACE_QUOTE_TTL_MS);
    expect(quote.confirmationToken.split(".")).toHaveLength(2);
  });

  it("accepts the exact confirmed demo total without creating a provider order", async () => {
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
      targetUrl: "https://client.example",
      now: new Date("2026-07-15T12:00:00.000Z"),
    });
    await expect(
      confirmMarketplaceOrder({
        userId: "user-1",
        confirmationToken: quote.confirmationToken,
        confirmedTotalPrice: quote.totalPrice,
        acknowledgedSponsored: true,
        acknowledgedPayment: true,
        now: Date.parse("2026-07-15T12:05:00.000Z"),
      }),
    ).resolves.toEqual({ status: "Requested", submitted: false });
  });

  it("wraps a provider quote in Milo's user-bound signature and submits with quote idempotency", async () => {
    vi.stubEnv("LINKHOUSE_API_BASE_URL", "https://api.example.test");
    vi.stubEnv("LINKHOUSE_API_KEY", "test-key");
    vi.stubEnv("LINKHOUSE_ACCOUNT_ID", "account-1");
    vi.stubEnv("LINKHOUSE_API_MAPPING_VERIFIED", "true");
    vi.stubEnv("LINK_MARKETPLACE_SIGNING_SECRET", "test-signing-secret");
    vi.stubEnv("LINK_MARKETPLACE_MARGIN_PERCENT", "10");
    vi.stubEnv("LINKHOUSE_ORDERING_ENABLED", "true");
    vi.spyOn(linkhouseMarketplaceProvider, "createQuote").mockResolvedValue({
      providerQuoteId: "provider-quote-1",
      offerId: "linkhouse-offer-1",
      domain: "publisher.example",
      publicationTitle: "Publisher feature",
      basePrice: 200,
      currency: "EUR",
      expiresAt: "2026-07-15T12:05:00.000Z",
    });
    const createOrder = vi.spyOn(linkhouseMarketplaceProvider, "createOrder").mockResolvedValue({
      providerOrderId: "provider-order-1",
      providerStatus: "created",
    });
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      offerId: "linkhouse-offer-1",
      targetUrl: "https://client.example",
      now: new Date("2026-07-15T12:00:00.000Z"),
    });
    expect(quote).toMatchObject({ live: true, basePrice: 200, serviceFee: 20, totalPrice: 220 });
    expect(quote.expiresAt).toBe("2026-07-15T12:05:00.000Z");

    await expect(
      confirmMarketplaceOrder({
        userId: "user-1",
        confirmationToken: quote.confirmationToken,
        confirmedTotalPrice: 220,
        acknowledgedSponsored: true,
        acknowledgedPayment: true,
        now: Date.parse("2026-07-15T12:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      status: "Submitted",
      submitted: true,
      providerOrderId: "provider-order-1",
    });
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        providerQuoteId: "provider-quote-1",
        offerId: "linkhouse-offer-1",
        targetUrl: "https://client.example/",
        confirmedProviderPrice: 200,
        idempotencyKey: quote.id,
      }),
    );
  });

  it("rejects another user, a changed total and an expired quote", async () => {
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
      targetUrl: "https://client.example",
      now: new Date("2026-07-15T12:00:00.000Z"),
    });
    const base = {
      confirmationToken: quote.confirmationToken,
      acknowledgedSponsored: true,
      acknowledgedPayment: true,
    };
    const validNow = Date.parse("2026-07-15T12:05:00.000Z");
    await expect(
      confirmMarketplaceOrder({
        ...base,
        userId: "user-2",
        confirmedTotalPrice: quote.totalPrice,
        now: validNow,
      }),
    ).rejects.toThrow("marketplace_quote_invalid");
    await expect(
      confirmMarketplaceOrder({
        ...base,
        userId: "user-1",
        confirmedTotalPrice: quote.totalPrice + 0.01,
        now: validNow,
      }),
    ).rejects.toThrow("marketplace_total_mismatch");
    await expect(
      confirmMarketplaceOrder({
        ...base,
        userId: "user-1",
        confirmedTotalPrice: quote.totalPrice,
        now: Date.parse("2026-07-15T12:16:00.000Z"),
      }),
    ).rejects.toThrow("marketplace_quote_expired");
  });
});
