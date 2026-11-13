import { describe, expect, it } from "vitest";
import { GSC_REPORT_TIMEZONE } from "./native-ai-report";
import { NATIVE_BING_PARSER_VERSION, parseNativeBingReportCsv } from "./native-bing-ai-csv";
import { parseNativeGoogleFilters, parseNativeGoogleReportCsv } from "./native-google-ai-csv";
import {
  NATIVE_GOOGLE_PARSER_VERSION,
  fileKindForDimension,
  isJsonbStorableText,
  nativeLimitationNoteSchema,
  nativeReportParsedRecordSchema,
} from "./native-google-intake";
/** SYNTHETIC fixtures only — header/structure-derived, never the real authorized export. */
const enc = (s: string) => new TextEncoder().encode(s);
const filterContext = parseNativeGoogleFilters(
  enc("Filter,Value\nSearch type,Web (text-based)\nDate,Last 3 months\nCountry,Sweden\n"),
);
const artifactId = "00000000-0000-4000-8000-000000000abc";
async function chartRecord(over: Record<string, unknown> = {}) {
  const preview = await parseNativeGoogleReportCsv(
    "chart",
    enc("Date,Impressions\n2026-09-01,12\n2026-09-02,0\n"),
    {
      declaredProperty: "https://example.test/",
      period: { start: "2026-09-01", end: "2026-11-13", timezone: GSC_REPORT_TIMEZONE },
      capturedAt: "2026-11-13T09:00:00Z",
      completeness: "partial",
      filterContext,
      filename: "Chart.csv",
    },
  );
  return {
    artifactId,
    artifactSha256: preview.input.artifact.sha256,
    parserVersion: NATIVE_GOOGLE_PARSER_VERSION,
    file: "chart" as const,
    withheldPageRows: preview.withheldPageRows,
    partial: preview.partial,
    limitationNote: "9–11 Nov 2026 Google logging outage",
    input: preview.input,
    ...over,
  };
}

describe("fileKindForDimension", () => {
  it("maps the four observed dimensions and rejects the rest", () => {
    expect(fileKindForDimension("date")).toBe("chart");
    expect(fileKindForDimension("page")).toBe("pages");
    expect(fileKindForDimension("country")).toBe("countries");
    expect(fileKindForDimension("device")).toBe("devices");
    for (const d of ["property", "grounding_query", "unknown", "x"])
      expect(fileKindForDimension(d)).toBeNull();
  });
});

describe("nativeLimitationNoteSchema", () => {
  it("accepts plain notes and the empty note, rejects jsonb-unstorable text", () => {
    expect(nativeLimitationNoteSchema.safeParse("").success).toBe(true);
    expect(nativeLimitationNoteSchema.safeParse("known outage 9–11 Nov").success).toBe(true);
    expect(nativeLimitationNoteSchema.safeParse("a" + String.fromCharCode(0)).success).toBe(false);
    expect(nativeLimitationNoteSchema.safeParse("a" + String.fromCharCode(0xd800)).success).toBe(
      false,
    );
    expect(isJsonbStorableText("ok 😀 text")).toBe(true);
  });
});

describe("nativeReportParsedRecordSchema", () => {
  it("accepts a well-formed chart record", async () => {
    expect(nativeReportParsedRecordSchema.safeParse(await chartRecord()).success).toBe(true);
  });
  it("rejects a hash that does not match the parsed artifact", async () => {
    expect(
      nativeReportParsedRecordSchema.safeParse(
        await chartRecord({ artifactSha256: "a".repeat(64) }),
      ).success,
    ).toBe(false);
  });
  it("rejects partial set without withheld rows and withheld rows off the pages table", async () => {
    expect(
      nativeReportParsedRecordSchema.safeParse(await chartRecord({ partial: true })).success,
    ).toBe(false);
    expect(
      nativeReportParsedRecordSchema.safeParse(
        await chartRecord({ withheldPageRows: 1, partial: true }),
      ).success,
    ).toBe(false);
  });
  it("rejects a wrong parser version", async () => {
    expect(
      nativeReportParsedRecordSchema.safeParse(await chartRecord({ parserVersion: "other" }))
        .success,
    ).toBe(false);
  });
  it("rejects a file whose descriptor disagrees with the parsed aggregation", async () => {
    // A pages file claim over chart (property-aggregated) input is refused.
    expect(
      nativeReportParsedRecordSchema.safeParse(await chartRecord({ file: "pages" })).success,
    ).toBe(false);
  });
});

/** SYNTHETIC Bing overview: two in-period days fully covering the selected period. */
const BING_OVERVIEW =
  "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,3,2\n";
