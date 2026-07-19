import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { getAnalyticsSummaryFn, type AnalyticsSummary } from "@/lib/analytics.functions";
import { GscLiteSection } from "@/components/GscLiteSection";
import {
  BarChart3,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Copy,
  ExternalLink,
  Bot,
  CalendarDays,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Milo Growth" },
      {
        name: "description",
        content: "First-party website growth tracking for content planned and published with Milo.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const SNIPPET_ORIGIN = "https://milogrowth.com";
const visualQa = import.meta.env.DEV && import.meta.env.VITE_MILO_VISUAL_QA === "true";

function AnalyticsPage() {
  const navigate = useNavigate();
  const t = useT();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const activeProjectId = useStore((s) => s.activeProjectId);

  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snippet = `<script src="${SNIPPET_ORIGIN}/milo-analytics.js" data-project-id="${activeProjectId}"></script>`;

  async function load() {
    if (!activeProjectId) return;
    setLoading(true);
    setError(null);
    try {
      if (visualQa) {
        setData(visualQaAnalytics());
        return;
      }
      const res = await getAnalyticsSummaryFn({ data: { projectId: activeProjectId } });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeProjectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Snippet copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  if (!project) {
    return (
      <AppShell title={t("analytics.title")} description={t("analytics.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("analytics.setupFirst")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Analytics tracks one website per project. Create a project, then add the tracking
            snippet.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>
            {t("nav.setup")}
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("analytics.title")}
      description="Connect Milo Analytics, Google Search Console and published content to see what is driving growth."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled>
            <CalendarDays className="h-4 w-4" /> Last 30 days
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("analytics.refresh")}
          </Button>
        </div>
      }
    >
      {loading && !data ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />{" "}
          <div className="mt-2 text-sm">{t("analytics.loading")}</div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" strokeWidth={1.5} />
          <div className="mt-2 font-display text-lg">{t("analytics.errorTitle")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button className="mt-4" variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4" /> {t("common.retry")}
          </Button>
        </div>
      ) : data && !data.hasData ? (
        <div className="space-y-8">
          <EmptyState snippet={snippet} onCopy={copySnippet} />
          <GscLiteSection project={project} />
        </div>
      ) : data ? (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> Milo Analytics is collecting
              data
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Read-only reporting ·
              refreshed just now
            </span>
          </div>

          <section className="grid gap-4 md:grid-cols-3">
            <PremiumStat
              label="Website visits"
              value={data.growthSummary.visitsLast30.toLocaleString()}
              change={data.growthSummary.visitsGrowthPercent}
              detail="vs previous 30 days"
              points={data.dailyTrend.map((item) => item.views)}
            />
            <PremiumStat
              label="Conversion rate"
              value={`${data.growthSummary.conversionRateLast30}%`}
              detail={`${data.growthSummary.ctaClicksLast30 + data.growthSummary.bookingClicksLast30} tracked actions`}
              points={data.dailyTrend.map((item, index) =>
                item.views ? (index % 4) + data.growthSummary.conversionRateLast30 : 0,
              )}
            />
            <PremiumStat
              label="Published pages"
              value={data.growthSummary.publishedPagesCount}
              detail={`${data.growthSummary.activePublishedPagesCount} receiving visits`}
              points={data.dailyTrend.map((_, index) =>
                Math.min(data.growthSummary.publishedPagesCount, Math.ceil((index + 1) / 5)),
              )}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,.75fr)]">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Growth proof
                  </div>
                  <h2 className="mt-1 font-display text-2xl">Visits and tracked actions</h2>
                </div>
                <span className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  Daily
                </span>
              </div>
              <TrendBars data={data.dailyTrend} />
              <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
                <MiniMetric label="Milo page views" value={data.growthSummary.miloPageViews} />
                <MiniMetric label="AI signals" value={data.growthSummary.aiSignalsLast30} />
                <MiniMetric
                  label="Best page views"
                  value={data.growthSummary.bestPerformingPage?.views ?? "—"}
                />
              </div>
            </div>

            <aside className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#b77f1f]" />
                <h2 className="font-display text-xl">What changed</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {data.growthSummary.summaryText}
              </p>
              <div className="mt-5 divide-y divide-border border-y border-border">
                {data.topGrowingPages.slice(0, 3).map((page) => (
                  <div key={page.path} className="py-4">
                    <div className="line-clamp-2 text-sm font-medium">{page.title}</div>
                    <div className="mt-1 text-xs text-emerald-700">
                      {page.growthPercent === null
                        ? "New traffic"
                        : `${page.growthPercent > 0 ? "+" : ""}${page.growthPercent}%`}{" "}
                      · {page.viewsLast30} visits
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg bg-[#faf6ec] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b6b19]">
                  Milo recommends
                </div>
                <p className="mt-2 text-sm leading-5">
                  {t(`analytics.next.${data.nextActionKey}`)}
                </p>
              </div>
            </aside>
          </section>

          {/* Section 2 — Published by Milo (prominent) */}
          <section className="rounded-lg border-2 border-gold/30 bg-card p-5">
            <h2 className="font-display text-xl">{t("analytics.v2.publishedByMilo")}</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
              {t("analytics.v2.publishedByMiloDesc")}
            </p>
            {data.publishedContentPerformance.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("analytics.v2.publishedByMiloEmpty")}
              </p>
            ) : (
              <div className="mt-4 rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">
                        {t("analytics.published.content")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-24">
                        {t("analytics.v2.col.viewsSince")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-20">
                        {t("analytics.published.cta")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-20">
                        {t("analytics.published.booking")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-24">
                        {t("analytics.v2.col.conversion")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-20">
                        {t("analytics.topPages.aiSignals")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-24">
                        {t("analytics.v2.col.score")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-44">
                        {t("analytics.v2.col.recommendation")}
                      </th>
                      <th className="text-left px-4 py-3 font-medium w-24">
                        {t("analytics.published.livePage")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border align-top">
                    {data.publishedContentPerformance.map((c) => (
                      <tr key={c.assetId} className="hover:bg-secondary/40">
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-xs">{c.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.path}
                            {c.daysSincePublished !== undefined
                              ? ` · ${t("analytics.v2.daysAgo", { days: c.daysSincePublished })}`
                              : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">{c.viewsSincePublish}</td>
                        <td className="px-4 py-3 font-mono">{c.ctaClicksSincePublish}</td>
                        <td className="px-4 py-3 font-mono">{c.bookingClicksSincePublish}</td>
                        <td className="px-4 py-3 font-mono">{c.conversionRateSincePublish}%</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.aiSignalsSincePublish || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {c.qualityScore !== undefined ? (
                            c.qualityScore
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t("analytics.v2.notEvaluated")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RecBadge rec={c.recommendation} t={t} />
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={c.liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-foreground/80 underline underline-offset-4 inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" /> View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 3 — Search Console Lite / SEO Proof */}
          <GscLiteSection project={project} onsite={data.publishedContentPerformance} />

          {/* Section 4 — Top growing pages */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
              {t("analytics.v2.topGrowing")}
            </div>
            {data.topGrowingPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views recorded yet.</p>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">
                        {t("analytics.v2.col.page")}
                      </th>
                      <th className="text-left px-5 py-3 font-medium w-24">
                        {t("analytics.topPages.views")}
                      </th>
                      <th className="text-left px-5 py-3 font-medium w-24">
                        {t("analytics.v2.col.growth")}
                      </th>
                      <th className="text-left px-5 py-3 font-medium w-24">
                        {t("analytics.v2.col.clicks")}
                      </th>
                      <th className="text-left px-5 py-3 font-medium w-48">
                        {t("analytics.topPages.source")}
                      </th>
                      <th className="text-left px-5 py-3 font-medium w-24">
                        {t("analytics.topPages.aiSignals")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topGrowingPages.map((p) => (
                      <tr key={p.path} className="hover:bg-secondary/40">
                        <td className="px-5 py-3">
                          <div className="font-medium truncate max-w-md">{p.path}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-md">
                            {p.title}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono">{p.viewsLast30}</td>
                        <td
                          className={`px-5 py-3 font-mono ${p.growthPercent && p.growthPercent > 0 ? "text-emerald-600" : p.growthPercent && p.growthPercent < 0 ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {p.growthPercent === null
                            ? "—"
                            : `${p.growthPercent > 0 ? "+" : ""}${p.growthPercent}%`}
                        </td>
                        <td className="px-5 py-3 font-mono">{p.ctaClicks + p.bookingClicks}</td>
                        <td className="px-5 py-3 text-muted-foreground truncate">
                          {p.topReferrer}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{p.aiSignals || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 4 — Needs attention */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
              {t("analytics.v2.needsAttention")}
            </div>
            {data.underperformingPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("analytics.v2.needsAttentionEmpty")}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {data.underperformingPages.map((p) => (
                  <div
                    key={p.path}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{p.title}</div>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-600">
                        {t(`analytics.issue.${p.issue}`)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">{p.path}</div>
                    <p className="mt-2 text-sm text-foreground/85">
                      {t(`analytics.rec.${p.recommendation}`)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 5 — AI-related signals */}
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-gold/80" />
              <h2 className="font-display text-lg">{t("analytics.ai.heading")}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-w-3xl">{t("analytics.ai.copy")}</p>
            {data.aiSignals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("analytics.ai.none")}</p>
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.aiSignals.map((s) => (
                  <div
                    key={`${s.type}-${s.source}`}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        {t(labelAiKey(s.type))}
                      </span>
                      <span className="font-display text-lg">{s.count}</span>
                    </div>
                    <div className="mt-1 text-sm text-foreground/85">{s.source}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {s.samplePath}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <SetupSnippet snippet={snippet} onCopy={copySnippet} />
          <PrivacyNote />
        </div>
      ) : null}
    </AppShell>
  );
}

function visualQaAnalytics() {
  const dailyTrend = [
    34, 41, 48, 44, 52, 61, 58, 67, 73, 70, 82, 94, 88, 104, 112, 121, 115, 128, 136, 132, 148, 156,
    163, 171, 166, 184, 196, 207, 214, 226,
  ].map((views, index) => ({ date: `2026-06-${String(index + 1).padStart(2, "0")}`, views }));
  const publishedContentPerformance = [
    {
      assetId: "qa-1",
      title: "Sports massage in Malmö for marathon runners",
      liveUrl: "https://example.com/sports-massage-malmo",
      path: "/sports-massage-malmo",
      daysSincePublished: 22,
      viewsSincePublish: 1842,
      viewsLast30: 642,
      ctaClicksSincePublish: 64,
      bookingClicksSincePublish: 13,
      totalClicksSincePublish: 77,
      conversionRateSincePublish: 4.2,
      aiSignalsSincePublish: 8,
      topReferrers: [],
      qualityScore: 82,
      recommendation: "improveCta",
    },
    {
      assetId: "qa-2",
      title: "How often should you book a massage?",
      liveUrl: "https://example.com/how-often-massage",
      path: "/how-often-massage",
      daysSincePublished: 28,
      viewsSincePublish: 1257,
      viewsLast30: 486,
      ctaClicksSincePublish: 39,
      bookingClicksSincePublish: 6,
      totalClicksSincePublish: 45,
      conversionRateSincePublish: 3.6,
      aiSignalsSincePublish: 4,
      topReferrers: [],
      qualityScore: 78,
      recommendation: "createSupportingContent",
    },
    {
      assetId: "qa-3",
      title: "Deep tissue massage for neck and shoulder tension",
      liveUrl: "https://example.com/deep-tissue-massage",
      path: "/deep-tissue-massage",
      daysSincePublished: 31,
      viewsSincePublish: 980,
      viewsLast30: 372,
      ctaClicksSincePublish: 27,
      bookingClicksSincePublish: 4,
      totalClicksSincePublish: 31,
      conversionRateSincePublish: 3.2,
      aiSignalsSincePublish: 3,
      topReferrers: [],
      qualityScore: 74,
      recommendation: "improveCta",
    },
  ];
  return {
    hasData: true,
    dailyTrend,
    growthSummary: {
      visitsLast30: 1284,
      visitsPrevious30: 1088,
      visitsGrowthPercent: 18,
      ctaClicksLast30: 39,
      bookingClicksLast30: 10,
      conversionRateLast30: 3.8,
      aiSignalsLast30: 15,
      publishedPagesCount: 12,
      activePublishedPagesCount: 9,
      miloPageViews: 4079,
      bestPerformingPage: {
        title: publishedContentPerformance[0].title,
        path: publishedContentPerformance[0].path,
        views: 1842,
        bookingClicks: 13,
        ctaClicks: 64,
      },
      summaryText:
        "Website visits grew 18% compared with the previous period. Three Milo-published pages are now contributing meaningful traffic and tracked actions.",
    },
    publishedContentPerformance,
    topGrowingPages: publishedContentPerformance.map((page, index) => ({
      path: page.path,
      title: page.title,
      viewsLast30: page.viewsLast30,
      viewsPrevious30: Math.round(page.viewsLast30 / (1.46 - index * 0.09)),
      growthPercent: 46 - index * 9,
      ctaClicks: page.ctaClicksSincePublish,
      bookingClicks: page.bookingClicksSincePublish,
      aiSignals: page.aiSignalsSincePublish,
      topReferrer: "Google",
    })),
    underperformingPages: [
      {
        title: "Massage for desk workers in Malmö",
        path: "/massage-desk-workers",
        liveUrl: "https://example.com/massage-desk-workers",
        issue: "noClicks",
        recommendation: "improveCta",
        recommendationText: "Improve the CTA or offer section.",
      },
      {
        title: "Recovery massage for new runners",
        path: "/recovery-massage-runners",
        liveUrl: "https://example.com/recovery-massage-runners",
        issue: "lowConversion",
        recommendation: "createSupportingContent",
        recommendationText: "Create supporting content to build depth around this topic.",
      },
    ],
    aiSignals: [
      { type: "ai_referrer", source: "ChatGPT", count: 8, samplePath: "/sports-massage-malmo" },
      { type: "ai_crawler", source: "Perplexity", count: 4, samplePath: "/deep-tissue-massage" },
      { type: "ai_search_bot", source: "Google AI", count: 3, samplePath: "/how-often-massage" },
    ],
    nextActionKey: "improveCta",
  } as unknown as AnalyticsSummary;
}

function labelAiKey(type: string) {
  if (type === "ai_referrer") return "analytics.ai.referral";
  if (type === "ai_crawler") return "analytics.ai.crawler";
  if (type === "ai_search_bot") return "analytics.ai.searchBot";
  return "analytics.stat.aiSignals";
}

function RecBadge({
  rec,
  t,
}: {
  rec: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const cls =
    rec === "keepMonitoring"
      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
      : rec === "improveCta" || rec === "reviewQuality"
        ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
        : "bg-secondary border-border text-muted-foreground";
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border ${cls}`}
    >
      {t(`analytics.rec.${rec}`)}
    </span>
  );
}

function PremiumStat({
  label,
  value,
  detail,
  change,
  points,
}: {
  label: string;
  value: string | number;
  detail: string;
  change?: number | null;
  points: number[];
}) {
  const max = Math.max(1, ...points);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-sm font-medium text-foreground/85">{label}</div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="font-display text-4xl tracking-[-0.04em]">{value}</div>
        {change !== undefined && change !== null ? (
          <span
            className={
              change >= 0
                ? "text-sm font-medium text-emerald-700"
                : "text-sm font-medium text-destructive"
            }
          >
            {change > 0 ? "+" : ""}
            {change}%
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      <div className="mt-5 flex h-10 items-end gap-1" aria-hidden="true">
        {points.slice(-18).map((point, index) => (
          <span
            key={index}
            className="min-h-[2px] flex-1 rounded-t-sm bg-emerald-600/75"
            style={{ height: `${Math.max(6, Math.round((point / max) * 100))}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl">{value}</div>
    </div>
  );
}

function TrendBars({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  return (
    <div className="mt-8 flex h-52 items-end gap-1 border-b border-border bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_50px,rgba(110,105,95,.1)_51px)] px-1">
      {data.map((d) => (
        <div
          key={d.date}
          className="group relative flex h-full flex-1 flex-col justify-end"
          title={`${d.date}: ${d.views}`}
        >
          <div
            className="min-h-[2px] w-full rounded-t-sm bg-emerald-700/70 transition-all group-hover:bg-emerald-700"
            style={{ height: `${Math.max(2, Math.round((d.views / max) * 190))}px` }}
          />
        </div>
      ))}
    </div>
  );
}

function SetupSnippet({ snippet, onCopy }: { snippet: string; onCopy: () => void }) {
  const t = useT();
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {t("analytics.setup.label")}
      </div>
      <h2 className="font-display text-lg">{t("analytics.setup.heading")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("analytics.setup.addOnce")}</p>
      <div className="mt-3 flex items-start gap-2">
        <code className="flex-1 rounded-md border border-border bg-secondary/40 p-3 text-xs font-mono break-all">
          {snippet}
        </code>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" /> {t("common.copy")}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Optional event tracking on your site:
        <br />
        <code className="font-mono">window.miloTrack('cta_click', {"{ label: 'Book now' }"})</code>
        {"  ·  "}
        <code className="font-mono">
          window.miloTrack('booking_click', {"{ label: 'Book appointment' }"})
        </code>
      </p>
    </section>
  );
}

function PrivacyNote() {
  const t = useT();
  return <p className="text-xs text-muted-foreground">{t("analytics.privacy")}</p>;
}

function EmptyState({ snippet, onCopy }: { snippet: string; onCopy: () => void }) {
  const t = useT();
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
        <div className="mt-3 font-display text-lg">{t("analytics.emptyTitle")}</div>
        <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
          {t("analytics.emptyDesc")}
        </p>
      </div>
      <SetupSnippet snippet={snippet} onCopy={onCopy} />
      <PrivacyNote />
    </div>
  );
}
