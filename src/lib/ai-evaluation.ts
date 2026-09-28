/**
 * AI Evaluation — model-comparison orchestration used by the owner route `app.ai-evaluation.tsx`.
 *
 * Runs the existing model and (when configured) the candidate model on ONE frozen input and records
 * the comparison. A deterministic outcome from the quality boundary (`outcome: "skipped"`, e.g. the
 * fixed too-short score returned without any model call) is not model work: it is surfaced as a
 * skipped attempt, the candidate is not invoked, and nothing (run, latency, preview, ratings) is
 * recorded. This is decided from the server's explicit provenance signal, never from the numeric
 * score, its copy or missing metadata, so it holds even when a UI precheck judged the input eligible.
 */
import type {
  AiEvaluationRun,
  AiTaskType,
  ContentAsset,
  Opportunity,
  Project,
  ServiceItem,
} from "./types";
import { MIN_EVALUABLE_WORDS, hasMinimumWords, type QualityEvaluationResult } from "./quality";
import { assembleContentAsset } from "./content-assembler";
import { contentLangToProjectLanguage } from "./onboarding";

export type SkipReason = Extract<QualityEvaluationResult, { outcome: "skipped" }>["reason"];

export type SideResult =
  | { status: "success"; output: string; latencyMs: number }
  | { status: "error"; error: string; latencyMs: number }
  | { status: "notConfigured" }
  /** A deterministic outcome from the boundary: no model ran, so no model latency is reported. */
  | { status: "skipped"; reason: SkipReason }
  /** Terminal: this side was never invoked because the other side was skipped. */
  | { status: "notRun"; cause: "existingSkipped" };

/** Inputs frozen once per attempt; both sides receive exactly the same values. */
export interface FrozenEvaluationInput {
  task: AiTaskType;
  project: Project;
  services: ServiceItem[];
  opportunity?: Opportunity;
  asset?: {
    title: string;
    markdown: string;
    assetType: string;
    destinationType: string;
    metaTitle: string;
    metaDescription: string;
    quickWins: string[];
  };
  livePages: string[];
  contentLanguage: string;
  explanationLanguage: string;
  existingModel: string;
  candidateModel: string | null;
  candidateConfigured: boolean;
}

/**
 * The canonical quality input production scores (`evaluateContentQuality` in mock-ai.ts): the ASSEMBLED
 * document of this asset in this project — body plus the composed hook, TL;DR, key takeaways, sources, author,
 * breadcrumb and image sections — never the raw body alone. Eligibility and the frozen contentQualityScore
 * payload both derive from it, from the CURRENT asset and the CURRENTLY selected project, so a raw body under
 * 40 words with an approved hook is eligible exactly when production would score it, and both comparison
 * sides receive the very artifact production evaluates. Nothing is truncated to pass eligibility.
 */
export function canonicalQualityMarkdown(asset: ContentAsset, project: Project): string {
  return assembleContentAsset(asset, project).markdown;
}
/** True when the canonical document reaches the evaluator's threshold (early-exit scan, no count needed). */
export function qualityInputEligible(asset: ContentAsset, project: Project): boolean {
  return hasMinimumWords(canonicalQualityMarkdown(asset, project), MIN_EVALUABLE_WORDS);
}
/**
 * The frozen asset input of one attempt. contentQualityScore compares the canonical document production
 * scores; contentImprove keeps the raw body (its contract improves the body itself, not the assembled
 * article), so other task contracts are unchanged.
 */
export function frozenAssetInput(
  task: AiTaskType,
  asset: ContentAsset,
  project: Project,
): NonNullable<FrozenEvaluationInput["asset"]> {
  return {
    title: asset.title,
    markdown:
      task === "contentQualityScore"
        ? canonicalQualityMarkdown(asset, project)
        : asset.markdown || "",
    assetType: asset.assetType ?? "article",
    destinationType: asset.publishDestinationType ?? "",
    metaTitle: asset.metaTitle ?? "",
    metaDescription: asset.metaDescription ?? "",
    quickWins: asset.qualityScore?.quickWins ?? [],
  };
}

/**
 * The content language production's quality caller declares for an asset (`evaluateContentQuality` in
 * mock-ai.ts: `languageLabel(a.language, contentLangToProjectLanguage(project.primaryContentLanguage ?? "en"))`):
 * the asset's own language label when it has one, else the project's primary content language. Frozen once per
 * attempt from the CURRENT asset and project, so both model sides receive the same declaration. Other tasks keep
 * the comparison's existing project-language contract (contentImprove is not changed here).
 */
export function frozenContentLanguage(
  task: AiTaskType,
  asset: ContentAsset | undefined,
  project: Project,
): string {
  const projectLanguage = contentLangToProjectLanguage(project.primaryContentLanguage ?? "en");
  return task === "contentQualityScore" && asset
    ? (asset.language ?? projectLanguage)
    : projectLanguage;
}

export interface EvaluationDeps {
  generateContent: (data: Record<string, unknown>) => Promise<{ markdown: string }>;
  improveDraft: (data: Record<string, unknown>) => Promise<{ markdown: string }>;
  evaluateQuality: (data: Record<string, unknown>) => Promise<QualityEvaluationResult>;
  generateAuthority: (
    data: Record<string, unknown>,
  ) => Promise<{ opportunities: { type: string; title: string }[] }>;
  addRun: (run: AiEvaluationRun) => void;
  uid: () => string;
  now: () => number;
  needAssetMessage: string;
}

