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
describe("queue precedence over historical rows and stale mirrors", () => {
  const second = "2026-09-17T07:00:00Z";
  const old = {
    ...asset,
    id: "old",
    title: "Archived original",
  } as ContentAsset;
  const replacement = {
    ...asset,
    id: "new",
    title: "Replacement",
    autoSchedulerPlannedAt: instant,
    scheduledPublishAt: instant,
  } as ContentAsset;
  const run = (assets: ContentAsset[], queue: Parameters<typeof weeklyReadiness>[0]["queue"]) =>
    weeklyReadiness({ ...base, assets, queue });
  it.each([
    ["pending", "queued"],
    ["publishing", "publishing"],
    ["published", "published"],
  ] as const)(
    "one current %s row selects its own asset over an earlier stale one",
    (status, state) => {
      const result = run(
        [old, replacement],
        [
          { assetId: "old", publishAt: instant, status: "cancelled" },
          { assetId: "new", publishAt: instant, status },
        ],
      );
      expect(result.readiness[0]).toMatchObject({ state, assetId: "new", title: "Replacement" });
    },
  );
  it("selects the queued asset even when it carries no mirror", () => {
    const bare = {
      ...replacement,
      autoSchedulerPlannedAt: undefined,
      scheduledPublishAt: undefined,
    };
    expect(
      run(
        [old, bare],
        [
          { assetId: "old", publishAt: instant, status: "cancelled" },
          { assetId: "new", publishAt: instant, status: "pending" },
        ],
      ).readiness[0],
    ).toMatchObject({ state: "queued", assetId: "new", title: "Replacement" });
  });
  it("native Cancel then Resume of the same article is queued, not conflict", () => {
    const result = run(
      [asset],
      [
        { assetId: "a", publishAt: instant, status: "cancelled" },
        { assetId: "a", publishAt: instant, status: "pending" },
      ],
    );
    expect(result.readiness[0]).toMatchObject({
      state: "queued",
      assetId: "a",
      title: "Owner draft",
    });
  });
  it("a stale mirror of another asset never overrides the authoritative queue row", () => {
    const result = run(
      [old, replacement],
      [{ assetId: "old", publishAt: instant, status: "pending" }],
    );
    expect(result.readiness[0]).toMatchObject({ state: "queued", assetId: "old" });
  });
  it("cancelled-only history with several rows and stale mirrors stays cancelled and reserved", () => {
    const result = run(
      [
        old,
        replacement,
        {
          ...asset,
          id: "older",
          title: "Older",
          autoSchedulerPlannedAt: undefined,
        } as ContentAsset,
      ],
      [
        { assetId: "older", publishAt: instant, status: "cancelled" },
        { assetId: "new", publishAt: instant, status: "cancelled" },
        { assetId: "old", publishAt: instant, status: "cancelled" },
      ],
    );
    expect(result.readiness[0]).toMatchObject({ state: "cancelled", assetId: "new" });
    expect(result.reserved.map((s) => s.localDate)).toContain("2026-09-15");
    expect(result.missing.map((s) => s.localDate)).toEqual(["2026-09-17"]);
  });
  it("an approved mirrored draft after cancellation stays cancelled, never drafted or queued", () => {
    const result = run(
      [old, replacement],
      [{ assetId: "old", publishAt: instant, status: "cancelled" }],
    );
    expect(result.readiness[0].state).toBe("cancelled");
  });
  it.each([
    ["pending", "pending"],
    ["pending", "published"],
    ["publishing", "pending"],
    ["pending", "review_required"],
  ] as const)("two current rows %s + %s for different assets remain a conflict", (a, b) => {
    const result = run(
      [old, replacement],
      [
        { assetId: "old", publishAt: instant, status: a },
        { assetId: "new", publishAt: instant, status: b },
        { assetId: "older", publishAt: instant, status: "cancelled" },
      ],
    );
    expect(result.readiness[0].state).toBe("conflict");
    expect(result.missing.map((s) => s.localDate)).toEqual(["2026-09-17"]);
  });
  it("two mirrored drafts without any queue row remain a conflict", () => {
    expect(run([old, replacement], []).readiness[0].state).toBe("conflict");
  });
  it("failed and review-required rows hold the slot against stale mirrors", () => {
    expect(
      run([old, replacement], [{ assetId: "old", publishAt: instant, status: "failed" }])
        .readiness[0],
    ).toMatchObject({ state: "held", assetId: "old" });
    expect(
      run(
        [old, replacement],
        [
          { assetId: "new", publishAt: instant, status: "cancelled" },
          { assetId: "old", publishAt: instant, status: "review_required" },
        ],
      ).readiness[0],
    ).toMatchObject({ state: "held", assetId: "old" });
    expect(
      run(
        [old, replacement],
        [
          { assetId: "old", publishAt: instant, status: "failed" },
          { assetId: "new", publishAt: instant, status: "cancelled" },
        ],
      ).readiness[0].state,
    ).toBe("held");
  });
  it("a current pending replacement supersedes an earlier failed row", () => {
    expect(
      run(
        [old, replacement],
        [
          { assetId: "old", publishAt: instant, status: "failed" },
          { assetId: "new", publishAt: instant, status: "pending" },
        ],
      ).readiness[0],
    ).toMatchObject({ state: "queued", assetId: "new" });
  });
  it("resolves each slot independently", () => {
    const result = run(
      [old, { ...replacement, autoSchedulerPlannedAt: second, scheduledPublishAt: second }],
      [
        { assetId: "old", publishAt: instant, status: "cancelled" },
        { assetId: "new", publishAt: second, status: "pending" },
      ],
    );
    expect(result.readiness.map((s) => s.state)).toEqual(["cancelled", "queued"]);
    expect(result.missing).toEqual([]);
  });
});
