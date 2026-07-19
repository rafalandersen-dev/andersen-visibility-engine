/**
 * When one opportunity has more than one draft, the board shows a single card in
 * the column of the precedence-resolved asset (linkedAssetFor puts an armed asset
 * first). Precedence already stops an armed asset hiding behind a newer inert one
 * — but the OTHER drafts would then be invisible. This deck is the disclosure
 * layer: a collapsed "{n} drafts" chip that expands to every draft, each showing
 * its OWN stage.
 *
 * Each row derives its stage from the asset ALONE (never with the opportunity):
 * a published opportunity would otherwise collapse every draft to "live" and hide
 * the armed/writing state that is the whole reason to show them.
 */
import { useState } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import type { ContentAsset } from "@/lib/types";
import { pipelineStage, STAGE_URGENCY } from "@/lib/pipeline";
import { StageChip } from "@/components/StageChip";

export function StackedDeck({
  assets,
  onOpenAsset,
}: {
  assets: ContentAsset[];
  onOpenAsset: (assetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (assets.length <= 1) return null;
  // Sort by urgency so an armed or needs_fixing draft is always at the top, even
  // when a newer inert Draft exists.
  const rows = assets
    .map((asset) => ({ asset, stage: pipelineStage({ asset }) }))
    .sort((a, b) => STAGE_URGENCY[a.stage] - STAGE_URGENCY[b.stage]);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="w-max rounded-[3px] border border-[#ded8ce] bg-[#f2ede3] px-1.5 py-0.5 text-[8px] font-medium text-[#6a7280] hover:bg-[#ebe5d9]"
      >
        {assets.length} drafts
      </button>
      {open ? (
        <div className="mt-1 grid gap-1 rounded-md border border-[#e7e1d6] bg-[#fbfaf6] p-1.5">
          {rows.map(({ asset, stage }) => (
            <button
              key={asset.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenAsset(asset.id);
              }}
              className="grid gap-0.5 rounded-[3px] px-1 py-1 text-left hover:bg-[#f2ede3]"
            >
              <span className="flex items-center gap-1">
                <StageChip stage={stage} />
                {stage === "armed" && asset.scheduledPublishAt ? (
                  <span className="flex items-center gap-0.5 text-[7px] font-medium text-amber-800">
                    <Clock className="h-2 w-2" /> {format(new Date(asset.scheduledPublishAt), "MMM d")}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-[8px] text-[#3a3a3a]">{asset.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
