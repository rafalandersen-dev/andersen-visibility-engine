/**
 * Milo Analytics v1 — authenticated dashboard aggregation.
 *
 * Reads are authorized by workspace ownership: the requesting user must own the
 * project (it must exist in their workspace blob) before any events are returned.
 * Event rows are read with the service role; published-content performance is
 * matched in JS (content assets live in the workspace JSONB, not a table).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizePath } from "./analytics";
import type { Project, ContentAsset } from "./types";

const DAY = 24 * 60 * 60 * 1000;

type EventRow = {
  event_type: string;
  path: string | null;
  title: string | null;
  referrer_domain: string | null;
  ai_signal_type: string | null;
  ai_signal_source: string | null;
  created_at: string;
};

export const getAnalyticsSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const projectId = data.projectId.trim();
    if (!projectId) throw new Error("No project selected.");

    // ---- Authorize: the project must belong to the requesting user's workspace.
    const { data: row, error: wsErr } = await context.supabase
      .from("workspaces")
      .select("data")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (wsErr) throw new Error("Could not load workspace.");
    const ws = (row?.data ?? {}) as { projects?: Project[]; content?: ContentAsset[] };
    const owns = (ws.projects ?? []).some((p) => p.id === projectId);
    if (!owns) throw new Error("Project not found.");

    const content = (ws.content ?? []).filter((c) => c.projectId === projectId);

    // ---- Fetch the last 60 days of events for this project (service role).
    const since = new Date(Date.now() - 60 * DAY).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rawEvents, error: evErr } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              gte: (k: string, v: string) => {
                order: (k: string, o: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: EventRow[] | null; error: { message: string } | null }>;
                };
              };
            };
          };
        };
      }
    )
      .from("analytics_events")
      .select("event_type,path,title,referrer_domain,ai_signal_type,ai_signal_source,created_at")
      .eq("project_id", projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50000);
    if (evErr) throw new Error("Could not load analytics.");

    const events = rawEvents ?? [];
    const now = Date.now();
    const d30 = now - 30 * DAY;
    const d60 = now - 60 * DAY;
    const ts = (e: EventRow) => new Date(e.created_at).getTime();
    const isView = (e: EventRow) => e.event_type === "page_view" || e.event_type === "content_view";

    const views30 = events.filter((e) => isView(e) && ts(e) >= d30);
    const viewsPrev = events.filter((e) => isView(e) && ts(e) >= d60 && ts(e) < d30);
    const visits30 = views30.length;
    const visitsPrev30 = viewsPrev.length;
    const growthPct =
      visitsPrev30 > 0
        ? Math.round(((visits30 - visitsPrev30) / visitsPrev30) * 100)
        : visits30 > 0
          ? 100
          : 0;

    // ---- Top pages (last 30d).
    const pageMap = new Map<
      string,
      { path: string; title: string; views: number; referrers: Map<string, number>; aiSignals: number }
    >();
    for (const e of views30) {
      const path = e.path || "/";
      const cur = pageMap.get(path) ?? { path, title: e.title || path, views: 0, referrers: new Map(), aiSignals: 0 };
      cur.views += 1;
      if (e.title) cur.title = e.title;
      if (e.referrer_domain) cur.referrers.set(e.referrer_domain, (cur.referrers.get(e.referrer_domain) ?? 0) + 1);
      if (e.ai_signal_type) cur.aiSignals += 1;
      pageMap.set(path, cur);
    }
    const topPages = [...pageMap.values()]
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)
      .map((p) => ({
        path: p.path,
        title: p.title,
        views: p.views,
        topReferrer: [...p.referrers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Direct / none",
        aiSignals: p.aiSignals,
      }));

    // ---- AI-related signals (last 30d).
    const aiEvents = events.filter((e) => e.ai_signal_type && ts(e) >= d30);
    const aiMap = new Map<string, { type: string; source: string; count: number; samplePath: string }>();
    for (const e of aiEvents) {
      const key = `${e.ai_signal_type}|${e.ai_signal_source ?? ""}`;
      const cur = aiMap.get(key) ?? {
        type: e.ai_signal_type as string,
        source: e.ai_signal_source ?? "—",
        count: 0,
        samplePath: e.path || "/",
      };
      cur.count += 1;
      aiMap.set(key, cur);
    }
    const aiSignals = [...aiMap.values()].sort((a, b) => b.count - a.count);
    const aiSignalCount = aiEvents.length;

    // ---- Clicks (last 30d).
    const ctaClicks = events.filter((e) => e.event_type === "cta_click" && ts(e) >= d30).length;
    const bookingClicks = events.filter((e) => e.event_type === "booking_click" && ts(e) >= d30).length;

    // ---- Daily trend (last 30 days, page/content views).
    const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) buckets.set(dayKey(now - i * DAY), 0);
    for (const e of views30) {
      const k = dayKey(ts(e));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const dailyTrend = [...buckets.entries()].map(([date, views]) => ({ date, views }));

    // ---- Published content performance (path-matched, since publish).
    const publishedContent = content
      .filter((c) => c.livePublishStatus === "published" && c.liveUrl)
      .map((c) => {
        const livePath = normalizePath(c.liveUrl as string);
        const sincePub = c.livePublishedAt ? new Date(c.livePublishedAt).getTime() : 0;
        const matched = events.filter((e) => (e.path || "") === livePath && ts(e) >= sincePub);
        return {
          title: c.title,
          liveUrl: c.liveUrl as string,
          publishedAt: c.livePublishedAt ?? null,
          views: matched.filter(isView).length,
          ctaClicks: matched.filter((e) => e.event_type === "cta_click").length,
          bookingClicks: matched.filter((e) => e.event_type === "booking_click").length,
        };
      })
      .sort((a, b) => b.views - a.views);

    return {
      hasData: events.length > 0,
      visits30,
      visitsPrev30,
      growthPct,
      topPage: topPages[0] ?? null,
      aiSignalCount,
      ctaClicks,
      bookingClicks,
      dailyTrend,
      topPages,
      aiSignals,
      publishedContent,
    };
  });

export type AnalyticsSummary = Awaited<ReturnType<typeof getAnalyticsSummaryFn>>;
