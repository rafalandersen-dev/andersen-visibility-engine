import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { resolveBacklinkCompetitors } from "@/lib/backlinks";
import {
  getBacklinksStatus,
  runBacklinkAnalysis,
  createOpportunityFromBacklinkRecommendation,
  createOpportunitiesFromTopBacklinkActions,
} from "@/lib/mock-ai";
import type {
  BacklinkAnalysisResult,
  BacklinkRecommendation,
  BacklinkRecommendationCategory,
  BacklinkProviderStatus,
  BacklinkTargetSummary,
} from "@/lib/types";
import {
  Link2,
  Loader2,
  RefreshCw,
  Plus,
  Check,
  PlugZap,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/types";
import {
  getLinkListingFn,
  upsertLinkListingFn,
  findLinkMatchesFn,
  updateLinkMatchStatusFn,
  verifyLinkPlacementFn,
  type LinkListingView,
  type LinkMatchView,
} from "@/lib/link-network.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/backlinks")({
  head: () => ({
    meta: [
      { title: "Backlinks — Milo Growth" },
      {
        name: "description",
        content:
          "Real backlink profile, competitor link gap and safe link-building recommendations.",
      },
    ],
  }),
  component: BacklinksPage,
});

const CATEGORY_KEY: Record<BacklinkRecommendationCategory, string> = {
  "Link Gap Targets": "backlinks.category.linkGapTargets",
  "Content for Links": "backlinks.category.contentForLinks",
  "Digital PR": "backlinks.category.digitalPr",
  "Partnerships & Sponsorships": "backlinks.category.partnerships",
  "Directories & Profiles": "backlinks.category.directories",
  "Link Hygiene": "backlinks.category.linkHygiene",
};

