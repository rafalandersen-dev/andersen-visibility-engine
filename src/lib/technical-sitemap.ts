import { TechnicalCrawlAdmissionError } from "./technical-crawl-admission";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { isSafePublicUrl } from "./safe-fetch";
import { evaluateRobots, type RobotsEvidence } from "./technical-robots";
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
export type SitemapObservation = {
  requestedUrl: string;
  depth: number;
  observedAt: string;
  finalUrl?: string;
  status?: number;
  state:
    | "read"
    | "invalid_xml"
    | "invalid_text"
    | "oversize"
    | "non_xml"
    | "http_error"
    | "fetch_failed"
    | "robots_disallowed"
    | "robots_unknown";
  kind?: "urlset" | "sitemapindex" | "text";
  locCount: number;
  rejectedCount: number;
};
export type TechnicalSitemaps = {
  queue: { url: string; depth: number }[];
  files: SitemapObservation[];
  entries: { url: string; files: string[] }[];
  limitations: (
    | "file_limit"
    | "depth_limit"
    | "url_limit"
    | "out_of_scope"
    | "invalid_entry"
    | "robots_directives"
    | "unreadable"
    | "storage_limit"
  )[];
};
export type TechnicalSitemapFetcher = (url: string) => Promise<{
  url: string;
  status: number;
  body: string;
  headers?: Record<string, string>;
  contentAccepted: boolean;
  truncated: boolean;
  observedAt: string;
} | null>;
/** Parse only well-formed sitemap XML. Never resolve DTDs/entities or accept extension locs. */
export function inspectSitemapXml(
  xml: string,
): { kind: "urlset" | "sitemapindex"; locs: string[]; rejected: number } | null {
  if (new TextEncoder().encode(xml).byteLength > 512000) return null;
  const parser = new SaxesParser({ xmlns: true });
  const stack: SaxesTagNS[] = [];
  let kind: "urlset" | "sitemapindex" | undefined,
    text = "",
    collecting = false,
    rejected = 0,
    nodes = 0;
  const locs: string[] = [];
  let entryLocs: string[] | null = null;
  const standard = (tag: SaxesTagNS) => tag.uri === NS || tag.uri === "";
  parser.on("doctype", () => {
    throw new Error("doctype_disallowed");
  });
  parser.on("opentag", (tag) => {
    if (++nodes > 50000 || stack.length >= 50) throw new Error("xml_capacity");
    if (collecting) throw new Error("nested_loc");
    stack.push(tag);
    if (stack.length === 1) {
      if (!standard(tag) || !["urlset", "sitemapindex"].includes(tag.local))
        throw new Error("sitemap_root");
      kind = tag.local as typeof kind;
    }
    if (stack.length === 2 && standard(tag)) {
      if (tag.local === (kind === "urlset" ? "url" : "sitemap")) entryLocs = [];
      else rejected++;
    }
    if (
      stack.length === 3 &&
      standard(tag) &&
      tag.local === "loc" &&
      standard(stack[1]) &&
      stack[1].local === (kind === "urlset" ? "url" : "sitemap")
    ) {
      text = "";
      collecting = true;
    }
  });
  const append = (value: string) => {
    if (collecting) {
      text += value;
      if (text.length > 8192) throw new Error("loc_capacity");
    }
  };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", () => {
    if (collecting && stack.length === 3) {
      const value = text.trim();
      entryLocs?.push(value);
      collecting = false;
    }
    if (stack.length === 2 && entryLocs) {
      if (entryLocs.length === 1 && entryLocs[0]) locs.push(entryLocs[0]);
      else rejected++;
      entryLocs = null;
    }
    stack.pop();
  });
  try {
    parser.write(xml).close();
    return kind ? { kind, locs, rejected } : null;
  } catch {
    return null;
  }
}
/** One absolute URL per line. Limits are local crawl limits, not protocol maxima. */
export function inspectSitemapText(
  body: string,
): { kind: "text"; locs: string[]; rejected: number } | null {
  if (new TextEncoder().encode(body).byteLength > 512000) return null;
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return null;
  }
  const lines = body.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  if (lines.length > 50000) return null;
  const locs: string[] = [];
  let rejected = 0;
  for (const line of lines) {
    const value = line.trim();
    if (!value) continue;
    if (value.length > 8192 || !/^https?:\/\/[^\s<>]+$/i.test(value)) {
      rejected++;
      continue;
    }
    locs.push(value);
  }
  return { kind: "text", locs, rejected };
}
function scoped(raw: string, origin: string): string | null {
  try {
    if (raw.length > 8192) return null;
    const url = new URL(raw);
    if (!isSafePublicUrl(url.href) || url.origin !== origin || url.username || url.password)
      return null;
    url.hash = "";
    return url.href.length <= 8192 ? url.href : null;
  } catch {
    return null;
  }
}
function limit(state: TechnicalSitemaps, value: TechnicalSitemaps["limitations"][number]) {
  if (!state.limitations.includes(value)) state.limitations.push(value);
}
export function startTechnicalSitemaps(
  origin: string,
  declared: string[],
  declaredComplete = true,
): TechnicalSitemaps {
  const state: TechnicalSitemaps = { queue: [], files: [], entries: [], limitations: [] };
  if (!declaredComplete) limit(state, "robots_directives");
  for (const raw of [...declared, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]) {
    const url = scoped(raw, origin);
    if (!url) {
      limit(state, "out_of_scope");
      continue;
    }
    if (state.queue.some((q) => q.url === url)) continue;
    if (state.queue.length === 10) {
      limit(state, "file_limit");
      break;
    }
    state.queue.push({ url, depth: 0 });
  }
  return state;
}
/** One leased file per transition. Sitemap membership never proves a page exists or is indexed. */
export async function advanceTechnicalSitemaps(
  saved: TechnicalSitemaps,
  origin: string,
  robots: RobotsEvidence,
  fetch: TechnicalSitemapFetcher,
  now: string,
): Promise<TechnicalSitemaps> {
  const next = structuredClone(saved),
    target = next.queue.shift();
  if (!target) return next;
  if (!scoped(target.url, origin) || !Number.isFinite(Date.parse(now)))
    throw new Error("sitemap_scope_invalid");
  if (next.files.length >= 10) {
    next.queue = [];
    limit(next, "file_limit");
    return next;
  }
  const file: SitemapObservation = {
    requestedUrl: target.url,
    depth: target.depth,
    observedAt: now,
    state: "fetch_failed",
    locCount: 0,
    rejectedCount: 0,
  };
  const permission = evaluateRobots(robots, "MiloGrowthAuditBot", target.url);
  if (permission.decision !== "allowed")
    file.state = permission.decision === "disallowed" ? "robots_disallowed" : "robots_unknown";
  else {
    try {
      const response = await fetch(target.url);
      const finalUrl = response ? scoped(response.url, origin) : null;
      if (response && finalUrl) {
        file.finalUrl = finalUrl;
        file.status = response.status;
        file.observedAt = response.observedAt;
        if (response.status < 200 || response.status >= 300) file.state = "http_error";
        else if (response.truncated) file.state = "oversize";
        else if (!response.contentAccepted) file.state = "non_xml";
        else {
          const plain =
            /^text\/plain(?:\s*;|$)/i.test(response.headers?.["content-type"] ?? "") &&
            !response.body.trimStart().startsWith("<");
          const document = plain
            ? inspectSitemapText(response.body)
            : inspectSitemapXml(response.body);
          if (!document) file.state = plain ? "invalid_text" : "invalid_xml";
          else {
            file.state = "read";
            next.queue = next.queue.filter((pending) => pending.url !== finalUrl);
            file.kind = document.kind;
            file.locCount = document.locs.length;
            file.rejectedCount = document.rejected;
            if (document.rejected) limit(next, "invalid_entry");
            for (const raw of document.locs) {
              const url = scoped(raw, origin);
              if (!url) {
                file.rejectedCount++;
                limit(next, "out_of_scope");
                continue;
              }
              if (document.kind === "sitemapindex") {
                if (
                  url === target.url ||
                  url === finalUrl ||
                  next.files.some((f) => f.requestedUrl === url || f.finalUrl === url) ||
                  next.queue.some((q) => q.url === url)
                )
                  continue;
                if (target.depth >= 3) {
                  limit(next, "depth_limit");
                  continue;
                }
                if (next.files.length + 1 + next.queue.length >= 10) {
                  limit(next, "file_limit");
                  continue;
                }
                next.queue.push({ url, depth: target.depth + 1 });
              } else {
                const entry = next.entries.find((entry) => entry.url === url);
                if (entry) {
                  if (!entry.files.includes(target.url)) entry.files.push(target.url);
                  continue;
                }
                if (next.entries.length >= 2000) {
                  limit(next, "url_limit");
                  continue;
                }
                next.entries.push({ url, files: [target.url] });
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof TechnicalCrawlAdmissionError) throw error;
      file.state = "fetch_failed";
    }
  }
  if (file.state !== "read") limit(next, "unreadable");
  next.files.push(file);
  return next;
}
