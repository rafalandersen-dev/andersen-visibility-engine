import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import {
  computeLaunchChecklist,
  computeConnectionStatuses,
  type LaunchInputs,
  type ChecklistState,
  type ConnectionStatusCard,
} from "@/lib/launch";
import { getAnalyticsSummaryFn } from "@/lib/analytics.functions";
import { getPaddleStatusFn } from "@/lib/billing.functions";
import { getAiRouterStatusFn } from "@/lib/ai.functions";
import { CheckCircle2, Circle, MinusCircle, ArrowUpRight, BookOpen, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/app/launch-checklist")({
  head: () => ({
    meta: [
      { title: "Launch checklist — Milo Growth" },
      { name: "description", content: "Beta launch readiness: setup, content, publishing, measurement, authority and billing status." },
    ],
  }),
  component: LaunchChecklistPage,
});

function StateIcon({ state }: { state: ChecklistState }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={1.8} />;
  if (state === "optional") return <MinusCircle className="h-4 w-4 text-muted-foreground/60 shrink-0" strokeWidth={1.8} />;
  return <Circle className="h-4 w-4 text-amber-500 shrink-0" strokeWidth={1.8} />;
}

function levelClasses(level: ConnectionStatusCard["level"]): string {
  if (level === "ok") return "border-emerald-500/30 bg-emerald-500/5";
  if (level === "partial") return "border-amber-500/30 bg-amber-500/5";
  return "border-border bg-card";
}

