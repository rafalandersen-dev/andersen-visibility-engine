import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ a: vi.fn(), aaaa: vi.fn(), cancel: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolve4 = h.a;
    resolve6 = h.aaaa;
    cancel = h.cancel;
  },
}));
import { resolveTechnicalAddresses } from "./technical-dns.server";
beforeEach(() => {
  vi.resetAllMocks();
  h.a.mockResolvedValue(["8.8.8.8"]);
  h.aaaa.mockResolvedValue([]);
});
it("returns both families using its own resolver", async () => {
  h.aaaa.mockResolvedValue(["2606:4700:4700::1111"]);
  expect(await resolveTechnicalAddresses("example.test", new AbortController().signal)).toEqual([
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
  // Both queries settled: nothing is pending, so no cleanup cancel is issued.
  expect(h.cancel).not.toHaveBeenCalled();
});
it("does not start DNS after cancellation", async () => {
  await expect(resolveTechnicalAddresses("example.test", AbortSignal.abort())).rejects.toThrow();
  expect(h.a).not.toHaveBeenCalled();
});
it("cancels pending resolver work before rejecting an aborted lookup", async () => {
  let reject!: (e: Error) => void;
  h.a.mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  h.cancel.mockImplementation(() => reject(new Error("cancelled")));
  const controller = new AbortController();
  const pending = resolveTechnicalAddresses("example.test", controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(h.cancel).toHaveBeenCalled();
});
it("refuses unexpected resolver errors instead of accepting only the other family", async () => {
  h.aaaa.mockRejectedValue({ code: "ETIMEOUT" });
  await expect(
    resolveTechnicalAddresses("example.test", new AbortController().signal),
  ).rejects.toThrow("technical_dns_unavailable");
});
it("permits documented absent-family responses", async () => {
  h.aaaa.mockRejectedValue({ code: "ENODATA" });
  expect(
    await resolveTechnicalAddresses("example.test", new AbortController().signal),
  ).toHaveLength(1);
});

// workerd (Cloudflare) node:dns: A/AAAA lookups work but Resolver.cancel() throws
// "Not implemented" — the exact PR171 runtime failure reproduced in workerd.
const notImplemented = () => {
  throw new Error("Not implemented");
};
const never = () => new Promise<string[]>(() => {});

it("returns a successful answer even where cancel() is unimplemented (old failure)", async () => {
  h.cancel.mockImplementation(notImplemented);
  expect(await resolveTechnicalAddresses("example.test", new AbortController().signal)).toEqual([
    { address: "8.8.8.8", family: 4 },
  ]);
  expect(h.cancel).not.toHaveBeenCalled();
});
it("still rejects promptly on abort when cancel() is unimplemented and queries never settle", async () => {
  h.cancel.mockImplementation(notImplemented);
  h.a.mockImplementation(never);
  h.aaaa.mockImplementation(never);
  const controller = new AbortController();
  const pending = resolveTechnicalAddresses("example.test", controller.signal);
  const reason = new Error("milo_execution_deadline");
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(h.cancel).toHaveBeenCalledOnce();
});
it("honours a deadline signal without relying on cancel()", async () => {
  h.cancel.mockImplementation(notImplemented);
  h.a.mockImplementation(never);
  h.aaaa.mockImplementation(never);
  const started = Date.now();
  await expect(
    resolveTechnicalAddresses("example.test", AbortSignal.timeout(30)),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  expect(Date.now() - started).toBeLessThan(1000);
});
it("reports an unexpected cancel() failure instead of hiding it", async () => {
  h.cancel.mockImplementation(() => {
    throw new Error("resolver state corrupted");
  });
  h.a.mockImplementation(never);
  const controller = new AbortController();
  const pending = resolveTechnicalAddresses("example.test", controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("technical_dns_unavailable");
});
it("leaves no listener, cancel or unhandled rejection behind after a completed lookup", async () => {
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    h.cancel.mockImplementation(notImplemented);
    const controller = new AbortController();
    await resolveTechnicalAddresses("example.test", controller.signal);
    controller.abort();
    // Late query results after an abort are absorbed and never used.
    let settle!: (value: string[]) => void;
    h.a.mockImplementation(() => new Promise<string[]>((resolve) => (settle = resolve)));
    const late = new AbortController();
    const pending = resolveTechnicalAddresses("example.test", late.signal);
    late.abort();
    await expect(pending).rejects.toBeDefined();
    settle(["8.8.4.4"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.cancel).toHaveBeenCalledOnce(); // only for the second, aborted lookup
    expect(unhandled).not.toHaveBeenCalled();
  } finally {
    process.off("unhandledRejection", unhandled);
  }
});
