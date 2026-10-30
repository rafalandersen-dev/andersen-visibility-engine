import { firstUseCopy } from "../first-use";

/**
 * Staged-only completion of the `conversationStart` namespace (CG-01A).
 *
 * WHAT THIS IS. The first-use conversation added one new runtime namespace with
 * proper English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `conversationStart` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `conversationStart`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_FIRST_USE_FALLBACK_NOTE =
  "conversationStart messages added by CG-01A resolve to reviewed English source as fallback, " +
  "pending translation and interface acceptance.";

/** Reviewed English `conversationStart` source fingerprint; recomputed by the staged suites. */
export const STAGED_FIRST_USE_SOURCE_HASH =
  "5368dd8f7a5fa58cb47c1b78857ed1c14a051b32832cb86feccfe0a00c4829b2";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedFirstUse(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, firstUseCopy.en),
  );
}
