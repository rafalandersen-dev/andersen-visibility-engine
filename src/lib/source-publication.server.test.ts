import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAsset } from "./types";
import {
  assertAssetSourcesCurrent,
  sourceIssuesForAsset,
  readProjectSourceImpact,
  SOURCE_PUBLICATION_DEADLINE_MS,
} from "./source-publication.server";
const mocked = vi.hoisted(() => ({
  read: vi.fn(),
  refresh: vi.fn(),
  registry: vi.fn(),
  workspace: vi.fn(),
  reviewBatch: vi.fn(),
}));
vi.mock("./source-refresh.server", () => ({
  readSourceRefresh: mocked.read,
  refreshProjectSource: mocked.refresh,
  readOutputSourceDependencies: mocked.registry,
}));
vi.mock("./knowledge-publication.server", () => ({
  knowledgeIssuesForAsset: vi.fn(async () => []),
  readOutputKnowledgeDependencies: vi.fn(async () => []),
  evaluateAssetKnowledge: vi.fn(() => []),
}));
vi.mock("./project-knowledge.server", () => ({
  readProjectKnowledge: vi.fn(async () => ({ sources: [], records: [] })),
}));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: mocked.workspace }));
vi.mock("./knowledge-review-context.server", () => ({
  readKnowledgeReviewBatch: mocked.reviewBatch,
}));
const ownerId = "00000000-0000-4000-8000-000000000001",
  sourceId = "00000000-0000-4000-8000-000000000002";
