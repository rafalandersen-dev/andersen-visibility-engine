import { afterEach, expect, it, vi } from "vitest";
import { waitForPinnedHopReadiness } from "./readiness.server";
import { fetchHomepageViaPinnedHop, pinnedHopConfigFromEnv } from "./client.server";
import {
  HOP_LABELS,
  HOP_SIGNATURE_HEADER,
  importHopKey,
  signHop,
  toBase64,
  utf8,
} from "./protocol";
const KEY = "fixture-only-key-not-a-secret-0123456789abcdef";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("automatically waits through a cold host, then performs exactly one signed destination hop", async () => {
  vi.useFakeTimers();
  const started = Date.now();
  const key = await importHopKey(KEY);
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/healthz")) {
      expect(init?.headers).toEqual({ accept: "application/json" });
      return Date.now() - started < 30_000
        ? new Response("", { status: 503 })
        : Response.json({ ok: true });
    }
    const sent = JSON.parse(await new Response(init?.body).text());
    const challenge = String(url).endsWith("/v1/challenge");
    const body = utf8(
      JSON.stringify(
        challenge
          ? {
              v: 1,
              clientNonce: sent.clientNonce,
              incarnation: "a".repeat(32),
              nonce: "b".repeat(32),
            }
          : {
              v: 1,
              requestId: sent.requestId,
              hop: sent.hop,
              nonce: sent.nonce,
              kind: "response",
              status: 200,
              headers: { "content-type": "text/html" },
              contentAccepted: true,
              truncated: false,
              bodyB64: toBase64("<h1>Retained source</h1>"),
            },
      ),
    );
    return new Response(body, {
      headers: {
        [HOP_SIGNATURE_HEADER]: await signHop(
          key,
          challenge ? HOP_LABELS.challengeResponse : HOP_LABELS.hopResponse,
          body,
        ),
      },
    });
  });
  const config = {
    endpoint: "https://transport.test",
    key,
    fetchImpl,
    resolve: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    now: () => Date.now(),
    startupBudgetMs: 70_000,
  };
  const pending = fetchHomepageViaPinnedHop("https://source.test", config);
  await vi.advanceTimersByTimeAsync(40_000);
  expect(await pending).toMatchObject({ code: "ok", html: "<h1>Retained source</h1>" });
  expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
    ...Array(3).fill("https://transport.test/healthz"),
    "https://transport.test/v1/challenge",
    "https://transport.test/v1/hop",
  ]);
  expect(config.resolve).toHaveBeenCalledTimes(1);
});

it("bounds a stalled host to four readiness probes and never dispatches a homepage", async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Promise<Response>(() => {}));
  const pending = fetchHomepageViaPinnedHop("https://source.test", {
    endpoint: "https://transport.test",
    key: KEY,
    fetchImpl,
    startupBudgetMs: 70_000,
    now: () => Date.now(),
  });
  await vi.advanceTimersByTimeAsync(70_000);
  expect(await pending).toMatchObject({ code: "transport_unavailable", hops: 0 });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(fetchImpl.mock.calls.every((c) => String(c[0]).endsWith("/healthz"))).toBe(true);
});

it.each([301, 401, 403, 404])("does not retry a readiness refusal %s", async (status) => {
  const fetchImpl = vi.fn(async () => new Response("", { status }));
  expect(
    await waitForPinnedHopReadiness({
      endpoint: "https://transport.test",
      startupBudgetMs: 70_000,
      fetchImpl,
    }),
  ).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("refuses a late ready response even when the abort timer has not run", async () => {
  let now = 0;
  const fetchImpl = vi.fn(async () => {
    now = 70_000;
    return Response.json({ ok: true });
  });
  expect(
    await waitForPinnedHopReadiness({
      endpoint: "https://transport.test",
      startupBudgetMs: 70_000,
      fetchImpl,
      now: () => now,
    }),
  ).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("bounds malformed and oversized startup responses", async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(async () => new Response("x".repeat(300)));
  const pending = waitForPinnedHopReadiness({
    endpoint: "https://transport.test",
    startupBudgetMs: 70_000,
    fetchImpl,
    now: () => Date.now(),
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await pending).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

it("refuses technical context and invalid startup budgets before readiness", async () => {
  const fetchImpl = vi.fn(fetch);
  const config = {
    endpoint: "https://transport.test",
    key: KEY,
    fetchImpl,
    startupBudgetMs: 70_000,
  };
  await expect(
    fetchHomepageViaPinnedHop("https://source.test", config, { purpose: "technical" }),
  ).rejects.toThrow("technical_unsupported");
  await expect(
    fetchHomepageViaPinnedHop("https://source.test", { ...config, startupBudgetMs: 70_001 }),
  ).rejects.toThrow("hop_startup_budget_invalid");
  expect(await fetchHomepageViaPinnedHop("http://localhost", config)).toMatchObject({
    retryable: false,
    hops: 0,
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("enables bounded readiness for configured production intake only", () => {
  vi.stubEnv("MILO_PINNED_HOP_URL", "https://transport.test");
  vi.stubEnv("MILO_PINNED_HOP_KEY", KEY);
  expect(pinnedHopConfigFromEnv()).toMatchObject({ startupBudgetMs: 70_000 });
});
