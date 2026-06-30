import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, addAiEvaluationRun, updateAiEvaluationRun, uid } from "@/lib/store";
import { useT } from "@/i18n";
import { contentLangToProjectLanguage } from "@/lib/onboarding";
import {
  getAiRouterStatusFn,
  generateContentFn,
  improveContentDraftFn,
  evaluateContentQualityFn,
  generateAuthorityOpportunitiesFn,
} from "@/lib/ai.functions";
import type { AiTaskType, AiEvaluationRun, AiEvaluationRating, Opportunity, Project, ServiceItem } from "@/lib/types";
import { FlaskConical, Loader2, Play, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/ai-evaluation")({
  head: () => ({ meta: [{ title: "AI Evaluation — Milo Growth" }] }),
  component: AiEvaluationPage,
});

type RouterStatus = Awaited<ReturnType<typeof getAiRouterStatusFn>>;
const TASKS: AiTaskType[] = ["contentGeneration", "contentImprove", "contentQualityScore", "authorityGeneration"];
const RATING_KEYS: (keyof AiEvaluationRating)[] = ["quality", "brandFit", "languageQuality", "usefulness", "safetyTrust"];

type SideResult = { status: "success" | "error" | "notConfigured"; output?: string; latencyMs?: number; error?: string };

function preview(s: string, max = 4000): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function AiEvaluationPage() {
  const navigate = useNavigate();
  const t = useT();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId)) as Project | undefined;
  const services = useStore((s) => s.services.filter((x) => x.projectId === s.activeProjectId)) as ServiceItem[];
  const opportunities = useStore((s) => s.opportunities.filter((o) => o.projectId === s.activeProjectId));
  const assets = useStore((s) => s.content.filter((c) => c.projectId === s.activeProjectId));
  const history = useStore((s) => s.aiEvaluationRuns);

  const [status, setStatus] = useState<RouterStatus | null>(null);
  const [task, setTask] = useState<AiTaskType>("contentImprove");
  const [oppId, setOppId] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [assetId, setAssetId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [existing, setExisting] = useState<SideResult | null>(null);
  const [candidate, setCandidate] = useState<SideResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    getAiRouterStatusFn().then(setStatus).catch(() => setStatus(null));
  }, []);

  const currentRun = useMemo(() => history.find((r) => r.id === runId), [history, runId]);

  if (!project) {
    return (
      <AppShell title={t("aiEval.title")} description={t("aiEval.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("analytics.setupFirst")}</div>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>{t("nav.setup")}</Button>
        </div>
      </AppShell>
    );
  }

  const contentLanguage = contentLangToProjectLanguage(project.primaryContentLanguage ?? "en");
  const explanationLanguage = contentLangToProjectLanguage(project.appLanguage ?? "en");

  async function callTask(modelOverride?: string): Promise<string> {
    const p = project as Project;
    if (task === "contentGeneration") {
      const opp: Opportunity = oppId
        ? (opportunities.find((o) => o.id === oppId) as Opportunity)
        : {
            id: "eval", projectId: p.id, title: topic.trim() || "Evaluation topic", language: p.primaryLanguage,
            contentType: "Blog Article", searchIntent: "Informational", targetAudience: p.targetAudience || "Potential customers",
            businessValue: "Evaluation", recommendedCta: "Contact us", priority: "Medium", status: "New",
          };
      const res = await generateContentFn({ data: { project: p, services, opportunity: opp, assetType: "article", modelOverride } });
      return res.markdown;
    }
    if (task === "contentImprove") {
      const a = assets.find((x) => x.id === assetId);
      if (!a) throw new Error(t("aiEval.needAsset"));
      const res = await improveContentDraftFn({ data: { project: p, services, title: a.title, markdown: a.markdown || "", assetType: a.assetType ?? "article", contentLanguage, suggestions: a.qualityScore?.quickWins ?? [], modelOverride } });
      return res.markdown;
    }
    if (task === "contentQualityScore") {
      const a = assets.find((x) => x.id === assetId);
      if (!a) throw new Error(t("aiEval.needAsset"));
      const res = await evaluateContentQualityFn({ data: { project: p, services, title: a.title, markdown: a.markdown || "", assetType: a.assetType ?? "article", destinationType: a.publishDestinationType ?? "", metaTitle: a.metaTitle ?? "", metaDescription: a.metaDescription ?? "", contentLanguage, explanationLanguage, modelOverride } });
      return `Milo Score ${res.overall}/100 · ${res.status} · ${res.publishingRecommendation}\n\n${JSON.stringify(res, null, 2)}`;
    }
    // authorityGeneration
    const livePages = assets.filter((c) => c.livePublishStatus === "published" && c.liveUrl).map((c) => c.liveUrl as string);
    const res = await generateAuthorityOpportunitiesFn({ data: { project: p, services, existingTitles: [], livePages, explanationLanguage, modelOverride } });
    return res.opportunities.map((o) => `• [${o.type}] ${o.title}`).join("\n") + `\n\n${JSON.stringify(res.opportunities, null, 2)}`;
  }

  async function runOne(modelOverride?: string): Promise<SideResult> {
    const start = Date.now();
    try {
      const output = await callTask(modelOverride);
      return { status: "success", output, latencyMs: Date.now() - start };
    } catch (e) {
      return { status: "error", error: e instanceof Error ? e.message : "Failed", latencyMs: Date.now() - start };
    }
  }

  async function run() {
    setRunning(true);
    setExisting(null);
    setCandidate(null);
    setRunId(null);
    const ex = await runOne(undefined);
    setExisting(ex);
    let cand: SideResult;
    if (!status?.candidateConfigured || !status?.candidateModel) {
      cand = { status: "notConfigured" };
    } else {
      cand = await runOne(status.candidateModel);
    }
    setCandidate(cand);

    const newRun: AiEvaluationRun = {
      id: uid(),
      createdAt: new Date().toISOString(),
      projectId: project!.id,
      taskType: task,
      existingModel: status?.defaultModel.model ?? "existing",
      candidateModel: status?.candidateModel ?? undefined,
      existingStatus: ex.status === "success" ? "success" : "error",
      candidateStatus: cand.status,
      existingLatencyMs: ex.latencyMs,
      candidateLatencyMs: cand.latencyMs,
      existingOutputPreview: ex.output ? preview(ex.output, 2000) : undefined,
      candidateOutputPreview: cand.output ? preview(cand.output, 2000) : undefined,
      existingError: ex.error,
      candidateError: cand.error,
    };
    addAiEvaluationRun(newRun);
    setRunId(newRun.id);
    setRunning(false);
  }

  const needsAsset = task === "contentImprove" || task === "contentQualityScore";
  const canRun =
    !running &&
    (task === "authorityGeneration" ||
      (task === "contentGeneration" ? Boolean(oppId || topic.trim()) : Boolean(assetId)));

  return (
    <AppShell title={t("aiEval.title")} description={t("aiEval.subtitle")}>
      <p className="text-xs text-muted-foreground max-w-3xl">{t("aiEval.intro")}</p>
      <p className="text-xs text-muted-foreground max-w-3xl mt-1">{t("aiEval.noAutoSwitch")}</p>

      {/* Candidate status */}
      <div className="mt-4 rounded-md border border-border bg-card px-4 py-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
        <span><span className="text-muted-foreground">{t("aiEval.existingModel")}: </span>{status?.defaultModel.label ?? "—"}</span>
        <span>
          <span className="text-muted-foreground">{t("aiEval.candidateModel")}: </span>
          {status?.candidateConfigured ? `${status.candidateLabel} (${status.candidateModel})` : <span className="text-amber-600">{t("aiEval.notConfigured")}</span>}
        </span>
      </div>
      {!status?.candidateConfigured ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("aiEval.notConfiguredHelp")}</p>
      ) : null}

      {/* Controls */}
      <div className="mt-5 rounded-lg border border-border bg-card p-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("aiEval.task")}</label>
          <Select value={task} onValueChange={(v) => setTask(v as AiTaskType)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{TASKS.map((tk) => <SelectItem key={tk} value={tk}>{t(`aiEval.taskType.${tk}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {task === "contentGeneration" ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("aiEval.opportunity")}</label>
            <Select value={oppId || "none"} onValueChange={(v) => setOppId(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("aiEval.manualTopic")}</SelectItem>
                {opportunities.slice(0, 30).map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
              </SelectContent>
            </Select>
            {!oppId ? <Input className="mt-2" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("aiEval.topicPlaceholder")} /> : null}
          </div>
        ) : null}

        {needsAsset ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("aiEval.asset")}</label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder={t("aiEval.selectAsset")} /></SelectTrigger>
              <SelectContent>{assets.slice(0, 50).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={run} disabled={!canRun}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? t("aiEval.running") : t("aiEval.run")}
          </Button>
        </div>
      </div>

      {/* Results */}
      {existing || candidate ? (
        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <ResultCard title={status?.defaultModel.label ?? "Existing"} result={existing} t={t} />
          <ResultCard title={status?.candidateLabel ?? "Candidate"} result={candidate} t={t} />
        </div>
      ) : null}

      {/* Ratings */}
      {currentRun ? (
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg">{t("aiEval.ratings")}</h2>
          <div className="mt-3 grid md:grid-cols-2 gap-6">
            <RatingBlock title={status?.defaultModel.label ?? "Existing"} run={currentRun} side="existing" t={t} />
            <RatingBlock title={status?.candidateLabel ?? "Candidate"} run={currentRun} side="candidate" t={t} disabled={currentRun.candidateStatus !== "success"} />
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground">{t("aiEval.notes")}</label>
            <Textarea className="mt-1.5" rows={2} value={currentRun.notes ?? ""} onChange={(e) => updateAiEvaluationRun(currentRun.id, { notes: e.target.value })} />
          </div>
        </section>
      ) : null}

      {/* History */}
      {history.length > 0 ? (
        <section className="mt-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("aiEval.history")}</div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("aiEval.task")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("aiEval.existingModel")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("aiEval.candidateModel")}</th>
                  <th className="text-left px-4 py-2 font-medium w-28">{t("aiEval.when")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/40">
                    <td className="px-4 py-2">{t(`aiEval.taskType.${r.taskType}`)}</td>
                    <td className="px-4 py-2"><StatusDot s={r.existingStatus} /> {r.existingLatencyMs ? `${r.existingLatencyMs}ms` : ""}</td>
                    <td className="px-4 py-2"><StatusDot s={r.candidateStatus} /> {r.candidateLatencyMs ? `${r.candidateLatencyMs}ms` : ""}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function ResultCard({ title, result, t }: { title: string; result: SideResult | null; t: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        {result ? <StatusBadge status={result.status} t={t} latency={result.latencyMs} /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {result?.status === "error" ? (
        <p className="mt-2 text-sm text-destructive inline-flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5" />{result.error}</p>
      ) : result?.status === "notConfigured" ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("aiEval.notConfigured")}</p>
      ) : result?.output ? (
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-background/40 p-3 text-xs whitespace-pre-wrap break-words">{result.output}</pre>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, t, latency }: { status: SideResult["status"]; t: (k: string) => string; latency?: number }) {
  const cls = status === "success" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
    : status === "error" ? "bg-destructive/10 border-destructive/30 text-destructive"
    : "bg-secondary border-border text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border ${cls}`}>{t(`aiEval.status.${status}`)}</span>
      {latency ? <span className="text-xs text-muted-foreground">{latency}ms</span> : null}
    </span>
  );
}

function StatusDot({ s }: { s: string }) {
  const cls = s === "success" ? "text-emerald-600" : s === "error" ? "text-destructive" : "text-muted-foreground";
  return <span className={cls}>●</span>;
}

function RatingBlock({ title, run, side, t, disabled }: { title: string; run: AiEvaluationRun; side: "existing" | "candidate"; t: (k: string) => string; disabled?: boolean }) {
  const rating = run.ratings?.[side] ?? {};
  const set = (key: keyof AiEvaluationRating, value: number) => {
    const next = { ...run.ratings, [side]: { ...rating, [key]: value } };
    updateAiEvaluationRun(run.id, { ratings: next });
  };
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-1.5">
        {RATING_KEYS.map((k) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t(`aiEval.rating.${k}`)}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => set(k, n)} className={`h-6 w-6 rounded text-xs border ${rating[k] === n ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground hover:border-accent"}`}>{n}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
