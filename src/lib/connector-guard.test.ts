/**
 * Server-side connector guard (review fix C).
 *
 * The manual WordPress / Shopify "send draft" + "publish live" RPCs must NOT trust
 * the request body: a hand-rolled call cannot bypass the publishing checklist, and
 * the published content + credentials are re-derived from the caller's OWN stored
 * asset. These tests drive the guard the RPC handlers delegate to, mocking only
 * the workspace read.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ContentAsset, Project } from "./types";

// The guard reads the caller's workspace via a dynamic import of ./workspace.server.
let ROW: { data: { projects: Project[]; content: ContentAsset[] }; rev: number } | null = null;
vi.mock("./workspace.server", () => ({
  readWorkspaceRow: vi.fn(async () => ROW),
}));

import { serverWpArgs, serverShopifyArgs } from "./connector-guard.server";

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

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Best kettlebells",
    slug: "best-kettlebells",
    markdown: "A plain body with no internal links.",
    ...over,
  }) as ContentAsset;

function setWorkspace(project: Project, ...assets: ContentAsset[]) {
  ROW = { data: { projects: [project], content: assets }, rev: 1 };
}

beforeEach(() => {
  ROW = null;
});

describe("serverWpArgs — WordPress checklist parity + server re-derivation", () => {
  it("re-derives content, credentials and identity from the STORED asset", async () => {
    setWorkspace(wpProject(), asset({ wordpressPostId: 42 }));
    const args = await serverWpArgs("u1", "p1", "a1");
    expect(args.projectId).toBe("p1");
    expect(args.assetId).toBe("a1");
    expect(args.siteUrl).toBe("https://site.com"); // from the stored project, not the request
    expect(args.postId).toBe(42); // in-place update identity preserved
    expect(args.contentMarkdown.length).toBeGreaterThan(0); // assembled server-side
  });

  it("REFUSES a rewrite that would create a duplicate post (hard blocker enforced)", async () => {
    // republishTargetUrl set but no wordpressPostId → duplicateTarget blocker.
    setWorkspace(wpProject(), asset({ republishTargetUrl: "https://site.com/old-post" }));
    await expect(serverWpArgs("u1", "p1", "a1")).rejects.toThrow(/not publishable/i);
  });

  it("REFUSES an asset id the caller's workspace does not contain", async () => {
    setWorkspace(wpProject(), asset());
    await expect(serverWpArgs("u1", "p1", "ghost")).rejects.toThrow(/not found/i);
  });

  it("REFUSES when the workspace cannot be read", async () => {
    ROW = null;
    await expect(serverWpArgs("u1", "p1", "a1")).rejects.toThrow(/workspace not found/i);
  });
});

describe("serverShopifyArgs — Shopify checklist parity + server re-derivation", () => {
  it("re-derives article args from the stored asset", async () => {
    setWorkspace(shopifyProject(), asset({ shopifyArticleGid: "gid://s/Article/9" }));
    const args = await serverShopifyArgs("u1", "p1", "a1");
    expect(args.projectId).toBe("p1");
    expect(args.assetId).toBe("a1");
    expect(args.shopDomain).toBe("s.myshopify.com");
    expect(args.articleGid).toBe("gid://s/Article/9");
    expect(args.contentMarkdown.length).toBeGreaterThan(0);
  });

  it("REFUSES a rewrite with no article identity (duplicate guard) — same gate as WP", async () => {
    setWorkspace(shopifyProject(), asset({ republishTargetUrl: "https://site.com/old" }));
    await expect(serverShopifyArgs("u1", "p1", "a1")).rejects.toThrow(/not publishable/i);
  });
});
