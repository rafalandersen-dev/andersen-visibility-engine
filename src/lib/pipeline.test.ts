/**
 * The specification for the derived pipeline stage.
 *
 * Written against statuses ACTUALLY OBSERVED IN PRODUCTION rather than against
 * the type union, because they disagree: of 189 opportunities, 153 carry a
 * legacy status ("Linked" 77, "Discarded" 56, "New" 16, "Drafting" 4) and only
 * 36 carry a canonical one. A mapping built from the union would render two
 * thirds of the board wrong.
 */
import { describe, it, expect } from "vitest";
import {
  PIPELINE_STAGES,
  STAGE_EXECUTION,
  OVERDUE_AFTER_MS,
  pipelineStage,
  nextAction,
  linkedAssetFor,
  isDropped,
  upNext,
  type PipelineStage,
  type StageOpportunity,
} from "./pipeline";
import type { ContentAsset } from "./types";

const NOW = Date.parse("2026-07-19T12:00:00.000Z");

const opp = (over: Record<string, unknown> = {}): StageOpportunity => ({
  id: "o1",
  status: "captured",
  ...over,
});

const asset = (over: Partial<ContentAsset> = {}) =>
  ({ id: "a1", projectId: "p1", title: "T", status: "Draft", ...over }) as ContentAsset;

const stage = (o?: StageOpportunity, a?: Partial<ContentAsset>) =>
  pipelineStage({
    opportunity: o,
    asset: a ? asset(a) : undefined,
    now: NOW,
  });

describe("legacy statuses observed in production", () => {
  // Counts are from a live query on 2026-07-19; if these stop being handled the
  // board silently mislabels the majority of every existing workspace.
  const cases: Array<[string, PipelineStage]> = [
    ["Linked", "idea"],
    ["New", "idea"],
    ["Drafting", "idea"],
    ["In Brief", "queued"],
    ["Discarded", "parked"],
    ["captured", "idea"],
    ["prioritized", "queued"],
    ["scheduled", "idea"], // no dueAt and no asset — nothing to show but an idea
    ["in_review", "idea"],
    ["published", "idea"], // without canonicalUrl there is no evidence it is live
  ];

  it.each(cases)("maps stored status %s to %s", (status, expected) => {
    expect(stage(opp({ status }))).toBe(expected);
  });

  it("maps an unknown future status to idea rather than dropping it", () => {
    // Mapping by exclusion: an unlisted value must land somewhere sane.
    expect(stage(opp({ status: "some_new_status" }))).toBe("idea");
  });

  it("treats archivedAt as parked even when the status looks active", () => {
    expect(stage(opp({ status: "prioritized", archivedAt: "2026-07-01" }))).toBe("parked");
  });

  it("never resurrects a parked opportunity into a working column", () => {
    expect(stage(opp({ status: "Discarded", dueAt: "2026-07-20" }), { status: "Approved" })).toBe(
      "parked",
    );
  });

  it("shows a parked opportunity as live when its page is actually on the site", () => {
    // Found by replaying the real workspace: publishing promotes the linked
    // opportunity, and one live synergymassage.se article belongs to an
    // opportunity that had been discarded. Rendering that as "parked" would hide
    // a live page from every surface that could update or unpublish it.
    expect(stage(opp({ status: "Discarded" }), { liveUrl: "https://x.test/p" })).toBe("live");
    // With the draft gone, the discarded-but-live page is "live_missing" — still
    // surfaced, never "parked", but flagged as having no editable source.
    expect(stage(opp({ status: "Discarded", canonicalUrl: "https://x.test/p" }))).toBe(
      "live_missing",
    );
  });
});

