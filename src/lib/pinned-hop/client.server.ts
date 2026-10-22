/**
 * App adapter (Workers-safe) for the pinned-hop service — CC candidate,
 * default OFF, homepage purpose of website knowledge intake ONLY.
 *
 * The app keeps every policy decision: URL rules, DoH resolution through the
 * supported `Resolver` path (never `dns.lookup`), vetting of ALL answers,
 * per-hop redirect re-authorization, HTTPS→HTTP downgrade refusal and the
 * caller's budget. The service performs one connection to the vetted address.
 *
 * Honest outcomes: a cold, busy or unreachable service yields a retryable
 * `transport_unavailable` / `transport_busy` / `timeout` inside the caller's
 * budget. Nothing is retried automatically. A response that is late, foreign
 * (other request/hop/nonce), oversized, unsigned or malformed is refused.
 * Admission/technical context is refused before any DNS or network call.
 */
import { isIP } from "node:net";
import { HOMEPAGE_TIMEOUT_MS, isPublicHomepageAddress, pageUrl } from "../homepage-fetch.server";
import { resolveTechnicalAddresses } from "../technical-dns.server";
import {
  HOP_LABELS,
  HOP_MAX_INDEX,
  HOP_MAX_MS,
  HOP_MAX_REQUEST_BYTES,
  HOP_MAX_RESPONSE_BYTES,
  HOP_MIN_MS,
  HOP_SIGNATURE_HEADER,
  challengeResponseSchema,
  fromBase64,
  hopResponseSchema,
  importHopKey,
  randomHex16,
  signHop,
  utf8,
  verifyHop,
  type HopCode,
} from "./protocol";

export type PinnedHopConfig = {
  endpoint: string;
  key: string | CryptoKey;
  /** Caller budget for the whole homepage read, app-local monotonic clock. */
  budgetMs?: number;
  fetchImpl?: typeof fetch;
  resolve?: (
    hostname: string,
    signal: AbortSignal,
  ) => Promise<{ address: string; family: number }[]>;
  now?: () => number;
};
export type PinnedHopOutcome = { html: string; code: HopCode; retryable: boolean; hops: number };
/** The existing caller budget for a whole homepage read (DNS, challenge, every
 * hop and redirect). Overrides may only SHORTEN it; the service-local 8 s hop
 * ceiling is separate and never extends caller acceptance. */
export const PINNED_HOP_DEFAULT_BUDGET_MS = HOMEPAGE_TIMEOUT_MS;
const RESPONSE_MARGIN_MS = 750;
/** Time reserved for signing the hop request; if signing takes longer the hop is
 * not dispatched, so the service is never asked for more than truly remains. */
const SIGNING_ALLOWANCE_MS = 250;
const RETRYABLE = new Set<HopCode>(["transport_unavailable", "transport_busy", "timeout"]);

class HopStop extends Error {
  constructor(readonly code: HopCode) {
    super(code);
  }
}
const CORE_URL_CODES = new Set(["blocked_url", "blocked_host"]);
function urlOrStop(raw: string) {
  try {
    return pageUrl(raw, 4096);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new HopStop(CORE_URL_CODES.has(message) ? (message as HopCode) : "blocked_url");
  }
}
/** Refuses admission/technical context before any DNS or network operation. */
export function assertHomepageOnly(context: unknown) {
  if (context === undefined || context === null) return;
  if (typeof context !== "object") throw new Error("technical_unsupported");
  const record = context as Record<string, unknown>;
  if (
    "admit" in record ||
    "admission" in record ||
    "authorize" in record ||
    ("purpose" in record && record.purpose !== "homepage")
  )
    throw new Error("technical_unsupported");
}

