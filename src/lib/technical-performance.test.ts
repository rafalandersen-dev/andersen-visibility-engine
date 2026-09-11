import { readPerformanceObservation } from "./technical-performance-view";
import { describe, it, expect } from "vitest";
import { normalizeCrux, normalizeLighthouse } from "./technical-performance";
const target = {
  url: "https://example.test/page?q=1",
  scope: "url" as const,
  device: "PHONE" as const,
  observedAt: "2026-09-11T10:00:00Z",
};
function crux() {
  return {
    record: {
      key: { url: target.url, formFactor: "PHONE" },
      metrics: {
        largest_contentful_paint: { percentiles: { p75: 2500 } },
        interaction_to_next_paint: { percentiles: { p75: 200 } },
        cumulative_layout_shift: { percentiles: { p75: "0.10" } },
      },
      collectionPeriod: {
        firstDate: { year: 2026, month: 8, day: 10 },
        lastDate: { year: 2026, month: 9, day: 6 },
      },
    },
  };
}
describe("scoped field and lab performance evidence", () => {
  it("retains p75 units, field window and good threshold boundaries", () => {
    const result = normalizeCrux(crux(), target);
    expect(result.assessment).toBe("good");
    expect(result.metrics.cls).toMatchObject({ p75: 0.1, unit: "unitless" });
    expect(result.metrics.inp).toMatchObject({ p75: 200, unit: "ms" });
    expect(result.collectionPeriod).toEqual({ firstDate: "2026-08-10", lastDate: "2026-09-06" });
  });
  it("keeps absent measurements unknown instead of zero or a good assessment", () => {
    expect(normalizeCrux({}, target)).toMatchObject({
      availability: "unavailable",
      assessment: "unknown",
      metrics: { lcp: { p75: null } },
    });
    const data = crux();
    delete (data.record.metrics as Partial<typeof data.record.metrics>).interaction_to_next_paint;
    expect(normalizeCrux(data, target)).toMatchObject({
      availability: "partial",
      assessment: "unknown",
    });
  });
  it.each(["origin", "query", "device"])(
    "does not relabel mismatched field evidence: %s",
    (kind) => {
      const data = crux();
      if (kind === "origin")
        Object.assign(data.record.key, { url: undefined, origin: "https://example.test" });
      if (kind === "query") data.record.key.url = "https://example.test/page?q=2";
      if (kind === "device") data.record.key.formFactor = "DESKTOP";
      expect(normalizeCrux(data, target)).toMatchObject({
        identityMatches: false,
        assessment: "unknown",
        metrics: { lcp: { p75: null } },
      });
    },
  );
  it("keeps origin-wide evidence explicitly scoped to origin", () => {
    const data = crux();
    Object.assign(data.record.key, { url: undefined, origin: "https://example.test" });
    expect(normalizeCrux(data, { ...target, scope: "origin" })).toMatchObject({
      identityMatches: true,
      requestedScope: "origin",
      returnedId: "https://example.test/",
    });
  });
  it("requires a valid collection period for an overall field assessment", () => {
    const data = crux();
    data.record.collectionPeriod.firstDate = { year: 2026, month: 2, day: 31 };
    expect(normalizeCrux(data, target)).toMatchObject({
      assessment: "unknown",
      collectionPeriod: null,
    });
  });
  it("rejects nonnumeric metrics while preserving genuine zero", () => {
    const data = crux();
    data.record.metrics.cumulative_layout_shift.percentiles.p75 = "";
    data.record.metrics.largest_contentful_paint.percentiles.p75 = -1;
    data.record.metrics.interaction_to_next_paint.percentiles.p75 = 0;
    expect(normalizeCrux(data, target).metrics).toMatchObject({
      cls: { p75: null },
      lcp: { p75: null },
      inp: { p75: 0 },
    });
  });
  it("does not assess a future collection window as current evidence", () => {
    const data = crux();
    data.record.collectionPeriod.lastDate = { year: 2027, month: 1, day: 1 };
    expect(normalizeCrux(data, target).assessment).toBe("unknown");
  });
  it.each([
    [500, "needs_improvement"],
    [501, "poor"],
  ])("classifies field INP boundary %s", (p75, expected) => {
    const data = crux();
    data.record.metrics.interaction_to_next_paint.percentiles.p75 = p75 as number;
    const result = normalizeCrux(data, target);
    expect(result.metrics.inp.rating).toBe(expected);
    expect(result.assessment).toBe("not_good");
  });
  it("keeps lab TBT separate from field INP and retains final redirect identity", () => {
    const data = {
      lighthouseResult: {
        requestedUrl: target.url,
        finalUrl: "https://example.test/final",
        configSettings: { formFactor: "mobile" },
        categories: { performance: { score: 0.93 } },
        audits: {
          "total-blocking-time": { numericValue: 80, numericUnit: "millisecond" },
          "cumulative-layout-shift": { numericValue: 0, numericUnit: "unitless" },
        },
      },
    };
    const result = normalizeLighthouse(data, { ...target, device: "mobile" });
    expect(result).toMatchObject({
      evidenceKind: "lab",
      performanceScore: 93,
      finalUrl: "https://example.test/final",
      metrics: { totalBlockingTimeMs: 80, cls: 0, lcpMs: null },
    });
    expect(result.metrics).not.toHaveProperty("inp");
    Object.assign(data.lighthouseResult, { runtimeError: { code: "FAILED_DOCUMENT_REQUEST" } });
    expect(normalizeLighthouse(data, { ...target, device: "mobile" }).performanceScore).toBeNull();
  });
});

it("does not attribute cross-origin Lighthouse redirects to the requested project", () => {
  const result = normalizeLighthouse(
    {
      lighthouseResult: {
        requestedUrl: "https://example.test/",
        finalUrl: "https://other.test/",
        configSettings: { formFactor: "mobile" },
        categories: { performance: { score: 0.99 } },
        audits: { "largest-contentful-paint": { numericValue: 100, numericUnit: "millisecond" } },
      },
    },
    { url: "https://example.test/", device: "mobile", observedAt: "2026-09-11T00:00:00Z" },
  );
  expect(result.identityMatches).toBe(false);
  expect(result.finalUrl).toBe("https://other.test/");
  expect(result.performanceScore).toBeNull();
  expect(result.metrics).toEqual({ lcpMs: null, cls: null, totalBlockingTimeMs: null });
});

it("suppresses legacy saved cross-origin Lighthouse scores during projection", () => {
  const url = "https://example.test/";
  const result = normalizeLighthouse(
    {
      lighthouseResult: {
        requestedUrl: url,
        finalUrl: "https://other.test/",
        configSettings: { formFactor: "mobile" },
      },
    },
    { url, device: "mobile", observedAt: "2026-09-11T00:00:00Z" },
  );
  const view = readPerformanceObservation({
    url,
    source: "pagespeed",
    scope: "url",
    device: "mobile",
    observationJson: JSON.stringify({
      ...result,
      identityMatches: true,
      performanceScore: 99,
      metrics: { lcpMs: 100, cls: 0, totalBlockingTimeMs: 0 },
    }),
  });
  expect(view).toMatchObject({
    identityMatches: false,
    performanceScore: null,
    metrics: { lcpMs: null, cls: null, totalBlockingTimeMs: null },
  });
});
