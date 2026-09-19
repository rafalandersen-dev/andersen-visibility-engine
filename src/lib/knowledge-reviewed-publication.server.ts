import { readKnowledgeOutputReview } from "./knowledge-output-review.server";
import { readKnowledgeOutputReviewHistory } from "./knowledge-output-review-actions.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
import type { ContentAsset } from "./types";

/** Does not change original provenance. The saved review must still match both
 * the actual deliverable and the entire current private evidence context.
 * The snapshot rechecks current applicability/expiry at the requested time. */
export async function hasCurrentOutputKnowledgeReview(
  ownerId: string,
  asset: ContentAsset,
  now: string,
  rpc?: KnowledgeRpc,
  read?: NonNullable<Parameters<typeof readKnowledgeOutputReview>[1]>["read"],
) {
  const scope = { ownerId, projectId: asset.projectId, assetId: asset.id };
  const snapshot = await readKnowledgeOutputReview(scope, { rpc, read, now, candidate: asset });
  if (!snapshot.reviewable || snapshot.forgotten) return false;
  const history = await readKnowledgeOutputReviewHistory(scope, rpc);
  return history.some(
    (row) =>
      row.active &&
      row.withdrawnAt === null &&
      Date.parse(row.reviewedAt) <= Date.parse(now) &&
      row.versionHash === snapshot.version.hash &&
      row.contextHash === snapshot.contextHash,
  );
}
