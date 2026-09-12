import { z } from "zod";
import { backlinkMonitorSettings } from "./backlink-recurring";
export const backlinkRecurringRead = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export const backlinkRecurringSave = backlinkRecurringRead
  .extend({
    changeId: z.string().uuid(),
    expectedRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    expectedWebsite: z.string().trim().min(1).max(8192),
    settings: backlinkMonitorSettings,
  })
  .strict();
const stored = z.object({
  billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  spending: z
    .object({
      reservedOrSpentMicrousd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      unsettled: z.boolean(),
    })
    .strict(),
  user_id: z.string().uuid(),
  project_id: z.string(),
  monitor_id: z.string().uuid(),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  website_value: z.string().min(1).max(8192),
  settings: backlinkMonitorSettings,
  next_due_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export function projectBacklinkMonitorConfig(raw: unknown, userId: string, projectId: string) {
  if (raw === null) return null;
  const value = stored.parse(raw);
  if (value.user_id !== userId || value.project_id !== projectId)
    throw Error("backlink_monitor_scope");
  return {
    monitorId: value.monitor_id,
    revision: value.revision,
    website: value.website_value,
    settings: value.settings,
    billingMonth: value.billingMonth,
    spending: value.spending,
    nextDueAt: value.next_due_at,
    updatedAt: value.updated_at,
  };
}
export type BacklinkMonitorConfig = NonNullable<ReturnType<typeof projectBacklinkMonitorConfig>>;
