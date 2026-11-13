import { describe, expect, it } from "vitest";
import { GSC_REPORT_TIMEZONE } from "./native-ai-report";
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
