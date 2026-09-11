vi.mock("./project-team-preview-limit.server", () => ({
  acquireTeamPreview: vi.fn(async () => "00000000-0000-4000-8000-000000000009"),
  releaseTeamPreview: vi.fn(async () => {}),
}));
import { teamReviewDecision } from "./project-team";
import { describe, expect, it, vi } from "vitest";
import {
  teamImageReviewKey,
  teamPreviewHtml,
  readProjectTeamPreview,
} from "./project-team-preview.server";
import type { readTeamReviewContext } from "./project-team-context.server";
import { publicationVersion } from "./publication-version";
const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002";
const target = { ownerId: owner, projectId: "p", assetId: "a" };
function context() {
  return {
    ...target,
    actorId: actor,
    workspaceRevision: 1,
    membershipRevision: 1,
    draftHash: "a".repeat(64),
    project: {
      id: "p",
      name: "Project",
      websiteUrl: "https://client.example",
      publishSecret: "fixture-private",
    },
    asset: {
      id: "a",
      projectId: "p",
      title: "Draft",
      markdown: "# Draft\n\nSaved body",
      images: [],
    },
    links: [],
  } as unknown as Awaited<ReturnType<typeof readTeamReviewContext>>;
}
const authority = vi.fn(async () => ({
  ...target,
  actorId: actor,
  canReview: true,
  policyRevision: 1,
}));
describe("collaborator canonical preview", () => {
  it("replaces known media URLs and flags unknown images without returning their locations", () => {
    const url = "https://project.supabase.co/image.png?token=fixture&other=1";
    const result = teamPreviewHtml(
      `<figure><img src="${url.replace("&", "&amp;")}" alt="Product" /></figure><img src="https://unknown.example/private" />`,
      [{ id: "content_im", url }],
    );
    expect(result.imageIds).toEqual(["content_im"]);
    expect(result.unknownImages).toBe(1);
    expect(result.html).toContain('src="milo-review-image:content_im"');
    expect(result.html).not.toContain("fixture");
    expect(result.html).not.toContain("unknown.example");
  });
  it("preserves a saved image URL in visible text and other attributes", () => {
    const url = "https://site.example/image.png?a=1&b=2";
    const escaped = url.replace("&", "&amp;");
    const text = `<p>${escaped}</p><code>${escaped}</code><a href="${escaped}">${escaped}</a><figcaption>${escaped}</figcaption>`;
    const result = teamPreviewHtml(
      `${text}<img data-src="${escaped}" src="${escaped}" alt="${escaped}" />`,
      [{ id: "content_im", url }],
    );
    expect(result.html).toBe(
      `${text}<img data-src="${escaped}" src="milo-review-image:content_im" alt="${escaped}" />`,
    );
    expect(result.imageIds).toEqual(["content_im"]);
    expect(result.unknownImages).toBe(0);
  });
  it.each(["&", "&amp;", "&#38;", "&#x26;"])(
    "matches canonical query separators represented as %s",
    (separator) => {
      const result = teamPreviewHtml(
        `<img src="https://site.example/im.png?a=1${separator}b=2" />`,
        [{ id: "content_im", url: "https://site.example/im.png?a=1&b=2" }],
      );
      expect(result).toEqual({
        html: '<img src="milo-review-image:content_im" />',
        imageIds: ["content_im"],
        unknownImages: 0,
      });
    },
  );
  it("decodes attributes once and retains literal entity text in saved URLs", () => {
    const result = teamPreviewHtml('<img src="https://site.example/im.png?a=1&amp;amp;b=2" />', [
      { id: "literal", url: "https://site.example/im.png?a=1&amp;b=2" },
      { id: "decoded", url: "https://site.example/im.png?a=1&b=2" },
    ]);
    expect(result.imageIds).toEqual(["literal"]);
  });
  it("handles repeated use of the same image without requiring duplicate downloads", () => {
    const result = teamPreviewHtml(
      '<img src="https://site.example/im.png" /><img src="https://site.example/im.png" />',
      [
        { id: "first", url: "https://site.example/im.png" },
        { id: "second", url: "https://site.example/im.png" },
      ],
    );
    expect(result.imageIds).toEqual(["first"]);
    expect(result.unknownImages).toBe(0);
  });
  it("uses the canonical publication version while projecting only the rendered deliverable", async () => {
    const ctx = context();
    const read = vi.fn(async () => ctx);
    const result = await readProjectTeamPreview(actor, target, read, authority);
    expect(result.version).toEqual(await publicationVersion(ctx.asset, ctx.project, ["/"]));
    expect(result.html).toContain("Saved body");
    expect(result).not.toHaveProperty("project");
    expect(JSON.stringify(result)).not.toContain("fixture-private");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("visibly includes a separate social image while preserving the publication version", async () => {
    const ctx = context();
    ctx.asset.images = [
      { id: "im", url: "https://client.example/hero.png" },
    ] as typeof ctx.asset.images;
    ctx.asset.featuredImage = {
      imageId: "im",
      url: "https://client.example/hero.png",
      storagePath: "fixture",
      alt: "Hero",
      hero: {},
      approval: "approved",
      social: { physicalUrl: "https://client.example/social.png", alt: 'Social " image' },
    } as typeof ctx.asset.featuredImage;
    const result = await readProjectTeamPreview(actor, target, async () => ctx, authority);
    expect(result.media).toContainEqual({ key: "social_im", imageId: "im", kind: "social" });
    expect(result.html).toContain('src="milo-review-image:social_im"');
    expect(result.html).toContain('alt="Social &quot; image"');
    expect(result.version).toEqual(await publicationVersion(ctx.asset, ctx.project, ["/"]));
  });
  it("keeps a self-contained approved hero and social image after source removal", async () => {
    const ctx = context();
    ctx.asset.featuredImage = {
      imageId: "detached",
      url: "https://client.example/hero.png",
      alt: "Hero",
      approval: "approved",
      hero: {},
      social: { physicalUrl: "https://client.example/social.png" },
    } as typeof ctx.asset.featuredImage;
    const result = await readProjectTeamPreview(actor, target, async () => ctx, authority);
    expect(result.unknownImages).toBe(0);
    expect(result.media).toContainEqual({
      key: "featured_detached",
      imageId: "detached",
      kind: "featured",
    });
    expect(result.media).toContainEqual({
      key: "social_detached",
      imageId: "detached",
      kind: "social",
    });
  });
  it("supports an existing article with 31 images", async () => {
    const ctx = context();
    ctx.asset.images = Array.from({ length: 31 }, (_, i) => ({
      id: `im${i}`,
      url: `https://client.example/im${i}.png`,
    })) as typeof ctx.asset.images;
    await expect(
      readProjectTeamPreview(actor, target, async () => ctx, authority),
    ).resolves.toHaveProperty("unknownImages", 0);
  });
  it("rejects a context that changed while the preview was being assembled", async () => {
    const read = vi
      .fn(async () => context())
      .mockResolvedValueOnce(context())
      .mockResolvedValueOnce({ ...context(), workspaceRevision: 2 });
    await expect(readProjectTeamPreview(actor, target, read, authority)).rejects.toThrow(
      "saved review changed",
    );
  });
});

it("excludes retained social images while the featured image is unapproved", async () => {
  const ctx = context();
  ctx.asset.featuredImage = {
    imageId: "im",
    url: "https://client.example/hero.png",
    storagePath: "fixture",
    alt: "Hero",
    hero: {},
    approval: "draft",
    social: { physicalUrl: "https://client.example/old-social.png" },
  } as typeof ctx.asset.featuredImage;
  const result = await readProjectTeamPreview(actor, target, async () => ctx, authority);
  expect(result.media.some((item) => item.kind === "social")).toBe(false);
  expect(result.html).not.toContain("old-social");
  expect(result.version).toEqual(await publicationVersion(ctx.asset, ctx.project, ["/"]));
});

it("uses disjoint safe keys for legacy identifiers while preserving the stored ID", async () => {
  const id = "bad id)with paren";
  const c = context();
  c.asset.images = [
    {
      id,
      url: "https://client.example/legacy.png",
      alt: "Legacy",
      concept: "Legacy image",
      status: "accepted",
      placement: "inline",
    },
  ];
  const read = vi.fn(async () => c);
  const result = await readProjectTeamPreview(actor, target, read, authority);
  const key = teamImageReviewKey("content", id);
  expect(key).toMatch(/^content_~[a-f0-9]{64}$/);
  expect(teamReviewDecision.shape.images.parse([{ key, byteHash: "a".repeat(64) }])).toHaveLength(
    1,
  );
  expect(result.media).toContainEqual({ key, imageId: id, kind: "content" });
  expect(result.html).toContain("milo-review-image:" + key);
  expect(teamImageReviewKey("content", key.slice(9))).not.toBe(key);
  expect(teamImageReviewKey("content", "\ud800")).not.toBe(teamImageReviewKey("content", "\ud801"));
});

it("admits before context and releases after success or failure", async () => {
  const budget = { acquire: vi.fn(async () => owner), release: vi.fn(async () => {}) };
  const read = vi.fn(async () => context());
  await readProjectTeamPreview(actor, target, read, authority, budget);
  expect(budget.acquire.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]);
  expect(budget.release).toHaveBeenCalledWith(actor, owner, owner);
  read.mockRejectedValueOnce(new Error("removed"));
  await expect(readProjectTeamPreview(actor, target, read, authority, budget)).rejects.toThrow(
    "removed",
  );
  expect(budget.release).toHaveBeenCalledTimes(2);
  read.mockClear();
  budget.acquire.mockRejectedValueOnce(new Error("busy"));
  await expect(readProjectTeamPreview(actor, target, read, authority, budget)).rejects.toThrow(
    "busy",
  );
  expect(read).not.toHaveBeenCalled();
});

it("matches whitespace-padded generated source URLs after decoding", () => {
  const result = teamPreviewHtml('<img src="  https://site.example/im.png?a=1&amp;b=2  " />', [
    { id: "content_im", url: "  https://site.example/im.png?a=1&b=2  " },
  ]);
  expect(result.imageIds).toEqual(["content_im"]);
  expect(result.unknownImages).toBe(0);
});
