import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { euEmailCopy } from "../email-copy-eu";
import { RO_STAGED_BATCHES, RO_STAGED_CATALOG } from "./ro";

const numericTokens = /\b\d+(?:\.\d+)?(?=\b|(?:st|nd|rd|th|d)\b)/g;
// Product names and technical terms that are correctly identical in Romanian.
// Keep this list explicit so copied English cannot pass unnoticed.
const properNames = new Set([
  "planScreen.sourceLabel.claude",
  "planScreen.sourceLabel.search_console",
  "editorScreen.field.h1",
  "editorScreen.field.slug",
  "editorScreen.preview.desktop",
  "publicHome.beta",
  "publicBeta.beta",
  "publicBeta.miloGrowthAssistedBeta",
  "collaboration.editor",
  "perf.desktop",
  "analytics.published.cta",
  "analytics.v2.col.score",
  "gsc.title",
  "gsc.col.ctr",
  "publicAudit.signal.h1",
  "launch.conn.brand",
  "launch.conn.gsc",
  "linknet.nofollow",
  "marketplace.demoBadge",
  "answer.api",
  "aiEval.taskType.contentQualityScore",
  "editor.sendModal.slug",
  "quality.title",
  "plan.calendar",
  "brand.title",
  "brand.field.url",
  "wp.wordpress",
  "shopify.shopify",
  "claude.cliHeading",
  "claude.desktopHeading",
]);

const tokens = (value: string, pattern: RegExp) =>
  [...value.matchAll(pattern)].map((match) => match[0]).sort();
it.each(RO_STAGED_BATCHES)("Romanian $name matches reviewed source and parameters", (batch) => {
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
it("keeps staged Romanian outside runtime and assigns each authored key once", () => {
  expect(isUiLanguage("ro")).toBe(false);
  expect(Object.keys(UI_CATALOGS)).not.toContain("ro");
  const keys = RO_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(new Set(keys).size).toBe(keys.length);
  expect(Object.keys(RO_STAGED_CATALOG).sort()).toEqual(keys.sort());
  expect(keys).toHaveLength(3860);
  expect(Object.isFrozen(RO_STAGED_CATALOG)).toBe(true);
});
it("covers the complete current English interface key set", () => {
  expect(Object.keys(RO_STAGED_CATALOG).sort()).toEqual(Object.keys(UI_CATALOGS.en).sort());
});
it("does not copy English text into authored Romanian values", () => {
  const unchanged = Object.entries(RO_STAGED_CATALOG).filter(
    ([key, value]) => value === UI_CATALOGS.en[key] && !properNames.has(key),
  );
  expect(unchanged.map(([key]) => key)).toEqual([]);
  for (const key of properNames) expect(RO_STAGED_CATALOG[key]).toBe(UI_CATALOGS.en[key]);
});
it("keeps Romanian collaborator roles consistent with existing invitation emails", () => {
  for (const role of ["viewer", "editor", "reviewer"] as const)
    expect(RO_STAGED_CATALOG[`collaboration.${role}`]).toBe(euEmailCopy.ro.invitation.roles[role]);
});
