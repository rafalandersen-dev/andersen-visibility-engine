import { z } from "zod";
import { readWorkspaceRow } from "./workspace.server";
import { readPublicationApproval } from "./publication-approval.server";
import { readSchedulerControl, readWeeklyPreparation } from "./weekly-preparation.server";
import { normalizeAutoSchedulerConfig } from "./auto-scheduler";
import { localWeekStart } from "./weekly-preparation";
import type { ContentAsset, Project } from "./types";

export const awarenessInput = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    page: z.number().int().min(0).max(19).default(0),
  })
  .strict();
const queueSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      asset_id: z.string(),
      publish_at: z.string().datetime({ offset: true }),
      status: z.enum([
        "pending",
        "publishing",
        "published",
        "failed",
        "cancelled",
        "review_required",
      ]),
    }),
  )
  .max(1000);

/** Read-only, request-scoped feed. Never persists operational notifications and
 * therefore cannot enter either digest queueing or delivery selection. */
export async function readWorkAwareness(
  ownerId: string,
  raw: z.infer<typeof awarenessInput>,
  now = new Date(),
) {
  z.string().uuid().parse(ownerId);
  const input = awarenessInput.parse(raw);
  const row = await readWorkspaceRow(ownerId);
  const project = (row?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === input.projectId,
  );
  if (!row || !project) throw new Error("awareness_unavailable");
  const assets = ((row.data.content ?? []) as ContentAsset[]).filter(
    (a) => a.projectId === project.id,
  );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin
    .from("scheduled_publishes")
    .select("id,asset_id,publish_at,status")
    .eq("user_id", ownerId)
    .eq("project_id", project.id)
    .order("id")
    .limit(1001);
  if (result.error) throw new Error("awareness_unavailable");
  const queue = queueSchema.parse(result.data);
  const candidates = queue.filter((q) => {
    const asset = assets.find((a) => a.id === q.asset_id);
    if (!asset || asset.livePublishStatus === "published") return false;
    return (
      q.status === "review_required" ||
      (q.status === "pending" && Date.parse(q.publish_at) <= now.getTime() + 86400000)
    );
  });
  const scope = { ownerId, projectId: project.id };
  const control = await readSchedulerControl(scope);
  const schedule = normalizeAutoSchedulerConfig(project.autoScheduler);
  const pages = Math.max(1, Math.ceil(candidates.length / 50));
  const page = Math.min(input.page, pages - 1);
  const selected = candidates.slice(page * 50, (page + 1) * 50);
  const approvals: Array<{
    id: string;
    assetId: string;
    title: string;
    publishAt: string;
    state: "approval" | "resume";
    late: boolean;
  }> = [];
  // Bound parallel read work; re-use the exact saved snapshot used for the list.
  for (let index = 0; index < selected.length; index += 10) {
    const group = await Promise.all(
      selected.slice(index, index + 10).map(async (q) => {
        const asset = assets.find((a) => a.id === q.asset_id)!;
        const approval = await readPublicationApproval(
          { ...scope, assetId: asset.id },
          { read: async () => row },
        );
        if (q.status === "pending" && approval.approved) return null;
        return {
          id: q.id,
          assetId: asset.id,
          title: asset.title,
          publishAt: q.publish_at,
          state: approval.approved ? ("resume" as const) : ("approval" as const),
          late: Date.parse(q.publish_at) < now.getTime(),
        };
      }),
    );
    approvals.push(...group.filter((x): x is NonNullable<typeof x> => x !== null));
  }
  const weeks: Array<Awaited<ReturnType<typeof readWeeklyPreparation>>> = [];
  if (control.engine === "weekly" && schedule.enabled) {
    const current = localWeekStart(now, schedule.timeZone);
    for (const start of [
      current,
      new Date(Date.parse(current + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10),
    ]) {
      weeks.push(await readWeeklyPreparation(scope, start, now));
    }
  }
  // A concurrent workspace edit must not be presented as fresh scoped evidence.
  const latest = await readWorkspaceRow(ownerId);
  if (!latest || latest.rev !== row.rev) throw new Error("awareness_changed");
  return {
    projectId: project.id,
    checkedAt: now.toISOString(),
    timeZone: schedule.timeZone,
    engine: control.engine,
    enabled: schedule.enabled,
    approvals,
    page,
    pages,
    weeks: weeks.map((w) => ({
      period: w.period,
      summary: w.summary,
      readiness: w.readiness,
      stages: w.stages.map((s) => ({
        requestId: s.requestId,
        state: s.state,
        publishAt: s.publishAt,
      })),
    })),
  };
}
