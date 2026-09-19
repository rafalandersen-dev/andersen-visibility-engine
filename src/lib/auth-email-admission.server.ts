/** Per-source, per-action signup/recovery admission. Existing service-role-only
 * atomic counters; no recipient addresses, source IPs or authentication secrets
 * are stored as counter keys — every key is an HMAC digest. Source/action
 * counters are checked BEFORE the shared recipient counters, so a source over its
 * own bounded quota is rejected before it can create or increment any recipient
 * row; it cannot mint recipient counters for a spread of fresh names or drain a
 * known recipient's allowance. Recipient counters are shared across signup and
 * recovery so switching action grants no extra recipient allowance; source
 * counters are scoped per action so signup pressure cannot drain recovery
 * capacity, and no universal all-users bucket exists that a spread of nonexistent
 * recipients could exhaust for everyone. Fixed windows can admit adjacent-window
 * bursts; these are request limits, not inbox delivery counts, and do not stop
 * distributed abuse from many independent sources.
 */
import { isIP } from "node:net";

export interface AuthEmailCounter {
  rpc(
    name: "bump_rate_limit",
    args: {
      p_bucket: string;
      p_key: string;
      p_window_start: string;
    },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export type AuthEmailAction = "signup" | "recovery";

type Scope = "recipient" | "source";

const RULES: ReadonlyArray<{ bucket: string; seconds: number; limit: number; scope: Scope }> = [
  // Source counters run FIRST and are per source AND per action; bounded
  // private-beta policy. A source over its quota is rejected here before any
  // shared recipient counter is touched, so it cannot create recipient rows for
  // fresh names or exhaust a known recipient's allowance. Tradeoff: every
  // attempt now consumes source quota first, so repeated requests for one
  // already-limited recipient still spend the (bounded, self-inflicted) source
  // budget instead of being denied at the recipient counter first.
  { bucket: "auth_email_source_minute", seconds: 60, limit: 3, scope: "source" },
  { bucket: "auth_email_source_hour", seconds: 3600, limit: 20, scope: "source" },
  // Recipient counters are shared across both actions; a source that clears its
  // own quota still cannot exceed one recipient per minute or six per hour.
  { bucket: "auth_email_recipient_minute", seconds: 60, limit: 1, scope: "recipient" },
  { bucket: "auth_email_recipient_hour", seconds: 3600, limit: 6, scope: "recipient" },
];

const UNAVAILABLE = "Email requests are temporarily unavailable. Please try again later.";

function parseOctets(dotted: string): number[] | null {
  const parts = dotted.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function canonicalIPv6(address: string): string | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const parts = side.split(":");
    const groups: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes(".")) {
        // A trailing dotted-quad encodes the final two 16-bit groups.
        if (i !== parts.length - 1) return null;
        const octets = parseOctets(part);
        if (!octets) return null;
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };

  let groups: number[];
  if (halves.length === 2) {
    const left = parseSide(halves[0]);
    const right = parseSide(halves[1]);
    if (!left || !right) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  } else {
    const parsed = parseSide(address);
    if (!parsed) return null;
    groups = parsed;
  }
  if (groups.length !== 8) return null;

  // IPv4-mapped (::ffff:a.b.c.d) scopes by the embedded IPv4, not the shared
  // ::ffff:0:0/96 range that would otherwise collapse every mapped client.
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const a = groups[6] >> 8;
    const b = groups[6] & 0xff;
    const c = groups[7] >> 8;
    const d = groups[7] & 0xff;
    return `4:${a}.${b}.${c}.${d}`;
  }

  // Group by /64: the network prefix (first four 16-bit groups), zero-padded
  // lowercase. Equivalent notations collapse to one key, and privacy-extension
  // interface-identifier rotation inside a subnet cannot mint fresh allowances.
  const prefix = groups
    .slice(0, 4)
    .map((g) => g.toString(16).padStart(4, "0"))
    .join(":");
  return `6:${prefix}`;
}

/** Canonicalize the trusted-edge client IP into a stable scope key. The value is
 * only ever HMAC input; no raw address is stored or logged. Returns null for a
 * missing or unparseable source so the caller can fail closed. */
function canonicalizeSource(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const version = isIP(trimmed);
  if (version === 4) {
    const octets = parseOctets(trimmed);
    return octets ? `4:${octets.join(".")}` : null;
  }
  if (version === 6) return canonicalIPv6(trimmed);
  return null;
}

export async function admitAuthEmail(
  counter: AuthEmailCounter,
  request: {
    email: string;
    source: string | null | undefined;
    action: AuthEmailAction;
    secret: string;
  },
  nowMs = Date.now(),
): Promise<void> {
  const { email, source, action, secret } = request;
  if (!secret || !Number.isFinite(nowMs)) throw new Error(UNAVAILABLE);
  // Malformed action fails closed: no shared allowance is created for it.
  if (action !== "signup" && action !== "recovery") throw new Error(UNAVAILABLE);
  // The source must come from the server runtime (getRequestIP({ xForwardedFor:
  // false }) -> trusted cf-connecting-ip), never a client-supplied header. A
  // missing or unparseable value fails closed before any RPC or admin call
  // rather than sharing one universal "unknown" bucket.
  const canonicalSource = canonicalizeSource(source);
  if (!canonicalSource) throw new Error(UNAVAILABLE);
  const recipient = email.trim().toLowerCase();

  // HMAC prevents offline address/source guessing from a counter-table disclosure.
  const encoder = new TextEncoder();
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new Error(UNAVAILABLE);
  }

  for (const rule of RULES) {
    let count: unknown;
    try {
      // Recipient counters ignore the action (shared); source counters fold the
      // action in so signup and recovery hold separate per-source quotas and a
      // distinct source cannot consume another source's allowance.
      const material =
        rule.scope === "recipient"
          ? `${rule.bucket}:${recipient}`
          : `${rule.bucket}:${action}:${canonicalSource}`;
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(material));
      const digest = Array.from(new Uint8Array(signature), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const result = await counter.rpc("bump_rate_limit", {
        p_bucket: rule.bucket,
        p_key: digest,
        p_window_start: new Date(
          Math.floor(nowMs / (rule.seconds * 1000)) * rule.seconds * 1000,
        ).toISOString(),
      });
      if (result.error) throw new Error(UNAVAILABLE);
      count = result.data;
      if (
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 2_147_483_647
      )
        throw new Error(UNAVAILABLE);
    } catch {
      throw new Error(UNAVAILABLE);
    }
    if ((count as number) > rule.limit)
      throw new Error("Too many email requests. Please wait before trying again.");
  }
}
