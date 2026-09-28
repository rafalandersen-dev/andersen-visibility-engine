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
vi.mock("./ai-provider-expense.server", () => ({
  generateBudgetedText: h.generateBudgetedText,
  // The whole-input tasks require a positive `stop`; the spied text function keeps the call counts.
  generateBudgetedTextResult: async (...args: unknown[]) => ({
    text: await h.generateBudgetedText(...args),
    finishReason: "stop",
  }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { evaluateContentQualityFn, improveContentDraftFn } from "./ai.functions";
import { MIN_EVALUABLE_WORDS, QUALITY_CATEGORY_KEYS } from "./quality";
import {
  canonicalQualityMarkdown,
  frozenAssetInput,
  frozenContentLanguage,
  qualityInputEligible,
  runModelComparison,
  type EvaluationDeps,
  type FrozenEvaluationInput,
} from "./ai-evaluation";
import { assembleContentAsset } from "./content-assembler";
import { draftWordCount } from "./quality";
import { contentLangToProjectLanguage } from "./onboarding";
import type { AiEvaluationRun, ContentAsset, Project } from "./types";

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

describe("BG (finding 4126458968): eligibility and the frozen quality payload use the canonical assembled input", () => {
  const hookWords = (n: number) => Array.from({ length: n }, (_, i) => `hook${i}`).join(" ");
  const asset = (bodyWords: number, over: Partial<ContentAsset> = {}): ContentAsset =>
    ({
      id: "a1",
      projectId: "p1",
      title: "T",
      slug: "t",
      markdown: words(bodyWords),
      assetType: "article",
      updatedAt: "2026-09-28T00:00:00.000Z",
      ...over,
    }) as ContentAsset;
  const approvedHook = (n: number) => ({
    id: "h1",
    text: hookWords(n),
    type: "question",
    provenance: "user-edited",
    approval: "approved",
  });
  const prompts = () => h.generateBudgetedText.mock.calls.map((c) => String(c[1]));

  it("a raw body under 40 words with an approved hook is eligible, and the frozen payload is exactly the assembled canonical document (both sides)", async () => {
    const a = asset(20, { hook: approvedHook(25) as ContentAsset["hook"] });
    expect(draftWordCount(a.markdown)).toBe(20);
    const canonical = assembleContentAsset(a, project).markdown;
    expect(draftWordCount(canonical)).toBe(45);
    expect(canonicalQualityMarkdown(a, project)).toBe(canonical);
    expect(qualityInputEligible(a, project)).toBe(true);
    const input = frozenAssetInput("contentQualityScore", a, project);
    expect(input.markdown).toBe(canonical);
    expect(input.markdown).toContain("hook0");
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const result = await runModelComparison(frozen(input.markdown), deps());
    expect(result.kind).toBe("recorded");
    expect(h.claimAiUsage).toHaveBeenCalledTimes(2);
    expect(prompts()).toHaveLength(2);
    for (const p of prompts()) expect(p).toContain(canonical);
  });
  it("a truly canonical-short draft stays ineligible and, if sent anyway, is skipped with no claim, no provider call and no run", async () => {
    const a = asset(20);
    expect(qualityInputEligible(a, project)).toBe(false);
    const input = frozenAssetInput("contentQualityScore", a, project);
    expect(input.markdown).toBe(assembleContentAsset(a, project).markdown);
    const result = await runModelComparison(frozen(input.markdown), deps());
    expect(result.kind).toBe("skipped");
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.generateBudgetedText).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });
  it("the canonical boundary is exactly 40 words: 20 body + 20 hook is eligible, 20 body + 19 hook is not", () => {
    const at = asset(20, { hook: approvedHook(20) as ContentAsset["hook"] });
    expect(draftWordCount(canonicalQualityMarkdown(at, project))).toBe(40);
    expect(qualityInputEligible(at, project)).toBe(true);
    const below = asset(20, { hook: approvedHook(19) as ContentAsset["hook"] });
    expect(draftWordCount(canonicalQualityMarkdown(below, project))).toBe(39);
    expect(qualityInputEligible(below, project)).toBe(false);
  });
  it("both sides receive the identical frozen canonical input even when the source asset changes after freezing", async () => {
    const a = asset(20, { hook: approvedHook(25) as ContentAsset["hook"] });
    const input = frozenAssetInput("contentQualityScore", a, project);
    const before = input.markdown;
    // The source mutates after the freeze (an edit landing mid-attempt): the attempt keeps its frozen input.
    a.markdown = words(70) + " CHANGED";
    (a.hook as { text: string }).text = "CHANGED hook";
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const result = await runModelComparison(frozen(input.markdown), deps());
    expect(result.kind).toBe("recorded");
    expect(input.markdown).toBe(before);
    const ps = prompts();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p).toContain(before);
      expect(p).not.toContain("CHANGED");
    }
    expect(ps[0].replace("candidate-model", "")).toBe(ps[1].replace("candidate-model", ""));
  });
  it("eligibility follows the CURRENT selection: a different asset or a project without the asset's context gives its own answer", () => {
    const hooked = asset(20, { hook: approvedHook(25) as ContentAsset["hook"] });
    const plain = asset(20, { id: "a2" });
    expect(qualityInputEligible(hooked, project)).toBe(true);
    expect(qualityInputEligible(plain, project)).toBe(false);
    // Recomputed from the arguments every time — no cached answer survives a changed asset.
    expect(qualityInputEligible({ ...hooked, hook: undefined }, project)).toBe(false);
  });
  it("other task contracts are unchanged: contentImprove freezes the raw body, not the assembled article", async () => {
    const a = asset(60, { hook: approvedHook(25) as ContentAsset["hook"] });
    const improveInput = frozenAssetInput("contentImprove", a, project);
    expect(improveInput.markdown).toBe(a.markdown);
    expect(improveInput.markdown).not.toContain("hook0");
    const d = deps();
    const result = await runModelComparison(
      frozen(improveInput.markdown, { task: "contentImprove" }),
      d,
    );
    expect(result.kind).toBe("recorded");
    expect(d.improveDraft).toHaveBeenCalledTimes(2);
    for (const call of (d.improveDraft as ReturnType<typeof vi.fn>).mock.calls)
      expect((call[0] as { markdown: string }).markdown).toBe(a.markdown);
  });
});

describe("BI: the quality comparison declares the selected asset's content language (production's rule), frozen for both sides", () => {
  const polishProject = {
    ...project,
    primaryContentLanguage: "pl",
    appLanguage: "pl",
  } as unknown as Project;
  const POLISH = contentLangToProjectLanguage("pl");
  const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
    ({
      id: "a1",
      projectId: "p1",
      title: "T",
      slug: "t",
      markdown: words(60),
      assetType: "article",
      updatedAt: "2026-09-28T00:00:00.000Z",
      ...over,
    }) as ContentAsset;
  const prompts = () => h.generateBudgetedText.mock.calls.map((c) => String(c[1]));
  const attempt = (a: ContentAsset, task: FrozenEvaluationInput["task"] = "contentQualityScore") =>
    frozen(frozenAssetInput(task, a, polishProject).markdown, {
      task,
      project: polishProject,
      contentLanguage: frozenContentLanguage(task, a, polishProject),
      explanationLanguage: contentLangToProjectLanguage("pl"),
    });

  it("a Swedish asset in a Polish-primary project: both model calls declare Swedish content while explanations stay in the app language", async () => {
    const a = asset({ language: "Swedish" as ContentAsset["language"] });
    expect(frozenContentLanguage("contentQualityScore", a, polishProject)).toBe("Swedish");
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    const result = await runModelComparison(attempt(a), deps());
    expect(result.kind).toBe("recorded");
    const ps = prompts();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p).toContain("The draft content is written in Swedish.");
      expect(p).toContain(
        `Write all explanations, suggestions, topIssues, quickWins and summary in ${POLISH}.`,
      );
    }
  });
  it("an asset without a language label falls back to the project's primary content language, exactly like production", async () => {
    const a = asset();
    expect(a.language).toBeUndefined();
    expect(frozenContentLanguage("contentQualityScore", a, polishProject)).toBe(POLISH);
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    await runModelComparison(attempt(a), deps());
    for (const p of prompts()) expect(p).toContain(`The draft content is written in ${POLISH}.`);
  });
  it("supported legacy labels pass through unchanged (English, Danish) and a project without a primary language falls back to English", () => {
    for (const label of ["English", "Danish", "Polish"])
      expect(
        frozenContentLanguage(
          "contentQualityScore",
          asset({ language: label as ContentAsset["language"] }),
          polishProject,
        ),
      ).toBe(label);
    const bare = { ...project, primaryContentLanguage: undefined } as unknown as Project;
    expect(frozenContentLanguage("contentQualityScore", asset(), bare)).toBe(
      contentLangToProjectLanguage("en"),
    );
  });
  it("selection changes use the current asset and project; a frozen attempt keeps its declaration even if the asset's label changes mid-comparison", async () => {
    const sv = asset({ language: "Swedish" as ContentAsset["language"] });
    const da = asset({ id: "a2", language: "Danish" as ContentAsset["language"] });
    expect(frozenContentLanguage("contentQualityScore", sv, polishProject)).toBe("Swedish");
    expect(frozenContentLanguage("contentQualityScore", da, polishProject)).toBe("Danish");
    expect(frozenContentLanguage("contentQualityScore", sv, project)).toBe("Swedish");
    const input = attempt(sv);
    sv.language = "Danish" as ContentAsset["language"]; // an edit landing after the freeze
    h.generateBudgetedText.mockResolvedValue(modelPayload);
    await runModelComparison(input, deps());
    const ps = prompts();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p).toContain("written in Swedish.");
      expect(p).not.toContain("Danish");
    }
  });
  it("tasks without a selected asset keep the project's primary content language (generation, authority)", () => {
    expect(frozenContentLanguage("authorityGeneration", undefined, polishProject)).toBe(POLISH);
    expect(frozenContentLanguage("contentGeneration", undefined, polishProject)).toBe(POLISH);
    expect(frozenContentLanguage("contentQualityScore", undefined, polishProject)).toBe(POLISH);
  });
});

