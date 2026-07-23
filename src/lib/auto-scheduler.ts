/**
 * Monthly Auto-Scheduler — pure planning logic (owner spec 2026-07-23).
 *
 * Each month (~25th, pg_cron) the server fills NEXT month's content calendar
 * for every project that opted in: compute the cadence slots, cap by the plan's
 * remaining monthly content quota, pick candidates from the Plan board, and
 * hand each one to the generation pipeline. This module is the deterministic
 * half of that job — slot math, candidate ordering, quota capping and automatic
 * internal-link resolution. It does NO I/O and touches no store, so every rule
 * the runner enforces is provable here.
 *
 * Hard guardrails (owner-stated) enforced by these functions:
 * - never exceed the plan quota (target = min(slots, remaining quota));
 * - never double-book a slot (already-booked instants are dropped first);
 * - never leave an unresolved internal link in auto mode (near-miss links are
 *   remapped to the closest real page, everything else is unlinked — the
 *   publish gate still re-checks at fire time).
 */
import type { DiscoverySuggestion, Opportunity } from "./types";
import { opportunityLifecycleStatus } from "./opportunities";
import {
  classifyInternalLinks,
  linkPathToTextAt,
  normalizeInternalPath,
  replaceLinkPathAt,
} from "./markdown";

// ---------------------------------------------------------------------------
// Config (persisted on Project.autoScheduler)
// ---------------------------------------------------------------------------

export interface AutoSchedulerConfig {
  enabled: boolean;
  /** ISO weekdays to publish on, 1=Mon..7=Sun. Owner default: Tue+Thu. */
  weekdays: number[];
  /** "HH:mm" local wall-clock time in `timeZone`. Owner default: 09:00. */
  publishTime: string;
  /** IANA zone the wall-clock time is anchored to (e.g. "Europe/Stockholm"). */
  timeZone: string;
  /** auto_publish arms real go-lives; approve_first holds at Ready for the owner. */
  mode: "auto_publish" | "approve_first";
  /** Recipient of the run-summary email; empty → no email. */
  summaryEmail?: string;
}

export const AUTO_SCHEDULER_DEFAULTS: Omit<AutoSchedulerConfig, "enabled"> = {
  weekdays: [2, 4],
  publishTime: "09:00",
  timeZone: "Europe/Stockholm",
  mode: "approve_first",
};

/** Normalise a possibly-partial persisted config against the defaults. */
export function normalizeAutoSchedulerConfig(
  raw: Partial<AutoSchedulerConfig> | undefined,
): AutoSchedulerConfig {
  const weekdays = (raw?.weekdays ?? AUTO_SCHEDULER_DEFAULTS.weekdays)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  return {
    enabled: raw?.enabled === true,
    weekdays: weekdays.length ? [...new Set(weekdays)] : [...AUTO_SCHEDULER_DEFAULTS.weekdays],
    publishTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(raw?.publishTime ?? "")
      ? (raw!.publishTime as string)
      : AUTO_SCHEDULER_DEFAULTS.publishTime,
    timeZone: raw?.timeZone?.trim() || AUTO_SCHEDULER_DEFAULTS.timeZone,
    mode: raw?.mode === "auto_publish" ? "auto_publish" : "approve_first",
    ...(raw?.summaryEmail?.trim() ? { summaryEmail: raw.summaryEmail.trim() } : {}),
  };
}

// ---------------------------------------------------------------------------
// Timezone math — zoned wall-clock → UTC instant, no dependencies
// ---------------------------------------------------------------------------

/**
 * The zone's UTC offset (ms) at a given instant, via Intl. Two-pass below makes
 * this exact across DST transitions for every real publish time.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour === 24 ? 0 : parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/**
 * The UTC instant at which `timeZone`'s wall clock reads the given local time.
 * Throws on an unknown zone (the runner catches per-project and reports).
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const offset1 = zoneOffsetMs(new Date(guess), timeZone);
  const offset2 = zoneOffsetMs(new Date(guess - offset1), timeZone);
  return new Date(guess - offset2);
}

// ---------------------------------------------------------------------------
// Slot computation
// ---------------------------------------------------------------------------

export interface ScheduleSlot {
  /** UTC instant, ISO with Z — the exact string handed to the schedule queue. */
  publishAt: string;
  /** Local calendar day "YYYY-MM-DD" in the project zone, for emails/UI. */
  localDate: string;
}

/**
 * All cadence slots in the given month (1-12), sorted ascending. Instants that
 * collide (to the minute) with `bookedInstants` are dropped — the never-double-
 * book guardrail; booked = pending scheduled_publishes + already-live mirrors.
 */
