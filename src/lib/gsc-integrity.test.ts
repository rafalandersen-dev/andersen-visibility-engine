import { describe, expect, it } from "vitest";
import {
  parseGscCsv,
  parseNumber,
  parseCtr,
  summarizeGscRows,
  gscImportSummary,
  matchGscToPublishedContent,
  gscPageInProperty,
  formatGscMetric,
  gscPageRecommendation,
  MAX_GSC_BYTES,
  retainGscApiImport,
} from "./gsc";
import type { ContentAsset, GscImport, GscRow } from "./types";
import { buildMonthlyProofReport } from "./proof-report";
import { gscIntegrity } from "@/i18n/gsc-integrity";
const context = { property: "sc-domain:example.com", start: "2026-08-01", end: "2026-08-28" };
const row: GscRow = {
  type: "page",
  page: "https://example.com/a",
  clicks: 0,
  impressions: 20,
  ctr: 0,
  position: 5,
};
const imp = (rows = [row]): GscImport => ({
  id: "i",
  importedAt: "2026-09-01T00:00:00Z",
  source: "manual_csv",
  integrityVersion: 2,
  importType: "pages",
  rows,
  selectedSiteUrl: context.property,
  dateRange: { start: context.start, end: context.end },
  summary: summarizeGscRows(rows),
});
const asset = (url: string) =>
  ({
    id: url,
    projectId: "p",
    title: "Article",
    liveUrl: url,
    livePublishStatus: "published",
  }) as ContentAsset;
