import { describe, it, expect, vi } from "vitest";
import { readKnowledgeOutputReview } from "./knowledge-output-review.server";
import type { readWorkspaceRow } from "./workspace.server";
const ownerId = "00000000-0000-4000-8000-000000000001";
const scope = { ownerId, projectId: "p", assetId: "a" };
const now = "2026-09-11T00:00:00Z";
const source = {
  ownerId,
  projectId: "p",
  id: "00000000-0000-4000-8000-000000000002",
  revision: 2,
  kind: "owner",
  label: "Product",
  fingerprint: "b".repeat(64),
  observedAt: now,
  status: "active",
};
const record = {
  ownerId,
  projectId: "p",
  id: "00000000-0000-4000-8000-000000000003",
  revision: 2,
  sourceId: source.id,
  sourceRevision: 2,
  key: "product.color",
  category: "fact",
  appliesTo: "both",
  value: "Blue",
  locator: "Owner",
  status: "accepted",
  updatedAt: now,
  reviewedAt: now,
};
const reference = {
  recordId: record.id,
  recordRevision: 1,
  sourceId: source.id,
  sourceRevision: 1,
  sourceFingerprint: "a".repeat(64),
};
function fixture() {
  const workspace = {
    rev: 4,
    data: {
      projects: [
        {
          id: "p",
          name: "Business",
          websiteUrl: "https://example.com",
          connectorType: "wordpress",
        },
      ],
      content: [
        {
          id: "a",
          projectId: "p",
          title: "Saved",
          slug: "saved",
          markdown: "Original owner text",
          status: "Draft",
          images: [],
        },
      ],
    },
  };
  const state = { sources: [structuredClone(source)], records: [structuredClone(record)] };
  const registry = [
    { assetId: "a", outputId: "a", kind: "content", references: [reference], forgotten: false },
  ];
  const read = vi.fn(async () => structuredClone(workspace));
  const rpc = vi.fn(async (name: string) => {
    if (name === "read_output_knowledge_review_context")
      return {
        data: {
          knowledge: structuredClone(state),
          registry: structuredClone(registry),
          brand: { brandIntelligence: null, brandOwnerFields: [], toneOfVoice: "" },
          contextHash: "c".repeat(64),
        },
        error: null,
      };
    throw new Error(`Unexpected RPC ${name}`);
  });
  return {
    workspace,
    state,
    registry,
    read,
    rpc,
    dependencies: { read: read as unknown as typeof readWorkspaceRow, rpc, now },
  };
}
describe("saved knowledge inspection", () => {
  it("refuses an unsaved transport candidate even when saved review evidence matches", async () => {
    const f = fixture();
    const candidate = {
      ...f.workspace.data.content[0],
      markdown: "Unsaved replacement",
    } as unknown as import("./types").ContentAsset;
    await expect(
      readKnowledgeOutputReview(scope, { ...f.dependencies, candidate }),
    ).rejects.toThrow("knowledge_output_changed");
  });
  it("shows original registry versions and current facts even when the browser omitted references", async () => {
    const f = fixture();
    const result = await readKnowledgeOutputReview(scope, f.dependencies);
    expect(result.markdown).toBe("Original owner text");
    expect(result.facts[0].reference.recordRevision).toBe(1);
    expect(result.facts[0].record?.revision).toBe(2);
    expect(result.facts[0].record?.value).toBe("Blue");
    expect(result.issues).toHaveLength(1);
    expect(result.reviewable).toBe(true);
    expect(result.facts[0].currentReference?.recordRevision).toBe(2);
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual(["read_output_knowledge_review_context"]);
    expect(result).not.toHaveProperty("approved");
    expect(f.workspace.data.content[0].status).toBe("Draft");
  });
  it("refuses another project without querying private knowledge", async () => {
    const f = fixture();
    await expect(
      readKnowledgeOutputReview({ ...scope, projectId: "other" }, f.dependencies),
    ).rejects.toThrow("knowledge_output_unavailable");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-owner knowledge returned by storage", async () => {
    const f = fixture();
    f.state.records[0].ownerId = "00000000-0000-4000-8000-000000000009";
    await expect(readKnowledgeOutputReview(scope, f.dependencies)).rejects.toThrow();
  });
  it("does not reconstruct forgotten evidence", async () => {
    const f = fixture();
    f.state.records = [];
    f.state.sources = [];
    f.registry[0].references = [];
    f.registry[0].forgotten = true;
    const result = await readKnowledgeOutputReview(scope, f.dependencies);
    expect(result.facts).toEqual([]);
    expect(result.forgotten).toBe(true);
    expect(result.reviewable).toBe(false);
    expect(result.issues[0].key).toBe("forgotten-knowledge");
  });
  it("rejects an inspection when saved content changes during its reads", async () => {
    const f = fixture();
    f.read.mockImplementationOnce(async () => structuredClone(f.workspace));
    f.read.mockImplementationOnce(async () => ({ ...structuredClone(f.workspace), rev: 5 }));
    await expect(readKnowledgeOutputReview(scope, f.dependencies)).rejects.toThrow(
      "knowledge_output_changed",
    );
  });
  it("binds the displayed saved text to the publication version", async () => {
    const f = fixture();
    const first = await readKnowledgeOutputReview(scope, f.dependencies);
    f.workspace.data.content[0].markdown = "Corrected owner text";
    const second = await readKnowledgeOutputReview(scope, f.dependencies);
    expect(second.version.hash).not.toBe(first.version.hash);
    expect(second.markdown).toBe("Corrected owner text");
  });
  it("refuses partial inspection after a registry read failure", async () => {
    const f = fixture();
    f.rpc.mockRejectedValueOnce(new Error("offline"));
    await expect(readKnowledgeOutputReview(scope, f.dependencies)).rejects.toThrow();
  });
  it.each(["expired", "disputed", "revoked", "visual-only"])(
    "does not offer revalidation for %s current evidence",
    async (reason) => {
      const f = fixture();
      if (reason === "expired") f.state.records[0].status = "expired";
      if (reason === "disputed") f.state.records[0].status = "disputed";
      if (reason === "revoked") f.state.sources[0].status = "revoked";
      if (reason === "visual-only") f.state.records[0].appliesTo = "visual";
      const result = await readKnowledgeOutputReview(scope, f.dependencies);
      expect(result.reviewable).toBe(false);
      expect(result.facts[0].currentReference).toBeNull();
    },
  );
});
