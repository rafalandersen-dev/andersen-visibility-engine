import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { isUiLanguage, UI_CATALOGS } from "../catalogs";
import { ES_STAGED_BATCHES, ES_STAGED_CATALOG } from "./es";
import { euEmailCopy } from "../email-copy-eu";

const placeholders = (value: string) =>
  [...value.matchAll(/\{[a-zA-Z][\w]*\}/g)].map((m) => m[0]).sort();

it.each(ES_STAGED_BATCHES)(
  "Spanish $name retains source keys, interpolation and reviewed English revision",
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
    expect(
      hash,
      "English changed: reconcile this staged batch before updating its reviewed hash",
    ).toBe(batch.sourceHash);
    for (const [key, value] of Object.entries(batch.copy)) {
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(source[key]));
    }
  },
);
it("keeps staged Spanish unique and unavailable in the runtime while authoring remains incomplete", () => {
  const keys = ES_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(keys.length).toBe(new Set(keys).size);
  expect(Object.keys(ES_STAGED_CATALOG).sort()).toEqual([...keys].sort());
  expect(isUiLanguage("es")).toBe(false);
  expect(Object.hasOwn(UI_CATALOGS, "es")).toBe(false);
});

it("keeps Spanish collaborator roles consistent with existing invitation emails", () => {
  for (const role of ["viewer", "editor", "reviewer"] as const) {
    expect(ES_STAGED_CATALOG[`collaboration.${role}`]).toBe(euEmailCopy.es.invitation.roles[role]);
  }
});
