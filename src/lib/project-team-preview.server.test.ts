import { describe, expect, it, vi } from "vitest";
import { teamPreviewHtml, readProjectTeamPreview } from "./project-team-preview.server";
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
    const result = await readProjectTeamPreview(actor, target, read);
    expect(result.version).toEqual(await publicationVersion(ctx.asset, ctx.project, ["/"]));
    expect(result.html).toContain("Saved body");
    expect(result).not.toHaveProperty("project");
    expect(JSON.stringify(result)).not.toContain("fixture-private");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("rejects a context that changed while the preview was being assembled", async () => {
    const read = vi
      .fn(async () => context())
      .mockResolvedValueOnce(context())
      .mockResolvedValueOnce({ ...context(), workspaceRevision: 2 });
    await expect(readProjectTeamPreview(actor, target, read)).rejects.toThrow(
      "saved review changed",
    );
  });
});
