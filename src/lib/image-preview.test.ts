import { describe, expect, it, vi } from "vitest";
import {
  createImagePreviewSession,
  PRIVATE_IMAGE_REFRESH_MS,
  PRIVATE_IMAGE_RETRY_MS,
} from "./image-preview";

describe("private image preview lifecycle", () => {
  it("refreshes before expiry and avoids repeated focus requests while the URL is fresh", async () => {
    let now = 0;
    const apply = vi.fn(),
      load = vi.fn().mockResolvedValue("fresh-url");
    const session = createImagePreviewSession({ load, apply, now: () => now });
    await session.refresh();
    now = PRIVATE_IMAGE_RETRY_MS + 1;
    await session.refresh();
    expect(load).toHaveBeenCalledOnce();
    now = PRIVATE_IMAGE_REFRESH_MS;
    await session.refresh();
    expect(load).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it("allows an image error to renew early but bounds failed-image retry loops", async () => {
    let now = 0;
    const load = vi.fn().mockResolvedValue("fresh"),
      apply = vi.fn();
    const session = createImagePreviewSession({ load, apply, now: () => now });
    await session.refresh(true);
    await session.refresh(true);
    expect(load).toHaveBeenCalledOnce();
    now = PRIVATE_IMAGE_RETRY_MS;
    await session.refresh(true);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not replace a good preview with an empty/failed reply and can recover later", async () => {
    let now = 0;
    const apply = vi.fn();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("private"))
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("recovered");
    const session = createImagePreviewSession({ load, apply, now: () => now });
    await session.refresh();
    now += PRIVATE_IMAGE_RETRY_MS;
    await session.refresh();
    expect(apply).not.toHaveBeenCalled();
    now += PRIVATE_IMAGE_RETRY_MS;
    await session.refresh();
    expect(apply).toHaveBeenCalledExactlyOnceWith("recovered");
  });
  it("never applies a late reply after navigation/unmount or duplicates in-flight reads", async () => {
    let reply!: (url: string) => void;
    const load = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            reply = resolve;
          }),
      ),
      apply = vi.fn();
    const session = createImagePreviewSession({ load, apply });
    const first = session.refresh();
    await session.refresh(true);
    expect(load).toHaveBeenCalledOnce();
    session.dispose();
    reply("old-page-private-url");
    await first;
    await session.refresh(true);
    expect(apply).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
  });
});
