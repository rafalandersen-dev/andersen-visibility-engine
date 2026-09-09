import { afterEach, describe, expect, it, vi } from "vitest";
import { extractBrandDocument } from "./brand-document.client";
const file = () => new File(["%PDF-synthetic"], "guidelines.pdf");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function workerFixture(action: "success" | "error" | "throw" | "wait") {
  const terminate = vi.fn();
  class FixtureWorker {
    onmessage?: (event: unknown) => void;
    onerror?: () => void;
    onmessageerror?: () => void;
    terminate = terminate;
    postMessage() {
      if (action === "throw") throw new Error("transfer failed");
      if (action === "error") this.onerror?.();
      if (action === "success")
        this.onmessage?.({
          data: {
            ok: true,
            result: {
              kind: "pdf",
              segments: [{ locator: "Page 1", text: "Warm" }],
              warnings: ["text_only"],
            },
          },
        });
    }
  }
  vi.stubGlobal("Worker", FixtureWorker);
  return { terminate };
}
describe("disposable document parser lifecycle", () => {
  it("clears the worker and timer after a successful extraction", async () => {
    vi.useFakeTimers();
    const worker = workerFixture("success");
    expect((await extractBrandDocument(file())).segments[0].text).toBe("Warm");
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["error", "throw"] as const)(
    "cleans up after %s without leaving a timeout",
    async (action) => {
      vi.useFakeTimers();
      const worker = workerFixture(action);
      await expect(extractBrandDocument(file())).rejects.toThrow();
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("terminates a stuck worker after the fixed deadline", async () => {
    vi.useFakeTimers();
    const worker = workerFixture("wait");
    const pending = expect(extractBrandDocument(file())).rejects.toThrow("brand_document_timeout");
    // Hashing is native asynchronous work; allow it to finish before advancing
    // the worker timer without relying on a browser or changing its policy.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    await vi.advanceTimersByTimeAsync(20000);
    await pending;
    expect(worker.terminate).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
