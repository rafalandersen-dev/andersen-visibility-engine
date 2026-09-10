import { describe, expect, it } from "vitest";
import { computeMonthlySlots, normalizeAutoSchedulerConfig } from "./auto-scheduler";
import { schedulerCapacityNotifications, schedulerDemand } from "./scheduler-capacity";
import type { ContentAsset, Project, ScheduledPublish } from "./types";
import { scheduledPublishFailurePatch } from "./publish-outcome";
import { notifications } from "@/i18n/notifications";
import { renderOperationalDigest } from "./operational-email.server";
const now = new Date("2026-09-07T10:00:00Z");
const project = {
  id: "p",
  name: "Project",
  businessName: "Business",
  autoScheduler: {
    enabled: true,
    weekdays: [2, 4],
    publishTime: "09:00",
    timeZone: "Europe/Stockholm",
    mode: "approve_first",
  },
} as Project;
const slots = computeMonthlySlots(2026, 10, normalizeAutoSchedulerConfig(project.autoScheduler));
const scan = (overrides: Partial<Parameters<typeof schedulerDemand>[0]> = {}) =>
  schedulerDemand({ projects: [project], assets: [], scheduled: [], now, ...overrides });
const verified = (remaining: number) => ({
  status: "verified" as const,
  remaining,
  usagePeriod: "2026-09",
});
describe("shared preparation-capacity alerts", () => {
  it("follows the scheduler's next-month horizon, including year rollover", () => {
    expect(scan()).toMatchObject([{ plannedPeriod: "2026-10", missing: slots.length }]);
    expect(scan({ now: new Date("2026-12-31T23:00:00Z") })[0].plannedPeriod).toBe("2027-01");
  });
  it("does not invent a cadence for disabled projects", () => {
    expect(
      scan({
        projects: [{ ...project, autoScheduler: { ...project.autoScheduler!, enabled: false } }],
      }),
    ).toEqual([]);
  });
  it("counts saved held drafts, queue entries and legacy drafts without double counting", () => {
    const scheduled = [
      { projectId: "p", status: "pending", publishAt: slots[0].publishAt },
    ] as ScheduledPublish[];
    const assets = [
      { projectId: "p", autoScheduledFor: "2026-10", autoSchedulerPlannedAt: slots[0].publishAt },
      { projectId: "p", autoScheduledFor: "2026-10", autoSchedulerPlannedAt: slots[1].publishAt },
      { projectId: "p", autoScheduledFor: "2026-10" },
    ] as ContentAsset[];
    expect(scan({ scheduled, assets })[0].missing).toBe(slots.length - 3);
  });
  it("does not count a terminal source-held date as an armed publication", () => {
    const original = {
      id: "held",
      projectId: "p",
      scheduledPublishAt: slots[0].publishAt,
    } as ContentAsset;
    const held = {
      ...original,
      ...scheduledPublishFailurePatch(original, "Source review", true, true),
    };
    expect(
      scan({
        assets: [held],
        scheduled: [
          {
            projectId: "p",
            assetId: "held",
            status: "failed",
            publishAt: slots[0].publishAt,
          } as ScheduledPublish,
        ],
      })[0].missing,
    ).toBe(slots.length);
    expect(held.sourceHeldPublishAt).toBe(slots[0].publishAt);
    // A delivered monthly draft still counts as prepared work independently of
    // publication readiness; a source hold never authorizes a replacement draft.
    expect(
      scan({
        assets: [
          { ...held, autoScheduledFor: "2026-10", autoSchedulerPlannedAt: slots[0].publishAt },
        ],
      })[0].missing,
    ).toBe(slots.length - 1);
  });
  it("never borrows another project's drafts or queue slots", () => {
    const assets = slots.map((s) => ({
      projectId: "other",
      autoScheduledFor: "2026-10",
      autoSchedulerPlannedAt: s.publishAt,
    })) as ContentAsset[];
    const scheduled = slots.map((s) => ({
      projectId: "other",
      status: "pending",
      publishAt: s.publishAt,
    })) as ScheduledPublish[];
    expect(scan({ assets, scheduled })[0].missing).toBe(slots.length);
  });
  it("resolves capacity warnings when existing work covers every slot", () => {
    const assets = slots.map((s) => ({
      projectId: "p",
      autoScheduledFor: "2026-10",
      autoSchedulerPlannedAt: s.publishAt,
    })) as ContentAsset[];
    expect(schedulerCapacityNotifications(scan({ assets }), verified(0))).toEqual([]);
  });
  it("compares the account allowance with combined demand, not each project's private copy", () => {
    const demand = scan({ projects: [project, { ...project, id: "second" }] });
    const alerts = schedulerCapacityNotifications(demand, verified(slots.length));
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      kind: "generation_capacity_low",
      detail: {
        remaining: slots.length,
        missing: slots.length,
        total: slots.length * 2,
        usagePeriod: "2026-09",
        plannedPeriod: "2026-10",
      },
    });
    expect(schedulerCapacityNotifications(demand, verified(slots.length * 2))).toEqual([]);
    expect(schedulerCapacityNotifications(demand, verified(-1))).toEqual([]);
  });
  it("updates shortage counts without creating a new incident on every scan", () => {
    const demand = scan();
    const first = schedulerCapacityNotifications(demand, verified(1));
    const next = schedulerCapacityNotifications(demand, verified(0));
    expect(first[0].key).toBe(next[0].key);
    const nextPeriod = schedulerCapacityNotifications(demand, {
      ...verified(0),
      usagePeriod: "2026-10",
    });
    expect(nextPeriod[0].key).not.toBe(first[0].key);
  });
  it("reports unavailable evidence without inventing a zero allowance", () => {
    const alert = schedulerCapacityNotifications(scan(), {
      status: "unavailable",
      usagePeriod: "2026-09",
    })[0];
    expect(alert.kind).toBe("generation_capacity_unavailable");
    expect(alert.detail).not.toHaveProperty("remaining");
  });
  it.each(["en", "pl", "sv", "da"] as const)(
    "renders both incident kinds in %s without sending",
    (locale) => {
      for (const capacity of [
        verified(0),
        { status: "unavailable" as const, usagePeriod: "2026-09" },
      ]) {
        const alert = schedulerCapacityNotifications(scan(), capacity)[0];
        expect(notifications[locale][`notifications.${alert.kind}`]).toBeTruthy();
        const rendered = renderOperationalDigest({
          locale,
          items: [{ ...alert, id: "00000000-0000-4000-8000-000000000001" }],
        });
        expect(rendered.text).toContain(notifications[locale][`notifications.${alert.kind}`]);
        expect(rendered.text).not.toContain("undefined");
      }
    },
  );
});
