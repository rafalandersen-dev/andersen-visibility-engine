import { describe, expect, it } from "vitest";
import { firstUseCopy } from "./first-use";
import { conversationCopy } from "./conversation";
import { UI_CATALOGS, UI_LANGUAGE_CODES } from "./catalogs";
import { translate } from "./translate";
import { firstUseContext } from "@/lib/milo-first-use";

const keys = Object.keys(firstUseCopy.en).sort();
const placeholders = (text: string) => (text.match(/\{[^{}]+\}/g) ?? []).sort();

describe("conversationStart copy", () => {
  it("is its own namespace and never adds or changes chat.* keys", () => {
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key.startsWith("conversationStart.")).toBe(true);
    for (const key of Object.keys(conversationCopy.en)) expect(key in firstUseCopy.en).toBe(false);
  });

  it.each(UI_LANGUAGE_CODES)("%s is complete, non-empty and keeps placeholders", (locale) => {
    const copy = firstUseCopy[locale] as Record<string, string>;
    expect(Object.keys(copy).sort()).toEqual(keys);
    for (const key of keys) {
      expect(copy[key].trim(), `${locale}:${key}`).not.toBe("");
      expect(placeholders(copy[key]), `${locale}:${key}`).toEqual(
        placeholders(firstUseCopy.en[key as keyof typeof firstUseCopy.en]),
      );
    }
  });

  it.each(["pl", "sv", "da"] as const)("%s is authored, not copied English", (locale) => {
    const copied = keys.filter(
      (key) =>
        (firstUseCopy[locale] as Record<string, string>)[key] ===
        firstUseCopy.en[key as keyof typeof firstUseCopy.en],
    );
    expect(copied).toEqual([]);
  });

  it.each(UI_LANGUAGE_CODES)("%s is served by the central translator", (locale) => {
    for (const key of keys)
      expect(translate(locale, key)).toBe((firstUseCopy[locale] as Record<string, string>)[key]);
    // The full consent wording behind each summary stays the reviewed chat text.
    expect(UI_CATALOGS[locale]["chat.allowGeneration"]).toBe(
      conversationCopy[locale]["chat.allowGeneration"],
    );
    expect(UI_CATALOGS[locale]["chat.allowProviderChecks"]).toBe(
      conversationCopy[locale]["chat.allowProviderChecks"],
    );
  });

  it.each(UI_LANGUAGE_CODES)("%s keeps consent labels short and summaries bounded", (locale) => {
    const copy = firstUseCopy[locale] as Record<string, string>;
    for (const kind of ["generation", "checks"]) {
      expect(copy[`conversationStart.consent.${kind}Label`].length).toBeLessThanOrEqual(40);
      const summary = copy[`conversationStart.consent.${kind}Summary`];
      expect(summary.length).toBeLessThanOrEqual(180);
      // Shorter than the full wording it summarizes, which remains available.
      expect(summary.length).toBeLessThan(
        UI_CATALOGS[locale][
          kind === "generation" ? "chat.allowGeneration" : "chat.allowProviderChecks"
        ].length + 40,
      );
    }
    // The bounded site-check count is stated as a number in every language.
    expect(copy["conversationStart.consent.checksSummary"]).toMatch(/\b2\b/);
  });

  it("renders every suggestion the helper can produce, with the draft title literally", () => {
    const actor = "a",
      title = "{goal} $& “quoted”";
    const results = [
      firstUseContext(
        actor,
        { ownerId: actor, projectId: "p" },
        {
          userId: actor,
          hydrated: true,
          content: [{ projectId: "p", title, status: "Draft", updatedAt: "2026-10-01" }],
        },
      ),
      firstUseContext(actor, { ownerId: actor, projectId: "p" }, undefined),
      firstUseContext(actor, { ownerId: "b", projectId: "p" }, undefined),
      firstUseContext(undefined, undefined, undefined),
    ];
    for (const locale of UI_LANGUAGE_CODES)
      for (const suggestion of results.flatMap((result) => result.suggestions)) {
        const text = translate(locale, suggestion.key, suggestion.vars);
        expect(text).not.toBe(suggestion.key);
        if (suggestion.vars) expect(text).toContain(title);
        expect(text).not.toMatch(/\{title\}/);
      }
  });
});
