import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { DEFAULT_MODEL_ID, getCandidateModelId, isCandidateConfigured } from "./ai-router";

export class AiProviderConfigurationError extends Error {
  constructor() {
    super("AI generation is not configured. The workspace owner needs to connect the AI service.");
    this.name = "AiProviderConfigurationError";
  }
}

/** Direct provider credentials never follow a redirect. Time, output and retry
 * limits are supplied by generateBoundedText for every text action.
 */
const directFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: "error" });

/** The only optional alternate route is the explicitly configured OpenRouter
 * candidate. Missing configuration never falls back to Lovable AI.
 */
export function modelFor(modelId?: string) {
  if (!modelId || modelId === DEFAULT_MODEL_ID) {
    const key = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!key) throw new AiProviderConfigurationError();
    return createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: key,
      fetch: directFetch,
      transformRequestBody: (args) => {
        const { max_tokens, ...body } = args;
        // GPT-5.6 uses max_completion_tokens, including reasoning tokens.
        // Pin effort and standard service tier instead of provider defaults.
        return {
          ...body,
          max_completion_tokens: max_tokens,
          reasoning_effort: "low",
          service_tier: "default",
          store: false,
        };
      },
    })(DEFAULT_MODEL_ID);
  }
  if (modelId !== getCandidateModelId() || !isCandidateConfigured())
    throw new AiProviderConfigurationError();
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: (process.env.OPENROUTER_API_KEY ?? "").trim(),
    fetch: directFetch,
  })(modelId);
}
