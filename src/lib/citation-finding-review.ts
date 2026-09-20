import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { GAP_FAMILIES, findingSchema } from "./citation-finding";
import {
  CITATION_FINDING_ACCURACY_STATUSES,
  CITATION_FINDING_REVIEW_STATUSES,
} from "./citation-record";
/**
 * Citation Intelligence v1, P3 — INDEPENDENT (two-person) finding review (spec §4.5). Client-safe schemas
 * for the review-receipt boundary. A receipt is the authenticated independent reviewer's own decision on a
 * finding, bound to the EXACT immutable finding row + its content hash; it is NOT a field of the
 * owner-authored finding record (that record refuses every non-owner reviewer identity). Authority is the
 * live project team membership/policy, decided server-side; nothing here is a caller-asserted grant, and
 * this layer touches no publication/spend permission and no owner-only fact/artifact/export surface.
 */
const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const CITATION_REVIEW_DECISIONS = ["approved", "rejected", "needs_changes"] as const;
export const CITATION_REVIEWER_ROLES = ["reviewer", "editor"] as const;
/** A reviewer's submission. The authenticated caller IS the reviewer (never carried here); the reviewer
 * pins the finding row and the exact `expectedSha` they inspected, so the server refuses a stale/replayed
 * attestation whose content no longer matches that row. */
export const citationFindingReviewInputSchema = z
  .object({
    projectId: evidenceProjectId,
    ownerId: uuid,
    findingRowId: uuid,
    expectedSha: sha256,
    decision: z.enum(CITATION_REVIEW_DECISIONS),
    note: text(2000).nullish(),
  })
  .strict();
export type CitationFindingReviewInput = z.infer<typeof citationFindingReviewInputSchema>;
/** The stored receipt returned on save. All provenance fields are server-derived. `inspectionComplete` is
 * false when the finding could not be independently inspected (a native-only or missing-evidence finding),
 * making an `approved` receipt an opinion rather than completed verification. */
export const citationFindingReviewReceiptSchema = z
  .object({
    id: uuid,
    findingRowId: uuid,
    findingId: uuid,
    findingVersion: z.number().int().min(1),
    recordSha256: sha256,
    reviewerId: uuid,
    reviewerRole: z.enum(CITATION_REVIEWER_ROLES),
    decision: z.enum(CITATION_REVIEW_DECISIONS),
    note: z.string().nullable(),
    inspectionComplete: z.boolean(),
    withdrawn: z.boolean(),
    createdAt: z.string(),
  })
  .strict();
/** One receipt as returned in a review list / a for-review read. `mine`/`owner` are server-computed
 * relative to the caller and the project owner. A withdrawn receipt keeps its decision for audit but has a
 * null note (content erased) and does not count toward the finding's reviewStatus. */
export const citationFindingReviewEntrySchema = z
  .object({
    id: uuid,
    reviewerId: uuid,
    mine: z.boolean(),
    owner: z.boolean(),
    reviewerRole: z.enum(CITATION_REVIEWER_ROLES),
    decision: z.enum(CITATION_REVIEW_DECISIONS),
    note: z.string().nullable(),
    inspectionComplete: z.boolean(),
    withdrawn: z.boolean(),
    withdrawnAt: z.string().nullable(),
    findingVersion: z.number().int().min(1),
    recordSha256: sha256,
    createdAt: z.string(),
  })
  .strict();
/** A bounded page of receipts. `reviewStatus` and the active dissent/approval aggregates are computed over
 * ALL receipts (never just the page), so a truncated list can never silently hide a dissent. */
export const citationFindingReviewListSchema = z
  .object({
    ownerId: uuid,
    projectId: z.string(),
    findingRowId: uuid,
    reviews: z.array(citationFindingReviewEntrySchema).max(100),
    reviewTotal: z.number().int().min(0),
    reviewsTruncated: z.boolean(),
    activeDissent: z.number().int().min(0),
    activeApproved: z.number().int().min(0),
    reviewStatus: z.enum(CITATION_FINDING_REVIEW_STATUSES),
  })
  .strict();
/** One cited evidence item, resolved to its actual readable content + provenance for the reviewer. A
 * deleted reference reads `available:false`. An `answer` exposes its FULL content (the 50000-char-capped
 * `rawAnswer`), the supplied citation URLs and capture provenance — `contentTruncated` flags any over-cap
 * answer so truncation is never silently treated as complete. A `source` exposes its substantive
 * identity/provenance (label, url, content fingerprint, capture time), not just status; the raw document
 * bytes stay service-only and the human-recorded passage lives in the finding record's `support[]`. A
 * `native` staged artifact is present-or-not but NEVER `inspectable` (opaque bytes; parser is P5), so it
 * cannot complete an independent inspection. `inspectable` matches `citation_finding_inspectable`. */
