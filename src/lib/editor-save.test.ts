/**
 * AS 2026-10-28 — regression for the editor's false-save-confirmation bug.
 *
 * Reproduces the live incident: the editor's bottom Save wrote to the
 * in-memory store and reported success immediately, even while offline and
 * even though the server never confirmed the write. `confirmWorkspaceSave` is
 * the exact function the editor's Save button, status dropdown, Draft/In
 * Review/Reject actions and Export now call — this exercises it against the
 * REAL store/saveWorkspaceNow path (fake entity backend at the Supabase
 * client boundary), not a reimplementation.
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

import { confirmWorkspaceSave } from "./editor-save";
import { hydrateForUser, resetStore, getState, setState } from "./store";

const DOC = {
  projects: [{ id: "p1", name: "Project" }],
  content: [{ id: "c1", title: "Draft", body: "v1" }],
  opportunities: [{ id: "o1", projectId: "p1", title: "Original" }],
  activeProjectId: "p1",
};
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
  let intercepted = false;
  h.rpcOverride = async (fn, args, real) => {
    if (fn === "apply_workspace_entity_batch" && !intercepted) {
      intercepted = true;
      await new Promise<void>((r) => {
        release = r;
      });
    }
    return real(fn, args);
  };
  return () => release?.();
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  h.backend = makeEntityBackend();
  h.rpcOverride = null;
  h.backend.state.doc = structuredClone(DOC);
  h.backend.state.rev = 3;
  resetStore();
  await hydrateForUser("user1");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("confirmWorkspaceSave", () => {
  it("confirmed success: onConfirmed fires only after the server actually acknowledges the write", async () => {
    const release = deferApply();
    const onConfirmed = vi.fn();
    const p = confirmWorkspaceSave(() => editTitle("Edited"), onConfirmed);
    await flush();
    expect(onConfirmed).not.toHaveBeenCalled(); // pending: still in flight, no success yet
    release();
    await p;
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(serverTitle()).toBe("Edited");
  });

  it("offline/unconfirmed: the write is kept locally but onConfirmed never fires (the false-positive this fixes)", async () => {
    h.backend.state.errors.apply = { message: "offline" };
    const onConfirmed = vi.fn();
    await confirmWorkspaceSave(() => editTitle("Edited"), onConfirmed);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(getState().opportunities[0].title).toBe("Edited"); // local text is retained
    expect(serverTitle()).toBe("Original"); // the server never got it
  });

  it("conflict: never confirmed, even though the local edit and the server's row are both kept", async () => {
    setState((s) => ({
      ...s,
      content: s.content.map((c) => (c.id === "c1" ? { ...c, body: "mine" } : c)),
    }));
    (h.backend.state.doc as { content: unknown[] }).content = [
      { id: "c1", title: "Draft", body: "theirs" },
    ];
    const onConfirmed = vi.fn();
    await confirmWorkspaceSave(() => undefined, onConfirmed);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("a newer edit made during an in-flight confirmSave is not claimed as saved by that older confirmation", async () => {
    const release = deferApply();
    const onConfirmedFirst = vi.fn();
    const p = confirmWorkspaceSave(() => editTitle("First"), onConfirmedFirst);
    await flush();
    editTitle("Second"); // lands while the first save is still in flight
    release();
    await p;
    // The server DID commit "First", but by the time the request settled a newer,
    // still-unsaved edit ("Second") already sits on top of it — the older
    // confirmation must not claim the workspace as saved for that snapshot.
    expect(onConfirmedFirst).not.toHaveBeenCalled();
    expect(serverTitle()).toBe("First");
    expect(getState().opportunities[0].title).toBe("Second"); // the newer edit is not overwritten

    // The newer edit still needs — and gets — its own confirmation.
    const onConfirmedSecond = vi.fn();
    await confirmWorkspaceSave(() => undefined, onConfirmedSecond);
    expect(onConfirmedSecond).toHaveBeenCalledTimes(1);
    expect(serverTitle()).toBe("Second");
  });

  it("retry after a lost response resends the same id without duplicating it, then confirms", async () => {
    let lost = false;
    h.rpcOverride = async (fn, args, real) => {
      const r = await real(fn, args);
      if (fn === "apply_workspace_entity_batch" && !lost) {
        lost = true;
        return { data: null, error: { message: "network" } };
      }
      return r;
    };
    const onConfirmed = vi.fn();
    await confirmWorkspaceSave(() => editTitle("Edited"), onConfirmed);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(serverTitle()).toBe("Edited"); // the server DID commit; the client could not know

    const onRetryConfirmed = vi.fn();
    await confirmWorkspaceSave(() => undefined, onRetryConfirmed);
    expect(onRetryConfirmed).toHaveBeenCalledTimes(1);
    expect(h.backend.state.batches).toHaveLength(2);
    expect((h.backend.state.doc as { opportunities: unknown[] }).opportunities).toHaveLength(1);
  });

  it("does not call saveWorkspaceNow itself when there is nothing to send, and still confirms (empty diff)", async () => {
    const onConfirmed = vi.fn();
    await confirmWorkspaceSave(() => undefined, onConfirmed);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(h.backend.state.batches).toHaveLength(0);
  });

  it("isStale: a page-local form edited after this save started, but never written to the store, suppresses onConfirmed", async () => {
    // The store-level diff this exercises against is empty (write() is the
    // only store mutation here) — only `isStale` can catch a caller-tracked
    // edit that never reached the store, which is exactly the editor's
    // page-local form field between two Save presses.
    const release = deferApply();
    const onConfirmed = vi.fn();
    const p = confirmWorkspaceSave(
      () => editTitle("Edited"),
      onConfirmed,
      () => true, // simulates the form having moved on since this save started
    );
    await flush();
    release();
    await p;
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(serverTitle()).toBe("Edited"); // the server still durably got this save
  });

  it("isStale: returning false still confirms once the server acknowledges the write", async () => {
    const release = deferApply();
    const onConfirmed = vi.fn();
    const p = confirmWorkspaceSave(
      () => editTitle("Edited"),
      onConfirmed,
      () => false,
    );
    await flush();
    release();
    await p;
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
