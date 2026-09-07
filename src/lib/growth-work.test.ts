import { describe, expect, it, afterEach, vi } from "vitest";
import { growthWork } from "./growth-work";
import { projectFormPatch } from "./project-form";
import { seedProjects } from "./mock-data";
import type { ContentAsset, Opportunity } from "./types";
const opportunity = (over: Partial<Opportunity> = {}) =>
  ({ id: "o1", projectId: "p1", title: "T", status: "approved", ...over }) as Opportunity;
const asset = (over: Partial<ContentAsset> = {}) =>
  ({
    id: "a1",
    projectId: "p1",
    opportunityId: "o1",
    title: "T",
    status: "Approved",
    ...over,
  }) as ContentAsset;
afterEach(() => vi.useRealTimers());
describe("Today uses Plan's execution truth", () => {
  it("approved work without a live URL is not published", () => {
    const work = growthWork([opportunity()], [asset()]);
    expect(work.published).toBe(0);
    expect(work.scheduled).toHaveLength(0);
  });
  it("counts the audited 39 armed + 5 live pattern without treating all as complete", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    const assets = Array.from({ length: 44 }, (_, i) =>
      asset({
        id: `a${i}`,
        opportunityId: `o${i}`,
        ...(i < 39
          ? {
              scheduledPublishAt: "2026-09-10T09:00:00Z",
              scheduledPublishStatus: "pending" as const,
            }
          : { liveUrl: `https://example.invalid/${i}`, livePublishStatus: "published" as const }),
      }),
    );
    const work = growthWork(
      assets.map((a) => opportunity({ id: a.opportunityId })),
      assets,
    );
    expect(work.scheduled).toHaveLength(39);
    expect(work.published).toBe(5);
  });
  it("preserves armed orphans and archived work but excludes failed/overdue entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    const armed = {
      scheduledPublishAt: "2026-09-10T09:00:00Z",
      scheduledPublishStatus: "pending" as const,
    };
    const work = growthWork(
      [opportunity({ deletedAt: "2026-09-01" }), opportunity({ id: "o2", status: "archived" })],
      [
        asset(armed),
        asset({ ...armed, id: "a2", opportunityId: "o2" }),
        asset({ ...armed, id: "a3", scheduledPublishStatus: "failed" }),
        asset({ ...armed, id: "a4", scheduledPublishAt: "2026-09-01T09:00:00Z" }),
      ],
    );
    expect(work.rows).toHaveLength(0);
    expect(work.scheduled.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
  it("does not let a newer inert draft hide an armed publication", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
    const work = growthWork(
      [opportunity()],
      [
        asset({
          scheduledPublishAt: "2026-09-10T09:00:00Z",
          scheduledPublishStatus: "pending",
          updatedAt: "2026-09-01",
        }),
        asset({ id: "newer", status: "Draft", updatedAt: "2026-09-06" }),
      ],
    );
    expect(work.rows[0].stage).toBe("armed");
    expect(work.rows[0].asset?.id).toBe("a1");
  });
  it("keeps live pages with missing drafts visible in published work", () => {
    expect(
      growthWork([opportunity({ canonicalUrl: "https://example.invalid/live" })], []).published,
    ).toBe(1);
  });
});
describe("project form ownership", () => {
  it("saves both visible language and USP edits without clobbering other panels", () => {
    const form = {
      ...seedProjects[0],
      primaryLanguage: "Polish" as const,
      uniqueSellingPoints: "Edited USP",
      publishMode: "draftOnly" as const,
      brandIntelligence: { voice: { tone: "stale" } },
    };
    const patch = projectFormPatch(form);
    const current = {
      ...form,
      publishMode: "manualLive" as const,
      brandIntelligence: { voice: { tone: "fresh" } },
    };
    const saved = { ...current, ...patch };
    expect(saved.primaryLanguage).toBe("Polish");
    expect(saved.uniqueSellingPoints).toBe("Edited USP");
    expect(saved.publishMode).toBe("manualLive");
    expect(saved.brandIntelligence.voice?.tone).toBe("fresh");
    expect(patch).not.toHaveProperty("publishingConnector");
  });
});
