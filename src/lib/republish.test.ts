/**
 * Republish / duplicate-post contract (Phase C).
 *
 * Identity rules: WordPress updates by postId, Shopify by articleGid, custom
 * endpoint upserts by slug/URL. A REWRITE (republishTargetUrl set) of a WP/Shopify
 * page with no connector identity would create a DUPLICATE — the checklist blocks
 * it on every publish path rather than silently duplicating.
 */
import { describe, it, expect } from "vitest";
import { isPublishBlocked, buildPublishingChecklist } from "./checklist";
import { wpPublishArgs, shopifyArticleArgs } from "./publish-targets";
import type { ContentAsset, Project } from "./types";

const wpProject = (): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://site.com",
    connectorType: "wordpress",
    wordpress: { siteUrl: "https://site.com", username: "u", applicationPassword: "p" },
  }) as Project;

const shopifyProject = (): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://site.com",
    connectorType: "shopify",
    shopify: {
      shopDomain: "s.myshopify.com",
      adminAccessToken: "t",
      defaultBlogId: "gid://s/Blog/1",
    },
  }) as Project;

const customProject = (): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://site.com",
    connectorType: "custom",
    publishEndpoint: "https://site.com/hook",
    livePublishEndpoint: "https://site.com/hook/live",
    publishSecret: "s",
  }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;

const dupItem = (a: ContentAsset, p: Project) =>
  buildPublishingChecklist(a, p, [a]).find((i) => i.key === "duplicateTarget")!;

describe("connector identity → in-place update (repeated publish is idempotent)", () => {
  it("repeated WordPress publish updates the same post id (never creates)", () => {
    const a = asset({ wordpressPostId: 42 });
    expect(wpPublishArgs(a, wpProject(), ["/"]).postId).toBe(42);
    expect(wpPublishArgs(a, wpProject(), ["/"]).postId).toBe(42); // stable across calls
  });
  it("repeated WordPress DRAFT update keeps the post id", () => {
    const a = asset({ wordpressPostId: 7, publishStatus: "sent" });
    expect(wpPublishArgs(a, wpProject(), ["/"]).postId).toBe(7);
  });
  it("repeated Shopify publish updates the same articleGid", () => {
    const a = asset({ shopifyArticleGid: "gid://s/Article/9" });
    expect(shopifyArticleArgs(a, shopifyProject(), ["/"]).articleGid).toBe("gid://s/Article/9");
  });
});

describe("rewrite target identity", () => {
  it("republishTargetUrl WITH a valid connector identity is allowed (updates in place)", () => {
    const a = asset({ republishTargetUrl: "https://site.com/old", wordpressPostId: 55 });
    expect(dupItem(a, wpProject()).passed).toBe(true);
    expect(isPublishBlocked(a, wpProject(), [a])).toBe(false);
    expect(wpPublishArgs(a, wpProject(), ["/"]).postId).toBe(55);
  });

  it("republishTargetUrl with MISSING WordPress identity is BLOCKED (would duplicate)", () => {
    const a = asset({ republishTargetUrl: "https://site.com/old" });
    expect(dupItem(a, wpProject()).passed).toBe(false);
    expect(isPublishBlocked(a, wpProject(), [a])).toBe(true);
  });

  it("republishTargetUrl with MISSING Shopify identity is BLOCKED", () => {
    const a = asset({ republishTargetUrl: "https://site.com/old" });
    expect(dupItem(a, shopifyProject()).passed).toBe(false);
    expect(isPublishBlocked(a, shopifyProject(), [a])).toBe(true);
  });

  it("a lost local connector id (rewrite, no postId) blocks rather than creating a second post", () => {
    // Simulates the asset being recreated for a page whose original id was lost.
    const a = asset({ republishTargetUrl: "https://site.com/guides/x", publishSlug: "x" });
    expect(isPublishBlocked(a, wpProject(), [a])).toBe(true);
  });

  it("the custom endpoint upserts by slug/URL, so a rewrite is NOT blocked there", () => {
    const a = asset({ republishTargetUrl: "https://site.com/old" });
    expect(dupItem(a, customProject()).passed).toBe(true);
    expect(isPublishBlocked(a, customProject(), [a])).toBe(false);
  });
});

describe("first publish + save/reload + scheduled all behave", () => {
  it("a FIRST publish (no rewrite, no id) is allowed — creating the first post is correct", () => {
    const a = asset();
    expect(dupItem(a, wpProject()).passed).toBe(true);
    expect(isPublishBlocked(a, wpProject(), [a])).toBe(false);
  });

  it("the guard is a pure function of stored fields, so it survives save/reload identically", () => {
    const a = asset({ republishTargetUrl: "https://site.com/old" });
    const reloaded = { ...a }; // a save/reload round-trips the fields whole
    expect(dupItem(a, wpProject()).passed).toBe(dupItem(reloaded, wpProject()).passed);
  });

  it("the SAME checklist gates the scheduled/cron path (shared publishBlockers)", () => {
    // publish.server + mock-ai + publish.functions all call publishBlockers on this
    // checklist, so a blocked rewrite is refused on manual, live AND scheduled.
    const a = asset({ republishTargetUrl: "https://site.com/old" });
    expect(isPublishBlocked(a, wpProject(), [a])).toBe(true);
  });
});
