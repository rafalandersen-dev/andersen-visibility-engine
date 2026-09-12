import { z } from "zod";
import { backlinkMonitorSettings, planBacklinkMonitorRun } from "./backlink-recurring";
import { runBacklinkMonitoring } from "./backlink-monitoring-lifecycle.server";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
const dueMonitor = z
  .object({
    userId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    monitorId: z.string().uuid(),
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    website: z.string().min(1).max(8192),
    settings: backlinkMonitorSettings,
    nextDueAt: z.string().datetime({ offset: true }),
  })
  .strict();
type Dependencies = NonNullable<Parameters<typeof runBacklinkMonitoring>[2]> & {
  monotonic?: () => number;
};
/** Internal worker only: caller must first authenticate the scheduler secret.
 * The private inspection claim grants no dispatch authority; SQL rechecks under owner lock. */
export async function runBacklinkRecurringScheduler(deps: Dependencies = {}) {
  const rpc = deps.rpc ?? projectTeamRpc;
  const now = deps.now ?? (() => new Date());
  const clock = deps.monotonic ?? (() => performance.now());
  const started = clock();
  const candidates = z
    .array(dueMonitor)
    .max(2)
    .parse(await teamCall("claim_due_backlink_monitors", {}, rpc));
  if (new Set(candidates.map((v) => v.monitorId)).size !== candidates.length)
    throw Error("backlink_monitor_candidates");
  const summary = { considered: candidates.length, stored: 0, held: 0, unknown: 0, skipped: 0 };
  for (const monitor of candidates) {
    // 60 seconds allows the four bounded database calls plus 15s supplier transport
    // and processing. The second candidate starts only when that margin remains.
    if (clock() - started > 10000) {
      summary.skipped++;
      continue;
    }
    try {
      const website = new URL(
        /^https?:\/\//i.test(monitor.website.trim())
          ? monitor.website.trim()
          : `https://${monitor.website.trim()}`,
      );
      if (!["http:", "https:"].includes(website.protocol) || website.username || website.password)
        throw Error("backlink_monitor_scope");
      const plan = planBacklinkMonitorRun(
        website.hostname,
        monitor.settings,
        monitor.nextDueAt,
        now(),
      );
      if (plan.state !== "due") {
        summary.skipped++;
        continue;
      }
      const requestId = crypto.randomUUID();
      // Reuse the bounded, once-only manual lifecycle with three fixed private
      // admission/persistence substitutions. No browser controls this mapping.
      const recurringRpc: TeamReadRpc = (name, args) => {
        if (name === "reserve_backlink_monitoring")
          return rpc("reserve_backlink_recurring_observation", {
            ...args,
            p_monitor: monitor.monitorId,
            p_revision: monitor.revision,
            p_occurrence: plan.occurrenceAt,
          });
        if (name === "authorize_backlink_monitoring_dispatch")
          return rpc("authorize_backlink_recurring_dispatch", args);
        if (name === "finish_backlink_monitoring")
          return rpc("finish_backlink_recurring_observation", args);
        if (name === "read_backlink_monitoring_context") return rpc(name, args);
        throw Error("backlink_monitor_operation");
      };
      const result = await runBacklinkMonitoring(
        monitor.userId,
        {
          projectId: monitor.projectId,
          requestId,
          expectedWebsite: monitor.website.trim(),
          dateFrom: plan.scope.dateFrom,
          dateTo: plan.scope.dateTo,
          includeSubdomains: plan.scope.includeSubdomains,
        },
        { ...deps, rpc: recurringRpc, now },
      );
      if (result.state === "stored") summary.stored++;
      else if (result.state === "unknown") summary.unknown++;
      else summary.held++;
    } catch {
      summary.held++;
    }
  }
  return summary;
}
