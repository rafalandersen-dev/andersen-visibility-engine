/**
 * AQ — the DiscoverView accept/retry sequence (`createDiscoveryAcceptanceFlow`) run against the REAL
 * store action, the REAL persistence path (fake entity backend) and the REAL controller, with the
 * view's selection state emulated by a plain Set. Reproduces the two Codex counterexamples as
 * regressions: (A) a retry must not erase a newer, unaccepted selection; (B) a terminal recovery
 * status is bound to its originating context and can neither render nor retry-save elsewhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";
import type { DiscoverySuggestion } from "./types";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
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
  acceptDiscoverySuggestions,
  getWorkspaceSaveContext,
  hasUnsavedWorkspaceChanges,
} from "./store";
import {
  createDiscoverySaveController,
  visibleSaveStatus,
  type DiscoverySaveStatus,
} from "./discovery-save-recovery";
import { createDiscoveryAcceptanceFlow } from "./discovery-acceptance-flow";
import { deriveDiscoverySelection } from "./discovery-selection";

const suggestion = (id: string, projectId = "p1"): DiscoverySuggestion => ({
  id,
  projectId,
  title: `Suggestion ${id}`,
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
  projects: [
    { id: "p1", name: "Project" },
    { id: "p2", name: "Other" },
  ],
  content: [],
  discoverySuggestions: [
    suggestion("s1"),
    suggestion("s2"),
    suggestion("s3"),
    suggestion("s4"),
    suggestion("s7", "p2"),
  ],
  opportunities: [],
  activeProjectId: "p1",
};

const serverIds = () =>
  ((h.backend.state.doc as { opportunities?: { id: string }[] } | null)?.opportunities ?? []).map(
    (o) => o.id,
  );

/** A view instance: selection Set, project scope, mounted flag, controller + flow, save call count. */
function makeView(projectId = "p1") {
  const statuses: DiscoverySaveStatus[] = [];
  const view = {
    selected: new Set<string>(["s1", "s2", "s3"]),
    scope: projectId as string | null,
    mounted: true,
    saves: 0,
  };
  const visible = () =>
    getState().discoverySuggestions.filter(
      (s) => s.projectId === view.scope && s.status !== "dismissed",
    );
  const controller = createDiscoverySaveController({
    save: () => {
      view.saves += 1;
      return saveWorkspaceNow();
    },
    context: getWorkspaceSaveContext,
    hasUnsavedChanges: hasUnsavedWorkspaceChanges,
    onStatus: (s) => statuses.push(s),
    isMounted: () => view.mounted,
    scope: () => view.scope,
  });
  const flow = createDiscoveryAcceptanceFlow({
    controller,
    accept: acceptDiscoverySuggestions,
    visible,
    getSelected: () => view.selected,
    setSelected: (updater) => {
      view.selected = updater(view.selected);
    },
  });
  /** What the route renders: the status filtered by the CURRENT context of the view. */
  const shown = () => {
    const ctx = getWorkspaceSaveContext();
    return visibleSaveStatus(controller.status(), {
      epoch: ctx.epoch,
      userId: ctx.userId,
      scope: view.scope,
    });
  };
  const eligible = () => deriveDiscoverySelection(visible(), view.selected).selectedIds;
  return { view, statuses, controller, flow, shown, eligible };
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
afterEach(() => vi.unstubAllGlobals());

describe("P2 A — newer selection survives a retry", () => {
  it("reject → select another suggestion → retry confirms the original ids; the newer selection remains and can be added once", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const v = makeView();
    const first = await v.flow.acceptSelected();
    expect(first?.outcome).toEqual({ kind: "unconfirmed", reason: "rejected" });
    const originalIds = first!.created.map((o) => o.id);
    expect(originalIds).toHaveLength(3);
    // The user selects the still-suggested row 4 while the alert is shown.
    v.view.selected = new Set([...v.view.selected, "s4"]);
    expect(v.eligible()).toEqual(["s4"]);

    h.backend.state.errors.apply = undefined as never;
    await expect(v.flow.retry()).resolves.toEqual({ kind: "confirmed" });
    expect(v.shown()).toMatchObject({ kind: "confirmed", attempt: 2 });
    expect(serverIds().sort()).toEqual([...originalIds].sort()); // persisted exactly once
    expect(v.view.selected.has("s4")).toBe(true); // NOT erased by the retry
    expect(v.eligible()).toEqual(["s4"]);
    expect(getState().discoverySuggestions.find((s) => s.id === "s4")?.status).toBe("suggested");

    // It can then be added exactly once.
    const second = await v.flow.acceptSelected();
    expect(second?.outcome).toEqual({ kind: "confirmed" });
    expect(second?.created).toHaveLength(1);
    expect(serverIds()).toHaveLength(4);
    expect(v.eligible()).toEqual([]);
    expect(v.view.selected.has("s4")).toBe(false); // only the accepted id is removed
    expect(v.shown().kind).toBe("idle"); // the ordinary success path took over
  });

  it("delayed first-attempt success removes only the accepted ids; a selection changed meanwhile is kept", async () => {
    let release: (() => void) | null = null;
    h.rpcOverride = async (fn, args, real) => {
      if (fn === "apply_workspace_entity_batch")
        await new Promise<void>((r) => {
          release = r;
        });
      return real(fn, args);
    };
    const v = makeView();
    const p = v.flow.acceptSelected();
    await new Promise((r) => setTimeout(r, 0));
    // e.g. a later discovery result or a selection change arrives while the save is in flight
    v.view.selected = new Set(["s1", "s2", "s3", "s4"]);
    release!();
    const result = await p;
    expect(result?.outcome).toEqual({ kind: "confirmed" });
    expect([...v.view.selected]).toEqual(["s4"]);
    expect(serverIds()).toHaveLength(3);
  });

  it("a synchronous second activation during pending returns null and sends no second batch", async () => {
    const v = makeView();
    const a = v.flow.acceptSelected();
    const b = v.flow.acceptSelected();
    await expect(b).resolves.toBeNull();
    await expect(a).resolves.toMatchObject({ outcome: { kind: "confirmed" } });
    expect(h.backend.state.batches).toHaveLength(1);
  });
});

