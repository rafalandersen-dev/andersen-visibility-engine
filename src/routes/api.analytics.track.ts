import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  classifyAiSignal,
  isValidEventType,
  normalizePath,
  parseDeviceType,
  parseReferrerDomain,
  safeStr,
} from "@/lib/analytics";

// Public, anonymous, cross-origin event ingestion for the Milo tracking snippet.
// The snippet POSTs text/plain (a CORS "simple" request → no preflight needed),
// but we also answer OPTIONS for robustness. Inserts run with the service role.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const MAX_BODY = 12_000; // bytes; keep ingestion cheap and abuse-resistant

export const Route = createFileRoute("/api/analytics/track")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (!raw || raw.length > MAX_BODY) {
            return json({ ok: false, error: "Invalid payload" }, 400);
          }

          let p: Record<string, unknown>;
          try {
            p = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return json({ ok: false, error: "Invalid JSON" }, 400);
          }

          // ---- Per-IP rate limit (P1-11) — same fixed-window machinery as the
          // OAuth endpoints. Fail-open: a metering hiccup must not break
          // customers' sites, the wall is for floods.
          const { checkRateLimit, RATE_BUCKETS, bumpRateLimit } =
            await import("@/lib/oauth.server");
          const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
          const rate = await checkRateLimit(RATE_BUCKETS.analyticsIp, ip, {
            bump: bumpRateLimit,
            nowMs: Date.now(),
          });
          if (!rate.allowed) {
            return new Response(null, {
              status: 429,
              headers: { "Retry-After": String(rate.retryAfterSec), ...CORS },
            });
          }

          const projectId = safeStr(p.projectId, 100);
          if (!projectId) return json({ ok: false, error: "Missing projectId" }, 400);

          // ---- The project must actually exist (P1-11). Without this, any
          // anonymous caller could pour forged rows into an arbitrary
          // project_id — polluting a real tenant's analytics or bloating the
          // table with junk. Unknown ids answer ok:true (no existence oracle),
          // they just never insert.
          const { supabaseAdmin: adminForCheck } =
            await import("@/integrations/supabase/client.server");
          const { data: projectRow } = await (
            adminForCheck as unknown as {
              from: (t: string) => {
                select: (c: string) => {
                  eq: (
                    c: string,
                    v: string,
                  ) => {
                    eq: (
                      c: string,
                      v: string,
                    ) => {
                      limit: (n: number) => {
                        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
                      };
                    };
                  };
                };
              };
            }
          )
            .from("workspace_entities")
            .select("entity_id")
            .eq("collection", "projects")
            .eq("entity_id", projectId)
            .limit(1)
            .maybeSingle();
          if (!projectRow) return json({ ok: true });

          const eventType = p.eventType;
          if (!isValidEventType(eventType)) {
            return json({ ok: false, error: "Invalid eventType" }, 400);
          }

          // Normalize inputs; ignore obviously malformed URLs (normalizePath → "").
          const url = safeStr(p.url, 800);
          const path = normalizePath((p.path as string) || url);
          const referrer = safeStr(p.referrer, 500);
          const referrerDomain = parseReferrerDomain(referrer);
          // Authoritative UA comes from the request header, not the payload.
          const userAgent = safeStr(request.headers.get("user-agent") ?? "", 400);
          const deviceType = parseDeviceType(userAgent);
          const { aiSignalType, aiSignalSource } = classifyAiSignal(referrerDomain, userAgent);

          const metadata =
            p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
              ? p.metadata
              : {};

          const row = {
            project_id: projectId,
            event_type: eventType,
            url: url || null,
            path: path || null,
            title: safeStr(p.title, 300) || null,
            referrer: referrer || null,
            referrer_domain: referrerDomain || null,
            user_agent: userAgent || null,
            device_type: deviceType,
            country: null,
            city: null,
            session_id: safeStr(p.sessionId, 100) || null,
            visitor_id: safeStr(p.visitorId, 100) || null,
            content_asset_id: safeStr(p.contentAssetId, 100) || null,
            milo_asset_id: safeStr(p.miloAssetId, 100) || null,
            destination_type: safeStr(p.destinationType, 40) || null,
            ai_signal_type: aiSignalType,
            ai_signal_source: aiSignalSource,
            metadata: JSON.parse(JSON.stringify(metadata)),
          };

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // analytics_events is not in the generated Database types; cast for insert.
          const { error } = await (
            supabaseAdmin as unknown as {
              from: (t: string) => {
                insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
              };
            }
          )
            .from("analytics_events")
            .insert(row);

          if (error) {
            console.error("[analytics.track] insert failed:", error.message);
            return json({ ok: false, error: "Could not record event" }, 200);
          }

          return json({ ok: true });
        } catch (e) {
          console.error("[analytics.track] error:", e instanceof Error ? e.message : String(e));
          // Never crash the endpoint for the caller.
          return json({ ok: false, error: "Tracking error" }, 200);
        }
      },
    },
  },
});
