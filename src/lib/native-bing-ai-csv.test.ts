import { describe, expect, it } from "vitest";
import {
  NativeBingCsvError,
  bingOverviewCoversPeriod,
  bingOverviewDateToIso,
  interpretBingCountCell,
  isBingCountLexeme,
  isBingOverviewDateKey,
  nativeBingReportDescriptor,
  parseNativeBingReportCsv,
  type NativeBingReportMeta,
} from "./native-bing-ai-csv";
/**
 * SYNTHETIC fixtures only — header/structure-derived, never the real private Bing export. Values
 * (dates, example.test URLs, counts) are invented to exercise the parser's rules.
 */
const bytes = (csv: string) => new TextEncoder().encode(csv);
const meta = (over: Partial<NativeBingReportMeta> = {}): NativeBingReportMeta => ({
  declaredProperty: "https://example.test/",
  period: { start: "2026-08-13", end: "2026-11-12" },
  capturedAt: "2026-11-13T11:16:20Z",
  completeness: "partial",
  filename: "Overview.csv",
  ...over,
});
const OVERVIEW =
  "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,0,0\n";

describe("bingOverviewDateToIso", () => {
  it("accepts only the observed M/D/YYYY 12:00:00 AM midnight lexeme", () => {
    expect(bingOverviewDateToIso("8/13/2026 12:00:00 AM")).toBe("2026-08-13");
    expect(bingOverviewDateToIso("11/2/2026 12:00:00 AM")).toBe("2026-11-02");
    for (const bad of [
      "2026-08-13",
      "8/13/2026",
      "8/13/2026 12:00:00 PM",
      "8/13/2026 1:00:00 AM",
      "13/8/2026 12:00:00 AM", // impossible month → real-date check rejects
      "2/30/2026 12:00:00 AM", // impossible day
    ])
      expect(bingOverviewDateToIso(bad), bad).toBeNull();
  });
});

describe("nativeBingReportDescriptor", () => {
  it("is property/table for overview and page/table for pages", () => {
    expect(nativeBingReportDescriptor("bing_overview")).toEqual({
      dimension: "date",
      reportKind: "table",
      aggregation: "property",
    });
    expect(nativeBingReportDescriptor("bing_pages")).toEqual({
      dimension: "page",
      reportKind: "table",
      aggregation: "page",
    });
  });
});

