import { describe, expect, it } from "vitest";
import { localWeekStart, planWeeklyPreparation, weeklyWallTime } from "./weekly-preparation";
const base = {
  projectId: "p",
  weekStart: "2026-09-14",
  now: new Date("2026-09-11T14:00:00Z"),
  schedule: { weekdays: [2, 4], publishTime: "09:00", timeZone: "Europe/Stockholm" },
  preparation: { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 },
  booked: [],
  assets: [],
};
describe("weekly preparation horizon", () => {
  it("prepares two next-week slots on the prior Friday without calling them queued", () => {
    const result = planWeeklyPreparation(base);
    expect(result.prepareAt).toBe("2026-09-11T14:00:00.000Z");
    expect(result.due).toBe(true);
    expect(result.missing.map((s) => s.localDate)).toEqual(["2026-09-15", "2026-09-17"]);
    expect(result.reserved).toEqual([]);
  });
  it("uses the project local week at UTC date boundaries", () => {
    expect(localWeekStart(new Date("2026-09-13T23:00:00Z"), "Europe/Stockholm")).toBe("2026-09-14");
    expect(localWeekStart(new Date("2026-09-14T01:00:00Z"), "America/Los_Angeles")).toBe(
      "2026-09-07",
    );
  });
  it("reserves old monthly drafts once against their original full month", () => {
    const result = planWeeklyPreparation({
      ...base,
      assets: [{ projectId: "p", autoScheduledFor: "2026-09" }],
    });
    expect(result.missing).toHaveLength(2); // old undated draft consumes Sept 1, not Sept 15
    const first = planWeeklyPreparation({
      ...base,
      weekStart: "2026-08-31",
      now: new Date("2026-08-28T14:00:00Z"),
      assets: [{ projectId: "p", autoScheduledFor: "2026-09" }],
    });
    expect(first.reserved.map((s) => s.localDate)).toEqual(["2026-09-01"]);
  });
  it("retains booked and drafted slots across a month boundary", () => {
    const args = {
      ...base,
      weekStart: "2026-09-28",
      now: new Date("2026-09-25T14:00:00Z"),
      booked: ["2026-09-29T07:00:00Z"],
      assets: [
        {
          projectId: "p",
          autoScheduledFor: "2026-10",
          autoSchedulerPlannedAt: "2026-10-01T07:00:00Z",
        },
      ],
    };
    expect(planWeeklyPreparation(args).missing).toEqual([]);
    expect(planWeeklyPreparation(args).reserved).toHaveLength(2);
    expect(planWeeklyPreparation(args)).toEqual(planWeeklyPreparation(args));
  });
  it("does not silently move a nonexistent DST time and uses the earlier repeated time", () => {
    expect(weeklyWallTime("2026-03-29", "02:30", "Europe/Stockholm")).toBeNull();
    expect(weeklyWallTime("2026-10-25", "02:30", "Europe/Stockholm")).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    const result = planWeeklyPreparation({
      ...base,
      weekStart: "2026-03-23",
      now: new Date("2026-03-20T15:00:00Z"),
      schedule: { ...base.schedule, weekdays: [7], publishTime: "02:30" },
    });
    expect(result.missing).toEqual([]);
    expect(result.issues).toEqual([{ localDate: "2026-03-29", reason: "nonexistent-local-time" }]);
  });
  it("reports inadequate review lead time while preserving later slots", () => {
    const result = planWeeklyPreparation({ ...base, now: new Date("2026-09-14T08:00:00Z") });
    expect(result.missing.map((s) => s.localDate)).toEqual(["2026-09-17"]);
    expect(result.issues).toEqual([
      { localDate: "2026-09-15", reason: "insufficient-review-time" },
    ]);
  });
  it("handles Monday and weekend slots with a configurable preparation day", () => {
    const result = planWeeklyPreparation({
      ...base,
      schedule: { ...base.schedule, weekdays: [1, 6, 7] },
      preparation: { ...base.preparation, preparationWeekday: 4 },
    });
    expect(result.prepareAt).toBe("2026-09-10T14:00:00.000Z");
    expect(result.missing.map((s) => s.localDate)).toEqual([
      "2026-09-14",
      "2026-09-19",
      "2026-09-20",
    ]);
  });
  it("rejects malformed dates and unknown timezones", () => {
    expect(() => planWeeklyPreparation({ ...base, weekStart: "2026-02-30" })).toThrow();
    expect(() => planWeeklyPreparation({ ...base, weekStart: "2026-09-15" })).toThrow();
    expect(() =>
      planWeeklyPreparation({ ...base, schedule: { ...base.schedule, timeZone: "Moon/Base" } }),
    ).toThrow();
  });
});

import { schedulerPeriodSchema } from "./weekly-preparation";
it("accepts exact weekly lease periods without confusing monthly billing periods", () => {
  for (const value of ["2026-10", "week:2026-09-14"])
    expect(schedulerPeriodSchema.parse(value)).toBe(value);
  for (const value of ["week:2026-09-15", "week:2026-02-30", "week:invalid", "2026-13"])
    expect(schedulerPeriodSchema.safeParse(value).success).toBe(false);
});
