import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateContentCore } from "./ai.functions";
import type { Project, Opportunity } from "./types";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), model: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.model }));
vi.mock("./ai-usage.server", async (original) => ({
  ...(await original<typeof import("./ai-usage.server")>()),
  claimAiUsage: mocks.claim,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LOVABLE_API_KEY", "synthetic-test-key");
  mocks.claim.mockResolvedValue({ allowed: true, used: 1, cap: 50 });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const args = {
  project: {
    id: "p",
    name: "Example",
    businessName: "Example",
    websiteUrl: "https://example.com",
    primaryLanguage: "English",
  } as Project,
  opportunity: { id: "o", title: "Example article", language: "English" } as Opportunity,
  services: [],
  assetType: "article" as const,
};
describe("text error privacy in existing article generation", () => {
  it.each([402, 429, 502])(
    "keeps HTTP %s useful without logging private provider content",
    async (statusCode) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const privateText = "private-source-text-and-auth-link";
      mocks.model.mockRejectedValue(
        Object.assign(new Error(privateText), {
          statusCode,
          cause: new Error(privateText),
          text: privateText,
        }),
      );
      await expect(generateContentCore("owner", args)).rejects.not.toThrow(privateText);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
      expect(log).toHaveBeenCalledWith("[ai.functions] gateway/validation error", {
        httpStatus: statusCode,
        boundary: null,
      });
      expect(mocks.model).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects excessive article context without contacting a model or logging the source", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const description = "private-source".repeat(6000);
    await expect(
      generateContentCore("owner", { ...args, project: { ...args.project, description } }),
    ).rejects.toThrow("too much source text");
    expect(mocks.model).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-source");
    expect(log).toHaveBeenCalledWith("[ai.functions] gateway/validation error", {
      httpStatus: null,
      boundary: "input_too_large",
    });
  });
});
