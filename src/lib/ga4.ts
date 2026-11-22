/**
 * GA4 Data API sync for the ChatGPT channel — pure, client-safe helpers
 * (ranges, request bodies, response normalisation, staleness). No tokens, no I/O.
 */
import {
  CHATGPT_PERIOD_DAYS,
  GA4_BOOKING_COMPLETED_EVENT,
  GA4_CHATGPT_SESSION_SOURCES,
  MAX_CHATGPT_COUNT,
} from "./chatgpt-channel";
import type { ChatGptChannelReport, ChatGptCount, Ga4SyncState } from "./types";

export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GA4_BOOKING_CLICK_EVENT = "booking_click";
const BOOKING_EVENTS = [GA4_BOOKING_CLICK_EVENT, GA4_BOOKING_COMPLETED_EVENT];
/** A successful snapshot is refreshed on open once older than this. */
export const GA4_STALE_AFTER_MS = 6 * 3_600_000;
/** After a failed automatic attempt, do not retry on open for this long. */
export const GA4_RETRY_AFTER_MS = 15 * 60_000;

/**
 * Test rollout: Google has not verified the analytics.readonly scope, so the sync
 * is offered only for the Synergy Massage project, and the server additionally
 * requires the platform owner role and the project in the caller's own workspace.
 */
const GA4_ROLLOUT_HOSTS = ["synergymassage.se"];

export function isGa4RolloutProject(project: { websiteUrl?: unknown } | null | undefined): boolean {
  if (typeof project?.websiteUrl !== "string") return false;
  try {
    const url = new URL(project.websiteUrl);
    return (
      url.protocol === "https:" &&
      GA4_ROLLOUT_HOSTS.includes(url.hostname.toLowerCase().replace(/^www\./, ""))
    );
  } catch {
    return false;
  }
}

export interface Ga4Property {
  id: string;
  name: string;
  account: string;
}

