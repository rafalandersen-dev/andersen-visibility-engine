import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateContentCore } from "./ai.functions";
import { AiExpenseUnavailableError } from "./ai-expense.server";
import type { Project, Opportunity } from "./types";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), model: vi.fn(), rpc: vi.fn() }));
vi.mock("./project-knowledge.server", () => ({
  loadProjectKnowledgeContext: async () => ({
    context: "",
    references: [],
    conflicts: [],
    omitted: 0,
  }),
}));
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
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
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
  it.each(["budget_unconfigured", "budget_exhausted", "budget_paused", "duplicate_request"])(
    "preserves the internal %s pause for scheduler callers",
    async (reason) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.rpc.mockResolvedValue({
        data: [{ allowed: false, reason, period: "2026-09" }],
        error: null,
      });
      await expect(
        generateContentCore("00000000-0000-4000-8000-000000000011", args),
      ).rejects.toBeInstanceOf(AiExpenseUnavailableError);
      expect(mocks.model).not.toHaveBeenCalled();
    },
  );
  it("explains missing OpenAI configuration without trying the legacy gateway", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("LOVABLE_API_KEY", "synthetic-legacy-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(generateContentCore("00000000-0000-4000-8000-000000000011", args)).rejects.toThrow(
      "AI generation is not configured",
    );
    expect(mocks.model).not.toHaveBeenCalled();
  });
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
      await expect(
        generateContentCore("00000000-0000-4000-8000-000000000011", args),
      ).rejects.not.toThrow(privateText);
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
      generateContentCore("00000000-0000-4000-8000-000000000011", {
        ...args,
        project: { ...args.project, description },
      }),
    ).rejects.toThrow("too much source text");
    expect(mocks.model).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-source");
    expect(log).toHaveBeenCalledWith("[ai.functions] gateway/validation error", {
      httpStatus: null,
      boundary: "input_too_large",
    });
  });
});
