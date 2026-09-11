import { publishableImages } from "./images";
import { decodeHTMLAttribute } from "entities";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import { createHash } from "node:crypto";
import { readTeamReviewAuthority } from "./project-team-authority.server";
import { z } from "zod";
import { teamCommentTarget } from "./project-team";
import { readTeamReviewContext } from "./project-team-context.server";
import { assembleContentAsset } from "./content-assembler";
import { publicationVersion } from "./publication-version";
import { buildActiveInternalPaths } from "./publish-targets";
import type { ContentAsset } from "./types";
export function teamImageReviewKey(kind: "content" | "featured" | "social", id: string) {
  const key = /^[A-Za-z0-9_-]{1,64}$/.test(id)
    ? id
    : "~" + createHash("sha256").update(JSON.stringify(id)).digest("hex");
  return kind + "_" + key;
}
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
/** Replace generated image sources with review identifiers. Canonical prose,
 * captions and links retain their text; private connector metadata is never projected. */
export function teamPreviewHtml(html: string, images: { id: string; url?: string }[]) {
  let unknownImages = 0;
  const needed = new Set<string>();
  const byUrl = new Map<string, string>();
  for (const image of images)
    if (image.url) {
      const url = image.url.trim();
      if (!byUrl.has(url)) byUrl.set(url, image.id);
    }
  const projected = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\ssrc="([^"]*)"/i);
    const id = match ? byUrl.get(decodeHTMLAttribute(match[1]).trim()) : undefined;
    if (!id) {
      unknownImages++;
      return '<span role="img" aria-label="Image unavailable">[Image unavailable]</span>';
    }
    needed.add(id);
    return tag.replace(
      /(\ssrc=")[^"]*"/i,
      (_, prefix: string) => `${prefix}milo-review-image:${id}"`,
    );
  });
  return { html: projected, imageIds: [...needed], unknownImages };
}
export function projectTeamPreviewManifest(
  before: Awaited<ReturnType<typeof readTeamReviewContext>>,
) {
  const paths = buildActiveInternalPaths(before.project, before.links as ContentAsset[]);
  const assembled = assembleContentAsset(before.asset, before.project, {
    activeInternalPaths: new Set(paths),
  });
  const images = publishableImages(before.asset.images, before.project);
  const media = images.map((image) => ({
    key: teamImageReviewKey("content", image.id),
    imageId: image.id,
    kind: "content" as "content" | "featured" | "social",
    url: image.url,
  }));
  const featured = before.asset.featuredImage;
  if (featured) z.string().parse(featured.imageId);
  if (featured?.approval === "approved")
    media.push({
      key: teamImageReviewKey("featured", featured.imageId),
      imageId: featured.imageId,
      kind: "featured",
      url: featured.url,
    });
  let reviewHtml = assembled.html;
  if (featured?.approval === "approved" && featured.social?.physicalUrl) {
    // JSON-LD/OG may use a different object from the hero. Include it visibly
    // even though it does not occur in the article body.
    media.push({
      key: teamImageReviewKey("social", featured.imageId),
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
  return {
    paths,
    preview,
    media: media
      .filter((image) => preview.imageIds.includes(image.key))
      .map(({ key, imageId, kind }) => ({ key, imageId, kind })),
  };
}
async function renderProjectTeamPreview(
  actorId: string,
  raw: z.infer<typeof teamCommentTarget>,
  read: typeof readTeamReviewContext = readTeamReviewContext,
  authority: typeof readTeamReviewAuthority = readTeamReviewAuthority,
) {
  const input = teamCommentTarget.parse(raw);
  const before = await read(actorId, input);
  const { paths, preview, media } = projectTeamPreviewManifest(before);
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
    media,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2000000)
    throw new Error("Project preview is too large.");
  return result;
}

export async function readProjectTeamPreview(
  actorId: string,
  raw: z.infer<typeof teamCommentTarget>,
  read: typeof readTeamReviewContext = readTeamReviewContext,
  authority: typeof readTeamReviewAuthority = readTeamReviewAuthority,
  budget = { acquire: acquireTeamPreview, release: releaseTeamPreview },
) {
  const input = teamCommentTarget.parse(raw);
  const lease = await budget.acquire(actorId, input.ownerId, input.projectId);
  const started = Date.now();
  try {
    const result = await renderProjectTeamPreview(actorId, input, read, authority);
    if (Date.now() - started >= 45000)
      throw new Error("Project preview expired. Refresh and try again.");
    return result;
  } finally {
    // Release only after actual assembly/context work ends, never on caller disconnect.
    await budget.release(actorId, input.ownerId, lease).catch(() => {});
  }
}
