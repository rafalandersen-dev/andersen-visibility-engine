import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ text: vi.fn(), page: vi.fn(), usage: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: (value: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./ai-usage.server", () => ({ claimAiUsage: h.usage }));
vi.mock("./ai-provider-expense.server", () => ({ generateBudgetedText: h.text }));
vi.mock("./homepage-fetch.server", () => ({
  fetchHomepageHtml: (url: string) => h.page(url),
}));
import { generateCompetitorGapFn, bindCompetitorSnapshots } from "./ai.functions";
import type { CompetitorSnapshot } from "./types";
const first = "https://first.example/";
const second = "https://second.example/";
const third = "https://third.example/";
const snapshot = (url: string, title: string) => ({
  competitorUrl: url,
  title,
  detectedPositioning: `${title} positioning`,
  notableStrengths: [`${title} strength`],
});
const payload = (snapshots: unknown[]) =>
  JSON.stringify({
    gaps: [{ title: "A useful page", category: "Service Coverage", priority: "High" }],
    competitorSnapshots: snapshots,
  });
const call = async (urls: string[], snapshots: unknown[]) => {
  h.text.mockResolvedValueOnce(payload(snapshots));
  return (
    generateCompetitorGapFn as unknown as (
      args: unknown,
    ) => Promise<{ competitorSnapshots: CompetitorSnapshot[] }>
  )({
    data: {
      project: { id: "p", name: "Business", primaryLanguage: "English" },
      services: [],
      competitorUrls: urls,
    },
    context: { userId: "owner" },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  h.usage.mockResolvedValue(undefined);
  h.page.mockImplementation(
    async (url: string) =>
      `<title>Observed ${new URL(url).hostname}</title><p>Real page context for the fixture.</p>`,
  );
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("competitor results stay bound to fetched pages", () => {
  it("does not attach the only returned summary to an earlier failed competitor", async () => {
    const result = {
      competitorSnapshots: bindCompetitorSnapshots(
        [
          { url: first, ctx: { ok: false, title: "" } },
          { url: second, ctx: { ok: true, title: "Observed second" } },
        ],
        [snapshot(second, "Second")],
      ),
    };
    expect(result.competitorSnapshots.map((s) => [s.competitorUrl, s.fetchStatus])).toEqual([
      [first, "failed"],
      [second, "fetched"],
    ]);
    expect(result.competitorSnapshots[0].notableStrengths).toEqual([]);
    expect(result.competitorSnapshots[0].detectedPositioning).not.toContain("Second");
    expect(result.competitorSnapshots[1]).toMatchObject({
      title: "Second",
      notableStrengths: ["Second strength"],
    });
  });
  it("matches reordered model summaries by URL while retaining submitted order", async () => {
    const result = {
      competitorSnapshots: bindCompetitorSnapshots(
        [
          { url: first, ctx: { ok: true, title: "Observed first" } },
          { url: second, ctx: { ok: true, title: "Observed second" } },
        ],
        [snapshot(second, "Second"), snapshot(first, "First")],
      ),
    };
    expect(result.competitorSnapshots.map((s) => [s.competitorUrl, s.title])).toEqual([
      [first, "First"],
      [second, "Second"],
    ]);
  });
  it("ignores a model URL that was never fetched and keeps the observed title", async () => {
    const result = await call([first], [snapshot(third, "Unrelated")]);
    expect(result.competitorSnapshots[0]).toMatchObject({
      competitorUrl: first,
      title: "Observed first.example",
      notableStrengths: [],
    });
    expect(h.page).toHaveBeenCalledExactlyOnceWith(first);
  });
  it("never retains model positioning for a failed fetch even when its URL matches", async () => {
    const result = {
      competitorSnapshots: bindCompetitorSnapshots(
        [
          { url: first, ctx: { ok: false, title: "" } },
          { url: second, ctx: { ok: true, title: "Observed second" } },
        ],
        [snapshot(first, "Invented"), snapshot(second, "Second")],
      ),
    };
    expect(result.competitorSnapshots[0]).toMatchObject({
      competitorUrl: first,
      fetchStatus: "failed",
      notableStrengths: [],
    });
    expect(JSON.stringify(result.competitorSnapshots[0])).not.toContain("Invented");
  });
  it("leaves ambiguous duplicate or unlabelled summaries unassociated", async () => {
    const duplicate = await call([first], [snapshot(first, "One"), snapshot(first, "Two")]);
    expect(duplicate.competitorSnapshots[0]).toMatchObject({
      title: "Observed first.example",
      notableStrengths: [],
    });
    const missing = await call([first], [{ title: "Unlabelled", notableStrengths: ["Unbound"] }]);
    expect(missing.competitorSnapshots[0]).toMatchObject({
      title: "Observed first.example",
      notableStrengths: [],
    });
  });
  it("normalizes scheme-less input, host case, default ports and fragments without changing the displayed source", async () => {
    const result = await call(
      ["FIRST.example"],
      [snapshot("https://first.example:443/#details", "First")],
    );
    expect(result.competitorSnapshots[0]).toMatchObject({
      competitorUrl: "FIRST.example",
      title: "First",
    });
    expect(h.page).toHaveBeenCalledExactlyOnceWith(first);
  });
  it.each([
    "https://first.example/path",
    "https://first.example/?version=2",
    "http://first.example/",
    "https://user@first.example/",
  ])("does not infer source identity from the same hostname for %s", async (url) => {
    const result = await call([first], [snapshot(url, "Different")]);
    expect(result.competitorSnapshots[0]).toMatchObject({
      competitorUrl: first,
      title: "Observed first.example",
      notableStrengths: [],
    });
  });
  it("retains a retrieved source URL longer than 300 characters without truncating its identity", async () => {
    const url = first + "a".repeat(320);
    const result = await call([url], [snapshot(url, "First")]);
    expect(result.competitorSnapshots[0].competitorUrl).toBe(url);
  });
  it("ignores contradictory URL aliases instead of choosing one source", async () => {
    const result = await call([first], [{ ...snapshot(first, "Conflicting"), url: third }]);
    expect(result.competitorSnapshots[0]).toMatchObject({
      competitorUrl: first,
      title: "Observed first.example",
      notableStrengths: [],
    });
  });
  it("keeps matching legacy URL aliases without letting them replace the observed identity", async () => {
    const result = await call(
      [first],
      [{ competitor_url: first, title: "First", notableStrengths: ["Source strength"] }],
    );
    expect(result.competitorSnapshots[0]).toMatchObject({
      competitorUrl: first,
      title: "First",
      notableStrengths: ["Source strength"],
    });
  });
  it("rejects oversized source input before usage, page retrieval or model requests", async () => {
    await expect(call([first + "a".repeat(4096)], [])).rejects.toThrow();
    expect(h.usage).not.toHaveBeenCalled();
    expect(h.page).not.toHaveBeenCalled();
    expect(h.text).not.toHaveBeenCalled();
  });
  it("refuses an all-failed fetch before making a model request", async () => {
    h.page.mockResolvedValue("");
    await expect(call([first], [])).rejects.toThrow("Could not fetch any");
    expect(h.page).toHaveBeenCalledExactlyOnceWith(first);
    expect(h.text).not.toHaveBeenCalled();
  });
});
