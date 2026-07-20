/**
 * Sitemap inventory fetch — server-only, Article Studio 2.0 / P1.1 D.
 *
 * Reads a site's OWN sitemap(s) to inventory its existing URLs. Strictly bounded
 * and secure (D requirements): authenticated-only; http/https + anti-SSRF guard
 * (loopback / private / link-local / metadata blocked); same-origin only; content
 * type validated; manual redirects capped and re-validated each hop; per-document
 * response-size cap via a streamed read; per-request timeout; file/URL/depth caps
 * (in crawlSitemap); malformed XML tolerated. It is NOT a site crawl, and it
 * never stores raw XML — only the compact same-origin path inventory.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isSafePublicUrl, safeFetch } from "./safe-fetch";
import {
  crawlSitemap,
  originOf,
  DEFAULT_SITEMAP_CAPS,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_REDIRECTS,
  SITEMAP_MAX_URLS,
  SITEMAP_TIMEOUT_MS,
  type SitemapFetchResult,
} from "./sitemap";
import type { SitemapInventory } from "./types";

/** Bounded, SSRF-guarded fetch of one sitemap document via the shared layer. */
async function boundedFetch(url: string): Promise<SitemapFetchResult | null> {
  const res = await safeFetch(url, {
    method: "GET",
    maxBytes: SITEMAP_MAX_BYTES,
    maxRedirects: SITEMAP_MAX_REDIRECTS,
    timeoutMs: SITEMAP_TIMEOUT_MS,
    headers: { "User-Agent": "MiloGrowthSitemapBot/1.0 (+https://milogrowth.com)" },
  });
  return res.ok ? { ok: true, contentType: res.contentType, body: res.body } : null;
}

export const fetchSitemapInventoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ siteUrl: z.string() }).parse(input))
  .handler(async ({ data }): Promise<SitemapInventory | null> => {
    const raw = (data.siteUrl || "").trim();
    const origin = originOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!origin || !isSafePublicUrl(origin)) return null;

    // Standard start point handles index recursion; fall back only if it 404s.
    let r = await crawlSitemap(origin, `${origin}/sitemap.xml`, boundedFetch, DEFAULT_SITEMAP_CAPS);
    if (r.urlCount === 0) {
      const alt = await crawlSitemap(
        origin,
        `${origin}/sitemap_index.xml`,
        boundedFetch,
        DEFAULT_SITEMAP_CAPS,
      );
      if (alt.urlCount > 0) r = alt;
    }

    const paths = [...new Set(["/", ...r.paths])].slice(0, SITEMAP_MAX_URLS);
    return {
      paths,
      fetchedAt: new Date().toISOString(),
      urlCount: paths.length,
      sitemapCount: r.sitemapCount,
      truncated: r.truncated,
    };
  });
