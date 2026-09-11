import { z } from "zod";
import { backlinkDetailScope, detailScope } from "./backlink-details";
export const backlinkDetailsRequest = backlinkDetailScope
  .omit({ target: true })
  .extend({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    requestId: z.string().uuid(),
    expectedWebsite: z.string().trim().min(1).max(8192),
  })
  .strict();
export const backlinkDetailsHistoryInput = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export const backlinkDetailsRecoveryInput = backlinkDetailsHistoryInput
  .extend({ requestId: z.string().uuid() })
  .strict();

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
const url = z
  .string()
  .max(8192)
  .url()
  .refine((value) => {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
  });
const link = z
  .object({
    sourceUrl: url,
    targetUrl: url,
    firstSeenAt: timestamp.nullable(),
    previousSeenAt: timestamp.nullable(),
    lastSeenAt: timestamp.nullable(),
    providerNew: z.boolean().nullable(),
    providerLost: z.boolean().nullable(),
    actualPlacedAt: z.null(),
    actualRemovedAt: z.null(),
    dofollow: z.boolean().nullable(),
    anchor: z.string().max(1000).nullable(),
    anchorTruncated: z.boolean(),
    rank: count.max(100).nullable(),
    spamScore: count.max(100).nullable(),
    linksOnReferringPage: count.min(1).nullable(),
  })
  .strict();
const observation = z
  .object({
    source: z.literal("dataforseo_index"),
    scope: backlinkDetailScope,
    observedAt: timestamp,
    providerTaskId: z.string().min(1).max(128),
    providerReportedCostUsd: z.number().finite().min(0).max(1000000),
    providerTotalCount: count,
    providerReturnedCount: count.max(100),
    retainedCount: count.max(100),
    retainedTruncated: z.boolean(),
    moreProviderResults: z.boolean(),
    coverage: z.literal("representative_links_from_referring_pages"),
    links: z.array(link).max(100),
  })
  .strict();
export function savedBacklinkDetails(raw: unknown) {
  const value = observation.parse(raw);
  const scope = detailScope(value.scope, new Date(value.observedAt));
  const fail = () => {
    throw new Error("backlink_details_history");
  };
  if (
    value.retainedCount !== value.links.length ||
    value.providerReturnedCount > scope.limit ||
    value.providerTotalCount < value.providerReturnedCount ||
    value.retainedCount > value.providerReturnedCount ||
    value.retainedTruncated !== value.retainedCount < value.providerReturnedCount ||
    (!value.moreProviderResults && value.providerTotalCount > value.providerReturnedCount)
  )
    fail();
  let bytes = 0;
  const seen = new Set<string>();
  for (const entry of value.links) {
    const host = new URL(entry.targetUrl).hostname;
    if (host !== scope.target && !(scope.includeSubdomains && host.endsWith("." + scope.target)))
      fail();
    const selected = scope.selection === "first_seen" ? entry.firstSeenAt : entry.lastSeenAt;
    if (
      !selected ||
      selected.slice(0, 10) < scope.dateFrom ||
      selected.slice(0, 10) > scope.dateTo ||
      (scope.selection === "lost_last_seen" && entry.providerLost !== true)
    )
      fail();
    const times = [entry.firstSeenAt, entry.previousSeenAt, entry.lastSeenAt]
      .filter((t): t is string => t !== null)
      .map(Date.parse);
    if (times.some((t, i) => t > Date.parse(value.observedAt) || (i > 0 && t < times[i - 1])))
      fail();
    if (entry.anchorTruncated && entry.anchor?.length !== 1000) fail();
    const key = JSON.stringify([new URL(entry.sourceUrl).href, new URL(entry.targetUrl).href]);
    if (seen.has(key)) fail();
    seen.add(key);
    bytes += new TextEncoder().encode(JSON.stringify(entry)).length;
  }
  if (bytes > 256 * 1024) fail();
  return value;
}
const row = z.object({
  user_id: z.string().uuid(),
  project_id: z.string(),
  request_id: z.string().uuid(),
  scope: backlinkDetailScope,
  status: z.enum(["reserved", "dispatched", "succeeded", "held", "unknown"]),
  accounting_state: z.enum(["pending", "unknown", "settled"]),
  created_at: timestamp,
  observation: z.unknown().nullable(),
});
export function projectBacklinkDetailsHistory(raw: unknown, userId: string, projectId: string) {
  return z
    .array(row)
    .max(20)
    .parse(raw)
    .map((record) => {
      if (record.user_id !== userId || record.project_id !== projectId)
        throw new Error("backlink_details_history");
      const saved = record.observation == null ? null : savedBacklinkDetails(record.observation);
      detailScope(record.scope, new Date(record.created_at));
      if (
        (record.status === "succeeded") !== (saved !== null) ||
        (saved &&
          Object.entries(record.scope).some(
            ([key, value]) => saved.scope[key as keyof typeof saved.scope] !== value,
          ))
      )
        throw new Error("backlink_details_history");
      return {
        requestId: record.request_id,
        scope: record.scope,
        status: record.status,
        accounting: record.accounting_state,
        createdAt: record.created_at,
        observation: saved,
      };
    });
}
export type BacklinkDetailsHistory = ReturnType<typeof projectBacklinkDetailsHistory>;
