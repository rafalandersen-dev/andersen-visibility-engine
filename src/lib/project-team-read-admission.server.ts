import { projectTeamRpc } from "./project-team-membership.server";
import { readProjectTeamComments } from "./project-team-comments.server";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import { readTeamProject, type TeamReadRpc } from "./project-team-read.server";
import { TeamAdmissionBusyError } from "./project-team-admission";

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

/** Acquire attempts, pauses between them and the default absolute budget for the
 * normal page reads that opt in (conversation directory and page, actor projects).
 * Small and fixed; it never raises any admission limit. */
export const READ_ADMISSION_ATTEMPTS = 3;
export const READ_ADMISSION_BACKOFF_MS = [30, 90] as const;
export const READ_ADMISSION_BUDGET_MS = 1500;

/** Retries ONLY a refused acquire. `acquire_project_team_preview` refuses with
 * team_preview_capacity (actor/owner advisory try-lock, active-lease cap or rate
 * limit) or 55P03 (limits row NOWAIT) by raising before it grants a lease or
 * counts anything, so a refused acquire leaves no lease, spends no budget and has
 * run no read. Each attempt re-runs its account/membership/project checks; an
 * access refusal or transport/storage error is never retried, and no attempt starts
 * at or past `deadline` (checked before every acquire, the first included, and
 * again after every pause). A genuine rate limit is simply refused again and
 * surfaces as busy after the bound. */
async function acquireForRead(
  actor: string,
  owner: string,
  project: string | null,
  rpc: TeamReadRpc,
  deadline: number,
) {
  for (let attempt = 1; ; attempt++) {
    // Before EVERY acquire, the first included: an expired budget starts no RPC, so
    // there is no lease and nothing to release.
    if (Date.now() >= deadline) throw new TeamAdmissionBusyError();
    try {
      return await acquireTeamPreview(actor, owner, project, rpc);
    } catch (error) {
      if (!(error instanceof TeamAdmissionBusyError) || attempt >= READ_ADMISSION_ATTEMPTS)
        throw error;
      const pause = READ_ADMISSION_BACKOFF_MS[attempt - 1];
      if (Date.now() + pause >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, pause));
      if (Date.now() >= deadline) throw error;
    }
  }
}

/** `acquireUntil`: opt into the bounded acquire retry above, with that absolute
 * deadline. Without it the single acquire is unchanged (other reads, and the CR
 * begin path, which owns its own rollback-only retry). */
export function admittedReadRpc(
  actor: string,
  rpc: TeamReadRpc = projectTeamRpc,
  options: { acquireUntil?: number } = {},
): TeamReadRpc {
  const deadline = Date.now() + 10000;
  return async (name, args) => {
    const discovery = name === "list_my_project_teams";
    const owner = discovery ? actor : (args.p_owner as string);
    const project = discovery ? null : (args.p_project as string);
    const lease =
      options.acquireUntil === undefined
        ? await acquireTeamPreview(args.p_actor as string, owner, project, rpc)
        : await acquireForRead(
            args.p_actor as string,
            owner,
            project,
            rpc,
            Math.min(options.acquireUntil, deadline),
          );
    try {
      if (Date.now() >= deadline) throw new Error("team_read_timeout");
      return await rpc(name, args);
    } finally {
      await releaseTeamPreview(actor, owner, lease, rpc).catch(() => {});
    }
  };
}
