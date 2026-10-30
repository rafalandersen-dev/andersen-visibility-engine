import { describe, expect, it } from "vitest";
import {
  editorSelection,
  planSelectionNotice,
  taskPlanSearch,
  taskTarget,
  type TaskTarget,
  type TaskWorkspace,
} from "./task-continuity";
import { opportunityLifecycleStatus } from "./opportunities";
import type { Opportunity } from "./types";

const actor = "00000000-0000-4000-8000-000000000001";
const stranger = "00000000-0000-4000-8000-000000000002";
const task = (
  id: string,
  projectId = "p",
  status: Opportunity["status"] = "prioritized",
  deletedAt?: string,
) => ({ id, projectId, status, deletedAt });
const workspace = (over: Partial<TaskWorkspace> = {}): TaskWorkspace => ({
  userId: actor,
  hydrated: true,
  activeProjectId: "p",
  opportunities: [
    task("t-active"),
    task("t-second"),
    task("t-archived", "p", "archived"),
    task("t-discarded", "p", "Discarded"),
    task("t-deleted", "p", "prioritized", "2026-10-29T10:00:00Z"),
    task("t-other", "q"),
  ],
  ...over,
});

describe("taskTarget", () => {
  it("names exactly the requested active task", () => {
    expect(taskTarget(actor, workspace(), "p", "t-active")).toEqual({
      kind: "active",
      taskId: "t-active",
    });
    expect(taskTarget(actor, workspace(), "p", "t-second")).toEqual({
      kind: "active",
      taskId: "t-second",
    });
  });

  it("reports archived and discarded tasks with Plan's own archive rule", () => {
    for (const id of ["t-archived", "t-discarded"]) {
      expect(taskTarget(actor, workspace(), "p", id)).toEqual({ kind: "archived", taskId: id });
      const stored = workspace().opportunities.find((o) => o.id === id) as Opportunity;
      expect(opportunityLifecycleStatus(stored)).toBe("archived");
    }
  });

  it("never substitutes another task for a missing, deleted or foreign reference", () => {
    const cases: [string | null | undefined, TaskTarget][] = [
      [undefined, { kind: "unavailable", reason: "none" }],
      [null, { kind: "unavailable", reason: "none" }],
      ["", { kind: "unavailable", reason: "none" }],
      ["t-gone", { kind: "unavailable", reason: "missing" }],
      ["t-deleted", { kind: "unavailable", reason: "deleted" }],
      ["t-other", { kind: "unavailable", reason: "otherProject" }],
    ];
    for (const [id, expected] of cases) {
      const target = taskTarget(actor, workspace(), "p", id);
      expect(target, String(id)).toEqual(expected);
      expect(taskPlanSearch(target), String(id)).toBeUndefined();
    }
  });

  it("decides nothing until this actor's own workspace is hydrated", () => {
    for (const ws of [
      workspace({ hydrated: false }),
      workspace({ userId: null }),
      workspace({ userId: stranger }),
    ])
      expect(taskTarget(actor, ws, "p", "t-active")).toEqual({
        kind: "unavailable",
        reason: "unverified",
      });
    expect(taskTarget(undefined, workspace(), "p", "t-active")).toEqual({
      kind: "unavailable",
      reason: "unverified",
    });
    expect(taskTarget("", workspace(), "p", "t-active")).toEqual({
      kind: "unavailable",
      reason: "unverified",
    });
  });

  it("requires the reference's project to be the project Plan shows", () => {
    // A draft of project p while the workspace has moved to q: Plan would show q.
    expect(taskTarget(actor, workspace({ activeProjectId: "q" }), "p", "t-active")).toEqual({
      kind: "unavailable",
      reason: "otherProject",
    });
    // The same task id claimed for another project is not that project's task.
    expect(taskTarget(actor, workspace({ activeProjectId: "q" }), "q", "t-active")).toEqual({
      kind: "unavailable",
      reason: "otherProject",
    });
    expect(taskTarget(actor, workspace({ activeProjectId: "q" }), "q", "t-other")).toEqual({
      kind: "active",
      taskId: "t-other",
    });
  });

  it("tolerates holes in a legacy workspace list", () => {
    const ws = workspace({
      opportunities: [
        undefined as unknown as TaskWorkspace["opportunities"][number],
        task("t-active"),
      ],
    });
    expect(taskTarget(actor, ws, "p", "t-active")).toEqual({ kind: "active", taskId: "t-active" });
  });
});

describe("taskPlanSearch", () => {
  it("links only to the exact task id, never to Plan without a selection", () => {
    expect(taskPlanSearch({ kind: "active", taskId: "t-active" })).toEqual({
      selected: "t-active",
    });
    expect(taskPlanSearch({ kind: "archived", taskId: "t-archived" })).toEqual({
      selected: "t-archived",
    });
    expect(taskPlanSearch({ kind: "unavailable", reason: "deleted" })).toBeUndefined();
  });
});

