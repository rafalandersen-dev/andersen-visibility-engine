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
  // Integration: keep the real producer guard active in this caller fixture.
  getWorkspaceSaveContext: () => ({ userId: "fixture-owner", epoch: 1, hydrated: true }),
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
vi.mock("./ai-provider-expense.server", () => ({
  generateBudgetedText: h.generateBudgetedText,
  // The whole-input tasks require a positive `stop`; the spied text function keeps the call counts.
  generateBudgetedTextResult: async (...args: unknown[]) => ({
    text: await h.generateBudgetedText(...args),
    finishReason: "stop",
  }),
}));
// Pass-through spies on the word scan, so a test can prove an input was refused BEFORE it was scanned.
vi.mock("./quality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./quality")>();
  return {
    ...actual,
    draftWordCount: vi.fn(actual.draftWordCount),
    hasMinimumWords: vi.fn(actual.hasMinimumWords),
  };
});
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { evaluateContentQuality } from "./mock-ai";
import {
  MIN_EVALUABLE_WORDS,
  QUALITY_CATEGORY_KEYS,
  draftWordCount,
  hasMinimumWords,
} from "./quality";
import { CONTENT_BODY_MAX_CHARS } from "./generation-result";
import { CANONICAL_DOCUMENT_MAX_CHARS, assembleContentAsset } from "./content-assembler";
import type { ContentAsset, Project } from "./types";
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
    h.remoteEvaluate.mockResolvedValueOnce({ outcome: "model", score: remote });
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
    const res = await call(longWords);
    expect(res.outcome).toBe("model");
    const score = res.score as Record<string, unknown>;
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
    const res = await call(longWords);
    const score = res.score as Record<string, unknown>;
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
      const res = await call(markdown);
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).not.toHaveBeenCalled();
      // Explicit provenance: a deterministic skip, never presented as model work.
      expect(res.outcome).toBe("skipped");
      expect(res.reason).toBe("tooShort");
      const score = res.score as Record<string, unknown>;
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

  describe("bounded admission (finding 4125880002): the body is capped before it is scanned", () => {
    const scanned = () =>
      vi.mocked(hasMinimumWords).mock.calls.length + vi.mocked(draftWordCount).mock.calls.length;
    const refused = async (markdown: string) => {
      const before = scanned();
      // The mocked builder validates synchronously; the real transport rejects asynchronously.
      await expect((async () => call(markdown))()).rejects.toThrow(/too_big|at most \d+/);
      expect(scanned()).toBe(before);
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).not.toHaveBeenCalled();
    };
    it("one code unit over CANONICAL_DOCUMENT_MAX_CHARS is refused by input validation: no word scan, no claim, no provider", async () => {
      expect(CANONICAL_DOCUMENT_MAX_CHARS).toBeGreaterThan(CONTENT_BODY_MAX_CHARS);
      await refused("x".repeat(CANONICAL_DOCUMENT_MAX_CHARS + 1));
      // Whitespace-only, markup-only and a single pathological token are refused the same way when oversized.
      await refused(" ".repeat(CANONICAL_DOCUMENT_MAX_CHARS + 1));
      await refused("#".repeat(CANONICAL_DOCUMENT_MAX_CHARS + 1));
      await refused("a".repeat(8 * 1024 * 1024));
      // The limit counts UTF-16 code units (zod `.max` = `length`): an astral character costs two.
      await refused("\u{1F600}".repeat(CANONICAL_DOCUMENT_MAX_CHARS / 2 + 1));
    });
    it("exactly CONTENT_BODY_MAX_CHARS is admitted: a long valid draft claims once then calls the provider once", async () => {
      h.generateBudgetedText.mockResolvedValueOnce(JSON.stringify({ categories: {} }));
      const words = Array.from({ length: MIN_EVALUABLE_WORDS + 20 }, (_, i) => `w${i}`).join(" ");
      const body = words + " " + "z".repeat(CONTENT_BODY_MAX_CHARS - words.length - 1);
      expect(body).toHaveLength(CONTENT_BODY_MAX_CHARS);
      const res = await call(body);
      expect(res.outcome).toBe("model");
      expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
      expect(h.generateBudgetedText).toHaveBeenCalledTimes(1);
      expect(vi.mocked(hasMinimumWords)).toHaveBeenCalledWith(body, MIN_EVALUABLE_WORDS);
    });
    it.each([
      ["a single pathological token at the cap", "a".repeat(CANONICAL_DOCUMENT_MAX_CHARS)],
      ["whitespace only at the cap", " \t\n\u00a0\u3000".repeat(CANONICAL_DOCUMENT_MAX_CHARS / 5)],
      [
        "markup only at the cap",
        "# > * _ ` ~ -".repeat(Math.floor(CANONICAL_DOCUMENT_MAX_CHARS / 13)),
      ],
      [
        "39 words padded with separators to the cap",
        Array.from({ length: MIN_EVALUABLE_WORDS - 1 }, (_, i) => `w${i}`).join("-") +
          "-".repeat(CANONICAL_DOCUMENT_MAX_CHARS - 200),
      ],
    ])(
      "%s: admitted, scanned once, skipped as too short with no claim and no provider call",
      async (_label, markdown) => {
        expect(markdown.length).toBeLessThanOrEqual(CANONICAL_DOCUMENT_MAX_CHARS);
        const res = await call(markdown);
        expect(res.outcome).toBe("skipped");
        expect(res.reason).toBe("tooShort");
        expect(h.claimAiUsage).not.toHaveBeenCalled();
        expect(h.generateBudgetedText).not.toHaveBeenCalled();
        expect(vi.mocked(hasMinimumWords)).toHaveBeenCalledTimes(1);
      },
    );
    it("40 words separated by unicode whitespace: admitted and evaluated within the prompt-byte contract; padded to the schema cap with 3-byte spaces it is refused BEFORE the claim (UTF-8 overflow, BL)", async () => {
      h.generateBudgetedText.mockResolvedValueOnce(JSON.stringify({ categories: {} }));
      const words = Array.from({ length: MIN_EVALUABLE_WORDS }, (_, i) => `w${i}`).join("\u00a0");
      const small = words + "\u3000".repeat(10_000); // ≈ 30 KB of UTF-8, inside the 64 KiB request
      expect((await call(small)).outcome).toBe("model");
      expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
      h.claimAiUsage.mockClear();
      const body = words + "\u3000".repeat(CANONICAL_DOCUMENT_MAX_CHARS - words.length);
      expect(body).toHaveLength(CANONICAL_DOCUMENT_MAX_CHARS); // schema-admissible, but ≈ 192 KB of UTF-8
      await expect((async () => call(body))()).rejects.toThrow("too much source text");
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).toHaveBeenCalledTimes(1); // only the small document reached the provider
    });
  });

  describe("BD — canonical assembled documents through the REAL client → assembler → validator", () => {
    // A maximum-size GENERATED body (exactly CONTENT_BODY_MAX_CHARS) with the ordinary composed sections:
    // approved hook, TL;DR, key takeaways, verified sources, author block and a breadcrumb trail.
    const canonicalAsset = (over: Partial<ContentAsset> = {}): ContentAsset =>
      ({
        ...longAsset,
        id: "a-canonical",
        markdown: "word ".repeat(CONTENT_BODY_MAX_CHARS / 5),
        hook: {
          id: "h1",
          text: "An approved introduction that opens the article with a question.",
          type: "question",
          provenance: "user-edited",
          approval: "approved",
        },
        tldr: "The short answer, in two sentences.",
        keyTakeaways: ["First takeaway.", "Second takeaway.", "Third takeaway."],
        sources: [
          { url: "https://example.invalid/source-1", title: "Source one", status: "verified" },
          { url: "https://example.invalid/source-2", title: "Source two", status: "verified" },
        ],
        author: { name: "Fixture Author", role: "Owner", bio: "A real, consenting person." },
        breadcrumbs: [
          { name: "Home", url: "https://example.invalid/" },
          { name: "Guides", url: "https://example.invalid/guides" },
        ],
        ...over,
      }) as ContentAsset;
    /** Runs the real client caller, captures the payload it actually sent, and feeds it to the real validator. */
    const sendThroughClient = async (asset: ContentAsset) => {
      h.state = { content: [asset], projects: [project], services: [] };
      h.remoteEvaluate.mockResolvedValueOnce({ outcome: "model", score: {} });
      await evaluateContentQuality(asset.id);
      const sent = (h.remoteEvaluate.mock.calls.at(-1)![0] as { data: Record<string, unknown> })
        .data;
      expect(sent.markdown).toBe(assembleContentAsset(asset, project as Project).markdown);
      vi.mocked(hasMinimumWords).mockClear();
      vi.mocked(draftWordCount).mockClear();
      h.claimAiUsage.mockClear();
      h.generateBudgetedText.mockClear();
      return sent;
    };
    const server = (sent: Record<string, unknown>) =>
      (evaluateContentQualityFn as unknown as (a: unknown) => Promise<Record<string, unknown>>)({
        data: sent,
        context: { userId: "owner-1" },
      });

    it("a maximum generated body plus the approved hook and ordinary sections assembles above the body limit and is ADMITTED: one claim, one provider call", async () => {
      const asset = canonicalAsset();
      expect(asset.markdown).toHaveLength(CONTENT_BODY_MAX_CHARS);
      const sent = await sendThroughClient(asset);
      const doc = sent.markdown as string;
      expect(doc.length).toBeGreaterThan(CONTENT_BODY_MAX_CHARS);
      expect(doc.length).toBeLessThanOrEqual(CANONICAL_DOCUMENT_MAX_CHARS);
      expect(doc).toContain("An approved introduction");
      expect(doc).toContain("## Sources");
      expect(doc).toContain("## About the author");
      h.generateBudgetedText.mockResolvedValueOnce(JSON.stringify({ categories: {} }));
      const res = await server(sent);
      expect(res.outcome).toBe("model");
      expect(vi.mocked(hasMinimumWords)).toHaveBeenCalledWith(doc, MIN_EVALUABLE_WORDS);
      expect(h.claimAiUsage).toHaveBeenCalledTimes(1);
      expect(h.generateBudgetedText).toHaveBeenCalledTimes(1);
    });
    it("the schema bound still admits the document, but the WHOLE-document prompt contract (64 KiB) refuses it BEFORE the claim; one unit more is refused by the schema before the scan (same client, same assembler; BL)", async () => {
      // Grow a composed section (the TL;DR) until the assembled document is EXACTLY the schema bound; the
      // body stays a maximum generated body throughout. Since BL the evaluator embeds the WHOLE document,
      // so a 64 000-unit document plus the prompt's own text exceeds the 65 536-byte request contract and is
      // refused truthfully before any spend — the explicit remaining gap, not a silent slice.
      const base = canonicalAsset();
      const baseLength = assembleContentAsset(base, project as Project).markdown.length;
      const pad = CANONICAL_DOCUMENT_MAX_CHARS - baseLength;
      expect(pad).toBeGreaterThan(0);
      const atBound = canonicalAsset({ tldr: base.tldr + " " + "x".repeat(pad - 1) });
      const sentAtBound = await sendThroughClient(atBound);
      expect((sentAtBound.markdown as string).length).toBe(CANONICAL_DOCUMENT_MAX_CHARS);
      await expect((async () => server(sentAtBound))()).rejects.toThrow("too much source text");
      expect(vi.mocked(hasMinimumWords)).toHaveBeenCalledTimes(1); // scanned (cheap), then refused by bytes
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).not.toHaveBeenCalled();

      const overBound = canonicalAsset({ tldr: base.tldr + " " + "x".repeat(pad) });
      const sentOver = await sendThroughClient(overBound);
      expect((sentOver.markdown as string).length).toBe(CANONICAL_DOCUMENT_MAX_CHARS + 1);
      await expect((async () => server(sentOver))()).rejects.toThrow(/too_big|at most \d+/);
      expect(vi.mocked(hasMinimumWords)).not.toHaveBeenCalled();
      expect(vi.mocked(draftWordCount)).not.toHaveBeenCalled();
      expect(h.claimAiUsage).not.toHaveBeenCalled();
      expect(h.generateBudgetedText).not.toHaveBeenCalled();
    });
  });
});
