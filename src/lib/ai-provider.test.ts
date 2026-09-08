import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelFor, AiProviderConfigurationError } from "./ai-provider.server";
import { generateBoundedText } from "./ai-text-bounds.server";
import {
  DEFAULT_MODEL_ID,
  getDefaultModelConfig,
  getRouterStatus,
  isCandidateConfigured,
  resolveModelForTask,
} from "./ai-router";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-key");
  vi.stubEnv("LOVABLE_API_KEY", "synthetic-legacy-key");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("AI_CANDIDATE_MODEL", "");
  vi.stubEnv("AI_EVALUATION_ENABLED", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function completion() {
  return new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: 0,
      model: DEFAULT_MODEL_ID,
      choices: [
        { index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

describe("direct text transport using the real AI SDK", () => {
  it.each([undefined, DEFAULT_MODEL_ID])(
    "sends one bounded request directly to OpenAI (%s)",
    async (override) => {
      const request = vi.fn(async () => completion());
      vi.stubGlobal("fetch", request);
      expect(await generateBoundedText("Return JSON", 8000, () => modelFor(override))).toBe(
        '{"ok":true}',
      );
      expect(request).toHaveBeenCalledOnce();
      const [url, init] = (request.mock.calls as unknown as [string, RequestInit][])[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(init.headers);
      expect(headers.get("authorization")).toBe("Bearer synthetic-openai-key");
      expect(headers.has("Lovable-API-Key")).toBe(false);
      const payload = JSON.parse(init.body as string);
      expect(payload).toMatchObject({
        model: DEFAULT_MODEL_ID,
        max_completion_tokens: 8000,
        reasoning_effort: "low",
        service_tier: "default",
        store: false,
      });
      expect(payload).not.toHaveProperty("max_tokens");
      expect(payload).not.toHaveProperty("tools");
    },
  );

  it.each(["", "  "])("refuses missing OpenAI credentials even with a Lovable key", async (key) => {
    vi.stubEnv("OPENAI_API_KEY", key);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(generateBoundedText("Return JSON", 3000, () => modelFor())).rejects.toBeInstanceOf(
      AiProviderConfigurationError,
    );
    expect(request).not.toHaveBeenCalled();
    expect(getDefaultModelConfig().enabled).toBe(false);
    expect(getRouterStatus().defaultModel.enabled).toBe(false);
  });

  it.each([401, 429, 500, 302])("does not retry or use Lovable after HTTP %s", async (status) => {
    const request = vi.fn(
      async () => new Response('{"error":{"message":"synthetic failure"}}', { status }),
    );
    vi.stubGlobal("fetch", request);
    await expect(generateBoundedText("Return JSON", 3000, () => modelFor())).rejects.toThrow();
    expect(request).toHaveBeenCalledOnce();
  });
});

describe("candidate routing", () => {
  it("requires a direct OpenRouter key, never the old gateway key", () => {
    vi.stubEnv("AI_CANDIDATE_MODEL", "anthropic/test-candidate");
    expect(isCandidateConfigured()).toBe(false);
    expect(() => modelFor("anthropic/test-candidate")).toThrow(AiProviderConfigurationError);
    expect(resolveModelForTask("contentGeneration", "evaluation")).toMatchObject({
      provider: "openai",
      model: DEFAULT_MODEL_ID,
    });
  });

  it("only accepts the configured candidate and leaves production on OpenAI until explicit opt-in", async () => {
    vi.stubEnv("AI_CANDIDATE_MODEL", "anthropic/test-candidate");
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-candidate-key");
    expect(() => modelFor("unconfigured-model")).toThrow(AiProviderConfigurationError);
    expect(resolveModelForTask("contentGeneration").provider).toBe("openai");
    expect(resolveModelForTask("contentGeneration", "evaluation").provider).toBe("openrouter");
    vi.stubEnv("AI_EVALUATION_ENABLED", "true");
    expect(resolveModelForTask("contentGeneration").provider).toBe("openrouter");
    const request = vi.fn(async () => completion());
    vi.stubGlobal("fetch", request);
    await generateBoundedText("Return JSON", 3000, () => modelFor("anthropic/test-candidate"));
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = (request.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer synthetic-candidate-key");
    expect(init.redirect).toBe("error");
  });
});
