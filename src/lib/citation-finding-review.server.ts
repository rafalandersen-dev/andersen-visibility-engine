import { z } from "zod";
import {
  citationFindingForReviewSchema,
  citationFindingReviewInputSchema,
  citationFindingReviewListSchema,
  citationFindingReviewReceiptSchema,
  citationFindingReviewRemoveSchema,
  citationFindingReviewTargetSchema,
  citationReviewAssignmentInputSchema,
  citationReviewAssignmentReceiptSchema,
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
  // Defensive re-check that the RPC scoped to what we asked. ownerId/findingRowId are validated UUIDs: the RPC
  // returns them canonically LOWERCASE, but the caller may pass a valid UPPERCASE UUID, so compare them
  // case-insensitively (finding 4062040465) — a raw !== wrongly rejected a legitimate uppercase identity. projectId
  // is free text scope and stays an EXACT compare (scope is never weakened); a genuinely different owner/row/project
  // still mismatches. Comparison only — the returned result (and any hash/document) is never mutated.
  if (
    result.ownerId.toLowerCase() !== input.ownerId.toLowerCase() ||
    result.projectId !== input.projectId ||
    result.findingRowId.toLowerCase() !== input.findingRowId.toLowerCase()
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
  // Case-insensitive UUID identity re-check (finding 4062040465): the RPC returns the canonical lowercase row id;
  // a valid uppercase findingRowId input must not be spuriously rejected. Comparison only, no mutation.
  if (result.id.toLowerCase() !== input.findingRowId.toLowerCase())
    throw Error("citation_review_unavailable");
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
// Owner-only endpoints for the finding-scoped evidence-review assignment (finding 4062796988). The `owner`
// argument is the AUTHENTICATED caller supplied by the server — it becomes `p_owner`, so a caller can only
// grant/revoke on their OWN workspace; there is no client-supplied owner-authority field to spoof, and the
// underlying table is RLS-closed. These are the minimal owner controls for the scoped grant, not a broader
// sharing surface.
export async function grantCitationReviewAssignment(
  owner: string,
  raw: z.infer<typeof citationReviewAssignmentInputSchema>,
  rpc?: KnowledgeRpc,
) {
  const o = actorId.parse(owner);
  const input = citationReviewAssignmentInputSchema.parse(raw);
  return citationReviewAssignmentReceiptSchema.parse(
    await call(
      "grant_ai_citation_review_assignment",
      {
        p_owner: o,
        p_project: input.projectId,
        p_finding: input.findingRowId,
        p_reviewer: input.reviewerId,
      },
      rpc,
    ),
  );
}
export async function revokeCitationReviewAssignment(
  owner: string,
  raw: z.infer<typeof citationReviewAssignmentInputSchema>,
  rpc?: KnowledgeRpc,
) {
  const o = actorId.parse(owner);
  const input = citationReviewAssignmentInputSchema.parse(raw);
  const data = await call(
    "revoke_ai_citation_review_assignment",
    {
      p_owner: o,
      p_project: input.projectId,
      p_finding: input.findingRowId,
      p_reviewer: input.reviewerId,
    },
    rpc,
  );
  return z.literal(true).parse(data);
}
