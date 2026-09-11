import { describe, expect, it, vi } from "vitest";
import { readKnowledgeReviewBatch } from "./knowledge-review-context.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const row = () => ({
  assetId: "a",
  registry: [],
  contextHash: "a".repeat(64),
  activeReview: null,
  hasHistory: false,
});
const response = () => ({
  knowledge: { sources: [], records: [] },
  brand: { brandIntelligence: null, brandOwnerFields: [], toneOfVoice: "" },
  outputs: [row()],
});
describe("bounded knowledge review impact read", () => {
  it("uses one exact project/asset request", async () => {
    const data = response();
    const rpc = vi.fn(async () => ({ data, error: null }));
    expect(await readKnowledgeReviewBatch(scope, ["a"], rpc)).toEqual(data);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_output_knowledge_review_batch", {
      p_user: scope.ownerId,
      p_project: "p",
      p_assets: ["a"],
    });
  });
  it.each(["missing", "extra", "duplicate", "wrong-asset"])(
    "rejects %s output coverage",
    async (reason) => {
      const data = response();
      if (reason === "missing") data.outputs = [];
      if (reason === "extra") data.outputs.push({ ...row(), assetId: "b" });
      if (reason === "duplicate") data.outputs.push(row());
      if (reason === "wrong-asset") data.outputs[0].assetId = "b";
      await expect(
        readKnowledgeReviewBatch(scope, ["a"], async () => ({ data, error: null })),
      ).rejects.toThrow();
    },
  );
  it("refuses duplicate or oversized input before storage access", async () => {
    const rpc = vi.fn();
    for (const assets of [["a", "a"], Array.from({ length: 101 }, (_, i) => `a${i}`)])
      await expect(readKnowledgeReviewBatch(scope, assets, rpc)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
