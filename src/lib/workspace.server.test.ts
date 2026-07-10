/**
 * Tests for the workspace optimistic-concurrency write layer (Phase 1
 * commit 1). The injectable core is exercised with fake deps; the DB wiring
 * is exercised through a mocked Supabase admin boundary. No database, no
 * network — and deliberately NO imports from oauth/mcp modules: this commit
 * must not change any Phase 0 behavior.
 */
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({
  from: undefined as unknown as (table: string) => unknown,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => h.from(table) },
}));

import {
  runWorkspaceMutation,
  mutateWorkspace,
  readWorkspaceRow,
  updateWorkspaceRow,
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  WORKSPACE_WRITE_MAX_ATTEMPTS,
  type WorkspaceWriteDeps,
  type WorkspaceData,
} from "./workspace.server";

const BLOB: WorkspaceData = {
  projects: [{ id: "p1", name: "P1" }],
  content: [],
  activeProjectId: "p1",
  // Forward-compat: keys this code has never heard of must survive writes.
  unknownFutureCollection: [{ id: "x1", nested: { keep: true } }],
  unknownScalar: "keep-me",
};

interface FakeState {
  reads: number;
  updates: { data: WorkspaceData; readRev: number }[];
}

/** Fake deps: `revs` yields the rev returned per read; `updateResults` per update (null = conflict). */
function fakeDeps(revs: number[], updateResults: (number | null)[], readData: WorkspaceData | null = BLOB) {
  const state: FakeState = { reads: 0, updates: [] };
  const deps: WorkspaceWriteDeps = {
    read: async () => {
      const rev = revs[Math.min(state.reads, revs.length - 1)];
      state.reads += 1;
      return readData === null ? null : { data: structuredClone(readData), rev };
    },
    update: async (_userId, data, readRev) => {
      state.updates.push({ data, readRev });
      return updateResults[Math.min(state.updates.length - 1, updateResults.length - 1)];
    },
  };
  return { deps, state };
}

