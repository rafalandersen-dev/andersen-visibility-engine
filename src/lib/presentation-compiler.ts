/**
 * Image presentation compiler — Article Studio 3.0 / P1.2D.
 *
 * ONE pure compiler from bounded, TRUSTED typed presets to an allow-listed
 * `<figure>`. Safety is by construction: every class comes from a fixed map keyed
 * by an enum (never a user string), the ONLY inline style is a clamped
 * `object-position` built from numbers (never concatenated user text), and alt /
 * caption are escaped. There is no class/style/HTML passthrough. Unknown persisted
 * enum values are coerced to safe defaults so the compiler can NEVER emit unsafe
 * markup, even when the checklist separately blocks publishing on that bad data.
 *
 * Pure — no I/O, never mutates the asset. Deterministic + byte-identical on repeat.
 */
import type {
  ContentImage,
  FocalPoint,
  ImageAlign,
  ImageAspect,
  ImageFit,
  ImagePresentation,
  ImagePresentationOverride,
  ImageSize,
  ImageVisualStyle,
} from "./types";

export const IMAGE_SIZES: readonly ImageSize[] = ["small", "medium", "large", "wide", "full"];
export const IMAGE_ALIGNMENTS: readonly ImageAlign[] = ["left", "center", "right"];
export const IMAGE_ASPECTS: readonly ImageAspect[] = [
  "original",
  "square",
  "portrait",
  "landscape",
  "wide",
];
export const IMAGE_FITS: readonly ImageFit[] = ["cover", "contain"];
export const IMAGE_STYLES: readonly ImageVisualStyle[] = ["plain", "rounded", "card"];

/** Explicit aspect-ratio mapping (the class carries it in CSS; documented + tested). */
export const ASPECT_RATIO: Record<ImageAspect, string> = {
  original: "auto",
  square: "1 / 1",
  portrait: "4 / 5",
  landscape: "4 / 3",
  wide: "16 / 9",
};

const SIZE_CLASS: Record<ImageSize, string> = {
  small: "milo-size-small",
  medium: "milo-size-medium",
  large: "milo-size-large",
  wide: "milo-size-wide",
  full: "milo-size-full",
};
const ALIGN_CLASS: Record<ImageAlign, string> = {
  left: "milo-align-left",
  center: "milo-align-center",
  right: "milo-align-right",
};
const ASPECT_CLASS: Record<ImageAspect, string> = {
  original: "milo-aspect-original",
  square: "milo-aspect-square",
  portrait: "milo-aspect-portrait",
  landscape: "milo-aspect-landscape",
  wide: "milo-aspect-wide",
};
const FIT_CLASS: Record<ImageFit, string> = {
  cover: "milo-fit-cover",
  contain: "milo-fit-contain",
};
const STYLE_CLASS: Record<ImageVisualStyle, string> = {
  plain: "milo-style-plain",
  rounded: "milo-style-rounded",
  card: "milo-style-card",
};

// Mobile-override classes (P1.2D). Emitted ONLY for a dimension whose resolved
// mobile value differs from the base, and applied by milo-image.css at the phone
// breakpoint. This is per-image presentation, NOT the P1.2F article responsive shell.
const M_SIZE_CLASS: Record<ImageSize, string> = {
  small: "milo-m-size-small",
  medium: "milo-m-size-medium",
  large: "milo-m-size-large",
  wide: "milo-m-size-wide",
  full: "milo-m-size-full",
};
const M_ALIGN_CLASS: Record<ImageAlign, string> = {
  left: "milo-m-align-left",
  center: "milo-m-align-center",
  right: "milo-m-align-right",
};
const M_ASPECT_CLASS: Record<ImageAspect, string> = {
  original: "milo-m-aspect-original",
  square: "milo-m-aspect-square",
  portrait: "milo-m-aspect-portrait",
  landscape: "milo-m-aspect-landscape",
  wide: "milo-m-aspect-wide",
};
const M_FIT_CLASS: Record<ImageFit, string> = {
  cover: "milo-m-fit-cover",
  contain: "milo-m-fit-contain",
};
const M_STYLE_CLASS: Record<ImageVisualStyle, string> = {
  plain: "milo-m-style-plain",
  rounded: "milo-m-style-rounded",
  card: "milo-m-style-card",
};

export const DEFAULT_PRESENTATION: ImagePresentation = {
  size: "large",
  alignment: "center",
  aspectRatio: "original",
  fit: "cover",
  visualStyle: "plain",
};

function coerce<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Clamp a focal point to [0,1]; drop it entirely if malformed. */
export function clampFocal(fp: FocalPoint | undefined): FocalPoint | undefined {
  if (!fp || typeof fp.x !== "number" || typeof fp.y !== "number") return undefined;
  if (Number.isNaN(fp.x) || Number.isNaN(fp.y)) return undefined;
  const c = (n: number) => Math.min(1, Math.max(0, n));
  return { x: c(fp.x), y: c(fp.y) };
}

