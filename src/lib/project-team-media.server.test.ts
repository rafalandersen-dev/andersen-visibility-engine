import { TeamVerificationMismatchError } from "./project-team-verification";
import { TeamAdmissionBusyError } from "./project-team-admission";
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
  acquire: vi.fn(async () => owner),
  release: vi.fn(async () => {}),
  storageOrigin,
  read: vi.fn(async () => context(image)),
  download: vi.fn(async () => new Blob([bytes])),
});
describe("scoped collaborator media", () => {
  it.each([false, true])(
    "preserves workspace contention and releases media admission: afterDownload=%s",
    async (afterDownload) => {
      const d = deps();
      if (afterDownload) d.read.mockResolvedValueOnce(context());
      d.read.mockRejectedValueOnce(new TeamAdmissionBusyError());
      await expect(readProjectTeamMedia(actor, input, d)).rejects.toBeInstanceOf(
        TeamAdmissionBusyError,
      );
      expect(d.release).toHaveBeenCalledWith(actor, owner);
      expect(d.download).toHaveBeenCalledTimes(afterDownload ? 1 : 0);
    },
  );
  it("requires actor admission before private context or storage access", async () => {
    const d = deps();
    d.acquire.mockRejectedValueOnce(new Error("team_media_capacity"));
    await expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow("team_media_capacity");
    expect(d.read).not.toHaveBeenCalled();
    expect(d.download).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "releases admission when actual work finishes: failure=%s",
    async (failure) => {
      const d = deps();
      if (failure) d.download.mockRejectedValueOnce(new Error("unavailable"));
      if (failure) await expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow();
      else await readProjectTeamMedia(actor, input, d);
      expect(d.acquire).toHaveBeenCalledWith(actor);
      expect(d.release).toHaveBeenCalledWith(actor, owner);
      expect(d.acquire.mock.invocationCallOrder[0]).toBeLessThan(
        d.read.mock.invocationCallOrder[0],
      );
    },
  );

  it.each(["external.supabase.co", "external.supabase.in"])(
    "pins an already controlled storage origin %s",
    async (host) => {
      const url = `https://${host}/storage/v1/object/public/article-assets-public/image.png`;
      const d = deps({ id: "im", url });
      const remote = vi.fn(async () => bytes);
      await readProjectTeamMedia(actor, input, { ...d, remote });
      expect(remote).toHaveBeenCalledWith(url, `https://${host}`, expect.any(AbortSignal));
    },
  );
  it("reads a selected image in a 31-image article", async () => {
    const d = deps();
    const ctx = context();
    ctx.asset.images = [
      ...ctx.asset.images!,
      ...Array.from({ length: 30 }, (_, i) => ({ id: `extra${i}` })),
    ] as typeof ctx.asset.images;
    d.read.mockResolvedValue(ctx);
    await expect(readProjectTeamMedia(actor, input, d)).resolves.toHaveProperty("imageId", "im");
  });
  it.each(["featured", "social"] as const)(
    "reads a detached %s from its saved featured record",
    async (kind) => {
      const d = deps();
      const ctx = context();
      ctx.asset.images = [];
      ctx.asset.featuredImage = {
        imageId: "im",
        storagePath: path,
        social: {
          physicalUrl: `${storageOrigin}/storage/v1/object/public/article-assets-public/${path}`,
        },
      } as typeof ctx.asset.featuredImage;
      d.read.mockResolvedValue(ctx);
      await expect(readProjectTeamMedia(actor, { ...input, kind }, d)).resolves.toHaveProperty(
        "imageId",
        "im",
      );
      expect(d.download).toHaveBeenCalledTimes(1);
    },
  );
  it("returns validated bytes without private paths, credentials or project data", async () => {
    const d = deps();
    const result = await readProjectTeamMedia(actor, input, d);
    expect(d.download).toHaveBeenCalledWith("article-assets-private", path);
    expect(d.read).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
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
  it("reads the saved social object rather than substituting the hero bytes", async () => {
    const d = deps();
    const ctx = context();
    const socialPath = `${owner}/p/a/social.png`;
    ctx.asset.featuredImage = {
      imageId: "im",
      storagePath: path,
      social: {
        physicalUrl: `${storageOrigin}/storage/v1/object/public/article-assets-public/${socialPath}`,
      },
    } as typeof ctx.asset.featuredImage;
    d.read.mockResolvedValue(ctx);
    await readProjectTeamMedia(actor, { ...input, kind: "social" }, d);
    expect(d.download).toHaveBeenCalledWith("article-assets-public", socialPath);
    ctx.asset.featuredImage!.social!.physicalUrl = `${storageOrigin}/storage/v1/object/public/article-assets-public/${owner}/other/a/social.png`;
    d.download.mockClear();
    await expect(readProjectTeamMedia(actor, { ...input, kind: "social" }, d)).rejects.toThrow();
    expect(d.download).not.toHaveBeenCalled();
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
    const fetcher = vi.fn(async () => bytes);
    const result = await readProjectTeamMedia(actor, input, {
      ...d,
      remote: fetcher,
    });
    expect(result.contentType).toBe("image/png");
    expect(d.download).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledWith(
      "https://client.example/image.png",
      "https://client.example",
      expect.any(AbortSignal),
    );
  });
  it("honors a rejected pinned fetch", async () => {
    const d = deps({ id: "im", url: "https://client.example/image.png" });
    const fetcher = vi.fn(async () => null);
    await expect(readProjectTeamMedia(actor, input, { ...d, remote: fetcher })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized public streams even without a declared length", async () => {
    const d = deps({ id: "im", url: "https://client.example/image.png" });
    const fetcher = vi.fn(async () => new Uint8Array(5 * 1024 * 1024 + 1));
    await expect(readProjectTeamMedia(actor, input, { ...d, remote: fetcher })).rejects.toThrow();
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
      let complete!: (blob: Blob) => void;
      d.download.mockImplementation(
        () =>
          new Promise<Blob>((resolve) => {
            complete = resolve;
          }),
      );
      const pending = expect(readProjectTeamMedia(actor, input, d)).rejects.toThrow(
        "project image could not be confirmed",
      );
      await vi.advanceTimersByTimeAsync(10000);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
      expect(d.release).not.toHaveBeenCalled();
      complete(new Blob([bytes]));
      await vi.advanceTimersByTimeAsync(0);
      expect(d.release).toHaveBeenCalledWith(actor, owner);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("loads the exact stored legacy image ID through the scoped reader", async () => {
  const id = "bad id)with paren";
  const d = deps({ id, url: "https://client.example/image.png" });
  const remote = vi.fn(async () => bytes);
  const result = await readProjectTeamMedia(actor, { ...input, imageId: id }, { ...d, remote });
  expect(result.imageId).toBe(id);
  expect(remote).toHaveBeenCalledOnce();
});

it.each(["?download=1#image", "?width=300&quality=80"])(
  "verifies the exact scoped public representation %s",
  async (suffix) => {
    const url = `${storageOrigin}/storage/v1/object/public/article-assets-public/${path}${suffix}`;
    const d = deps({ id: "im", url });
    const remote = vi.fn(async () => bytes);
    await readProjectTeamMedia(actor, input, { ...d, remote });
    expect(remote).toHaveBeenCalledWith(url.split("#")[0], storageOrigin, expect.any(AbortSignal));
    expect(d.download).not.toHaveBeenCalled();
    const bad = deps({ id: "im", url: url.replace("/p/", "/other/") });
    remote.mockClear();
    await expect(readProjectTeamMedia(actor, input, { ...bad, remote })).rejects.toThrow();
    expect(remote).not.toHaveBeenCalled();
    expect(bad.download).not.toHaveBeenCalled();
  },
);
it("ignores a fragment on a scoped public storage object", async () => {
  const d = deps({
    id: "im",
    url: `${storageOrigin}/storage/v1/object/public/article-assets-public/${path}#image`,
  });
  await readProjectTeamMedia(actor, input, d);
  expect(d.download).toHaveBeenCalledWith("article-assets-public", path);
});

it("distinguishes confirmed image changes from unavailable image bytes", async () => {
  const changed = deps();
  changed.read.mockResolvedValue({ ...context(), draftHash: "b".repeat(64) });
  await expect(readProjectTeamMedia(actor, input, changed)).rejects.toBeInstanceOf(
    TeamVerificationMismatchError,
  );
  const unavailable = deps();
  unavailable.download.mockRejectedValueOnce(new Error("private storage outage"));
  await expect(readProjectTeamMedia(actor, input, unavailable)).rejects.not.toBeInstanceOf(
    TeamVerificationMismatchError,
  );
  const remote = deps({
    id: "im",
    url:
      "https://project.supabase.co/storage/v1/object/public/article-assets-public/" +
      owner +
      "/p/a/im.png?representation=1",
  });
  await expect(
    readProjectTeamMedia(actor, input, { ...remote, remote: vi.fn(async () => null) }),
  ).rejects.not.toBeInstanceOf(TeamVerificationMismatchError);
});
