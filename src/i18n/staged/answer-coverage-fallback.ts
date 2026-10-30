import { answerCoverageCopy } from "../answer-coverage";

/**
 * Staged-only completion of the `answerCoverage` namespace (CG-03A).
 *
 * WHAT THIS IS. Answer-evidence domain coverage added one new runtime namespace with proper
 * English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `answerCoverage` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `answerCoverage`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_ANSWER_COVERAGE_FALLBACK_NOTE =
  "answerCoverage messages added by CG-03A resolve to reviewed English source as fallback, " +
  "pending translation and interface acceptance.";

/** Reviewed English `answerCoverage` source fingerprint; recomputed by the staged suites. */
export const STAGED_ANSWER_COVERAGE_SOURCE_HASH =
  "cc2e55ca0586c225e9b468cc135ca04f572772841a0a6583f32bb943c578efa3";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedAnswerCoverage(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, answerCoverageCopy.en),
  );
}
