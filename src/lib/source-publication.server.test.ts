import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAsset } from "./types";
import { assertAssetSourcesCurrent, sourceIssuesForAsset } from "./source-publication.server";
const mocked = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn(), registry: vi.fn() }));
vi.mock("./source-refresh.server", () => ({
  readSourceRefresh: mocked.read,
  refreshProjectSource: mocked.refresh,
  readOutputSourceDependencies: mocked.registry,
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
  it("holds an unconfirmed refresh without replay", async () => {
    mocked.refresh.mockRejectedValue(new Error("private failure"));
    await expect(assertAssetSourcesCurrent(ownerId, asset)).rejects.toThrow(
      "Source facts need review",
    );
    expect(mocked.refresh).toHaveBeenCalledOnce();
  });
});
