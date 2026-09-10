import { schedulerPeriodSchema } from "./weekly-preparation";
import { z } from "zod";
import { operationalNotifications } from "./operational-notifications";
import { schedulerDemand, schedulerCapacityNotifications } from "./scheduler-capacity";
import { readGenerationCapacity } from "./generation-capacity.server";
import type { Project, ContentAsset, Opportunity } from "./types";
const identity = z.string().min(1).max(200);
const entity = z.object({ id: identity }).passthrough();
const projectSchema = entity.extend({ name: z.string(), businessName: z.string() }).passthrough();
const assetSchema = entity
  .extend({
    projectId: identity,
    title: z.string(),
    status: z.string(),
    updatedAt: z.string().max(100),
  })
  .passthrough();
const opportunitySchema = entity
  .extend({ projectId: identity, title: z.string(), status: z.string() })
  .passthrough();
const queueSchema = z.object({
  id: identity,
  project_id: identity,
  asset_id: identity,
  publish_at: z.string().datetime({ offset: true }),
  status: z.enum(["pending", "publishing", "published", "failed", "cancelled"]),
  attempts: z.number().int().nonnegative(),
  created_at: z.string(),
});
const leaseSchema = z.object({
  project_id: identity,
  planned_period: schedulerPeriodSchema,
  status: z.enum(["active", "released", "unknown"]),
  acquired_at: z.string().datetime({ offset: true }),
  lease_until: z.string().datetime({ offset: true }),
});
const snapshotSchema = z.object({
  projects: z.array(projectSchema).default([]),
  content: z.array(assetSchema).default([]),
  opportunities: z.array(opportunitySchema).default([]),
});
type Response = { data: unknown; error: unknown };
interface Query extends PromiseLike<Response> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: { ascending: boolean }): Query;
  limit(n: number): Query;
}
interface Admin {
  from(table: string): Query;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<Response>;
}
async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}
export async function refreshOperationalNotifications(
  userId: string,
  now = new Date(),
): Promise<boolean> {
  const { readWorkspaceRow } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) return false; // unavailable source must never clear an existing inbox
  const snapshot = snapshotSchema.parse(row.data);
  const db = await admin();
  const response = await db
    .from("scheduled_publishes")
    .select("id,project_id,asset_id,publish_at,status,attempts,created_at")
    .eq("user_id", userId)
    .order("id")
    .limit(1001);
  if (response.error || !Array.isArray(response.data) || response.data.length > 1000)
    throw new Error("notification_queue_unavailable");
  const scheduled = z
    .array(queueSchema)
    .parse(response.data)
    .map((r) => ({
      id: r.id,
      projectId: r.project_id,
      assetId: r.asset_id,
      publishAt: r.publish_at,
      status: r.status,
      attempts: r.attempts,
      createdAt: r.created_at,
    }));
  const leaseResponse = await db
    .from("auto_scheduler_leases")
    .select("project_id,planned_period,status,acquired_at,lease_until")
    .eq("user_id", userId)
    .order("project_id")
    .limit(1001);
  if (leaseResponse.error || !Array.isArray(leaseResponse.data) || leaseResponse.data.length > 1000)
    throw new Error("notification_scheduler_unavailable");
  const schedulerLeases = z
    .array(leaseSchema)
    .parse(leaseResponse.data)
    .map((r) => ({
      projectId: r.project_id,
      plannedPeriod: r.planned_period,
      status: r.status,
      acquiredAt: r.acquired_at,
      leaseUntil: r.lease_until,
    }));
  const events = operationalNotifications({
    projects: snapshot.projects as unknown as Project[],
    assets: snapshot.content as unknown as ContentAsset[],
    opportunities: snapshot.opportunities as unknown as Opportunity[],
    scheduled,
    schedulerLeases,
    now,
  });
  const demand = schedulerDemand({
    projects: snapshot.projects as unknown as Project[],
    assets: snapshot.content as unknown as ContentAsset[],
    scheduled,
    now,
  });
  if (demand.length) {
    const capacity = await readGenerationCapacity(userId, now, db);
    events.push(...schedulerCapacityNotifications(demand, capacity));
  }
  if (events.length > 500) throw new Error("notification_scan_too_large");
  const synced = await db.rpc("sync_operational_notifications", {
    p_user: userId,
    p_workspace_rev: row.rev,
    p_scanned_at: now.toISOString(),
    p_events: events,
  });
  if (synced.error || typeof synced.data !== "boolean")
    throw new Error("notification_sync_unavailable");
  if (synced.data && process.env.OPERATIONAL_EMAIL_ENABLED === "true") {
    try {
      const queued = await db.rpc("queue_operational_email_digest", { p_user: userId });
      if (queued.error) console.warn("Operational digest could not be queued");
    } catch {
      console.warn("Operational digest could not be queued");
    }
  }
  return synced.data;
}
export const notificationRowSchema = z
  .object({
    id: z.string().uuid(),
    project_id: identity,
    kind: z.enum([
      "approval_due",
      "publication_failed",
      "manual_overdue",
      "cadence_gap",
      "scheduler_recovery",
      "generation_capacity_low",
      "generation_capacity_unavailable",
    ]),
    target_id: identity,
    target_title: z.string(),
    due_at: z.string().nullable(),
    active: z.boolean(),
    read_at: z.string().nullable(),
    created_at: z.string(),
    detail: z.object({
      timeZone: z.string(),
      queueId: z.string().uuid().optional(),
      missing: z.number().optional(),
      total: z.number().optional(),
      remaining: z.number().int().nonnegative().optional(),
      plannedPeriod: schedulerPeriodSchema.optional(),
      usagePeriod: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    }),
  })
  .superRefine((row, ctx) => {
    if (row.kind !== "generation_capacity_low" && row.kind !== "generation_capacity_unavailable")
      return;
    const d = row.detail;
    if (
      !d.plannedPeriod ||
      !d.usagePeriod ||
      !Number.isInteger(d.missing) ||
      !Number.isInteger(d.total) ||
      (d.missing ?? 0) < 1 ||
      (d.total ?? 0) < (d.missing ?? 0) ||
      (row.kind === "generation_capacity_low"
        ? d.remaining === undefined
        : d.remaining !== undefined)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_capacity_notification" });
    }
  });
export type OperationalNotificationRow = z.infer<typeof notificationRowSchema>;
export async function listOperationalNotifications(userId: string) {
  const db = await admin();
  const response = await db
    .from("operational_notifications")
    .select("id,project_id,kind,target_id,target_title,due_at,active,read_at,created_at,detail")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (response.error) throw new Error("notifications_unavailable");
  return z.array(notificationRowSchema).parse(response.data);
}
/** Bounded, fair server sweep. No active browser session and no AI/email needed. */
export async function runOperationalNotificationSweep() {
  const db = await admin();
  const response = await db.rpc("operational_notification_scan_targets", { p_limit: 20 });
  if (response.error) throw new Error("notification_targets_unavailable");
  const targets = z
    .array(z.object({ user_id: z.string().uuid() }))
    .max(20)
    .parse(response.data);
  const result = { scanned: 0, failed: 0, stale: 0 };
  for (const target of targets) {
    try {
      if (await refreshOperationalNotifications(target.user_id)) result.scanned++;
      else result.stale++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
