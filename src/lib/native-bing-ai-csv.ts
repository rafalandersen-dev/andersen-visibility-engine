import { GscParseError, classifyGscReportPage, gscDay, gscProperty, parseCsvGrid } from "./gsc";
import {
  MAX_NATIVE_REPORT_BYTES,
  interpretExportCell,
  nativeReportImportInputSchema,
  type NativeCell,
} from "./native-ai-report";
import type { NativeGoogleReportPreview } from "./native-google-ai-csv";
/**
 * Network-free parser for the two genuinely observed Bing Webmaster Tools "AI Performance" (BETA)
 * CSV exports (unzipped bytes, one CSV at a time). Separate from the Google parser: Bing exposes no
 * country, filter, language or timezone, so the interpretation always carries an unknown/unsegmented
 * scope (marketScope {country:null,exposed:false}, filters {}, timezone null) regardless of any
 * declared metadata. Only the exact observed column layouts are accepted; everything else is rejected
 * rather than guessed. The parser never fabricates server-attributed fields. The preview shape is the
 * shared NativeGoogleReportPreview. See docs/native-bing-intake-20261113.md.
 *
 * shortcut: reuses gsc.ts parseCsvGrid bounds (1000 rows, 16 columns, 4000-char cells); the observed
 * overview is 90 rows and pages 3 rows. Raise only if a genuine export exceeds 1000 rows.
 */
export class NativeBingCsvError extends Error {}
/** One row-bearing Bing CSV. There is no Filters.csv for Bing. */
export type NativeBingReportCsv = "bing_overview" | "bing_pages";
export const NATIVE_BING_CSV_FILES = ["bing_overview", "bing_pages"] as const;
/** Version of the native-bing-ai-csv interpretation persisted with a record. */
export const NATIVE_BING_PARSER_VERSION = "native-bing-ai-csv-v1";
/**
 * Exact observed header, per-metric keys, dimension, aggregation and report kind for each Bing CSV.
 * Overview is property-aggregated (citations and the distinct cited-pages count per date); Pages is
 * page-aggregated citations. The two are never summed or reconciled.
 */
const BING_CSV = {
  bing_overview: {
    header: ["Date", "Citations", "Cited Pages"],
    metrics: ["citations", "cited_pages"],
    dimension: "date",
    aggregation: "property",
    reportKind: "table",
  },
  bing_pages: {
    header: ["Page", "Citations"],
    metrics: ["citations"],
    dimension: "page",
    aggregation: "page",
    reportKind: "table",
  },
} as const;
/** Declared dimension/reportKind/aggregation for a Bing CSV; the server re-parse verifies the parser
 * re-derives the same values (never trusting a browser-declared aggregation). */
export function nativeBingReportDescriptor(file: NativeBingReportCsv): {
  dimension: (typeof BING_CSV)[NativeBingReportCsv]["dimension"];
  reportKind: (typeof BING_CSV)[NativeBingReportCsv]["reportKind"];
  aggregation: (typeof BING_CSV)[NativeBingReportCsv]["aggregation"];
} {
  const { dimension, reportKind, aggregation } = BING_CSV[file];
  return { dimension, reportKind, aggregation };
}
/** Map the owner-declared dimension to the supported Bing CSV kind; only date/page are parseable. */
export function bingFileKindForDimension(dimension: string): NativeBingReportCsv | null {
  return dimension === "date" ? "bing_overview" : dimension === "page" ? "bing_pages" : null;
}
/** The exact observed per-metric keys a Bing CSV kind carries; the record schema requires every row
 * to hold exactly these measures (no arbitrary, missing or extra one). */
export function nativeBingReportMetrics(file: NativeBingReportCsv): readonly string[] {
  return BING_CSV[file].metrics;
}
/** A genuine Bing count lexeme: a nonnegative run of decimal digits whose value is a JS safe integer
 * and round-trips to the same digits. This is stricter than the shared Google-v1 count parser — a
 * Bing measure counts only whole events, so `1.5`, `1.0`, `0.0`, `9007199254740993`, `1e2`, `1,000`,
 * a negative or a formula is never a value here, never a rounded number. (A bare `0` is still handled
 * upstream as `unknown_export_zero`, so this guard only governs value-bearing cells.) */
export function isBingCountLexeme(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return false;
  const n = Number(t);
  return Number.isSafeInteger(n) && String(n) === t;
}
/** Statuses whose raw cell read as a number (a value, a preliminary value or a bare exported zero);
 * only these are subject to the Bing whole-event lexeme rule. Unknown-source markers, unavailable and
 * already-invalid cells are left exactly as the shared rules decided. */
