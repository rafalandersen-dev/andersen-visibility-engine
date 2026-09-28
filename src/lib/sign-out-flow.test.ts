/**
 * AS — safe sign-out flow driven as EVENTS (start / retry / stay / leave) against the REAL store,
 * REAL save path (fake entity backend) and a fake auth sign-out that can resolve or reject.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
  rpcOverride: null as
    | null
    | ((
        fn: string,
        args: Record<string, unknown>,
        real: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>,
      ) => Promise<{ data: unknown; error: unknown }>),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) =>
      h.rpcOverride ? h.rpcOverride(fn, args, h.backend.rpc) : h.backend.rpc(fn, args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), message: vi.fn() },
}));

import {
  hydrateForUser,
  saveWorkspaceNow,
  resetStore,
  setState,
  getWorkspaceSaveStatus,
  getWorkspaceSaveContext,
} from "./store";
import { createSignOutFlow, type SignOutFlowState } from "./sign-out-flow";
import {
  beginProducerWork,
  getPendingProducerWork,
  acquireClosingLease,
  isSessionAuthPending,
  isSessionClosing,
  ProducerSessionError,
  resetProducerSessionsForTests,
} from "./producer-session";

const DOC = {
  projects: [{ id: "p1", name: "Project" }],
  content: [],
  opportunities: [{ id: "o1", projectId: "p1", title: "Original" }],
  activeProjectId: "p1",
};
const edit = (title: string) =>
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((o) => (o.id === "o1" ? { ...o, title } : o)),
  }));
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeFlow(auth: { fail?: boolean; defer?: boolean; resetsStore?: boolean } = {}) {
  const states: SignOutFlowState[] = [];
  const calls = { signOut: 0, signedOut: 0 };
  let releaseSignOut: (() => void) | null = null;
  const flow = createSignOutFlow({
    status: getWorkspaceSaveStatus,
    context: getWorkspaceSaveContext,
    save: saveWorkspaceNow,
    signOut: async () => {
      calls.signOut += 1;
      if (auth.defer)
        await new Promise<void>((r) => {
          releaseSignOut = r;
        });
      if (auth.fail) throw new Error("supplier refused (never shown)");
      // The real auth observer resets the store on the sign-out event BEFORE the promise settles.
      if (auth.resetsStore) resetStore();
    },
    onState: (s) => states.push(s),
    onSignedOut: () => {
      calls.signedOut += 1;
    },
    pendingUnretained: () => getPendingProducerWork().unretained,
    acquireClosing: acquireClosingLease,
    authPending: isSessionAuthPending,
  });
  return { flow, states, calls, releaseSignOut: () => releaseSignOut?.() };
}

beforeEach(async () => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  h.rpcOverride = null;
  h.backend.state.doc = structuredClone(DOC);
  h.backend.state.rev = 3;
  resetStore();
  resetProducerSessionsForTests();
  await hydrateForUser("user1");
});
afterEach(() => vi.unstubAllGlobals());

describe("sign-out with nothing to lose", () => {
  it("clean workspace: signs out once without a save attempt", async () => {
    const f = makeFlow();
    await f.flow.start();
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
    expect(f.states.map((s) => s.kind)).toEqual(["signingOut", "idle"]);
    expect(h.backend.state.batches).toHaveLength(0);
  });

  it("no hydrated workspace: signs out without a dirty prompt", async () => {
    resetStore();
    const f = makeFlow();
    await f.flow.start();
    expect(f.calls.signedOut).toBe(1);
    expect(f.states.map((s) => s.kind)).toEqual(["signingOut", "idle"]);
  });
});

describe("sign-out with unconfirmed changes", () => {
  it("dirty + save confirms: exactly one save, then sign-out", async () => {
    const f = makeFlow();
    edit("Edited");
    await f.flow.start();
    expect(h.backend.state.batches).toHaveLength(1);
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
    expect(f.states.map((s) => s.kind)).toEqual(["saving", "signingOut", "idle"]);
  });

  it("dirty + save rejected: dialog with the workspace status, no sign-out; Stay closes it", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const f = makeFlow();
    edit("Edited");
    await f.flow.start();
    expect(f.calls.signOut).toBe(0);
    expect(f.flow.state()).toEqual({ kind: "unconfirmed", status: "unconfirmed" });
    f.flow.stay();
    expect(f.flow.state().kind).toBe("idle");
    await flush();
    expect(f.calls.signOut).toBe(0);
  });

  it("Retry from the dialog: one more save; when it confirms the flow signs out", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const f = makeFlow();
    edit("Edited");
    await f.flow.start();
    expect(f.flow.state().kind).toBe("unconfirmed");
    h.backend.state.errors.apply = undefined as never;
    await f.flow.retry();
    expect(h.backend.state.batches).toHaveLength(1);
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });

  it("content conflict: dialog reports 'conflict'; Leave signs out without another save", async () => {
    const f = makeFlow();
    setState((s) => ({ ...s, content: [{ id: "c1", title: "Draft", body: "mine" } as never] }));
    await saveWorkspaceNow();
    (h.backend.state.doc as { content: unknown[] }).content = [
      { id: "c1", title: "Draft", body: "theirs" },
    ];
    setState((s) => ({ ...s, content: [{ id: "c1", title: "Draft", body: "mine2" } as never] }));
    await f.flow.start();
    expect(f.flow.state()).toEqual({ kind: "unconfirmed", status: "conflict" });
    const batches = h.backend.state.batches.length;
    await f.flow.leave();
    expect(h.backend.state.batches).toHaveLength(batches);
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });

  it("Leave with an unknown outcome signs out; nothing is discarded locally before that", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const f = makeFlow();
    edit("Edited");
    await f.flow.start();
    expect(f.flow.state().kind).toBe("unconfirmed");
    expect(getWorkspaceSaveStatus().kind).toBe("unconfirmed"); // still in the open workspace
    await f.flow.leave();
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });
});

describe("supplier error, cancellation, overlap and new sessions", () => {
  it("auth sign-out refused: error state stays visible, no navigation; retrying the auth is refused again", async () => {
    const f = makeFlow({ fail: true });
    await f.flow.start();
    expect(f.flow.state().kind).toBe("error");
    expect(f.calls).toEqual({ signOut: 1, signedOut: 0 });
    await f.flow.leave(); // Leave is the unconfirmed-state consent only: no-op here
    expect(f.calls.signOut).toBe(1);
    await f.flow.retryAuth();
    expect(f.calls.signOut).toBe(2);
    expect(f.flow.state().kind).toBe("error"); // still refused; still signed in
  });

  it("Stay while the pre-sign-out save is pending: the late settlement neither signs out nor reopens", async () => {
    let release: (() => void) | null = null;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch")
        await new Promise<void>((r) => {
          release = r;
        });
      return real(fn, args);
    };
    const f = makeFlow();
    edit("Edited");
    const p = f.flow.start();
    await flush();
    expect(f.flow.state().kind).toBe("saving");
    f.flow.stay();
    release!();
    await p;
    expect(f.calls.signOut).toBe(0);
    expect(f.flow.state().kind).toBe("idle");
    expect(getWorkspaceSaveStatus().kind).toBe("saved"); // the save itself still confirmed
  });

  it("a new session while the pre-sign-out save is pending is never signed out by the old flow", async () => {
    let release: (() => void) | null = null;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch")
        await new Promise<void>((r) => {
          release = r;
        });
      return real(fn, args);
    };
    const f = makeFlow();
    edit("Edited");
    const p = f.flow.start();
    await flush();
    resetStore();
    h.rpcOverride = null;
    await hydrateForUser("user1"); // same account, new epoch
    release!();
    await p;
    expect(f.calls.signOut).toBe(0);
    expect(f.flow.state().kind).toBe("idle");
    // A fresh sign-out in the new session still works.
    await f.flow.start();
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });

  it("overlapping activations: a second start while busy is ignored (one sign-out)", async () => {
    const f = makeFlow({ defer: true });
    const a = f.flow.start();
    const b = f.flow.start();
    await flush();
    f.releaseSignOut();
    await Promise.all([a, b]);
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });
});

describe("AT — asynchronous auth settlement and session lifecycle", () => {
  const deferApply = () => {
    let release: (() => void) | null = null;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch")
        await new Promise<void>((r) => {
          release = r;
        });
      return real(fn, args);
    };
    return () => release?.();
  };

  it("normal sign-out: the auth event resets the store before the promise resolves → still navigates once", async () => {
    const f = makeFlow({ resetsStore: true });
    await f.flow.start();
    expect(getWorkspaceSaveContext().userId).toBeNull();
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
    expect(f.states.map((s) => s.kind)).toEqual(["signingOut", "idle"]);
  });

  it("normal cleanup that unmounts the view before the promise resolves still navigates once", async () => {
    const f = makeFlow({ defer: true });
    const pending = f.flow.start();
    await flush();
    resetStore(); // the auth observer's ordinary signed-out cleanup (no user) …
    f.flow.detach(); // … which unmounts the authenticated layout and this shell
    f.releaseSignOut();
    await pending;
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });

  it("late auth success after dispose: no navigation, no state change", async () => {
    const f = makeFlow({ defer: true });
    const pending = f.flow.start();
    await flush();
    const before = f.states.length;
    f.flow.detach();
    f.releaseSignOut();
    await pending;
    expect(f.calls.signedOut).toBe(0);
    expect(f.states).toHaveLength(before);
  });

  it("late auth success after a same-account new epoch: old navigation suppressed, dialog retired, fresh sign-out works", async () => {
    const f = makeFlow({ defer: true });
    const pending = f.flow.start();
    await flush();
    resetStore();
    await hydrateForUser("user1");
    f.releaseSignOut();
    await pending;
    expect(f.calls.signedOut).toBe(0);
    expect(f.flow.state().kind).toBe("idle");
    const fresh = makeFlow();
    await fresh.flow.start();
    expect(fresh.calls).toEqual({ signOut: 1, signedOut: 1 });
  });

  it("late auth rejection on a new epoch: no stale error in the new context", async () => {
    const f = makeFlow({ defer: true, fail: true });
    const pending = f.flow.start();
    await flush();
    resetStore();
    await hydrateForUser("user1");
    f.releaseSignOut();
    await pending;
    expect(f.flow.state().kind).toBe("idle");
    expect(f.states.map((s) => s.kind)).not.toContain("error");
  });

  it("old dialog Retry after another user signed in: no save, no sign-out, dialog retired", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const f = makeFlow();
    edit("Old session edit");
    await f.flow.start();
    expect(f.flow.state().kind).toBe("unconfirmed");
    resetStore();
    h.backend.state.errors.apply = undefined as never;
    await hydrateForUser("user2");
    edit("New session edit");
    const batches = h.backend.state.batches.length;
    await f.flow.retry();
    expect(h.backend.state.batches).toHaveLength(batches); // the new session's edit was NOT saved by the old action
    expect(f.calls.signOut).toBe(0);
    expect(f.flow.state().kind).toBe("idle");
  });

  it("old dialog Leave after a replacement session: no sign-out, dialog retired", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const f = makeFlow();
    edit("Old session edit");
    await f.flow.start();
    resetStore();
    await hydrateForUser("user2");
    await f.flow.leave();
    expect(f.calls.signOut).toBe(0);
    expect(f.flow.state().kind).toBe("idle");
  });

  it("reconcile on session change retires a stale unconfirmed/error dialog while mounted", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const f = makeFlow();
    edit("Old session edit");
    await f.flow.start();
    expect(f.flow.state().kind).toBe("unconfirmed");
    f.flow.reconcile(); // same session: nothing happens
    expect(f.flow.state().kind).toBe("unconfirmed");
    resetStore();
    await hydrateForUser("user1");
    f.flow.reconcile();
    expect(f.flow.state().kind).toBe("idle");
  });

  it("pre-sign-out save still pending when a replacement session arrives → retired; the Stay fix and single save are kept", async () => {
    const release = deferApply();
    const f = makeFlow();
    edit("Edited");
    const p = f.flow.start();
    await flush();
    resetStore();
    h.rpcOverride = null;
    await hydrateForUser("user2");
    release();
    await p;
    expect(f.calls.signOut).toBe(0);
    expect(f.flow.state().kind).toBe("idle");
  });
});

describe("AV — late edits around a refused auth sign-out", () => {
  const serverTitle = () =>
    (h.backend.state.doc as { opportunities: { title: string }[] }).opportunities[0].title;

  it("edit arriving while the first (failing) auth is pending is saved before the retried auth", async () => {
    const auth = { fail: true, defer: true, resetsStore: true };
    const f = makeFlow(auth);
    const first = f.flow.start();
    expect(f.flow.state().kind).toBe("signingOut");
    edit("Late background result");
    expect(getWorkspaceSaveStatus().kind).toBe("unsaved");
    f.releaseSignOut();
    await first;
    expect(f.flow.state().kind).toBe("error");
    auth.fail = false;
    auth.defer = false;
    await f.flow.retryAuth();
    expect(f.states.map((s) => s.kind).slice(-3)).toEqual(["saving", "signingOut", "idle"]);
    expect(h.backend.state.batches).toHaveLength(1);
    expect(serverTitle()).toBe("Late background result");
    expect(f.calls).toEqual({ signOut: 2, signedOut: 1 });
  });

  it("edit made AFTER the auth failure is saved before the retried auth", async () => {
    const auth = { fail: true, resetsStore: true };
    const f = makeFlow(auth);
    await f.flow.start();
    expect(f.flow.state().kind).toBe("error");
    edit("Edited after the refusal");
    auth.fail = false;
    await f.flow.retryAuth();
    expect(h.backend.state.batches).toHaveLength(1);
    expect(serverTitle()).toBe("Edited after the refusal");
    expect(f.calls).toEqual({ signOut: 2, signedOut: 1 });
  });

  it("failed save on the auth retry → unconfirmed choice, no second auth request, no navigation; explicit Leave still works", async () => {
    const auth = { fail: true, resetsStore: true };
    const f = makeFlow(auth);
    await f.flow.start();
    edit("Late edit");
    h.backend.state.errors.apply = { message: "503" };
    auth.fail = false;
    await f.flow.retryAuth();
    expect(f.flow.state()).toEqual({ kind: "unconfirmed", status: "unconfirmed" });
    expect(f.calls).toEqual({ signOut: 1, signedOut: 0 });
    // Retry save from the dialog once the backend recovers → auth → signed out.
    h.backend.state.errors.apply = undefined as never;
    await f.flow.retry();
    expect(serverTitle()).toBe("Late edit");
    expect(f.calls).toEqual({ signOut: 2, signedOut: 1 });
  });

  it("failed save on the auth retry, then the explicit Leave: signs out with the recorded consent", async () => {
    const auth = { fail: true, resetsStore: true };
    const f = makeFlow(auth);
    await f.flow.start();
    edit("Late edit");
    h.backend.state.errors.apply = { message: "503" };
    auth.fail = false;
    await f.flow.retryAuth();
    expect(f.flow.state().kind).toBe("unconfirmed");
    await f.flow.leave();
    expect(f.calls).toEqual({ signOut: 2, signedOut: 1 });
    expect(h.backend.state.batches).toHaveLength(0);
  });

  it("content conflict on the auth retry → unconfirmed(conflict), no second auth request", async () => {
    const auth = { fail: true, resetsStore: true };
    const f = makeFlow(auth);
    setState((s) => ({ ...s, content: [{ id: "c1", title: "Draft", body: "mine" } as never] }));
    await saveWorkspaceNow();
    await f.flow.start();
    (h.backend.state.doc as { content: unknown[] }).content = [
      { id: "c1", title: "Draft", body: "theirs" },
    ];
    setState((s) => ({ ...s, content: [{ id: "c1", title: "Draft", body: "mine2" } as never] }));
    auth.fail = false;
    await f.flow.retryAuth();
    expect(f.flow.state()).toEqual({ kind: "unconfirmed", status: "conflict" });
    expect(f.calls.signOut).toBe(1);
  });

  it("clean auth retry: no edits → no save, one more auth request, signed out", async () => {
    const auth = { fail: true, resetsStore: true };
    const f = makeFlow(auth);
    await f.flow.start();
    auth.fail = false;
    await f.flow.retryAuth();
    expect(h.backend.state.batches).toHaveLength(0);
    expect(f.calls).toEqual({ signOut: 2, signedOut: 1 });
  });

  it("stale-session error retry: no save, no auth request, dialog retired", async () => {
    const auth = { fail: true };
    const f = makeFlow(auth);
    await f.flow.start();
    expect(f.flow.state().kind).toBe("error");
    resetStore();
    await hydrateForUser("user2");
    edit("New session edit");
    auth.fail = false;
    await f.flow.retryAuth();
    expect(f.calls.signOut).toBe(1);
    expect(h.backend.state.batches).toHaveLength(0);
    expect(f.flow.state().kind).toBe("idle");
  });
});

describe("AY — pending unretained producer work gates the sign-out", () => {
  const serverTitle = () =>
    (h.backend.state.doc as { opportunities: { title: string }[] }).opportunities[0].title;

  it("pending work → explicit choice; Stay clears the closing mark; new work is refused while closing", async () => {
    const work = beginProducerWork("meta:o1", "unretained");
    const f = makeFlow();
    await f.flow.start();
    expect(f.flow.state()).toEqual({ kind: "pendingWork", count: 1 });
    expect(isSessionClosing()).toBe(true);
    expect(() => beginProducerWork("faq:o1", "unretained")).toThrow(ProducerSessionError);
    expect(f.calls.signOut).toBe(0);
    f.flow.stay();
    expect(f.flow.state().kind).toBe("idle");
    expect(isSessionClosing()).toBe(false);
    expect(beginProducerWork("faq:o1", "unretained").operation).toBe("faq:o1"); // admitted again
    work.release();
  });

  it("wait: when the pending work settles and left unsaved changes, they are saved, then one auth request", async () => {
    const work = beginProducerWork("meta:o1", "unretained");
    const f = makeFlow({ resetsStore: true });
    await f.flow.start();
    expect(f.flow.state().kind).toBe("pendingWork");
    edit("Late result applied by the producer");
    work.release();
    await f.flow.pendingChanged();
    expect(h.backend.state.batches).toHaveLength(1);
    expect(serverTitle()).toBe("Late result applied by the producer");
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
    expect(f.states.map((s) => s.kind)).toEqual(["pendingWork", "saving", "signingOut", "idle"]);
  });

  it("Leave from the pending gate: proceeds with the ordinary path; the pending work is not awaited", async () => {
    const work = beginProducerWork("meta:o1", "unretained");
    const f = makeFlow({ resetsStore: true });
    await f.flow.start();
    await f.flow.leavePending();
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
    expect(h.backend.state.batches).toHaveLength(0);
    // The old work settles afterwards into a signed-out shell: its own session check would refuse the write.
    work.release();
    expect(getPendingProducerWork().unretained).toBe(0);
  });

  it("final live re-check at the auth boundary saves changes produced after the pre-sign-out save", async () => {
    let injected = false;
    const f = makeFlow({ resetsStore: true });
    const original = f.flow;
    // Wrap: after the first real save completes, a producer completes and leaves a new edit.
    const flow = createSignOutFlow({
      status: getWorkspaceSaveStatus,
      context: getWorkspaceSaveContext,
      save: async () => {
        await saveWorkspaceNow();
        if (!injected) {
          injected = true;
          edit("Produced during the pre-sign-out save");
        }
      },
      signOut: async () => {
        f.calls.signOut += 1;
        resetStore();
      },
      onState: (s) => f.states.push(s),
      onSignedOut: () => {
        f.calls.signedOut += 1;
      },
      pendingUnretained: () => 0,
      acquireClosing: acquireClosingLease,
      authPending: isSessionAuthPending,
    });
    void original;
    edit("First edit");
    await flow.start();
    expect(h.backend.state.batches).toHaveLength(2); // first save, then the re-check save
    expect(serverTitle()).toBe("Produced during the pre-sign-out save");
    expect(f.calls).toEqual({ signOut: 1, signedOut: 1 });
  });

  it("work finishing during a refused auth: the retry saves what it left before the next auth request", async () => {
    const work = beginProducerWork("meta:o1", "unretained");
    const auth = { fail: true, resetsStore: true };
    const f = makeFlow(auth);
    await f.flow.start();
    expect(f.flow.state().kind).toBe("pendingWork");
    await f.flow.leavePending(); // clean workspace → auth request → refused
    expect(f.flow.state().kind).toBe("error");
    expect(f.calls.signOut).toBe(1);
    edit("Result applied while the auth was being retried"); // the pending work finishes now
    work.release();
    auth.fail = false;
    await f.flow.retryAuth();
    expect(h.backend.state.batches).toHaveLength(1);
    expect(serverTitle()).toBe("Result applied while the auth was being retried");
    expect(f.calls).toEqual({ signOut: 2, signedOut: 1 });
  });

  it("a replacement session retires the pending gate without acting", async () => {
    beginProducerWork("meta:o1", "unretained");
    const f = makeFlow();
    await f.flow.start();
    expect(f.flow.state().kind).toBe("pendingWork");
    resetStore();
    await hydrateForUser("user2");
    await f.flow.pendingChanged();
    expect(f.flow.state().kind).toBe("idle");
    expect(f.calls.signOut).toBe(0);
    expect(isSessionClosing()).toBe(false);
  });
});

describe("AZ — the closing lease is owned by the sign-out attempt", () => {
  it("detach while the auth request is pending keeps admission closed until the request settles", async () => {
    const f = makeFlow({ defer: true, resetsStore: true });
    const p = f.flow.start();
    await flush();
    expect(isSessionClosing()).toBe(true);
    f.flow.detach(); // e.g. the route unmounts while the supplier request is in flight
    expect(isSessionClosing()).toBe(true); // no new unretained work can slip in and be lost
    expect(() => beginProducerWork("new-ai", "unretained")).toThrow(ProducerSessionError);
    f.releaseSignOut();
    await p;
    expect(getWorkspaceSaveContext().userId).toBeNull(); // ordinary cleanup ran
    expect(f.calls.signedOut).toBe(1); // signedOutCleanup path still navigates once
    // The old session's lease no longer matters; a fresh session is open for work.
    await hydrateForUser("user1");
    expect(isSessionClosing()).toBe(false);
    expect(() => beginProducerWork("new-ai", "unretained")).not.toThrow();
  });

  it("detach while the auth request is pending and the request is then refused releases the lease (no deadlock)", async () => {
    const f = makeFlow({ defer: true, fail: true });
    const p = f.flow.start();
    await flush();
    f.flow.detach();
    expect(isSessionClosing()).toBe(true);
    f.releaseSignOut();
    await p;
    expect(isSessionClosing()).toBe(false); // settled: the detached attempt keeps no block behind
    expect(f.states.map((s) => s.kind)).not.toContain("error");
  });

  it("an old detached flow cannot clear a replacement session's closing lease", async () => {
    const first = makeFlow({ defer: true });
    const p1 = first.flow.start();
    await flush();
    resetStore();
    await hydrateForUser("user2");
    const next = makeFlow({ defer: true });
    const p2 = next.flow.start();
    await flush();
    expect(isSessionClosing()).toBe(true);
    first.flow.detach();
    expect(isSessionClosing()).toBe(true); // user2's gate is intact
    expect(() => beginProducerWork("new-ai", "unretained")).toThrow(ProducerSessionError);
    first.releaseSignOut();
    next.releaseSignOut();
    await Promise.all([p1, p2]);
    expect(next.calls).toEqual({ signOut: 1, signedOut: 1 });
    expect(first.calls.signedOut).toBe(0);
  });

  it("detach without an issued auth request releases the lease immediately; Stay and a refused live auth also release it", async () => {
    const work = beginProducerWork("meta:o1", "unretained");
    const f = makeFlow();
    await f.flow.start();
    expect(f.flow.state().kind).toBe("pendingWork");
    expect(isSessionClosing()).toBe(true);
    f.flow.detach();
    expect(isSessionClosing()).toBe(false); // nothing issued: no reason to keep blocking
    work.release();
    const g = makeFlow({ fail: true });
    await g.flow.start();
    expect(g.flow.state().kind).toBe("error");
    expect(isSessionClosing()).toBe(true); // the attempt is still open in the dialog
    g.flow.stay();
    expect(isSessionClosing()).toBe(false);
  });
});

describe("BA — overlapping sign-out attempts of the SAME session", () => {
  it("a remounted second attempt's Stay ends only its own choice; the first issued request keeps admission closed; new work is refused; success resets once", async () => {
    const preexisting = beginProducerWork("old-meta", "unretained");
    const first = makeFlow({ defer: true, resetsStore: true });
    await first.flow.start();
    expect(first.flow.state().kind).toBe("pendingWork");
    const auth = first.flow.leavePending();
    await flush();
    expect(first.calls.signOut).toBe(1);
    first.flow.detach(); // remount: the issued request stays pending
    expect(isSessionClosing()).toBe(true);
    expect(isSessionAuthPending()).toBe(true);
    const remounted = makeFlow();
    await remounted.flow.start();
    expect(remounted.flow.state().kind).toBe("pendingWork");
    remounted.flow.stay();
    expect(isSessionClosing()).toBe(true); // the first attempt's barrier survives the second Stay
    expect(() => beginProducerWork("new-meta", "unretained")).toThrow(ProducerSessionError);
    expect(getPendingProducerWork().unretained).toBe(1);
    first.releaseSignOut();
    await auth;
    expect(getWorkspaceSaveContext().userId).toBeNull(); // ordinary cleanup
    expect(first.calls.signedOut).toBe(1);
    expect(remounted.calls).toEqual({ signOut: 0, signedOut: 0 }); // no duplicate request, no second navigation
    preexisting.release();
  });

  it("second attempt chooses Leave while the first request is pending: shows signing-out, issues NO duplicate; first refusal → second shows the error", async () => {
    const preexisting = beginProducerWork("old-meta", "unretained");
    const first = makeFlow({ defer: true, fail: true });
    await first.flow.start();
    const auth = first.flow.leavePending();
    await flush();
    first.flow.detach();
    const second = makeFlow({ defer: true });
    await second.flow.start();
    await second.flow.leavePending();
    expect(second.flow.state().kind).toBe("signingOut"); // truthful: a sign-out is already in progress
    expect(second.calls.signOut).toBe(0);
    expect(isSessionAuthPending()).toBe(true);
    first.releaseSignOut();
    await auth; // refused
    expect(isSessionAuthPending()).toBe(false);
    second.flow.reconcileAttempt(); // what the shell's effect does when the registry changes
    expect(second.flow.state().kind).toBe("error"); // still signed in; Try again / Stay available
    expect(isSessionClosing()).toBe(true); // the second attempt still holds its own lease while its dialog is open
    second.flow.stay();
    expect(isSessionClosing()).toBe(false);
    expect(() => beginProducerWork("new-meta", "unretained")).not.toThrow();
    preexisting.release();
  });

  it("second attempt waiting on the first request: first succeeds → second retires silently, navigation once", async () => {
    const preexisting = beginProducerWork("old-meta", "unretained");
    const first = makeFlow({ defer: true, resetsStore: true });
    await first.flow.start();
    const auth = first.flow.leavePending();
    await flush();
    first.flow.detach();
    const second = makeFlow();
    await second.flow.start();
    await second.flow.leavePending();
    expect(second.flow.state().kind).toBe("signingOut");
    first.releaseSignOut();
    await auth;
    second.flow.reconcileAttempt();
    expect(second.flow.state().kind).toBe("idle");
    expect(first.calls.signedOut + second.calls.signedOut).toBe(1);
    expect(second.calls.signOut).toBe(0);
    preexisting.release();
  });

  it("second attempt detaches while only observing: its own lease is released, the first request's barrier stays", async () => {
    const preexisting = beginProducerWork("old-meta", "unretained");
    const first = makeFlow({ defer: true, fail: true });
    await first.flow.start();
    const auth = first.flow.leavePending();
    await flush();
    first.flow.detach();
    const second = makeFlow();
    await second.flow.start();
    await second.flow.leavePending();
    second.flow.detach();
    expect(isSessionClosing()).toBe(true);
    expect(isSessionAuthPending()).toBe(true);
    first.releaseSignOut();
    await auth;
    expect(isSessionClosing()).toBe(false); // both attempts over: no deadlock
    preexisting.release();
  });

  it("no request issued: cancelling the only attempt releases admission immediately (unchanged)", async () => {
    const work = beginProducerWork("old-meta", "unretained");
    const f = makeFlow();
    await f.flow.start();
    expect(isSessionAuthPending()).toBe(false);
    f.flow.stay();
    expect(isSessionClosing()).toBe(false);
    work.release();
  });
});
