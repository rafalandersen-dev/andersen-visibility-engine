import { z } from "zod";
import { GAP_FAMILIES, findingSchema, improvementSchema } from "./citation-finding";
/**
 * Citation Intelligence v1, P3 — client-safe schemas and bounds for the findings/improvements STORAGE
 * boundary (product/CITATION_WORKFLOW_IMPLEMENTATION_2026_09_19.md §2.5, §3). This layer reuses the
 * accepted `findingSchema`/`improvementSchema` verbatim (the record contract) and adds the owner-declared
 * panel/client scope plus the read-back shapes the server returns. It is client-safe and network-free.
 *
 * Authenticated provenance is NOT in these client types: the server stamps `actorId`/`reviewerId`, and an
 * improvement's `verified` is re-derived server-side from live dependency resolution on every read (a
 * deleted source, finding or baseline collapses it). A `verified: true` is therefore an authenticated
 * server fact returned on read, never a value a caller can submit.
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
export const citationImprovementStageSchema = z
  .object({ scope: citationPanelScopeSchema, improvement: boundedImprovement })
  .strict();
/** Server-attributed finding view (metadata only in the list). `actorId`/`reviewerId`, `version`,
 * `supersedesId`, `predecessorDeleted`, `createdAt` and `sourceAvailable` are set/derived by the server
 * and validated back here, never imported. `sourceAvailable` is false once a cited answer/native source
 * has been deleted, marking the finding's claim explicitly unavailable. */
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
  })
  .strict();
export type CitationFindingSummary = z.infer<typeof citationFindingSummarySchema>;
export const citationFindingDetailSchema = citationFindingSummarySchema
  .extend({ record: findingSchema })
  .strict();
export const citationFindingsStateSchema = z
  .object({ findings: z.array(citationFindingSummarySchema).max(200) })
  .strict();
/** The server-derived verification status of an improvement, re-computed on every read from LIVE
 * dependency state (never a client boolean, never a system/causal proof):
 *  - `owner_attested`: the authenticated project owner recorded an `owner_inspection` over evidence that
 *    still resolves — an authenticated owner attestation, not a probed system receipt.
 *  - `unresolved`: a `publication_receipt`/`index_inspection` whose receipt is not bound to a trusted
 *    publication/index record here (that binding is unwired; see the evidence doc). NOT authenticated.
 *  - `unverified`: no receipt, a forged/missing reviewer or timestamp, or an unresolved dependency
 *    (a deleted source, pinned finding version, or baseline). */
export const CITATION_VERIFICATION_STATUSES = [
  "unverified",
  "unresolved",
  "owner_attested",
] as const;
/** Server-attributed improvement view. `verificationStatus` is the authenticated, server-derived status
 * above; a deleted dependency (source, the pinned finding version, or a baseline) collapses it to
 * `unverified`. It is never `verified: true` on a caller string — P3 does not system-verify. */
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
  })
  .strict();
export type CitationImprovementSummary = z.infer<typeof citationImprovementSummarySchema>;
export const citationImprovementDetailSchema = citationImprovementSummarySchema
  .extend({ record: improvementSchema })
  .strict();
export const citationImprovementsStateSchema = z
  .object({ improvements: z.array(citationImprovementSummarySchema).max(100) })
  .strict();
