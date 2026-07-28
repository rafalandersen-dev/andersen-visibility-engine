export const SAFE_FETCH_MAX_REDIRECTS = 3;
export const SAFE_FETCH_MAX_BYTES = 5_000_000;
export const SAFE_FETCH_TIMEOUT_MS = 8000;

export const OUTBOUND_FETCH_MODE_ENV = "MILO_OUTBOUND_FETCH_MODE";
const APPROVED_OUTBOUND_MODES = new Set(["workers", "egress-proxy"]);

export function outboundFetchAllowed(): boolean {
  const mode =
    typeof process !== "undefined" && process.env
      ? process.env[OUTBOUND_FETCH_MODE_ENV]
      : undefined;
  return Boolean(mode && APPROVED_OUTBOUND_MODES.has(mode));
}

function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function ipv4Category(o: number[]): string {
  const [a, b, c] = o;
  if (a === 0) return "reserved";
  if (a === 127) return "loopback";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 169 && b === 254) return "linklocal";
  if (a === 100 && b >= 64 && b <= 127) return "reserved";
  if (a === 192 && b === 0 && c === 0) return "reserved";
  if (a >= 224 && a <= 239) return "multicast";
  if (a >= 240) return "reserved";
  return "global";
}

function parseIpv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let s = host;
  const lastColon = s.lastIndexOf(":");
  const v4 = parseIpv4(s.slice(lastColon + 1));
  if (v4) {
    const h6 = ((v4[0] << 8) | v4[1]).toString(16);
    const h7 = ((v4[2] << 8) | v4[3]).toString(16);
    s = s.slice(0, lastColon + 1) + h6 + ":" + h7;
  }
  const parts = s.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  let groups: string[];
  if (parts.length === 1) {
    groups = head;
    if (groups.length !== 8) return null;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
    if (groups.length !== 8) return null;
  }
  const nums = groups.map((g) => parseInt(g || "0", 16));
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

function ipv6Category(h: number[]): string {
  if (h.every((x) => x === 0)) return "unspecified";
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return "loopback";
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    const v4 = [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff];
    const cat = ipv4Category(v4);
    if (cat !== "global") return cat;
    return h[5] === 0xffff ? "global" : "reserved";
  }
  const first = h[0];
  if ((first & 0xffc0) === 0xfe80) return "linklocal";
  if ((first & 0xfe00) === 0xfc00) return "private";
  if ((first & 0xff00) === 0xff00) return "multicast";
  return "global";
}

export function hostCategory(rawHost: string): string {
  const host = (rawHost || "")
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (!host) return "reserved";
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  const v4 = parseIpv4(host);
  if (v4) return ipv4Category(v4);
  const v6 = parseIpv6(host);
  if (v6) return ipv6Category(v6);
  return "hostname";
}

export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL((raw || "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (
    u.port &&
    !((u.protocol === "http:" && u.port === "80") ||
      (u.protocol === "https:" && u.port === "443"))
  ) {
    return false;
  }
  const cat = hostCategory(u.hostname);
  return cat === "global" || cat === "hostname";
}

export type SafeFetchReason =
  | "blocked"
  | "timeout"
  | "network"
  | "too_many_redirects"
  | "http_error";
export type SafeFetchResult =
  | { ok: true; status: number; contentType: string; body: string; finalUrl: string }
  | { ok: false; reason: SafeFetchReason; status?: number };

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (maxBytes <= 0) return "";
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  const capped = Math.min(total, maxBytes);
  const out = new Uint8Array(capped);
  let off = 0;
  for (const c of chunks) {
    if (off >= capped) break;
    const take = Math.min(c.length, capped - off);
    out.set(c.subarray(0, take), off);
    off += take;
  }
  return new TextDecoder().decode(out);
}

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const method = opts.method ?? "GET";
  const maxBytes = opts.maxBytes ?? 0;
  const maxRedirects = opts.maxRedirects ?? SAFE_FETCH_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS;
  if (!outboundFetchAllowed()) return { ok: false, reason: "blocked" };
  if (!isSafePublicUrl(rawUrl)) return { ok: false, reason: "blocked" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!isSafePublicUrl(current)) return { ok: false, reason: "blocked" };
      const res = await fetch(current, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: opts.headers,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, reason: "http_error", status: res.status };
        if (hop >= maxRedirects) return { ok: false, reason: "too_many_redirects" };
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
      const contentType = res.headers.get("content-type") ?? "";
      const body = await readCapped(res, maxBytes);
      return { ok: true, status: res.status, contentType, body, finalUrl: current };
    }
    return { ok: false, reason: "too_many_redirects" };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    return { ok: false, reason: timedOut ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
