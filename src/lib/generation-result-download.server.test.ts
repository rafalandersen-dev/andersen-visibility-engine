import { afterEach, describe, expect, it, vi } from "vitest";
import { getGenerationImageDownload } from "./generation-result-download.server";
const user = "owner";
const id = "00000000-0000-4000-8000-000000000001";
const image = {
  version: 1,
  kind: "image",
  projectId: "p",
  assetId: "a",
  imageId: "i",
  title: "Saved image",
  concept: "Studio",
  output: { path: "owner/p/a/image.webp", alt: "Product" },
};
const reader = (result: unknown = image) =>
  vi.fn().mockResolvedValue({ id, createdAt: "2026-09-09T10:00:00Z", result });
const signer = (signedUrl = "https://storage.example/signed/image?token=private") => ({
  createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl }, error: null }),
});
afterEach(() => vi.useRealTimers());
describe("private saved image downloads", () => {
  it("reads only the authenticated owner's receipt and signs its private path for 60 seconds", async () => {
    const read = reader(),
      storage = signer();
    const result = await getGenerationImageDownload(user, id, read, storage);
    expect(read).toHaveBeenCalledExactlyOnceWith(user, id);
    expect(storage.createSignedUrl).toHaveBeenCalledExactlyOnceWith("owner/p/a/image.webp", 60, {
      download: `milo-${id}.webp`,
    });
    expect(result.filename).toBe(`milo-${id}.webp`);
    expect(result.url).toContain("https://storage.example/");
  });
  it.each([
    { ...image, output: { ...image.output, path: "victim/p/a/image.webp" } },
    { ...image, output: { ...image.output, path: "owner/other/a/image.webp" } },
    { ...image, kind: "content" },
    { ...image, approved: true },
  ])("never signs invalid or cross-scope payloads %#", async (payload) => {
    const storage = signer();
    await expect(getGenerationImageDownload(user, id, reader(payload), storage)).rejects.toThrow(
      "could not be downloaded",
    );
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
  it("does not sign missing/discarded receipts or expose read failures", async () => {
    const storage = signer();
    for (const read of [
      vi.fn().mockResolvedValue(null),
      vi.fn().mockRejectedValue(new Error("private database detail")),
    ]) {
      await expect(getGenerationImageDownload(user, id, read, storage)).rejects.toThrow(
        "could not be downloaded",
      );
    }
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
  it.each([
    "http://storage.example/image",
    "https://user:password@storage.example/image",
    "javascript:alert(1)",
    "not a URL",
  ])("rejects an unsafe returned URL %#", async (url) => {
    await expect(getGenerationImageDownload(user, id, reader(), signer(url))).rejects.toThrow(
      "could not be downloaded",
    );
  });
  it("bounds a stalled signature request without retrying", async () => {
    vi.useFakeTimers();
    const storage = { createSignedUrl: vi.fn(() => new Promise<never>(() => {})) };
    const pending = expect(getGenerationImageDownload(user, id, reader(), storage)).rejects.toThrow(
      "could not be downloaded",
    );
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("sanitizes storage failures and clears its timeout", async () => {
    vi.useFakeTimers();
    const storage = {
      createSignedUrl: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "private storage detail" } }),
    };
    await expect(getGenerationImageDownload(user, id, reader(), storage)).rejects.toThrow(
      "could not be downloaded",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