const BING_NUMERIC_STATUSES = ["known_value", "preliminary", "unknown_export_zero"] as const;
/** Interpret one Bing count cell: the shared rules decide status, then a numeric cell whose raw is not
 * a whole safe-integer lexeme (`1.5`, `1.0`, `0.0`, `9007199254740993`, `1e2`, `1,000`, …) is refused
 * as invalid rather than kept as a rounded/fractional number. A bare `0` is a safe-integer lexeme, so
 * it stays `unknown_export_zero`. Used by the parser and mirrored by the record schema's Bing guard. */
export function interpretBingCountCell(
  raw: string | null | undefined,
  options: { preliminary?: boolean } = {},
): NativeCell {
  const cell = interpretExportCell(raw, "count", options);
  if (
    (BING_NUMERIC_STATUSES as readonly string[]).includes(cell.status) &&
    !isBingCountLexeme(cell.raw)
  )
    return { raw: cell.raw, value: null, status: "invalid", unit: "count" };
  return cell;
}
/** True when a persisted Bing count cell honours the whole-event lexeme rule: a non-numeric cell is
 * unconstrained here, and a numeric one must carry a nonnegative safe-integer lexeme. Mirrors
 * `interpretBingCountCell` at the record read boundary. */
export function isValidBingCountCell(cell: NativeCell): boolean {
  if (cell.unit !== "count") return false;
  if (!(BING_NUMERIC_STATUSES as readonly string[]).includes(cell.status)) return true;
  return isBingCountLexeme(cell.raw);
}
/** Serial calendar-day number (civil JDN) from a real `YYYY-MM-DD`; pure O(1) arithmetic on the
 * numeric parts, so no `Date` object is built and no timezone is consulted or guessed. */
function calendarDayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}
/** A Bing Overview row key must be a real calendar date within the inclusive selected period — the
 * same contract the CSV parser enforces (`bingOverviewDateToIso` + the period bound), re-checked at
 * the record read boundary. `gscDay` refuses a malformed or impossible date (e.g. `2026-08-13x`,
 * `2026-02-30`, `2026-13-01`) that a lexical range alone would admit. */
export function isBingOverviewDateKey(key: string, start: string, end: string): boolean {
  return gscDay(key) && key >= start && key <= end;
}
/** True only when the observed dates cover EVERY calendar day of the inclusive selected period. A
 * missing endpoint or an internal gap makes this false, so a full-period ("complete") claim can never
 * stand on partial date coverage. Only real in-period calendar dates count — a malformed/impossible
 * lexeme never fills a day. Bounded: one pass over the rows plus O(1) day arithmetic. */
export function bingOverviewCoversPeriod(
  start: string,
  end: string,
  isoDates: readonly string[],
): boolean {
  const expected = calendarDayNumber(end) - calendarDayNumber(start) + 1;
  const within = new Set(isoDates.filter((d) => isBingOverviewDateKey(d, start, end)));
  return within.size === expected;
}
export interface NativeBingReportMeta {
  /** Owner-declared property; never verified against the publisher. */
  declaredProperty: string;
  /** Owner-declared absolute SELECTED period (the UI 3-month span); Bing exposes no timezone. */
  period: { start: string; end: string };
  capturedAt: string;
  completeness: "complete" | "preliminary" | "partial" | "unknown";
  filename?: string | null;
}
function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength < 1) throw new NativeBingCsvError("The CSV file is empty.");
  if (bytes.byteLength > MAX_NATIVE_REPORT_BYTES) throw new NativeBingCsvError("CSV exceeds 2 MB.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new NativeBingCsvError("CSV is not valid UTF-8.");
  }
}
function gridOf(text: string, expected: readonly string[]): string[][] {
  let grid: string[][];
  try {
    grid = parseCsvGrid(text);
  } catch (e) {
    throw e instanceof GscParseError ? new NativeBingCsvError(e.message) : e;
  }
  if (grid.length < 2) throw new NativeBingCsvError("The CSV has no data rows.");
  const header = grid[0].map((h) => h.trim());
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i]))
    throw new NativeBingCsvError(
      `Unexpected columns; a genuine export has exactly: ${expected.join(", ")}.`,
    );
  const data = grid.slice(1);
  for (const row of data)
    if (row.length !== expected.length)
      throw new NativeBingCsvError("CSV row width differs from its header.");
  return data;
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** The ONLY observed Bing overview date lexeme: `M/D/YYYY 12:00:00 AM` (single- or two-digit month
 * and day; always midnight). Returns the real-calendar `YYYY-MM-DD` or null; no locale/timezone guess
 * and no other format accepted. */
