/** CC pinned-hop service: real loopback HTTP server, injected fake hop (no outbound connection). */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinnedHopService, type PinnedHopServiceOptions } from "./service.server";
import {
  HOP_LABELS,
  HOP_SIGNATURE_HEADER,
  hopResponseSchema,
  importHopKey,
  randomHex16,
  signHop,
  utf8,
  verifyHop,
} from "./protocol";
import type { PinnedHomepageHop } from "../homepage-fetch.server";

const FIXTURE_KEY = "fixture-only-key-not-a-secret-0123456789abcdef";
const OTHER_KEY = "fixture-only-other-key-not-a-secret-0123456789";
const servers: Server[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});
async function start(extra: Partial<PinnedHopServiceOptions> = {}) {
  const key = await importHopKey(FIXTURE_KEY);
  const hop = vi.fn<NonNullable<PinnedHopServiceOptions["hop"]>>(
    async (): Promise<PinnedHomepageHop> => ({
      kind: "response",
      status: 200,
      headers: { "content-type": "text/html" },
      contentAccepted: true,
      truncated: false,
      body: "<title>Fixture</title>",
    }),
  );
  const service = createPinnedHopService({ key, hop, ...extra });
  const server = createServer((req, res) => void service.handle(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { key, hop, service, base };
}
async function post(
  base: string,
  path: string,
  body: Uint8Array<ArrayBuffer>,
  signature?: string | null,
) {
  return fetch(base + path, {
    method: "POST",
    headers: signature ? { [HOP_SIGNATURE_HEADER]: signature } : {},
    body,
  });
}
async function challenge(base: string, key: CryptoKey) {
  const clientNonce = randomHex16();
  const body = utf8(JSON.stringify({ v: 1, purpose: "homepage", clientNonce }));
  const res = await post(
    base,
    "/v1/challenge",
    body,
    await signHop(key, HOP_LABELS.challengeRequest, body),
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(res.status).toBe(200);
  expect(
    await verifyHop(
      key,
      HOP_LABELS.challengeResponse,
      bytes,
      res.headers.get(HOP_SIGNATURE_HEADER),
    ),
  ).toBe(true);
  return JSON.parse(new TextDecoder().decode(bytes)) as { incarnation: string; nonce: string };
}
function hopBody(
  issued: { incarnation: string; nonce: string },
  extra: Record<string, unknown> = {},
) {
  return utf8(
    JSON.stringify({
      v: 1,
      requestId: crypto.randomUUID(),
      hop: 0,
      purpose: "homepage",
      url: "https://probe-target.test/",
      address: "93.184.216.34",
      family: 4,
      maxMs: 2000,
      incarnation: issued.incarnation,
      nonce: issued.nonce,
      ...extra,
    }),
  );
}
async function hop(base: string, key: CryptoKey, body: Uint8Array<ArrayBuffer>) {
  return post(base, "/v1/hop", body, await signHop(key, HOP_LABELS.hopRequest, body));
}

describe("authentication", () => {
  it("refuses unsigned and wrongly signed challenges and hops without calling the hop", async () => {
    const { base, key, hop: spy } = await start();
    const body = utf8(JSON.stringify({ v: 1, purpose: "homepage", clientNonce: randomHex16() }));
    expect((await post(base, "/v1/challenge", body)).status).toBe(401);
    const other = await importHopKey(OTHER_KEY);
    expect(
      (
        await post(
          base,
          "/v1/challenge",
          body,
          await signHop(other, HOP_LABELS.challengeRequest, body),
        )
      ).status,
    ).toBe(401);
    // A challenge-request signature is not valid as a hop signature (distinct labels).
    const issued = await challenge(base, key);
    const h = hopBody(issued);
    expect(
      (await post(base, "/v1/hop", h, await signHop(key, HOP_LABELS.challengeRequest, h))).status,
    ).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
  it("happy path returns a signed, bound envelope", async () => {
    const { base, key, hop: spy } = await start();
    const issued = await challenge(base, key);
    const body = hopBody(issued);
    const res = await hop(base, key, body);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(
      await verifyHop(key, HOP_LABELS.hopResponse, bytes, res.headers.get(HOP_SIGNATURE_HEADER)),
    ).toBe(true);
    const env = hopResponseSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    const sent = JSON.parse(new TextDecoder().decode(body));
    expect(env).toMatchObject({
      kind: "response",
      requestId: sent.requestId,
      hop: 0,
      nonce: issued.nonce,
    });
    expect(spy).toHaveBeenCalledExactlyOnceWith(
      "https://probe-target.test/",
      { address: "93.184.216.34", family: 4 },
      expect.any(AbortSignal),
    );
  });
});

describe("replay invariant: single-use nonce per process incarnation (no timestamps)", () => {
  it("refuses a replayed hop request in the same process", async () => {
    const { base, key, hop: spy } = await start();
    const body = hopBody(await challenge(base, key));
    expect((await hop(base, key, body)).status).toBe(200);
    expect((await hop(base, key, body)).status).toBe(409);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("redeems a nonce exactly once under concurrent redemption", async () => {
    const { base, key, hop: spy } = await start();
    const issued = await challenge(base, key);
    const [a, b] = await Promise.all([
      hop(base, key, hopBody(issued)),
      hop(base, key, hopBody(issued)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("after a restart (new incarnation) refuses every earlier signed request, whatever the clock says", async () => {
    const first = await start();
    const body = hopBody(await challenge(first.base, first.key));
    const restarted = await start();
    expect(restarted.service.incarnation).not.toBe(first.service.incarnation);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01T00:00:00Z")); // future wall clock is irrelevant
    expect((await hop(restarted.base, restarted.key, body)).status).toBe(409);
    expect(restarted.hop).not.toHaveBeenCalled();
  });
  it("expires unredeemed nonces on the service's monotonic clock and caps pending challenges", async () => {
    let t = 0;
    const s = await start({ now: () => t, challengeTtlMs: 1000, maxPending: 2 });
    const issued = await challenge(s.base, s.key);
    await challenge(s.base, s.key);
    const body = utf8(JSON.stringify({ v: 1, purpose: "homepage", clientNonce: randomHex16() }));
    expect(
      (
        await post(
          s.base,
          "/v1/challenge",
          body,
          await signHop(s.key, HOP_LABELS.challengeRequest, body),
        )
      ).status,
    ).toBe(503);
    t = 5000;
    expect((await hop(s.base, s.key, hopBody(issued))).status).toBe(409);
    expect(s.hop).not.toHaveBeenCalled();
    expect(s.service.stats().pending).toBe(0);
  });
});

describe("bounds and refusals before any outbound connection", () => {
  it("refuses an oversized request body without parsing it", async () => {
    const { base, key, hop: spy } = await start();
    const big = utf8(JSON.stringify({ pad: "x".repeat(20_000) }));
    expect(
      (await post(base, "/v1/hop", big, await signHop(key, HOP_LABELS.hopRequest, big))).status,
    ).toBe(413);
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([{ admission: "token" }, { admit: true }, { purpose: "technical" }])(
    "refuses admission/technical context %j before redemption and connection",
    async (extra) => {
      const { base, key, hop: spy, service } = await start();
      const issued = await challenge(base, key);
      const res = await hop(base, key, hopBody(issued, extra));
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ code: "technical_unsupported" });
      expect(spy).not.toHaveBeenCalled();
      expect(service.stats().inFlight).toBe(0);
    },
  );
  it("refuses unknown fields and out-of-range hop/maxMs", async () => {
    const { base, key, hop: spy } = await start();
    for (const extra of [{ unexpected: 1 }, { hop: 4 }, { maxMs: 60_000 }, { family: 5 }]) {
      const res = await hop(base, key, hopBody(await challenge(base, key), extra));
      expect(res.status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it("health never issues a nonce or performs a hop", async () => {
    const { base, hop: spy, service } = await start();
    const res = await fetch(base + "/healthz");
    expect(await res.json()).toEqual({ ok: true });
    expect(service.stats()).toEqual({ pending: 0, inFlight: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("socket lifetime: slot held until the hop settles; service-local timeout", () => {
  it("keeps the concurrency slot after a client abort until the core has cleaned up", async () => {
    let finish!: () => void;
    const s = await start({
      maxConcurrent: 1,
      hop: () =>
        new Promise<PinnedHomepageHop>((resolve) => {
          finish = () =>
            resolve({
              kind: "response",
              status: 200,
              headers: {},
              contentAccepted: true,
              truncated: false,
              body: "x",
            });
        }),
    });
    const abort = new AbortController();
    const first = await challenge(s.base, s.key);
    const body = hopBody(first);
    const pending = fetch(s.base + "/v1/hop", {
      method: "POST",
      headers: { [HOP_SIGNATURE_HEADER]: await signHop(s.key, HOP_LABELS.hopRequest, body) },
      body,
      signal: abort.signal,
    }).catch(() => null);
    await vi.waitFor(() => expect(s.service.stats().inFlight).toBe(1));
    abort.abort();
    await pending;
    await new Promise((r) => setTimeout(r, 50));
    expect(s.service.stats().inFlight).toBe(1); // client abort is not proof of remote closure
    const busy = await hop(s.base, s.key, hopBody(await challenge(s.base, s.key)));
    expect(hopResponseSchema.parse(await busy.json())).toMatchObject({
      kind: "failed",
      code: "transport_busy",
    });
    finish();
    await vi.waitFor(() => expect(s.service.stats().inFlight).toBe(0));
  });
  it("aborts the hop on the service's own timer and reports timeout", async () => {
    const s = await start({
      hop: (_u, _a, signal) =>
        new Promise<PinnedHomepageHop>((_r, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
        ),
    });
    const res = await hop(s.base, s.key, hopBody(await challenge(s.base, s.key), { maxMs: 600 }));
    expect(hopResponseSchema.parse(await res.json())).toMatchObject({
      kind: "failed",
      code: "timeout",
    });
    expect(s.service.stats().inFlight).toBe(0);
  });
  it("maps core refusals to fixed codes without leaking messages", async () => {
    const s = await start({ hop: async () => Promise.reject(new Error("blocked_address")) });
    const res = await hop(s.base, s.key, hopBody(await challenge(s.base, s.key)));
    expect(hopResponseSchema.parse(await res.json())).toMatchObject({
      kind: "failed",
      code: "blocked_address",
    });
    const t = await start({
      hop: async () => Promise.reject(new Error("ECONNREFUSED 10.0.0.1:443 secret")),
    });
    const text = await (await hop(t.base, t.key, hopBody(await challenge(t.base, t.key)))).text();
    expect(text).toContain('"code":"connect_failed"');
    expect(text).not.toContain("10.0.0.1");
  });
});
