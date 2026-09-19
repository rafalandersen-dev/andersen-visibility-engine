import { z } from "zod";
/**
 * Citation Intelligence v1, CI-1 preparation (product/CITATION_INTELLIGENCE_SPEC.md §3, §8).
 *
 * Typed record for an owner-supplied native AI report snapshot (Google Search Console
 * "Generative AI performance report (Search)" or Bing Webmaster Tools "AI Performance")
 * and the deterministic value-status rules that every parser must apply. This module is
 * client-safe and network-free: it never fetches, never evaluates a cell and never sums
 * independent totals. The concrete column mapping of each export is deliberately absent
 * until a genuine export exists; the rules below are what that mapping must feed.
 */
export const NATIVE_REPORT_SOURCES = ["gsc_generative_ai_search", "bing_ai_performance"] as const;
export type NativeReportSource = (typeof NATIVE_REPORT_SOURCES)[number];
/** Cell statuses from the spec. Completeness of the whole report is kept separately. */
export const VALUE_STATUSES = [
  "known_value",
  "known_zero",
  "unknown_source",
  "unknown_export_zero",
  "unavailable",
  "preliminary",
  "invalid",
] as const;
export type ValueStatus = (typeof VALUE_STATUSES)[number];
/** Bounds derived from the existing safe-upload contract; a genuine export may lower them. */
export const MAX_NATIVE_REPORT_BYTES = 2 * 1024 * 1024;
export const MAX_NATIVE_REPORT_ROWS = 5000;
export const MAX_NATIVE_CELL_CHARS = 2048;
export const NATIVE_REPORT_PARSER_VERSION = "native-ai-report-rules-v1";
/** GSC reports its dates in Pacific Time; Bing's export timezone is unknown until observed. */
export const GSC_REPORT_TIMEZONE = "America/Los_Angeles";
const UNAVAILABLE_MARKERS = new Set(["~", "-", "–", "—", ""]);
const reviewer = z
  .object({
    reviewer: z.string().uuid(),
    at: z.string().datetime({ offset: true }),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export const nativeCellSchema = z
  .object({
    raw: z.string().max(MAX_NATIVE_CELL_CHARS).nullable(),
    value: z.number().finite().nullable(),
    status: z.enum(VALUE_STATUSES),
    unit: z.enum(["count", "percent"]),
    /** Present only when a human resolved an exported zero against the original report cell. */
    review: reviewer.optional(),
  })
  .strict()
  .superRefine((cell, ctx) => {
    if (cell.status === "known_zero" && (cell.value !== 0 || !cell.review))
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "A known zero needs value 0 and the reviewer's original-cell receipt",
      });
    if (
      ["unknown_source", "unknown_export_zero", "unavailable", "invalid"].includes(cell.status) &&
      cell.value !== null
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Unknown, unavailable and invalid cells carry no numeric value",
      });
    if (["known_value", "preliminary"].includes(cell.status) && cell.value === null)
      ctx.addIssue({ code: "custom", path: ["value"], message: "Known cells carry a value" });
    // The status and value must be exactly what deterministic interpretation of `raw` yields;
    // a caller cannot claim `known_value`/`preliminary` for a number unrelated to the export
    // text, nor pin a reviewed zero onto a cell the export never showed as zero. This applies
    // the numeric-bounds, formula-rejection and export-zero rules to the trust boundary so a
    // forged positive value cannot be smuggled past the schema. Unknown/unavailable/invalid
    // cells create no positive evidence and are left to the null-value checks above.
    const interpreted = interpretExportCell(cell.raw, cell.unit);
    if (
      (cell.status === "known_value" || cell.status === "preliminary") &&
      (interpreted.status !== "known_value" || interpreted.value !== cell.value)
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A known value must equal the deterministic interpretation of its raw export cell",
      });
    // A reviewed known zero can only sit on a cell whose raw export reads as a numeric zero
    // (`unknown_export_zero` before review); the receipt cannot rehabilitate an arbitrary raw.
    if (
      cell.status === "known_zero" &&
      cell.value === 0 &&
      cell.review &&
      interpreted.status !== "unknown_export_zero"
    )
      ctx.addIssue({
        code: "custom",
        path: ["raw"],
        message: "A known zero must resolve an exported cell that reads as a numeric zero",
      });
  });
export type NativeCell = z.infer<typeof nativeCellSchema>;
function parseNumber(text: string, unit: "count" | "percent"): number | null {
  const stripped = unit === "percent" ? text.replace(/%\s*$/, "") : text;
  // Thousands separators are ambiguous across locales; a genuine export decides them. Accept
  // plain integers and decimals only; anything else is invalid, never coerced.
  if (!/^\d+(?:\.\d+)?$/.test(stripped)) return null;
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  if (unit === "percent" && n > 100) return null;
  return n;
}
/**
 * Export-zero rule (spec §3.1): `~` and `-` mean unknown even when an export says 0; a bare
 * exported 0 that the file alone cannot distinguish from those substitutions is
 * `unknown_export_zero`. Preliminary periods keep their number under `preliminary`.
 */
