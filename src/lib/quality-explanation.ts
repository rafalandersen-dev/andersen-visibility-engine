/**
 * Display classification of a stored category explanation. The normalizer writes exactly two
 * system-generated English fallbacks (`UNASSESSED_EXPLANATION`, optionally followed by
 * `EVALUATOR_NOTE_SEPARATOR` + a bounded model note, and `NO_EXPLANATION_RETURNED`). The UI renders
 * the system part through i18n and keeps any model-authored note verbatim as distinct text.
 * Recognition is exact (whole string or exact prefix); arbitrary model text is never rewritten.
 */
import {
  EVALUATOR_NOTE_SEPARATOR,
  NO_EXPLANATION_RETURNED,
  UNASSESSED_EXPLANATION,
} from "./quality";

export type CategoryExplanationView =
  | { kind: "unassessed"; note: string | null }
  | { kind: "noExplanation" }
  | { kind: "model"; text: string };

export function classifyCategoryExplanation(explanation: string): CategoryExplanationView {
  if (explanation === UNASSESSED_EXPLANATION) return { kind: "unassessed", note: null };
  const prefix = UNASSESSED_EXPLANATION + EVALUATOR_NOTE_SEPARATOR;
  if (explanation.startsWith(prefix)) {
    const note = explanation.slice(prefix.length);
    return { kind: "unassessed", note: note.length ? note : null };
  }
  if (explanation === NO_EXPLANATION_RETURNED) return { kind: "noExplanation" };
  return { kind: "model", text: explanation };
}
