/**
 * Images — Article Studio 2.0 / P1.1 G (non-paid MVP).
 *
 * No paid generator is wired. An image publishes ONLY when it is (a) approved,
 * (b) carries required alt text, and (c) is hosted on a CONTROLLED origin — the
 * project's own site or Milo/Lovable storage — never a hotlinked third party
 * (publishing is upsert-only, so a dead/hallucinated external image would be
 * permanent — C18). A missing REQUIRED content image or missing alt text may
 * block publishing; a missing optional/decorative image never does (C19).
 */
import type { ContentImage, Project } from "./types";

/** Milo/Lovable-controlled storage host suffixes (uploads land here). */
export const CONTROLLED_IMAGE_HOST_SUFFIXES = [".supabase.co", ".supabase.in"];

/** The project's own site origin, or "" if not set / unparseable. */
export function projectOrigin(project: Project): string {
  const site = (project.websiteUrl || "").trim();
  if (!site) return "";
  try {
    return new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).origin;
  } catch {
    return "";
  }
}

/**
 * A controlled origin = the project's own https site, or Milo/Lovable storage.
 * Anything else is a hotlink and is never publishable.
 */
export function isControlledImageOrigin(url: string, project: Project): boolean {
  let u: URL;
  try {
    u = new URL((url || "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const origin = projectOrigin(project);
  if (origin && u.origin === origin) return true;
  const host = u.hostname.toLowerCase();
  return CONTROLLED_IMAGE_HOST_SUFFIXES.some((suf) => host.endsWith(suf));
}

/** Publishable = approved + alt present + url on a controlled origin (never hotlinked). */
export function isImagePublishable(img: ContentImage, project: Project): boolean {
  if (img.status !== "accepted" && img.status !== "generated") return false;
  if (!img.alt || !img.alt.trim()) return false;
  if (!img.url || !img.url.trim()) return false;
  return isControlledImageOrigin(img.url, project);
}

export function publishableImages(
  images: ContentImage[] | undefined,
  project: Project,
): ContentImage[] {
  return (images ?? []).filter((i) => isImagePublishable(i, project));
}

export function publishableImageUrls(
  images: ContentImage[] | undefined,
  project: Project,
): string[] {
  return publishableImages(images, project)
    .map((i) => (i.url || "").trim())
    .filter(Boolean);
}

/**
 * Images intended to publish (approved) but lacking alt text → a HARD publish
 * block (C19). A proposed/missing image is not intended to publish and is not
 * counted here.
 */
export function imagesMissingAlt(images: ContentImage[] | undefined): ContentImage[] {
  return (images ?? []).filter(
    (i) => (i.status === "accepted" || i.status === "generated") && (!i.alt || !i.alt.trim()),
  );
}

/**
 * REQUIRED content images that are not yet publishable (no approved controlled
 * asset) → a HARD publish block. Optional/decorative images never appear here.
 */
export function requiredImagesUnresolved(
  images: ContentImage[] | undefined,
  project: Project,
): ContentImage[] {
  return (images ?? []).filter((i) => i.required === true && !isImagePublishable(i, project));
}

/** Render one publishable image (+ optional caption) as markdown. */
export function imageMarkdown(img: ContentImage): string {
  const alt = (img.alt || "").trim();
  const url = (img.url || "").trim();
  const md = `![${alt}](${url})`;
  const caption = (img.caption || "").trim();
  return caption ? `${md}\n\n*${caption}*` : md;
}