export type ComparisonResult =
  | { kind: "recorded"; run: AiEvaluationRun; existing: SideResult; candidate: SideResult }
  /** Nothing recorded. `side` names the skipped side; both sides carry their terminal state for display. */
  | {
      kind: "skipped";
      side: "existing" | "candidate";
      reason: SkipReason;
      existing: SideResult;
      candidate: SideResult;
    };

function preview(s: string, max = 2000): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

type TaskOutcome = { kind: "output"; output: string } | { kind: "skipped"; reason: SkipReason };

async function callTask(
  input: FrozenEvaluationInput,
  deps: EvaluationDeps,
  modelOverride?: string,
): Promise<TaskOutcome> {
  const { project, services } = input;
  if (input.task === "contentGeneration") {
    const res = await deps.generateContent({
      project,
      services,
      opportunity: input.opportunity,
      assetType: "article",
      modelOverride,
    });
    return { kind: "output", output: res.markdown };
  }
  if (input.task === "contentImprove") {
    const a = input.asset;
    if (!a) throw new Error(deps.needAssetMessage);
    const res = await deps.improveDraft({
      project,
      services,
      title: a.title,
      markdown: a.markdown,
      assetType: a.assetType,
      contentLanguage: input.contentLanguage,
      suggestions: a.quickWins,
      modelOverride,
    });
    return { kind: "output", output: res.markdown };
  }
  if (input.task === "contentQualityScore") {
    const a = input.asset;
    if (!a) throw new Error(deps.needAssetMessage);
    const res = await deps.evaluateQuality({
      project,
      services,
      title: a.title,
      markdown: a.markdown,
      assetType: a.assetType,
      destinationType: a.destinationType,
      metaTitle: a.metaTitle,
      metaDescription: a.metaDescription,
      contentLanguage: input.contentLanguage,
      explanationLanguage: input.explanationLanguage,
      modelOverride,
    });
    // The explicit server provenance signal decides; the score body is never inspected for this.
    if (res.outcome === "skipped") return { kind: "skipped", reason: res.reason };
    const s = res.score;
    return {
      kind: "output",
      output: `Milo Score ${s.overall}/100 · ${s.status} · ${s.publishingRecommendation}\n\n${JSON.stringify(s, null, 2)}`,
    };
  }
  const res = await deps.generateAuthority({
    project,
    services,
    existingTitles: [],
    livePages: input.livePages,
    explanationLanguage: input.explanationLanguage,
    modelOverride,
  });
  return {
    kind: "output",
    output:
      res.opportunities.map((o) => `• [${o.type}] ${o.title}`).join("\n") +
      `\n\n${JSON.stringify(res.opportunities, null, 2)}`,
  };
}

async function runOne(
  input: FrozenEvaluationInput,
  deps: EvaluationDeps,
  modelOverride?: string,
): Promise<SideResult> {
  const start = deps.now();
  try {
    const outcome = await callTask(input, deps, modelOverride);
    const latencyMs = deps.now() - start;
    // A skip is not model work: report no latency for it.
    if (outcome.kind === "skipped") return { status: "skipped", reason: outcome.reason };
    return { status: "success", output: outcome.output, latencyMs };
  } catch (e) {
    return {
      status: "error",
      error: e instanceof Error ? e.message : "Failed",
      latencyMs: deps.now() - start,
    };
  }
}

/**
 * Run the comparison on one frozen input. A skipped existing side ends the attempt before the
 * candidate is invoked; a skipped candidate (unexpected, same frozen draft) also ends it. Neither
 * records a run, so no rating can attach to nonexistent model work.
 */
export async function runModelComparison(
  input: FrozenEvaluationInput,
  deps: EvaluationDeps,
): Promise<ComparisonResult> {
  const existing = await runOne(input, deps);
  if (existing.status === "skipped")
    return {
      kind: "skipped",
      side: "existing",
      reason: existing.reason,
      existing,
      candidate: { status: "notRun", cause: "existingSkipped" },
    };
  const candidate: SideResult =
    !input.candidateConfigured || !input.candidateModel
      ? { status: "notConfigured" }
      : await runOne(input, deps, input.candidateModel);
  if (candidate.status === "skipped")
    return { kind: "skipped", side: "candidate", reason: candidate.reason, existing, candidate };
  const run: AiEvaluationRun = {
    id: deps.uid(),
    createdAt: new Date(deps.now()).toISOString(),
    projectId: input.project.id,
    taskType: input.task,
    existingModel: input.existingModel,
    candidateModel: input.candidateModel ?? undefined,
    existingStatus: existing.status === "success" ? "success" : "error",
    // Only success/error/notConfigured can reach a recorded run (skips return above).
    candidateStatus:
      candidate.status === "success" || candidate.status === "notConfigured"
        ? candidate.status
        : "error",
    existingLatencyMs: "latencyMs" in existing ? existing.latencyMs : undefined,
    candidateLatencyMs: "latencyMs" in candidate ? candidate.latencyMs : undefined,
    existingOutputPreview: existing.status === "success" ? preview(existing.output) : undefined,
    candidateOutputPreview: candidate.status === "success" ? preview(candidate.output) : undefined,
    existingError: existing.status === "error" ? existing.error : undefined,
    candidateError: candidate.status === "error" ? candidate.error : undefined,
  };
  deps.addRun(run);
  return { kind: "recorded", run, existing, candidate };
}
