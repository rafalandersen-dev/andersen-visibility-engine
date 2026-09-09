import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Claude Connector (MCP) endpoint. JSON-RPC 2.0 over HTTP POST. Auth is a Bearer
// token (milo_mcp_…) the user generates in Milo; it resolves to their workspace
// and tools are scoped to that user. OAuth writes also require the write flag,
// explicit tool scopes and confirmed write limits. Never logs tokens.
import {
  McpRequestError,
  acquireMcpImageRequest,
  readMcpPayload,
  dispatchMcpPayload,
} from "@/lib/mcp-transport.server";
import { RateLimitUnavailableError } from "@/lib/oauth.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

function bearer(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        json({
          name: "milo-growth",
          description:
            "Milo Growth MCP connector — scoped project reads and owner-enabled draft/proposal tools. Publishing is not available through this connector.",
          transport: "jsonrpc-http",
          auth: "Bearer token (generate in Milo → Project Setup → Claude connector)",
        }),
      POST: async ({ request }) => {
        let releaseImageRequest: (() => void) | undefined;
        try {
          const token = bearer(request);
          const { resolveUser, handleMcpMessage, buildMcpAuditEvent } =
            await import("@/lib/mcp.server");
          const {
            isOAuthEnabled,
            isWriteToolsEnabled,
            mcpWwwAuthenticate,
            resolveAccessToken,
            parseScopes,
            logOAuthEvent,
            RATE_BUCKETS,
            checkRateLimit,
            bumpRateLimit,
          } = await import("@/lib/oauth.server");
          const oauthEnabled = isOAuthEnabled();

          // Rate limit BEFORE token resolution and body read (fail-open):
          // bearer present → per hashed bearer; absent → per hashed IP. 429 is
          // transport-level (no body parsed yet, so no JSON-RPC id to echo).
          const rlBucket = token ? RATE_BUCKETS.mcpToken : RATE_BUCKETS.mcpAnon;
          const rl = await checkRateLimit(
            rlBucket,
            token || (request.headers.get("cf-connecting-ip") ?? ""),
            { bump: bumpRateLimit, nowMs: Date.now() },
          );
          if (rl.shouldAudit)
            await logOAuthEvent("rate_limited", {
              detail: { bucket: rlBucket.bucket, window_start: rl.windowStartIso },
            });
          if (!rl.allowed) {
            return new Response(null, {
              status: 429,
              headers: { "Retry-After": String(rl.retryAfterSec), ...CORS },
            });
          }

          // Phase 4: when the flag is on, try to resolve an OAuth access token
          // first (scoped grant); otherwise fall back to the legacy developer
          // token (full read access). Flag off = developer tokens only.
          // writeEnabled mirrors MCP_WRITE_TOOLS_ENABLED; per-tool scope checks
          // still apply (legacy null-scope grants never reach write tools).
          const writeEnabled = oauthEnabled && isWriteToolsEnabled();
          let grant: {
            userId: string;
            scopes: string[] | null;
            writeEnabled: boolean;
            clientId?: string;
          } | null = null;
          let oauthClientId: string | undefined;
          if (oauthEnabled && token) {
            const at = await resolveAccessToken(token);
            if (at) {
              // clientId rides the grant: pending-action tools attribute and
              // visibility-filter proposals by the proposing OAuth client.
              grant = {
                userId: at.userId,
                scopes: parseScopes(at.scope),
                writeEnabled,
                clientId: at.clientId,
              };
              oauthClientId = at.clientId;
            }
          }
          if (!grant) {
            const userId = token ? await resolveUser(token) : null;
            if (userId) grant = { userId, scopes: null, writeEnabled };
          }

          if (!grant) {
            // Missing/invalid token → uniform 401. Flag on advertises the
            // protected-resource metadata so Claude.ai can begin the OAuth flow;
            // flag off preserves the original plain "Bearer" value.
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: {
                  code: -32001,
                  message:
                    "Unauthorized. Provide a valid Milo MCP connection token as a Bearer token.",
                },
              }),
              {
                status: 401,
                headers: {
                  "Content-Type": "application/json",
                  "WWW-Authenticate": mcpWwwAuthenticate(oauthEnabled),
                  ...CORS,
                },
              },
            );
          }
          // Audit one handled message for OAuth grants (no token/secret
          // material; arguments/content are never logged). Awaited so
          // Cloudflare Workers cannot drop the write after the response;
          // logOAuthEvent itself never throws, so a DB failure cannot fail
          // the request.
          const grantUserId = grant.userId;
          const audit = async (msg: unknown, response: object | null) => {
            if (!oauthClientId) return;
            const auditEvent = buildMcpAuditEvent(msg as Record<string, unknown> | null, response);
            if (!auditEvent) return; // write-tool outcomes are logged via hooks (mcp_write)
            await logOAuthEvent(auditEvent.event, {
              clientId: oauthClientId,
              userId: grantUserId,
              detail: auditEvent.detail,
            });
          };

          // Hooks for write tools: rate limiting + awaited mcp_write auditing.
          const hooks = {
            checkWriteLimit: () =>
              checkRateLimit(RATE_BUCKETS.write, token, {
                bump: bumpRateLimit,
                nowMs: Date.now(),
                failureMode: "deny",
              }),
            audit: async (event: string, detail: Record<string, unknown>) => {
              if (!oauthClientId) return;
              await logOAuthEvent(event, { clientId: oauthClientId, userId: grantUserId, detail });
            },
          };

          const parsed = await readMcpPayload(request, {
            onLargeBody: () => {
              releaseImageRequest ??= acquireMcpImageRequest();
            },
            allowImageUpload:
              grant.writeEnabled &&
              !!grant.clientId &&
              grant.scopes?.includes("milo.content.write") === true,
          });
          const response = await dispatchMcpPayload(
            parsed,
            async (message) => {
              try {
                return await handleMcpMessage(grant, message, hooks);
              } catch (error) {
                if (error instanceof RateLimitUnavailableError)
                  return {
                    jsonrpc: "2.0",
                    id: message.id ?? null,
                    error: {
                      code: -32003,
                      message: "Milo could not confirm the write limit. This message did not run.",
                    },
                  };
                throw error;
              }
            },
            audit,
          );
          return response ? json(response) : new Response(null, { status: 202, headers: CORS });
        } catch (e) {
          if (e instanceof McpRequestError)
            return json(
              { jsonrpc: "2.0", id: null, error: { code: e.code, message: e.message } },
              e.status,
            );
          console.error("[api.mcp] request failed");
          return json(
            { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error." } },
            500,
          );
        } finally {
          releaseImageRequest?.();
        }
      },
    },
  },
});
