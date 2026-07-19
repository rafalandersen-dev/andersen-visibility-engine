/**
 * Pure connector-target helpers shared by the browser publish path
 * (`mock-ai.ts`) and the server-side scheduled-publish runner
 * (`publish.server.ts`).
 *
 * These decide *where* and *as what* an asset gets published — which connector
 * a project uses, which credentials to present, which WordPress post type to
 * target, which Shopify blog to file the article under. They must stay in ONE
 * place: if the manual "Publish live" button and the scheduled runner ever
 * disagreed about, say, the post type for a service page, the same asset would
 * land differently depending on how it was published.
 *
 * No I/O, no store access — only (asset, project) → arguments.
 */
import type { ContentAsset, Project } from "./types";

export function isWordPress(project: Project): boolean {
  return project.connectorType === "wordpress";
}

export function isShopify(project: Project): boolean {
  return project.connectorType === "shopify";
}

export function wpPostTypeFor(asset: ContentAsset, project: Project): "post" | "page" {
  if (asset.wordpressPostType) return asset.wordpressPostType;
  const at = (asset.assetType ?? "").toLowerCase();
  if (/service|landing|location/.test(at)) return "page";
  return project.wordpress?.defaultPostType ?? "post";
}

export function wpCreds(project: Project): {
  siteUrl: string;
  username: string;
  applicationPassword: string;
} {
  const wp = project.wordpress ?? {};
  const siteUrl = (wp.siteUrl ?? "").trim();
  const username = (wp.username ?? "").trim();
  const applicationPassword = wp.applicationPassword ?? "";
  if (!siteUrl || !username || !applicationPassword.trim()) {
    throw new Error(
      "Connect WordPress in Project Setup (site URL, username and application password) first.",
    );
  }
  return { siteUrl, username, applicationPassword };
}

export function shopifyCreds(project: Project): { shopDomain: string; adminAccessToken: string } {
  const sh = project.shopify ?? {};
  const shopDomain = (sh.shopDomain ?? "").trim();
  const adminAccessToken = sh.adminAccessToken ?? "";
  if (!shopDomain || !adminAccessToken.trim()) {
    throw new Error(
      "Connect Shopify in Project Setup (shop domain and Admin API access token) first.",
    );
  }
  return { shopDomain, adminAccessToken };
}

export function shopifyArticleArgs(asset: ContentAsset, project: Project) {
  const sh = project.shopify ?? {};
  return {
    ...shopifyCreds(project),
    blogGid: asset.shopifyBlogGid || sh.defaultBlogId || "",
    blogHandle: sh.defaultBlogHandle || "",
    articleGid: asset.shopifyArticleGid,
    title: asset.title,
    contentMarkdown: asset.markdown,
    handle: asset.slug || "",
    summary: asset.metaDescription ?? "",
    tags: sh.defaultTags ?? [],
    author: sh.defaultAuthorName ?? "",
  };
}

export function wpPublishArgs(asset: ContentAsset, project: Project) {
  return {
    ...wpCreds(project),
    postType: wpPostTypeFor(asset, project),
    postId: asset.wordpressPostId,
    title: asset.title,
    contentMarkdown: asset.markdown,
    slug: (asset.publishSlug || asset.slug || "").trim(),
    excerpt: asset.metaDescription ?? "",
  };
}
