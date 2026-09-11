import { gzipSync } from "node:zlib";
import { TechnicalCrawlAdmissionError } from "./technical-crawl-admission";
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
  fetchPinnedImage,
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
  it.each(["media", "encoding", "both", "octet"])(
    "decodes bounded gzip sitemap representation: %s",
    async (mode) => {
      const xml =
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a</loc></url></urlset>';
      let body = gzipSync(Buffer.from(xml));
      if (mode === "both") body = gzipSync(body);
      mocks.request.mockImplementation(
        reply(
          response([body], 200, {
            "content-type":
              mode === "encoding"
                ? "application/xml"
                : mode === "octet"
                  ? "application/octet-stream"
                  : "application/gzip",
            ...(mode === "encoding" || mode === "both" ? { "content-encoding": "gzip" } : {}),
          }),
        ),
      );
      const result = await fetchPinnedResource("https://example.com/sitemap.xml.gz", {
        purpose: "sitemap",
        origin: "https://example.com",
        authorize: () => true,
      });
      expect(result).toMatchObject({ body: xml, contentAccepted: true, truncated: false });
    },
  );
  it("marks an inflated sitemap beyond the byte limit oversized before parsing", async () => {
    mocks.request.mockImplementation(
      reply(
        response([gzipSync(Buffer.alloc(512001, 65))], 200, { "content-type": "application/gzip" }),
      ),
    );
    await expect(
      fetchPinnedResource("https://example.com/sitemap.xml.gz", {
        purpose: "sitemap",
        origin: "https://example.com",
        authorize: () => true,
      }),
    ).resolves.toMatchObject({ body: "", truncated: true });
  });
  it("refuses corrupt gzip sitemap data", async () => {
    const broken = gzipSync(Buffer.from("<urlset/>"));
    broken[broken.length - 5] ^= 255;
    mocks.request.mockImplementation(
      reply(response([broken], 200, { "content-type": "application/gzip" })),
    );
    await expect(
      fetchPinnedResource("https://example.com/sitemap.xml.gz", {
        purpose: "sitemap",
        origin: "https://example.com",
        authorize: () => true,
      }),
    ).resolves.toBeNull();
  });
  it("preserves denied redirect policy before destination DNS or connection", async () => {
    mocks.request.mockImplementationOnce(reply(response([], 302, { location: "/private" })));
    await expect(
      fetchPinnedResource("https://example.com/", {
        purpose: "technical",
        origin: "https://example.com",
        authorize: (url) => !url.endsWith("/private"),
      }),
    ).rejects.toMatchObject({
      name: "TechnicalPolicyRefusedError",
      url: "https://example.com/private",
    });
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it("closes an unaccepted response before releasing its connection slot", async () => {
    const stream = response([Buffer.from("ignored")], 200, { "content-type": "application/json" });
    mocks.request.mockImplementation(reply(stream));
    const release = vi.fn(async () => {
      expect(stream.destroyed).toBe(true);
    });
    await fetchPinnedResource("https://example.com/", {
      purpose: "robots",
      origin: "https://example.com",
      admit: async () => release,
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it("admits every redirect separately and releases the preceding connection first", async () => {
    const events: string[] = [];
    const admit = vi.fn(async (url: string, _signal: AbortSignal, address: string) => {
      expect(address).toBe("93.184.216.34");
      events.push("admit:" + url);
      return async () => {
        events.push("release:" + url);
      };
    });
    mocks.request
      .mockImplementationOnce(reply(response([], 302, { location: "/next" })))
      .mockImplementationOnce(reply(response()));
    await fetchPinnedResource("https://example.com/", {
      purpose: "robots",
      origin: "https://example.com",
      admit,
    });
    expect(events).toEqual([
      "admit:https://example.com/",
      "release:https://example.com/",
      "admit:https://example.com/next",
      "release:https://example.com/next",
    ]);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it("propagates explicit admission refusal without opening a connection", async () => {
    const admit = vi.fn(async () => {
      throw new TechnicalCrawlAdmissionError("capacity");
    });
    await expect(
      fetchPinnedResource("https://example.com/", {
        purpose: "robots",
        origin: "https://example.com",
        admit,
      }),
    ).rejects.toMatchObject({ reason: "capacity" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not dispatch after a late admission, and releases its returned lease", async () => {
    vi.useFakeTimers();
    const release = vi.fn(async () => {});
    let complete!: (value: typeof release) => void;
    const admit = vi.fn(
      () =>
        new Promise<typeof release>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = fetchPinnedResource("https://example.com/", {
      purpose: "robots",
      origin: "https://example.com",
      admit,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(admit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(HOMEPAGE_TIMEOUT_MS + 1);
    expect(await pending).toBeNull();
    expect(release).not.toHaveBeenCalled();
    complete(release);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("refuses malformed UTF-8 sitemap bytes instead of fabricating a replacement-character URL", async () => {
    mocks.request.mockImplementation(
      reply(
        response(
          [
            Buffer.concat([
              Buffer.from("<urlset><url><loc>https://example.com/"),
              Buffer.from([0xff]),
              Buffer.from("</loc></url></urlset>"),
            ]),
          ],
          200,
          { "content-type": "application/xml" },
        ),
      ),
    );
    await expect(
      fetchPinnedResource("https://example.com/sitemap.xml", {
        purpose: "sitemap",
        origin: "https://example.com",
        authorize: () => true,
      }),
    ).resolves.toBeNull();
  });
  it("retains legacy-encoded non-HTML HTTP errors without decoding their body", async () => {
    mocks.request.mockImplementation(
      reply(
        response([Buffer.from([0x43, 0x61, 0x66, 0xe9])], 500, {
          "content-type": "text/plain",
          "x-robots-tag": "noindex",
        }),
      ),
    );
    const result = await fetchPinnedResource("https://example.com/", {
      purpose: "technical",
      origin: "https://example.com",
      authorize: () => true,
    });
    expect(result).toMatchObject({
      status: 500,
      body: "",
      headers: { "content-type": "text/plain", "x-robots-tag": "noindex" },
    });
  });
  it("decodes declared legacy HTML before returning technical evidence", async () => {
    mocks.request.mockImplementation(
      reply(
        response([Buffer.from("<title>Caf\xe9</title>", "latin1")], 200, {
          "content-type": "text/html; charset=windows-1252",
        }),
      ),
    );
    const result = await fetchPinnedResource("https://example.com/", {
      purpose: "technical",
      origin: "https://example.com",
      authorize: () => true,
    });
    expect(result).toMatchObject({
      body: "<title>Café</title>",
      truncated: false,
      contentAccepted: true,
    });
    mocks.request.mockImplementation(
      reply(response([Buffer.from([0xff])], 200, { "content-type": "text/html; charset=utf-8" })),
    );
    expect(
      await fetchPinnedResource("https://example.com/", {
        purpose: "technical",
        origin: "https://example.com",
        authorize: () => true,
      }),
    ).toBeNull();
  });

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
  it.each([
    ["robots", "text/plain", "text/plain"],
    ["sitemap", "application/xml,text/xml,text/plain", "application/xml"],
    ["technical", "text/html,application/xhtml+xml,text/plain", "text/html"],
  ] as const)(
    "requests the supported representation for %s on every redirect",
    async (purpose, accept, contentType) => {
      mocks.request
        .mockImplementationOnce(reply(response([], 302, { location: "/next" })))
        .mockImplementationOnce(
          reply(response([Buffer.from("resource")], 200, { "content-type": contentType })),
        );
      const result = await fetchPinnedResource("https://example.com/start", {
        purpose,
        origin: "https://example.com",
        authorize: () => true,
      });
      expect(result).toMatchObject({ body: "resource", contentAccepted: true });
      expect(mocks.request).toHaveBeenCalledTimes(2);
      for (const call of mocks.request.mock.calls) expect(call[1].headers.Accept).toBe(accept);
    },
  );
  it.each(["technical", "sitemap"] as const)(
    "honors the 8192-character %s URL boundary for initial and redirected URLs",
    async (purpose) => {
      const base = "https://example.com/";
      const longest = base + "a".repeat(8192 - base.length);
      const options = { purpose, origin: "https://example.com", authorize: () => true };
      const mime = purpose === "sitemap" ? "application/xml" : "text/html";
      mocks.request.mockImplementation(
        reply(response([Buffer.from("body")], 200, { "content-type": mime })),
      );
      expect((await fetchPinnedResource(longest, options))?.url).toBe(longest);
      mocks.request.mockClear();
      mocks.lookup.mockClear();
      expect(await fetchPinnedResource(longest + "x", options)).toBeNull();
      expect(mocks.lookup).not.toHaveBeenCalled();
      mocks.request
        .mockImplementationOnce(reply(response([], 302, { location: longest })))
        .mockImplementationOnce(
          reply(response([Buffer.from("body")], 200, { "content-type": mime })),
        );
      expect((await fetchPinnedResource(base, options))?.url).toBe(longest);
      mocks.request.mockClear();
      mocks.request.mockImplementationOnce(reply(response([], 302, { location: longest + "x" })));
      expect(await fetchPinnedResource(base, options)).toBeNull();
      expect(mocks.request).toHaveBeenCalledTimes(1);
      mocks.request.mockClear();
      expect(await fetchHomepageHtml(longest)).toBe("");
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );
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
      const refused = fetchPinnedResource("https://example.com/", {
        purpose,
        origin: "https://example.com",
        authorize: (url) => !url.endsWith("/private"),
      });
      if (purpose === "technical")
        await expect(refused).rejects.toMatchObject({
          name: "TechnicalPolicyRefusedError",
          url: "https://example.com/private",
        });
      else await expect(refused).resolves.toBeNull();
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

describe("pinned collaborator image fetches", () => {
  const get = (url = "https://example.com/image.png") =>
    fetchPinnedImage(url, "https://example.com", new AbortController().signal);
  it("returns exact bytes and uses a pinned socket without global fetch", async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255, 0]);
    mocks.request.mockImplementation(
      reply(response([bytes], 200, { "content-type": "image/png" })),
    );
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    expect(await get()).toEqual(new Uint8Array(bytes));
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls[0][1].headers.Accept).toBe("image/png,image/jpeg,image/webp");
    expect(mocks.request.mock.calls[0][1].lookup).toEqual(expect.any(Function));
  });
  it("pins Bun image requests and preserves binary data after TLS identity verification", async () => {
    vi.stubGlobal("Bun", { version: "1.3.3" });
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 255, 0]);
    const native = vi.fn(async (url, options) => {
      expect(url.toString()).toBe("https://93.184.216.34/image.png");
      expect(options.headers.Accept).toBe("image/png,image/jpeg,image/webp");
      expect(
        options.tls.checkServerIdentity("93.184.216.34", { subjectaltname: "DNS:example.com" }),
      ).toBeUndefined();
      return new Response(bytes, { headers: { "content-type": "image/png" } });
    });
    vi.stubGlobal("fetch", native);
    expect(await get()).toEqual(bytes);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("blocks private DNS before connection and checks each redirect again", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect(await get()).toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    mocks.request.mockImplementation(reply(response([], 302, { location: "/next.png" })));
    expect(await get()).toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("refuses off-origin redirects before resolving the next host", async () => {
    mocks.request.mockImplementation(
      reply(response([], 302, { location: "https://other.test/image.png" })),
    );
    expect(await get()).toBeNull();
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized streams without returning a truncated image", async () => {
    mocks.request.mockImplementation(reply(response([Buffer.alloc(5 * 1024 * 1024 + 1)])));
    expect(await get()).toBeNull();
  });
  it("stops before DNS when the parent operation is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await fetchPinnedImage("https://example.com/a", "https://example.com", controller.signal),
    ).toBeNull();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
