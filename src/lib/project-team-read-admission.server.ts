import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import { readTeamProject, type TeamReadRpc } from "./project-team-read.server";

/** Snapshot reads share the actor/owner budgets used by rendered previews.
 * The lease belongs to the actual RPC, including when the reader's UI deadline expires. */
export async function readAdmittedTeamProject(
  actor: string,
  input: Parameters<typeof readTeamProject>[1],
  rpc: TeamReadRpc,
) {
  const deadline = Date.now() + 10000;
  return readTeamProject(actor, input, async (name, args) => {
    const lease = await acquireTeamPreview(
      args.p_actor as string,
      args.p_owner as string,
      args.p_project as string,
      rpc,
    );
    try {
      if (Date.now() >= deadline) throw new Error("team_read_timeout");
      return await rpc(name, args);
    } finally {
      await releaseTeamPreview(actor, args.p_owner as string, lease, rpc).catch(() => {});
    }
  });
}
