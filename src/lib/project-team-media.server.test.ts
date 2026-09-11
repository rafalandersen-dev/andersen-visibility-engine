import { describe, expect, it, vi } from "vitest";
import { readProjectTeamMedia } from "./project-team-media.server";
import type { readTeamReviewContext } from "./project-team-context.server";
const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002";
const input = {
  ownerId: owner,
  projectId: "p",
  assetId: "a",
  imageId: "im",
  expectedHash: "a".repeat(64),
};
const path = `${owner}/p/a/im.png`;
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
function context(image: Record<string, unknown> = { id: "im", storagePath: path }) {
  return {
    actorId: actor,
    ownerId: owner,
    projectId: "p",
    assetId: "a",
    workspaceRevision: 1,
    membershipRevision: 1,
    draftHash: input.expectedHash,
    project: { id: "p", websiteUrl: "https://client.example", publishSecret: "fixture-private" },
    asset: { id: "a", projectId: "p", images: [image] },
    links: [],
  } as unknown as Awaited<ReturnType<typeof readTeamReviewContext>>;
}
const storageOrigin = "https://project.supabase.co";
const deps = (image?: Record<string, unknown>) => ({
  storageOrigin,
  read: vi.fn(async () => context(image)),
  download: vi.fn(async () => new Blob([bytes])),
});
describe("scoped collaborator media", () => {
  it("returns validated bytes without private paths, credentials or project data", async () => {
    const d = deps();
    const result = await readProjectTeamMedia(actor, input, d);
    expect(d.download).toHaveBeenCalledWith("article-assets-private", path);
    expect(d.read).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      imageId: "im",
      draftHash: input.expectedHash,
      contentType: "image/png",
      base64: Buffer.from(bytes).toString("base64"),
    });
    expect(JSON.stringify(result)).not.toContain(owner);
    expect(JSON.stringify(result)).not.toContain("fixture-private");
  });
  it.each([
    `${actor}/p/a/im.png`,
    `${owner}/q/a/im.png`,
    `${owner}/p/other/im.png`,
    `${owner}/p/a/other.png`,
    `${owner}/p/../im.png`,
  ])("rejects an unrelated private path %s", async (storagePath) => {
    const d = deps({ id: "im", storagePath });
    await expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow();
    expect(d.download).not.toHaveBeenCalled();
  });
  it("supports public reuse only within the owner and assigned project", async () => {
    const publicPath = `${owner}/p/original/original.png`;
    const d = deps({
      id: "im",
      url: `${storageOrigin}/storage/v1/object/public/article-assets-public/${publicPath}`,
    });
    await readProjectTeamMedia(actor, input, d);
    expect(d.download).toHaveBeenCalledWith("article-assets-public", publicPath);
    const bad = deps({
      id: "im",
      url: `${storageOrigin}/storage/v1/object/public/article-assets-public/${owner}/other/a/im.png`,
    });
    await expect(readProjectTeamMedia(actor, input, bad)).rejects.toThrow();
    expect(bad.download).not.toHaveBeenCalled();
  });
  it("rejects browser path overrides and stale draft hashes before downloading", async () => {
    const d = deps();
    await expect(
      readProjectTeamMedia(actor, { ...input, path } as typeof input, d),
    ).rejects.toThrow();
    await expect(
      readProjectTeamMedia(actor, { ...input, expectedHash: "b".repeat(64) }, d),
    ).rejects.toThrow();
    expect(d.download).not.toHaveBeenCalled();
  });
  it("withholds bytes when the draft or membership changes during download", async () => {
    const d = deps();
    d.read
      .mockResolvedValueOnce(context())
      .mockResolvedValueOnce({ ...context(), membershipRevision: 2 });
    await expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow();
    const revoked = deps();
    revoked.read.mockResolvedValueOnce(context()).mockRejectedValueOnce(new Error("revoked"));
    await expect(readProjectTeamMedia(actor, input, revoked)).rejects.toThrow();
  });
  it("rejects non-raster and oversized downloads", async () => {
    const d = deps();
    d.download.mockResolvedValueOnce(new Blob(["<svg/>"]));
    await expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow();
    d.download.mockResolvedValueOnce(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]));
    await expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow();
  });
  it("uses bounded same-site public fetching without credentials", async () => {
    const d = deps({ id: "im", url: "https://client.example/image.png" });
    const fetcher = vi.fn(async () => new Response(bytes));
    const result = await readProjectTeamMedia(actor, input, {
      ...d,
      fetch: fetcher,
      outboundAllowed: () => true,
    });
    expect(result.contentType).toBe("image/png");
    expect(d.download).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith(
      "https://client.example/image.png",
      expect.objectContaining({ redirect: "manual", credentials: "omit" }),
    );
  });
  it("blocks redirects off the project origin and honors disabled outbound transport", async () => {
    const d = deps({ id: "im", url: "https://client.example/image.png" });
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    );
    await expect(
      readProjectTeamMedia(actor, input, { ...d, fetch: fetcher, outboundAllowed: () => true }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    await expect(
      readProjectTeamMedia(actor, input, { ...d, fetch: fetcher, outboundAllowed: () => false }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects oversized public streams even without a declared length", async () => {
    const d = deps({ id: "im", url: "https://client.example/image.png" });
    const fetcher = vi.fn(async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1)));
    await expect(
      readProjectTeamMedia(actor, input, { ...d, fetch: fetcher, outboundAllowed: () => true }),
    ).rejects.toThrow();
  });
  it("loads the saved featured variant instead of a different inline image", async () => {
    const featuredPath = `${owner}/p/a/im.png`;
    const ctx = context({ id: "im", url: "https://client.example/inline.png" });
    ctx.asset.featuredImage = {
      imageId: "im",
      storagePath: featuredPath,
    } as typeof ctx.asset.featuredImage;
    const d = deps();
    d.read.mockResolvedValue(ctx);
    await readProjectTeamMedia(actor, { ...input, kind: "featured" }, d);
    expect(d.download).toHaveBeenCalledWith("article-assets-private", featuredPath);
  });
  it("ends a stalled download without returning paths or keeping the timer", async () => {
    vi.useFakeTimers();
    try {
      const d = deps();
      d.download.mockImplementation(() => new Promise<Blob>(() => {}));
      const pending = expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow(
        "project image could not be confirmed",
      );
      await vi.advanceTimersByTimeAsync(10000);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
