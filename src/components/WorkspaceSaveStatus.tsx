import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceSaveStatus as Status } from "@/lib/workspace-save-status";

/**
 * Global workspace persistence status for the shell (AS). Reports the whole browser workspace
 * document, not page-local forms (the editor keeps its own unsaved-field indicator). "saved" and
 * activity use `role="status"`; a failed or refused attempt uses `role="alert"` with an explicit
 * non-submit Retry that re-runs the existing whole-workspace save. Only translated keys render.
 */
export function WorkspaceSaveStatusBar({
  status,
  retrying,
  onRetry,
  t,
}: {
  status: Status;
  retrying: boolean;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  if (status.kind === "notReady") return null;
  const base = "flex flex-wrap items-center gap-2 px-5 py-1.5 text-xs md:px-10";
  if (status.kind === "saved")
    return (
      <p
        role="status"
        aria-live="polite"
        className={`${base} text-[#586371]`}
        data-workspace-save="saved"
      >
        {t("shell.workspaceSave.saved")}
      </p>
    );
  if (status.kind === "unsaved" && status.scheduled === false)
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${base} gap-3 text-[#586371]`}
        data-workspace-save="unsaved-unscheduled"
      >
        <span>{t("shell.workspaceSave.unsaved")}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          {t("shell.workspaceSave.saveNow")}
        </Button>
      </div>
    );
  if (status.kind === "saving" || status.kind === "unsaved")
    return (
      <p
        role="status"
        aria-live="polite"
        className={`${base} text-[#586371]`}
        data-workspace-save={status.kind}
      >
        {status.kind === "saving" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        {t(status.kind === "saving" ? "shell.workspaceSave.saving" : "shell.workspaceSave.unsaved")}
      </p>
    );
  return (
    <div role="alert" className={`${base} gap-3 text-[#9a6d16]`} data-workspace-save={status.kind}>
      <span>
        {t(
          status.kind === "conflict"
            ? "shell.workspaceSave.conflict"
            : "planScreen.discovery.save.unconfirmed",
        )}
      </span>
      <span className="text-[#697282]">{t("planScreen.discovery.save.retryNote")}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        {t("planScreen.discovery.save.retry")}
      </Button>
    </div>
  );
}
