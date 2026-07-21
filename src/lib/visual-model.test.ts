/**
 * Article Studio visual-model classification (P1.2A).
 *
 * Pins the policy separation the phase depends on: the article policy is driven by
 * an explicit marker, NEVER by whether a hook exists — so legacy assets are never
 * retroactively blocked (T1) and a mid-creation v3 article is never mis-classified
 * as legacy (T2).
 */
import { describe, it, expect } from "vitest";
import {
  isVisualV3,
  articleVisualPolicy,
  needsVisualUpgrade,
  isArticleLikeAssetType,
} from "./visual-model";
import type { ContentAsset } from "./types";

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({ id: "a1", projectId: "p1", title: "T", slug: "t", markdown: "", ...over }) as ContentAsset;

describe("explicit legacy / version-3 classification (T1)", () => {
  it("no marker → legacy", () => {
    expect(articleVisualPolicy(asset())).toBe("legacy");
    expect(isVisualV3(asset())).toBe(false);
  });
  it("explicit visualModelVersion 2 → legacy", () => {
    expect(articleVisualPolicy(asset({ visualModelVersion: 2 }))).toBe("legacy");
  });
  it("visualModelVersion 3 → v3", () => {
    expect(articleVisualPolicy(asset({ visualModelVersion: 3 }))).toBe("v3");
    expect(isVisualV3(asset({ visualModelVersion: 3 }))).toBe(true);
  });
  it("visualState upgrading / current → v3 even with no version marker", () => {
    expect(isVisualV3(asset({ visualState: "upgrading" }))).toBe(true);
    expect(isVisualV3(asset({ visualState: "current" }))).toBe(true);
  });
  it("visualState legacy / needsVisualUpgrade → legacy, authoritative over the version", () => {
    expect(isVisualV3(asset({ visualState: "legacy", visualModelVersion: 3 }))).toBe(false);
    expect(isVisualV3(asset({ visualState: "needsVisualUpgrade" }))).toBe(false);
    expect(needsVisualUpgrade(asset({ visualState: "needsVisualUpgrade" }))).toBe(true);
  });
});

describe("a new article without a hook is not misclassified as legacy (T2)", () => {
  it("v3 marker + no hook is still v3", () => {
    const a = asset({ visualModelVersion: 3, hook: undefined });
    expect(articleVisualPolicy(a)).toBe("v3");
    expect(isVisualV3(a)).toBe(true);
  });
});

describe("article-like asset types get the v3 hook requirement (re-review #3)", () => {
  it("long-form types are article-like", () => {
    for (const t of ["article", "servicePage", "landingPage", "comparison"] as const) {
      expect(isArticleLikeAssetType(t)).toBe(true);
    }
  });
  it("short-form / non-article types are not gated", () => {
    for (const t of ["brief", "faq", "gbpPost", "meta", "socialPack"] as const) {
      expect(isArticleLikeAssetType(t)).toBe(false);
    }
    expect(isArticleLikeAssetType(undefined)).toBe(false);
  });
});
