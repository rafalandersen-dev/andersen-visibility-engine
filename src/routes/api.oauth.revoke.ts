import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// RFC 7009 token revocation (Phase 0 trust foundation). Access tokens only —
// refresh tokens are not implemented yet. Gated by MCP_OAUTH_ENABLED: flag off
// → 404. Unknown/already-revoked tokens → empty 200 (no token-existence leak).
// Never logs token material.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...NO_STORE, ...CORS },
  });

const MAX_BODY = 20_000;

/** Parse the request body (form-urlencoded per spec; JSON tolerated — same as /api/oauth/token). */
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

export const Route = createFileRoute("/api/oauth/revoke")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { isOAuthEnabled, processRevocationRequest, revokeAccessTokenByHash, sha256Hex, logOAuthEvent } = await import("@/lib/oauth.server");

        if (!isOAuthEnabled()) return json({ error: "not_found" }, 404);

        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY) return json({ error: "invalid_request", error_description: "Request too large." }, 400);
          const p = parseBody(raw, request.headers.get("content-type") ?? "");

          const res = await processRevocationRequest(true, p, {
            revokeAccessTokenByHash,
            hash: sha256Hex,
            nowMs: Date.now(),
          });

          // Audit only actual revocations (unknown tokens stay unacknowledged —
          // no existence leak in the response OR the log). Safe fields only.
          if (res.revoked) {
            await logOAuthEvent("revoked", {
              clientId: res.revoked.clientId ?? p.client_id,
              userId: res.revoked.userId ?? undefined,
              detail: { tokenType: "access", source: "revoke_endpoint" },
            });
          }

          // RFC 7009 §2.2 — successful (or unknown-token) revocation is an
          // empty 200; the body carries nothing a client could distinguish.
          if (res.status === 200) return new Response(null, { status: 200, headers: { ...NO_STORE, ...CORS } });
          return json(res.body, res.status);
        } catch (e) {
          console.error("[api.oauth.revoke] error:", e instanceof Error ? e.message : String(e));
          return json({ error: "server_error", error_description: "Could not process the revocation. Please try again." }, 500);
        }
      },
    },
  },
});
