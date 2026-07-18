export type BacklinkCompetitorSource = "project" | "competitor_analysis" | "none";

/** Keep the Backlinks UI and runner on the same competitor-source rules. */
export function resolveBacklinkCompetitors(
  projectUrls: string[] | undefined,
  competitorAnalysisUrls: string[] | undefined,
): { urls: string[]; source: BacklinkCompetitorSource } {
  const clean = (urls: string[] | undefined) =>
    Array.from(new Set((urls ?? []).map((url) => url.trim()).filter(Boolean)));
  const project = clean(projectUrls);
  if (project.length) return { urls: project, source: "project" };

  const analysis = clean(competitorAnalysisUrls);
  if (analysis.length) return { urls: analysis, source: "competitor_analysis" };
  return { urls: [], source: "none" };
}
