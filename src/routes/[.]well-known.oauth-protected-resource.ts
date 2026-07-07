import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { isOAuthEnabled, protectedResourceMetadata } from "@/lib/oauth.server";

// RFC 9728 — OAuth 2.0 Protected Resource Metadata for the Milo MCP endpoint.
// Only served when MCP_OAUTH_ENABLED=true; otherwise 404 (flag-off = today's
// behavior, no OAuth surface exposed).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const notFound = () => new Response("Not found", { status: 404, headers: CORS });

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        if (!isOAuthEnabled()) return notFound();
        return new Response(JSON.stringify(protectedResourceMetadata()), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", ...CORS },
        });
      },
    },
  },
});
