/**
 * P1.2H — read-time backfill, upgrade transition, visual score and the new
 * checklist items. Pins the spec's acceptance list: new hard blockers hit NEW
 * (v3) articles only through the single publishBlockers gate, a legacy
 * needsVisualUpgrade article is NEVER retroactively blocked, warnings never
 * block, and the explicit upgrade flips the policy forward-only.
 */
import { describe, it, expect } from "vitest";
import {
  effectiveVisualState,
  beginVisualUpgrade,
  visualCompleteness,
  articleVisualPolicy,
} from "./visual-model";
import { buildPublishingChecklist, isPublishBlocked } from "./checklist";
import type { ContentAsset, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body text about the studio.",
    assetType: "article",
    ...over,
  }) as ContentAsset;

const item = (a: ContentAsset, key: string) =>
  buildPublishingChecklist(a, project(), [a]).find((i) => i.key === key);

describe("effectiveVisualState (read-time backfill, §8)", () => {
  it("explicit state wins; v3 marker → current; unmarked article-like → needsVisualUpgrade; short-form → legacy", () => {
    expect(effectiveVisualState(asset({ visualState: "legacy" }))).toBe("legacy");
    expect(effectiveVisualState(asset({ visualState: "upgrading" }))).toBe("upgrading");
    expect(effectiveVisualState(asset({ visualModelVersion: 3 }))).toBe("current");
    expect(effectiveVisualState(asset())).toBe("needsVisualUpgrade");
    expect(effectiveVisualState(asset({ assetType: "faq" }))).toBe("legacy");
  });

  it("the coercion NEVER changes publishing policy — a prompted legacy article still publishes", () => {
    const legacy = asset(); // effective: needsVisualUpgrade (prompt only)
    expect(articleVisualPolicy(legacy)).toBe("legacy");
    expect(isPublishBlocked(legacy, project(), [legacy])).toBe(false);
  });

  it("beginVisualUpgrade flips the policy forward (upgrade transition, §8)", () => {
    const upgraded = beginVisualUpgrade(asset());
    expect(articleVisualPolicy(upgraded)).toBe("v3");
    // Now the v3 gates apply — the hook gate blocks until a hook is approved.
    expect(isPublishBlocked(upgraded, project(), [upgraded])).toBe(true);
  });
});

describe("P1.2H checklist items through the single gate", () => {
  const ghostImg = {
    id: "g1",
    concept: "ghost",
    url: "",
    alt: "x",
    placement: "inline",
    status: "accepted",
  };

  it("imageObjectMissing blocks a NEW (v3) article, never a legacy one", () => {
    const v3 = asset({ visualModelVersion: 3, images: [ghostImg] as never });
    expect(item(v3, "imageObjectMissing")!.passed).toBe(false);
    expect(item(v3, "imageObjectMissing")!.blocking).toBe(true);
    const legacy = asset({ images: [ghostImg] as never });
    expect(item(legacy, "imageObjectMissing")).toBeUndefined();
    expect(isPublishBlocked(legacy, project(), [legacy])).toBe(false);
  });

  it("visual warnings exist for every asset and NEVER block", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`,
      concept: `c${i}`,
      url: "https://site.com/same.jpg",
      alt: "a",
      placement: "inline",
      status: "accepted",
    }));
    const a = asset({ images: many as never });
    for (const key of ["poorMobileCrop", "excessiveImages", "duplicateImage"]) {
      const it_ = item(a, key)!;
      expect(it_.blocking).toBe(false);
    }
    expect(item(a, "excessiveImages")!.passed).toBe(false);
    expect(item(a, "duplicateImage")!.passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(false); // warnings never block
  });
});

describe("visualCompleteness (advisory score)", () => {
  it("scores the composed pieces and names what is missing", () => {
    expect(visualCompleteness(asset())).toEqual({
      score: 0,
      missing: ["hook", "featured", "images"],
    });
    const full = asset({
      hook: {
        id: "h",
        text: "Hi?",
        type: "question",
        provenance: "generated",
        approval: "approved",
      } as never,
      featuredImage: {
        imageId: "f1",
        storagePath: "p",
        url: "https://site.com/f.jpg",
        alt: "F",
        hero: { aspectRatio: "wide", fit: "cover" },
        approval: "approved",
      } as never,
      images: [
        {
          id: "i1",
          concept: "c",
          url: "https://site.com/i.jpg",
          alt: "a",
          placement: "inline",
          status: "accepted",
          anchor: "article-end",
        },
      ] as never,
    });
    expect(visualCompleteness(full)).toEqual({ score: 100, missing: [] });
  });
});
