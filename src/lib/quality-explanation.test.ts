import { describe, expect, it } from "vitest";
import { classifyCategoryExplanation } from "./quality-explanation";
import {
  EVALUATOR_NOTE_SEPARATOR,
  NO_EXPLANATION_RETURNED,
  UNASSESSED_EXPLANATION,
  normalizeQualityScore,
} from "./quality";

describe("category explanation display classification", () => {
  it("recognizes the exact whole system fallback", () => {
    expect(classifyCategoryExplanation(UNASSESSED_EXPLANATION)).toEqual({
      kind: "unassessed",
      note: null,
    });
  });
  it("splits fallback + bounded model note, keeping the note verbatim", () => {
    const note = "Looks fine to me, honestly.";
    expect(
      classifyCategoryExplanation(UNASSESSED_EXPLANATION + EVALUATOR_NOTE_SEPARATOR + note),
    ).toEqual({
      kind: "unassessed",
      note,
    });
  });
  it("recognizes the exact no-explanation fallback", () => {
    expect(classifyCategoryExplanation(NO_EXPLANATION_RETURNED)).toEqual({ kind: "noExplanation" });
  });
  it.each([
    "The draft guarantees results; remove the claim.",
    "Not assessed by the reviewer yet, but looks fine.",
    "Evaluator note: this is a real model sentence.",
    UNASSESSED_EXPLANATION.slice(0, -1),
    UNASSESSED_EXPLANATION + " extra words without the separator",
    NO_EXPLANATION_RETURNED + " Really.",
    "",
  ])("leaves model or merely similar text unchanged: %j", (text) => {
    expect(classifyCategoryExplanation(text)).toEqual({ kind: "model", text });
  });
  it("matches what the normalizer actually stores for unassessed, noted and valid categories", () => {
    const score = normalizeQualityScore(
      {
        categories: {
          structure: { score: 80, explanation: "Clear headings." },
          searchReadiness: { score: 80 },
          trustSafety: { score: "n/a", explanation: "Seems ok." },
        },
      },
      "2026-09-28T12:00:00.000Z",
    );
    expect(classifyCategoryExplanation(score.categories.structure.explanation)).toEqual({
      kind: "model",
      text: "Clear headings.",
    });
    expect(classifyCategoryExplanation(score.categories.searchReadiness.explanation)).toEqual({
      kind: "noExplanation",
    });
    expect(classifyCategoryExplanation(score.categories.trustSafety.explanation)).toEqual({
      kind: "unassessed",
      note: "Seems ok.",
    });
    expect(classifyCategoryExplanation(score.categories.brandFit.explanation)).toEqual({
      kind: "unassessed",
      note: null,
    });
  });
});
