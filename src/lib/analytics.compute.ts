/**
 * Analytics v2 / Growth Proof — pure, read-only aggregation.
 *
 * Extracted from the authenticated analytics server function so it can be unit
 * tested with synthetic events. No I/O, no auth — given raw events + the
 * project's content assets it returns the Growth Proof sections.
 */
import { normalizePath } from "./analytics";
import type { ContentAsset } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export type AnalyticsEvent = {
  event_type: string;
  path: string | null;
  title: string | null;
  referrer_domain: string | null;
  ai_signal_type: string | null;
  ai_signal_source: string | null;
  created_at: string;
};

export type Recommendation =
  | "keepMonitoring"
  | "improveCta"
  | "addInternalLinks"
  | "createSupportingContent"
  | "sharePromote"
  | "reviewQuality";

const REC_TEXT: Record<Recommendation, string> = {
  keepMonitoring: "This page is getting activity. Keep monitoring and consider a supporting article.",
  improveCta: "This page has views but no CTA clicks. Improve the CTA or offer section.",
  addInternalLinks: "Add internal links from your main pages so people can find this content.",
  createSupportingContent: "Create supporting content to build depth around this topic.",
  sharePromote: "No traffic yet. Share this page, add internal links, or create supporting content.",
  reviewQuality: "Low Milo Score and limited traffic. Review the Milo Score issues and improve the page.",
};

