/**
 * Client persistence contract — per-entity backend (scale migration
 * 2026-07-26). What replaced the blob's rev-echo/conflict-merge machinery:
 *
 *  - hydrate reads the entity BUNDLE (one RPC) and sets the diff baseline;
 *  - a save sends ONLY the diff (upserts/deletes/meta) through the atomic
 *    batch RPC — never the whole doc, never a rev echo;
 *  - the baseline advances only after a CONFIRMED write, so a failed save
 *    keeps every change in the next diff (nothing is silently dropped —
 *    the "45 lost opportunities" incident class stays dead);
 *  - unmigrated users fall back to the legacy blob and are backfilled;
 *    first-run users get their meta row created or hydrate FAILS LOUDLY
 *    (2026-07-25 outage lesson: no phantom-empty workspaces).
 *
 * The anon Supabase client and sonner are mocked at the module boundary; the
 * fake entity backend (workspace-entities.testkit) emulates the RPC contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

interface SupabaseResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
  blobRow: { data: null, error: null } as SupabaseResult,
  blobSelects: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
    from: (table: string) => {
      if (table !== "workspaces") throw new Error(`unexpected table ${table}`);
      return {
        select: () => {
          h.blobSelects += 1;
          return { eq: () => ({ maybeSingle: async () => h.blobRow }) };
        },
      };
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

import { hydrateForUser, saveWorkspaceNow, resetStore, getState, setState } from "./store";

const DOC = {
  projects: [{ id: "p-server", name: "Server Project" }],
  content: [],
  activeProjectId: "p-server",
};

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  h.blobRow = { data: null, error: null };
  h.blobSelects = 0;
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("hydration", () => {
  it("migrated user: one bundle RPC, no blob read, rev adopted", async () => {
    h.backend.state.doc = structuredClone(DOC);
    h.backend.state.rev = 7;
    await hydrateForUser("user1");
    const s = getState();
    expect(s.hydrated).toBe(true);
    expect(s.rev).toBe(7);
    expect(s.projects[0]?.id).toBe("p-server");
    expect(h.blobSelects).toBe(0);
  });

  it("legacy user: blob fallback renders AND backfills the entity rows", async () => {
    h.blobRow = { data: { data: structuredClone(DOC), rev: 1563 }, error: null };
    await hydrateForUser("user1");
    const s = getState();
    expect(s.hydrated).toBe(true);
    expect(s.projects[0]?.id).toBe("p-server");
    expect(h.backend.state.backfills).toHaveLength(1);
    // The backfill adopted the doc — the user is migrated from now on.
    expect((h.backend.state.doc?.projects as unknown[])?.length).toBe(1);
  });

  it("first-run user: backfill creates the meta marker; its failure fails hydrate LOUDLY", async () => {
    await hydrateForUser("newuser");
    expect(getState().hydrated).toBe(true);
    expect(h.backend.state.doc).not.toBeNull(); // empty workspace adopted
    resetStore();
    h.backend = makeEntityBackend();
    h.backend.state.errors.backfill = { message: "503" };
    await hydrateForUser("newuser2");
    const s = getState();
    expect(s.hydrationFailed).toBe(true);
    expect(s.hydrated).toBe(false); // retry path stays open, saves stay disabled
  });

  it("bundle read failure sets hydrationFailed — never a phantom empty workspace", async () => {
    h.backend.state.errors.read = { message: "PGRST002" };
    await hydrateForUser("user1");
    const s = getState();
    expect(s.hydrationFailed).toBe(true);
    expect(s.projects).toEqual([]);
    expect(s.hydrated).toBe(false);
  });
});

describe("diff-based saves", () => {
  beforeEach(async () => {
    h.backend.state.doc = structuredClone(DOC);
    h.backend.state.rev = 3;
    await hydrateForUser("user1");
  });

  it("sends ONLY the changed entity, adopts the bumped rev, advances the baseline", async () => {
    setState((s) => ({ ...s, content: [...s.content, { id: "c-new", title: "Draft" } as never] }));
    await saveWorkspaceNow();
    expect(h.backend.state.batches).toHaveLength(1);
    const b = h.backend.state.batches[0];
    expect(b.upserts.map((u) => `${u.collection}:${u.entity_id}`)).toEqual(["content:c-new"]);
    expect(b.deletes).toEqual([]);
    expect(getState().rev).toBe(4);
    // Saving again with no changes is a no-op (baseline advanced).
    await saveWorkspaceNow();
    expect(h.backend.state.batches).toHaveLength(1);
  });

  it("a failed save keeps the change in the NEXT diff (nothing silently dropped)", async () => {
    setState((s) => ({ ...s, content: [{ id: "c-keep", title: "Mine" } as never] }));
    h.backend.state.errors.apply = { message: "503" };
    await expect(saveWorkspaceNow()).rejects.toBeTruthy();
    h.backend.state.errors.apply = undefined as never;
    await saveWorkspaceNow();
    const last = h.backend.state.batches.at(-1);
    expect(last?.upserts.some((u) => u.entity_id === "c-keep")).toBe(true);
    expect((h.backend.state.doc?.content as { id: string }[]).map((c) => c.id)).toEqual(["c-keep"]);
  });

  it("deletes and meta changes ride the same batch", async () => {
    setState((s) => ({ ...s, projects: [], activeProjectId: "" }));
    await saveWorkspaceNow();
    const b = h.backend.state.batches.at(-1);
    expect(b?.deletes).toEqual([{ collection: "projects", entity_id: "p-server" }]);
    expect(b?.meta).toEqual({ activeProjectId: "" });
  });

  it("concurrent writer's entities are NOT clobbered — the diff only touches ours", async () => {
    // A cron writes c-cron directly to the backend between our hydrate and save.
    const cur = h.backend.state.doc as Record<string, unknown>;
    cur.content = [{ id: "c-cron", title: "Cron outcome" }];
    setState((s) => ({ ...s, opportunities: [{ id: "o-mine", title: "Mine" } as never] }));
    await saveWorkspaceNow();
    const doc = h.backend.state.doc as {
      content: { id: string }[];
      opportunities: { id: string }[];
    };
    expect(doc.content.map((c) => c.id)).toEqual(["c-cron"]); // survived our save
    expect(doc.opportunities.map((o) => o.id)).toEqual(["o-mine"]);
  });

  it("backfill race lost (created=false): the batch is RETRIED — edits never silently dropped (review MEDIUM-1)", async () => {
    // First batch hits a not-migrated error, but a CONCURRENT actor migrates
    // the user before our backfill runs — the backfill no-ops (created=false).
    // The save must then retry the batch against the fresh meta row instead of
    // advancing the baseline over unpersisted edits.
    const real = h.backend.rpc.bind(h.backend);
    let batchCalls = 0;
    h.backend = {
      ...h.backend,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn === "apply_workspace_entity_batch" && batchCalls++ === 0) {
          return { data: null, error: { code: "P0002", message: "workspace_not_migrated" } };
        }
        if (fn === "backfill_workspace_entities") {
          return { data: false, error: null }; // concurrent migration won → no-op
        }
        return real(fn, args);
      },
    } as typeof h.backend;
    setState((s) => ({ ...s, content: [{ id: "c-racy", title: "Mine" } as never] }));
    await saveWorkspaceNow();
    expect(batchCalls).toBe(2); // failed once, retried once
    const doc = h.backend.state.doc as { content: { id: string }[] };
    expect(doc.content.map((c) => c.id)).toEqual(["c-racy"]); // persisted by the RETRY
  });

  it("not-migrated race: save backfills the FULL snapshot once and treats it as saved", async () => {
    h.backend.state.doc = null; // simulate a backfill that never landed
    setState((s) => ({ ...s, content: [{ id: "c1", title: "T" } as never] }));
    await saveWorkspaceNow();
    expect(h.backend.state.backfills.length).toBeGreaterThan(0);
    const adopted = h.backend.state.doc as { content: { id: string }[] } | null;
    expect(adopted?.content.map((c) => c.id)).toEqual(["c1"]);
  });
});
