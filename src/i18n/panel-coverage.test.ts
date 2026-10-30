import { describe, expect, it } from "vitest";
import { panelCoverageCopy } from "./panel-coverage";
import { answerEvidenceCopy } from "./answer-evidence";
import { UI_LANGUAGE_CODES } from "./catalogs";
import { translate } from "./translate";

const keys = Object.keys(panelCoverageCopy.en).sort();
const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();

describe("panelCoverage copy", () => {
  it("is its own namespace of the 30 CG-03B messages", () => {
    expect(keys).toHaveLength(30);
    for (const key of keys) expect(key.startsWith("panelCoverage.")).toBe(true);
    for (const key of Object.keys(answerEvidenceCopy.en))
      expect(key in panelCoverageCopy.en).toBe(false);
  });

  it.each(UI_LANGUAGE_CODES)("%s is complete, non-empty and keeps placeholders", (locale) => {
    const copy = panelCoverageCopy[locale] as Record<string, string>;
    expect(Object.keys(copy).sort()).toEqual(keys);
    for (const key of keys) {
      expect(copy[key].trim(), `${locale}:${key}`).not.toBe("");
      expect(placeholders(copy[key]), `${locale}:${key}`).toEqual(
        placeholders(panelCoverageCopy.en[key as keyof typeof panelCoverageCopy.en]),
      );
    }
  });

  it.each(["pl", "sv", "da"] as const)("%s is authored, not copied English", (locale) => {
    const copied = keys.filter(
      (key) =>
        (panelCoverageCopy[locale] as Record<string, string>)[key] ===
        panelCoverageCopy.en[key as keyof typeof panelCoverageCopy.en],
    );
    expect(copied).toEqual([]);
  });

  it.each(UI_LANGUAGE_CODES)("%s is served by the central translator", (locale) => {
    for (const key of keys)
      expect(translate(locale, key)).toBe(
        (panelCoverageCopy[locale] as Record<string, string>)[key],
      );
    const observed = translate(locale, "panelCoverage.observed", { observed: 3, planned: 40 });
    expect(observed).toContain("3");
    expect(observed).toContain("40");
  });

  it.each(UI_LANGUAGE_CODES)(
    "%s labels never-recorded observations consistently and apart from deleted ones",
    (locale) => {
      const copy = panelCoverageCopy[locale] as Record<string, string>;
      const label = (key: string) => copy[key].slice(0, copy[key].lastIndexOf(":"));
      expect(label("panelCoverage.neverObserved")).toBe(
        label("panelCoverage.neverObservedUnknown"),
      );
      expect(label("panelCoverage.neverObserved")).not.toBe(label("panelCoverage.erased"));
      expect(copy["panelCoverage.neverObservedUnknown"]).not.toContain("{count}");
    },
  );

  it("English says 'not recorded yet' and excludes deleted observations", () => {
    expect(panelCoverageCopy.en["panelCoverage.neverObserved"]).toMatch(/not recorded yet/);
    expect(panelCoverageCopy.en["panelCoverage.neverObserved"]).toMatch(
      /deleted ones not included/,
    );
    expect(panelCoverageCopy.en["panelCoverage.neverObserved"]).not.toMatch(/no saved evidence/);
  });

  it.each(UI_LANGUAGE_CODES)("%s states no percentage and no money amount", (locale) => {
    for (const value of Object.values(panelCoverageCopy[locale] as Record<string, string>)) {
      expect(value).not.toMatch(/%|\$|USD|EUR|PLN|SEK|DKK/);
    }
  });
});
