import { describe, expect, it } from "vitest";
import { projectKnowledge } from "./project-knowledge";
describe("knowledge review translations", () => {
  it.each(["pl", "sv", "da"] as const)(
    "provides the same review actions and placeholders in %s",
    (locale) => {
      expect(Object.keys(projectKnowledge[locale]).sort()).toEqual(
        Object.keys(projectKnowledge.en).sort(),
      );
      for (const [key, english] of Object.entries(projectKnowledge.en)) {
        const translated = (projectKnowledge[locale] as Record<string, string>)[key];
        expect(translated.trim(), key).not.toBe("");
        expect(translated.match(/\{[^}]+\}/g) ?? [], key).toEqual(
          english.match(/\{[^}]+\}/g) ?? [],
        );
      }
    },
  );
});
