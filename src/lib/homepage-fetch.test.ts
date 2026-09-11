import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));
import {
  fetchHomepageHtml,
  fetchPinnedResource,
  isPublicHomepageAddress,
  HOMEPAGE_MAX_BYTES,
  HOMEPAGE_TIMEOUT_MS,
} from "./homepage-fetch.server";

function response(
  chunks: Buffer[] = [Buffer.from("<title>Bakery</title>")],
  status = 200,
  headers: Record<string, string | undefined> = {},
) {
  const stream = Readable.from(chunks, { objectMode: false });
  return Object.assign(stream, {
    statusCode: status,
    complete: true,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}
function reply(stream: ReturnType<typeof response>) {
  return (_url: URL, _options: unknown, callback: (r: unknown) => void) => {
    const req = Object.assign(new EventEmitter(), {
      end: () => queueMicrotask(() => callback(stream)),
    });
    return req;
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ])
    vi.stubEnv(key, "");
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  mocks.request.mockImplementation(reply(response()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Bun pinned transport", () => {
  const nativeFetch = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("Bun", { version: "1.3.3" });
    vi.stubGlobal("fetch", nativeFetch);
  });

  it("uses a literal IP, original host, verified TLS, manual redirects and no proxy/decompression", async () => {
    nativeFetch.mockImplementation(async (url, options) => {
      expect(url.toString()).toBe("https://93.184.216.34/path?q=1");
      expect(options).toMatchObject({
        redirect: "manual",
        proxy: "",
        decompress: false,
        keepalive: false,
        headers: { Host: "example.com", "Accept-Encoding": "identity" },
        tls: { servername: "example.com", rejectUnauthorized: true },
      });
      expect(
        options.tls.checkServerIdentity("93.184.216.34", { subjectaltname: "DNS:example.com" }),
      ).toBeUndefined();
      return new Response("<title>Bakery</title>", { headers: { "content-type": "text/html" } });
    });
    expect(await fetchHomepageHtml("https://example.com/path?q=1")).toContain("Bakery");
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "refuses missing or mismatched certificate checks (callback executed: %s)",
    async (invoke) => {
      const cancel = vi.fn();
      nativeFetch.mockImplementation(async (_url, options) => {
        if (invoke)
          expect(
            options.tls.checkServerIdentity("example.com", {
              subjectaltname: "DNS:attacker.example",
            }),
          ).toBeInstanceOf(Error);
        // Even a transport that incorrectly accepts the failed check is refused.
        return new Response(new ReadableStream({ cancel }), {
          headers: { "content-type": "text/html" },
        });
      });
      expect(await fetchHomepageHtml("https://example.com")).toBe("");
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("bounds and cancels the streamed body in the Bun adapter", async () => {
    const cancel = vi.fn();
    nativeFetch.mockImplementation(async (_url, options) => {
      options.tls.checkServerIdentity("example.com", { subjectaltname: "DNS:example.com" });
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(HOMEPAGE_MAX_BYTES + 5000).fill(97));
          },
          cancel,
        }),
        { headers: { "content-type": "text/html" } },
      );
    });
    expect((await fetchHomepageHtml("https://example.com")).length).toBe(HOMEPAGE_MAX_BYTES);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("validates redirect DNS again before the next Bun request", async () => {
    nativeFetch.mockImplementation(async (_url, options) => {
      options.tls.checkServerIdentity("example.com", { subjectaltname: "DNS:example.com" });
      return new Response(null, { status: 302, headers: { location: "https://next.example.com" } });
    });
    mocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    expect(await fetchHomepageHtml("https://example.com")).toBe("");
    expect(nativeFetch).toHaveBeenCalledOnce();
  });
});

