/**
 * AS — global workspace persistence status derived by the REAL store from the REAL save path
 * (fake entity backend at the Supabase client boundary). Covers dirty-before-debounce, in-flight,
 * confirmed, transport rejection, lost response, content conflict, edits during a save, queued
 * calls in both orders, empty diff, backfill success/failure, not-ready, cross-user and same-user
 * epochs, project switch, and the reactive subscription with a stable snapshot.
 *
 * Fixture limits: the fake backend upserts by entity key and does not emulate the DB recency
 * trigger or concurrent writers.
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
  getState,
  setState,
  setActiveProject,
  getWorkspaceSaveStatus,
  subscribeWorkspaceSaveStatus,
  hasUnsavedWorkspaceChanges,
} from "./store";
import {
  hasUnconfirmedWorkspaceChanges,
  saveStatusOffersRetry,
  deriveWorkspaceSaveStatus,
} from "./workspace-save-status";

const DOC = {
  projects: [
    { id: "p1", name: "Project" },
    { id: "p2", name: "Other" },
  ],
  content: [{ id: "c1", title: "Draft", body: "v1" }],
  opportunities: [{ id: "o1", projectId: "p1", title: "Original" }],
  activeProjectId: "p1",
};
const kind = () => getWorkspaceSaveStatus().kind;
const editTitle = (title: string) =>
  setState((s) => ({
    ...s,
    opportunities: s.opportunities.map((o) => (o.id === "o1" ? { ...o, title } : o)),
  }));
const serverTitle = () =>
  (h.backend.state.doc as { opportunities: { id: string; title: string }[] }).opportunities.find(
    (o) => o.id === "o1",
  )?.title;
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
const flush = () => new Promise((r) => setTimeout(r, 0));

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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("basic lifecycle", () => {
  it("notReady before hydration, saved right after hydration (usable baseline, empty diff)", async () => {
    resetStore();
    expect(kind()).toBe("notReady");
    await hydrateForUser("user1");
    expect(kind()).toBe("saved");
    expect(hasUnconfirmedWorkspaceChanges(getWorkspaceSaveStatus())).toBe(false);
  });

  it("an edit is 'unsaved' immediately, before the debounce; then saving; then saved", async () => {
    vi.useFakeTimers();
    const release = deferApply();
    editTitle("Edited");
    expect(kind()).toBe("unsaved");
    expect(h.backend.state.batches).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(kind()).toBe("saving");
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(kind()).toBe("saved");
    expect(h.backend.state.batches).toHaveLength(1);
    expect(serverTitle()).toBe("Edited");
  });

  it("an edit made during an in-flight save is not reported as saved when that save confirms", async () => {
    const release = deferApply();
    editTitle("First");
    const p = saveWorkspaceNow();
    await flush();
    expect(kind()).toBe("saving");
    editTitle("Second");
    release();
    await p;
    expect(kind()).toBe("unsaved"); // the older snapshot confirmed; the newer edit is not
    h.rpcOverride = null;
    await saveWorkspaceNow();
    expect(kind()).toBe("saved");
    expect(serverTitle()).toBe("Second");
  });

  it("an explicit save with nothing to send is 'saved' without a batch", async () => {
    await saveWorkspaceNow();
    expect(kind()).toBe("saved");
    expect(h.backend.state.batches).toHaveLength(0);
  });
});

describe("failures and retry", () => {
  it("transport rejection → unconfirmed with retry; retry keeps the same ids and confirms", async () => {
    h.backend.state.errors.apply = { message: "503 (never shown)" };
    editTitle("Edited");
    await expect(saveWorkspaceNow()).rejects.toBeTruthy();
    expect(kind()).toBe("unconfirmed");
    expect(saveStatusOffersRetry(getWorkspaceSaveStatus())).toBe(true);
    expect(hasUnconfirmedWorkspaceChanges(getWorkspaceSaveStatus())).toBe(true);
    await expect(saveWorkspaceNow()).rejects.toBeTruthy(); // repeated failure stays retryable
    expect(kind()).toBe("unconfirmed");
    h.backend.state.errors.apply = undefined as never;
    await saveWorkspaceNow();
    expect(kind()).toBe("saved");
    expect(h.backend.state.batches[0].upserts.map((u) => u.entity_id)).toEqual(["o1"]);
    expect(serverTitle()).toBe("Edited");
  });

  it("a new edit after a failure reads 'unsaved' (a fresh attempt is scheduled), not a stale failure", async () => {
    vi.useFakeTimers();
    h.backend.state.errors.apply = { message: "503" };
    editTitle("One");
    await expect(saveWorkspaceNow()).rejects.toBeTruthy();
    expect(kind()).toBe("unconfirmed");
    editTitle("Two");
    expect(kind()).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(600);
    expect(kind()).toBe("unconfirmed"); // the scheduled retry failed again for these changes
    expect(getState().opportunities[0].title).toBe("Two");
  });

  it("lost response after commit → unconfirmed; retry re-sends the same id, no duplicate", async () => {
    let lost = false;
    h.rpcOverride = async (fn, args, real) => {
      const r = await real(fn, args);
      if (fn === "apply_workspace_entity_batch" && !lost) {
        lost = true;
        return { data: null, error: { message: "network" } };
      }
      return r;
    };
    editTitle("Edited");
    await expect(saveWorkspaceNow()).rejects.toBeTruthy();
    expect(kind()).toBe("unconfirmed");
    expect(serverTitle()).toBe("Edited"); // the server did commit; the client cannot know
    await saveWorkspaceNow();
    expect(kind()).toBe("saved");
    expect(h.backend.state.batches).toHaveLength(2);
    expect((h.backend.state.doc as { opportunities: unknown[] }).opportunities).toHaveLength(1);
  });

  it("content conflict → 'conflict', never bypassed by a retry; local edit and server row both kept", async () => {
    setState((s) => ({
      ...s,
      content: s.content.map((c) => (c.id === "c1" ? { ...c, body: "mine" } : c)),
    }));
    (h.backend.state.doc as { content: unknown[] }).content = [
      { id: "c1", title: "Draft", body: "theirs" },
    ];
    await expect(saveWorkspaceNow()).rejects.toThrow(/another session/);
    expect(kind()).toBe("conflict");
    await expect(saveWorkspaceNow()).rejects.toThrow(/another session/);
    expect(kind()).toBe("conflict");
    expect((h.backend.state.doc as { content: { body: string }[] }).content[0].body).toBe("theirs");
    expect((getState().content[0] as unknown as { body: string }).body).toBe("mine");
  });

  it("backfill branch: not-migrated race backfills the full snapshot and confirms; backfill failure is unconfirmed", async () => {
    editTitle("Edited");
    h.backend.state.doc = null; // server says not migrated
    h.backend.state.errors.backfill = { message: "backfill down" };
    await expect(saveWorkspaceNow()).rejects.toBeTruthy();
    expect(kind()).toBe("unconfirmed");
    h.backend.state.errors.backfill = undefined as never;
    await saveWorkspaceNow();
    expect(kind()).toBe("saved");
    expect(h.backend.state.backfills).toHaveLength(2);
    expect(serverTitle()).toBe("Edited");
  });
});

describe("queued and out-of-order settlements", () => {
  it("first queued save rejected, second confirms → saved (the diff is empty)", async () => {
    let calls = 0;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch" && ++calls === 1)
        return { data: null, error: { message: "first fails" } };
      return real(fn, args);
    };
    editTitle("Edited");
    const first = saveWorkspaceNow();
    const second = saveWorkspaceNow();
    await expect(first).rejects.toBeTruthy();
    await second;
    expect(kind()).toBe("saved");
    expect(serverTitle()).toBe("Edited");
  });

  it("first confirms, an edit lands, second is rejected → unconfirmed for the newer change", async () => {
    let calls = 0;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch" && ++calls === 2)
        return { data: null, error: { message: "second fails" } };
      return real(fn, args);
    };
    editTitle("One");
    await saveWorkspaceNow(); // the older snapshot confirms first
    editTitle("Two");
    await expect(saveWorkspaceNow()).rejects.toBeTruthy(); // the newer one is rejected
    expect(kind()).toBe("unconfirmed");
    expect(serverTitle()).toBe("One");
    expect(getState().opportunities[0].title).toBe("Two");
  });
});

describe("session and project isolation", () => {
  it("not ready: after a reset a save resolves without reporting anything saved", async () => {
    editTitle("Edited");
    resetStore();
    expect(kind()).toBe("notReady");
    await saveWorkspaceNow();
    expect(kind()).toBe("notReady");
    expect(h.backend.state.batches).toHaveLength(0);
  });

  it("cross-user new epoch: the old user's late settlement produces no status for the new user", async () => {
    const release = deferApply();
    editTitle("User1 edit");
    const old = saveWorkspaceNow();
    await flush();
    expect(kind()).toBe("saving");
    resetStore();
    h.rpcOverride = null;
    h.backend.state.doc = structuredClone({ ...DOC, activeProjectId: "p1" });
    await hydrateForUser("user2");
    expect(kind()).toBe("saved");
    release();
    await expect(old).rejects.toThrow(/session changed/);
    expect(kind()).toBe("saved"); // neither stale saving nor stale failure
    expect(hasUnsavedWorkspaceChanges()).toBe(false);
  });

  it("same-user new epoch clears a stale unconfirmed status", async () => {
    h.backend.state.errors.apply = { message: "503" };
    editTitle("Edited");
    await expect(saveWorkspaceNow()).rejects.toBeTruthy();
    expect(kind()).toBe("unconfirmed");
    resetStore();
    h.backend.state.errors.apply = undefined as never;
    await hydrateForUser("user1");
    expect(kind()).toBe("saved");
  });

  it("switching the current project keeps the global dirty state; both changes then save", async () => {
    vi.useFakeTimers();
    editTitle("Edited");
    expect(kind()).toBe("unsaved");
    setActiveProject("p2");
    expect(kind()).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(600);
    expect(kind()).toBe("saved");
    expect(h.backend.state.batches).toHaveLength(1);
    expect(h.backend.state.batches[0].meta).toMatchObject({ activeProjectId: "p2" });
    expect(serverTitle()).toBe("Edited");
  });
});

describe("reactive subscription", () => {
  it("notifies on edits and settlements and returns a stable snapshot while nothing changed", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeWorkspaceSaveStatus(() => seen.push(kind()));
    const a = getWorkspaceSaveStatus();
    expect(getWorkspaceSaveStatus()).toBe(a); // memoized identity
    editTitle("Edited");
    expect(seen.at(-1)).toBe("unsaved");
    await saveWorkspaceNow();
    expect(seen).toContain("saving");
    expect(seen.at(-1)).toBe("saved");
    unsubscribe();
  });

  it("derivation never claims saved without a usable baseline", () => {
    const status = deriveWorkspaceSaveStatus({
      hydrated: true,
      userId: "u",
      epoch: 1,
      saveInFlight: 0,
      hasBaseline: false,
      editSeq: 0,
      lastOutcome: null,
      saveScheduled: false,
      isDirty: () => false,
    });
    expect(status.kind).toBe("notReady");
  });

  it("an edit reports 'unsaved' WITH a scheduled save; a dirty workspace without a timer reports unscheduled", () => {
    const base = {
      hydrated: true,
      userId: "u",
      epoch: 1,
      saveInFlight: 0,
      hasBaseline: true,
      editSeq: 3,
      lastOutcome: null,
      isDirty: () => true,
    };
    expect(deriveWorkspaceSaveStatus({ ...base, saveScheduled: true })).toEqual({
      kind: "unsaved",
      scheduled: true,
    });
    expect(deriveWorkspaceSaveStatus({ ...base, saveScheduled: false })).toEqual({
      kind: "unsaved",
      scheduled: false,
    });
  });

  it("real store: an edit is 'unsaved' with the debounce scheduled", () => {
    vi.useFakeTimers();
    editTitle("Edited");
    expect(getWorkspaceSaveStatus()).toEqual({ kind: "unsaved", scheduled: true });
  });
});
