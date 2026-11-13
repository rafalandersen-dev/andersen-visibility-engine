import { describe, expect, it } from "vitest";
import { GSC_REPORT_TIMEZONE } from "./native-ai-report";
import {
  NativeGoogleCsvError,
  parseNativeGoogleFilters,
  parseNativeGoogleReportCsv,
  type NativeGoogleReportMeta,
} from "./native-google-ai-csv";
/**
 * SYNTHETIC fixtures only — header/structure-derived, never the real authorized export. Values
 * (dates, example.test URLs, device/country labels) are invented to exercise the parser's rules.
 */
const bytes = (csv: string) => new TextEncoder().encode(csv);
const filterContext = parseNativeGoogleFilters(
  bytes("Filter,Value\nSearch type,Web (text-based)\nDate,Last 3 months\nCountry,Sweden\n"),
);
const meta = (over: Partial<NativeGoogleReportMeta> = {}): NativeGoogleReportMeta => ({
  declaredProperty: "https://example.test/",
  period: { start: "2026-09-01", end: "2026-11-13", timezone: GSC_REPORT_TIMEZONE },
  capturedAt: "2026-11-13T09:00:00Z",
  completeness: "partial",
  filterContext,
  filename: "FIXTURE-Chart.csv",
  ...over,
});

describe("parseNativeGoogleFilters", () => {
  it("maps the observed Sweden filter to SWE and preserves raw filter pairs", () => {
    expect(filterContext.marketScope).toEqual({ country: "SWE", exposed: true });
    expect(filterContext.filters).toEqual({
      "Search type": "Web (text-based)",
      Date: "Last 3 months",
      Country: "Sweden",
    });
  });
  it("rejects an unobserved filter name (a page filter would change chart aggregation)", () => {
    expect(() =>
      parseNativeGoogleFilters(bytes("Filter,Value\nPage,https://example.test/x\n")),
    ).toThrow(NativeGoogleCsvError);
  });
  it("rejects an unobserved country rather than guessing an ISO code", () => {
    expect(() => parseNativeGoogleFilters(bytes("Filter,Value\nCountry,Narnia\n"))).toThrow(
      /Unsupported country/,
    );
  });
  it("rejects a duplicate filter name", () => {
    expect(() =>
      parseNativeGoogleFilters(bytes("Filter,Value\nCountry,Sweden\nCountry,Sweden\n")),
    ).toThrow(/Duplicate filter/);
  });
});

