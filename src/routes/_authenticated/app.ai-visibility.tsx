import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { AiVisibilityCategory, AiVisibilityGap, AiVisibilityPromptSet } from "@/lib/types";
import {
  runAiVisibilityAnalysis,
  createOpportunityFromVisibilityGap,
  createOpportunitiesFromTopAiActions,
} from "@/lib/mock-ai";
import { Radar, Loader2, Plus, Check, AlertTriangle, RefreshCw, MessageSquareQuote } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/ai-visibility")({
  head: () => ({
    meta: [
      { title: "AI Visibility — Milo Growth" },
      {
        name: "description",
        content: "Find the AI-search questions your business should be ready to answer.",
      },
    ],
  }),
  component: AiVisibilityPage,
});

const CATEGORY_ORDER: AiVisibilityCategory[] = [
  "Discovery Prompts",
  "Comparison Prompts",
  "Problem / Solution Prompts",
  "Local-Intent Prompts",
  "Trust & Citation Readiness",
  "Content Gaps for AI Answers",
  "Authority Gaps for AI Answers",
];

function AiVisibilityPage() {
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const activeProjectId = useStore((s) => s.activeProjectId);
  const analysis = useStore((s) => s.aiVisibilityAnalyses.find((a) => a.projectId === s.activeProjectId));

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyGapId, setBusyGapId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const groupedPrompts = useMemo(() => {
    const map = new Map<AiVisibilityCategory, AiVisibilityPromptSet[]>();
    (analysis?.promptSets ?? []).forEach((p) => {
      map.set(p.category, [...(map.get(p.category) ?? []), p]);
    });
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(([, list]) => list.length);
  }, [analysis]);

  const groupedGaps = useMemo(() => {
    const map = new Map<AiVisibilityCategory, AiVisibilityGap[]>();
    (analysis?.visibilityGaps ?? []).forEach((g) => {
      map.set(g.category, [...(map.get(g.category) ?? []), g]);
    });
    return CATEGORY_ORDER.map((c) => [c, map.get(c) ?? []] as const).filter(([, list]) => list.length);
  }, [analysis]);

  const remainingTop = useMemo(
    () =>
      (analysis?.visibilityGaps ?? []).filter(
        (g) =>
          !analysis?.convertedGapIds.includes(g.id) &&
          (g.priority === "High" || g.priority === "Medium"),
      ).length,
    [analysis],
  );

  async function runAnalysis() {
    if (!activeProjectId) return;
    setRunning(true);
    setError(null);
    try {
      await runAiVisibilityAnalysis(activeProjectId);
      toast.success("AI visibility analysis complete");
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
      await createOpportunityFromVisibilityGap(activeProjectId, gapId);
      toast.success("Opportunity created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunity");
    } finally {
      setBusyGapId(null);
    }
  }

  async function convertTop() {
    setBulkBusy(true);
    try {
      const opps = await createOpportunitiesFromTopAiActions(activeProjectId);
      toast.success(`Created ${opps.length} ${opps.length === 1 ? "opportunity" : "opportunities"} from top AI actions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunities");
    } finally {
      setBulkBusy(false);
    }
  }

  if (!project) {
    return (
      <AppShell
        title="AI Visibility"
        description="Find the AI-search questions your business should be ready to answer."
      >
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Radar className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Set up a project first</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            AI visibility planning works from one business's details. Create a project with your
            business information first.
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
      title="AI Visibility"
      description="Find the AI-search questions your business should be ready to answer."
    >
      {/* Input card */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          AI visibility analysis
        </div>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          This v1 plans AI-search <span className="text-foreground/80">readiness and prompt opportunities</span> for{" "}
          <span className="text-foreground/80">{project.businessName || project.name}</span>
          {project.mainLocation ? ` · ${project.mainLocation}` : ""} — it does <span className="text-foreground/80">not</span>{" "}
          check live ChatGPT, Perplexity, Gemini or Google AI Overviews rankings. It uses your project
          details, services and any existing Site Audit, Competitor and Authority analyses to suggest the
          questions you should be ready to answer and the likely gaps holding you back.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={runAnalysis} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {running ? "Analyzing…" : analysis ? "Re-run analysis" : "Run AI visibility analysis"}
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
          <Radar className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">Run your first AI visibility analysis</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">
            Milo maps the AI-search questions your business should be a good answer for — discovery,
            comparison, problem-solving and local prompts — then flags the likely readiness, content and
            authority gaps that may keep AI assistants from citing you, with actions you can turn into
            opportunities in one click. This is readiness planning, not live AI rank tracking.
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
            <ScoreCard label="Overall AI Visibility" score={analysis.overallAiVisibilityScore} primary />
            <ScoreCard label="Prompt Coverage" score={analysis.promptCoverageScore} />
            <ScoreCard label="Answer Readiness" score={analysis.answerReadinessScore} />
            <ScoreCard label="Local AI Readiness" score={analysis.localAiReadinessScore} />
            <ScoreCard label="Trust & Citation" score={analysis.trustCitationScore} />
            <ScoreCard label="Content Gaps" score={analysis.contentGapScore} />
            <ScoreCard label="Authority Gaps" score={analysis.authorityGapScore} />
          </div>

          {analysis.summary ? (
            <p className="text-sm text-muted-foreground max-w-3xl">{analysis.summary}</p>
          ) : null}

          {/* Prompt sets */}
          {groupedPrompts.length ? (
            <section className="space-y-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Readiness planning
                </div>
                <h2 className="font-display text-lg">AI-search prompts to be ready for</h2>
                <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                  Questions people are likely to ask AI assistants. “Readiness” is an estimate of how well
                  your current content could be cited — not a live AI ranking.
                </p>
              </div>
              {groupedPrompts.map(([category, list]) => (
                <div key={category}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                    {category}
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {list.map((p) => (
                      <article key={p.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-start gap-2">
                          <MessageSquareQuote className="h-4 w-4 mt-0.5 text-gold/80 shrink-0" />
                          <p className="text-sm text-foreground/90">{p.prompt}</p>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{p.whyItMatters}</p>
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="text-foreground/70">Source readiness:</span>{" "}
                          {p.recommendedSourcePageOrAsset}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Tag>{p.language}</Tag>
                          <Tag>{p.intent}</Tag>
                          <ReadinessTag readiness={p.readiness} />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {/* Top AI visibility actions */}
          {analysis.topAiVisibilityActions.length ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Priority
                  </div>
                  <h2 className="font-display text-lg">Top AI visibility actions</h2>
                </div>
                <Button size="sm" onClick={convertTop} disabled={bulkBusy || remainingTop === 0}>
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create opportunities from top AI actions
                </Button>
              </div>
              <ul className="mt-4 space-y-2">
                {analysis.topAiVisibilityActions.map((a, i) => (
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
                  All high/medium AI visibility gaps have been turned into opportunities.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Visibility gaps grouped by category */}
          {groupedGaps.length ? (
            <section className="space-y-8">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Likely gaps
                </div>
                <h2 className="font-display text-lg">AI visibility gaps</h2>
              </div>
              {groupedGaps.map(([category, list]) => (
                <div key={category}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                    {category}
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {list.map((g) => {
                      const converted = analysis.convertedGapIds.includes(g.id);
                      return (
                        <article key={g.id} className="rounded-lg border border-border bg-card p-5 flex flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-display text-base leading-snug text-foreground">{g.title}</h3>
                            <PriorityBadge priority={g.priority} />
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{g.explanation}</p>

                          <div className="mt-3 rounded-md bg-secondary/40 border border-border p-3 text-sm">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Likely reason
                            </div>
                            <div className="mt-1 text-foreground/80">{g.likelyReason}</div>
                          </div>

                          <div className="mt-3 rounded-md bg-secondary/50 border border-border p-3 text-sm">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Recommendation
                            </div>
                            <div className="mt-1 text-foreground/85">{g.recommendation}</div>
                          </div>

                          {g.suggestedPrompt ? (
                            <div className="mt-3 text-sm flex items-start gap-1.5">
                              <MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 text-gold/80 shrink-0" />
                              <span className="text-foreground/75 italic">“{g.suggestedPrompt}”</span>
                            </div>
                          ) : null}

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
                </div>
              ))}
            </section>
          ) : null}

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

function ReadinessTag({ readiness }: { readiness: "High" | "Medium" | "Low" }) {
  // Higher readiness = better (gold); lower = needs work (muted).
  const cls =
    readiness === "High"
      ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : readiness === "Medium"
        ? "bg-secondary border-border text-secondary-foreground"
        : "bg-muted border-border text-muted-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      Readiness {readiness}
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
