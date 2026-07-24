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
 * The asset fields the editor form owns. MUST stay in sync with
 * `mergeEditorEdits` in app.editor.tsx — anything the form can edit must be here
 * so the dirty check and the merge agree on what "an edit" is.
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
  "tldr",
  "keyTakeaways",
  "breadcrumbs",
  "hook",
  "featuredImage",
  "visualState",
  "visualModelVersion",
  "sectionIndex",
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