describe("P2 B — terminal status is bound to its originating context", () => {
  it("project change AFTER rejection: alert not rendered, retry refuses to save, fresh acceptance works in both projects", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const v = makeView();
    await v.flow.acceptSelected();
    expect(v.shown().kind).toBe("unconfirmed");
    const savesBefore = v.view.saves;

    v.view.scope = "p2"; // switch project while the p1 alert exists
    expect(v.shown().kind).toBe("idle"); // never carried into p2
    v.controller.reconcile(); // what the route's effect does on project change
    expect(v.controller.status().kind).toBe("idle");
    await expect(v.flow.retry()).resolves.toBeNull(); // no save from another context
    expect(v.view.saves).toBe(savesBefore);
    expect(h.backend.state.batches).toHaveLength(0);

    // A fresh acceptance in the new context still works (no permanent disabled state).
    h.backend.state.errors.apply = undefined as never;
    v.view.selected = new Set(["s7"]);
    const inP2 = await v.flow.acceptSelected();
    expect(inP2?.outcome).toEqual({ kind: "confirmed" });
    expect(inP2?.created.map((o) => o.projectId)).toEqual(["p2"]);
    // The whole-workspace save also carried the earlier p1 rows (their ids unchanged).
    expect(serverIds()).toHaveLength(4);

    v.view.scope = "p1"; // round trip: nothing stale reappears
    expect(v.shown().kind).toBe("idle");
    expect(hasUnsavedWorkspaceChanges()).toBe(false);
  });

  it("controller level: without a reconcile, a status bound to p1 is valid again when p1 returns (the route reconciles on change and drops it)", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const v = makeView();
    await v.flow.acceptSelected();
    v.view.scope = "p2";
    expect(v.shown().kind).toBe("idle");
    v.view.scope = "p1"; // returned before any reconcile ran
    expect(v.shown().kind).toBe("unconfirmed"); // same bound context → still valid
    h.backend.state.errors.apply = undefined as never;
    await expect(v.flow.retry()).resolves.toEqual({ kind: "confirmed" });
  });

  it("same-user epoch change AFTER rejection: control invalidated, retry never saves, new-context acceptance works", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const v = makeView();
    const first = await v.flow.acceptSelected();
    const staleIds = first!.created.map((o) => o.id);
    const savesBefore = v.view.saves;

    resetStore(); // same account signs out and back in
    h.backend.state.errors.apply = undefined as never;
    await hydrateForUser("user1");
    expect(v.shown().kind).toBe("idle");
    v.controller.reconcile();
    await expect(v.flow.retry()).resolves.toBeNull();
    expect(v.view.saves).toBe(savesBefore); // the Codex probe's second save no longer happens
    expect(h.backend.state.batches).toHaveLength(0);
    expect(serverIds()).toEqual([]);
    expect(getState().opportunities.map((o) => o.id)).not.toContain(staleIds[0]);

    v.view.selected = new Set(["s1"]);
    const fresh = await v.flow.acceptSelected();
    expect(fresh?.outcome).toEqual({ kind: "confirmed" });
    expect(serverIds()).toHaveLength(1);
    expect(serverIds()[0]).not.toBe(staleIds[0]); // a NEW acceptance in the new context
  });

  it("project change AFTER a confirmed retry: the confirmed status is not carried over", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const v = makeView();
    await v.flow.acceptSelected();
    h.backend.state.errors.apply = undefined as never;
    await v.flow.retry();
    expect(v.shown().kind).toBe("confirmed");
    v.view.scope = "p2";
    expect(v.shown().kind).toBe("idle");
    v.controller.reconcile();
    expect(v.controller.status().kind).toBe("idle");
  });

  it("unmount after rejection then remount: a new instance starts idle and can accept", async () => {
    h.backend.state.errors.apply = { message: "503" };
    const v = makeView();
    await v.flow.acceptSelected();
    v.view.mounted = false;
    v.controller.dispose();
    h.backend.state.errors.apply = undefined as never;
    const again = makeView();
    expect(again.shown().kind).toBe("idle");
    again.view.selected = new Set(["s4"]);
    const r = await again.flow.acceptSelected();
    expect(r?.outcome).toEqual({ kind: "confirmed" });
    expect(serverIds()).toHaveLength(4); // earlier in-memory rows ride along, ids unchanged
  });
});
