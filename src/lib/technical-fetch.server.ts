import { TechnicalPolicyRefusedError } from "./technical-crawl-admission";
import type { CrawlConnectionAdmission } from "./technical-crawl-admission";
import type { TechnicalSitemapFetcher } from "./technical-sitemap";
import { fetchPinnedResource } from "./homepage-fetch.server";
import { evaluateRobots, robotsEvidence, type RobotsEvidence } from "./technical-robots";
import type { TechnicalPageFetcher } from "./technical-crawl";

/** Call only after durable owner authorization and lease admission. */
export async function fetchTechnicalRobots(
  origin: string,
  admit: CrawlConnectionAdmission,
): Promise<RobotsEvidence> {
  const response = await fetchPinnedResource(origin + "/robots.txt", {
    purpose: "robots",
    origin,
    admit,
  });
  if (!response) return robotsEvidence(null);
  if (response.status >= 200 && response.status < 300 && !response.contentAccepted)
    return { state: "unknown", reason: "content_type" };
  if (response.truncated) return { state: "unknown", reason: "oversize" };
  return robotsEvidence(response.status, response.body, response.headers["content-type"] ?? "");
}
export function technicalPageFetcher(
  origin: string,
  robots: RobotsEvidence,
  admit: CrawlConnectionAdmission,
): TechnicalPageFetcher {
  return async (url) => {
    try {
      const response = await fetchPinnedResource(url, {
        purpose: "technical",
        origin,
        admit,
        authorize: (target) =>
          evaluateRobots(robots, "MiloGrowthAuditBot", target).decision === "allowed",
      });
      return response ? { state: "response", ...response } : { state: "failed" };
    } catch (error) {
      if (error instanceof TechnicalPolicyRefusedError)
        return { state: "policy_refused", url: error.url };
      throw error;
    }
  };
}

export function technicalSitemapFetcher(
  origin: string,
  robots: RobotsEvidence,
  admit: CrawlConnectionAdmission,
): TechnicalSitemapFetcher {
  return (url) =>
    fetchPinnedResource(url, {
      purpose: "sitemap",
      origin,
      admit,
      authorize: (target) =>
        evaluateRobots(robots, "MiloGrowthAuditBot", target).decision === "allowed",
    });
}
