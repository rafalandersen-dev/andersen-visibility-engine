/**
 * Tests for the pure workspace-blob transforms behind scheduled publishing.
 * These guard the two things that would silently corrupt a user's workspace:
 * losing unrelated keys on write-back, and leaving the linked opportunity
 * stranded in "Approved" after the runner published its content.
 */
import { describe, it, expect } from "vitest";
import {
  applyAssetPatch,
  applyPublishSuccess,
  findAssetAndProject,
  isPermanentPublishError,
  CLEARED_SCHEDULE_FIELDS,
  PublishNotPossibleError,
  PublishRecordingFailedError,
} from "./publish-outcome";
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

describe("applyPublishSuccess", () => {
  it("patches only the target asset", () => {
    const next = applyPublishSuccess(blob(), "a1", { livePublishStatus: "published" });
    const content = next.content as Array<Record<string, unknown>>;
    expect(content[0].livePublishStatus).toBe("published");
    expect(content[1].livePublishStatus).toBeUndefined();
  });

  it("preserves unrelated collections and keys", () => {
    const next = applyPublishSuccess(blob(), "a1", { liveUrl: "https://x.test/p" });
    expect(next.backlinkAnalyses).toEqual([{ id: "b1" }]);
    expect(next.activeProjectId).toBe("p1");
  });

  it("does not mutate the input blob", () => {
    const original = blob();
    applyPublishSuccess(original, "a1", { liveUrl: "https://x.test/p" });
    const content = original.content as Array<Record<string, unknown>>;
    expect(content[0].liveUrl).toBeUndefined();
  });

  it("moves the linked opportunity to published once the asset is live", () => {
    const next = applyPublishSuccess(blob(), "a1", {
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
    const next = applyPublishSuccess(blob(), "a1", { scheduledPublishStatus: "failed" });
    const opps = next.opportunities as Array<Record<string, unknown>>;
    expect(opps[0].status).toBe("approved");
  });

  it("falls back to sourceOpportunityId when opportunityId is absent", () => {
    const data = blob();
    (data.content as Array<Record<string, unknown>>)[1].sourceOpportunityId = "o2";
    const next = applyPublishSuccess(data, "a2", {
      liveUrl: "https://x.test/o",
      livePublishedAt: "2026-07-19T11:00:00.000Z",
    });
    const opps = next.opportunities as Array<Record<string, unknown>>;
    expect(opps[1]).toMatchObject({ status: "published", canonicalUrl: "https://x.test/o" });
  });

  it("is a no-op on the asset list when the id does not match", () => {
    const next = applyPublishSuccess(blob(), "nope", { livePublishStatus: "published" });
    const content = next.content as Array<Record<string, unknown>>;
    expect(content.every((c) => c.livePublishStatus === undefined)).toBe(true);
  });
});

describe("applyAssetPatch", () => {
  it("never promotes the opportunity, even when the asset is already live", () => {
    // The regression this split exists to prevent: an asset that went live in an
    // earlier run still carries liveUrl. Recording a LATER failure against it
    // must not re-stamp its opportunity as freshly published.
    const data = blob();
    const content = data.content as Array<Record<string, unknown>>;
    content[0].liveUrl = "https://x.test/p";
    content[0].livePublishedAt = "2026-07-01T09:00:00.000Z";
    (data.opportunities as Array<Record<string, unknown>>)[0] = {
      id: "o1",
      status: "published",
      publishedAt: "2026-07-01T09:00:00.000Z",
      measurementStatus: "measured",
    };

    const next = applyAssetPatch(data, "a1", {
      scheduledPublishStatus: "failed",
      scheduledPublishError: "Connector rejected the request.",
    });

    const opps = next.opportunities as Array<Record<string, unknown>>;
    // Untouched: still measured, timestamp not rewritten, not reset to collecting.
    expect(opps[0]).toMatchObject({
      publishedAt: "2026-07-01T09:00:00.000Z",
      measurementStatus: "measured",
    });
    const nextContent = next.content as Array<Record<string, unknown>>;
    expect(nextContent[0].scheduledPublishStatus).toBe("failed");
  });

  it("patches the asset without touching other collections", () => {
    const next = applyAssetPatch(blob(), "a1", { scheduledPublishStatus: "pending" });
    expect(next.opportunities).toEqual(blob().opportunities);
    expect(next.backlinkAnalyses).toEqual([{ id: "b1" }]);
  });
});

describe("permanent-failure classification", () => {
  // The runner decides retry-vs-park from this. Getting it wrong on
  // PublishRecordingFailedError means re-running a connector call for a post
  // that is already live, with no stored id — i.e. a duplicate on the
  // customer's site.
  it("treats both non-retryable errors as permanent", () => {
    expect(isPermanentPublishError(new PublishNotPossibleError("no endpoint"))).toBe(true);
    expect(isPermanentPublishError(new PublishRecordingFailedError("live but unrecorded"))).toBe(
      true,
    );
  });

  it("treats an ordinary connector failure as retryable", () => {
    expect(isPermanentPublishError(new Error("WordPress returned 503"))).toBe(false);
  });

  it("is safe on non-error values", () => {
    expect(isPermanentPublishError(undefined)).toBe(false);
    expect(isPermanentPublishError(null)).toBe(false);
    expect(isPermanentPublishError("boom")).toBe(false);
    expect(isPermanentPublishError({})).toBe(false);
  });

  it("carries the live URL so the user can be told the post is already up", () => {
    const e = new PublishRecordingFailedError("live but unrecorded", "https://x.test/p");
    expect(e.liveUrl).toBe("https://x.test/p");
    expect(e.permanent).toBe(true);
  });
});

describe("schedule mirror lifecycle", () => {
  // The three transitions the runner and the UI must agree on. A stale
  // scheduledPublishAt keeps deriving the item to "Scheduled" and keeps
  // promising a go-live that will never happen.
  function armed(): WorkspaceData {
    const data = blob();
    const content = data.content as Array<Record<string, unknown>>;
    content[0].scheduledPublishAt = "2026-07-21T07:00:00.000Z";
    content[0].scheduledPublishStatus = "pending";
    return data;
  }

  it("schedule → cancel leaves no residual date", () => {
    const next = applyAssetPatch(armed(), "a1", {
      ...CLEARED_SCHEDULE_FIELDS,
      scheduledPublishError: undefined,
    });
    const asset = (next.content as Array<Record<string, unknown>>)[0];
    expect(asset.scheduledPublishAt).toBeUndefined();
    expect(asset.scheduledPublishStatus).toBeUndefined();
  });

  it("schedule → publish clears the mirror and promotes the opportunity", () => {
    const next = applyPublishSuccess(armed(), "a1", {
      liveUrl: "https://x.test/p",
      livePublishedAt: "2026-07-21T07:00:04.000Z",
      livePublishStatus: "published",
      ...CLEARED_SCHEDULE_FIELDS,
    });
    const asset = (next.content as Array<Record<string, unknown>>)[0];
    expect(asset.scheduledPublishAt).toBeUndefined();
    expect(asset.livePublishStatus).toBe("published");
    expect((next.opportunities as Array<Record<string, unknown>>)[0].status).toBe("published");
  });

  it("schedule → fail clears the date but keeps the error for the UI", () => {
    const next = applyAssetPatch(armed(), "a1", {
      scheduledPublishStatus: "failed",
      scheduledPublishError: "WordPress rejected the credentials.",
      scheduledPublishAt: undefined,
    });
    const asset = (next.content as Array<Record<string, unknown>>)[0];
    expect(asset.scheduledPublishAt).toBeUndefined();
    expect(asset.scheduledPublishStatus).toBe("failed");
    expect(asset.scheduledPublishError).toBe("WordPress rejected the credentials.");
  });
});
