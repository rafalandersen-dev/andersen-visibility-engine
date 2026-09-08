import { describe, expect, it } from "vitest";
import {
  CONTENT_LANGUAGES,
  CONTENT_LANGUAGE_OPTIONS,
  contentLanguagePatch,
  projectContentLanguage,
  resolveContentLanguage,
} from "./content-languages";
import { contentLangToProjectLanguage, LANGUAGE_OPTIONS, marketDefaults } from "./onboarding";
import { contentLanguageLabel } from "./ai.functions";
import { validateProjectSetupPayload } from "./pending-actions";
import {
  opportunityBatchSchema,
  prepareOpportunityBatch,
  applyOpportunityBatch,
} from "./mcp-opportunity-batch";
import type { Project, Opportunity } from "./types";

describe("EU article languages across setup, generation and external authoring", () => {
  it("includes the complete official list once each", () => {
    expect([...CONTENT_LANGUAGES].sort()).toEqual([
      "Bulgarian",
      "Croatian",
      "Czech",
      "Danish",
      "Dutch",
      "English",
      "Estonian",
      "Finnish",
      "French",
      "German",
      "Greek",
      "Hungarian",
      "Irish",
      "Italian",
      "Latvian",
      "Lithuanian",
      "Maltese",
      "Polish",
      "Portuguese",
      "Romanian",
      "Slovak",
      "Slovenian",
      "Spanish",
      "Swedish",
    ]);
    expect(new Set(CONTENT_LANGUAGE_OPTIONS.map((l) => l.value)).size).toBe(24);
  });
  it.each(CONTENT_LANGUAGE_OPTIONS)(
    "preserves $label in codes, prompts, proposals and MCP batches",
    async (language) => {
      expect(contentLangToProjectLanguage(language.value)).toBe(language.label);
      expect(resolveContentLanguage(language.native)).toBe(language.label);
      expect(resolveContentLanguage(language.label)).toBe(language.label);
      expect(contentLanguagePatch(language.label)).toEqual({
        primaryLanguage: language.label,
        primaryContentLanguage: language.value,
      });
      const project = {
        id: "p",
        primaryLanguage: "English",
        primaryContentLanguage: language.value,
        appLanguage: "pl",
        market: "SE",
        currency: "SEK",
      } as Project;
      expect(contentLanguageLabel(project)).toBe(language.label);
      expect(
        validateProjectSetupPayload({ projectFields: { primaryLanguage: language.label } })
          .projectFields?.primaryLanguage,
      ).toBe(language.label);
      const explicit = opportunityBatchSchema.parse({
        projectId: "p",
        requestId: "explicit",
        items: [{ title: "An external topic", language: language.label }],
      });
      expect(explicit.items[0].language).toBe(language.label);
      const inherited = opportunityBatchSchema.parse({
        projectId: "p",
        requestId: "inherited",
        items: [{ title: "A project topic" }],
      });
      const result = applyOpportunityBatch(
        { projects: [project], opportunities: [] },
        await prepareOpportunityBatch(inherited),
      );
      expect((result.data.opportunities as Opportunity[])[0].language).toBe(language.label);
      expect((result.data.projects as Project[])[0]).toMatchObject({
        appLanguage: "pl",
        market: "SE",
        currency: "SEK",
      });
    },
  );
  it.each([
    ["de-DE", "German"],
    ["pt-BR", "Portuguese"],
    ["el-GR", "Greek"],
    ["SLOVENČINA", "Slovak"],
    ["slovenščina", "Slovenian"],
    ["SVENSKA", "Swedish"],
    ["polska", "Polish"],
    ["danmark", "Danish"],
    ["angielski", "English"],
  ])("recognizes %s without confusing neighboring names", (input, expected) => {
    expect(resolveContentLanguage(input)).toBe(expected);
  });
  it.each(["Klingon", "constructor", "__proto__", "toString", "slov", "", null, {}, "en<script>"])(
    "does not accept an unknown or ambiguous name: %s",
    (input) => {
      expect(resolveContentLanguage(input)).toBeUndefined();
    },
  );
  it("preserves legacy projects and uses the content setting before the UI locale", () => {
    expect(projectContentLanguage({ primaryLanguage: "Danish" })).toBe("Danish");
    expect(
      projectContentLanguage({ primaryContentLanguage: "corrupt", primaryLanguage: "Polish" }),
    ).toBe("Polish");
    expect(projectContentLanguage({})).toBe("English");
    expect(LANGUAGE_OPTIONS.map((l) => l.value)).toEqual(["en", "pl", "sv", "da"]);
    expect(marketDefaults("EU")).toEqual({
      currency: "EUR",
      appLanguage: "en",
      primaryContentLanguage: "en",
    });
  });
  it("retains bounded setup proposals and rejects unsupported authoring values", () => {
    expect(() =>
      validateProjectSetupPayload({
        projectFields: { additionalLanguages: ["French", "German", "Greek", "Irish"] },
      }),
    ).toThrow();
    expect(() =>
      opportunityBatchSchema.parse({
        projectId: "p",
        requestId: "r",
        items: [{ title: "A topic", language: "Klingon" }],
      }),
    ).toThrow();
  });
});
