import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { IT_STAGED_BATCHES, IT_STAGED_CATALOG } from "./it";
const tokens = (value: string, pattern: RegExp) =>
  [...value.matchAll(pattern)].map((match) => match[0]).sort();
it.each(IT_STAGED_BATCHES)(
  "Italian $name preserves current source keys, placeholders and fixed values",
  (batch) => {
    const namespaces = new Set<string>(batch.namespaces);
    const source = Object.fromEntries(
      Object.entries(UI_CATALOGS.en).filter(([key]) => namespaces.has(key.split(".")[0])),
    );
    expect(Object.keys(batch.copy).sort()).toEqual(Object.keys(source).sort());
    const hash = createHash("sha256")
      .update(
        JSON.stringify(
          Object.keys(source)
            .sort()
            .map((key) => [key, source[key]]),
        ),
      )
      .digest("hex");
    expect(hash, "Review actual English changes before updating the source fingerprint").toBe(
      batch.sourceHash,
    );
    for (const [key, value] of Object.entries(batch.copy)) {
      expect(value.trim(), key).not.toBe("");
      for (const pattern of [/\{[a-zA-Z][\w]*\}/g, /\b\d+(?:\.\d+)?\b/g, /https?:\/\/[^\s"<>]+/g])
        expect(tokens(value, pattern), key).toEqual(tokens(source[key], pattern));
    }
  },
);
it("keeps incomplete Italian isolated and keys uniquely owned", () => {
  const keys = IT_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(keys.length).toBe(new Set(keys).size);
  expect(Object.keys(IT_STAGED_CATALOG).sort()).toEqual(keys.sort());
  expect(isUiLanguage("it")).toBe(false);
  expect(Object.hasOwn(UI_CATALOGS, "it")).toBe(false);
});
