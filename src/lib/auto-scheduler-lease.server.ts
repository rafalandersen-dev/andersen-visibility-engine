import { z } from "zod";
async function rpc(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (
    supabaseAdmin as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    }
  ).rpc(name, args);
}
export async function acquireSchedulerLease(
  userId: string,
  projectId: string,
  plannedPeriod: string,
) {
  const result = await rpc("claim_auto_scheduler_lease", {
    p_user: userId,
    p_project: projectId,
    p_period: plannedPeriod,
  });
  if (result.error)
    throw new Error("Scheduler safety check is unavailable. No new AI work was started.");
  if (result.data === null)
    throw new Error(
      "Another scheduler run is active or needs recovery review. No new AI work was started.",
    );
  const parsed = z.string().uuid().safeParse(result.data);
  if (!parsed.success)
    throw new Error("Scheduler safety confirmation is invalid. No new AI work was started.");
  return parsed.data;
}
export async function assertSchedulerLease(userId: string, projectId: string, token: string) {
  const result = await rpc("check_auto_scheduler_lease", {
    p_user: userId,
    p_project: projectId,
    p_token: token,
  });
  if (result.error || result.data !== true)
    throw new Error(
      "Scheduler ownership could not be confirmed. Further AI work is paused; saved drafts remain available.",
    );
}
export async function releaseSchedulerLease(userId: string, projectId: string, token: string) {
  const result = await rpc("release_auto_scheduler_lease", {
    p_user: userId,
    p_project: projectId,
    p_token: token,
  });
  if (result.error || result.data !== true)
    throw new Error("Scheduler completion needs recovery review. Saved drafts remain available.");
}
