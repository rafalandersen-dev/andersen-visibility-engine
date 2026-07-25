/**
 * Workspace conflict merge — the P0 data-integrity contract (2026-07-25):
 * local unsaved edits survive a rev conflict, server-only entities are kept,
 * billing scalars stay server-authoritative, and another device can never
 * flip this tab's active project.
 */
import { describe, it, expect } from "vitest";
import { mergeById, mergeWorkspaceSnapshots, newestPerProject } from "./workspace-merge";

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

describe("recency + single-instance rules (review H2/M2)", () => {
  it("a SERVER-newer copy of the same entity wins — a stale tab cannot clobber a cron update", () => {
    const merged = mergeById(
      [{ id: "a", updatedAt: "2026-07-24T10:00:00Z", v: "stale-tab" }] as never[],
      [{ id: "a", updatedAt: "2026-07-25T06:00:00Z", v: "cron-publish-outcome" }] as never[],
    );
    expect(merged).toEqual([
      { id: "a", updatedAt: "2026-07-25T06:00:00Z", v: "cron-publish-outcome" },
    ]);
    // Local still wins on tie or when stamps are missing (unsaved edits).
    expect(
      mergeById([{ id: "b", v: "local" }] as never[], [{ id: "b", v: "server" }] as never[]),
    ).toEqual([{ id: "b", v: "local" }]);
  });

  it("single-instance analyses keep only the newest per project — no resurrected shadow rows", () => {
    const m = mergeWorkspaceSnapshots(
      { audits: [{ id: "new", projectId: "p1", createdAt: "2026-07-25T10:00:00Z" }] },
      { audits: [{ id: "old", projectId: "p1", createdAt: "2026-07-01T10:00:00Z" }], projects: [] },
    );
    expect((m.audits as { id: string }[]).map((a) => a.id)).toEqual(["new"]);
    expect(
      newestPerProject([
        { id: "x", projectId: "p1", createdAt: "2026-01-01" },
        { id: "y", projectId: "p1", createdAt: "2026-02-01" },
        { id: "z", projectId: "p2", createdAt: "2026-01-15" },
      ])
        .map((r) => r.id)
        .sort(),
    ).toEqual(["y", "z"]);
  });
});
