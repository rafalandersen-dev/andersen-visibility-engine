import type { ContentAsset, Opportunity, Project, ScheduledPublish } from "./types";
import {
  computeMonthlySlots,
  normalizeAutoSchedulerConfig,
  zonedTimeToUtc,
} from "./auto-scheduler";
import { publishReadiness } from "./calendar-schedule";
import { opportunityLifecycleStatus } from "./opportunities";
import { effectivePublishMode } from "./publish-targets";
export type OperationalNotificationKind =
  | "approval_due"
  | "publication_failed"
  | "manual_overdue"
  | "cadence_gap"
  | "scheduler_recovery"
  | "generation_capacity_low"
  | "generation_capacity_unavailable";
export interface OperationalNotificationEvent {
  key: string;
  kind: OperationalNotificationKind;
  projectId: string;
  targetId: string;
  title: string;
  dueAt: string | null;
  detail: {
    timeZone: string;
    missing?: number;
    total?: number;
    remaining?: number;
    plannedPeriod?: string;
    usagePeriod?: string;
    queueId?: string;
  };
}
function localDay(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}
function deadline(value: string, timeZone: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value)
      throw new Error("invalid_notification_deadline");
    return zonedTimeToUtc({ year, month, day, hour: 23, minute: 59 }, timeZone);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_notification_deadline");
  return date;
}
/** Server snapshot only; queued publication data must come from the queue table. */
export function operationalNotifications(args: {
  projects: Project[];
  assets: ContentAsset[];
  opportunities: Opportunity[];
  scheduled: ScheduledPublish[];
  now: Date;
  schedulerLeases?: Array<{
    projectId: string;
    plannedPeriod: string;
    status: "active" | "released" | "unknown";
    acquiredAt: string;
    leaseUntil: string;
  }>;
}): OperationalNotificationEvent[] {
  const events: OperationalNotificationEvent[] = [];
  for (const project of args.projects) {
    const cfg = normalizeAutoSchedulerConfig(project.autoScheduler);
    const timeZone = cfg.timeZone;
    const today = localDay(args.now, timeZone); // also validates the project's time zone
    const assets = args.assets.filter((a) => a.projectId === project.id);
    const byId = new Map(assets.map((a) => [a.id, a]));
    const queue = args.scheduled.filter((q) => q.projectId === project.id);
    const add = (
      kind: OperationalNotificationKind,
      targetId: string,
      title: string,
      dueAt: string | null,
      version: string,
      detail = {},
    ) => {
      events.push({
        key: JSON.stringify([project.id, kind, targetId, version]),
        kind,
        projectId: project.id,
        targetId,
        title: title.slice(0, 300),
        dueAt,
        detail: { timeZone, ...detail },
      });
    };
    for (const lease of args.schedulerLeases ?? []) {
      if (lease.projectId !== project.id || lease.status === "released") continue;
      if (lease.status === "active" && Date.parse(lease.leaseUntil) > args.now.getTime()) continue;
      add(
        "scheduler_recovery",
        project.id,
        `${project.businessName || project.name} · ${lease.plannedPeriod}`,
        lease.leaseUntil,
        lease.acquiredAt,
      );
    }
    for (const q of queue) {
      const asset = byId.get(q.assetId);
      if (!asset || asset.livePublishStatus === "published") continue;
      if (q.status === "failed") {
        add("publication_failed", asset.id, asset.title, q.publishAt, `${q.id}:${q.publishAt}`, {
          queueId: q.id,
        });
      }
      const left = Date.parse(q.publishAt) - args.now.getTime();
      if (
        q.status === "pending" &&
        left >= 0 &&
        left <= 24 * 60 * 60_000 &&
        asset.status !== "Approved" &&
        asset.status !== "Exported"
      ) {
        add(
          "approval_due",
          asset.id,
          asset.title,
          q.publishAt,
          `${q.id}:${q.publishAt}:${asset.updatedAt}`,
        );
      }
    }
    for (const opportunity of args.opportunities.filter((o) => o.projectId === project.id)) {
      if (
        !opportunity.dueAt ||
        opportunity.archivedAt ||
        opportunity.deletedAt ||
        opportunity.publishedAt ||
        ["published", "archived"].includes(opportunityLifecycleStatus(opportunity))
      )
        continue;
      const asset =
        byId.get(opportunity.currentContentAssetId ?? "") ??
        assets.find((a) => a.sourceOpportunityId === opportunity.id);
      if (asset?.livePublishStatus === "published") continue;
      const queued =
        asset &&
        queue.some(
          (q) =>
            q.assetId === asset.id && ["pending", "publishing", "published"].includes(q.status),
        );
      if (queued || (asset && queue.some((q) => q.assetId === asset.id && q.status === "failed")))
        continue;
      const due = deadline(opportunity.dueAt, timeZone);
      const left = due.getTime() - args.now.getTime();
      if (
        asset &&
        left >= 0 &&
        left <= 24 * 60 * 60_000 &&
        asset.status !== "Approved" &&
        asset.status !== "Exported"
      ) {
        add(
          "approval_due",
          asset.id,
          asset.title,
          due.toISOString(),
          `${opportunity.dueAt}:${asset.updatedAt}`,
        );
      } else if (left < 0 && effectivePublishMode(project) !== "autoPublishApproved") {
        add(
          "manual_overdue",
          opportunity.id,
          opportunity.title,
          due.toISOString(),
          `${opportunity.dueAt}:${opportunity.version ?? 0}`,
        );
      }
    }
    // Cadence belongs only to an explicitly enabled schedule. Finite quota alone
    // never invents a promise to publish weekly. Next week is project-local Mon–Sun.
    if (!cfg.enabled) continue;
    const weekday = today.getUTCDay() || 7;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + 8 - weekday);
    const end = new Date(monday);
    end.setUTCDate(end.getUTCDate() + 7);
    const startDay = monday.toISOString().slice(0, 10),
      endDay = end.toISOString().slice(0, 10);
    const months = new Map(
      [monday, new Date(end.getTime() - 1)].map((d) => [
        `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
        d,
      ]),
    );
    const slots = [...months.values()]
      .flatMap((d) => computeMonthlySlots(d.getUTCFullYear(), d.getUTCMonth() + 1, cfg))
      .filter((s) => s.localDate >= startDay && s.localDate < endDay);
    const covered = slots.filter((slot) =>
      queue.some((q) => {
        const asset = byId.get(q.assetId);
        return (
          Date.parse(q.publishAt) === Date.parse(slot.publishAt) &&
          ["pending", "publishing", "published"].includes(q.status) &&
          (q.status === "published" ||
            (asset && publishReadiness(asset, project, args.assets).ready))
        );
      }),
    ).length;
    if (covered < slots.length)
      add(
        "cadence_gap",
        project.id,
        project.businessName || project.name,
        slots[0]?.publishAt ?? null,
        JSON.stringify([startDay, cfg.weekdays, cfg.publishTime, timeZone]),
        { missing: slots.length - covered, total: slots.length },
      );
  }
  if (events.length > 500) throw new Error("notification_scan_too_large");
  return events;
}
