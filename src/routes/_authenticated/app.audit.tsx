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

export const Route = createFileRoute("/_authenticated/app/audit")({
  head: () => ({
    meta: [
      { title: "Site Audit — Milo Growth" },
      {
        name: "description",
        content: "Analyze your website and turn visibility gaps into growth opportunities.",
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
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(([, list]) => list.length);
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
      toast.success("Site audit complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Audit failed. Please try again.";
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
      toast.success("Opportunity created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunity");
    } finally {
      setBusyFindingId(null);
    }
  }

  async function convertTopFixes() {
    setBulkBusy(true);
    try {
      const opps = await createOpportunitiesFromTopFixes(activeProjectId);
      toast.success(`Created ${opps.length} ${opps.length === 1 ? "opportunity" : "opportunities"} from top fixes`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunities");
    } finally {
      setBulkBusy(false);
    }
  }

  // No project yet → guide to setup.
  if (!project) {
    return (
      <AppShell
        title="Site Audit"
        description="Find what your website is missing and turn fixes into growth opportunities."
      >
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Gauge className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Set up a project first</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            The Site Audit analyzes one business at a time. Create a project with your business
            details and website to run your first audit.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>
            Go to Project Setup
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Site Audit"
      description="Find what your website is missing and turn fixes into growth opportunities."
    >
      {/* Input card */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <label htmlFor="audit-url" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Website URL
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
              Auditing <span className="text-foreground/80">{project.businessName || project.name}</span>
              {project.mainLocation ? ` · ${project.mainLocation}` : ""}. We read your homepage when
              possible; otherwise the audit uses your project details.
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
            {running ? "Running audit…" : audit ? "Re-run audit" : "Run audit"}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && !running ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" strokeWidth={1.5} />
          <div className="mt-2 font-display text-lg">Audit didn’t complete</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button className="mt-4" variant="outline" onClick={runAudit}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : null}

      {/* Empty explainer (no audit yet, no error) */}
      {!audit && !error ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Run your first Site Audit</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
            Milo checks your business clarity, SEO basics, local visibility, AI-search readiness and
            conversion & trust — then hands you prioritized fixes you can turn into content
            opportunities in one click.
          </p>
        </div>
      ) : null}

      {/* Results */}
      {audit && !error ? (
        <div className="space-y-8">
          {!audit.fetchedWebsite && audit.note ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground/80 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
              <span>{audit.note}</span>
            </div>
          ) : null}

          {/* Score cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <ScoreCard label="Overall" score={audit.overallScore} primary />
            <ScoreCard label="SEO" score={audit.seoScore} />
            <ScoreCard label="Local" score={audit.localScore} />
            <ScoreCard label="AI Readiness" score={audit.aiReadinessScore} />
            <ScoreCard label="Conversion" score={audit.conversionScore} />
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
                    Priority
                  </div>
                  <h2 className="font-display text-lg">Top fixes</h2>
                </div>
                <Button size="sm" onClick={convertTopFixes} disabled={bulkBusy || remainingTopFixes === 0}>
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create opportunities from top fixes
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
                  All high/medium fixes have been turned into opportunities.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Findings grouped by category */}
          <div className="space-y-8">
            {grouped.map(([category, list]) => (
              <section key={category}>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                  {category}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {list.map((f) => {
                    const converted = audit.convertedFindingIds.includes(f.id);
                    return (
                      <article key={f.id} className="rounded-lg border border-border bg-card p-5 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base leading-snug text-foreground">{f.title}</h3>
                          <SeverityBadge severity={f.severity} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{f.explanation}</p>
                        <div className="mt-3 rounded-md bg-secondary/50 border border-border p-3 text-sm">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Recommendation
                          </div>
                          <div className="mt-1 text-foreground/85">{f.recommendation}</div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div>
                            <span className="text-foreground/70">Suggested:</span>{" "}
                            {f.suggestedOpportunityTitle}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Tag>{f.suggestedContentType}</Tag>
                            <Tag>{f.suggestedSearchIntent}</Tag>
                            <Tag tone={f.priority === "High" ? "gold" : "muted"}>{f.priority}</Tag>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-border">
                          {converted ? (
                            <Button size="sm" variant="ghost" disabled className="text-muted-foreground">
                              <Check className="h-3.5 w-3.5" /> Opportunity created
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
                              Create opportunity
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
              to="/app/opportunities"
              className="text-sm text-foreground/70 underline underline-offset-4 hover:text-foreground"
            >
              View opportunities →
            </Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function ScoreCard({ label, score, primary }: { label: string; score: number; primary?: boolean }) {
  return (
    <div className={"rounded-lg border bg-card p-4 " + (primary ? "border-accent/40" : "border-border")}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-display text-3xl text-foreground">
        {score}
        <span className="text-base text-muted-foreground">/100</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-gold/80 transition-all" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "High" | "Medium" | "Low" }) {
  const cls =
    severity === "High"
      ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : severity === "Medium"
        ? "bg-secondary border-border text-secondary-foreground"
        : "bg-muted border-border text-muted-foreground";
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {severity}
    </span>
  );
}

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "gold" | "muted" }) {
  const cls =
    tone === "gold"
      ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : tone === "muted"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-secondary border-border text-secondary-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}
