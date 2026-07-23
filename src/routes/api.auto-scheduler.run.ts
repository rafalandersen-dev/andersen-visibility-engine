import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Monthly Auto-Scheduler endpoint (owner spec 2026-07-23). Called by the
// pg_cron job 'monthly-auto-scheduler' on the 25th of each month with
// "Authorization: Bearer <vault:auto_scheduler_secret>".
// Same trust model as /api/publish/run-scheduled: the secret is generated
// inside Postgres, fetched through the service-role-only RPC
// public.auto_scheduler_secret(), and compared in constant time. The response
// carries per-project counts only — never content, URLs or credentials.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/auto-scheduler/run")({
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
          const { data: expected, error } = await admin.rpc("auto_scheduler_secret");
          if (error || !expected) {
            console.error("[auto-scheduler] secret lookup failed", error?.message ?? "no data");
            return Response.json({ error: "server_configuration" }, { status: 500 });
          }
          if (!timingSafeEqual(presented, expected)) {
            return Response.json({ error: "forbidden" }, { status: 403 });
          }

          const { runMonthlyAutoScheduler } = await import("@/lib/auto-scheduler.server");
          const summary = await runMonthlyAutoScheduler();
          return Response.json({
            ok: true,
            planned: summary.planned,
            workspaces: summary.workspaces,
            projects: summary.projects.map((p) => ({
              projectId: p.projectId,
              mode: p.mode,
              slots: p.slots,
              target: p.target,
              generated: p.generated,
              armed: p.armed,
              held: p.held,
              flaggedEmpty: p.flaggedEmpty,
              error: p.error ?? null,
            })),
          });
        } catch (e) {
          console.error("[auto-scheduler] run failed", e instanceof Error ? e.message : "error");
          return Response.json({ error: "run_failed" }, { status: 500 });
        }
      },
    },
  },
});
