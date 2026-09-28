/**
 * BL — whole-input quality and safe whole-body Improve: the REAL server functions (mocked builder/auth/usage/
 * provider boundaries) and, for Improve, the REAL client producer over the REAL store with a fake entity backend.
 * Proves: the whole canonical document / raw body is embedded (tail markers past 12 000 units), inadmissible
 * input (schema cap, UTF-8 overflow of the exact final prompt) is refused BEFORE the usage claim and the
 * provider, a non-`stop` termination or an unusable answer is refused after one reserved attempt, and the
 * store body/updatedAt stay untouched with no save on every refusal; a complete rewrite replaces the body once.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { makeEntityBackend } from "@/lib/workspace-entities.testkit";

const h = vi.hoisted(() => ({
  claimAiUsage: vi.fn(async () => undefined),
  textResult: vi.fn(),
  auth: Symbol("requireSupabaseAuth"),
  backend: null as unknown as ReturnType<
    typeof import("@/lib/workspace-entities.testkit").makeEntityBackend
  >,
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
      // The real auth middleware supplies the verified user; the client producer passes only `data`.
      handler: (fn: (a: unknown) => unknown) => (a: { data: unknown; context?: unknown }) =>
        fn({ data: validate(a.data), context: a.context ?? { userId: "owner-1" } }),
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
  generateBudgetedTextResult: h.textResult,
  generateBudgetedText: async (...args: unknown[]) => (await h.textResult(...args)).text,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/sitemap.functions", () => ({ fetchSitemapInventoryFn: async () => null }));

import { evaluateContentQualityFn, improveContentDraftFn } from "./ai.functions";
import { improveContentDraft } from "./mock-ai";
import { getState, hydrateForUser, resetStore, setState } from "./store";
import { resetProducerSessionsForTests } from "./producer-session";
import { CONTENT_BODY_MAX_CHARS } from "./generation-result";
import { AI_TEXT_PROMPT_MAX_BYTES } from "./ai-text-bounds.server";
import { CANONICAL_DOCUMENT_MAX_CHARS } from "./content-assembler";
import { MIN_EVALUABLE_WORDS, QUALITY_CATEGORY_KEYS } from "./quality";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const TAIL = "\n\n## Final heading (tail)\n\nTAIL-MARKER end of draft.";
const longBody = `# Fixture draft\n\n${words(2600)}${TAIL}`; // > 12 000 units, tail after the old prefix
const project = {
  id: "p1",
  name: "Fixture",
  businessName: "Fixture",
  websiteUrl: "https://example.invalid",
  primaryContentLanguage: "en",
  appLanguage: "en",
  setupComplete: true,
};
const modelPayload = JSON.stringify({
  categories: Object.fromEntries(
    QUALITY_CATEGORY_KEYS.map((k) => [k, { score: 70, explanation: `${k} ok` }]),
  ),
});
const ctx = { userId: "owner-1" };
const evaluate = (markdown: string) =>
  (evaluateContentQualityFn as unknown as (a: unknown) => Promise<Record<string, unknown>>)({
    data: { project, services: [], title: "T", markdown },
    context: ctx,
  });
const improve = (markdown: string) =>
  (improveContentDraftFn as unknown as (a: unknown) => Promise<{ markdown: string }>)({
    data: { project, services: [], title: "T", markdown, suggestions: ["Tighten the intro"] },
    context: ctx,
  });
const prompt = (i = 0) => String(h.textResult.mock.calls[i][1]);
/** `null` models an adapter that reported no termination at all (the field is absent). */
const complete = (text: string, finishReason: string | null = "stop") =>
  h.textResult.mockResolvedValue(finishReason === null ? { text } : { text, finishReason });
