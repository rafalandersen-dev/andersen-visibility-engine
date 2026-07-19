/**
 * The one visual for a pipeline stage, used on every surface.
 *
 * Shipping a chip on the board while another screen still spoke the old
 * vocabulary would put two information architectures in front of the user at
 * once — the exact incoherence this redesign exists to remove. So every place
 * that shows "where is this" renders THIS component.
 *
 * The `armed` execution class is deliberately louder than the rest: something is
 * going to happen without the user touching it again, and that must not look
 * like every other inert card.
 */
import type { PipelineStage } from "@/lib/pipeline";
import { STAGE_EXECUTION } from "@/lib/pipeline";
import { useT } from "@/i18n";
import { Clock } from "lucide-react";

const STAGE_CLASSES: Record<PipelineStage, string> = {
  idea: "border-border bg-secondary text-secondary-foreground",
  queued: "border-border bg-secondary text-secondary-foreground",
  planned: "border-border bg-secondary text-secondary-foreground",
  writing: "border-accent/40 bg-accent/20 text-accent-foreground",
  in_review: "border-accent/40 bg-accent/25 text-accent-foreground",
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  // Armed is the one state where the system acts on its own — amber, with a clock.
  armed: "border-amber-500/50 bg-amber-500/15 text-amber-800 font-medium",
  sent: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  live: "border-emerald-600/50 bg-emerald-600/15 text-emerald-800",
  needs_fixing: "border-destructive/40 bg-destructive/10 text-destructive",
  parked: "border-border bg-muted text-muted-foreground",
};

export function StageChip({
  stage,
  detail,
  className = "",
}: {
  stage: PipelineStage;
  /** e.g. the resolved go-live time for an armed item. */
  detail?: string;
  className?: string;
}) {
  const t = useT();
  const armed = STAGE_EXECUTION[stage] === "armed";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] " +
        STAGE_CLASSES[stage] +
        (className ? " " + className : "")
      }
      title={detail}
    >
      {armed ? <Clock className="h-3 w-3" /> : null}
      {t(`pipeline.stage.${stage}`)}
      {detail ? <span className="normal-case tracking-normal opacity-80">· {detail}</span> : null}
    </span>
  );
}
