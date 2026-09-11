import { z } from "zod";
import { teamCommentTarget, teamReviewDecision } from "./project-team";
import { readProjectTeamPreview } from "./project-team-preview.server";
import { readProjectTeamMedia } from "./project-team-media.server";
import { samePublicationVersion } from "./publication-version";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
type Dependencies = {
  preview?: typeof readProjectTeamPreview;
  media?: typeof readProjectTeamMedia;
  rpc?: TeamReadRpc;
  now?: () => number;
};
export async function saveProjectTeamReview(
  actorId: string,
  raw: z.infer<typeof teamReviewDecision>,
  deps: Dependencies = {},
) {
  const actor = z.string().uuid().parse(actorId),
    input = teamReviewDecision.parse(raw);
  const scope = { ownerId: input.ownerId, projectId: input.projectId, assetId: input.assetId };
  const preview = deps.preview ?? readProjectTeamPreview,
    media = deps.media ?? readProjectTeamMedia;
  const now = deps.now ?? Date.now,
    deadline = now() + 65000;
  const assertCurrent = (current: Awaited<ReturnType<typeof readProjectTeamPreview>>) => {
    if (
      !current.canReview ||
      current.draftHash !== input.expectedHash ||
      current.workspaceRevision !== input.expectedWorkspaceRevision ||
      current.membershipRevision !== input.expectedMembershipRevision ||
      current.policyRevision !== input.expectedPolicyRevision ||
      !samePublicationVersion(current.version, input.expectedVersion)
    )
      throw new Error("The review changed. Refresh and inspect the current draft before deciding.");
  };
  const current = await preview(actor, scope);
  assertCurrent(current);
  if (input.approved) {
    const acknowledged = new Map(input.images.map((image) => [image.key, image.byteHash]));
    if (
      !input.acknowledged ||
      current.unknownImages !== 0 ||
      acknowledged.size !== input.images.length ||
      acknowledged.size !== current.media.length ||
      current.media.some((image) => !acknowledged.has(image.key))
    )
      throw new Error("Inspect the complete rendered draft and every image before approving.");
    // Up to six bounded downloads at a time. A timeout never leads to a later
    // approval write; remaining work is read-only and admission is checked again.
    for (let offset = 0; offset < current.media.length; offset += 6) {
      if (now() >= deadline)
        throw new Error("The image review timed out. Refresh before trying again.");
      await Promise.all(
        current.media.slice(offset, offset + 6).map(async (image) => {
          const checked = await media(actor, {
            ...scope,
            imageId: image.imageId,
            kind: image.kind,
            expectedHash: current.draftHash,
          });
          if (
            checked.imageId !== image.imageId ||
            checked.draftHash !== current.draftHash ||
            checked.byteHash !== acknowledged.get(image.key)
          )
            throw new Error("An image changed after you inspected it. Refresh the review.");
        }),
      );
    }
  }
  const final = await preview(actor, scope);
  assertCurrent(final);
  if (now() >= deadline) throw new Error("The review timed out. Refresh before trying again.");
  // Rejecting changes the exact saved version's status but does not attest that
  // missing/broken images were reviewed. Neither decision publishes anything.
  const result = await teamCall(
    "save_project_team_approval",
    {
      p_actor: actor,
      p_owner: input.ownerId,
      p_project: input.projectId,
      p_asset: input.assetId,
      p_review: input.reviewId,
      p_expected: final.workspaceRevision,
      p_draft_hash: final.draftHash,
      p_version: final.version.hash,
      p_membership: final.membershipRevision,
      p_policy: final.policyRevision,
      p_approved: input.approved,
      p_images: input.approved ? input.images : [],
    },
    deps.rpc ?? projectTeamRpc,
  );
  z.literal(true).parse(result);
  return { saved: true as const, approved: input.approved };
}
export async function readProjectTeamReviewHistory(
  actorId: string,
  raw: { ownerId: string; projectId: string; assetId: string },
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    scope = teamCommentTarget.parse(raw);
  const result = teamCommentTarget
    .extend({
      reviews: z
        .array(
          z
            .object({
              reviewId: z.string().uuid(),
              mine: z.boolean(),
              owner: z.boolean(),
              approved: z.boolean(),
              versionHash: z.string().regex(/^[a-f0-9]{64}$/),
              createdAt: z.string().datetime({ offset: true }),
            })
            .strict(),
        )
        .max(20),
    })
    .strict()
    .parse(
      await teamCall(
        "read_project_team_review_history",
        {
          p_actor: actor,
          p_owner: scope.ownerId,
          p_project: scope.projectId,
          p_asset: scope.assetId,
        },
        rpc,
      ),
    );
  if (
    result.ownerId !== scope.ownerId ||
    result.projectId !== scope.projectId ||
    result.assetId !== scope.assetId
  )
    throw new Error("Review history could not be confirmed.");
  return result;
}