export function interpretExportCell(
  raw: string | null | undefined,
  unit: "count" | "percent",
  options: { preliminary?: boolean } = {},
): NativeCell {
  if (raw === null || raw === undefined)
    return { raw: null, value: null, status: "unavailable", unit };
  // An oversized cell is never interpreted: slicing first would let a numeric prefix pass as a
  // clean value while invalid trailing material is silently dropped. Keep the bounded prefix as
  // diagnostic text (schema caps `raw` at MAX_NATIVE_CELL_CHARS) but refuse the cell as invalid.
  if (raw.length > MAX_NATIVE_CELL_CHARS)
    return { raw: raw.slice(0, MAX_NATIVE_CELL_CHARS), value: null, status: "invalid", unit };
  const trimmed = raw.trim();
  if (UNAVAILABLE_MARKERS.has(trimmed)) return { raw, value: null, status: "unknown_source", unit };
  const value = parseNumber(trimmed, unit);
  if (value === null) return { raw, value: null, status: "invalid", unit };
  if (value === 0) return { raw, value: null, status: "unknown_export_zero", unit };
  return { raw, value, status: options.preliminary ? "preliminary" : "known_value", unit };
}
/** A human confirms the original report showed numeric zero for this exact cell. The raw
 * export text is never rewritten; only the interpretation and its receipt change. */
export function resolveExportZero(
  cell: NativeCell,
  receipt: z.infer<typeof reviewer> & { original: "numeric_zero" | "unavailable_marker" },
): NativeCell {
  if (cell.status !== "unknown_export_zero")
    throw new Error("Only an unknown exported zero can be resolved against the original cell");
  const { original, ...review } = receipt;
  reviewer.parse(review);
  return original === "numeric_zero"
    ? { ...cell, value: 0, status: "known_zero", review }
    : { ...cell, value: null, status: "unknown_source", review };
}
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const nativeMarketScopeSchema = z
  .object({
    /** ISO 3166-1 alpha-3 as GSC exposes it, or null when the report exposes no country. */
    country: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .nullable(),
    /** Whether the source itself exposed a geographic filter for this snapshot. */
    exposed: z.boolean(),
  })
  .strict()
  .refine((scope) => scope.exposed || scope.country === null, {
    message: "A country cannot be claimed when the source exposes no geographic scope",
  });
/** Owner-readable market label that never invents city or language detail (§3.1, §3.2). */
export function marketScopeLabel(scope: z.infer<typeof nativeMarketScopeSchema>): string {
  if (!scope.exposed || scope.country === null) return "market scope not exposed / unsegmented";
  return `country filter ${scope.country.toUpperCase()} (source-level country only; no city or language detail)`;
}
const rowSchema = z
  .object({
    /** Dimension value exactly as exported (a page URL, country code, device, date or grounding query). */
    key: z.string().min(1).max(MAX_NATIVE_CELL_CHARS),
    cells: z.record(z.string().min(1).max(64), nativeCellSchema),
  })
  .strict();
/**
 * GSC dates its reports in Pacific Time (spec §3.1, [G1]); a `gsc_generative_ai_search` snapshot
 * must carry exactly `GSC_REPORT_TIMEZONE`, never an assumed, foreign or missing one — a wrong day
 * boundary would silently mis-scope every date-dimension row. Bing's export timezone is unknown
 * until a genuine export is observed, so a `bing_ai_performance` snapshot is not forced to any
 * value here: its timezone is preserved as declared (including null) and never guessed.
 */
function enforceReportTimezone(
  snapshot: { source: NativeReportSource; period: { timezone: string | null } },
  ctx: z.RefinementCtx,
) {
  if (
    snapshot.source === "gsc_generative_ai_search" &&
    snapshot.period.timezone !== GSC_REPORT_TIMEZONE
  )
    ctx.addIssue({
      code: "custom",
      path: ["period", "timezone"],
      message: `A ${snapshot.source} report is dated in ${GSC_REPORT_TIMEZONE}; a different or missing timezone is not this source's contract and is never assumed`,
    });
}
const nativeReportSnapshotObject = z
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
    /** Native aggregation of the exported numbers; chart and page tables aggregate differently. */
    aggregation: z.enum(["property", "page", "query", "unknown"]),
    period: z
      .object({ start: isoDate, end: isoDate, timezone: z.string().min(1).max(64).nullable() })
      .strict(),
    marketScope: nativeMarketScopeSchema,
    filters: z.record(z.string().max(64), z.string().max(200)).default({}),
    completeness: z.enum(["complete", "preliminary", "partial", "unknown"]),
    /** When the owner downloaded the report and when Milo stored it. */
    capturedAt: z.string().datetime({ offset: true }),
    importedAt: z.string().datetime({ offset: true }),
    artifact: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().min(1).max(MAX_NATIVE_REPORT_BYTES),
        filename: z.string().max(255).nullable(),
      })
      .strict(),
    parserVersion: z.literal(NATIVE_REPORT_PARSER_VERSION),
    provenance: z.literal("owner_supplied_native_export"),
    rows: z.array(rowSchema).max(MAX_NATIVE_REPORT_ROWS),
    /** A same-scope reimport supersedes the earlier snapshot instead of adding events. */
    supersedesSnapshotId: z.string().uuid().nullable(),
  })
  .strict();
