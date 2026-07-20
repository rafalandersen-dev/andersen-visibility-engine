/**
 * Shared safe outbound-fetch layer — Article Studio 2.0 / P1.1 (adversarial-review
 * fix). Used by BOTH source validation and sitemap fetching so there is one SSRF
 * boundary, not two lexical ones.
 *
 * What it enforces (all runtimes):
 *  - http/https only; reject embedded credentials (user:pass@host).
 *  - Reject any IP-LITERAL destination that is not globally routable, in every
 *    representation: dotted/decimal/hex/octal IPv4 (canonicalised by the URL
 *    parser, then range-classified), IPv6 incl. `::`, `::1`, `fe80::/10`,
 *    `fc00::/7`, and IPv4-mapped/compat (`::ffff:169.254.169.254`, `::127.0.0.1`).
 *  - Normalise the host (lowercase, strip a trailing dot) before classifying, so
 *    `localhost.` and `LOCALHOST` are caught.
 *  - Manual redirects, capped, with the SAME validation re-applied to every hop.
 *  - Response-size cap (streamed) and a request timeout.
 *
 * KNOWN RESIDUAL (documented, not hand-waved): a public hostname whose DNS record
 * points at a private/metadata IP (DNS rebinding) cannot be blocked here without
 * resolve-before-connect, which the Cloudflare Workers runtime does not expose
 * (no functional node:dns). On Workers a subrequest to an internal IP also does
 * not route (egress is via Cloudflare's edge, no VPC/IMDS reachable), so this is
 * not currently exploitable — but the proper fix on any Node/self-hosted runtime
 * is an egress allowlist/proxy that pins the resolved IP. Authenticated access is
 * NOT a mitigation.
 */

export const SAFE_FETCH_MAX_REDIRECTS = 3;
export const SAFE_FETCH_MAX_BYTES = 5_000_000;
export const SAFE_FETCH_TIMEOUT_MS = 8000;

/**
 * Runtime egress guard (DNS-rebinding residual — Phase D). Because a lexical
 * guard cannot stop DNS rebinding without resolve-before-connect (unavailable on
 * Cloudflare Workers), outbound source/sitemap fetching is FAIL-CLOSED unless the
 * operator EXPLICITLY declares that the runtime's egress is safe, via
 * `MILO_OUTBOUND_FETCH_MODE`:
 *   - "workers"     — the approved Cloudflare Workers deployment (egress via CF's
 *                     edge cannot reach RFC1918 / loopback / metadata).
 *   - "egress-proxy"— a Node/self-hosted deployment fronted by an egress
 *                     allowlist/proxy that pins the resolved destination IP.
 * Any other/unset value → outbound fetch is refused. This is a deliberate config
 * guard, NOT brittle runtime sniffing, and NOT "authenticated users are enough".
 * REQUIRED deploy step: set MILO_OUTBOUND_FETCH_MODE=workers on the current deploy.
 */
export const OUTBOUND_FETCH_MODE_ENV = "MILO_OUTBOUND_FETCH_MODE";
const APPROVED_OUTBOUND_MODES = new Set(["workers", "egress-proxy"]);

export function outboundFetchAllowed(): boolean {
  const mode =
    typeof process !== "undefined" && process.env
      ? process.env[OUTBOUND_FETCH_MODE_ENV]
      : undefined;
  return Boolean(mode && APPROVED_OUTBOUND_MODES.has(mode));
}

/** Parse a dotted-decimal IPv4 into 4 octets, or null. */
function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function ipv4Category(o: number[]): string {
  const [a, b, c] = o;
  if (a === 0) return "reserved"; // 0.0.0.0/8
  if (a === 127) return "loopback";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 169 && b === 254) return "linklocal"; // incl. 169.254.169.254 (metadata)
  if (a === 100 && b >= 64 && b <= 127) return "reserved"; // CGNAT 100.64/10
  if (a === 192 && b === 0 && c === 0) return "reserved"; // 192.0.0.0/24
  if (a >= 224 && a <= 239) return "multicast";
  if (a >= 240) return "reserved"; // 240/4 incl. 255.255.255.255
  return "global";
}

/** Expand an IPv6 host (no brackets) into 8 hextets, or null if not IPv6. */
function parseIpv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let s = host;
  // Embedded dotted IPv4 (::ffff:a.b.c.d) → convert the tail to two hextets.
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
  if (h.every((x) => x === 0)) return "unspecified"; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return "loopback"; // ::1
  // IPv4-mapped (::ffff:x) or IPv4-compat (::x) — classify the embedded IPv4.
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    const v4 = [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff];
    const cat = ipv4Category(v4);
    if (cat !== "global") return cat;
    return h[5] === 0xffff ? "global" : "reserved"; // ::x compat form is deprecated
  }
  const first = h[0];
  if ((first & 0xffc0) === 0xfe80) return "linklocal"; // fe80::/10
  if ((first & 0xfe00) === 0xfc00) return "private"; // fc00::/7 (ULA)
  if ((first & 0xff00) === 0xff00) return "multicast"; // ff00::/8
  return "global";
}

/**
 * Classify a URL host: "global" (routable), "hostname" (a DNS name we cannot
 * resolve here), or a non-routable category (loopback/private/linklocal/…).
 */
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

/**
 * True when a URL is safe to fetch: http/https, no embedded credentials, and the
 * host is either globally-routable or a (non-literal) DNS name. Every IP-literal
 * private/reserved form is rejected.
 */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL((raw || "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false; // reject user:pass@host
  const cat = hostCategory(u.hostname);
  return cat === "global" || cat === "hostname";
}

export type SafeFetchReason =
  "blocked" | "timeout" | "network" | "too_many_redirects" | "http_error";
export type SafeFetchResult =
  | { ok: true; status: number; contentType: string; body: string; finalUrl: string }
  | { ok: false; reason: SafeFetchReason; status?: number };

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Bytes to read (0 = don't read the body — reachability only). */
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

/** Read a response body up to `maxBytes`, cancelling the stream past the cap. */
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

/**
 * Bounded, SSRF-guarded fetch with manual redirect revalidation. Never throws —
 * returns an explicit `{ok:false, reason}` for blocked / timeout / network /
 * too_many_redirects / http_error.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const method = opts.method ?? "GET";
  const maxBytes = opts.maxBytes ?? 0;
  const maxRedirects = opts.maxRedirects ?? SAFE_FETCH_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS;
  // Fail closed unless the operator declared a safe egress runtime (Phase D).
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
