import { z } from "zod";
import { inspectionUrl } from "./google-index";
const text = z.string().max(8192).nullable();
const urls = z.object({ values: z.array(z.string().max(8192)).max(100), complete: z.boolean() });
const observation = z.object({
  source: z.literal("google_index"),
  inspectionMode: z.literal("indexed_version"),
  url: z.string(),
  property: z.string(),
  observedAt: z.string(),
  indexStatusAvailable: z.boolean(),
  verdict: text,
  coverageState: text,
  robotsTxtState: text,
  indexingState: text,
  pageFetchState: text,
  crawledAs: text,
  lastCrawlTime: text,
  googleCanonical: text,
  userCanonical: text,
  inspectionResultLink: text,
  sitemaps: urls,
  referringUrls: urls,
});
export function readGoogleIndexObservation(row: {
  url: string;
  property: string;
  observationJson: string | null;
}) {
  try {
    if (!row.observationJson || row.observationJson.length > 1500000) return null;
    const value = observation.parse(JSON.parse(row.observationJson));
    if (value.url !== row.url || value.property !== row.property) return null;
    if (
      value.inspectionResultLink &&
      (!inspectionUrl(value.inspectionResultLink) ||
        new URL(value.inspectionResultLink).origin !== "https://search.google.com")
    )
      value.inspectionResultLink = null;
    return value;
  } catch {
    return null;
  }
}
