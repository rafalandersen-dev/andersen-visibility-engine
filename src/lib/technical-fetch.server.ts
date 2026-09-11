import { fetchPinnedResource } from "./homepage-fetch.server";
import { evaluateRobots, robotsEvidence, type RobotsEvidence } from "./technical-robots";
import type { TechnicalPageFetcher } from "./technical-crawl";

/** Call only after durable owner authorization and lease admission. */
export async function fetchTechnicalRobots(origin: string): Promise<RobotsEvidence> {
  const response = await fetchPinnedResource(origin + "/robots.txt", { purpose: "robots", origin });
  if (!response) return robotsEvidence(null);
  if (response.truncated) return { state: "unknown", reason: "oversize" };
  return robotsEvidence(response.status, response.body, response.headers["content-type"] ?? "");
}
export function technicalPageFetcher(origin: string, robots: RobotsEvidence): TechnicalPageFetcher {
  return async (url) => {
    const response = await fetchPinnedResource(url, {
      purpose: "technical",
      origin,
      authorize: (target) =>
        evaluateRobots(robots, "MiloGrowthAuditBot", target).decision === "allowed",
    });
    return response ? { state: "response", ...response } : { state: "failed" };
  };
}
