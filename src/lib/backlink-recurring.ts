import { z } from "zod";
import { monitoringScope } from "./backlink-monitoring";
import { backlinkMonitoringExpense } from "./backlink-monitoring-pricing";

/** Owner settings only. This does not create budgets, enable a timer or authorize calls. */
export const backlinkMonitorSettings = z
  .object({
    enabled: z.boolean(),
    cadence: z.enum(["daily", "weekly"]),
    lookbackDays: z.number().int().min(1).max(92),
    includeSubdomains: z.boolean(),
    monthlyCapMicrousd: z.number().int().min(0).max(100_000_000),
  })
  .strict()
  .refine((s) => !s.enabled || s.monthlyCapMicrousd >= 24_000 + 36 * s.lookbackDays, {
    message: "backlink_monitor_cap_below_one_request",
  });
export type BacklinkMonitorSettings = z.infer<typeof backlinkMonitorSettings>;

const DAY = 86_400_000;
const timestamp = z.string().datetime({ offset: true });
/** Deterministic planning from a SERVER-SAVED due time. Missed occurrences are skipped,
 * never backfilled as a burst. Only complete UTC days enter the provider scope.
 * Persistence must still atomically claim the returned occurrence, bind current owner/
 * website/settings revision, and enforce remaining monitor/account/global spending. */
export function planBacklinkMonitorRun(
  target: string,
  rawSettings: BacklinkMonitorSettings,
  savedDueAt: string,
  now = new Date(),
) {
  const settings = backlinkMonitorSettings.parse(rawSettings);
  const due = Date.parse(timestamp.parse(savedDueAt));
  const current = now.getTime();
  if (!Number.isFinite(current)) throw new Error("backlink_monitor_clock");
  if (!settings.enabled) return { state: "paused" as const };
  if (due > current) return { state: "not_due" as const, nextDueAt: new Date(due).toISOString() };
  const period = (settings.cadence === "daily" ? 1 : 7) * DAY;
  const skippedOccurrences = Math.floor((current - due) / period);
  const occurrence = due + skippedOccurrences * period;
  const end = Date.parse(new Date(occurrence).toISOString().slice(0, 10)) - DAY;
  const dateTo = new Date(end).toISOString().slice(0, 10);
  const dateFrom = new Date(end - (settings.lookbackDays - 1) * DAY).toISOString().slice(0, 10);
  const scope = monitoringScope(
    { target, dateFrom, dateTo, includeSubdomains: settings.includeSubdomains },
    now,
  );
  return {
    state: "due" as const,
    occurrenceAt: new Date(occurrence).toISOString(),
    nextDueAt: new Date(occurrence + period).toISOString(),
    skippedOccurrences,
    scope,
    expense: backlinkMonitoringExpense(scope, now),
  };
}
