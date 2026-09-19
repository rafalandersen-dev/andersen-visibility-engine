import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { DEFAULT_MODEL_ID, getCandidateModelId, isCandidateConfigured } from "./ai-router";
import { isHeaderSafeCredential } from "./ai-error-diagnostics.server";
import { directProviderFetch } from "./provider-fetch.server";

export class AiProviderConfigurationError extends Error {
  constructor() {
    super("AI generation is not configured. The workspace owner needs to connect the AI service.");
    this.name = "AiProviderConfigurationError";
  }
}

/** A saved credential exists but cannot form a valid HTTP header (e.g. it has
 * a stray newline or non-ASCII byte). We detect this as a boolean, before any
 * reservation or transport, so it never surfaces as an opaque fetch TypeError.
 * The offending value is never read, logged or exposed in any form. */
export class AiMalformedCredentialError extends Error {
  constructor() {
    super("The saved AI key is not in a usable format. The workspace owner needs to re-enter it.");
    this.name = "AiMalformedCredentialError";
  }
}

/** Direct provider credentials never follow a redirect: the shared
 * directProviderFetch enforces redirect:"manual" and refuses any redirect
 * response (workerd rejects redirect:"error" outright). Time, output and retry
 * limits are supplied by generateBoundedText for every text action.
 *
 * The only optional alternate route is the explicitly configured OpenRouter
 * candidate. Missing configuration never falls back to Lovable AI.
 */
export function modelFor(modelId?: string) {
  if (!modelId || modelId === DEFAULT_MODEL_ID) {
    const key = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!key) throw new AiProviderConfigurationError();
    if (!isHeaderSafeCredential(key)) throw new AiMalformedCredentialError();
    return createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: key,
      fetch: directProviderFetch,
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
  const candidateKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!isHeaderSafeCredential(candidateKey)) throw new AiMalformedCredentialError();
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: candidateKey,
    fetch: directProviderFetch,
  })(modelId);
}
