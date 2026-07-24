/**
 * Article Studio visual-model classification — P1.2A.
 *
 * The article's visual POLICY (do the 3.0 hook hard blockers apply?) is driven by
 * an EXPLICIT additive marker — `visualModelVersion` plus the `visualState`
 * lifecycle — and is NEVER inferred from whether a `hook` exists. That separation
 * is deliberate (D-AS3-5/6):
 *
 *   • an existing Article Studio 2.0 asset carrying no marker behaves as legacy
 *     and is never retroactively blocked;
 *   • a brand-new v3 article that is mid-creation and has no hook yet is still
 *     classified v3 (so it is never mis-read as legacy), and the checklist blocks
 *     it until the hook is added and approved;
 *   • a legacy article the author explicitly opted into the upgrade (`upgrading`)
 *     is held to v3 rules;
 *   • the upgrade is forward-only in the UI — no user-facing revert in the MVP.
 *
 * Pure — no I/O.
 */
import type { AssetType, ContentAsset } from "./types";
import { featuredImageActive } from "./featured-image";

type VisualMarkers = Pick<ContentAsset, "visualModelVersion" | "visualState">;

/**
 * Long-form asset types that get the Article Studio 3.0 hook requirement when newly
 * generated. Short-form / non-article types (brief, faq, gbpPost, meta, socialPack)
 * stay legacy so they are never hook-gated. Every content-generation path that
 * mints a publishable article should mark these `visualModelVersion: 3`.
 */
export const ARTICLE_LIKE_ASSET_TYPES: readonly AssetType[] = [
  "article",
  "servicePage",
  "landingPage",
  "comparison",
];

export function isArticleLikeAssetType(assetType: AssetType | undefined): boolean {
  return assetType ? ARTICLE_LIKE_ASSET_TYPES.includes(assetType) : false;
}

/**
 * True when Article Studio 3.0 rules apply to this asset:
 *  • it explicitly started or completed the visual upgrade (`upgrading`/`current`), OR
 *  • it is marked `visualModelVersion === 3` and is not held in a legacy state.
 * Absent markers → legacy (Article Studio 2.0).
 */
export function isVisualV3(asset: VisualMarkers): boolean {
  const state = asset.visualState;
  // An explicit lifecycle state is authoritative over the numeric version so a
  // legacy asset flagged `needsVisualUpgrade` is not treated as v3 before the
  // author actually starts the upgrade, and an `upgrading` asset is v3 even if
  // its version marker was never written.
  if (state === "upgrading" || state === "current") return true;
  if (state === "legacy" || state === "needsVisualUpgrade") return false;
  return asset.visualModelVersion === 3;
}

export type ArticleVisualPolicy = "v3" | "legacy";

/** The publishing policy that governs this asset's hook requirements. */
export function articleVisualPolicy(asset: VisualMarkers): ArticleVisualPolicy {
  return isVisualV3(asset) ? "v3" : "legacy";
}

/** A legacy asset eligible for — but not yet started on — the 3.0 visual upgrade. */
export function needsVisualUpgrade(asset: VisualMarkers): boolean {
  return asset.visualState === "needsVisualUpgrade";
}

// ---------------------------------------------------------------------------
// P1.2H — read-time backfill + upgrade transition + visual completeness
// ---------------------------------------------------------------------------

export type EffectiveVisualState = "current" | "upgrading" | "needsVisualUpgrade" | "legacy";

/**
 * READ-TIME visualState coercion (spec §8 — no migration, never persisted
 * silently): an explicit state always wins; a v3-marked asset is `current`;
 * a pre-P1.2 ARTICLE-LIKE asset with no marker is surfaced as
 * `needsVisualUpgrade` — a UI prompt only. Publishing policy is untouched:
 * `articleVisualPolicy` still reads the explicit markers, so a legacy article
 * is NEVER retroactively blocked by this coercion.
 */
export function effectiveVisualState(
  asset: VisualMarkers & Pick<ContentAsset, "assetType">,
): EffectiveVisualState {
  if (asset.visualState === "current" || asset.visualState === "upgrading") {
    return asset.visualState;
  }
  if (asset.visualState === "needsVisualUpgrade" || asset.visualState === "legacy") {
    return asset.visualState;
  }
  if (asset.visualModelVersion === 3) return "current";
  return isArticleLikeAssetType(asset.assetType) ? "needsVisualUpgrade" : "legacy";
}

/**
 * The explicit, forward-only upgrade opt-in (D-AS3-5): from here on the asset
 * is held to the v3 rules. Pure — the caller persists via the ordinary Save.
 */
export function beginVisualUpgrade<T extends VisualMarkers>(asset: T): T {
  return { ...asset, visualState: "upgrading", visualModelVersion: 3 as const };
}

export interface VisualCompleteness {
  /** 0-100 — how much of the 3.0 visual composition is in place. */
  score: number;
  /** Keys of the missing pieces (i18n: `visual.missing.<key>`). */
  missing: string[];
}

/**
 * Deterministic visual-completeness score (spec §P1.2H "scoring reflects
 * visual completeness") — advisory only, never a gate. Weights: approved hook
 * 30, active featured image 30, every publishable inline image placed 25,
 * some inline imagery at all 15.
 */
export function visualCompleteness(
  asset: Pick<ContentAsset, "hook" | "featuredImage" | "images">,
): VisualCompleteness {
  const missing: string[] = [];
  let score = 0;
  if (asset.hook?.approval === "approved") score += 30;
  else missing.push("hook");
  if (featuredImageActive(asset)) score += 30;
  else missing.push("featured");
  const inline = (asset.images ?? []).filter(
    (i) => i.placement !== "featured" && i.status === "accepted",
  );
  if (inline.length > 0) {
    score += 15;
    if (inline.every((i) => Boolean(i.anchor))) score += 25;
    else missing.push("placement");
  } else {
    missing.push("images");
  }
  return { score, missing };
}