export const citationReviewEvidenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("answer"),
      id: z.string(),
      available: z.boolean(),
      inspectable: z.boolean(),
      capturedAt: z.string().nullable(),
      surface: z.string().nullable(),
      mode: z.string().nullable(),
      method: z.string().nullable(),
      status: z.string().nullable(),
      promptId: z.string().nullable(),
      promptRevision: z.number().int().nullable(),
      citationsComplete: z.boolean().nullable(),
      citations: z.array(z.string()).max(100),
      content: z.string().nullable(),
      contentLength: z.number().int().min(0),
      contentTruncated: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("source"),
      id: z.string(),
      available: z.boolean(),
      inspectable: z.boolean(),
      sourceKind: z.string().nullable(),
      status: z.string().nullable(),
      label: z.string().nullable(),
      url: z.string().nullable(),
      fingerprint: z.string().nullable(),
      observedAt: z.string().nullable(),
      sourceRevision: z.number().int().nullable(),
      /** Substantive material bound to THIS source at its current revision, returned IN FULL up to the
       * project record cap (300) and ordered by `recordId` for deterministic provenance. `inspectable` is
       * true only when `1 <= materialCount <= 300` (attribution/provenance alone is not support, §4.2; a
       * source whose material overflows the cap is `materialTruncated` and NOT inspectable — its last
       * records would be unreachable, so review stays incomplete rather than falsely complete). */
      material: z
        .array(
          z
            .object({
              recordId: z.string(),
              value: z.string(),
              excerpt: z.string().nullable(),
              locator: z.string().nullable(),
              category: z.string().nullable(),
              status: z.string().nullable(),
              recordRevision: z.number().int(),
            })
            .strict(),
        )
        .max(300),
      materialCount: z.number().int().min(0),
      materialTruncated: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("native"),
      id: z.string(),
      available: z.boolean(),
      inspectable: z.literal(false),
    })
    .strict(),
]);
/** The dated fact behind an assessed-accuracy claim, resolved for the reviewer (or `available:false`). */
export const citationReviewFactSchema = z
  .object({
    factRowId: uuid,
    available: z.boolean(),
    kind: z.string().nullable(),
    value: z.string().nullable(),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
  })
  .strict();
/** The NARROW reviewer view of the single finding under review: enough to actually PERFORM the review — the
 * record, the immutable version + content hash to pin the receipt to, the extant cited evidence (full
 * answer content + citations/provenance, source identity/provenance, dated facts), whether a complete
 * inspection is even possible
 * (`inspectionComplete`), its live source/accuracy/review status, and a bounded page of receipts with an
 * explicit total/truncation. It deliberately carries no OTHER findings, no business-fact management and no
 * export/artifact-bytes surface — those stay owner-only. */
export const citationFindingForReviewSchema = z
  .object({
    id: uuid,
    findingId: uuid,
    version: z.number().int().min(1),
    family: z.enum(GAP_FAMILIES),
    decision: z.enum(["accepted", "dismissed", "needs_second_review"]),
    panelId: uuid,
    panelVersion: z.number().int().min(1),
    client: z.object({ name: text(200), market: text(120) }).strict(),
    recordSha256: sha256,
    record: findingSchema,
    createdAt: z.string(),
    sourceAvailable: z.boolean(),
    accuracyStatus: z.enum(CITATION_FINDING_ACCURACY_STATUSES),
    reviewStatus: z.enum(CITATION_FINDING_REVIEW_STATUSES),
    inspectionComplete: z.boolean(),
    evidence: z.array(citationReviewEvidenceSchema).max(20),
    facts: z.array(citationReviewFactSchema).max(20),
    reviews: z.array(citationFindingReviewEntrySchema).max(100),
    reviewTotal: z.number().int().min(0),
    reviewsTruncated: z.boolean(),
  })
  .strict();
export type CitationFindingForReview = z.infer<typeof citationFindingForReviewSchema>;
/** Target a finding row (for listing its receipts or the reviewer's single-finding read). */
export const citationFindingReviewTargetSchema = z
  .object({ projectId: evidenceProjectId, ownerId: uuid, findingRowId: uuid })
  .strict();
/** Target a specific receipt to withdraw (`id` is the receipt id, not the finding id). */
export const citationFindingReviewRemoveSchema = z
  .object({ projectId: evidenceProjectId, ownerId: uuid, id: uuid })
  .strict();
