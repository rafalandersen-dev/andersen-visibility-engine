import { describe, expect, it } from "vitest";
import {
  GSC_REPORT_TIMEZONE,
  MAX_NATIVE_REPORT_BYTES,
  MAX_NATIVE_REPORT_ROWS,
  NATIVE_REPORT_PARSER_VERSION,
  escapeForSpreadsheet,
  interpretExportCell,
  marketScopeLabel,
  nativePresence,
  nativeReportImportInputSchema,
  nativeReportSnapshotSchema,
  nativeSnapshotScopeKey,
  resolveExportZero,
  type NativeReportSnapshot,
} from "./native-ai-report";
/** Fixtures only. No genuine export was available; these rows exercise the rules a real
 * parser must satisfy (spec §12 CI11-T04…T12, T35) and establish no real acceptance. */
const reviewerId = "00000000-0000-4000-8000-000000000009";
const receipt = { reviewer: reviewerId, at: "2026-09-14T10:00:00Z" };
const base = (): NativeReportSnapshot => ({
  source: "gsc_generative_ai_search",
  declaredProperty: "https://example.test/",
  reportKind: "table",
  dimension: "page",
  aggregation: "page",
  period: { start: "2026-08-01", end: "2026-08-31", timezone: GSC_REPORT_TIMEZONE },
  marketScope: { country: "swe", exposed: true },
  filters: { country: "swe" },
  completeness: "complete",
  capturedAt: "2026-09-14T09:00:00Z",
  importedAt: "2026-09-14T09:05:00Z",
  artifact: { sha256: "a".repeat(64), bytes: 1200, filename: "FIXTURE-gsc.csv" },
  parserVersion: NATIVE_REPORT_PARSER_VERSION,
  provenance: "owner_supplied_native_export",
  rows: [
    {
      key: "https://example.test/massage",
      cells: { impressions: interpretExportCell("12", "count") },
    },
    { key: "https://example.test/", cells: { impressions: interpretExportCell("0", "count") } },
  ],
  supersedesSnapshotId: null,
});
describe("export-zero rule (CI11-T04, T05, T06)", () => {
  it("keeps ~ and - as unknown source values even though exports print them as 0", () => {
    for (const marker of ["~", "-", " ~ ", ""])
      expect(interpretExportCell(marker, "count")).toMatchObject({
        status: "unknown_source",
        value: null,
        raw: marker,
      });
  });
  it("treats a bare exported zero as unknown until the original cell is reviewed", () => {
    const cell = interpretExportCell("0", "count");
    expect(cell).toMatchObject({ status: "unknown_export_zero", value: null, raw: "0" });
    const zero = resolveExportZero(cell, { ...receipt, original: "numeric_zero" });
    expect(zero).toMatchObject({ status: "known_zero", value: 0, raw: "0", review: receipt });
    const marker = resolveExportZero(cell, { ...receipt, original: "unavailable_marker" });
    expect(marker).toMatchObject({ status: "unknown_source", value: null, raw: "0" });
    expect(() => resolveExportZero(zero, { ...receipt, original: "numeric_zero" })).toThrow();
    expect(() =>
      resolveExportZero(interpretExportCell("5", "count"), {
        ...receipt,
        original: "numeric_zero",
      }),
    ).toThrow();
  });
  it("refuses a known zero without value 0 and a reviewer receipt", () => {
    const snapshot = base();
    snapshot.rows[1].cells.impressions = {
      raw: "0",
      value: 0,
      status: "known_zero",
      unit: "count",
    };
    expect(() => nativeReportSnapshotSchema.parse(snapshot)).toThrow();
    snapshot.rows[1].cells.impressions = {
      raw: "0",
      value: 0,
      status: "known_zero",
      unit: "count",
      review: receipt,
    };
    expect(() => nativeReportSnapshotSchema.parse(snapshot)).not.toThrow();
  });
  it("keeps preliminary numbers labelled preliminary and missing cells unavailable", () => {
    expect(interpretExportCell("7", "count", { preliminary: true })).toMatchObject({
      status: "preliminary",
      value: 7,
    });
    expect(interpretExportCell(null, "count")).toMatchObject({
      status: "unavailable",
      value: null,
    });
    expect(interpretExportCell(undefined, "percent")).toMatchObject({ status: "unavailable" });
  });
});
describe("native semantics preserved (CI11-T07, T08, T09)", () => {
  it("stores chart and page aggregation separately with the source timezone, and never sums rows", () => {
    const chart = {
      ...base(),
      reportKind: "chart" as const,
      dimension: "property" as const,
      aggregation: "property" as const,
    };
    const table = base();
    expect(nativeReportSnapshotSchema.parse(chart).aggregation).toBe("property");
    expect(nativeReportSnapshotSchema.parse(table).aggregation).toBe("page");
    expect(nativeSnapshotScopeKey(chart)).not.toBe(nativeSnapshotScopeKey(table));
    expect(table.period.timezone).toBe("America/Los_Angeles");
    // Presence reads individual known cells; no total is reconstructed from page rows.
    expect(nativePresence(table, "impressions")).toEqual({
      observed: true,
      reason: "known_positive_value",
    });
  });
  it("keeps Bing citation share as a per-query percentage with no averaging or competitor inference", () => {
    const bing: NativeReportSnapshot = {
      ...base(),
      source: "bing_ai_performance",
      dimension: "grounding_query",
      aggregation: "query",
      period: { start: "2026-08-01", end: "2026-08-31", timezone: null },
      marketScope: { country: null, exposed: false },
      filters: {},
      rows: [
        {
          key: "massage limhamn boka",
          cells: {
            citations: interpretExportCell("3", "count"),
            citationShare: interpretExportCell("12.5%", "percent"),
          },
        },
        {
          key: "massage malmö pris",
          cells: {
            citations: interpretExportCell("0", "count"),
            citationShare: interpretExportCell("~", "percent"),
          },
        },
      ],
    };
    const parsed = nativeReportSnapshotSchema.parse(bing);
    expect(parsed.rows[0].cells.citationShare).toMatchObject({
      status: "known_value",
      value: 12.5,
      unit: "percent",
    });
    expect(parsed.rows[1].cells.citationShare.status).toBe("unknown_source");
    expect(interpretExportCell("120%", "percent").status).toBe("invalid");
    // Presence for the count metric is per stream and never a share average.
    expect(nativePresence(parsed, "citations").observed).toBe(true);
    expect(nativePresence(parsed, "citationShare").observed).toBe(true);
    expect(nativePresence(parsed, "recommendations")).toEqual({
      observed: null,
      reason: "metric_not_in_report",
    });
  });
  it("labels an unsegmented report as not exposed and never as a city or language", () => {
    expect(marketScopeLabel({ country: null, exposed: false })).toBe(
      "market scope not exposed / unsegmented",
    );
    expect(marketScopeLabel({ country: "swe", exposed: true })).toContain("country filter SWE");
    expect(marketScopeLabel({ country: "swe", exposed: true })).not.toMatch(/malm|swedish/i);
    expect(() =>
      nativeReportSnapshotSchema.parse({
        ...base(),
        marketScope: { country: "swe", exposed: false },
      }),
    ).toThrow();
  });
});
describe("availability, versioning and safety (CI11-T10, T11, T12, T35)", () => {
  it("reports unknown rather than zero when cells are unknown or the report is incomplete", () => {
    const unknown = base();
    unknown.rows = [
      { key: "https://example.test/", cells: { impressions: interpretExportCell("0", "count") } },
    ];
    expect(nativePresence(unknown, "impressions")).toEqual({
      observed: null,
      reason: "unknown_or_incomplete_cells",
    });
    unknown.rows[0].cells.impressions = resolveExportZero(unknown.rows[0].cells.impressions, {
      ...receipt,
      original: "numeric_zero",
    });
    expect(nativePresence(unknown, "impressions").observed).toBe(false);
    const partial = { ...unknown, completeness: "partial" as const };
    expect(nativePresence(partial, "impressions").observed).toBeNull();
    expect(nativePresence({ ...base(), rows: [] }, "impressions").observed).toBeNull();
  });
  it("versions same-scope reimports by scope key and artifact rather than adding events", () => {
    const first = base();
    const reimport = { ...base(), artifact: { ...base().artifact, sha256: "b".repeat(64) } };
    expect(nativeSnapshotScopeKey(first)).toBe(nativeSnapshotScopeKey(reimport));
    expect(first.artifact.sha256).not.toBe(reimport.artifact.sha256);
    const otherPeriod = { ...base(), period: { ...base().period, start: "2026-09-01" } };
    expect(nativeSnapshotScopeKey(otherPeriod)).not.toBe(nativeSnapshotScopeKey(first));
    expect(
      nativeReportSnapshotSchema.parse({
        ...reimport,
        supersedesSnapshotId: "00000000-0000-4000-8000-000000000001",
      }).supersedesSnapshotId,
    ).toBe("00000000-0000-4000-8000-000000000001");
  });
  it("marks formula, markup and oversized cells invalid, escapes them for spreadsheets and bounds the record", () => {
    for (const raw of [
      "=SUM(A1:A9)",
      "+1+1",
      "@cmd",
      "<img src=x>",
      "1,234",
      "12 000",
      "NaN",
      "1e9",
    ])
      expect(interpretExportCell(raw, "count"), raw).toMatchObject({
        status: "invalid",
        value: null,
      });
    expect(escapeForSpreadsheet("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeForSpreadsheet("-")).toBe("-");
    expect(escapeForSpreadsheet("12")).toBe("12");
    expect(escapeForSpreadsheet(null)).toBe("");
    expect(interpretExportCell("9".repeat(5000), "count").raw).toHaveLength(2048);
    expect(() =>
      nativeReportSnapshotSchema.parse({
        ...base(),
        artifact: { ...base().artifact, bytes: MAX_NATIVE_REPORT_BYTES + 1 },
      }),
    ).toThrow();
    const tooMany = base();
    tooMany.rows = Array.from({ length: MAX_NATIVE_REPORT_ROWS + 1 }, (_, i) => ({
      key: `https://example.test/${i}`,
      cells: { impressions: interpretExportCell("1", "count") },
    }));
    expect(() => nativeReportSnapshotSchema.parse(tooMany)).toThrow();
  });
  it("refuses imported review receipts, provenance and parser identity (server-attributed only)", () => {
    const { importedAt, parserVersion, provenance, supersedesSnapshotId, ...input } = base();
    expect(() => nativeReportImportInputSchema.parse(input)).not.toThrow();
    expect(() => nativeReportImportInputSchema.parse({ ...input, provenance })).toThrow();
    expect(() => nativeReportImportInputSchema.parse({ ...input, verified: true })).toThrow();
    const reviewed = structuredClone(input);
    reviewed.rows[1].cells.impressions = {
      raw: "0",
      value: 0,
      status: "known_zero",
      unit: "count",
      review: receipt,
    };
    expect(() => nativeReportImportInputSchema.parse(reviewed)).toThrow(/recorded by the server/);
    void importedAt;
    void parserVersion;
    void supersedesSnapshotId;
  });
});
