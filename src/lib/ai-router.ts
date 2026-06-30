/**
 * AI Provider Router v1 (server-only — reads env, never exposes secrets).
 *
 * Production behaviour is unchanged: every task resolves to the existing
 * provider/model by default. A candidate model (e.g. Claude via the same
 * OpenAI-compatible gateway, or OpenRouter) is optional and only used by the
 * internal evaluation tool, or in production if a task is explicitly routed and
 * the candidate is configured. Missing candidate config degrades gracefully.
 */
import type { AiTaskType } from "./types";

export type AiProviderId = "existing" | "openrouter" | "anthropic" | "mock";

export interface AiModelConfig {
  provider: AiProviderId;
  model: string;
  label: string;
  enabled: boolean;
  experimental?: boolean;
}

export interface AiRouterConfig {
  defaultModel: AiModelConfig;
  taskModels: Partial<Record<AiTaskType, AiModelConfig>>;
  candidateModels: AiModelConfig[];
}

/** The production model id (mirrors ai.functions MODEL). */
export const DEFAULT_MODEL_ID = "google/gemini-3-flash-preview";
export const DEFAULT_MODEL_LABEL = "Gemini (production)";

/** Tasks eligible for experimental candidate routing (evaluation/opt-in only). */
export const EXPERIMENTAL_CANDIDATE_TASKS: AiTaskType[] = [
  "contentGeneration",
  "contentImprove",
  "contentQualityScore",
  "authorityGeneration",
];

/** Candidate model id from env (e.g. "anthropic/claude-sonnet-4"). "" if unset. */
export function getCandidateModelId(): string {
  return (process.env.AI_CANDIDATE_MODEL ?? "").trim();
}

/** Candidate is routed through OpenRouter when an OpenRouter key is present. */
export function candidateUsesOpenRouter(): boolean {
  return Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());
}

/** Whether a candidate model is configured and runnable. */
export function isCandidateConfigured(): boolean {
  const model = getCandidateModelId();
  if (!model) return false;
  // Either route through OpenRouter (its own key) or the existing gateway key.
  return candidateUsesOpenRouter() || Boolean((process.env.LOVABLE_API_KEY ?? "").trim());
}

/** Whether experimental production routing is enabled (off by default). */
export function isEvaluationRoutingEnabled(): boolean {
  return (process.env.AI_EVALUATION_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function getDefaultModelConfig(): AiModelConfig {
  return { provider: "existing", model: DEFAULT_MODEL_ID, label: DEFAULT_MODEL_LABEL, enabled: true };
}

export function getCandidateModelConfig(): AiModelConfig {
  const model = getCandidateModelId();
  return {
    provider: candidateUsesOpenRouter() ? "openrouter" : "existing",
    model,
    label: "Claude candidate",
    enabled: isCandidateConfigured(),
    experimental: true,
  };
}

export function getDefaultAiRouterConfig(): AiRouterConfig {
  const def = getDefaultModelConfig();
  return {
    defaultModel: def,
    taskModels: {}, // all tasks use the default in production v1
    candidateModels: isCandidateConfigured() ? [getCandidateModelConfig()] : [],
  };
}

/**
 * Resolve which model a task should use. Production always returns the default
 * today; evaluation mode may return the candidate for eligible, configured tasks.
 */
export function resolveModelForTask(
  taskType: AiTaskType,
  mode: "production" | "evaluation" = "production",
): AiModelConfig {
  if (
    mode === "evaluation" &&
    isCandidateConfigured() &&
    EXPERIMENTAL_CANDIDATE_TASKS.includes(taskType)
  ) {
    return getCandidateModelConfig();
  }
  // Production: honour an explicit opt-in flag for eligible tasks; otherwise default.
  if (
    mode === "production" &&
    isEvaluationRoutingEnabled() &&
    isCandidateConfigured() &&
    EXPERIMENTAL_CANDIDATE_TASKS.includes(taskType)
  ) {
    return getCandidateModelConfig();
  }
  return getDefaultModelConfig();
}

export function isCandidateModelAvailable(config?: AiModelConfig): boolean {
  if (!config) return isCandidateConfigured();
  return config.enabled && Boolean(config.model);
}

/** UI-safe status (NO API keys) for the evaluation page. */
export function getRouterStatus() {
  const candidate = getCandidateModelConfig();
  return {
    defaultModel: { label: DEFAULT_MODEL_LABEL, model: DEFAULT_MODEL_ID },
    candidateConfigured: isCandidateConfigured(),
    candidateLabel: candidate.label,
    candidateModel: candidate.model || null,
    candidateProvider: candidate.provider,
    experimentalRoutingEnabled: isEvaluationRoutingEnabled(),
  };
}
