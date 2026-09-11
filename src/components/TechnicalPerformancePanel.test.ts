import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { technicalPerformanceCopy } from "@/i18n/technical-performance";
import { normalizeCrux, normalizeLighthouse } from "@/lib/technical-performance";
import {
  performancePageInWebsite,
  readPerformanceObservation,
} from "@/lib/technical-performance-view";
import type { Project } from "@/lib/types";
const state = vi.hoisted(() => ({
  requests: [] as unknown[],
  configured: { crux: false, pagespeed: false },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => technicalPerformanceCopy.en[key] ?? key }));
vi.mock("@/lib/store", () => ({ saveWorkspaceNow: vi.fn() }));
vi.mock("@/lib/technical-performance.functions", () => ({
  listTechnicalPerformanceFn: vi.fn(),
  requestTechnicalPerformanceFn: vi.fn(),
}));
import { TechnicalPerformancePanel } from "./TechnicalPerformancePanel";
const url = "https://example.test/page?q=1",
  observedAt = "2026-09-11T10:00:00Z";
const project = { id: "p", websiteUrl: "https://example.test" } as Project;
function fieldRow() {
  const evidence = normalizeCrux(
    {
      record: {
        key: { url, formFactor: "PHONE" },
        metrics: {
          largest_contentful_paint: { percentiles: { p75: 0 } },
          interaction_to_next_paint: { percentiles: { p75: 0 } },
          cumulative_layout_shift: { percentiles: { p75: "0.00" } },
        },
        collectionPeriod: {},
      },
    },
    { url, scope: "url", device: "PHONE", observedAt },
  );
  return {
    requestId: "r",
    url,
    source: "crux",
    scope: "url",
    device: "PHONE",
    status: "succeeded",
    error: null,
    createdAt: observedAt,
    observationJson: JSON.stringify(evidence),
  };
}
describe("performance evidence customer view", () => {
  it("provides every interface label in all four current languages", () => {
    const keys = Object.keys(technicalPerformanceCopy.en).sort();
    for (const locale of ["pl", "sv", "da"]) {
      expect(Object.keys(technicalPerformanceCopy[locale]).sort()).toEqual(keys);
      expect(
        Object.values(technicalPerformanceCopy[locale]).every((value) => value.length > 0),
      ).toBe(true);
    }
  });
  it("retains genuine zero values but does not approve missing collection evidence", () => {
    const result = readPerformanceObservation(fieldRow());
    expect(result).toMatchObject({
      source: "crux",
      metrics: { lcp: { p75: 0 }, inp: { p75: 0 }, cls: { p75: 0 } },
      assessment: "unknown",
      collectionPeriod: null,
    });
  });
  it("refuses mixed URL, device, source and scope identities", () => {
    const row = fieldRow();
    for (const patch of [
      { url: "https://example.test/other" },
      { device: "DESKTOP" },
      { source: "pagespeed" },
      { scope: "origin" },
    ])
      expect(readPerformanceObservation({ ...row, ...patch })).toBeNull();
  });
  it("keeps page selection on the exact saved origin", () => {
    expect(performancePageInWebsite(url, "example.test")).toBe(true);
    expect(performancePageInWebsite(url, "https://example.test/home#intro")).toBe(true);
    expect(performancePageInWebsite("https://example.test.evil.test/", "example.test")).toBe(false);
    expect(performancePageInWebsite("https://example.test:8443/", "example.test")).toBe(false);
    expect(performancePageInWebsite("https://user:pass@example.test/", "example.test")).toBe(false);
  });
  it("preserves saved field results when new measurements are not configured", () => {
    state.requests = [fieldRow()];
    const html = renderToStaticMarkup(createElement(TechnicalPerformancePanel, { project }));
    expect(html).toContain(technicalPerformanceCopy.en["perf.configuration"]);
    expect(html).toContain("LCP (p75, ms)");
    expect(html).toContain("INP (p75, ms)");
    expect(html).toContain(technicalPerformanceCopy.en["perf.unknownValue"]);
    expect(html).toContain(technicalPerformanceCopy.en["perf.historyHelp"]);
    expect(html).not.toContain("GOOGLE_CRUX_API_KEY");
  });
  it("labels lab blocking time separately and does not display it as INP", () => {
    const evidence = normalizeLighthouse(
      {
        lighthouseResult: {
          requestedUrl: url,
          finalUrl: url,
          configSettings: { formFactor: "mobile" },
          audits: { "total-blocking-time": { numericValue: 450, numericUnit: "millisecond" } },
        },
      },
      { url, device: "mobile", observedAt },
    );
    state.requests = [
      {
        ...fieldRow(),
        source: "pagespeed",
        device: "mobile",
        observationJson: JSON.stringify(evidence),
      },
    ];
    const html = renderToStaticMarkup(createElement(TechnicalPerformancePanel, { project }));
    expect(html).toContain(technicalPerformanceCopy.en["perf.tbt"]);
    expect(html).toContain("450");
    expect(html).not.toContain("INP (p75");
  });
  it("suppresses metrics from failed lab runs even if a malformed saved record contains numbers", () => {
    const evidence = normalizeLighthouse(
      {
        lighthouseResult: {
          requestedUrl: url,
          finalUrl: url,
          configSettings: { formFactor: "mobile" },
        },
      },
      { url, device: "mobile", observedAt },
    );
    const row = {
      ...fieldRow(),
      source: "pagespeed",
      device: "mobile",
      observationJson: JSON.stringify({
        ...evidence,
        runtimeFailed: true,
        performanceScore: 100,
        metrics: { lcpMs: 0, cls: 0, totalBlockingTimeMs: 0 },
      }),
    };
    expect(readPerformanceObservation(row)).toMatchObject({
      performanceScore: null,
      metrics: { lcpMs: null, cls: null, totalBlockingTimeMs: null },
    });
  });
});
