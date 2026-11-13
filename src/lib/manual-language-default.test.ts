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

  it("persists the review status that a language change sets, and labels the select", () => {
    const editor = readFileSync("src/routes/_authenticated/app.editor.tsx", "utf8");
    // `save` writes status AFTER the form-field merge (status is not an EDITOR_FORM_FIELD),
    // so the In Review the language change put on the form is what is stored.
    expect(editor).toContain("status: status ?? f.status,");
    expect(editor).toContain('htmlFor="editor-content-language"');
    expect(editor).toContain('id="editor-content-language"');
  });

  it("blank drafts fall back through the canonical project language, keeping an explicit opp language", () => {
    const ai = readFileSync("src/lib/mock-ai.ts", "utf8");
    const fallback = /language: opp\.language \?\? projectContentLanguage\(project\),/g;
    expect(ai.match(fallback)).toHaveLength(2);
    expect(ai).not.toMatch(/opp\.language \?\?\s*\(project\.primaryContentLanguage/);
  });

  it("offers the language under its translated label", () => {
    expect(contentLanguageDisplayName(sv, "en")).toBe("Swedish");
    expect(contentLanguageDisplayName(sv, "not a locale")).toBe("Swedish");
  });
});
