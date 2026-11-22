import type { ChatGptChannelReport, ChatGptCount } from "@/lib/types";

export const CHATGPT_PERIOD_DAYS = 28;
export const MAX_CHATGPT_REPORTS = 26;
export const MAX_DISCOVERY_TOPICS = 10;
export const MAX_TOPIC_LENGTH = 80;
export const MAX_CHATGPT_COUNT = 999_999_999;
/** Earliest period end accepted; guards against year typos. */
export const MIN_CHATGPT_PERIOD_END = "2023-01-01";
/** GA4 "Session source" values to match exactly (not "contains"). */
export const GA4_CHATGPT_SESSION_SOURCES = ["chatgpt.com", "chat.openai.com"] as const;
export const GA4_BOOKING_COMPLETED_EVENT = "booking_completed";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Raw form values; blank string = not measured. */
export interface ChatGptReportForm {
  periodEnd: string;
  mentions: string;
  clicks: string;
  topics: string;
  sessions: string;
  bookingClicks: string;
  bookingCompleted: string;
}

export const EMPTY_CHATGPT_FORM: ChatGptReportForm = {
  periodEnd: "",
  mentions: "",
  clicks: "",
  topics: "",
  sessions: "",
  bookingClicks: "",
  bookingCompleted: "",
};

export type ChatGptReportError = "period" | "future" | "count" | "topics" | "empty";

