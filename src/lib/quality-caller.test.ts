/**
 * Scenario 4 — caller-level controls with mocked transport (no server, no provider, no store).
 *
 * Part A: the assembled-document client caller `evaluateContentQuality` (mock-ai.ts) for an actually
 *         short canonical artifact: zero remote evaluator calls, conservative score persisted once.
 * Part B: the authenticated server function `evaluateContentQualityFn` (ai.functions.ts): this handler's
 *         middleware registration (mocked builder), server-side normalization of an inflated payload, and
 *         the short-draft economy (zero usage claims / zero provider calls under 40 words).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  // Part A
  state: { content: [] as unknown[], projects: [] as unknown[], services: [] as unknown[] },
  upsertContent: vi.fn(),
  saveWorkspaceNow: vi.fn(async () => undefined),
  remoteEvaluate: vi.fn(),
  // Part B
  claimAiUsage: vi.fn(async () => undefined),
  generateBudgetedText: vi.fn(),
  auth: Symbol("requireSupabaseAuth"),
  middlewareOf: new Map<unknown, unknown[]>(),
}));

vi.mock("./store", () => ({
  getState: () => h.state,
  upsertContent: h.upsertContent,
  saveWorkspaceNow: h.saveWorkspaceNow,
}));
vi.mock("./ai.functions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai.functions")>();
  return { ...actual, evaluateContentQualityFn: h.remoteEvaluate };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validate = (v: unknown) => v;
    let middleware: unknown[] = [];
    const builder = {
      middleware: (items: unknown[]) => {
        middleware = items;
        return builder;
      },
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (a: unknown) => unknown) => {
        const wrapped = (a: { data: unknown; context: unknown }) =>
          fn({ ...a, data: validate(a.data) });
        // Remember which middleware THIS handler was built with (identified by the wrapper).
        h.middlewareOf.set(wrapped, middleware);
        return wrapped;
      },
    };
    return builder;
  },
}));
vi.mock("./ai-usage.server", () => ({
  claimAiUsage: h.claimAiUsage,
  UsageLimitError: class extends Error {},
  UsageUnavailableError: class extends Error {},
}));
vi.mock("./ai-provider-expense.server", () => ({ generateBudgetedText: h.generateBudgetedText }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { evaluateContentQuality } from "./mock-ai";
import { MIN_EVALUABLE_WORDS, QUALITY_CATEGORY_KEYS } from "./quality";
// Part B must exercise the REAL server function: the module mock above replaces only the client's import.
const realAi = await vi.importActual<typeof import("./ai.functions")>("./ai.functions");
const evaluateContentQualityFn = realAi.evaluateContentQualityFn;

const project = {
  id: "p1",
  name: "Fixture project",
  businessName: "Fixture business",
  websiteUrl: "https://example.invalid",
  primaryContentLanguage: "en",
  appLanguage: "en",
};
const shortAsset = {
  id: "a-short",
  projectId: "p1",
  title: "Short",
  slug: "short",
  markdown: "# Heading\n\nOnly a **few** words here.",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const longWords = Array.from({ length: MIN_EVALUABLE_WORDS + 20 }, (_, i) => `word${i}`).join(" ");
const longAsset = {
  ...shortAsset,
  id: "a-long",
  slug: "long",
  markdown: `# Heading\n\n${longWords}`,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state = { content: [shortAsset, longAsset], projects: [project], services: [] };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("A — assembled-document caller for an actually short canonical artifact", () => {
  it("makes zero remote evaluator calls and persists a conservative not-ready score exactly once", async () => {
    await evaluateContentQuality("a-short");
    expect(h.remoteEvaluate).not.toHaveBeenCalled();
    expect(h.upsertContent).toHaveBeenCalledTimes(1);
    const saved = h.upsertContent.mock.calls[0][0] as {
      id: string;
      qualityScore: { overall: number; publishingRecommendation: string; status: string };
      qualityScoreStale: boolean;
    };
    expect(saved.id).toBe("a-short");
    expect(saved.qualityScore.publishingRecommendation).toBe("notReady");
    expect(saved.qualityScore.status).toBe("needsWork");
    expect(saved.qualityScore.overall).toBeLessThan(65);
    expect(saved.qualityScoreStale).toBe(false);
    expect(h.saveWorkspaceNow).toHaveBeenCalledTimes(1);
  });
  it("calls the remote evaluator exactly once for a draft at or above the threshold and persists its result", async () => {
    const remote = { overall: 40, status: "needsWork", publishingRecommendation: "notReady" };
    h.remoteEvaluate.mockResolvedValueOnce(remote);
    await evaluateContentQuality("a-long");
    expect(h.remoteEvaluate).toHaveBeenCalledTimes(1);
    const sent = (h.remoteEvaluate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(sent.markdown).toContain("word0");
    expect(Object.keys(sent)).not.toContain("faq");
    expect(h.upsertContent).toHaveBeenCalledTimes(1);
    expect((h.upsertContent.mock.calls[0][0] as { qualityScore: unknown }).qualityScore).toBe(
      remote,
    );
    expect(h.saveWorkspaceNow).toHaveBeenCalledTimes(1);
  });
});

describe("B — authenticated server evaluator (mocked transport; not live authentication proof)", () => {
  const call = (markdown: string) =>
    (evaluateContentQualityFn as unknown as (a: unknown) => Promise<Record<string, unknown>>)({
      data: { project, services: [], title: "T", markdown },
      context: { userId: "owner-1" },
    });

  it("is built with the Supabase auth middleware (this handler's own registration, under the mocked builder)", () => {
    expect(h.middlewareOf.get(evaluateContentQualityFn)).toEqual([h.auth]);
  });
  it("normalizes an inflated evaluator payload server-side: sub-threshold, not ready, categories named", async () => {
    const payload = {
      overall: 97,
      publishingRecommendation: "ready",
      categories: Object.fromEntries(
        QUALITY_CATEGORY_KEYS.map((k) => [
          k,
          { score: 25, explanation: `${k} weak`, suggestions: [`fix ${k}`] },
        ]),
      ),
    };
    h.generateBudgetedText.mockResolvedValueOnce(JSON.stringify(payload));
    const score = await call(longWords);
    expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
    expect(h.generateBudgetedText).toHaveBeenCalledTimes(1);
    expect(score.overall).toBeLessThanOrEqual(25);
    expect(score.status).toBe("needsWork");
    expect(score.publishingRecommendation).toBe("notReady");
    const cats = score.categories as Record<string, { explanation: string; suggestions: string[] }>;
    for (const k of QUALITY_CATEGORY_KEYS) {
      expect(cats[k].explanation).toBe(`${k} weak`);
      expect(cats[k].suggestions).toEqual([`fix ${k}`]);
    }
  });
  it("an unassessed trustSafety from the provider cannot come back as ready/strong through the server path", async () => {
    const categories = Object.fromEntries(
      QUALITY_CATEGORY_KEYS.filter((k) => k !== "trustSafety").map((k) => [
        k,
        { score: 100, explanation: "great" },
      ]),
    );
    h.generateBudgetedText.mockResolvedValueOnce(JSON.stringify({ overall: 100, categories }));
    const score = await call(longWords);
    expect(score.publishingRecommendation).toBe("reviewFirst");
    expect(score.status).toBe("okay");
  });
  it.each([
    ["an empty draft", ""],
    ["formatting only", "# ## **  ** - - > `"],
    ["a four-word draft", "Only a few words."],
    [
      "exactly 39 words",
      Array.from({ length: MIN_EVALUABLE_WORDS - 1 }, (_, i) => `w${i}`).join(" "),
    ],
  ])(
    "%s: zero usage claims, zero provider calls, conservative not-ready score returned",
    async (_label, markdown) => {
      const score = await call(markdown);
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).not.toHaveBeenCalled();
      expect(score.publishingRecommendation).toBe("notReady");
      expect(score.status).toBe("needsWork");
      expect(score.overall).toBeLessThan(65);
      expect(score.model).toBeUndefined();
    },
  );
  it("exactly 40 words: one usage claim then one provider call (the real budget path is preserved)", async () => {
    h.generateBudgetedText.mockResolvedValueOnce(JSON.stringify({ categories: {} }));
    await call(Array.from({ length: MIN_EVALUABLE_WORDS }, (_, i) => `w${i}`).join(" "));
    expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
    expect(h.generateBudgetedText).toHaveBeenCalledTimes(1);
    expect(h.claimAiUsage.mock.invocationCallOrder[0]).toBeLessThan(
      h.generateBudgetedText.mock.invocationCallOrder[0],
    );
  });
});
