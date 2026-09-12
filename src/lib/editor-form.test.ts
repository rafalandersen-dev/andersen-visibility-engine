/**
 * Editor form dirty-detection (production hotfix: image-upload persistence).
 *
 * Regression context: an uploaded image lives in the editor's form state (`f`)
 * and Storage but not in the persisted ContentAsset until Save. The footer Save
 * + unsaved-changes indicator + beforeunload guard all key off `editorFormDirty`,
 * so if this drifts from `mergeEditorEdits` the user can silently lose an upload.
 */
import { describe, it, expect } from "vitest";
import { editorFormDirty, mergeEditorFormFields, EDITOR_FORM_FIELDS } from "./editor-form";

it("keeps a reference selection through save without replacing newer publication fields", () => {
  const stored = {
    id: "a",
    projectId: "p",
    title: "Article",
    liveUrl: "https://example.test/current",
  } as ContentAsset;
  const form = {
    ...stored,
    liveUrl: "https://example.test/stale",
    imageReferences: [{ imageId: "photo", metadataHash: "a".repeat(64) }],
  };
  expect(editorFormDirty(form, stored)).toBe(true);
  const merged = mergeEditorFormFields(form, stored);
  expect(merged.imageReferences).toEqual(form.imageReferences);
  expect(merged.liveUrl).toBe(stored.liveUrl);
});
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

  it("EDITOR_FORM_FIELDS stays in sync with the fields mergeEditorEdits owns", () => {
    expect([...EDITOR_FORM_FIELDS].sort()).toEqual(
      [
        "author",
        "breadcrumbs",
        "cta",
        "editorNotes",
        "faq",
        "featuredImage",
        "visualState",
        "visualModelVersion",
        "h1",
        "hook",
        "images",
        "imageReferences",
        "internalLinks",
        "keyTakeaways",
        "markdown",
        "metaDescription",
        "metaTitle",
        "outline",
        "schemaSuggestions",
        "sectionIndex",
        "slug",
        "sources",
        "title",
        "tldr",
      ].sort(),
    );
  });

  it("is TRUE when a FAQ question or answer is edited (production defect: Save discarded FAQ edits)", () => {
    const stored = base({ faq: [{ q: "What is X?", a: "X is Y." }] as never });
    expect(
      editorFormDirty(base({ faq: [{ q: "What is X, exactly?", a: "X is Y." }] as never }), stored),
    ).toBe(true);
    expect(
      editorFormDirty(base({ faq: [{ q: "What is X?", a: "X is Z." }] as never }), stored),
    ).toBe(true);
  });

  it("is TRUE when a FAQ entry is removed, FALSE when unchanged", () => {
    const stored = base({ faq: [{ q: "Q1", a: "A1" }, { q: "Q2", a: "A2" }] as never });
    expect(editorFormDirty(base({ faq: [{ q: "Q1", a: "A1" }] as never }), stored)).toBe(true);
    expect(
      editorFormDirty(
        base({ faq: [{ q: "Q1", a: "A1" }, { q: "Q2", a: "A2" }] as never }),
        stored,
      ),
    ).toBe(false);
  });
});

describe("mergeEditorFormFields", () => {
  it("carries a changed FAQ answer/question onto the merged record (the Save-discards-FAQ defect)", () => {
    const stored = base({ faq: [{ q: "Old Q?", a: "Old A." }] as never });
    const local = base({ faq: [{ q: "New Q?", a: "New A." }] as never });
    const merged = mergeEditorFormFields(local, stored);
    expect(merged.faq).toEqual([{ q: "New Q?", a: "New A." }]);
  });

  it("persists an emptied/removed FAQ list", () => {
    const stored = base({ faq: [{ q: "Q", a: "A" }] as never });
    const local = base({ faq: [] as never });
    expect(mergeEditorFormFields(local, stored).faq).toEqual([]);
  });

  it("merges other form-owned fields (title, markdown) alongside faq", () => {
    const stored = base({ title: "Old", markdown: "Old body.", faq: [] as never });
    const local = base({
      title: "New",
      markdown: "New body.",
      faq: [{ q: "Q", a: "A" }] as never,
    });
    const merged = mergeEditorFormFields(local, stored);
    expect(merged.title).toBe("New");
    expect(merged.markdown).toBe("New body.");
    expect(merged.faq).toEqual([{ q: "Q", a: "A" }]);
  });

  it("preserves CURRENT stored publish/schedule metadata over a stale local snapshot", () => {
    const stored = base({
      faq: [{ q: "Q", a: "A" }] as never,
      liveUrl: "https://site.com/live-page",
      publishExternalId: "ext-123",
      wordpressPostId: 42 as never,
      scheduledPublishAt: "2026-09-10T09:00:00.000Z",
      scheduledPublishStatus: "pending" as never,
    });
    // `local` is a stale in-memory snapshot from before a publish/schedule
    // wrote those fields — it must never win over the current stored values.
    const local = base({
      faq: [{ q: "Q2", a: "A2" }] as never,
      liveUrl: undefined,
      publishExternalId: undefined,
      wordpressPostId: undefined,
      scheduledPublishAt: undefined,
      scheduledPublishStatus: undefined,
    });
    const merged = mergeEditorFormFields(local, stored);
    expect(merged.faq).toEqual([{ q: "Q2", a: "A2" }]); // form-owned edit wins
    expect(merged.liveUrl).toBe("https://site.com/live-page");
    expect(merged.publishExternalId).toBe("ext-123");
    expect(merged.wordpressPostId).toBe(42);
    expect(merged.scheduledPublishAt).toBe("2026-09-10T09:00:00.000Z");
    expect(merged.scheduledPublishStatus).toBe("pending");
  });
});

