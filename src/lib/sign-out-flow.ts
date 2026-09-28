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
import type { ClosingLease } from "./producer-session";

export type SignOutFlowState =
  | { kind: "idle" }
  /** Unretained producer results of this session are still pending (AY): Stay/wait or leave. */
  | { kind: "pendingWork"; count: number }
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
  /** Number of pending UNRETAINED producer results for the current session (AY). */
  pendingUnretained: () => number;
  /** Acquires the closing lease for the current session: no new producer work is admitted until
   * the lease is released by THIS flow after the sign-out attempt's actual outcome (AY/AZ). */
  acquireClosing: () => ClosingLease;
  /** True while a supplier sign-out request of this session is issued and unsettled (any attempt). */
  authPending: () => boolean;
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
  let rechecked = false; // one final live re-check at the auth boundary per activation
  let lease: ClosingLease | null = null; // owned closing lease of the current activation
  let authInFlight = false; // an auth request has been issued and has not settled yet
  let waitingOnOther = false; // another attempt's request is pending: this one shows it, never duplicates it
  const releaseLease = () => {
    lease?.release();
    lease = null;
  };
  const retire = () => {
    generation += 1;
    busy = false;
    token = null;
    releaseLease();
    emit({ kind: "idle" });
  };
  /** After the pending-work gate: the ordinary save-then-auth decision. */
  async function proceed(gen: number) {
    if (nothingToLose(deps.status())) {
      await doSignOut(gen);
      return;
    }
    await attemptThenDecide(gen);
  }
  const relation = () => relateSession(token, deps.context());

  async function doSignOut(gen: number) {
    if (gen !== generation || relation() !== "original") return;
    emit({ kind: "signingOut" });
    if (deps.authPending()) {
      // A sign-out request of this session is already in flight (e.g. issued before a remount).
      // It cannot be cancelled and must not be duplicated: show the truthful state and observe.
      waitingOnOther = true;
      return;
    }
    let ok = true;
    authInFlight = true;
    lease?.markIssued();
    try {
      await deps.signOut();
    } catch {
      ok = false;
    }
    authInFlight = false;
    lease?.markSettled(); // the request is over; the lease (admission) stays until this attempt ends
    const live = !disposed && gen === generation; // this dialog instance still owns the action
    const rel = relation();
    if (!ok) {
      if (!live) {
        releaseLease(); // the attempt is over; a detached view keeps no admission block behind
        return; // a detached or cancelled view never shows the old error
      }
      if (rel !== "original") {
        retire(); // a replaced/cleared session never shows the old error
        return;
      }
      busy = false;
      emit({ kind: "error" }); // still signed in; nothing navigated; the lease stays until Stay/retry
      return;
    }
    if (rel === "replaced") {
      // Another signed-in session (same account new epoch, other user) or a view that went away
      // while the user stayed signed in: the supplier may have signed out, but this UI must not
      // navigate or mutate anything for the new context.
      if (live) retire();
      else releaseLease();
      return;
    }
    // "original": the same session still holds. "signedOutCleanup": the auth event already reset
    // the store (no user) — the ordinary successful path, which may unmount this view first.
    if (rel === "original" && !live) {
      releaseLease();
      return;
    }
    releaseLease();
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
    // Live re-check at the auth boundary: work that completed while the save ran may have left
    // NEW unsaved changes (not a failure). One bounded extra attempt saves them before the auth
    // request; a failed/unknown/conflicting save still ends in the explicit choice.
    if ((s.kind === "unsaved" || s.kind === "saving") && !rechecked) {
      rechecked = true;
      await attemptThenDecide(gen);
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
      rechecked = false;
      lease = deps.acquireClosing(); // no new producer work is admitted while this sign-out is active
      const count = deps.pendingUnretained();
      if (count > 0) {
        emit({ kind: "pendingWork", count }); // explicit choice: wait, or leave and possibly lose them
        return;
      }
      await proceed(gen);
    },
    /** Pending-work count changed (reactive): re-evaluate while the gate is showing. */
    pendingChanged: async () => {
      if (state.kind !== "pendingWork") return;
      if (relation() !== "original") {
        retire();
        return;
      }
      const count = deps.pendingUnretained();
      if (count > 0) {
        if (count !== state.count) emit({ kind: "pendingWork", count });
        return;
      }
      await proceed(generation); // the work settled: whatever it left unsaved is saved first
    },
    /** From the pending-work gate: leave although pending results may be lost (this consent
     * covers the work pending now; new work is not admitted while signing out). */
    leavePending: async () => {
      if (state.kind !== "pendingWork") return;
      if (relation() !== "original") {
        retire();
        return;
      }
      await proceed(generation);
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
      waitingOnOther = false;
      retire(); // releases only THIS attempt's lease
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
      rechecked = false;
      if (!lease?.isActive()) lease = deps.acquireClosing();
      await proceed(generation);
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
    /** Registry changed (reactive): an attempt that was only observing another request settles. */
    reconcileAttempt: () => {
      if (!waitingOnOther || deps.authPending()) return;
      waitingOnOther = false;
      if (disposed) return;
      if (relation() !== "original") {
        retire(); // the other request succeeded: its cleanup/navigation already happened
        return;
      }
      busy = false; // the other request was refused: still signed in, same choice as an own refusal
      emit({ kind: "error" });
    },
    detach: () => {
      disposed = true;
      generation += 1;
      busy = false;
      token = null;
      waitingOnOther = false;
      // An issued auth request keeps its admission block until it settles; otherwise release now.
      if (!authInFlight) releaseLease();
    },
  };
}

export type SignOutFlow = ReturnType<typeof createSignOutFlow>;
