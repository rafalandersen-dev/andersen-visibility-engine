import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crawlOwnershipChallenge,
  verifyCrawlOwnershipDns,
  OWNERSHIP_DNS_TIMEOUT_MS,
} from "./technical-ownership.server";
const origin = "https://client.example";
const token = "a".repeat(64);
const value = "milo-crawl-verification=" + token;
const fixture = (records: string[][]) => {
  const resolver = { resolveTxt: vi.fn(async () => records), cancel: vi.fn() };
  return { resolver, factory: vi.fn(() => resolver) };
};
afterEach(() => vi.useRealTimers());
describe("bounded DNS crawl ownership proof", () => {
  it("issues a fresh exact-host challenge without network access", () => {
    const a = crawlOwnershipChallenge(origin),
      b = crawlOwnershipChallenge(origin);
    expect(a.name).toBe("_milo-crawl.client.example");
    expect(a.token).toMatch(/^[a-f0-9]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.value).toBe("milo-crawl-verification=" + a.token);
  });
  it("accepts only exact proof in one TXT record and queries the exact host", async () => {
    const d = fixture([["unrelated"], [value.slice(0, 30), value.slice(30)]]);
    expect(await verifyCrawlOwnershipDns(origin, token, { resolver: d.factory })).toBe(true);
    expect(d.resolver.resolveTxt).toHaveBeenCalledExactlyOnceWith("_milo-crawl.client.example");
    expect(d.resolver.cancel).toHaveBeenCalledOnce();
    for (const records of [
      [[value + "suffix"]],
      [[value.toUpperCase()]],
      [[value.slice(0, 30)], [value.slice(30)]],
      [],
    ]) {
      const f = fixture(records);
      expect(await verifyCrawlOwnershipDns(origin, token, { resolver: f.factory })).toBe(false);
    }
  });
  it.each([
    "https://127.0.0.1",
    "https://8.8.8.8",
    "https://[2606:4700:4700::1111]",
    "https://client.example/path",
    "https://user@client.example",
    "https://client.example.",
    "https://host.internal",
    "https://bad_host.example",
  ])("rejects invalid proof scope before DNS: %s", async (scope) => {
    const d = fixture([[value]]);
    expect(await verifyCrawlOwnershipDns(scope, token, { resolver: d.factory })).toBe(false);
    expect(d.factory).not.toHaveBeenCalled();
  });
  it("does not accept a valid record from an oversized result", async () => {
    for (const records of [
      [[value], ...Array.from({ length: 64 }, () => ["x"])],
      [[value], ["x".repeat(256)]],
      [[value], Array.from({ length: 17 }, () => "x")],
      [[value], ...Array.from({ length: 40 }, () => ["x".repeat(255)])],
    ]) {
      const d = fixture(records);
      expect(await verifyCrawlOwnershipDns(origin, token, { resolver: d.factory })).toBe(false);
    }
  });
  it("bounds an ignored cancellation and refuses late results", async () => {
    vi.useFakeTimers();
    let finish!: (value: string[][]) => void;
    const resolver = {
      resolveTxt: vi.fn(
        () =>
          new Promise<string[][]>((r) => {
            finish = r;
          }),
      ),
      cancel: vi.fn(),
    };
    const result = verifyCrawlOwnershipDns(origin, token, { resolver: () => resolver });
    await vi.advanceTimersByTimeAsync(OWNERSHIP_DNS_TIMEOUT_MS);
    expect(await result).toBe(false);
    expect(resolver.cancel).toHaveBeenCalled();
    finish([[value]]);
  });
  it("supports parent cancellation without querying after an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const d = fixture([[value]]);
    expect(
      await verifyCrawlOwnershipDns(origin, token, {
        resolver: d.factory,
        signal: controller.signal,
      }),
    ).toBe(false);
    expect(d.factory).not.toHaveBeenCalled();
  });
  it("cancels an in-flight proof without waiting for DNS", async () => {
    const controller = new AbortController();
    const resolver = {
      resolveTxt: vi.fn(() => new Promise<string[][]>(() => {})),
      cancel: vi.fn(),
    };
    const result = verifyCrawlOwnershipDns(origin, token, {
      resolver: () => resolver,
      signal: controller.signal,
    });
    controller.abort();
    expect(await result).toBe(false);
    expect(resolver.cancel).toHaveBeenCalled();
  });
  it("rejects a malformed challenge without asking DNS", async () => {
    const d = fixture([[value]]);
    expect(await verifyCrawlOwnershipDns(origin, "not-a-challenge", { resolver: d.factory })).toBe(
      false,
    );
    expect(d.factory).not.toHaveBeenCalled();
  });
  it("does not return resolver error details", async () => {
    const d = fixture([]);
    d.resolver.resolveTxt.mockRejectedValueOnce(new Error("private resolver detail"));
    expect(await verifyCrawlOwnershipDns(origin, token, { resolver: d.factory })).toBe(false);
    expect(d.resolver.cancel).toHaveBeenCalledOnce();
  });
});
