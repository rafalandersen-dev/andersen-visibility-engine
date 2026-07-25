/**
 * Tests for the client side of the workspace optimistic-concurrency system
 * (Phase 1 commit 2): hydration reads rev, saves echo it, the DB's bumped rev
 * is stored without scheduling another save, and workspace_conflict triggers
 * the MERGE-AND-RETRY recovery (P0 fix 2026-07-25 — unsaved local edits must
 * survive a conflict; the old server-wins wipe silently lost creates). The anon Supabase client and sonner
 * are mocked at the module boundary; the store's `typeof window` guard is
 * satisfied via a stubbed global. No OAuth/MCP modules are imported.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface SupabaseResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const h = vi.hoisted(() => ({
  maybeSingleResult: { data: null, error: null } as SupabaseResult,
  /** FIFO of upsert results (merge-retry does a second upsert); falls back to upsertResult. */
  upsertQueue: [] as SupabaseResult[],
  upsertResult: { data: { rev: 1 }, error: null } as SupabaseResult,
  insertResult: { data: { rev: 0 }, error: null } as SupabaseResult,
  upsertCalls: [] as { payload: Record<string, unknown>; opts: Record<string, unknown> }[],
  insertCalls: [] as Record<string, unknown>[],
  selectCalls: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "workspaces") throw new Error(`unexpected table ${table}`);
      return {
        select: () => {
          h.selectCalls += 1;
          return { eq: () => ({ maybeSingle: async () => h.maybeSingleResult }) };
        },
        upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
          h.upsertCalls.push({ payload, opts });
          const result = h.upsertQueue.shift() ?? h.upsertResult;
          return { select: () => ({ single: async () => result }) };
        },
        insert: (payload: Record<string, unknown>) => {
          h.insertCalls.push(payload);
          return { select: () => ({ single: async () => h.insertResult }) };
        },
      };
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { hydrateForUser, saveWorkspaceNow, resetStore, getState, setState } from "./store";
import { toast } from "sonner";

const serverRow = (rev: number, projectId = "p-server") => ({
  data: {
    data: {
      projects: [{ id: projectId, name: "Server Project" }],
      content: [],
      activeProjectId: projectId,
    },
    rev,
  },
  error: null,
});

