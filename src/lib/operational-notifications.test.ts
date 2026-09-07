import { describe, expect, it, vi } from "vitest";
import type { ContentAsset, Opportunity, Project, ScheduledPublish } from "./types";
import { operationalNotifications } from "./operational-notifications";
import { notifications } from "@/i18n/notifications";
vi.mock("./calendar-schedule", () => ({
  publishReadiness: (asset: ContentAsset) => ({ ready: asset.status === "Approved" }),
}));
const project = {
  id: "p",
  name: "Project",
  businessName: "Business",
  publishMode: "manualLive",
  autoScheduler: {
    enabled: true,
    weekdays: [2, 4],
    publishTime: "09:00",
    timeZone: "Europe/Stockholm",
    mode: "approve_first",
  },
} as Project;
const now = new Date("2026-09-04T10:00:00Z");
const asset = {
  id: "a",
  projectId: "p",
  title: "Article",
  status: "In Review",
  updatedAt: "2026-09-01T10:00:00Z",
} as ContentAsset;
const opportunity = {
  id: "o",
  projectId: "p",
  title: "Task",
  status: "scheduled",
  dueAt: "2026-09-04",
  currentContentAssetId: "a",
} as Opportunity;
const scheduled = {
  id: "q",
  projectId: "p",
  assetId: "a",
  publishAt: "2026-09-04T13:00:00Z",
  status: "pending",
  attempts: 0,
  createdAt: "2026-09-01T00:00:00Z",
} as ScheduledPublish;
const scan = (args: Partial<Parameters<typeof operationalNotifications>[0]> = {}) =>
  operationalNotifications({
    projects: [project],
    assets: [],
    opportunities: [],
    scheduled: [],
    now,
    ...args,
  });
describe("server operational alert conditions", () => {
  it("only marks the current unapproved version near its actual queued deadline", () => {
    const found = scan({ assets: [asset], scheduled: [scheduled] });
    expect(found.filter((e) => e.kind === "approval_due")).toHaveLength(1);
    expect(
      scan({ assets: [{ ...asset, status: "Approved" }], scheduled: [scheduled] }).some(
        (e) => e.kind === "approval_due",
      ),
    ).toBe(false);
    const changed = scan({
      assets: [{ ...asset, updatedAt: "2026-09-04T11:00:00Z" }],
      scheduled: [scheduled],
    });
    expect(found[0].key).not.toBe(changed[0].key);
  });
  it("does not treat a date-only manual deadline as overdue at the start of its local day", () => {
    expect(
      scan({ assets: [asset], opportunities: [opportunity] }).some(
        (e) => e.kind === "manual_overdue",
      ),
    ).toBe(false);
    expect(
      scan({
        assets: [asset],
        opportunities: [opportunity],
        now: new Date("2026-09-05T00:00:00Z"),
      }).some((e) => e.kind === "manual_overdue"),
    ).toBe(true);
  });
  it("removes overdue alerts when a task is moved or archived, including legacy discarded tasks", () => {
    for (const changed of [
      { ...opportunity, dueAt: "2026-10-01" },
      { ...opportunity, status: "Discarded" as const },
      { ...opportunity, archivedAt: now.toISOString() },
    ]) {
      expect(
        scan({
          assets: [asset],
          opportunities: [changed],
          now: new Date("2026-09-06T10:00:00Z"),
        }).some((e) => e.kind === "manual_overdue"),
      ).toBe(false);
    }
  });
  it("reports a failed queue separately without including raw supplier errors", () => {
    const events = scan({
      assets: [asset],
      opportunities: [{ ...opportunity, dueAt: "2026-09-01" }],
      scheduled: [{ ...scheduled, status: "failed", lastError: "private provider payload" }],
    });
    expect(events.filter((e) => e.kind === "publication_failed")).toHaveLength(1);
    expect(events.some((e) => e.kind === "manual_overdue")).toBe(false);
    expect(JSON.stringify(events)).not.toContain("private provider payload");
  });
  it("does not warn for an already published asset", () => {
    expect(
      scan({
        assets: [{ ...asset, livePublishStatus: "published" }],
        scheduled: [{ ...scheduled, status: "failed" }],
      }).some((e) => e.kind === "publication_failed"),
    ).toBe(false);
  });
  it("does not invent cadence for paused or unconfigured scheduling", () => {
    expect(scan({ projects: [{ ...project, autoScheduler: undefined }] })).toEqual([]);
    expect(
      scan({
        projects: [{ ...project, autoScheduler: { ...project.autoScheduler!, enabled: false } }],
      }),
    ).toEqual([]);
  });
  it("counts actual next-week slots, not any arbitrary future article or client queue mirror", () => {
    const events = scan({
      assets: [
        {
          ...asset,
          status: "Approved",
          scheduledPublishAt: "2026-09-08T07:00:00Z",
          scheduledPublishStatus: "pending",
        },
      ],
      scheduled: [{ ...scheduled, publishAt: "2026-09-08T07:00:00Z", status: "published" }],
    });
    expect(events.find((e) => e.kind === "cadence_gap")?.detail).toMatchObject({
      missing: 1,
      total: 2,
    });
    expect(
      scan({
        assets: [
          {
            ...asset,
            scheduledPublishAt: "2026-09-08T07:00:00Z",
            scheduledPublishStatus: "pending",
          },
        ],
      }).find((e) => e.kind === "cadence_gap")?.detail,
    ).toMatchObject({ missing: 2, total: 2 });
  });
  it("does not count unapproved content as a covered pending slot", () => {
    const events = scan({
      assets: [asset],
      scheduled: [{ ...scheduled, publishAt: "2026-09-08T07:00:00Z" }],
    });
    expect(events.find((e) => e.kind === "cadence_gap")?.detail.missing).toBe(2);
  });
  it("handles a next week spanning two months without counting either month twice", () => {
    const events = scan({ now: new Date("2026-08-28T10:00:00Z") });
    expect(events.find((e) => e.kind === "cadence_gap")?.detail).toMatchObject({
      missing: 2,
      total: 2,
    });
  });
  it("does not let another project's queue cover this project's cadence", () => {
    const events = scan({
      scheduled: [
        {
          ...scheduled,
          projectId: "other",
          publishAt: "2026-09-08T07:00:00Z",
          status: "published",
        },
      ],
    });
    expect(events[0].detail.missing).toBe(2);
  });
  it("fails a corrupt time zone instead of inventing UTC dates", () => {
    expect(() =>
      scan({
        projects: [
          { ...project, autoScheduler: { ...project.autoScheduler!, timeZone: "not-a-zone" } },
        ],
      }),
    ).toThrow();
  });
  it("rejects an impossible date instead of silently moving it into another month", () => {
    expect(() => scan({ opportunities: [{ ...opportunity, dueAt: "2026-02-30" }] })).toThrow(
      "invalid_notification_deadline",
    );
  });
  it("keeps notification copy complete in every currently supported UI locale", () => {
    for (const locale of ["pl", "sv", "da"] as const)
      expect(Object.keys(notifications[locale]).sort()).toEqual(
        Object.keys(notifications.en).sort(),
      );
  });
});
