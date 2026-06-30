import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/i18n";
import { evaluateContentQuality, improveContentDraft } from "@/lib/mock-ai";
import { QUALITY_CATEGORY_ORDER, draftWordCount } from "@/lib/quality";
import type { ContentAsset, QualityStatus, PublishingRecommendation } from "@/lib/types";
import { Gauge, Loader2, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function statusClasses(status: QualityStatus) {
  return status === "strong"
    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
    : status === "okay"
    ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
    : "bg-destructive/10 border-destructive/30 text-destructive";
}

function recClasses(rec: PublishingRecommendation) {
  return rec === "ready"
    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
    : rec === "reviewFirst"
    ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
    : "bg-destructive/10 border-destructive/30 text-destructive";
}

export function MiloScorePanel({ asset }: { asset: ContentAsset }) {
  const t = useT();
  const [busy, setBusy] = useState<"evaluate" | "improve" | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);

  const score = asset.qualityScore;
  const hasBody = draftWordCount(asset.markdown || "") >= 1;

  async function runEvaluate() {
    setBusy("evaluate");
    try {
      await evaluateContentQuality(asset.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("quality.error"));
    } finally {
      setBusy(null);
    }
  }

  async function runImprove() {
    setImproveOpen(false);
    setBusy("improve");
    try {
      await improveContentDraft(asset.id);
      toast.success(t("quality.improved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("quality.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Gauge className="h-4 w-4 text-gold/80" strokeWidth={1.7} />
          <div>
            <div className="font-display text-base leading-tight">{t("quality.title")}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("quality.subtitle")}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={score ? "outline" : "default"} onClick={runEvaluate} disabled={busy !== null || !hasBody}>
            {busy === "evaluate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {busy === "evaluate" ? t("quality.evaluating") : score ? t("quality.reevaluate") : t("quality.evaluate")}
          </Button>
          {score ? (
            <Button size="sm" variant="ghost" onClick={() => setImproveOpen(true)} disabled={busy !== null || !hasBody}>
              {busy === "improve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {busy === "improve" ? t("quality.improving") : t("quality.improve")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-5 py-4">
        {!hasBody ? (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {t("quality.needBody")}
          </p>
        ) : !score ? (
          <p className="text-sm text-muted-foreground">{t("quality.empty")}</p>
        ) : (
          <div className="space-y-4">
            {asset.qualityScoreStale ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground/80 inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {t("quality.stale")}
              </div>
            ) : null}

            {/* Overall + badges */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl text-foreground">{score.overall}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${statusClasses(score.status)}`}>
                {t(`quality.status.${score.status}`)}
              </span>
              <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${recClasses(score.publishingRecommendation)}`}>
                {t(`quality.rec.${score.publishingRecommendation}`)}
              </span>
            </div>

            {score.summary ? <p className="text-sm text-foreground/85 max-w-2xl">{score.summary}</p> : null}
            <p className="text-xs text-muted-foreground max-w-2xl">{t("quality.about")}</p>

            {/* Top issues + quick wins */}
            <div className="grid sm:grid-cols-2 gap-4">
              {score.topIssues.length ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">{t("quality.topIssues")}</div>
                  <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/85">
                    {score.topIssues.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
              {score.quickWins.length ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">{t("quality.quickWins")}</div>
                  <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/85">
                    {score.quickWins.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* Category breakdown */}
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">{t("quality.breakdown")}</div>
              <div className="space-y-1.5">
                {QUALITY_CATEGORY_ORDER.map((key) => {
                  const c = score.categories[key];
                  return (
                    <details key={key} className="rounded-md border border-border bg-background/40 group">
                      <summary className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer list-none">
                        <span className="text-sm font-medium">{t(`quality.cat.${key}`)}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-mono text-foreground/80">{c.score}</span>
                          <span className={`text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full border ${statusClasses(c.status)}`}>
                            {t(`quality.status.${c.status}`)}
                          </span>
                        </span>
                      </summary>
                      <div className="px-3 pb-3 pt-0 text-sm text-foreground/80 space-y-1.5">
                        <p>{c.explanation}</p>
                        {c.suggestions.length ? (
                          <ul className="list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
                            {c.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={improveOpen} onOpenChange={(o) => { if (busy !== "improve") setImproveOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quality.improveConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("quality.improveConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runImprove(); }}>
              {t("quality.improve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
