/**
 * AP — truthful discovery save recovery, exercised through the REAL store action
 * (`acceptDiscoverySuggestions`) and the REAL persistence path (`saveWorkspaceNow` against the fake
 * entity backend). The controller only classifies outcomes; it never re-accepts, never mints ids.
 *
 * Limits of the fixture (stated, not hidden): the fake backend upserts by entity key and does not
 * emulate the DB `updatedAt` recency trigger or concurrent writers. "Lost response after commit" is
 * emulated by committing the batch and then returning a transport error for that same request.
 * These tests prove the recovery contract for the modelled cases; they do not prove all concurrency.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";
import type { DiscoverySuggestion } from "./types";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
  /** Optional wrapper around the backend rpc for the lost-response / deferred fixtures. */
  rpcOverride: null as
    | null
    | ((
        fn: string,
        args: Record<string, unknown>,
        real: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>,
      ) => Promise<{ data: unknown; error: unknown }>),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) =>
      h.rpcOverride ? h.rpcOverride(fn, args, h.backend.rpc) : h.backend.rpc(fn, args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), message: vi.fn() },
}));

import {
  hydrateForUser,
  saveWorkspaceNow,
  resetStore,
  getState,
  setState,
  acceptDiscoverySuggestions,
  getWorkspaceSaveContext,
  hasUnsavedWorkspaceChanges,
} from "./store";
import {
  createDiscoverySaveController,
  runDiscoverySave,
  type DiscoverySaveStatus,
} from "./discovery-save-recovery";

const suggestion = (id: string, title: string): DiscoverySuggestion => ({
  id,
  projectId: "p1",
  title,
  language: "en" as DiscoverySuggestion["language"],
  contentType: "Blog post" as DiscoverySuggestion["contentType"],
  searchIntent: "Informational",
  targetAudience: "Owners",
  businessValue: "Leads",
  recommendedCta: "Book",
  priority: "Medium",
  status: "suggested",
  deduplicationKey: `dk-${id}`,
  generatedAt: "2026-09-28T10:00:00.000Z",
});

const DOC = {
  projects: [{ id: "p1", name: "Project" }],
  content: [{ id: "c1", title: "Draft", body: "v1" }],
  discoverySuggestions: [suggestion("s1", "First"), suggestion("s2", "Second")],
  opportunities: [],
  activeProjectId: "p1",
};

const serverOpportunities = () =>
  ((h.backend.state.doc as { opportunities?: { id: string; title: string }[] } | null)
    ?.opportunities ?? []) as { id: string; title: string }[];

function makeController(
  overrides: Partial<Parameters<typeof createDiscoverySaveController>[0]> = {},
) {
  const statuses: DiscoverySaveStatus[] = [];
  const mounted = { current: true };
  const scope = { current: "p1" as string | null };
  const controller = createDiscoverySaveController({
    save: saveWorkspaceNow,
    context: getWorkspaceSaveContext,
    hasUnsavedChanges: hasUnsavedWorkspaceChanges,
    onStatus: (s) => statuses.push(s),
    isMounted: () => mounted.current,
    scope: () => scope.current,
    ...overrides,
  });
  return { controller, statuses, mounted, scope };
}