/**
 * Defensive normalization used before compiling: unknown enums → safe defaults,
 * focal clamped. Guarantees the compiler only ever sees valid values.
 */
export function normalizePresentation(p: ImagePresentation | undefined): ImagePresentation {
  const base = p ?? DEFAULT_PRESENTATION;
  const out: ImagePresentation = {
    size: coerce(base.size, IMAGE_SIZES, DEFAULT_PRESENTATION.size),
    alignment: coerce(base.alignment, IMAGE_ALIGNMENTS, DEFAULT_PRESENTATION.alignment),
    aspectRatio: coerce(base.aspectRatio, IMAGE_ASPECTS, DEFAULT_PRESENTATION.aspectRatio),
    fit: coerce(base.fit, IMAGE_FITS, DEFAULT_PRESENTATION.fit),
    visualStyle: coerce(base.visualStyle, IMAGE_STYLES, DEFAULT_PRESENTATION.visualStyle),
  };
  const focal = clampFocal(base.focalPoint);
  if (focal) out.focalPoint = focal;
  if (typeof base.captionVisible === "boolean") out.captionVisible = base.captionVisible;
  return out;
}

/** Effective mobile presentation: a mobile override inherits every unset base field. */
export function resolveMobilePresentation(
  base: ImagePresentation,
  override: ImagePresentationOverride | undefined,
): ImagePresentation {
  const b = normalizePresentation(base);
  if (!override) return b;
  const merged: ImagePresentation = {
    size: override.size ? coerce(override.size, IMAGE_SIZES, b.size) : b.size,
    alignment: override.alignment
      ? coerce(override.alignment, IMAGE_ALIGNMENTS, b.alignment)
      : b.alignment,
    aspectRatio: override.aspectRatio
      ? coerce(override.aspectRatio, IMAGE_ASPECTS, b.aspectRatio)
      : b.aspectRatio,
    fit: override.fit ? coerce(override.fit, IMAGE_FITS, b.fit) : b.fit,
    visualStyle: override.visualStyle
      ? coerce(override.visualStyle, IMAGE_STYLES, b.visualStyle)
      : b.visualStyle,
  };
  // A well-formed override focal wins; a malformed/incomplete one is rejected and the
  // base focal is inherited (a partial coordinate is never applied).
  const focal = clampFocal(override.focalPoint) ?? b.focalPoint;
  if (focal) merged.focalPoint = focal;
  const cap =
    typeof override.captionVisible === "boolean" ? override.captionVisible : b.captionVisible;
  if (typeof cap === "boolean") merged.captionVisible = cap;
  return merged;
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Compile ONE image + presentation into an allow-listed `<figure>`. Deterministic
 * class order (image, size, align, aspect, fit, style) and attribute order
 * (src, alt, loading, style?). The only inline style is a clamped object-position
 * (fit:cover + focal only), built from integers. alt/caption escaped.
 */
export function compileFigureHtml(image: ContentImage, presentation: ImagePresentation): string {
  const p = normalizePresentation(presentation);
  const classList = [
    "milo-image",
    SIZE_CLASS[p.size],
    ALIGN_CLASS[p.alignment],
    ASPECT_CLASS[p.aspectRatio],
    FIT_CLASS[p.fit],
    STYLE_CLASS[p.visualStyle],
  ];
  // Mobile override: emit a milo-m-* class ONLY for a dimension whose resolved
  // mobile value DIFFERS from the base preset, so a figure with no override is
  // byte-identical to before this change. Deterministic order (size, align,
  // aspect, fit, style). Mobile focal is intentionally not rendered (the base
  // object-position applies at every viewport; the editor exposes no mobile focal).
  if (image.mobilePresentation) {
    const m = resolveMobilePresentation(p, image.mobilePresentation);
    if (m.size !== p.size) classList.push(M_SIZE_CLASS[m.size]);
    if (m.alignment !== p.alignment) classList.push(M_ALIGN_CLASS[m.alignment]);
    if (m.aspectRatio !== p.aspectRatio) classList.push(M_ASPECT_CLASS[m.aspectRatio]);
    if (m.fit !== p.fit) classList.push(M_FIT_CLASS[m.fit]);
    if (m.visualStyle !== p.visualStyle) classList.push(M_STYLE_CLASS[m.visualStyle]);
  }
  const classes = classList.join(" ");
  const url = (image.url || "").replace(/"/g, "%22");
  const alt = escapeHtml(image.alt || "");
  let objPos = "";
  if (p.fit === "cover" && p.focalPoint) {
    const x = Math.round(p.focalPoint.x * 100);
    const y = Math.round(p.focalPoint.y * 100);
    objPos = ` style="object-position:${x}% ${y}%"`;
  }
  const captionOn = p.captionVisible !== false && (image.caption || "").trim() !== "";
  const figcaption = captionOn ? `<figcaption>${escapeHtml(image.caption || "")}</figcaption>` : "";
  return `<figure class="${classes}"><img src="${url}" alt="${alt}" loading="lazy"${objPos} />${figcaption}</figure>`;
}

/** Degraded MARKDOWN for a presented image (markdown cannot express presentation). */
export function presentationMarkdown(image: ContentImage, presentation: ImagePresentation): string {
  const p = normalizePresentation(presentation);
  const alt = (image.alt || "").trim();
  const url = (image.url || "").trim();
  const md = `![${alt}](${url})`;
  const captionOn = p.captionVisible !== false && (image.caption || "").trim() !== "";
  return captionOn ? `${md}\n\n*${(image.caption || "").trim()}*` : md;
}

// ---------------------------------------------------------------------------
// Validation (checklist-facing)
// ---------------------------------------------------------------------------

export type PresentationFindingCode =
  "invalid-preset" | "focal-out-of-range" | "incompatible-placement" | "focal-inactive-contain";

export interface PresentationFinding {
  code: PresentationFindingCode;
  message: string;
  blocking: boolean;
}

/**
 * Validate an image's PERSISTED presentation for the checklist. Blockers: unknown
 * enum (also catches injected class/style/HTML strings, since those are not valid
 * enum members), focal outside 0..1, and an incompatible inline/featured combo.
 * Warning: a focal point that is inactive because fit=contain.
 */
export function validatePresentation(image: ContentImage): PresentationFinding[] {
  const p = image.presentation;
  if (!p) return [];
  const out: PresentationFinding[] = [];
  const badEnum =
    !(IMAGE_SIZES as readonly string[]).includes(p.size) ||
    !(IMAGE_ALIGNMENTS as readonly string[]).includes(p.alignment) ||
    !(IMAGE_ASPECTS as readonly string[]).includes(p.aspectRatio) ||
    !(IMAGE_FITS as readonly string[]).includes(p.fit) ||
    !(IMAGE_STYLES as readonly string[]).includes(p.visualStyle);
  if (badEnum) {
    out.push({
      code: "invalid-preset",
      message: "Image presentation has an unknown preset value.",
      blocking: true,
    });
  }
  if (
    p.focalPoint &&
    (p.focalPoint.x < 0 || p.focalPoint.x > 1 || p.focalPoint.y < 0 || p.focalPoint.y > 1)
  ) {
    out.push({
      code: "focal-out-of-range",
      message: "Focal point is outside the allowed 0–1 range.",
      blocking: true,
    });
  }
  if (image.placement === "featured") {
    if (p.size !== "wide" && p.size !== "full") {
      out.push({
        code: "incompatible-placement",
        message: "A featured image must be sized wide or full.",
        blocking: true,
      });
    }
    if (p.alignment !== "center") {
      out.push({
        code: "incompatible-placement",
        message: "A featured image must be centre-aligned.",
        blocking: true,
      });
    }
  }
  if (p.fit === "contain" && p.focalPoint) {
    out.push({
      code: "focal-inactive-contain",
      message: "Focal point is inactive while fit is ‘contain’.",
      blocking: false,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Connector capability (four-state honesty) — refinement 10. No contract change.
// ---------------------------------------------------------------------------

export type CapabilityState = "yes" | "no" | "unknown";
export interface PresentationCapability {
  /** Milo produced the presentation figure/classes. */
  generated: CapabilityState;
  /** They were placed into the output HTML. */
  included: CapabilityState;
  /** The destination is known to keep them. */
  retained: CapabilityState;
  /** Milo re-read the destination and confirmed they render. */
  destinationVerified: CapabilityState;
}

export type PresentationDestination = "preview" | "wordpress" | "shopify" | "custom" | null;

/**
 * Report presentation capability per destination WITHOUT over-claiming. Milo's own
 * preview ships `milo-image.css`, so it is fully retained + verified there. For any
 * real connector Milo has NOT confirmed the destination keeps or renders the
 * `milo-*` classes, so `retained` is `unknown` and `destinationVerified` is `no` —
 * a class name appearing in HTML is never treated as "retained". With no destination
 * selected, the neutral "not verified" status is returned.
 */
export function presentationCapability(
  destination: PresentationDestination,
): PresentationCapability {
  if (destination === "preview") {
    return { generated: "yes", included: "yes", retained: "yes", destinationVerified: "yes" };
  }
  return { generated: "yes", included: "yes", retained: "unknown", destinationVerified: "no" };
}
