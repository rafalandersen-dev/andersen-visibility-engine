import { TechnicalCrawlAdmissionError } from "./technical-crawl-admission";
import { describe, it, expect, vi } from "vitest";
import {
  advanceTechnicalCrawl,
  startTechnicalCrawl,
  type TechnicalPageFetcher,
} from "./technical-crawl";
import { robotsEvidence } from "./technical-robots";
const now = "2026-09-11T00:00:00Z";
const start = (body = "", extra = {}) =>
  startTechnicalCrawl({
    siteUrl: "https://example.test",
    now,
    robots: robotsEvidence(200, body),
    robotsFetchedAt: now,
    ...extra,
  });
const response = (url: string, body: string) => ({
  state: "response" as const,
  url,
  status: 200,
  headers: { "content-type": "text/html" },
  body,
});
describe("resumable technical crawl", () => {
  it("removes an accepted redirect destination from the pending queue", async () => {
    const saved = start();
    saved.queue = [
      { url: "https://example.test/old", depth: 1 },
      { url: "https://example.test/new", depth: 1 },
      { url: "https://example.test/other", depth: 1 },
    ];
    const fetch = vi
      .fn<TechnicalPageFetcher>()
      .mockResolvedValueOnce(response("https://example.test/new", "<title>New</title>"))
      .mockResolvedValueOnce(response("https://example.test/other", "<title>Other</title>"));
    const first = await advanceTechnicalCrawl(saved, fetch, now);
    expect(first.queue).toEqual([{ url: "https://example.test/other", depth: 1 }]);
    const second = await advanceTechnicalCrawl(first, fetch, now);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://example.test/old",
      "https://example.test/other",
    ]);
    expect(second.pages).toHaveLength(2);
    expect(saved.queue).toHaveLength(3);
  });

  it("propagates admission holds without consuming the queued page", async () => {
    const saved = start();
    const before = structuredClone(saved);
    await expect(
      advanceTechnicalCrawl(
        saved,
        async () => {
          throw new TechnicalCrawlAdmissionError("capacity");
        },
        now,
      ),
    ).rejects.toMatchObject({ reason: "capacity" });
    expect(saved).toEqual(before);
  });

  it("resumes one page at a time and preserves the prior snapshot", async () => {
    const original = start();
    const fetch = vi
      .fn<TechnicalPageFetcher>()
      .mockResolvedValueOnce(response("https://example.test/", '<a href="/next">Next</a>'))
      .mockResolvedValueOnce(response("https://example.test/next", "<title>Next</title>"));
    const first = await advanceTechnicalCrawl(original, fetch, now);
    expect(first.status).toBe("running");
    expect(original.pages).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    const final = await advanceTechnicalCrawl(JSON.parse(JSON.stringify(first)), fetch, now);
    expect(final.status).toBe("completed");
    expect(final.pages.map((p) => p.depth)).toEqual([0, 1]);
    expect(final.coverageLimits).toEqual([]);
  });
  it.each(["User-agent: *\nDisallow: /", null])(
    "does not fetch disallowed or unknown paths",
    async (body) => {
      const state = body === null ? start("", { robots: robotsEvidence(503) }) : start(body);
      const fetch = vi.fn<TechnicalPageFetcher>();
      const result = await advanceTechnicalCrawl(state, fetch, now);
      expect(fetch).not.toHaveBeenCalled();
      expect(result.coverageLimits).toContain("unobserved_pages");
    },
  );
  it("does not interpret sitemap seeds as known link depth", async () => {
    const state = start("", { sitemapUrls: ["https://example.test/deep", "https://other.test/"] });
    expect(state.queue.map((q) => q.depth)).toEqual([0, null]);
    const result = await advanceTechnicalCrawl(
      state,
      async () => response("https://example.test/", '<a href="/deep">Link</a>'),
      now,
    );
    expect(result.queue[0].depth).toBe(1);
  });
  it("reports page and depth limits instead of claiming full coverage", async () => {
    const fetch = async () => response("https://example.test/", '<a href="/next">Next</a>');
    const pages = await advanceTechnicalCrawl(start("", { pages: 1 }), fetch, now);
    expect(pages.coverageLimits).toContain("page_limit");
    expect(pages.queue).toHaveLength(1);
    const depth = await advanceTechnicalCrawl(start("", { depth: 0 }), fetch, now);
    expect(depth.coverageLimits).toContain("depth_limit");
  });
  it("retains failed results and rejects cross-origin observations", async () => {
    const failed = await advanceTechnicalCrawl(
      start(),
      async () => {
        throw Error("network");
      },
      now,
    );
    expect(failed.pages[0].state).toBe("fetch_failed");
    const escaped = await advanceTechnicalCrawl(
      start(),
      async () => response("https://other.test/", "<title>Other</title>"),
      now,
    );
    expect(escaped.pages[0].state).toBe("out_of_scope");
    expect(escaped.pages[0].observation).toBeUndefined();
  });
  it("does not execute a cancelled or stale-robots step", async () => {
    const fetch = vi.fn<TechnicalPageFetcher>();
    expect((await advanceTechnicalCrawl(start(), fetch, now, true)).status).toBe("cancelled");
    expect((await advanceTechnicalCrawl(start(), fetch, "2026-09-13T00:00:00Z")).status).toBe(
      "robots_stale",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("deduplicates fragments and keeps distinct query URLs", async () => {
    const result = await advanceTechnicalCrawl(
      start(),
      async () =>
        response(
          "https://example.test/",
          '<a href="/a#one">A</a><a href="/a#two">A</a><a href="/a?q=1">A</a>',
        ),
      now,
    );
    expect(result.queue.map((q) => q.url)).toEqual([
      "https://example.test/a",
      "https://example.test/a?q=1",
    ]);
  });
});
