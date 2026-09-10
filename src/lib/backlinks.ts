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

import type { BacklinkTargetSummary, BacklinkReferringDomain, BacklinkGapDomain } from "./types";

/** Shared deterministic evidence text; failed samples must not become absence claims. */
export function backlinkEvidencePrompt(
  own: BacklinkTargetSummary,
  competitorResults: BacklinkTargetSummary[],
  referringResult: BacklinkReferringDomain[] | null,
  gapResult: BacklinkGapDomain[] | null,
) {
  const ownDomain = own.target;
  const competitorDomains = competitorResults.map((c) => c.target);
  const referringStatus = referringResult === null ? ("failed" as const) : ("sample" as const);
  const gapStatus = !competitorDomains.length
    ? ("not_requested" as const)
    : gapResult === null
      ? ("failed" as const)
      : ("sample" as const);
  const fetchedCompetitors = competitorResults.filter(
    (c) => c.fetchStatus === "fetched" || c.fetchStatus === "partial",
  );
  const summaryLine = (s: BacklinkTargetSummary) =>
    `${s.target}: domain rank ${s.rank ?? "unavailable"}, backlinks ${s.backlinks ?? "unavailable"}, referring domains ${s.referringDomains ?? "unavailable"} (main: ${s.referringMainDomains ?? "unavailable"}), broken backlinks ${s.brokenBacklinks ?? "unavailable"}, spam score ${s.spamScore ?? "unavailable"}${s.firstSeen ? `, first link seen ${s.firstSeen}` : ""}`;

  const competitorBlock = competitorResults.length
    ? `COMPETITOR LINK PROFILES (from the same index):\n${competitorResults
        .map((c) =>
          c.fetchStatus === "fetched" || c.fetchStatus === "partial"
            ? `- ${summaryLine(c)}`
            : `- ${c.target}: data could not be fetched — ignore.`,
        )
        .join("\n")}\n`
    : "COMPETITOR LINK PROFILES: none provided (no competitor URLs on the project).\n";

  const gapBlock = gapResult?.length
    ? `LINK GAP SAMPLE — provider reports domains linking to competitors with requested exclusion of ${ownDomain} (top ${Math.min(gapResult.length, 20)} by overlap/rank):\n${gapResult
        .slice(0, 20)
        .map(
          (g) =>
            `- ${g.domain} (rank ${g.rank ?? "unavailable"}) links to: ${g.competitorsLinked.join(", ")}`,
        )
        .join("\n")}\n`
    : `LINK GAP: ${gapStatus === "failed" ? "request failed; unavailable" : gapStatus === "not_requested" ? "not requested; no competitors" : "zero rows returned in this filtered sample; not proof of no gap"}.\n`;

  const referringBlock = referringResult?.length
    ? `TOP REFERRING DOMAINS already linking to ${ownDomain}:\n${referringResult
        .slice(0, 15)
        .map(
          (r) =>
            `- ${r.domain} (rank ${r.rank ?? "unavailable"}, links ${r.backlinks ?? "unavailable"}, spam ${r.spamScore ?? "unavailable"})`,
        )
        .join("\n")}\n`
    : `TOP REFERRING DOMAINS: ${referringStatus === "failed" ? "request failed; unavailable" : "zero rows returned in this sample; not proof of no backlinks"}.\n`;

  return {
    referringStatus,
    gapStatus,
    fetchedCompetitors,
    ownBlock: summaryLine(own),
    competitorBlock,
    gapBlock,
    referringBlock,
  };
}
