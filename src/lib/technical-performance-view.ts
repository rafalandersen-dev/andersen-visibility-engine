import { z } from "zod";
import { inspectionUrl } from "./google-index";
const measurement = z.number().finite().nonnegative().nullable();
const stamp = z
  .string()
  .max(64)
  .refine((s) => Number.isFinite(Date.parse(s)));
const metric = z.object({
  p75: measurement,
  unit: z.enum(["ms", "unitless"]),
  rating: z.enum(["unknown", "good", "needs_improvement", "poor"]),
});
const common = {
  requestedUrl: z.string().max(8192),
  observedAt: stamp,
  identityMatches: z.boolean(),
};
const field = z.object({
  ...common,
  source: z.literal("crux"),
  evidenceKind: z.literal("field"),
  requestedScope: z.enum(["url", "origin"]),
  device: z.enum(["PHONE", "DESKTOP", "TABLET", "ALL"]),
  returnedId: z.string().max(8192).nullable(),
  availability: z.enum(["unavailable", "identity_mismatch", "complete", "partial"]),
  collectionPeriod: z.object({ firstDate: z.string(), lastDate: z.string() }).nullable(),
  metrics: z.object({ lcp: metric, inp: metric, cls: metric }),
  assessment: z.enum(["unknown", "good", "not_good"]),
});
const lab = z.object({
  ...common,
  source: z.literal("pagespeed_lighthouse"),
  evidenceKind: z.literal("lab"),
  device: z.enum(["mobile", "desktop"]),
  returnedRequested: z.string().max(8192).nullable(),
  finalUrl: z.string().max(8192).nullable(),
  runtimeFailed: z.boolean(),
  fetchTime: stamp.nullable(),
  performanceScore: z.number().finite().min(0).max(100).nullable(),
  metrics: z.object({ lcpMs: measurement, cls: measurement, totalBlockingTimeMs: measurement }),
});
export function performancePageInWebsite(url: string, website: string) {
  try {
    const page = inspectionUrl(url),
      value = website.trim();
    const site = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return Boolean(
      page &&
      /^https?:$/.test(site.protocol) &&
      !site.username &&
      !site.password &&
      new URL(page).origin === site.origin,
    );
  } catch {
    return false;
  }
}
export function readPerformanceObservation(row: {
  url: string;
  source: string;
  scope: string;
  device: string;
  observationJson: string | null;
}) {
  try {
    if (!row.observationJson || row.observationJson.length > 32000) return null;
    const value = z
      .discriminatedUnion("source", [field, lab])
      .parse(JSON.parse(row.observationJson));
    if (
      value.requestedUrl !== row.url ||
      !inspectionUrl(row.url) ||
      value.device !== row.device ||
      (row.source === "crux"
        ? value.source !== "crux"
        : row.source !== "pagespeed" || value.source !== "pagespeed_lighthouse")
    )
      return null;
    if (value.source === "crux") {
      if (
        value.requestedScope !== row.scope ||
        value.metrics.lcp.unit !== "ms" ||
        value.metrics.inp.unit !== "ms" ||
        value.metrics.cls.unit !== "unitless"
      )
        return null;
      if (!value.identityMatches) {
        for (const metric of Object.values(value.metrics)) {
          metric.p75 = null;
          metric.rating = "unknown";
        }
        value.assessment = "unknown";
      }
      const period = value.collectionPeriod;
      if (
        !period ||
        !/^\d{4}-\d{2}-\d{2}$/.test(period.firstDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(period.lastDate) ||
        !Number.isFinite(Date.parse(period.firstDate)) ||
        !Number.isFinite(Date.parse(period.lastDate)) ||
        period.firstDate > period.lastDate ||
        period.lastDate > new Date(value.observedAt).toISOString().slice(0, 10)
      ) {
        value.collectionPeriod = null;
        value.assessment = "unknown";
      }
      if (Object.values(value.metrics).some((metric) => metric.p75 === null))
        value.assessment = "unknown";
    } else {
      if (row.scope !== "url") return null;
      if (!value.identityMatches || value.runtimeFailed) {
        value.performanceScore = null;
        value.metrics = { lcpMs: null, cls: null, totalBlockingTimeMs: null };
      }
    }
    return value;
  } catch {
    return null;
  }
}
