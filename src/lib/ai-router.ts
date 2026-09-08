/** Server-only routing. Direct OpenAI by default; explicit OpenRouter candidate
 * for evaluations. No Lovable AI transport or credential fallback. */
import type { AiTaskType } from "./types";

export type AiProviderId = "openai" | "openrouter" | "anthropic" | "mock";

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
export const DEFAULT_MODEL_ID = "gpt-5.6-terra";
export const DEFAULT_MODEL_LABEL = "GPT-5.6 Terra (OpenAI)";

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
  return candidateUsesOpenRouter();
}

/** Whether experimental production routing is enabled (off by default). */
export function isEvaluationRoutingEnabled(): boolean {
  return (process.env.AI_EVALUATION_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function getDefaultModelConfig(): AiModelConfig {
  return {
    provider: "openai",
    model: DEFAULT_MODEL_ID,
    label: DEFAULT_MODEL_LABEL,
    enabled: Boolean((process.env.OPENAI_API_KEY ?? "").trim()),
  };
}

export function getCandidateModelConfig(): AiModelConfig {
  const model = getCandidateModelId();
  return {
    provider: "openrouter",
    model,
    label: "OpenRouter candidate",
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
    defaultModel: {
      label: DEFAULT_MODEL_LABEL,
      model: DEFAULT_MODEL_ID,
      enabled: getDefaultModelConfig().enabled,
    },
    candidateConfigured: isCandidateConfigured(),
    candidateLabel: candidate.label,
    candidateModel: candidate.model || null,
    candidateProvider: candidate.provider,
    experimentalRoutingEnabled: isEvaluationRoutingEnabled(),
  };
}