/** The exact prompt overhead of a task (everything except the body), measured through the real prompt builder. */
const overhead = async (run: (body: string) => Promise<unknown>, body: string, answer: string) => {
  complete(answer);
  await run(body);
  const bytes = new TextEncoder().encode(prompt(0)).byteLength;
  h.textResult.mockClear();
  h.claimAiUsage.mockClear();
  return bytes - new TextEncoder().encode(body).byteLength;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("evaluateContentQualityFn: the whole canonical document", () => {
  it("embeds the entire document — a tail marker after 12 000 units reaches the prompt — with one claim and one attempt", async () => {
    complete(modelPayload);
    const res = await evaluate(longBody);
    expect(res.outcome).toBe("model");
    expect(prompt()).toContain("TAIL-MARKER end of draft.");
    expect(prompt()).toContain(longBody);
    expect(prompt()).not.toContain("slice");
    expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
    expect(h.textResult).toHaveBeenCalledTimes(1);
    expect(h.textResult.mock.calls[0][2]).toBe(4000); // completion budget unchanged
  });
  it("exact prompt-byte contract: the largest admissible document is scored; one more byte is refused before the claim, the reserve and the provider", async () => {
    const probe = `${words(MIN_EVALUABLE_WORDS)} `;
    const fixed = await overhead(evaluate, probe, modelPayload);
    const max = AI_TEXT_PROMPT_MAX_BYTES - fixed;
    const body = probe + "z".repeat(max - probe.length);
    expect(body).toHaveLength(max);
    complete(modelPayload);
    expect((await evaluate(body)).outcome).toBe("model");
    expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
    h.claimAiUsage.mockClear();
    h.textResult.mockClear();
    await expect(evaluate(body + "z")).rejects.toThrow("too much source text");
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.textResult).not.toHaveBeenCalled();
  });
  it("UTF-8 overflow: a schema-admissible document of 2-byte characters is refused before the claim; the schema cap + 1 is refused before anything", async () => {
    const polish = `${words(MIN_EVALUABLE_WORDS)} ${"ą".repeat(40_000)}`; // 40 040 units ≈ 80 KB
    expect(polish.length).toBeLessThanOrEqual(CANONICAL_DOCUMENT_MAX_CHARS);
    await expect(evaluate(polish)).rejects.toThrow("too much source text");
    await expect(
      (async () => evaluate("x".repeat(CANONICAL_DOCUMENT_MAX_CHARS + 1)))(),
    ).rejects.toThrow(/too_big|at most/);
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.textResult).not.toHaveBeenCalled();
  });
  it("short skip unchanged: under 40 canonical words → skipped, no claim, no provider", async () => {
    const res = await evaluate("Only a few words here.");
    expect(res.outcome).toBe("skipped");
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.textResult).not.toHaveBeenCalled();
  });
  it.each(["length", "content-filter", "error", "other", null])(
    "termination %s with syntactically valid JSON is refused as an incomplete answer after ONE reserved attempt (claim spent, no retry)",
    async (finishReason) => {
      complete(modelPayload, finishReason);
      await expect(evaluate(longBody)).rejects.toThrow("did not complete its answer");
      expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
      expect(h.textResult).toHaveBeenCalledTimes(1);
    },
  );
});

