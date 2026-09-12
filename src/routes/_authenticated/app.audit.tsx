import { TechnicalPerformancePanel } from "@/components/TechnicalPerformancePanel";
import { GoogleIndexPanel } from "@/components/GoogleIndexPanel";
import { TechnicalCrawlPanel } from "@/components/TechnicalCrawlPanel";
import { LocationCoveragePanel } from "@/components/LocationCoveragePanel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { AuditCategory, AuditFinding } from "@/lib/types";
import {
  runSiteAudit,
  createOpportunityFromFinding,
  createOpportunitiesFromTopFixes,
} from "@/lib/mock-ai";
import { Gauge, Loader2, Sparkles, AlertTriangle, Check, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/audit")({
  head: () => ({
    meta: [
      { title: "On-page Review — Milo Growth" },
      {
        name: "description",
        content:
          "Review your homepage and business details, and turn on-page gaps into growth opportunities. Not a full technical crawl.",
      },
    ],
  }),
  component: AuditPage,
});

const CATEGORY_ORDER: AuditCategory[] = [
  "Business Clarity",
  "SEO Basics",
  "Local Visibility",
  "AI Readiness",
  "Conversion & Trust",
];

function AuditPage() {
  const t = useT();
  const navigate = useNavigate();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const audit = useStore((s) => s.audits.find((a) => a.projectId === s.activeProjectId));

  const [websiteUrl, setWebsiteUrl] = useState(project?.websiteUrl ?? "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyFindingId, setBusyFindingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<AuditCategory, AuditFinding[]>();
    (audit?.findings ?? []).forEach((f) => {
      map.set(f.category, [...(map.get(f.category) ?? []), f]);
    });
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(
      ([, list]) => list.length,
    );
  }, [audit]);

  const remainingTopFixes = useMemo(
    () =>
      (audit?.findings ?? []).filter(
        (f) =>
          !audit?.convertedFindingIds.includes(f.id) &&
          (f.priority === "High" || f.priority === "Medium"),
      ).length,
    [audit],
  );

  async function runAudit() {
    if (!activeProjectId) return;
    setRunning(true);
    setError(null);
    try {
      await runSiteAudit(activeProjectId, websiteUrl);
      toast.success(t("auditScreen.complete"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("auditScreen.failed");
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  async function convertOne(findingId: string) {
    setBusyFindingId(findingId);
    try {
      await createOpportunityFromFinding(activeProjectId, findingId);
      toast.success(t("evidenceScreen.created"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("evidenceScreen.createFailed"));
    } finally {
      setBusyFindingId(null);
    }
  }

  async function convertTopFixes() {
    setBulkBusy(true);
    try {
      const opps = await createOpportunitiesFromTopFixes(activeProjectId);
      toast.success(t("auditScreen.bulkCreated", { count: opps.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("evidenceScreen.bulkFailed"));
    } finally {
      setBulkBusy(false);
    }
  }

  // No project yet → guide to setup.
  if (!project) {
    return (
      <AppShell title={t("auditScreen.title")} description={t("auditScreen.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Gauge className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("evidenceScreen.setupTitle")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            {t("auditScreen.setupHelp")}
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>
            {t("evidenceScreen.setup")}
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("auditScreen.title")} description={t("auditScreen.subtitle")}>
      <LocationCoveragePanel project={project} />
      <TechnicalCrawlPanel projectId={project.id} />
      <GoogleIndexPanel project={project} />
      <TechnicalPerformancePanel project={project} />
      {/* Input card */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <label
              htmlFor="audit-url"
              className="text-xs uppercase tracking-[0.16em] text-muted-foreground"
            >
              {t("auditScreen.website")}
            </label>
            <Input
              id="audit-url"
              className="mt-1.5 max-w-xl"
              placeholder="https://yourbusiness.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              disabled={running}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("auditScreen.inputHelp", {
                business: project.businessName || project.name,
                location: project.mainLocation ? ` · ${project.mainLocation}` : "",
              })}
            </p>
          </div>
          <Button onClick={runAudit} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : audit ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Gauge className="h-4 w-4" />
            )}
            {t(running ? "auditScreen.running" : audit ? "auditScreen.rerun" : "auditScreen.run")}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && !running ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" strokeWidth={1.5} />
          <div className="mt-2 font-display text-lg">{t("auditScreen.incomplete")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button className="mt-4" variant="outline" onClick={runAudit}>
            <RefreshCw className="h-4 w-4" /> {t("evidenceScreen.retry")}
          </Button>
        </div>
      ) : null}

      {/* Empty explainer (no audit yet, no error) */}
      {!audit && !error ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("auditScreen.first")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
            {t("auditScreen.emptyHelp")}
          </p>
        </div>
      ) : null}

      {/* Results */}
      {audit && !error ? (
        <div className="space-y-8">
          {/* Captured homepage text and business-input-only advice retain distinct provenance. */}
          {audit.fetchedWebsite ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-xs text-foreground/75">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>{t("auditScreen.readProof")}</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground/80">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                {audit.note || t("auditScreen.unreadFallback")}{" "}
                <strong className="font-medium">{t("auditScreen.unreadHelp")}</strong>
              </span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">{t("auditScreen.scoreHelp")}</p>
          {/* Score cards — clearly badged indicative when the site was not read. */}
          <div>
            {!audit.fetchedWebsite ? (
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600/90">
                {t("auditScreen.indicative")}
              </div>
            ) : null}
            <div
              className={
                "grid grid-cols-2 gap-4 md:grid-cols-5 " +
                (!audit.fetchedWebsite ? "opacity-70" : "")
              }
            >
              <ScoreCard
                label={t("auditScreen.overall")}
                score={audit.overallScore}
                primary
                indicative={!audit.fetchedWebsite}
              />
              <ScoreCard label="SEO" score={audit.seoScore} indicative={!audit.fetchedWebsite} />
              <ScoreCard
                label={t("evidenceScreen.competitor.score.local")}
                score={audit.localScore}
                indicative={!audit.fetchedWebsite}
              />
              <ScoreCard
                label={t("evidenceScreen.title")}
                score={audit.aiReadinessScore}
                indicative={!audit.fetchedWebsite}
              />
              <ScoreCard
                label={t("evidenceScreen.competitor.score.conversion")}
                score={audit.conversionScore}
                indicative={!audit.fetchedWebsite}
              />
            </div>
          </div>

          {audit.summary ? (
            <p className="text-sm text-muted-foreground max-w-3xl">{audit.summary}</p>
          ) : null}

          {/* Top fixes */}
          {audit.topFixes.length ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("evidenceScreen.priority")}
                  </div>
                  <h2 className="font-display text-lg">{t("auditScreen.topFixes")}</h2>
                </div>
                <Button
                  size="sm"
                  onClick={convertTopFixes}
                  disabled={bulkBusy || remainingTopFixes === 0}
                >
                  {bulkBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {t("auditScreen.createTop")}
                </Button>
              </div>
              <ul className="mt-4 space-y-2">
                {audit.topFixes.map((fix, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-accent/30 text-[11px] flex items-center justify-center text-accent-foreground">
                      {i + 1}
                    </span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
              {remainingTopFixes === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("auditScreen.noneRemaining")}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Findings grouped by category */}
          <div className="space-y-8">
            {grouped.map(([category, list]) => (
              <section key={category}>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                  {t(`auditScreen.category.${category}`)}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {list.map((f) => {
                    const converted = audit.convertedFindingIds.includes(f.id);
                    return (
                      <article
                        key={f.id}
                        className="rounded-lg border border-border bg-card p-5 flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base leading-snug text-foreground">
                            {f.title}
                          </h3>
                          <SeverityBadge severity={f.severity} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{f.explanation}</p>
                        <div className="mt-3 rounded-md bg-secondary/50 border border-border p-3 text-sm">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {t("evidenceScreen.recommendation")}
                          </div>
                          <div className="mt-1 text-foreground/85">{f.recommendation}</div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div>
                            <span className="text-foreground/70">
                              {t("evidenceScreen.suggested")}
                            </span>{" "}
                            {f.suggestedOpportunityTitle}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Tag>{t(`evidenceScreen.contentType.${f.suggestedContentType}`)}</Tag>
                            <Tag>{t(`planScreen.intent.${f.suggestedSearchIntent}`)}</Tag>
                            <Tag tone={f.priority === "High" ? "gold" : "muted"}>
                              {t(`planScreen.priority.${f.priority}`)}
                            </Tag>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-border">
                          {converted ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled
                              className="text-muted-foreground"
                            >
                              <Check className="h-3.5 w-3.5" /> {t("evidenceScreen.created")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyFindingId === f.id}
                              onClick={() => convertOne(f.id)}
                            >
                              {busyFindingId === f.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              {t("evidenceScreen.create")}
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="pt-2">
            <Link
              to="/app/plan"
              className="text-sm text-foreground/70 underline underline-offset-4 hover:text-foreground"
            >
              {t("evidenceScreen.view")}
            </Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function ScoreCard({
  label,
  score,
  primary,
  indicative,
}: {
  label: string;
  score: number;
  primary?: boolean;
  indicative?: boolean;
}) {
  const t = useT();
  return (
    <div
      className={
        "rounded-lg border bg-card p-4 " + (primary ? "border-accent/40" : "border-border")
      }
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        {indicative ? (
          <span className="ml-1 text-amber-600/80">{t("auditScreen.estimate")}</span>
        ) : null}
      </div>
      <div className="mt-1.5 font-display text-3xl text-foreground">
        {score}
        <span className="text-base text-muted-foreground">/100</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-gold/80 transition-all"
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "High" | "Medium" | "Low" }) {
  const t = useT();
  const cls =
    severity === "High"
      ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : severity === "Medium"
        ? "bg-secondary border-border text-secondary-foreground"
        : "bg-muted border-border text-muted-foreground";
  return (
    <span
      className={`shrink-0 text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}
    >
      {t(`planScreen.priority.${severity}`)}
    </span>
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
