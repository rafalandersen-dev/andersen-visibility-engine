import { describe, expect, it, vi } from "vitest";
import { serializePublicationWrite } from "./publication-write.server";
describe("concurrent publication outcome recording", () => {
  it("serializes twenty writes for one owner while another owner makes progress", async () => {
    let active = 0,
      maxActive = 0,
      release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes = Array.from({ length: 20 }, (_, index) =>
      serializePublicationWrite("one", async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        if (index === 0) await first;
        await Promise.resolve();
        active--;
        return index;
      }),
    );
    await vi.waitFor(() => expect(active).toBe(1));
    expect(await serializePublicationWrite("two", async () => "recorded")).toBe("recorded");
    release();
    expect(await Promise.all(writes)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(maxActive).toBe(1);
  });
  it("continues after a failed write without rerunning it", async () => {
    const failed = vi.fn(async () => {
      throw new Error("unavailable");
    });
    const first = serializePublicationWrite("one", failed);
    const next = serializePublicationWrite("one", async () => "next");
    await expect(first).rejects.toThrow("unavailable");
    expect(await next).toBe("next");
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
