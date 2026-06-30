import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { getAnalyticsSummaryFn, type AnalyticsSummary } from "@/lib/analytics.functions";
import { BarChart3, Loader2, RefreshCw, AlertTriangle, Copy, ExternalLink, Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Milo Growth" },
      { name: "description", content: "First-party website growth tracking for content planned and published with Milo." },
    ],
  }),
  component: AnalyticsPage,
});

const SNIPPET_ORIGIN = "https://milogrowth.com";

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
            Analytics tracks one website per project. Create a project, then add the tracking snippet.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>{t("nav.setup")}</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("analytics.title")}
      description={t("analytics.subtitle")}
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("analytics.refresh")}
        </Button>
      }
    >
      {loading && !data ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" /> <div className="mt-2 text-sm">{t("analytics.loading")}</div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" strokeWidth={1.5} />
          <div className="mt-2 font-display text-lg">{t("analytics.errorTitle")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button className="mt-4" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> {t("common.retry")}</Button>
        </div>
      ) : data && !data.hasData ? (
        <EmptyState snippet={snippet} onCopy={copySnippet} />
      ) : data ? (
        <div className="space-y-8">
          {/* Section 1 — Growth proof summary */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{t("analytics.v2.growthProof")}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Stat
                label={t("analytics.stat.visits30")}
                value={data.growthSummary.visitsLast30}
                hint={data.growthSummary.visitsGrowthPercent !== null ? `${data.growthSummary.visitsGrowthPercent > 0 ? "+" : ""}${data.growthSummary.visitsGrowthPercent}% vs prev` : undefined}
                tone={data.growthSummary.visitsGrowthPercent && data.growthSummary.visitsGrowthPercent > 0 ? "up" : data.growthSummary.visitsGrowthPercent && data.growthSummary.visitsGrowthPercent < 0 ? "down" : "flat"}
              />
              <Stat label={t("analytics.stat.ctaBooking")} value={data.growthSummary.ctaClicksLast30 + data.growthSummary.bookingClicksLast30} hint={`${data.growthSummary.ctaClicksLast30} CTA · ${data.growthSummary.bookingClicksLast30} booking`} />
              <Stat label={t("analytics.v2.stat.conversion")} value={`${data.growthSummary.conversionRateLast30}%`} />
              <Stat label={t("analytics.v2.stat.miloViews")} value={data.growthSummary.miloPageViews} hint={`${data.growthSummary.activePublishedPagesCount}/${data.growthSummary.publishedPagesCount} ${t("analytics.v2.stat.published").toLowerCase()}`} />
              <Stat label={t("analytics.stat.aiSignals")} value={data.growthSummary.aiSignalsLast30} />
              <Stat label={t("analytics.v2.stat.bestPage")} value={data.growthSummary.bestPerformingPage ? `${data.growthSummary.bestPerformingPage.views}` : "—"} hint={data.growthSummary.bestPerformingPage?.title} />
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("analytics.v2.whatChanged")}</div>
                <p className="mt-2 text-sm text-foreground/85">{data.growthSummary.summaryText}</p>
              </div>
              <div className="rounded-lg border border-gold/40 bg-gold/5 p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gold">{t("analytics.v2.nextAction")}</div>
                <p className="mt-2 text-sm text-foreground/85">{t(`analytics.next.${data.nextActionKey}`)}</p>
              </div>
            </div>
          </section>

          {/* Traffic trend */}
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("analytics.trend.label")}</div>
            <h2 className="font-display text-lg">{t("analytics.trend.heading")}</h2>
            <TrendBars data={data.dailyTrend} />
          </section>

          {/* Section 2 — Published by Milo (prominent) */}
          <section className="rounded-lg border-2 border-gold/30 bg-card p-5">
            <h2 className="font-display text-xl">{t("analytics.v2.publishedByMilo")}</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-3xl">{t("analytics.v2.publishedByMiloDesc")}</p>
            {data.publishedContentPerformance.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("analytics.v2.publishedByMiloEmpty")}</p>
            ) : (
              <div className="mt-4 rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">{t("analytics.published.content")}</th>
                      <th className="text-left px-4 py-3 font-medium w-24">{t("analytics.v2.col.viewsSince")}</th>
                      <th className="text-left px-4 py-3 font-medium w-20">{t("analytics.published.cta")}</th>
                      <th className="text-left px-4 py-3 font-medium w-20">{t("analytics.published.booking")}</th>
                      <th className="text-left px-4 py-3 font-medium w-24">{t("analytics.v2.col.conversion")}</th>
                      <th className="text-left px-4 py-3 font-medium w-20">{t("analytics.topPages.aiSignals")}</th>
                      <th className="text-left px-4 py-3 font-medium w-24">{t("analytics.v2.col.score")}</th>
                      <th className="text-left px-4 py-3 font-medium w-44">{t("analytics.v2.col.recommendation")}</th>
                      <th className="text-left px-4 py-3 font-medium w-24">{t("analytics.published.livePage")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border align-top">
                    {data.publishedContentPerformance.map((c) => (
                      <tr key={c.assetId} className="hover:bg-secondary/40">
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-xs">{c.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.path}{c.daysSincePublished !== undefined ? ` · ${t("analytics.v2.daysAgo", { days: c.daysSincePublished })}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">{c.viewsSincePublish}</td>
                        <td className="px-4 py-3 font-mono">{c.ctaClicksSincePublish}</td>
                        <td className="px-4 py-3 font-mono">{c.bookingClicksSincePublish}</td>
                        <td className="px-4 py-3 font-mono">{c.conversionRateSincePublish}%</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.aiSignalsSincePublish || "—"}</td>
                        <td className="px-4 py-3">{c.qualityScore !== undefined ? c.qualityScore : <span className="text-xs text-muted-foreground">{t("analytics.v2.notEvaluated")}</span>}</td>
                        <td className="px-4 py-3"><RecBadge rec={c.recommendation} t={t} /></td>
                        <td className="px-4 py-3">
                          <a href={c.liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-foreground/80 underline underline-offset-4 inline-flex items-center gap-1">
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

          {/* Section 3 — Top growing pages */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{t("analytics.v2.topGrowing")}</div>
            {data.topGrowingPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views recorded yet.</p>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.v2.col.page")}</th>
                      <th className="text-left px-5 py-3 font-medium w-24">{t("analytics.topPages.views")}</th>
                      <th className="text-left px-5 py-3 font-medium w-24">{t("analytics.v2.col.growth")}</th>
                      <th className="text-left px-5 py-3 font-medium w-24">{t("analytics.v2.col.clicks")}</th>
                      <th className="text-left px-5 py-3 font-medium w-48">{t("analytics.topPages.source")}</th>
                      <th className="text-left px-5 py-3 font-medium w-24">{t("analytics.topPages.aiSignals")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topGrowingPages.map((p) => (
                      <tr key={p.path} className="hover:bg-secondary/40">
                        <td className="px-5 py-3"><div className="font-medium truncate max-w-md">{p.path}</div><div className="text-xs text-muted-foreground truncate max-w-md">{p.title}</div></td>
                        <td className="px-5 py-3 font-mono">{p.viewsLast30}</td>
                        <td className={`px-5 py-3 font-mono ${p.growthPercent && p.growthPercent > 0 ? "text-emerald-600" : p.growthPercent && p.growthPercent < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {p.growthPercent === null ? "—" : `${p.growthPercent > 0 ? "+" : ""}${p.growthPercent}%`}
                        </td>
                        <td className="px-5 py-3 font-mono">{p.ctaClicks + p.bookingClicks}</td>
                        <td className="px-5 py-3 text-muted-foreground truncate">{p.topReferrer}</td>
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
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{t("analytics.v2.needsAttention")}</div>
            {data.underperformingPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("analytics.v2.needsAttentionEmpty")}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {data.underperformingPages.map((p) => (
                  <div key={p.path} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{p.title}</div>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-600">{t(`analytics.issue.${p.issue}`)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">{p.path}</div>
                    <p className="mt-2 text-sm text-foreground/85">{t(`analytics.rec.${p.recommendation}`)}</p>
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
            <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
              {t("analytics.ai.copy")}
            </p>
            {data.aiSignals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("analytics.ai.none")}</p>
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.aiSignals.map((s) => (
                  <div key={`${s.type}-${s.source}`} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t(labelAiKey(s.type))}</span>
                      <span className="font-display text-lg">{s.count}</span>
                    </div>
                    <div className="mt-1 text-sm text-foreground/85">{s.source}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">{s.samplePath}</div>
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

function labelAiKey(type: string) {
  if (type === "ai_referrer") return "analytics.ai.referral";
  if (type === "ai_crawler") return "analytics.ai.crawler";
  if (type === "ai_search_bot") return "analytics.ai.searchBot";
  return "analytics.stat.aiSignals";
}

function RecBadge({ rec, t }: { rec: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const cls =
    rec === "keepMonitoring"
      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
      : rec === "improveCta" || rec === "reviewQuality"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
      : "bg-secondary border-border text-muted-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border ${cls}`}>
      {t(`analytics.rec.${rec}`)}
    </span>
  );
}

function Stat({ label, value, hint, tone = "flat" }: { label: string; value: string | number; hint?: string; tone?: "up" | "down" | "flat" }) {
  const valueCls = tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-1.5 font-display text-2xl ${valueCls}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground truncate">{hint}</div> : null}
    </div>
  );
}

function TrendBars({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  return (
    <div className="mt-4 flex items-end gap-1 h-32">
      {data.map((d) => (
        <div key={d.date} className="flex-1 group relative flex flex-col justify-end" title={`${d.date}: ${d.views}`}>
          <div
            className="w-full rounded-sm bg-gold/70 transition-all min-h-[2px]"
            style={{ height: `${Math.round((d.views / max) * 100)}%` }}
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
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("analytics.setup.label")}</div>
      <h2 className="font-display text-lg">{t("analytics.setup.heading")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("analytics.setup.addOnce")}</p>
      <div className="mt-3 flex items-start gap-2">
        <code className="flex-1 rounded-md border border-border bg-secondary/40 p-3 text-xs font-mono break-all">{snippet}</code>
        <Button size="sm" variant="outline" onClick={onCopy}><Copy className="h-3.5 w-3.5" /> {t("common.copy")}</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Optional event tracking on your site:
        <br />
        <code className="font-mono">window.miloTrack('cta_click', {"{ label: 'Book now' }"})</code>
        {"  ·  "}
        <code className="font-mono">window.miloTrack('booking_click', {"{ label: 'Book appointment' }"})</code>
      </p>
    </section>
  );
}

function PrivacyNote() {
  const t = useT();
  return (
    <p className="text-xs text-muted-foreground">
      {t("analytics.privacy")}
    </p>
  );
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
