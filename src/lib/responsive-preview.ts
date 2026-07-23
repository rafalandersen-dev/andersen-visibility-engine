/**
 * Responsive preview — Article Studio 3.0 / P1.2F (pure helpers).
 *
 * The editor's mobile preview must be FAITHFUL: the same compiled
 * `assembled.html` under the same `milo-image.css`, with the `milo-m-*`
 * mobile overrides actually firing. A narrowed <div> cannot do that (the
 * media query watches the viewport, not the container), so the mobile mode
 * renders inside a sandboxed <iframe srcDoc> at device width — a real
 * viewport, the real media query, zero duplicated CSS.
 *
 * Parity invariant (spec acceptance: "preview markup === publish markup"):
 * buildPreviewSrcDoc embeds the body HTML byte-identical — it only wraps.
 */
import type { ContentAsset, ContentImage, FeaturedImage } from "./types";

/**
 * The full document for the preview iframe. No scripts anywhere (the caller
 * also sets sandbox="" so none could run); styles are inlined so the isolated
 * document needs no network. The body HTML is embedded VERBATIM — asserting
 * `srcDoc.includes(bodyHtml)` proves preview/publish markup parity.
 */
export function buildPreviewSrcDoc(bodyHtml: string, styles: string[]): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...styles.map((css) => `<style>${css}</style>`),
    '</head><body class="milo-preview">',
    bodyHtml,
    "</body></html>",
  ].join("");
}

export interface MobileCropWarning {
  /** "featured" or the inline image's id. */
  target: "featured" | string;
  /** Short human label of the image (concept/alt) for the warning line. */
  label: string;
}

/**
 * Deterministic "check this mobile crop" heuristic (spec §P1.2F warning):
 * a mobile override that CHANGES the aspect ratio while cropping (fit cover,
 * effective on either layer) and has no focal point set means the phone crop
 * is centred blindly — often decapitating portraits. Advisory only; never a
 * blocker (crops are taste, not corruption).
 */
export function poorMobileCropWarnings(
  asset: Pick<ContentAsset, "images" | "featuredImage">,
): MobileCropWarning[] {
  const out: MobileCropWarning[] = [];
  const f = asset.featuredImage as FeaturedImage | undefined;
  if (
    f?.mobile &&
    f.mobile.aspectRatio !== f.hero.aspectRatio &&
    (f.mobile.fit ?? "cover") === "cover" &&
    !f.hero.focalPoint &&
    !f.mobile.focalPoint
  ) {
    out.push({ target: "featured", label: f.alt || "featured image" });
  }
  // Accepted images only (crop advice for rejected drafts is noise); origin
  // gating stays the checklist's job — this is taste advice, not a gate.
  const accepted = ((asset.images ?? []) as ContentImage[]).filter((i) => i.status === "accepted");
  for (const img of accepted) {
    const base = img.presentation;
    const mobile = img.mobilePresentation;
    if (!base || !mobile) continue;
    if (
      mobile.aspectRatio !== undefined &&
      mobile.aspectRatio !== base.aspectRatio &&
      (mobile.fit ?? base.fit) === "cover" &&
      !base.focalPoint
    ) {
      out.push({ target: img.id, label: img.alt || img.concept || "image" });
    }
  }
  return out;
}
