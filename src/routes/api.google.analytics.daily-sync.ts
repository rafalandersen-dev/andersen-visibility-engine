import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// GA4 Synergy daily report. Called by the pg_cron job 'ga4-synergy-daily-sync'
// with "Authorization: Bearer <vault:ga4_daily_cron_secret>". The secret never
// leaves the database or the server: the header is compared with the value of
// the service-role-only RPC public.ga4_daily_cron_secret(). Fails closed when
// it cannot be read. Responses carry counts and finite codes only.
// 200 = every due target fetched and saved (or none due); 502 = at least one
// fetch or save failed, so pg_net's response log shows a failed run.

export const Route = createFileRoute("/api/google/analytics/daily-sync")({
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
          // rpc must be called as a method on the client (Proxy-backed).
          const admin = supabaseAdmin as unknown as {
            rpc: (
              fn: string,
            ) => Promise<{ data: string | null; error: { message: string } | null }>;
          };
          const { data: expected, error } = await admin.rpc("ga4_daily_cron_secret");
          if (error || !expected) {
            console.error("[ga4-daily] secret lookup failed");
            return Response.json({ error: "server_configuration" }, { status: 500 });
          }
          const { sameString } = await import("@/lib/ga4.server");
          if (!presented || !sameString(presented, expected)) {
            return Response.json({ error: "forbidden" }, { status: 403 });
          }

          const { runGa4DailySyncProd } = await import("@/lib/ga4-daily.server");
          const result = await runGa4DailySyncProd();
          const ok = result.fetchFailed === 0 && result.saveFailed === 0;
          if (!ok) console.warn("[ga4-daily] run incomplete", JSON.stringify(result));
          return Response.json({ ok, ...result }, { status: ok ? 200 : 502 });
        } catch {
          console.error("[ga4-daily] run failed");
          return Response.json({ error: "sync_failed" }, { status: 500 });
        }
      },
    },
  },
});
