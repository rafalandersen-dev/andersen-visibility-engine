import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanWebsiteCore } from "./ai.functions";
import { UsageLimitError, UsageUnavailableError } from "./ai-usage.server";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), model: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("ai", () => ({ generateText: mocks.model }));
vi.mock("./ai-usage.server", async (original) => ({
  ...(await original<typeof import("./ai-usage.server")>()),
  claimAiUsage: mocks.claim,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name) =>
    name === "reserve_ai_expense"
      ? { data: [{ allowed: true, reason: "reserved", period: "2026-09" }], error: null }
      : { data: [{ state: "unknown", overrun: false }], error: null },
  );
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-only");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<title>Example bakery</title><meta name="description" content="Local bread">',
          { headers: { "content-type": "text/html" } },
        ),
      ),
  );
  mocks.claim.mockResolvedValue({ used: 1, cap: 50, allowed: true });
  mocks.model.mockResolvedValue({ text: '{"businessName":"Example bakery","services":[]}' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("onboarding paid extraction", () => {
  it.each([
    new UsageUnavailableError("aiCredits"),
    new UsageLimitError("aiCredits", 50, 50, "Limit reached"),
  ])("keeps manual setup and site metadata when AI cannot be claimed: %s", async (failure) => {
    mocks.claim.mockRejectedValue(failure);
    const result = await scanWebsiteCore(
      "00000000-0000-4000-8000-000000000011",
      "https://example.com",
    );
    expect(result).toMatchObject({
      ok: true,
      title: "Example bakery",
      description: "Local bread",
      services: [],
    });
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("requires the finite server allowance before calling the provider", async () => {
    expect(
      await scanWebsiteCore("00000000-0000-4000-8000-000000000011", "https://example.com"),
    ).toMatchObject({
      businessName: "Example bakery",
    });
    expect(mocks.claim).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000011",
      bucket: "aiCredits",
      enforceLimit: true,
    });
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.model.mock.invocationCallOrder[0],
    );
    expect(mocks.model).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        maxOutputTokens: 3000,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });
  it("does not claim AI when there is no website input", async () => {
    expect(await scanWebsiteCore("00000000-0000-4000-8000-000000000011", "")).toMatchObject({
      ok: false,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("retains metadata after malformed provider output without retrying", async () => {
    mocks.model.mockResolvedValue({ text: "not JSON" });
    expect(
      await scanWebsiteCore("00000000-0000-4000-8000-000000000011", "https://example.com"),
    ).toMatchObject({
      ok: true,
      description: "Local bread",
      services: [],
    });
    expect(mocks.model).toHaveBeenCalledTimes(1);
  });
});
