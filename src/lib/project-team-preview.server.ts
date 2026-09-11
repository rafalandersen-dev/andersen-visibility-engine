import { readTeamReviewAuthority } from "./project-team-authority.server";
import { z } from "zod";
import { teamCommentTarget } from "./project-team";
import { readTeamReviewContext } from "./project-team-context.server";
import { assembleContentAsset } from "./content-assembler";
import { publicationVersion } from "./publication-version";
import { buildActiveInternalPaths } from "./publish-targets";
import type { ContentAsset } from "./types";
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
/** Replace canonical image URLs with identifiers. Raw storage paths, preview
 * tokens and connector settings never cross this projection boundary. */
export function teamPreviewHtml(html: string, images: { id: string; url?: string }[]) {
  let unknownImages = 0;
  const needed = new Set<string>();
  const byUrl = new Map<string, string>();
  for (const image of images)
    if (image.url) {
      const url = escape(image.url.trim());
      if (!byUrl.has(url)) byUrl.set(url, image.id);
    }
  let projected = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\bsrc="([^"]*)"/i);
    const id = match ? byUrl.get(match[1]) : undefined;
    if (!id) {
      unknownImages++;
      return '<span role="img" aria-label="Image unavailable">[Image unavailable]</span>';
    }
    needed.add(id);
    return tag.replace(/\bsrc="[^"]*"/i, `src="milo-review-image:${id}"`);
  });
  // Also remove any occurrence of a known media URL in a link or caption.
  for (const [url, id] of byUrl) projected = projected.split(url).join(`milo-review-image:${id}`);
  return { html: projected, imageIds: [...needed], unknownImages };
}
export async function readProjectTeamPreview(
  actorId: string,
  raw: z.infer<typeof teamCommentTarget>,
  read: typeof readTeamReviewContext = readTeamReviewContext,
  authority: typeof readTeamReviewAuthority = readTeamReviewAuthority,
) {
  const input = teamCommentTarget.parse(raw);
  const before = await read(actorId, input);
  const paths = buildActiveInternalPaths(before.project, before.links as ContentAsset[]);
  const assembled = assembleContentAsset(before.asset, before.project, {
    activeInternalPaths: new Set(paths),
  });
  const images = z
    .array(
      z
        .object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), url: z.string().optional() })
        .passthrough(),
    )
    .parse(before.asset.images ?? []);
  const media = images.map((image) => ({
    key: `content_${image.id}`,
    imageId: image.id,
    kind: "content" as "content" | "featured" | "social",
    url: image.url,
  }));
  const featured = before.asset.featuredImage;
  if (featured)
    z.string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .parse(featured.imageId);
  if (featured)
    media.push({
      key: `featured_${featured.imageId}`,
      imageId: featured.imageId,
      kind: "featured",
      url: featured.url,
    });
  let reviewHtml = assembled.html;
  if (featured?.approval === "approved" && featured.social?.physicalUrl) {
    // JSON-LD/OG may use a different object from the hero. Include it visibly
    // even though it does not occur in the article body.
    media.push({
      key: `social_${featured.imageId}`,
      imageId: featured.imageId,
      kind: "social",
      url: featured.social.physicalUrl,
    });
    reviewHtml += `<section><h2>Social image</h2><img src="${escape(featured.social.physicalUrl)}" alt="${escape(featured.social.alt ?? featured.alt ?? "")}" /></section>`;
  }
  const preview = teamPreviewHtml(
    reviewHtml,
    media.map((image) => ({ id: image.key, url: image.url })),
  );
  const version = await publicationVersion(before.asset, before.project, paths);
  const permissions = await authority(actorId, input);
  const after = await read(actorId, input);
  if (
    after.draftHash !== before.draftHash ||
    after.workspaceRevision !== before.workspaceRevision ||
    after.membershipRevision !== before.membershipRevision
  )
    throw new Error("The saved review changed. Refresh before continuing.");
  const result = {
    canReview: permissions.canReview,
    policyRevision: permissions.policyRevision,
    assetId: input.assetId,
    title: z.string().max(1000).parse(before.asset.title),
    metaTitle: z
      .string()
      .max(1000)
      .parse(before.asset.metaTitle ?? ""),
    metaDescription: z
      .string()
      .max(4000)
      .parse(before.asset.metaDescription ?? ""),
    version,
    draftHash: before.draftHash,
    workspaceRevision: before.workspaceRevision,
    membershipRevision: before.membershipRevision,
    ...preview,
    media: media
      .filter((image) => preview.imageIds.includes(image.key))
      .map(({ key, imageId, kind }) => ({ key, imageId, kind })),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2000000)
    throw new Error("Project preview is too large.");
  return result;
}
