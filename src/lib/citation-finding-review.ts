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
    // Null when the server MASKS the audit digest on a REVIEWER surface: for an erased finding, or one whose
    // cited source is revoked/missing (its copied passages withheld), the pre-erasure/pre-withholding
    // recordSha256 is a digest of content the reviewer can no longer see and would be an offline brute-force
    // oracle for a short forgotten/withheld value. The real digest is retained server-side for audit; owner
    // reads and fully-visible reviewer reads still carry the exact hash.
    recordSha256: sha256.nullable(),
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
      // ONLY the SELECTED records are served (finding 4059944844): the exact `project_knowledge_records` a
      // `support[].selectedRecord` pin resolves to for THIS source at its CURRENT revision — never the source's
      // other records. An unpinned/stale/foreign passage contributes NOTHING here and leaves `material` empty. The
      // corpus is never enumerated. `inspectable` is true only when the source is live (active) AND at least one
      // assessed support entry's selected pin resolves to a live current-revision record (so `materialCount>=1`);
      // attribution alone (label/url/fingerprint, §4.2), or the owner's recorded `record.support[].sourcePassage`
      // with no resolving pin, never completes an independent review. The served value/revision are the actual
      // stored record's, so the reviewer verifies against real selected material, not the owner's cached copy.
      material: z
        .array(
          z
            .object({
              recordId: z.string(),
              value: z.string(),
              excerpt: z.string().nullable(),
              locator: z.string().nullable(),
              category: z.string().nullable(),
              recordRevision: z.number().int(),
              // Only currently-VALID evidence is served (finding 4060770032): `status` is the record's own status
              // (always `accepted` here — a proposed/disputed/expired/rejected or future/unreviewed selected record
              // is withheld and leaves `material` empty, never misrepresented as usable) and `validUntil` surfaces
              // the record's expiry window so the reviewer sees its validity.
              status: z.string(),
              validUntil: z.string().nullable(),
            })
            .strict(),
        )
        .max(20),
      materialCount: z.number().int().min(0),
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
    // Null when the server MASKS the audit digest (this finding is erased, or a cited source is
    // revoked/missing so its copied passages are withheld below): the digest would otherwise be an offline
    // brute-force oracle for the hidden content. Retained server-side for audit. A fully-visible finding
    // carries the exact hash a reviewer pins to submit; an erased finding already blocks new reviews, and a
    // withheld finding is non-inspectable, so neither needs the pin.
    recordSha256: sha256.nullable(),
    // Null when the finding is MASKED (erased, or a cited source revoked/missing, or a cited native artifact
    // missing): the ENTIRE owner-authored record is withheld from the reviewer (finding 4062101980), because
    // answer/source-derived content can live in many structured fields (recommendation.target, support[].citedUrl,
    // claimSpans, nested fields) that a per-field blacklist would miss. The owner's stored record is untouched and
    // the owner's own detail read still returns it in full; the availability flags below explain the withholding.
    // A fully-visible (unmasked) finding carries the complete record the reviewer inspects.
    record: findingSchema.nullable(),
    createdAt: z.string(),
    // True once a source/record forget erased this finding's copied passages: the recordSha256 above (and any
    // receipt referencing it) is a PRE-erasure digest, historic — never an attestation of the current payload.
    evidenceErased: z.boolean(),
    // True when a cited source is revoked/missing (but NOT erased): the `record.support[].sourcePassage` copies
    // above are BLANKED to a marker in THIS reviewer response only. The owner's stored record still holds the
    // real text, and `recordSha256` still pins that UNREDACTED stored record — so a reviewer cannot attest the
    // withheld bytes as fully inspected (a revoked source already forces `inspectionComplete=false`). Distinct
    // from `evidenceErased` (a permanent stored erasure). Access-time withholding, not destruction of owner data.
    sourcePassagesWithheld: z.boolean(),
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
/** Owner-only grant/revoke of a finding-scoped evidence-review assignment (finding 4062796988). The
 * authenticated caller IS the owner (never carried here — the server passes the session id), so this schema
 * binds only the project, the EXACT finding row and the intended reviewer. Team membership/publication
 * approval alone never authorizes private evidence; this explicit owner grant, re-checked live, does. */
export const citationReviewAssignmentInputSchema = z
  .object({ projectId: evidenceProjectId, findingRowId: uuid, reviewerId: uuid })
  .strict();
export type CitationReviewAssignmentInput = z.infer<typeof citationReviewAssignmentInputSchema>;
/** The stored assignment echoed on grant. All fields are server-derived; `active` is always true on grant. */
export const citationReviewAssignmentReceiptSchema = z
  .object({
    ownerId: uuid,
    projectId: z.string(),
    findingRowId: uuid,
    reviewerId: uuid,
    active: z.literal(true),
  })
  .strict();
