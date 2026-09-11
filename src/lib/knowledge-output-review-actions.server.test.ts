import { beforeEach, describe, expect, it, vi } from "vitest";
import { readKnowledgeOutputReview } from "./knowledge-output-review.server";
import {
  saveKnowledgeOutputReview,
  readKnowledgeOutputReviewHistory,
  withdrawKnowledgeOutputReview,
} from "./knowledge-output-review-actions.server";
vi.mock("./knowledge-output-review.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledge-output-review.server")>();
  return { ...actual, readKnowledgeOutputReview: vi.fn() };
});
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p", assetId: "a" };
const reviewId = "00000000-0000-4000-8000-000000000002";
const version = { algorithm: "milo-publication-v1" as const, hash: "a".repeat(64) };
const context = "b".repeat(64);
const input = () => ({
  reviewId,
  expectedVersion: version,
  expectedContext: context,
  reviewedFacts: ["fact1", "fact2"],
  confirmDeliverable: true as const,
});
const snapshot = () =>
  ({
    version,
    contextHash: context,
    workspaceRevision: 7,
    reviewable: true,
    facts: [{ reviewKey: "fact1" }, { reviewKey: "fact2" }],
  }) as unknown as Awaited<ReturnType<typeof readKnowledgeOutputReview>>;
beforeEach(() => {
  vi.mocked(readKnowledgeOutputReview).mockReset();
  vi.mocked(readKnowledgeOutputReview).mockResolvedValue(snapshot());
});
describe("explicit saved output review", () => {
  it("uses freshly read server version and revision for the atomic save", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    expect(await saveKnowledgeOutputReview(scope, input(), { rpc })).toEqual({ reviewId });
    expect(readKnowledgeOutputReview).toHaveBeenCalledWith(scope, { rpc });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_output_knowledge_review", {
      p_user: scope.ownerId,
      p_project: "p",
      p_asset: "a",
      p_review: reviewId,
      p_expected: 7,
      p_version: version.hash,
      p_context: context,
    });
  });
  it.each(["version", "context", "ineligible"])(
    "refuses %s changes before writing",
    async (reason) => {
      const current = snapshot();
      if (reason === "version") current.version = { ...version, hash: "c".repeat(64) };
      if (reason === "context") current.contextHash = "c".repeat(64);
      if (reason === "ineligible") current.reviewable = false;
      vi.mocked(readKnowledgeOutputReview).mockResolvedValue(current);
      const rpc = vi.fn();
      await expect(saveKnowledgeOutputReview(scope, input(), { rpc })).rejects.toThrow(
        "knowledge_review_changed",
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it.each([["fact1"], ["fact1", "fact1"], ["fact1", "unseen"], ["fact1", "fact2", "extra"]])(
    "refuses omitted, duplicate or invented acknowledgements %j",
    async (...facts) => {
      const rpc = vi.fn();
      await expect(
        saveKnowledgeOutputReview(scope, { ...input(), reviewedFacts: facts }, { rpc }),
      ).rejects.toThrow("knowledge_review_incomplete");
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("does not turn a concurrent SQL rejection or unknown acknowledgement into success", async () => {
    for (const response of [
      { data: null, error: { message: "changed" } },
      { data: null, error: null },
    ]) {
      await expect(
        saveKnowledgeOutputReview(scope, input(), { rpc: async () => response }),
      ).rejects.toThrow();
    }
  });
  it("rejects an absent deliverable confirmation before any private read", async () => {
    await expect(
      saveKnowledgeOutputReview(scope, {
        ...input(),
        confirmDeliverable: false,
      } as unknown as ReturnType<typeof input>),
    ).rejects.toThrow();
    expect(readKnowledgeOutputReview).not.toHaveBeenCalled();
  });
  it("withdraws only the exact scoped review and never rereads forgotten facts", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    expect(await withdrawKnowledgeOutputReview(scope, reviewId, rpc)).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("withdraw_output_knowledge_review", {
      p_user: scope.ownerId,
      p_project: "p",
      p_asset: "a",
      p_review: reviewId,
    });
    expect(readKnowledgeOutputReview).not.toHaveBeenCalled();
  });
  it("rejects ambiguous active history", async () => {
    const row = {
      reviewId,
      versionHash: version.hash,
      contextHash: context,
      active: true,
      reviewedAt: "2026-09-11T00:00:00Z",
      withdrawnAt: null,
    };
    await expect(
      readKnowledgeOutputReviewHistory(scope, async () => ({
        data: [row, { ...row, reviewId: "00000000-0000-4000-8000-000000000003" }],
        error: null,
      })),
    ).rejects.toThrow();
  });
});
