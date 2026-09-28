/**
 * Safe sign-out flow (AS, lifecycle closed in AT). Before signing out, at most ONE current
 * workspace save is attempted when the workspace has changes that are not confirmed as saved.
 * Sign-out proceeds only when the same session (epoch + user) still holds and the status is
 * freshly "saved" (or there is no hydrated workspace to lose). Otherwise the caller shows an
 * accessible dialog with Stay / Retry / Sign out anyway. A rejected or unknown outcome means some
 * changes MAY be missing from the server; the flow never asserts loss, never discards locally and
 * never treats time as failure.
 *
 * Lifecycle: every action is bound to the session token captured at `start()`. A settlement is
 * applied only when its generation is still current (not disposed, not cancelled by Stay) AND the
 * session is either the original one or the ordinary signed-out cleanup (no user) that a
 * successful auth event performs before the promise resolves. A REPLACEMENT signed-in session
 * (same account re-login = new epoch, or another user) retires the old action: no navigation, no
 * error, no save — the stale dialog simply closes. Retry/Leave validate the token BEFORE starting
 * any work. An auth request already issued to the supplier cannot be cancelled; only its effects
 * on this UI are. A refused auth request re-checks the workspace before it is retried, because
 * background work may have produced new unsaved changes in the meantime (AV).
 */
import type { WorkspaceSaveContext } from "./discovery-save-recovery";
import type { WorkspaceSaveStatus } from "./workspace-save-status";

export type SignOutFlowState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "unconfirmed"; status: WorkspaceSaveStatus["kind"] }
  | { kind: "signingOut" }
  | { kind: "error" };

export interface SignOutFlowDeps {
  status: () => WorkspaceSaveStatus;
  context: () => WorkspaceSaveContext;
  /** The existing serialized whole-workspace save. */
  save: () => Promise<void>;
  /** The auth sign-out; must reject on a supplier error so it stays visible. */
  signOut: () => Promise<void>;
  onState: (state: SignOutFlowState) => void;
  /** Runs once after a successful sign-out (e.g. navigate home). */
  onSignedOut: () => void;
}

const sameSession = (a: WorkspaceSaveContext, b: WorkspaceSaveContext) =>
  a.epoch === b.epoch && a.userId === b.userId;

/** How the current store session relates to the session an action was started in. */
export type SessionRelation = "original" | "signedOutCleanup" | "replaced";
export function relateSession(
  token: WorkspaceSaveContext | null,
  now: WorkspaceSaveContext,
): SessionRelation {
  if (token && sameSession(token, now)) return "original";
  if (now.userId === null) return "signedOutCleanup"; // ordinary post-sign-out reset
  return "replaced"; // another signed-in session (same account new epoch, or another user)
}

export function createSignOutFlow(deps: SignOutFlowDeps) {
  let state: SignOutFlowState = { kind: "idle" };
  let busy = false;
  let disposed = false;
  let token: WorkspaceSaveContext | null = null;
  let generation = 0; // bumps on Stay/dispose/retire so late settlements are ignored
  const emit = (next: SignOutFlowState) => {
    if (disposed) return;
    state = next;
    deps.onState(next);
  };
  const nothingToLose = (s: WorkspaceSaveStatus) => s.kind === "saved" || s.kind === "notReady";
  /** The bound action is over: close its dialog without applying any outcome. */
  const retire = () => {
    generation += 1;
    busy = false;
    token = null;
    emit({ kind: "idle" });
  };
  const relation = () => relateSession(token, deps.context());

  async function doSignOut(gen: number) {
    if (gen !== generation || relation() !== "original") return;
    emit({ kind: "signingOut" });
    let ok = true;
    try {
      await deps.signOut();
    } catch {
      ok = false;
    }
    const live = !disposed && gen === generation; // this dialog instance still owns the action
    const rel = relation();
    if (!ok) {
      if (!live) return; // a detached or cancelled view never shows the old error
      if (rel !== "original") {
        retire(); // a replaced/cleared session never shows the old error
        return;
      }
      busy = false;
      emit({ kind: "error" }); // still signed in; nothing navigated
      return;
    }
    if (rel === "replaced") {
      // Another signed-in session (same account new epoch, other user) or a view that went away
      // while the user stayed signed in: the supplier may have signed out, but this UI must not
      // navigate or mutate anything for the new context.
      if (live) retire();
      return;
    }
    // "original": the same session still holds. "signedOutCleanup": the auth event already reset
    // the store (no user) — the ordinary successful path, which may unmount this view first.
    if (rel === "original" && !live) return;
    if (live) {
      busy = false;
      token = null;
      emit({ kind: "idle" });
    }
    deps.onSignedOut();
  }

  /** One save attempt, then either sign out or show the choice. */
  async function attemptThenDecide(gen: number) {
    emit({ kind: "saving" });
    try {
      await deps.save();
    } catch {
      /* outcome is reported by the workspace status, not by the raw error */
    }
    if (disposed || gen !== generation) return; // cancelled (Stay) or disposed while pending
    if (relation() !== "original") {
      retire(); // the session changed under us: never act on it
      return;
    }
    const s = deps.status();
    if (nothingToLose(s)) {
      await doSignOut(gen);
      return;
    }
    emit({ kind: "unconfirmed", status: s.kind });
  }

  return {
    state: () => state,
    /** The sign-out control was activated. */
    start: async () => {
      if (busy || disposed) return;
      busy = true;
      token = deps.context();
      const gen = ++generation;
      if (nothingToLose(deps.status())) {
        await doSignOut(gen);
        return;
      }
      await attemptThenDecide(gen);
    },
    /** From the dialog: one more save attempt of the CURRENT workspace changes. */
    retry: async () => {
      if (state.kind !== "unconfirmed") return;
      if (relation() !== "original") {
        retire(); // stale dialog: no work is started for another session
        return;
      }
      await attemptThenDecide(generation);
    },
    /** From the dialog: stay signed in; any pending settlement is ignored. */
    stay: () => {
      retire();
    },
    /** From the unconfirmed dialog ONLY: the explicit choice to sign out although changes are not
     * confirmed as saved. */
    leave: async () => {
      if (state.kind !== "unconfirmed") return;
      if (relation() !== "original") {
        retire();
        return;
      }
      await doSignOut(generation);
    },
    /** From the error dialog: try the auth sign-out again. Background work may have made the
     * workspace dirty while the first request was pending or after it failed, so the CURRENT
     * status is read first and the ordinary one-save/decision path runs before any new auth
     * request: a confirmed save proceeds to auth once; a failed/unknown/conflicting save shows
     * the unconfirmed choice (Stay / Retry / explicit Leave) without a second auth request. */
    retryAuth: async () => {
      if (state.kind !== "error") return;
      if (relation() !== "original") {
        retire(); // stale dialog: no work for another session
        return;
      }
      busy = true;
      const gen = generation;
      if (nothingToLose(deps.status())) {
        await doSignOut(gen);
        return;
      }
      await attemptThenDecide(gen);
    },
    /** Called when the store session changes while the shell stays mounted: drop a stale dialog. */
    reconcile: () => {
      if (state.kind === "idle" || state.kind === "signingOut") return;
      if (relation() !== "original") retire();
    },
    /** The owning view mounted (or re-mounted): settlements may be applied again. */
    attach: () => {
      disposed = false;
    },
    /** The owning view unmounted: any in-flight settlement is dropped, nothing may happen. */
    detach: () => {
      disposed = true;
      generation += 1;
      busy = false;
      token = null;
    },
  };
}

export type SignOutFlow = ReturnType<typeof createSignOutFlow>;
