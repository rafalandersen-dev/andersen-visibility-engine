import { describe, expect, it } from "vitest";
import {
  GSC_REPORT_TIMEZONE,
  MAX_NATIVE_CELL_CHARS,
  MAX_NATIVE_REPORT_BYTES,
  MAX_NATIVE_REPORT_ROWS,
  NATIVE_REPORT_PARSER_VERSION,
  escapeForSpreadsheet,
  interpretExportCell,
  marketScopeLabel,
  nativeCellSchema,
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
  it("enforces the GSC report timezone and never guesses Bing's (4053596309)", () => {
    // GSC is dated in Pacific Time; the correct source timezone parses.
    expect(() => nativeReportSnapshotSchema.parse(base())).not.toThrow();
    expect(GSC_REPORT_TIMEZONE).toBe("America/Los_Angeles");
    // A missing (null) or a foreign/guessed timezone on a GSC snapshot is rejected: a wrong day
    // boundary would silently mis-scope every date-dimension row.
    expect(() =>
      nativeReportSnapshotSchema.parse({ ...base(), period: { ...base().period, timezone: null } }),
    ).toThrow(/dated in America\/Los_Angeles/);
    expect(() =>
      nativeReportSnapshotSchema.parse({
        ...base(),
        period: { ...base().period, timezone: "Europe/Stockholm" },
      }),
    ).toThrow(/dated in America\/Los_Angeles/);
    // The same source-timezone contract holds at the import boundary.
    const { importedAt, parserVersion, provenance, supersedesSnapshotId, ...input } = base();
    void importedAt;
    void parserVersion;
    void provenance;
    void supersedesSnapshotId;
    expect(() => nativeReportImportInputSchema.parse(input)).not.toThrow();
    expect(() =>
      nativeReportImportInputSchema.parse({
        ...input,
        period: { ...input.period, timezone: null },
      }),
    ).toThrow(/dated in America\/Los_Angeles/);
    // Bing's export timezone is unknown until observed: a null Bing timezone is accepted, not
    // forced to GSC's, and a Bing-declared timezone is likewise preserved, never overridden.
    const bing = {
      ...base(),
      source: "bing_ai_performance" as const,
      period: { start: "2026-08-01", end: "2026-08-31", timezone: null },
    };
    expect(() => nativeReportSnapshotSchema.parse(bing)).not.toThrow();
    expect(() =>
      nativeReportSnapshotSchema.parse({ ...bing, period: { ...bing.period, timezone: "UTC" } }),
    ).not.toThrow();
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
  it("never reads a row missing the metric as a reviewed zero", () => {
    // A complete snapshot with one reviewed known zero and one row missing that metric: the
    // missing cell is unknown, not zero, so absence must stay unknown rather than assert false.
    const snapshot = base();
    const reviewedZero = resolveExportZero(interpretExportCell("0", "count"), {
      ...receipt,
      original: "numeric_zero",
    });
    snapshot.rows = [
      { key: "https://example.test/a", cells: { impressions: reviewedZero } },
      { key: "https://example.test/b", cells: { clicks: interpretExportCell("4", "count") } },
    ];
    expect(nativePresence(snapshot, "impressions")).toEqual({
      observed: null,
      reason: "unknown_or_incomplete_cells",
    });
    // With every present row a reviewed zero and no row missing the metric, absence holds.
    snapshot.rows[1].cells.impressions = reviewedZero;
    expect(nativePresence(snapshot, "impressions").observed).toBe(false);
  });
  it("keeps case-sensitive URL-prefix properties as distinct scope identities", () => {
    const shopUpper = { ...base(), declaredProperty: "https://example.test/Shop" };
    const shopLower = { ...base(), declaredProperty: "https://example.test/shop" };
    expect(nativeSnapshotScopeKey(shopUpper)).not.toBe(nativeSnapshotScopeKey(shopLower));
    // Scheme and host case is not significant; only the path/query is.
    expect(
      nativeSnapshotScopeKey({ ...base(), declaredProperty: "HTTPS://EXAMPLE.TEST/Shop" }),
    ).toBe(nativeSnapshotScopeKey(shopUpper));
  });
  it("versions same-scope reimports by scope key and artifact rather than adding events", () => {
    const first = base();
    const reimport = { ...base(), artifact: { ...base().artifact, sha256: "b".repeat(64) } };
    expect(nativeSnapshotScopeKey(first)).toBe(nativeSnapshotScopeKey(reimport));
    expect(first.artifact.sha256).not.toBe(reimport.artifact.sha256);
    const otherPeriod = { ...base(), period: { ...base().period, start: "2026-08-02" } };
    expect(nativeSnapshotScopeKey(otherPeriod)).not.toBe(nativeSnapshotScopeKey(first));
    // Aggregation is part of scope identity (4053687909): the same page table re-aggregated at the
    // property level is a different measurement, so it must not share the page-aggregated snapshot's
    // scope and silently supersede it — while the same-scope reimport above (identical aggregation)
    // still matches.
    const otherAggregation = { ...base(), aggregation: "property" as const };
    expect(nativeSnapshotScopeKey(otherAggregation)).not.toBe(nativeSnapshotScopeKey(first));
    expect(
      nativeReportSnapshotSchema.parse({
        ...reimport,
        supersedesSnapshotId: "00000000-0000-4000-8000-000000000001",
      }).supersedesSnapshotId,
    ).toBe("00000000-0000-4000-8000-000000000001");
  });
  it("requires real, ordered calendar dates on the snapshot and import period boundaries (4053687911)", () => {
    const withPeriod = (start: string, end: string) => ({
      ...base(),
      period: { start, end, timezone: GSC_REPORT_TIMEZONE },
    });
    // A well-formed but impossible date is rejected: 99 is neither a month nor a day, month 13 and
    // 00 never occur, and 30 February never occurs.
    for (const bad of ["2026-99-99", "2026-13-01", "2026-00-10", "2026-02-30"])
      expect(() => nativeReportSnapshotSchema.parse(withPeriod(bad, "2026-08-31")), bad).toThrow();
    // Leap years use the real Gregorian rule: 2027 is not a leap year, 2028 is.
    expect(() =>
      nativeReportSnapshotSchema.parse(withPeriod("2027-02-29", "2027-03-01")),
    ).toThrow();
    expect(() =>
      nativeReportSnapshotSchema.parse(withPeriod("2028-02-01", "2028-02-29")),
    ).not.toThrow();
    // A reversed period (start after end) is refused; an inclusive single-day period is accepted.
    expect(() => nativeReportSnapshotSchema.parse(withPeriod("2026-08-31", "2026-08-01"))).toThrow(
      /ordered/,
    );
    expect(() =>
      nativeReportSnapshotSchema.parse(withPeriod("2026-08-01", "2026-08-01")),
    ).not.toThrow();
    // The same real-date and ordering contract holds at the import boundary.
    const { importedAt, parserVersion, provenance, supersedesSnapshotId, ...input } = base();
    void importedAt;
    void parserVersion;
    void provenance;
    void supersedesSnapshotId;
    expect(() =>
      nativeReportImportInputSchema.parse({
        ...input,
        period: { ...input.period, start: "2026-02-30" },
      }),
    ).toThrow();
    expect(() =>
      nativeReportImportInputSchema.parse({
        ...input,
        period: { start: "2026-08-31", end: "2026-08-01", timezone: GSC_REPORT_TIMEZONE },
      }),
    ).toThrow(/ordered/);
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
    // An oversized cell is refused as invalid: its numeric prefix must not be interpreted after
    // the invalid trailing material is truncated away. Bounded diagnostic text is still kept.
    const oversized = interpretExportCell("9".repeat(5000), "count");
    expect(oversized.raw).toHaveLength(2048);
    expect(oversized).toMatchObject({ status: "invalid", value: null });
    expect(interpretExportCell(`5${" ".repeat(5000)}`, "count")).toMatchObject({
      status: "invalid",
      value: null,
    });
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
  it("refuses a claimed value or status that raw interpretation does not produce", () => {
    // A genuine cell always matches its deterministic interpretation.
    expect(() =>
      nativeCellSchema.parse({ raw: "12", value: 12, status: "known_value", unit: "count" }),
    ).not.toThrow();
    expect(() =>
      nativeCellSchema.parse({ raw: "12.5%", value: 12.5, status: "known_value", unit: "percent" }),
    ).not.toThrow();
    expect(() =>
      nativeCellSchema.parse(interpretExportCell("7", "count", { preliminary: true })),
    ).not.toThrow();
    // A number unrelated to the raw export text cannot be smuggled in as a known value.
    for (const forged of [
      { raw: "abc", value: 100, status: "known_value", unit: "count" },
      { raw: "12", value: 999, status: "known_value", unit: "count" },
      { raw: "=SUM(A1)", value: 5, status: "known_value", unit: "count" },
      { raw: "1,234", value: 1234, status: "known_value", unit: "count" },
      { raw: "0", value: 0, status: "known_value", unit: "count" },
      { raw: "5", value: 6, status: "preliminary", unit: "count" },
      { raw: "120%", value: 120, status: "known_value", unit: "percent" },
      { raw: null, value: 3, status: "known_value", unit: "count" },
    ] as const)
      expect(() => nativeCellSchema.parse(forged), forged.raw ?? "null").toThrow(
        /deterministic interpretation/,
      );
    // A reviewed known zero cannot be pinned onto a raw the export never showed as zero.
    expect(() =>
      nativeCellSchema.parse({
        raw: "5",
        value: 0,
        status: "known_zero",
        unit: "count",
        review: receipt,
      }),
    ).toThrow(/numeric zero/);
    // The genuine resolveExportZero outputs validate cleanly through the cell schema.
    const zeroCell = interpretExportCell("0", "count");
    const knownZero = resolveExportZero(zeroCell, { ...receipt, original: "numeric_zero" });
    expect(() => nativeCellSchema.parse(knownZero)).not.toThrow();
    const resolvedMarker = resolveExportZero(zeroCell, {
      ...receipt,
      original: "unavailable_marker",
    });
    expect(() => nativeCellSchema.parse(resolvedMarker)).not.toThrow();
  });
  it("keeps an oversized invalid diagnostic cell invalid and refuses to rehabilitate it", () => {
    // A numeric prefix followed by oversized invalid material is invalid; the truncated
    // diagnostic raw must never be re-read as a clean value, at the boundary or after storage.
    const oversized = interpretExportCell(`123${"x".repeat(MAX_NATIVE_CELL_CHARS)}`, "count");
    expect(oversized).toMatchObject({ status: "invalid", value: null });
    expect(oversized.raw).toHaveLength(MAX_NATIVE_CELL_CHARS);
    expect(() => nativeCellSchema.parse(oversized)).not.toThrow();
    expect(nativeCellSchema.parse(oversized).status).toBe("invalid");
    // Forging that truncated raw into a known value is rejected: it still interprets as invalid.
    expect(() =>
      nativeCellSchema.parse({ ...oversized, value: 123, status: "known_value" }),
    ).toThrow(/deterministic interpretation/);
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