describe("parseNativeBingReportCsv — overview", () => {
  it("parses dates + both metrics, forces unknown scope, keeps the bare zero unknown", async () => {
    const out = await parseNativeBingReportCsv("bing_overview", bytes(OVERVIEW), meta());
    expect(out).toMatchObject({ withheldPageRows: 0, partial: false });
    expect(out.input).toMatchObject({
      source: "bing_ai_performance",
      dimension: "date",
      aggregation: "property",
      reportKind: "table",
      marketScope: { country: null, exposed: false },
      filters: {},
    });
    expect(out.input.period).toEqual({ start: "2026-08-13", end: "2026-11-12", timezone: null });
    expect(out.input.rows).toHaveLength(2);
    expect(out.input.rows[0]).toMatchObject({ key: "2026-08-13" });
    expect(out.input.rows[0].cells.citations).toMatchObject({ status: "known_value", value: 2 });
    expect(out.input.rows[0].cells.cited_pages).toMatchObject({ status: "known_value", value: 1 });
    // A bare exported 0 stays unknown (never a real zero) for both metrics.
    expect(out.input.rows[1].cells.citations).toMatchObject({ status: "unknown_export_zero" });
    expect(out.input.rows[1].cells.cited_pages).toMatchObject({ status: "unknown_export_zero" });
    expect(out.input.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.input.artifact.bytes).toBe(bytes(OVERVIEW).byteLength);
  });
  it("keeps the actual row coverage and never invents dates beyond the last observed row", async () => {
    const out = await parseNativeBingReportCsv("bing_overview", bytes(OVERVIEW), meta());
    // Period ends 2026-11-12 but the data stops at 2026-08-14 — the parser emits only real rows.
    expect(out.input.rows.map((r) => r.key)).toEqual(["2026-08-13", "2026-08-14"]);
  });
  it("rejects a non-observed date format, an out-of-period date and a duplicate date", async () => {
    for (const csv of [
      "Date,Citations,Cited Pages\n2026-08-13,2,1\n",
      "Date,Citations,Cited Pages\n11/13/2026 12:00:00 AM,2,1\n",
      "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/13/2026 12:00:00 AM,1,0\n",
    ])
      await expect(parseNativeBingReportCsv("bing_overview", bytes(csv), meta())).rejects.toThrow(
        NativeBingCsvError,
      );
  });
  it("rejects wrong columns and an invalid declared property", async () => {
    await expect(
      parseNativeBingReportCsv(
        "bing_overview",
        bytes("Date,Citations\n8/13/2026 12:00:00 AM,2\n"),
        meta(),
      ),
    ).rejects.toThrow(NativeBingCsvError);
    await expect(
      parseNativeBingReportCsv(
        "bing_overview",
        bytes(OVERVIEW),
        meta({ declaredProperty: "not-a-prop" }),
      ),
    ).rejects.toThrow(/valid property/);
  });
  it("marks a decimal or unsafe-integer count invalid, never a rounded known value", async () => {
    const out = await parseNativeBingReportCsv(
      "bing_overview",
      bytes("Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,1.5,9007199254740993\n"),
      meta(),
    );
    // A count is a whole, safe integer: a fraction and a magnitude past MAX_SAFE_INTEGER are invalid.
    expect(out.input.rows[0].cells.citations).toMatchObject({ status: "invalid", value: null });
    expect(out.input.rows[0].cells.cited_pages).toMatchObject({ status: "invalid", value: null });
  });
  it("refuses every non-integer count lexeme as invalid, keeps a bare 0 unknown, a real integer known", async () => {
    // One row per lexeme (distinct in-period dates); cited_pages stays a valid control integer.
    const csv =
      "Date,Citations,Cited Pages\n" +
      "8/13/2026 12:00:00 AM,1.0,1\n" + // trailing .0 is still fractional text, not a whole lexeme
      "8/14/2026 12:00:00 AM,0.0,1\n" + // a decimal zero is not the bare-0 export lexeme
      "8/15/2026 12:00:00 AM,1e2,1\n" + // scientific notation is never a genuine Bing count
      "8/16/2026 12:00:00 AM,0,1\n" + // a bare exported 0 stays unknown, never invalid
      "8/17/2026 12:00:00 AM,10,1\n"; // a real integer is a known value
    const out = await parseNativeBingReportCsv("bing_overview", bytes(csv), meta());
    const citations = out.input.rows.map((r) => r.cells.citations);
    expect(citations[0]).toMatchObject({ status: "invalid", value: null });
    expect(citations[1]).toMatchObject({ status: "invalid", value: null });
    expect(citations[2]).toMatchObject({ status: "invalid", value: null });
    expect(citations[3]).toMatchObject({ status: "unknown_export_zero", value: null });
    expect(citations[4]).toMatchObject({ status: "known_value", value: 10 });
  });
  it("rejects empty and non-UTF-8 bytes", async () => {
    await expect(parseNativeBingReportCsv("bing_overview", bytes(""), meta())).rejects.toThrow(
      NativeBingCsvError,
    );
    await expect(
      parseNativeBingReportCsv("bing_overview", new Uint8Array([0xff, 0x28]), meta()),
    ).rejects.toThrow(/UTF-8/);
  });
});

describe("parseNativeBingReportCsv — pages", () => {
  it("retains clean in-property pages and withholds a query/fragment page, marking partial", async () => {
    const csv =
      "Page,Citations\nhttps://example.test/a,2\nhttps://example.test/b,1\nhttps://example.test/a?utm=x,1\n";
    const out = await parseNativeBingReportCsv(
      "bing_pages",
      bytes(csv),
      meta({ filename: "Pages.csv" }),
    );
    expect(out).toMatchObject({ withheldPageRows: 1, partial: true });
    expect(out.input).toMatchObject({ dimension: "page", aggregation: "page" });
    expect(out.input.rows.map((r) => r.key)).toEqual([
      "https://example.test/a",
      "https://example.test/b",
    ]);
    expect(out.input.rows[0].cells.citations).toMatchObject({ status: "known_value", value: 2 });
    // The private query key never appears in the stored interpretation.
    expect(JSON.stringify(out.input)).not.toContain("utm=x");
  });
  it("rejects an out-of-property page and a credentialed page", async () => {
    for (const page of ["https://other.test/p", "https://user:pass@example.test/p"])
      await expect(
        parseNativeBingReportCsv("bing_pages", bytes(`Page,Citations\n${page},2\n`), meta()),
      ).rejects.toThrow(NativeBingCsvError);
  });
});

