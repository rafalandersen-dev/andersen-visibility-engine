import { describe, expect, it, vi } from "vitest";
import { inspectPublicationFailure, publicationFailureReason } from "./publication-failure.server";
const now = new Date("2026-09-08T09:00:00Z");
const queueId = "d47a218a-334f-4fd9-a4c7-67d1ae844601";
const recordedAt = "2026-09-07T09:00:00Z";
const reviewError =
  "This draft is not publishable yet: 4 unresolved internal link(s): /private-path. Health/finance/legal claim(s) [medical] need a verified source or a resolved author, plus human review. YMYL content needs a named author with a real bio, credential or profile — add one in the Author panel.";

const sourceReviewError =
  "Source facts need review before this draft can be sent or published. Check source observations and project knowledge in Project Setup.";

describe("publication error hints", () => {
  it("maps the exact source hold to source review without returning its text", () => {
    expect(publicationFailureReason(sourceReviewError)).toEqual({
      kind: "contentReview",
      checks: ["sourcesReview"],
    });
    expect(publicationFailureReason(sourceReviewError + " private-provider-detail")).toEqual({
      kind: "unknown",
      checks: [],
    });
  });
  it("recognizes the live-step network failure as a destination issue", () => {
    expect(
      publicationFailureReason(
        "Could not reach the live-publish endpoint. Check the URL and try again.",
      ),
    ).toEqual({ kind: "destination", checks: [] });
  });
  it("recognizes the observed content checks without returning the error or embedded paths", () => {
    expect(publicationFailureReason(reviewError)).toEqual({
      kind: "contentReview",
      checks: ["links", "sourcesReview", "author"],
    });
    expect(JSON.stringify(publicationFailureReason(reviewError))).not.toContain("private-path");
  });
  it("retains a general content-review hint for other readiness blockers", () => {
    expect(
      publicationFailureReason("This draft is not publishable yet: Featured image missing."),
    ).toEqual({ kind: "contentReview", checks: [] });
  });
  it.each([401, 403, 429, 500, 502, 503])(
    "extracts only HTTP %s from an exact Milo error",
    (status) => {
      expect(publicationFailureReason(`Website returned an error (status ${status}).`)).toEqual({
        kind: "destination",
        checks: [],
        httpStatus: status,
      });
    },
  );
  it("recognizes unreachable destinations without asserting that nothing was published", () => {
    expect(
      publicationFailureReason(
        "Could not reach the website endpoint. Check the URL and try again.",
      ),
    ).toEqual({ kind: "destination", checks: [] });
  });
  it.each([
    "No publish secret configured. Add one in Project Setup.",
    "No live-publish endpoint configured. Add one in Project Setup.",
  ])("recognizes configuration failures: %s", (error) => {
    expect(publicationFailureReason(error).kind).toBe("configuration");
  });
  it.each([
    null,
    "",
    "Bearer private-token",
    "Website returned an error (status 502). private-body",
    "<html>502</html>",
    "This draft is not publishable yet: " + "x".repeat(8192),
  ])("does not expose or overinterpret unrecognized errors", (error) => {
    expect(publicationFailureReason(error)).toEqual({ kind: "unknown", checks: [] });
  });
});

function fixture() {
  const data = {
    projects: [{ id: "project" }],
    content: [{ id: "asset", projectId: "project", updatedAt: recordedAt }],
  };
  const workspace = vi.fn(async () => ({ rev: 7, data }));
  const response: { data: unknown; error: unknown } = {
    data: [{ status: "failed", attempts: 1, updated_at: recordedAt, last_error: reviewError }],
    error: null,
  };
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    }),
    limit: vi.fn(() => query),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  const db = { from: vi.fn(() => query) };
  const deps = { workspace, db } as unknown as NonNullable<
    Parameters<typeof inspectPublicationFailure>[5]
  >;
  return {
    data,
    workspace,
    response,
    filters,
    query,
    db,
    run: () => inspectPublicationFailure("owner", "project", "asset", queueId, now, deps),
  };
}
describe("scoped publication inspection", () => {
  it.each(["changed", "missing"])(
    "refuses an inspection if its workspace becomes %s during the queue read",
    async (mode) => {
      const f = fixture();
      f.workspace.mockResolvedValueOnce({ rev: 7, data: f.data });
      f.workspace.mockResolvedValueOnce(
        mode === "changed" ? { rev: 8, data: f.data } : (null as never),
      );
      await expect(f.run()).rejects.toThrow("publication_inspection_unavailable");
      expect(f.workspace).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves failed queue state while explaining its recorded source-review hold", async () => {
    const f = fixture();
    f.response.data = [
      { status: "failed", attempts: 1, updated_at: recordedAt, last_error: sourceReviewError },
    ];
    expect(await f.run()).toMatchObject({
      state: "failed",
      reason: { kind: "contentReview", checks: ["sourcesReview"] },
    });
  });
  it("checks both owned entities before a bounded account/project/asset query", async () => {
    const f = fixture();
    expect(await f.run()).toEqual({
      state: "failed",
      checkedAt: now.toISOString(),
      recordedAt,
      attempts: 1,
      draftChanged: false,
      reason: { kind: "contentReview", checks: ["links", "sourcesReview", "author"] },
    });
    expect(f.workspace).toHaveBeenCalledWith("owner");
    expect(f.db.from).toHaveBeenCalledWith("scheduled_publishes");
    expect(f.filters).toEqual([
      ["user_id", "owner"],
      ["project_id", "project"],
      ["asset_id", "asset"],
      ["id", queueId],
    ]);
    expect(f.query.select).toHaveBeenCalledWith("status,attempts,updated_at,last_error");
    expect(f.query.limit).toHaveBeenCalledWith(2);
  });
  it.each(["foreignProject", "foreignAsset", "missingAsset", "duplicateProject", "duplicateAsset"])(
    "refuses %s before database access",
    async (mode) => {
      const f = fixture();
      if (mode === "foreignProject") f.data.projects[0].id = "other";
      if (mode === "foreignAsset") f.data.content[0].projectId = "other";
      if (mode === "missingAsset") f.data.content = [];
      if (mode === "duplicateProject") f.data.projects.push(f.data.projects[0]);
      if (mode === "duplicateAsset") f.data.content.push(f.data.content[0]);
      await expect(f.run()).rejects.toThrow();
      expect(f.db.from).not.toHaveBeenCalled();
    },
  );
  it("reports post-record draft edits without rerunning publication", async () => {
    const f = fixture();
    f.data.content[0].updatedAt = now.toISOString();
    expect(await f.run()).toMatchObject({ draftChanged: true });
  });
  it("distinguishes absent records from failed reads", async () => {
    const f = fixture();
    f.response.data = [];
    expect(await f.run()).toEqual({ state: "absent", checkedAt: now.toISOString() });
    f.response.error = { message: "private database error" };
    await expect(f.run()).rejects.toThrow("publication_inspection_unavailable");
  });
  it.each(["pending", "publishing", "published", "cancelled"])(
    "does not show an obsolete error for %s",
    async (status) => {
      const f = fixture();
      f.response.data = [{ status, attempts: 1, updated_at: recordedAt, last_error: reviewError }];
      expect(await f.run()).toEqual({ state: "changed", checkedAt: now.toISOString() });
    },
  );
  it.each([
    null,
    {},
    [{ status: "failed" }],
    Array(2).fill({
      status: "failed",
      attempts: 1,
      updated_at: recordedAt,
      last_error: reviewError,
    }),
  ])("refuses malformed or ambiguous queue data", async (data) => {
    const f = fixture();
    f.response.data = data;
    await expect(f.run()).rejects.toThrow();
  });
});
