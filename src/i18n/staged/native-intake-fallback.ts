import { nativeIntakeCopy } from "../native-google-intake";

/**
 * Staged-only completion of the `nativeIntake` namespace (owner-supplied Google AND Bing AI report
 * import; the Bing variant added more keys to the same namespace).
 *
 * WHAT THIS IS. The native intake added one runtime namespace with proper
 * English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `nativeIntake` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `nativeIntake`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_NATIVE_INTAKE_FALLBACK_NOTE =
  "nativeIntake messages added by the native Google intake resolve to reviewed English source as " +
  "fallback, pending translation and interface acceptance.";

/** Reviewed English `nativeIntake` source fingerprint; recomputed by the staged suites. Covers the
 * 100-key Google+Bing English source; `DE_AUTHORING_SOURCE_HASHES["native intake"]` must match. */
export const STAGED_NATIVE_INTAKE_SOURCE_HASH =
  "3a58c957f10ee7ca80c199b41d19da1ad88861b3baba335c3222e5938496abe9";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedNativeIntake(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, nativeIntakeCopy.en),
  );
}
