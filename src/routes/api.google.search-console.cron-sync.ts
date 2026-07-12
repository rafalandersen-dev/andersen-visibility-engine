import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// GSC background sync endpoint (Sprint 17b). Called by the pg_cron job
// 'gsc-daily-sync' with "Authorization: Bearer <vault:gsc_cron_secret>".
// The secret is generated inside Postgres and never leaves the database or
// the server: we verify the header by fetching the same secret through the
// service-role-only RPC public.gsc_cron_secret(). Responses contain counts
// and short codes only — never tokens, emails or property data.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/google/search-console/cron-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("Authorization") ?? "";
          if (!auth.startsWith("Bearer ")) {
            return Response.json({ error: "unauthorized" }, { status: 401 });
          }
          const presented = auth.slice("Bearer ".length).trim();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Call rpc as a METHOD on the client (it is exposed through a Proxy —
          // detaching the function loses `this` and throws at call time).
          const admin = supabaseAdmin as unknown as {
            rpc: (fn: string) => Promise<{ data: string | null; error: { message: string } | null }>;
          };
          const { data: expected, error } = await admin.rpc("gsc_cron_secret");
          if (error || !expected) {
            console.error("[gsc-cron] secret lookup failed", error?.message ?? "no data");
            return Response.json({ error: "server_configuration" }, { status: 500 });
          }
          if (!timingSafeEqual(presented, expected)) {
            return Response.json({ error: "forbidden" }, { status: 403 });
          }

          const { runGscBackgroundSyncProd } = await import("@/lib/gsc-cron.server");
          const result = await runGscBackgroundSyncProd();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[gsc-cron] run failed", e instanceof Error ? e.message : "error");
          return Response.json({ error: "sync_failed" }, { status: 500 });
        }
      },
    },
  },
});