describe("runWorkspaceMutation", () => {
  it("applies the mutation, echoes the read rev to update, and returns result + new rev", async () => {
    const { deps, state } = fakeDeps([7], [8]);
    const out = await runWorkspaceMutation(
      "user1",
      (data) => ({ data: { ...data, activeProjectId: "p2" }, result: { changed: "activeProjectId" } }),
      deps,
    );
    expect(out).toEqual({ result: { changed: "activeProjectId" }, rev: 8 });
    expect(state.reads).toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].readRev).toBe(7); // echo, not 8 — the trigger does the bump
    expect(state.updates[0].data.activeProjectId).toBe("p2");
  });

  it("preserves unknown/extra JSONB keys through a mutation round-trip", async () => {
    const { deps, state } = fakeDeps([1], [2]);
    await runWorkspaceMutation("user1", (data) => ({ data: { ...data, content: [{ id: "c1" }] }, result: null }), deps);
    const written = state.updates[0].data;
    expect(written.unknownFutureCollection).toEqual([{ id: "x1", nested: { keep: true } }]);
    expect(written.unknownScalar).toBe("keep-me");
    expect(written.projects).toEqual([{ id: "p1", name: "P1" }]);
  });

  it("the mutation receives a CLONE — the stored blob is never mutated in place", async () => {
    const { deps } = fakeDeps([1], [2]);
    await runWorkspaceMutation(
      "user1",
      (data) => {
        (data.projects as unknown[]).push({ id: "p2" }); // mutating the clone is fine
        return { data, result: null };
      },
      deps,
    );
    expect(BLOB.projects).toHaveLength(1); // original fixture untouched
  });

  it("a lost race (zero-row update) re-reads and re-runs the mutation, then succeeds", async () => {
    const { deps, state } = fakeDeps([3, 4], [null, 5]);
    let mutateRuns = 0;
    const out = await runWorkspaceMutation(
      "user1",
      (data) => {
        mutateRuns += 1;
        return { data, result: mutateRuns };
      },
      deps,
    );
    expect(out.rev).toBe(5);
    expect(out.result).toBe(2); // mutation re-ran on the fresh read
    expect(state.reads).toBe(2);
    expect(state.updates.map((u) => u.readRev)).toEqual([3, 4]); // fresh echo per attempt
  });

  it("exhausting retries throws WorkspaceConflictError after exactly MAX attempts", async () => {
    const { deps, state } = fakeDeps([1, 2, 3], [null, null, null]);
    await expect(runWorkspaceMutation("user1", (data) => ({ data, result: null }), deps)).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(state.reads).toBe(WORKSPACE_WRITE_MAX_ATTEMPTS);
    expect(state.updates).toHaveLength(WORKSPACE_WRITE_MAX_ATTEMPTS);
  });

  it("missing workspace throws WorkspaceNotFoundError without attempting an update", async () => {
    const { deps, state } = fakeDeps([1], [2], null);
    await expect(runWorkspaceMutation("user1", (data) => ({ data, result: null }), deps)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    expect(state.updates).toHaveLength(0);
  });

  it("blank userId throws WorkspaceNotFoundError without any DB access", async () => {
    const deps: WorkspaceWriteDeps = {
      read: async () => {
        throw new Error("must not read");
      },
      update: async () => {
        throw new Error("must not update");
      },
    };
    await expect(runWorkspaceMutation("", (data) => ({ data, result: null }), deps)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("non-conflict update errors propagate immediately (no retry)", async () => {
    let updates = 0;
    const deps: WorkspaceWriteDeps = {
      read: async () => ({ data: {}, rev: 1 }),
      update: async () => {
        updates += 1;
        throw new Error("workspace_update_failed");
      },
    };
    await expect(runWorkspaceMutation("user1", (data) => ({ data, result: null }), deps)).rejects.toThrow("workspace_update_failed");
    expect(updates).toBe(1);
  });
});

// ---- DB wiring through the mocked Supabase boundary ----

interface QueryLog {
  kind: "select" | "update";
  payload?: Record<string, unknown>;
  filters: { k: string; v: unknown }[];
}

function workspacesFake(cfg: {
  selectRow?: Record<string, unknown> | null;
  updateRow?: Record<string, unknown> | null;
  updateError?: { code?: string; message?: string } | null;
  log: QueryLog[];
}) {
  return (table: string) => {
    expect(table).toBe("workspaces");
    const chain = (entry: QueryLog, result: () => { data: Record<string, unknown> | null; error: unknown }) => {
      const c: Record<string, unknown> = {};
      c.eq = (k: string, v: unknown) => {
        entry.filters.push({ k, v });
        return c;
      };
      c.select = () => c;
      c.maybeSingle = async () => result();
      return c;
    };
    return {
      select: () => {
        const entry: QueryLog = { kind: "select", filters: [] };
        cfg.log.push(entry);
        return chain(entry, () => ({ data: cfg.selectRow ?? null, error: null }));
      },
      update: (payload: Record<string, unknown>) => {
        const entry: QueryLog = { kind: "update", payload, filters: [] };
        cfg.log.push(entry);
        return chain(entry, () => ({ data: cfg.updateError ? null : (cfg.updateRow ?? null), error: cfg.updateError ?? null }));
      },
    };
  };
}

describe("readWorkspaceRow / updateWorkspaceRow / mutateWorkspace (DB wiring)", () => {
  it("readWorkspaceRow selects data+rev scoped to the user and defaults safely", async () => {
    const log: QueryLog[] = [];
    h.from = workspacesFake({ selectRow: { data: { projects: [] }, rev: 4 }, log });
    expect(await readWorkspaceRow("user1")).toEqual({ data: { projects: [] }, rev: 4 });
    expect(log[0].filters).toEqual([{ k: "user_id", v: "user1" }]);
    h.from = workspacesFake({ selectRow: { data: null, rev: null }, log });
    expect(await readWorkspaceRow("user1")).toEqual({ data: {}, rev: 0 });
    expect(await readWorkspaceRow("")).toBeNull(); // no DB call path
  });

  it("updateWorkspaceRow echoes the read rev in payload AND filters by user_id + rev", async () => {
    const log: QueryLog[] = [];
    h.from = workspacesFake({ updateRow: { rev: 6 }, log });
    const newRev = await updateWorkspaceRow("user1", { projects: [] }, 5);
    expect(newRev).toBe(6);
    expect(log[0].payload).toEqual({ data: { projects: [] }, rev: 5 }); // echo
    expect(log[0].filters).toEqual([
      { k: "user_id", v: "user1" },
      { k: "rev", v: 5 },
    ]);
  });

  it("zero-row update (stale rev or wrong owner) returns null; trigger conflict maps to null; other errors throw", async () => {
    const log: QueryLog[] = [];
    h.from = workspacesFake({ updateRow: null, log });
    expect(await updateWorkspaceRow("user1", {}, 5)).toBeNull();
    h.from = workspacesFake({ updateError: { code: "40001", message: "workspace_conflict" }, log });
    expect(await updateWorkspaceRow("user1", {}, 5)).toBeNull();
    h.from = workspacesFake({ updateError: { code: "XX000", message: "db_down" }, log });
    await expect(updateWorkspaceRow("user1", {}, 5)).rejects.toThrow("workspace_update_failed");
  });

  it("mutateWorkspace wires core + DB: wrong owner (zero rows on every try) → WorkspaceConflictError", async () => {
    // A foreign user_id reads null → NotFound; simulate the subtler case where
    // the row exists on read but the guarded update never matches.
    const log: QueryLog[] = [];
    h.from = workspacesFake({ selectRow: { data: {}, rev: 1 }, updateRow: null, log });
    await expect(mutateWorkspace("user1", (data) => ({ data, result: null }))).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(log.filter((l) => l.kind === "update")).toHaveLength(WORKSPACE_WRITE_MAX_ATTEMPTS);
    // And the plain foreign-user case: no row at all → NotFound.
    h.from = workspacesFake({ selectRow: null, log: [] });
    await expect(mutateWorkspace("intruder", (data) => ({ data, result: null }))).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });
});
