import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { getState } from "@/lib/store";
import { generateContentForOpportunity } from "@/lib/mock-ai";
import type { AssetType } from "@/lib/types";

export const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "brief", label: "Content brief" },
  { value: "article", label: "Full article" },
  { value: "servicePage", label: "Service page" },
  { value: "landingPage", label: "Landing page" },
  { value: "faq", label: "FAQ section" },
  { value: "comparison", label: "Comparison" },
  { value: "gbpPost", label: "Google Business post" },
  { value: "meta", label: "Meta title / description" },
  { value: "socialPack", label: "Social post pack" },
];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = ASSET_TYPE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<AssetType, string>,
);

export function CreateContentDialog({
  opportunityId,
  open,
  onOpenChange,
}: {
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  // Look up via getState() (not useStore): the selector depends on the
  // opportunityId prop, and this app's useStore only re-runs selectors when the
  // store state itself changes — it would return a stale value here. The opp is
  // static while the dialog is open, so a non-reactive read is correct.
  const opp = opportunityId ? getState().opportunities.find((o) => o.id === opportunityId) : undefined;
  const [assetType, setAssetType] = useState<AssetType>("brief");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (!opp) return;
    setGenerating(true);
    try {
      const asset = await generateContentForOpportunity(opp.id, assetType);
      toast.success("Content created");
      onOpenChange(false);
      navigate({ to: "/app/editor", search: { id: asset.id } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Content generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!generating ? onOpenChange(o) : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Create content from this opportunity</DialogTitle>
          <DialogDescription>
            {opp ? (
              <>
                <span className="text-foreground/85">{opp.title}</span>
                <br />
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {opp.status}
                  {opp.source ? ` · from ${opp.source}` : ""} · {opp.language}
                </span>
              </>
            ) : (
              "Select an opportunity first."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Content type
          </label>
          <Select value={assetType} onValueChange={(v) => setAssetType(v as AssetType)} disabled={generating}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={generating || !opp}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
