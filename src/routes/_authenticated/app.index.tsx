import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { generateSeoOpportunities } from "@/lib/mock-ai";
import { ArrowUpRight, Plus, Sparkles, FileText, CheckCircle2, Upload, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Milo Growth" },
      {
        name: "description",
        content:
          "Overview of your active project, SEO opportunities, drafts, approvals and exported content.",
      },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: typeof Sparkles;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-accent" strokeWidth={1.6} />
      </div>
      <div className="mt-3 font-display text-3xl text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const t = useT();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const projects = useStore((s) => s.projects);
  const services = useStore((s) =>
    s.services.filter((x) => x.projectId === activeProjectId),
  );
  const opportunities = useStore((s) =>
    s.opportunities.filter((o) => o.projectId === activeProjectId),
  );
  const calendar = useStore((s) =>
    s.calendar.filter((c) => c.projectId === activeProjectId),
  );
  const content = useStore((s) =>
    s.content.filter((c) => c.projectId === activeProjectId),
  );
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const [busy, setBusy] = useState(false);

  if (!active) {
    const steps = [
      "Create your first project — name your business and define brand context.",
      "Add the services or products you actually sell.",
      "Generate your first batch of SEO opportunities.",
      "Plan the month in the content calendar.",
      "Draft, approve and export your first asset.",
    ];
    return (
      <AppShell
        title={t("dashboard.welcomeTitle")}
        description={t("dashboard.welcomeDesc")}
      >
        <div className="mx-auto max-w-2xl mt-6 rounded-xl border border-border bg-card p-8 md:p-10">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {t("onboarding.getStarted")}
          </div>
          <h2 className="mt-2 font-display text-3xl">{t("dashboard.createFirst")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            A project represents one business, brand or website. You can run up to {" "}
            five projects on a single account.
          </p>
          <ol className="mt-7 space-y-3">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-[11px] font-medium text-gold">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-foreground/85">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={() => navigate({ to: "/app/setup", search: { new: true } })}>
              <Plus className="h-4 w-4" />
              {t("dashboard.createFirst")}
            </Button>
            <span className="text-xs text-muted-foreground">Takes about 2 minutes.</span>
          </div>
        </div>
      </AppShell>
    );
  }

  const drafts = content.filter((c) => c.status === "Draft" || c.status === "In Review").length;
  const approved = content.filter((c) => c.status === "Approved").length;
  const exported = content.filter((c) => c.status === "Exported").length;

  const recent = [...content].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <AppShell
      title={t("dashboard.title")}
      description={`${active.businessName} · ${active.mainLocation}`}
      actions={
        <>
          <Button
            variant="outline"
            onClick={async () => {
              setBusy(true);
              try {
                await generateSeoOpportunities(activeProjectId);
                toast.success("New SEO opportunities generated");
                navigate({ to: "/app/opportunities" });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Generation failed");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            <Sparkles className="h-4 w-4" />
            {t("dashboard.generateOpps")}
          </Button>
          <Button onClick={() => navigate({ to: "/app/setup", search: { new: true } })}>
            <Plus className="h-4 w-4" />
            {t("dashboard.createNew")}
          </Button>
        </>
      }
    >
      {(() => {
        const next = services.length === 0
          ? { label: "Add services or products", body: "Tell the AI what this business actually sells so opportunities stay grounded.", to: "/app/services" as const, cta: "Open services" }
          : opportunities.length === 0
          ? { label: "Generate SEO opportunities", body: "Get your first batch of structured visibility ideas for this project.", to: "/app/opportunities" as const, cta: "Open opportunities" }
          : calendar.length === 0
          ? { label: "Plan the month", body: "Turn opportunities into a 30-day content calendar grouped by week.", to: "/app/calendar" as const, cta: "Open calendar" }
          : content.length === 0
          ? { label: "Draft your first asset", body: "Generate a brief or draft from one of your opportunities.", to: "/app/opportunities" as const, cta: "Open opportunities" }
          : approved === 0
          ? { label: "Approve a draft", body: "Review a draft in the editor and mark it Approved when it is ready.", to: "/app/editor" as const, cta: "Open editor" }
          : null;
        if (!next) return null;
        return (
          <div className="mb-6 rounded-lg border border-gold/40 bg-gold/5 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-gold">{t("dashboard.nextStep")}</div>
              <div className="mt-1 font-medium text-foreground">{next.label}</div>
              <div className="text-sm text-muted-foreground">{next.body}</div>
            </div>
            <Button size="sm" onClick={() => navigate({ to: next.to })}>{next.cta}</Button>
          </div>
        );
      })()}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label={t("dashboard.stat.activeProject")} value={active.name} icon={Sparkles} hint={active.primaryLanguage} />
        <StatCard label={t("dashboard.stat.seoOpportunities")} value={opportunities.length} icon={Sparkles} hint={`${opportunities.filter(o => o.priority === "High").length} high priority`} />
        <StatCard label={t("dashboard.stat.drafts")} value={drafts} icon={FileEdit} />
        <StatCard label={t("dashboard.stat.approved")} value={approved} icon={CheckCircle2} />
        <StatCard label={t("dashboard.stat.exported")} value={exported} icon={Upload} />
      </div>

      <section className="mt-10 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("dashboard.recentContent")}</div>
              <h2 className="font-display text-lg mt-0.5">{t("dashboard.latestAssets")}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/editor" })}>
              {t("dashboard.openEditor")} <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {recent.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted-foreground">
                {t("dashboard.noContent")}
              </li>
            ) : (
              recent.map((c) => (
                <li key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{c.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t(`status.${c.status}`)} · {formatDate(c.updatedAt)}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/editor", search: { id: c.id } as never })}>
                    {t("dashboard.openEditor")}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Programme snapshot
          </div>
          <h2 className="mt-0.5 font-display text-lg">{t("dashboard.thisWeek")}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("dashboard.languages")}</span>
              <span>{[active.primaryLanguage, ...active.additionalLanguages].join(", ")}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("dashboard.targetLocations")}</span>
              <span className="text-right">{active.targetLocations.slice(0, 3).join(", ")}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("dashboard.tone")}</span>
              <span className="text-right">{active.toneOfVoice.split(".")[0]}</span>
            </li>
          </ul>
          <div className="my-5 gold-rule" />
          <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/app/calendar" })}>
            <FileText className="h-4 w-4" /> {t("dashboard.reviewCalendar")}
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
