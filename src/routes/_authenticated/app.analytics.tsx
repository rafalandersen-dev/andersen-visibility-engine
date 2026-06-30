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
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Stat label={t("analytics.stat.visits30")} value={data.visits30} />
            <Stat label={t("analytics.stat.prev30")} value={data.visitsPrev30} />
            <Stat
              label={t("analytics.stat.growth")}
              value={`${data.growthPct > 0 ? "+" : ""}${data.growthPct}%`}
              tone={data.growthPct > 0 ? "up" : data.growthPct < 0 ? "down" : "flat"}
            />
            <Stat label={t("analytics.stat.topPage")} value={data.topPage ? `${data.topPage.views}` : "—"} hint={data.topPage?.path} />
            <Stat label={t("analytics.stat.aiSignals")} value={data.aiSignalCount} />
            <Stat label={t("analytics.stat.ctaBooking")} value={data.ctaClicks + data.bookingClicks} hint={`${data.ctaClicks} CTA · ${data.bookingClicks} booking`} />
          </div>

          {/* Traffic trend */}
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("analytics.trend.label")}</div>
            <h2 className="font-display text-lg">{t("analytics.trend.heading")}</h2>
            <TrendBars data={data.dailyTrend} />
          </section>

          {/* Top pages */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{t("analytics.topPages.heading")}</div>
            {data.topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views recorded yet.</p>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.topPages.path")}</th>
                      <th className="text-left px-5 py-3 font-medium w-28">{t("analytics.topPages.views")}</th>
                      <th className="text-left px-5 py-3 font-medium w-56">{t("analytics.topPages.source")}</th>
                      <th className="text-left px-5 py-3 font-medium w-32">{t("analytics.topPages.aiSignals")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topPages.map((p) => (
                      <tr key={p.path} className="hover:bg-secondary/40">
                        <td className="px-5 py-3"><div className="font-medium truncate max-w-md">{p.path}</div><div className="text-xs text-muted-foreground truncate max-w-md">{p.title}</div></td>
                        <td className="px-5 py-3 font-mono">{p.views}</td>
                        <td className="px-5 py-3 text-muted-foreground truncate">{p.topReferrer}</td>
                        <td className="px-5 py-3 text-muted-foreground">{p.aiSignals || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Published content performance */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">{t("analytics.published.heading")}</div>
            {data.publishedContent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("analytics.published.none")}
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.published.content")}</th>
                      <th className="text-left px-5 py-3 font-medium w-28">{t("analytics.topPages.views")}</th>
                      <th className="text-left px-5 py-3 font-medium w-28">{t("analytics.published.cta")}</th>
                      <th className="text-left px-5 py-3 font-medium w-28">{t("analytics.published.booking")}</th>
                      <th className="text-left px-5 py-3 font-medium w-36">{t("analytics.published.livePage")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.publishedContent.map((c) => (
                      <tr key={c.liveUrl} className="hover:bg-secondary/40">
                        <td className="px-5 py-3"><div className="font-medium truncate max-w-md">{c.title}</div>{c.publishedAt ? <div className="text-xs text-muted-foreground">Published {c.publishedAt.slice(0, 10)}</div> : null}</td>
                        <td className="px-5 py-3 font-mono">{c.views}</td>
                        <td className="px-5 py-3 font-mono">{c.ctaClicks}</td>
                        <td className="px-5 py-3 font-mono">{c.bookingClicks}</td>
                        <td className="px-5 py-3">
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

          {/* AI-related signals */}
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
