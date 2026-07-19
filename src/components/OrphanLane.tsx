/**
 * Drafts whose opportunity was deleted still publish — publish.server.ts never
 * reads opportunityId, and the cron claims from Postgres regardless. Once the
 * board groups by opportunity, such an asset has no card anywhere, so an armed
 * one would put a live post on a customer's site with nothing on screen to stop
 * it. This lane is keyed on the ASSET itself and exists precisely to catch them.
 *
 * A new sibling file, not inlined into the 1300-line app.plan.tsx, to keep the
 * merge surface small while a second agent edits that route.
 */
import { format } from "date-fns";
import { Clock } from "lucide-react";
import type { ContentAsset } from "@/lib/types";
import { pipelineStage } from "@/lib/pipeline";
import { StageChip } from "@/components/StageChip";

export function OrphanLane({
  orphans,
  onOpenAsset,
}: {
  orphans: ContentAsset[];
  onOpenAsset: (assetId: string) => void;
}) {
  if (orphans.length === 0) return null;
  return (
    <section className="mt-3 rounded-lg border border-[#e2c9a0] bg-[#fbf3e4]/50 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold text-[#8a5a12]">
          Drafts with no opportunity — still publishing
        </h3>
        <span className="text-[10px] text-[#9a7a3a]">{orphans.length}</span>
      </div>
      <p className="mb-2.5 max-w-2xl text-[9px] leading-4 text-[#8a7550]">
        These drafts lost their opportunity but still publish on schedule. Open one to review it, or
        cancel its go-live.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {orphans.map((asset) => (
          <OrphanCard key={asset.id} asset={asset} onOpen={() => onOpenAsset(asset.id)} />
        ))}
      </div>
    </section>
  );
}

function OrphanCard({ asset, onOpen }: { asset: ContentAsset; onOpen: () => void }) {
  // No opportunity argument — pipelineStage derives writing/…/armed/live from the
  // asset alone, which is exactly what an orphan needs.
  const stage = pipelineStage({ asset });
  const armed = stage === "armed";
  const title = asset.title || asset.sourceOpportunityTitle || asset.slug;
  return (
    <div className="grid min-w-[190px] max-w-[210px] gap-1.5 rounded-md border border-[#ded8ce] bg-white p-2.5">
      <StageChip stage={stage} />
      <strong className="text-[10px] leading-[1.4] text-[#2c2c2c]">{title}</strong>
      {armed && asset.scheduledPublishAt ? (
        <span className="flex items-center gap-1 text-[8px] font-medium text-amber-800">
          <Clock className="h-2.5 w-2.5" /> Goes live{" "}
          {format(new Date(asset.scheduledPublishAt), "MMM d, HH:mm")}
        </span>
      ) : null}
      <div className="mt-0.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-[4px] border border-[#ded8ce] bg-[#f7f4ed] px-1.5 py-1 text-[8px] font-medium text-[#5c6470] hover:border-[#c2b7a7] hover:bg-[#f1ece1]"
        >
          Open draft
        </button>
        {armed ? (
          // Routes to the editor's schedule control — the one place a go-live is
          // cancelled (Postgres is authoritative for the cron; clearing the blob
          // mirror alone would not stop the publish).
          <button
            type="button"
            onClick={onOpen}
            className="rounded-[4px] border border-amber-400 bg-amber-50 px-1.5 py-1 text-[8px] font-medium text-amber-800 hover:bg-amber-100"
          >
            Cancel go-live
          </button>
        ) : null}
      </div>
    </div>
  );
}
