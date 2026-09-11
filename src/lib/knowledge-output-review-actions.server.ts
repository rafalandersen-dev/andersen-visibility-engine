import { z } from "zod";
import {
  knowledgeOutputReviewScope,
  readKnowledgeOutputReview,
} from "./knowledge-output-review.server";
import { samePublicationVersion } from "./publication-version";
import { knowledgeReviewRpc } from "./knowledge-review-context.server";
import type { KnowledgeRpc } from "./project-knowledge.server";

import { knowledgeReviewInput } from "./knowledge-output-review";
const historySchema = z
  .array(
    z
      .object({
        reviewId: z.string().uuid(),
        versionHash: z.string().regex(/^[a-f0-9]{64}$/),
        contextHash: z.string().regex(/^[a-f0-9]{64}$/),
        active: z.boolean(),
        reviewedAt: z.string().datetime({ offset: true }),
        withdrawnAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
  )
  .max(100);
type Scope = z.infer<typeof knowledgeOutputReviewScope>;
type Dependencies = Parameters<typeof readKnowledgeOutputReview>[1];

/** Re-read the saved deliverable and private state. Browser acknowledgements
 * identify the facts shown; they never supply replacement facts or authority. */
export async function saveKnowledgeOutputReview(
  target: Scope,
  raw: z.infer<typeof knowledgeReviewInput>,
  dependencies: Dependencies = {},
) {
  const scope = knowledgeOutputReviewScope.parse(target);
  const input = knowledgeReviewInput.parse(raw);
  const snapshot = await readKnowledgeOutputReview(scope, dependencies);
  if (
    !snapshot.reviewable ||
    !samePublicationVersion(snapshot.version, input.expectedVersion) ||
    snapshot.contextHash !== input.expectedContext
  )
    throw new Error("knowledge_review_changed");
  const actual = new Set(snapshot.facts.map((f) => f.reviewKey));
  const acknowledged = new Set(input.reviewedFacts);
  if (
    acknowledged.size !== input.reviewedFacts.length ||
    actual.size !== acknowledged.size ||
    [...actual].some((key) => !acknowledged.has(key))
  )
    throw new Error("knowledge_review_incomplete");
  const saved = await knowledgeReviewRpc(
    "save_output_knowledge_review",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_asset: scope.assetId,
      p_review: input.reviewId,
      p_expected: snapshot.workspaceRevision,
      p_version: snapshot.version.hash,
      p_context: snapshot.contextHash,
    },
    dependencies.rpc,
  );
  if (saved !== true) throw new Error("knowledge_review_unavailable");
  return { reviewId: input.reviewId };
}
export async function readKnowledgeOutputReviewHistory(target: Scope, rpc?: KnowledgeRpc) {
  const scope = knowledgeOutputReviewScope.parse(target);
  const rows = historySchema.parse(
    await knowledgeReviewRpc(
      "read_output_knowledge_reviews",
      {
        p_user: scope.ownerId,
        p_project: scope.projectId,
        p_asset: scope.assetId,
      },
      rpc,
    ),
  );
  if (
    new Set(rows.map((row) => row.reviewId)).size !== rows.length ||
    rows.filter((row) => row.active).length > 1
  )
    throw new Error("knowledge_review_unavailable");
  return rows;
}
export async function withdrawKnowledgeOutputReview(
  target: Scope,
  reviewId: string,
  rpc?: KnowledgeRpc,
) {
  const scope = knowledgeOutputReviewScope.parse(target);
  z.string().uuid().parse(reviewId);
  const result = await knowledgeReviewRpc(
    "withdraw_output_knowledge_review",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_asset: scope.assetId,
      p_review: reviewId,
    },
    rpc,
  );
  if (typeof result !== "boolean") throw new Error("knowledge_review_unavailable");
  return result;
}
