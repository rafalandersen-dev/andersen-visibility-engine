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