describe("parseNativeGoogleReportCsv — happy paths", () => {
  it("parses the Chart (date/property) CSV and computes a real byte hash", async () => {
    const csv = "Date,Impressions\n2026-09-01,12\n2026-09-02,0\n";
    const out = await parseNativeGoogleReportCsv("chart", bytes(csv), meta());
    expect(out).toMatchObject({ withheldPageRows: 0, partial: false });
    expect(out.input).toMatchObject({
      source: "gsc_generative_ai_search",
      reportKind: "chart",
      dimension: "date",
      aggregation: "property",
      completeness: "partial",
      marketScope: { country: "SWE", exposed: true },
    });
    expect(out.input.rows).toHaveLength(2);
    expect(out.input.rows[0].cells.impressions).toMatchObject({ status: "known_value", value: 12 });
    // A bare exported zero stays unknown until a reviewer confirms the original cell.
    expect(out.input.rows[1].cells.impressions).toMatchObject({
      status: "unknown_export_zero",
      value: null,
    });
    expect(out.input.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.input.artifact.bytes).toBe(bytes(csv).byteLength);
  });
  it("parses Pages as page-aggregated and keeps raw URLs", async () => {
    const csv = "Top pages,Impressions\nhttps://example.test/massage,9\nhttps://example.test/,3\n";
    const out = await parseNativeGoogleReportCsv("pages", bytes(csv), meta());
    expect(out).toMatchObject({ withheldPageRows: 0, partial: false });
    expect(out.input).toMatchObject({
      reportKind: "table",
      dimension: "page",
      aggregation: "page",
    });
    expect(out.input.rows.map((r) => r.key)).toEqual([
      "https://example.test/massage",
      "https://example.test/",
    ]);
  });
  it("parses Countries and Devices as property-aggregated tables", async () => {
    const c = await parseNativeGoogleReportCsv(
      "countries",
      bytes("Country,Impressions\nSweden,20\nFinland,4\n"),
      meta(),
    );
    expect(c.input).toMatchObject({ dimension: "country", aggregation: "property" });
    const d = await parseNativeGoogleReportCsv(
      "devices",
      bytes("Device,Impressions\nDesktop,15\nMobile,9\n"),
      meta(),
    );
    expect(d.input).toMatchObject({ dimension: "device", aggregation: "property" });
  });
  it("withholds a query/fragment page: counted, never retained, marks partial", async () => {
    // SYNTHETIC genuinely-shaped case: a clean page plus a ?lang=sv variant of the same base.
    const csv =
      "Top pages,Impressions\nhttps://example.test/massage,9\nhttps://example.test/massage?lang=sv,4\n";
    const out = await parseNativeGoogleReportCsv("pages", bytes(csv), meta());
    expect(out).toMatchObject({ withheldPageRows: 1, partial: true });
    // Only the clean page is retained; the private ?lang=sv key never appears in the rows.
    expect(out.input.rows.map((r) => r.key)).toEqual(["https://example.test/massage"]);
    expect(JSON.stringify(out.input)).not.toContain("lang=sv");
    // Hash is still over the complete original bytes, including the withheld row.
    expect(out.input.artifact.bytes).toBe(bytes(csv).byteLength);
  });
});

describe("parseNativeGoogleReportCsv — rejections", () => {
  const reject = (
    file: Parameters<typeof parseNativeGoogleReportCsv>[0],
    csv: string,
    m = meta(),
  ) =>
    expect(parseNativeGoogleReportCsv(file, bytes(csv), m)).rejects.toThrow(NativeGoogleCsvError);
  it("rejects wrong columns", () => reject("chart", "Date,Clicks\n2026-09-01,1\n"));
  it("rejects a ragged row", () => reject("chart", "Date,Impressions\n2026-09-01,1,extra\n"));
  it("rejects a duplicate dimension key", () =>
    reject("chart", "Date,Impressions\n2026-09-01,1\n2026-09-01,2\n"));
  it("rejects a non-day date value (wrong date units)", () =>
    reject("chart", "Date,Impressions\nLast 3 months,1\n"));
  it("rejects a date outside the reporting period", () =>
    reject("chart", "Date,Impressions\n2026-01-01,1\n"));
  it("rejects a malformed page URL", () => reject("pages", "Top pages,Impressions\nnot-a-url,1\n"));
  it("rejects a page outside the declared property", () =>
    reject("pages", "Top pages,Impressions\nhttps://other.test/x,1\n"));
  it("rejects an empty file", () => reject("chart", ""));
  it("rejects non-UTF-8 bytes", () =>
    expect(
      parseNativeGoogleReportCsv("chart", new Uint8Array([0xff, 0x28, 0x0a]), meta()),
    ).rejects.toThrow(/UTF-8/));
  it("rejects a GSC report with a non-Pacific timezone", () =>
    reject(
      "chart",
      "Date,Impressions\n2026-09-01,1\n",
      meta({
        period: { start: "2026-09-01", end: "2026-11-13", timezone: "UTC" },
      }),
    ));
});