export function computeMonthlySlots(
  year: number,
  month: number,
  config: Pick<AutoSchedulerConfig, "weekdays" | "publishTime" | "timeZone">,
  bookedInstants: Iterable<string> = [],
): ScheduleSlot[] {
  const [hour, minute] = config.publishTime.split(":").map(Number);
  const booked = new Set<number>();
  for (const iso of bookedInstants) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) booked.add(Math.floor(t / 60_000));
  }
  const slots: ScheduleSlot[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    // ISO weekday of the local calendar day (zone-independent — a calendar
    // date has the same weekday everywhere).
    const isoWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
    if (!config.weekdays.includes(isoWeekday)) continue;
    const utc = zonedTimeToUtc({ year, month, day, hour, minute }, config.timeZone);
    if (booked.has(Math.floor(utc.getTime() / 60_000))) continue;
    slots.push({
      publishAt: utc.toISOString(),
      localDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return slots;
}

/** The {year, month} of the month AFTER the instant (the month being planned). */
export function nextMonthOf(now: Date): { year: number; month: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

// ---------------------------------------------------------------------------
// Candidate selection (owner: Planned → Queued → top Ideas)
// ---------------------------------------------------------------------------

const IMPACT_RANK = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 } as const;

function candidateRank(o: Opportunity): number {
  const impact = o.businessImpact ? IMPACT_RANK[o.businessImpact] : 1;
  const priority = PRIORITY_RANK[o.priority] ?? 1;
  return impact * 10 + priority;
}

/**
 * Pick up to `target` opportunities to draft, in the owner's order: the
 * prioritized column first, then captured, each ranked by business impact then
 * priority. Only pre-drafting stages qualify — anything already drafting,
 * scheduled or beyond is someone's active work and is never touched. An
 * opportunity that already has a content asset is skipped (its draft exists;
 * regenerating would overwrite human work).
 */
export function selectCandidates(opportunities: Opportunity[], target: number): Opportunity[] {
  const eligible = opportunities.filter((o) => {
    const stage = opportunityLifecycleStatus(o);
    return (stage === "prioritized" || stage === "captured") && !o.currentContentAssetId;
  });
  const stageRank = (o: Opportunity) => (opportunityLifecycleStatus(o) === "prioritized" ? 0 : 1);
  return eligible
    .sort((a, b) => stageRank(a) - stageRank(b) || candidateRank(a) - candidateRank(b))
    .slice(0, Math.max(0, target));
}

/**
 * Fresh Discover suggestions usable as refill when the board runs short:
 * still "suggested", not yet accepted or dismissed, deduped by key.
 */
export function refillableSuggestions(
  suggestions: DiscoverySuggestion[],
  needed: number,
): DiscoverySuggestion[] {
  const seen = new Set<string>();
  const out: DiscoverySuggestion[] = [];
  for (const s of suggestions) {
    if (s.status !== "suggested") continue;
    const key = s.deduplicationKey || s.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= needed) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Automatic internal-link resolution
// ---------------------------------------------------------------------------

/** Path similarity in [0,1]: shared /-segment tokens (order-insensitive Dice). */
function pathSimilarity(a: string, b: string): number {
  const tokens = (p: string) =>
    p
      .toLowerCase()
      .split(/[/\-_]+/)
      .filter(Boolean);
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (!ta.length || !tb.size) return 0;
  const shared = ta.filter((t) => tb.has(t)).length;
  return (2 * shared) / (ta.length + tb.size);
}

/** Minimum similarity for a near-miss remap; below this the link is unlinked. */
const REMAP_THRESHOLD = 0.55;

/** The closest real path to a broken one, or null when nothing is close enough. */
export function closestKnownPath(broken: string, knownPaths: Iterable<string>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const known of knownPaths) {
    const score = pathSimilarity(broken, known);
    if (score > bestScore || (score === bestScore && best && known < best)) {
      best = known;
      bestScore = score;
    }
  }
  return bestScore >= REMAP_THRESHOLD ? best : null;
}

export interface AutoResolveResult {
  markdown: string;
  /** oldPath → newPath remaps applied (near-miss to a real page). */
  remapped: Array<{ from: string; to: string }>;
  /** Paths whose links were converted to plain text (nothing close enough). */
  unlinked: string[];
}

/**
 * Resolve every UNRESOLVED internal link without a human click: a near-miss is
 * remapped to the closest real page in the active path set, anything else is
 * unlinked (text kept, link dropped) — an auto-drafted article must never sit
 * hard-blocked on links nobody is around to fix. One occurrence per pass,
 * re-classifying after each rewrite, so occurrence indices never go stale
 * (the exact bug class PR #15 fixed in the manual resolver).
 */
export function autoResolveInternalLinks(
  markdown: string,
  activePaths: Set<string>,
): AutoResolveResult {
  const normalizedActive = new Set([...activePaths].map(normalizeInternalPath));
  const remapped: Array<{ from: string; to: string }> = [];
  const unlinked: string[] = [];
  let md = markdown;
  // Bounded: each pass strictly reduces the unresolved count by one.
  for (let guard = 0; guard < 200; guard++) {
    const unresolved = classifyInternalLinks(md, normalizedActive, new Set()).find(
      (l) => l.state === "UNRESOLVED",
    );
    if (!unresolved) break;
    const to = closestKnownPath(unresolved.path, normalizedActive);
    if (to && to !== unresolved.path) {
      md = replaceLinkPathAt(md, unresolved.path, unresolved.occurrence, to);
      remapped.push({ from: unresolved.path, to });
    } else {
      md = linkPathToTextAt(md, unresolved.path, unresolved.occurrence);
      unlinked.push(unresolved.path);
    }
  }
  return { markdown: md, remapped, unlinked };
}

// ---------------------------------------------------------------------------
// Quota capping
// ---------------------------------------------------------------------------

/**
 * How many articles this run may generate: the owner's never-exceed-quota
 * guardrail. `remainingQuota` < 0 (unlimited/owner) means no cap.
 */
export function runTarget(slotCount: number, remainingQuota: number): number {
  if (remainingQuota < 0) return slotCount;
  return Math.max(0, Math.min(slotCount, remainingQuota));
}
