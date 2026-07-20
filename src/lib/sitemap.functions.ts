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
import { isValidHttpSourceUrl } from "./sources";
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

/** Read a response body up to `maxBytes`, cancelling the stream past the cap. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  const capped = Math.min(total, maxBytes);
  const out = new Uint8Array(capped);
  let off = 0;
  for (const c of chunks) {
    if (off >= capped) break;
    const take = Math.min(c.length, capped - off);
    out.set(c.subarray(0, take), off);
    off += take;
  }
  return new TextDecoder().decode(out);
}

/** Bounded, SSRF-guarded fetch of one sitemap document. Returns null on any failure. */
async function boundedFetch(url: string): Promise<SitemapFetchResult | null> {
  if (!isValidHttpSourceUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEMAP_TIMEOUT_MS);
  const headers = { "User-Agent": "MiloGrowthSitemapBot/1.0 (+https://milogrowth.com)" };
  try {
    let current = url;
    for (let hop = 0; hop <= SITEMAP_MAX_REDIRECTS; hop++) {
      if (!isValidHttpSourceUrl(current)) return null;
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hop >= SITEMAP_MAX_REDIRECTS) return null;
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "";
      const body = await readCapped(res, SITEMAP_MAX_BYTES);
      return { ok: true, contentType, body };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchSitemapInventoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ siteUrl: z.string() }).parse(input))
  .handler(async ({ data }): Promise<SitemapInventory | null> => {
    const raw = (data.siteUrl || "").trim();
    const origin = originOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!origin || !isValidHttpSourceUrl(origin)) return null;

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
