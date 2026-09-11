import { gunzipSync } from "node:zlib";
import { TechnicalPolicyRefusedError } from "./technical-crawl-admission";
import {
  TechnicalCrawlAdmissionError,
  type CrawlConnectionAdmission,
} from "./technical-crawl-admission";
import { decodeTechnicalHtml } from "./technical-html-decoding.server";
/** Server-only public-page reader. Resolve once and pin the socket to that
 * address while preserving HTTP Host and TLS certificate/SNI verification.
 * No runtime declaration or global fetch proxy can bypass this boundary.
 */
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { isSafePublicUrl } from "./safe-fetch";

export const HOMEPAGE_MAX_BYTES = 300_000;
export const HOMEPAGE_MAX_CHUNKS = 4096;
export const HOMEPAGE_TIMEOUT_MS = 8000;
const forbidden4 = new BlockList();
const proxyVariables = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  forbidden4.addSubnet(address, prefix, "ipv4");
const public6 = new BlockList();
public6.addSubnet("2000::", 3, "ipv6");
const forbidden6 = new BlockList();
// Conservative exclusion of special protocol ranges (including transition
// mechanisms), documentation and benchmarking. IANA registries, 2026-09-09.
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  forbidden6.addSubnet(address, prefix, "ipv6");

export function isPublicHomepageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !forbidden4.check(address, "ipv4");
  if (family === 6) return public6.check(address, "ipv6") && !forbidden6.check(address, "ipv6");
  return false;
}

function pageUrl(raw: string, maximum = 4096): URL {
  if (raw.length > maximum || !isSafePublicUrl(raw)) throw new Error("blocked_url");
  const url = new URL(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !isIP(hostname) &&
    (!hostname.includes(".") || /\.(local|internal|localhost)\.?$/i.test(hostname))
  )
    throw new Error("blocked_host");
  url.hash = "";
  if (url.href.length > maximum) throw new Error("blocked_url");
  return url;
}

async function addressFor(url: URL, signal: AbortSignal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.length > 64 ||
    addresses.some((r) => !isPublicHomepageAddress(r.address))
  )
    throw new Error("blocked_address");
  // One connection attempt. No DNS re-resolution or fallback to unvetted IPs.
  return addresses.find((r) => r.family === 4) ?? addresses[0];
}

type PageResponse = AsyncIterable<Uint8Array> & {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  readonly complete: boolean;
  destroy(): unknown;
};

async function openBunPage(
  url: URL,
  address: { address: string; family: number },
  signal: AbortSignal,
  accept = "text/html,application/xhtml+xml,text/plain",
  acceptEncoding = "identity",
): Promise<PageResponse> {
  const destination = new URL(url);
  destination.hostname = address.family === 6 ? `[${address.address}]` : address.address;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let identityVerified = url.protocol === "http:";
  // Bun 1.3.3 node:https does not forward checkServerIdentity. Use its native
  // transport with a literal vetted IP and explicitly verify the original
  // hostname. Refuse a runtime that does not execute this certificate check.
  const options: RequestInit & {
    proxy: string;
    decompress: boolean;
    tls: {
      servername?: string;
      rejectUnauthorized: boolean;
      checkServerIdentity: (name: string, certificate: PeerCertificate) => Error | undefined;
    };
  } = {
    method: "GET",
    redirect: "manual",
    signal,
    keepalive: false,
    proxy: "",
    decompress: false,
    headers: {
      Host: url.host,
      "User-Agent": "MiloGrowthAuditBot/1.0 (+https://milogrowth.com)",
      Accept: accept,
      "Accept-Encoding": acceptEncoding,
    },
    tls: {
      servername: isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: true,
      checkServerIdentity: (_name, certificate) => {
        const error = checkServerIdentity(hostname, certificate);
        identityVerified = !error;
        return error;
      },
    },
  };
  const result = await fetch(destination, options);
  const reader = result.body?.getReader();
  const cancel = () => {
    void reader?.cancel().catch(() => {});
  };
  if (signal.aborted || !identityVerified) {
    cancel();
    throw new Error("unverified_connection");
  }
  let complete = false;
  return {
    statusCode: result.status,
    headers: Object.fromEntries(result.headers),
    get complete() {
      return complete;
    },
    destroy: cancel,
    async *[Symbol.asyncIterator]() {
      if (!reader) {
        complete = true;
        return;
      }
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            complete = true;
            return;
          }
          yield value;
        }
      } finally {
        cancel();
      }
    },
  };
}

