/**
 * Hook enforcement through the publishing checklist (Article Studio 3.0 / P1.2A).
 *
 * `buildPublishingChecklist` / `publishBlockers` is the SINGLE gate the editor,
 * live/draft publish, the WordPress+Shopify RPC guard, the custom endpoint and the
 * scheduled/cron runner all call — so proving the hook block here proves every
 * publishing path enforces it (T21). A legacy asset must stay publishable (T20).
 */
import { describe, it, expect } from "vitest";
import { buildPublishingChecklist, publishBlockers, isPublishBlocked } from "./checklist";
import type { ArticleHook, ContentAsset, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Relaxing studio sessions",
    slug: "relaxing",
    markdown: "Our studio offers relaxing sessions and friendly staff in a calm space.",
    ...over,
  }) as ContentAsset;

const hook = (over: Partial<ArticleHook> = {}): ArticleHook =>
  ({
    id: "h1",
    text: "Need a calmer studio session?",
    type: "question",
    provenance: "generated",
    approval: "draft",
    ...over,
  }) as ArticleHook;

const item = (list: ReturnType<typeof buildPublishingChecklist>, key: string) =>
  list.find((i) => i.key === key);

describe("legacy assets stay publishable (T20)", () => {
  it("a legacy asset (no marker, no hook) has no hook checklist item and is not blocked", () => {
    const a = asset();
    const list = buildPublishingChecklist(a, project(), [a]);
    expect(item(list, "hook")).toBeUndefined();
    expect(item(list, "hookClaims")).toBeUndefined();
    expect(isPublishBlocked(a, project(), [a])).toBe(false);
  });
});

describe("version-3 hook enforcement on the shared gate (T21)", () => {
  it("v3 with no hook is blocked", () => {
    const a = asset({ visualModelVersion: 3 });
    const list = buildPublishingChecklist(a, project(), [a]);
    expect(item(list, "hook")!.passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
    expect(publishBlockers(a, project(), [a]).some((b) => b.key === "hook")).toBe(true);
  });

  it("v3 with an unapproved (draft) hook is blocked", () => {
    const a = asset({ visualModelVersion: 3, hook: hook({ approval: "draft" }) });
    expect(item(buildPublishingChecklist(a, project(), [a]), "hook")!.passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });

  it("v3 with an approved, clean, supported hook is publishable", () => {
    const a = asset({ visualModelVersion: 3, hook: hook({ approval: "approved" }) });
    const list = buildPublishingChecklist(a, project(), [a]);
    expect(item(list, "hook")!.passed).toBe(true);
    expect(item(list, "hookClaims")!.passed).toBe(true);
    expect(isPublishBlocked(a, project(), [a])).toBe(false);
  });

  it("v3 with an approved hook that makes an unsupported claim is blocked on hookClaims", () => {
    const a = asset({
      visualModelVersion: 3,
      hook: hook({ approval: "approved", text: "We guarantee a 300% boost in bookings." }),
    });
    const list = buildPublishingChecklist(a, project(), [a]);
    expect(item(list, "hookClaims")!.passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });

  it("an 'upgrading' legacy asset is also gated on the hook", () => {
    const a = asset({ visualState: "upgrading" });
    expect(item(buildPublishingChecklist(a, project(), [a]), "hook")!.passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });
});
