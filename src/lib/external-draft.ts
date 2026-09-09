import { workspaceWriteTimestamp } from "./workspace-time";
import type { ContentAsset } from "./types";

export class ExternalDraftStateError extends Error {
  constructor() {
    super("external_draft_not_editable");
  }
}
/** External authoring never carries an existing approval or publication attempt forward. */
export function assertExternalDraftEditable(asset: ContentAsset): void {
  if (
    asset.status !== "Draft" ||
    (asset.livePublishStatus !== undefined && asset.livePublishStatus !== "notPublished") ||
    (asset.publishStatus !== undefined && asset.publishStatus !== "notSent") ||
    asset.liveUrl ||
    asset.livePublishedAt ||
    asset.publishedDraftUrl ||
    asset.publishExternalId ||
    asset.wordpressPostId ||
    asset.shopifyArticleId ||
    asset.shopifyArticleGid ||
    (asset.scheduledPublishStatus !== undefined && asset.scheduledPublishStatus !== "cancelled") ||
    (asset.scheduledPublishAt && asset.scheduledPublishStatus !== "cancelled")
  )
    throw new ExternalDraftStateError();
}
const FIELDS = new Set([
  "title",
  "slug",
  "metaTitle",
  "metaDescription",
  "h1",
  "cta",
  "markdown",
  "editorNotes",
  "outline",
  "faq",
  "internalLinks",
  "schemaSuggestions",
  "images",
]);
/** Existing validation owns field shapes. This boundary owns editability and stale derived state. */
export function applyExternalDraftEdits(
  current: ContentAsset,
  patch: Partial<ContentAsset>,
  nowIso: string,
): ContentAsset {
  assertExternalDraftEditable(current);
  if (Object.keys(patch).some((key) => !FIELDS.has(key)))
    throw new Error("external_draft_field_not_editable");
  const changed = Object.entries(patch).some(
    ([key, value]) =>
      key !== "editorNotes" &&
      JSON.stringify(value) !== JSON.stringify(current[key as keyof ContentAsset]),
  );
  const next = {
    ...current,
    ...patch,
    updatedAt: workspaceWriteTimestamp(current.updatedAt, nowIso),
  };
  if (changed) {
    if (current.qualityScore) next.qualityScoreStale = true;
    delete next.assembled;
    delete next.checklist;
    delete next.readiness;
  }
  return next;
}
