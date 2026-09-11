import { describe, it, expect, vi } from "vitest";
import { assertReviewedPublicationImages } from "./publication-reviewed-images.server";
import type { readProjectTeamPreview } from "./project-team-preview.server";
const owner = "00000000-0000-4000-8000-000000000001",
  scope = { ownerId: owner, projectId: "p", assetId: "a" },
  hash = "a".repeat(64),
  byteHash = "b".repeat(64);
function deps() {
  const preview: Awaited<ReturnType<typeof readProjectTeamPreview>> = {
    assetId: "a",
    title: "Draft",
    metaTitle: "",
    metaDescription: "",
    version: { algorithm: "milo-publication-v1", hash },
    draftHash: hash,
    workspaceRevision: 2,
    membershipRevision: 1,
    policyRevision: 1,
    canReview: true,
    html: "",
    imageIds: ["social_im"],
    unknownImages: 0,
    media: [{ key: "social_im", imageId: "im", kind: "social" }],
  };
  return {
    rpc: vi.fn(async () => ({
      data: { images: [{ key: "social_im", byteHash }] } as {
        images: null | { key: string; byteHash: string }[];
      },
      error: null,
    })),
    preview: vi.fn(async () => preview),
    media: vi.fn(async () => ({
      imageId: "im",
      draftHash: hash,
      byteHash,
      contentType: "image/png",
      base64: "fixture",
    })),
  };
}
describe("publication image attestation", () => {
  it("verifies larger manifests within the four active media allowance", async () => {
    const d = deps(),
      original = await d.preview();
    const media = Array.from({ length: 9 }, (_, i) => ({
      key: `content_im${i}`,
      imageId: `im${i}`,
      kind: "content" as const,
    }));
    d.preview.mockResolvedValue({ ...original, media, imageIds: media.map((item) => item.key) });
    d.rpc.mockResolvedValue({
      data: { images: media.map(({ key }) => ({ key, byteHash })) },
      error: null,
    });
    let active = 0,
      peak = 0;
    d.media.mockImplementation(async (...args: unknown[]) => {
      active++;
      peak = Math.max(peak, active);
      if (active > 4) throw new Error("team_media_capacity");
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return {
        imageId: (args[1] as { imageId: string }).imageId,
        draftHash: hash,
        byteHash,
        contentType: "image/png",
        base64: "fixture",
      };
    });
    await assertReviewedPublicationImages(scope, hash, d);
    expect(d.media).toHaveBeenCalledTimes(9);
    expect(peak).toBe(4);
  });

  it("rehashes exact saved media before accepting the grant", async () => {
    const d = deps();
    await assertReviewedPublicationImages(scope, hash, d);
    expect(d.media).toHaveBeenCalledWith(owner, {
      ...scope,
      imageId: "im",
      kind: "social",
      expectedHash: hash,
    });
    expect(d.rpc).toHaveBeenCalledTimes(2);
    expect(d.preview).toHaveBeenCalledTimes(2);
  });
  it("blocks changed bytes even when the publication version and media key are unchanged", async () => {
    const d = deps();
    d.media.mockResolvedValue({ ...(await d.media()), byteHash: "c".repeat(64) });
    await expect(assertReviewedPublicationImages(scope, hash, d)).rejects.toThrow("images_changed");
  });
  it("blocks a social image omitted from the persisted acknowledgement", async () => {
    const d = deps();
    d.rpc.mockResolvedValue({ data: { images: [] }, error: null });
    await expect(assertReviewedPublicationImages(scope, hash, d)).rejects.toThrow("images_changed");
    expect(d.media).not.toHaveBeenCalled();
  });
  it("rechecks the saved version after media reads", async () => {
    const d = deps(),
      original = await d.preview();
    d.preview.mockClear();
    d.preview
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({ ...original, draftHash: "c".repeat(64) });
    await expect(assertReviewedPublicationImages(scope, hash, d)).rejects.toThrow("images_changed");
  });
  it("requires the same grant after reading images", async () => {
    const d = deps();
    d.rpc
      .mockResolvedValueOnce({ data: { images: [{ key: "social_im", byteHash }] }, error: null })
      .mockResolvedValueOnce({ data: { images: null }, error: null });
    await expect(assertReviewedPublicationImages(scope, hash, d)).rejects.toThrow("images_changed");
  });
  it("preserves independent legacy owner approvals without a team manifest", async () => {
    const d = deps();
    d.rpc.mockResolvedValue({ data: { images: null }, error: null });
    await assertReviewedPublicationImages(scope, hash, d);
    expect(d.media).not.toHaveBeenCalled();
    expect(d.preview).not.toHaveBeenCalled();
  });
});
