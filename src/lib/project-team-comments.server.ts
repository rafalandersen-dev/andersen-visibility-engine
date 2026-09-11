import { z } from "zod";
import { teamCommentRead, teamCommentAdd, teamComments } from "./project-team";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function readProjectTeamComments(
  actorId: string,
  raw: z.input<typeof teamCommentRead>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamCommentRead.parse(raw);
  const result = teamComments.parse(
    await teamCall(
      "read_project_team_comments",
      {
        p_actor: actor,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_asset: input.assetId,
        p_offset: input.offset,
      },
      rpc,
    ),
  );
  if (
    result.ownerId !== input.ownerId ||
    result.projectId !== input.projectId ||
    result.assetId !== input.assetId
  )
    throw new Error("Project access could not be confirmed.");
  return result;
}
export async function addProjectTeamComment(
  actorId: string,
  raw: z.infer<typeof teamCommentAdd>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamCommentAdd.parse(raw);
  z.literal(true).parse(
    await teamCall(
      "add_project_team_comment",
      {
        p_actor: actor,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_asset: input.assetId,
        p_comment: input.commentId,
        p_expected: input.expectedRevision,
        p_body: input.body,
      },
      rpc,
    ),
  );
  return { saved: true as const };
}
