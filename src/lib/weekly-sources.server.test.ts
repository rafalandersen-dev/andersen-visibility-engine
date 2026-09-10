import { describe, expect, it, vi } from "vitest";
vi.mock("./source-refresh.server", () => ({
  readSourceRefresh: vi.fn(),
  refreshProjectSource: vi.fn(),
}));
vi.mock("./project-knowledge.server", () => ({ readProjectKnowledge: vi.fn() }));
import { refreshWeeklySources } from "./weekly-sources.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const source = {
  id: "00000000-0000-4000-8000-000000000002",
  revision: 1,
  kind: "website",
  status: "active",
};
const dependencies = () => ({
  sources: vi.fn().mockResolvedValue([source]),
  refresh: vi.fn().mockResolvedValue({ status: "ok" }),
  observations: vi
    .fn()
    .mockResolvedValue([
      { sourceId: source.id, sourceRevision: 1, status: "ok", lastAttempt: "2026-09-10T10:00:00Z" },
    ]),
});
describe("weekly pre-research source refresh", () => {
  it("refreshes current configured sources before returning readiness", async () => {
    const d = dependencies();
    const assert = vi.fn().mockResolvedValue(undefined);
    await expect(refreshWeeklySources(scope, assert, d)).resolves.toHaveLength(1);
    expect(d.refresh).toHaveBeenCalledExactlyOnceWith(scope, {
      sourceId: source.id,
      expectedRevision: 1,
    });
    expect(assert).toHaveBeenCalledTimes(3);
  });
  it("holds unavailable or replaced evidence without retrying or treating it as removal", async () => {
    for (const row of [
      { sourceId: source.id, sourceRevision: 1, status: "unknown" },
      { sourceId: source.id, sourceRevision: 2, status: "ok" },
    ]) {
      const d = dependencies();
      d.observations.mockResolvedValue([row]);
      await expect(refreshWeeklySources(scope, async () => {}, d)).rejects.toThrow(
        "weekly_sources_need_review",
      );
      expect(d.refresh).toHaveBeenCalledTimes(1);
    }
  });
  it("honors a pause before fetching and permits setup with no website sources", async () => {
    const d = dependencies();
    await expect(
      refreshWeeklySources(
        scope,
        async () => {
          throw new Error("paused");
        },
        d,
      ),
    ).rejects.toThrow("paused");
    expect(d.sources).not.toHaveBeenCalled();
    d.sources.mockResolvedValue([{ ...source, status: "revoked" }]);
    await expect(refreshWeeklySources(scope, async () => {}, d)).resolves.toEqual([]);
    expect(d.refresh).not.toHaveBeenCalled();
  });
  it("does not automatically retry an uncertain refresh", async () => {
    const d = dependencies();
    d.refresh.mockRejectedValue(new Error("unconfirmed"));
    await expect(refreshWeeklySources(scope, async () => {}, d)).rejects.toThrow(
      "weekly_sources_need_review",
    );
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.observations).not.toHaveBeenCalled();
  });
});
