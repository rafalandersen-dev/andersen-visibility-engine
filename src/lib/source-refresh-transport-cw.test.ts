/**
 * CW — weekly source refresh used the wrong homepage transport (23 October 2026).
 *
 * Live: the first real weekly visit for Synergy failed its website refresh in about
 * 2 s, before any AI (no stages, review-required). The accepted manual capture reads
 * the homepage through the configured secure pinned hop, but `refreshProjectSource`
 * defaulted to the in-process pinned-socket reader and never consulted the hop
 * configuration. These tests pin the corrected selection: configured hop is used
 * (and a hop failure never falls back), default OFF and `null` keep the released
 * in-process read, the `fetchPage` seam and the Shopify adapter are unchanged, and
 * refresh never loads AI. Persisting `unknown` while keeping the last success is
 * covered against real SQL by source-refresh-migration "keeps last successful
 * evidence when a later fetch fails".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: null as null | { endpoint: string; key: string },
  hop: vi.fn(),
  inProcess: vi.fn(),
  shopify: vi.fn(),
  aiLoaded: false,
}));
vi.mock("./pinned-hop/client.server", () => ({
  pinnedHopConfigFromEnv: () => h.env,
  fetchHomepageViaPinnedHop: h.hop,
}));
vi.mock("./homepage-fetch.server", () => ({ fetchHomepageHtml: h.inProcess }));
vi.mock("./source-refresh-shopify.server", () => ({
  captureConfiguredShopifyCatalog: h.shopify,
}));
vi.mock("./ai.functions", () => {
  h.aiLoaded = true;
  return {};
});
import { refreshProjectSource } from "./source-refresh.server";

const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const sourceId = "00000000-0000-4000-8000-000000000002";
const input = { sourceId, expectedRevision: 1 };
const source = {
  ...scope,
  id: sourceId,
  revision: 1,
  kind: "website",
  status: "active",
  label: "Synergy",
  fingerprint: "a".repeat(64),
  observedAt: "2026-10-23T09:01:41Z",
  url: "https://synergymassage.se/",
};
const page = `<html><head><title>Synergy</title></head><body><p>${"Massage i Malmö. ".repeat(20)}</p></body></html>`;
const hopConfig = {
  endpoint: "https://milo-knowledge-transport.onrender.com",
  key: "k".repeat(48),
};

/** Storage stub: grants the lease, echoes the finish status/revision it is given. */
function storage(shopify = false) {
  const finishes: Array<{ snapshot: unknown }> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_project_source_refresh")
      return {
        data: {
          acquired: true,
          revision: 0,
          source: shopify ? { ...source, refreshAdapter: "shopify-catalog" } : source,
        },
        error: null,
      };
    finishes.push({ snapshot: args.p_snapshot });
    return {
      data: { status: args.p_snapshot ? "ok" : "unknown", revision: args.p_snapshot ? 1 : 0 },
      error: null,
    };
  });
  return { rpc, finishes };
}

beforeEach(() => {
  h.env = null;
  h.hop.mockReset();
  h.inProcess.mockReset();
  h.shopify.mockReset();
  h.aiLoaded = false;
});

