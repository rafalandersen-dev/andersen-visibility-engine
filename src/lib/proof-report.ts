/**
 * Monthly Proof Report (Europe-#1 move 3) — pure, read-only aggregation.
 *
 * "What did Milo actually do for you this month?" — the retention artifact:
 * pieces that went LIVE (with URLs — the four-state honesty carries over:
 * only liveUrl-bearing assets count as published), drafts written, verified
 * partner links, a GSC snapshot when available, and next month's plan.
 * No I/O and no store access: the /app/report page feeds it store state, the
 * email server fn feeds it the workspace row it re-reads itself.
 */
import type { CalendarItem, ContentAsset, GscImport, GscLite, Project } from "./types";

export interface ProofPublishedItem {
  id: string;
  title: string;
  liveUrl?: string;
  publishedAt: string;
}

export interface ProofPlanItem {
  title: string;
  plannedDate: string;
  contentType: string;
}

export interface ProofGscSnapshot {
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number;
  importedAt: string;
  rangeLabel?: string;
}

export interface MonthlyProofReport {
  monthKey: string; // "YYYY-MM"
  published: ProofPublishedItem[];
  draftedCount: number;
  scheduledCount: number;
  linksLive: number | null; // null = unknown (fetch failed), 0 = known zero
  gsc: ProofGscSnapshot | null;
  nextMonthPlan: ProofPlanItem[];
}

/** "YYYY-MM" for an ISO date/timestamp; "" when unparsable. */
export function monthKeyOf(iso: string | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}` : "";
}

export function addMonths(monthKey: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}

/** The last `count` month keys ending at (and including) `endMonthKey`. */
export function recentMonthKeys(endMonthKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonthKey, -i));
}

/**
 * The trustworthy go-live timestamp for an asset, or undefined (review HIGH):
 * `lastPublishedAt` is a DRAFT-SEND stamp — the WP/Shopify live paths never
 * write it, and the failure paths attempt-stamp both it and `livePublishedAt`.
 * So: statuses gate the stamps — `livePublishedAt` only when livePublishStatus
 * is "published", else `lastPublishedAt` only when publishStatus is "sent".
 */
function goLiveStamp(c: ContentAsset): string | undefined {
  if (c.livePublishStatus === "published" && c.livePublishedAt) return c.livePublishedAt;
  if (c.publishStatus === "sent" && c.lastPublishedAt) return c.lastPublishedAt;
  return undefined;
}

function latestGscImport(gscLite: GscLite | undefined): GscImport | null {
  const imports = gscLite?.imports ?? [];
  if (imports.length === 0) return null;
  const byId = gscLite?.latestImportId
    ? imports.find((i) => i.id === gscLite.latestImportId)
    : undefined;
  if (byId) return byId;
  return [...imports].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0];
}

export function buildMonthlyProofReport(args: {
  project: Pick<Project, "id" | "gscLite">;
  content: ContentAsset[];
  calendar: CalendarItem[];
  monthKey: string;
  /** Verified Live ✓ partner links, fetched separately; null when unknown. */
  linksLive: number | null;
}): MonthlyProofReport {
  const { project, monthKey } = args;
  const content = args.content.filter((c) => c.projectId === project.id);
  const calendar = args.calendar.filter((c) => c.projectId === project.id);
  const nextMonth = addMonths(monthKey, 1);

  const published = content
    .map((c) => ({ c, at: goLiveStamp(c) }))
    .filter(
      (x): x is { c: ContentAsset; at: string } =>
        Boolean(x.c.liveUrl) && monthKeyOf(x.at) === monthKey,
    )
    .map(({ c, at }) => ({ id: c.id, title: c.title, liveUrl: c.liveUrl, publishedAt: at }))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));

  const draftedCount = content.filter((c) => monthKeyOf(c.createdAt) === monthKey).length;

  const scheduledCount = content.filter(
    (c) => !c.liveUrl && monthKeyOf(c.scheduledPublishAt) === monthKey,
  ).length;

  const nextMonthPlan = calendar
    .filter((c) => c.status !== "Done" && monthKeyOf(c.plannedDate) === nextMonth)
    .map((c) => ({ title: c.topicTitle, plannedDate: c.plannedDate, contentType: c.contentType }))
    .sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1));

  const imp = latestGscImport(project.gscLite);
  const gsc: ProofGscSnapshot | null = imp
    ? {
        totalClicks: imp.summary.totalClicks,
        totalImpressions: imp.summary.totalImpressions,
        averageCtr: imp.summary.averageCtr,
        averagePosition: imp.summary.averagePosition,
        importedAt: imp.importedAt,
        rangeLabel: imp.dateRange?.label,
      }
    : null;

  return {
    monthKey,
    published,
    draftedCount,
    scheduledCount,
    linksLive: args.linksLive,
    gsc,
    nextMonthPlan,
  };
}
