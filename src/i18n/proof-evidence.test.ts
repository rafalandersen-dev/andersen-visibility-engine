import { describe, it, expect } from "vitest";
import { proofEvidence } from "./proof-evidence";
import { specialistTeam } from "./specialist-team";
describe("proof and team locale coverage", () => {
  for (const dictionary of [proofEvidence, specialistTeam])
    it("keeps all four locales complete", () => {
      const keys = Object.keys(dictionary.en).sort();
      for (const locale of ["pl", "sv", "da"]) {
        expect(Object.keys(dictionary[locale]).sort()).toEqual(keys);
        for (const key of keys) {
          expect(dictionary[locale][key].trim()).not.toBe("");
          expect(dictionary[locale][key].match(/\{\w+\}/g)?.sort()).toEqual(
            dictionary.en[key].match(/\{\w+\}/g)?.sort(),
          );
        }
      }
    });
});