describe("CW source refresh homepage transport", () => {
  it("uses the configured secure pinned hop (homepage only) and never the in-process reader", async () => {
    h.env = hopConfig;
    h.hop.mockResolvedValue({ html: page, code: "ok", retryable: false, hops: 1 });
    const s = storage();
    expect(await refreshProjectSource(scope, input, { rpc: s.rpc })).toEqual({ status: "ok" });
    expect(h.hop).toHaveBeenCalledTimes(1);
    expect(h.hop).toHaveBeenCalledWith(source.url, hopConfig);
    expect(h.inProcess).not.toHaveBeenCalled();
    expect(s.finishes).toHaveLength(1);
    expect(s.finishes[0].snapshot).toMatchObject({ ...scope, sourceId, revision: 1 });
  });

  it.each([
    [
      "a retryable cold/busy/timeout outcome",
      { html: "", code: "timeout", retryable: true, hops: 0 },
    ],
    [
      "a retryable outcome that still carries bytes",
      { html: page, code: "transport_busy", retryable: true, hops: 1 },
    ],
    ["a final refusal with no page", { html: "", code: "not_public", retryable: false, hops: 1 }],
  ])("records unknown on %s, with no in-process fallback", async (_, outcome) => {
    h.env = hopConfig;
    h.hop.mockResolvedValue(outcome);
    const s = storage();
    expect(await refreshProjectSource(scope, input, { rpc: s.rpc })).toEqual({ status: "unknown" });
    expect(h.hop).toHaveBeenCalledTimes(1);
    expect(h.inProcess).not.toHaveBeenCalled();
    expect(s.finishes).toEqual([{ snapshot: null }]);
  });

  it("records unknown when the hop throws (e.g. configuration error), with no fallback", async () => {
    h.env = hopConfig;
    h.hop.mockRejectedValue(new Error("hop_budget_invalid"));
    const s = storage();
    expect(await refreshProjectSource(scope, input, { rpc: s.rpc })).toEqual({ status: "unknown" });
    expect(h.inProcess).not.toHaveBeenCalled();
    expect(s.finishes).toEqual([{ snapshot: null }]);
  });

  it("keeps the released in-process read when the hop is not configured (default OFF)", async () => {
    h.inProcess.mockResolvedValue(page);
    const s = storage();
    expect(await refreshProjectSource(scope, input, { rpc: s.rpc })).toEqual({ status: "ok" });
    expect(h.inProcess).toHaveBeenCalledWith(source.url);
    expect(h.hop).not.toHaveBeenCalled();
  });

  it("an explicit null transport forces the in-process read even when the hop is configured", async () => {
    h.env = hopConfig;
    h.inProcess.mockResolvedValue(page);
    const s = storage();
    await refreshProjectSource(scope, input, { rpc: s.rpc, transport: null });
    expect(h.inProcess).toHaveBeenCalledTimes(1);
    expect(h.hop).not.toHaveBeenCalled();
  });

  it("an explicit transport is used instead of the environment", async () => {
    const explicit = { endpoint: "https://hop.example", key: "x".repeat(48) };
    h.env = hopConfig;
    h.hop.mockResolvedValue({ html: page, code: "ok", retryable: false, hops: 1 });
    await refreshProjectSource(scope, input, { rpc: storage().rpc, transport: explicit });
    expect(h.hop).toHaveBeenCalledWith(source.url, explicit);
  });

  it("the fetchPage seam still replaces the whole homepage read", async () => {
    h.env = hopConfig;
    const fetchPage = vi.fn(async () => page);
    await refreshProjectSource(scope, input, { rpc: storage().rpc, fetchPage });
    expect(fetchPage).toHaveBeenCalledWith(source.url);
    expect(h.hop).not.toHaveBeenCalled();
    expect(h.inProcess).not.toHaveBeenCalled();
  });

  it("the Shopify catalog adapter is unchanged and never uses the homepage transport", async () => {
    h.env = hopConfig;
    h.shopify.mockResolvedValue({
      coverage: "public-page",
      warnings: [],
      facts: [],
      conflicts: [],
    });
    await refreshProjectSource(scope, input, { rpc: storage(true).rpc });
    expect(h.shopify).toHaveBeenCalledTimes(1);
    expect(h.hop).not.toHaveBeenCalled();
    expect(h.inProcess).not.toHaveBeenCalled();
  });

  it("never loads AI or the website-capture writer", async () => {
    h.env = hopConfig;
    h.hop.mockResolvedValue({ html: page, code: "ok", retryable: false, hops: 1 });
    await refreshProjectSource(scope, input, { rpc: storage().rpc });
    expect(h.aiLoaded).toBe(false);
  });
});
