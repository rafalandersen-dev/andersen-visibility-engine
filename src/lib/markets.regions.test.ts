/**
 * Region suggestion for the landing-page market banner.
 *
 * The banner used to read navigator.language and match on the primary subtag
 * only, so every English locale — "en-US", "en-SE", plain "en" — was announced
 * as "United Kingdom" and pointed at GBP pricing. Language is a bad location
 * signal in general: a visitor in Malmö running macOS in English (UK) reports
 * "en-GB". Time zone is the signal the browser actually has, so it wins.
 */
import { describe, it, expect } from "vitest";
import {
  suggestDisplayRegion,
  suggestRegionFromLanguage,
  suggestRegionFromTimeZone,
  REGION_SENTENCE_LABELS,
  DISPLAY_REGIONS,
} from "./markets";

describe("suggestRegionFromLanguage", () => {
  it("maps local-market languages regardless of country subtag", () => {
    expect(suggestRegionFromLanguage("pl")).toBe("pl");
    expect(suggestRegionFromLanguage("pl-PL")).toBe("pl");
    expect(suggestRegionFromLanguage("sv")).toBe("se");
    expect(suggestRegionFromLanguage("sv-SE")).toBe("se");
    expect(suggestRegionFromLanguage("sv-FI")).toBe("se");
    expect(suggestRegionFromLanguage("da")).toBe("dk");
    expect(suggestRegionFromLanguage("da-DK")).toBe("dk");
  });

  it("suggests the UK only for en-GB", () => {
    expect(suggestRegionFromLanguage("en-GB")).toBe("uk");
    expect(suggestRegionFromLanguage("en-gb")).toBe("uk");
  });

  it("does not send other English locales to the UK", () => {
    expect(suggestRegionFromLanguage("en")).toBe("eu");
    expect(suggestRegionFromLanguage("en-US")).toBe("eu");
    expect(suggestRegionFromLanguage("en-SE")).toBe("eu");
    expect(suggestRegionFromLanguage("en-IE")).toBe("eu");
    expect(suggestRegionFromLanguage("en-AU")).toBe("eu");
  });

  it("falls back to eu for unknown, empty or missing languages", () => {
    expect(suggestRegionFromLanguage("de-DE")).toBe("eu");
    expect(suggestRegionFromLanguage("")).toBe("eu");
    expect(suggestRegionFromLanguage(undefined)).toBe("eu");
  });
});

describe("suggestRegionFromTimeZone", () => {
  it("maps our local markets", () => {
    expect(suggestRegionFromTimeZone("Europe/Warsaw")).toBe("pl");
    expect(suggestRegionFromTimeZone("Europe/Stockholm")).toBe("se");
    expect(suggestRegionFromTimeZone("Europe/Copenhagen")).toBe("dk");
    expect(suggestRegionFromTimeZone("Europe/London")).toBe("uk");
  });

  it("returns null for zones outside our markets or no zone at all", () => {
    expect(suggestRegionFromTimeZone("Europe/Berlin")).toBeNull();
    expect(suggestRegionFromTimeZone("America/New_York")).toBeNull();
    expect(suggestRegionFromTimeZone("")).toBeNull();
    expect(suggestRegionFromTimeZone(undefined)).toBeNull();
  });
});

describe("suggestDisplayRegion", () => {
  it("trusts the time zone over the language", () => {
    // The reported case: macOS set to English (UK), physically in Malmö.
    expect(suggestDisplayRegion({ timeZone: "Europe/Stockholm", language: "en-GB" })).toBe("se");
    expect(suggestDisplayRegion({ timeZone: "Europe/Warsaw", language: "en-GB" })).toBe("pl");
    expect(suggestDisplayRegion({ timeZone: "Europe/London", language: "sv-SE" })).toBe("uk");
  });

  it("suggests nothing when a known time zone is outside our markets", () => {
    expect(suggestDisplayRegion({ timeZone: "Europe/Berlin", language: "en-GB" })).toBe("eu");
    expect(suggestDisplayRegion({ timeZone: "America/New_York", language: "pl-PL" })).toBe("eu");
  });

  it("falls back to language only when no time zone is available", () => {
    expect(suggestDisplayRegion({ language: "sv-SE" })).toBe("se");
    expect(suggestDisplayRegion({ language: "en-GB" })).toBe("uk");
    expect(suggestDisplayRegion({ language: "en-US" })).toBe("eu");
    expect(suggestDisplayRegion({})).toBe("eu");
  });
});

describe("REGION_SENTENCE_LABELS", () => {
  it("covers every display region", () => {
    for (const r of DISPLAY_REGIONS) {
      expect(REGION_SENTENCE_LABELS[r]).toBeTruthy();
    }
  });

  it("carries the article the sentence needs", () => {
    expect(REGION_SENTENCE_LABELS.uk).toBe("the United Kingdom");
    expect(REGION_SENTENCE_LABELS.se).toBe("Sweden");
  });
});
