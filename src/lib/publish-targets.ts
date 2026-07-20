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
import type { ContentAsset, Project, PublishMode } from "./types";
import { contentJsonLdScript } from "./structured-data";
import { normalizeInternalPath } from "./markdown";

/**
 * A deterministic, non-paid inventory of internal paths KNOWN to exist on the
 * project's site: the site root, and the paths of this project's own
 * Milo-published articles (we published them, so they resolve). A relative
 * internal link is only published as an active link when its path is in here
 * (P0.4); anything else is unverified and must not publish as a live link. This
 * is the lightweight inventory — a full site inventory (sitemap crawl) is P1.
 */
export function buildKnownInternalPaths(project: Project, content: ContentAsset[]): string[] {
  const paths = new Set<string>();
  const site = (project.websiteUrl || "").trim();
  let origin = "";
  if (site) {
    try {
      const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
      origin = u.origin;
      paths.add("/");
    } catch {
      /* ignore an unparseable site URL */
    }
  }
  for (const asset of content) {
    const live = (asset.liveUrl || "").trim();
    if (!live) continue;
    try {
      const u = new URL(live);
      if (!origin || u.origin === origin) paths.add(normalizeInternalPath(u.pathname));
    } catch {
      /* ignore an unparseable live URL */
    }
  }
  return [...paths];
}

/**
 * Deterministic Article + FAQPage JSON-LD for an asset, built from the VISIBLE
 * published content (title/meta + FAQ present in the body). Injected at publish
 * (P0.5). Empty string when there's nothing to emit.
 */
export function contentStructuredData(asset: ContentAsset, project: Project): string {
  return contentJsonLdScript({
    title: asset.title,
    description: asset.metaDescription ?? "",
    bodyMarkdown: asset.markdown ?? "",
    businessName: project.businessName || project.name,
    url: asset.liveUrl,
    datePublished: asset.livePublishedAt,
  });
}

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

export function shopifyArticleArgs(
  asset: ContentAsset,
  project: Project,
  knownInternalPaths: string[] = [],
) {
  const sh = project.shopify ?? {};
  return {
    ...shopifyCreds(project),
    blogGid: asset.shopifyBlogGid || sh.defaultBlogId || "",
    blogHandle: sh.defaultBlogHandle || "",
    articleGid: asset.shopifyArticleGid,
    title: asset.title,
    contentMarkdown: asset.markdown,
    jsonLd: contentStructuredData(asset, project),
    knownInternalPaths,
    handle: asset.slug || "",
    summary: asset.metaDescription ?? "",
    tags: sh.defaultTags ?? [],
    author: sh.defaultAuthorName ?? "",
  };
}

export function wpPublishArgs(
  asset: ContentAsset,
  project: Project,
  knownInternalPaths: string[] = [],
) {
  return {
    ...wpCreds(project),
    postType: wpPostTypeFor(asset, project),
    postId: asset.wordpressPostId,
    title: asset.title,
    contentMarkdown: asset.markdown,
    jsonLd: contentStructuredData(asset, project),
    knownInternalPaths,
    slug: (asset.publishSlug || asset.slug || "").trim(),
    excerpt: asset.metaDescription ?? "",
  };
}

/**
 * The publish mode actually in force, which is not always the stored one.
 *
 * `autoPublishApproved` is RETIRED. It is coerced here at READ time rather than
 * migrated, so nothing is written to any workspace blob and no tester's stored
 * config becomes invalid. Reinterpreting it instead — say, as "arm at the next
 * free slot" — would have armed a project's whole historical backlog of
 * Approved-but-never-published assets onto a live site the moment it shipped,
 * because approval is a state, not an event we can hook.
 *
 * The value stays in the PublishMode union so old blobs keep parsing.
 */
export function effectivePublishMode(
  project: Pick<Project, "publishMode"> | undefined,
): PublishMode {
  const stored = project?.publishMode ?? "draftOnly";
  return stored === "autoPublishApproved" ? "manualLive" : stored;
}

/** True when this project's stored mode is the retired one (drives the one-time notice). */
export function hasRetiredAutoPublishMode(
  project: Pick<Project, "publishMode"> | undefined,
): boolean {
  return project?.publishMode === "autoPublishApproved";
}
