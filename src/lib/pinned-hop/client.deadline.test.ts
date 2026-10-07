/** CD regression: the app-local monotonic deadline is checked explicitly; late matching data is refused. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHomepageViaPinnedHop,
  PINNED_HOP_DEFAULT_BUDGET_MS,
  type PinnedHopConfig,
} from "./client.server";
import {
  HOP_LABELS,
  HOP_SIGNATURE_HEADER,
  importHopKey,
  signHop,
  toBase64,
  utf8,
} from "./protocol";
import { HOMEPAGE_TIMEOUT_MS } from "../homepage-fetch.server";

const KEY = "fixture-only-key-not-a-secret-0123456789abcdef";
type Step = "challenge" | "hop";
/** A correctly signed fake service. `clock` is advanced at the moment a reply is produced. */
async function fakeService(opts: {
  clock: { now: number };
  at?: Partial<Record<Step, number>>;
  reply?: (sent: Record<string, unknown>) => Record<string, unknown>;
}) {
  const key = await importHopKey(KEY);
  const calls: Step[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const step: Step = String(url).endsWith("/v1/challenge") ? "challenge" : "hop";
    calls.push(step);
    const sent = JSON.parse(await new Response(init?.body).text());
    const body =
      step === "challenge"
        ? {
            v: 1,
            clientNonce: sent.clientNonce,
            incarnation: "a".repeat(32),
            nonce: "b".repeat(32),
          }
        : (
            opts.reply ??
            (() => ({
              kind: "response",
              status: 200,
              headers: { "content-type": "text/html" },
              contentAccepted: true,
              truncated: false,
              bodyB64: toBase64("Valid page"),
            }))
          )(sent);
    const full =
      step === "hop"
        ? { v: 1, requestId: sent.requestId, hop: sent.hop, nonce: sent.nonce, ...body }
        : body;
    const bytes = utf8(JSON.stringify(full));
    const signature = await signHop(
      key,
      step === "challenge" ? HOP_LABELS.challengeResponse : HOP_LABELS.hopResponse,
      bytes,
    );
    if (opts.at?.[step] !== undefined) opts.clock.now = opts.at[step]!;
    return new Response(bytes, { headers: { [HOP_SIGNATURE_HEADER]: signature } });
  });
  return { fetchImpl, calls };
}
function config(
  clock: { now: number },
  fetchImpl: PinnedHopConfig["fetchImpl"],
  extra: Partial<PinnedHopConfig> = {},
): PinnedHopConfig {
  return {
    endpoint: "https://fixture.invalid",
    key: KEY,
    now: () => clock.now,
    fetchImpl,
    resolve: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    ...extra,
  };
}

