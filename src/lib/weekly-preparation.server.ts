import { z } from "zod";
import { weeklyPreparationSchema } from "./weekly-preparation";
import type { KnowledgeRpc } from "./project-knowledge.server";

export const schedulerControlSchema = z
  .object({
    revision: z.number().int().min(0).max(2147483646),
    engine: z.enum(["monthly", "weekly", "paused"]),
    preparation: weeklyPreparationSchema,
  })
  .strict();
export const schedulerControlUpdateSchema = schedulerControlSchema
  .omit({ revision: true })
  .extend({
    expectedRevision: z.number().int().min(0).max(2147483645),
  })
  .strict();
const scopeSchema = z
  .object({
    ownerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();
export class SchedulerControlUnavailableError extends Error {
  constructor() {
    super("scheduler_control_unavailable");
  }
}
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SchedulerControlUnavailableError()), 10000);
      }),
    ]);
    if (!result || result.error) throw new SchedulerControlUnavailableError();
    return schedulerControlSchema.parse(result.data);
  } catch {
    throw new SchedulerControlUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
export async function readSchedulerControl(
  target: z.infer<typeof scopeSchema>,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  return call(
    "read_project_scheduler_control",
    { p_user: scope.ownerId, p_project: scope.projectId },
    rpc,
  );
}
export async function setSchedulerControl(
  target: z.infer<typeof scopeSchema>,
  raw: z.infer<typeof schedulerControlUpdateSchema>,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const input = schedulerControlUpdateSchema.parse(raw);
  const result = await call(
    "set_project_scheduler_control",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_expected: input.expectedRevision,
      p_engine: input.engine,
      p_preparation: input.preparation,
    },
    rpc,
  );
  if (
    result.revision !== input.expectedRevision + 1 ||
    result.engine !== input.engine ||
    result.preparation.preparationWeekday !== input.preparation.preparationWeekday ||
    result.preparation.preparationTime !== input.preparation.preparationTime ||
    result.preparation.reviewLeadHours !== input.preparation.reviewLeadHours
  )
    throw new SchedulerControlUnavailableError();
  return result;
}

export async function readWeeklyPreparation(
  target: z.infer<typeof scopeSchema>,
  weekStart: string,
  now = new Date(),
) {
  const scope = scopeSchema.parse(target);
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(weekStart);
  const { readWorkspaceRow } = await import("./workspace.server");
  const { normalizeAutoSchedulerConfig } = await import("./auto-scheduler");
  const { weeklyReadiness, weeklyQueueSchema } = await import("./weekly-readiness");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const workspace = (await readWorkspaceRow(scope.ownerId))?.data;
  const projects = Array.isArray(workspace?.projects)
    ? (workspace.projects as import("./types").Project[])
    : [];
  const project = projects.find((p) => p.id === scope.projectId);
  if (!project) throw new SchedulerControlUnavailableError();
  const control = await readSchedulerControl(scope);
  const schedule = normalizeAutoSchedulerConfig(project.autoScheduler);
  const assets = (
    Array.isArray(workspace?.content) ? (workspace.content as import("./types").ContentAsset[]) : []
  ).filter((a) => a.projectId === scope.projectId);
  // Include cancellations/failures as reservations, so a retry cannot replace an
  // owner's decision. A bounded complete queue is required; never hide overflow.
  const { data, error } = await supabaseAdmin
    .from("scheduled_publishes")
    .select("asset_id,publish_at,status")
    .eq("user_id", scope.ownerId)
    .eq("project_id", scope.projectId)
    .limit(1001);
  if (error || !Array.isArray(data) || data.length > 1000)
    throw new SchedulerControlUnavailableError();
  const queue = weeklyQueueSchema.parse(
    data.map((r) => ({
      assetId: r.asset_id,
      publishAt: r.publish_at,
      status: r.status,
    })),
  );
  const readiness = weeklyReadiness({
    projectId: scope.projectId,
    weekStart,
    now,
    schedule,
    preparation: control.preparation,
    assets,
    booked: [],
    queue,
  });
  const { readWeeklyStages } = await import("./weekly-stage.server");
  const { readWeeklySummary } = await import("./weekly-executor.server");
  const stages = await readWeeklyStages(scope, readiness.period);
  const summary = await readWeeklySummary(scope, readiness.period);
  const cancelled = (publishAt: string) =>
    stages.some(
      (s) => Date.parse(s.publishAt) === Date.parse(publishAt) && s.state === "cancelled",
    );
  readiness.missing = readiness.missing.filter((s) => !cancelled(s.publishAt));
  readiness.readiness = readiness.readiness.map((s) =>
    s.state === "missing" && cancelled(s.publishAt) ? { ...s, state: "cancelled" } : s,
  );

  return {
    ...readiness,
    stages: stages.map(({ result: _result, inputHash: _hash, ...stage }) => stage),
    summary,
    control,
    enabled: schedule.enabled,
    timeZone: schedule.timeZone,
  };
}
