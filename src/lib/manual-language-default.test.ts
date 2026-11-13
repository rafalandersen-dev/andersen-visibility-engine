import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTENT_LANGUAGE_OPTIONS,
  contentLanguageDisplayName,
  projectContentLanguage,
} from "./content-languages";
import { editorFormDirty, mergeEditorFormFields } from "./editor-form";
import type { ContentAsset } from "./types";

const swedishProject = { primaryContentLanguage: "sv", primaryLanguage: "English" };
const sv = CONTENT_LANGUAGE_OPTIONS.find((option) => option.value === "sv")!;

describe("manual opportunity language", () => {
  it("uses the canonical content language, not the legacy English label", () => {
    expect(projectContentLanguage(swedishProject)).toBe("Swedish");
    expect(projectContentLanguage({ primaryLanguage: "Polish" })).toBe("Polish");
    expect(projectContentLanguage({})).toBe("English");
  });

  it("is what the manual plan form and generators use", () => {
    const plan = readFileSync("src/routes/_authenticated/app.plan.tsx", "utf8");
    expect(plan).toContain("language: projectContentLanguage(project),");
    expect(plan).not.toContain("language: project.primaryLanguage");
  });
});

describe("editing a saved draft's language", () => {
  const stored = {
    id: "a",
    projectId: "p",
    language: "English",
    markdown: "Godkänd svensk text",
    status: "Approved",
  } as unknown as ContentAsset;

  it("treats a language change as an edit and keeps the body untouched", () => {
    const form = { ...stored, language: "Swedish", status: "In Review" } as ContentAsset;
    expect(editorFormDirty(stored, stored)).toBe(false);
    expect(editorFormDirty(form, stored)).toBe(true);
    expect(mergeEditorFormFields(form, stored)).toMatchObject({
      language: "Swedish",
      markdown: "Godkänd svensk text",
    });
  });

  it("offers the language under its translated label", () => {
    expect(contentLanguageDisplayName(sv, "en")).toBe("Swedish");
    expect(contentLanguageDisplayName(sv, "not a locale")).toBe("Swedish");
  });
});
