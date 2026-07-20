/**
 * Link-safety P0 — store plumbing for project-level link approvals.
 *
 * `approveProjectInternalPath` writes an exact approved path onto the project in
 * the workspace JSONB (no migration). This guards two things: the approval must
 * survive a hydrate → save round-trip (projects are persisted whole), and it is
 * strictly per-path — there is no "approve all". Mock harness mirrors
 * store.pending-actions.test.ts (Supabase client mocked at the module boundary).
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

import {
  hydrateForUser,
  saveWorkspaceNow,
  resetStore,
  getState,
  approveProjectInternalPath,
} from "./store";

const serverRow = (rev: number, extra: Record<string, unknown> = {}) => ({
  data: {
    data: {
      projects: [{ id: "p1", name: "P", connectorType: "wordpress" }],
      content: [],
      activeProjectId: "p1",
      ...extra,
    },
    rev,
  },
  error: null,
});

const projectById = (id: string) => getState().projects.find((p) => p.id === id);

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

describe("approveProjectInternalPath", () => {
  it("records the exact approved path on the project", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/services");
    expect(projectById("p1")?.approvedInternalPaths).toEqual(["/services"]);
  });

  it("normalises and de-duplicates; a repeat approval is a no-op", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/services?ref=x#top"); // → /services
    approveProjectInternalPath("p1", "/services/"); // trailing slash → /services
    expect(projectById("p1")?.approvedInternalPaths).toEqual(["/services"]);
  });

  it("approves ONLY that path — there is no blanket approval", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/a");
    approveProjectInternalPath("p1", "/b");
    const approved = projectById("p1")?.approvedInternalPaths ?? [];
    expect(approved).toEqual(["/a", "/b"]);
    expect(approved).not.toContain("/c");
  });

  it("ignores a non-internal path (must start with /)", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "https://evil.com/x");
    expect(projectById("p1")?.approvedInternalPaths ?? []).toEqual([]);
  });

  it("persists the approval in the saved snapshot (survives save)", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/services");
    h.upsertResult = { data: { rev: 4 }, error: null };
    await saveWorkspaceNow();
    expect(h.upsertCalls).toHaveLength(1);
    const data = h.upsertCalls[0].payload.data as {
      projects?: { id: string; approvedInternalPaths?: string[] }[];
    };
    const saved = data.projects?.find((p) => p.id === "p1");
    expect(saved?.approvedInternalPaths).toEqual(["/services"]);
  });
});
