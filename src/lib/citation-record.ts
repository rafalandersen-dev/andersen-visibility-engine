import { z } from "zod";
import { GAP_FAMILIES, findingSchema, improvementSchema } from "./citation-finding";
import { citationAccuracyResolutionSchema } from "./citation-business-fact";
/**
 * Citation Intelligence v1, P3 — client-safe schemas and bounds for the findings/improvements STORAGE
 * boundary (product/CITATION_WORKFLOW_IMPLEMENTATION_2026_09_19.md §2.5, §3). This layer reuses the
 * accepted `findingSchema`/`improvementSchema` verbatim (the record contract) and adds the owner-declared
 * panel/client scope plus the read-back shapes the server returns. It is client-safe and network-free.
 *
 * Authenticated provenance is NOT in these client types: the server stamps `actorId`/`reviewerId`, and an
 * improvement's `verificationStatus`/`evidenceStatus` are re-derived server-side from live dependency
 * resolution on every read (a deleted source, pinned finding, publication/approval or baseline collapses
 * them). They are authenticated server facts returned on read, never values a caller can submit.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const uuid = z.string().uuid();
/** DB octet caps on `record::text`; the input guard below stays under these with headroom because jsonb's
 * canonical text (with its `": "`/`", "` spacing) is at least as long as `JSON.stringify`, so an accepted
 * payload never trips the DB cap and fails the RPC with a generic error. */
export const MAX_CITATION_FINDING_BYTES = 100000;
export const MAX_CITATION_IMPROVEMENT_BYTES = 20000;
const MAX_CITATION_FINDING_INPUT_BYTES = 90000;
const MAX_CITATION_IMPROVEMENT_INPUT_BYTES = 18000;
const utf8Bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const DECISIONS = ["accepted", "dismissed", "needs_second_review"] as const;
/** Owner-declared panel/client scope. It is bound-checked but NOT authenticated against a P2 panel record
 * (a separate reviewed packet); it exists so an improvement can bind only findings sharing its scope. */
export const citationPanelScopeSchema = z
  .object({
    panelId: uuid,
    panelVersion: z.number().int().min(1).max(1000),
    client: z.object({ name: text(200), market: text(120) }).strict(),
  })
  .strict();
export type CitationPanelScope = z.infer<typeof citationPanelScopeSchema>;
// The byte-budget guard sits on the record FIELD (not the top-level object) so the stage schemas stay
// plain ZodObjects whose `.shape` the server functions merge with the request scope.
const boundedFinding = findingSchema.superRefine((f, ctx) => {
  if (utf8Bytes(f) > MAX_CITATION_FINDING_INPUT_BYTES)
    ctx.addIssue({
      code: "custom",
      path: [],
      message: `Finding record exceeds the storage budget of ${MAX_CITATION_FINDING_BYTES} bytes; split it`,
    });
});
const boundedImprovement = improvementSchema.superRefine((i, ctx) => {
  if (utf8Bytes(i) > MAX_CITATION_IMPROVEMENT_INPUT_BYTES)
    ctx.addIssue({
      code: "custom",
      path: [],
      message: `Improvement record exceeds the storage budget of ${MAX_CITATION_IMPROVEMENT_BYTES} bytes`,
    });
});
/** Stage input for a finding: the accepted finding record plus its declared scope, bounded before RPC. */
export const citationFindingStageSchema = z
  .object({ scope: citationPanelScopeSchema, finding: boundedFinding })
  .strict();
/** A STRUCTURED publication/approval binding (never free receipt text): the exact publication attempt,
 * its asset and the reviewed version_hash, optionally an owner inspection of the published URL. The
 * server resolves every field against the released publication_evidence / publication_approvals records
 * and refuses a mismatch; `verificationStatus` is then derived live from these (see the enum below). */
