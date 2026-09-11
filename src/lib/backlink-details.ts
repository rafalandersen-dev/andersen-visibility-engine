import { z } from "zod";
import { backlinkMonitoringScope, monitoringScope } from "./backlink-monitoring";
export const backlinkDetailScope = backlinkMonitoringScope
  .extend({
    selection: z.enum(["first_seen", "lost_last_seen"]),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0).max(20000).default(0),
  })
  .strict();
export type BacklinkDetailScope = z.input<typeof backlinkDetailScope>;
export function detailScope(raw: unknown, now = new Date()) {
  const scope = backlinkDetailScope.parse(raw);
  monitoringScope(
    {
      target: scope.target,
      dateFrom: scope.dateFrom,
      dateTo: scope.dateTo,
      includeSubdomains: scope.includeSubdomains,
    },
    now,
  );
  return scope;
}
/** Exact destination filters retain www/subdomain scope despite provider target syntax. */
export function backlinkDetailPayload(raw: BacklinkDetailScope, now = new Date()) {
  const scope = detailScope(raw, now);
  const field = scope.selection === "first_seen" ? "first_seen" : "last_seen";
  const end = new Date(Date.parse(scope.dateTo) + 86400000).toISOString().slice(0, 10);
  const hostFilter = scope.includeSubdomains
    ? ["domain_to", "regex", `(^|\\.)${scope.target.replaceAll(".", "\\.")}$`]
    : ["domain_to", "=", scope.target];
  return {
    target: scope.target.replace(/^www\./, ""),
    mode: "as_is" as const,
    include_subdomains: true,
    exclude_internal_backlinks: true,
    rank_scale: "one_hundred" as const,
    backlinks_status_type: scope.selection === "first_seen" ? ("all" as const) : ("lost" as const),
    limit: scope.limit,
    offset: scope.offset,
    filters: [
      hostFilter,
      "and",
      [field, ">=", `${scope.dateFrom} 00:00:00 +00:00`],
      "and",
      [field, "<", `${end} 00:00:00 +00:00`],
    ],
    order_by: [`${field},desc`, "url_from,asc", "url_to,asc"],
  };
}
const safeUrl = z
  .string()
  .min(1)
  .max(8192)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        u.href.length <= 8192
      );
    } catch {
      return false;
    }
  });
const stamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+00:00$/)
  .transform((value) => value.replace(" ", "T").replace(" +00:00", "Z"))
  .refine((value) => {
    const n = Date.parse(value);
    return Number.isFinite(n) && new Date(n).toISOString() === value.replace("Z", ".000Z");
  });
