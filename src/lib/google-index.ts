/** Google's indexed-version evidence. This is never a live indexability test. */
import { gscProperty } from "./gsc";
export function inspectionUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    /[\s\\]/.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  try {
    const url = new URL(value);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      !url.hostname.includes(".")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function inspectionInProperty(value: unknown, property: string): boolean {
  const page = inspectionUrl(value),
    site = gscProperty(property);
  if (!page || !site) return false;
  const url = new URL(page);
  if (site.startsWith("sc-domain:")) {
    const domain = site.slice(10);
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
  }
  return page.startsWith(site);
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function label(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}
function enumeration(value: unknown, allowed: string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}
function urls(value: unknown) {
  if (!Array.isArray(value)) return { values: [] as string[], complete: value === undefined };
  const values = value
    .slice(0, 100)
    .map(inspectionUrl)
    .filter((url): url is string => url !== null);
  return { values, complete: value.length <= 100 && values.length === value.length };
}
export function normalizeGoogleIndex(
  raw: unknown,
  context: { url: string; property: string; observedAt: string },
) {
  const url = inspectionUrl(context.url);
  if (
    !url ||
    !inspectionInProperty(url, context.property) ||
    !Number.isFinite(Date.parse(context.observedAt))
  )
    throw new Error("google_inspection_invalid");
  const result = record(record(raw).inspectionResult),
    index = record(result.indexStatusResult);
  const lastCrawlTime = label(index.lastCrawlTime, 64);
  const link = inspectionUrl(result.inspectionResultLink);
  return {
    source: "google_index" as const,
    inspectionMode: "indexed_version" as const,
    url,
    property: context.property,
    observedAt: context.observedAt,
    indexStatusAvailable: Object.keys(index).length > 0,
    verdict: enumeration(index.verdict, ["PASS", "PARTIAL", "FAIL", "NEUTRAL"]),
    coverageState: label(index.coverageState),
    robotsTxtState: enumeration(index.robotsTxtState, ["ALLOWED", "DISALLOWED"]),
    indexingState: enumeration(index.indexingState, [
      "INDEXING_ALLOWED",
      "BLOCKED_BY_META_TAG",
      "BLOCKED_BY_HTTP_HEADER",
      "BLOCKED_BY_ROBOTS_TXT",
    ]),
    pageFetchState: enumeration(index.pageFetchState, [
      "SUCCESSFUL",
      "SOFT_404",
      "BLOCKED_ROBOTS_TXT",
      "NOT_FOUND",
      "ACCESS_DENIED",
      "SERVER_ERROR",
      "REDIRECT_ERROR",
      "ACCESS_FORBIDDEN",
      "BLOCKED_4XX",
      "INTERNAL_CRAWL_ERROR",
      "INVALID_URL",
    ]),
    crawledAs: enumeration(index.crawledAs, ["DESKTOP", "MOBILE"]),
    lastCrawlTime:
      lastCrawlTime && Number.isFinite(Date.parse(lastCrawlTime)) ? lastCrawlTime : null,
    googleCanonical: inspectionUrl(index.googleCanonical),
    userCanonical: inspectionUrl(index.userCanonical),
    sitemaps: urls(index.sitemap),
    referringUrls: urls(index.referringUrls),
    inspectionResultLink:
      link && new URL(link).origin === "https://search.google.com" ? link : null,
  };
}
export type GoogleIndexObservation = ReturnType<typeof normalizeGoogleIndex>;
