import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { completeOAuthCallback } from "@/lib/gsc-oauth.server";
import {
  GA4_CLEAR_STATE_COOKIE,
  completeGa4Callback,
  ga4StateCookieFrom,
  verifyGa4State,
} from "@/lib/ga4.server";

// Google Search Console OAuth callback (Sprint 17). Google redirects here with
// ?code&state (or ?error). We exchange the code server-side, persist the
// encrypted refresh token, and redirect back to Analytics with a safe status.
// Never renders code/token data.

const APP = "/app/analytics";

function redirect(status: "connected" | "denied" | "error", param = "gsc"): Response {
  const headers = new Headers({ Location: `${APP}?${param}=${status}` });
  if (param === "ga4") headers.append("Set-Cookie", GA4_CLEAR_STATE_COOKIE);
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/api/google/search-console/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          // The registered callback is shared: a state signed for GA4 (distinct key
          // and purpose) is handled by the GA4 flow; anything else stays GSC. GA4
          // also requires the initiating browser's one-time cookie nonce.
          const state = url.searchParams.get("state") ?? "";
          if (await verifyGa4State(state)) {
            return redirect(
              await completeGa4Callback({
                state,
                cookieNonce: ga4StateCookieFrom(request.headers.get("cookie")),
                code: url.searchParams.get("code") ?? undefined,
                error: url.searchParams.get("error") ?? undefined,
              }),
              "ga4",
            );
          }
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
