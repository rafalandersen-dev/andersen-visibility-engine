/**
 * Editor form dirty-detection (production hotfix: image-upload persistence).
 *
 * Regression context: an uploaded image lives in the editor's form state (`f`)
 * and Storage but not in the persisted ContentAsset until Save. The footer Save
 * + unsaved-changes indicator + beforeunload guard all key off `editorFormDirty`,
 * so if this drifts from `mergeEditorEdits` the user can silently lose an upload.
 */
import { describe, it, expect } from "vitest";
import { editorFormDirty, EDITOR_FORM_FIELDS } from "./editor-form";
import type { ContentAsset } from "./types";

const base = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...over,
  }) as ContentAsset;

const img = (over: Record<string, unknown> = {}) => ({
  id: "img1",
  concept: "Kettlebell",
  alt: "",
  placement: "inline",
  source: "uploaded",
  status: "proposed",
  required: true,
  storagePath: "uid/p/a/img1.jpg",
  ...over,
});

describe("editorFormDirty", () => {
  it("is false when the form equals the stored asset (no edits)", () => {
    const stored = base({ images: [img()] as never });
    const form = base({ images: [img()] as never });
    expect(editorFormDirty(form, stored)).toBe(false);
  });

  it("is false when stored is undefined (nothing to compare)", () => {
    expect(editorFormDirty(base(), undefined)).toBe(false);
  });

  it("is TRUE after an image is uploaded (the motivating bug)", () => {
    const stored = base({ images: [] as never });
    const form = base({ images: [img()] as never }); // onUploadImage appended one
    expect(editorFormDirty(form, stored)).toBe(true);
  });

  it("is TRUE when alt / caption / required are edited on an image", () => {
    const stored = base({ images: [img()] as never });
    expect(
      editorFormDirty(base({ images: [img({ alt: "Kettlebell on floor" })] as never }), stored),
    ).toBe(true);
    expect(
      editorFormDirty(base({ images: [img({ caption: "In the gym" })] as never }), stored),
    ).toBe(true);
    expect(editorFormDirty(base({ images: [img({ required: false })] as never }), stored)).toBe(
      true,
    );
  });

  it("is TRUE when an image is removed", () => {
    const stored = base({ images: [img()] as never });
    expect(editorFormDirty(base({ images: [] as never }), stored)).toBe(true);
  });

  it("is FALSE for a legacy asset with no images (undefined on both sides)", () => {
    const stored = base(); // no images field
    const form = base();
    expect(editorFormDirty(form, stored)).toBe(false);
  });

  it("tracks the other form-owned fields (title, markdown, author, sources, tldr)", () => {
    const stored = base({ author: { name: "" } as never, sources: [] as never, tldr: "" });
    expect(editorFormDirty(base({ title: "New" }), stored)).toBe(true);
    expect(editorFormDirty(base({ markdown: "Changed." }), stored)).toBe(true);
    expect(editorFormDirty(base({ author: { name: "Dr X" } as never }), stored)).toBe(true);
    expect(editorFormDirty(base({ sources: [{ url: "https://a.com" }] as never }), stored)).toBe(
      true,
    );
    expect(editorFormDirty(base({ tldr: "Summary" }), stored)).toBe(true);
  });

  it("does NOT flag non-form fields (e.g. wordpressPostId, qualityScore) as edits", () => {
    const stored = base({ wordpressPostId: 42 as never, qualityScore: { overall: 90 } as never });
    // form dropped those server-owned fields — must still read as clean
    const form = base();
    expect(editorFormDirty(form, stored)).toBe(false);
  });

  it("EDITOR_FORM_FIELDS stays in sync with the 17 fields mergeEditorEdits owns", () => {
    expect([...EDITOR_FORM_FIELDS].sort()).toEqual(
      [
        "author",
        "breadcrumbs",
        "cta",
        "editorNotes",
        "h1",
        "images",
        "internalLinks",
        "keyTakeaways",
        "markdown",
        "metaDescription",
        "metaTitle",
        "outline",
        "schemaSuggestions",
        "slug",
        "sources",
        "title",
        "tldr",
      ].sort(),
    );
  });
});
