import { z } from "zod";
import { backlinkMonitoringScope, monitoringScope } from "./backlink-monitoring";
export const backlinkMonitoringRequest = backlinkMonitoringScope
  .omit({ target: true })
  .extend({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    requestId: z.string().uuid(),
  })
  .strict();
export const backlinkMonitoringHistoryInput = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export const backlinkMonitoringRecoveryInput = backlinkMonitoringHistoryInput
  .extend({ requestId: z.string().uuid() })
  .strict();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const day = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    state: z.enum(["reported", "partial", "missing"]),
    newBacklinks: count,
    lostBacklinks: count,
    newReferringDomains: count,
    lostReferringDomains: count,
    newReferringMainDomains: count,
    lostReferringMainDomains: count,
  })
  .strict();
const observation = z
  .object({
    source: z.literal("dataforseo_index"),
    scope: backlinkMonitoringScope,
    observedAt: z.string().datetime({ offset: true }),
    providerTaskId: z.string().min(1).max(128),
    providerReportedCostUsd: z.number().finite().min(0).max(1000000),
    complete: z.boolean(),
    days: z.array(day).min(1).max(92),
  })
  .strict();
export function savedBacklinkObservation(raw: unknown) {
  const value = observation.parse(raw),
    scope = monitoringScope(value.scope, new Date(value.observedAt));
  const expected = (Date.parse(scope.dateTo) - Date.parse(scope.dateFrom)) / 86400000 + 1;
  if (value.days.length !== expected) throw new Error("backlink_monitoring_history");
  value.days.forEach((d, i) => {
    if (d.date !== new Date(Date.parse(scope.dateFrom) + i * 86400000).toISOString().slice(0, 10))
      throw new Error("backlink_monitoring_history");
    const values = [
      d.newBacklinks,
      d.lostBacklinks,
      d.newReferringDomains,
      d.lostReferringDomains,
      d.newReferringMainDomains,
      d.lostReferringMainDomains,
    ];
    if (
      (d.state === "missing" && values.some((v) => v !== null)) ||
      (d.state === "reported" && values.some((v) => v === null)) ||
      (d.state === "partial" && values.every((v) => v !== null))
    )
      throw new Error("backlink_monitoring_history");
  });
  if (value.complete !== value.days.every((d) => d.state === "reported"))
    throw new Error("backlink_monitoring_history");
  return value;
}
export const backlinkMonitoringHistoryRow = z.object({
  user_id: z.string().uuid(),
  project_id: z.string(),
  request_id: z.string().uuid(),
  scope: backlinkMonitoringScope,
  status: z.enum(["reserved", "dispatched", "succeeded", "held", "unknown"]),
  accounting_state: z.enum(["pending", "unknown", "settled"]),
  created_at: z.string().datetime({ offset: true }),
  observation: z.unknown().nullable(),
});
export function projectBacklinkHistory(raw: unknown, userId: string, projectId: string) {
  return z
    .array(backlinkMonitoringHistoryRow)
    .max(20)
    .parse(raw)
    .map((row) => {
      if (row.user_id !== userId || row.project_id !== projectId)
        throw new Error("backlink_monitoring_history");
      const saved = row.observation == null ? null : savedBacklinkObservation(row.observation);
      if (
        saved &&
        Object.entries(row.scope).some(([k, v]) => saved.scope[k as keyof typeof saved.scope] !== v)
      )
        throw new Error("backlink_monitoring_history");
      if ((row.status === "succeeded") !== (saved !== null))
        throw new Error("backlink_monitoring_history");
      return {
        requestId: row.request_id,
        scope: row.scope,
        status: row.status,
        accounting: row.accounting_state,
        createdAt: row.created_at,
        observation: saved,
      };
    });
}
export type BacklinkMonitoringHistory = ReturnType<typeof projectBacklinkHistory>;
