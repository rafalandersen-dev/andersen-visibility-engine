import { describe, expect, it } from "vitest";
import { UI_CATALOGS, UI_LANGUAGE_CODES, isUiLanguage } from "./catalogs";
import { translate } from "./translate";

const englishKeys = Object.keys(UI_CATALOGS.en).sort();
const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();
describe("all product areas use one complete UI catalog", () => {
  it.each(UI_LANGUAGE_CODES)("%s covers every key and preserves interpolation fields", (locale) => {
    expect(Object.keys(UI_CATALOGS[locale]).sort()).toEqual(englishKeys);
    for (const key of englishKeys) {
      const text = UI_CATALOGS[locale][key];
      expect(typeof text, `${locale}:${key}`).toBe("string");
      expect(text.trim(), `${locale}:${key}`).not.toBe("");
      expect(placeholders(text), `${locale}:${key}`).toEqual(placeholders(UI_CATALOGS.en[key]));
    }
  });
  it("retains later evidence and publication wording over older base copy", () => {
    expect(translate("en", "pipeline.stage.live")).toBe("Published");
    expect(translate("en", "backlinks.gapNote")).toBe(
      "Provider index sample requested with your domain excluded. This does not independently verify that these sites have no links to you.",
    );
    expect(translate("pl", "pipeline.stage.live")).toBe("Opublikowane");
    expect(translate("sv", "pipeline.stage.live")).toBe("Publicerat");
    expect(translate("da", "pipeline.stage.live")).toBe("Udgivet");
  });
  it("keeps validated UI languages distinct from content and email choices", () => {
    expect(UI_LANGUAGE_CODES).toEqual(["en", "pl", "sv", "da"]);
    for (const value of ["fr", "de", "en-US", "English", "PL", null, {}, "__proto__"])
      expect(isUiLanguage(value)).toBe(false);
    expect(translate(undefined, "backlinkRecurring.title")).not.toBe("backlinkRecurring.title");
    expect(translate("fr" as "en", "common.cancel")).toBe(translate("en", "common.cancel"));
  });
  it("does not expose or mutate catalog prototypes for unknown keys", () => {
    for (const key of ["__proto__", "constructor", "toString", "missing.product.key"])
      expect(translate("sv", key, { count: 2 })).toBe(key);
    expect(Object.isFrozen(UI_CATALOGS)).toBe(true);
    for (const locale of UI_LANGUAGE_CODES) expect(Object.isFrozen(UI_CATALOGS[locale])).toBe(true);
  });
});
describe("literal interpolation of supplied values", () => {
  it("renders dollar replacement sequences literally", () => {
    const agency = "$& / $` / $' / $$";
    expect(translate("en", "report.footer.agency", { agency })).toBe(
      `${agency}. Based on saved publication results. This report does not recheck whether pages are currently live.`,
    );
  });
  it("does not recursively interpolate braces inside another value", () => {
    expect(
      translate("en", "report.gsc.line", { clicks: "{position}", impressions: 0, position: 3 }),
    ).toBe("{position} clicks · 0 impressions · avg. position 3");
  });
  it("preserves unavailable fields and ignores inherited variable properties", () => {
    const vars = Object.create({ agency: "unexpected" }) as Record<string, string>;
    expect(translate("en", "report.footer.agency", vars)).toContain("{agency}");
    expect(translate("en", "report.gsc.line", { clicks: 1 })).toBe(
      "1 clicks · {impressions} impressions · avg. position {position}",
    );
  });
});
