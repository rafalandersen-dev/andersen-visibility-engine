/**
 * Discovery acceptance — truthful save recovery (AP, corrected in AQ).
 *
 * The acceptance itself is a synchronous store mutation (ids minted once). What can fail is the
 * workspace save that follows. This module drives ONE attempt of the existing `saveWorkspaceNow()`
 * per activation and classifies the outcome honestly:
 *
 * - "confirmed": the save resolved in the same workspace session (epoch + user) and no unsaved
 *   changes remain for the current snapshot.
 * - "unconfirmed": the save rejected, or resolved without confirming (workspace not ready / not
 *   hydrated, or newer changes still unsaved). The outcome of a rejected request is UNKNOWN: it
 *   may or may not have reached the server. Local changes stay in this open workspace only.
 * - "sessionChanged": the workspace session changed while the request was in flight (sign-out,
 *   re-hydration, same-account re-login). Not retryable from the old context.
 *
 * Every recovery action is BOUND to the context it started in (session epoch + user + view scope,
 * i.e. the active project). A terminal status (unconfirmed / confirmed) is only valid in that
 * context: `visibleSaveStatus` hides it elsewhere and `retry()` refuses to save from another context.
 * A retry re-runs `saveWorkspaceNow()` for the CURRENT workspace changes (the store re-diffs against
 * its confirmed baseline); it never repeats the accept, never mints ids, never calls a provider. No
 * timeout is interpreted as failure and there is no retry loop.
 */
export interface WorkspaceSaveContext {
  epoch: number;
  userId: string | null;
  hydrated: boolean;
}

/** The originating context a recovery action is bound to. */
export interface BoundSaveContext {
  epoch: number;
  userId: string | null;
  scope: string | null;
}

export interface DiscoverySaveDeps {
  save: () => Promise<void>;
  context: () => WorkspaceSaveContext;
  hasUnsavedChanges: () => boolean;
}

export type DiscoverySaveOutcome =
  | { kind: "confirmed" }
  | { kind: "unconfirmed"; reason: "rejected" | "notReady" | "pendingChanges" }
  | { kind: "sessionChanged" };

export type DiscoverySaveStatus =
  | { kind: "idle" }
  | { kind: "pending"; requestId: string; attempt: number; bound: BoundSaveContext }
  | {
      kind: "unconfirmed";
      requestId: string;
      attempt: number;
      reason: "rejected" | "notReady" | "pendingChanges";
      bound: BoundSaveContext;
    }
  | { kind: "confirmed"; requestId: string; attempt: number; bound: BoundSaveContext };

const sameSession = (a: WorkspaceSaveContext, b: WorkspaceSaveContext) =>
  a.epoch === b.epoch && a.userId === b.userId;

export const sameBoundContext = (a: BoundSaveContext, b: BoundSaveContext) =>
  a.epoch === b.epoch && a.userId === b.userId && a.scope === b.scope;

/** One save attempt. Never throws; the raw error is never returned (no message/URL/token leaks). */
export async function runDiscoverySave(deps: DiscoverySaveDeps): Promise<DiscoverySaveOutcome> {
  const start = deps.context();
  if (!start.hydrated || !start.userId) return { kind: "unconfirmed", reason: "notReady" };
  try {
    await deps.save();
  } catch {
    const now = deps.context();
    if (!sameSession(start, now)) return { kind: "sessionChanged" };
    return { kind: "unconfirmed", reason: "rejected" };
  }
  const now = deps.context();
  if (!sameSession(start, now)) return { kind: "sessionChanged" };
  if (!now.hydrated || !now.userId) return { kind: "unconfirmed", reason: "notReady" };
  if (deps.hasUnsavedChanges()) return { kind: "unconfirmed", reason: "pendingChanges" };
  return { kind: "confirmed" };
}

/**
 * What a view may render for `status` in the context it is currently showing. Pending is a real
 * workspace-wide activity and stays visible; a terminal status bound to another context (other
 * project, other session epoch, other user) is never carried over — it renders as idle.
 */
