/**
 * Workspace conflict merge — the P0 data-integrity contract (2026-07-25):
 * local unsaved edits survive a rev conflict, server-only entities are kept,
 * billing scalars stay server-authoritative, and another device can never
 * flip this tab's active project.
 */
import { describe, it, expect } from "vitest";
import { mergeById, mergeWorkspaceSnapshots } from "./workspace-merge";

describe("mergeById", () => {
  it("local wins per id; server-only kept; local-only appended (creates survive)", () => {
    const merged = mergeById(
      [
        { id: "a", v: "local-edit" },
        { id: "new", v: "local-create" },
      ] as never[],
      [
        { id: "a", v: "server-old" },
        { id: "b", v: "server-only" },
      ] as never[],
    );
    expect(merged).toEqual([
      { id: "a", v: "local-edit" },
      { id: "b", v: "server-only" },
      { id: "new", v: "local-create" },
    ]);
  });
});

describe("mergeWorkspaceSnapshots", () => {
  const local = {
    projects: [{ id: "p1", name: "Mine (edited)" }],
    opportunities: [{ id: "o-local", projectId: "p1" }],
    content: [],
    subscription: { planId: "pro" }, // client-side value must NOT win
    activeProjectId: "p1",
  };
  const server = {
    projects: [
      { id: "p1", name: "Mine (stale)" },
      { id: "p2", name: "Other device's" },
    ],
    opportunities: [{ id: "o-server", projectId: "p2" }],
    content: [{ id: "c-server" }],
    subscription: { planId: "starter" },
    activeProjectId: "p2",
    someFutureField: { keep: true }, // unknown server fields preserved
  };

  it("merges per entity, keeps unknown server fields, billing is server-authoritative", () => {
    const m = mergeWorkspaceSnapshots(local, server);
    expect((m.projects as { id: string; name: string }[]).find((p) => p.id === "p1")?.name).toBe(
      "Mine (edited)",
    );
    expect((m.projects as { id: string }[]).map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect((m.opportunities as { id: string }[]).map((o) => o.id).sort()).toEqual([
      "o-local",
      "o-server",
    ]);
    expect((m.content as { id: string }[]).map((c) => c.id)).toEqual(["c-server"]);
    expect(m.subscription).toEqual({ planId: "starter" }); // server wins
    expect(m.someFutureField).toEqual({ keep: true });
  });

  it("this tab's active project wins while it exists; falls back when deleted elsewhere", () => {
    expect(mergeWorkspaceSnapshots(local, server).activeProjectId).toBe("p1");
    const serverWithoutP1 = { ...server, projects: [{ id: "p2", name: "Other" }] };
    // p1 still exists in the MERGE (local list contributes it) → local still wins.
    expect(mergeWorkspaceSnapshots(local, serverWithoutP1).activeProjectId).toBe("p1");
    const noLocalChoice = { ...local, activeProjectId: "" };
    expect(mergeWorkspaceSnapshots(noLocalChoice, server).activeProjectId).toBe("p2");
  });
});
