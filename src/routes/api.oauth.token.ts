import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// OAuth 2.1 token endpoint (Phase 2C). authorization_code grant + PKCE S256 only.
// Issues a short-lived access token (1h), stored hash-only. No refresh token this
// phase. Gated by MCP_OAUTH_ENABLED: flag off → 404. Never logs code/verifier/token.

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
          logOAuthEvent,
        } = await import("@/lib/oauth.server");

        if (!isOAuthEnabled()) return json({ error: "not_found" }, 404);

        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY) return json({ error: "invalid_request", error_description: "Request too large." }, 400);
          const p = parseBody(raw, request.headers.get("content-type") ?? "");

          const res = await processTokenRequest(true, p, {
            getClient: getOAuthClient,
            getCodeByHash: getAuthorizationCodeByHash,
            consumeCode: consumeAuthorizationCode,
            insertToken: insertAccessToken,
            hash: sha256Hex,
            generateToken: () => randomToken(ACCESS_TOKEN_PREFIX),
            nowMs: Date.now(),
          });

          if (res.status === 200) {
            // Audit success without any secret material.
            await logOAuthEvent("token_issued", { clientId: p.client_id, detail: { scope: (res.body as { scope?: string }).scope ?? "" } });
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
