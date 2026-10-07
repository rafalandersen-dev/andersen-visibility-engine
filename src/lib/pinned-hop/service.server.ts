/**
 * Node pinned-hop service (CC knowledge-transport candidate, default OFF, not
 * deployed). Serves exactly three routes:
 *   GET  /healthz       readiness only — never fetches a destination, never
 *                       touches a lease, never issues a nonce.
 *   POST /v1/challenge  authenticated; issues one single-use nonce bound to this
 *                       process incarnation (bounded table, monotonic TTL).
 *   POST /v1/hop        authenticated; redeems that nonce exactly once, then
 *                       performs ONE pinned homepage hop to the caller-vetted
 *                       address with the existing core. No DNS, no redirects.
 * A concurrency slot is held until the hop promise settles, i.e. after the core
 * has destroyed the socket — client abort or network loss never frees it early.
 * The hop's lifetime is a service-local monotonic timer; no cross-clock deadline
 * is trusted. Logs carry fixed codes only.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readPinnedHomepageHop, type PinnedHomepageHop } from "../homepage-fetch.server";
import {
  HOP_CHALLENGE_TTL_MS,
  HOP_LABELS,
  HOP_MAX_CONCURRENT,
  HOP_MAX_PENDING_CHALLENGES,
  HOP_MAX_REQUEST_BYTES,
  HOP_SIGNATURE_HEADER,
  challengeRequestSchema,
  hopCodeFromError,
  hopRequestSchema,
  randomHex16,
  signHop,
  toBase64,
  utf8,
  verifyHop,
  type HopCode,
  type HopLabel,
  type HopResponse,
} from "./protocol";

export type HopLogEvent = {
  route: "challenge" | "hop" | "health" | "other";
  code: HopCode;
  hop?: number;
  ms: number;
  bytes?: number;
};
export type PinnedHopServiceOptions = {
  key: CryptoKey;
  hop?: (
    url: string,
    address: { address: string; family: number },
    signal: AbortSignal,
  ) => Promise<PinnedHomepageHop>;
  random?: () => string;
  now?: () => number;
  log?: (event: HopLogEvent) => void;
  maxPending?: number;
  challengeTtlMs?: number;
  maxConcurrent?: number;
};

class BodyTooLarge extends Error {}
async function readBody(req: IncomingMessage, cap: number): Promise<Uint8Array> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > cap) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > cap) throw new BodyTooLarge();
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks, size));
}

export function createPinnedHopService(options: PinnedHopServiceOptions) {
  const random = options.random ?? randomHex16;
  const now = options.now ?? (() => performance.now());
  const hop = options.hop ?? readPinnedHomepageHop;
  const log = options.log ?? (() => {});
  const maxPending = options.maxPending ?? HOP_MAX_PENDING_CHALLENGES;
  const ttl = options.challengeTtlMs ?? HOP_CHALLENGE_TTL_MS;
  const maxConcurrent = options.maxConcurrent ?? HOP_MAX_CONCURRENT;
  const incarnation = random();
  const pending = new Map<string, number>(); // nonce -> monotonic expiry
  let inFlight = 0;

  function purge() {
    const t = now();
    for (const [nonce, expiry] of pending) if (expiry <= t) pending.delete(nonce);
  }
  function send(res: ServerResponse, status: number, body: Uint8Array, signature?: string) {
    if (res.destroyed || res.writableEnded) return;
    const headers: Record<string, string | number> = {
      "content-type": "application/json",
      "content-length": body.byteLength,
      "cache-control": "no-store",
    };
    if (signature) headers[HOP_SIGNATURE_HEADER] = signature;
    res.writeHead(status, headers);
    res.end(body);
  }
  async function sendSigned(res: ServerResponse, status: number, label: HopLabel, value: unknown) {
    const body = utf8(JSON.stringify(value));
    send(res, status, body, await signHop(options.key, label, body));
  }
  function refuse(res: ServerResponse, status: number, code: HopCode) {
    send(res, status, utf8(JSON.stringify({ code })));
  }

  async function challenge(req: IncomingMessage, res: ServerResponse, started: number) {
    const body = await readBody(req, 1024);
    if (!(await verifyHop(options.key, HOP_LABELS.challengeRequest, body, header(req)))) {
      refuse(res, 401, "auth_refused");
      return log({ route: "challenge", code: "auth_refused", ms: now() - started });
    }
    const parsed = challengeRequestSchema.safeParse(parseJson(body));
    if (!parsed.success) {
      refuse(res, 400, "bad_request");
      return log({ route: "challenge", code: "bad_request", ms: now() - started });
    }
    purge();
    if (pending.size >= maxPending) {
      refuse(res, 503, "transport_busy");
      return log({ route: "challenge", code: "transport_busy", ms: now() - started });
    }
    const nonce = random();
    pending.set(nonce, now() + ttl);
    await sendSigned(res, 200, HOP_LABELS.challengeResponse, {
      v: 1,
      clientNonce: parsed.data.clientNonce,
      incarnation,
      nonce,
    });
    log({ route: "challenge", code: "ok", ms: now() - started });
  }

  async function performHop(req: IncomingMessage, res: ServerResponse, started: number) {
    const body = await readBody(req, HOP_MAX_REQUEST_BYTES);
    if (!(await verifyHop(options.key, HOP_LABELS.hopRequest, body, header(req)))) {
      refuse(res, 401, "auth_refused");
      return log({ route: "hop", code: "auth_refused", ms: now() - started });
    }
    const raw = parseJson(body);
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    // Admission/technical context is unsupported by this transport: refuse
    // before nonce redemption and before any outbound connection.
    if (record && ("admission" in record || "admit" in record || record.purpose !== "homepage")) {
      refuse(res, 422, "technical_unsupported");
      return log({ route: "hop", code: "technical_unsupported", ms: now() - started });
    }
    const parsed = hopRequestSchema.safeParse(raw);
    if (!parsed.success) {
      refuse(res, 400, "bad_request");
      return log({ route: "hop", code: "bad_request", ms: now() - started });
    }
    const request = parsed.data;
    const bind = {
      v: 1 as const,
      requestId: request.requestId,
      hop: request.hop,
      nonce: request.nonce,
    };
    // Atomic single-use redemption: get + delete in one synchronous step.
    const expiry = request.incarnation === incarnation ? pending.get(request.nonce) : undefined;
    pending.delete(request.nonce);
    if (expiry === undefined || expiry <= now()) {
      refuse(res, 409, "replay_refused");
      return log({ route: "hop", code: "replay_refused", hop: request.hop, ms: now() - started });
    }
    if (inFlight >= maxConcurrent) {
      await sendSigned(res, 503, HOP_LABELS.hopResponse, {
        ...bind,
        kind: "failed",
        code: "transport_busy",
      });
      return log({ route: "hop", code: "transport_busy", hop: request.hop, ms: now() - started });
    }
    inFlight++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.maxMs);
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    let envelope: HopResponse;
    try {
      const result = await hop(
        request.url,
        { address: request.address, family: request.family },
        controller.signal,
      );
      envelope =
        result.kind === "redirect"
          ? { ...bind, kind: "redirect", status: result.status, location: result.location }
          : {
              ...bind,
              kind: "response",
              status: result.status,
              headers: result.headers,
              contentAccepted: result.contentAccepted,
              truncated: result.truncated,
              bodyB64: toBase64(result.body),
            };
    } catch (error) {
      envelope = {
        ...bind,
        kind: "failed",
        code: hopCodeFromError(error, controller.signal.aborted),
      };
    } finally {
      // The core has destroyed its socket before its promise settled.
      clearTimeout(timer);
      inFlight--;
    }
    res.off("close", onClose);
    const code: HopCode = envelope.kind === "failed" ? envelope.code : "ok";
    await sendSigned(res, 200, HOP_LABELS.hopResponse, envelope);
    log({ route: "hop", code, hop: request.hop, ms: now() - started });
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = now();
    const path = (req.url ?? "").split("?")[0];
    try {
      if (req.method === "GET" && path === "/healthz") {
        send(res, 200, utf8(JSON.stringify({ ok: true })));
        return log({ route: "health", code: "ok", ms: now() - started });
      }
      if (req.method === "POST" && path === "/v1/challenge")
        return await challenge(req, res, started);
      if (req.method === "POST" && path === "/v1/hop") return await performHop(req, res, started);
      refuse(res, 404, "bad_request");
      log({ route: "other", code: "bad_request", ms: now() - started });
    } catch (error) {
      const code: HopCode = error instanceof BodyTooLarge ? "request_too_large" : "bad_request";
      refuse(res, error instanceof BodyTooLarge ? 413 : 400, code);
      log({ route: "other", code, ms: now() - started });
    }
  }
  return {
    incarnation,
    handle,
    stats: () => {
      purge();
      return { pending: pending.size, inFlight };
    },
  };
}

function header(req: IncomingMessage) {
  const value = req.headers[HOP_SIGNATURE_HEADER];
  return typeof value === "string" ? value : null;
}
function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return null;
  }
}
