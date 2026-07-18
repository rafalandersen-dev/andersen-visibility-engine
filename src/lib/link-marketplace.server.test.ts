import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  rev: 1,
}));

vi.mock("./workspace.server", () => ({
  readWorkspaceRow: vi.fn(async (userId: string) =>
    userId ? { data: structuredClone(h.data), rev: h.rev } : null,
  ),
  mutateWorkspace: vi.fn(
    async (
      _userId: string,
      mutate: (data: Record<string, unknown>) => {
        data: Record<string, unknown>;
        result: unknown;
      },
    ) => {
      const next = mutate(structuredClone(h.data));
      h.data = next.data;
      h.rev += 1;
      return { result: next.result, rev: h.rev };
    },
  ),
}));

import {
  confirmMarketplaceOrder,
  createMarketplaceQuote,
  getMarketplaceIntegrationStatus,
  linkhouseMarketplaceProvider,
  syncMarketplaceProviderOrder,
} from "./link-marketplace.server";
import { DEMO_MARKETPLACE_OFFERS, MARKETPLACE_QUOTE_TTL_MS } from "./link-marketplace";
import type { LinkMarketplaceOrder, Project } from "./types";

const project = {
  id: "project-1",
  name: "Client",
  websiteUrl: "https://client.example",
  businessName: "Client",
  businessType: "ecommerce",
  primaryLanguage: "English",
  additionalLanguages: [],
  mainLocation: "Stockholm",
  targetLocations: [],
  description: "",
  targetAudience: "",
  toneOfVoice: "",
  uniqueSellingPoints: "",
  brandNotes: "",
} as Project;

function resetWorkspace() {
  h.data = { projects: [project], linkMarketplaceOrders: [], unknownFutureKey: { keep: true } };
  h.rev = 1;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetWorkspace();
});

