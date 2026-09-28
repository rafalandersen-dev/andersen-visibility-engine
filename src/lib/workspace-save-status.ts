/**
 * Global workspace persistence status (AS).
 *
 * The store derives ONE truthful status for the whole browser workspace document from facts it
 * already owns: hydration/user, the real in-flight save count, the diff between the current
 * snapshot and the last CONFIRMED baseline, and the outcome of the most recent save attempt in the
 * current session. Nothing here changes what is saved or how; it only reports it.
 *
 * - "notReady":    no hydrated workspace for a signed-in user (nothing can be confirmed).
 * - "saved":       the current snapshot has no diff against a usable confirmed baseline.
 * - "unsaved":     there are changes newer than the last confirmed save and no failed attempt for
 *                  exactly these changes yet (a debounced save is scheduled or a retry will run).
 * - "saving":      a save for this session is in flight.
 * - "unconfirmed": the last attempt for the current changes did not confirm (rejected transport,
 *                  backfill failure, not-ready inside the save); outcome unknown, retry is safe.
 * - "conflict":    the last attempt was refused because a draft changed in another session; the
 *                  local edits are kept, nothing is overwritten, a retry re-checks the same
 *                  preconditions.
 *
 * Workspace status is NOT page-local form status: the editor keeps its own unsaved-field
 * indicator and guard for fields it has not yet written to the store.
 */
export type WorkspaceSaveStatusKind =
  "notReady" | "saved" | "unsaved" | "saving" | "unconfirmed" | "conflict";

export interface WorkspaceSaveStatus {
  kind: WorkspaceSaveStatusKind;
  /** For "unsaved": whether the debounced save is already scheduled. A dirty workspace without a
   * scheduled attempt (e.g. a device-local active project differing from the server on load)
   * needs an explicit control, never a silent permanent "unsaved". */
  scheduled?: boolean;
}

export const NOT_READY_SAVE_STATUS: WorkspaceSaveStatus = Object.freeze({ kind: "notReady" });

export interface SaveOutcomeRecord {
  kind: "confirmed" | "unconfirmed";
  reason: "rejected" | "conflict";
  epoch: number;
  userId: string | null;
  /** The edit sequence the attempt's snapshot was taken at. */
  editSeq: number;
}

export interface DeriveSaveStatusInput {
  hydrated: boolean;
  userId: string | null;
  epoch: number;
  saveInFlight: number;
  hasBaseline: boolean;
  /** Current edit sequence (incremented on every store edit). */
  editSeq: number;
  lastOutcome: SaveOutcomeRecord | null;
  /** Lazily computed; only called when the answer matters. */
  isDirty: () => boolean;
  /** Whether the store's debounced save timer is armed. */
  saveScheduled: boolean;
}

/** Pure derivation; the store memoizes it per persistence version. */
export function deriveWorkspaceSaveStatus(input: DeriveSaveStatusInput): WorkspaceSaveStatus {
  if (!input.hydrated || !input.userId) return NOT_READY_SAVE_STATUS;
  if (input.saveInFlight > 0) return { kind: "saving" };
  if (!input.isDirty()) return input.hasBaseline ? { kind: "saved" } : NOT_READY_SAVE_STATUS;
  const outcome = input.lastOutcome;
  const applies =
    outcome !== null &&
    outcome.kind === "unconfirmed" &&
    outcome.epoch === input.epoch &&
    outcome.userId === input.userId &&
    outcome.editSeq === input.editSeq;
  if (!applies) return { kind: "unsaved", scheduled: input.saveScheduled };
  return { kind: outcome.reason === "conflict" ? "conflict" : "unconfirmed" };
}

/** Whether leaving the page could lose workspace changes that are not confirmed as saved. */
export const hasUnconfirmedWorkspaceChanges = (status: WorkspaceSaveStatus): boolean =>
  status.kind === "unsaved" ||
  status.kind === "saving" ||
  status.kind === "unconfirmed" ||
  status.kind === "conflict";

/** Whether the status offers an explicit retry (a save attempt already failed for these changes). */
export const saveStatusOffersRetry = (status: WorkspaceSaveStatus): boolean =>
  status.kind === "unconfirmed" || status.kind === "conflict";
