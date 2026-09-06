import type { ContentAsset, Opportunity } from "./types";
import { isDropped, linkedAssetFor, pipelineStage } from "./pipeline";

/** Same execution truth as Plan. Legacy "approved" is never a publication. */
export function growthWork(opportunities: Opportunity[], content: ContentAsset[]) {
  const active = opportunities.filter((item) => !isDropped(item) && item.status !== "archived");
  const byOpportunity = new Map(active.map((item) => [item.id, linkedAssetFor(item, content)]));
  const rows = active.map((item) => ({
    item,
    asset: byOpportunity.get(item.id),
    stage: pipelineStage({ opportunity: item, asset: byOpportunity.get(item.id) }),
  }));
  // An orphan/archived opportunity does not cancel a queue entry. Keep EVERY
  // armed asset visible until the publishing service actually cancels it.
  const scheduled = content
    .filter((asset) => pipelineStage({ asset }) === "armed")
    .sort((a, b) => (a.scheduledPublishAt ?? "").localeCompare(b.scheduledPublishAt ?? ""));
  const published =
    content.filter((asset) => pipelineStage({ asset }) === "live").length +
    rows.filter((row) => row.stage === "live_missing").length;
  return { rows, byOpportunity, scheduled, published };
}

export function contentCover(asset: ContentAsset): string | undefined {
  return asset.featuredImage?.url ?? asset.images?.find((image) => image.url)?.url;
}
