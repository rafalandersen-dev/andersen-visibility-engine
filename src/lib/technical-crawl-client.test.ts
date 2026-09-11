import { describe, it, expect, vi } from "vitest";
import { processTechnicalCrawl } from "./technical-crawl-client";
const running = { revision: 1, status: "running" };
const noPause = async () => {};
describe("owner-triggered crawl processing", () => {
  it("does not request work when stopped before starting", async () => {
    const step = vi.fn(async () => running);
    await processTechnicalCrawl(step, () => true, noPause, noPause);
    expect(step).not.toHaveBeenCalled();
  });
  it("stops after cancellation during a page without a later step or stale UI callback", async () => {
    let stopped = false;
    const step = vi.fn(async () => {
      stopped = true;
      return running;
    });
    const progress = vi.fn(noPause);
    await processTechnicalCrawl(step, () => stopped, progress, noPause);
    expect(step).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalled();
  });
  it("stops on unchanged leased state", async () => {
    const step = vi.fn(async () => running);
    await processTechnicalCrawl(step, () => false, noPause, noPause);
    expect(step).toHaveBeenCalledTimes(2);
  });
  it.each(["completed", "held", "cancelled", "failed"])("stops on %s", async (status) => {
    const step = vi.fn(async () => ({ revision: 2, status }));
    await processTechnicalCrawl(step, () => false, noPause, noPause);
    expect(step).toHaveBeenCalledTimes(1);
  });
  it("does not replay an uncertain failed request", async () => {
    const step = vi.fn(async () => {
      throw new Error("connection lost");
    });
    await expect(processTechnicalCrawl(step, () => false, noPause, noPause)).rejects.toThrow();
    expect(step).toHaveBeenCalledTimes(1);
  });
  it("bounds an endlessly progressing server", async () => {
    let revision = 0;
    const step = vi.fn(async () => ({ revision: ++revision, status: "running" }));
    await processTechnicalCrawl(step, () => false, noPause, noPause);
    expect(step).toHaveBeenCalledTimes(202);
  });
});
