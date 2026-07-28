export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 300_000;
export const TIMEOUT_MS = 8_000;

export type SafeFetchResult =
  | { ok: true; contentType: string; body: string }
  | {
      ok: false;
      reason: "blocked" | "timeout" | "network" | "too_many_redirects" | "http_error" | "too_large";
    };

function parseIpv4(host: string): number[] | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function ipv4Category([a, b, c]: number[]): string {
  if (a === 0 || a >= 240) return "reserved";
  if (a === 10 || a === 127) return a === 10 ? "private" : "loopback";
  if (a === 100 && b >= 64 && b <= 127) return "reserved";
  if (a === 169 && b === 254) return "linklocal";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 0 && c === 0) return "reserved";
  if (a === 192 && b === 168) return "private";
  if (a >= 224) return "multicast";
  return "global";
}

function parseIpv6(host: string): number[] | null {
  if (!host.includes(":") || host.includes("%")) return null;
  let source = host;
  const lastColon = source.lastIndexOf(":");
  const ipv4 = parseIpv4(source.slice(lastColon + 1));
  if (ipv4) {
    source =
      source.slice(0, lastColon + 1) +
      `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8 || !groups.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) return null;
  return groups.map((part) => Number.parseInt(part, 16));
}

function ipv6Category(groups: number[]): string {
  if (groups.every((value) => value === 0)) return "unspecified";
  if (groups.slice(0, 7).every((value) => value === 0) && groups[7] === 1) return "loopback";
  if (
    groups.slice(0, 5).every((value) => value === 0) &&
    (groups[5] === 0 || groups[5] === 0xffff)
  ) {
    const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    const category = ipv4Category(embedded);
    return category === "global" && groups[5] === 0xffff ? "global" : category;
  }
  if ((groups[0] & 0xffc0) === 0xfe80) return "linklocal";
  if ((groups[0] & 0xfe00) === 0xfc00) return "private";
  if ((groups[0] & 0xff00) === 0xff00) return "multicast";
  return "global";
}

export function hostCategory(rawHost: string): string {
  const host = rawHost
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (!host) return "reserved";
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  const ipv4 = parseIpv4(host);
  if (ipv4) return ipv4Category(ipv4);
  const ipv6 = parseIpv6(host);
  if (ipv6) return ipv6Category(ipv6);
  return "hostname";
}

export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  if (
    url.port &&
    !(
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    )
  ) {
    return false;
  }
  const category = hostCategory(url.hostname);
  return category === "global" || category === "hostname";
}

async function readCapped(response: Response, maxBytes: number): Promise<string | undefined> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return undefined;
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new TextEncoder().encode(await response.text());
    return bytes.byteLength <= maxBytes ? new TextDecoder().decode(bytes) : undefined;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export async function safeFetch(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SafeFetchResult> {
  if (!isSafePublicUrl(rawUrl)) return { ok: false, reason: "blocked" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isSafePublicUrl(current)) return { ok: false, reason: "blocked" };
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9",
          "User-Agent": "MiloGrowthAuditBot/1.0 (+https://milogrowth.com)",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, reason: "http_error" };
        if (hop >= MAX_REDIRECTS) return { ok: false, reason: "too_many_redirects" };
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) return { ok: false, reason: "http_error" };
      const contentType = response.headers.get("content-type") ?? "";
      if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
        return { ok: false, reason: "blocked" };
      }
      const body = await readCapped(response, MAX_BYTES);
      if (body === undefined) return { ok: false, reason: "too_large" };
      return { ok: true, contentType, body };
    }
    return { ok: false, reason: "too_many_redirects" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}
