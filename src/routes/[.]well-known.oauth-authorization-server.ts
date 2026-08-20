import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  isOAuthEnabled,
  isWriteToolsEnabled,
  authorizationServerMetadata,
} from "@/lib/oauth.server";

// RFC 8414 — OAuth 2.0 Authorization Server Metadata. issuer == milogrowth.com.
// Endpoints advertised here are placeholders until later phases implement them.
// Only served when MCP_OAUTH_ENABLED=true; otherwise 404.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const notFound = () => new Response("Not found", { status: 404, headers: CORS });

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        if (!isOAuthEnabled()) return notFound();
        return new Response(JSON.stringify(authorizationServerMetadata(isWriteToolsEnabled())), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
            ...CORS,
          },
        });
      },
    },
  },
});
