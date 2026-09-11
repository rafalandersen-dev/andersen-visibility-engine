import { TechnicalCrawlAdmissionError } from "./technical-crawl-admission";
import { startTechnicalCrawl } from "./technical-crawl";
import { parseTechnicalCrawlState } from "./technical-crawl-state";
import { describe, it, expect, vi } from "vitest";
import {
  inspectSitemapXml,
  inspectSitemapText,
  startTechnicalSitemaps,
  advanceTechnicalSitemaps,
} from "./technical-sitemap";
import { robotsEvidence } from "./technical-robots";
const origin = "https://example.test",
  now = "2026-09-11T10:00:00.000Z",
  robots = robotsEvidence(404);
const set = (locs: string[]) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join("")}</urlset>`;
const response = (body: string, url = origin + "/sitemap.xml") => ({
  body,
  url,
  status: 200,
  contentAccepted: true,
  truncated: false,
  observedAt: now,
});
describe("observed sitemap XML", () => {
  it("rejects text input before rejected entries exceed durable state bounds", async () => {
    const malformed = Array(50001).fill("x").join("\n");
    expect(inspectSitemapText(malformed)).toBeNull();
    expect(inspectSitemapText(Array(50000).fill("x").join("\n"))?.rejected).toBe(50000);
    const sitemaps = await advanceTechnicalSitemaps(
      startTechnicalSitemaps(origin, []),
      origin,
      robots,
      async () => ({ ...response(malformed), headers: { "content-type": "text/plain" } }),
      now,
    );
    expect(sitemaps.files[0].state).toBe("invalid_text");
    const crawl = startTechnicalCrawl({ siteUrl: origin, robots, robotsFetchedAt: now, now });
    expect(parseTechnicalCrawlState({ ...crawl, sitemaps }, origin).sitemaps?.files[0].state).toBe(
      "invalid_text",
    );
  });
  it("removes accepted redirected sitemap destinations from the pending queue", async () => {
    const initial = startTechnicalSitemaps(origin, []);
    const fetch = vi.fn(async () =>
      response(set([origin + "/page"]), origin + "/sitemap_index.xml"),
    );
    const next = await advanceTechnicalSitemaps(initial, origin, robots, fetch, now);
    expect(next.queue).toEqual([]);
    expect(next.files).toHaveLength(1);
    expect(initial.queue).toHaveLength(2);
    await advanceTechnicalSitemaps(next, origin, robots, fetch, now);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("retains robots policy and a durable limitation for oversized sitemap directives", () => {
    const evidence = robotsEvidence(
      200,
      `User-agent: *\nDisallow: /private\nSitemap: ${origin}/${"é".repeat(2000)}\nSitemap: ${origin}/valid.xml`,
    );
    expect(evidence.state).toBe("read");
    if (evidence.state !== "read") throw Error("policy lost");
    expect(evidence.document.complete).toBe(true);
    expect(evidence.document.sitemapsComplete).toBe(false);
    expect(evidence.document.sitemaps).toEqual([origin + "/valid.xml"]);
    expect(evidence.document.groups[0].rules[0].pattern).toBe("/private");
    const state = startTechnicalCrawl({
      siteUrl: origin,
      robots: evidence,
      robotsFetchedAt: now,
      now,
    });
    state.sitemaps = startTechnicalSitemaps(
      origin,
      evidence.document.sitemaps,
      evidence.document.sitemapsComplete !== false,
    );
    const restored = parseTechnicalCrawlState(state, origin);
    expect(restored.sitemaps?.limitations).toContain("robots_directives");
  });
  it("records the robots sitemap count limit independently of its access rules", () => {
    const evidence = robotsEvidence(
      200,
      "User-agent: *\nAllow: /\n" +
        Array.from({ length: 101 }, (_, i) => `Sitemap: ${origin}/${i}.xml`).join("\n"),
    );
    expect(evidence.state).toBe("read");
    if (evidence.state !== "read") throw Error("policy lost");
    expect(evidence.document.sitemaps).toHaveLength(100);
    expect(evidence.document.sitemapsComplete).toBe(false);
  });

  it("propagates admission holds without consuming the sitemap queue", async () => {
    const saved = startTechnicalSitemaps(origin, []);
    const before = structuredClone(saved);
    await expect(
      advanceTechnicalSitemaps(
        saved,
        origin,
        robots,
        async () => {
          throw new TechnicalCrawlAdmissionError("capacity");
        },
        now,
      ),
    ).rejects.toMatchObject({ reason: "capacity" });
    expect(saved).toEqual(before);
  });

  it("does not invent membership from missing or duplicate required locs", () => {
    const parsed = inspectSitemapXml(
      `<urlset><url/><url><loc>${origin}/a</loc><loc>${origin}/b</loc></url><url><loc>${origin}/valid</loc></url></urlset>`,
    );
    expect(parsed).toEqual({ kind: "urlset", locs: [origin + "/valid"], rejected: 2 });
  });
  it("handles namespace prefixes, XML entities and CDATA without extension-image locs", () => {
    const result = inspectSitemapXml(
      `<s:urlset xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:i="urn:images"><s:url><s:loc><![CDATA[https://example.test/a?q=1&b=2]]></s:loc><i:image><i:loc>https://example.test/ignore.png</i:loc></i:image></s:url><s:url><s:loc>https://example.test/&#98;?q=1&amp;x=2</s:loc></s:url></s:urlset>`,
    );
    expect(result?.locs).toEqual([origin + "/a?q=1&b=2", origin + "/b?q=1&x=2"]);
    expect(result?.kind).toBe("urlset");
  });
  it.each([
    "<urlset><url></urlset>",
    "<!DOCTYPE x SYSTEM 'https://example.test/private'><urlset/>",
    "<html><loc>https://example.test/a</loc></html>",
    "<urlset><url><loc>&custom;</loc></url></urlset>",
    "<urlset><url><loc><b>https://example.test/a</b></loc></url></urlset>",
  ])("rejects malformed or unsupported XML %s", (xml) => {
    expect(inspectSitemapXml(xml)).toBeNull();
  });
  it("rejects oversized and deeply nested input without retaining partial locations", () => {
    expect(inspectSitemapXml(" ".repeat(512001))).toBeNull();
    expect(
      inspectSitemapXml(`<urlset>${"<x>".repeat(51)}${"</x>".repeat(51)}</urlset>`),
    ).toBeNull();
  });
});
describe("resumable sitemap evidence", () => {
  it("keeps exact query-bearing URLs, file membership, and out-of-scope limitations", async () => {
    const saved = startTechnicalSitemaps(origin, []);
    const next = await advanceTechnicalSitemaps(
      saved,
      origin,
      robots,
      async () => response(set([origin + "/a?q=1", origin + "/a?q=2", "https://other.test/a"])),
      now,
    );
    expect(next.entries.map((e) => e.url)).toEqual([origin + "/a?q=1", origin + "/a?q=2"]);
    expect(next.entries[0].files).toEqual([origin + "/sitemap.xml"]);
    expect(next.files[0]).toMatchObject({
      state: "read",
      status: 200,
      locCount: 3,
      rejectedCount: 1,
    });
    expect(next.limitations).toContain("out_of_scope");
    expect(saved.files).toEqual([]);
  });
  it("advances one file, follows bounded indexes and never queues a cycle", async () => {
    const fetch = vi.fn(async () =>
      response(
        `<sitemapindex><sitemap><loc>${origin}/sitemap.xml</loc></sitemap><sitemap><loc>${origin}/child.xml?q=2</loc></sitemap></sitemapindex>`,
      ),
    );
    const next = await advanceTechnicalSitemaps(
      startTechnicalSitemaps(origin, []),
      origin,
      robots,
      fetch,
      now,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(next.queue).toContainEqual({ url: origin + "/child.xml?q=2", depth: 1 });
    expect(next.queue.some((q) => q.url === origin + "/sitemap.xml")).toBe(false);
  });
  it("records unknown robots without any request", async () => {
    const fetch = vi.fn(async () => response(set([])));
    const next = await advanceTechnicalSitemaps(
      startTechnicalSitemaps(origin, []),
      origin,
      robotsEvidence(null),
      fetch,
      now,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(next.files[0].state).toBe("robots_unknown");
    expect(next.limitations).toContain("unreadable");
  });
  it.each(["oversize", "non_xml", "http_error"] as const)(
    "preserves %s as unobserved membership",
    async (state) => {
      const r = response(set([origin + "/a"]));
      if (state === "oversize") r.truncated = true;
      if (state === "non_xml") r.contentAccepted = false;
      if (state === "http_error") r.status = 503;
      const next = await advanceTechnicalSitemaps(
        startTechnicalSitemaps(origin, []),
        origin,
        robots,
        async () => r,
        now,
      );
      expect(next.files[0].state).toBe(state);
      expect(next.entries).toEqual([]);
    },
  );
  it("bounds URL discovery and index depth with explicit limitations", async () => {
    const next = await advanceTechnicalSitemaps(
      startTechnicalSitemaps(origin, []),
      origin,
      robots,
      async () => response(set(Array.from({ length: 2001 }, (_, i) => origin + `/p${i}`))),
      now,
    );
    expect(next.entries).toHaveLength(2000);
    expect(next.limitations).toContain("url_limit");
    const saved = startTechnicalSitemaps(origin, []);
    saved.queue = [{ url: origin + "/deep.xml", depth: 3 }];
    const deep = await advanceTechnicalSitemaps(
      saved,
      origin,
      robots,
      async () =>
        response(
          `<sitemapindex><sitemap><loc>${origin}/deeper.xml</loc></sitemap></sitemapindex>`,
          origin + "/deep.xml",
        ),
      now,
    );
    expect(deep.queue).toEqual([]);
    expect(deep.limitations).toContain("depth_limit");
  });
});

describe("plain-text sitemap observations", () => {
  it("preserves literal query parameters and handles BOM, blanks and CRLF", () => {
    expect(
      inspectSitemapText("\uFEFF" + origin + "/a?q=1&b=2\r\n\r\n" + origin + "/b\nrelative\n"),
    ).toEqual({ kind: "text", locs: [origin + "/a?q=1&b=2", origin + "/b"], rejected: 1 });
  });
  it("keeps text membership within the same scope and coverage limits", async () => {
    const state = startTechnicalSitemaps(origin, [origin + "/sitemap.txt"]);
    const next = await advanceTechnicalSitemaps(
      state,
      origin,
      robots,
      async () => ({
        ...response(
          origin + "/a\n" + origin + "/a\nhttps://foreign.test/b\nrelative",
          origin + "/sitemap.txt",
        ),
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
      now,
    );
    expect(next.files[0]).toMatchObject({
      kind: "text",
      state: "read",
      locCount: 3,
      rejectedCount: 2,
    });
    expect(next.entries).toEqual([{ url: origin + "/a", files: [origin + "/sitemap.txt"] }]);
    expect(next.limitations).toEqual(expect.arrayContaining(["out_of_scope", "invalid_entry"]));
    expect(state.files).toHaveLength(0);
    const crawl = startTechnicalCrawl({ siteUrl: origin, robots, robotsFetchedAt: now, now });
    expect(
      parseTechnicalCrawlState({ ...crawl, sitemaps: next }, origin).sitemaps?.files[0].kind,
    ).toBe("text");
  });
  it("still parses XML served as text/plain", async () => {
    const next = await advanceTechnicalSitemaps(
      startTechnicalSitemaps(origin, []),
      origin,
      robots,
      async () => ({
        ...response(set([origin + "/a"])),
        headers: { "content-type": "text/plain" },
      }),
      now,
    );
    expect(next.files[0]).toMatchObject({ state: "read", kind: "urlset" });
  });
  it("bounds text bytes, lines and rejects binary controls", () => {
    expect(inspectSitemapText("x".repeat(512001))).toBeNull();
    expect(inspectSitemapText("\n".repeat(50001))).toBeNull();
    expect(inspectSitemapText(origin + "/a\u0000")).toBeNull();
  });
  it("reports invalid text without preserving fabricated membership", async () => {
    const next = await advanceTechnicalSitemaps(
      startTechnicalSitemaps(origin, []),
      origin,
      robots,
      async () => ({
        ...response(origin + "/a\u0000"),
        headers: { "content-type": "text/plain" },
      }),
      now,
    );
    expect(next.files[0].state).toBe("invalid_text");
    expect(next.entries).toEqual([]);
    expect(next.limitations).toContain("unreadable");
  });
});
