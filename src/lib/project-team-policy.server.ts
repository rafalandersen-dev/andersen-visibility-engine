import { z } from "zod";
import { teamPolicy, teamPolicyChange, teamRosterInput } from "./project-team";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function readOwnerTeamPolicy(
  actorId: string,
  raw: z.infer<typeof teamRosterInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamRosterInput.parse(raw);
  const result = teamPolicy.parse(
    await teamCall(
      "read_project_team_approval_policy",
      { p_actor: actor, p_owner: actor, p_project: input.projectId },
      rpc,
    ),
  );
  if (result.ownerId !== actor || result.projectId !== input.projectId)
    throw new Error("Team policy could not be confirmed.");
  return result;
}
export async function changeOwnerTeamPolicy(
  actorId: string,
  raw: z.infer<typeof teamPolicyChange>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamPolicyChange.parse(raw);
  const revision = z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .parse(
      await teamCall(
        "set_project_team_approval_policy",
        {
          p_actor: actor,
          p_owner: actor,
          p_project: input.projectId,
          p_expected: input.expectedRevision,
          p_mode: input.mode,
        },
        rpc,
      ),
    );
  if (revision !== input.expectedRevision + 1)
    throw new Error("Team policy could not be confirmed.");
  return { revision };
}
