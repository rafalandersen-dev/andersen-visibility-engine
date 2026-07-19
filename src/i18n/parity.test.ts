/**
 * Translation parity.
 *
 * The app ships in four languages and a missing key renders as the raw key —
 * "pipeline.stage.armed" in the middle of a Swedish board. That is invisible in
 * English-only development and only surfaces in front of a customer, so it is
 * asserted here rather than hoped for.
 */
import { describe, it, expect } from "vitest";
import { en } from "./en";
import { pl } from "./pl";
import { sv } from "./sv";
import { da } from "./da";
import { PIPELINE_STAGES, nextAction } from "@/lib/pipeline";

const dicts = { pl, sv, da } as const;
const enKeys = Object.keys(en);

describe("every locale covers the English keys", () => {
  it.each(Object.keys(dicts))("%s has no missing keys", (lang) => {
    const dict = dicts[lang as keyof typeof dicts] as Record<string, string>;
    const missing = enKeys.filter((k) => !(k in dict));
    expect(missing).toEqual([]);
  });

  it.each(Object.keys(dicts))("%s has no keys English does not", (lang) => {
    const dict = dicts[lang as keyof typeof dicts] as Record<string, string>;
    const extra = Object.keys(dict).filter((k) => !(k in (en as Record<string, string>)));
    expect(extra).toEqual([]);
  });
});

describe("pipeline vocabulary is fully translated", () => {
  // The chip and the next-action button read these by computed key, so a gap
  // cannot be caught by grepping for string literals.
  const needed = [
    ...PIPELINE_STAGES.map((s) => `pipeline.stage.${s}`),
    ...PIPELINE_STAGES.map((s) => nextAction(s)),
  ];

  it.each(["en", ...Object.keys(dicts)])("%s defines every stage and action", (lang) => {
    const dict = (lang === "en" ? en : dicts[lang as keyof typeof dicts]) as Record<string, string>;
    for (const key of needed) {
      expect(dict[key], `${lang} is missing ${key}`).toBeTruthy();
    }
  });
});

describe("interpolation placeholders match across locales", () => {
  // "{when}" in English but "{data}" in Polish renders a literal brace to the user.
  const placeholders = (v: string) => (v.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

  it.each(Object.keys(dicts))("%s uses the same placeholders as English", (lang) => {
    const dict = dicts[lang as keyof typeof dicts] as Record<string, string>;
    const mismatched = enKeys.filter((k) => {
      const a = placeholders(String((en as Record<string, string>)[k] ?? ""));
      const b = placeholders(String(dict[k] ?? ""));
      return a.join(",") !== b.join(",");
    });
    expect(mismatched).toEqual([]);
  });
});
