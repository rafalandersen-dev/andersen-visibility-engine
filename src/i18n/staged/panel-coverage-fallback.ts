import { panelCoverageCopy } from "../panel-coverage";

/**
 * Staged-only completion of the `panelCoverage` namespace (CG-03B).
 *
 * WHAT THIS IS. Panel coverage added one new runtime namespace with proper
 * English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `panelCoverage` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `panelCoverage`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_PANEL_COVERAGE_FALLBACK_NOTE =
  "panelCoverage messages added by CG-03B resolve to reviewed English source as fallback, " +
  "pending translation and interface acceptance.";

/** Reviewed English `panelCoverage` source fingerprint; recomputed by the staged suites. */
export const STAGED_PANEL_COVERAGE_SOURCE_HASH =
  "a536a3fbc7a2464e33d375e12f6eda30507fcce6d261406c785427a933d4f435";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedPanelCoverage(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, panelCoverageCopy.en),
  );
}