describe("public homepage transport", () => {
  it.each(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"])(
    "refuses inherited %s routing before DNS or a connection",
    async (key) => {
      vi.stubEnv(key, "http://proxy.example.com");
      expect(await fetchHomepageHtml("https://example.com")).toBe("");
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );
  it.each([
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://0177.0.0.1",
    "http://[::1]",
    "http://localhost",
    "http://localhost.",
    "http://metadata.google.internal",
    "http://user:pass@example.com",
    "https://example.com:8443",
    "file:///etc/passwd",
  ])("refuses %s before lookup/connection", async (url) => {
    expect(await fetchHomepageHtml(url)).toBe("");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([
    "169.254.169.254",
    "10.0.0.1",
    "100.64.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "192.0.2.1",
    "203.0.113.1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "2002:7f00:1::",
    "2001:db8::1",
    "3fff::1",
    "fc00::1",
  ])("refuses DNS answer %s including mixed public/private answers", async (address) => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address, family: address.includes(":") ? 6 : 4 },
    ]);
    expect(await fetchHomepageHtml("https://example.com")).toBe("");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("pins the vetted address and preserves the original HTTPS host without another DNS lookup", async () => {
    expect(await fetchHomepageHtml("https://example.com/path?q=1#fragment")).toBe(
      "<title>Bakery</title>",
    );
    expect(mocks.lookup).toHaveBeenCalledOnce();
    const [url, opts] = mocks.request.mock.calls[0];
    expect(url.toString()).toBe("https://example.com/path?q=1");
    expect(opts).toMatchObject({
      agent: false,
      autoSelectFamily: false,
      family: 4,
      servername: "example.com",
      rejectUnauthorized: true,
      headers: { Host: "example.com", "Accept-Encoding": "identity" },
      maxHeaderSize: 16384,
    });
    expect(opts).not.toHaveProperty("rejectUnauthorized", false);
    const cb = vi.fn();
    opts.lookup("example.com", {}, cb);
    expect(cb).toHaveBeenLastCalledWith(null, "93.184.216.34", 4);
    opts.lookup("example.com", { all: true }, cb);
    expect(cb).toHaveBeenLastCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });
  it("preserves literal-IP certificate verification without sending IP SNI", async () => {
    expect(await fetchHomepageHtml("https://93.184.216.34")).toContain("Bakery");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls[0][1]).toMatchObject({
      servername: undefined,
      rejectUnauthorized: true,
      headers: { Host: "93.184.216.34" },
    });
  });
  it("supports a public IPv6-only site with the same pinned connection policy", async () => {
    mocks.lookup.mockResolvedValue([{ address: "2606:4700::1111", family: 6 }]);
    expect(isPublicHomepageAddress("2606:4700::1111")).toBe(true);
    expect(await fetchHomepageHtml("https://example.com")).toContain("Bakery");
    expect(mocks.request.mock.calls[0][1].family).toBe(6);
  });
  it("does not follow redirects into metadata or private DNS", async () => {
    const first = response([], 302, { location: "https://redirect.example.com" });
    mocks.request.mockImplementation(reply(first));
    mocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    expect(await fetchHomepageHtml("https://example.com")).toBe("");
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(first.destroyed).toBe(true);
  });
  it("limits redirects and rejects HTTPS downgrades", async () => {
    mocks.request.mockImplementation((...args) =>
      reply(response([], 302, { location: "/again" }))(
        ...(args as Parameters<ReturnType<typeof reply>>),
      ),
    );
    expect(await fetchHomepageHtml("https://example.com")).toBe("");
    expect(mocks.request).toHaveBeenCalledTimes(4);
    mocks.request
      .mockClear()
      .mockImplementation(reply(response([], 302, { location: "http://example.com" })));
    expect(await fetchHomepageHtml("https://example.com")).toBe("");
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it("keeps at most the bounded prefix and closes an oversized stream", async () => {
    const stream = response([Buffer.alloc(HOMEPAGE_MAX_BYTES + 5000, 97)]);
    mocks.request.mockImplementation(reply(stream));
    expect((await fetchHomepageHtml("https://example.com")).length).toBe(HOMEPAGE_MAX_BYTES);
    expect(stream.destroyed).toBe(true);
  });
  it.each([{ "content-type": "application/octet-stream" }, { "content-encoding": "gzip" }])(
    "rejects unsolicited non-text/encoded bodies and cancels them",
    async (headers) => {
      const stream = response([Buffer.from("private")], 200, headers);
      mocks.request.mockImplementation(reply(stream));
      expect(await fetchHomepageHtml("https://example.com")).toBe("");
      expect(stream.destroyed).toBe(true);
    },
  );
  it("refuses a cut-off response below the prefix bound", async () => {
    const stream = response();
    stream.complete = false;
    mocks.request.mockImplementation(reply(stream));
    expect(await fetchHomepageHtml("https://example.com")).toBe("");
  });
  it("bounds hanging DNS and does not connect after a late answer", async () => {
    vi.useFakeTimers();
    let finish!: (data: unknown) => void;
    mocks.lookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = fetchHomepageHtml("https://example.com");
    await vi.advanceTimersByTimeAsync(HOMEPAGE_TIMEOUT_MS + 1);
    expect(await result).toBe("");
    finish([{ address: "93.184.216.34", family: 4 }]);
    await vi.runAllTimersAsync();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("stops waiting for an unresponsive connection even if cancellation is ignored", async () => {
    vi.useFakeTimers();
    mocks.request.mockImplementation(() => Object.assign(new EventEmitter(), { end: () => {} }));
    const result = fetchHomepageHtml("https://example.com");
    await vi.advanceTimersByTimeAsync(HOMEPAGE_TIMEOUT_MS + 1);
    expect(await result).toBe("");
    expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe("structured pinned technical observations", () => {
  it("retains HTTP failures and selected headers without cookie data", async () => {
    mocks.request.mockImplementation(
      reply(
        response([Buffer.from("<h1>Missing</h1>")], 404, {
          "x-robots-tag": "noindex",
          "set-cookie": "private",
        }),
      ),
    );
    const result = await fetchPinnedResource("https://example.com/missing", {
      purpose: "technical",
      origin: "https://example.com",
      authorize: () => true,
    });
    expect(result).toMatchObject({
      status: 404,
      body: "<h1>Missing</h1>",
      headers: { "x-robots-tag": "noindex" },
      truncated: false,
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each(["technical", "sitemap"] as const)(
    "rejects %s redirect scope and robots policy before resolving or connecting",
    async (purpose) => {
      mocks.request.mockImplementation(
        reply(response([], 302, { location: "https://other.test/private" })),
      );
      expect(
        await fetchPinnedResource("https://example.com/", {
          purpose,
          origin: "https://example.com",
          authorize: () => true,
        }),
      ).toBeNull();
      expect(mocks.lookup).toHaveBeenCalledTimes(1);
      mocks.request.mockImplementation(reply(response([], 302, { location: "/private" })));
      mocks.lookup.mockClear();
      expect(
        await fetchPinnedResource("https://example.com/", {
          purpose,
          origin: "https://example.com",
          authorize: (url) => !url.endsWith("/private"),
        }),
      ).toBeNull();
      expect(mocks.lookup).toHaveBeenCalledTimes(1);
    },
  );
  it("distinguishes an exact size response from a truncated response", async () => {
    mocks.request.mockImplementation(reply(response([Buffer.alloc(512000, 97)])));
    expect(
      (
        await fetchPinnedResource("https://example.com/", {
          purpose: "technical",
          origin: "https://example.com",
          authorize: () => true,
        })
      )?.truncated,
    ).toBe(false);
    mocks.request.mockImplementation(reply(response([Buffer.alloc(512001, 97)])));
    expect(
      (
        await fetchPinnedResource("https://example.com/", {
          purpose: "technical",
          origin: "https://example.com",
          authorize: () => true,
        })
      )?.truncated,
    ).toBe(true);
  });
  it("preserves missing robots status without accepting an HTML body as rules", async () => {
    mocks.request.mockImplementation(reply(response([Buffer.from("<html>Missing</html>")], 404)));
    expect(
      await fetchPinnedResource("https://example.com/robots.txt", {
        purpose: "robots",
        origin: "https://example.com",
      }),
    ).toMatchObject({ status: 404, body: "", contentAccepted: false });
  });
});