describe("publish state dominates asset status", () => {
  it("stays live even when the draft was later rejected", () => {
    // The page is on the customer's site. Hiding it behind "needs fixing" would
    // remove it from every surface that could actually fix it.
    expect(stage(opp(), { status: "Rejected", liveUrl: "https://x.test/p" })).toBe("live");
  });

  it("is live_missing from the opportunity when the draft is gone", () => {
    // The page is on the site but there is no asset to open or rewrite. Deriving
    // "live" here would offer "See the impact" for a page with no editable source;
    // deriving a working stage would regenerate from scratch and let the connector
    // CREATE a duplicate. live_missing is the distinct stage whose only action is a
    // rewrite that carries the prior URL forward.
    expect(stage(opp({ canonicalUrl: "https://x.test/p" }), undefined)).toBe("live_missing");
    expect(stage(opp({ publishedAt: "2026-07-01T00:00:00Z" }), undefined)).toBe("live_missing");
  });

  it("is live (not live_missing) once a draft exists again for a published page", () => {
    // Anti-regression for the rewrite path: an opportunity with canonicalUrl set
    // and a resolvable asset present derives to "live", NOT "writing" — so the
    // board never invites "Write it" on a page already on the customer's site.
    // The fresh rewrite draft carries the prior URL only in republishTargetUrl,
    // which pipelineStage does not read, so the ASSET alone still derives "writing".
    expect(stage(opp({ canonicalUrl: "https://x.test/p" }), { status: "Draft" })).toBe("live");
  });

  it("reports a failed live publish as needs fixing", () => {
    expect(stage(opp(), { status: "Approved", livePublishStatus: "failed" })).toBe("needs_fixing");
  });

  it("reports a failed draft send as needs fixing", () => {
    expect(stage(opp(), { status: "Approved", publishStatus: "failed" })).toBe("needs_fixing");
  });

  it("reports a rejected draft as needs fixing when nothing is live", () => {
    expect(stage(opp(), { status: "Rejected" })).toBe("needs_fixing");
  });
});

describe("armed and overdue", () => {
  const armedAt = new Date(NOW + 3_600_000).toISOString();

  it("is armed while the go-live is still ahead", () => {
    const s = stage(opp(), {
      status: "Approved",
      scheduledPublishStatus: "pending",
      scheduledPublishAt: armedAt,
    });
    expect(s).toBe("armed");
    // Armed must be visually distinct: something happens without further input.
    expect(STAGE_EXECUTION[s]).toBe("armed");
  });

  it("stays armed just inside the overdue window", () => {
    const at = new Date(NOW - OVERDUE_AFTER_MS + 1_000).toISOString();
    expect(
      stage(opp(), {
        status: "Approved",
        scheduledPublishStatus: "pending",
        scheduledPublishAt: at,
      }),
    ).toBe("armed");
  });

  it("becomes needs fixing once well past its time", () => {
    const at = new Date(NOW - OVERDUE_AFTER_MS - 1_000).toISOString();
    expect(
      stage(opp(), {
        status: "Approved",
        scheduledPublishStatus: "pending",
        scheduledPublishAt: at,
      }),
    ).toBe("needs_fixing");
  });

  it("is not armed when the date is missing", () => {
    expect(stage(opp(), { status: "Approved", scheduledPublishStatus: "pending" })).toBe("ready");
  });
});

describe("asset editorial states", () => {
  it.each([
    ["Approved", "ready"],
    ["Exported", "ready"],
    ["In Review", "in_review"],
    ["Draft", "writing"],
  ] as Array<[ContentAsset["status"], PipelineStage]>)("maps %s to %s", (status, expected) => {
    expect(stage(opp(), { status })).toBe(expected);
  });

  it("puts a sent-but-not-live draft in its own stage", () => {
    // The manual-publish shape: the next action is "confirm it is live",
    // not "schedule it".
    expect(stage(opp(), { status: "Approved", publishStatus: "sent" })).toBe("sent");
  });
});

describe("opportunity-only states", () => {
  it("is planned once a target date exists", () => {
    expect(stage(opp({ status: "prioritized", dueAt: "2026-07-21" }))).toBe("planned");
  });

  it("prefers the asset's state over the opportunity's date", () => {
    expect(stage(opp({ dueAt: "2026-07-21" }), { status: "In Review" })).toBe("in_review");
  });

  it("handles a bare blob with neither side present", () => {
    expect(pipelineStage({ now: NOW })).toBe("idea");
  });
});

describe("every asset-status x publish-state combination observed in production", () => {
  // From a live query: these six combinations exist right now.
  const observed: Array<[ContentAsset["status"], string, string, PipelineStage]> = [
    ["Approved", "sent", "published", "live"],
    ["Draft", "notSent", "notPublished", "writing"],
    ["Draft", "failed", "notPublished", "needs_fixing"],
    ["Approved", "failed", "notPublished", "needs_fixing"],
    ["In Review", "notSent", "notPublished", "in_review"],
    ["Approved", "sent", "failed", "needs_fixing"],
  ];

  it.each(observed)("%s / %s / %s -> %s", (status, publishStatus, livePublishStatus, expected) => {
    expect(
      stage(opp(), {
        status,
        publishStatus: publishStatus as ContentAsset["publishStatus"],
        livePublishStatus: livePublishStatus as ContentAsset["livePublishStatus"],
      }),
    ).toBe(expected);
  });
});

