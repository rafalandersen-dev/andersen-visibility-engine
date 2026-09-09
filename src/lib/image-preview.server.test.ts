import { afterEach, describe, expect, it, vi } from "vitest";
import { readArticleImagePreview, IMAGE_PREVIEW_TIMEOUT_MS } from "./image-preview.server";
const path = "owner/project/asset/image.png";
afterEach(() => vi.useRealTimers());
describe("private image preview read authorization", () => {
  it.each([
    "victim/project/asset/image.png",
    "owner/../victim/image.png",
    "owner/project/asset/../image.png",
    "https://example.com/image.png",
    "owner/project/asset/image.svg",
    "owner/project/asset/image.png?token=private",
  ])("rejects foreign or noncanonical paths before storage %#", async (value) => {
    const createSignedUrl = vi.fn();
    await expect(readArticleImagePreview("owner", value, { createSignedUrl })).rejects.toThrow(
      "do not have access",
    );
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it("signs only the requested owner's private image for one hour", async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "private-preview" }, error: null });
    await expect(readArticleImagePreview("owner", path, { createSignedUrl })).resolves.toBe(
      "private-preview",
    );
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith(path, 3600);
  });
  it.each([
    { data: null, error: { message: "private" } },
    { data: {}, error: null },
  ])("keeps absent/failed storage replies generic %#", async (result) => {
    await expect(
      readArticleImagePreview("owner", path, {
        createSignedUrl: vi.fn().mockResolvedValue(result),
      }),
    ).rejects.toThrow("preview could not be refreshed");
  });
  it("bounds a hanging read without leaking the storage error", async () => {
    vi.useFakeTimers();
    const result = expect(
      readArticleImagePreview("owner", path, { createSignedUrl: () => new Promise(() => {}) }),
    ).rejects.toThrow("preview could not be refreshed");
    await vi.advanceTimersByTimeAsync(IMAGE_PREVIEW_TIMEOUT_MS + 1);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
