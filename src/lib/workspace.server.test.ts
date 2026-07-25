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
  rpc: undefined as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => h.from(table),
    rpc: (fn: string, args: Record<string, unknown>) => h.rpc(fn, args),
  },
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
function fakeDeps(
  revs: number[],
  updateResults: (number | null)[],
  readData: WorkspaceData | null = BLOB,
) {
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
      (data) => ({
        data: { ...data, activeProjectId: "p2" },
        result: { changed: "activeProjectId" },
      }),
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
    await runWorkspaceMutation(
      "user1",
      (data) => ({ data: { ...data, content: [{ id: "c1" }] }, result: null }),
      deps,
    );
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
    await expect(
      runWorkspaceMutation("user1", (data) => ({ data, result: null }), deps),
    ).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(state.reads).toBe(WORKSPACE_WRITE_MAX_ATTEMPTS);
    expect(state.updates).toHaveLength(WORKSPACE_WRITE_MAX_ATTEMPTS);
  });

  it("missing workspace throws WorkspaceNotFoundError without attempting an update", async () => {
    const { deps, state } = fakeDeps([1], [2], null);
    await expect(
      runWorkspaceMutation("user1", (data) => ({ data, result: null }), deps),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
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
    await expect(
      runWorkspaceMutation("", (data) => ({ data, result: null }), deps),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
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
    await expect(
      runWorkspaceMutation("user1", (data) => ({ data, result: null }), deps),
    ).rejects.toThrow("workspace_update_failed");
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
    const chain = (
      entry: QueryLog,
      result: () => { data: Record<string, unknown> | null; error: unknown },
    ) => {
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
        return chain(entry, () => ({
          data: cfg.updateError ? null : (cfg.updateRow ?? null),
          error: cfg.updateError ?? null,
        }));
      },
    };
  };
}

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/** rpcFake: per-function results; every call is logged for assertions. */
function rpcFake(
  results: Record<string, { data?: unknown; error?: { code?: string; message?: string } }>,
  calls: RpcCall[],
) {
  return async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const r = results[fn] ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  };
}

const BUNDLE = {
  meta: {
    active_project_id: "p1",
    subscription: null,
    billing_profile: null,
    extras: { unknownScalar: "keep-me" },
    rev: 4,
  },
  entities: [
    { collection: "projects", entity_id: "p1", ord: 0, data: { id: "p1", name: "P1" } },
    { collection: "content", entity_id: "c1", ord: 0, data: { id: "c1", title: "T" } },
  ],
};

