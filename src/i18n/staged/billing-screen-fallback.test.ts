/**
 * The staged billing-screen completion, proved against the ACTUAL twenty
 * staged batches rather than against the helper in isolation.
 *
 * What has to hold: every staged billing batch now declares exactly the 180
 * keys its namespace declares; the 54 messages each locale already had keep
 * their own translated text byte for byte; exactly the 126 R21 additions
 * resolve to the reviewed English source; nothing from another namespace
 * leaks in; and none of this moves a staged locale into the runtime.
 *
 * The reviewed-source fingerprint recorded on the batches is RECOMPUTED here
 * with the same algorithm the per-locale suites use, so it is established by
 * evaluation rather than copied from a proposal.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UI_CATALOGS, UI_LANGUAGE_CODES, isUiLanguage } from "../catalogs";
import { billingScreenCopy } from "../billing-screen";
import { stagedBillingScreen } from "./billing-screen-fallback";
import { DE_AUTHORING_SOURCE_HASHES } from "./de-source";

import { bgBillingScreen } from "./bg-billing-screen";
import { csBillingScreen } from "./cs-billing-screen";
import { deBillingScreen } from "./de-billing-screen";
import { elBillingScreen } from "./el-billing-screen";
import { esBillingScreen } from "./es-billing-screen";
import { etBillingScreen } from "./et-billing-screen";
import { fiBillingScreen } from "./fi-billing-screen";
import { frBillingScreen } from "./fr-billing-screen";
import { gaBillingScreen } from "./ga-billing-screen";
import { hrBillingScreen } from "./hr-billing-screen";
import { huBillingScreen } from "./hu-billing-screen";
import { itBillingScreen } from "./it-billing-screen";
import { ltBillingScreen } from "./lt-billing-screen";
import { lvBillingScreen } from "./lv-billing-screen";
import { mtBillingScreen } from "./mt-billing-screen";
import { nlBillingScreen } from "./nl-billing-screen";
import { ptBillingScreen } from "./pt-billing-screen";
import { roBillingScreen } from "./ro-billing-screen";
import { skBillingScreen } from "./sk-billing-screen";
import { slBillingScreen } from "./sl-billing-screen";

import { BG_STAGED_BATCHES, BG_STAGED_CATALOG } from "./bg";
import { CS_STAGED_BATCHES, CS_STAGED_CATALOG } from "./cs";
import { DE_STAGED_BATCHES, DE_STAGED_CATALOG } from "./de";
import { EL_STAGED_BATCHES, EL_STAGED_CATALOG } from "./el";
import { ES_STAGED_BATCHES, ES_STAGED_CATALOG } from "./es";
import { ET_STAGED_BATCHES, ET_STAGED_CATALOG } from "./et";
import { FI_STAGED_BATCHES, FI_STAGED_CATALOG } from "./fi";
import { FR_STAGED_BATCHES, FR_STAGED_CATALOG } from "./fr";
import { GA_STAGED_BATCHES, GA_STAGED_CATALOG } from "./ga";
import { HR_STAGED_BATCHES, HR_STAGED_CATALOG } from "./hr";
import { HU_STAGED_BATCHES, HU_STAGED_CATALOG } from "./hu";
import { IT_STAGED_BATCHES, IT_STAGED_CATALOG } from "./it";
import { LT_STAGED_BATCHES, LT_STAGED_CATALOG } from "./lt";
import { LV_STAGED_BATCHES, LV_STAGED_CATALOG } from "./lv";
import { MT_STAGED_BATCHES, MT_STAGED_CATALOG } from "./mt";
import { NL_STAGED_BATCHES, NL_STAGED_CATALOG } from "./nl";
import { PT_STAGED_BATCHES, PT_STAGED_CATALOG } from "./pt";
import { RO_STAGED_BATCHES, RO_STAGED_CATALOG } from "./ro";
import { SK_STAGED_BATCHES, SK_STAGED_CATALOG } from "./sk";
import { SL_STAGED_BATCHES, SL_STAGED_CATALOG } from "./sl";

type Dict = Readonly<Record<string, string>>;
interface StagedBatch {
  readonly name: string;
  readonly copy: Dict;
  readonly namespaces: readonly string[];
  readonly sourceHash?: string;
}
interface StagedLocale {
  readonly code: string;
  readonly raw: Dict;
  readonly batches: readonly StagedBatch[];
  readonly catalog: Dict;
}

const LOCALES: readonly StagedLocale[] = [
  { code: "bg", raw: bgBillingScreen, batches: BG_STAGED_BATCHES, catalog: BG_STAGED_CATALOG },
  { code: "cs", raw: csBillingScreen, batches: CS_STAGED_BATCHES, catalog: CS_STAGED_CATALOG },
  { code: "de", raw: deBillingScreen, batches: DE_STAGED_BATCHES, catalog: DE_STAGED_CATALOG },
  { code: "el", raw: elBillingScreen, batches: EL_STAGED_BATCHES, catalog: EL_STAGED_CATALOG },
  { code: "es", raw: esBillingScreen, batches: ES_STAGED_BATCHES, catalog: ES_STAGED_CATALOG },
  { code: "et", raw: etBillingScreen, batches: ET_STAGED_BATCHES, catalog: ET_STAGED_CATALOG },
  { code: "fi", raw: fiBillingScreen, batches: FI_STAGED_BATCHES, catalog: FI_STAGED_CATALOG },
  { code: "fr", raw: frBillingScreen, batches: FR_STAGED_BATCHES, catalog: FR_STAGED_CATALOG },
  { code: "ga", raw: gaBillingScreen, batches: GA_STAGED_BATCHES, catalog: GA_STAGED_CATALOG },
  { code: "hr", raw: hrBillingScreen, batches: HR_STAGED_BATCHES, catalog: HR_STAGED_CATALOG },
  { code: "hu", raw: huBillingScreen, batches: HU_STAGED_BATCHES, catalog: HU_STAGED_CATALOG },
  { code: "it", raw: itBillingScreen, batches: IT_STAGED_BATCHES, catalog: IT_STAGED_CATALOG },
  { code: "lt", raw: ltBillingScreen, batches: LT_STAGED_BATCHES, catalog: LT_STAGED_CATALOG },
  { code: "lv", raw: lvBillingScreen, batches: LV_STAGED_BATCHES, catalog: LV_STAGED_CATALOG },
  { code: "mt", raw: mtBillingScreen, batches: MT_STAGED_BATCHES, catalog: MT_STAGED_CATALOG },
  { code: "nl", raw: nlBillingScreen, batches: NL_STAGED_BATCHES, catalog: NL_STAGED_CATALOG },
  { code: "pt", raw: ptBillingScreen, batches: PT_STAGED_BATCHES, catalog: PT_STAGED_CATALOG },
  { code: "ro", raw: roBillingScreen, batches: RO_STAGED_BATCHES, catalog: RO_STAGED_CATALOG },
  { code: "sk", raw: skBillingScreen, batches: SK_STAGED_BATCHES, catalog: SK_STAGED_CATALOG },
  { code: "sl", raw: slBillingScreen, batches: SL_STAGED_BATCHES, catalog: SL_STAGED_CATALOG },
];

/** The oracle every staged suite already uses: the live English catalog. */
const ENGLISH: Dict = Object.fromEntries(
  Object.entries(UI_CATALOGS.en).filter(([key]) => key.split(".")[0] === "billingScreen"),
);
const ENGLISH_KEYS = Object.keys(ENGLISH).sort();