describe("nextAction", () => {
  it("gives every stage exactly one action", () => {
    for (const s of PIPELINE_STAGES) {
      expect(nextAction(s)).toMatch(/^pipeline\.action\./);
    }
  });

  it("covers every stage in STAGE_EXECUTION", () => {
    expect(Object.keys(STAGE_EXECUTION).sort()).toEqual([...PIPELINE_STAGES].sort());
  });
});

describe("linkedAssetFor", () => {
  const armed = asset({
    id: "armed",
    scheduledPublishStatus: "pending",
    // A real armed asset always carries the go-live instant — pipelineStage
    // requires it to reach "armed", and linkedAssetFor resolves armed by it.
    scheduledPublishAt: "2026-07-25T09:00:00Z",
    updatedAt: "2026-01-01",
  });
  const newerInert = asset({ id: "newer", status: "Draft", updatedAt: "2026-07-19" });
  const live = asset({ id: "live", liveUrl: "https://x.test/p", updatedAt: "2026-02-01" });

  const withOpp = (a: ContentAsset[]) =>
    a.map((x) => ({ ...x, opportunityId: "o1" }) as ContentAsset);

  it("prefers an armed asset over a newer inert one", () => {
    // The regression this prevents: the board renders "Writing" with no cancel
    // affordance while the cron publishes the armed asset anyway.
    expect(linkedAssetFor(opp(), withOpp([newerInert, armed]))?.id).toBe("armed");
  });

  it("among two armed assets, picks the one that fires first, not array order", () => {
    // Otherwise the card advertises the wrong go-live and Cancel targets the
    // wrong schedule.
    const late = asset({
      id: "late",
      scheduledPublishStatus: "pending",
      scheduledPublishAt: "2026-08-01T09:00:00Z",
    });
    const early = asset({
      id: "early",
      scheduledPublishStatus: "pending",
      scheduledPublishAt: "2026-07-25T09:00:00Z",
    });
    expect(linkedAssetFor(opp(), withOpp([late, early]))?.id).toBe("early");
    expect(linkedAssetFor(opp(), withOpp([early, late]))?.id).toBe("early");
  });

  it("prefers a live asset over a newer inert one", () => {
    expect(linkedAssetFor(opp(), withOpp([newerInert, live]))?.id).toBe("live");
  });

  it("falls back to currentContentAssetId, then to the newest", () => {
    const a = withOpp([asset({ id: "x", updatedAt: "2026-01-01" }), newerInert]);
    expect(linkedAssetFor(opp({ currentContentAssetId: "x" }), a)?.id).toBe("x");
    expect(linkedAssetFor(opp(), a)?.id).toBe("newer");
  });

  it("matches on sourceOpportunityId too, and returns undefined when there is none", () => {
    const viaSource = [asset({ id: "s1", sourceOpportunityId: "o1" })];
    expect(linkedAssetFor(opp(), viaSource)?.id).toBe("s1");
    expect(linkedAssetFor(opp(), [])).toBeUndefined();
  });
});

describe("upNext", () => {
  const entry = (id: string, stage: PipelineStage) => ({ item: { id }, stage });

  it("puts something broken ahead of something merely unfinished", () => {
    const q = upNext([entry("a", "writing"), entry("b", "needs_fixing"), entry("c", "ready")]);
    expect(q.map((x) => x.item.id)).toEqual(["b", "c", "a"]);
  });

  it("excludes armed and terminal work — nothing there waits on a human", () => {
    const q = upNext([entry("live", "live"), entry("armed", "armed"), entry("parked", "parked")]);
    expect(q).toEqual([]);
  });

  it("caps the list, because twenty tasks means none get done", () => {
    const many = Array.from({ length: 9 }, (_, i) => entry(String(i), "ready"));
    expect(upNext(many)).toHaveLength(3);
    expect(upNext(many, 1)).toHaveLength(1);
  });

  it("carries the single action key for each stage", () => {
    expect(upNext([entry("a", "ready")])[0].actionKey).toBe("pipeline.action.schedule");
    expect(upNext([entry("a", "sent")])[0].actionKey).toBe("pipeline.action.confirmLive");
  });

  it("handles an empty queue", () => {
    expect(upNext([])).toEqual([]);
  });
});

describe("isDropped", () => {
  it("treats a soft-deleted record as absent, not as a stage", () => {
    expect(isDropped({ deletedAt: "2026-07-01" })).toBe(true);
    expect(isDropped({})).toBe(false);
    expect(isDropped(undefined)).toBe(false);
  });
});
