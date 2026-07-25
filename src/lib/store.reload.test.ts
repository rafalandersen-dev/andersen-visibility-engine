/**
 * Follow-up A — reloadWorkspaceForUser. Proves the fix for the stuck
 * /app/actions card: after an owner resolves a pending action server-side,
 * the client must reload even though the user is already hydrated (which is
 * exactly when hydrateForUser early-returns). Persistence is per-entity RPCs:
 * the Supabase client is mocked at the module boundary with the fake entity
 * backend (workspace-entities.testkit); reload is a read_workspace_bundle
 * re-fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";
import type { PendingAction } from "./types";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
  bundleReads: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "read_workspace_bundle") h.bundleReads += 1;
      return h.backend.rpc(fn, args);
    },
  },
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { hydrateForUser, reloadWorkspaceForUser, resetStore, getState } from "./store";

const action = (id: string, status: PendingAction["status"]): PendingAction => ({
  id,
  type: "opportunity_update_proposal",
  projectId: "synergy",
  title: "t",
  summary: "s",
  status,
  source: "claude",
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  requiredScope: "milo.actions.propose",
  payload: { opportunityId: "o1", updates: { recommendedCta: "x" } },
  preview: "p",
  riskLevel: "medium",
});

const docWith = (pendingActions: PendingAction[], cta = "") => ({
  projects: [{ id: "synergy", businessName: "Synergy" }],
  opportunities: [{ id: "o1", projectId: "synergy", title: "Opp", recommendedCta: cta }],
  pendingActions,
  activeProjectId: "synergy",
});

/** Seed the fake backend's stored workspace at a given rev. */
const seedServer = (rev: number, pendingActions: PendingAction[], cta = "") => {
  h.backend.state.doc = docWith(pendingActions, cta);
  h.backend.state.rev = rev;
};

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  h.bundleReads = 0;
  resetStore();
});

afterEach(() => vi.unstubAllGlobals());

describe("reloadWorkspaceForUser", () => {
  it("reloads new pendingActions/opportunity/rev even though the user is already hydrated", async () => {
    // Hydrate with a PENDING action (the pre-resolve UI state).
    seedServer(18, [action("pa1", "pending")], "");
    await hydrateForUser("user1");
    expect(getState().pendingActions[0].status).toBe("pending");
    expect(getState().rev).toBe(18);

    // hydrateForUser now no-ops (already hydrated) — this WAS the stuck-card bug.
    const readsBefore = h.bundleReads;
    await hydrateForUser("user1");
    expect(h.bundleReads).toBe(readsBefore); // no re-fetch

    // Server has since applied the action (owner approved). Reload picks it up.
    seedServer(20, [action("pa1", "applied")], "Phase 1B smoke approved CTA");
    await reloadWorkspaceForUser("user1");
    expect(h.bundleReads).toBe(readsBefore + 1); // DID re-fetch
    const s = getState();
    expect(s.pendingActions[0].status).toBe("applied");
    expect(s.opportunities[0].recommendedCta).toBe("Phase 1B smoke approved CTA");
    expect(s.rev).toBe(20);
  });

  it("produces fresh state + array identities so useStore re-renders", async () => {
    seedServer(18, [action("pa1", "pending")]);
    await hydrateForUser("user1");
    const before = getState();
    const beforeActions = before.pendingActions;

    seedServer(19, [action("pa1", "rejected")]);
    await reloadWorkspaceForUser("user1");
    const after = getState();
    expect(after).not.toBe(before); // new state object
    expect(after.pendingActions).not.toBe(beforeActions); // new array identity
    expect(after.pendingActions[0]).not.toBe(beforeActions[0]); // new element identity
    expect(after.pendingActions[0].status).toBe("rejected");
  });

  it("ignores a stale reload after a user switch (no cross-user bleed)", async () => {
    seedServer(18, [action("pa1", "pending")]);
    await hydrateForUser("user1");
    // Simulate the active user having changed before the fetch resolves.
    seedServer(99, [action("pa1", "applied")]);
    // reload for a DIFFERENT user id → guard blocks the apply.
    await reloadWorkspaceForUser("someone-else");
    expect(getState().pendingActions[0].status).toBe("pending");
    expect(getState().rev).toBe(18);
  });

  it("a failed reload leaves current state untouched (never throws)", async () => {
    seedServer(18, [action("pa1", "pending")]);
    await hydrateForUser("user1");
    h.backend.state.errors.read = { message: "boom" };
    await expect(reloadWorkspaceForUser("user1")).resolves.toBeUndefined();
    expect(getState().pendingActions[0].status).toBe("pending");
    expect(getState().rev).toBe(18);
  });
});
