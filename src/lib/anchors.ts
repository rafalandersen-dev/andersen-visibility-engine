/**
 * Placement anchors — Article Studio 3.0 / P1.2C.
 *
 * The INTERNAL canonical anchor is a validated discriminated union (below). A
 * serialized string form exists only at the persistence / export boundary
 * (`ContentImage.anchor` in the JSONB blob); `parseAnchor` turns that string back
 * into a typed anchor and REJECTS anything malformed. Section identity lives
 * INSIDE the typed anchor (`sectionId`) — there is one source of truth for an
 * image's placement, and no redundant `sectionRefId` field.
 *
 * Anchors are semantic only: before/after a canonical block or a stable section
 * id — never a paragraph index, character offset, pixel coordinate or DOM selector.
 *
 * Pure — no I/O.
 */

export type AnchorKind =
  | "before-hook"
  | "after-hook"
  | "before-section"
  | "after-section"
  | "before-faq"
  | "before-cta"
  | "article-end";

/** Anchor kinds that do NOT reference a section id. */
export const SIMPLE_ANCHOR_KINDS = [
  "before-hook",
  "after-hook",
  "before-faq",
  "before-cta",
  "article-end",
] as const;

export type SimpleAnchorKind = (typeof SIMPLE_ANCHOR_KINDS)[number];

export type PlacementAnchor =
  | { kind: SimpleAnchorKind }
  | { kind: "before-section"; sectionId: string }
  | { kind: "after-section"; sectionId: string };

/** A section id token: `sec_` + url-safe chars. Validated so a serialized anchor can't smuggle junk. */
const SECTION_ID_RE = /^sec_[A-Za-z0-9_-]{4,}$/;

export function isSectionId(v: unknown): v is string {
  return typeof v === "string" && SECTION_ID_RE.test(v);
}

/** Serialize a typed anchor to its persisted/export string form. */
export function serializeAnchor(anchor: PlacementAnchor): string {
  if (anchor.kind === "before-section" || anchor.kind === "after-section") {
    return `${anchor.kind}:${anchor.sectionId}`;
  }
  return anchor.kind;
}

/**
 * Parse a persisted/export anchor string into a validated typed anchor, or `null`
 * when it is malformed (unknown kind, missing/invalid section id, or a stray colon
 * on a simple kind). The single trusted boundary between the string blob and the
 * typed model.
 */
export function parseAnchor(raw: unknown): PlacementAnchor | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const colon = s.indexOf(":");
  if (colon === -1) {
    return (SIMPLE_ANCHOR_KINDS as readonly string[]).includes(s)
      ? { kind: s as SimpleAnchorKind }
      : null;
  }
  const kind = s.slice(0, colon);
  const sectionId = s.slice(colon + 1);
  if ((kind === "before-section" || kind === "after-section") && isSectionId(sectionId)) {
    return { kind, sectionId };
  }
  return null;
}

/** The section id an anchor targets, or null for a section-less anchor. */
export function anchorSectionId(anchor: PlacementAnchor): string | null {
  return anchor.kind === "before-section" || anchor.kind === "after-section"
    ? anchor.sectionId
    : null;
}
