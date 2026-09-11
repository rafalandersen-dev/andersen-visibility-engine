import { inspectionUrl } from "./google-index";
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
}
function date(raw: unknown): string | null {
  const v = object(raw);
  if (![v.year, v.month, v.day].every(Number.isInteger)) return null;
  const value = `${String(v.year).padStart(4, "0")}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")}`;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value))
    ? value
    : null;
}
function rating(value: number | null, good: number, poor: number) {
  return value === null
    ? "unknown"
    : value <= good
      ? "good"
      : value <= poor
        ? "needs_improvement"
        : "poor";
}
const definitions = {
  lcp: { key: "largest_contentful_paint", unit: "ms", good: 2500, poor: 4000 },
  inp: { key: "interaction_to_next_paint", unit: "ms", good: 200, poor: 500 },
  cls: { key: "cumulative_layout_shift", unit: "unitless", good: 0.1, poor: 0.25 },
} as const;
export type PerformanceTarget = {
  url: string;
  scope: "url" | "origin";
  device: "PHONE" | "DESKTOP" | "TABLET" | "ALL";
  observedAt: string;
};
/** CrUX records are field evidence for a returned identity and collection window. */
export function normalizeCrux(raw: unknown, target: PerformanceTarget) {
  const requested = inspectionUrl(target.url);
  if (!requested || !timestamp(target.observedAt)) throw new Error("performance_target_invalid");
  const root = object(raw),
    record = object(root.record),
    key = object(record.key),
    metrics = object(record.metrics);
  const id = inspectionUrl(key[target.scope]);
  const expected = target.scope === "origin" ? new URL(requested).origin : requested;
  const matches =
    id !== null &&
    (target.scope === "origin" ? id === `${expected}/` : id === expected) &&
    key[target.scope === "url" ? "origin" : "url"] === undefined &&
    (target.device === "ALL" ? key.formFactor === undefined : key.formFactor === target.device);
  const values = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      const metric = object(metrics[definition.key]);
      const p75 = matches ? number(object(metric.percentiles).p75) : null;
      return [
        name,
        { p75, unit: definition.unit, rating: rating(p75, definition.good, definition.poor) },
      ];
    }),
  ) as Record<keyof typeof definitions, { p75: number | null; unit: string; rating: string }>;
  const period = object(record.collectionPeriod),
    first = date(period.firstDate),
    last = date(period.lastDate);
  const validPeriod =
    first !== null &&
    last !== null &&
    first <= last &&
    last <= new Date(target.observedAt).toISOString().slice(0, 10);
  const allKnown = Object.values(values).every((metric) => metric.p75 !== null);
  return {
    source: "crux" as const,
    evidenceKind: "field" as const,
    requestedUrl: requested,
    requestedScope: target.scope,
    device: target.device,
    observedAt: target.observedAt,
    returnedId: id,
    identityMatches: matches,
    availability: !Object.keys(record).length
      ? "unavailable"
      : !matches
        ? "identity_mismatch"
        : allKnown
          ? "complete"
          : "partial",
    collectionPeriod: validPeriod ? { firstDate: first, lastDate: last } : null,
    metrics: values,
    assessment:
      !matches || !allKnown || !validPeriod
        ? "unknown"
        : Object.values(values).every((metric) => metric.rating === "good")
          ? "good"
          : "not_good",
  };
}
/** Lighthouse metrics never substitute for field INP or a CrUX assessment. */
export function normalizeLighthouse(
  raw: unknown,
  target: { url: string; device: "mobile" | "desktop"; observedAt: string },
) {
  const requested = inspectionUrl(target.url);
  if (!requested || !timestamp(target.observedAt)) throw new Error("performance_target_invalid");
  const result = object(object(raw).lighthouseResult),
    config = object(result.configSettings),
    audits = object(result.audits);
  const returnedRequested = inspectionUrl(result.requestedUrl),
    finalUrl = inspectionUrl(result.finalUrl);
  const device = config.formFactor ?? config.emulatedFormFactor;
  const matches =
    returnedRequested === requested &&
    finalUrl !== null &&
    new URL(finalUrl).origin === new URL(requested).origin &&
    device === target.device;
  const failed = Object.keys(object(result.runtimeError)).length > 0;
  const value = (name: string, unit: string) => {
    const audit = object(audits[name]);
    return matches && !failed && audit.scoreDisplayMode !== "error" && audit.numericUnit === unit
      ? number(audit.numericValue)
      : null;
  };
  const score = number(object(object(result.categories).performance).score);
  return {
    source: "pagespeed_lighthouse" as const,
    evidenceKind: "lab" as const,
    requestedUrl: requested,
    returnedRequested,
    finalUrl,
    device: target.device,
    observedAt: target.observedAt,
    identityMatches: matches,
    runtimeFailed: failed,
    fetchTime: timestamp(result.fetchTime),
    performanceScore:
      matches && !failed && score !== null && score <= 1 ? Math.round(score * 100) : null,
    metrics: {
      lcpMs: value("largest-contentful-paint", "millisecond"),
      cls: value("cumulative-layout-shift", "unitless"),
      totalBlockingTimeMs: value("total-blocking-time", "millisecond"),
    },
  };
}