describe("Bing whole-event count lexeme", () => {
  it("accepts only a nonnegative safe-integer run of digits", () => {
    for (const ok of ["0", "7", "10", String(Number.MAX_SAFE_INTEGER)])
      expect(isBingCountLexeme(ok), ok).toBe(true);
    for (const bad of [
      "1.5",
      "1.0",
      "0.0",
      "1e2",
      "1,000",
      "-1",
      "+1",
      "007", // a value that does not round-trip to its lexeme is not a genuine integer
      "9007199254740993", // past MAX_SAFE_INTEGER
      " ",
      "=SUM(A1)",
      null,
      undefined,
    ])
      expect(isBingCountLexeme(bad), String(bad)).toBe(false);
  });
  it("downgrades a numeric non-integer cell to invalid but keeps a bare 0 unknown", () => {
    expect(interpretBingCountCell("1.5")).toMatchObject({ status: "invalid", value: null });
    expect(interpretBingCountCell("0.0")).toMatchObject({ status: "invalid", value: null });
    expect(interpretBingCountCell("0")).toMatchObject({
      status: "unknown_export_zero",
      value: null,
    });
    expect(interpretBingCountCell("3")).toMatchObject({ status: "known_value", value: 3 });
    // An unavailable marker is left as the shared rules decided, never forced to invalid.
    expect(interpretBingCountCell("~")).toMatchObject({ status: "unknown_source", value: null });
  });
});

describe("Bing overview period coverage", () => {
  it("is complete only when every calendar day of the inclusive period carries a row", () => {
    expect(
      bingOverviewCoversPeriod("2026-08-13", "2026-08-15", [
        "2026-08-13",
        "2026-08-14",
        "2026-08-15",
      ]),
    ).toBe(true);
    // A missing interior day, a missing endpoint and an empty set are all incomplete.
    expect(bingOverviewCoversPeriod("2026-08-13", "2026-08-15", ["2026-08-13", "2026-08-15"])).toBe(
      false,
    );
    expect(bingOverviewCoversPeriod("2026-08-13", "2026-08-15", ["2026-08-14", "2026-08-15"])).toBe(
      false,
    );
    expect(bingOverviewCoversPeriod("2026-08-13", "2026-08-13", ["2026-08-13"])).toBe(true);
    // A leap-day boundary counts correctly (2028 is a leap year).
    expect(
      bingOverviewCoversPeriod("2028-02-28", "2028-03-01", [
        "2028-02-28",
        "2028-02-29",
        "2028-03-01",
      ]),
    ).toBe(true);
    // A lexically in-range but non-calendar key (malformed suffix or impossible day) never fills a
    // day, so it cannot forge full coverage.
    expect(
      bingOverviewCoversPeriod("2026-08-13", "2026-08-15", [
        "2026-08-13",
        "2026-08-13x",
        "2026-08-15",
      ]),
    ).toBe(false);
    expect(
      bingOverviewCoversPeriod("2026-02-27", "2026-03-01", [
        "2026-02-27",
        "2026-02-30",
        "2026-03-01",
      ]),
    ).toBe(false);
  });
  it("isBingOverviewDateKey accepts only a real in-period calendar date", () => {
    expect(isBingOverviewDateKey("2026-08-14", "2026-08-13", "2026-08-15")).toBe(true);
    for (const bad of [
      "2026-08-13x", // malformed suffix
      "2026-02-30", // impossible calendar day
      "2026-13-01", // impossible month
      "2026-08-10", // before the period start
      "2026-08-16", // after the period end
      "not-a-date",
    ])
      expect(isBingOverviewDateKey(bad, "2026-08-13", "2026-08-15"), bad).toBe(false);
  });
  it("derives partial from a complete request when a day has no row, and never zero-fills", async () => {
    const csv =
      "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/15/2026 12:00:00 AM,3,2\n"; // 8/14 missing
    const out = await parseNativeBingReportCsv(
      "bing_overview",
      bytes(csv),
      meta({ period: { start: "2026-08-13", end: "2026-08-15" }, completeness: "complete" }),
    );
    // The complete claim is downgraded; the selected period and the two real rows are preserved.
    expect(out.input.completeness).toBe("partial");
    expect(out.input.period).toEqual({ start: "2026-08-13", end: "2026-08-15", timezone: null });
    expect(out.input.rows.map((r) => r.key)).toEqual(["2026-08-13", "2026-08-15"]);
  });
  it("keeps a complete request complete when every day is covered", async () => {
    const csv =
      "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,3,2\n8/15/2026 12:00:00 AM,1,1\n";
    const out = await parseNativeBingReportCsv(
      "bing_overview",
      bytes(csv),
      meta({ period: { start: "2026-08-13", end: "2026-08-15" }, completeness: "complete" }),
    );
    expect(out.input.completeness).toBe("complete");
  });
  it("never borrows date coverage for the page table: a complete pages request stays complete", async () => {
    const out = await parseNativeBingReportCsv(
      "bing_pages",
      bytes("Page,Citations\nhttps://example.test/a,2\n"),
      meta({ filename: "Pages.csv", completeness: "complete" }),
    );
    expect(out.input.completeness).toBe("complete");
  });
});
