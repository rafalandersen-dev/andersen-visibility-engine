import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { FilePlus2, Loader2, Sparkles } from "lucide-react";
import { getState } from "@/lib/store";
import { generateContentForOpportunity, createBlankDraftForOpportunity } from "@/lib/mock-ai";
import type { AssetType, ContentType } from "@/lib/types";
import { useT } from "@/i18n";

export const ASSET_TYPE_OPTIONS: readonly AssetType[] = [
  "brief",
  "article",
  "servicePage",
  "landingPage",
  "faq",
  "comparison",
  "gbpPost",
  "meta",
  "socialPack",
];

/**
 * P1-6 (2026-07-25): the type used to hard-reset to "brief" on every open —
 * users who didn't re-check generated the wrong asset type. The default now
 * derives from the OPPORTUNITY's content type, falling back to the last type
 * the user picked in this session, and the confirm button names the type.
 */
export function defaultAssetTypeFor(
  contentType: ContentType | string | undefined,
  lastChoice: AssetType | null,
): AssetType {
  const map: Record<string, AssetType> = {
    "Blog Article": "article",
    Guide: "article",
    "Landing Page": "landingPage",
    "Location Page": "landingPage",
    "Service Page": "servicePage",
    "FAQ Page": "faq",
    Comparison: "comparison",
  };
  return (contentType && map[contentType]) || lastChoice || "article";
}

let lastChosenType: AssetType | null = null;

export function CreateContentDialog({
  opportunityId,
  open,
  onOpenChange,
}: {
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  // Look up via getState() (not useStore): the selector depends on the
  // opportunityId prop, and this app's useStore only re-runs selectors when the
  // store state itself changes — it would return a stale value here. The opp is
  // static while the dialog is open, so a non-reactive read is correct.
  const opp = opportunityId
    ? getState().opportunities.find((o) => o.id === opportunityId)
    : undefined;
  const [assetType, setAssetType] = useState<AssetType>("article");
  const [busy, setBusy] = useState<null | "generate" | "blank">(null);
  // P1-5: failures stay VISIBLE — inline error + Retry, dialog stays open.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAssetType(defaultAssetTypeFor(opp?.contentType, lastChosenType));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive per open
  }, [open, opportunityId]);

  const chooseType = (v: AssetType) => {
    lastChosenType = v;
    setAssetType(v);
  };

  async function generate() {
    if (!opp) return;
    setBusy("generate");
    setError(null);
    try {
      const asset = await generateContentForOpportunity(opp.id, assetType);
      onOpenChange(false);
      // Toast AFTER navigation so the route-change toast sweep (P2-9) cannot
      // dismiss it unseen.
      await navigate({ to: "/app/editor", search: { id: asset.id } as never });
      toast.success(t("editorScreen.create.created"));
    } catch (e) {
      // P1-5: the dialog used to reset silently. Keep it open, show the
      // mapped gateway message, offer Retry.
      setError(e instanceof Error ? e.message : t("editorScreen.create.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function startBlank() {
    if (!opp) return;
    setBusy("blank");
    setError(null);
    try {
      const asset = await createBlankDraftForOpportunity(opp.id, assetType);
      onOpenChange(false);
      await navigate({ to: "/app/editor", search: { id: asset.id } as never });
      toast.success(t("editorScreen.create.blankCreated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("editorScreen.create.blankFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!busy ? onOpenChange(o) : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{t("editorScreen.create.title")}</DialogTitle>
          <DialogDescription>
            {opp ? (
              <>
                <span className="text-foreground/85">{opp.title}</span>
                <br />
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {opp.status}
                  {opp.source
                    ? ` · ${t("editorScreen.create.source", { source: opp.source })}`
                    : ""}{" "}
                  · {opp.language}
                </span>
              </>
            ) : (
              t("editorScreen.create.selectOpportunity")
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {t("editorScreen.create.type")}
          </label>
          <Select
            value={assetType}
            onValueChange={(v) => chooseType(v as AssetType)}
            disabled={!!busy}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`editorScreen.assetType.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {opp?.language ? (
            <p className="text-xs text-muted-foreground">
              {t("editorScreen.create.language", { language: opp.language })}
            </p>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-foreground/85"
          >
            <span className="font-medium">{t("editorScreen.create.errorLabel")}</span> {error}
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
            {t("common.cancel")}
          </Button>
          {/* P1-8: content work survives an empty AI balance. */}
          <Button variant="outline" onClick={startBlank} disabled={!!busy || !opp}>
            {busy === "blank" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus2 className="h-4 w-4" />
            )}
            {t("editorScreen.create.startBlank")}
          </Button>
          <Button onClick={generate} disabled={!!busy || !opp}>
            {busy === "generate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busy === "generate"
              ? t("editorScreen.create.generating")
              : error
                ? t("editorScreen.create.retry", { type: t(`editorScreen.assetType.${assetType}`) })
                : t("editorScreen.create.generate", {
                    type: t(`editorScreen.assetType.${assetType}`),
                  })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