describe("planSelectionNotice", () => {
  const active: TaskTarget = { kind: "active", taskId: "t-active" };
  const archived: TaskTarget = { kind: "archived", taskId: "t-archived" };
  const unavailable = (reason: Extract<TaskTarget, { kind: "unavailable" }>["reason"]) =>
    ({ kind: "unavailable", reason }) as TaskTarget;

  it("says nothing when the requested task is on screen", () => {
    for (const target of [active, archived]) {
      expect(planSelectionNotice(target, true, false)).toBe("none");
      expect(planSelectionNotice(target, true, true)).toBe("none");
    }
  });

  it("explains an archived task in active work and stops once Archived is shown", () => {
    expect(planSelectionNotice(archived, false, false)).toBe("archived");
    expect(planSelectionNotice(archived, false, true)).toBe("none");
  });

  it("explains every unavailable reference except an absent or unverified one", () => {
    for (const reason of ["missing", "deleted", "otherProject"] as const)
      expect(planSelectionNotice(unavailable(reason), false, false), reason).toBe("unavailable");
    expect(planSelectionNotice(unavailable("none"), false, false)).toBe("none");
    // Before hydration the seed/demo or another account's list must not flash "unavailable".
    expect(planSelectionNotice(unavailable("unverified"), false, false)).toBe("none");
  });

  it("stays quiet for an active task hidden only by the owner's own search or Archived toggle", () => {
    expect(planSelectionNotice(active, false, false)).toBe("none");
    expect(planSelectionNotice(active, false, true)).toBe("none");
  });
});

describe("editorSelection (Codex R1: the held default never outlives its asset)", () => {
  /** A minimal editor: the URL's `?id=` plus the held default, re-held after each render like the route's effect. */
  const editor = (assets: string[], requested?: string) => {
    let held = editorSelection(requested, undefined, assets).defaultId;
    const view = () => {
      const { selectedId, defaultId } = editorSelection(requested, held, assets);
      held = defaultId;
      return selectedId;
    };
    return {
      view,
      setAssets: (next: string[]) => ((assets = next), view()),
      setRequested: (id: string | undefined) => ((requested = id), view()),
    };
  };

  it("sole deletion from a bare URL, then a new asset: the new asset is shown, not an empty editor", () => {
    const e = editor(["a"]);
    expect(e.view()).toBe("a");
    expect(e.setAssets([])).toBeUndefined();
    expect(e.setAssets(["c"])).toBe("c");
  });

  it("sole deletion from an explicit URL (replaced by the bare URL), then a new asset", () => {
    const e = editor(["a"], "a");
    expect(e.view()).toBe("a");
    // confirmDelete moves the URL off the asset first (no next asset: bare URL), then deletes it.
    expect(e.setRequested(undefined)).toBe("a");
    expect(e.setAssets([])).toBeUndefined();
    expect(e.setAssets(["c"])).toBe("c");
  });

  it("the held default is updated even if the asset vanishes between renders", () => {
    // Held "a" was never re-rendered after deletion; a new asset arrives in the same update.
    expect(editorSelection(undefined, "a", ["c"])).toEqual({ selectedId: "c", defaultId: "c" });
  });

  it("Back to a bare URL after the former fallback was deleted shows an existing asset (implicit start)", () => {
    const e = editor(["a", "b"]);
    expect(e.view()).toBe("a"); // bare /app/editor holds "a"
    expect(e.setRequested("b")).toBe("b"); // pick B (push)
    expect(e.setRequested("a")).toBe("a"); // pick A (push)
    // Delete A: the URL is replaced by its next asset first, then A is removed.
    expect(e.setRequested("b")).toBe("b");
    expect(e.setAssets(["b"])).toBe("b");
    expect(e.setRequested("b")).toBe("b"); // Back: the earlier ?id=b entry
    expect(e.setRequested(undefined)).toBe("b"); // Back: the bare entry no longer names deleted A
  });

  it("Back to a bare URL after deleting the fallback while another asset was explicitly open", () => {
    const e = editor(["a", "b", "c"]);
    expect(e.view()).toBe("a");
    expect(e.setRequested("c")).toBe("c");
    // "a" (the held default) is deleted elsewhere while "c" stays open.
    expect(e.setAssets(["b", "c"])).toBe("c");
    expect(e.setRequested(undefined)).toBe("b");
  });

  it("never substitutes an explicitly requested missing or foreign id", () => {
    expect(editorSelection("gone", "a", ["a", "b"]).selectedId).toBe("gone");
    expect(editorSelection("other-project", undefined, []).selectedId).toBe("other-project");
    const e = editor(["a"], "a");
    expect(e.setAssets([])).toBe("a"); // still the requested id: the editor reports it missing
  });

  it("keeps the open default across reorders and newly created assets", () => {
    const e = editor(["a", "b"]);
    expect(e.view()).toBe("a");
    expect(e.setAssets(["new", "b", "a"])).toBe("a");
    expect(e.setAssets(["b", "a"])).toBe("a");
  });

  it("replaces a pre-hydration placeholder default once the real workspace arrives", () => {
    const e = editor(["seed-1", "seed-2"]);
    expect(e.view()).toBe("seed-1");
    expect(e.setAssets(["real-1", "real-2"])).toBe("real-1");
    expect(e.setAssets([])).toBeUndefined();
  });
});
