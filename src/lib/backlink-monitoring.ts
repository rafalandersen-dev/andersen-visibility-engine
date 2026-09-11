import { z } from "zod";
const DAY = 86400000;
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const stamp = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
  });
const domain = z
  .string()
  .min(3)
  .max(253)
  .regex(/^(?=.+\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
export const backlinkMonitoringScope = z
  .object({
    target: domain,
    dateFrom: day,
    dateTo: day,
    includeSubdomains: z.boolean(),
  })
  .strict();
export type BacklinkMonitoringScope = z.infer<typeof backlinkMonitoringScope>;
export function monitoringScope(raw: unknown, now = new Date()): BacklinkMonitoringScope {
  const scope = backlinkMonitoringScope.parse(raw);
  const count = (Date.parse(scope.dateTo) - Date.parse(scope.dateFrom)) / DAY + 1;
  if (
    scope.dateFrom < "2019-01-30" ||
    count < 1 ||
    count > 92 ||
    scope.dateTo > now.toISOString().slice(0, 10)
  )
    throw new Error("Invalid backlink monitoring interval.");
  return scope;
}
export function backlinkMonitoringPayload(scope: BacklinkMonitoringScope, now = new Date()) {
  const checked = monitoringScope(scope, now);
  return {
    target: checked.target,
    date_from: checked.dateFrom,
    date_to: checked.dateTo,
    include_subdomains: checked.includeSubdomains,
    group_range: "day" as const,
  };
}
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullish();
const metrics = z.object({
  new_backlinks: count,
  lost_backlinks: count,
  new_referring_domains: count,
  lost_referring_domains: count,
  new_referring_main_domains: count,
  lost_referring_main_domains: count,
});
const metricKeys = Object.keys(metrics.shape) as (keyof z.infer<typeof metrics>)[];
const item = metrics.extend({
  type: z.literal("backlinks_timeseries_new_lost_summary"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2} 00:00:00 \+00:00$/),
});
const result = z.object({
  target: domain,
  date_from: day,
  date_to: day,
  group_range: z.literal("day"),
  items_count: z.number().int().min(0).max(92),
  total_count: z.number().int().min(0).max(92).optional(),
  items: z.array(item).max(92).nullable(),
});
export type BacklinkMonitoringDay = {
  date: string;
  state: "reported" | "partial" | "missing";
  newBacklinks: number | null;
  lostBacklinks: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  newReferringMainDomains: number | null;
  lostReferringMainDomains: number | null;
};
/** Index observations are neither independently verified placements nor site-wide absence proof. */
export function normalizeBacklinkMonitoring(
  raw: unknown,
  requested: BacklinkMonitoringScope,
  observedAt: string,
) {
  const observed = z.string().datetime({ offset: true }).parse(observedAt);
  const scope = monitoringScope(requested, new Date(observed));
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
            data: z.object({
              target: domain,
              date_from: day,
              date_to: day,
              group_range: z.literal("day"),
              include_subdomains: z.boolean(),
            }),
            result: z.array(result).length(1),
          }),
        )
        .length(1),
    })
    .parse(raw);
  const task = envelope.tasks[0];
  const payload = backlinkMonitoringPayload(scope, new Date(observed));
  for (const key of Object.keys(payload) as (keyof typeof payload)[])
    if (task.data[key] !== payload[key]) throw new Error("Backlink monitoring scope mismatch.");
  const row = task.result[0];
  if (
    row.target !== scope.target ||
    row.date_from !== scope.dateFrom ||
    row.date_to !== scope.dateTo
  )
    throw new Error("Backlink monitoring result mismatch.");
  const items = row.items ?? [];
  if (
    row.items_count !== items.length ||
    (row.total_count !== undefined && row.total_count !== items.length)
  )
    throw new Error("Backlink monitoring count mismatch.");
  const indexed = new Map<string, z.infer<typeof item>>();
  for (const value of items) {
    const date = day.parse(value.date.slice(0, 10));
    if (date < scope.dateFrom || date > scope.dateTo || indexed.has(date))
      throw new Error("Backlink monitoring day mismatch.");
    indexed.set(date, value);
  }
  const days: BacklinkMonitoringDay[] = [];
  for (let stamp = Date.parse(scope.dateFrom); stamp <= Date.parse(scope.dateTo); stamp += DAY) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    const value = indexed.get(date);
    days.push({
      date,
      state: !value
        ? "missing"
        : metricKeys.every((key) => value[key] != null)
          ? "reported"
          : "partial",
      newBacklinks: value?.new_backlinks ?? null,
      lostBacklinks: value?.lost_backlinks ?? null,
      newReferringDomains: value?.new_referring_domains ?? null,
      lostReferringDomains: value?.lost_referring_domains ?? null,
      newReferringMainDomains: value?.new_referring_main_domains ?? null,
      lostReferringMainDomains: value?.lost_referring_main_domains ?? null,
    });
  }
  return {
    source: "dataforseo_index" as const,
    scope,
    observedAt: observed,
    providerTaskId: task.id,
    providerReportedCostUsd: task.cost,
    complete: days.every((value) => value.state === "reported"),
    days,
  };
}