/** Faithful to supabase-js: PostgrestError is an Error subclass with a code. */
const dbError = (message: string, code?: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.upsertCalls = [];
  h.insertCalls = [];
  h.selectCalls = 0;
  h.maybeSingleResult = { data: null, error: null };
  h.upsertResult = { data: { rev: 1 }, error: null };
  h.insertResult = { data: { rev: 0 }, error: null };
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("hydration + rev", () => {
  it("hydrate reads data AND rev from the row", async () => {
    h.maybeSingleResult = serverRow(5);
    await hydrateForUser("user1");
    const s = getState();
    expect(s.hydrated).toBe(true);
    expect(s.rev).toBe(5);
    expect(s.projects[0]?.id).toBe("p-server");
  });

  it("first-run insert stores the returned rev", async () => {
    h.maybeSingleResult = { data: null, error: null };
    h.insertResult = { data: { rev: 0 }, error: null };
    await hydrateForUser("newuser");
    expect(h.insertCalls).toHaveLength(1);
    expect(h.insertCalls[0].user_id).toBe("newuser");
    const s = getState();
    expect(s.hydrated).toBe(true);
    expect(s.rev).toBe(0);
    expect(s.projects).toEqual([]);
  });

  // 2026-07-25 outage regression: PostgREST 503'd every call; the old fallback
  // presented the failure as an EMPTY hydrated workspace, so the onboarding
  // guard yanked a 5-project owner into the wizard as if their data were gone.
  it("a failed hydrate fetch sets hydrationFailed — never a phantom empty workspace", async () => {
    h.maybeSingleResult = { data: null, error: dbError("Service Unavailable", "PGRST002") };
    await hydrateForUser("user1");
    const s = getState();
    expect(s.hydrationFailed).toBe(true);
    expect(s.hydrated).toBe(false); // keeps the retry path open
    expect(s.projects).toEqual([]);
    expect(h.insertCalls).toHaveLength(0); // no first-run seed on failure
  });

  it("a failed first-run seed insert is a failed hydrate too", async () => {
    h.maybeSingleResult = { data: null, error: null };
    h.insertResult = { data: null, error: dbError("Service Unavailable", "PGRST002") };
    await hydrateForUser("newuser");
    const s = getState();
    expect(s.hydrationFailed).toBe(true);
    expect(s.hydrated).toBe(false);
  });

  it("retry after a failed hydrate recovers the full workspace", async () => {
    h.maybeSingleResult = { data: null, error: dbError("Service Unavailable", "PGRST002") };
    await hydrateForUser("user1");
    expect(getState().hydrationFailed).toBe(true);
    h.maybeSingleResult = serverRow(7);
    await hydrateForUser("user1"); // hydrated stayed false → no early-return
    const s = getState();
    expect(s.hydrationFailed).toBe(false);
    expect(s.hydrated).toBe(true);
    expect(s.rev).toBe(7);
    expect(s.projects[0]?.id).toBe("p-server");
  });

  it("resetStore returns rev to 0", async () => {
    h.maybeSingleResult = serverRow(7);
    await hydrateForUser("user1");
    expect(getState().rev).toBe(7);
    resetStore();
    expect(getState().rev).toBe(0);
  });
});

describe("save path", () => {
  it("save echoes the snapshot-time rev, keeps rev OUT of data, and stores the bumped rev", async () => {
    h.maybeSingleResult = serverRow(5);
    await hydrateForUser("user1");
    h.upsertResult = { data: { rev: 6 }, error: null };
    await saveWorkspaceNow();
    expect(h.upsertCalls).toHaveLength(1);
    const { payload, opts } = h.upsertCalls[0];
    expect(payload.user_id).toBe("user1");
    expect(payload.rev).toBe(5); // echo, not the bump
    expect(opts).toEqual({ onConflict: "user_id" });
    expect(Object.keys(payload.data as Record<string, unknown>)).not.toContain("rev");
    expect(JSON.stringify(payload.data)).not.toContain('"rev"');
    expect(getState().rev).toBe(6);
  });

  it("save success does NOT schedule another save (no loop)", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(1);
    await hydrateForUser("user1");
    h.upsertResult = { data: { rev: 2 }, error: null };
    await saveWorkspaceNow();
    expect(h.upsertCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.upsertCalls).toHaveLength(1); // rev-only update never re-saved
    expect(getState().rev).toBe(2);
  });

  it("tasks[] survives the hydrate → snapshot round trip (server-written tasks are not dropped)", async () => {
    const task = {
      id: "t1",
      projectId: "p-server",
      title: "server task",
      status: "open",
      origin: "claude",
      createdAt: "x",
      updatedAt: "x",
    };
    h.maybeSingleResult = {
      data: {
        data: { projects: [{ id: "p-server" }], tasks: [task], activeProjectId: "p-server" },
        rev: 5,
      },
      error: null,
    };
    await hydrateForUser("user1");
    expect(getState().tasks).toEqual([task]);
    h.upsertResult = { data: { rev: 6 }, error: null };
    await saveWorkspaceNow();
    const written = h.upsertCalls[0].payload.data as Record<string, unknown>;
    expect(written.tasks).toEqual([task]); // enumerated snapshot now carries tasks
    expect(Object.keys(written)).not.toContain("rev");
  });

  it("workspaces with no tasks key hydrate with tasks []", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    expect(getState().tasks).toEqual([]);
  });

  it("setState still schedules a debounced save that echoes the current rev", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    h.upsertResult = { data: { rev: 4 }, error: null };
    setState((s) => ({ ...s, activeProjectId: "changed" }));
    expect(h.upsertCalls).toHaveLength(0); // debounced
    await vi.advanceTimersByTimeAsync(700);
    expect(h.upsertCalls).toHaveLength(1);
    expect(h.upsertCalls[0].payload.rev).toBe(3);
    expect(getState().rev).toBe(4);
  });
});

