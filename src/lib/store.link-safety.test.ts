/**
 * Link-safety P0 — store plumbing for project-level link approvals.
 *
 * `approveProjectInternalPath` writes an exact approved path onto the project
 * entity (no migration). This guards two things: the approval must survive a
 * hydrate → save round-trip (the project row is upserted whole), and it is
 * strictly per-path — there is no "approve all". Persistence is per-entity
 * RPCs: the Supabase client is mocked at the module boundary with the fake
 * entity backend (workspace-entities.testkit), mirroring
 * store.pending-actions.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
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

const seedServer = () => {
  h.backend.state.doc = {
    projects: [{ id: "p1", name: "P", connectorType: "wordpress" }],
    content: [],
    activeProjectId: "p1",
  };
};

const projectById = (id: string) => getState().projects.find((p) => p.id === id);

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("approveProjectInternalPath", () => {
  it("records the exact approved path on the project", async () => {
    seedServer();
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/services");
    expect(projectById("p1")?.approvedInternalPaths).toEqual(["/services"]);
  });

  it("normalises and de-duplicates; a repeat approval is a no-op", async () => {
    seedServer();
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/services?ref=x#top"); // → /services
    approveProjectInternalPath("p1", "/services/"); // trailing slash → /services
    expect(projectById("p1")?.approvedInternalPaths).toEqual(["/services"]);
  });

  it("approves ONLY that path — there is no blanket approval", async () => {
    seedServer();
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/a");
    approveProjectInternalPath("p1", "/b");
    const approved = projectById("p1")?.approvedInternalPaths ?? [];
    expect(approved).toEqual(["/a", "/b"]);
    expect(approved).not.toContain("/c");
  });

  it("ignores a non-internal path (must start with /)", async () => {
    seedServer();
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "https://evil.com/x");
    expect(projectById("p1")?.approvedInternalPaths ?? []).toEqual([]);
  });

  it("persists the approval in the saved entity batch (survives save)", async () => {
    seedServer();
    await hydrateForUser("user1");
    approveProjectInternalPath("p1", "/services");
    await saveWorkspaceNow();
    expect(h.backend.state.batches).toHaveLength(1);
    const batch = h.backend.state.batches[0];
    expect(batch.deletes).toEqual([]);
    // The diff upserts exactly the changed project row, carrying the approval.
    expect(batch.upserts.map((u) => `${u.collection}:${u.entity_id}`)).toEqual(["projects:p1"]);
    const saved = batch.upserts[0].data as { approvedInternalPaths?: string[] };
    expect(saved.approvedInternalPaths).toEqual(["/services"]);
    // And the stored workspace reflects it after the batch is applied.
    const doc = h.backend.state.doc as { projects: { approvedInternalPaths?: string[] }[] };
    expect(doc.projects[0].approvedInternalPaths).toEqual(["/services"]);
  });
});
