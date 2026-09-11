import { z } from "zod";
import { teamCommentTarget } from "./project-team";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function readTeamReviewAuthority(
  actorId: string,
  raw: z.infer<typeof teamCommentTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    input = teamCommentTarget.parse(raw);
  const result = teamCommentTarget
    .extend({
      actorId: z.string().uuid(),
      policyRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      canReview: z.boolean(),
    })
    .strict()
    .parse(
      await teamCall(
        "read_project_team_review_authority",
        {
          p_actor: actor,
          p_owner: input.ownerId,
          p_project: input.projectId,
          p_asset: input.assetId,
        },
        rpc,
      ),
    );
  if (
    result.actorId !== actor ||
    result.ownerId !== input.ownerId ||
    result.projectId !== input.projectId ||
    result.assetId !== input.assetId
  )
    throw new Error("Review authority could not be confirmed.");
  return result;
}