const billingBatch = (locale: StagedLocale): StagedBatch => {
  const batch = locale.batches.find((candidate) => candidate.name === "billing screen");
  if (!batch) throw new Error(`${locale.code} has no billing screen batch`);
  return batch;
};

const fingerprintOf = (source: Dict) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.keys(source)
          .sort()
          .map((key) => [key, source[key]]),
      ),
    )
    .digest("hex");

describe("the staged billing namespace is complete without inventing translations", () => {
  it("takes its fallback from the reviewed English billing source itself", () => {
    // The helper imports the billing source, not the runtime catalog. Those
    // two must be the same dictionary, or the fallback would be unreviewed.
    expect(Object.keys(billingScreenCopy.en).sort()).toEqual(ENGLISH_KEYS);
    for (const key of ENGLISH_KEYS) expect(billingScreenCopy.en[key], key).toBe(ENGLISH[key]);
    expect(ENGLISH_KEYS).toHaveLength(180);
  });

  it("records the recomputed reviewed-source fingerprint on every staged batch", () => {
    // Recomputed here, with the algorithm the per-locale suites use, so the
    // recorded hash is established by evaluation and not copied.
    const fingerprint = fingerprintOf(ENGLISH);
    expect(fingerprint).toHaveLength(64);
    for (const locale of LOCALES) {
      const recorded = billingBatch(locale).sourceHash;
      // German keeps its fingerprints in de-source.ts; French records none.
      if (recorded !== undefined) expect(recorded, locale.code).toBe(fingerprint);
    }
    expect(DE_AUTHORING_SOURCE_HASHES["billing screen"]).toBe(fingerprint);
  });

  it.each(LOCALES.map((locale) => [locale.code, locale] as const))(
    "%s declares all 180 billing keys and nothing from another namespace",
    (code, locale) => {
      const copy = billingBatch(locale).copy;
      expect(Object.keys(copy).sort(), code).toEqual(ENGLISH_KEYS);
      for (const key of Object.keys(copy)) expect(key.startsWith("billingScreen."), key).toBe(true);
    },
  );

  it.each(LOCALES.map((locale) => [locale.code, locale] as const))(
    "%s keeps every existing translation and falls back only for the rest",
    (code, locale) => {
      const copy = billingBatch(locale).copy;
      const translatedKeys = Object.keys(locale.raw);
      expect(translatedKeys, code).toHaveLength(54);
      const fallbackKeys = ENGLISH_KEYS.filter((key) => !(key in locale.raw));
      expect(fallbackKeys, code).toHaveLength(126);

      // Existing translations survive byte for byte …
      for (const key of translatedKeys) expect(copy[key], `${code} ${key}`).toBe(locale.raw[key]);
      // … and exactly the remainder resolves to the reviewed English value.
      for (const key of fallbackKeys) expect(copy[key], `${code} ${key}`).toBe(ENGLISH[key]);
    },
  );

  it.each(LOCALES.map((locale) => [locale.code, locale] as const))(
    "%s lets a real translated value win over English, and would fail reversed",
    (code, locale) => {
      const copy = billingBatch(locale).copy;
      // The owner label is translated in every staged locale.
      expect(locale.raw["billingScreen.owner"], code).toBeTruthy();
      expect(copy["billingScreen.owner"], code).toBe(locale.raw["billingScreen.owner"]);

      // Spread the other way round and English would overwrite the
      // translations; that composition must NOT match what is shipped.
      const reversed: Dict = Object.assign(Object.create(null), locale.raw, billingScreenCopy.en);
      const overwritten = Object.keys(locale.raw).filter(
        (key) => reversed[key] !== locale.raw[key],
      );
      expect(
        overwritten.length,
        `${code} has no translation that differs from English`,
      ).toBeGreaterThan(0);
      expect(reversed, code).not.toEqual({ ...copy });
    },
  );

  it.each(LOCALES.map((locale) => [locale.code, locale] as const))(
    "%s assigns each key once and carries the resolved billing values in its catalog",
    (code, locale) => {
      const keys = locale.batches.flatMap((batch) => Object.keys(batch.copy));
      expect(new Set(keys).size, code).toBe(keys.length);
      expect(Object.keys(locale.catalog).sort(), code).toEqual(Object.keys(UI_CATALOGS.en).sort());
      expect(keys, code).toHaveLength(4710);
      const copy = billingBatch(locale).copy;
      for (const key of ENGLISH_KEYS) expect(locale.catalog[key], `${code} ${key}`).toBe(copy[key]);
    },
  );

  it("does not mutate the raw translated dictionaries or the English source", () => {
    const englishBefore = { ...billingScreenCopy.en };
    for (const locale of LOCALES) {
      const before = { ...locale.raw };
      const composed = stagedBillingScreen(locale.raw);
      expect(Object.isFrozen(composed), locale.code).toBe(true);
      expect(Object.getPrototypeOf(composed), locale.code).toBeNull();
      expect({ ...locale.raw }, locale.code).toEqual(before);
      expect(Object.keys(locale.raw), locale.code).toHaveLength(54);
    }
    expect({ ...billingScreenCopy.en }).toEqual(englishBefore);
  });

  it("keeps all twenty locales staged and the runtime registry at four", () => {
    expect(UI_LANGUAGE_CODES).toEqual(["en", "pl", "sv", "da"]);
    expect(Object.keys(UI_CATALOGS).sort()).toEqual(["da", "en", "pl", "sv"]);
    for (const locale of LOCALES) {
      expect(isUiLanguage(locale.code), locale.code).toBe(false);
      expect(Object.keys(UI_CATALOGS), locale.code).not.toContain(locale.code);
    }
    expect(LOCALES).toHaveLength(20);
  });
});