function BacklinksPage() {
  const navigate = useNavigate();
  const t = useT();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const analysis = useStore((s) =>
    s.backlinkAnalyses.find((a) => a.projectId === s.activeProjectId),
  );
  const competitorAnalysis = useStore((s) =>
    s.competitorAnalyses.find((a) => a.projectId === s.activeProjectId),
  );

  const [providerStatus, setProviderStatus] = useState<BacklinkProviderStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [running, setRunning] = useState(false);
  const [convertingTop, setConvertingTop] = useState(false);

  const refreshProviderStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      setProviderStatus(await getBacklinksStatus());
    } catch {
      setProviderStatus({ configured: true, state: "error" });
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getBacklinksStatus()
      .then((s) => {
        if (!cancelled) setProviderStatus(s);
      })
      .catch(() => {
        if (!cancelled) setProviderStatus({ configured: true, state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const competitorContext = useMemo(
    () => resolveBacklinkCompetitors(project?.competitorUrls, competitorAnalysis?.competitorUrls),
    [project?.competitorUrls, competitorAnalysis?.competitorUrls],
  );
  const competitorList = competitorContext.urls;
  const usesCompetitorFallback = competitorContext.source === "competitor_analysis";
  const analyzedCompetitors = useMemo(
    () => (analysis?.competitors ?? []).map((competitor) => competitor.target).filter(Boolean),
    [analysis],
  );
  const configured = providerStatus?.configured ?? null;
  const providerBlocksRun =
    providerStatus?.state === "paused" ||
    (providerStatus?.state === "low_balance" && providerStatus.balanceUsd === 0);

  async function run() {
    if (!activeProjectId) return;
    setRunning(true);
    try {
      await runBacklinkAnalysis(activeProjectId);
      toast.success(t("backlinks.toast.done"));
      void refreshProviderStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  async function convertTop() {
    if (!activeProjectId) return;
    setConvertingTop(true);
    try {
      const opps = await createOpportunitiesFromTopBacklinkActions(activeProjectId);
      toast.success(t("backlinks.toast.convertedTop", { count: opps.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunities");
    } finally {
      setConvertingTop(false);
    }
  }

  if (!project) {
    return (
      <AppShell title={t("backlinks.title")} description={t("backlinks.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Link2 className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("analytics.setupFirst")}</div>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>
            {t("nav.setup")}
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("backlinks.title")}
      description={t("backlinks.subtitle")}
      actions={
        configured ? (
          <Button onClick={run} disabled={running || providerBlocksRun}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {running
              ? t("backlinks.running")
              : analysis
                ? t("backlinks.rerun")
                : t("backlinks.run")}
          </Button>
        ) : null
      }
    >
      <p className="text-xs text-muted-foreground max-w-3xl mb-5">{t("backlinks.disclaimer")}</p>

      {configured && providerStatus ? (
        <ProviderStatusPanel
          status={providerStatus}
          checking={checkingStatus}
          refresh={refreshProviderStatus}
          t={t}
        />
      ) : null}

      {configured === false ? (
        <div className="rounded-lg border-2 border-amber-500/30 bg-card p-6 max-w-2xl">
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-amber-500" />
            <h2 className="font-display text-lg">{t("backlinks.notConfigured.title")}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("backlinks.notConfigured.body")}</p>
        </div>
      ) : configured === null ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />…
        </div>
      ) : !analysis ? (
        <>
          <CompetitorContextNote
            competitors={competitorList}
            fromCompetitorAnalysis={usesCompetitorFallback}
            t={t}
          />
          <div className="mt-6 rounded-lg border border-dashed border-border p-12 text-center">
            <Link2 className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
            <div className="mt-3 font-display text-lg">{t("backlinks.run")}</div>
            <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
              {t("backlinks.empty")}
            </p>
          </div>
        </>
      ) : (
        <AnalysisView
          analysis={analysis}
          projectId={activeProjectId}
          competitors={analyzedCompetitors}
          convertTop={convertTop}
          convertingTop={convertingTop}
          t={t}
        />
      )}
      {project ? <LinkNetworkSection key={project.id} project={project} t={t} /> : null}
    </AppShell>
  );
}

type Translate = (k: string, v?: Record<string, string | number>) => string;

function ProviderStatusPanel({
  status,
  checking,
  refresh,
  t,
}: {
  status: BacklinkProviderStatus;
  checking: boolean;
  refresh: () => Promise<void>;
  t: Translate;
}) {
  const statusKey =
    status.state === "ready"
      ? "ready"
      : status.state === "low_balance"
        ? "lowBalance"
        : status.state;
  const healthy = status.state === "ready";
  const caution = status.state === "low_balance";
  const Icon = healthy ? CircleCheck : TriangleAlert;

  return (
    <div
      className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        healthy
          ? "border-emerald-500/25 bg-emerald-500/5"
          : caution
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-destructive/30 bg-destructive/5"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            healthy ? "text-emerald-600" : caution ? "text-amber-600" : "text-destructive"
          }`}
        />
        <div>
          <div className="text-sm font-medium">{t(`backlinks.status.${statusKey}.title`)}</div>
          <p className="text-xs text-muted-foreground">
            {t(`backlinks.status.${statusKey}.body`)}
            {status.balanceUsd !== undefined
              ? ` ${t("backlinks.status.balance", { balance: `$${status.balanceUsd.toFixed(2)}` })}`
              : ""}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void refresh()}
        disabled={checking}
        aria-label={t("backlinks.status.refresh")}
      >
        {checking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {t("backlinks.status.refresh")}
      </Button>
    </div>
  );
}

function CompetitorContextNote({
  competitors,
  fromCompetitorAnalysis = false,
  t,
}: {
  competitors: string[];
  fromCompetitorAnalysis?: boolean;
  t: Translate;
}) {
  return competitors.length ? (
    <p className="text-xs text-muted-foreground">
      {t(
        fromCompetitorAnalysis ? "backlinks.competitorsFromAnalysis" : "backlinks.competitorsUsed",
        { list: competitors.join(", ") },
      )}
    </p>
  ) : (
    <p className="text-xs text-amber-600">{t("backlinks.noCompetitors")}</p>
  );
}

function AnalysisView({
  analysis,
  projectId,
  competitors,
  convertTop,
  convertingTop,
  t,
}: {
  analysis: BacklinkAnalysisResult;
  projectId: string;
  competitors: string[];
  convertTop: () => void;
  convertingTop: boolean;
  t: Translate;
}) {
  const remainingTop = analysis.recommendations.filter(
    (r) =>
      !analysis.convertedRecommendationIds.includes(r.id) &&
      (r.priority === "High" || r.priority === "Medium"),
  ).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <CompetitorContextNote competitors={competitors} t={t} />
        <p className="text-xs text-muted-foreground">
          {t("backlinks.lastRun", { date: analysis.createdAt.slice(0, 10) })}
        </p>
      </div>
      {analysis.note ? <p className="mt-2 text-xs text-amber-600">{analysis.note}</p> : null}

      {/* Scores */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard label={t("backlinks.score.overall")} value={analysis.overallLinkScore} />
        <ScoreCard label={t("backlinks.score.profile")} value={analysis.linkProfileScore} />
        <ScoreCard
          label={t("backlinks.score.gap")}
          value={analysis.linkGapScore}
          hint={t("backlinks.gapHint")}
        />
        <ScoreCard label={t("backlinks.score.quality")} value={analysis.linkQualityScore} />
      </div>

      {/* Summary + top actions */}
      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-lg">{t("backlinks.summaryHeading")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{analysis.summary}</p>
        {analysis.topLinkActions.length ? (
          <>
            <h3 className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t("backlinks.topActions")}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {analysis.topLinkActions.map((action, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-gold">→</span>
                  {action}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {/* Own vs competitors table */}
      <section className="mt-8">
        <h2 className="font-display text-lg mb-3">{t("backlinks.profileTable")}</h2>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t("backlinks.table.domain")}</th>
                <th className="px-4 py-2.5 font-medium">{t("backlinks.table.rank")}</th>
                <th className="px-4 py-2.5 font-medium">{t("backlinks.table.backlinks")}</th>
                <th className="px-4 py-2.5 font-medium">{t("backlinks.table.referringDomains")}</th>
                <th className="px-4 py-2.5 font-medium">{t("backlinks.table.broken")}</th>
                <th className="px-4 py-2.5 font-medium">{t("backlinks.table.spam")}</th>
              </tr>
            </thead>
            <tbody>
              <ProfileRow
                summary={analysis.own}
                you
                youLabel={t("backlinks.you")}
                notFetchedLabel={t("backlinks.table.notFetched")}
              />
              {analysis.competitors.map((c) => (
                <ProfileRow
                  key={c.target}
                  summary={c}
                  youLabel={t("backlinks.you")}
                  notFetchedLabel={t("backlinks.table.notFetched")}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Link gap */}
      <section className="mt-8">
        <h2 className="font-display text-lg">{t("backlinks.gapHeading")}</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">{t("backlinks.gapNote")}</p>
        {analysis.gapDomains.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("backlinks.gapEmpty")}</p>
        ) : (
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analysis.gapDomains.slice(0, 18).map((g) => (
              <div key={g.domain} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{g.domain}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-border bg-secondary">
                    {t("backlinks.table.rank")} {g.rank}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  {t("backlinks.gap.linksTo")}: {g.competitorsLinked.join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top referring domains */}
      <section className="mt-8">
        <h2 className="font-display text-lg mb-2">{t("backlinks.referringHeading")}</h2>
        {analysis.topReferringDomains.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("backlinks.referringEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {analysis.topReferringDomains.slice(0, 15).map((r) => (
              <span
                key={r.domain}
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-card"
              >
                {r.domain} <span className="text-muted-foreground">· {r.rank}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Recommendations */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-lg">{t("backlinks.recommendations")}</h2>
          {remainingTop > 0 ? (
            <Button size="sm" variant="outline" onClick={convertTop} disabled={convertingTop}>
              {convertingTop ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t("backlinks.action.convertTop")}
            </Button>
          ) : null}
        </div>
        <div className="space-y-3">
          {analysis.recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              converted={analysis.convertedRecommendationIds.includes(rec.id)}
              projectId={projectId}
              t={t}
            />
          ))}
        </div>
      </section>

      <div className="pt-6">
        <Link
          to="/app/plan"
          className="text-sm text-foreground/70 underline underline-offset-4 hover:text-foreground"
        >
          {t("nav.opportunities")} →
        </Link>
      </div>
    </>
  );
}

function ProfileRow({
  summary,
  you = false,
  youLabel,
  notFetchedLabel,
}: {
  summary: BacklinkTargetSummary;
  you?: boolean;
  youLabel: string;
  notFetchedLabel: string;
}) {
  const failed = summary.fetchStatus === "failed";
  return (
    <tr className={`border-b border-border last:border-0 ${you ? "bg-accent/10" : ""}`}>
      <td className="px-4 py-2.5">
        <span className="font-medium">{summary.target}</span>
        {you ? (
          <span className="ml-2 text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full border border-accent/40 bg-accent/30 text-accent-foreground">
            {youLabel}
          </span>
        ) : null}
      </td>
      {failed ? (
        <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={5}>
          {notFetchedLabel}
        </td>
      ) : (
        <>
          <td className="px-4 py-2.5">{summary.rank}</td>
          <td className="px-4 py-2.5">{summary.backlinks.toLocaleString()}</td>
          <td className="px-4 py-2.5">{summary.referringDomains.toLocaleString()}</td>
          <td className="px-4 py-2.5">{summary.brokenBacklinks.toLocaleString()}</td>
          <td className="px-4 py-2.5">{summary.spamScore}</td>
        </>
      )}
    </tr>
  );
}

function RecommendationCard({
  rec,
  converted,
  projectId,
  t,
}: {
  rec: BacklinkRecommendation;
  converted: boolean;
  projectId: string;
  t: Translate;
}) {
  const [converting, setConverting] = useState(false);

  async function convert() {
    setConverting(true);
    try {
      await createOpportunityFromBacklinkRecommendation(projectId, rec.id);
      toast.success(t("backlinks.toast.converted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunity");
    } finally {
      setConverting(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground">{rec.title}</h3>
            <Tag>{t(CATEGORY_KEY[rec.category])}</Tag>
            <Tag tone={rec.priority === "High" ? "gold" : "muted"}>
              {t(`common.${rec.priority.toLowerCase()}`)}
            </Tag>
            <Tag tone="muted">
              {t("backlinks.effort")}: {t(`common.${rec.effort.toLowerCase()}`)}
            </Tag>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{rec.explanation}</p>
          <p className="mt-1.5 text-sm">{rec.recommendation}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground/70">{t("backlinks.target")}: </span>
              {rec.targetDomainOrPlatform}
            </span>
            <span>
              <span className="font-medium text-foreground/70">{t("backlinks.approach")}: </span>
              {rec.suggestedApproach}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          {converted ? (
            <Button size="sm" variant="ghost" disabled className="text-muted-foreground">
              <Check className="h-3.5 w-3.5" /> {t("backlinks.action.converted")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={convert} disabled={converting}>
              {converting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t("backlinks.action.convert")}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function ScoreCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-display text-3xl text-foreground">
        {value}
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
      {hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Tag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "gold" | "muted";
}) {
  const cls =
    tone === "gold"
      ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : tone === "muted"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-secondary border-border text-secondary-foreground";
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Link Growth Network (owner scope 2026-07-24)
// ---------------------------------------------------------------------------

/**
 * Opt-in directory + tracked introductions. Relevance-matched partners,
 * localized intro drafts, and honest statuses where "live" exists only after
 * Milo has re-fetched the partner page and found the link. No DataForSEO
 * dependency — this section works without provider keys.
 */
function LinkNetworkSection({ project, t }: { project: Project; t: (k: string) => string }) {
  const [listing, setListing] = useState<LinkListingView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [topicsText, setTopicsText] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<LinkMatchView[] | null>(null);
  const [targetUrls, setTargetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    getLinkListingFn({ data: { projectId: project.id } })
      .then((r) => {
        if (!alive) return;
        setListing(r.listing);
        if (r.listing) {
          setTopicsText(r.listing.topics.join(", "));
          setContact(r.listing.contactEmail);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, [project.id]);

  const saveListing = async (status: "active" | "paused") => {
    setBusy(true);
    try {
      const topics = topicsText
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length >= 2)
        .slice(0, 12);
      const r = await upsertLinkListingFn({
        data: { projectId: project.id, topics, contactEmail: contact.trim(), status },
      });
      setListing(r);
      setTopicsText(r.topics.join(", "));
      toast.success(t(status === "active" ? "linknet.joined" : "linknet.paused"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the listing");
    } finally {
      setBusy(false);
    }
  };

  const findMatches = async () => {
    setBusy(true);
    try {
      const r = await findLinkMatchesFn({ data: { projectId: project.id } });
      setMatches(r.matches);
      if (!r.matches.length) toast.info(t("linknet.noMatches"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not search the network");
    } finally {
      setBusy(false);
    }
  };

  const advance = async (m: LinkMatchView, to: "contacted" | "agreed" | "declined") => {
    try {
      const targetUrl = to === "agreed" ? (targetUrls[m.id] ?? "").trim() : undefined;
      await updateLinkMatchStatusFn({ data: { matchId: m.id, to, targetUrl } });
      setMatches((prev) =>
        (prev ?? []).map((x) =>
          x.id === m.id ? { ...x, status: to, targetUrl: targetUrl || x.targetUrl } : x,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the match");
    }
  };

  const verify = async (m: LinkMatchView) => {
    setBusy(true);
    try {
      const pageUrl = (targetUrls[m.id] ?? m.targetUrl ?? "").trim();
      const r = await verifyLinkPlacementFn({
        data: { matchId: m.id, ...(pageUrl ? { pageUrl } : {}) },
      });
      setMatches((prev) =>
        (prev ?? []).map((x) =>
          x.id === m.id ? { ...x, status: r.status, lastCheckFound: r.found, linkRel: r.rel } : x,
        ),
      );
      toast[r.found ? "success" : "info"](t(r.found ? "linknet.verified" : "linknet.notFound"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const copyIntro = async (m: LinkMatchView) => {
    try {
      await navigator.clipboard.writeText(`${m.intro.subject}\n\n${m.intro.body}`);
      toast.success(t("linknet.introCopied"));
    } catch {
      toast.error("Clipboard is unavailable — copy the text manually.");
    }
  };

  if (!loaded) return null;

  return (
    <section className="mt-8 rounded-lg border border-border bg-background p-5">
      <h2 className="text-sm font-medium text-foreground">{t("linknet.title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("linknet.subtitle")}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("linknet.policyNote")}</p>

      <div className="mt-4 grid gap-2 md:grid-cols-[2fr_1fr_auto_auto]">
        <Input
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          placeholder={t("linknet.topicsPlaceholder")}
          aria-label={t("linknet.topics")}
        />
        <Input
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t("linknet.contactPlaceholder")}
          aria-label={t("linknet.contact")}
        />
        <Button size="sm" disabled={busy} onClick={() => saveListing("active")}>
          {listing?.status === "active" ? t("linknet.update") : t("linknet.join")}
        </Button>
        {listing?.status === "active" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => saveListing("paused")}>
            {t("linknet.pause")}
          </Button>
        ) : null}
      </div>

      {listing?.status === "active" ? (
        <div className="mt-4">
          <Button size="sm" variant="outline" disabled={busy} onClick={findMatches}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t("linknet.find")}
          </Button>
        </div>
      ) : null}

      {matches?.length ? (
        <ul className="mt-4 space-y-3">
          {matches.map((m) => (
            <li key={m.id} className="rounded-md border border-border p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-foreground">
                    {m.partnerName || m.partnerSite}
                  </span>{" "}
                  <a
                    className="text-muted-foreground underline"
                    href={m.partnerSite}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {m.partnerSite}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {t("linknet.score")} {m.score} · {m.sharedTopics.join(", ")}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 uppercase tracking-wide text-[10px]">
                    {t(`linknet.status.${m.status}`)}
                  </span>
                </div>
              </div>
              {m.reciprocalSwap ? (
                <p className="mt-1 text-amber-600">{t("linknet.reciprocalWarn")}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => copyIntro(m)}>
                  {t("linknet.copyIntro")}
                </Button>
                {m.status === "suggested" ? (
                  <Button size="sm" variant="outline" onClick={() => advance(m, "contacted")}>
                    {t("linknet.markContacted")}
                  </Button>
                ) : null}
                {m.status === "contacted" ? (
                  <>
                    <Input
                      className="h-8 w-64 text-xs"
                      placeholder={t("linknet.targetUrlPlaceholder")}
                      value={targetUrls[m.id] ?? ""}
                      onChange={(e) => setTargetUrls((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" onClick={() => advance(m, "agreed")}>
                      {t("linknet.markAgreed")}
                    </Button>
                  </>
                ) : null}
                {m.status === "agreed" || m.status === "live_verified" ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => verify(m)}>
                    {t("linknet.verify")}
                  </Button>
                ) : null}
                {m.status !== "declined" && m.status !== "live_verified" ? (
                  <Button size="sm" variant="ghost" onClick={() => advance(m, "declined")}>
                    {t("linknet.decline")}
                  </Button>
                ) : null}
                {m.status === "live_verified" ? (
                  <span className="text-emerald-600">
                    ✓ {t("linknet.liveSince")} {m.verifiedAt?.slice(0, 10)}
                    {m.linkRel?.includes("nofollow") ? ` · ${t("linknet.nofollow")}` : ""}
                  </span>
                ) : null}
                {m.lastCheckFound === false ? (
                  <span className="text-muted-foreground">{t("linknet.lastCheckMiss")}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
