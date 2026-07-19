/**
 * Tests for the pure workspace-blob transforms behind scheduled publishing.
 * These guard the two things that would silently corrupt a user's workspace:
 * losing unrelated keys on write-back, and leaving the linked opportunity
 * stranded in "Approved" after the runner published its content.
 */
import { describe, it, expect } from "vitest";
import { applyOutcome, findAssetAndProject, PublishNotPossibleError } from "./publish-outcome";
import type { WorkspaceData } from "./workspace.server";

function blob(): WorkspaceData {
  return {
    activeProjectId: "p1",
    projects: [{ id: "p1", name: "Site" }],
    content: [
      { id: "a1", projectId: "p1", title: "Post", opportunityId: "o1" },
      { id: "a2", projectId: "p1", title: "Other" },
    ],
    opportunities: [
      { id: "o1", title: "Opp", status: "approved" },
      { id: "o2", title: "Untouched", status: "captured" },
    ],
    // A collection this module knows nothing about — must survive untouched.
    backlinkAnalyses: [{ id: "b1" }],
  };
}

describe("findAssetAndProject", () => {
  it("resolves the asset and its project", () => {
    const { asset, project } = findAssetAndProject(blob(), "a1");
    expect(asset.id).toBe("a1");
    expect(project.id).toBe("p1");
  });

  it("throws a permanent error when the asset is gone", () => {
    expect(() => findAssetAndProject(blob(), "missing")).toThrow(PublishNotPossibleError);
  });

  it("throws a permanent error when the project is gone", () => {
    const data = { ...blob(), projects: [] };
    try {
      findAssetAndProject(data, "a1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PublishNotPossibleError);
      expect((e as PublishNotPossibleError).permanent).toBe(true);
    }
  });

  it("tolerates a blob with missing collections", () => {
    expect(() => findAssetAndProject({}, "a1")).toThrow(PublishNotPossibleError);
  });
});

describe("applyOutcome", () => {
  it("patches only the target asset", () => {
    const next = applyOutcome(blob(), "a1", { livePublishStatus: "published" });
    const content = next.content as Array<Record<string, unknown>>;
    expect(content[0].livePublishStatus).toBe("published");
    expect(content[1].livePublishStatus).toBeUndefined();
  });

  it("preserves unrelated collections and keys", () => {
    const next = applyOutcome(blob(), "a1", { liveUrl: "https://x.test/p" });
    expect(next.backlinkAnalyses).toEqual([{ id: "b1" }]);
    expect(next.activeProjectId).toBe("p1");
  });

  it("does not mutate the input blob", () => {
    const original = blob();
    applyOutcome(original, "a1", { liveUrl: "https://x.test/p" });
    const content = original.content as Array<Record<string, unknown>>;
    expect(content[0].liveUrl).toBeUndefined();
  });

  it("moves the linked opportunity to published once the asset is live", () => {
    const next = applyOutcome(blob(), "a1", {
      liveUrl: "https://x.test/p",
      livePublishedAt: "2026-07-19T10:00:00.000Z",
    });
    const opps = next.opportunities as Array<Record<string, unknown>>;
    expect(opps[0]).toMatchObject({
      status: "published",
      canonicalUrl: "https://x.test/p",
      currentContentAssetId: "a1",
      publishedAt: "2026-07-19T10:00:00.000Z",
      measurementStatus: "collecting",
    });
    // Unrelated opportunities are left alone.
    expect(opps[1]).toMatchObject({ id: "o2", status: "captured" });
  });

  it("leaves opportunities alone when the publish did not produce a live URL", () => {
    const next = applyOutcome(blob(), "a1", { scheduledPublishStatus: "failed" });
    const opps = next.opportunities as Array<Record<string, unknown>>;
    expect(opps[0].status).toBe("approved");
  });

  it("falls back to sourceOpportunityId when opportunityId is absent", () => {
    const data = blob();
    (data.content as Array<Record<string, unknown>>)[1].sourceOpportunityId = "o2";
    const next = applyOutcome(data, "a2", {
      liveUrl: "https://x.test/o",
      livePublishedAt: "2026-07-19T11:00:00.000Z",
    });
    const opps = next.opportunities as Array<Record<string, unknown>>;
    expect(opps[1]).toMatchObject({ status: "published", canonicalUrl: "https://x.test/o" });
  });

  it("is a no-op on the asset list when the id does not match", () => {
    const next = applyOutcome(blob(), "nope", { livePublishStatus: "published" });
    const content = next.content as Array<Record<string, unknown>>;
    expect(content.every((c) => c.livePublishStatus === undefined)).toBe(true);
  });
});
