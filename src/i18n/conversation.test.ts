import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { conversationCopy } from "./conversation";
import { FR_STAGED_BATCHES } from "./staged/fr";
import { DE_STAGED_BATCHES } from "./staged/de";
import { ES_STAGED_BATCHES } from "./staged/es";
import { IT_STAGED_BATCHES } from "./staged/it";
import { PT_STAGED_BATCHES } from "./staged/pt";
import { NL_STAGED_BATCHES } from "./staged/nl";
import { FI_STAGED_BATCHES } from "./staged/fi";
import { CS_STAGED_BATCHES } from "./staged/cs";
import { SK_STAGED_BATCHES } from "./staged/sk";
import { SL_STAGED_BATCHES } from "./staged/sl";
import { HR_STAGED_BATCHES } from "./staged/hr";
import { BG_STAGED_BATCHES } from "./staged/bg";
import { ET_STAGED_BATCHES } from "./staged/et";
import { EL_STAGED_BATCHES } from "./staged/el";
import { HU_STAGED_BATCHES } from "./staged/hu";
import { RO_STAGED_BATCHES } from "./staged/ro";
import { LV_STAGED_BATCHES } from "./staged/lv";
import { LT_STAGED_BATCHES } from "./staged/lt";
import { MT_STAGED_BATCHES } from "./staged/mt";
import { GA_STAGED_BATCHES } from "./staged/ga";
const keys = Object.keys(conversationCopy.en).sort();
const fingerprint = createHash("sha256")
  .update(
    JSON.stringify(
      keys.map((key) => [key, conversationCopy.en[key as keyof typeof conversationCopy.en]]),
    ),
  )
  .digest("hex");
const staged = {
  fr: FR_STAGED_BATCHES,
  de: DE_STAGED_BATCHES,
  es: ES_STAGED_BATCHES,
  it: IT_STAGED_BATCHES,
  pt: PT_STAGED_BATCHES,
  nl: NL_STAGED_BATCHES,
  fi: FI_STAGED_BATCHES,
  cs: CS_STAGED_BATCHES,
  sk: SK_STAGED_BATCHES,
  sl: SL_STAGED_BATCHES,
  hr: HR_STAGED_BATCHES,
  bg: BG_STAGED_BATCHES,
  et: ET_STAGED_BATCHES,
  el: EL_STAGED_BATCHES,
  hu: HU_STAGED_BATCHES,
  ro: RO_STAGED_BATCHES,
  lv: LV_STAGED_BATCHES,
  lt: LT_STAGED_BATCHES,
  mt: MT_STAGED_BATCHES,
  ga: GA_STAGED_BATCHES,
};
it.each(Object.entries(staged))(
  "%s conversation copy retains exact reviewed English source",
  (_locale, batches) => {
    const batch = batches.find((batch) => batch.name === "conversation");
    expect(batch).toBeDefined();
    expect(batch?.sourceHash).toBe(fingerprint);
    expect(Object.keys(batch!.copy).sort()).toEqual(keys);
    for (const key of keys) {
      const translated = (batch!.copy as Record<string, string>)[key];
      const source = conversationCopy.en[key as keyof typeof conversationCopy.en];
      expect(translated.trim()).not.toBe("");
      expect((translated.match(/\{[^{}]+\}/g) ?? []).sort()).toEqual(
        (source.match(/\{[^{}]+\}/g) ?? []).sort(),
      );
    }
  },
);
it.each(Object.entries(conversationCopy))(
  "%s has distinct pending, completed, cancelled and uncertain messages",
  (_locale, copy) => {
    expect(Object.keys(copy).sort()).toEqual(keys);
    expect(
      new Set([
        copy["chat.pending"],
        copy["chat.completed"],
        copy["chat.cancelled"],
        copy["chat.unknown"],
      ]).size,
    ).toBe(4);
  },
);
