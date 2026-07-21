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
import type { ContentAsset } from "./types";

type VisualMarkers = Pick<ContentAsset, "visualModelVersion" | "visualState">;

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
