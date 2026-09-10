import { z } from "zod";
import {
  computeMonthlySlots,
  unfilledSchedulerSlots,
  zonedTimeToUtc,
  type AutoSchedulerConfig,
  type ScheduleSlot,
} from "./auto-scheduler";
import type { ContentAsset } from "./types";

export const weeklyPreparationSchema = z
  .object({
    preparationWeekday: z.number().int().min(1).max(7).default(5),
    preparationTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default("16:00"),
    reviewLeadHours: z.number().int().min(1).max(168).default(48),
  })
  .strict();
export type WeeklyPreparationConfig = z.infer<typeof weeklyPreparationSchema>;
const dayMs = 86400000;
const dateText = (date: Date) => date.toISOString().slice(0, 10);
function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}
function calendarDate(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("invalid_week_date");
  const date = new Date(raw + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || dateText(date) !== raw)
    throw new Error("invalid_week_date");
  return date;
}
export function localWeekStart(now: Date, timeZone: string) {
  const p = localParts(now, timeZone);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return dateText(new Date(date.getTime() - ((date.getUTCDay() || 7) - 1) * dayMs));
}
/** Nonexistent DST wall times remain uncovered; repeated times choose the
 * earlier occurrence deterministically. Never silently move a chosen local time. */
export function weeklyWallTime(date: string, time: string, timeZone: string): string | null {
  const day = calendarDate(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("invalid_week_time");
  const [hour, minute] = time.split(":").map(Number);
  const target = {
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
    hour,
    minute,
  };
  const guess = zonedTimeToUtc(target, timeZone).getTime();
  const matches: number[] = [];
  for (let delta = -180; delta <= 180; delta += 15) {
    const instant = guess + delta * 60000;
    const parts = localParts(new Date(instant), timeZone);
    if (
      Object.keys(target).every(
        (key) => parts[key as keyof typeof parts] === target[key as keyof typeof target],
      )
    )
      matches.push(instant);
  }
  return matches.length ? new Date(Math.min(...matches)).toISOString() : null;
}
export interface WeeklySlot extends ScheduleSlot {
  slotId: string;
}
export type WeeklyCoverageIssue = {
  localDate: string;
  reason: "nonexistent-local-time" | "insufficient-review-time";
};
export function planWeeklyPreparation(input: {
  projectId: string;
  weekStart: string;
  now: Date;
  schedule: Pick<AutoSchedulerConfig, "weekdays" | "publishTime" | "timeZone">;
  preparation: WeeklyPreparationConfig;
  booked: string[];
  assets: Pick<
    ContentAsset,
    "projectId" | "autoScheduledFor" | "autoSchedulerPlannedAt" | "scheduledPublishAt"
  >[];
}) {
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .parse(input.projectId);
  const start = calendarDate(input.weekStart);
  if (start.getUTCDay() !== 1 || !Number.isFinite(input.now.getTime()))
    throw new Error("invalid_week_start");
  const preparation = weeklyPreparationSchema.parse(input.preparation);
  const weekdays = z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .parse(input.schedule.weekdays);
  const preparationDate = dateText(
    new Date(start.getTime() - (8 - preparation.preparationWeekday) * dayMs),
  );
  const prepareAt = weeklyWallTime(
    preparationDate,
    preparation.preparationTime,
    input.schedule.timeZone,
  );
  const slots: WeeklySlot[] = [];
  const issues: WeeklyCoverageIssue[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start.getTime() + i * dayMs);
    if (!weekdays.includes(date.getUTCDay() || 7)) continue;
    const localDate = dateText(date);
    const publishAt = weeklyWallTime(
      localDate,
      input.schedule.publishTime,
      input.schedule.timeZone,
    );
    if (!publishAt) {
      issues.push({ localDate, reason: "nonexistent-local-time" });
      continue;
    }
    slots.push({ localDate, publishAt, slotId: `${input.projectId}:${publishAt}` });
  }
  // Resolve monthly legacy reservations against their whole original month,
  // then intersect with this week. Never reserve the same old draft anew weekly.
  const available = new Set<string>();
  for (const month of new Set(slots.map((s) => s.localDate.slice(0, 7)))) {
    const [year, number] = month.split("-").map(Number);
    const allMonth = computeMonthlySlots(year, number, input.schedule).flatMap((slot) => {
      const publishAt = weeklyWallTime(
        slot.localDate,
        input.schedule.publishTime,
        input.schedule.timeZone,
      );
      return publishAt ? [{ ...slot, publishAt }] : [];
    });
    const assets = input.assets.filter(
      (a) =>
        a.projectId === input.projectId &&
        (a.autoScheduledFor === month || a.autoSchedulerPlannedAt || a.scheduledPublishAt),
    );
    for (const slot of unfilledSchedulerSlots(allMonth, input.booked, assets))
      available.add(slot.publishAt);
  }
  const missing = slots
    .filter((s) => available.has(s.publishAt))
    .filter((slot) => {
      if (
        Date.parse(slot.publishAt) <
        input.now.getTime() + preparation.reviewLeadHours * 3600000
      ) {
        issues.push({ localDate: slot.localDate, reason: "insufficient-review-time" });
        return false;
      }
      return true;
    });
  return {
    period: `week:${input.weekStart}`,
    weekStart: input.weekStart,
    prepareAt,
    due: prepareAt !== null && Date.parse(prepareAt) <= input.now.getTime(),
    slots,
    missing,
    issues,
    reserved: slots.filter((s) => !available.has(s.publishAt)),
  };
}

/** Shared lease/read-model period validation. Usage billing periods remain monthly. */
export const schedulerPeriodSchema = z.string().refine((value) => {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return true;
  if (!value.startsWith("week:")) return false;
  try {
    return calendarDate(value.slice(5)).getUTCDay() === 1;
  } catch {
    return false;
  }
}, "invalid_scheduler_period");
