import { createHash } from "node:crypto";
import { DE_AUTHORING_SOURCE_HASHES } from "./de-source";
import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { DE_STAGED_BATCHES, DE_STAGED_CATALOG } from "./de";

const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();
const numbers = (text: string) =>
  (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
const targets = (text: string) =>
  (text.match(/https?:\/\/\S*|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []).sort();

it.each(DE_STAGED_BATCHES)(
  "German $name fully covers its authored namespaces with intact parameters and values",
  (batch) => {
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
    expect(
      fingerprint,
      "English copy changed; review the German translation before updating its source fingerprint",
    ).toBe(DE_AUTHORING_SOURCE_HASHES[batch.name]);
    for (const [key, text] of Object.entries(batch.copy)) {
      expect(text.trim(), key).not.toBe("");
      expect(placeholders(text), key).toEqual(placeholders(source[key]));
      expect(numbers(text), key).toEqual(numbers(source[key]));
      expect(targets(text), key).toEqual(targets(source[key]));
    }
  },
);

it("keeps German unavailable and every authored key in one batch", () => {
  expect(isUiLanguage("de")).toBe(false);
  const keys = DE_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(keys.length).toBe(new Set(keys).size);
  expect(Object.keys(DE_STAGED_CATALOG).sort()).toEqual(keys.sort());
});

it("distinguishes planned work, scheduled publication, delivery and live publication", () => {
  const labels = ["planned", "armed", "sent", "live"].map(
    (stage) => DE_STAGED_CATALOG[`pipeline.stage.${stage}`],
  );
  expect(new Set(labels).size).toBe(4);
});
