import { describe, expect, it, vi } from "vitest";
import { saveProjectTeamReview } from "./project-team-review.server";
import type { readProjectTeamPreview } from "./project-team-preview.server";
const actor = "00000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64),
  byteHash = "b".repeat(64);
const input = {
  ownerId: owner,
  projectId: "p",
  assetId: "a",
  reviewId: "00000000-0000-4000-8000-000000000003",
  expectedVersion: { algorithm: "milo-publication-v1" as const, hash },
  expectedHash: hash,
  expectedWorkspaceRevision: 1,
  expectedMembershipRevision: 2,
  expectedPolicyRevision: 3,
  approved: true,
  acknowledged: true,
  images: [{ key: "content_im", byteHash }],
};
function deps() {
  return {
    preview: vi.fn(
      async (): Promise<Awaited<ReturnType<typeof readProjectTeamPreview>>> =>
        ({
          assetId: "a",
          title: "Draft",
          metaTitle: "",
          metaDescription: "",
          version: input.expectedVersion,
          draftHash: hash,
          workspaceRevision: 1,
          membershipRevision: 2,
          policyRevision: 3,
          canReview: true,
          html: '<img src="milo-review-image:content_im">',
          imageIds: ["content_im"],
          unknownImages: 0,
          media: [{ key: "content_im", imageId: "im", kind: "content" as const }],
        }) satisfies Awaited<ReturnType<typeof readProjectTeamPreview>>,
    ),
    media: vi.fn(async () => ({
      imageId: "im",
      draftHash: hash,
      byteHash,
      contentType: "image/png",
      base64: "fixture",
    })),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}
describe("exact collaborator review acknowledgement", () => {
  it("verifies media and repeats context checks before issuing the scoped server grant", async () => {
    const d = deps();
    expect(await saveProjectTeamReview(actor, input, d)).toEqual({ saved: true, approved: true });
    expect(d.preview).toHaveBeenCalledTimes(2);
    expect(d.media).toHaveBeenCalledWith(actor, {
      ownerId: owner,
      projectId: "p",
      assetId: "a",
      imageId: "im",
      kind: "content",
      expectedHash: hash,
    });
    expect(d.rpc).toHaveBeenCalledWith(
      "save_project_team_approval",
      expect.objectContaining({
        p_actor: actor,
        p_owner: owner,
        p_expected: 1,
        p_version: hash,
        p_membership: 2,
        p_policy: 3,
        p_approved: true,
      }),
    );
  });
  it.each([
    { acknowledged: false },
    { images: [] },
    { images: [input.images[0], input.images[0]] },
    { images: [{ key: "content_other", byteHash }] },
  ])("refuses incomplete or substituted image acknowledgement %j", async (change) => {
    const d = deps();
    await expect(saveProjectTeamReview(actor, { ...input, ...change }, d)).rejects.toThrow();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("refuses an image that changed after the reviewer saw it", async () => {
    const d = deps();
    d.media.mockResolvedValue({ ...(await d.media()), byteHash: "c".repeat(64) });
    d.media.mockClear();
    await expect(saveProjectTeamReview(actor, input, d)).rejects.toThrow("image changed");
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { canReview: false },
    { policyRevision: 4 },
    { membershipRevision: 3 },
    { workspaceRevision: 2 },
    { draftHash: "c".repeat(64) },
  ])("refuses changed authority or saved state at the final recheck %j", async (change) => {
    const d = deps();
    const original = await d.preview();
    d.preview.mockClear();
    d.preview.mockResolvedValueOnce(original).mockResolvedValueOnce({ ...original, ...change });
    await expect(saveProjectTeamReview(actor, input, d)).rejects.toThrow("review changed");
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("allows returning a version for changes without attesting that broken images were reviewed", async () => {
    const d = deps();
    d.preview.mockResolvedValue({ ...(await d.preview()), unknownImages: 1 });
    await saveProjectTeamReview(
      actor,
      { ...input, approved: false, acknowledged: false, images: [] },
      d,
    );
    expect(d.media).not.toHaveBeenCalled();
    expect(d.rpc).toHaveBeenCalledWith(
      "save_project_team_approval",
      expect.objectContaining({ p_approved: false }),
    );
  });
  it("never issues a late grant when image checks consume the allowed time", async () => {
    const d = deps();
    let clock = 0;
    d.media.mockImplementation(async () => {
      clock = 66000;
      return {
        imageId: "im",
        draftHash: hash,
        byteHash,
        contentType: "image/png",
        base64: "fixture",
      };
    });
    await expect(saveProjectTeamReview(actor, input, { ...d, now: () => clock })).rejects.toThrow(
      "timed out",
    );
    expect(d.rpc).not.toHaveBeenCalled();
  });
});
