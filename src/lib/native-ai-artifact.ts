import { z } from "zod";
import {
  GSC_REPORT_TIMEZONE,
  MAX_NATIVE_REPORT_BYTES,
  NATIVE_REPORT_SOURCES,
  nativeMarketScopeSchema,
  nativePeriodSchema,
  nativeSnapshotScopeKey,
} from "./native-ai-report";
/**
 * Citation Intelligence v1, P1 — raw native-report artifact STAGING (product/CITATION_INTELLIGENCE_SPEC.md
 * §3.3, §8; product/CITATION_WORKFLOW_IMPLEMENTATION_2026_09_19.md). No parser exists yet, so an owner
 * uploads the opaque export bytes plus owner-declared scope metadata; the server stores the bytes with a
 * server-derived hash under an explicit `pending_parser`/`unsupported` status. A staged artifact yields no
 * rows, metrics, presence, comparability or verified claims — parsed snapshots come only from P5 against a
 * genuine export. This module is client-safe and network-free: it never fetches, decodes, executes a cell,
 * assumes a file format or extracts an archive. It reuses the PR137 `native-ai-report.ts` helpers unchanged.
 */
/** Conservative provisional engineering bounds (no new subscription/spend); see the design doc. At the
 * 2 MiB per-artifact cap the 20-count and 40-MiB bounds coincide (20 * 2 MiB = 40 MiB). */
export const MAX_NATIVE_ARTIFACTS_PER_PROJECT = 20;
export const MAX_NATIVE_ARTIFACT_PROJECT_BYTES = 40 * 1024 * 1024;
/** Base64 length of the 2 MiB per-artifact byte cap; the encoded body is bounded before any decode. */
export const MAX_NATIVE_ARTIFACT_BASE64 = Math.ceil(MAX_NATIVE_REPORT_BYTES / 3) * 4;
/**
 * Owner-declared staging metadata. Validated against shared contracts where they exist (source list,
 * the shared real-calendar/ordered `nativePeriodSchema`, market-scope rule, GSC timezone) and never
 * treated as publisher-verified. Server-derived and parsed facts are deliberately absent: they are
 * attributed by the authenticated server, not this input.
 */
export const nativeArtifactMetadataSchema = z
  .object({
    source: z.enum(NATIVE_REPORT_SOURCES),
    /** Declared by the owner at import; never verified against the publisher. */
    declaredProperty: z.string().trim().min(1).max(500),
    reportKind: z.enum(["chart", "table"]),
    dimension: z.enum([
      "property",
      "page",
      "country",
      "device",
      "date",
      "grounding_query",
      "unknown",
    ]),
    /** Native aggregation of the exported numbers; a chart and a page table aggregate differently. */
    aggregation: z.enum(["property", "page", "query", "unknown"]),
    /** Shared with the parsed-snapshot contract: real ordered Gregorian dates, source-timezone. */
    period: nativePeriodSchema,
    marketScope: nativeMarketScopeSchema,
    filters: z
      .record(z.string().min(1).max(64), z.string().max(200))
      .default({})
      .refine((f) => Object.keys(f).length <= 20, "Too many declared filters"),
    /** When the owner downloaded the export. Milo records the storage time server-side. */
    capturedAt: z.string().datetime({ offset: true }),
    filename: z.string().trim().max(255).nullable(),
  })
  .strict()
  .superRefine((m, ctx) => {
    // GSC dates its reports in Pacific Time ([G1]); a forged GSC artifact cannot enter with an
    // assumed or missing timezone. Bing's export timezone is unknown, so it is preserved as declared.
    if (m.source === "gsc_generative_ai_search" && m.period?.timezone !== GSC_REPORT_TIMEZONE)
      ctx.addIssue({
        code: "custom",
        path: ["period", "timezone"],
        message: `A ${m.source} report is dated in ${GSC_REPORT_TIMEZONE}; a different or missing timezone is not this source's contract and is never assumed`,
      });
    // Impossible or reversed periods are already rejected by the shared `nativePeriodSchema`.
    const captured = Date.parse(m.capturedAt);
    if (!Number.isFinite(captured) || captured > Date.now() || captured < Date.UTC(2020, 0, 1))
      ctx.addIssue({
        code: "custom",
        path: ["capturedAt"],
        message: "Use an actual download date from 2020 through now",
      });
  });
export type NativeArtifactMetadata = z.infer<typeof nativeArtifactMetadataSchema>;
/**
 * Client-side *logical* scope identity for idempotency and same-scope supersession (§3.3). Two exports
 * of different source/property/reportKind/dimension/aggregation/period/timezone/market/filters describe
 * distinct lineages and must never collapse or supersede one another. The authoritative scope key is
 * derived inside the database from the same strictly-validated metadata (a caller no longer supplies a
 * scope key at all), so this helper cannot forge lineage identity; it is a client-visible predictor of
 * that identity — two metadatas that this helper reports as equal are stored under one lineage, and two
 * it reports as different form distinct lineages. It reuses the PR137 `nativeSnapshotScopeKey`, which now
 * folds in `aggregation` (property- and page-aggregated totals are different measurements), so this is a
 * bare delegating call with no separate aggregation append.
 */
export function nativeArtifactScopeKey(m: NativeArtifactMetadata): string {
  return nativeSnapshotScopeKey(m);
}
/** Strict base64: the encoded body is length-bounded and format-checked before it is ever decoded. */
export const nativeArtifactBase64Schema = z
  .string()
  .min(1)
  .max(MAX_NATIVE_ARTIFACT_BASE64)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Strict base64 without whitespace")
  .refine((v) => v.length % 4 === 0, "Base64 length must be a multiple of 4");
export const nativeArtifactStageInputSchema = z
  .object({ metadata: nativeArtifactMetadataSchema, base64: nativeArtifactBase64Schema })
  .strict();
/** Server-attributed staging record (metadata view). `status`, `sha256`, `id`, times, actor,
 * `scopeKey`, `supersedesId` and `predecessorDeleted` are set by the server and validated back here,
 * never imported. */
export const nativeArtifactSummarySchema = z
  .object({
    id: z.string().uuid(),
    scopeKey: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().min(1).max(MAX_NATIVE_REPORT_BYTES),
    status: z.enum(["pending_parser", "unsupported"]),
    supersedesId: z.string().uuid().nullable(),
    /** Server-derived marker: true when this row's actual direct predecessor was deleted, so a null
     * `supersedesId` on an orphaned successor is distinguishable from a genuine first version (which
     * stays false). It records no deleted id/metadata/bytes and is never caller-writable; it signals a
     * partial-history gap for a later chain to detect, not a claim of complete lineage proof. */
    predecessorDeleted: z.boolean(),
    metadata: nativeArtifactMetadataSchema,
    createdAt: z.string(),
    actorId: z.string().uuid(),
  })
  .strict();
export type NativeArtifactSummary = z.infer<typeof nativeArtifactSummarySchema>;
/** Single-artifact retrieval carries the exact raw bytes verbatim (JSON export, never rewritten). */
export const nativeArtifactDetailSchema = nativeArtifactSummarySchema
  .extend({ base64: nativeArtifactBase64Schema })
  .strict();
export const nativeArtifactStateSchema = z
  .object({ artifacts: z.array(nativeArtifactSummarySchema).max(MAX_NATIVE_ARTIFACTS_PER_PROJECT) })
  .strict();
