import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Reuses the existing private publish-runner credential; no browser/session access.
function equalSecret(a: string, b: string) {
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export const Route = createFileRoute("/api/notifications/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("Authorization") ?? "";
        if (!header.startsWith("Bearer "))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as unknown as {
            rpc: (
              name: string,
              args?: Record<string, unknown>,
            ) => PromiseLike<{ data: unknown; error: unknown }>;
          };
          const secret = await db.rpc("publish_cron_secret");
          if (secret.error || typeof secret.data !== "string" || !secret.data)
            return Response.json({ error: "configuration_unavailable" }, { status: 503 });
          if (!equalSecret(header.slice(7).trim(), secret.data))
            return Response.json({ error: "forbidden" }, { status: 403 });
          const { runOperationalNotificationSweep } =
            await import("@/lib/operational-notifications.server");
          const result = await runOperationalNotificationSweep();
          try {
            await db.rpc("record_cron_heartbeat", {
              job: "operational-notifications",
              summary: result,
            });
          } catch {
            /* metrics cannot undo completed inbox updates */
          }
          return Response.json(
            { ok: result.failed === 0, ...result },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json({ error: "notification_sweep_failed" }, { status: 503 });
        }
      },
    },
  },
});
