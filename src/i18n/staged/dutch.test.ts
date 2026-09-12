import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { NL_STAGED_BATCHES, NL_STAGED_CATALOG } from "./nl";

const tokens = (value: string, pattern: RegExp) =>
  [...value.matchAll(pattern)].map((match) => match[0]).sort();
it.each(NL_STAGED_BATCHES)("Dutch $name matches reviewed source and parameters", (batch) => {
  const namespaces = new Set<string>(batch.namespaces);
  const source = Object.fromEntries(
    Object.entries(UI_CATALOGS.en).filter(([key]) => namespaces.has(key.split(".")[0])),
  );
  expect(Object.keys(batch.copy).sort()).toEqual(Object.keys(source).sort());
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        Object.keys(source)
          .sort()
          .map((key) => [key, source[key]]),
      ),
    )
    .digest("hex");
  expect(fingerprint, "Review English changes before updating the source fingerprint").toBe(
    batch.sourceHash,
  );
  for (const [key, value] of Object.entries(batch.copy)) {
    expect(value.trim(), key).not.toBe("");
    for (const pattern of [
      /\{[a-zA-Z][\w]*\}/g,
      /\b\d+(?:\.\d+)?(?=\b|(?:st|nd|rd|th)\b)/g,
      /https?:\/\/[^\s"<>]+/g,
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
    ])
      expect(tokens(value, pattern), key).toEqual(tokens(source[key], pattern));
  }
});
it("keeps partially authored Dutch outside runtime and assigns each key once", () => {
  expect(isUiLanguage("nl")).toBe(false);
  expect(Object.keys(UI_CATALOGS)).not.toContain("nl");
  const keys = NL_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(new Set(keys).size).toBe(keys.length);
  expect(Object.keys(NL_STAGED_CATALOG).sort()).toEqual(keys.sort());
  expect(keys).toHaveLength(2971);
  expect(keys.length).toBeLessThan(Object.keys(UI_CATALOGS.en).length);
  expect(Object.isFrozen(NL_STAGED_CATALOG)).toBe(true);
});
