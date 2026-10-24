import { afterEach, describe, expect, it, vi } from "vitest";
import { todayFocus } from "./today-focus";
import type { ContentAsset, Opportunity } from "./types";

const opportunity = (over: Partial<Opportunity> = {}) =>
  ({
    id: "o1",
    projectId: "p1",
    title: "Service page",
    status: "prioritized",
    ...over,
  }) as Opportunity;
const asset = (over: Partial<ContentAsset> = {}) =>
  ({
    id: "a1",
    projectId: "p1",
    opportunityId: "o1",
    title: "Service page",
    markdown: "Draft",
    status: "Approved",
    ...over,
  }) as ContentAsset;
const armed = {
  scheduledPublishAt: "2026-10-25T09:00:00Z",
  scheduledPublishStatus: "pending" as const,
};
afterEach(() => vi.useRealTimers());

describe("Today selects real next work without mutating it", () => {
  it("shows approved unqueued work as ready, never armed or published", () => {
    const a = asset();
    const before = structuredClone(a);
    expect(todayFocus([opportunity()], [a])).toMatchObject({ asset: { id: "a1" }, stage: "ready" });
    expect(a).toEqual(before);
  });
  it("prioritizes failed publication over ready and review work", () => {
    const a = asset({ id: "failed", opportunityId: undefined, livePublishStatus: "failed" });
    expect(todayFocus([opportunity()], [asset(), a])?.asset?.id).toBe("failed");
  });
  it("keeps review-required scheduling truthful", () => {
    expect(
      todayFocus([opportunity()], [asset({ ...armed, scheduledPublishStatus: "review_required" })])
        ?.stage,
    ).toBe("in_review");
  });
  it("shows scheduled work before unfinished drafts and chooses its earliest queue time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const result = todayFocus(
      [opportunity()],
      [
        asset({ status: "Draft" }),
        asset({
          ...armed,
          id: "later",
          opportunityId: undefined,
          scheduledPublishAt: "2026-10-26T09:00:00Z",
        }),
        asset({ ...armed, id: "first", opportunityId: undefined }),
      ],
    );
    expect(result).toMatchObject({ asset: { id: "first" }, stage: "armed" });
  });
  it("never hides an armed article behind a newer inert draft or an archived opportunity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    expect(
      todayFocus(
        [opportunity()],
        [asset({ ...armed }), asset({ id: "new", status: "Draft", updatedAt: "2026-10-23" })],
      )?.asset?.id,
    ).toBe("a1");
    expect(todayFocus([opportunity({ status: "archived" })], [asset({ ...armed })])?.stage).toBe(
      "armed",
    );
  });
  it("does not resurrect archived or deleted inert drafts", () => {
    expect(todayFocus([opportunity({ status: "archived" })], [asset()])).toBeUndefined();
    expect(todayFocus([opportunity({ deletedAt: "2026-10-22" })], [asset()])).toBeUndefined();
  });
  it("keeps delivery visible for parked, archived and deleted opportunities", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    for (const hidden of [
      opportunity({ archivedAt: "2026-10-22" }),
      opportunity({ status: "Discarded" as Opportunity["status"] }),
      opportunity({ status: "archived" }),
      opportunity({ deletedAt: "2026-10-22" }),
    ]) {
      expect(todayFocus([hidden], [asset({ ...armed })])?.stage).toBe("armed");
      expect(
        todayFocus([hidden], [asset({ ...armed, scheduledPublishAt: "2026-10-22T09:00:00Z" })])
          ?.stage,
      ).toBe("needs_fixing");
      expect(todayFocus([hidden], [asset({ scheduledPublishStatus: "failed" })])?.stage).toBe(
        "needs_fixing",
      );
      expect(
        todayFocus([hidden], [asset({ scheduledPublishStatus: "review_required" })])?.stage,
      ).toBe("in_review");
    }
  });
  it("shows standalone drafts, while live and missing-live drafts are not pending tasks", () => {
    expect(todayFocus([], [asset({ opportunityId: undefined, status: "Draft" })])?.stage).toBe(
      "writing",
    );
    expect(
      todayFocus([opportunity({ canonicalUrl: "https://example.invalid/live" })], []),
    ).toBeUndefined();
    expect(todayFocus([], [asset({ liveUrl: "https://example.invalid/live" })])).toBeUndefined();
  });
  it("opens an opportunity when work has no draft, and has an honest empty state", () => {
    expect(todayFocus([opportunity()], [])).toMatchObject({ item: { id: "o1" }, stage: "queued" });
    expect(todayFocus([], [])).toBeUndefined();
  });
});
