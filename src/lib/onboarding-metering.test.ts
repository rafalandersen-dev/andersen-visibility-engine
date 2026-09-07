import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanWebsiteCore } from "./ai.functions";
import { UsageLimitError, UsageUnavailableError } from "./ai-usage.server";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), model: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.model }));
vi.mock("./ai-usage.server", async (original) => ({
  ...(await original<typeof import("./ai-usage.server")>()),
  claimAiUsage: mocks.claim,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LOVABLE_API_KEY", "synthetic-test-only");
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
    const result = await scanWebsiteCore("verified-user", "https://example.com");
    expect(result).toMatchObject({
      ok: true,
      title: "Example bakery",
      description: "Local bread",
      services: [],
    });
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("requires the finite server allowance before calling the provider", async () => {
    expect(await scanWebsiteCore("verified-user", "https://example.com")).toMatchObject({
      businessName: "Example bakery",
    });
    expect(mocks.claim).toHaveBeenCalledWith({
      userId: "verified-user",
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
    expect(await scanWebsiteCore("verified-user", "")).toMatchObject({ ok: false });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("retains metadata after malformed provider output without retrying", async () => {
    mocks.model.mockResolvedValue({ text: "not JSON" });
    expect(await scanWebsiteCore("verified-user", "https://example.com")).toMatchObject({
      ok: true,
      description: "Local bread",
      services: [],
    });
    expect(mocks.model).toHaveBeenCalledTimes(1);
  });
});