export function parseGa4PropertyId(raw: unknown): string | null {
  return typeof raw === "string" && /^\d{1,20}$/.test(raw) ? raw : null;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The 28 most recent COMPLETE days in the property's reporting time zone: ends
 * yesterday there. GA4 interprets startDate/endDate in that same zone, so the
 * dates are sent as calendar days and never converted through UTC.
 */
export function ga4Range(
  timeZone: string,
  now = new Date(),
): { startDate: string; endDate: string } | null {
  if (!isValidTimeZone(timeZone)) return null;
  const end = new Date(`${localDate(now, timeZone)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (CHATGPT_PERIOD_DAYS - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

const inList = (fieldName: string, values: readonly string[]) => ({
  filter: { fieldName, inListFilter: { values: [...values], caseSensitive: false } },
});

/**
 * Three reports in one batch call:
 * 0. sessions by session source (exact chatgpt.com / chat.openai.com, no "contains");
 * 1. booking event counts for those sessions;
 * 2. the same events property-wide, only to tell "event never recorded" from zero.
 */
export function buildGa4BatchBody(range: { startDate: string; endDate: string }) {
  const dateRanges = [range];
  const source = inList("sessionSource", GA4_CHATGPT_SESSION_SOURCES);
  const events = inList("eventName", BOOKING_EVENTS);
  return {
    requests: [
      {
        dateRanges,
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: source,
        limit: 10,
      },
      {
        dateRanges,
        dimensions: [{ name: "sessionSource" }, { name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { andGroup: { expressions: [source, events] } },
        limit: 20,
      },
      {
        dateRanges,
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: events,
        limit: 10,
      },
    ],
  };
}

export class Ga4ResponseError extends Error {
  constructor() {
    super("ga4_malformed");
  }
}

interface ParsedReport {
  rows: { dims: string[]; value: number }[];
  partial: boolean;
}

function parseReport(value: unknown, dims: number): ParsedReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Ga4ResponseError();
  const r = value as { rows?: unknown; metadata?: unknown };
  const rawRows = r.rows === undefined ? [] : r.rows;
  if (!Array.isArray(rawRows) || rawRows.length > 100) throw new Ga4ResponseError();
  const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as {
    subjectToThresholding?: unknown;
    dataLossFromOtherRow?: unknown;
    samplingMetadatas?: unknown;
  };
  const rows = rawRows.map((row) => {
    const dv = (row as { dimensionValues?: unknown })?.dimensionValues;
    const mv = (row as { metricValues?: unknown })?.metricValues;
    if (!Array.isArray(dv) || dv.length !== dims || !Array.isArray(mv) || mv.length !== 1)
      throw new Ga4ResponseError();
    const raw = (mv[0] as { value?: unknown })?.value;
    if (typeof raw !== "string" || !/^\d{1,12}$/.test(raw)) throw new Ga4ResponseError();
    const value = Number(raw);
    if (value > MAX_CHATGPT_COUNT) throw new Ga4ResponseError();
    const names = dv.map((d) => (d as { value?: unknown })?.value);
    if (names.some((n) => typeof n !== "string" || n.length > 200)) throw new Ga4ResponseError();
    return { dims: names as string[], value };
  });
  return {
    rows,
    partial:
      meta.subjectToThresholding === true ||
      meta.dataLossFromOtherRow === true ||
      (Array.isArray(meta.samplingMetadatas) && meta.samplingMetadatas.length > 0),
  };
}

export interface Ga4Figures {
  chatgptSessions: ChatGptCount;
  bookingClicks: ChatGptCount;
  bookingCompleted: ChatGptCount;
  partial: boolean;
}

/**
 * Turns the batch response into figures. A zero is reported as 0 only when GA4
 * answered completely; when data was thresholded/limited, or the event was never
 * recorded anywhere in the property, a missing row is "not measured" (null).
 */
export function summarizeGa4Batch(json: unknown): Ga4Figures {
  const reports = (json as { reports?: unknown } | null)?.reports;
  if (!Array.isArray(reports) || reports.length !== 3) throw new Ga4ResponseError();
  const sessions = parseReport(reports[0], 1);
  const byEvent = parseReport(reports[1], 2);
  const seen = parseReport(reports[2], 1);
  const partial = sessions.partial || byEvent.partial || seen.partial;
  const isSource = (s: string) =>
    (GA4_CHATGPT_SESSION_SOURCES as readonly string[]).includes(s.toLowerCase());
  const sum = (rows: ParsedReport["rows"]) => rows.reduce((a, r) => a + r.value, 0);
  const count = (rows: ParsedReport["rows"], found: boolean): ChatGptCount => {
    const total = sum(rows);
    if (total > MAX_CHATGPT_COUNT) throw new Ga4ResponseError();
    return total > 0 ? total : found && !partial ? 0 : null;
  };
  const sessionRows = sessions.rows.filter((r) => isSource(r.dims[0]));
  const event = (name: string): ChatGptCount => {
    const hit = byEvent.rows.filter((r) => isSource(r.dims[0]) && r.dims[1].toLowerCase() === name);
    const recorded = seen.rows.some((r) => r.dims[0].toLowerCase() === name && r.value > 0);
    return count(hit, recorded);
  };
  return {
    chatgptSessions: count(sessionRows, true),
    bookingClicks: event(GA4_BOOKING_CLICK_EVENT),
    bookingCompleted: event(GA4_BOOKING_COMPLETED_EVENT),
    partial,
  };
}

/** accountSummaries → flat property list (ids validated, bounded). */
export function parseGa4AccountSummaries(json: unknown): Ga4Property[] {
  const accounts = (json as { accountSummaries?: unknown } | null)?.accountSummaries;
  if (accounts === undefined) return [];
  if (!Array.isArray(accounts)) throw new Ga4ResponseError();
  const out: Ga4Property[] = [];
  for (const a of accounts) {
    const account = typeof a?.displayName === "string" ? a.displayName.slice(0, 120) : "";
    const props: unknown = a?.propertySummaries;
    if (!Array.isArray(props)) continue;
    for (const p of props) {
      const id = typeof p?.property === "string" ? /^properties\/(\d{1,20})$/.exec(p.property)?.[1] : null;
      if (!id) continue;
      const name = typeof p.displayName === "string" && p.displayName ? p.displayName : id;
      out.push({ id, name: name.slice(0, 120), account });
    }
  }
  return out.slice(0, 500);
}

/** Admin API property resource → verified identity + reporting time zone. */
export function parseGa4PropertyResource(
  json: unknown,
  expectedId: string,
): { name: string; timeZone: string } | null {
  const r = json as { name?: unknown; displayName?: unknown; timeZone?: unknown } | null;
  if (!r || r.name !== `properties/${expectedId}` || !isValidTimeZone(r.timeZone)) return null;
  const name = typeof r.displayName === "string" && r.displayName ? r.displayName : expectedId;
  return { name: name.slice(0, 120), timeZone: r.timeZone };
}

/**
 * Open-time refresh policy: only for a project with a selected property, when the
 * saved API snapshot is missing, for an older period, or older than the stale
 * window — and not right after a failed attempt (no retry loop on open).
 */
export function shouldAutoRefreshGa4(
  sync: Ga4SyncState | undefined,
  reports: ChatGptChannelReport[],
  now: Date,
): boolean {
  if (!sync?.propertyId) return false;
  if (sync.lastError === "not_connected" || sync.lastError === "expired") return false;
  const attempt = sync.lastAttemptAt ? Date.parse(sync.lastAttemptAt) : NaN;
  if (sync.lastError && Number.isFinite(attempt) && now.getTime() - attempt < GA4_RETRY_AFTER_MS)
    return false;
  const range = ga4Range(sync.timeZone, now);
  if (!range) return false;
  const snap = reports.find(
    (r) => r.periodEnd === range.endDate && r.ga4Api?.propertyId === sync.propertyId,
  )?.ga4Api;
  const fetched = snap ? Date.parse(snap.fetchedAt) : NaN;
  return !snap || !Number.isFinite(fetched) || now.getTime() - fetched >= GA4_STALE_AFTER_MS;
}
