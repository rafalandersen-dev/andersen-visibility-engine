/**
 * Monthly Proof Report — the honesty rules are the contract: only
 * liveUrl-bearing assets published IN the month count as published, drafts
 * count by creation month, next-month plan excludes Done items, and other
 * projects' entities never leak in.
 */
import { describe, it, expect } from "vitest";
import { addMonths, buildMonthlyProofReport, monthKeyOf, recentMonthKeys } from "./proof-report";
import type { CalendarItem, ContentAsset } from "./types";

const asset = (over: Partial<ContentAsset>): ContentAsset =>
  ({ id: "a", projectId: "p1", title: "T", ...over }) as ContentAsset;
const cal = (over: Partial<CalendarItem>): CalendarItem =>
  ({
    id: "c",
    projectId: "p1",
    plannedDate: "2026-08-04",
    topicTitle: "Topic",
    contentType: "Blog Article",
    status: "Planned",
    ...over,
  }) as CalendarItem;

describe("month math", () => {
  it("monthKeyOf handles ISO dates, timestamps and junk", () => {
    expect(monthKeyOf("2026-07-25")).toBe("2026-07");
    expect(monthKeyOf("2026-07-25T06:00:00.000Z")).toBe("2026-07");
    expect(monthKeyOf(undefined)).toBe("");
    expect(monthKeyOf("garbage")).toBe("");
  });
  it("addMonths crosses year boundaries both ways", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(recentMonthKeys("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
});

describe("buildMonthlyProofReport", () => {
  const content: ContentAsset[] = [
    // WP/Shopify-style live publish: livePublishedAt + status, NO lastPublishedAt.
    asset({
      id: "live-jul",
      liveUrl: "https://x.se/a",
      livePublishStatus: "published",
      livePublishedAt: "2026-07-10T09:00:00Z",
    }),
    asset({
      id: "live-jun",
      liveUrl: "https://x.se/b",
      livePublishStatus: "published",
      livePublishedAt: "2026-06-10T09:00:00Z",
    }),
    // Custom-endpoint draft-send path: publishStatus sent + lastPublishedAt.
    asset({
      id: "sent-jul",
      liveUrl: "https://x.se/c",
      publishStatus: "sent",
      lastPublishedAt: "2026-07-15T09:00:00Z",
    }),
    // Honesty rule: no liveUrl → NOT published, whatever the stamps say.
    asset({ id: "claimed", publishStatus: "sent", lastPublishedAt: "2026-07-11T09:00:00Z" }),
    // Review HIGH regression: went live in JUNE, then a re-send FAILED in July
    // (failure paths attempt-stamp lastPublishedAt) — must NOT appear in July.
    asset({
      id: "failed-resend",
      liveUrl: "https://x.se/d",
      livePublishStatus: "published",
      livePublishedAt: "2026-06-20T09:00:00Z",
      publishStatus: "failed",
      lastPublishedAt: "2026-07-05T09:00:00Z",
    }),
    // Attempt-stamped live FAILURE: stamps present, status failed → not published.
    asset({
      id: "failed-live",
      liveUrl: "https://x.se/e",
      livePublishStatus: "failed",
      livePublishedAt: "2026-07-06T09:00:00Z",
    }),
    asset({ id: "draft-jul", createdAt: "2026-07-20T09:00:00Z" }),
    asset({ id: "sched-jul", scheduledPublishAt: "2026-07-29T09:00:00Z" }),
    asset({
      id: "other-project",
      projectId: "p2",
      liveUrl: "https://y.se",
      livePublishStatus: "published",
      livePublishedAt: "2026-07-12T09:00:00Z",
    }),
  ];
  const calendar: CalendarItem[] = [
    cal({ id: "next", plannedDate: "2026-08-06" }),
    cal({ id: "done-next", plannedDate: "2026-08-11", status: "Done" }),
    cal({ id: "far", plannedDate: "2026-09-02" }),
    cal({ id: "other", plannedDate: "2026-08-07", projectId: "p2" }),
  ];

  const report = buildMonthlyProofReport({
    project: { id: "p1" },
    content,
    calendar,
    monthKey: "2026-07",
    linksLive: 2,
  });

  it("published = liveUrl + STATUS-GATED go-live stamp in month, own project only", () => {
    // live-jul (WP-style livePublishedAt) + sent-jul (draft-send path);
    // failed-resend stays in June, failed-live and stamp-less never count.
    expect(report.published.map((p) => p.id)).toEqual(["live-jul", "sent-jul"]);
    expect(report.published[0].liveUrl).toBe("https://x.se/a");
  });

  it("a failed July re-send cannot drag a June publish into July (review HIGH)", () => {
    const june = buildMonthlyProofReport({
      project: { id: "p1" },
      content,
      calendar,
      monthKey: "2026-06",
      linksLive: null,
    });
    expect(june.published.map((p) => p.id)).toEqual(["live-jun", "failed-resend"]);
  });

  it("drafted and scheduled counts are month-scoped", () => {
    expect(report.draftedCount).toBe(1);
    expect(report.scheduledCount).toBe(1);
  });

  it("next-month plan excludes Done and other months/projects", () => {
    expect(report.nextMonthPlan.map((p) => p.title)).toEqual(["Topic"]);
    expect(report.nextMonthPlan[0].plannedDate).toBe("2026-08-06");
  });

  it("no GSC data → null snapshot; linksLive passes through (null = unknown)", () => {
    expect(report.gsc).toBeNull();
    expect(report.linksLive).toBe(2);
    expect(
      buildMonthlyProofReport({
        project: { id: "p1" },
        content: [],
        calendar: [],
        monthKey: "2026-07",
        linksLive: null,
      }).linksLive,
    ).toBeNull();
  });

  it("uses the latestImportId GSC import when present", () => {
    const r = buildMonthlyProofReport({
      project: {
        id: "p1",
        gscLite: {
          latestImportId: "g2",
          imports: [
            {
              id: "g1",
              importedAt: "2026-07-01T00:00:00Z",
              source: "manual_csv",
              importType: "queries",
              rows: [],
              summary: {
                totalClicks: 1,
                totalImpressions: 10,
                averageCtr: 0.1,
                averagePosition: 40,
                rowCount: 1,
              },
            },
            {
              id: "g2",
              importedAt: "2026-07-20T00:00:00Z",
              source: "api",
              importType: "pages",
              dateRange: { label: "Last 28 days" },
              rows: [],
              summary: {
                totalClicks: 42,
                totalImpressions: 900,
                averageCtr: 0.047,
                averagePosition: 12.3,
                rowCount: 5,
              },
            },
          ],
        },
      },
      content: [],
      calendar: [],
      monthKey: "2026-07",
      linksLive: 0,
    });
    expect(r.gsc?.totalClicks).toBe(42);
    expect(r.gsc?.rangeLabel).toBe("Last 28 days");
  });
});