describe("readWorkspaceRow / updateWorkspaceRow / mutateWorkspace (DB wiring)", () => {
  it("migrated user: assembles the doc from the bundle RPC (no blob access)", async () => {
    const calls: RpcCall[] = [];
    const log: QueryLog[] = [];
    h.rpc = rpcFake({ read_workspace_bundle: { data: BUNDLE } }, calls);
    h.from = workspacesFake({ selectRow: null, log });
    const out = await readWorkspaceRow("user1");
    expect(out?.rev).toBe(4);
    expect(out?.data.projects).toEqual([{ id: "p1", name: "P1" }]);
    expect(out?.data.content).toEqual([{ id: "c1", title: "T" }]);
    expect(out?.data.activeProjectId).toBe("p1");
    expect(out?.data.unknownScalar).toBe("keep-me"); // extras survive
    expect(calls).toEqual([{ fn: "read_workspace_bundle", args: { p_user_id: "user1" } }]);
    expect(log).toHaveLength(0); // legacy blob untouched
    expect(await readWorkspaceRow("")).toBeNull(); // no DB call path
  });

  it("unmigrated user: falls back to the blob and lazily backfills (entities+meta)", async () => {
    const calls: RpcCall[] = [];
    const log: QueryLog[] = [];
    h.rpc = rpcFake(
      { read_workspace_bundle: { data: null }, backfill_workspace_entities: { data: true } },
      calls,
    );
    h.from = workspacesFake({
      selectRow: { data: { projects: [{ id: "p1" }], activeProjectId: "p1" }, rev: 9 },
      log,
    });
    const out = await readWorkspaceRow("user1");
    expect(out?.data.projects).toEqual([{ id: "p1" }]);
    expect(out?.rev).toBe(0); // fresh meta rows start at rev 0
    const backfill = calls.find((c) => c.fn === "backfill_workspace_entities");
    expect(backfill?.args.p_user_id).toBe("user1");
    expect(backfill?.args.p_entities).toEqual([
      { collection: "projects", entity_id: "p1", ord: 0, data: { id: "p1" } },
    ]);
    expect((backfill?.args.p_meta as { activeProjectId: string }).activeProjectId).toBe("p1");
    // Missing user entirely → null, no backfill.
    const calls2: RpcCall[] = [];
    h.rpc = rpcFake({ read_workspace_bundle: { data: null } }, calls2);
    h.from = workspacesFake({ selectRow: null, log: [] });
    expect(await readWorkspaceRow("ghost")).toBeNull();
    expect(calls2.map((c) => c.fn)).toEqual(["read_workspace_bundle"]);
  });

  it("updateWorkspaceRow sends ONLY the diff, with the read rev as precondition", async () => {
    const calls: RpcCall[] = [];
    h.rpc = rpcFake({ apply_workspace_entity_batch: { data: 6 } }, calls);
    const prev = {
      projects: [{ id: "p1", name: "Old" }],
      content: [{ id: "c1" }],
      activeProjectId: "p1",
    };
    const next = { projects: [{ id: "p1", name: "New" }], content: [], activeProjectId: "p1" };
    const newRev = await updateWorkspaceRow("user1", next, 5, prev);
    expect(newRev).toBe(6);
    const call = calls[0];
    expect(call.fn).toBe("apply_workspace_entity_batch");
    expect(call.args.p_expected_rev).toBe(5);
    expect(call.args.p_upserts).toEqual([
      { collection: "projects", entity_id: "p1", ord: 0, data: { id: "p1", name: "New" } },
    ]);
    expect(call.args.p_deletes).toEqual([{ collection: "content", entity_id: "c1" }]);
    expect(call.args.p_meta).toEqual({});
  });

  it("empty diff short-circuits without any RPC (treated as applied)", async () => {
    const calls: RpcCall[] = [];
    h.rpc = rpcFake({}, calls);
    const doc = { projects: [{ id: "p1" }], activeProjectId: "p1" };
    expect(await updateWorkspaceRow("user1", structuredClone(doc), 5, doc)).toBe(5);
    expect(calls).toHaveLength(0);
  });

  it("rev conflict maps to null (retryable); not-migrated throws NotFound; other errors throw", async () => {
    const next = { projects: [{ id: "p1" }] };
    h.rpc = rpcFake(
      { apply_workspace_entity_batch: { error: { code: "40001", message: "workspace_conflict" } } },
      [],
    );
    expect(await updateWorkspaceRow("user1", next, 5, {})).toBeNull();
    h.rpc = rpcFake(
      {
        apply_workspace_entity_batch: {
          error: { code: "P0002", message: "workspace_not_migrated" },
        },
      },
      [],
    );
    await expect(updateWorkspaceRow("user1", next, 5, {})).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    );
    h.rpc = rpcFake(
      { apply_workspace_entity_batch: { error: { code: "XX000", message: "db_down" } } },
      [],
    );
    await expect(updateWorkspaceRow("user1", next, 5, {})).rejects.toThrow(
      "workspace_update_failed",
    );
  });

  it("mutateWorkspace wires core + DB: perpetual rev conflict → WorkspaceConflictError after MAX attempts", async () => {
    const calls: RpcCall[] = [];
    h.rpc = rpcFake(
      {
        read_workspace_bundle: { data: BUNDLE },
        apply_workspace_entity_batch: { error: { code: "40001", message: "workspace_conflict" } },
      },
      calls,
    );
    await expect(
      mutateWorkspace("user1", (data) => ({
        data: { ...data, activeProjectId: "p9" },
        result: null,
      })),
    ).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(calls.filter((c) => c.fn === "apply_workspace_entity_batch")).toHaveLength(
      WORKSPACE_WRITE_MAX_ATTEMPTS,
    );
    // Plain foreign-user case: no bundle, no blob row → NotFound.
    h.rpc = rpcFake({ read_workspace_bundle: { data: null } }, []);
    h.from = workspacesFake({ selectRow: null, log: [] });
    await expect(
      mutateWorkspace("intruder", (data) => ({ data, result: null })),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });
});
