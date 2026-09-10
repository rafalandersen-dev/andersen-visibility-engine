import type { ContentAsset, Project, PublishDestinationType } from "./types";

/** Destination selections must become a saved, separately approved version. */
export function draftSelectionChanged(
  asset: ContentAsset,
  project: Project,
  selection: { slug: string; destinationType: PublishDestinationType },
): boolean {
  return (
    selection.slug !== (asset.publishSlug || asset.slug || "") ||
    selection.destinationType !==
      (asset.publishDestinationType ?? project.defaultDestinationType ?? "blogPost")
  );
}
export function assertSavedDraftSelection(
  asset: ContentAsset,
  project: Project,
  selection: { slug: string; destinationType: PublishDestinationType },
): void {
  if (draftSelectionChanged(asset, project, selection))
    throw new Error("publication_approval_required");
}
