import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveStatusOffersRetry, type WorkspaceSaveStatus } from "@/lib/workspace-save-status";

/**
 * The editor's bottom Save control and its saved/unsaved indicator (AS 2026-10-28).
 *
 * `isDirty` is the page-local field diff (this asset vs. the in-memory store);
 * `workspaceSaveStatus` is the real global persistence status (AS). A save can
 * be in sync with the in-memory store (`isDirty` false) while the last network
 * attempt for it is still pending, unconfirmed, or refused by a conflict — this
 * must never render as "All changes saved" in that window, which was the
 * false-confirmation bug (the local commit always succeeds; only the network
 * round trip can fail).
 */
export function EditorSaveBar({
  isDirty,
  workspaceSaveStatus,
  onSave,
  t,
}: {
  isDirty: boolean;
  workspaceSaveStatus: WorkspaceSaveStatus;
  onSave: () => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <Button size="sm" variant="default" onClick={onSave}>
        <Save className="h-3.5 w-3.5" /> {t("common.save")}
      </Button>
      {isDirty ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {t("editorScreen.unsaved")}
        </span>
      ) : saveStatusOffersRetry(workspaceSaveStatus) ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {t("planScreen.discovery.save.unconfirmed")}
        </span>
      ) : workspaceSaveStatus.kind === "saving" || workspaceSaveStatus.kind === "unsaved" ? (
        <span className="text-xs text-muted-foreground">
          {t(
            workspaceSaveStatus.kind === "saving"
              ? "shell.workspaceSave.saving"
              : "shell.workspaceSave.unsaved",
          )}
        </span>
      ) : workspaceSaveStatus.kind === "saved" ? (
        <span className="text-xs text-muted-foreground">{t("editorScreen.saved")}</span>
      ) : null}
    </>
  );
}
