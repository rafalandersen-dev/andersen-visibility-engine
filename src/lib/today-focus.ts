import type { ContentAsset, Opportunity } from "./types";
import { growthWork } from "./growth-work";
import { pipelineStage, STAGE_EXECUTION, STAGE_URGENCY, type PipelineStage } from "./pipeline";

export interface TodayFocus {
  item?: Opportunity;
  asset?: ContentAsset;
  stage: PipelineStage;
}

/** Presentation only: no approval, scheduling or publication is performed here. */
export function todayFocus(
  opportunities: Opportunity[],
  content: ContentAsset[],
): TodayFocus | undefined {
  const work = growthWork(opportunities, content);
  const candidates: TodayFocus[] = [...work.rows];
  const represented = new Set(work.rows.map((row) => row.asset?.id).filter(Boolean));
  const knownOpportunities = new Set(opportunities.map((item) => item.id));
  const referencedAssets = new Set(
    opportunities.map((item) => item.currentContentAssetId).filter(Boolean),
  );

  for (const asset of content) {
    const stage = pipelineStage({ asset });
    if (
      candidates.some((candidate) => candidate.asset?.id === asset.id && candidate.stage === stage)
    )
      continue;
    // Queue/delivery problems still need attention when an opportunity is parked.
    // Otherwise retain Plan's chosen asset and do not revive deliberately hidden work.
    const deliveryNeedsAttention =
      stage === "armed" ||
      (stage === "in_review" && asset.scheduledPublishStatus === "review_required") ||
      (stage === "needs_fixing" &&
        (asset.scheduledPublishStatus === "pending" ||
          asset.scheduledPublishStatus === "failed" ||
          asset.publishStatus === "failed" ||
          asset.livePublishStatus === "failed"));
    const hasKnownOpportunity =
      (asset.opportunityId && knownOpportunities.has(asset.opportunityId)) ||
      (asset.sourceOpportunityId && knownOpportunities.has(asset.sourceOpportunityId)) ||
      referencedAssets.has(asset.id);
    if (deliveryNeedsAttention || (!represented.has(asset.id) && !hasKnownOpportunity))
      candidates.push({ asset, stage });
  }

  const priority = (stage: PipelineStage) => (stage === "armed" ? 3.5 : STAGE_URGENCY[stage]);
  return candidates
    .filter(({ stage }) => STAGE_EXECUTION[stage] !== "terminal")
    .sort(
      (a, b) =>
        priority(a.stage) - priority(b.stage) ||
        (a.stage === "armed" && b.stage === "armed"
          ? (a.asset?.scheduledPublishAt ?? "").localeCompare(b.asset?.scheduledPublishAt ?? "")
          : 0),
    )[0];
}
