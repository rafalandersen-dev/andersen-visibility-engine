import { manualCaptureCopy } from "../manual-capture";

/**
 * Staged-only completion of the `manualCapture` namespace (CG-03C).
 *
 * WHAT THIS IS. Manual capture added one new runtime namespace with proper
 * English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `manualCapture` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `manualCapture`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_MANUAL_CAPTURE_FALLBACK_NOTE =
  "manualCapture messages added by CG-03C resolve to reviewed English source as fallback, " +
  "pending translation and interface acceptance.";

/** Reviewed English `manualCapture` source fingerprint; recomputed by the staged suites. */
export const STAGED_MANUAL_CAPTURE_SOURCE_HASH =
  "074e44c7182f14f5be3ee5bcb1de232634cedb87695c16a67b9226ba383c5774";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedManualCapture(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, manualCaptureCopy.en),
  );
}
