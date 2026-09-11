import { z } from "zod";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import { teamReviewDecision } from "./project-team";
import { readProjectTeamPreview } from "./project-team-preview.server";
import { readProjectTeamMedia } from "./project-team-media.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function assertReviewedPublicationImages(
  scope: { ownerId: string; projectId: string; assetId: string },
  versionHash: string,
  deps: {
    rpc?: TeamReadRpc;
    preview?: typeof readProjectTeamPreview;
    media?: typeof readProjectTeamMedia;
  } = {},
) {
  const rpc = deps.rpc ?? projectTeamRpc;
  const load = async () =>
    z
      .object({ images: teamReviewDecision.shape.images.nullable() })
      .strict()
      .parse(
        await teamCall(
          "read_publication_reviewed_images",
          {
            p_user: scope.ownerId,
            p_project: scope.projectId,
            p_asset: scope.assetId,
            p_hash: versionHash,
          },
          rpc,
        ),
      );
  const saved = await load();
  // Independent legacy owner approval has no delegated image attestation.
  if (saved.images === null) return;
  const expected = new Map(saved.images.map((image) => [image.key, image.byteHash]));
  const preview = await (deps.preview ?? readProjectTeamPreview)(scope.ownerId, scope);
  if (
    preview.version.hash !== versionHash ||
    preview.unknownImages ||
    expected.size !== saved.images.length ||
    expected.size !== preview.media.length ||
    preview.media.some((image) => !expected.has(image.key))
  )
    throw new Error("publication_review_images_changed");
  const deadline = Date.now() + 65000;
  for (let offset = 0; offset < preview.media.length; offset += 6) {
    if (Date.now() >= deadline) throw new Error("publication_review_images_timed_out");
    await Promise.all(
      preview.media.slice(offset, offset + 6).map(async (image) => {
        const bytes = await (deps.media ?? readProjectTeamMedia)(scope.ownerId, {
          ...scope,
          imageId: image.imageId,
          kind: image.kind,
          expectedHash: preview.draftHash,
        });
        if (
          bytes.imageId !== image.imageId ||
          bytes.draftHash !== preview.draftHash ||
          bytes.byteHash !== expected.get(image.key)
        )
          throw new Error("publication_review_images_changed");
      }),
    );
  }
  const final = await (deps.preview ?? readProjectTeamPreview)(scope.ownerId, scope);
  if (
    Date.now() >= deadline ||
    final.version.hash !== versionHash ||
    final.draftHash !== preview.draftHash
  )
    throw new Error("publication_review_images_changed");
  if (JSON.stringify(await load()) !== JSON.stringify(saved))
    throw new Error("publication_review_images_changed");
}