export function computeGrowthProof(events: AnalyticsEvent[], content: ContentAsset[], now: number) {
  const d30 = now - 30 * DAY;
  const d60 = now - 60 * DAY;
  const ts = (e: AnalyticsEvent) => new Date(e.created_at).getTime();
  const isView = (e: AnalyticsEvent) => e.event_type === "page_view" || e.event_type === "content_view";
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const convRate = (clicks: number, views: number) => (views > 0 ? round1((clicks / views) * 100) : 0);

  const visits30 = events.filter((e) => isView(e) && ts(e) >= d30).length;
  const visitsPrev30 = events.filter((e) => isView(e) && ts(e) >= d60 && ts(e) < d30).length;
  const ctaClicks30 = events.filter((e) => e.event_type === "cta_click" && ts(e) >= d30).length;
  const bookingClicks30 = events.filter((e) => e.event_type === "booking_click" && ts(e) >= d30).length;
  const aiEvents = events.filter((e) => e.ai_signal_type && ts(e) >= d30);
  const aiSignalCount = aiEvents.length;

  // ---- Per-path aggregation (30d + previous 30d), whole-site. ----
  type PageAgg = {
    path: string;
    title: string;
    views30: number;
    viewsPrev: number;
    cta30: number;
    booking30: number;
    ai30: number;
    referrers30: Map<string, number>;
  };
  const agg = new Map<string, PageAgg>();
  for (const e of events) {
    const path = e.path || "/";
    const a =
      agg.get(path) ??
      { path, title: e.title || path, views30: 0, viewsPrev: 0, cta30: 0, booking30: 0, ai30: 0, referrers30: new Map() };
    if (e.title) a.title = e.title;
    const t = ts(e);
    if (isView(e)) {
      if (t >= d30) a.views30 += 1;
      else if (t >= d60) a.viewsPrev += 1;
    }
    if (t >= d30) {
      if (e.event_type === "cta_click") a.cta30 += 1;
      if (e.event_type === "booking_click") a.booking30 += 1;
      if (e.ai_signal_type) a.ai30 += 1;
      if (e.referrer_domain) a.referrers30.set(e.referrer_domain, (a.referrers30.get(e.referrer_domain) ?? 0) + 1);
    }
    agg.set(path, a);
  }

  const topGrowingPages = [...agg.values()]
    .filter((a) => a.views30 > 0)
    .sort((a, b) => b.views30 - a.views30)
    .slice(0, 8)
    .map((a) => ({
      path: a.path,
      title: a.title,
      viewsLast30: a.views30,
      viewsPrevious30: a.viewsPrev,
      growthPercent: a.viewsPrev > 0 ? Math.round(((a.views30 - a.viewsPrev) / a.viewsPrev) * 100) : null,
      ctaClicks: a.cta30,
      bookingClicks: a.booking30,
      aiSignals: a.ai30,
      topReferrer: [...a.referrers30.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "Direct / none",
    }));

  // ---- Published content performance v2. ----
  const publishedAssets = content.filter((c) => c.livePublishStatus === "published" && c.liveUrl);
  const publishedContentPerformance = publishedAssets
    .map((c) => {
      const livePath = normalizePath(c.liveUrl as string);
      const sincePub = c.livePublishedAt ? new Date(c.livePublishedAt).getTime() : 0;
      const daysSincePublished = c.livePublishedAt ? Math.max(0, Math.floor((now - sincePub) / DAY)) : undefined;
      const matched = events.filter((e) => (e.path || "") === livePath && ts(e) >= sincePub);
      const viewsSincePublish = matched.filter(isView).length;
      const viewsLast30 = matched.filter((e) => isView(e) && ts(e) >= d30).length;
      const ctaSince = matched.filter((e) => e.event_type === "cta_click").length;
      const bookingSince = matched.filter((e) => e.event_type === "booking_click").length;
      const totalClicks = ctaSince + bookingSince;
      const aiSince = matched.filter((e) => e.ai_signal_type).length;
      const refMap = new Map<string, number>();
      for (const e of matched) if (e.referrer_domain) refMap.set(e.referrer_domain, (refMap.get(e.referrer_domain) ?? 0) + 1);
      const topReferrers = [...refMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([domain, visits]) => ({ domain, visits }));
      const qualityScore = c.qualityScore?.overall;

      let recommendation: Recommendation;
      if (viewsSincePublish === 0) {
        recommendation = daysSincePublished !== undefined && daysSincePublished >= 7 ? "sharePromote" : "keepMonitoring";
      } else if (totalClicks === 0) {
        recommendation = "improveCta";
      } else if (qualityScore !== undefined && qualityScore < 70 && viewsLast30 < 10) {
        recommendation = "reviewQuality";
      } else if (aiSince === 0 && topReferrers.length === 0) {
        recommendation = "addInternalLinks";
      } else {
        recommendation = "keepMonitoring";
      }

      return {
        assetId: c.id,
        title: c.title,
        liveUrl: c.liveUrl as string,
        path: livePath,
        destinationType: c.publishDestinationType,
        assetType: c.assetType,
        language: c.language,
        publishedAt: c.livePublishedAt,
        daysSincePublished,
        viewsSincePublish,
        viewsLast30,
        ctaClicksSincePublish: ctaSince,
        bookingClicksSincePublish: bookingSince,
        totalClicksSincePublish: totalClicks,
        conversionRateSincePublish: convRate(totalClicks, viewsSincePublish),
        aiSignalsSincePublish: aiSince,
        topReferrers,
        qualityScore,
        recommendation,
        recommendationText: REC_TEXT[recommendation],
      };
    })
    .sort((a, b) => b.viewsSincePublish - a.viewsSincePublish);

  // ---- Underperforming pages. ----
  type IssueKind = "noViews" | "noClicks" | "lowConversion" | "lowQuality";
  const recForIssue: Record<IssueKind, Recommendation> = {
    noViews: "sharePromote",
    noClicks: "improveCta",
    lowConversion: "improveCta",
    lowQuality: "reviewQuality",
  };
  const underperformingPages = publishedContentPerformance
    .map((p) => {
      let issue: IssueKind | null = null;
      if (p.viewsSincePublish === 0 && p.daysSincePublished !== undefined && p.daysSincePublished >= 7) issue = "noViews";
      else if (p.viewsSincePublish > 0 && p.totalClicksSincePublish === 0) issue = "noClicks";
      else if (p.viewsSincePublish >= 20 && p.conversionRateSincePublish < 1) issue = "lowConversion";
      else if (p.qualityScore !== undefined && p.qualityScore < 65) issue = "lowQuality";
      if (!issue) return null;
      return { title: p.title, path: p.path, liveUrl: p.liveUrl, issue, recommendation: recForIssue[issue], recommendationText: REC_TEXT[recForIssue[issue]] };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6);

  // ---- AI-related signals trend. ----
  const aiByType = { ai_referrer: 0, ai_crawler: 0, ai_search_bot: 0 } as Record<string, number>;
  const aiBySource = new Map<string, number>();
  const aiByPath = new Map<string, number>();
  for (const e of aiEvents) {
    const type = e.ai_signal_type as string;
    if (type in aiByType) aiByType[type] += 1;
    const src = e.ai_signal_source ?? "—";
    aiBySource.set(src, (aiBySource.get(src) ?? 0) + 1);
    const p = e.path || "/";
    aiByPath.set(p, (aiByPath.get(p) ?? 0) + 1);
  }
  const aiSignalsTrend = {
    total: aiSignalCount,
    byType: aiByType,
    bySource: [...aiBySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([source, count]) => ({ source, count })),
    topPaths: [...aiByPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([path, count]) => ({ path, count })),
  };

  // ---- Growth summary. ----
  const publishedPagesCount = publishedContentPerformance.length;
  const activePublishedPagesCount = publishedContentPerformance.filter((p) => p.viewsSincePublish > 0).length;
  const miloPageViews = publishedContentPerformance.reduce((s, p) => s + p.viewsSincePublish, 0);
  const best = [...publishedContentPerformance].sort(
    (a, b) =>
      b.bookingClicksSincePublish * 3 + b.ctaClicksSincePublish * 2 + b.viewsSincePublish -
      (a.bookingClicksSincePublish * 3 + a.ctaClicksSincePublish * 2 + a.viewsSincePublish),
  )[0];
  const conversionRateLast30 = convRate(ctaClicks30 + bookingClicks30, visits30);

  let summaryText: string;
  if (events.length === 0) {
    summaryText = "No analytics data yet. Add the tracking snippet and visit your website to start collecting data.";
  } else if (best && best.viewsSincePublish > 0) {
    summaryText = `Your website received ${visits30} visit${visits30 === 1 ? "" : "s"} in the last 30 days, with ${ctaClicks30 + bookingClicks30} tracked CTA or booking click${ctaClicks30 + bookingClicks30 === 1 ? "" : "s"}. Your strongest Milo page is “${best.title}”.`;
  } else {
    summaryText = `Your website received ${visits30} visit${visits30 === 1 ? "" : "s"} in the last 30 days, with ${ctaClicks30 + bookingClicks30} tracked CTA or booking click${ctaClicks30 + bookingClicks30 === 1 ? "" : "s"}.`;
  }

  const growthSummary = {
    visitsLast30: visits30,
    visitsPrevious30: visitsPrev30,
    visitsGrowthPercent: visitsPrev30 > 0 ? Math.round(((visits30 - visitsPrev30) / visitsPrev30) * 100) : null,
    ctaClicksLast30: ctaClicks30,
    bookingClicksLast30: bookingClicks30,
    conversionRateLast30,
    aiSignalsLast30: aiSignalCount,
    publishedPagesCount,
    activePublishedPagesCount,
    miloPageViews,
    bestPerformingPage: best
      ? { title: best.title, path: best.path, views: best.viewsSincePublish, bookingClicks: best.bookingClicksSincePublish, ctaClicks: best.ctaClicksSincePublish }
      : undefined,
    summaryText,
  };

  // ---- Next action (deterministic). ----
  let nextActionKey: "installSnippet" | "addInternalLinks" | "improveCta" | "keepMonitoring" | "aiClarity";
  if (events.length === 0) nextActionKey = "installSnippet";
  else if (publishedPagesCount > 0 && activePublishedPagesCount === 0) nextActionKey = "addInternalLinks";
  else if (visits30 > 0 && ctaClicks30 + bookingClicks30 === 0) nextActionKey = "improveCta";
  else if (aiSignalCount > 0) nextActionKey = "aiClarity";
  else nextActionKey = "keepMonitoring";

  return { growthSummary, publishedContentPerformance, topGrowingPages, underperformingPages, aiSignalsTrend, nextActionKey };
}