function openPage(
  url: URL,
  address: { address: string; family: number },
  signal: AbortSignal,
  accept = "text/html,application/xhtml+xml,text/plain",
  acceptEncoding = "identity",
): Promise<PageResponse> {
  if ((globalThis as { Bun?: unknown }).Bun)
    return openBunPage(url, address, signal, accept, acceptEncoding);
  return new Promise<IncomingMessage>((resolve, reject) => {
    signal.throwIfAborted();
    const options: RequestOptions & { autoSelectFamily: boolean } = {
      method: "GET",
      agent: false,
      family: address.family,
      autoSelectFamily: false,
      // Explicit original Host and TLS identity; the connection still uses
      // only the vetted address returned by the custom lookup below.
      servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
      rejectUnauthorized: true,
      signal,
      maxHeaderSize: 16_384,
      headers: {
        Host: url.host,
        "User-Agent": "MiloGrowthAuditBot/1.0 (+https://milogrowth.com)",
        Accept: accept,
        "Accept-Encoding": acceptEncoding,
      },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      options,
      (response) => {
        // Attach before a redirect or a rejected response is destroyed.
        response.on("error", () => {});
        if (signal.aborted) {
          response.destroy();
          reject(new Error("timeout"));
        } else resolve(response);
      },
    );
    request.on("error", reject);
    request.on("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("upgrade_refused"));
    });
    request.end();
  });
}

export type PinnedResource = {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  contentAccepted: boolean;
  observedAt: string;
};
export async function fetchPinnedResource(
  raw: string,
  options: {
    purpose: "homepage" | "technical" | "robots" | "sitemap";
    origin?: string;
    authorize?: (url: string) => boolean;
    admit?: CrawlConnectionAdmission;
  },
): Promise<PinnedResource | null> {
  const maxBytes = options.purpose === "homepage" ? HOMEPAGE_MAX_BYTES : 512_000;
  const acceptedType =
    options.purpose === "robots"
      ? /^text\/plain(?:\s*;|$)/i
      : options.purpose === "sitemap"
        ? /^(?:text\/(?:plain|xml)|application\/(?:xml|gzip|x-gzip|[a-z0-9.-]+\+xml))(?:\s*;|$)/i
        : /^(text\/(html|plain)|application\/xhtml\+xml)(?:\s*;|$)/i;
  const controller = new AbortController();
  let response: PageResponse | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("homepage_timeout"));
      controller.abort();
      response?.destroy();
    }, HOMEPAGE_TIMEOUT_MS);
  });
  const read = async () => {
    // Older Bun versions can inherit proxy settings inside node:http. Refuse
    // that environment rather than handing a proxy control of DNS/routing.
    if (proxyVariables.some((key) => process.env[key]?.trim())) throw new Error("proxy_refused");
    const urlLimit = options.purpose === "homepage" ? 4096 : 8192;
    let url = pageUrl(raw, urlLimit);
    for (let hop = 0; hop <= 3; hop++) {
      let release: (() => Promise<void>) | undefined;
      try {
        if (options.purpose !== "homepage" && (!options.origin || url.origin !== options.origin))
          throw new Error("scope_refused");
        if (
          ["technical", "sitemap"].includes(options.purpose) &&
          (!options.authorize || !options.authorize(url.href))
        ) {
          if (options.purpose === "technical") throw new TechnicalPolicyRefusedError(url.href);
          throw new Error("crawl_policy_refused");
        }
        const address = await addressFor(url, controller.signal);
        controller.signal.throwIfAborted();
        if (options.admit)
          release = await options.admit(url.href, controller.signal, address.address);
        controller.signal.throwIfAborted();
        const accept =
          options.purpose === "sitemap"
            ? "application/xml,text/xml,text/plain,application/gzip,application/x-gzip,application/octet-stream"
            : options.purpose === "robots"
              ? "text/plain"
              : "text/html,application/xhtml+xml,text/plain";
        response = await openPage(
          url,
          address,
          controller.signal,
          accept,
          options.purpose === "sitemap" ? "gzip,identity" : "identity",
        );
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.destroy();
          if (typeof location !== "string" || !location || hop === 3)
            throw new Error("redirect_refused");
          const next = pageUrl(new URL(location, url).toString(), urlLimit);
          if (url.protocol === "https:" && next.protocol !== "https:")
            throw new Error("downgrade_refused");
          url = next;
          continue;
        }
        if (!Number.isInteger(status) || status < 100 || status > 599)
          throw new Error("http_error");
        const headers: Record<string, string> = {};
        for (const key of ["content-type", "x-robots-tag", "link"]) {
          const rawValue = response.headers[key];
          const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
          if (value && value.length > 32000) throw new Error("header_limit");
          if (value) headers[key] = value;
        }
        const type = headers["content-type"] ?? "";
        const gzipFile =
          options.purpose === "sitemap" &&
          (/^application\/(?:gzip|x-gzip)(?:\s*;|$)/i.test(type) ||
            (/^application\/octet-stream(?:\s*;|$)/i.test(type) && url.pathname.endsWith(".gz")));
        const contentAccepted = acceptedType.test(type) || gzipFile;
        const evidence = {
          url: url.href,
          status,
          headers,
          body: "",
          truncated: false,
          contentAccepted,
          observedAt: new Date().toISOString(),
        };
        if (!contentAccepted) return evidence;
        const rawEncoding = response.headers["content-encoding"];
        const encoding =
          typeof rawEncoding === "string" ? rawEncoding.trim().toLowerCase() : rawEncoding;
        const gzipEncoding = options.purpose === "sitemap" && encoding === "gzip";
        if (encoding && encoding !== "identity" && !gzipEncoding)
          throw new Error("unsupported_encoding");
        const chunks: Buffer[] = [];
        let bytes = 0;
        let count = 0;
        let truncated = false;
        for await (const rawChunk of response) {
          controller.signal.throwIfAborted();
          const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
          if (++count > HOMEPAGE_MAX_CHUNKS) throw new Error("too_many_chunks");
          const take = Math.min(chunk.length, maxBytes - bytes);
          chunks.push(Buffer.from(chunk.subarray(0, take)));
          bytes += take;
          if (chunk.length > take) {
            truncated = true;
            break;
          }
        }
        if (!truncated && !response.complete) throw new Error("incomplete_page");
        let payload = Buffer.concat(chunks, bytes);
        const gzipMagic = payload[0] === 0x1f && payload[1] === 0x8b;
        const inferredGzipFile =
          options.purpose === "sitemap" &&
          !gzipEncoding &&
          url.pathname.endsWith(".gz") &&
          gzipMagic;
        if (gzipEncoding || gzipFile || inferredGzipFile) {
          if (truncated) return { ...evidence, truncated: true };
          try {
            // HTTP content coding and a gzip media representation are separate
            // layers. Bound every inflated layer before any UTF-8/XML parsing.
            if (gzipEncoding) payload = gunzipSync(payload, { maxOutputLength: maxBytes });
            if (gzipFile || inferredGzipFile)
              payload = gunzipSync(payload, { maxOutputLength: maxBytes });
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              error.code === "ERR_BUFFER_TOO_LARGE"
            )
              return { ...evidence, truncated: true };
            throw error;
          }
          controller.signal.throwIfAborted();
        }
        return {
          ...evidence,
          body:
            options.purpose === "technical"
              ? /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(type)
                ? decodeTechnicalHtml(payload, type, truncated)
                : ""
              : options.purpose === "sitemap"
                ? new TextDecoder("utf-8", { fatal: true }).decode(payload)
                : payload.toString("utf8"),
          truncated,
          observedAt: new Date().toISOString(),
        };
      } finally {
        // This belongs to actual request work, not the outer timeout race.
        response?.destroy();
        if (release) await release().catch(() => {});
      }
    }
    throw new Error("redirect_refused");
  };
  try {
    return await Promise.race([read(), deadline]);
  } catch (error) {
    if (
      error instanceof TechnicalCrawlAdmissionError ||
      error instanceof TechnicalPolicyRefusedError
    )
      throw error;
    // No bodies, URLs, DNS answers or transport errors enter logs.
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
    response?.destroy();
  }
}

