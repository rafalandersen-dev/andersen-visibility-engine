import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { CompetitorGapCategory, CompetitorGap } from "@/lib/types";
import {
  runCompetitorGap,
  createOpportunityFromGap,
  createOpportunitiesFromTopGaps,
} from "@/lib/mock-ai";
import { Swords, Loader2, Plus, Check, AlertTriangle, RefreshCw, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/competitors")({
  head: () => ({
    meta: [
      { title: "Competitors — Milo Growth" },
      {
        name: "description",
        content: "Compare your business to competitors and turn the gaps into growth opportunities.",
      },
    ],
  }),
  component: CompetitorsPage,
});

const CATEGORY_ORDER: CompetitorGapCategory[] = [
  "Service Coverage",
  "FAQ & Answers",
  "Local Positioning",
  "Trust & Authority",
  "Conversion & Offer",
  "Content Themes",
];

function CompetitorsPage() {
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const activeProjectId = useStore((s) => s.activeProjectId);
  const analysis = useStore((s) => s.competitorAnalyses.find((a) => a.projectId === s.activeProjectId));

  const [urls, setUrls] = useState<string[]>(() => {
    const existing = analysis?.competitorUrls ?? [];
    return [existing[0] ?? "", existing[1] ?? "", existing[2] ?? ""];
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyGapId, setBusyGapId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const setUrl = (i: number, value: string) =>
    setUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));

  const grouped = useMemo(() => {
    const map = new Map<CompetitorGapCategory, CompetitorGap[]>();
    (analysis?.gaps ?? []).forEach((g) => {
      map.set(g.category, [...(map.get(g.category) ?? []), g]);
    });
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(([, list]) => list.length);
  }, [analysis]);

  const remainingTopGaps = useMemo(
    () =>
      (analysis?.gaps ?? []).filter(
        (g) =>
          !analysis?.convertedGapIds.includes(g.id) &&
          (g.priority === "High" || g.priority === "Medium"),
      ).length,
    [analysis],
  );

  async function runAnalysis() {
    if (!activeProjectId) return;
    const provided = urls.map((u) => u.trim()).filter(Boolean);
    if (provided.length === 0) {
      toast.error("Add at least one competitor URL.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      await runCompetitorGap(activeProjectId, provided);
      toast.success("Competitor analysis complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  async function convertOne(gapId: string) {
    setBusyGapId(gapId);
    try {
      await createOpportunityFromGap(activeProjectId, gapId);
      toast.success("Opportunity created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunity");
    } finally {
      setBusyGapId(null);
    }
  }

  async function convertTopGaps() {
    setBulkBusy(true);
    try {
      const opps = await createOpportunitiesFromTopGaps(activeProjectId);
      toast.success(`Created ${opps.length} ${opps.length === 1 ? "opportunity" : "opportunities"} from top gaps`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunities");
    } finally {
      setBulkBusy(false);
    }
  }

  if (!project) {
    return (
      <AppShell
        title="Competitors"
        description="See what competitors explain better and turn the gaps into growth opportunities."
      >
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Swords className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Set up a project first</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Competitor analysis compares one business against its rivals. Create a project with your
            business details first.
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
      title="Competitors"
      description="See what competitors explain better and turn the gaps into growth opportunities."
    >
      {/* Input card */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Competitor URLs (up to 3)
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Input
              key={i}
              placeholder={`https://competitor${i + 1}.com`}
              value={urls[i] ?? ""}
              onChange={(e) => setUrl(i, e.target.value)}
              disabled={running}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground max-w-xl">
            Comparing <span className="text-foreground/80">{project.businessName || project.name}</span>
            {project.mainLocation ? ` · ${project.mainLocation}` : ""}. We read each competitor’s
            homepage when possible; failed fetches are skipped.
          </p>
          <Button onClick={runAnalysis} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Swords className="h-4 w-4" />
            )}
            {running ? "Analyzing…" : analysis ? "Re-run analysis" : "Run analysis"}
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
          <Swords className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Run your first competitor analysis</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
            Add 1–3 competitor websites. Milo compares service coverage, FAQs, local positioning,
            trust signals, conversion and content themes — then hands you prioritized gaps you can
            turn into opportunities in one click.
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <ScoreCard label="Overall Gap" score={analysis.overallGapScore} primary />
            <ScoreCard label="Service" score={analysis.serviceGapScore} />
            <ScoreCard label="Content" score={analysis.contentGapScore} />
            <ScoreCard label="Local" score={analysis.localGapScore} />
            <ScoreCard label="Trust" score={analysis.trustGapScore} />
            <ScoreCard label="Conversion" score={analysis.conversionGapScore} />
          </div>

          {analysis.summary ? (
            <p className="text-sm text-muted-foreground max-w-3xl">{analysis.summary}</p>
          ) : null}

          {/* Competitor snapshots */}
          {analysis.competitorSnapshots.length ? (
            <section>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                Competitors analyzed
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {analysis.competitorSnapshots.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-3.5 w-3.5 text-gold/80 shrink-0" />
                        <span className="text-sm font-medium truncate">{c.title || c.competitorUrl}</span>
                      </div>
                      <span
                        className={
                          "shrink-0 text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border " +
                          (c.fetchStatus === "fetched"
                            ? "bg-secondary border-border text-secondary-foreground"
                            : "bg-muted border-border text-muted-foreground")
                        }
                      >
                        {c.fetchStatus}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{c.competitorUrl}</div>
                    <p className="mt-2 text-sm text-foreground/80">{c.detectedPositioning}</p>
                    {c.notableStrengths.length ? (
                      <ul className="mt-2 space-y-1">
                        {c.notableStrengths.slice(0, 4).map((sx, j) => (
                          <li key={j} className="text-xs text-muted-foreground flex gap-1.5">
                            <span className="text-gold/80">•</span>
                            <span>{sx}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Top gaps */}
          {analysis.topGaps.length ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Priority
                  </div>
                  <h2 className="font-display text-lg">Top gaps</h2>
                </div>
                <Button size="sm" onClick={convertTopGaps} disabled={bulkBusy || remainingTopGaps === 0}>
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create opportunities from top gaps
                </Button>
              </div>
              <ul className="mt-4 space-y-2">
                {analysis.topGaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-accent/30 text-[11px] flex items-center justify-center text-accent-foreground">
                      {i + 1}
                    </span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
              {remainingTopGaps === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  All high/medium gaps have been turned into opportunities.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Gaps grouped by category */}
          <div className="space-y-8">
            {grouped.map(([category, list]) => (
              <section key={category}>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                  {category}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {list.map((g) => {
                    const converted = analysis.convertedGapIds.includes(g.id);
                    return (
                      <article key={g.id} className="rounded-lg border border-border bg-card p-5 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base leading-snug text-foreground">{g.title}</h3>
                          <SeverityBadge severity={g.severity} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{g.explanation}</p>
                        <div className="mt-3 rounded-md bg-secondary/40 border border-border p-3 text-sm">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Competitor evidence
                          </div>
                          <div className="mt-1 text-foreground/80">{g.competitorEvidence}</div>
                        </div>
                        <div className="mt-3 rounded-md bg-secondary/50 border border-border p-3 text-sm">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Recommendation
                          </div>
                          <div className="mt-1 text-foreground/85">{g.recommendation}</div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div>
                            <span className="text-foreground/70">Suggested:</span> {g.suggestedOpportunityTitle}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Tag>{g.suggestedContentType}</Tag>
                            <Tag>{g.suggestedSearchIntent}</Tag>
                            <Tag tone={g.priority === "High" ? "gold" : "muted"}>{g.priority}</Tag>
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
                              disabled={busyGapId === g.id}
                              onClick={() => convertOne(g.id)}
                            >
                              {busyGapId === g.id ? (
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
