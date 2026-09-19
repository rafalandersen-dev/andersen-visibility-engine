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
 * The database stores `metadata` as jsonb and rejects any row whose canonical `metadata::text`
 * exceeds this many UTF-8 bytes (`octet_length(metadata::text)<=8000` in both the table CHECK and
 * the save RPC, 20260919165000_native_report_artifacts.sql). Every declared field is bounded on its
 * own (declaredProperty 500, up to 20 filters of key<=64 / value<=200, filename 255, …) but those
 * maxima *sum*: 20 filter values of 200 CJK characters are ~12 KB of UTF-8, far past this cap. The
 * shared metadata schema mirrors the SAME aggregate byte budget so a per-field-valid payload is
 * refused at the input boundary instead of clearing validation and then failing the RPC on an opaque
 * size error. This is the DB's byte budget reflected in one documented constant, never raised.
 */
export const MAX_NATIVE_ARTIFACT_METADATA_BYTES = 8000;
const UTF8_ENCODER = new TextEncoder();
/** UTF-8 byte length of a JSON string literal (surrounding quotes and escapes included). jsonb and
 * `JSON.stringify` escape exactly the same set — `"`, `\`, the JSON control chars — and both keep
 * non-ASCII raw, so this is the byte cost of that string inside PostgreSQL's canonical jsonb text. */
const jsonStringBytes = (s: string): number => UTF8_ENCODER.encode(JSON.stringify(s)).length;
/**
 * Exact UTF-8 byte length of PostgreSQL's canonical `jsonb::text` for a declared-metadata value, so
 * the boundary accepts a payload exactly when the DB's `octet_length(metadata::text)` would. jsonb
 * re-serializes with one space after every `:` and every `,` (never against a `{}`/`[]` bound) and
 * keeps non-ASCII as raw UTF-8, so a string contributes `jsonStringBytes` and each object member adds
 * `": "` plus its value. This metadata carries only string, boolean, null and nested-object values
 * (no numbers or arrays, whose jsonb canonicalization would differ from JS), and jsonb key order does
 * not change the byte count, so this is byte-exact against real PostgreSQL, not a loose over-estimate.
 * It measures UTF-8 bytes, never JS UTF-16 char length, so a multibyte field is charged its DB cost.
 */
