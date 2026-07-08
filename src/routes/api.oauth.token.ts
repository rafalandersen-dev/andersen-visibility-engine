import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// OAuth 2.1 token endpoint. authorization_code grant (+PKCE S256) and, since
// Phase 0 commit 6, refresh_token grant with rotation + reuse detection.
// Access tokens live 1h; refresh tokens 30d (sliding per rotation); hash-only
// storage. Gated by MCP_OAUTH_ENABLED: flag off → 404. Never logs code/verifier/token.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

// OAuth token responses must not be cached (RFC 6749 §5.1).
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...CORS },
  });

const MAX_BODY = 20_000;

/** Parse an OAuth token body (form-urlencoded per spec; JSON tolerated). */
function parseBody(raw: string, contentType: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (contentType.includes("application/json")) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(o)) if (typeof v === "string") out[k] = v;
      return out;
    } catch {
      return out;
    }
  }
  const sp = new URLSearchParams(raw);
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

export const Route = createFileRoute("/api/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const {
          isOAuthEnabled,
          processTokenRequest,
          getOAuthClient,
          getAuthorizationCodeByHash,
          consumeAuthorizationCode,
          insertAccessToken,
          sha256Hex,
          randomToken,
          ACCESS_TOKEN_PREFIX,
          REFRESH_TOKEN_PREFIX,
          getTokenRowByRefreshHash,
          consumeRefreshTokenByHash,
          revokeTokenFamily,
          logOAuthEvent,
          RATE_BUCKETS,
          checkRateLimit,
          bumpRateLimit,
        } = await import("@/lib/oauth.server");

        if (!isOAuthEnabled()) return json({ error: "not_found" }, 404);

        const tooMany = (retryAfterSec: number) =>
          new Response(JSON.stringify({ error: "slow_down", error_description: "Too many requests. Try again shortly." }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", "Retry-After": String(retryAfterSec), ...CORS },
          });

        // Rate limit per hashed IP before reading the body. Fail-open.
        const nowMs = Date.now();
        const rlIp = await checkRateLimit(RATE_BUCKETS.tokenIp, request.headers.get("cf-connecting-ip") ?? "", { bump: bumpRateLimit, nowMs });
        if (rlIp.shouldAudit) await logOAuthEvent("rate_limited", { detail: { bucket: RATE_BUCKETS.tokenIp.bucket, window_start: rlIp.windowStartIso } });
        if (!rlIp.allowed) return tooMany(rlIp.retryAfterSec);

        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY) return json({ error: "invalid_request", error_description: "Request too large." }, 400);
          const p = parseBody(raw, request.headers.get("content-type") ?? "");

          // Second dimension: per client_id when supplied (covers shared IPs).
          if (p.client_id) {
            const rlClient = await checkRateLimit(RATE_BUCKETS.tokenClient, p.client_id, { bump: bumpRateLimit, nowMs });
            if (rlClient.shouldAudit) await logOAuthEvent("rate_limited", { detail: { bucket: RATE_BUCKETS.tokenClient.bucket, window_start: rlClient.windowStartIso } });
            if (!rlClient.allowed) return tooMany(rlClient.retryAfterSec);
          }

          const res = await processTokenRequest(true, p, {
            getClient: getOAuthClient,
            getCodeByHash: getAuthorizationCodeByHash,
            consumeCode: consumeAuthorizationCode,
            insertToken: insertAccessToken,
            hash: sha256Hex,
            generateToken: () => randomToken(ACCESS_TOKEN_PREFIX),
            generateRefreshToken: () => randomToken(REFRESH_TOKEN_PREFIX),
            generateFamilyId: () => globalThis.crypto.randomUUID(),
            getTokenByRefreshHash: getTokenRowByRefreshHash,
            consumeRefreshToken: consumeRefreshTokenByHash,
            revokeFamily: revokeTokenFamily,
            nowMs: Date.now(),
          });

          // Audit per the processor's instruction (token_issued / token_refreshed
          // / token_reuse_detected) — never any secret material.
          if (res.audit) {
            await logOAuthEvent(res.audit.event, { clientId: res.audit.clientId, userId: res.audit.userId, detail: res.audit.detail });
          }
          return json(res.body, res.status);
        } catch (e) {
          console.error("[api.oauth.token] error:", e instanceof Error ? e.message : String(e));
          return json({ error: "server_error", error_description: "Could not issue a token. Please try again." }, 500);
        }
      },
    },
  },
});
