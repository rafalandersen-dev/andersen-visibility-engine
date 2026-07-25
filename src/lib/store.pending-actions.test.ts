/**
 * Phase 1B.1 — store plumbing for pendingActions[]. Guards the 1A gotcha:
 * the client save enumerates persisted fields, so server-created pending
 * actions MUST survive hydrate → save round-trips. Persistence is per-entity
 * RPCs: the Supabase client is mocked at the module boundary with the fake
 * entity backend (workspace-entities.testkit); a `workspaces` blob read is
 * kept only for the legacy/first-run fallback paths.
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
  /** Legacy blob row for the pre-migration fallback read (null = no row). */
  maybeSingleResult: { data: null, error: null } as SupabaseResult,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
    from: (table: string) => {
      if (table !== "workspaces") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => h.maybeSingleResult }) }),
      };
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { hydrateForUser, saveWorkspaceNow, resetStore, getState, setState } from "./store";

const serverPendingAction = {
  id: "pa1",
  type: "opportunity_update_proposal",
  projectId: "p1",
  title: "Server-side proposal",
  summary: "Created by the connector",
  status: "pending",
  source: "claude",
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:00:00.000Z",
  requiredScope: "milo.actions.propose",
  payload: { opportunityId: "o1", updates: { priority: "High" } },
  preview: "- priority → High",
  riskLevel: "medium",
};

const workspaceDoc = (extra: Record<string, unknown> = {}) => ({
  projects: [{ id: "p1", name: "P" }],
  content: [],
  activeProjectId: "p1",
  ...extra,
});

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  h.maybeSingleResult = { data: null, error: null };
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pendingActions store plumbing", () => {
  it("default state includes an empty pendingActions array", async () => {
    expect(getState().pendingActions).toEqual([]);
    // First-run: no entity rows AND no legacy blob row → backfill creates the
    // meta marker and hydrate lands on an empty workspace.
    await hydrateForUser("newuser");
    expect(getState().hydrated).toBe(true);
    expect(getState().pendingActions).toEqual([]);
    expect(h.backend.state.backfills).toHaveLength(1);
  });

  it("rows without the field hydrate to [] (legacy blob workspaces)", async () => {
    // Pre-migration user: bundle is null, the blob row is read and backfilled.
    h.maybeSingleResult = { data: { data: workspaceDoc(), rev: 3 }, error: null };
    await hydrateForUser("user1");
    expect(getState().hydrated).toBe(true);
    expect(getState().pendingActions).toEqual([]);
    expect(h.backend.state.backfills).toHaveLength(1); // blob adopted into entity rows
    expect(h.backend.state.doc).not.toBeNull();
  });

  it("hydration preserves server-created pendingActions", async () => {
    h.backend.state.doc = workspaceDoc({ pendingActions: [serverPendingAction] });
    await hydrateForUser("user1");
    expect(getState().pendingActions).toHaveLength(1);
    expect(getState().pendingActions[0].id).toBe("pa1");
    expect(getState().pendingActions[0].status).toBe("pending");
  });

  it("client save keeps pendingActions in the persisted snapshot (the 1A gotcha)", async () => {
    h.backend.state.doc = workspaceDoc({ pendingActions: [serverPendingAction] });
    await hydrateForUser("user1");
    // An unrelated local edit; the diff-based save must NOT read the hydrated
    // pendingActions as removed (that is exactly how an enumeration gap would
    // surface now: as a delete of the server-written rows).
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === "p1" ? { ...p, name: "P renamed" } : p)),
    }));
    await saveWorkspaceNow();
    expect(h.backend.state.batches).toHaveLength(1);
    const batch = h.backend.state.batches[0];
    expect(batch.deletes).toEqual([]); // pa1 not dropped from the snapshot
    expect(batch.upserts.map((u) => `${u.collection}:${u.entity_id}`)).toEqual(["projects:p1"]);
    const doc = h.backend.state.doc as { pendingActions?: { id: string; status: string }[] };
    expect(doc.pendingActions?.map((a) => a.id)).toEqual(["pa1"]);
    expect(doc.pendingActions?.[0].status).toBe("pending");
  });
});
