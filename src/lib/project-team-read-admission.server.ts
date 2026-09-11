import { projectTeamRpc } from "./project-team-membership.server";
import { readProjectTeamComments } from "./project-team-comments.server";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import { readTeamProject, type TeamReadRpc } from "./project-team-read.server";

/** Snapshot reads share the actor/owner budgets used by rendered previews.
 * The lease belongs to the actual RPC, including when the reader's UI deadline expires. */
export async function readAdmittedTeamProject(
  actor: string,
  input: Parameters<typeof readTeamProject>[1],
  rpc: TeamReadRpc,
) {
  return readTeamProject(actor, input, admittedReadRpc(actor, rpc));
}
export async function readAdmittedTeamComments(
  actor: string,
  input: Parameters<typeof readProjectTeamComments>[1],
  rpc: TeamReadRpc,
) {
  return readProjectTeamComments(actor, input, admittedReadRpc(actor, rpc));
}
export function admittedReadRpc(actor: string, rpc: TeamReadRpc = projectTeamRpc): TeamReadRpc {
  const deadline = Date.now() + 10000;
  return async (name, args) => {
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
  };
}
