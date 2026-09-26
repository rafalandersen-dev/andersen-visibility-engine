import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { euEmailCopy } from "../email-copy-eu";
import { GA_STAGED_BATCHES, GA_STAGED_CATALOG } from "./ga";

const numericTokens = /\b\d+(?:\.\d+)?(?=\b|(?:st|nd|rd|th|d)\b)/g;
// Product names and technical terms that are correctly identical in Irish.
// Keep this list explicit so copied English cannot pass unnoticed.
const properNames = new Set<string>([
  "planScreen.sourceLabel.claude",
  "planScreen.sourceLabel.search_console",
  "editorScreen.field.h1",
  "publicBeta.miloGrowthAssistedBeta",
  "analytics.published.cta",
  "analytics.v2.col.score",
  "gsc.title",
  "gsc.col.ctr",
  "publicAudit.signal.h1",
  "authority.title",
  "launch.conn.brand",
  "launch.conn.gsc",
  "linknet.nofollow",
  "aiEval.taskType.contentQualityScore",
  "answer.api",
  "quality.title",
  "brand.title",
  "brand.field.url",
  "wp.wordpress",
  "shopify.shopify",
  "claude.cliHeading",
  "claude.desktopHeading",
  // "URL" is the standard technical label in Irish too (P4 citation review, 2026-09-26).
  "citationReview.evidence.url",
]);

const tokens = (value: string, pattern: RegExp) =>
  [...value.matchAll(pattern)].map((match) => match[0]).sort();
it.each(GA_STAGED_BATCHES)("Irish $name matches reviewed source and parameters", (batch) => {
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
it("keeps staged Irish outside runtime and assigns each authored key once", () => {
  expect(isUiLanguage("ga")).toBe(false);
  expect(Object.keys(UI_CATALOGS)).not.toContain("ga");
  const keys = GA_STAGED_BATCHES.flatMap((batch) => Object.keys(batch.copy));
  expect(new Set(keys).size).toBe(keys.length);
  expect(Object.keys(GA_STAGED_CATALOG).sort()).toEqual(keys.sort());
  expect(keys).toHaveLength(4200);
  expect(Object.isFrozen(GA_STAGED_CATALOG)).toBe(true);
});
it("covers the complete current English interface key set", () => {
  expect(Object.keys(GA_STAGED_CATALOG).sort()).toEqual(Object.keys(UI_CATALOGS.en).sort());
});
it("does not copy English text into authored Irish values", () => {
  const unchanged = Object.entries(GA_STAGED_CATALOG).filter(
    ([key, value]) => value === UI_CATALOGS.en[key] && !properNames.has(key),
  );
  expect(unchanged.map(([key]) => key)).toEqual([]);
  for (const key of properNames) expect(GA_STAGED_CATALOG[key]).toBe(UI_CATALOGS.en[key]);
});
it("keeps Irish collaborator roles consistent with existing invitation emails", () => {
  for (const role of ["viewer", "editor", "reviewer"] as const)
    expect(GA_STAGED_CATALOG[`collaboration.${role}`]).toBe(euEmailCopy.ga.invitation.roles[role]);
});
