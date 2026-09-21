import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  citationFindingReviewInputSchema,
  citationFindingReviewRemoveSchema,
  citationFindingReviewTargetSchema,
  citationReviewAssignmentInputSchema,
} from "./citation-finding-review";
// Unlike the owner-only citation endpoints, these do NOT require the caller to be the project owner: the
// authenticated `context.userId` is the ACTOR (an independent reviewer, or the owner for the owner-side
// reads), and the owner/project/finding are supplied. The database decides authority from the live team
// membership/policy, and the receipt reviewer is always `context.userId`, so an owner cannot impersonate
// another reviewer and a non-member/foreign-project caller is refused server-side.
export const saveCitationFindingReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => citationFindingReviewInputSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-finding-review.server")).saveCitationFindingReview(
      context.userId,
      data,
    ),
  );
export const readCitationFindingReviewsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => citationFindingReviewTargetSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-finding-review.server")).readCitationFindingReviews(
      context.userId,
      data,
    ),
  );
export const getCitationFindingForReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => citationFindingReviewTargetSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-finding-review.server")).getCitationFindingForReview(
      context.userId,
      data,
    ),
  );
export const removeCitationFindingReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => citationFindingReviewRemoveSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-finding-review.server")).removeCitationFindingReview(
      context.userId,
      data,
    ),
  );
// OWNER-ONLY endpoints (finding 4062796988): unlike the four reviewer endpoints above, here the authenticated
// `context.userId` is the OWNER (passed as `p_owner`), so a caller can only grant/revoke a finding-scoped
// evidence-review assignment on their OWN workspace — there is no owner field in the payload to forge. These
// are the minimal owner controls for the scoped grant, not a sharing-feature/UI surface.
export const grantCitationReviewAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => citationReviewAssignmentInputSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-finding-review.server")).grantCitationReviewAssignment(
      context.userId,
      data,
    ),
  );
export const revokeCitationReviewAssignmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => citationReviewAssignmentInputSchema.parse(v))
  .handler(async ({ data, context }) =>
    (await import("./citation-finding-review.server")).revokeCitationReviewAssignment(
      context.userId,
      data,
    ),
  );
