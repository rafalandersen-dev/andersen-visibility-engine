import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Scheduled-publish runner endpoint (Sprint 18). Called by the pg_cron job
// 'scheduled-publish-run' every 5 minutes with
// "Authorization: Bearer <vault:publish_cron_secret>".
// The secret is generated inside Postgres and never leaves the database or the
// server: we verify the header against the same secret fetched through the
// service-role-only RPC public.publish_cron_secret(). Responses contain counts
// only — never URLs, credentials or customer content.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/publish/run-scheduled")({
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
          // Call rpc as a METHOD (supabaseAdmin is a Proxy — detaching loses `this`).
          const admin = supabaseAdmin as unknown as {
            rpc: (
              fn: string,
            ) => Promise<{ data: string | null; error: { message: string } | null }>;
          };
          const { data: expected, error } = await admin.rpc("publish_cron_secret");
          if (error || !expected) {
            console.error("[publish-cron] secret lookup failed", error?.message ?? "no data");
            return Response.json({ error: "server_configuration" }, { status: 500 });
          }
          if (!timingSafeEqual(presented, expected)) {
            return Response.json({ error: "forbidden" }, { status: 403 });
          }

          const { runScheduledPublishes } = await import("@/lib/publish-cron.server");
          const summary = await runScheduledPublishes();
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          console.error("[publish-cron] run failed", e instanceof Error ? e.message : "error");
          return Response.json({ error: "run_failed" }, { status: 500 });
        }
      },
    },
  },
});
