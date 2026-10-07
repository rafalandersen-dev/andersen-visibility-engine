/**
 * Real TLS for the single pinned homepage hop. The ONLY injection is the existing
 * explicit test transport boundary (a module mock of `node:https`) that forwards
 * the core's own request to a loopback TLS server and adds the fixture trust
 * anchor. Production vetting is unchanged: the hop is given a PUBLIC address and
 * this test records that the core pins exactly that address. No allow-private flag.
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:tls";
import type { AddressInfo } from "node:net";
import type { RequestOptions } from "node:https";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type LookupCallback = (
  error: unknown,
  address: string | { address: string; family: number }[],
  family?: number,
) => void;
type Lookup = (host: string, options: { all?: boolean }, callback: LookupCallback) => void;

const fixture = vi.hoisted(() => ({
  port: 0,
  ca: "" as string | undefined,
  seen: [] as { pinned: string | null; servername: unknown; host: unknown }[],
}));
vi.mock("node:https", async (original) => {
  const actual = await original<typeof import("node:https")>();
  return {
    ...actual,
    request: (url: URL, options: RequestOptions & { lookup?: Lookup }, callback: never) => {
      let pinned: string | null = null;
      options.lookup?.("ignored", {}, (_e, address) => {
        pinned = typeof address === "string" ? address : null;
      });
      fixture.seen.push({
        pinned,
        servername: options.servername,
        host: (options.headers as Record<string, unknown>)?.Host,
      });
      return actual.request(
        url,
        {
          ...options,
          port: fixture.port,
          ca: fixture.ca,
          lookup: (_h: string, o: { all?: boolean }, cb: LookupCallback) =>
            o?.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4),
        } as RequestOptions,
        callback,
      );
    },
  };
});
import { readPinnedHomepageHop } from "../homepage-fetch.server";

const dir = new URL("./__fixtures__/", import.meta.url);
const cert = readFileSync(new URL("fixture-only-tls-cert.pem", dir), "utf8");
const key = readFileSync(new URL("fixture-only-tls-key.pem", dir), "utf8");
let server: Server;
let mode: "page" | "redirect" = "page";
beforeAll(async () => {
  server = createServer({ cert, key }, (socket) => {
    socket.once("data", () => {
      const body = "<title>Pinned fixture</title>";
      socket.end(
        mode === "redirect"
          ? "HTTP/1.1 302 Found\r\nlocation: https://elsewhere.test/\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
          : `HTTP/1.1 200 OK\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: ${body.length}\r\nconnection: close\r\n\r\n${body}`,
      );
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  fixture.port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  fixture.seen = [];
  fixture.ca = cert;
  mode = "page";
  for (const k of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ])
    vi.stubEnv(k, "");
});
const PUBLIC = { address: "93.184.216.34", family: 4 };
const signal = () => AbortSignal.timeout(5000);

describe("single pinned homepage hop over real TLS", () => {
  it("pins the vetted address and keeps the original Host/SNI; certificate identity verified", async () => {
    const out = await readPinnedHomepageHop("https://probe-target.test/", PUBLIC, signal());
    expect(out).toMatchObject({ kind: "response", status: 200, contentAccepted: true });
    expect(out.kind === "response" && out.body).toBe("<title>Pinned fixture</title>");
    expect(fixture.seen).toEqual([
      { pinned: "93.184.216.34", servername: "probe-target.test", host: "probe-target.test" },
    ]);
  });
  it("refuses a certificate that does not match the original hostname", async () => {
    await expect(
      readPinnedHomepageHop("https://wrong-host.test/", PUBLIC, signal()),
    ).rejects.toMatchObject({
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
  });
  it("refuses an untrusted certificate (no insecure fallback)", async () => {
    fixture.ca = undefined;
    await expect(
      readPinnedHomepageHop("https://probe-target.test/", PUBLIC, signal()),
    ).rejects.toMatchObject({
      code: "DEPTH_ZERO_SELF_SIGNED_CERT",
    });
  });
  it("returns a redirect without following it (one connection only)", async () => {
    mode = "redirect";
    const out = await readPinnedHomepageHop("https://probe-target.test/", PUBLIC, signal());
    expect(out).toEqual({ kind: "redirect", status: 302, location: "https://elsewhere.test/" });
    expect(fixture.seen).toHaveLength(1);
  });
  it.each([
    [{ address: "10.0.0.7", family: 4 }],
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "93.184.216.34", family: 6 }],
  ])(
    "refuses a private, loopback or family-mismatched address %j before connecting",
    async (address) => {
      await expect(
        readPinnedHomepageHop("https://probe-target.test/", address, signal()),
      ).rejects.toThrow("blocked_address");
      expect(fixture.seen).toHaveLength(0);
    },
  );
  it("refuses an IP-literal URL whose literal differs from the pinned address", async () => {
    await expect(readPinnedHomepageHop("https://93.184.216.35/", PUBLIC, signal())).rejects.toThrow(
      "blocked_address",
    );
    expect(fixture.seen).toHaveLength(0);
  });
});