export function bingOverviewDateToIso(lexeme: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) 12:00:00 AM$/.exec(lexeme);
  if (!m) return null;
  // M/D/YYYY: group 1 is month, group 2 is day.
  const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return gscDay(iso) ? iso : null;
}
/**
 * Parse one Bing CSV into a validated import preview. `bytes` are the raw CSV bytes: UTF-8 and size
 * are checked, and the artifact hash is computed over the complete original bytes with WebCrypto — a
 * caller-supplied hash is never trusted, and the scope is forced unknown/unsegmented.
 */
export async function parseNativeBingReportCsv(
  file: NativeBingReportCsv,
  bytes: Uint8Array,
  meta: NativeBingReportMeta,
): Promise<NativeGoogleReportPreview> {
  const spec = BING_CSV[file];
  // Bing exports always declare a real property; require a syntactically valid one before parsing.
  if (!gscProperty(meta.declaredProperty))
    throw new NativeBingCsvError(
      "declaredProperty must be a valid property (URL-prefix or sc-domain).",
    );
  const data = gridOf(decodeUtf8(bytes), spec.header);
  const preliminary = meta.completeness === "preliminary";
  const seen = new Set<string>();
  const rows: { key: string; cells: Record<string, ReturnType<typeof interpretExportCell>> }[] = [];
  let withheldPageRows = 0;
  for (const cols of data) {
    const rawKey = cols[0];
    if (!rawKey) throw new NativeBingCsvError("Missing dimension value.");
    if (spec.dimension === "page") {
      if (seen.has(rawKey)) throw new NativeBingCsvError("Duplicate page value.");
      seen.add(rawKey);
      // Reuse the standard GSC page classifier: a query/fragment in-property page is withheld
      // (counted, never retained as a key, never stripped into another URL); credentials, another
      // protocol, unsafe text or an out-of-property page stay invalid.
      const verdict = classifyGscReportPage(rawKey, meta.declaredProperty);
      if (verdict === "invalid")
        throw new NativeBingCsvError(
          "A page row is malformed, uses credentials or another protocol, or is outside the declared property.",
        );
      if (verdict === "withhold") {
        withheldPageRows++;
        continue;
      }
      rows.push({
        key: rawKey,
        cells: { citations: interpretBingCountCell(cols[1], { preliminary }) },
      });
      continue;
    }
    // Overview: normalize the date lexeme, reject non-observed formats, dedupe and bound to the period.
    const iso = bingOverviewDateToIso(rawKey);
    if (!iso) throw new NativeBingCsvError("Date is not the observed M/D/YYYY 12:00:00 AM format.");
    if (seen.has(iso)) throw new NativeBingCsvError("Duplicate date value.");
    seen.add(iso);
    if (iso < meta.period.start || iso > meta.period.end)
      throw new NativeBingCsvError("Date is outside the selected reporting period.");
    rows.push({
      key: iso,
      cells: {
        citations: interpretBingCountCell(cols[1], { preliminary }),
        cited_pages: interpretBingCountCell(cols[2], { preliminary }),
      },
    });
  }
  // A "complete" claim requires a row on every calendar day of the selected period; otherwise the
  // period is only partially observed. Derived deterministically (same request → same result) from
  // the actual rows and the original period — dates are neither invented nor zero-filled, and this
  // never applies to the page table (which has no date coverage to borrow). Privacy withholding is a
  // separate flag and never changes source completeness.
  const completeness =
    spec.dimension === "date" &&
    meta.completeness === "complete" &&
    !bingOverviewCoversPeriod(
      meta.period.start,
      meta.period.end,
      rows.map((r) => r.key),
    )
      ? "partial"
      : meta.completeness;
  const input = {
    source: "bing_ai_performance" as const,
    declaredProperty: meta.declaredProperty,
    reportKind: spec.reportKind,
    dimension: spec.dimension,
    aggregation: spec.aggregation,
    period: { start: meta.period.start, end: meta.period.end, timezone: null },
    // Bing exposes no geographic scope or filter; forced here even if the staged metadata claims one.
    marketScope: { country: null, exposed: false },
    filters: {},
    completeness,
    capturedAt: meta.capturedAt,
    artifact: {
      sha256: await sha256Hex(bytes),
      bytes: bytes.byteLength,
      filename: meta.filename ?? null,
    },
    rows,
  };
  const result = nativeReportImportInputSchema.safeParse(input);
  if (!result.success)
    throw new NativeBingCsvError(result.error.issues[0]?.message ?? "Invalid native report.");
  return { input: result.data, withheldPageRows, partial: withheldPageRows > 0 };
}
