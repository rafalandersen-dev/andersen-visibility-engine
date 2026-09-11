import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import type { Opportunity } from "@/lib/types";
import { readTechnicalFindingFn } from "@/lib/technical-findings.functions";
import { technicalFindingCodes } from "@/lib/technical-findings";
const snapshot = z.object({
  code: z.enum(technicalFindingCodes),
  runId: z.string().uuid(),
  runRevision: z.number(),
  page: z.object({
    requestedUrl: z.string(),
    observation: z.object({
      url: z.string(),
      status: z.number(),
      observedAt: z.string(),
      title: z.string(),
      complete: z.boolean(),
      descriptions: z.array(z.string()),
      headings: z.array(z.string()),
      canonicals: z.array(z.string()),
      robots: z.array(z.object({ source: z.string(), agent: z.string(), value: z.string() })),
      structuredData: z.array(
        z.object({ state: z.string(), types: z.array(z.string()), complete: z.boolean() }),
      ),
    }),
  }),
  coverageLimits: z.array(z.string()),
  sitemapLimitations: z.array(z.string()).nullish(),
});
export function TechnicalEvidencePanel({ opportunity }: { opportunity: Opportunity }) {
  const { user } = useAuth();
  return user && opportunity.technicalEvidence ? (
    <Evidence
      key={`${user.id}:${opportunity.id}:${opportunity.technicalEvidence.id}`}
      userId={user.id}
      opportunity={opportunity}
    />
  ) : null;
}
function Evidence({ userId, opportunity }: { userId: string; opportunity: Opportunity }) {
  const t = useT();
  const reference = opportunity.technicalEvidence!;
  const query = useQuery({
    queryKey: ["technical-evidence", userId, opportunity.projectId, reference.id],
    queryFn: () =>
      readTechnicalFindingFn({
        data: { projectId: opportunity.projectId, evidenceId: reference.id },
      }),
    retry: false,
  });
  let evidence: z.infer<typeof snapshot> | null = null;
  try {
    if (
      query.data &&
      query.data.opportunityId === opportunity.id &&
      query.data.hash === reference.hash
    )
      evidence = snapshot.parse(JSON.parse(query.data.snapshotJson));
  } catch {
    /* A missing or mismatched receipt is never presented as verified evidence. */
  }
  return (
    <details className="mt-4 rounded border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("crawl.savedEvidence")}</summary>
      {query.isPending ? (
        <p>{t("crawl.evidenceLoading")}</p>
      ) : !evidence || query.isError ? (
        <p role="alert">{t("crawl.evidenceUnavailable")}</p>
      ) : (
        <div className="mt-2 space-y-2 break-words text-sm">
          <p>{t(`crawl.finding_${evidence.code}`)}</p>
          <p>
            {t("crawl.finalUrl")}: {evidence.page.observation.url}
          </p>
          <p>HTTP {evidence.page.observation.status}</p>
          <p>
            {t("crawl.observedAt")}: {evidence.page.observation.observedAt}
          </p>
          <p>
            {t("crawl.pageTitle")}: {evidence.page.observation.title || t("crawl.notFound")}
          </p>
          <p>
            {t("crawl.description")}:{" "}
            {evidence.page.observation.descriptions.join(" | ") || t("crawl.notFound")}
          </p>
          <p>H1: {evidence.page.observation.headings.join(" | ") || t("crawl.notFound")}</p>
          <p>
            {t("crawl.canonical")}:{" "}
            {evidence.page.observation.canonicals.join(" | ") || t("crawl.notFound")}
          </p>
          <p>
            {t("crawl.directives")}:{" "}
            {evidence.page.observation.robots
              .map((r) => `${r.source}/${r.agent}: ${r.value}`)
              .join(" | ") || t("crawl.notFound")}
          </p>
          <p>
            {t("crawl.structured")}:{" "}
            {evidence.page.observation.structuredData
              .map((d) => `${t(`crawl.${d.state}`)}: ${d.types.join(", ")}`)
              .join(" | ") || t("crawl.notFound")}
          </p>
          {!evidence.page.observation.complete && <p>{t("crawl.partial_page")}</p>}
          <ul className="list-disc pl-5">
            {evidence.coverageLimits.map((limit) => (
              <li key={limit}>{t(`crawl.${limit}`)}</li>
            ))}
          </ul>
          <ul className="list-disc pl-5">
            {evidence.sitemapLimitations?.map((limit) => (
              <li key={limit}>{t(`crawl.sitemap_${limit}`)}</li>
            ))}
          </ul>
          <p>{t("crawl.savedEvidenceHelp")}</p>
        </div>
      )}
    </details>
  );
}
