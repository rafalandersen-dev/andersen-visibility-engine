import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { CS_STAGED_BATCHES, CS_STAGED_CATALOG } from "./cs";

const numericTokens = /\b\d+(?:\.\d+)?(?=\b|(?:st|nd|rd|th|d)\b)/g;

const tokens = (value: string, pattern: RegExp) =>
  [...value.matchAll(pattern)].map((match) => match[0]).sort();
it.each(CS_STAGED_BATCHES)("Czech $name matches reviewed source and parameters", (batch) => {
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
      numericTokens,
      /https?:\/\/[^\s"<>]+/g,
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
    ])
      expect(tokens(value, pattern), key).toEqual(tokens(source[key], pattern));
  }
});
it("keeps staged Czech outside runtime and assigns each key once", () => {
  expect(isUiLanguage("cs")).toBe(false);
  expect(Object.keys(UI_CATALOGS)).not.toContain("cs");
  const keys = CS_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(new Set(keys).size).toBe(keys.length);
  expect(Object.keys(CS_STAGED_CATALOG).sort()).toEqual(keys.sort());
  expect(keys).toHaveLength(4200);
  expect(Object.isFrozen(CS_STAGED_CATALOG)).toBe(true);
});

it("covers every current English key in the completed staged Czech catalog", () => {
  expect(Object.keys(CS_STAGED_CATALOG).sort()).toEqual(Object.keys(UI_CATALOGS.en).sort());
});
