import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Claude Connector (MCP) endpoint. JSON-RPC 2.0 over HTTP POST. Auth is a Bearer
// token (milo_mcp_…) the user generates in Milo; it resolves to their workspace
// and all tools are read-only and scoped to that user. Never logs tokens.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const MAX_BODY = 200_000;

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
          description: "Milo Growth MCP connector — read-only access to your Milo projects, opportunities, content, Milo Score, audits, GSC and authority data.",
          transport: "jsonrpc-http",
          auth: "Bearer token (generate in Milo → Project Setup → Claude connector)",
        }),
      POST: async ({ request }) => {
        try {
          const token = bearer(request);
          const { resolveUser, handleMcpMessage } = await import("@/lib/mcp.server");
          const userId = token ? await resolveUser(token) : null;
          if (!userId) {
            // Phase 1: when the OAuth connector flag is on, advertise the
            // protected-resource metadata so Claude.ai can begin the OAuth flow.
            // Flag off preserves the original plain "Bearer" value. Token
            // validation itself is unchanged (developer tokens only for now).
            const { isOAuthEnabled, mcpWwwAuthenticate } = await import("@/lib/oauth.server");
            return new Response(
              JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Provide a valid Milo MCP connection token as a Bearer token." } }),
              { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": mcpWwwAuthenticate(isOAuthEnabled()), ...CORS } },
            );
          }

          const raw = await request.text();
          if (!raw || raw.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request." } }, 400);
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, 400);
          }

          // Batch or single message.
          if (Array.isArray(parsed)) {
            const responses = (await Promise.all(parsed.map((m) => handleMcpMessage(userId, m)))).filter(Boolean);
            return responses.length ? json(responses) : new Response(null, { status: 202, headers: CORS });
          }
          const response = await handleMcpMessage(userId, parsed as Record<string, unknown>);
          return response ? json(response) : new Response(null, { status: 202, headers: CORS });
        } catch (e) {
          console.error("[api.mcp] error:", e instanceof Error ? e.message : String(e));
          return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error." } }, 500);
        }
      },
    },
  },
});
