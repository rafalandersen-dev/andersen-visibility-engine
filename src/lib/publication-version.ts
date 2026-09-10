import { assembleContentAsset } from "./content-assembler";
import type { ContentAsset, Project } from "./types";
import { z } from "zod";
export const publicationVersionSchema = z
  .object({ algorithm: z.literal("milo-publication-v1"), hash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type PublicationVersion = z.infer<typeof publicationVersionSchema>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
/** Identifies the assembled deliverable, reviewed evidence and destination.
 * This does not grant approval. A server-owned approval record must bind this
 * version to account/project/asset and re-derive it at publication time. */
export async function publicationVersion(
  asset: ContentAsset,
  project: Project,
  knownInternalPaths: string[] = [],
): Promise<PublicationVersion> {
  if (asset.projectId !== project.id) throw new Error("publication_version_scope");
  const paths = z.array(z.string().max(2000)).max(5000).parse(knownInternalPaths);
  const assembled = assembleContentAsset(asset, project, { activeInternalPaths: new Set(paths) });
  const input = {
    algorithm: "milo-publication-v1",
    projectId: project.id,
    assetId: asset.id,
    title: asset.title,
    slug: asset.publishSlug || asset.slug || "",
    assetType: asset.assetType ?? "article",
    language: asset.language ?? project.primaryLanguage ?? "English",
    metaTitle: asset.metaTitle ?? "",
    metaDescription: asset.metaDescription ?? "",
    markdown: assembled.markdown,
    html: assembled.html,
    jsonLd: assembled.jsonLd,
    // Preserve reviewed evidence identity independently of visible rendering.
    knowledgeReferences: asset.knowledgeReferences ?? [],
    sourceDependencies: asset.sourceDependencies ?? [],
    sources: asset.sources ?? [],
    imageEvidence: (asset.images ?? []).map((image) => ({
      id: image.id,
      storagePath: image.storagePath,
      knowledgeReferences: image.knowledgeReferences ?? [],
      sourceDependencies: image.sourceDependencies ?? [],
    })),
    destination: {
      connector: project.connectorType,
      websiteUrl: project.websiteUrl,
      publishMode: project.publishMode,
      endpoint: project.publishEndpoint,
      type: asset.publishDestinationType ?? project.defaultDestinationType,
      republishTarget: asset.republishTargetUrl,
      externalId: asset.publishExternalId,
      wordpress: {
        siteUrl: project.wordpress?.siteUrl,
        postType: asset.wordpressPostType ?? project.wordpress?.defaultPostType,
        postId: asset.wordpressPostId,
      },
      shopify: {
        shopDomain: project.shopify?.shopDomain,
        blogId: asset.shopifyBlogGid ?? project.shopify?.defaultBlogId,
        blogHandle: project.shopify?.defaultBlogHandle,
        articleId: asset.shopifyArticleGid,
        author: project.shopify?.defaultAuthorName,
        tags: project.shopify?.defaultTags,
      },
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(input)));
  if (bytes.byteLength > 2000000) throw new Error("publication_version_too_large");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    algorithm: "milo-publication-v1",
    hash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join(""),
  };
}
export function samePublicationVersion(a: unknown, b: unknown) {
  const first = publicationVersionSchema.safeParse(a),
    second = publicationVersionSchema.safeParse(b);
  return (
    first.success &&
    second.success &&
    first.data.algorithm === second.data.algorithm &&
    first.data.hash === second.data.hash
  );
}
