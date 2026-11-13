import { z } from "zod";
import { GscParseError, classifyGscReportPage, gscDay, gscProperty, parseCsvGrid } from "./gsc";
import {
  MAX_NATIVE_REPORT_BYTES,
  interpretExportCell,
  nativeReportImportInputSchema,
} from "./native-ai-report";
/**
 * Network-free parser for a genuine Google Search Console "Performance on Search — Generative AI
 * features" ZIP export (unzipped, one CSV at a time). Only the exact column layouts observed in a
 * real authorized export are accepted; everything else is rejected rather than guessed. The parser
 * never fabricates server-attributed fields (importedAt, provenance, review receipts, snapshot
 * identity): it produces a validated `nativeReportImportInputSchema` preview from the CSV bytes plus
 * the source-observed metadata the file itself cannot carry (declared property, absolute reporting
 * period, capturedAt, completeness). See docs/native-google-ai-csv-20261113.md for the contract.
 *
 * shortcut: reuses gsc.ts parseCsvGrid bounds (1000 rows, 16 columns, 4000-char cells); genuine
 * observed exports are far smaller. Raise to the native 5000-row bound only if a real export exceeds
 * 1000 rows.
 */
export class NativeGoogleCsvError extends Error {}
/** One row-bearing CSV in the export ZIP. Filters.csv is parsed separately (it carries no metrics). */
export type NativeGoogleReportCsv = "chart" | "pages" | "countries" | "devices";
/** Exact observed header, dimension, GSC aggregation and report kind for each row-bearing CSV.
 * Chart/Countries/Devices are property-aggregated; Pages is page-aggregated — the two totals are
 * different measurements and are never summed or reconciled (native-ai-report.ts nativeSnapshotScopeKey). */
const REPORT_CSV = {
  chart: {
    header: ["Date", "Impressions"],
    dimension: "date",
    aggregation: "property",
    reportKind: "chart",
  },
  pages: {
    header: ["Top pages", "Impressions"],
    dimension: "page",
    aggregation: "page",
    reportKind: "table",
  },
  countries: {
    header: ["Country", "Impressions"],
    dimension: "country",
    aggregation: "property",
    reportKind: "table",
  },
  devices: {
    header: ["Device", "Impressions"],
    dimension: "device",
    aggregation: "property",
    reportKind: "table",
  },
} as const;
/** The declared dimension/reportKind/aggregation a genuine export of each CSV carries. The owner
 * intake stages these in the raw-artifact metadata and the server re-parse verifies the parser
 * re-derives the same values (never trusting a browser-declared aggregation). */
export function nativeGoogleReportDescriptor(file: NativeGoogleReportCsv): {
  dimension: (typeof REPORT_CSV)[NativeGoogleReportCsv]["dimension"];
  reportKind: (typeof REPORT_CSV)[NativeGoogleReportCsv]["reportKind"];
  aggregation: (typeof REPORT_CSV)[NativeGoogleReportCsv]["aggregation"];
} {
  const { dimension, reportKind, aggregation } = REPORT_CSV[file];
  return { dimension, reportKind, aggregation };
}
/** The only filter names observed in a genuine export. A page/query filter would change the chart's
 * aggregation (Google docs answer 16984139), so an unobserved filter is rejected rather than parsed
 * under an assumed aggregation. */
const OBSERVED_FILTERS = new Set(["Search type", "Date", "Country"]);
/** Country dimension/filter values seen in the authorized export. No speculative locale table is
 * built: an unobserved country is rejected, not mapped. ("Sweden" was actually observed → SWE.) */
const OBSERVED_COUNTRY_ALPHA3: Record<string, string> = { Sweden: "SWE" };
/** The only Search type observed in a genuine export. */
const OBSERVED_SEARCH_TYPE = "Web (text-based)";
export interface NativeGoogleFilterContext {
  /** Raw Filter→Value pairs exactly as exported. */
  filters: Record<string, string>;
  marketScope: { country: string | null; exposed: boolean };
}
/**
 * Enforce that a filter context is observed-format AND internally consistent. Applied to both the
 * Filters.csv parse and the report-parser boundary, so a forged `meta.filterContext` (an unobserved
 * page filter that would change chart aggregation, a marketScope that contradicts the country
 * filter, or an unsupported Search type) cannot slip past a TypeScript-level assumption that it
 * "came from parseNativeGoogleFilters".
 */
