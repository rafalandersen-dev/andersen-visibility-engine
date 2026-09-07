import {
  computeMonthlySlots,
  nextMonthOf,
  normalizeAutoSchedulerConfig,
  unfilledSchedulerSlots,
} from "./auto-scheduler";
import type { ContentAsset, Project, ScheduledPublish } from "./types";
import type { OperationalNotificationEvent } from "./operational-notifications";

export interface SchedulerDemand {
  projectId: string;
  title: string;
  timeZone: string;
  plannedPeriod: string;
  missing: number;
}

/** Matches the monthly scheduler's preparation horizon and saved-draft accounting. */
export function schedulerDemand(args: {
  projects: Project[];
  assets: ContentAsset[];
  scheduled: ScheduledPublish[];
  now: Date;
}): SchedulerDemand[] {
  const planned = nextMonthOf(args.now);
  const plannedPeriod = `${planned.year}-${String(planned.month).padStart(2, "0")}`;
  return args.projects.flatMap((project) => {
    const cfg = normalizeAutoSchedulerConfig(project.autoScheduler);
    if (!cfg.enabled) return [];
    const content = args.assets.filter((asset) => asset.projectId === project.id);
    const booked = args.scheduled
      .filter((q) => q.projectId === project.id && ["pending", "publishing"].includes(q.status))
      .map((q) => q.publishAt);
    booked.push(
      ...content.flatMap((asset) => (asset.scheduledPublishAt ? [asset.scheduledPublishAt] : [])),
    );
    const missing = unfilledSchedulerSlots(
      computeMonthlySlots(planned.year, planned.month, cfg),
      booked,
      content.filter((asset) => asset.autoScheduledFor === plannedPeriod),
    ).length;
    return missing
      ? [
          {
            projectId: project.id,
            title: project.businessName || project.name,
            timeZone: cfg.timeZone,
            plannedPeriod,
            missing,
          },
        ]
      : [];
  });
}

export type GenerationCapacity =
  | { status: "verified"; remaining: number; usagePeriod: string }
  | { status: "unavailable"; usagePeriod: string };

/** A planning warning only: no quota reservation, execution or entitlement change. */
export function schedulerCapacityNotifications(
  demand: SchedulerDemand[],
  capacity: GenerationCapacity,
): OperationalNotificationEvent[] {
  const total = demand.reduce((sum, project) => sum + project.missing, 0);
  if (!total) return [];
  if (capacity.status === "verified" && (capacity.remaining === -1 || capacity.remaining >= total))
    return [];
  const kind =
    capacity.status === "verified" ? "generation_capacity_low" : "generation_capacity_unavailable";
  return demand.map((project) => ({
    key: JSON.stringify([project.projectId, kind, capacity.usagePeriod, project.plannedPeriod]),
    kind,
    projectId: project.projectId,
    targetId: project.projectId,
    title: project.title.slice(0, 300),
    dueAt: null,
    detail: {
      timeZone: project.timeZone,
      plannedPeriod: project.plannedPeriod,
      usagePeriod: capacity.usagePeriod,
      missing: project.missing,
      total,
      ...(capacity.status === "verified" ? { remaining: capacity.remaining } : {}),
    },
  }));
}
