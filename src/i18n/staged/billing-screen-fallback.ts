import { billingScreenCopy } from "../billing-screen";

/**
 * Staged-only completion of the `billingScreen` namespace.
 *
 * WHAT THIS IS. The twenty staged locales were authored against an earlier
 * billing screen that had 54 messages. The R21 billing work added 126 more to
 * the reviewed English source, and none of them have been translated. Every
 * staged catalog is composed solely from its batch copies, so the gap shows up
 * twice per language: the billing batch misses keys its namespace declares,
 * and the complete staged catalog misses them too.
 *
 * WHAT IT IS NOT. This does not translate anything and does not certify
 * translation completeness, interface review or readiness. The 126 added
 * messages resolve to their **reviewed English source values**, explicitly as
 * fallback pending translation and interface acceptance. The existing
 * translated values always win — a locale that has a key keeps its own text,
 * byte for byte.
 *
 * It is also deliberately NOT a general whole-catalog fallback. It is applied
 * only to the twenty staged billing batches, so every other namespace still
 * fails loudly if it ever drifts from the English source. The four runtime
 * catalogs (`en`, `pl`, `sv`, `da`) are untouched and none of these locales is
 * enrolled in the runtime language registry.
 */
export const STAGED_BILLING_FALLBACK_NOTE =
  "126 billing screen messages added by R21 resolve to reviewed English source as fallback, " +
  "pending translation and interface acceptance. Existing staged translations are preserved.";

/** The reviewed English source head these fallback values were taken from. */
export const STAGED_BILLING_FALLBACK_SOURCE = "5804ec62b92d2a2d957a7b3fb536b7c5225ff128";

/**
 * Compose one staged billing dictionary: reviewed English source first, the
 * locale's existing translations second, so a present local value always
 * overrides the English one.
 *
 * Neither input is mutated. The result is a frozen null-prototype dictionary,
 * matching how every staged catalog is assembled.
 */
export function stagedBillingScreen(
  translated: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, billingScreenCopy.en, translated),
  );
}
