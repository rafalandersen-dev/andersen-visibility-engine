/**
 * Tests for the client side of the workspace optimistic-concurrency system
 * (Phase 1 commit 2): hydration reads rev, saves echo it, the DB's bumped rev
 * is stored without scheduling another save, and workspace_conflict triggers
 * the server-wins rehydrate + toast path. The anon Supabase client and sonner
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
          return { select: () => ({ single: async () => h.upsertResult }) };
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
    data: { projects: [{ id: projectId, name: "Server Project" }], content: [], activeProjectId: projectId },
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

  it("hydrate fallback (select error) still hydrates with rev 0", async () => {
    h.maybeSingleResult = { data: null, error: dbError("boom") };
    await hydrateForUser("user1");
    const s = getState();
    expect(s.hydrated).toBe(true);
    expect(s.rev).toBe(0);
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

describe("conflict handling (v1: server wins)", () => {
  it("errcode 40001 → refetch, replace local state, toast.info, no throw, no extra save", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(5, "p-local");
    await hydrateForUser("user1");
    setState((s) => ({ ...s, activeProjectId: "my-unsaved-edit" }));

    h.upsertResult = { data: null, error: dbError("workspace_conflict", "40001") };
    h.maybeSingleResult = serverRow(9, "p-fresh"); // what the conflict refetch returns
    await saveWorkspaceNow(); // must not throw

    const s = getState();
    expect(s.rev).toBe(9);
    expect(s.projects[0]?.id).toBe("p-fresh");
    expect(s.activeProjectId).toBe("p-fresh"); // server version replaced the local edit
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.info).mock.calls[0][0])).toMatch(/updated elsewhere/i);

    const upsertsSoFar = h.upsertCalls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.upsertCalls).toHaveLength(upsertsSoFar); // rehydrate never re-saves
  });

  it("a workspace_conflict MESSAGE (different code) is also treated as a conflict", async () => {
    h.maybeSingleResult = serverRow(2);
    await hydrateForUser("user1");
    h.upsertResult = { data: null, error: dbError("ERROR: workspace_conflict raised by trigger", "P0001") };
    h.maybeSingleResult = serverRow(3);
    await saveWorkspaceNow(); // no throw
    expect(getState().rev).toBe(3);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("project-cap errors still THROW and the debounced path still shows toast.error", async () => {
    vi.useFakeTimers();
    h.maybeSingleResult = serverRow(1);
    await hydrateForUser("user1");
    h.upsertResult = { data: null, error: dbError("Project limit reached (3).") };

    await expect(saveWorkspaceNow()).rejects.toMatchObject({ message: "Project limit reached (3)." });
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