export function assertObservedFilterContext(ctx: NativeGoogleFilterContext): void {
  for (const name of Object.keys(ctx.filters))
    if (!OBSERVED_FILTERS.has(name))
      throw new NativeGoogleCsvError(
        `Unsupported filter context: "${name}" was not observed in a genuine export.`,
      );
  const searchType = ctx.filters["Search type"];
  if (searchType !== undefined && searchType.trim() !== OBSERVED_SEARCH_TYPE)
    throw new NativeGoogleCsvError(
      `Unsupported search type "${searchType.trim()}"; only "${OBSERVED_SEARCH_TYPE}" was observed.`,
    );
  const country = ctx.filters["Country"];
  if (country !== undefined) {
    const alpha3 = OBSERVED_COUNTRY_ALPHA3[country.trim()];
    if (!alpha3)
      throw new NativeGoogleCsvError(
        `Unsupported country "${country.trim()}"; only observed countries map to an ISO code.`,
      );
    if (ctx.marketScope.country !== alpha3 || ctx.marketScope.exposed !== true)
      throw new NativeGoogleCsvError(
        `Market scope does not match the "${country.trim()}" country filter.`,
      );
  } else if (ctx.marketScope.country !== null || ctx.marketScope.exposed !== false)
    throw new NativeGoogleCsvError("Market scope claims a country the filters do not expose.");
}
export interface NativeGoogleReportMeta {
  /** Owner-declared property; never verified against the publisher. */
  declaredProperty: string;
  /** Absolute reporting period, source-observed. GSC dates are Pacific Time; relative filter labels
   * ("Last 3 months") are NOT a period and are never converted into one here. */
  period: { start: string; end: string; timezone: string };
  capturedAt: string;
  completeness: "complete" | "preliminary" | "partial" | "unknown";
  /** Parsed from Filters.csv via parseNativeGoogleFilters. */
  filterContext: NativeGoogleFilterContext;
  filename?: string | null;
}
function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength < 1) throw new NativeGoogleCsvError("The CSV file is empty.");
  if (bytes.byteLength > MAX_NATIVE_REPORT_BYTES)
    throw new NativeGoogleCsvError("CSV exceeds 2 MB.");
  try {
    // Default ignoreBOM:false strips a leading BOM; fatal:true rejects non-UTF-8 input.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new NativeGoogleCsvError("CSV is not valid UTF-8.");
  }
}
/** Parse into a header-validated grid of data rows, rejecting wrong columns and ragged rows. */
function gridOf(text: string, expected: readonly string[]): string[][] {
  let grid: string[][];
  try {
    grid = parseCsvGrid(text);
  } catch (e) {
    throw e instanceof GscParseError ? new NativeGoogleCsvError(e.message) : e;
  }
  if (grid.length < 2) throw new NativeGoogleCsvError("The CSV has no data rows.");
  const header = grid[0].map((h) => h.trim());
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i]))
    throw new NativeGoogleCsvError(
      `Unexpected columns; a genuine export has exactly: ${expected.join(", ")}.`,
    );
  const data = grid.slice(1);
  for (const row of data)
    if (row.length !== expected.length)
      throw new NativeGoogleCsvError("CSV row width differs from its header.");
  return data;
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/**
 * Parse Filters.csv (the export's filter-context file) into source filters and market scope. Rejects
 * duplicate or unobserved filter names, and an unobserved country value, instead of guessing.
 */
