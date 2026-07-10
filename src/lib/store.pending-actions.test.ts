/**
 * Phase 1B.1 — store plumbing for pendingActions[]. Guards the 1A gotcha:
 * the client save enumerates persisted fields, so server-created pending
 * actions MUST survive hydrate → save round-trips. Mock harness mirrors
 * store.rev.test.ts (anon Supabase client mocked at the module boundary).
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
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "workspaces") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => h.maybeSingleResult }) }),
        upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
          h.upsertCalls.push({ payload, opts });
          return { select: () => ({ single: async () => h.upsertResult }) };
        },
        insert: () => ({ select: () => ({ single: async () => h.insertResult }) }),
      };
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { hydrateForUser, saveWorkspaceNow, resetStore, getState } from "./store";

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

const serverRow = (rev: number, extra: Record<string, unknown> = {}) => ({
  data: {
    data: { projects: [{ id: "p1", name: "P" }], content: [], activeProjectId: "p1", ...extra },
    rev,
  },
  error: null,
});

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.upsertCalls = [];
  h.maybeSingleResult = { data: null, error: null };
  h.upsertResult = { data: { rev: 1 }, error: null };
  h.insertResult = { data: { rev: 0 }, error: null };
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pendingActions store plumbing", () => {
  it("default state includes an empty pendingActions array", async () => {
    expect(getState().pendingActions).toEqual([]);
    h.maybeSingleResult = { data: null, error: null }; // first-run insert path
    await hydrateForUser("newuser");
    expect(getState().pendingActions).toEqual([]);
  });

  it("rows without the field hydrate to [] (legacy workspaces)", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    expect(getState().hydrated).toBe(true);
    expect(getState().pendingActions).toEqual([]);
  });

  it("hydration preserves server-created pendingActions", async () => {
    h.maybeSingleResult = serverRow(5, { pendingActions: [serverPendingAction] });
    await hydrateForUser("user1");
    expect(getState().pendingActions).toHaveLength(1);
    expect(getState().pendingActions[0].id).toBe("pa1");
    expect(getState().pendingActions[0].status).toBe("pending");
  });

  it("client save keeps pendingActions in the persisted snapshot (the 1A gotcha)", async () => {
    h.maybeSingleResult = serverRow(5, { pendingActions: [serverPendingAction] });
    await hydrateForUser("user1");
    h.upsertResult = { data: { rev: 6 }, error: null };
    await saveWorkspaceNow();
    expect(h.upsertCalls).toHaveLength(1);
    const data = h.upsertCalls[0].payload.data as { pendingActions?: unknown[] };
    expect(data.pendingActions).toHaveLength(1);
    expect((data.pendingActions?.[0] as { id: string }).id).toBe("pa1");
  });
});