async function bingOverviewRecord(over: Record<string, unknown> = {}) {
  const preview = await parseNativeBingReportCsv("bing_overview", enc(BING_OVERVIEW), {
    declaredProperty: "https://example.test/",
    period: { start: "2026-08-13", end: "2026-08-14" },
    capturedAt: "2026-11-13T09:00:00Z",
    completeness: "complete",
    filename: "Overview.csv",
  });
  return {
    artifactId,
    artifactSha256: preview.input.artifact.sha256,
    parserVersion: NATIVE_BING_PARSER_VERSION,
    file: "bing_overview" as const,
    withheldPageRows: preview.withheldPageRows,
    partial: preview.partial,
    limitationNote: "",
    input: preview.input,
    ...over,
  };
}

describe("nativeReportParsedRecordSchema — Bing variant at the read boundary", () => {
  it("accepts a well-formed, fully-covered Bing overview record", async () => {
    const rec = await bingOverviewRecord();
    expect(rec.input.completeness).toBe("complete"); // both days present, so complete stands
    expect(nativeReportParsedRecordSchema.safeParse(rec).success).toBe(true);
  });
  it("rejects an Overview whose rows carry impressions instead of citations + cited_pages", async () => {
    const rec = await bingOverviewRecord();
    for (const row of rec.input.rows) row.cells = { impressions: row.cells.citations };
    expect(nativeReportParsedRecordSchema.safeParse(rec).success).toBe(false);
  });
  it("rejects an Overview missing cited_pages or carrying an extra measure", async () => {
    const missing = await bingOverviewRecord();
    for (const row of missing.input.rows) row.cells = { citations: row.cells.citations };
    expect(nativeReportParsedRecordSchema.safeParse(missing).success).toBe(false);
    const extra = await bingOverviewRecord();
    for (const row of extra.input.rows) row.cells.clicks = row.cells.citations;
    expect(nativeReportParsedRecordSchema.safeParse(extra).success).toBe(false);
  });
  it("rejects a forged fractional count even though the shared cell schema accepts it", async () => {
    const rec = await bingOverviewRecord();
    // The shared Google-v1 parser keeps 1.5 as a known count, so the per-cell schema passes it; the
    // Bing record guard is what refuses a non-whole-event count at the persisted-record boundary.
    rec.input.rows[0].cells.citations = {
      raw: "1.5",
      value: 1.5,
      status: "known_value",
      unit: "count",
    };
    expect(nativeReportParsedRecordSchema.safeParse(rec).success).toBe(false);
  });
  it("rejects a complete overview whose rows do not cover every day of the period", async () => {
    const preview = await parseNativeBingReportCsv(
      "bing_overview",
      enc("Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/15/2026 12:00:00 AM,3,2\n"),
      {
        declaredProperty: "https://example.test/",
        period: { start: "2026-08-13", end: "2026-08-15" }, // 8/14 missing
        capturedAt: "2026-11-13T09:00:00Z",
        completeness: "partial", // parser keeps partial; we forge the complete claim below
        filename: "Overview.csv",
      },
    );
    const forged = {
      artifactId,
      artifactSha256: preview.input.artifact.sha256,
      parserVersion: NATIVE_BING_PARSER_VERSION,
      file: "bing_overview" as const,
      withheldPageRows: preview.withheldPageRows,
      partial: preview.partial,
      limitationNote: "",
      input: { ...preview.input, completeness: "complete" as const },
    };
    expect(nativeReportParsedRecordSchema.safeParse(forged).success).toBe(false);
  });
  it("rejects a Bing Overview row key that is not a real in-period calendar date, for any completeness", async () => {
    // A lexically in-range but malformed/impossible/out-of-period key is a read-boundary gap: the
    // CSV parser rejects it, so the stored-record schema must too — for EVERY completeness, not only
    // "complete" (the coverage check alone would miss a partial/preliminary/unknown record).
    for (const completeness of ["complete", "partial", "preliminary", "unknown"] as const)
      for (const badKey of ["2026-08-13x", "2026-02-30", "2026-08-10"]) {
        const rec = await bingOverviewRecord();
        rec.input.completeness = completeness;
        rec.input.rows[1].key = badKey; // malformed suffix / impossible day / before the period start
        expect(
          nativeReportParsedRecordSchema.safeParse(rec).success,
          `${completeness}:${badKey}`,
        ).toBe(false);
      }
    // A well-formed non-complete record with real in-period keys still passes (no over-rejection).
    const ok = await bingOverviewRecord();
    ok.input.completeness = "partial";
    expect(nativeReportParsedRecordSchema.safeParse(ok).success).toBe(true);
  });
});
