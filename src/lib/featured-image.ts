/**
 * Featured image — Article Studio 3.0 / P1.2B.
 *
 * ONE approved Storage object per featured image; hero/mobile/social crops are
 * PresentationVariant METADATA over that same object (spec §4.3) — a variant
 * never creates or references a second stored file. Rendering reuses the P1.2D
 * presentation compiler unchanged, so the featured hero passes through the same
 * allow-listed security boundary as every inline figure (fixed enum classes,
 * clamped integer object-position, escaped alt/caption, zero raw HTML).
 *
 * Connector media behaviour (WP featured-media upload, Shopify article image)
 * is P1.2G — approval-gated, document-first. Nothing here talks to a connector;
 * the FeaturedImage identity fields stay dormant until that phase.
 *
 * Pure — no I/O, no store access.
 */
import type {
  ContentAsset,
  FeaturedImage,
  ImagePresentation,
  PresentationVariant,
  Project,
} from "./types";
import {
  clampFocal,
  compileFigureHtml,
  DEFAULT_PRESENTATION,
  IMAGE_ASPECTS,
  IMAGE_FITS,
} from "./presentation-compiler";
import { isControlledImageOrigin } from "./images";

/**
 * Bridge a variant to the P1.2D presentation model. Featured heroes obey the
 * P1.2D featured rules by construction: size "full", alignment "center" — the
 * variant only chooses aspect/fit/focal (spec: variants are crop metadata).
 */
export function variantPresentation(variant: PresentationVariant | undefined): ImagePresentation {
  const focal = clampFocal(variant?.focalPoint);
  return {
    ...DEFAULT_PRESENTATION,
    size: "full",
    alignment: "center",
    aspectRatio: variant?.aspectRatio ?? "wide",
    fit: variant?.fit ?? "cover",
    ...(focal ? { focalPoint: focal } : {}),
  };
}

/**
 * Compile the featured HERO figure via the ONE presentation compiler. The
 * mobile crop (when present) rides the P1.2D mobile-override channel, so the
 * existing `milo-m-*` breakpoint CSS applies with zero new surface.
 */
export function compileFeaturedHeroHtml(featured: FeaturedImage): string {
  const heroPresentation = variantPresentation(featured.hero);
  const mobile = featured.mobile;
  return compileFigureHtml(
    {
      // The compiler only reads url/alt/caption/mobilePresentation off the image.
      id: featured.imageId,
      concept: "featured",
      url: featured.url ?? "",
      alt: featured.alt,
      caption: featured.caption,
      placement: "featured",
      status: "accepted",
      // Mobile focal is intentionally NOT bridged: the P1.2D mobile channel
      // renders class-diffs only (no mobile object-position), so passing it
      // would persist a value that can never take effect.
      ...(mobile
        ? { mobilePresentation: { aspectRatio: mobile.aspectRatio, fit: mobile.fit } }
        : {}),
    },
    heroPresentation,
  );
}

/** Degraded markdown for the featured hero (markdown can't express crops). */
export function featuredMarkdown(featured: FeaturedImage): string {
  const alt = (featured.alt || "").trim();
  const url = (featured.url || "").trim();
  const md = `![${alt}](${url})`;
  const caption = (featured.caption || "").trim();
  return caption ? `${md}\n\n*${caption}*` : md;
}

/**
 * The image URL that represents this article externally (JSON-LD `image` /
 * Open Graph): a deliberately supplied physical social asset wins, else the
 * single approved object. Empty when the featured image is absent/unapproved —
 * never a signed preview URL.
 */
export function featuredOgImageUrl(asset: Pick<ContentAsset, "featuredImage">): string {
  const f = asset.featuredImage;
  if (!f || f.approval !== "approved") return "";
  return (f.social?.physicalUrl || f.url || "").trim();
}

/** True when the assembler should render the P1.2B hero instead of the legacy path. */
export function featuredImageActive(asset: Pick<ContentAsset, "featuredImage">): boolean {
  const f = asset.featuredImage;
  return Boolean(f && f.approval === "approved" && (f.url || "").trim() && (f.alt || "").trim());
}

export interface FeaturedImageFinding {
  code:
    | "missing-featured"
    | "unapproved-featured"
    | "missing-alt"
    | "uncontrolled-origin"
    | "focal-out-of-range"
    | "invalid-preset";
  message: string;
  blocking: boolean;
}

/**
 * Checklist-facing validation. Only v3/upgrading articles are gated on HAVING a
 * featured image (the caller passes `applies` from the same predicate as the
 * hook gate); a PRESENT featured image is validated for everyone, because a
 * corrupt one must never publish regardless of the asset's vintage.
 */
export function validateFeaturedImage(
  asset: Pick<ContentAsset, "featuredImage">,
  project: Project,
  applies: boolean,
): FeaturedImageFinding[] {
  const f = asset.featuredImage;
  const out: FeaturedImageFinding[] = [];
  if (!f) {
    if (applies) {
      // ADVISORY, not blocking (same treatment the owner chose for the YMYL and
      // author presence gates, 2026-07-22): Milo has no image generation, so a
      // hard presence gate would make every auto-drafted v3 article unpublishable.
      // Integrity findings below (unapproved/alt/origin/preset/focal) stay blocking.
      out.push({
        code: "missing-featured",
        message:
          "No featured image yet — the article publishes without a hero and without an og/JSON-LD image. Add one in the editor when you can.",
        blocking: false,
      });
    }
    return out;
  }
  if (f.approval !== "approved") {
    out.push({
      code: "unapproved-featured",
      message: "The featured image is not approved yet. Review and approve it in the editor.",
      blocking: true,
    });
  }
  if (!(f.alt || "").trim()) {
    out.push({
      code: "missing-alt",
      message: "The featured image is missing alt text.",
      blocking: true,
    });
  }
  const urls = [f.url, f.social?.physicalUrl].filter((u): u is string => Boolean(u?.trim()));
  for (const u of urls) {
    if (!isControlledImageOrigin(u, project)) {
      out.push({
        code: "uncontrolled-origin",
        message: "The featured image must be hosted on a controlled origin (never hotlinked).",
        blocking: true,
      });
      break;
    }
  }
  const variants = [f.hero, f.mobile, f.social?.variant];
  for (const v of variants) {
    if (
      v &&
      (!(IMAGE_ASPECTS as readonly string[]).includes(v.aspectRatio) ||
        !(IMAGE_FITS as readonly string[]).includes(v.fit))
    ) {
      out.push({
        code: "invalid-preset",
        message: "A featured-image crop has an unknown preset value.",
        blocking: true,
      });
      break;
    }
  }
  for (const v of variants) {
    const fp = v?.focalPoint;
    if (fp && (fp.x < 0 || fp.x > 1 || fp.y < 0 || fp.y > 1)) {
      out.push({
        code: "focal-out-of-range",
        message: "A featured-image focal point is outside the allowed 0–1 range.",
        blocking: true,
      });
      break;
    }
  }
  return out;
}
