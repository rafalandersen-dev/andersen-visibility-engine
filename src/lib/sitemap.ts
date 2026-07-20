/**
 * Sitemap URL inventory — Article Studio 2.0 / P1.1 D (pure core).
 *
 * A lightweight, deterministic inventory of a site's OWN URLs, read from its
 * sitemap(s) — NOT a crawl. It feeds the VERIFIED internal-path set so in-body
 * links to real customer pages (e.g. /services, /about) resolve without the user
 * approving each one. The three-state contract (VERIFIED / USER_APPROVED /
 * UNRESOLVED) is unchanged — this only widens VERIFIED.
 *
 * Security + bounds are non-negotiable (D requirements). The network fetch lives
 * in `sitemap.functions.ts`; the orchestration here takes an injected fetcher so
 * every cap (depth, file count, URL count, cross-origin, malformed XML) is
 * unit-testable without I/O.
 */
import { normalizeInternalPath } from "./markdown";
import { isValidHttpSourceUrl } from "./sources";
import type { SitemapInventory } from "./types";

export const SITEMAP_MAX_DEPTH = 3; // sitemapindex nesting (start = 0)
export const SITEMAP_MAX_FILES = 10; // total sitemap documents fetched
export const SITEMAP_MAX_URLS = 2000; // total page URLs kept
export const SITEMAP_MAX_BYTES = 5_000_000; // per-document response cap
export const SITEMAP_MAX_REDIRECTS = 3;
export const SITEMAP_TIMEOUT_MS = 8000;
export const SITEMAP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SitemapCaps {
  maxDepth: number;
  maxFiles: number;
  maxUrls: number;
}

export const DEFAULT_SITEMAP_CAPS: SitemapCaps = {
  maxDepth: SITEMAP_MAX_DEPTH,
  maxFiles: SITEMAP_MAX_FILES,
  maxUrls: SITEMAP_MAX_URLS,
};

/** The result of one bounded fetch (the network fetcher enforces size/timeout/SSRF). */
export interface SitemapFetchResult {
  ok: boolean;
  contentType: string;
  body: string;
}

export type SitemapFetcher = (url: string) => Promise<SitemapFetchResult | null>;

/** Only XML (or text, which some servers use) is parsed; HTML/others are ignored. */
export function isXmlContentType(ct: string): boolean {
  if (!ct) return true; // absent content-type → attempt parse (many static hosts omit it)
  return /application\/xml|text\/xml|application\/rss|text\/plain|\+xml/i.test(ct);
}

/** The origin of a URL, or "" if unparseable. */
export function originOf(raw: string): string {
  try {
    return new URL((raw || "").trim()).origin;
  } catch {
    return "";
  }
}

/** True when `url` is a safe public http(s) URL on exactly `origin`. */
export function isSameOriginSafe(url: string, origin: string): boolean {
  if (!isValidHttpSourceUrl(url)) return false;
  return originOf(url) === origin;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Extract `<loc>` values and whether the document is a sitemap INDEX. Tolerant
 * by design — a malformed document simply yields the locs it can find (or none),
 * and never throws. Uses regex, not an XML parser, so there is no XXE surface.
 */
export function parseSitemapLocs(xml: string): { locs: string[]; isIndex: boolean } {
  const text = xml || "";
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = decodeXmlEntities(m[1].trim());
    if (v) locs.push(v);
  }
  return { locs, isIndex };
}

/** Normalised same-origin path for a `<loc>` URL, or "" if cross-origin/unsafe. */
export function sameOriginPath(loc: string, origin: string): string {
  if (!isSameOriginSafe(loc, origin)) return "";
  try {
    return normalizeInternalPath(new URL(loc).pathname);
  } catch {
    return "";
  }
}

/**
 * Walk a site's sitemap(s) breadth-first under strict caps, returning a compact
 * inventory of same-origin paths. Cross-origin entries are ignored; malformed
 * documents are skipped; the crawl stops at the file/URL/depth caps and flags
 * `truncated`. `fetcher` returning null (oversize / timeout / blocked / non-2xx)
 * is treated as an unreachable document and skipped.
 */
export async function crawlSitemap(
  origin: string,
  startUrl: string,
  fetcher: SitemapFetcher,
  caps: SitemapCaps = DEFAULT_SITEMAP_CAPS,
): Promise<{ paths: string[]; sitemapCount: number; urlCount: number; truncated: boolean }> {
  const paths = new Set<string>();
  const seen = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  let files = 0;
  let truncated = false;

  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    if (paths.size >= caps.maxUrls) {
      truncated = true;
      break;
    }
    if (files >= caps.maxFiles) {
      truncated = true;
      break;
    }
    if (item.depth > caps.maxDepth) continue;
    if (!isSameOriginSafe(item.url, origin)) continue;
    const key = normalizeInternalPath(new URL(item.url).pathname) + "?sm";
    if (seen.has(key)) continue;
    seen.add(key);

    const res = await fetcher(item.url);
    files++;
    if (!res || !res.ok || !isXmlContentType(res.contentType)) continue;

    const { locs, isIndex } = parseSitemapLocs(res.body);
    if (isIndex) {
      for (const child of locs) {
        if (files + queue.length >= caps.maxFiles) {
          truncated = true;
          break;
        }
        if (isSameOriginSafe(child, origin)) queue.push({ url: child, depth: item.depth + 1 });
      }
    } else {
      for (const loc of locs) {
        if (paths.size >= caps.maxUrls) {
          truncated = true;
          break;
        }
        const p = sameOriginPath(loc, origin);
        if (p) paths.add(p);
      }
    }
  }

  return { paths: [...paths], sitemapCount: files, urlCount: paths.size, truncated };
}

/** True while a cached inventory is still fresh (drives client re-fetch). */
export function isSitemapInventoryFresh(
  inv: SitemapInventory | undefined,
  nowMs: number,
  ttlMs: number = SITEMAP_CACHE_TTL_MS,
): boolean {
  if (!inv || !inv.fetchedAt) return false;
  const t = Date.parse(inv.fetchedAt);
  return Number.isFinite(t) && nowMs - t < ttlMs;
}
