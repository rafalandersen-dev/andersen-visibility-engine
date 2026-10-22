/** CC: real captureProjectWebsiteKnowledge → real adapter → real loopback service (fake hop/DNS). */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), inProcess: vi.fn() }));
vi.mock("./project-knowledge.server", () => ({
  readProjectKnowledge: h.read,
  writeProjectKnowledgePair: h.save,
  KnowledgeUnavailableError: class extends Error {},
}));
vi.mock("./ai.functions", async (original) => ({
  ...(await original<typeof import("./ai.functions")>()),
  fetchSiteContext: h.inProcess,
}));
import { captureProjectWebsiteKnowledge } from "./project-knowledge-website.server";
import { createPinnedHopService } from "./pinned-hop/service.server";
import {
  HOP_LABELS,
  HOP_SIGNATURE_HEADER,
  importHopKey,
  signHop,
  toBase64,
  utf8,
} from "./pinned-hop/protocol";
import type { PinnedHopConfig } from "./pinned-hop/client.server";
import type { PinnedHomepageHop } from "./homepage-fetch.server";

const KEY = "fixture-only-key-not-a-secret-0123456789abcdef";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const TEXT =
  "Andersen Innovations builds fast service-business websites ready for search and AI assistants. ".repeat(
    3,
  );
const servers: Server[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  h.read.mockResolvedValue({ sources: [], records: [] });
  h.save.mockImplementation(async (_s, source, record) => ({ source, record }));
  h.inProcess.mockResolvedValue({
    ok: true,
    title: "In-process",
    metaDescription: "",
    text: TEXT,
    links: [],
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});
async function transport(hop: () => Promise<PinnedHomepageHop>): Promise<PinnedHopConfig> {
  const svc = createPinnedHopService({ key: await importHopKey(KEY), hop });
  const server = createServer((req, res) => void svc.handle(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    key: KEY,
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
  };
}

describe("default OFF parity", () => {
  it("without the environment switch the released in-process path is used unchanged", async () => {
    vi.stubEnv("MILO_PINNED_HOP_URL", "");
    vi.stubEnv("MILO_PINNED_HOP_KEY", "");
    const out = await captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl");
    expect(out.changed).toBe(true);
    expect(h.inProcess).toHaveBeenCalledExactlyOnceWith("https://anderseninnovations.pl");
  });
  it("an explicit null transport also forces the in-process path", async () => {
    await captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl", {
      transport: null,
    });
    expect(h.inProcess).toHaveBeenCalledTimes(1);
  });
});

describe("pinned-hop transport for homepage knowledge intake", () => {
  it("writes one proposed excerpt from the adapter's page, never calling the in-process fetch", async () => {
    const cfg = await transport(async () => ({
      kind: "response",
      status: 200,
      headers: { "content-type": "text/html" },
      contentAccepted: true,
      truncated: false,
      body: `<title>Strony gotowe pod SEO</title><main>${TEXT}</main>`,
    }));
    const out = await captureProjectWebsiteKnowledge(scope, "anderseninnovations.pl", {
      transport: cfg,
    });
    expect(out.changed).toBe(true);
    expect(h.inProcess).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        kind: "website",
        url: "https://anderseninnovations.pl",
        label: "Strony gotowe pod SEO",
      }),
      expect.objectContaining({
        key: "fact.website-excerpt",
        status: "proposed",
        value: expect.stringContaining("Andersen Innovations builds"),
      }),
      0,
      0,
    );
  });
  it("a cold/unreachable service is a known, retryable refusal and nothing is written", async () => {
    const cfg: PinnedHopConfig = {
      endpoint: "http://127.0.0.1:9",
      key: KEY,
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    };
    await expect(
      captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl", { transport: cfg }),
    ).rejects.toThrow("website_source_temporarily_unavailable");
    expect(h.save).not.toHaveBeenCalled();
    expect(h.inProcess).not.toHaveBeenCalled();
  });
  it("CD: a matching signed result that arrives after the 8 s deadline is never written", async () => {
    const key = await importHopKey(KEY);
    let now = 0;
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      const sent = JSON.parse(await new Response(init?.body).text());
      const challenge = String(url).endsWith("/v1/challenge");
      const reply = challenge
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
            bodyB64: toBase64(`<title>Late</title><main>${TEXT}</main>`),
          };
      const bytes = utf8(JSON.stringify(reply));
      const signature = await signHop(
        key,
        challenge ? HOP_LABELS.challengeResponse : HOP_LABELS.hopResponse,
        bytes,
      );
      if (!challenge) now = 10_000;
      return new Response(bytes, { headers: { [HOP_SIGNATURE_HEADER]: signature } });
    };
    const cfg: PinnedHopConfig = {
      endpoint: "https://fixture.invalid",
      key: KEY,
      now: () => now,
      fetchImpl,
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    };
    await expect(
      captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl", { transport: cfg }),
    ).rejects.toThrow("website_source_temporarily_unavailable");
    expect(h.save).not.toHaveBeenCalled();
  });
  it("a page without readable text keeps the existing unreadable refusal", async () => {
    const cfg = await transport(async () => ({
      kind: "response",
      status: 200,
      headers: { "content-type": "text/html" },
      contentAccepted: true,
      truncated: false,
      body: "<div id=root></div>",
    }));
    await expect(
      captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl", { transport: cfg }),
    ).rejects.toThrow("website_source_unreadable");
    expect(h.save).not.toHaveBeenCalled();
  });
  it("a refused destination (private DNS answer) is not reported as temporary", async () => {
    const cfg = {
      ...(await transport(async () => Promise.reject(new Error("never")))),
      resolve: async () => [{ address: "10.1.1.1", family: 4 }],
    };
    await expect(
      captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl", { transport: cfg }),
    ).rejects.toThrow("website_source_unreadable");
  });
});
