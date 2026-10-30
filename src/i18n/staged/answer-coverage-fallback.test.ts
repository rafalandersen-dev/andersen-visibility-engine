/**
 * The staged `answerCoverage` completion, proved against the ACTUAL twenty
 * staged aggregators rather than against the helper in isolation.
 *
 * What has to hold: every staged locale carries exactly one "answer coverage"
 * batch holding exactly the 20 `answerCoverage` keys at their reviewed English
 * values; the batch has no key from another namespace; the recorded source
 * fingerprint is recomputed here; no other batch declares the namespace; and
 * nothing moves a staged locale into the runtime.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UI_CATALOGS, UI_LANGUAGE_CODES, isUiLanguage } from "../catalogs";
import { answerCoverageCopy } from "../answer-coverage";
import {
  STAGED_ANSWER_COVERAGE_SOURCE_HASH,
  stagedAnswerCoverage,
} from "./answer-coverage-fallback";
import { DE_AUTHORING_SOURCE_HASHES } from "./de-source";

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
const LOCALES: readonly (readonly [string, readonly StagedBatch[], Dict])[] = [
  ["bg", BG_STAGED_BATCHES, BG_STAGED_CATALOG],
  ["cs", CS_STAGED_BATCHES, CS_STAGED_CATALOG],
  ["de", DE_STAGED_BATCHES, DE_STAGED_CATALOG],
  ["el", EL_STAGED_BATCHES, EL_STAGED_CATALOG],
  ["es", ES_STAGED_BATCHES, ES_STAGED_CATALOG],
  ["et", ET_STAGED_BATCHES, ET_STAGED_CATALOG],
  ["fi", FI_STAGED_BATCHES, FI_STAGED_CATALOG],
  ["fr", FR_STAGED_BATCHES, FR_STAGED_CATALOG],
  ["ga", GA_STAGED_BATCHES, GA_STAGED_CATALOG],
  ["hr", HR_STAGED_BATCHES, HR_STAGED_CATALOG],
  ["hu", HU_STAGED_BATCHES, HU_STAGED_CATALOG],
  ["it", IT_STAGED_BATCHES, IT_STAGED_CATALOG],
  ["lt", LT_STAGED_BATCHES, LT_STAGED_CATALOG],
  ["lv", LV_STAGED_BATCHES, LV_STAGED_CATALOG],
  ["mt", MT_STAGED_BATCHES, MT_STAGED_CATALOG],
  ["nl", NL_STAGED_BATCHES, NL_STAGED_CATALOG],
  ["pt", PT_STAGED_BATCHES, PT_STAGED_CATALOG],
  ["ro", RO_STAGED_BATCHES, RO_STAGED_CATALOG],
  ["sk", SK_STAGED_BATCHES, SK_STAGED_CATALOG],
  ["sl", SL_STAGED_BATCHES, SL_STAGED_CATALOG],
];

/** The oracle every staged suite already uses: the live English catalog. */
const ENGLISH: Dict = Object.fromEntries(
  Object.entries(UI_CATALOGS.en).filter(([key]) => key.split(".")[0] === "answerCoverage"),
);
const ENGLISH_KEYS = Object.keys(ENGLISH).sort();

describe("the staged answer-coverage namespace is complete without inventing translations", () => {
  it("takes its fallback from the reviewed English answer-coverage source itself", () => {
    expect(ENGLISH_KEYS).toHaveLength(20);
    expect(Object.keys(answerCoverageCopy.en).sort()).toEqual(ENGLISH_KEYS);
    for (const key of ENGLISH_KEYS)
      expect(answerCoverageCopy.en[key as keyof typeof answerCoverageCopy.en], key).toBe(
        ENGLISH[key],
      );
  });

  it("records the recomputed reviewed-source fingerprint", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(ENGLISH_KEYS.map((key) => [key, ENGLISH[key]])))
      .digest("hex");
    expect(STAGED_ANSWER_COVERAGE_SOURCE_HASH).toBe(fingerprint);
    expect(DE_AUTHORING_SOURCE_HASHES["answer coverage"]).toBe(fingerprint);
  });

  it.each(LOCALES)(
    "%s has exactly one answer-coverage batch of English fallback",
    (code, batches, catalog) => {
      const matching = batches.filter((batch) => batch.namespaces.includes("answerCoverage"));
      expect(
        matching.map((batch) => batch.name),
        code,
      ).toEqual(["answer coverage"]);
      const [batch] = matching;
      expect(batch.namespaces, code).toEqual(["answerCoverage"]);
      if (batch.sourceHash !== undefined)
        expect(batch.sourceHash, code).toBe(STAGED_ANSWER_COVERAGE_SOURCE_HASH);
      expect(Object.keys(batch.copy).sort(), code).toEqual(ENGLISH_KEYS);
      for (const key of ENGLISH_KEYS) {
        expect(batch.copy[key], `${code} ${key}`).toBe(ENGLISH[key]);
        expect(catalog[key], `${code} ${key}`).toBe(ENGLISH[key]);
      }
      // No other batch carries a answer-coverage key, and the fallback carries nothing else.
      const elsewhere = batches
        .filter((other) => other !== batch)
        .flatMap((other) => Object.keys(other.copy))
        .filter((key) => key.startsWith("answerCoverage."));
      expect(elsewhere, code).toEqual([]);
    },
  );

  it("is frozen, prototype-free and does not mutate the English source", () => {
    const before = { ...answerCoverageCopy.en };
    const composed = stagedAnswerCoverage();
    expect(Object.isFrozen(composed)).toBe(true);
    expect(Object.getPrototypeOf(composed)).toBeNull();
    expect({ ...answerCoverageCopy.en }).toEqual(before);
  });

  it("keeps all twenty locales staged and the runtime registry at four", () => {
    expect(UI_LANGUAGE_CODES).toEqual(["en", "pl", "sv", "da"]);
    expect(Object.keys(UI_CATALOGS).sort()).toEqual(["da", "en", "pl", "sv"]);
    for (const [code] of LOCALES) expect(isUiLanguage(code), code).toBe(false);
    expect(LOCALES).toHaveLength(20);
  });
});