describe("improveContentDraftFn: the whole raw body, a complete non-empty bounded answer", () => {
  it("embeds the entire body (tail marker past 12 000 units) with the unchanged 8 000 completion budget, one claim, one attempt", async () => {
    complete(JSON.stringify({ markdown: `# Improved\n\n${words(2600)}${TAIL}` }));
    const res = await improve(longBody);
    expect(res.markdown).toContain("TAIL-MARKER");
    expect(prompt()).toContain(longBody);
    expect(h.textResult.mock.calls[0][2]).toBe(8000);
    expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
  });
  it("input bound: CONTENT_BODY_MAX_CHARS + 1 is refused by the schema, a 2-byte body under the schema cap by the prompt-byte contract — both before the claim and the provider; the largest admissible ASCII body is admitted", async () => {
    await expect((async () => improve("x".repeat(CONTENT_BODY_MAX_CHARS + 1)))()).rejects.toThrow(
      /too_big|at most/,
    );
    await expect(improve("ą".repeat(CONTENT_BODY_MAX_CHARS))).rejects.toThrow(
      "too much source text",
    );
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.textResult).not.toHaveBeenCalled();
    const probe = `${words(60)} `;
    const fixed = await overhead(improve, probe, JSON.stringify({ markdown: "improved" }));
    const max = Math.min(AI_TEXT_PROMPT_MAX_BYTES - fixed, CONTENT_BODY_MAX_CHARS);
    complete(JSON.stringify({ markdown: "improved" }));
    expect((await improve(probe + "z".repeat(max - probe.length))).markdown).toBe("improved");
    expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["length", JSON.stringify({ markdown: "partial rewrite" })],
    ["content-filter", JSON.stringify({ markdown: "x" })],
    ["error", JSON.stringify({ markdown: "x" })],
    ["other", JSON.stringify({ markdown: "x" })],
    [null, JSON.stringify({ markdown: "x" })],
  ])(
    "termination %s: refused as incomplete even with valid JSON, one reserved attempt, no retry",
    async (finishReason, text) => {
      complete(text, finishReason);
      await expect(improve(longBody)).rejects.toThrow("did not complete its answer");
      expect(h.textResult).toHaveBeenCalledTimes(1);
      expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [
      "missing markdown key",
      JSON.stringify({ content: "alias is not honoured" }),
      "invalid or oversized text response",
    ],
    ["empty markdown", JSON.stringify({ markdown: "   " }), "invalid or oversized text response"],
    ["wrong shape", JSON.stringify({ markdown: 42 }), "invalid or oversized text response"],
    ["not an object", JSON.stringify(["x"]), "invalid or oversized text response"],
    [
      "oversized answer",
      JSON.stringify({ markdown: "y".repeat(CONTENT_BODY_MAX_CHARS + 1) }),
      "invalid or oversized text response",
    ],
    ["truncated JSON", '{"markdown":"cut off', "unexpected format"],
  ])(
    "%s: refused without falling back to the original body (%s)",
    async (_label, text, message) => {
      complete(text);
      await expect(improve(longBody)).rejects.toThrow(message);
      expect(h.textResult).toHaveBeenCalledTimes(1);
    },
  );
});