describe("editorFormDirty (continued)", () => {
  // ---- Stable image anchors (Article Studio 3.0 / P1.2C) ----
  it("is TRUE when an image anchor / order changes, or the sectionIndex changes (must persist)", () => {
    const withImg = (over: Record<string, unknown>) =>
      base({
        images: [
          { id: "i1", concept: "c", alt: "a", placement: "inline", status: "accepted", ...over },
        ] as never,
      });
    const stored = withImg({});
    expect(editorFormDirty(withImg({ anchor: "article-end" }), stored)).toBe(true);
    expect(editorFormDirty(withImg({ order: 2 }), stored)).toBe(true);
    expect(
      editorFormDirty(
        base({
          sectionIndex: [
            { id: "sec_a1", heading: "H", normalized: "h", level: 2, order: 0 },
          ] as never,
        }),
        base(),
      ),
    ).toBe(true);
  });

  // ---- Opening hook (Article Studio 3.0 / P1.2A) ----
  const hook = (over: Record<string, unknown> = {}) => ({
    id: "h1",
    text: "Sore after training?",
    type: "question",
    provenance: "generated",
    approval: "draft",
    ...over,
  });

  it("is FALSE for a legacy asset with no hook (undefined on both sides) — T18 baseline", () => {
    expect(editorFormDirty(base(), base())).toBe(false);
  });

  it("is TRUE when a hook is added (T18)", () => {
    const stored = base();
    expect(editorFormDirty(base({ hook: hook() as never }), stored)).toBe(true);
  });

  it("is TRUE when the hook text / type / approval changes (T18/T19 — the edit must persist)", () => {
    const stored = base({ hook: hook() as never });
    expect(editorFormDirty(base({ hook: hook({ text: "New angle." }) as never }), stored)).toBe(
      true,
    );
    expect(editorFormDirty(base({ hook: hook({ type: "story" }) as never }), stored)).toBe(true);
    expect(editorFormDirty(base({ hook: hook({ approval: "approved" }) as never }), stored)).toBe(
      true,
    );
  });

  it("is FALSE when the hook is unchanged — repeated Save does not read as dirty (T22)", () => {
    const stored = base({ hook: hook({ approval: "approved" }) as never });
    const form = base({ hook: hook({ approval: "approved" }) as never });
    expect(editorFormDirty(form, stored)).toBe(false);
  });

  // ---- Image presentation (Article Studio 3.0 / P1.2D) ----
  const pres = (over: Record<string, unknown> = {}) => ({
    size: "large",
    alignment: "center",
    aspectRatio: "original",
    fit: "cover",
    visualStyle: "plain",
    ...over,
  });

  it("is TRUE when a presentation is added to an image (must persist)", () => {
    const stored = base({ images: [img()] as never });
    expect(
      editorFormDirty(base({ images: [img({ presentation: pres() })] as never }), stored),
    ).toBe(true);
  });

  it("is TRUE when a presentation preset field or focal point changes", () => {
    const stored = base({ images: [img({ presentation: pres() })] as never });
    expect(
      editorFormDirty(
        base({
          images: [img({ presentation: pres({ size: "wide" }) })] as never,
        }),
        stored,
      ),
    ).toBe(true);
    expect(
      editorFormDirty(
        base({
          images: [img({ presentation: pres({ focalPoint: { x: 0.2, y: 0.8 } }) })] as never,
        }),
        stored,
      ),
    ).toBe(true);
  });

  it("is TRUE when a mobile presentation override changes (desktop/mobile inheritance)", () => {
    const stored = base({ images: [img({ presentation: pres() })] as never });
    expect(
      editorFormDirty(
        base({
          images: [
            img({
              presentation: pres(),
              mobilePresentation: { size: "medium" },
            }),
          ] as never,
        }),
        stored,
      ),
    ).toBe(true);
  });

  // ---- Featured image (Article Studio 3.0 / P1.2B) ----
  it("is TRUE when a featured image is added or its approval/crop changes (must persist)", () => {
    const feat = (over: Record<string, unknown> = {}) => ({
      imageId: "img1",
      storagePath: "uid/p/a/img1.jpg",
      url: "https://site.com/media/img1.jpg",
      alt: "Hero",
      hero: { aspectRatio: "wide", fit: "cover" },
      approval: "draft",
      ...over,
    });
    const stored = base({ featuredImage: feat() as never });
    expect(editorFormDirty(base({ featuredImage: feat() as never }), stored)).toBe(false);
    expect(editorFormDirty(base(), stored)).toBe(true); // removed
    expect(
      editorFormDirty(base({ featuredImage: feat({ approval: "approved" }) as never }), stored),
    ).toBe(true);
    expect(
      editorFormDirty(
        base({ featuredImage: feat({ hero: { aspectRatio: "square", fit: "cover" } }) as never }),
        stored,
      ),
    ).toBe(true);
  });

  it("is FALSE when the presentation is unchanged — repeated Save is not dirty", () => {
    const stored = base({
      images: [img({ presentation: pres({ captionVisible: false }) })] as never,
    });
    const form = base({
      images: [img({ presentation: pres({ captionVisible: false }) })] as never,
    });
    expect(editorFormDirty(form, stored)).toBe(false);
  });
});

it("the P1.2H upgrade markers are dirty-tracked (Save+reload acceptance)", async () => {
  const { beginVisualUpgrade } = await import("./visual-model");
  const base = { id: "a1", title: "T", markdown: "b" } as never;
  expect(editorFormDirty(beginVisualUpgrade(base), base)).toBe(true);
});
