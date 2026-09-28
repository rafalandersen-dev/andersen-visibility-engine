/**
 * AI Evaluation orchestration (AJ) — real `runModelComparison` wired to the REAL authenticated
 * `evaluateContentQualityFn` (mocked builder/auth/usage/provider boundaries) and an in-memory run store.
 * Proves: a deterministic short-draft outcome is surfaced as a skip with zero usage claims and zero
 * provider calls, the candidate is not invoked, and nothing is recorded or ratable; a ≥40-word draft
 * still runs both sides and records genuine results; a server-returned skip is honored even when the
 * caller believed the input eligible; ordinary errors and an unconfigured candidate keep recording.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  claimAiUsage: vi.fn(async () => undefined),
  generateBudgetedText: vi.fn(),
  auth: Symbol("requireSupabaseAuth"),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (a: unknown) => unknown) => (a: { data: unknown; context: unknown }) =>
        fn({ ...a, data: validate(a.data) }),
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

import { evaluateContentQualityFn } from "./ai.functions";
import { MIN_EVALUABLE_WORDS, QUALITY_CATEGORY_KEYS } from "./quality";
import {
  runModelComparison,
  type EvaluationDeps,
  type FrozenEvaluationInput,
} from "./ai-evaluation";
import type { AiEvaluationRun, Project } from "./types";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const project = {
  id: "p1",
  name: "Fixture",
  businessName: "Fixture",
  websiteUrl: "https://example.invalid",
} as unknown as Project;
const frozen = (
  markdown: string,
  over: Partial<FrozenEvaluationInput> = {},
): FrozenEvaluationInput => ({
  task: "contentQualityScore",
  project,
  services: [],
  asset: {
    title: "T",
    markdown,
    assetType: "article",
    destinationType: "",
    metaTitle: "",
    metaDescription: "",
    quickWins: [],
  },
  livePages: [],
  contentLanguage: "English",
  explanationLanguage: "English",
  existingModel: "existing-model",
  candidateModel: "candidate-model",
  candidateConfigured: true,
  ...over,
});
const modelPayload = JSON.stringify({
  categories: Object.fromEntries(
    QUALITY_CATEGORY_KEYS.map((k) => [k, { score: 70, explanation: `${k} ok` }]),
  ),
});

let runs: AiEvaluationRun[];
let clock: number;
const deps = (over: Partial<EvaluationDeps> = {}): EvaluationDeps => ({
  generateContent: vi.fn(async () => ({ markdown: "generated" })),
  improveDraft: vi.fn(async () => ({ markdown: "improved" })),
  // The REAL server function, called as the route calls it, through its mocked boundaries.
  evaluateQuality: (data) =>
    (evaluateContentQualityFn as unknown as (a: unknown) => Promise<never>)({
      data,
      context: { userId: "owner-1" },
    }),
  generateAuthority: vi.fn(async () => ({ opportunities: [] })),
  addRun: (run) => {
    runs.push(run);
  },
  uid: () => `run-${runs.length + 1}`,
  now: () => (clock += 5),
  needAssetMessage: "Select a content asset first.",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  runs = [];
  clock = 1000;
});

describe("short draft: deterministic skip is never recorded or rated as model work", () => {
  it.each([
    ["empty", ""],
    ["formatting only", "# ## ** ** - -"],
    ["39 words", words(MIN_EVALUABLE_WORDS - 1)],
  ])(
    "%s with a configured candidate: skip, zero claims, zero provider calls, candidate never invoked, nothing recorded",
    async (_l, markdown) => {
      const result = await runModelComparison(frozen(markdown), deps());
      expect(result.kind).toBe("skipped");
      expect(result.kind === "skipped" && result.reason).toBe("tooShort");
      expect(result.existing.status).toBe("skipped");
      expect("latencyMs" in result.existing).toBe(false); // no model latency for a skip
      expect(result.kind === "skipped" && result.side).toBe("existing");
      expect(result.candidate).toEqual({ status: "notRun", cause: "existingSkipped" });
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).not.toHaveBeenCalled();
      expect(runs).toEqual([]);
    },
  );
  it("39 words with the candidate NOT configured: still a skip, nothing recorded", async () => {
    const result = await runModelComparison(
      frozen(words(MIN_EVALUABLE_WORDS - 1), { candidateConfigured: false, candidateModel: null }),
      deps(),
    );
    expect(result.kind).toBe("skipped");
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.generateBudgetedText).not.toHaveBeenCalled();
    expect(runs).toEqual([]);
  });
  it("a previous genuine run followed by a skip leaves only the previous run and yields no run id to link", async () => {
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const first = await runModelComparison(frozen(words(60)), deps());
    expect(first.kind).toBe("recorded");
    expect(runs.map((r) => r.id)).toEqual(["run-1"]);
    h.generateBudgetedText.mockClear();
    h.claimAiUsage.mockClear();
    const second = await runModelComparison(frozen(words(3)), deps());
    expect(second.kind).toBe("skipped");
    expect("run" in second).toBe(false);
    expect(runs.map((r) => r.id)).toEqual(["run-1"]); // nothing appended, nothing modified
    expect(runs[0].ratings).toBeUndefined();
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.generateBudgetedText).not.toHaveBeenCalled();
  });
  it("a server-returned skip is honored independently of any precheck (60-word draft, evaluator reports skipped)", async () => {
    const evaluateQuality = vi.fn(async () => ({
      outcome: "skipped" as const,
      reason: "tooShort" as const,
      score: {} as never,
    }));
    const result = await runModelComparison(frozen(words(60)), deps({ evaluateQuality }));
    expect(result.kind).toBe("skipped");
    expect(evaluateQuality).toHaveBeenCalledTimes(1); // existing side only; candidate never invoked
    expect(runs).toEqual([]);
  });
  it("an unexpectedly skipped candidate (existing succeeded) also records nothing", async () => {
    const evaluateQuality = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: "model",
        score: { overall: 70, status: "okay", publishingRecommendation: "reviewFirst" },
      })
      .mockResolvedValueOnce({ outcome: "skipped", reason: "tooShort", score: {} });
    const result = await runModelComparison(frozen(words(60)), deps({ evaluateQuality }));
    expect(result.kind).toBe("skipped");
    expect(result.kind === "skipped" && result.side).toBe("candidate");
    expect(result.existing.status).toBe("success"); // the existing model really ran …
    expect(result.candidate).toEqual({ status: "skipped", reason: "tooShort" }); // … the candidate did not
    expect(runs).toEqual([]);
  });
});

describe("genuine comparisons still run and record", () => {
  it("exactly 40 words: existing and candidate each claim usage and call the provider once; run recorded with previews and latencies", async () => {
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const result = await runModelComparison(frozen(words(MIN_EVALUABLE_WORDS)), deps());
    expect(result.kind).toBe("recorded");
    expect(h.claimAiUsage).toHaveBeenCalledTimes(2);
    expect(h.generateBudgetedText).toHaveBeenCalledTimes(2);
    expect(h.generateBudgetedText.mock.calls[1][3]).toBe("candidate-model"); // candidate override reached the provider boundary
    expect(runs).toHaveLength(1);
    const run = runs[0];
    expect(run).toMatchObject({
      taskType: "contentQualityScore",
      existingModel: "existing-model",
      candidateModel: "candidate-model",
      existingStatus: "success",
      candidateStatus: "success",
    });
    expect(run.existingOutputPreview).toMatch(/^Milo Score \d+\/100/);
    expect(run.candidateOutputPreview).toMatch(/^Milo Score \d+\/100/);
    expect(run.existingLatencyMs).toBeGreaterThan(0);
    expect(run.candidateLatencyMs).toBeGreaterThan(0);
  });
  it("candidate not configured: existing runs once, run recorded with notConfigured candidate and no candidate latency", async () => {
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const result = await runModelComparison(
      frozen(words(60), { candidateConfigured: false, candidateModel: null }),
      deps(),
    );
    expect(result.kind).toBe("recorded");
    expect(h.generateBudgetedText).toHaveBeenCalledTimes(1);
    expect(runs[0].candidateStatus).toBe("notConfigured");
    expect(runs[0].candidateLatencyMs).toBeUndefined();
    expect(runs[0].candidateModel).toBeUndefined();
  });
  it("an ordinary provider error is recorded as an error side, not as a skip", async () => {
    h.generateBudgetedText
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce(modelPayload);
    const result = await runModelComparison(frozen(words(60)), deps());
    expect(result.kind).toBe("recorded");
    expect(result.existing.status).toBe("error");
    expect(runs[0].existingStatus).toBe("error");
    expect(runs[0].existingError).toBeTruthy();
    expect(runs[0].candidateStatus).toBe("success");
  });
  it("both sides receive the same frozen draft", async () => {
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const draft = words(50);
    await runModelComparison(frozen(draft), deps());
    for (const call of h.generateBudgetedText.mock.calls) expect(String(call[1])).toContain(draft);
  });
  it("other tasks are unaffected: improve-draft records a comparison from the frozen asset", async () => {
    const d = deps();
    const result = await runModelComparison(frozen(words(60), { task: "contentImprove" }), d);
    expect(result.kind).toBe("recorded");
    expect(d.improveDraft).toHaveBeenCalledTimes(2);
    expect(runs[0].existingOutputPreview).toBe("improved");
  });
});