describe("parseNativeGoogleReportCsv — untrusted filterContext/property boundary", () => {
  const chart = "Date,Impressions\n2026-09-01,1\n";
  it("rejects a forged unobserved page filter (it would change chart aggregation)", () =>
    expect(
      parseNativeGoogleReportCsv(
        "chart",
        bytes(chart),
        meta({
          filterContext: {
            filters: { Page: "https://example.test/p" },
            marketScope: { country: "SWE", exposed: true },
          },
        }),
      ),
    ).rejects.toThrow(NativeGoogleCsvError));
  it("rejects a market scope that contradicts the country filter", () =>
    expect(
      parseNativeGoogleReportCsv(
        "chart",
        bytes(chart),
        meta({
          filterContext: {
            filters: { Country: "Sweden" },
            marketScope: { country: null, exposed: false },
          },
        }),
      ),
    ).rejects.toThrow(/Market scope/));
  it("rejects an unsupported Search type", () =>
    expect(
      parseNativeGoogleReportCsv(
        "chart",
        bytes(chart),
        meta({
          filterContext: {
            filters: { "Search type": "Image" },
            marketScope: { country: null, exposed: false },
          },
        }),
      ),
    ).rejects.toThrow(/search type/i));
  it("accepts a valid internally-consistent parsed context", async () => {
    const out = await parseNativeGoogleReportCsv("chart", bytes(chart), meta());
    expect(out.input.marketScope).toEqual({ country: "SWE", exposed: true });
  });
  it("rejects a declaredProperty that is not a valid Search Console property", () =>
    expect(
      parseNativeGoogleReportCsv(
        "pages",
        bytes("Top pages,Impressions\nhttps://other.test/p,7\n"),
        meta({ declaredProperty: "not-a-google-property" }),
      ),
    ).rejects.toThrow(/valid Search Console property/));
  it("enforces page membership for a valid sc-domain property", async () => {
    const out = await parseNativeGoogleReportCsv(
      "pages",
      bytes("Top pages,Impressions\nhttps://example.test/p,7\n"),
      meta({ declaredProperty: "sc-domain:example.test" }),
    );
    expect(out.input.rows[0].key).toBe("https://example.test/p");
    await expect(
      parseNativeGoogleReportCsv(
        "pages",
        bytes("Top pages,Impressions\nhttps://elsewhere.test/p,7\n"),
        meta({ declaredProperty: "sc-domain:example.test" }),
      ),
    ).rejects.toThrow(/outside the declared property/);
  });
  it("rejects a duplicate page row before withhold classification", async () => {
    // Two identical query/fragment rows would each withhold; the duplicate is rejected first.
    await expect(
      parseNativeGoogleReportCsv(
        "pages",
        bytes(
          "Top pages,Impressions\nhttps://example.test/p?lang=sv,4\nhttps://example.test/p?lang=sv,5\n",
        ),
        meta(),
      ),
    ).rejects.toThrow(/Duplicate/);
  });
  it("rejects a page with credentials or another protocol as invalid (not withheld)", async () => {
    await expect(
      parseNativeGoogleReportCsv(
        "pages",
        bytes("Top pages,Impressions\nhttps://user:pass@example.test/p,7\n"),
        meta(),
      ),
    ).rejects.toThrow(NativeGoogleCsvError);
    await expect(
      parseNativeGoogleReportCsv(
        "pages",
        bytes("Top pages,Impressions\nftp://example.test/p,7\n"),
        meta(),
      ),
    ).rejects.toThrow(NativeGoogleCsvError);
  });
});

describe("parseNativeGoogleReportCsv — preliminary completeness", () => {
  it("labels positive cells preliminary while a bare zero stays unknown_export_zero", async () => {
    const out = await parseNativeGoogleReportCsv(
      "chart",
      bytes("Date,Impressions\n2026-09-01,7\n2026-09-02,0\n"),
      meta({ completeness: "preliminary" }),
    );
    expect(out.input.rows[0].cells.impressions).toMatchObject({ status: "preliminary", value: 7 });
    expect(out.input.rows[1].cells.impressions).toMatchObject({
      status: "unknown_export_zero",
      value: null,
    });
  });
});