describe("improveContentDraft (real client producer, real store, fake backend): refusals leave the draft untouched", () => {
  const DOC = {
    projects: [project],
    services: [],
    content: [
      {
        id: "c1",
        projectId: "p1",
        title: "Fixture draft",
        markdown: longBody,
        language: "English",
        assetType: "article",
        updatedAt: "2026-09-28T10:00:00.000Z",
        hook: {
          id: "h1",
          text: "An approved hook that must survive the rewrite.",
          type: "question",
          provenance: "user-edited",
          approval: "approved",
        },
        qualityScore: {
          overall: 55,
          status: "okay",
          categories: {},
          topIssues: [],
          quickWins: ["Tighten"],
          publishingRecommendation: "reviewFirst",
          summary: "",
          evaluatedAt: "2026-09-28T09:00:00.000Z",
        },
      },
    ],
    opportunities: [],
    activeProjectId: "p1",
  };
  const asset = () => getState().content.find((c) => c.id === "c1")!;
  beforeEach(async () => {
    vi.stubGlobal("window", globalThis as unknown as Window);
    h.backend = makeEntityBackend();
    h.backend.state.doc = structuredClone(DOC);
    h.backend.state.rev = 1;
    resetStore();
    resetProducerSessionsForTests();
    await hydrateForUser("user1");
  });
  afterEach(() => vi.unstubAllGlobals());
  const untouched = () => {
    const a = asset();
    expect(a.markdown).toBe(longBody);
    expect(a.updatedAt).toBe("2026-09-28T10:00:00.000Z");
    expect(a.hook?.text).toBe("An approved hook that must survive the rewrite.");
    expect(h.backend.state.batches).toHaveLength(0);
  };
  it.each([
    [
      "incomplete termination",
      JSON.stringify({ markdown: "partial" }),
      "length",
      "did not complete its answer",
    ],
    [
      "content filter",
      JSON.stringify({ markdown: "x" }),
      "content-filter",
      "did not complete its answer",
    ],
    [
      "empty answer",
      JSON.stringify({ markdown: "" }),
      "stop",
      "invalid or oversized text response",
    ],
    ["missing answer", JSON.stringify({}), "stop", "invalid or oversized text response"],
    [
      "oversized answer",
      JSON.stringify({ markdown: "y".repeat(CONTENT_BODY_MAX_CHARS + 1) }),
      "stop",
      "invalid or oversized text response",
    ],
    ["truncated JSON", '{"markdown":"cut', "stop", "unexpected format"],
  ])(
    "%s: rejected, body and updatedAt unchanged, hook kept, nothing saved",
    async (_label, text, finishReason, message) => {
      complete(text, finishReason);
      await expect(improveContentDraft("c1")).rejects.toThrow(message as string);
      untouched();
      expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
      expect(h.textResult).toHaveBeenCalledTimes(1);
    },
  );
  it("oversized body (schema) and UTF-8 overflow are refused before the claim and the provider; draft untouched", async () => {
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, markdown: "x".repeat(CONTENT_BODY_MAX_CHARS + 1) } : c,
      ),
    }));
    await expect(improveContentDraft("c1")).rejects.toThrow(/too_big|at most/);
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, markdown: "ą".repeat(CONTENT_BODY_MAX_CHARS) } : c,
      ),
    }));
    await expect(improveContentDraft("c1")).rejects.toThrow("too much source text");
    expect(h.claimAiUsage).not.toHaveBeenCalled();
    expect(h.textResult).not.toHaveBeenCalled();
    expect(h.backend.state.batches).toHaveLength(0);
  });
  it("a complete rewrite replaces the whole body once, keeps the approved hook and title, marks the score stale and saves once; the whole body was sent", async () => {
    const improved = `# Improved\n\n${words(2700)}${TAIL}`;
    complete(JSON.stringify({ markdown: improved }));
    await improveContentDraft("c1");
    expect(prompt()).toContain("TAIL-MARKER end of draft.");
    const a = asset();
    expect(a.markdown).toBe(improved);
    expect(a.title).toBe("Fixture draft");
    expect(a.hook?.text).toBe("An approved hook that must survive the rewrite.");
    expect(a.qualityScoreStale).toBe(true);
    expect(a.updatedAt).not.toBe("2026-09-28T10:00:00.000Z");
    expect(h.backend.state.batches).toHaveLength(1);
    expect((h.backend.state.doc as { content: { markdown: string }[] }).content[0].markdown).toBe(
      improved,
    );
  });
  it("source edited mid-attempt: the complete rewrite is refused (source_changed) and the edit is kept", async () => {
    let resolve!: (v: unknown) => void;
    h.textResult.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = improveContentDraft("c1");
    await new Promise((r) => setTimeout(r, 0));
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, markdown: longBody + "\n\nEdited meanwhile." } : c,
      ),
    }));
    resolve({ text: JSON.stringify({ markdown: "# Rewritten" }), finishReason: "stop" });
    await expect(pending).rejects.toMatchObject({ code: "source_changed" });
    expect(asset().markdown).toBe(longBody + "\n\nEdited meanwhile.");
    expect(h.backend.state.batches).toHaveLength(0);
  });
  it("replacement session mid-attempt: the complete rewrite is refused (stale_session) and nothing is written", async () => {
    let resolve!: (v: unknown) => void;
    h.textResult.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = improveContentDraft("c1");
    await new Promise((r) => setTimeout(r, 0));
    resetStore();
    await hydrateForUser("user1");
    resolve({ text: JSON.stringify({ markdown: "# Rewritten" }), finishReason: "stop" });
    await expect(pending).rejects.toMatchObject({ code: "stale_session" });
    expect(asset().markdown).toBe(longBody);
    expect(h.backend.state.batches).toHaveLength(0);
  });
});
