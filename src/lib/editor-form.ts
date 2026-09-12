/**
 * Article Studio editor — form/persistence helpers (pure, unit-tested).
 *
 * The editor keeps an in-flight copy of the asset (`f`) in local React state and
 * only writes it to the store on an explicit Save. An uploaded image is the
 * motivating case: `onUploadImage` puts it into `f.images` (and Storage) but it
 * does NOT reach the persisted ContentAsset until the user Saves. Before this fix
 * the only Save control was in the top toolbar while the Images/Sources/Author
 * panel told the user to use "the Save button below" — which did not exist — so
 * users refreshed and lost the image (the Storage object was left orphaned).
 *
 * These helpers back the always-visible footer Save action + unsaved-changes
 * indicator + beforeunload guard.
 */
import type { ContentAsset } from "./types";

/**
 * The asset fields the editor form owns. Backs both `editorFormDirty` and
 * `mergeEditorFormFields` below — anything the form can edit must be listed
 * here so the dirty check and the merge always agree on what "an edit" is.
 */
export const EDITOR_FORM_FIELDS = [
  "title",
  "slug",
  "markdown",
  "metaTitle",
  "metaDescription",
  "h1",
  "outline",
  "internalLinks",
  "schemaSuggestions",
  "cta",
  "editorNotes",
  "author",
  "sources",
  "images",
  "imageReferences",
  "tldr",
  "keyTakeaways",
  "breadcrumbs",
  "hook",
  "featuredImage",
  "visualState",
  "visualModelVersion",
  "sectionIndex",
  "faq",
] as const;

const norm = (v: unknown): string => JSON.stringify(v ?? null);

/**
 * True when the editor form has unsaved edits versus the persisted asset — a
 * field-by-field compare over the form-owned fields only. `?? null` normalises
 * undefined vs null so a legacy asset missing optional fields (e.g. no `images`)
 * doesn't read as dirty the moment it loads.
 */
export function editorFormDirty(form: ContentAsset, stored: ContentAsset | undefined): boolean {
  if (!stored) return false;
  const f = form as unknown as Record<string, unknown>;
  const s = stored as unknown as Record<string, unknown>;
  return EDITOR_FORM_FIELDS.some((k) => norm(f[k]) !== norm(s[k]));
}

/**
 * Merge the form-owned fields (`EDITOR_FORM_FIELDS`) from `local` onto the
 * CURRENT `stored` record, leaving every other field — publish/schedule
 * metadata, quality score, connector ids, etc. — exactly as persisted. Single
 * source of truth for "what the editor form owns", shared with
 * `editorFormDirty` so the two can never drift (a field added to the form only
 * needs to be added to `EDITOR_FORM_FIELDS` once).
 */
export function mergeEditorFormFields(local: ContentAsset, stored: ContentAsset): ContentAsset {
  const merged = { ...stored } as unknown as Record<string, unknown>;
  const l = local as unknown as Record<string, unknown>;
  for (const k of EDITOR_FORM_FIELDS) merged[k] = l[k];
  return merged as unknown as ContentAsset;
}