function toUtcMs(date: string): number | null {
  if (!ISO_DATE.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === date ? ms : null;
}

/** First day of the 28-day period ending (inclusively) on `periodEnd`. */
export function chatGptPeriodStart(periodEnd: string): string | null {
  const ms = toUtcMs(periodEnd);
  if (ms === null) return null;
  return new Date(ms - (CHATGPT_PERIOD_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** Blank → null (unknown); "0" → 0 (measured zero); anything else non-numeric is invalid. */
export function parseChatGptCount(raw: string): { ok: true; value: ChatGptCount } | { ok: false } {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d{1,9}$/.test(s)) return { ok: false };
  return { ok: true, value: Number(s) };
}

/** One topic per line; trimmed, de-duplicated (case-insensitive), bounded. */
export function parseDiscoveryTopics(raw: string): string[] | null {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const topic = line.replace(/\s+/g, " ").trim();
    if (!topic || seen.has(topic.toLowerCase())) continue;
    if (topic.length > MAX_TOPIC_LENGTH) return null;
    seen.add(topic.toLowerCase());
    topics.push(topic);
  }
  return topics.length > MAX_DISCOVERY_TOPICS ? null : topics;
}

export function buildChatGptReport(
  form: ChatGptReportForm,
  now: Date,
): { ok: true; report: ChatGptChannelReport } | { ok: false; error: ChatGptReportError } {
  const periodEnd = form.periodEnd.trim();
  const periodStart = chatGptPeriodStart(periodEnd);
  if (!periodStart || periodEnd < MIN_CHATGPT_PERIOD_END) return { ok: false, error: "period" };
  const stamp = now.toISOString();
  if (periodEnd > stamp.slice(0, 10)) return { ok: false, error: "future" };

  const mentions = parseChatGptCount(form.mentions);
  const clicks = parseChatGptCount(form.clicks);
  const sessions = parseChatGptCount(form.sessions);
  const bookingClicks = parseChatGptCount(form.bookingClicks);
  const bookingCompleted = parseChatGptCount(form.bookingCompleted);
  if (!mentions.ok || !clicks.ok || !sessions.ok || !bookingClicks.ok || !bookingCompleted.ok) {
    return { ok: false, error: "count" };
  }
  const topics = parseDiscoveryTopics(form.topics);
  if (!topics) return { ok: false, error: "topics" };

  const report: ChatGptChannelReport = {
    id: `${periodStart}_${periodEnd}`,
    periodStart,
    periodEnd,
    businessHub: {
      source: "chatgpt_business_hub",
      mentions: mentions.value,
      clicks: clicks.value,
      discoveryTopics: topics,
    },
    ga4: {
      source: "ga4",
      chatgptSessions: sessions.value,
      bookingClicks: bookingClicks.value,
      bookingCompleted: bookingCompleted.value,
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
  return hasChatGptMeasurement(report) ? { ok: true, report } : { ok: false, error: "empty" };
}

/** True when at least one figure or topic was actually entered. */
export function hasChatGptMeasurement(report: ChatGptChannelReport): boolean {
  const { businessHub: hub, ga4 } = report;
  const counts = [hub.mentions, hub.clicks];
  counts.push(ga4.chatgptSessions, ga4.bookingClicks, ga4.bookingCompleted);
  return counts.some((v) => v !== null) || hub.discoveryTopics.length > 0;
}

export function sortChatGptReports(reports: ChatGptChannelReport[]): ChatGptChannelReport[] {
  return [...reports].sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
}

/** Replace the report for the same period (keeping its createdAt) or add a new one. */
export function upsertChatGptReport(
  reports: ChatGptChannelReport[],
  report: ChatGptChannelReport,
):
  | { ok: true; reports: ChatGptChannelReport[]; replaced: boolean }
  | { ok: false; error: "capacity" } {
  const prev = reports.find((r) => r.id === report.id);
  if (!prev && reports.length >= MAX_CHATGPT_REPORTS) return { ok: false, error: "capacity" };
  const next = { ...report, createdAt: prev?.createdAt || report.createdAt };
  return {
    ok: true,
    replaced: !!prev,
    reports: sortChatGptReports([next, ...reports.filter((r) => r.id !== report.id)]),
  };
}

export function removeChatGptReport(
  reports: ChatGptChannelReport[],
  id: string,
): ChatGptChannelReport[] {
  return reports.filter((r) => r.id !== id);
}

export function chatGptReportToForm(report: ChatGptChannelReport): ChatGptReportForm {
  const text = (v: ChatGptCount) => (v === null ? "" : String(v));
  return {
    periodEnd: report.periodEnd,
    mentions: text(report.businessHub.mentions),
    clicks: text(report.businessHub.clicks),
    topics: report.businessHub.discoveryTopics.join("\n"),
    sessions: text(report.ga4.chatgptSessions),
    bookingClicks: text(report.ga4.bookingClicks),
    bookingCompleted: text(report.ga4.bookingCompleted),
  };
}

function coerceCount(v: unknown): ChatGptCount {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CHATGPT_COUNT
    ? v
    : null;
}

/** Defensive read of persisted JSONB: drops malformed entries, never invents values. */
export function normalizeChatGptReports(raw: unknown): ChatGptChannelReport[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, ChatGptChannelReport>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<ChatGptChannelReport>;
    const periodEnd = typeof r.periodEnd === "string" ? r.periodEnd : "";
    const periodStart = chatGptPeriodStart(periodEnd);
    if (!periodStart || r.periodStart !== periodStart) continue;
    const topics = Array.isArray(r.businessHub?.discoveryTopics)
      ? r.businessHub.discoveryTopics.filter((x): x is string => typeof x === "string")
      : [];
    byId.set(`${periodStart}_${periodEnd}`, {
      id: `${periodStart}_${periodEnd}`,
      periodStart,
      periodEnd,
      businessHub: {
        source: "chatgpt_business_hub",
        mentions: coerceCount(r.businessHub?.mentions),
        clicks: coerceCount(r.businessHub?.clicks),
        discoveryTopics: topics.slice(0, MAX_DISCOVERY_TOPICS),
      },
      ga4: {
        source: "ga4",
        chatgptSessions: coerceCount(r.ga4?.chatgptSessions),
        bookingClicks: coerceCount(r.ga4?.bookingClicks),
        bookingCompleted: coerceCount(r.ga4?.bookingCompleted),
      },
      createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
      updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
    });
  }
  return sortChatGptReports([...byId.values()]).slice(0, MAX_CHATGPT_REPORTS);
}
