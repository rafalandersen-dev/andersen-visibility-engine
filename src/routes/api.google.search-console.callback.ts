import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { completeOAuthCallback } from "@/lib/gsc-oauth.server";

// Google Search Console OAuth callback (Sprint 17). Google redirects here with
// ?code&state (or ?error). We exchange the code server-side, persist the
// encrypted refresh token, and redirect back to Analytics with a safe status.
// Never renders code/token data.

const APP = "/app/analytics";

function redirect(status: "connected" | "denied" | "error"): Response {
  const target = status === "connected" ? `${APP}?gsc=connected` : `${APP}?gsc=${status}`;
  return new Response(null, { status: 302, headers: { Location: target } });
}

export const Route = createFileRoute("/api/google/search-console/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const result = await completeOAuthCallback({
            code: url.searchParams.get("code") ?? undefined,
            state: url.searchParams.get("state") ?? undefined,
            error: url.searchParams.get("error") ?? undefined,
          });
          return redirect(result);
        } catch (e) {
          console.error("[gsc.callback] error:", e instanceof Error ? e.message : String(e));
          return redirect("error");
        }
      },
    },
  },
});