export function visibleSaveStatus(
  status: DiscoverySaveStatus,
  current: BoundSaveContext,
): DiscoverySaveStatus {
  if (status.kind === "idle" || status.kind === "pending") return status;
  return sameBoundContext(status.bound, current) ? status : { kind: "idle" };
}

export interface DiscoverySaveControllerDeps extends DiscoverySaveDeps {
  /** Receives every status transition that is still current for this view instance. */
  onStatus: (status: DiscoverySaveStatus) => void;
  /** False once the owning view unmounted: settlements are then dropped, nothing is written. */
  isMounted: () => boolean;
  /** Identity of the view's scope (e.g. active project id). */
  scope: () => string | null;
}

/**
 * Per-view-instance controller. Exactly one request may be in flight; a synchronous double
 * activation returns `null` without starting a second batch. The action is bound to the context of
 * `start()`; a retry keeps that binding and refuses (returning `null`, releasing the control) when
 * the current context differs. Settlements are applied only when the request is still the current
 * one, the view is mounted and the bound context is the current one; otherwise the pending control
 * is released and nothing is shown or written for the new context.
 */
export function createDiscoverySaveController(deps: DiscoverySaveControllerDeps) {
  let current: string | null = null;
  let seq = 0;
  let status: DiscoverySaveStatus = { kind: "idle" };
  const emit = (next: DiscoverySaveStatus) => {
    status = next;
    if (deps.isMounted()) deps.onStatus(next);
  };
  const boundNow = (): BoundSaveContext => {
    const ctx = deps.context();
    return { epoch: ctx.epoch, userId: ctx.userId, scope: deps.scope() };
  };
  const isCurrentContext = (bound: BoundSaveContext) => sameBoundContext(bound, boundNow());

  async function attempt(
    attemptNo: number,
    bound: BoundSaveContext,
  ): Promise<DiscoverySaveOutcome | null> {
    if (current !== null) return null;
    const requestId = `discovery-save-${++seq}`;
    current = requestId;
    emit({ kind: "pending", requestId, attempt: attemptNo, bound });
    const outcome = await runDiscoverySave(deps);
    if (current !== requestId) return null; // superseded (disposed) — never applied
    current = null;
    if (!deps.isMounted() || !isCurrentContext(bound) || outcome.kind === "sessionChanged") {
      // Stale view/context: no success/error for another context; the pending control is released.
      emit({ kind: "idle" });
      return outcome.kind === "sessionChanged" ? outcome : null;
    }
    if (outcome.kind === "confirmed")
      emit({ kind: "confirmed", requestId, attempt: attemptNo, bound });
    else
      emit({ kind: "unconfirmed", requestId, attempt: attemptNo, reason: outcome.reason, bound });
    return outcome;
  }

  return {
    status: () => status,
    isPending: () => current !== null,
    /** Call right after the synchronous accept mutation; binds the action to the current context. */
    start: () => attempt(1, boundNow()),
    /** Only from an unconfirmed state IN ITS BOUND CONTEXT; saves the CURRENT workspace changes. */
    retry: (): Promise<DiscoverySaveOutcome | null> => {
      if (status.kind !== "unconfirmed") return Promise.resolve(null);
      if (!isCurrentContext(status.bound)) {
        emit({ kind: "idle" }); // stale control: invalidated, no save from another context
        return Promise.resolve(null);
      }
      return attempt(status.attempt + 1, status.bound);
    },
    /** Drop a terminal status whose bound context is no longer the current one. */
    reconcile: () => {
      if (status.kind === "idle" || status.kind === "pending") return;
      if (!isCurrentContext(status.bound)) emit({ kind: "idle" });
    },
    /** Clear a terminal status (e.g. after the ordinary success toast took over). */
    clear: () => {
      if (current === null) emit({ kind: "idle" });
    },
    /** Invalidate on unmount: any in-flight settlement is dropped. */
    dispose: () => {
      current = null;
      status = { kind: "idle" };
    },
  };
}

export type DiscoverySaveController = ReturnType<typeof createDiscoverySaveController>;