async function readLimited(response: Response, limit: number, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new HopStop("response_invalid");
      parts.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

export async function fetchHomepageViaPinnedHop(
  raw: string,
  config: PinnedHopConfig,
  context?: unknown,
): Promise<PinnedHopOutcome> {
  assertHomepageOnly(context);
  const now = config.now ?? (() => performance.now());
  const doFetch = config.fetchImpl ?? fetch;
  const resolve = config.resolve ?? resolveTechnicalAddresses;
  const budget = config.budgetMs ?? PINNED_HOP_DEFAULT_BUDGET_MS;
  if (!Number.isInteger(budget) || budget < 1 || budget > HOMEPAGE_TIMEOUT_MS)
    throw new Error("hop_budget_invalid"); // configuration error, before any network
  const started = now();
  const deadline = started + budget;
  // App-local monotonic deadline checked explicitly at every asynchronous
  // boundary: timer delivery alone is not relied on, and nothing that arrives
  // at or after the deadline is accepted (no wall-clock or cross-clock claim).
  const onTime = () => {
    if (controller.signal.aborted || now() >= deadline) throw new HopStop("timeout");
  };
  const endpoint = config.endpoint.replace(/\/+$/, "");
  let hops = 0;
  // A missing/short key is a configuration error, never a retryable outcome.
  const key = typeof config.key === "string" ? await importHopKey(config.key) : config.key;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    let url = urlOrStop(raw);
    for (let hop = 0; hop <= HOP_MAX_INDEX; hop++) {
      hops = hop + 1;
      onTime(); // key import or the previous hop may already have used the budget
      // DNS: supported DoH path, ALL answers vetted, one chosen, never re-resolved.
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      let addresses: { address: string; family: number }[];
      try {
        addresses = isIP(hostname)
          ? [{ address: hostname, family: isIP(hostname) }]
          : await resolve(hostname, controller.signal);
      } catch {
        throw new HopStop(controller.signal.aborted ? "timeout" : "dns_unavailable");
      }
      if (
        !addresses.length ||
        addresses.length > 64 ||
        addresses.some((r) => !isPublicHomepageAddress(r.address))
      )
        throw new HopStop("blocked_address");
      const chosen = addresses.find((r) => r.family === 4) ?? addresses[0];
      // Single-use challenge bound to the service's current incarnation.
      const clientNonce = randomHex16();
      const challengeBody = utf8(JSON.stringify({ v: 1, purpose: "homepage", clientNonce }));
      const challengeSignature = await signHop(key, HOP_LABELS.challengeRequest, challengeBody);
      onTime(); // signing is an async boundary: check immediately before dispatch
      let challengeResponse: Response;
      try {
        challengeResponse = await doFetch(endpoint + "/v1/challenge", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [HOP_SIGNATURE_HEADER]: challengeSignature,
          },
          body: challengeBody,
          signal: controller.signal,
          redirect: "manual",
        });
      } catch {
        throw new HopStop(
          controller.signal.aborted ? "transport_unavailable" : "transport_unavailable",
        );
      }
      if (challengeResponse.status === 401) throw new HopStop("auth_refused");
      if (challengeResponse.status === 503) throw new HopStop("transport_busy");
      if (challengeResponse.status !== 200) throw new HopStop("transport_unavailable");
      const challengeBytes = await readLimited(challengeResponse, 1024, controller.signal);
      if (
        !(await verifyHop(
          key,
          HOP_LABELS.challengeResponse,
          challengeBytes,
          challengeResponse.headers.get(HOP_SIGNATURE_HEADER),
        ))
      )
        throw new HopStop("response_invalid");
      onTime(); // a late challenge is never used
      const issued = challengeResponseSchema.safeParse(parseJson(challengeBytes));
      if (!issued.success || issued.data.clientNonce !== clientNonce)
        throw new HopStop("response_invalid");

      onTime();
      const maxMs = Math.min(
        HOP_MAX_MS,
        Math.floor(deadline - now() - RESPONSE_MARGIN_MS - SIGNING_ALLOWANCE_MS),
      );
      if (maxMs < HOP_MIN_MS) throw new HopStop("timeout");
      const requestId = crypto.randomUUID();
      const hopBody = utf8(
        JSON.stringify({
          v: 1,
          requestId,
          hop,
          purpose: "homepage",
          url: url.href,
          address: chosen.address,
          family: chosen.family,
          maxMs,
          incarnation: issued.data.incarnation,
          nonce: issued.data.nonce,
        }),
      );
      if (hopBody.byteLength > HOP_MAX_REQUEST_BYTES) throw new HopStop("request_too_large");
      const hopSignature = await signHop(key, HOP_LABELS.hopRequest, hopBody);
      // Immediately before dispatch: past the deadline, or signing used more than
      // its allowance (the signed maxMs would then exceed what remains) — no hop.
      onTime();
      if (deadline - now() - RESPONSE_MARGIN_MS < maxMs) throw new HopStop("timeout");
      let hopResponse: Response;
      try {
        hopResponse = await doFetch(endpoint + "/v1/hop", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [HOP_SIGNATURE_HEADER]: hopSignature,
          },
          body: hopBody,
          signal: controller.signal,
          redirect: "manual",
        });
      } catch {
        // Lost or aborted: the remote outcome is unknown. No retry.
        throw new HopStop(controller.signal.aborted ? "timeout" : "transport_unavailable");
      }
      if (hopResponse.status === 401) throw new HopStop("auth_refused");
      if (hopResponse.status === 409) throw new HopStop("replay_refused");
      if (hopResponse.status === 422) throw new HopStop("technical_unsupported");
      if (hopResponse.status !== 200 && hopResponse.status !== 503)
        throw new HopStop("response_invalid");
      const bytes = await readLimited(hopResponse, HOP_MAX_RESPONSE_BYTES, controller.signal);
      if (
        !(await verifyHop(
          key,
          HOP_LABELS.hopResponse,
          bytes,
          hopResponse.headers.get(HOP_SIGNATURE_HEADER),
        ))
      )
        throw new HopStop("response_invalid");
      const parsed = hopResponseSchema.safeParse(parseJson(bytes));
      // Late or foreign envelopes (other request, hop or nonce) are refused.
      if (
        !parsed.success ||
        parsed.data.requestId !== requestId ||
        parsed.data.hop !== hop ||
        parsed.data.nonce !== issued.data.nonce
      )
        throw new HopStop("response_invalid");
      onTime(); // a matching, correctly signed but late result/redirect is refused
      const envelope = parsed.data;
      if (envelope.kind === "failed") throw new HopStop(envelope.code);
      if (envelope.kind === "redirect") {
        if (!envelope.location || hop === HOP_MAX_INDEX) throw new HopStop("redirect_refused");
        let next: URL;
        try {
          next = urlOrStop(new URL(envelope.location, url).toString());
        } catch (error) {
          throw error instanceof HopStop ? error : new HopStop("blocked_url");
        }
        if (url.protocol === "https:" && next.protocol !== "https:")
          throw new HopStop("downgrade_refused");
        url = next;
        continue;
      }
      if (envelope.status < 200 || envelope.status >= 300)
        return { html: "", code: "http_error", retryable: false, hops };
      if (!envelope.contentAccepted)
        return { html: "", code: "content_rejected", retryable: false, hops };
      return { html: fromBase64(envelope.bodyB64), code: "ok", retryable: false, hops };
    }
    throw new HopStop("redirect_refused");
  } catch (error) {
    const code: HopCode =
      error instanceof HopStop
        ? error.code
        : controller.signal.aborted
          ? "timeout"
          : "transport_unavailable";
    return { html: "", code, retryable: RETRYABLE.has(code), hops };
  } finally {
    clearTimeout(timer);
  }
}

/** Default OFF: enabled only when BOTH variables are set and the endpoint is HTTPS. */
export function pinnedHopConfigFromEnv(): PinnedHopConfig | null {
  const env = typeof process === "undefined" ? undefined : process.env;
  const endpoint = env?.MILO_PINNED_HOP_URL?.trim();
  const key = env?.MILO_PINNED_HOP_KEY;
  if (!endpoint || !key || !/^https:\/\//i.test(endpoint)) return null;
  return { endpoint, key };
}
