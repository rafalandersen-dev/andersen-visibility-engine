import { z } from "zod";
import { teamCommentTarget } from "./project-team";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import type { ContentAsset, Project } from "./types";
const contextSchema = teamCommentTarget
  .extend({
    actorId: z.string().uuid(),
    workspaceRevision: z.number().int().min(0),
    membershipRevision: z.number().int().min(1),
    draftHash: z.string().regex(/^[a-f0-9]{64}$/),
    project: z.record(z.unknown()),
    asset: z.record(z.unknown()),
    links: z.array(z.object({ liveUrl: z.string().max(4000) }).strict()).max(5000),
  })
  .strict();
/** Private server context only. No endpoint may return/spread this object. */
export async function readTeamReviewContext(
  actorId: string,
  raw: z.infer<typeof teamCommentTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamCommentTarget.parse(raw);
  const context = contextSchema.parse(
    await teamCall(
      "read_project_team_review_context",
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
    context.actorId !== actor ||
    context.ownerId !== input.ownerId ||
    context.projectId !== input.projectId ||
    context.assetId !== input.assetId ||
    context.project.id !== input.projectId ||
    context.asset.id !== input.assetId ||
    context.asset.projectId !== input.projectId
  )
    throw new Error("Project access could not be confirmed.");
  if (new TextEncoder().encode(JSON.stringify(context)).byteLength > 4000000)
    throw new Error("Project review is too large.");
  return {
    ...context,
    project: context.project as unknown as Project,
    asset: context.asset as unknown as ContentAsset,
  };
}
