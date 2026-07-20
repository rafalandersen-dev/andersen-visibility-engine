/**
 * Sitemap inventory (Article Studio 2.0 / P1.1 D).
 *
 * Security + bounds are the whole point, so they are tested exhaustively via an
 * injected fetcher (no network): recursion/file/URL caps, malformed XML,
 * cross-origin exclusion, SSRF/localhost blocking, oversized-response handling,
 * plus the VERIFIED-set wiring and cache freshness.
 */
import { describe, it, expect } from "vitest";
import {
  parseSitemapLocs,
  sameOriginPath,
  isSameOriginSafe,
  isXmlContentType,
  crawlSitemap,
  isSitemapInventoryFresh,
  SITEMAP_CACHE_TTL_MS,
  type SitemapFetcher,
} from "./sitemap";
import { buildKnownInternalPaths } from "./publish-targets";
import type { ContentAsset, Project, SitemapInventory } from "./types";

const ORIGIN = "https://site.com";

/** Build an injected fetcher from a url→xml map. Unknown urls resolve to null. */
function fetcherFrom(map: Record<string, string>, contentType = "application/xml"): SitemapFetcher {
  return async (url) => (url in map ? { ok: true, contentType, body: map[url] } : null);
}

const urlset = (paths: string[]) =>
  `<?xml version="1.0"?><urlset>${paths.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join("")}</urlset>`;
const index = (children: string[]) =>
  `<?xml version="1.0"?><sitemapindex>${children.map((c) => `<sitemap><loc>${c}</loc></sitemap>`).join("")}</sitemapindex>`;

describe("parseSitemapLocs", () => {
  it("extracts locs and detects an index", () => {
    expect(parseSitemapLocs(urlset(["/a", "/b"]))).toEqual({
      locs: [`${ORIGIN}/a`, `${ORIGIN}/b`],
      isIndex: false,
    });
    expect(parseSitemapLocs(index([`${ORIGIN}/s1.xml`])).isIndex).toBe(true);
  });
  it("tolerates malformed XML without throwing (returns what it can)", () => {
    expect(parseSitemapLocs("<urlset><loc>oops")).toEqual({ locs: [], isIndex: false });
    expect(parseSitemapLocs("total garbage &&& <>")).toEqual({ locs: [], isIndex: false });
    expect(parseSitemapLocs("")).toEqual({ locs: [], isIndex: false });
  });
  it("decodes &amp; in URLs", () => {
    expect(
      parseSitemapLocs(`<urlset><url><loc>${ORIGIN}/a?x=1&amp;y=2</loc></url></urlset>`).locs,
    ).toEqual([`${ORIGIN}/a?x=1&y=2`]);
  });
});

describe("same-origin + SSRF guards", () => {
  it("keeps same-origin paths, drops cross-origin", () => {
    expect(sameOriginPath(`${ORIGIN}/services`, ORIGIN)).toBe("/services");
    expect(sameOriginPath("https://evil.com/x", ORIGIN)).toBe("");
  });
  it("blocks localhost / private / link-local / metadata origins", () => {
    for (const bad of [
      "http://localhost/sitemap.xml",
      "http://127.0.0.1/sitemap.xml",
      "http://10.0.0.1/sitemap.xml",
      "http://169.254.169.254/sitemap.xml",
      "http://192.168.0.1/sitemap.xml",
    ]) {
      expect(isSameOriginSafe(bad, new URL(bad).origin)).toBe(false);
    }
  });
  it("only parses xml/text content types", () => {
    expect(isXmlContentType("application/xml")).toBe(true);
    expect(isXmlContentType("text/xml; charset=utf-8")).toBe(true);
    expect(isXmlContentType("")).toBe(true);
    expect(isXmlContentType("text/html")).toBe(false);
  });
});

