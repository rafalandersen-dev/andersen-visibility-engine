import { z } from "zod";
import type { TechnicalCrawl } from "./technical-crawl";
import { isSafePublicUrl } from "./safe-fetch";
const url = z
  .string()
  .max(8192)
  .refine((v) => {
    try {
      const u = new URL(v);
      return isSafePublicUrl(v) && !u.username && !u.password;
    } catch {
      return false;
    }
  });
const observedUrl = z
  .string()
  .max(8192)
  .refine((v) => {
    try {
      const u = new URL(v);
      return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  });
const date = z.string().datetime({ offset: true });
const depth = z.number().int().min(0).max(10).nullable();
const strings = (count: number, length: number) => z.array(z.string().max(length)).max(count);
const rule = z
  .object({ allow: z.boolean(), pattern: z.string().max(8192), line: z.number().int().positive() })
  .strict();
const robots = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("unknown"),
      reason: z.enum(["network", "server", "rate_limited", "redirect", "oversize", "content_type"]),
    })
    .strict(),
  z
    .object({ state: z.literal("unavailable"), status: z.number().int().min(400).max(499) })
    .strict(),
  z
    .object({
      state: z.literal("read"),
      document: z
        .object({
          complete: z.boolean(),
          sitemaps: z.array(observedUrl).max(100),
          groups: z
            .array(
              z.object({ agents: strings(20000, 256), rules: z.array(rule).max(20000) }).strict(),
            )
            .max(20000),
        })
        .strict(),
    })
    .strict(),
]);
const observation = z
  .object({
    url,
    status: z.number().int().min(100).max(599),
    observedAt: date,
    complete: z.boolean(),
    title: z.string().max(1000),
    descriptions: strings(20, 4000),
    headings: strings(100, 1000),
    canonicals: z.array(observedUrl).max(20),
    alternateLanguages: z
      .array(z.object({ language: z.string().max(100), url: observedUrl }).strict())
      .max(100),
    robots: z
      .array(
        z
          .object({
            source: z.enum(["meta", "header"]),
            agent: z.string().max(100),
            value: z.string().max(4000),
          })
          .strict(),
      )
      .max(100),
    internalLinks: z.array(url).max(500),
    externalLinkCount: z.number().int().nonnegative(),
    structuredData: z
      .array(
        z
          .object({
            state: z.enum(["valid_json", "invalid_json"]),
            types: strings(100, 200),
            complete: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
const schema = z
  .object({
    origin: url,
    startedAt: date,
    updatedAt: date,
    status: z.enum(["running", "completed", "cancelled", "robots_stale"]),
    limits: z
      .object({ pages: z.number().int().min(1).max(200), depth: z.number().int().min(0).max(10) })
      .strict(),
    robots,
    robotsFetchedAt: date,
    queue: z.array(z.object({ url, depth }).strict()).max(2000),
    pages: z
      .array(
        z
          .object({
            requestedUrl: url,
            depth,
            state: z.enum([
              "observed",
              "robots_disallowed",
              "robots_unknown",
              "fetch_failed",
              "out_of_scope",
              "non_html",
              "storage_limited",
            ]),
            observation: observation.optional(),
          })
          .strict(),
      )
      .max(200),
    sitemaps: z
      .object({
        queue: z.array(z.object({ url, depth: z.number().int().min(0).max(3) }).strict()).max(10),
        files: z
          .array(
            z
              .object({
                requestedUrl: url,
                depth: z.number().int().min(0).max(3),
                observedAt: date,
                finalUrl: url.optional(),
                status: z.number().int().min(100).max(599).optional(),
                state: z.enum([
                  "read",
                  "invalid_xml",
                  "oversize",
                  "non_xml",
                  "http_error",
                  "fetch_failed",
                  "robots_disallowed",
                  "robots_unknown",
                ]),
                kind: z.enum(["urlset", "sitemapindex"]).optional(),
                locCount: z.number().int().min(0).max(50000),
                rejectedCount: z.number().int().min(0).max(50000),
              })
              .strict(),
          )
          .max(10),
        entries: z.array(z.object({ url, files: z.array(url).max(10) }).strict()).max(2000),
        limitations: z
          .array(
            z.enum([
              "file_limit",
              "depth_limit",
              "url_limit",
              "out_of_scope",
              "invalid_entry",
              "unreadable",
              "storage_limit",
            ]),
          )
          .max(7),
      })
      .strict()
      .optional(),
    coverageLimits: z
      .array(
        z.enum([
          "page_limit",
          "depth_limit",
          "discovery_limit",
          "partial_page",
          "unobserved_pages",
          "storage_limit",
        ]),
      )
      .max(6),
  })
  .strict();
export function parseTechnicalCrawlState(raw: unknown, origin: string): TechnicalCrawl {
  if (JSON.stringify(raw).length > 4_000_000) throw new Error("technical_state_invalid");
  const state = schema.parse(raw);
  if (
    state.origin !== origin ||
    new URL(origin).origin !== origin ||
    state.queue.some((q) => new URL(q.url).origin !== origin) ||
    state.pages.some(
      (p) =>
        new URL(p.requestedUrl).origin !== origin ||
        (p.observation && new URL(p.observation.url).origin !== origin),
    ) ||
    (state.sitemaps &&
      [
        ...state.sitemaps.queue.map((q) => q.url),
        ...state.sitemaps.files.flatMap((f) => [
          f.requestedUrl,
          ...(f.finalUrl ? [f.finalUrl] : []),
        ]),
        ...state.sitemaps.entries.flatMap((e) => [e.url, ...e.files]),
      ].some((u) => new URL(u).origin !== origin)) ||
    state.pages.length > state.limits.pages
  )
    throw new Error("technical_state_scope_invalid");
  return state;
}
/** Retain page identities but explicitly stop with partial coverage when evidence
 * reaches the storage budget. Never retry a step that cannot fit durably. */
export function fitTechnicalCrawlState(raw: TechnicalCrawl): TechnicalCrawl {
  const state = structuredClone(raw);
  const size = () => new TextEncoder().encode(JSON.stringify(state)).byteLength;
  const budget = 2_500_000;
  if (size() <= budget) return parseTechnicalCrawlState(state, state.origin);
  if (!state.coverageLimits.includes("storage_limit")) state.coverageLimits.push("storage_limit");
  state.status = "completed";
  if (state.sitemaps) {
    if (!state.sitemaps.limitations.includes("storage_limit"))
      state.sitemaps.limitations.push("storage_limit");
    state.sitemaps.queue = [];
    while (state.sitemaps.entries.length && size() > budget)
      state.sitemaps.entries.splice(Math.floor(state.sitemaps.entries.length / 2));
  }
  while (state.queue.length && size() > budget)
    state.queue.splice(Math.floor(state.queue.length / 2));
  for (const page of [...state.pages].reverse()) {
    if (size() <= budget) break;
    if (page.observation) {
      delete page.observation;
      page.state = "storage_limited";
    }
  }
  if (size() > budget) state.robots = { state: "unknown", reason: "oversize" };
  if (size() > budget) throw new Error("technical_state_capacity");
  return parseTechnicalCrawlState(state, state.origin);
}
