import { getWorkspaceSaveContext, hasUnsavedWorkspaceChanges, saveWorkspaceNow } from "./store";
import { runDiscoverySave } from "./discovery-save-recovery";

/**
 * The confirmation half of the editor Save contract (AS 2026-10-28).
 *
 * `write()` commits the edit to the in-memory store synchronously — that alone
 * is NOT a durable save; it only schedules/feeds the real network write. This
 * reuses `runDiscoverySave`'s terminal-outcome contract rather than treating a
 * resolved `saveWorkspaceNow()` as confirmation: that call can resolve as a
 * no-op (not hydrated/ready) or resolve while a newer edit has already landed
 * on top of it, neither of which is a durable save of what the caller wrote.
 * `onConfirmed` fires only on `{ kind: "confirmed" }` — same session, ready,
 * and no unsaved diff remains. A rejected, unconfirmed, conflicted or
 * session-changed outcome stays silent here: the shell's workspace save
 * status bar already reports it with its own Retry.
 *
 * `isStale`, checked right before `onConfirmed` fires, covers edits a caller
 * tracks outside the store (e.g. a page-local form) that this save never
 * included. `hasUnsavedChanges` alone can't see those — it only reflects the
 * store, which `write()` already updated — so a store diff of zero does not
 * mean the on-screen form has nothing newer than what was just confirmed.
 */
export async function confirmWorkspaceSave(
  write: () => void,
  onConfirmed: () => void,
  isStale?: () => boolean,
): Promise<void> {
  write();
  const outcome = await runDiscoverySave({
    save: saveWorkspaceNow,
    context: getWorkspaceSaveContext,
    hasUnsavedChanges: hasUnsavedWorkspaceChanges,
  });
  if (outcome.kind === "confirmed" && !isStale?.()) onConfirmed();
}