export const nativeReportSnapshotSchema =
  nativeReportSnapshotObject.superRefine(enforceReportTimezone);
export type NativeReportSnapshot = z.infer<typeof nativeReportSnapshotSchema>;
/** What an import request may carry. Reviewer identity, verification flags and snapshot
 * identity come from the authenticated server, never from the file or the browser (CI11-T35). */
export const nativeReportImportInputSchema = nativeReportSnapshotObject
  .omit({ importedAt: true, parserVersion: true, provenance: true, supersedesSnapshotId: true })
  .strict()
  .superRefine((input, ctx) => {
    // The source-specific timezone contract holds at the import boundary too, so a forged GSC
    // snapshot cannot enter with an assumed or missing timezone.
    enforceReportTimezone(input, ctx);
    for (const [index, row] of input.rows.entries())
      for (const [metric, cell] of Object.entries(row.cells))
        if (cell.review)
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "cells", metric, "review"],
            message: "Review receipts are recorded by the server after import, not imported",
          });
  });
/**
 * Fold only the case-insensitive scheme and authority (host, optional port/userinfo) of a
 * URL-prefix property; the path, query and fragment stay case-sensitive so `/Shop` and
 * `/shop` remain distinct scope identities (§3.1, §3.3). A property that is not a URL (for
 * example a domain property or opaque owner label) is preserved verbatim; this invents no
 * export column mapping. */
function normalizeDeclaredProperty(property: string): string {
  const trimmed = property.trim();
  const match = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#]*)([\s\S]*)$/.exec(trimmed);
  if (!match) return trimmed;
  const [, scheme, authority, rest] = match;
  return `${scheme.toLowerCase()}${authority.toLowerCase()}${rest}`;
}
/** Scope identity used to version same-scope reimports (§3.3). Two exports of the same
 * source, property, report kind, dimension, period and filters describe one snapshot
 * lineage; the artifact hash separates versions within it. */
export function nativeSnapshotScopeKey(
  snapshot: Pick<
    NativeReportSnapshot,
    | "source"
    | "declaredProperty"
    | "reportKind"
    | "dimension"
    | "period"
    | "marketScope"
    | "filters"
  >,
): string {
  return JSON.stringify([
    snapshot.source,
    normalizeDeclaredProperty(snapshot.declaredProperty),
    snapshot.reportKind,
    snapshot.dimension,
    snapshot.period.start,
    snapshot.period.end,
    snapshot.period.timezone,
    snapshot.marketScope.country?.toUpperCase() ?? null,
    snapshot.marketScope.exposed,
    Object.entries(snapshot.filters).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
/**
 * Observed presence for one native stream (§6.1). Positive only from a known value above
 * zero; absent only when every cell is a reviewed known zero in a complete report; otherwise
 * unknown. Never averages, never sums rows, never combines sources.
 */
export function nativePresence(snapshot: NativeReportSnapshot, metric: string) {
  const cells = snapshot.rows.map((row) => row.cells[metric]);
  const present = cells.filter((cell) => cell !== undefined);
  if (!present.length) return { observed: null as boolean | null, reason: "metric_not_in_report" };
  if (
    present.some(
      (cell) => (cell.status === "known_value" || cell.status === "preliminary") && cell.value! > 0,
    )
  )
    return { observed: true, reason: "known_positive_value" };
  // Absence needs *every* row to carry a reviewed known zero. A row missing this metric is an
  // unknown cell, not a zero, so its absence can never establish observed:false.
  if (
    snapshot.completeness === "complete" &&
    cells.every((cell) => cell !== undefined && cell.status === "known_zero")
  )
    return { observed: false, reason: "all_cells_reviewed_zero" };
  return { observed: null, reason: "unknown_or_incomplete_cells" };
}
/** Spreadsheet-safe export of a raw cell: formula-looking text is prefixed, never evaluated. */
export function escapeForSpreadsheet(raw: string | null): string {
  if (raw === null) return "";
  return /^[=+\-@\t\r]/.test(raw) && !UNAVAILABLE_MARKERS.has(raw.trim()) ? `'${raw}` : raw;
}
