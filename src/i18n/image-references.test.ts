import { expect, it } from "vitest";
import { imageReferencesCopy } from "./image-references";
it("keeps all reference controls and interpolation values available in each supported locale", () => {
  const keys = Object.keys(imageReferencesCopy.en).sort();
  for (const dictionary of Object.values(imageReferencesCopy)) {
    expect(Object.keys(dictionary).sort()).toEqual(keys);
    for (const key of keys) {
      expect(dictionary[key].trim().length).toBeGreaterThan(0);
      expect((dictionary[key].match(/\{[a-z]+\}/g) ?? []).sort()).toEqual(
        (imageReferencesCopy.en[key].match(/\{[a-z]+\}/g) ?? []).sort(),
      );
    }
  }
});
