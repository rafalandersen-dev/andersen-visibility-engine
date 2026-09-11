import { describe, expect, it, vi } from "vitest";
import { readTeamProject, type TeamReadRpc } from "./project-team-read.server";
const ownerId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const target = { ownerId, projectId: "p" };
const snapshot = {
  ...target,
  canEdit: false,
  draftHash: null,
  actorId,
  membershipRevision: 1,
  workspaceRevision: 3,
  project: { id: "p", name: "Assigned project", publishSecret: "fixture-only" },
  drafts: [],
  remaining: 0,
  draft: null,
};
const response = (data: unknown): TeamReadRpc => vi.fn(async () => ({ data, error: null }));
describe("authenticated project team reader contract", () => {
  it("keeps the authenticated actor separate from the requested owner", async () => {
    const rpc = response(snapshot);
    const result = await readTeamProject(actorId, target, rpc);
    expect(rpc).toHaveBeenCalledWith("read_project_team_snapshot", {
      p_actor: actorId,
      p_owner: ownerId,
      p_project: "p",
      p_asset: null,
      p_offset: 0,
    });
    expect(result.project).not.toHaveProperty("publishSecret");
    expect(result.workspaceRevision).toBe(3);
  });
  it("rejects browser-supplied authority before querying storage", async () => {
    const rpc = response(snapshot);
    await expect(
      readTeamProject(actorId, { ...target, actorId } as typeof target, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { actorId: ownerId },
    { ownerId: actorId },
    { projectId: "other" },
    { membershipRevision: 0 },
    { project: { id: "other", name: "Wrong" } },
    { draft: { id: "unexpected" } },
  ])("rejects inconsistent storage envelopes %j", async (change) => {
    await expect(
      readTeamProject(actorId, target, response({ ...snapshot, ...change })),
    ).rejects.toThrow("Project access could not be confirmed");
  });
  it("does not fall back or expose raw database errors on missing/revoked access", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: "private database detail" }));
    await expect(readTeamProject(actorId, target, rpc)).rejects.toThrow(
      "Project access could not be confirmed. Refresh and try again.",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects an unrelated draft even when the outer envelope matches", async () => {
    const draft = {
      id: "a",
      projectId: "other",
      title: "Wrong",
      status: "Draft",
      updatedAt: "now",
      markdown: "Private",
    };
    await expect(
      readTeamProject(actorId, { ...target, assetId: "a" }, response({ ...snapshot, draft })),
    ).rejects.toThrow();
  });
  it("times out without retaining a timer or attempting a broader read", async () => {
    vi.useFakeTimers();
    try {
      const rpc = vi.fn(() => new Promise<never>(() => {}));
      const pending = expect(readTeamProject(actorId, target, rpc)).rejects.toThrow(
        "Project access could not be confirmed",
      );
      await vi.advanceTimersByTimeAsync(10000);
      await pending;
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