beforeEach(async () => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  h.rpcOverride = null;
  h.backend.state.doc = structuredClone(DOC);
  h.backend.state.rev = 3;
  resetStore();
  await hydrateForUser("user1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pending → rejected → retry success", () => {
  it("keeps the minted opportunity ids, shows unconfirmed, and confirms on retry with the same ids", async () => {
    const { controller, statuses } = makeController();
    h.backend.state.errors.apply = { message: "503 upstream (not shown to users)" };
    const created = acceptDiscoverySuggestions(["s1", "s2"]);
    expect(created.map((o) => o.id)).toHaveLength(2);
    const p = controller.start();
    expect(controller.isPending()).toBe(true);
    expect(statuses.at(-1)).toMatchObject({ kind: "pending", attempt: 1 });
    await expect(p).resolves.toEqual({ kind: "unconfirmed", reason: "rejected" });
    expect(statuses.at(-1)).toMatchObject({ kind: "unconfirmed", reason: "rejected", attempt: 1 });
    expect(JSON.stringify(statuses)).not.toContain("503"); // raw error never reaches the status
    expect(h.backend.state.batches).toHaveLength(0);
    expect(serverOpportunities()).toEqual([]);
    expect(hasUnsavedWorkspaceChanges()).toBe(true);

    h.backend.state.errors.apply = undefined as never;
    await expect(controller.retry()).resolves.toEqual({ kind: "confirmed" });
    expect(statuses.at(-1)).toMatchObject({ kind: "confirmed", attempt: 2 });
    expect(h.backend.state.batches).toHaveLength(1);
    expect(
      serverOpportunities()
        .map((o) => o.id)
        .sort(),
    ).toEqual(created.map((o) => o.id).sort());
    expect(
      getState()
        .opportunities.map((o) => o.id)
        .sort(),
    ).toEqual(created.map((o) => o.id).sort());
    expect(getState().discoverySuggestions.map((s) => s.status)).toEqual(["accepted", "accepted"]);
    expect(hasUnsavedWorkspaceChanges()).toBe(false);
  });

  it("retry is a no-op outside the unconfirmed state and never starts a second batch", async () => {
    const { controller } = makeController();
    await expect(controller.retry()).resolves.toBeNull();
    expect(h.backend.state.batches).toHaveLength(0);
  });
});

describe("lost response after server commit", () => {
  it("commits once, reports unconfirmed (unknown outcome), and the retry creates no duplicate", async () => {
    let lostOnce = false;
    h.rpcOverride = async (fn, args, real) => {
      const result = await real(fn, args);
      if (fn === "apply_workspace_entity_batch" && !lostOnce) {
        lostOnce = true;
        return { data: null, error: { message: "network lost after commit" } };
      }
      return result;
    };
    const { controller, statuses } = makeController();
    const created = acceptDiscoverySuggestions(["s1"]);
    await expect(controller.start()).resolves.toEqual({ kind: "unconfirmed", reason: "rejected" });
    // The server DID commit, but the client cannot know that — hence "unconfirmed", never "not saved".
    expect(serverOpportunities().map((o) => o.id)).toEqual([created[0].id]);
    expect(h.backend.state.batches).toHaveLength(1);
    expect(statuses.at(-1)?.kind).toBe("unconfirmed");

    await expect(controller.retry()).resolves.toEqual({ kind: "confirmed" });
    expect(h.backend.state.batches).toHaveLength(2);
    // Same entity ids re-upserted: no duplicate row, no second id.
    expect(
      h.backend.state.batches[1].upserts.map((u) => `${u.collection}:${u.entity_id}`),
    ).toContain(`opportunities:${created[0].id}`);
    expect(serverOpportunities()).toHaveLength(1);
    expect(serverOpportunities()[0].id).toBe(created[0].id);
    expect(getState().opportunities).toHaveLength(1);
  });
});

describe("repeated failure and intervening edits", () => {
  it("stays unconfirmed and retryable across repeated failures; attempts are counted", async () => {
    h.backend.state.errors.apply = { message: "boom" };
    const { controller, statuses } = makeController();
    acceptDiscoverySuggestions(["s1"]);
    await controller.start();
    await controller.retry();
    await controller.retry();
    expect(statuses.filter((s) => s.kind === "unconfirmed").map((s) => s.attempt)).toEqual([
      1, 2, 3,
    ]);
    expect(controller.status()).toMatchObject({ kind: "unconfirmed", attempt: 3 });
    expect(getState().opportunities).toHaveLength(1); // still in this open workspace (memory only)
    expect(serverOpportunities()).toEqual([]);
  });

  it("a retry saves the CURRENT workspace changes, including edits made after the failure", async () => {
    h.backend.state.errors.apply = { message: "boom" };
    const { controller } = makeController();
    const created = acceptDiscoverySuggestions(["s1"]);
    await controller.start();
    setState((s) => ({
      ...s,
      opportunities: s.opportunities.map((o) =>
        o.id === created[0].id ? { ...o, title: "Edited after failure" } : o,
      ),
      projects: [...s.projects, { id: "p2", name: "Added after failure" } as never],
    }));
    h.backend.state.errors.apply = undefined as never;
    await expect(controller.retry()).resolves.toEqual({ kind: "confirmed" });
    expect(serverOpportunities()).toEqual([
      expect.objectContaining({ id: created[0].id, title: "Edited after failure" }),
    ]);
    expect(
      (h.backend.state.doc as { projects: { id: string }[] }).projects.map((p) => p.id),
    ).toEqual(["p1", "p2"]);
  });
});

describe("overlapping activation", () => {
  it("a synchronous second start returns null and no second batch is sent", async () => {
    const { controller, statuses } = makeController();
    acceptDiscoverySuggestions(["s1"]);
    const first = controller.start();
    const second = controller.start();
    await expect(second).resolves.toBeNull();
    await expect(first).resolves.toEqual({ kind: "confirmed" });
    expect(h.backend.state.batches).toHaveLength(1);
    expect(statuses.filter((s) => s.kind === "pending")).toHaveLength(1);
  });

  it("never produces an unhandled rejection even when the store throws", async () => {
    h.backend.state.errors.apply = { message: "boom" };
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on("unhandledRejection", onRejection);
    try {
      const { controller } = makeController();
      acceptDiscoverySuggestions(["s1"]);
      await controller.start();
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    expect(rejections).toEqual([]);
  });
});

describe("stale settlements", () => {
  it("same-user epoch change while pending → sessionChanged outcome, control released, no retry, nothing written into the new context", async () => {
    let release: (() => void) | null = null;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch") {
        await new Promise<void>((r) => {
          release = r;
        });
      }
      return real(fn, args);
    };
    const { controller, statuses } = makeController();
    const created = acceptDiscoverySuggestions(["s1"]);
    const p = controller.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(release).not.toBeNull();
    const before = getWorkspaceSaveContext();
    // Same account signs out and back in: the store resets (epoch bump) and re-hydrates from server.
    resetStore();
    h.rpcOverride = null;
    await hydrateForUser("user1");
    expect(getWorkspaceSaveContext().epoch).not.toBe(before.epoch);
    release!();
    await expect(p).resolves.toEqual({ kind: "sessionChanged" });
    // The old context is gone: the control is released, nothing is rendered for the new context.
    expect(statuses.map((s) => s.kind)).toEqual(["pending", "idle"]);
    expect(controller.status().kind).toBe("idle");
    await expect(controller.retry()).resolves.toBeNull(); // not an actionable retry of the old context
    // The request had already left the client, so the fixture server committed it; the client must
    // neither claim that nor write it into the re-hydrated context (which predates the commit).
    expect(serverOpportunities().map((o) => o.id)).toEqual([created[0].id]);
    expect(getState().opportunities.map((o) => o.id)).not.toContain(created[0].id);
    expect(hasUnsavedWorkspaceChanges()).toBe(false);
    expect(statuses.map((s) => s.kind)).not.toContain("confirmed");
  });

  it("scope (project) change while pending drops the settlement silently", async () => {
    h.backend.state.errors.apply = { message: "boom" };
    const { controller, statuses, scope } = makeController();
    acceptDiscoverySuggestions(["s1"]);
    const p = controller.start();
    scope.current = "p-other";
    await expect(p).resolves.toBeNull();
    // No success/error for the other scope; the pending control is released (no permanent pending).
    expect(statuses.map((s) => s.kind)).toEqual(["pending", "idle"]);
    expect(controller.status().kind).toBe("idle");
    expect(controller.isPending()).toBe(false);
  });

  it("unmount while pending drops the settlement and emits nothing", async () => {
    const { controller, statuses, mounted } = makeController();
    acceptDiscoverySuggestions(["s1"]);
    const p = controller.start();
    mounted.current = false;
    controller.dispose();
    await expect(p).resolves.toBeNull();
    expect(statuses.map((s) => s.kind)).toEqual(["pending"]);
  });
});

