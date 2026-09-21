import { z } from "zod";
import { businessFactSchema } from "./citation-finding";
/**
 * Citation Intelligence v1, P3 — client-safe schemas for dated owner-confirmed business facts and the
 * server-recomputed accuracy→fact binding (product/CITATION_INTELLIGENCE_SPEC.md §4.2–4.5, §8). Facts are
 * PRIVATE per owner/project (never a shared corpus). This layer reuses the accepted `businessFactSchema`
 * verbatim as the record contract and adds the read-back shapes the server returns. It is client-safe and
 * network-free.
 *
 * Confirmation identity/time are NOT trusted from these client types: the server stamps `confirmedBy`
 * (the authenticated owner) and `confirmedAt` (the authenticated action instant) and refuses a foreign
 * confirmer. The DECLARED `validFrom`/`validUntil` validity interval is owner-supplied but must be finite
 * and ordered, and is kept distinct from the confirmation time. A fact's existence is never proof that an
 * answer claim is true — the human accuracy `status` on a finding carries that judgement; the resolution
 * below only reports the integrity of the pinned binding.
 */
const uuid = z.string().uuid();
/** READ-ONLY canonical identifier: the exact 8-4-4-4-12 hex shape the database stores and echoes. It is
 * intentionally LOOSER than `z.string().uuid()` (which enforces RFC version/variant) so a legacy/non-RFC
 * identifier already present in storage round-trips through the read paths instead of failing Zod. It is
 * used ONLY for server-echoed audit fields; the write-side contract keeps the strict `uuid` above. */
const pgUuid = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
/** DB octet cap on `record::text`; the input guard stays under it with headroom (jsonb canonical text is
 * at least as long as `JSON.stringify`). */
export const MAX_CITATION_BUSINESS_FACT_BYTES = 8000;
const MAX_CITATION_BUSINESS_FACT_INPUT_BYTES = 7000;
const utf8Bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
// Validity is stored/compared at the database's microsecond resolution; reject sub-microsecond precision at
// the client boundary too, so accepted input matches the stored/exported/digested representation exactly
// (no silent truncation). Matches the SQL guard in save_ai_citation_business_fact.
const overMicrosecond = (v: string | null) => typeof v === "string" && /\.\d{7,}/.test(v);
// The byte-budget guard sits on the record FIELD so the stage schema stays a plain ZodObject whose
// `.shape` the server functions merge with the request scope.
const boundedBusinessFact = businessFactSchema.superRefine((f, ctx) => {
  if (utf8Bytes(f) > MAX_CITATION_BUSINESS_FACT_INPUT_BYTES)
    ctx.addIssue({
      code: "custom",
      path: [],
      message: `Business fact record exceeds the storage budget of ${MAX_CITATION_BUSINESS_FACT_BYTES} bytes`,
    });
  if (overMicrosecond(f.validFrom))
    ctx.addIssue({
      code: "custom",
      path: ["validFrom"],
      message: "Use at most microsecond (6 fractional digit) precision",
    });
  if (overMicrosecond(f.validUntil))
    ctx.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "Use at most microsecond (6 fractional digit) precision",
    });
});
/** Stage input for a fact: the accepted business-fact record, bounded before the RPC. `confirmedBy` must
 * be the authenticated owner and `confirmedAt` is re-stamped server-side regardless of the submitted
 * value; the declared `validFrom`/`validUntil` are validated finite and ordered by the server. */
export const citationBusinessFactStageSchema = z.object({ fact: boundedBusinessFact }).strict();
/** Server-attributed fact view: row identity + version chain metadata plus the stored record (with the
 * server-authoritative confirmedBy/confirmedAt), returned in full so facts can be exported. */
export const citationBusinessFactSummarySchema = z
  .object({
    id: uuid,
    version: z.number().int().min(1),
    supersedesId: uuid.nullable(),
    predecessorDeleted: z.boolean(),
    createdAt: z.string(),
    record: businessFactSchema,
  })
  .strict();
export type CitationBusinessFactSummary = z.infer<typeof citationBusinessFactSummarySchema>;
export const citationBusinessFactsStateSchema = z
  .object({ facts: z.array(citationBusinessFactSummarySchema).max(300) })
  .strict();
/** The server-recomputed binding of a finding's assessed accuracy entry to the dated facts. It is derived
 * live on read from the pinned (factId, factVersion) and the reviewer-recorded capture instant; it never
 * asserts the claim is true. */
export const CITATION_ACCURACY_RESOLUTIONS = [
  "not_assessed",
  "unpinned",
  "capture_unresolved",
  "fact_missing",
  "wrong_kind",
  "out_of_period",
  "ambiguous",
  "superseded_correction",
  "resolved",
] as const;
export const citationAccuracyResolutionSchema = z
  .object({
    claimSpan: z.string(),
    // Echoed passthrough from the stored finding; typed loosely so a malformed stored record stays
    // inspectable rather than breaking the read.
    factKind: z.string(),
    humanStatus: z.string(),
    // Server-echoed audit identifiers use the read-only canonical (hex) shape, so a non-RFC identifier the
    // SQL echoes (or normalizes to null) never fails the read; the SQL nulls anything not matching this.
    factId: pgUuid.nullable(),
    factVersion: z.number().int().nullable(),
    /** The immutable pinned fact ROW id (audit) and the finding's bound answer-evidence reference. */
    factRowId: pgUuid.nullable(),
    captureEvidenceId: pgUuid.nullable(),
    /** The capture instant resolved from the bound saved answer evidence (null when unresolvable). */
    capturedAt: z.string().nullable(),
    resolution: z.enum(CITATION_ACCURACY_RESOLUTIONS),
  })
  .strict();
export type CitationAccuracyResolution = z.infer<typeof citationAccuracyResolutionSchema>;
export const citationFindingAccuracySchema = z
  .object({ entries: z.array(citationAccuracyResolutionSchema).max(20) })
  .strict();