export function parseNativeGoogleFilters(bytes: Uint8Array): NativeGoogleFilterContext {
  const data = gridOf(decodeUtf8(bytes), ["Filter", "Value"]);
  const filters: Record<string, string> = {};
  for (const [name, value] of data) {
    const filter = name.trim();
    if (filter in filters) throw new NativeGoogleCsvError(`Duplicate filter "${filter}".`);
    filters[filter] = value;
  }
  const country = filters["Country"];
  const marketScope: NativeGoogleFilterContext["marketScope"] =
    country !== undefined
      ? { country: OBSERVED_COUNTRY_ALPHA3[country.trim()] ?? null, exposed: true }
      : { country: null, exposed: false };
  const ctx = { filters, marketScope };
  assertObservedFilterContext(ctx);
  return ctx;
}
export interface NativeGoogleReportPreview {
  /** Validated import-preview snapshot — never a stored or server-attributed record. */
  input: z.infer<typeof nativeReportImportInputSchema>;
  /** In-property pages whose only private part is a query/fragment (e.g. `?lang=sv`): counted here,
   * never retained as a row key (that would expose the private parameter) and never stripped into
   * another page's URL. Always 0 for non-page CSVs. */
  withheldPageRows: number;
  /** True when the parsed rows are not the complete table because page rows were withheld, so the
   * result must not be treated as complete page evidence. Independent of the source `completeness`. */
  partial: boolean;
}
/**
 * Parse one row-bearing export CSV (Chart/Pages/Countries/Devices) into a validated import preview.
 * `bytes` are the raw CSV bytes: UTF-8 and size are checked, and the artifact hash is computed over
 * the complete original bytes with WebCrypto — a caller-supplied hash or size is never trusted, and
 * withholding a page row never changes the hash.
 */
export async function parseNativeGoogleReportCsv(
  file: NativeGoogleReportCsv,
  bytes: Uint8Array,
  meta: NativeGoogleReportMeta,
): Promise<NativeGoogleReportPreview> {
  const spec = REPORT_CSV[file];
  // The filter context is untrusted input even when typed as NativeGoogleFilterContext: re-validate
  // it here so a forged page filter (which would change chart aggregation) or an inconsistent market
  // scope cannot ride in under the hard-coded property aggregation below.
  assertObservedFilterContext(meta.filterContext);
  // A GSC export always carries a real property; require a syntactically valid one (URL-prefix or
  // sc-domain) before parsing. Ownership is still never verified against the publisher.
  if (!gscProperty(meta.declaredProperty))
    throw new NativeGoogleCsvError(
      "declaredProperty must be a valid Search Console property (URL-prefix or sc-domain).",
    );
  const data = gridOf(decodeUtf8(bytes), spec.header);
  const preliminary = meta.completeness === "preliminary";
  const seen = new Set<string>();
  const rows: { key: string; cells: { impressions: ReturnType<typeof interpretExportCell> } }[] =
    [];
  let withheldPageRows = 0;
  for (const [key, impressions] of data) {
    if (!key) throw new NativeGoogleCsvError("Missing dimension value.");
    // Reject a duplicate dimension value consistently BEFORE page classification, so a repeated page
    // row is rejected whether it would be retained or withheld (withheld rows still consume identity).
    if (seen.has(key))
      throw new NativeGoogleCsvError(`Duplicate ${spec.dimension} value "${key}".`);
    seen.add(key);
    if (spec.dimension === "page") {
      // Reuse the standard GSC page classifier: an in-property page whose only private part is a
      // query/fragment is withheld (counted, never retained as a key, never stripped into another
      // URL); credentials, another protocol, unsafe text or an out-of-property page stay invalid.
      const verdict = classifyGscReportPage(key, meta.declaredProperty);
      if (verdict === "invalid")
        throw new NativeGoogleCsvError(
          "A page row is malformed, uses credentials or another protocol, or is outside the declared property.",
        );
      if (verdict === "withhold") {
        withheldPageRows++;
        continue;
      }
    }
    if (spec.dimension === "date" && !gscDay(key))
      throw new NativeGoogleCsvError(`Date "${key}" is not a YYYY-MM-DD day.`);
    if (spec.dimension === "date" && (key < meta.period.start || key > meta.period.end))
      throw new NativeGoogleCsvError(`Date "${key}" is outside the reporting period.`);
    rows.push({
      key,
      cells: { impressions: interpretExportCell(impressions, "count", { preliminary }) },
    });
  }
  const input = {
    source: "gsc_generative_ai_search" as const,
    declaredProperty: meta.declaredProperty,
    reportKind: spec.reportKind,
    dimension: spec.dimension,
    aggregation: spec.aggregation,
    period: { start: meta.period.start, end: meta.period.end, timezone: meta.period.timezone },
    marketScope: meta.filterContext.marketScope,
    filters: meta.filterContext.filters,
    completeness: meta.completeness,
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
    throw new NativeGoogleCsvError(result.error.issues[0]?.message ?? "Invalid native report.");
  return { input: result.data, withheldPageRows, partial: withheldPageRows > 0 };
}