describe("not ready / no user", () => {
  it("does not report a save when the workspace is not hydrated or has no user", async () => {
    resetStore();
    const { controller, statuses } = makeController();
    await expect(controller.start()).resolves.toEqual({ kind: "unconfirmed", reason: "notReady" });
    expect(statuses.at(-1)).toMatchObject({ kind: "unconfirmed", reason: "notReady" });
    expect(h.backend.state.batches).toHaveLength(0);
  });

  it("runDiscoverySave classifies pendingChanges when newer edits remain unsaved after a resolved save", async () => {
    const outcome = await runDiscoverySave({
      save: async () => {},
      context: getWorkspaceSaveContext,
      hasUnsavedChanges: () => true,
    });
    expect(outcome).toEqual({ kind: "unconfirmed", reason: "pendingChanges" });
  });
});

describe("whole-batch content conflict", () => {
  it("is not bypassed: the accept stays unconfirmed locally and the retry conflicts again", async () => {
    const { controller } = makeController();
    // Local edit to the draft + acceptance in one batch; another session changed the same draft.
    setState((s) => ({
      ...s,
      content: s.content.map((c) => (c.id === "c1" ? { ...c, body: "mine" } : c)),
    }));
    const created = acceptDiscoverySuggestions(["s1"]);
    // Replace the server row with a fresh object (the fixture doc shares references with hydration).
    (h.backend.state.doc as { content: { id: string; title: string; body: string }[] }).content = [
      { id: "c1", title: "Draft", body: "theirs" },
    ];
    await expect(controller.start()).resolves.toEqual({ kind: "unconfirmed", reason: "rejected" });
    expect(serverOpportunities()).toEqual([]);
    expect(getState().opportunities.map((o) => o.id)).toEqual([created[0].id]);
    await expect(controller.retry()).resolves.toEqual({ kind: "unconfirmed", reason: "rejected" });
    expect(serverOpportunities()).toEqual([]);
    expect(
      (h.backend.state.doc as { content: { id: string; body: string }[] }).content[0].body,
    ).toBe("theirs");
  });
});