describe("bounded local GSC intake", () => {
  it("keeps missing metrics distinct from explicit zero", () => {
    const r = parseGscCsv(
      "Page,Clicks,Impressions,CTR,Position\nhttps://example.com/a,0,20,,",
      "a.csv",
      context,
    );
    expect(r.rows[0]).toMatchObject({ clicks: 0, impressions: 20, ctr: null, position: null });
    expect(r.summary).toMatchObject({ totalClicks: 0, averageCtr: 0, averagePosition: null });
    expect(parseNumber("")).toBeNull();
    expect(formatGscMetric(null)).toBe("—");
    expect(formatGscMetric(0)).toBe("0");
  });
  it("accepts quoted delimiters, decimal commas and percentages without numeric stripping", () => {
    const r = parseGscCsv('Query;Clicks;Impressions;CTR;Position\n"hello; world";1;20;5%;8,2');
    expect(r.rows[0]).toMatchObject({ query: "hello; world", ctr: 5, position: 8.2 });
    expect(parseCtr("0.125")).toBe(12.5);
    for (const bad of ["-2", "1x2", "1e3", "NaN", "Infinity", "1,234,567", "2.3.4"])
      expect(() => parseNumber(bad)).toThrow();
  });
  it.each([
    "Page,Clicks,Clicks\nhttps://example.com/a,1,2",
    "Page,Query,Clicks\nhttps://example.com/a,term,1",
    "Page,Clicks\nhttps://example.com/a,1\nhttps://EXAMPLE.com/a,1",
    "Page,Clicks\nhttps://other.example/a,1",
    "Page,Clicks\n/a,1",
    "Page,Clicks\nhttps://example.com/a?token=value,1",
    'Page,Clicks\n"https://example.com/a,1',
    "Page,Clicks\nhttps://example.com/a,1,2",
    "Page,Clicks\nhttps://example.com/a,1.1",
    "Page,Clicks,Impressions\nhttps://example.com/a,3,2",
    "Date,Clicks\n2026-02-30,1",
    "Date,Clicks\n2026-09-01,1",
  ])("rejects ambiguous, malformed or out-of-scope CSV: %s", (text) =>
    expect(() => parseGscCsv(text, undefined, context)).toThrow(),
  );
  it("rejects size and row overflow without silently truncating", () => {
    expect(() => parseGscCsv("x".repeat(MAX_GSC_BYTES + 1))).toThrow();
    expect(() =>
      parseGscCsv("Query,Clicks\n" + Array.from({ length: 1001 }, (_, i) => `q${i},1`).join("\n")),
    ).toThrow();
    expect(() => parseGscCsv("Query,Clicks\n" + "x".repeat(4001) + ",1")).toThrow();
  });
});
describe("measurement boundaries", () => {
  it("refreshes a full API window while preserving retained evidence unchanged", () => {
    const existing = Array.from({ length: 5 }, (_, i) => ({ ...imp(), id: `old-${i}` }));
    const before = JSON.stringify(existing);
    const fresh = { ...imp(), source: "api" as const, id: "fresh" };
    const kept = retainGscApiImport(existing, fresh);
    expect(kept.map((i) => i.id)).toEqual(["fresh", "old-0", "old-1", "old-2", "old-3"]);
    expect(kept[1]).toBe(existing[0]);
    expect(JSON.stringify(existing)).toBe(before);
  });
  it("never adds overlapping dimensions or duplicate rows", () => {
    expect(
      summarizeGscRows([row, { ...row, type: "query", page: undefined, query: "q" }])
        .totalImpressions,
    ).toBeNull();
    expect(summarizeGscRows([row, row]).totalImpressions).toBeNull();
    expect(summarizeGscRows([{ ...row, query: "q" }]).totalClicks).toBeNull();
  });
  it("keeps API aggregate separate and never falls back to row sums", () => {
    const r = { ...imp(), source: "api" as const };
    expect(gscImportSummary(r).totalImpressions).toBeNull();
    r.aggregate = { clicks: 2, impressions: 300, ctr: 2 / 3, position: 3 };
    expect(gscImportSummary(r).totalImpressions).toBe(300);
  });
  it("preserves unknown positions and zero-impression denominator", () => {
    expect(summarizeGscRows([{ ...row, position: null }]).averagePosition).toBeNull();
    expect(summarizeGscRows([{ ...row, impressions: 0 }]).averageCtr).toBeNull();
    expect(summarizeGscRows([{ ...row, clicks: null }]).totalClicks).toBeNull();
  });
  it("requires complete URL identity and unambiguous page-only rows", () => {
    const assets = [
      "https://example.com/a",
      "https://other.example/a",
      "https://www.example.com/a",
      "http://example.com/a",
      "https://example.com/a/",
      "https://example.com/A",
    ].map(asset);
    const matches = matchGscToPublishedContent(assets, imp());
    expect(
      matchGscToPublishedContent(assets, { ...imp(), selectedSiteUrl: undefined }).every(
        (m) => !m.hasGscData,
      ),
    ).toBe(true);
    expect(matches.filter((m) => m.hasGscData).map((m) => m.liveUrl)).toEqual([
      "https://example.com/a",
    ]);
    expect(matchGscToPublishedContent(assets, imp([row, row])).every((m) => !m.hasGscData)).toBe(
      true,
    );
    expect(
      matchGscToPublishedContent(assets, imp([{ ...row, query: "q" }])).every((m) => !m.hasGscData),
    ).toBe(true);
  });
  it("uses hostname boundaries for domain properties and exact URL prefixes", () => {
    expect(gscPageInProperty("https://shop.example.com/a", context.property)).toBe(true);
    expect(gscPageInProperty("https://example.com.evil.test/a", context.property)).toBe(false);
    expect(gscPageInProperty("https://badexample.com/a", context.property)).toBe(false);
    expect(gscPageInProperty("https://example.com/b", "https://example.com/a/")).toBe(false);
  });
  it("does not promote legacy synthesized values or mutate historical records", () => {
    const legacy = { ...imp(), integrityVersion: undefined };
    const before = JSON.stringify(legacy);
    expect(gscImportSummary(legacy).totalClicks).toBeNull();
    expect(matchGscToPublishedContent([asset(row.page!)], legacy)[0].hasGscData).toBe(false);
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("does not recommend CTR edits based on unknown metrics", () => {
    const match = matchGscToPublishedContent(
      [asset(row.page!)],
      imp([{ ...row, clicks: null, ctr: null, position: null }]),
    )[0];
    expect(gscPageRecommendation(match)).toBe("keepMonitoring");
  });
  it("proof report recomputes the selected table and preserves its own window", () => {
    const r = imp();
    r.summary.totalClicks = 999;
    const proof = buildMonthlyProofReport({
      project: { id: "p", gscLite: { imports: [r] } },
      content: [],
      calendar: [],
      monthKey: "2026-09",
      linksLive: 0,
    });
    expect(proof.gsc).toMatchObject({
      totalClicks: 0,
      basis: "rows",
      windowStart: "2026-08-01",
      windowEnd: "2026-08-28",
    });
    expect(r.summary.totalClicks).toBe(999);
  });
  it("provides every integrity label in all four locales", () => {
    for (const lang of ["pl", "sv", "da"] as const)
      expect(Object.keys(gscIntegrity[lang]).sort()).toEqual(Object.keys(gscIntegrity.en).sort());
  });
});
