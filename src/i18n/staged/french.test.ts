import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { euEmailCopy } from "../email-copy-eu";
import { FR_STAGED_BATCHES, FR_STAGED_CATALOG } from "./fr";

const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();
it.each(FR_STAGED_BATCHES)(
  "French $name covers every current message in its product areas",
  (batch) => {
    const namespaces = new Set<string>(batch.namespaces);
    const source = Object.fromEntries(
      Object.entries(UI_CATALOGS.en).filter(([key]) => namespaces.has(key.split(".")[0])),
    );
    expect(Object.keys(batch.copy).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(batch.copy)) {
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(source[key]));
    }
  },
);
it("keeps each French key in one authoring batch", () => {
  const keys = FR_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(keys.length).toBe(new Set(keys).size);
  expect(Object.keys(FR_STAGED_CATALOG).sort()).toEqual([...keys].sort());
});
it("keeps incomplete French copy unavailable as an interface language", () => {
  expect(isUiLanguage("fr")).toBe(false);
  expect(Object.keys(FR_STAGED_CATALOG).length).toBeLessThan(Object.keys(UI_CATALOGS.en).length);
});
it("distinguishes planned, scheduled, sent and published work", () => {
  const labels = ["planned", "armed", "sent", "live"].map(
    (stage) => FR_STAGED_CATALOG[`pipeline.stage.${stage}`],
  );
  expect(new Set(labels).size).toBe(4);
});
it("distinguishes draft delivery from public publishing and failed delivery", () => {
  const labels = ["notSent", "sent", "notPublished", "published", "failed", "liveFailed"].map(
    (state) => FR_STAGED_CATALOG[`editor.publish.${state}`],
  );
  expect(new Set(labels).size).toBe(6);
});
it("distinguishes email preparation, provider acceptance and unknown delivery", () => {
  const labels = ["pending", "leased", "sending", "accepted", "unknown", "cancelled", "failed"].map(
    (state) => FR_STAGED_CATALOG[`notifications.emailStatus.${state}`],
  );
  expect(new Set(labels).size).toBe(7);
});
it("uses the same collaborator role labels as the released French invitation", () => {
  for (const role of ["viewer", "editor", "reviewer"] as const)
    expect(FR_STAGED_CATALOG[`collaboration.${role}`]).toBe(euEmailCopy.fr.invitation.roles[role]);
});