export const citationPublicationBindingSchema = z
  .object({
    publicationId: uuid,
    assetId: text(400),
    versionHash: z.string().regex(/^[a-f0-9]{64}$/),
    ownerInspection: z
      .object({
        observedAt: z.string().datetime({ offset: true }),
        checkResult: z.enum(["shows_approved_content", "does_not_show", "inconclusive"]),
        /** Must equal the published liveUrl; the server rejects an inspection of any other URL. */
        observedUrl: text(2000),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type CitationPublicationBinding = z.infer<typeof citationPublicationBindingSchema>;
export const citationImprovementStageSchema = z
  .object({
    scope: citationPanelScopeSchema,
    improvement: boundedImprovement,
    /** Optional; a bound improvement carries this, an unbound draft omits it (or sends null). */
    binding: citationPublicationBindingSchema.nullish(),
  })
  .strict();
/** Server-attributed finding view (metadata only in the list). `actorId`/`reviewerId`, `version`,
 * `supersedesId`, `predecessorDeleted`, `createdAt`, `sourceAvailable` and `accuracyStatus` are
 * set/derived by the server and validated back here, never imported. `sourceAvailable` is false once a
 * cited answer/native source has been deleted; `accuracyStatus` is the authoritative business-fact
 * binding of this finding's assessed accuracy entries, recomputed live on the canonical read so a deleted
 * or superseded fact downgrades it (`none` = no assessed entries, `resolved` = all bound, `unresolved` =
 * at least one assessed entry no longer binds). It reports binding integrity, never that a claim is true. */
export const CITATION_FINDING_ACCURACY_STATUSES = ["none", "resolved", "unresolved"] as const;
export const citationFindingSummarySchema = z
  .object({
    id: uuid,
    findingId: uuid,
    version: z.number().int().min(1),
    family: z.enum(GAP_FAMILIES),
    decision: z.enum(DECISIONS),
    panelId: uuid,
    panelVersion: z.number().int().min(1),
    client: z.object({ name: text(200), market: text(120) }).strict(),
    actorId: uuid,
    reviewerId: uuid,
    supersedesId: uuid.nullable(),
    predecessorDeleted: z.boolean(),
    createdAt: z.string(),
    sourceAvailable: z.boolean(),
    accuracyStatus: z.enum(CITATION_FINDING_ACCURACY_STATUSES),
  })
  .strict();
export type CitationFindingSummary = z.infer<typeof citationFindingSummarySchema>;
/** A bounded, JSON-serializable value: the raw stored record of a legacy/malformed finding, exposed
 * read-only so its owner can inspect (and then delete) it. It is depth-capped so its Zod parse cannot
 * recurse unboundedly, and byte-capped to the finding storage budget; a value deeper than the cap, larger
 * than the cap, or not JSON (undefined/function/etc.) is REJECTED rather than returned. It is a concrete
 * serializable type — never `unknown` — so it satisfies the server-function transport contract. */
export type CitationJsonValue =
  string | number | boolean | null | CitationJsonValue[] | { [key: string]: CitationJsonValue };
const MAX_RAW_RECORD_DEPTH = 32;
const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
// `inner` is computed ONCE per level (shared by the array and record branches) so building the
// depth-bounded schema stays linear, not exponential, in the depth.
const jsonAtDepth = (remaining: number): z.ZodType<CitationJsonValue> => {
  if (remaining <= 0) return jsonScalar;
  const inner = jsonAtDepth(remaining - 1);
  return z.union([jsonScalar, z.array(inner), z.record(z.string(), inner)]);
};
const citationRawRecordSchema = z
  .record(z.string(), jsonAtDepth(MAX_RAW_RECORD_DEPTH))
  .superRefine((v, ctx) => {
    if (utf8Bytes(v) > MAX_CITATION_FINDING_BYTES)
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "raw record exceeds the finding storage cap",
      });
  });
/** The detail read carries the live fact resolution (`accuracy`) alongside the record. It is a
 * discriminated union on the server-derived `recordValid`: a well-formed finding returns the EXACT strict
 * `findingSchema` record (`recordValid: true`); a legacy/malformed finding returns the bounded raw record
 * (`recordValid: false`), so the owner can inspect and delete it — no fabricated valid data, and a
 * pathologically deep/oversized record is refused (see `citationRawRecordSchema`). */
const citationFindingDetailBaseSchema = citationFindingSummarySchema.extend({
  accuracy: z.array(citationAccuracyResolutionSchema).max(20),
});
export const citationFindingDetailSchema = z.discriminatedUnion("recordValid", [
  citationFindingDetailBaseSchema
    .extend({ recordValid: z.literal(true), record: findingSchema })
    .strict(),
  citationFindingDetailBaseSchema
    .extend({ recordValid: z.literal(false), record: citationRawRecordSchema })
    .strict(),
]);
/** What the SQL returns (no discriminator): summary + accuracy + the raw record parsed as bounded JSON.
 * The server validates it against `findingSchema` to pick the `recordValid` branch. */
export const citationFindingDetailEnvelopeSchema = citationFindingDetailBaseSchema
  .extend({ record: citationRawRecordSchema })
  .strict();
export const citationFindingsStateSchema = z
  .object({ findings: z.array(citationFindingSummarySchema).max(200) })
  .strict();
/** The server-derived verification status of an improvement, re-computed on every read from the
 * structured binding + LIVE dependency state (never a client boolean, never an independent/system check,
 * no causal claim):
 *  - `unverified`: no binding, an unresolved pinned finding/source, a deleted publication, or an approval
 *    that is no longer current at the pinned version.
 *  - `approval_bound`: the pinned version_hash is currently approved for the asset in this project.
 *  - `connector_receipt`: plus a published attempt carrying a connector response whose liveUrl matches the
 *    improvement's destination and whose Plan action matches its task — an AUTHENTIC CONNECTOR RESPONSE,
 *    not proof the destination actually shows the approved content.
 *  - `owner_attested`: plus a structured owner inspection of that exact liveUrl recording
 *    `shows_approved_content` — an authenticated OWNER ATTESTATION, still not a system verification. */
export const CITATION_VERIFICATION_STATUSES = [
  "unverified",
  "approval_bound",
  "connector_receipt",
  "owner_attested",
] as const;
/** The SEPARATE before/after baseline axis (never silently folded into the delivery ladder above), derived
 * live on every read: `baseline_absent` (no verification block recorded), `baseline_missing` (a
 * verification block whose baselines no longer all resolve in this project — e.g. a deleted or out-of-scope
 * capture), or `baseline_recorded` (a verification block whose every baseline still resolves). An
 * `owner_attested` verificationStatus additionally requires `baseline_recorded`, so an owner before/after
 * proof is never claimed without a live scoped baseline. */
export const CITATION_EVIDENCE_STATUSES = [
  "baseline_absent",
  "baseline_missing",
  "baseline_recorded",
] as const;
/** Server-attributed improvement view. `verificationStatus` is the authenticated, server-derived delivery
 * status above and `evidenceStatus` the separate baseline axis; a deleted dependency (source, the pinned
 * finding version, the publication/approval, or a baseline) collapses them. Neither is ever a caller
 * boolean — P3 does not system-verify. */
export const citationImprovementSummarySchema = z
  .object({
    id: uuid,
    improvementId: uuid,
    version: z.number().int().min(1),
    panelId: uuid,
    panelVersion: z.number().int().min(1),
    client: z.object({ name: text(200), market: text(120) }).strict(),
    actorId: uuid,
    supersedesId: uuid.nullable(),
    predecessorDeleted: z.boolean(),
    createdAt: z.string(),
    verificationStatus: z.enum(CITATION_VERIFICATION_STATUSES),
    evidenceStatus: z.enum(CITATION_EVIDENCE_STATUSES),
  })
  .strict();
export type CitationImprovementSummary = z.infer<typeof citationImprovementSummarySchema>;
/** The DETAIL read additionally returns the exact pinned dependency identity so the owner can audit/export
 * what the improvement is bound to: the resolved finding version row ids and the stored structured binding
 * (which carries no secret/provider material). The list read stays metadata-only. */
export const citationImprovementDetailSchema = citationImprovementSummarySchema
  .extend({
    record: improvementSchema,
    boundFindingRowIds: z.array(uuid),
    publicationBinding: citationPublicationBindingSchema.nullable(),
  })
  .strict();
export const citationImprovementsStateSchema = z
  .object({ improvements: z.array(citationImprovementSummarySchema).max(100) })
  .strict();
