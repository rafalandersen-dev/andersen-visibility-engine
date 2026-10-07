/**
 * Pinned-hop wire protocol (CC knowledge-transport candidate, default OFF).
 *
 * Runtime-neutral (WebCrypto + zod): used by the app adapter (Workers) and the
 * Node service. Scope of this increment: the HOMEPAGE purpose of website
 * knowledge intake only. Every other purpose, and anything carrying admission
 * context, is refused before any outbound connection.
 *
 * Replay invariant (replaces the rejected CB timestamp/process-start fence):
 * no timestamps cross the wire. Each hop must redeem a single-use nonce that the
 * serving process issued from its current random incarnation; redemption is a
 * synchronous delete in that process. A restart creates a new incarnation and
 * an empty nonce table, so every request signed for an earlier incarnation is
 * refused regardless of any clock. Challenges are themselves authenticated, so
 * the service is not a signing oracle; it only ever returns random values.
 */
import { z } from "zod";

export const HOP_PROTOCOL_VERSION = 1;
export const HOP_MAX_REQUEST_BYTES = 16_384;
export const HOP_MAX_INDEX = 3; // at most 4 hops: 3 redirects
export const HOP_MIN_MS = 500;
export const HOP_MAX_MS = 8_000;
export const HOP_MAX_PENDING_CHALLENGES = 64;
export const HOP_CHALLENGE_TTL_MS = 20_000;
export const HOP_MAX_CONCURRENT = 4;
/** base64(≤ 3 × 300 000 UTF-8 bytes) + allowlisted headers (escaped) + location + fixed fields. */
export const HOP_MAX_RESPONSE_BYTES = 1_200_000 + 256_000 + 8_192 + 2_048;
export const HOP_MIN_KEY_BYTES = 32;

/** Fixed, public-safe codes. Never URLs, bodies, headers or credentials. */
export const HOP_CODES = [
  "ok",
  "bad_request",
  "request_too_large",
  "auth_refused",
  "replay_refused",
  "technical_unsupported",
  "transport_busy",
  "transport_unavailable",
  "timeout",
  "blocked_url",
  "blocked_host",
  "blocked_address",
  "redirect_refused",
  "downgrade_refused",
  "http_error",
  "header_limit",
  "unsupported_encoding",
  "too_many_chunks",
  "incomplete_page",
  "connect_failed",
  "response_invalid",
  "dns_unavailable",
  "content_rejected",
] as const;
export type HopCode = (typeof HOP_CODES)[number];
const KNOWN_CORE_CODES = new Set<string>([
  "blocked_url",
  "blocked_host",
  "blocked_address",
  "http_error",
  "header_limit",
  "unsupported_encoding",
  "too_many_chunks",
  "incomplete_page",
]);
/** Map an exception from the pinned core to a fixed code (own-key lookup only). */
export function hopCodeFromError(error: unknown, aborted: boolean): HopCode {
  if (aborted) return "timeout";
  const message = error instanceof Error && typeof error.message === "string" ? error.message : "";
  return KNOWN_CORE_CODES.has(message) ? (message as HopCode) : "connect_failed";
}

const hex32 = z.string().regex(/^[0-9a-f]{32}$/);
export const challengeRequestSchema = z
  .object({
    v: z.literal(HOP_PROTOCOL_VERSION),
    purpose: z.literal("homepage"),
    clientNonce: hex32,
  })
  .strict();
export const challengeResponseSchema = z
  .object({
    v: z.literal(HOP_PROTOCOL_VERSION),
    clientNonce: hex32,
    incarnation: hex32,
    nonce: hex32,
  })
  .strict();
export const hopRequestSchema = z
  .object({
    v: z.literal(HOP_PROTOCOL_VERSION),
    requestId: z.string().uuid(),
    hop: z.number().int().min(0).max(HOP_MAX_INDEX),
    purpose: z.literal("homepage"),
    url: z.string().min(1).max(4096),
    address: z.string().min(2).max(64),
    family: z.union([z.literal(4), z.literal(6)]),
    maxMs: z.number().int().min(HOP_MIN_MS).max(HOP_MAX_MS),
    incarnation: hex32,
    nonce: hex32,
  })
  .strict();
export type HopRequest = z.infer<typeof hopRequestSchema>;
const binding = {
  v: z.literal(HOP_PROTOCOL_VERSION),
  requestId: z.string().uuid(),
  hop: z.number().int().min(0).max(HOP_MAX_INDEX),
  nonce: hex32,
};
const headerValue = z.string().max(32_000);
export const hopResponseSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...binding,
      kind: z.literal("redirect"),
      status: z.number().int().min(300).max(399),
      location: z.string().max(8192).nullable(),
    })
    .strict(),
  z
    .object({
      ...binding,
      kind: z.literal("response"),
      status: z.number().int().min(100).max(599),
      headers: z
        .object({
          "content-type": headerValue.optional(),
          "content-range": headerValue.optional(),
          "x-robots-tag": headerValue.optional(),
          link: headerValue.optional(),
        })
        .strict(),
      contentAccepted: z.boolean(),
      truncated: z.boolean(),
      bodyB64: z
        .string()
        .max(1_200_000)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    })
    .strict(),
  z.object({ ...binding, kind: z.literal("failed"), code: z.enum(HOP_CODES) }).strict(),
]);
export type HopResponse = z.infer<typeof hopResponseSchema>;

/** Distinct labels: a signature for one message type is never valid for another. */
export const HOP_LABELS = {
  challengeRequest: "milo-pinned-hop/challenge-request/v1",
  challengeResponse: "milo-pinned-hop/challenge-response/v1",
  hopRequest: "milo-pinned-hop/hop-request/v1",
  hopResponse: "milo-pinned-hop/hop-response/v1",
} as const;
export type HopLabel = (typeof HOP_LABELS)[keyof typeof HOP_LABELS];

const encoder = new TextEncoder();
export function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(value));
}
function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
function unhex(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function randomHex16() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}
/** Imports a shared HMAC key; refuses short keys. The key never leaves this object. */
export async function importHopKey(secret: string): Promise<CryptoKey> {
  const raw = utf8(secret);
  if (raw.byteLength < HOP_MIN_KEY_BYTES) throw new Error("hop_key_too_short");
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}
function framed(label: HopLabel, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = utf8(label + "\n");
  const out = new Uint8Array(head.byteLength + body.byteLength);
  out.set(head, 0);
  out.set(body, head.byteLength);
  return out;
}
export async function signHop(key: CryptoKey, label: HopLabel, body: Uint8Array) {
  return hex(await crypto.subtle.sign("HMAC", key, framed(label, body)));
}
/** Constant-time verification (WebCrypto verify). */
export async function verifyHop(
  key: CryptoKey,
  label: HopLabel,
  body: Uint8Array,
  signature: string | null | undefined,
) {
  const mac = typeof signature === "string" ? unhex(signature) : null;
  if (!mac) return false;
  return crypto.subtle.verify("HMAC", key, mac, framed(label, body));
}
export function toBase64(text: string) {
  const bytes = utf8(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
export const HOP_SIGNATURE_HEADER = "x-milo-hop-signature";
