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
  expect(h.cancel).toHaveBeenCalledOnce();
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
