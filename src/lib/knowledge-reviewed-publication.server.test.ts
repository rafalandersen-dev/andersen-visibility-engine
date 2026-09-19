import { beforeEach, describe, expect, it, vi } from "vitest";
import { readKnowledgeOutputReview } from "./knowledge-output-review.server";
import { hasCurrentOutputKnowledgeReview } from "./knowledge-reviewed-publication.server";
import type { ContentAsset } from "./types";
vi.mock("./knowledge-output-review.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-output-review.server")>()),
  readKnowledgeOutputReview: vi.fn(),
}));
const owner = "00000000-0000-4000-8000-000000000001";
const asset = { id: "a", projectId: "p", markdown: "Saved" } as ContentAsset;
const now = "2026-09-11T00:00:00Z";
const version = { algorithm: "milo-publication-v1" as const, hash: "a".repeat(64) };
const context = "b".repeat(64);
const snapshot = () =>
  ({ reviewable: true, forgotten: false, version, contextHash: context }) as Awaited<
    ReturnType<typeof readKnowledgeOutputReview>
  >;
const row = () => ({
  reviewId: "00000000-0000-4000-8000-000000000002",
  versionHash: version.hash,
  contextHash: context,
  active: true,
  reviewedAt: now,
  withdrawnAt: null,
});
beforeEach(() => {
  vi.mocked(readKnowledgeOutputReview).mockReset();
  vi.mocked(readKnowledgeOutputReview).mockResolvedValue(snapshot());
});
describe("knowledge review publication consumption", () => {
  it("accepts only a current review of the actual saved deliverable", async () => {
    const rpc = vi.fn(async () => ({ data: [row()], error: null }));
    expect(await hasCurrentOutputKnowledgeReview(owner, asset, now, rpc)).toBe(true);
    expect(readKnowledgeOutputReview).toHaveBeenCalledWith(
      { ownerId: owner, projectId: "p", assetId: "a" },
      { rpc, read: undefined, now, candidate: asset },
    );
  });
  it.each(["withdrawn", "withdrawal timestamp", "future", "version", "context", "absent"])(
    "holds %s review",
    async (reason) => {
      const r = row();
      if (reason === "withdrawn") r.active = false;
      if (reason === "withdrawal timestamp") Object.assign(r, { withdrawnAt: now });
      if (reason === "future") r.reviewedAt = "2026-09-12T00:00:00Z";
      if (reason === "version") r.versionHash = "c".repeat(64);
      if (reason === "context") r.contextHash = "c".repeat(64);
      expect(
        await hasCurrentOutputKnowledgeReview(owner, asset, now, async () => ({
          data: reason === "absent" ? [] : [r],
          error: null,
        })),
      ).toBe(false);
    },
  );
  it.each(["ineligible", "forgotten"])("never waives %s current evidence", async (reason) => {
    vi.mocked(readKnowledgeOutputReview).mockResolvedValue({
      ...snapshot(),
      reviewable: reason !== "ineligible",
      forgotten: reason === "forgotten",
    });
    const rpc = vi.fn();
    expect(await hasCurrentOutputKnowledgeReview(owner, asset, now, rpc)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("propagates unavailable history so publication fails closed", async () => {
    await expect(
      hasCurrentOutputKnowledgeReview(owner, asset, now, async () => ({
        data: null,
        error: { message: "offline" },
      })),
    ).rejects.toThrow();
  });
});