describe("BJ: the improve comparison declares the selected article's language too (production's improveContentDraft rule)", () => {
  const polishProject = {
    ...project,
    primaryContentLanguage: "pl",
    appLanguage: "pl",
  } as unknown as Project;
  const POLISH = contentLangToProjectLanguage("pl");
  const hookWords = (n: number) => Array.from({ length: n }, (_, i) => `hook${i}`).join(" ");
  const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
    ({
      id: "a1",
      projectId: "p1",
      title: "T",
      slug: "t",
      markdown: words(60),
      assetType: "article",
      updatedAt: "2026-09-28T00:00:00.000Z",
      hook: {
        id: "h1",
        text: hookWords(25),
        type: "question",
        provenance: "user-edited",
        approval: "approved",
      },
      ...over,
    }) as ContentAsset;
  // The REAL improve server function, called as the route calls it, through its mocked boundaries.
  const realDeps = () =>
    deps({
      improveDraft: (data) =>
        (improveContentDraftFn as unknown as (a: unknown) => Promise<{ markdown: string }>)({
          data,
          context: { userId: "owner-1" },
        }),
    });
  const attempt = (a: ContentAsset) =>
    frozen(frozenAssetInput("contentImprove", a, polishProject).markdown, {
      task: "contentImprove",
      project: polishProject,
      contentLanguage: frozenContentLanguage("contentImprove", a, polishProject),
      explanationLanguage: contentLangToProjectLanguage("pl"),
    });
  const prompts = () => h.generateBudgetedText.mock.calls.map((c) => String(c[1]));

  it("a Swedish asset in a Polish-primary project: both improve prompts keep Swedish, on the raw body (no assembled sections), one claim per side", async () => {
    const a = asset({ language: "Swedish" as ContentAsset["language"] });
    expect(frozenContentLanguage("contentImprove", a, polishProject)).toBe("Swedish");
    h.generateBudgetedText.mockResolvedValue(JSON.stringify({ markdown: "improved" }));
    const result = await runModelComparison(attempt(a), realDeps());
    expect(result.kind).toBe("recorded");
    expect(runs[0].existingOutputPreview).toBe("improved");
    expect(h.claimAiUsage).toHaveBeenCalledTimes(2);
    const ps = prompts();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p).toContain("Keep the same topic, intent and language (Swedish).");
      expect(p).toContain(a.markdown);
      expect(p).not.toContain("hook0"); // improve rewrites the raw body, not the assembled article
    }
  });
  it("missing and legacy labels match production: no label → the project's Polish; English/Danish pass through", async () => {
    expect(frozenContentLanguage("contentImprove", asset(), polishProject)).toBe(POLISH);
    for (const label of ["English", "Danish"])
      expect(
        frozenContentLanguage(
          "contentImprove",
          asset({ language: label as ContentAsset["language"] }),
          polishProject,
        ),
      ).toBe(label);
    h.generateBudgetedText.mockResolvedValue(JSON.stringify({ markdown: "improved" }));
    await runModelComparison(attempt(asset()), realDeps());
    for (const p of prompts()) expect(p).toContain(`intent and language (${POLISH}).`);
  });
  it("the current selection decides, a frozen attempt cannot change mid-comparison, and quality keeps the same rule", async () => {
    const sv = asset({ language: "Swedish" as ContentAsset["language"] });
    const da = asset({ id: "a2", language: "Danish" as ContentAsset["language"] });
    expect(frozenContentLanguage("contentImprove", da, polishProject)).toBe("Danish");
    expect(frozenContentLanguage("contentQualityScore", sv, polishProject)).toBe("Swedish");
    const input = attempt(sv);
    sv.language = "Danish" as ContentAsset["language"]; // an edit landing after the freeze
    h.generateBudgetedText.mockResolvedValue(JSON.stringify({ markdown: "improved" }));
    await runModelComparison(input, realDeps());
    const ps = prompts();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p).toContain("language (Swedish).");
      expect(p).not.toContain("Danish");
    }
  });
  it("the WHOLE raw body is embedded in the improve prompt (no 12 000-unit prefix): a tail marker after 13 000 units reaches both sides", async () => {
    const long = asset({ markdown: words(60) + " " + "z".repeat(13_000) + " TAIL-MARKER" });
    h.generateBudgetedText.mockResolvedValue(JSON.stringify({ markdown: "improved" }));
    await runModelComparison(attempt(long), realDeps());
    const ps = prompts();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p).toContain(long.markdown);
      expect(p).toContain("TAIL-MARKER");
    }
  });
});