const dependency = {
  ownerId,
  projectId: "p",
  sourceId,
  key: "price",
  fingerprint: "a".repeat(64),
  critical: true,
};
const asset = {
  id: "a",
  projectId: "p",
  sourceDependencies: [dependency],
  markdown: "Owner's untouched text",
  status: "Approved",
  scheduledPublishAt: "2026-09-10T12:00:00Z",
} as ContentAsset;
const row = () => ({
  sourceId,
  sourceRevision: 1,
  status: "ok",
  accepted: { price: dependency.fingerprint },
  snapshot: {
    ownerId,
    projectId: "p",
    sourceId,
    revision: 1,
    observedAt: new Date().toISOString(),
    coverage: "public-page",
    facts: [
      {
        key: "price",
        field: "price",
        locator: "Offer",
        value: "100",
        fingerprint: dependency.fingerprint,
      },
    ],
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocked.reviewBatch.mockImplementation(async (_scope, assets: string[]) => ({
    knowledge: { sources: [], records: [] },
    brand: {},
    outputs: assets.map((assetId) => ({
      assetId,
      registry: [],
      contextHash: "a".repeat(64),
      activeReview: null,
      hasHistory: false,
    })),
  }));
  mocked.registry.mockResolvedValue([]);
  mocked.read.mockResolvedValue([row()]);
  mocked.refresh.mockResolvedValue({ status: "cooldown" });
});
describe("source publication authorization", () => {
  it("refreshes then rechecks accepted current evidence without editing asset", async () => {
    const before = structuredClone(asset);
    await assertAssetSourcesCurrent(ownerId, asset);
    expect(mocked.refresh).toHaveBeenCalledOnce();
    expect(mocked.read).toHaveBeenCalledTimes(2);
    expect(asset).toEqual(before);
  });
  it.each(["changed", "outage", "withdrawn", "missing", "stale"])(
    "holds %s evidence after refresh",
    async (reason) => {
      const current = row();
      if (reason === "changed") current.snapshot.facts[0].fingerprint = "b".repeat(64);
      if (reason === "outage") current.status = "unknown";
      if (reason === "withdrawn") current.accepted = {} as typeof current.accepted;
      if (reason === "stale") current.snapshot.observedAt = "2000-01-01T00:00:00Z";
      mocked.read
        .mockResolvedValueOnce([row()])
        .mockResolvedValue(reason === "missing" ? [] : [current]);
      await expect(assertAssetSourcesCurrent(ownerId, asset)).rejects.toThrow(
        "Source facts need review",
      );
    },
  );
  it("leaves unrelated changes publishable", async () => {
    const current = row();
    current.snapshot.facts.push({
      ...current.snapshot.facts[0],
      key: "other",
      fingerprint: "b".repeat(64),
    });
    mocked.read.mockResolvedValue([current]);
    expect(await sourceIssuesForAsset(ownerId, asset)).toEqual([]);
  });
  it("checks image dependencies and refuses foreign scope before refresh", async () => {
    const imageAsset = {
      ...asset,
      sourceDependencies: [],
      images: [{ sourceDependencies: [{ ...dependency, projectId: "foreign" }] }],
    } as unknown as ContentAsset;
    await expect(assertAssetSourcesCurrent(ownerId, imageAsset)).rejects.toThrow();
    expect(mocked.refresh).not.toHaveBeenCalled();
  });
  it("does not fetch for legacy assets without dependencies", async () => {
    await assertAssetSourcesCurrent(ownerId, { ...asset, sourceDependencies: undefined });
    expect(mocked.read).not.toHaveBeenCalled();
  });
  it("enforces server-retained dependencies when browser fields are missing", async () => {
    mocked.registry.mockResolvedValue([
      { assetId: asset.id, outputId: asset.id, kind: "content", dependencies: [dependency] },
    ]);
    mocked.read.mockResolvedValue([]);
    await expect(
      assertAssetSourcesCurrent(ownerId, { ...asset, sourceDependencies: undefined }),
    ).rejects.toThrow();
  });
  it("retains unresolved contradictions when the competing source becomes unavailable", async () => {
    const current = row();
    const fact = { ...current.snapshot.facts[0], productId: "product" };
    const second = {
      ...current,
      sourceId: "00000000-0000-4000-8000-000000000003",
      status: "unknown",
      snapshot: {
        ...current.snapshot,
        sourceId: "00000000-0000-4000-8000-000000000003",
        facts: [{ ...fact, value: "125", fingerprint: "b".repeat(64) }],
      },
    };
    mocked.read.mockResolvedValue([
      { ...current, snapshot: { ...current.snapshot, facts: [fact] } },
      second,
    ]);
    const target = { ...asset, sourceDependencies: [{ ...dependency, productId: "product" }] };
    expect(await sourceIssuesForAsset(ownerId, target)).toMatchObject([
      { sourceId, reason: "unavailable" },
    ]);
    await expect(assertAssetSourcesCurrent(ownerId, target)).rejects.toThrow(
      "Source facts need review",
    );
  });
  it("accepts more than 100 combined dependencies across individually valid outputs", async () => {
    const current = row();
    const facts = Array.from({ length: 100 }, (_, i) => ({
      ...current.snapshot.facts[0],
      key: `fact-${i}`,
    }));
    current.snapshot.facts = facts;
    current.accepted = Object.fromEntries(
      facts.map((f) => [f.key, f.fingerprint]),
    ) as typeof current.accepted;
    mocked.read.mockResolvedValue([current]);
    const primary = facts.map((f) => ({ ...dependency, key: f.key, snapshotRevision: 1 }));
    const image = facts.map((f) => ({ ...dependency, key: f.key, snapshotRevision: 2 }));
    const target = {
      ...asset,
      sourceDependencies: primary,
      images: [{ id: "image", sourceDependencies: image }],
    } as ContentAsset;
    expect(await sourceIssuesForAsset(ownerId, target)).toEqual([]);
    await expect(assertAssetSourcesCurrent(ownerId, target)).resolves.toBeUndefined();
  });
  it("permits legacy image collections and counts only dependency-bearing images", async () => {
    const images = Array.from({ length: 31 }, (_, i) => ({ id: `image-${i}` }));
    const legacy = { ...asset, sourceDependencies: undefined, images } as ContentAsset;
    await expect(assertAssetSourcesCurrent(ownerId, legacy)).resolves.toBeUndefined();
    expect(mocked.read).not.toHaveBeenCalled();
    const sourced = {
      ...legacy,
      images: [...images, { id: "sourced", sourceDependencies: [dependency] }],
    } as ContentAsset;
    mocked.read.mockResolvedValue([row()]);
    expect(await sourceIssuesForAsset(ownerId, sourced)).toEqual([]);
    mocked.read.mockResolvedValue([]);
    await expect(assertAssetSourcesCurrent(ownerId, sourced)).rejects.toThrow(
      "Source facts need review",
    );
  });
  it("retains the bounded source-image evaluation capacity", async () => {
    const target = {
      ...asset,
      images: Array.from({ length: 31 }, (_, i) => ({
        id: `sourced-${i}`,
        sourceDependencies: [dependency],
      })),
    } as ContentAsset;
    await expect(assertAssetSourcesCurrent(ownerId, target)).rejects.toThrow(
      "Source facts need review",
    );
  });
  it("keeps forgotten-source output tombstones held without retaining source identifiers", async () => {
    mocked.registry.mockResolvedValue([
      {
        assetId: asset.id,
        outputId: asset.id,
        kind: "content",
        dependencies: [],
        sourceForgotten: true,
      },
    ]);
    const target = { ...asset, sourceDependencies: undefined };
    expect(await sourceIssuesForAsset(ownerId, target)).toEqual([
      { sourceId: "", key: "forgotten-source", critical: true, reason: "unavailable" },
    ]);
    await expect(assertAssetSourcesCurrent(ownerId, target)).rejects.toThrow(
      "Source facts need review",
    );
    expect(mocked.refresh).not.toHaveBeenCalled();
  });
  it("holds an unconfirmed refresh without replay", async () => {
    mocked.refresh.mockRejectedValue(new Error("private failure"));
    await expect(assertAssetSourcesCurrent(ownerId, asset)).rejects.toThrow(
      "Source facts need review",
    );
    expect(mocked.refresh).toHaveBeenCalledOnce();
  });
});

it("bounds impact registry reads to the first 100 project assets even when browser references are absent", async () => {
  const content = Array.from({ length: 101 }, (_, i) => ({
    ...asset,
    id: `asset_${i}`,
    sourceDependencies: [],
  }));
  mocked.workspace.mockResolvedValue({
    data: { content: [{ ...asset, projectId: "foreign" }, ...content] },
  });
  mocked.registry.mockResolvedValue([
    {
      assetId: "asset_0",
      outputId: "asset_0",
      kind: "content",
      dependencies: [],
      sourceForgotten: true,
    },
  ]);
  const result = await readProjectSourceImpact(ownerId, "p");
  expect(mocked.registry).toHaveBeenCalledExactlyOnceWith(
    { ownerId, projectId: "p" },
    content.slice(0, 100).map((a) => a.id),
  );
  expect(result).toMatchObject({ checked: 100, remaining: 1, affected: [{ assetId: "asset_0" }] });
});
it("does not request an unfiltered registry for an empty project", async () => {
  mocked.workspace.mockResolvedValue({ data: { content: [] } });
  expect(await readProjectSourceImpact(ownerId, "p")).toEqual({
    checked: 0,
    remaining: 0,
    affected: [],
    reviewHistory: [],
  });
  expect(mocked.registry).not.toHaveBeenCalled();
});

it("starts source refreshes together and holds within one deadline if all stall", async () => {
  vi.useFakeTimers();
  try {
    const sources = Array.from(
      { length: 10 },
      (_, i) => `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
    );
    mocked.read.mockResolvedValue(sources.map((sourceId) => ({ ...row(), sourceId })));
    mocked.refresh.mockImplementation(() => new Promise(() => {}));
    const waiting = expect(
      assertAssetSourcesCurrent(ownerId, {
        ...asset,
        sourceDependencies: sources.map((sourceId) => ({ ...dependency, sourceId })),
      }),
    ).rejects.toThrow("Source facts need review");
    await vi.advanceTimersByTimeAsync(1);
    expect(mocked.refresh).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(SOURCE_PUBLICATION_DEADLINE_MS);
    await waiting;
    expect(mocked.read).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("reports the same revoked knowledge once across current and future publication checks", async () => {
  const { evaluateAssetKnowledge } = await import("./knowledge-publication.server");
  const issue = {
    sourceId: "source",
    key: "record",
    reason: "unavailable" as const,
    evidence: "knowledge" as const,
    critical: true as const,
  };
  vi.mocked(evaluateAssetKnowledge).mockReturnValue([issue]);
  mocked.workspace.mockResolvedValue({
    data: {
      content: [{ ...asset, sourceDependencies: [], scheduledPublishAt: "2099-01-01T00:00:00Z" }],
    },
  });
  const result = await readProjectSourceImpact(ownerId, "p");
  expect(result.affected[0].issues).toEqual([issue]);
  expect(result.affected[0].knowledgeIssueCount).toBe(1);
  expect(evaluateAssetKnowledge).toHaveBeenCalledTimes(2);
});

it("clears current reviewed impact while preserving history and future-expiry holds", async () => {
  const { evaluateAssetKnowledge } = await import("./knowledge-publication.server");
  const { publicationVersion } = await import("./publication-version");
  const project = {
    id: "p",
    websiteUrl: "https://example.com",
    connectorType: "wordpress",
  } as import("./types").Project;
  const saved = { ...asset, sourceDependencies: [], scheduledPublishAt: undefined };
  const version = await publicationVersion(saved, project, []);
  const context = "a".repeat(64);
  const output = {
    assetId: "a",
    registry: [],
    contextHash: context,
    activeReview: { versionHash: version.hash, contextHash: context },
    hasHistory: true,
  };
  mocked.reviewBatch.mockResolvedValue({
    knowledge: { sources: [], records: [] },
    brand: {},
    outputs: [output],
  });
  mocked.workspace.mockResolvedValue({ rev: 1, data: { projects: [project], content: [saved] } });
  const issue = {
    sourceId: "source",
    key: "record",
    reason: "changed" as const,
    evidence: "knowledge" as const,
    critical: true as const,
  };
  vi.mocked(evaluateAssetKnowledge).mockImplementation(
    (_owner, _asset, _state, _registry, when, _profile, reviewed) =>
      reviewed && when !== "2099-01-01T00:00:00Z" ? [] : [issue],
  );
  const current = await readProjectSourceImpact(ownerId, "p");
  expect(current.affected).toEqual([]);
  expect(current.reviewHistory).toEqual([{ assetId: "a", title: "a" }]);
  expect(mocked.reviewBatch).toHaveBeenCalledExactlyOnceWith({ ownerId, projectId: "p" }, ["a"]);
  mocked.workspace.mockResolvedValue({
    rev: 1,
    data: {
      projects: [project],
      content: [{ ...saved, scheduledPublishAt: "2099-01-01T00:00:00Z" }],
    },
  });
  expect((await readProjectSourceImpact(ownerId, "p")).affected[0].knowledgeIssueCount).toBe(1);
  output.activeReview.contextHash = "b".repeat(64);
  mocked.workspace.mockResolvedValue({ rev: 1, data: { projects: [project], content: [saved] } });
  expect((await readProjectSourceImpact(ownerId, "p")).affected[0].knowledgeIssueCount).toBe(1);
});
