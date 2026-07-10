import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// OAuth 2.1 authorization endpoint (Phase 2B). Validates the request, stores a
// pending authorization request, and redirects the browser to the authenticated
// consent page. It NEVER issues a code directly (that happens after consent via
// a server helper). Gated by MCP_OAUTH_ENABLED: flag off → 404.
//
// Security: an unknown client or an unregistered redirect_uri produces a safe
// error page and is NEVER redirected to the caller-supplied URI.

const htmlError = (message: string, status = 400) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1>Authorization error</h1><p>${message}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

export const Route = createFileRoute("/api/oauth/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const oauth = await import("@/lib/oauth.server");
        if (!oauth.isOAuthEnabled()) return new Response("Not found", { status: 404 });

        try {
          const url = new URL(request.url);
          const g = (k: string) => url.searchParams.get(k) ?? undefined;
          const params = {
            response_type: g("response_type"),
            client_id: g("client_id"),
            redirect_uri: g("redirect_uri"),
            scope: g("scope"),
            code_challenge: g("code_challenge"),
            code_challenge_method: g("code_challenge_method"),
            resource: g("resource"),
            state: g("state"),
          };

          const client = params.client_id ? await oauth.getOAuthClient(params.client_id) : null;
          const outcome = oauth.classifyAuthorizeRequest(params, client, oauth.isWriteToolsEnabled());

          if (outcome.kind === "invalid_client") {
            return htmlError("Unknown or disabled client. Please start again from Claude.");
          }
          if (outcome.kind === "invalid_redirect") {
            return htmlError("The redirect URI does not match this client's registered URIs. Please start again from Claude.");
          }
          if (outcome.kind === "redirect_error") {
            return redirect(oauth.buildRedirectError(outcome.redirectUri, outcome.error, outcome.description, outcome.state));
          }

          // Valid → persist a pending request and hand off to the consent page.
          const id = globalThis.crypto.randomUUID();
          const expiresAt = new Date(Date.now() + oauth.AUTH_REQUEST_TTL_MS).toISOString();
          await oauth.insertAuthorizationRequest(oauth.buildPendingRequestRow(outcome.normalized, id, expiresAt));
          await oauth.logOAuthEvent("authorize", { clientId: outcome.normalized.clientId });
          return redirect(oauth.consentRedirectPath(id));
        } catch (e) {
          console.error("[api.oauth.authorize] error:", e instanceof Error ? e.message : String(e));
          return htmlError("Could not start authorization. Please try again.", 500);
        }
      },
    },
  },
});
