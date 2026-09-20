import { z } from "zod";
import {
  citationFindingForReviewSchema,
  citationFindingReviewInputSchema,
  citationFindingReviewListSchema,
  citationFindingReviewReceiptSchema,
  citationFindingReviewRemoveSchema,
  citationFindingReviewTargetSchema,
} from "./citation-finding-review";
import type { KnowledgeRpc } from "./project-knowledge.server";
// The authenticated CALLER is the actor (an independent reviewer, or the owner for the owner-side reads);
// the owner/project/finding they act on are supplied by the review surface. The database — not this layer —
// decides authority from the live project team membership/policy, so a reviewer can act and an owner can
// never be recorded as an independent reviewer.
// Only this small, actionable allowlist of database codes is surfaced to the caller; EVERY other failure
// (validation, a raw database error, network or the timeout) collapses to the generic code so no raw
// database error text ever escapes.
const SURFACED_REVIEW_ERRORS = new Set([
  "citation_review_forbidden",
  "citation_review_stale",
  "citation_review_conflict",
  "citation_review_capacity",
  "citation_review_invalid",
  "citation_finding_unavailable",
]);
function surfacedReviewError(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  return typeof message === "string" && SURFACED_REVIEW_ERRORS.has(message)
    ? message
    : "citation_review_unavailable";
}
class CitationReviewError extends Error {}
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("citation_review_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw new CitationReviewError(surfacedReviewError(r.error));
    return r.data;
  } catch (error) {
    throw error instanceof CitationReviewError ? error : Error("citation_review_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
const actorId = z.string().uuid();
export async function saveCitationFindingReview(
  actor: string,
  raw: z.infer<typeof citationFindingReviewInputSchema>,
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const input = citationFindingReviewInputSchema.parse(raw);
  return citationFindingReviewReceiptSchema.parse(
    await call(
      "save_ai_citation_finding_review",
      {
        p_actor: a,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_finding: input.findingRowId,
        p_expected_sha: input.expectedSha,
        p_decision: input.decision,
        p_note: input.note ?? null,
      },
      rpc,
    ),
  );
}
export async function readCitationFindingReviews(
  actor: string,
  raw: z.infer<typeof citationFindingReviewTargetSchema>,
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const input = citationFindingReviewTargetSchema.parse(raw);
  const result = citationFindingReviewListSchema.parse(
    await call(
      "read_ai_citation_finding_reviews",
      {
        p_actor: a,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_finding: input.findingRowId,
      },
      rpc,
    ),
  );
  if (
    result.ownerId !== input.ownerId ||
    result.projectId !== input.projectId ||
    result.findingRowId !== input.findingRowId
  )
    throw Error("citation_review_unavailable");
  return result;
}
export async function getCitationFindingForReview(
  actor: string,
  raw: z.infer<typeof citationFindingReviewTargetSchema>,
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const input = citationFindingReviewTargetSchema.parse(raw);
  const result = citationFindingForReviewSchema.parse(
    await call(
      "read_ai_citation_finding_for_review",
      { p_actor: a, p_owner: input.ownerId, p_project: input.projectId, p_id: input.findingRowId },
      rpc,
    ),
  );
  if (result.id !== input.findingRowId) throw Error("citation_review_unavailable");
  return result;
}
export async function removeCitationFindingReview(
  actor: string,
  raw: z.infer<typeof citationFindingReviewRemoveSchema>,
  rpc?: KnowledgeRpc,
) {
  const a = actorId.parse(actor);
  const input = citationFindingReviewRemoveSchema.parse(raw);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_citation_finding_review",
        { p_actor: a, p_owner: input.ownerId, p_project: input.projectId, p_id: input.id },
        rpc,
      ),
    );
}
