/**
 * P0.2 — the Milo Score component matrix.
 *
 * The bug this pins: the evaluator was never given `faq[]`/`cta`/`internalLinks[]`
 * (they are side-fields that do not publish), yet ~36% of the rubric weight
 * (aiAnswerReadiness .16 + conversion .12 + internalLinks .08) nominally targeted
 * them. A user perfecting those panels earned no score credit, and grading them
 * would award points for UNPUBLISHED information.
 *
 * These tests assert the corrected contract: every scored component grades only
 * content that is part of the canonical (published) evaluated asset.
 */
import { describe, it, expect } from "vitest";
import {
  MILO_SCORE_MATRIX,
  QUALITY_WEIGHTS,
  QUALITY_CATEGORY_KEYS,
  CANONICAL_EVALUATED_FIELDS,
} from "./quality";

describe("Milo Score matrix (P0.2)", () => {
  it("has exactly one row per scored category", () => {
    const matrixKeys = MILO_SCORE_MATRIX.map((c) => c.key).sort();
    expect(matrixKeys).toEqual([...QUALITY_CATEGORY_KEYS].sort());
  });

  it("matrix weights match the authoritative QUALITY_WEIGHTS", () => {
    for (const row of MILO_SCORE_MATRIX) {
      expect(row.weight, row.key).toBe(QUALITY_WEIGHTS[row.key]);
    }
  });

  it("weights sum to 1.0", () => {
    const sum = MILO_SCORE_MATRIX.reduce((s, c) => s + c.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(1);
  });

  it("NO component awards points for unpublished information", () => {
    for (const row of MILO_SCORE_MATRIX) {
      expect(row.gradesPublishedContent, row.key).toBe(true);
    }
  });

  it("the canonical evaluated asset excludes non-publishing side-fields", () => {
    const canonical = new Set<string>(CANONICAL_EVALUATED_FIELDS as readonly string[]);
    // These side-fields do not publish and must never be an evaluator input.
    for (const sideField of ["faq", "cta", "internalLinks", "schemaSuggestions", "outline"]) {
      expect(canonical.has(sideField), sideField).toBe(false);
    }
    // The fields that DO publish (and are legitimately graded) are present.
    for (const field of ["title", "markdown", "metaDescription"]) {
      expect(canonical.has(field), field).toBe(true);
    }
  });

  it("every component's stated input describes published/body content, not a side-field panel", () => {
    for (const row of MILO_SCORE_MATRIX) {
      // No component may claim to read a separate faq[]/cta/internalLinks[] list.
      expect(row.input).not.toMatch(/\bfaq\[\]|cta field|internalLinks\[\]|side-?field/i);
    }
  });
});
