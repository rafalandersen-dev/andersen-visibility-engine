import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { AuthorityCategory, AuthorityItem } from "@/lib/types";
import {
  runAuthorityAnalysis,
  createOpportunityFromAuthorityItem,
  createOpportunitiesFromTopAuthority,
} from "@/lib/mock-ai";
import { Award, Loader2, Plus, Check, AlertTriangle, RefreshCw, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/authority")({
  head: () => ({
    meta: [
      { title: "Authority — Milo Growth" },
      {
        name: "description",
        content: "Find places and angles that build your business credibility beyond your website.",
      },
    ],
  }),
  component: AuthorityPage,
});

const CATEGORY_ORDER: AuthorityCategory[] = [
  "Local Directories & Citations",
  "Industry Directories",
  "Review & Reputation",
  "Partner & Supplier Links",
  "Associations & Communities",
  "PR & Story",
  "Trust Signals",
  "Outreach",
];

function AuthorityPage() {
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const activeProjectId = useStore((s) => s.activeProjectId);
  const analysis = useStore((s) => s.authorityAnalyses.find((a) => a.projectId === s.activeProjectId));
  const hasAudit = useStore((s) => s.audits.some((a) => a.projectId === s.activeProjectId));
  const hasCompetitor = useStore((s) =>
    s.competitorAnalyses.some((a) => a.projectId === s.activeProjectId),
  );

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<AuthorityCategory, AuthorityItem[]>();
    (analysis?.authorityItems ?? []).forEach((it) => {
      map.set(it.category, [...(map.get(it.category) ?? []), it]);
    });
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(([, list]) => list.length);
  }, [analysis]);

  const remainingTop = useMemo(
    () =>
      (analysis?.authorityItems ?? []).filter(
        (i) =>
          !analysis?.convertedItemIds.includes(i.id) &&
          (i.priority === "High" || i.priority === "Medium"),
      ).length,
    [analysis],
  );

  async function runAnalysis() {
    if (!activeProjectId) return;
    setRunning(true);
    setError(null);
    try {
      await runAuthorityAnalysis(activeProjectId);
      toast.success("Authority analysis complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  async function convertOne(itemId: string) {
    setBusyItemId(itemId);
    try {
      await createOpportunityFromAuthorityItem(activeProjectId, itemId);
      toast.success("Opportunity created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunity");
    } finally {
      setBusyItemId(null);
    }
  }

  async function convertTop() {
    setBulkBusy(true);
    try {
      const opps = await createOpportunitiesFromTopAuthority(activeProjectId);
      toast.success(`Created ${opps.length} ${opps.length === 1 ? "opportunity" : "opportunities"} from top actions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunities");
    } finally {
      setBulkBusy(false);
    }
  }

  if (!project) {
    return (
      <AppShell
        title="Authority"
        description="Find places and angles that can build your business credibility beyond your website."
      >
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Award className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Set up a project first</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Authority analysis plans credibility-building moves for one business. Create a project
            with your business details first.
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
      title="Authority"
      description="Find places and angles that can build your business credibility beyond your website."
    >
      {/* Input card */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Authority analysis
        </div>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Milo plans authority-building moves for{" "}
          <span className="text-foreground/80">{project.businessName || project.name}</span>
          {project.mainLocation ? ` · ${project.mainLocation}` : ""} using your project details,
          services{hasAudit ? ", your Site Audit" : ""}
          {hasCompetitor ? ", your Competitor analysis" : ""} and existing opportunities. It suggests
          directories, profiles, review platforms, partnerships, associations, PR angles and trust
          signals — these are recommendations, not actions Milo performs on your behalf.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={runAnalysis} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Award className="h-4 w-4" />
            )}
            {running ? "Analyzing…" : analysis ? "Re-run analysis" : "Run authority analysis"}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && !running ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" strokeWidth={1.5} />
          <div className="mt-2 font-display text-lg">Analysis didn’t complete</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button className="mt-4" variant="outline" onClick={runAnalysis}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : null}

      {/* Empty explainer */}
      {!analysis && !error ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Award className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Run your first authority analysis</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
            Milo reviews your business and finds credibility-building opportunities beyond your
            website — local directories & citations, industry profiles, review platforms, partner
            links, associations, PR & story angles, trust signals and outreach — then hands you
            prioritized actions you can turn into opportunities in one click.
          </p>
        </div>
      ) : null}

      {/* Results */}
      {analysis && !error ? (
        <div className="space-y-8">
          {analysis.note ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground/80 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
              <span>{analysis.note}</span>
            </div>
          ) : null}

          {/* Score cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <ScoreCard label="Overall Authority" score={analysis.overallAuthorityScore} primary />
            <ScoreCard label="Local Citations" score={analysis.localCitationScore} />
            <ScoreCard label="Industry Presence" score={analysis.industryPresenceScore} />
            <ScoreCard label="Reputation" score={analysis.reputationScore} />
            <ScoreCard label="Partner Links" score={analysis.partnerLinkScore} />
            <ScoreCard label="PR Opportunities" score={analysis.prOpportunityScore} />
            <ScoreCard label="Trust Signals" score={analysis.trustSignalScore} />
          </div>

          {analysis.summary ? (
            <p className="text-sm text-muted-foreground max-w-3xl">{analysis.summary}</p>
          ) : null}

          {/* Top authority actions */}
          {analysis.topAuthorityActions.length ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Priority
                  </div>
                  <h2 className="font-display text-lg">Top authority actions</h2>
                </div>
                <Button size="sm" onClick={convertTop} disabled={bulkBusy || remainingTop === 0}>
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create opportunities from top actions
                </Button>
              </div>
              <ul className="mt-4 space-y-2">
                {analysis.topAuthorityActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-accent/30 text-[11px] flex items-center justify-center text-accent-foreground">
                      {i + 1}
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
              {remainingTop === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  All high/medium authority items have been turned into opportunities.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Items grouped by category */}
          <div className="space-y-8">
            {grouped.map(([category, list]) => (
              <section key={category}>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                  {category}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {list.map((it) => {
                    const converted = analysis.convertedItemIds.includes(it.id);
                    return (
                      <article key={it.id} className="rounded-lg border border-border bg-card p-5 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base leading-snug text-foreground">{it.title}</h3>
                          <PriorityBadge priority={it.priority} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{it.explanation}</p>

                        <div className="mt-3 rounded-md bg-secondary/40 border border-border p-3 text-sm">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                            <Target className="h-3 w-3 text-gold/80" /> Where / who
                          </div>
                          <div className="mt-1 text-foreground/85">{it.suggestedPlatformOrTarget}</div>
                        </div>

                        <div className="mt-3 rounded-md bg-secondary/50 border border-border p-3 text-sm">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Recommendation
                          </div>
                          <div className="mt-1 text-foreground/85">{it.recommendation}</div>
                        </div>

                        {it.outreachAngle ? (
                          <div className="mt-3 text-sm">
                            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Outreach angle:{" "}
                            </span>
                            <span className="text-foreground/80">{it.outreachAngle}</span>
                          </div>
                        ) : null}

                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div>
                            <span className="text-foreground/70">Suggested:</span> {it.suggestedOpportunityTitle}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Tag>{it.suggestedContentType}</Tag>
                            <Tag>{it.suggestedSearchIntent}</Tag>
                            <Tag tone={it.priority === "High" ? "gold" : "muted"}>Priority {it.priority}</Tag>
                            <Tag>Effort {it.effort}</Tag>
                            <Tag>Impact {it.expectedImpact}</Tag>
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
                              disabled={busyItemId === it.id}
                              onClick={() => convertOne(it.id)}
                            >
                              {busyItemId === it.id ? (
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

function PriorityBadge({ priority }: { priority: "High" | "Medium" | "Low" }) {
  const cls =
    priority === "High"
      ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : priority === "Medium"
        ? "bg-secondary border-border text-secondary-foreground"
        : "bg-muted border-border text-muted-foreground";
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {priority}
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
