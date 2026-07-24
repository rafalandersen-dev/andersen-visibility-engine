/**
 * Arrange mode — pure block model (Article Studio 3.0 / P1.2E, spec §5.1).
 *
 * Derives the ordered list of visual blocks (featured slot, hook, sections,
 * anchored images) plus the STABLE drop zones between them, all from the SAME
 * canonical ContentAsset the assembler consumes — never a separate document.
 * Every drop zone IS a semantic `PlacementAnchor`; dropping stores only the
 * serialized anchor + an order among its siblings (spec hard rule: no pixel
 * coordinates, no paragraph indexes, ever).
 *
 * Block order mirrors the assembler's weave: before-section images render
 * immediately before their section heading; after-section images render at the
 * end of the section's SUBTREE (same span rule the weaver uses), so what the
 * user arranges here is exactly what publishes.
 */
import type { ContentAsset, ContentImage, Project } from "./types";
import { parseAnchor, serializeAnchor, type PlacementAnchor, anchorSectionId } from "./anchors";
import { resolveImageAnchors, type ImageAnchorStatus } from "./image-anchors";
import { resolveSectionPositions } from "./section-index";

export interface ArrangeImageEntry {
  image: ContentImage;
  status: ImageAnchorStatus;
}

export type ArrangeBlock =
  | { kind: "featured" }
  | { kind: "hook"; present: boolean }
  | { kind: "dropzone"; anchor: PlacementAnchor; serialized: string }
  | {
      kind: "section";
      /** Persisted section id when reconciled; null for a section not (yet) in the index. */
      sectionId: string | null;
      heading: string;
      level: number;
      excerpt: string;
    }
  | { kind: "image"; entry: ArrangeImageEntry }
  | {
      /** Broken/ambiguous/invalid/unanchored — excluded from assembly until fixed. */
      kind: "attention";
      entries: ArrangeImageEntry[];
    };

/** Images anchored to `serialized`, in the assembler's order (order asc, id tie-break). */
function imagesAt(
  anchored: { image: ContentImage; status: ImageAnchorStatus }[],
  serialized: string,
): ArrangeImageEntry[] {
  return anchored
    .filter((a) => a.image.anchor === serialized && a.status === "resolved")
    .sort(
      (a, b) => (a.image.order ?? 0) - (b.image.order ?? 0) || a.image.id.localeCompare(b.image.id),
    )
    .map((a) => ({ image: a.image, status: a.status }));
}

/**
 * The ordered Arrange surface for an asset. Deterministic; every call derives
 * from the current asset fields (single-source invariant — spec §5.1).
 */
export function buildArrangeModel(asset: ContentAsset, project: Project): ArrangeBlock[] {
  const res = resolveImageAnchors(asset, project);
  const positions = resolveSectionPositions(asset.sectionIndex, res.sections);
  // ParsedSection.order → persisted id (only unambiguous matches count).
  const idByOrder = new Map<number, string>();
  for (const [id, m] of positions) {
    if (m.status === "resolved" && m.section) idByOrder.set(m.section.order, id);
  }

  const anchored = res.anchored.map((a) => ({ image: a.image, status: a.status }));
  const blocks: ArrangeBlock[] = [];
  const img = (serialized: string) =>
    imagesAt(anchored, serialized).forEach((entry) => blocks.push({ kind: "image", entry }));
  const zone = (anchor: PlacementAnchor) =>
    blocks.push({ kind: "dropzone", anchor, serialized: serializeAnchor(anchor) });

  blocks.push({ kind: "featured" });
  zone({ kind: "before-hook" });
  img("before-hook");
  blocks.push({ kind: "hook", present: Boolean(asset.hook) });
  zone({ kind: "after-hook" });
  img("after-hook");

  // Sections in document order. after-section images belong at the END of the
  // section's subtree — emit them (and the drop zone) when the subtree closes.
  const open: { order: number; id: string | null; end: number }[] = [];
  const closeThrough = (nextStartLine: number | null) => {
    while (open.length && (nextStartLine === null || open[open.length - 1].end <= nextStartLine)) {
      const s = open.pop()!;
      if (s.id) {
        const serialized = serializeAnchor({ kind: "after-section", sectionId: s.id });
        img(serialized);
        zone({ kind: "after-section", sectionId: s.id });
      }
    }
  };
  for (const s of res.sections) {
    closeThrough(s.headingLineIdx);
    const id = idByOrder.get(s.order) ?? null;
    if (id) {
      const serialized = serializeAnchor({ kind: "before-section", sectionId: id });
      img(serialized);
      zone({ kind: "before-section", sectionId: id });
    }
    blocks.push({
      kind: "section",
      sectionId: id,
      heading: s.heading,
      level: s.level,
      excerpt: s.excerpt.slice(0, 160),
    });
    open.push({ order: s.order, id, end: s.subtreeEndLineIdx });
  }
  closeThrough(null);

  if (res.faqSection) {
    img("before-faq");
    zone({ kind: "before-faq" });
  }
  if (res.ctaSection) {
    img("before-cta");
    zone({ kind: "before-cta" });
  }
  img("article-end");
  zone({ kind: "article-end" });

  // Everything excluded from assembly, surfaced once at the end for repair.
  const attention: ArrangeImageEntry[] = [
    ...res.anchored
      .filter((a) => a.status !== "resolved")
      .map((a) => ({ image: a.image, status: a.status })),
    ...res.unanchored.map((image) => ({ image, status: "unplaced" as const })),
    ...res.invalid.map((image) => ({ image, status: "invalid" as const })),
  ];
  if (attention.length) blocks.push({ kind: "attention", entries: attention });
  return blocks;
}

/**
 * Move an image to a semantic anchor (a drop). Pure: returns the images array
 * to store. Stores ONLY the serialized anchor + an order appended after the
 * anchor's current siblings — repeated moves can never duplicate an image or
 * its metadata (spec acceptance 8), and never write positions/indexes.
 */
export function moveImageToAnchor(
  images: ContentImage[],
  imageId: string,
  anchor: PlacementAnchor,
): ContentImage[] {
  const serialized = serializeAnchor(anchor);
  const maxOrder = Math.max(
    0,
    ...images.filter((i) => i.id !== imageId && i.anchor === serialized).map((i) => i.order ?? 0),
  );
  return images.map((i) =>
    i.id === imageId
      ? { ...i, placement: "inline" as const, anchor: serialized, order: maxOrder + 1 }
      : i,
  );
}

/** Parse a drop zone's serialized anchor back to the typed form (UI round-trip). */
export function anchorFromDropzone(serialized: string): PlacementAnchor | null {
  return parseAnchor(serialized);
}

/** Human-facing target description for a drop zone (i18n key + optional heading). */
export function dropzoneLabel(
  anchor: PlacementAnchor,
  sections: { sectionId: string | null; heading: string }[],
): { key: string; heading?: string } {
  const sid = anchorSectionId(anchor);
  if (sid) {
    const heading = sections.find((s) => s.sectionId === sid)?.heading;
    return {
      key:
        anchor.kind === "before-section"
          ? "arrange.zone.beforeSection"
          : "arrange.zone.afterSection",
      ...(heading ? { heading } : {}),
    };
  }
  return { key: `arrange.zone.${anchor.kind}` };
}
