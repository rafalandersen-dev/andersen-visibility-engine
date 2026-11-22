import { aiEvaluationAccessCopy } from "../ai-evaluation-access";

/**
 * Staged-only completion of the `aiEvalAccess` namespace (AI Evaluation Pro/Agency access).
 *
 * WHAT THIS IS. AI Evaluation access added one new runtime namespace with proper
 * English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `aiEvalAccess` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `aiEvalAccess`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_AI_EVAL_ACCESS_FALLBACK_NOTE =
  "aiEvalAccess messages added by the AI Evaluation access gate resolve to reviewed English source " +
  "as fallback, pending translation and interface acceptance.";

/** Reviewed English `aiEvalAccess` source fingerprint; recomputed by the staged suites.
 * `DE_AUTHORING_SOURCE_HASHES["ai evaluation access"]` must match. */
export const STAGED_AI_EVAL_ACCESS_SOURCE_HASH =
  "658ca0828e313ff7f58bf91632ea803209c77ec5a5263a9cfbe1911a25a228ce";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedAiEvalAccess(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, aiEvaluationAccessCopy.en),
  );
}
