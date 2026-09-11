import { z } from "zod";
import { teamDraftEdit } from "./project-team";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function saveProjectTeamDraft(
  actorId: string,
  raw: z.infer<typeof teamDraftEdit>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamDraftEdit.parse(raw);
  const result = await teamCall(
    "save_project_team_draft",
    {
      p_actor: actor,
      p_owner: input.ownerId,
      p_project: input.projectId,
      p_asset: input.assetId,
      p_edit: input.editId,
      p_hash: input.expectedHash,
      p_membership: input.expectedMembershipRevision,
      p_patch: input.fields,
    },
    rpc,
  );
  return {
    draftHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(result),
  };
}
