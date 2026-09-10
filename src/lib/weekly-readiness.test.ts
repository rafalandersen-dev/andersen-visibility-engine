import { describe, expect, it } from "vitest";
import { weeklyReadiness } from "./weekly-readiness";
import type { ContentAsset } from "./types";
const instant = "2026-09-15T07:00:00Z";
const base = {
  projectId: "p",
  weekStart: "2026-09-14",
  now: new Date("2026-09-11T14:00:00Z"),
  schedule: { weekdays: [2, 4], publishTime: "09:00", timeZone: "Europe/Stockholm" },
  preparation: { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 },
  booked: [],
  assets: [] as ContentAsset[],
  queue: [],
};
const asset = {
  id: "a",
  projectId: "p",
  title: "Owner draft",
  status: "Approved",
  autoSchedulerPlannedAt: instant,
} as ContentAsset;
describe("truthful weekly readiness", () => {
  it("does not call approval or a schedule mirror queued", () => {
    const result = weeklyReadiness({
      ...base,
      assets: [{ ...asset, scheduledPublishAt: instant, scheduledPublishStatus: "pending" }],
    });
    expect(result.readiness[0]).toMatchObject({ state: "drafted", assetId: "a" });
    expect(result.missing.map((s) => s.localDate)).toEqual(["2026-09-17"]);
  });
  it("reports actual queue state and preserves cancellation instead of refilling it", () => {
    for (const status of [
      "pending",
      "publishing",
      "published",
      "failed",
      "cancelled",
      "review_required",
    ] as const) {
      const result = weeklyReadiness({
        ...base,
        assets: [asset],
        queue: [{ assetId: "a", publishAt: instant, status }],
      });
      expect(result.readiness[0].state).toBe(
        {
          pending: "queued",
          publishing: "publishing",
          published: "published",
          failed: "held",
          review_required: "held",
          cancelled: "cancelled",
        }[status],
      );
      expect(result.missing.map((s) => s.localDate)).toEqual(["2026-09-17"]);
    }
  });
  it("flags competing ownership and never retrieves another project's title", () => {
    expect(
      weeklyReadiness({ ...base, assets: [asset, { ...asset, id: "b" }] }).readiness[0].state,
    ).toBe("conflict");
    expect(
      weeklyReadiness({ ...base, assets: [{ ...asset, projectId: "other" }] }).readiness[0],
    ).toMatchObject({ state: "missing", title: null });
  });
});
