import { z } from "zod";
import { normalizeAutoSchedulerConfig } from "./auto-scheduler";
import type { Project } from "./types";
const identity = z.string().min(1).max(200);
const instant = z.string().datetime({ offset: true });
const leaseSchema = z
  .array(
    z.object({
      planned_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      status: z.enum(["active", "released", "unknown"]),
      acquired_at: instant,
      lease_until: instant,
    }),
  )
  .max(1);
const queueSchema = z
  .array(
    z.object({
      asset_id: identity,
      status: z.enum(["pending", "publishing", "published", "failed", "cancelled"]),
    }),
  )
  .max(1000);
const workspaceSchema = z.object({
  projects: z
    .array(z.object({ id: identity, name: z.string(), businessName: z.string() }).passthrough())
    .max(1000),
  content: z
    .array(
      z
        .object({
          id: identity,
          projectId: identity,
          title: z.string(),
          status: z.string().min(1).max(100),
          updatedAt: instant,
          autoScheduledFor: z.string().optional(),
          autoSchedulerPlannedAt: instant.optional(),
        })
        .passthrough(),
    )
    .max(5000)
    .default([]),
});
type Response = { data: unknown; error: unknown };
interface Query extends PromiseLike<Response> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  limit(n: number): Query;
}
interface Dependencies {
  workspace(userId: string): Promise<{ data: unknown; rev: number } | null>;
  db: { from(table: string): Query };
}
export async function inspectSchedulerRecovery(
  userId: string,
  projectId: string,
  now = new Date(),
  deps?: Dependencies,
) {
  if (!deps) {
    const { readWorkspaceRow } = await import("./workspace.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    deps = { workspace: readWorkspaceRow, db: supabaseAdmin as unknown as Dependencies["db"] };
  }
  const row = await deps.workspace(userId);
  if (!row) throw new Error("recovery_source_unavailable");
  const workspace = workspaceSchema.parse(row.data);
  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("recovery_project_unavailable");
  // Ownership is established from the authenticated account's workspace before
  // the service-role query, and every independent table read remains scoped.
  const leaseResult = await deps.db
    .from("auto_scheduler_leases")
    .select("planned_period,status,acquired_at,lease_until")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .limit(2);
  if (leaseResult.error) throw new Error("recovery_source_unavailable");
  const lease = leaseSchema.parse(leaseResult.data)[0];
  if (!lease) return { state: "absent" as const, checkedAt: now.toISOString() };
  const queueResult = await deps.db
    .from("scheduled_publishes")
    .select("asset_id,status")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .limit(1001);
  if (queueResult.error) throw new Error("recovery_source_unavailable");
  const queue = queueSchema.parse(queueResult.data);
  const saved = workspace.content.filter(
    (asset) => asset.projectId === projectId && asset.autoScheduledFor === lease.planned_period,
  );
  const savedIds = new Set(saved.map((asset) => asset.id));
  if (savedIds.size !== saved.length) throw new Error("recovery_source_unavailable");
  const counts = {
    saved: saved.length,
    pending: 0,
    publishing: 0,
    published: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const q of queue) if (savedIds.has(q.asset_id)) counts[q.status]++;
  // These are saved Milo records, not destination/provider verification. Never
  // reset a lease, retry a job or infer the outcome of an unrecorded operation.
  return {
    state:
      lease.status === "released"
        ? ("completed" as const)
        : lease.status === "active" && Date.parse(lease.lease_until) > now.getTime()
          ? ("running" as const)
          : ("review_required" as const),
    checkedAt: now.toISOString(),
    startedAt: lease.acquired_at,
    plannedPeriod: lease.planned_period,
    timeZone: normalizeAutoSchedulerConfig(project.autoScheduler as Project["autoScheduler"])
      .timeZone,
    workspaceRevision: row.rev,
    counts,
    assets: saved
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, 25)
      .map((asset) => ({
        id: asset.id,
        title: asset.title.slice(0, 300),
        plannedAt: asset.autoSchedulerPlannedAt ?? null,
      })),
  };
}
