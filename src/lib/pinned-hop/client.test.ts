/** CC adapter ↔ real loopback service (fake hop, fake DoH resolver). No real site or provider. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinnedHopService, type PinnedHopServiceOptions } from "./service.server";
import {
  fetchHomepageViaPinnedHop,
  pinnedHopConfigFromEnv,
  type PinnedHopConfig,
} from "./client.server";
import { HOP_LABELS, HOP_SIGNATURE_HEADER, importHopKey, signHop, utf8 } from "./protocol";
import type { PinnedHomepageHop } from "../homepage-fetch.server";

const KEY = "fixture-only-key-not-a-secret-0123456789abcdef";
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});
const page = (
  body = "<title>Fixture</title><p>" + "Readable text. ".repeat(10) + "</p>",
): PinnedHomepageHop => ({
  kind: "response",
  status: 200,
  headers: { "content-type": "text/html" },
  contentAccepted: true,
  truncated: false,
  body,
});
async function service(hop: NonNullable<PinnedHopServiceOptions["hop"]>) {
  const svc = createPinnedHopService({ key: await importHopKey(KEY), hop });
  const server = createServer((req, res) => void svc.handle(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function config(endpoint: string, extra: Partial<PinnedHopConfig> = {}): PinnedHopConfig {
  return {
    endpoint,
    key: KEY,
    resolve: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    ...extra,
  };
}

describe("homepage via pinned hop", () => {
  it("returns the page through one vetted pinned hop", async () => {
    const hop = vi.fn(async () => page());
    const cfg = config(await service(hop));
    const out = await fetchHomepageViaPinnedHop("https://probe-target.test", cfg);
    expect(out).toMatchObject({ code: "ok", retryable: false, hops: 1 });
    expect(out.html).toContain("<title>Fixture</title>");
    expect(cfg.resolve).toHaveBeenCalledWith("probe-target.test", expect.any(AbortSignal));
    expect(hop).toHaveBeenCalledWith(
      "https://probe-target.test/",
      { address: "93.184.216.34", family: 4 },
      expect.any(AbortSignal),
    );
  });
  it("vets ALL DNS answers: one private answer refuses before contacting the service", async () => {
    const fetchImpl = vi.fn(fetch);
    const cfg = config("http://127.0.0.1:9", {
      fetchImpl,
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.7", family: 4 },
      ],
    });
    expect(await fetchHomepageViaPinnedHop("https://probe-target.test", cfg)).toMatchObject({
      code: "blocked_address",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("reports DNS failure honestly", async () => {
    const cfg = config("http://127.0.0.1:9", {
      resolve: async () => Promise.reject(new Error("technical_dns_unavailable")),
    });
    expect(await fetchHomepageViaPinnedHop("https://probe-target.test", cfg)).toMatchObject({
      code: "dns_unavailable",
    });
  });
  it("re-resolves and re-vets every redirect hop; refuses a redirect to a private address", async () => {
    const hop = vi
      .fn<NonNullable<PinnedHopServiceOptions["hop"]>>()
      .mockResolvedValueOnce({ kind: "redirect", status: 302, location: "https://inner.test/" });
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "192.168.1.5", family: 4 }]);
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(await service(hop), { resolve }),
    );
    expect(out).toMatchObject({ code: "blocked_address", hops: 2 });
    expect(resolve).toHaveBeenNthCalledWith(2, "inner.test", expect.any(AbortSignal));
    expect(hop).toHaveBeenCalledTimes(1);
  });
  it("refuses HTTPS→HTTP downgrade and redirect chains beyond three redirects", async () => {
    const down = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(
        await service(async () => ({
          kind: "redirect",
          status: 301,
          location: "http://probe-target.test/",
        })),
      ),
    );
    expect(down).toMatchObject({ code: "downgrade_refused" });
    const loopHop = vi.fn(async (): Promise<PinnedHomepageHop> => ({
      kind: "redirect",
      status: 302,
      location: "/again",
    }));
    const loop = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(await service(loopHop)),
    );
    expect(loop).toMatchObject({ code: "redirect_refused", hops: 4 });
    expect(loopHop).toHaveBeenCalledTimes(4);
  });
  it("non-2xx and non-HTML responses yield an empty page with a fixed code", async () => {
    const e = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(await service(async () => ({ ...page(), status: 404 }))),
    );
    expect(e).toMatchObject({ html: "", code: "http_error", retryable: false });
    const c = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(await service(async () => ({ ...page(), contentAccepted: false, body: "" }))),
    );
    expect(c).toMatchObject({ html: "", code: "content_rejected" });
  });
});

describe("honest unavailability, no retry", () => {
  it("an unreachable (cold or stopped) service is retryable and attempted once", async () => {
    const fetchImpl = vi.fn(fetch);
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config("http://127.0.0.1:9", { fetchImpl }),
    );
    expect(out).toMatchObject({ code: "transport_unavailable", retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("a slow cold start ends inside the caller budget as retryable unavailable", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        ),
    );
    const startedAt = Date.now();
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config("http://cold.invalid", { fetchImpl, budgetMs: 300 }),
    );
    expect(out).toMatchObject({ code: "transport_unavailable", retryable: true });
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("a lost hop response is unknown: retryable, never retried, never a success", async () => {
    const base = await service(async () => page());
    let hops = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/v1/hop")) {
        hops++;
        await fetch(input, init); // service performs it…
        throw new TypeError("network lost"); // …but the response never arrives
      }
      return fetch(input, init);
    });
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(base, { fetchImpl }),
    );
    expect(out).toMatchObject({ html: "", code: "transport_unavailable", retryable: true });
    expect(hops).toBe(1);
  });
  it("rejects a late/foreign envelope (correctly signed but bound to another request)", async () => {
    const key = await importHopKey(KEY);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = new Uint8Array(await new Response(init?.body).arrayBuffer());
      const sent = JSON.parse(new TextDecoder().decode(body));
      if (String(input).endsWith("/v1/challenge")) {
        const reply = utf8(
          JSON.stringify({
            v: 1,
            clientNonce: sent.clientNonce,
            incarnation: "a".repeat(32),
            nonce: "b".repeat(32),
          }),
        );
        return new Response(reply, {
          headers: {
            [HOP_SIGNATURE_HEADER]: await signHop(key, HOP_LABELS.challengeResponse, reply),
          },
        });
      }
      const foreign = utf8(
        JSON.stringify({
          v: 1,
          requestId: crypto.randomUUID(),
          hop: 0,
          nonce: "b".repeat(32),
          kind: "failed",
          code: "timeout",
        }),
      );
      return new Response(foreign, {
        headers: { [HOP_SIGNATURE_HEADER]: await signHop(key, HOP_LABELS.hopResponse, foreign) },
      });
    });
    expect(
      await fetchHomepageViaPinnedHop(
        "https://probe-target.test",
        config("http://x.invalid", { fetchImpl }),
      ),
    ).toMatchObject({
      code: "response_invalid",
      retryable: false,
    });
  });
  it("refuses an oversized service response", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(1_600_000)));
    expect(
      await fetchHomepageViaPinnedHop(
        "https://probe-target.test",
        config("http://x.invalid", { fetchImpl }),
      ),
    ).toMatchObject({
      code: "response_invalid",
    });
  });
  it("a wrong shared key is an auth refusal, not retryable", async () => {
    const base = await service(async () => page());
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test",
      config(base, { key: "fixture-only-WRONG-key-not-a-secret-0123456789" }),
    );
    expect(out).toMatchObject({ code: "auth_refused", retryable: false });
    expect(out.html).toBe("");
  });
  it("refuses a short key as a configuration error before any network", async () => {
    const fetchImpl = vi.fn(fetch);
    await expect(
      fetchHomepageViaPinnedHop(
        "https://probe-target.test",
        config("http://x.invalid", { key: "short", fetchImpl }),
      ),
    ).rejects.toThrow("hop_key_too_short");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("technical/admission gate and default-off switch", () => {
  it.each([
    { admit: () => undefined },
    { admission: "t" },
    { authorize: () => true },
    { purpose: "technical" },
  ])("refuses admission/technical context %j before any DNS or network", async (context) => {
    const cfg = config("http://x.invalid", { fetchImpl: vi.fn(fetch) });
    await expect(
      fetchHomepageViaPinnedHop("https://probe-target.test", cfg, context),
    ).rejects.toThrow("technical_unsupported");
    expect(cfg.resolve).not.toHaveBeenCalled();
    expect(cfg.fetchImpl).not.toHaveBeenCalled();
  });
  it("is OFF unless both variables are set and the endpoint is HTTPS", () => {
    vi.stubEnv("MILO_PINNED_HOP_URL", "");
    vi.stubEnv("MILO_PINNED_HOP_KEY", "");
    expect(pinnedHopConfigFromEnv()).toBeNull();
    vi.stubEnv("MILO_PINNED_HOP_URL", "https://hop.example");
    expect(pinnedHopConfigFromEnv()).toBeNull();
    vi.stubEnv("MILO_PINNED_HOP_KEY", "fixture-only-key-not-a-secret-0123456789abcdef");
    vi.stubEnv("MILO_PINNED_HOP_URL", "http://hop.example");
    expect(pinnedHopConfigFromEnv()).toBeNull();
    vi.stubEnv("MILO_PINNED_HOP_URL", "https://hop.example");
    expect(pinnedHopConfigFromEnv()).toMatchObject({ endpoint: "https://hop.example" });
  });
});