describe("caller budget is the existing 8 s homepage budget", () => {
  it("defaults to HOMEPAGE_TIMEOUT_MS", () => {
    expect(HOMEPAGE_TIMEOUT_MS).toBe(8000);
    expect(PINNED_HOP_DEFAULT_BUDGET_MS).toBe(HOMEPAGE_TIMEOUT_MS);
  });
  it.each([9000, 8001, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses budget %s before any network (only shortening is allowed)",
    async (budgetMs) => {
      const clock = { now: 0 };
      const { fetchImpl } = await fakeService({ clock });
      const cfg = config(clock, fetchImpl, { budgetMs });
      await expect(fetchHomepageViaPinnedHop("https://probe-target.test/", cfg)).rejects.toThrow(
        "hop_budget_invalid",
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(cfg.resolve).not.toHaveBeenCalled();
    },
  );
});

describe("late data is refused at every asynchronous boundary", () => {
  it("refuses a matching, correctly signed hop result that arrives after the deadline", async () => {
    const clock = { now: 0 };
    const { fetchImpl, calls } = await fakeService({ clock, at: { hop: 10_000 } });
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toEqual({ html: "", code: "timeout", retryable: true, hops: 1 });
    expect(calls).toEqual(["challenge", "hop"]); // one attempt, no retry
  });
  it("boundary: accepted at 7 999 ms, refused at exactly 8 000 ms", async () => {
    for (const [at, code] of [
      [7_999, "ok"],
      [8_000, "timeout"],
    ] as const) {
      const clock = { now: 0 };
      const { fetchImpl } = await fakeService({ clock, at: { hop: at } });
      expect(
        (await fetchHomepageViaPinnedHop("https://probe-target.test/", config(clock, fetchImpl)))
          .code,
      ).toBe(code);
    }
  });
  it("never uses a late challenge: no hop is dispatched", async () => {
    const clock = { now: 0 };
    const { fetchImpl, calls } = await fakeService({ clock, at: { challenge: 8_500 } });
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toMatchObject({ html: "", code: "timeout", retryable: true });
    expect(calls).toEqual(["challenge"]);
  });
  it("refuses a late redirect without resolving or dispatching the next hop", async () => {
    const clock = { now: 0 };
    const { fetchImpl, calls } = await fakeService({
      clock,
      at: { hop: 9_000 },
      reply: () => ({ kind: "redirect", status: 302, location: "https://next.test/" }),
    });
    const cfg = config(clock, fetchImpl);
    const out = await fetchHomepageViaPinnedHop("https://probe-target.test/", cfg);
    expect(out).toMatchObject({ code: "timeout", hops: 1 });
    expect(cfg.resolve).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["challenge", "hop"]);
  });
  it("refuses to dispatch when DNS resolution itself ends after the deadline", async () => {
    const clock = { now: 0 };
    const { fetchImpl } = await fakeService({ clock });
    const cfg = config(clock, fetchImpl, {
      resolve: async () => {
        clock.now = 8_200;
        return [{ address: "93.184.216.34", family: 4 }];
      },
    });
    expect(await fetchHomepageViaPinnedHop("https://probe-target.test/", cfg)).toMatchObject({
      code: "timeout",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("in-budget success across a redirect within 8 s", async () => {
    const clock = { now: 0 };
    let n = 0;
    const { fetchImpl } = await fakeService({
      clock,
      reply: () => {
        clock.now += 1_500;
        return n++ === 0
          ? { kind: "redirect", status: 301, location: "https://probe-target.test/home" }
          : {
              kind: "response",
              status: 200,
              headers: { "content-type": "text/html" },
              contentAccepted: true,
              truncated: false,
              bodyB64: toBase64("Valid page"),
            };
      },
    });
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toEqual({ html: "Valid page", code: "ok", retryable: false, hops: 2 });
  });
  it("never asks the service for more than the remaining caller budget", async () => {
    const clock = { now: 0 };
    let maxMs = 0;
    const { fetchImpl } = await fakeService({
      clock,
      reply: (sent) => {
        maxMs = Number(sent.maxMs);
        return {
          kind: "response",
          status: 200,
          headers: { "content-type": "text/html" },
          contentAccepted: true,
          truncated: false,
          bodyB64: toBase64("x"),
        };
      },
    });
    await fetchHomepageViaPinnedHop("https://probe-target.test/", config(clock, fetchImpl));
    expect(maxMs).toBeLessThanOrEqual(HOMEPAGE_TIMEOUT_MS - 750);
  });
});

describe("CD2: signing is an asynchronous boundary — no dispatch after expiry", () => {
  afterEach(() => vi.restoreAllMocks());
  /** Advance the injected clock when the CLIENT's genuine WebCrypto signature for
   * `label` completes (identified by the framed label, not by call order, because
   * the fake service signs its replies with the same API). */
  function advanceOnSign(clock: { now: number }, label: string, to: number) {
    const original = crypto.subtle.sign.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "sign").mockImplementation(
      async (...args: Parameters<SubtleCrypto["sign"]>) => {
        const result = await original(...args);
        const data = new Uint8Array(args[2] as ArrayBuffer);
        if (new TextDecoder().decode(data.subarray(0, label.length + 1)) === label + "\n")
          clock.now = to;
        return result;
      },
    );
  }
  it("expiry during challenge signing: zero challenge (and zero hop) dispatches", async () => {
    const clock = { now: 0 };
    const { fetchImpl } = await fakeService({ clock });
    advanceOnSign(clock, HOP_LABELS.challengeRequest, 10_000);
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toMatchObject({ html: "", code: "timeout", retryable: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("expiry during hop-request signing: zero hop dispatches", async () => {
    const clock = { now: 0 };
    const { fetchImpl, calls } = await fakeService({ clock });
    advanceOnSign(clock, HOP_LABELS.hopRequest, 10_000);
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toMatchObject({ html: "", code: "timeout", retryable: true });
    expect(calls).toEqual(["challenge"]);
  });
  it("signing that consumes more than its allowance (still before the deadline) does not dispatch or extend", async () => {
    const clock = { now: 0 };
    const { fetchImpl, calls } = await fakeService({ clock });
    advanceOnSign(clock, HOP_LABELS.hopRequest, 300); // 300 ms > 250 ms allowance, deadline is 8 000
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toMatchObject({ code: "timeout" });
    expect(calls).toEqual(["challenge"]);
  });
  it("quick signing within the allowance dispatches once and succeeds; the signed maxMs fits what remains", async () => {
    const clock = { now: 0 };
    let maxMs = 0;
    const { fetchImpl, calls } = await fakeService({
      clock,
      reply: (sent) => {
        maxMs = Number(sent.maxMs);
        return {
          kind: "response",
          status: 200,
          headers: { "content-type": "text/html" },
          contentAccepted: true,
          truncated: false,
          bodyB64: toBase64("Valid page"),
        };
      },
    });
    advanceOnSign(clock, HOP_LABELS.hopRequest, 200); // within the 250 ms allowance
    const out = await fetchHomepageViaPinnedHop(
      "https://probe-target.test/",
      config(clock, fetchImpl),
    );
    expect(out).toMatchObject({ code: "ok", html: "Valid page" });
    expect(calls).toEqual(["challenge", "hop"]);
    expect(maxMs).toBe(HOMEPAGE_TIMEOUT_MS - 750 - 250);
    expect(maxMs).toBeLessThanOrEqual(HOMEPAGE_TIMEOUT_MS - 200 - 750);
  });
  it("budget used up during key import: no DNS and no dispatch", async () => {
    const clock = { now: 0 };
    const { fetchImpl } = await fakeService({ clock });
    const original = crypto.subtle.importKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "importKey").mockImplementation(
      async (...args: Parameters<SubtleCrypto["importKey"]>) => {
        const key = await (original as (...a: unknown[]) => Promise<CryptoKey>)(...args);
        clock.now = 8_500;
        return key;
      },
    );
    const cfg = config(clock, fetchImpl);
    expect(await fetchHomepageViaPinnedHop("https://probe-target.test/", cfg)).toMatchObject({
      code: "timeout",
    });
    expect(cfg.resolve).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