/** Preserve the existing homepage-only caller contract. */
export async function fetchHomepageHtml(raw: string): Promise<string> {
  const result = await fetchPinnedResource(raw, { purpose: "homepage" });
  return result && result.status >= 200 && result.status < 300 && result.contentAccepted
    ? result.body
    : "";
}

/** Exact public image bytes for review, using the same pinned DNS/TLS sockets.
 * Scope and every redirect are checked before DNS or connection. */
export async function fetchPinnedImage(
  raw: string,
  origin: string,
  parent: AbortSignal,
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  let response: PageResponse | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStop: ((reason: Error) => void) | undefined;
  const stop = () => {
    controller.abort();
    response?.destroy();
    rejectStop?.(new Error("image_aborted"));
  };
  const stopped = new Promise<never>((_, reject) => {
    rejectStop = reject;
    timer = setTimeout(stop, 10000);
  });
  parent.addEventListener("abort", stop, { once: true });
  const read = async () => {
    if (parent.aborted) throw new Error("image_aborted");
    if (proxyVariables.some((key) => process.env[key]?.trim())) throw new Error("proxy_refused");
    let url = pageUrl(raw);
    for (let hop = 0; hop <= 3; hop++) {
      if (url.protocol !== "https:" || url.origin !== origin) throw new Error("image_scope");
      const address = await addressFor(url, controller.signal);
      controller.signal.throwIfAborted();
      response = await openPage(url, address, controller.signal, "image/png,image/jpeg,image/webp");
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (typeof location !== "string" || !location || hop === 3)
          throw new Error("image_redirect");
        url = pageUrl(new URL(location, url).href);
        continue;
      }
      if (status < 200 || status >= 300) throw new Error("image_http");
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding !== "identity") throw new Error("image_encoding");
      const maximum = 5 * 1024 * 1024;
      if (Number(response.headers["content-length"]) > maximum) throw new Error("image_size");
      const chunks: Buffer[] = [];
      let total = 0,
        count = 0;
      for await (const value of response) {
        controller.signal.throwIfAborted();
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        total += chunk.length;
        if (total > maximum || ++count > HOMEPAGE_MAX_CHUNKS) throw new Error("image_size");
        chunks.push(Buffer.from(chunk));
      }
      if (!response.complete) throw new Error("image_incomplete");
      return new Uint8Array(Buffer.concat(chunks, total));
    }
    throw new Error("image_redirect");
  };
  try {
    return await Promise.race([read(), stopped]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", stop);
    controller.abort();
    response?.destroy();
  }
}