function LaunchChecklistPage() {
  const t = useT();
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const projects = useStore((s) => s.projects);
  const services = useStore((s) => s.services.filter((x) => x.projectId === activeProjectId));
  const opportunities = useStore((s) => s.opportunities.filter((o) => o.projectId === activeProjectId));
  const content = useStore((s) => s.content.filter((c) => c.projectId === activeProjectId));
  const audits = useStore((s) => s.audits.filter((a) => a.projectId === activeProjectId));
  const authorityOpportunities = useStore((s) =>
    s.authorityOpportunities.filter((a) => a.projectId === activeProjectId),
  );
  const billingProfile = useStore((s) => s.billingProfile);
  const subscription = useStore((s) => s.subscription);
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  const [analyticsEventCount, setAnalyticsEventCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!activeProjectId) return;
    getAnalyticsSummaryFn({ data: { projectId: activeProjectId } })
      .then((res) => {
        if (cancelled) return;
        setAnalyticsEventCount(res.hasData ? Math.max(1, res.visits30) : 0);
      })
      .catch(() => {
        if (!cancelled) setAnalyticsEventCount(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  if (!active) {
    return (
      <AppShell title={t("launch.title")} description={t("launch.subtitle")}>
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("launch.noProject")}</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup", search: { new: true } })}>
            {t("dashboard.createFirst")}
          </Button>
        </div>
      </AppShell>
    );
  }

  const inputs: LaunchInputs = {
    project: active,
    services,
    opportunities,
    content,
    audits,
    authorityOpportunities,
    billingProfile,
    subscription,
    isOwner,
    analyticsEventCount,
  };

  const { sections, progress } = computeLaunchChecklist(inputs);
  const statuses = computeConnectionStatuses(inputs);

  return (
    <AppShell
      title={t("launch.title")}
      description={t("launch.subtitle")}
      actions={
        <Link to="/app/beta-notes">
          <Button variant="outline">
            <BookOpen className="h-4 w-4" />
            {t("launch.betaNotesCta")}
          </Button>
        </Link>
      }
    >
      {/* Progress */}
      <div className="rounded-lg border border-gold/40 bg-gold/5 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-gold">{t("launch.readiness")}</div>
            <div className="mt-1 font-display text-2xl">
              {progress.requiredDone}/{progress.requiredTotal} {t("launch.essentialsDone")}
            </div>
            <div className="text-sm text-muted-foreground">
              {t("launch.optionalDone", { n: progress.optionalDone })}
            </div>
          </div>
          <div className="font-display text-3xl text-foreground">{progress.percent}%</div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {/* Connection / setup status cards */}
      <section className="mt-8">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("launch.statusTitle")}</div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {statuses.map((s) => (
            <Link
              key={s.key}
              to={s.to ?? "/app/launch-checklist"}
              className={`rounded-lg border p-4 transition-colors hover:border-foreground/30 ${levelClasses(s.level)}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-foreground">{t(s.labelKey)}</div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    s.level === "ok" ? "bg-emerald-500" : s.level === "partial" ? "bg-amber-500" : "bg-muted-foreground/40"
                  }`}
                />
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">{t(s.detailKey)}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Checklist sections */}
      <section className="mt-8 grid lg:grid-cols-2 gap-5">
        {sections.map((sec) => (
          <div key={sec.key} className="rounded-lg border border-border bg-card">
            <div className="px-5 py-3 border-b border-border text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t(sec.titleKey)}
            </div>
            <ul className="divide-y divide-border">
              {sec.items.map((it) => (
                <li key={it.key} className="px-5 py-3 flex items-start gap-3">
                  <div className="pt-0.5"><StateIcon state={it.state} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{t(it.labelKey)}</span>
                      {it.state === "optional" ? (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {t("launch.optional")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{t(it.descKey)}</div>
                  </div>
                  {it.to ? (
                    <Link to={it.to} className="shrink-0">
                      <Button variant="ghost" size="sm">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {isOwner ? <OwnerQaPanel inputs={inputs} /> : null}
    </AppShell>
  );
}

function OwnerQaPanel({ inputs }: { inputs: LaunchInputs }) {
  const t = useT();
  const [paddle, setPaddle] = useState<{ configured: boolean; environment: string } | null>(null);
  const [ai, setAi] = useState<{ candidateConfigured: boolean; candidateModel?: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPaddleStatusFn().then((r) => !cancelled && setPaddle(r)).catch(() => {});
    getAiRouterStatusFn().then((r) => !cancelled && setAi(r)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const p = inputs.project;
  const liveCount = inputs.content.filter((c) => c.livePublishStatus === "published" || c.liveUrl).length;
  const sentCount = inputs.content.filter((c) => c.publishStatus === "sent").length;
  const gscImports = p.gscLite?.imports?.length ?? 0;

  const rows: { label: string; value: string }[] = [
    { label: t("launch.qa.projectId"), value: p.id },
    { label: t("launch.qa.plan"), value: inputs.subscription?.planId ?? "freePreview" },
    { label: t("launch.qa.subStatus"), value: inputs.subscription?.status ?? "freePreview" },
    { label: t("launch.qa.connector"), value: p.connectorType ?? "custom" },
    { label: t("launch.qa.sent"), value: String(sentCount) },
    { label: t("launch.qa.live"), value: String(liveCount) },
    { label: t("launch.qa.analyticsEvents"), value: inputs.analyticsEventCount === undefined ? "—" : String(inputs.analyticsEventCount) },
    { label: t("launch.qa.gscImports"), value: String(gscImports) },
    { label: t("launch.qa.authorityCount"), value: String(inputs.authorityOpportunities.length) },
    { label: t("launch.qa.contentCount"), value: String(inputs.content.length) },
    { label: t("launch.qa.aiCandidate"), value: ai ? (ai.candidateConfigured ? `${t("launch.qa.yes")} (${ai.candidateModel ?? "?"})` : t("launch.qa.no")) : "…" },
    { label: t("launch.qa.paddle"), value: paddle ? (paddle.configured ? `${t("launch.qa.yes")} (${paddle.environment})` : t("launch.qa.no")) : "…" },
  ];

  return (
    <section className="mt-8 rounded-lg border border-border bg-card">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-accent" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("launch.qa.title")}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{t("launch.qa.ownerOnly")}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 px-5 py-4 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 border-b border-border/50 py-1">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-mono text-foreground/90 truncate text-right">{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
