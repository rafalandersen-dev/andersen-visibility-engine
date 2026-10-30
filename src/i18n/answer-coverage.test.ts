import { describe, expect, it } from "vitest";
import { answerCoverageCopy } from "./answer-coverage";
import { answerEvidenceCopy } from "./answer-evidence";
import { UI_LANGUAGE_CODES } from "./catalogs";
import { translate } from "./translate";

const keys = Object.keys(answerCoverageCopy.en).sort();
const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();

describe("answerCoverage copy", () => {
  it("is its own namespace of the 20 CG-03A messages and leaves answer.* untouched", () => {
    expect(keys).toHaveLength(20);
    for (const key of keys) expect(key.startsWith("answerCoverage.")).toBe(true);
    for (const key of Object.keys(answerEvidenceCopy.en))
      expect(key in answerCoverageCopy.en).toBe(false);
  });

  it.each(UI_LANGUAGE_CODES)("%s is complete, non-empty and keeps placeholders", (locale) => {
    const copy = answerCoverageCopy[locale] as Record<string, string>;
    expect(Object.keys(copy).sort()).toEqual(keys);
    for (const key of keys) {
      expect(copy[key].trim(), `${locale}:${key}`).not.toBe("");
      expect(placeholders(copy[key]), `${locale}:${key}`).toEqual(
        placeholders(answerCoverageCopy.en[key as keyof typeof answerCoverageCopy.en]),
      );
    }
  });

  it.each(["pl", "sv", "da"] as const)("%s is authored, not copied English", (locale) => {
    const copied = keys.filter(
      (key) =>
        (answerCoverageCopy[locale] as Record<string, string>)[key] ===
        answerCoverageCopy.en[key as keyof typeof answerCoverageCopy.en],
    );
    expect(copied).toEqual([]);
  });

  it.each(UI_LANGUAGE_CODES)("%s is served by the central translator", (locale) => {
    for (const key of keys)
      expect(translate(locale, key)).toBe(
        (answerCoverageCopy[locale] as Record<string, string>)[key],
      );
    expect(translate(locale, "answerCoverage.count", { x: 2, n: 5 })).toContain("2/5");
  });

  it.each(UI_LANGUAGE_CODES)("%s says an empty eligible set is not 0%%", (locale) => {
    expect(
      (answerCoverageCopy[locale] as Record<string, string>)["answerCoverage.noEligible"],
    ).toMatch(/0\s?%/);
  });
});
