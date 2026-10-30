import { taskContinuityCopy } from "../task-continuity";

/**
 * Staged-only completion of the `taskContinuity` namespace (CG-02A).
 *
 * WHAT THIS IS. Task continuity added one new runtime namespace with proper
 * English, Polish, Swedish and Danish text. The twenty staged locales are
 * composed solely from their batch copies, and each must still cover every
 * current English interface key. This batch resolves exactly the
 * `taskContinuity` keys to their **reviewed English source values**,
 * explicitly as fallback pending translation and interface acceptance.
 *
 * WHAT IT IS NOT. It translates nothing and certifies no translation, review or
 * readiness. It is not a general fallback: it contains only `taskContinuity`
 * keys, so every other namespace still fails loudly if it drifts from English.
 * No existing staged value or source fingerprint changes, the four runtime
 * catalogs are untouched, and no staged locale enters the runtime registry.
 */
export const STAGED_TASK_CONTINUITY_FALLBACK_NOTE =
  "taskContinuity messages added by CG-02A resolve to reviewed English source as fallback, " +
  "pending translation and interface acceptance.";

/** Reviewed English `taskContinuity` source fingerprint; recomputed by the staged suites. */
export const STAGED_TASK_CONTINUITY_SOURCE_HASH =
  "fd3a25a34d308303f2ab3bbce390008a3b7440fa83e29a05507fe265b7fd66da";

/** The one staged batch: a frozen null-prototype copy of the English source. */
export function stagedTaskContinuity(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, string>, taskContinuityCopy.en),
  );
}
