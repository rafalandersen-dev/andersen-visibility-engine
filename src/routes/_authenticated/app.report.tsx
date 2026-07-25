/**
 * Monthly Proof Report (Europe-#1 move 3) — "what did Milo actually do for
 * you this month?" In-app view + browser-print PDF (print stylesheet, no
 * dependencies) + "Email me this report" (server-side rebuild, Resend).
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { useT } from "@/i18n";
import {
  buildMonthlyProofReport,
  monthKeyOf,
  recentMonthKeys,
  type MonthlyProofReport,
} from "@/lib/proof-report";
import { getProofLinksLiveFn, emailProofReportFn } from "@/lib/proof-report.functions";
import { CheckCircle2, FileDown, Loader2, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/report")({
  head: () => ({ meta: [{ title: "Monthly report — Milo Growth" }] }),
  component: ReportPage,
});

function currentMonthKey(): string {
  return monthKeyOf(new Date().toISOString());
}

function ReportPage() {
  const t = useT();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const content = useStore((s) => s.content);
  const calendar = useStore((s) => s.calendar);
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey);
  const [linksLive, setLinksLive] = useState<number | null>(null);
  const [emailing, setEmailing] = useState(false);

  const months = useMemo(() => recentMonthKeys(currentMonthKey(), 6), []);

  useEffect(() => {
    let cancelled = false;
    setLinksLive(null);
    if (!project) return;
    getProofLinksLiveFn({ data: { projectId: project.id } })
      .then((r) => {
        if (!cancelled) setLinksLive(r.linksLive);
      })
      .catch(() => {
        /* unknown stays unknown */
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  const report: MonthlyProofReport | null = useMemo(
    () =>
      project ? buildMonthlyProofReport({ project, content, calendar, monthKey, linksLive }) : null,
    [project, content, calendar, monthKey, linksLive],
  );

  async function emailMe() {
    if (!project) return;
    setEmailing(true);
    try {
      await emailProofReportFn({ data: { projectId: project.id, monthKey } });
      toast.success(t("report.toast.emailed"));
    } catch (e) {
      toast.error(
        e instanceof Error && /configured/.test(e.message)
          ? t("report.toast.notConfigured")
          : t("report.toast.emailFailed"),
      );
    } finally {
      setEmailing(false);
    }
  }

  return (
    <AppShell title={t("report.title")} description={t("report.subtitle")}>
      {!project || !report ? (
        <p className="text-sm text-muted-foreground">{t("report.noProject")}</p>
      ) : (
        <div className="space-y-6" id="proof-report-print-root">
          {/* Controls — hidden in print */}
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => window.print()}>
              <FileDown className="h-4 w-4" /> {t("report.downloadPdf")}
            </Button>
            <Button variant="outline" onClick={emailMe} disabled={emailing}>
              {emailing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {t("report.emailMe")}
            </Button>
          </div>

          {/* Print header (white-label: project, month — no app chrome) */}
          <div className="hidden print:block">
            <h1 className="font-display text-2xl">
              {project.name} — {report.monthKey}
            </h1>
          </div>

          {/* Published & live */}
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg">
              {t("report.published.title", { count: report.published.length })}
            </h2>
            <p className="text-xs text-muted-foreground mb-3">{t("report.published.note")}</p>
            {report.published.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("report.published.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {report.published.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                    <span>
                      {p.liveUrl && /^https?:\/\//i.test(p.liveUrl) ? (
                        <a
                          href={p.liveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                      <span className="text-muted-foreground"> · {p.publishedAt.slice(0, 10)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Numbers */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={t("report.stat.drafted")} value={String(report.draftedCount)} />
            <Stat label={t("report.stat.scheduled")} value={String(report.scheduledCount)} />
            <Stat
              label={t("report.stat.linksLive")}
              value={report.linksLive === null ? "—" : String(report.linksLive)}
            />
            <Stat
              label={t("report.stat.gscClicks")}
              value={report.gsc ? String(report.gsc.totalClicks) : "—"}
            />
          </section>

          {/* GSC snapshot */}
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg mb-2">{t("report.gsc.title")}</h2>
            {report.gsc ? (
              <div className="text-sm space-y-1">
                <p>
                  {t("report.gsc.line", {
                    clicks: report.gsc.totalClicks,
                    impressions: report.gsc.totalImpressions,
                    position: report.gsc.averagePosition.toFixed(1),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {report.gsc.rangeLabel ? `${report.gsc.rangeLabel} · ` : ""}
                  {t("report.gsc.importedAt", { date: report.gsc.importedAt.slice(0, 10) })}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("report.gsc.empty")}</p>
            )}
          </section>

          {/* Next month */}
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg mb-3">
              {t("report.plan.title", { count: report.nextMonthPlan.length })}
            </h2>
            {report.nextMonthPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("report.plan.empty")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {report.nextMonthPlan.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-muted-foreground w-24 shrink-0">{p.plannedDate}</span>
                    <span>{p.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted-foreground print:block">{t("report.footer")}</p>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-2xl font-display">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-[0.14em] mt-1">{label}</div>
    </div>
  );
}