describe("conflict handling (merge-and-retry — P0 fix 2026-07-25)", () => {
  it("conflict → merge + retry: unsaved local creates SURVIVE (the 45-lost-opportunities bug)", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(5, "p-local");
    await hydrateForUser("user1");
    // The user creates an opportunity locally — this must never be lost.
    setState((s) => ({
      ...s,
      opportunities: [
        ...s.opportunities,
        { id: "opp-local", projectId: "p-local", title: "Local create" } as never,
      ],
    }));

    h.upsertQueue = [
      { data: null, error: dbError("workspace_conflict", "40001") }, // first save: stale rev
      { data: { rev: 10 }, error: null }, // merged retry succeeds
    ];
    // The conflict refetch: server bumped to rev 9 and gained a project.
    h.maybeSingleResult = {
      data: {
        data: {
          projects: [
            { id: "p-local", name: "Local Project" },
            { id: "p-fresh", name: "Server-added Project" },
          ],
          opportunities: [{ id: "opp-server", projectId: "p-fresh", title: "Server create" }],
          content: [],
          activeProjectId: "p-fresh",
        },
        rev: 9,
      },
      error: null,
    };
    await saveWorkspaceNow(); // must not throw

    const s = getState();
    expect(s.rev).toBe(10);
    // The retry payload carried BOTH the server's and the local entities.
    const retryPayload = h.upsertCalls[h.upsertCalls.length - 1].payload as {
      data: { opportunities: { id: string }[]; activeProjectId: string };
      rev: number;
    };
    expect(retryPayload.rev).toBe(9); // echoed the fresh rev
    const ids = retryPayload.data.opportunities.map((o) => o.id).sort();
    expect(ids).toEqual(["opp-local", "opp-server"]);
    // Device-local active project is NOT flipped by another writer.
    expect(retryPayload.data.activeProjectId).toBe("p-local");
    expect(s.activeProjectId).toBe("p-local");
    // Live state gained the server entity and kept the local one.
    expect(s.opportunities.map((o) => o.id).sort()).toEqual(["opp-local", "opp-server"]);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.info).mock.calls[0][0])).toMatch(/merged and saved/i);
  });

  it("a workspace_conflict MESSAGE (different code) also goes through the merge path", async () => {
    h.maybeSingleResult = serverRow(2);
    await hydrateForUser("user1");
    h.upsertQueue = [
      { data: null, error: dbError("ERROR: workspace_conflict raised by trigger", "P0001") },
      { data: { rev: 4 }, error: null },
    ];
    h.maybeSingleResult = serverRow(3);
    await saveWorkspaceNow(); // no throw
    expect(getState().rev).toBe(4);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("double conflict: local state is KEPT, the user is told, and a retry is scheduled — never a silent wipe", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(5, "p-local");
    await hydrateForUser("user1");
    setState((s) => ({
      ...s,
      opportunities: [{ id: "opp-keep", projectId: "p-local", title: "Keep me" } as never],
    }));
    await vi.advanceTimersByTimeAsync(700); // flush the debounced save from setState
    h.upsertCalls.length = 0;

    h.upsertQueue = [
      { data: null, error: dbError("workspace_conflict", "40001") },
      { data: null, error: dbError("workspace_conflict", "40001") },
    ];
    h.maybeSingleResult = serverRow(9, "p-local");
    await saveWorkspaceNow(); // must not throw
    expect(getState().opportunities.map((o) => o.id)).toContain("opp-keep"); // nothing wiped
    expect(toast.error).toHaveBeenCalledTimes(1);
    // A retry save was scheduled (debounced) — it fires and can now succeed.
    h.upsertResult = { data: { rev: 12 }, error: null };
    await vi.advanceTimersByTimeAsync(700);
    expect(h.upsertCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("conflict + unreadable fresh row: local kept, loud error, retry scheduled", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(5, "p-local");
    await hydrateForUser("user1");
    setState((s) => ({
      ...s,
      opportunities: [{ id: "opp-keep2", projectId: "p-local", title: "Keep me too" } as never],
    }));
    await vi.advanceTimersByTimeAsync(700);

    h.upsertQueue = [{ data: null, error: dbError("workspace_conflict", "40001") }];
    h.maybeSingleResult = { data: null, error: dbError("network down") }; // refetch fails
    await saveWorkspaceNow(); // must not throw
    expect(getState().opportunities.map((o) => o.id)).toContain("opp-keep2");
    expect(toast.error).toHaveBeenCalled();
  });

  it("project-cap errors still THROW and the debounced path still shows toast.error", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(1);
    await hydrateForUser("user1");
    h.upsertResult = { data: null, error: dbError("Project limit reached (3).") };

    await expect(saveWorkspaceNow()).rejects.toMatchObject({
      message: "Project limit reached (3).",
    });
    expect(toast.info).not.toHaveBeenCalled();

    setState((s) => ({ ...s, activeProjectId: "again" })); // debounced path surfaces the cap toast
    await vi.advanceTimersByTimeAsync(700);
    expect(toast.error).toHaveBeenCalledWith("Project limit reached (3).");
  });

  it("non-conflict errors still throw (no rehydrate, no toast)", async () => {
    h.maybeSingleResult = serverRow(1);
    await hydrateForUser("user1");
    h.upsertResult = { data: null, error: dbError("db down", "XX000") };
    const selectsBefore = h.selectCalls;
    await expect(saveWorkspaceNow()).rejects.toMatchObject({ message: "db down" });
    expect(h.selectCalls).toBe(selectsBefore); // no conflict refetch
    expect(toast.info).not.toHaveBeenCalled();
    expect(getState().rev).toBe(1); // unchanged
  });
});
