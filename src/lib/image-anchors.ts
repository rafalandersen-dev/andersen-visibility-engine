/**
 * Inline-image anchor resolution — Article Studio 3.0 / P1.2C.
 *
 * The single read-time resolver shared by the canonical assembler and the checklist,
 * so preview/publish and the publish gate agree on where every anchored image goes
 * and which ones are broken. PURE — it parses the body and computes status; it never
 * mutates the asset and never persists derived state.
 *
 * Canonical-slot support (verified against the current assembler):
 *   • before-hook / after-hook — resolve around the TYPED hook block (a canonical
 *     assembler slot). Broken when the article has no composed hook.
 *   • before-section / after-section — resolve against a persisted section id.
 *   • article-end — always resolvable (deterministic end of the article body).
 *   • before-faq / before-cta — FAQ and CTA are NOT typed assembler slots today
 *     (they are authored into the body markdown), so these resolve via a documented,
 *     conservative BODY-HEADING fallback (multi-language marker match). When no
 *     confident heading is found the anchor resolves `broken` — it is never guessed.
 *     Full canonical support arrives if/when FAQ/CTA become typed assembler slots.
 */
import type { ContentAsset, ContentImage, Project } from "./types";
import { parseAnchor, anchorSectionId, type PlacementAnchor } from "./anchors";
import { parseSections, resolveSectionPositions, type ParsedSection } from "./section-index";
import { publishableImages } from "./images";
import { hasHookText } from "./hook";
import { stripImageMarkdown } from "./markdown";

export type ImageAnchorStatus = "resolved" | "broken" | "ambiguous" | "unplaced" | "invalid";

export interface ResolvedImageAnchor {
  image: ContentImage;
  anchor: PlacementAnchor | null;
  status: ImageAnchorStatus;
  /** The target section for a resolved before/after-section (and the FAQ/CTA fallback). */
  section: ParsedSection | null;
}

export interface ImageAnchorResolution {
  /** The body with raw author images stripped — the exact string the assembler weaves into. */
  strippedBody: string;
  sections: ParsedSection[];
  hookComposed: boolean;
  faqSection: ParsedSection | null;
  ctaSection: ParsedSection | null;
  /** Publishable inline images that carry an anchor (any status). */
  anchored: ResolvedImageAnchor[];
  /** Publishable inline images with NO anchor — legacy append-after-body. */
  unanchored: ContentImage[];
  /** Invalid states (e.g. a featured image carrying an inline anchor). */
  invalid: ContentImage[];
}

// Conservative, documented FAQ/CTA heading markers (multi-language, no diacritics).
// Fragile by nature — FAQ/CTA are body-authored, not typed slots (see file header).
const FAQ_MARKERS =
  /\b(faq|faqs|frequently asked questions?|common questions|vanliga fragor|ofte stillede sporgsmal|czesto zadawane pytania)\b/;
const CTA_MARKERS =
  /\b(call to action|get started|book now|contact us|kontakta oss|kom i gang|skontaktuj sie)\b/;

function findSection(sections: ParsedSection[], re: RegExp): ParsedSection | null {
  return sections.find((s) => re.test(s.normalized)) ?? null;
}

/**
 * Resolve every inline image's anchor against the CURRENT body. The assembler uses
 * `strippedBody` + `sections` + the resolved positions to weave; the checklist uses
 * the statuses. Only publishable images are considered (an unpublishable required
 * image is already caught by the existing image gate).
 */
export function resolveImageAnchors(asset: ContentAsset, project: Project): ImageAnchorResolution {
  const strippedBody = stripImageMarkdown(asset.markdown ?? "");
  const { sections } = parseSections(strippedBody);
  const positions = resolveSectionPositions(asset.sectionIndex, sections);
  const hookComposed = hasHookText(asset.hook);
  const faqSection = findSection(sections, FAQ_MARKERS);
  const ctaSection = findSection(sections, CTA_MARKERS);

  const pub = publishableImages(asset.images, project);
  const anchored: ResolvedImageAnchor[] = [];
  const unanchored: ContentImage[] = [];
  const invalid: ContentImage[] = [];

  for (const image of asset.images ?? []) {
    const hasAnchor = typeof image.anchor === "string" && image.anchor.trim() !== "";
    // Featured images never carry an inline anchor; an anchor on a non-inline image
    // is a contradictory (invalid) state (refinement 8).
    if (hasAnchor && image.placement !== "inline") {
      invalid.push(image);
      continue;
    }
    if (image.placement !== "inline") continue; // featured handled by the assembler separately
    if (!pub.includes(image)) continue; // only vetted (approved+alt+controlled) images compose
    if (!hasAnchor) {
      unanchored.push(image);
      continue;
    }
    const anchor = parseAnchor(image.anchor);
    if (!anchor) {
      anchored.push({ image, anchor: null, status: "broken", section: null });
      continue;
    }
    anchored.push(resolveOne(image, anchor, positions, hookComposed, faqSection, ctaSection));
  }

  return {
    strippedBody,
    sections,
    hookComposed,
    faqSection,
    ctaSection,
    anchored,
    unanchored,
    invalid,
  };
}

function resolveOne(
  image: ContentImage,
  anchor: PlacementAnchor,
  positions: ReturnType<typeof resolveSectionPositions>,
  hookComposed: boolean,
  faqSection: ParsedSection | null,
  ctaSection: ParsedSection | null,
): ResolvedImageAnchor {
  const sid = anchorSectionId(anchor);
  if (sid) {
    const match = positions.get(sid);
    if (!match || match.status === "missing") {
      return { image, anchor, status: "broken", section: null };
    }
    if (match.status === "ambiguous") return { image, anchor, status: "ambiguous", section: null };
    return { image, anchor, status: "resolved", section: match.section };
  }
  switch (anchor.kind) {
    case "article-end":
      return { image, anchor, status: "resolved", section: null };
    case "before-hook":
    case "after-hook":
      return hookComposed
        ? { image, anchor, status: "resolved", section: null }
        : { image, anchor, status: "broken", section: null };
    case "before-faq":
      return faqSection
        ? { image, anchor, status: "resolved", section: faqSection }
        : { image, anchor, status: "broken", section: null };
    case "before-cta":
      return ctaSection
        ? { image, anchor, status: "resolved", section: ctaSection }
        : { image, anchor, status: "broken", section: null };
    default:
      return { image, anchor, status: "broken", section: null };
  }
}
