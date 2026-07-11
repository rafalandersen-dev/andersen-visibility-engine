/**
 * Follow-up A — reloadWorkspaceForUser. Proves the fix for the stuck
 * /app/actions card: after an owner resolves a pending action server-side,
 * the client must reload even though the user is already hydrated (which is
 * exactly when hydrateForUser early-returns). Mock harness mirrors
 * store.rev.test.ts (anon Supabase client mocked at the module boundary).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PendingAction } from "./types";

interface SupabaseResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const h = vi.hoisted(() => ({
  maybeSingleResult: { data: null, error: null } as SupabaseResult,
  upsertResult: { data: { rev: 1 }, error: null } as SupabaseResult,
  insertResult: { data: { rev: 0 }, error: null } as SupabaseResult,
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
        upsert: () => ({ select: () => ({ single: async () => h.upsertResult }) }),
        insert: () => ({ select: () => ({ single: async () => h.insertResult }) }),
      };
    },
  },
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { hydrateForUser, reloadWorkspaceForUser, resetStore, getState } from "./store";

const action = (id: string, status: PendingAction["status"]): PendingAction => ({
  id, type: "opportunity_update_proposal", projectId: "synergy", title: "t", summary: "s",
  status, source: "claude", createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z",
  requiredScope: "milo.actions.propose", payload: { opportunityId: "o1", updates: { recommendedCta: "x" } },
  preview: "p", riskLevel: "medium",
});

const rowWith = (rev: number, pendingActions: PendingAction[], cta = "") => ({
  data: {
    data: {
      projects: [{ id: "synergy", businessName: "Synergy" }],
      opportunities: [{ id: "o1", projectId: "synergy", title: "Opp", recommendedCta: cta }],
      pendingActions,
      activeProjectId: "synergy",
    },
    rev,
  },
  error: null,
});

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.selectCalls = 0;
  h.maybeSingleResult = { data: null, error: null };
  resetStore();
});

afterEach(() => vi.unstubAllGlobals());

describe("reloadWorkspaceForUser", () => {
  it("reloads new pendingActions/opportunity/rev even though the user is already hydrated", async () => {
    // Hydrate with a PENDING action (the pre-resolve UI state).
    h.maybeSingleResult = rowWith(18, [action("pa1", "pending")], "");
    await hydrateForUser("user1");
    expect(getState().pendingActions[0].status).toBe("pending");
    expect(getState().rev).toBe(18);

    // hydrateForUser now no-ops (already hydrated) — this WAS the stuck-card bug.
    const selectsBefore = h.selectCalls;
    await hydrateForUser("user1");
    expect(h.selectCalls).toBe(selectsBefore); // no re-fetch

    // Server has since applied the action (owner approved). Reload picks it up.
    h.maybeSingleResult = rowWith(20, [action("pa1", "applied")], "Phase 1B smoke approved CTA");
    await reloadWorkspaceForUser("user1");
    expect(h.selectCalls).toBe(selectsBefore + 1); // DID re-fetch
    const s = getState();
    expect(s.pendingActions[0].status).toBe("applied");
    expect(s.opportunities[0].recommendedCta).toBe("Phase 1B smoke approved CTA");
    expect(s.rev).toBe(20);
  });

  it("produces fresh state + array identities so useStore re-renders", async () => {
    h.maybeSingleResult = rowWith(18, [action("pa1", "pending")]);
    await hydrateForUser("user1");
    const before = getState();
    const beforeActions = before.pendingActions;

    h.maybeSingleResult = rowWith(19, [action("pa1", "rejected")]);
    await reloadWorkspaceForUser("user1");
    const after = getState();
    expect(after).not.toBe(before); // new state object
    expect(after.pendingActions).not.toBe(beforeActions); // new array identity
    expect(after.pendingActions[0]).not.toBe(beforeActions[0]); // new element identity
    expect(after.pendingActions[0].status).toBe("rejected");
  });

  it("ignores a stale reload after a user switch (no cross-user bleed)", async () => {
    h.maybeSingleResult = rowWith(18, [action("pa1", "pending")]);
    await hydrateForUser("user1");
    // Simulate the active user having changed before the fetch resolves.
    h.maybeSingleResult = rowWith(99, [action("pa1", "applied")]);
    // reload for a DIFFERENT user id → guard blocks the apply.
    await reloadWorkspaceForUser("someone-else");
    expect(getState().pendingActions[0].status).toBe("pending");
    expect(getState().rev).toBe(18);
  });

  it("a failed reload leaves current state untouched (never throws)", async () => {
    h.maybeSingleResult = rowWith(18, [action("pa1", "pending")]);
    await hydrateForUser("user1");
    h.maybeSingleResult = { data: null, error: { message: "boom" } };
    await expect(reloadWorkspaceForUser("user1")).resolves.toBeUndefined();
    expect(getState().pendingActions[0].status).toBe("pending");
    expect(getState().rev).toBe(18);
  });
});
