import { describe, expect, it } from "vitest";
import { taskContinuityCopy } from "./task-continuity";
import { UI_LANGUAGE_CODES } from "./catalogs";
import { translate } from "./translate";

const keys = Object.keys(taskContinuityCopy.en).sort();
const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();

describe("taskContinuity copy", () => {
  it("is its own namespace of exactly the five CG-02A messages", () => {
    expect(keys).toEqual([
      "taskContinuity.backToTask",
      "taskContinuity.planArchived",
      "taskContinuity.planUnavailable",
      "taskContinuity.saveFirst",
      "taskContinuity.showArchived",
    ]);
  });

  it.each(UI_LANGUAGE_CODES)("%s is complete, non-empty and placeholder-free", (locale) => {
    const copy = taskContinuityCopy[locale] as Record<string, string>;
    expect(Object.keys(copy).sort()).toEqual(keys);
    for (const key of keys) {
      expect(copy[key].trim(), `${locale}:${key}`).not.toBe("");
      expect(placeholders(copy[key]), `${locale}:${key}`).toEqual([]);
    }
  });

  it.each(["pl", "sv", "da"] as const)("%s is authored, not copied English", (locale) => {
    const copied = keys.filter(
      (key) =>
        (taskContinuityCopy[locale] as Record<string, string>)[key] ===
        taskContinuityCopy.en[key as keyof typeof taskContinuityCopy.en],
    );
    expect(copied).toEqual([]);
  });

  it.each(UI_LANGUAGE_CODES)("%s is served by the central translator", (locale) => {
    for (const key of keys)
      expect(translate(locale, key)).toBe(
        (taskContinuityCopy[locale] as Record<string, string>)[key],
      );
  });

  it.each(UI_LANGUAGE_CODES)(
    "%s keeps the secondary link short and states that nothing else was selected",
    (locale) => {
      const copy = taskContinuityCopy[locale] as Record<string, string>;
      expect(copy["taskContinuity.backToTask"].length).toBeLessThanOrEqual(30);
      expect(copy["taskContinuity.showArchived"].length).toBeLessThanOrEqual(30);
      // Both notices end with the same "no other task was selected" sentence in every language.
      const tail = (key: string) => copy[key].split(". ").at(-1);
      expect(tail("taskContinuity.planArchived")).toBe(tail("taskContinuity.planUnavailable"));
    },
  );
});
