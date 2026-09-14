import { expect, it } from "vitest";
import { UI_CATALOGS, UI_LANGUAGE_CODES } from "./catalogs";
import { uiLanguageListEnglish } from "./ui-languages";

// Copy that names the active interface languages or Plan stages must change with
// them. Activating a staged language fails here until those statements are reconciled.
it("names exactly the active interface languages in the public beta language note", () => {
  expect(uiLanguageListEnglish()).toBe("English, Polish, Swedish and Danish");
  expect(UI_LANGUAGE_CODES).toHaveLength(4);
  expect(UI_CATALOGS.en["publicBeta.thisPageSupportsEnglishPolishSwedishAnd"]).toContain(
    `This page supports ${uiLanguageListEnglish()}.`,
  );
});
it.each(UI_LANGUAGE_CODES)(
  "%s home FAQ uses the Plan stage label that accepted ideas actually enter",
  (locale) => {
    const catalog = UI_CATALOGS[locale];
    expect(catalog["publicHome.faqDiscoveryA"]).toContain(catalog["pipeline.stage.idea"]);
  },
);
