import type { TechnicalSitemaps } from "./technical-sitemap";
import { isSafePublicUrl } from "./safe-fetch";
import { evaluateRobots, type RobotsEvidence } from "./technical-robots";
import { inspectTechnicalPage, type TechnicalPageObservation } from "./technical-page";

export type CrawlPage = {
  requestedUrl: string;
  depth: number | null;
  state:
    | "observed"
    | "robots_disallowed"
    | "robots_unknown"
    | "fetch_failed"
    | "out_of_scope"
    | "non_html"
    | "storage_limited";
  observation?: TechnicalPageObservation;
};
export type TechnicalCrawl = {
  origin: string;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "cancelled" | "robots_stale";
  limits: { pages: number; depth: number };
  robots: RobotsEvidence;
  robotsFetchedAt: string;
  sitemaps?: TechnicalSitemaps;
  queue: { url: string; depth: number | null }[];
  pages: CrawlPage[];
  coverageLimits: (
    | "page_limit"
    | "depth_limit"
    | "discovery_limit"
    | "partial_page"
    | "unobserved_pages"
    | "storage_limit"
  )[];
};
export type TechnicalPageFetcher = (url: string) => Promise<
  | { state: "failed" }
  | {
      state: "response";
      url: string;
      status: number;
      headers: Record<string, string>;
      truncated?: boolean;
      observedAt?: string;
      body: string;
    }
>;
const MAX_DISCOVERY = 2000;
const BOT = "MiloGrowthAuditBot";
function scoped(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (
      !isSafePublicUrl(url.href) ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.href.length > 8192
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function limitation(state: TechnicalCrawl, value: TechnicalCrawl["coverageLimits"][number]) {
  if (!state.coverageLimits.includes(value)) state.coverageLimits.push(value);
}

/** Create only from owner-approved canonical server context. Sitemap seeds have
 * unknown link depth; a sitemap entry is not evidence of a homepage link. */
export function startTechnicalCrawl(input: {
  siteUrl: string;
  now: string;
  robots: RobotsEvidence;
  robotsFetchedAt: string;
  sitemapUrls?: string[];
  pages?: number;
  depth?: number;
}): TechnicalCrawl {
  const origin = new URL(input.siteUrl).origin;
  const pages = input.pages ?? 100,
    depth = input.depth ?? 4;
  if (
    !scoped(input.siteUrl, origin) ||
    !Number.isFinite(Date.parse(input.now)) ||
    !Number.isFinite(Date.parse(input.robotsFetchedAt)) ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 200 ||
    !Number.isInteger(depth) ||
    depth < 0 ||
    depth > 10
  )
    throw new Error("technical_crawl_invalid");
  const state: TechnicalCrawl = {
    origin,
    startedAt: input.now,
    updatedAt: input.now,
    status: "running",
    limits: { pages, depth },
    robots: structuredClone(input.robots),
    robotsFetchedAt: input.robotsFetchedAt,
    queue: [{ url: origin + "/", depth: 0 }],
    pages: [],
    coverageLimits: [],
  };
  for (const raw of input.sitemapUrls ?? []) {
    const url = scoped(raw, origin);
    if (!url || state.queue.some((q) => q.url === url)) continue;
    if (state.queue.length >= MAX_DISCOVERY) {
      limitation(state, "discovery_limit");
      break;
    }
    state.queue.push({ url, depth: null });
  }
  return state;
}

/** One resumable transition. The caller owns durable leases, authorization,
 * cancellation and compare-and-swap persistence. The injected transport must
 * validate/pin every network destination BEFORE connection, including redirects.
 * This pure orchestrator alone never authorizes a server-side request. */
export async function advanceTechnicalCrawl(
  saved: TechnicalCrawl,
  fetchPage: TechnicalPageFetcher,
  now: string,
  cancelled = false,
): Promise<TechnicalCrawl> {
  const next = structuredClone(saved);
  const time = Date.parse(now),
    freshness = Date.parse(next.robotsFetchedAt);
  if (!Number.isFinite(time)) throw new Error("technical_crawl_invalid_time");
  if (next.status !== "running") return next;
  next.updatedAt = now;
  if (cancelled) {
    next.status = "cancelled";
    return next;
  }
  if (!Number.isFinite(freshness) || freshness > time || time - freshness > 24 * 60 * 60 * 1000) {
    next.status = "robots_stale";
    return next;
  }
  if (next.pages.length >= next.limits.pages) {
    if (next.queue.length) limitation(next, "page_limit");
    next.status = "completed";
    return next;
  }
  const target = next.queue.shift();
  if (!target) {
    next.status = "completed";
    return next;
  }
  if (!scoped(target.url, next.origin)) throw new Error("technical_crawl_scope_invalid");
  const permission = evaluateRobots(next.robots, BOT, target.url);
  const page: CrawlPage = { requestedUrl: target.url, depth: target.depth, state: "fetch_failed" };
  if (permission.decision !== "allowed")
    page.state = permission.decision === "disallowed" ? "robots_disallowed" : "robots_unknown";
  else {
    try {
      const response = await fetchPage(target.url);
      if (response.state === "response") {
        const finalUrl = scoped(response.url, next.origin);
        if (!finalUrl) page.state = "out_of_scope";
        else if (evaluateRobots(next.robots, BOT, finalUrl).decision !== "allowed")
          page.state = "robots_disallowed";
        else {
          const contentType =
            Object.entries(response.headers).find(
              ([key]) => key.toLowerCase() === "content-type",
            )?.[1] ?? "";
          if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType))
            page.state = "non_html";
          else {
            page.observation = inspectTechnicalPage({
              url: finalUrl,
              status: response.status,
              observedAt: response.observedAt ?? now,
              html: response.body,
              headers: response.headers,
            });
            if (response.truncated) page.observation.complete = false;
            page.state = "observed";
            if (!page.observation.complete) limitation(next, "partial_page");
            if (response.status >= 200 && response.status < 300)
              for (const link of page.observation.internalLinks) {
                const url = scoped(link, next.origin);
                if (
                  !url ||
                  url === target.url ||
                  url === finalUrl ||
                  next.pages.some((p) => p.requestedUrl === url || p.observation?.url === url)
                )
                  continue;
                const depth = target.depth === null ? null : target.depth + 1;
                if (depth !== null && depth > next.limits.depth) {
                  limitation(next, "depth_limit");
                  continue;
                }
                const queued = next.queue.find((q) => q.url === url);
                if (queued) {
                  if (depth !== null && (queued.depth === null || queued.depth > depth))
                    queued.depth = depth;
                  continue;
                }
                if (next.queue.length + next.pages.length + 1 >= MAX_DISCOVERY) {
                  limitation(next, "discovery_limit");
                  continue;
                }
                next.queue.push({ url, depth });
              }
          }
        }
      }
    } catch {
      /* A failed observation is retained; it never becomes a zero or pass. */
    }
  }
  next.pages.push(page);
  if (page.state !== "observed") limitation(next, "unobserved_pages");
  if (!next.queue.length) next.status = "completed";
  else if (next.pages.length >= next.limits.pages) {
    limitation(next, "page_limit");
    next.status = "completed";
  }
  return next;
}