const metric = z.number().int().min(0).max(100).nullish();
const item = z.object({
  type: z.literal("backlink"),
  url_from: safeUrl,
  url_to: safeUrl,
  domain_from: z.string().min(1).max(253),
  domain_to: z.string().min(1).max(253),
  first_seen: stamp.nullish(),
  prev_seen: stamp.nullish(),
  last_seen: stamp.nullish(),
  is_new: z.boolean().nullish(),
  is_lost: z.boolean().nullish(),
  dofollow: z.boolean().nullish(),
  anchor: z.string().max(32000).nullish(),
  rank: metric,
  backlink_spam_score: metric,
  links_count: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullish(),
});
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Provider index dates never establish the actual placement/removal time on the web. */
export function normalizeBacklinkDetails(
  raw: unknown,
  requested: BacklinkDetailScope,
  observedAt: string,
) {
  const observed = z.string().datetime({ offset: true }).parse(observedAt);
  const scope = detailScope(requested, new Date(observed));
  const payload = backlinkDetailPayload(scope, new Date(observed));
  const envelope = z
    .object({
      status_code: z.literal(20000),
      tasks_count: z.literal(1),
      tasks_error: z.literal(0),
      tasks: z
        .array(
          z.object({
            id: z.string().min(1).max(128),
            status_code: z.literal(20000),
            cost: z.number().finite().nonnegative(),
            data: z.record(z.unknown()),
            result_count: z.literal(1),
            result: z
              .array(
                z.object({
                  target: z.string(),
                  mode: z.literal("as_is"),
                  total_count: integer,
                  items_count: integer,
                  items: z.array(z.unknown()).max(100).nullable(),
                  search_after_token: z.string().max(8192).nullish(),
                }),
              )
              .length(1),
          }),
        )
        .length(1),
    })
    .parse(raw);
  const task = envelope.tasks[0],
    result = task.result[0];
  for (const [key, value] of Object.entries(payload))
    if (JSON.stringify(task.data[key]) !== JSON.stringify(value))
      throw Error("backlink_detail_scope_mismatch");
  const source = result.items ?? [];
  if (
    result.target !== payload.target ||
    result.items_count !== source.length ||
    source.length > scope.limit ||
    result.total_count < source.length ||
    (source.length > 0 && result.total_count < scope.offset + source.length)
  )
    throw Error("backlink_detail_result_mismatch");
  const seen = new Set<string>();
  let bytes = 0,
    truncated = false;
  const links = [];
  for (const rawItem of source) {
    const v = item.parse(rawItem),
      from = new URL(v.url_from),
      to = new URL(v.url_to);
    if (
      from.hostname !== v.domain_from.toLowerCase() ||
      to.hostname !== v.domain_to.toLowerCase() ||
      !(
        to.hostname === scope.target ||
        (scope.includeSubdomains && to.hostname.endsWith("." + scope.target))
      )
    )
      throw Error("backlink_detail_destination_mismatch");
    const selected = scope.selection === "first_seen" ? v.first_seen : v.last_seen;
    if (
      !selected ||
      selected.slice(0, 10) < scope.dateFrom ||
      selected.slice(0, 10) > scope.dateTo ||
      (scope.selection === "lost_last_seen" && v.is_lost !== true)
    )
      throw Error("backlink_detail_date_mismatch");
    const times = [v.first_seen, v.prev_seen, v.last_seen].filter((s): s is string => Boolean(s));
    if (
      times.some((t) => Date.parse(t) > Date.parse(observed)) ||
      times.some((t, i) => i > 0 && t < times[i - 1])
    )
      throw Error("backlink_detail_date_order");
    const key = JSON.stringify([from.href, to.href]);
    if (seen.has(key)) throw Error("backlink_detail_duplicate");
    seen.add(key);
    const link = {
      sourceUrl: from.href,
      targetUrl: to.href,
      firstSeenAt: v.first_seen ?? null,
      previousSeenAt: v.prev_seen ?? null,
      lastSeenAt: v.last_seen ?? null,
      providerNew: v.is_new ?? null,
      providerLost: v.is_lost ?? null,
      actualPlacedAt: null,
      actualRemovedAt: null,
      dofollow: v.dofollow ?? null,
      anchor: v.anchor?.slice(0, 1000) ?? null,
      anchorTruncated: (v.anchor?.length ?? 0) > 1000,
      rank: v.rank ?? null,
      spamScore: v.backlink_spam_score ?? null,
      linksOnReferringPage: v.links_count ?? null,
    };
    const size = new TextEncoder().encode(JSON.stringify(link)).length;
    if (bytes + size > 256 * 1024) {
      truncated = true;
      continue;
    }
    bytes += size;
    links.push(link);
  }
  return {
    source: "dataforseo_index" as const,
    scope,
    observedAt: observed,
    providerTaskId: task.id,
    providerReportedCostUsd: task.cost,
    providerTotalCount: result.total_count,
    providerReturnedCount: result.items_count,
    retainedCount: links.length,
    retainedTruncated: truncated,
    moreProviderResults:
      result.total_count > scope.offset + source.length || Boolean(result.search_after_token),
    coverage: "representative_links_from_referring_pages" as const,
    links,
  };
}
