import { z } from "zod";
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
async function rpc(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as { rpc: Rpc }).rpc(name, args);
}
export async function acquireTeamMedia(actor: string) {
  const result = await rpc("acquire_project_team_media", { p_actor: actor });
  if (result.error)
    throw new Error("The image review allowance is busy. Wait before trying again.");
  return z.string().uuid().parse(result.data);
}
export async function releaseTeamMedia(actor: string, lease: string) {
  const result = await rpc("release_project_team_media", { p_actor: actor, p_lease: lease });
  if (result.error) throw new Error("media_release_unavailable");
}