resetWorkspace();

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
      projectId: project.id,
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
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
      projectId: project.id,
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
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
    ).resolves.toMatchObject({
      submitted: false,
      rev: 2,
      order: {
        projectId: project.id,
        status: "Requested",
        targetUrl: "https://client.example/",
        linkAttributes: "sponsored",
      },
    });
    expect(h.data.linkMarketplaceOrders as LinkMarketplaceOrder[]).toHaveLength(1);
    expect(h.data.unknownFutureKey).toEqual({ keep: true });
  });

  it("persists a demo request once when the same signed quote is confirmed twice", async () => {
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      projectId: project.id,
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
      now: new Date("2026-07-15T12:00:00.000Z"),
    });
    const confirmation = {
      userId: "user-1",
      confirmationToken: quote.confirmationToken,
      confirmedTotalPrice: quote.totalPrice,
      acknowledgedSponsored: true,
      acknowledgedPayment: true,
      now: Date.parse("2026-07-15T12:05:00.000Z"),
    };
    const first = await confirmMarketplaceOrder(confirmation);
    const second = await confirmMarketplaceOrder(confirmation);
    expect(second.order.id).toBe(first.order.id);
    expect(h.data.linkMarketplaceOrders as LinkMarketplaceOrder[]).toHaveLength(1);
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
      projectId: project.id,
      offerId: "linkhouse-offer-1",
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
      submitted: true,
      order: {
        status: "Submitted",
        providerOrderId: "provider-order-1",
        providerStatus: "created",
      },
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
    const stored = (h.data.linkMarketplaceOrders as LinkMarketplaceOrder[])[0];
    expect(stored.status).toBe("Submitted");
    expect(stored.events?.map((event) => event.status)).toEqual(["In Review", "Submitted"]);
  });

  it("allows a live quote but creates no reservation while ordering is locked", async () => {
    vi.stubEnv("LINKHOUSE_API_BASE_URL", "https://api.example.test");
    vi.stubEnv("LINKHOUSE_API_KEY", "test-key");
    vi.stubEnv("LINKHOUSE_ACCOUNT_ID", "account-1");
    vi.stubEnv("LINKHOUSE_API_MAPPING_VERIFIED", "true");
    vi.stubEnv("LINK_MARKETPLACE_SIGNING_SECRET", "test-signing-secret");
    vi.stubEnv("LINK_MARKETPLACE_MARGIN_PERCENT", "10");
    vi.spyOn(linkhouseMarketplaceProvider, "createQuote").mockResolvedValue({
      providerQuoteId: "provider-quote-locked",
      offerId: "linkhouse-offer-locked",
      domain: "publisher.example",
      publicationTitle: "Publisher feature",
      basePrice: 200,
      currency: "EUR",
    });
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      projectId: project.id,
      offerId: "linkhouse-offer-locked",
    });
    await expect(
      confirmMarketplaceOrder({
        userId: "user-1",
        confirmationToken: quote.confirmationToken,
        confirmedTotalPrice: quote.totalPrice,
        acknowledgedSponsored: true,
        acknowledgedPayment: true,
      }),
    ).rejects.toThrow("marketplace_ordering_disabled");
    expect(h.data.linkMarketplaceOrders).toEqual([]);
  });

  it("keeps an auditable In Review reservation when provider submission is uncertain", async () => {
    vi.stubEnv("LINKHOUSE_API_BASE_URL", "https://api.example.test");
    vi.stubEnv("LINKHOUSE_API_KEY", "test-key");
    vi.stubEnv("LINKHOUSE_ACCOUNT_ID", "account-1");
    vi.stubEnv("LINKHOUSE_API_MAPPING_VERIFIED", "true");
    vi.stubEnv("LINK_MARKETPLACE_SIGNING_SECRET", "test-signing-secret");
    vi.stubEnv("LINK_MARKETPLACE_MARGIN_PERCENT", "10");
    vi.stubEnv("LINKHOUSE_ORDERING_ENABLED", "true");
    vi.spyOn(linkhouseMarketplaceProvider, "createQuote").mockResolvedValue({
      providerQuoteId: "provider-quote-timeout",
      offerId: "linkhouse-offer-timeout",
      domain: "publisher.example",
      publicationTitle: "Publisher feature",
      basePrice: 200,
      currency: "EUR",
    });
    vi.spyOn(linkhouseMarketplaceProvider, "createOrder").mockRejectedValue(
      new Error("marketplace_provider_timeout"),
    );
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      projectId: project.id,
      offerId: "linkhouse-offer-timeout",
    });
    await expect(
      confirmMarketplaceOrder({
        userId: "user-1",
        confirmationToken: quote.confirmationToken,
        confirmedTotalPrice: quote.totalPrice,
        acknowledgedSponsored: true,
        acknowledgedPayment: true,
      }),
    ).rejects.toThrow("marketplace_provider_timeout");
    const stored = (h.data.linkMarketplaceOrders as LinkMarketplaceOrder[])[0];
    expect(stored.status).toBe("In Review");
    expect(stored.events?.at(-1)?.note).toContain("outcome is unknown");
  });

  it("rejects another user, a changed total and an expired quote", async () => {
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      projectId: project.id,
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
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

  it("derives the target URL from the owned project and rejects duplicate active orders", async () => {
    const quote = await createMarketplaceQuote({
      userId: "user-1",
      projectId: project.id,
      offerId: DEMO_MARKETPLACE_OFFERS[0].id,
    });
    await confirmMarketplaceOrder({
      userId: "user-1",
      confirmationToken: quote.confirmationToken,
      confirmedTotalPrice: quote.totalPrice,
      acknowledgedSponsored: true,
      acknowledgedPayment: true,
    });
    await expect(
      createMarketplaceQuote({
        userId: "user-1",
        projectId: project.id,
        offerId: DEMO_MARKETPLACE_OFFERS[0].id,
      }),
    ).rejects.toThrow("marketplace_order_exists");
    await expect(
      createMarketplaceQuote({
        userId: "user-1",
        projectId: "another-project",
        offerId: DEMO_MARKETPLACE_OFFERS[1].id,
      }),
    ).rejects.toThrow("marketplace_project_not_found");
  });

  it("syncs only a Linkhouse order resolved from the authenticated workspace", async () => {
    vi.stubEnv("LINKHOUSE_API_BASE_URL", "https://api.example.test");
    vi.stubEnv("LINKHOUSE_API_KEY", "test-key");
    vi.stubEnv("LINKHOUSE_ACCOUNT_ID", "account-1");
    vi.stubEnv("LINKHOUSE_API_MAPPING_VERIFIED", "true");
    h.data.linkMarketplaceOrders = [
      {
        id: "milo-order-1",
        projectId: project.id,
        offerId: "linkhouse-offer-1",
        provider: "linkhouse",
        domain: "publisher.example",
        publicationTitle: "Feature",
        targetUrl: project.websiteUrl,
        suggestedTopic: "Feature",
        price: 220,
        currency: "EUR",
        status: "Submitted",
        linkAttributes: "sponsored",
        providerOrderId: "provider-order-1",
        events: [],
        createdAt: "2026-07-15T12:00:00.000Z",
        updatedAt: "2026-07-15T12:00:00.000Z",
      } satisfies LinkMarketplaceOrder,
    ];
    const getOrder = vi.spyOn(linkhouseMarketplaceProvider, "getOrder").mockResolvedValue({
      providerStatus: "accepted",
    });
    await expect(syncMarketplaceProviderOrder("user-1", "unknown-order")).rejects.toThrow(
      "marketplace_order_not_found",
    );
    const synced = await syncMarketplaceProviderOrder("user-1", "milo-order-1");
    expect(getOrder).toHaveBeenCalledWith({ providerOrderId: "provider-order-1" });
    expect(synced.order.providerStatus).toBe("accepted");
    expect(synced.order.lastSyncedAt).toBeTruthy();
  });
});