describe("crawlSitemap — bounds", () => {
  it("collects same-origin paths from a urlset, ignoring cross-origin entries", async () => {
    const map = {
      [`${ORIGIN}/sitemap.xml`]: `<urlset><url><loc>${ORIGIN}/a</loc></url><url><loc>https://evil.com/b</loc></url><url><loc>${ORIGIN}/c</loc></url></urlset>`,
    };
    const r = await crawlSitemap(ORIGIN, `${ORIGIN}/sitemap.xml`, fetcherFrom(map));
    expect(r.paths.sort()).toEqual(["/a", "/c"]);
    expect(r.urlCount).toBe(2);
  });

  it("recurses an index but stops at the depth cap", async () => {
    // index -> index -> index -> urlset (depth 3). With maxDepth 2 the deepest is skipped.
    const map = {
      [`${ORIGIN}/sitemap.xml`]: index([`${ORIGIN}/i1.xml`]),
      [`${ORIGIN}/i1.xml`]: index([`${ORIGIN}/i2.xml`]),
      [`${ORIGIN}/i2.xml`]: index([`${ORIGIN}/deep.xml`]),
      [`${ORIGIN}/deep.xml`]: urlset(["/too-deep"]),
    };
    const r = await crawlSitemap(ORIGIN, `${ORIGIN}/sitemap.xml`, fetcherFrom(map), {
      maxDepth: 2,
      maxFiles: 50,
      maxUrls: 50,
    });
    expect(r.paths).not.toContain("/too-deep");
  });

  it("caps total sitemap files (index with many children) and flags truncated", async () => {
    const children = Array.from({ length: 20 }, (_, i) => `${ORIGIN}/s${i}.xml`);
    const map: Record<string, string> = { [`${ORIGIN}/sitemap.xml`]: index(children) };
    children.forEach((c, i) => (map[c] = urlset([`/p${i}`])));
    const r = await crawlSitemap(ORIGIN, `${ORIGIN}/sitemap.xml`, fetcherFrom(map), {
      maxDepth: 3,
      maxFiles: 5,
      maxUrls: 100,
    });
    expect(r.sitemapCount).toBeLessThanOrEqual(5);
    expect(r.truncated).toBe(true);
  });

  it("caps total URLs", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `/p${i}`);
    const r = await crawlSitemap(
      ORIGIN,
      `${ORIGIN}/sitemap.xml`,
      fetcherFrom({ [`${ORIGIN}/sitemap.xml`]: urlset(many) }),
      {
        maxDepth: 2,
        maxFiles: 10,
        maxUrls: 5,
      },
    );
    expect(r.urlCount).toBe(5);
    expect(r.truncated).toBe(true);
  });

  it("treats an oversized/timed-out/blocked document (null fetch) as unreachable, no throw", async () => {
    // Fetcher returns null for the sitemap → no paths, still counts the attempt.
    const r = await crawlSitemap(ORIGIN, `${ORIGIN}/sitemap.xml`, async () => null);
    expect(r.paths).toEqual([]);
    expect(r.urlCount).toBe(0);
  });

  it("ignores an html document (wrong content type)", async () => {
    const r = await crawlSitemap(ORIGIN, `${ORIGIN}/sitemap.xml`, async () => ({
      ok: true,
      contentType: "text/html",
      body: urlset(["/a"]),
    }));
    expect(r.paths).toEqual([]);
  });
});

describe("cache freshness", () => {
  const inv = (fetchedAt: string): SitemapInventory => ({
    paths: ["/"],
    fetchedAt,
    urlCount: 1,
    sitemapCount: 1,
    truncated: false,
  });
  it("fresh within TTL, stale beyond it", () => {
    const now = 1_000_000_000_000;
    expect(isSitemapInventoryFresh(inv(new Date(now - 1000).toISOString()), now)).toBe(true);
    expect(
      isSitemapInventoryFresh(inv(new Date(now - SITEMAP_CACHE_TTL_MS - 1).toISOString()), now),
    ).toBe(false);
    expect(isSitemapInventoryFresh(undefined, now)).toBe(false);
  });
});

describe("sitemap paths become VERIFIED in the internal-path inventory", () => {
  it("buildKnownInternalPaths includes cached same-origin sitemap paths", () => {
    const project = {
      id: "p1",
      name: "N",
      websiteUrl: "https://site.com",
      sitemapInventory: {
        paths: ["/services", "/about"],
        fetchedAt: new Date().toISOString(),
        urlCount: 2,
        sitemapCount: 1,
        truncated: false,
      },
    } as Project;
    const known = new Set(buildKnownInternalPaths(project, [] as ContentAsset[]));
    expect(known.has("/services")).toBe(true);
    expect(known.has("/about")).toBe(true);
    expect(known.has("/")).toBe(true);
  });
});
