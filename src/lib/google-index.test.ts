import { describe, it, expect, vi } from "vitest";
import { inspectionInProperty, normalizeGoogleIndex } from "./google-index";
import { fetchGoogleIndex } from "./google-index-transport.server";
const context = {
  url: "https://example.com/page?variant=two",
  property: "sc-domain:example.com",
  observedAt: "2026-09-11T10:00:00Z",
};
describe("Google indexed-version evidence", () => {
  it("preserves exact query URLs and restricts domain and prefix properties", () => {
    expect(inspectionInProperty(context.url, context.property)).toBe(true);
    expect(inspectionInProperty("https://sub.example.com/page?x=1", context.property)).toBe(true);
    expect(inspectionInProperty("https://example.com.evil.test/page", context.property)).toBe(
      false,
    );
    expect(
      inspectionInProperty("https://example.com/private/page?x=1", "https://example.com/public/"),
    ).toBe(false);
    for (const url of [
      "https://user:password@example.com/",
      "javascript:alert(1)",
      "https://example.com/page#fragment",
    ])
      expect(inspectionInProperty(url, context.property)).toBe(false);
  });
  it("keeps unavailable fields unknown and cannot imply a live test", () => {
    expect(normalizeGoogleIndex({ inspectionResult: {} }, context)).toMatchObject({
      url: context.url,
      source: "google_index",
      inspectionMode: "indexed_version",
      indexStatusAvailable: false,
      verdict: null,
      lastCrawlTime: null,
      googleCanonical: null,
    });
  });
  it("separates request time from crawl time, allows cross-domain canonical observations and drops unsupported fields", () => {
    const result = normalizeGoogleIndex(
      {
        inspectionResult: {
          indexStatusResult: {
            verdict: "PASS",
            lastCrawlTime: "2026-09-01T08:00:00Z",
            googleCanonical: "https://canonical.test/page?lang=en",
            indexingState: "NEW_UNKNOWN_STATE",
            rawSecret: "do not copy",
          },
          inspectionResultLink: "https://evil.test/",
        },
      },
      context,
    );
    expect(result).toMatchObject({
      verdict: "PASS",
      observedAt: context.observedAt,
      lastCrawlTime: "2026-09-01T08:00:00Z",
      googleCanonical: "https://canonical.test/page?lang=en",
      indexingState: null,
      inspectionResultLink: null,
    });
    expect(JSON.stringify(result)).not.toContain("do not copy");
  });
  it("marks capped or invalid URL evidence incomplete", () => {
    const result = normalizeGoogleIndex(
      {
        inspectionResult: {
          indexStatusResult: {
            sitemap: Array.from({ length: 101 }, (_, i) => `https://example.com/sitemap${i}.xml`),
            referringUrls: ["javascript:bad"],
          },
        },
      },
      context,
    );
    expect(result.sitemaps.values).toHaveLength(100);
    expect(result.sitemaps.complete).toBe(false);
    expect(result.referringUrls).toEqual({ values: [], complete: false });
  });
  it("posts only to Google's fixed endpoint with redirects refused", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: "PASS" } } }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    const result = await fetchGoogleIndex("test-token", context.property, context.url, request);
    expect(request).toHaveBeenCalledWith(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      expect.objectContaining({
        redirect: "error",
        method: "POST",
        body: JSON.stringify({
          inspectionUrl: context.url,
          siteUrl: context.property,
          languageCode: "en-US",
        }),
      }),
    );
    expect(result.verdict).toBe("PASS");
    expect(JSON.stringify(result)).not.toContain("test-token");
  });
  it("rejects out-of-property requests before network access", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      fetchGoogleIndex("test-token", context.property, "https://other.test/", request),
    ).rejects.toThrow("google_inspection_scope");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    "returns safe errors without provider body for status %i",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private provider detail", { status }));
      await expect(
        fetchGoogleIndex("test-token", context.property, context.url, request),
      ).rejects.toThrow(
        status === 429
          ? "google_inspection_quota"
          : status === 500
            ? "google_inspection_unavailable"
            : "google_inspection_access",
      );
    },
  );
  it.each(["invalid-json", "oversize", "wrong-type", "missing-result"])(
    "rejects unusable provider responses: %s",
    async (kind) => {
      const body =
        kind === "oversize" ? "x".repeat(1048577) : kind === "missing-result" ? "{}" : "bad-json";
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          headers: { "content-type": kind === "wrong-type" ? "text/html" : "application/json" },
        }),
      );
      await expect(
        fetchGoogleIndex("test-token", context.property, context.url, request),
      ).rejects.toThrow("google_inspection_unavailable");
    },
  );
});

it("bounds shared serialized URL evidence after Unicode expansion", () => {
  const urls = Array.from(
    { length: 100 },
    (_, i) => `https://example.com/${"é".repeat(1250)}?i=${i}`,
  );
  const raw = {
    inspectionResult: {
      indexStatusResult: { sitemap: urls, referringUrls: urls, verdict: "PASS" },
    },
  };
  expect(new TextEncoder().encode(JSON.stringify(raw)).length).toBeLessThan(1048576);
  const result = normalizeGoogleIndex(raw, context);
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(300000);
  expect(result.sitemaps.complete).toBe(false);
  expect(result.referringUrls.complete).toBe(false);
  expect(result.sitemaps.values.length).toBeGreaterThan(0);
  expect(result.verdict).toBe("PASS");
  const oversized = normalizeGoogleIndex(
    {
      inspectionResult: {
        indexStatusResult: { sitemap: [`https://example.com/${"é".repeat(2000)}`] },
      },
    },
    context,
  );
  expect(oversized.sitemaps).toEqual({ values: [], complete: false });
});
