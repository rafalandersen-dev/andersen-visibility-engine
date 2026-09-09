import { describe, expect, it } from "vitest";
import { generationResults } from "./generation-results";
describe("generation recovery translations", () => {
  it.each(["pl", "sv", "da"] as const)("covers all recovery decisions in %s", (lang) => {
    expect(Object.keys(generationResults[lang]).sort()).toEqual(
      Object.keys(generationResults.en).sort(),
    );
    expect(Object.values(generationResults[lang]).every((v) => v.trim().length > 0)).toBe(true);
  });
});