export function nativeArtifactMetadataJsonbBytes(value: unknown): number {
  if (value === null) return 4; // null
  if (typeof value === "boolean") return value ? 4 : 5; // true / false
  if (typeof value === "string") return jsonStringBytes(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return 2; // []
    let bytes = 2 + (value.length - 1) * 2; // brackets plus the ", " between elements
    for (const element of value) bytes += nativeArtifactMetadataJsonbBytes(element);
    return bytes;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return 2; // {}
    let bytes = 2 + (entries.length - 1) * 2; // braces plus the ", " between members
    // Each member is `"key": value` — the quoted key, then ": ", then the recursively measured value.
    for (const [key, member] of entries)
      bytes += jsonStringBytes(key) + 2 + nativeArtifactMetadataJsonbBytes(member);
    return bytes;
  }
  // Numbers never occur in this metadata; jsonb canonicalizes them differently, so fall back to the
  // compact JSON text for a shape that cannot appear rather than silently mis-projecting it.
  return UTF8_ENCODER.encode(JSON.stringify(value)).length;
}
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
    // Each declared field is bounded on its own, but the per-field maxima sum past the database's
    // metadata byte cap (e.g. 20 filters of 200 multibyte characters). Mirror the DB's canonical
    // jsonb::text byte budget here so a per-field-valid payload is refused at the boundary rather than
    // clearing validation and failing the RPC on an opaque size error. Key order does not change the
    // byte count, so this aggregate check is order-independent; it never rewrites the raw artifact.
    if (nativeArtifactMetadataJsonbBytes(m) > MAX_NATIVE_ARTIFACT_METADATA_BYTES)
      ctx.addIssue({
        code: "custom",
        message: `Declared metadata serializes to more than ${MAX_NATIVE_ARTIFACT_METADATA_BYTES} bytes; trim the declared property, filters or filename`,
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
/**
 * Decoded byte length of a well-formed base64 body, from its length and trailing padding alone — pure
 * O(1) arithmetic, no decode and no large allocation. Each 4-char quad is 3 bytes, less one byte per
 * trailing `=`. The encoded-length ceiling cannot bound the decoded size on its own: 2 MiB (encoded
 * with one `=`) and 2 MiB + 1 (encoded with no padding) share the *identical* MAX_NATIVE_ARTIFACT_BASE64
 * length, so a length-only gate lets the oversize body through to fail on the DB's opaque size error.
 * This recovers the true byte count so the real cap is enforced at the input boundary instead.
 */
export const nativeArtifactBase64ByteLength = (v: string): number =>
  (v.length / 4) * 3 - (v.endsWith("==") ? 2 : v.endsWith("=") ? 1 : 0);
/**
 * Strict base64, every check applied to the encoded string *before* it is ever decoded: a cheap
 * encoded-length ceiling, the base64 alphabet, a multiple-of-four length, canonical trailing-bit
 * padding, and the exact decoded-byte cap. Canonical padding means the bits a `=` replaces are zero,
 * as PostgreSQL's `decode(...,'base64')` canonical round-trip requires — one `=` leaves 2 dead low
 * bits, so the final data char's alphabet index is a multiple of 4 (`[AEIMQUYcgkosw048]`); `==` leaves
 * 4 dead bits, so it is a multiple of 16 (`[AQgw]`). This refuses a non-canonical alias such as `Qh==`
 * (whose canonical form is `Qg==`) at the boundary exactly as the DB does. The decoded-byte refine
 * holds the real MAX_NATIVE_REPORT_BYTES cap where the encoded-length ceiling cannot, since 2 MiB and
 * 2 MiB + 1 encode to the same length. Nothing here decodes or rewrites the owner's bytes, and the DB
 * independently re-enforces every one of these guards on the decoded payload.
 */
export const nativeArtifactBase64Schema = z
  .string()
  .min(1)
  .max(MAX_NATIVE_ARTIFACT_BASE64)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Strict base64 without whitespace")
  .refine((v) => v.length % 4 === 0, "Base64 length must be a multiple of 4")
  .refine(
    (v) =>
      v.endsWith("==")
        ? /[AQgw]==$/.test(v)
        : v.endsWith("=")
          ? /[AEIMQUYcgkosw048]=$/.test(v)
          : true,
    "Base64 padding bits must be canonical (zero), matching the database decode",
  )
  .refine(
    (v) => nativeArtifactBase64ByteLength(v) <= MAX_NATIVE_REPORT_BYTES,
    `Decoded artifact exceeds the ${MAX_NATIVE_REPORT_BYTES}-byte cap`,
  );
/**
 * DB-compatible `capturedAt` grammar for the staging boundary: a required `HH:MM:SS` (hour 00-23,
 * minute/second 00-59), an optional `.fraction`, and a terminating uppercase `Z` or a colon offset whose
 * displacement is within PostgreSQL's accepted range — hour `00..15`, minute `00..59`, both signs. The
 * shared reader schema's `.datetime({ offset: true })` is deliberately looser: it accepts an omitted
 * seconds field (`12:00Z`), a colon-less offset (`+0200`), and an out-of-range offset such as `+16:00` or
 * invalid offset-minute values; PostgreSQL rejects invalid displacements at the cast (22009). Bounding the
 * offset here refuses those before the RPC instead of failing it with a generic
 * `native_artifact_unavailable`; the database rule is unchanged and never loosened (the DB still rejects
 * an out-of-range displacement via the cast), read-back stays on the looser shared schema, and the string
 * is never coerced or normalized.
 */
export const NATIVE_ARTIFACT_CAPTURED_AT_RE =
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-](0\d|1[0-5]):[0-5]\d)$/;
/**
 * Staging metadata: the shared owner-declared schema plus the DB-compatible `capturedAt` grammar applied
 * only at the write boundary. The shared `nativeArtifactMetadataSchema` is reused verbatim for read-back
 * (summary/detail/state), so already-stored values — always DB-grammar by construction — keep parsing;
 * this extra refine only rejects a looser-but-reader-valid `capturedAt` before it reaches the RPC.
 */
const nativeArtifactStageMetadataSchema = nativeArtifactMetadataSchema.superRefine((m, ctx) => {
  if (!NATIVE_ARTIFACT_CAPTURED_AT_RE.test(m.capturedAt))
    ctx.addIssue({
      code: "custom",
      path: ["capturedAt"],
      message:
        "Use YYYY-MM-DDTHH:MM:SS with an optional fraction and a Z or ±HH:MM offset (the database's timestamp grammar)",
    });
});
export const nativeArtifactStageInputSchema = z
  .object({ metadata: nativeArtifactStageMetadataSchema, base64: nativeArtifactBase64Schema })
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
