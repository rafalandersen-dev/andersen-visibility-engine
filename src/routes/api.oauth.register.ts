import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Dynamic Client Registration (RFC 7591) for the Claude.ai OAuth connector.
// Gated by MCP_OAUTH_ENABLED: flag off → 404 (production-neutral). Public/PKCE
// clients only — no client secret is issued or stored. Later phases add
// /authorize, /token, /revoke and MCP OAuth token validation.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const MAX_BODY = 20_000;

export const Route = createFileRoute("/api/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const {
          isOAuthEnabled,
          isWriteToolsEnabled,
          processClientRegistration,
          insertOAuthClient,
          generateClientId,
          logOAuthEvent,
          RATE_BUCKETS,
          checkRateLimit,
          bumpRateLimit,
        } = await import("@/lib/oauth.server");

        if (!isOAuthEnabled()) return json({ error: "not_found" }, 404);

        // Rate limit per hashed IP, before reading the body. Fail-open.
        const rl = await checkRateLimit(RATE_BUCKETS.register, request.headers.get("cf-connecting-ip") ?? "", { bump: bumpRateLimit, nowMs: Date.now() });
        if (rl.shouldAudit) await logOAuthEvent("rate_limited", { detail: { bucket: RATE_BUCKETS.register.bucket, window_start: rl.windowStartIso } });
        if (!rl.allowed) {
          return new Response(JSON.stringify({ error: "slow_down", error_description: "Too many requests. Try again shortly." }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSec), ...CORS },
          });
        }

        let body: unknown = null;
        try {
          const raw = await request.text();
          if (raw && raw.length <= MAX_BODY) body = JSON.parse(raw);
        } catch {
          return json({ error: "invalid_client_metadata", error_description: "Request body must be valid JSON." }, 400);
        }

        try {
          const clientId = generateClientId();
          const res = await processClientRegistration(true, body, {
            insertClient: insertOAuthClient,
            clientId,
            nowMs: Date.now(),
            writeEnabled: isWriteToolsEnabled(),
          });
          if (res.status === 201) {
            await logOAuthEvent("register", { clientId, detail: { client_name: (res.body as { client_name?: string }).client_name ?? null } });
          }
          return json(res.body, res.status);
        } catch {
          // Persistence failed — do not leak internals.
          return json({ error: "server_error", error_description: "Could not register the client. Please try again." }, 500);
        }
      },
    },
  },
});
