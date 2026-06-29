/**
 * Milo Analytics v1 — shared pure helpers (no secrets, safe anywhere).
 *
 * Used by the public ingestion route (/api/analytics/track) and the
 * authenticated dashboard server function. Cautious AI-signal classification:
 * we only ever label what referrer / user-agent actually shows — never claim
 * rankings or recommendations.
 */

export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "content_view",
  "cta_click",
  "booking_click",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export type AiSignalType = "ai_referrer" | "ai_crawler" | "ai_search_bot" | null;

/** Domains that, when seen as a referrer, indicate a possible AI referral. */
export const AI_REFERRER_DOMAINS = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "you.com",
] as const;

/** AI assistant / AI-search crawler user-agents → ai_crawler. */
export const AI_CRAWLER_UAS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityBot",
  "ClaudeBot",
  "Google-Extended",
  "GoogleOther",
] as const;

/** Search-engine bots that also feed AI answer experiences → ai_search_bot. */
export const AI_SEARCH_BOT_UAS = ["Bingbot", "Applebot"] as const;

export function safeStr(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

/** Extract a clean hostname from a referrer URL. Returns "" on anything odd. */
export function parseReferrerDomain(referrer: string): string {
  const r = safeStr(referrer, 500);
  if (!r) return "";
  try {
    const u = new URL(r);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Strip protocol/host/query/hash to a normalized path ("/blog/x"). */
export function normalizePath(input: string): string {
  const s = safeStr(input, 800);
  if (!s) return "";
  let path = s;
  try {
    // Accept a full URL or a bare path.
    path = s.startsWith("http") ? new URL(s).pathname : new URL(s, "https://x.invalid").pathname;
  } catch {
    return "";
  }
  path = path.split("?")[0].split("#")[0];
  if (path.length > 1) path = path.replace(/\/+$/, ""); // drop trailing slash (keep "/")
  return path || "/";
}

export function parseDeviceType(userAgent: string): "desktop" | "mobile" | "tablet" | "bot" | "unknown" {
  const ua = userAgent || "";
  if (!ua) return "unknown";
  const lower = ua.toLowerCase();
  const isBot =
    /bot|crawler|spider|crawling|gptbot|claudebot|perplexitybot|applebot|bingbot|google-extended|googleother|oai-searchbot|chatgpt-user/i.test(
      ua,
    );
  if (isBot) return "bot";
  if (/ipad|tablet|playbook|silk/.test(lower)) return "tablet";
  if (/mobi|iphone|android.*mobile|phone|ipod/.test(lower)) return "mobile";
  return "desktop";
}

/**
 * Classify a possible AI-related signal from referrer + user-agent.
 * Referrer (a real human arriving from an AI tool) takes precedence, then
 * AI crawler UA, then AI-feeding search bot UA. Returns nulls when nothing matches.
 */
export function classifyAiSignal(
  referrerDomain: string,
  userAgent: string,
): { aiSignalType: AiSignalType; aiSignalSource: string | null } {
  const dom = (referrerDomain || "").toLowerCase();
  if (dom) {
    const hit = AI_REFERRER_DOMAINS.find((d) => dom === d || dom.endsWith(`.${d}`));
    if (hit) return { aiSignalType: "ai_referrer", aiSignalSource: hit };
  }

  const ua = userAgent || "";
  if (ua) {
    const crawler = AI_CRAWLER_UAS.find((b) => ua.toLowerCase().includes(b.toLowerCase()));
    if (crawler) return { aiSignalType: "ai_crawler", aiSignalSource: crawler };
    const searchBot = AI_SEARCH_BOT_UAS.find((b) => ua.toLowerCase().includes(b.toLowerCase()));
    if (searchBot) return { aiSignalType: "ai_search_bot", aiSignalSource: searchBot };
  }

  return { aiSignalType: null, aiSignalSource: null };
}

export function isValidEventType(value: unknown): value is AnalyticsEventType {
  return typeof value === "string" && (ANALYTICS_EVENT_TYPES as readonly string[]).includes(value);
}
