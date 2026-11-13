/**
 * A scheduled UPDATE of an article that is already live.
 *
 * The runner treats every already-live asset as a safe no-op, because a first
 * publication queued before the owner published manually, a replayed claim and a
 * legacy row must never send again. An update is therefore only recognised when
 * the asset carries an intent bound to the exact queue row that is firing, to the
 * exact approved version it was armed with, and to the live destination identity.
 * Pure and server-free so the decision is unit-testable.
 */
import type { ContentAsset } from "./types";

export type ScheduledPublishedUpdate = NonNullable<ContentAsset["scheduledPublishedUpdate"]>;

/** Same recognition the runner used for "already live": the URL may be unknown. */
export function isLivePublished(asset: ContentAsset): boolean {
  return (
    asset.livePublishStatus === "published" &&
    Boolean(
      asset.liveUrl || asset.publishExternalId || asset.wordpressPostId || asset.shopifyArticleGid,
    )
  );
}

/** The existing article, destination and slug an update must keep targeting. */
export function liveIdentity(asset: ContentAsset): string {
  return JSON.stringify([
    asset.publishPlatform ?? "",
    asset.liveUrl ?? "",
    asset.publishExternalId ?? "",
    asset.wordpressPostId ?? "",
    asset.wordpressPostType ?? "",
    asset.shopifyArticleGid ?? "",
    asset.publishSlug || asset.slug || "",
    asset.publishDestinationType ?? "",
  ]);
}

/** Intent to store with a newly armed queue row; undefined for a first publication. */
export function scheduledUpdateIntent(
  asset: ContentAsset,
  queueId: string,
  versionHash: string,
): ScheduledPublishedUpdate | undefined {
  return isLivePublished(asset)
    ? { queueId, versionHash, identity: liveIdentity(asset) }
    : undefined;
}

/** Only the firing queue row's own intent counts; anything else is a no-op. */
export function firingUpdateIntent(
  asset: ContentAsset,
  queueId: string | undefined,
): ScheduledPublishedUpdate | undefined {
  const intent = asset.scheduledPublishedUpdate;
  if (!queueId || !intent || intent.queueId !== queueId || !isLivePublished(asset)) return;
  return intent;
}

/** Null when the update may proceed, otherwise the owner-facing reason to refuse. */
export function updateRefusal(
  asset: ContentAsset,
  intent: ScheduledPublishedUpdate,
  currentVersionHash: string,
): string | null {
  if (liveIdentity(asset) !== intent.identity)
    return "The live article's destination changed after this update was scheduled, so it was not sent. Schedule it again.";
  if (currentVersionHash !== intent.versionHash)
    return "The article changed after this update was approved and scheduled, so it was not sent. Approve it again to schedule it.";
  return null;
}
