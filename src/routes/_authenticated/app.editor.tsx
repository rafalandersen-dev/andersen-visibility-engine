import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useStore,
  upsertContent,
  deleteContentAsset,
  saveWorkspaceNow,
  updateOpportunity,
  getState,
  reloadWorkspaceForUser,
} from "@/lib/store";
import { useT } from "@/i18n";
import {
  generateMetadata,
  generateFaq,
  generateCta,
  sendContentToWebsite,
  publishContentLive,
} from "@/lib/mock-ai";
import { effectivePublishMode } from "@/lib/publish-targets";
import { pipelineStage } from "@/lib/pipeline";
import { StageChip } from "@/components/StageChip";
import {
  cancelScheduledPublishFn,
  scheduleContentPublishFn,
  SCHEDULE_TICK_MS,
} from "@/lib/schedule.functions";
import { CreateContentDialog, ASSET_TYPE_LABELS } from "@/components/CreateContentDialog";
import { MiloScorePanel } from "@/components/MiloScorePanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  ContentAsset,
  ContentStatus,
  PublishDestinationType,
  PublishStatus,
  LivePublishStatus,
} from "@/lib/types";
import { formatDateTime } from "@/lib/format";
// P0.3 — Preview and Export use the SAME canonical converter as publishing, so
// what you see is what publishes (tables, links, bold, ordered lists included).
// P0.4 — resolve internal links against the same inventory the publisher uses,
// so preview parity holds and dropped links can be flagged.
import { markdownToHtml, unresolvedInternalLinks } from "@/lib/markdown";
import { buildKnownInternalPaths } from "@/lib/publish-targets";

/** Presentation-only styling for the preview's canonical semantic HTML. */
const PREVIEW_STYLE = `
.milo-preview{color:var(--foreground);line-height:1.65;font-size:.95rem}
.milo-preview h1{font-family:Fraunces,serif;font-size:1.875rem;margin:0 0 .75rem;letter-spacing:-.015em}
.milo-preview h2{font-family:Fraunces,serif;font-size:1.35rem;margin:1.5rem 0 .5rem}
.milo-preview h3{font-family:Fraunces,serif;font-size:1.1rem;margin:1.25rem 0 .4rem}
.milo-preview h4,.milo-preview h5,.milo-preview h6{font-family:Fraunces,serif;margin:1rem 0 .35rem}
.milo-preview p{margin:.5rem 0}
.milo-preview ul,.milo-preview ol{padding-left:1.3rem;margin:.5rem 0}
.milo-preview li{margin:.2rem 0}
.milo-preview a{color:#9a6716;text-decoration:underline}
.milo-preview strong{font-weight:600}
.milo-preview em{font-style:italic}
.milo-preview table{border-collapse:collapse;margin:.75rem 0;width:100%;font-size:.9rem}
.milo-preview th,.milo-preview td{border:1px solid var(--border);padding:.4rem .6rem;text-align:left}
.milo-preview thead th{background:var(--secondary)}
`;
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileEdit,
  FilePlus2,
  FileX,
  Globe,
  Loader2,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/editor")({
  validateSearch: z.object({ id: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Content Editor — Milo Growth" },
      { name: "description", content: "Refine AI-drafted content, manage metadata and export." },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const t = useT();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const assets = useStore((s) => s.content.filter((c) => c.projectId === activeProjectId));
  const search = Route.useSearch();
  const initialId = search.id ?? assets[0]?.id;
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && assets[0]) setSelectedId(assets[0].id);
  }, [assets, selectedId]);

  async function confirmDelete() {
    const id = deleteId;
    if (!id) return;
    // Choose the asset to open next: the one that takes this row's place,
    // else the previous one, else none (empty editor state).
    const idx = assets.findIndex((a) => a.id === id);
    const remaining = assets.filter((a) => a.id !== id);
    const next = remaining[idx] ?? remaining[idx - 1];

    // Compensating write: a deleted asset must not stay armed in the publish
    // queue. The runner would otherwise wake up, fail to find it, and park the
    // row as a failure the user cannot explain. Best-effort — a queue that is
    // already draining should never block the delete the user asked for.
    const wasScheduled = assets.find((a) => a.id === id)?.scheduledPublishStatus === "pending";
    if (wasScheduled) {
      try {
        await cancelScheduledPublishFn({ data: { assetId: id } });
      } catch {
        // Swallowed deliberately: publish.server refuses to publish a missing
        // asset anyway, so the worst case is a stale row, not a stray publish.
      }
    }

    deleteContentAsset(id);
    setDeleteId(null);
    if (id === selectedId) setSelectedId(next?.id);
    await saveWorkspaceNow();
    toast.success("Content asset deleted");
  }

  // Follow ?id changes (e.g. generating from the Editor entry point, which
  // navigates to the same route) so the newly created asset opens immediately.
  useEffect(() => {
    if (search.id && search.id !== selectedId) setSelectedId(search.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.id]);

  const asset = useMemo(() => assets.find((a) => a.id === selectedId), [assets, selectedId]);

  return (
    <AppShell title={t("editor.title")} description={t("editor.subtitle")}>
      <div className="grid lg:grid-cols-[260px,1fr] gap-6">
        <aside className="rounded-lg border border-border bg-card p-3 h-fit">
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {t("editor.assets")}
          </div>
          <ul className="mt-1 space-y-0.5">
            {assets.length === 0 ? (
              <li className="px-2 py-6 text-xs text-muted-foreground">
                Open Plan and use “Create linked draft” on an opportunity to generate your first
                asset.
              </li>
            ) : (
              assets.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelectedId(a.id)}
                    className={
                      "w-full text-left rounded-md px-3 py-2 transition-colors " +
                      (selectedId === a.id ? "bg-accent/25" : "hover:bg-secondary/60")
                    }
                  >
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
                      {a.assetType ? `${ASSET_TYPE_LABELS[a.assetType]} · ` : ""}
                      {t(`status.${a.status}`)}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        {asset ? (
          <Editor key={asset.id} asset={asset} onRequestDelete={() => setDeleteId(asset.id)} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <div className="font-display text-lg mb-1">{t("editor.noAssetSelectedTitle")}</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Open <span className="font-medium text-foreground">Plan</span> and click{" "}
              <span className="font-medium text-foreground">Create linked draft</span> on an
              opportunity to generate your first asset. It will appear in this editor.
            </p>
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.action.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this draft from the editor. The opportunity it came from
              stays, and any scheduled publish for it is cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("editor.action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Editor({ asset, onRequestDelete }: { asset: ContentAsset; onRequestDelete: () => void }) {
  const t = useT();
  const [f, setF] = useState<ContentAsset>(asset);
  const [busy, setBusy] = useState<string | null>(null);
  const [contentOpen, setContentOpen] = useState(false);
  // ---- Go-live scheduling (increment 2) ----
  const goLiveId = useId();
  const [goLiveLocal, setGoLiveLocal] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const sourceOppId = asset.sourceOpportunityId ?? asset.opportunityId ?? null;

  // ---- Publishing v1 ----
  const project = useStore((s) => s.projects.find((p) => p.id === asset.projectId));
  const projectContent = useStore((s) => s.content.filter((c) => c.projectId === asset.projectId));
  const isWordPress = project?.connectorType === "wordpress";
  const isShopify = project?.connectorType === "shopify";
  // The same deterministic internal-path inventory the publisher uses, so Preview
  // and Export match what actually publishes (P0.4). Custom-endpoint projects send
  // raw markdown downstream (links kept), so preview keeps them too.
  const renderOpts = useMemo(() => {
    if (project?.connectorType === "custom") return { keepAllInternalLinks: true };
    if (project) return { knownInternalPaths: new Set(buildKnownInternalPaths(project, projectContent)) };
    return {};
  }, [project, projectContent]);
  // In-body internal links that won't publish as active links because they can't
  // be verified against the inventory — surfaced so the drop is never silent.
  const droppedInternalLinks = useMemo(
    () =>
      renderOpts.knownInternalPaths
        ? unresolvedInternalLinks(f.markdown, renderOpts.knownInternalPaths)
        : [],
    [f.markdown, renderOpts],
  );
  const wpConfigured = Boolean(
    project?.wordpress?.siteUrl &&
    project?.wordpress?.username &&
    project?.wordpress?.applicationPassword,
  );
  const shopifyConfigured = Boolean(
    project?.shopify?.shopDomain &&
    project?.shopify?.adminAccessToken &&
    project?.shopify?.defaultBlogId,
  );
  const publishConfigured = isWordPress
    ? wpConfigured
    : isShopify
      ? shopifyConfigured
      : Boolean(project?.publishEndpoint && project?.publishSecret);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [destType, setDestType] = useState<PublishDestinationType>(
    project?.defaultDestinationType ?? "blogPost",
  );
  const [publishSlug, setPublishSlug] = useState(asset.slug);
  // ---- Publishing v1.1 (live + auto-publish) ----
  // Coerced, not stored: the retired autoPublishApproved reads as manualLive.
  const publishMode = effectivePublishMode(project);
  const liveConfigured = isWordPress
    ? wpConfigured
    : isShopify
      ? shopifyConfigured
      : Boolean(project?.livePublishEndpoint && project?.publishSecret);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [publishingLive, setPublishingLive] = useState(false);
  const outlineId = useId();
  const internalLinksId = useId();
  const schemaId = useId();
  const upd = <K extends keyof ContentAsset>(k: K, v: ContentAsset[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  // Mirror of the stored asset, read inside save() to detect content changes
  // since the last Milo Score (kept in sync by the fromStore effect below).
  const fromStoreRef = useRef<ContentAsset | undefined>(asset);

  const save = (status?: ContentStatus) => {
    // If content changed since the last Milo Score, mark the score stale so the
    // panel prompts a re-evaluation (status-only saves don't mark it stale).
    const stored = fromStoreRef.current;
    const contentChanged =
      !!stored &&
      (stored.markdown !== f.markdown ||
        stored.title !== f.title ||
        stored.h1 !== f.h1 ||
        stored.metaTitle !== f.metaTitle ||
        stored.metaDescription !== f.metaDescription ||
        stored.cta !== f.cta);
    const next = {
      // Merge, never replace: saving after a publish must not drop the
      // publish/schedule fields the form does not own (see mergeEditorEdits).
      ...mergeEditorEdits(f),
      status: status ?? f.status,
      updatedAt: new Date().toISOString(),
      qualityScoreStale: f.qualityScore
        ? f.qualityScoreStale || contentChanged
        : f.qualityScoreStale,
    };
    setF(next);
    upsertContent(next);
    const opportunityId = next.opportunityId ?? next.sourceOpportunityId;
    if (opportunityId) {
      const opportunityStatus =
        next.status === "In Review"
          ? "in_review"
          : next.status === "Approved" || next.status === "Exported"
            ? "approved"
            : "drafting";
      updateOpportunity(opportunityId, {
        status: opportunityStatus,
        currentContentAssetId: next.id,
      });
    }
    toast.success(status ? `Marked ${status}` : "Saved");
  };

  /**
   * Merge the form's own fields onto the CURRENT stored record.
   *
   * `upsertContent` replaces the record rather than merging it, and `f` is only
   * re-synced from the store by an effect keyed on `updatedAt` — but the
   * publishing writes (markContentAssetPublishedLive, markContentAssetSent) and
   * the scheduled runner do NOT bump `updatedAt`. So after a publish, `f` still
   * holds the pre-publish snapshot, and writing it back wholesale would drop
   * liveUrl, publishExternalId, wordpressPostId and the schedule mirror. Losing
   * wordpressPostId is the dangerous one: the next publish takes the CREATE
   * branch and puts a duplicate post on the customer's live site.
   *
   * Only these eleven fields belong to the form. Everything else is authored
   * elsewhere and must survive untouched.
   */
  const mergeEditorEdits = (local: ContentAsset): ContentAsset => {
    const stored = getState().content.find((c) => c.id === local.id);
    if (!stored) return local;
    return {
      ...stored,
      title: local.title,
      slug: local.slug,
      markdown: local.markdown,
      metaTitle: local.metaTitle,
      metaDescription: local.metaDescription,
      h1: local.h1,
      outline: local.outline,
      internalLinks: local.internalLinks,
      schemaSuggestions: local.schemaSuggestions,
      cta: local.cta,
      editorNotes: local.editorNotes,
    };
  };

  /**
   * Persist in-flight edits BEFORE any AI action reads from the store.
   * Every AI surface in the editor must call this first: these functions take
   * an assetId and re-read the asset from the store, so unsaved edits are both
   * invisible to them and destroyed by whatever they write back.
   */
  const flushPendingEdits = () => {
    const snapshot = { ...mergeEditorEdits(f), updatedAt: new Date().toISOString() };
    upsertContent(snapshot);
    setF(snapshot);
    return snapshot;
  };

  const aiAction = async (name: string, fn: () => Promise<void>) => {
    flushPendingEdits();
    setBusy(name);
    try {
      await fn();
      toast.success(`Regenerated ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setBusy(null);
    }
  };

  // sync with store after AI updates
  const fromStore = useStore((s) => s.content.find((c) => c.id === asset.id));
  fromStoreRef.current = fromStore ?? fromStoreRef.current;
  useEffect(() => {
    if (fromStore) setF(fromStore);
  }, [fromStore?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportText = (type: "md" | "html") => {
    const body = type === "md" ? f.markdown : markdownToHtml(f.markdown, renderOpts);
    const blob = new Blob([body], { type: type === "md" ? "text/markdown" : "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${f.slug || "asset"}.${type}`;
    a.click();
    URL.revokeObjectURL(url);
    save("Exported");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(f.markdown);
    toast.success("Copied Markdown to clipboard");
  };

  // Publish status reads from the live store value (publish actions don't bump
  // updatedAt, so the local `f` copy would otherwise show a stale status).
  const live = fromStore ?? asset;

  /**
   * A datetime-local input yields a ZONELESS string ("2026-07-21T09:00"), which
   * the server rejects outright — it would otherwise be read as UTC while the
   * label rendered local time, publishing two hours late for every PL/SE/DK user.
   * We convert to a real instant here and send the IANA zone alongside it.
   */
  // Derived from the live store copy, not the local form: publish actions do not
  // bump updatedAt, so `f` can lag behind the real publish state.
  const editorStage = pipelineStage({ asset: live });

  const goLiveInstant = goLiveLocal ? new Date(goLiveLocal) : null;
  const goLiveValid = Boolean(goLiveInstant && !Number.isNaN(goLiveInstant.getTime()));
  const goLiveLabel = goLiveValid ? formatDateTime(goLiveInstant!.toISOString()) : "…";
  // The runner ticks every five minutes, so a nearer slot would render a
  // minute-precise promise on a five-minute grid.
  const minGoLiveLocal = new Date(Date.now() + SCHEDULE_TICK_MS).toISOString().slice(0, 16);
  const scheduleOverdue =
    live.scheduledPublishStatus === "pending" &&
    Boolean(live.scheduledPublishAt) &&
    Date.now() - new Date(live.scheduledPublishAt!).getTime() > 15 * 60_000;
  // Only a ready article, on a connector that can publish, offers scheduling.
  const canSchedule =
    live.status === "Approved" &&
    publishMode !== "draftOnly" &&
    live.livePublishStatus !== "published";

  async function refreshWorkspace() {
    const uid = getState().userId;
    if (uid) await reloadWorkspaceForUser(uid);
  }

  async function armSchedule() {
    if (!goLiveValid) return;
    setScheduling(true);
    try {
      await scheduleContentPublishFn({
        data: {
          assetId: asset.id,
          publishAt: goLiveInstant!.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      // The mirror is written SERVER-side by the scheduling fn, so the client has
      // to re-read the workspace or the editor would keep showing the old state.
      await refreshWorkspace();
      toast.success(t("editor.schedule.armed", { when: goLiveLabel }));
      setGoLiveLocal("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the publish");
    } finally {
      setScheduling(false);
    }
  }

  async function cancelSchedule() {
    setScheduling(true);
    try {
      const res = await cancelScheduledPublishFn({ data: { assetId: asset.id } });
      if (!res.cancelled) {
        // Honest refusal: the row is already claimed and the article is going out.
        toast.error(t("editor.schedule.inFlight"));
        return;
      }
      await refreshWorkspace();
      toast.success(t("editor.schedule.cancelled"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the go-live");
    } finally {
      setScheduling(false);
    }
  }

  function openSend() {
    setPublishSlug(f.slug || asset.slug);
    setDestType(project?.defaultDestinationType ?? "blogPost");
    setSendOpen(true);
  }

  async function doSend() {
    setSending(true);
    try {
      await sendContentToWebsite(asset.id, destType, publishSlug);
      toast.success("Draft sent to website");
      setSendOpen(false);
    } catch (e) {
      // Status is now stored as "failed" with the error; keep the modal open for retry.
      toast.error(e instanceof Error ? e.message : "Could not send draft to website");
    } finally {
      setSending(false);
    }
  }

  /**
   * "Looks good" — an EDITORIAL VERDICT with zero distribution side effect, in
   * every mode, with no setting that changes it.
   *
   * This used to call runAutoPublishOnApprove, so in autoPublishApproved mode
   * approving an article published it to the customer's live site immediately —
   * ignoring the go-live date the same UI had just required. That was the
   * owner's reported surprise, and it is now structurally impossible: approving
   * and publishing are different verbs and this one never distributes.
   */
  function approve() {
    save("Approved");
    toast.success(t("editor.approve.readyToast"));
  }

  async function doPublishLive() {
    setPublishingLive(true);
    try {
      await publishContentLive(asset.id);
      const published = getState().content.find((item) => item.id === asset.id);
      const opportunityId = published?.opportunityId ?? published?.sourceOpportunityId;
      if (published && opportunityId) {
        updateOpportunity(opportunityId, {
          status: "published",
          currentContentAssetId: published.id,
          canonicalUrl: published.liveUrl,
          publishedAt: published.livePublishedAt,
          measurementStatus: "collecting",
        });
      }
      toast.success("Published live");
      setLiveConfirmOpen(false);
    } catch (e) {
      // Status stored as "failed"; keep draft state + content intact for retry.
      toast.error(e instanceof Error ? e.message : "Could not publish live");
    } finally {
      setPublishingLive(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Asset metadata header (Content Engine 2.0) */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          {f.assetType ? (
            <span className="text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border bg-accent/30 border-accent/40 text-accent-foreground">
              {ASSET_TYPE_LABELS[f.assetType]}
            </span>
          ) : null}
          <h2 className="font-display text-lg text-foreground">{f.title}</h2>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {f.sourceOpportunityTitle ? (
            <span>
              Source: <span className="text-foreground/75">{f.sourceOpportunityTitle}</span>
              {f.sourceType && f.sourceType !== "opportunity" ? ` (${f.sourceType})` : ""}
            </span>
          ) : null}
          {f.language ? (
            <span>
              {t("onboarding.summary.language")}: {f.language}
            </span>
          ) : null}
          <span>{formatDateTime(f.createdAt ?? f.updatedAt)}</span>
          <span>
            {t("editor.status")}: {t(`status.${f.status}`)}
          </span>
          {/* Same chip the Plan board renders, so "where is this" reads
              identically on both screens. It knows things the status alone does
              not: armed, sent to the site, failed, already live. */}
          <StageChip
            stage={editorStage}
            detail={
              live.scheduledPublishAt ? formatDateTime(live.scheduledPublishAt) : undefined
            }
          />
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground/80">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold/80 mt-0.5" />
          <span>{t("editor.aiReviewNote")}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {t("editor.status")}
          </span>
          <Select
            value={f.status}
            // Plain status write. Selecting "Approved" here used to invoke approve(),
            // which published live with no confirmation — an irreversible act on a
            // control that reads as reversible. Approving never distributes now, so
            // this is a straightforward save either way.
            onValueChange={(v) => save(v as ContentStatus)}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Draft", "In Review", "Approved", "Rejected", "Exported"] as ContentStatus[]).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {sourceOppId ? (
            <Button size="sm" variant="outline" onClick={() => setContentOpen(true)}>
              <FilePlus2 className="h-3.5 w-3.5" /> {t("editor.action.createContent")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => save("Draft")}>
            <FileEdit className="h-3.5 w-3.5" /> {t("editor.action.saveDraft")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => save("In Review")}>
            {t("editor.action.markInReview")}
          </Button>
          {/* No busy state: approving is a local status write now, not a network
              publish. The spinner existed only for the auto-publish call. */}
          <Button size="sm" variant="outline" onClick={approve}>
            <Check className="h-3.5 w-3.5" /> {t("editor.action.approve")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => save("Rejected")}>
            <FileX className="h-3.5 w-3.5" /> {t("editor.action.reject")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRequestDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("editor.action.delete")}
          </Button>
        </div>
      </div>

      {/* Publishing v1 — send approved content to the connected website as a draft */}
      <div className="px-5 py-3 border-b border-border">
        {!publishConfigured ? (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-gold/80" />
            <Link to="/app/setup" className="underline underline-offset-4 hover:text-foreground">
              {t("editor.publish.connectHint")}
            </Link>
          </p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button size="sm" variant="outline" onClick={openSend}>
                <Send className="h-3.5 w-3.5" />
                {live.publishStatus === "sent"
                  ? t("editor.publish.reSendToWebsite")
                  : t("editor.publish.sendToWebsite")}
              </Button>
              <PublishStatusBadge status={live.publishStatus} />
              {live.publishPlatform === "wordpress" && live.wordpressPostId ? (
                <span className="text-xs text-muted-foreground">
                  WordPress #{live.wordpressPostId} · {live.wordpressPostType}
                </span>
              ) : null}
              {live.publishPlatform === "shopify" && live.shopifyArticleId ? (
                <span className="text-xs text-muted-foreground">
                  Shopify #{live.shopifyArticleId} ·{" "}
                  {live.shopifyStatus === "published"
                    ? t("shopify.statusPublished")
                    : t("shopify.statusDraft")}
                  {live.shopifyHandle ? ` · ${live.shopifyHandle}` : ""}
                </span>
              ) : null}
              {live.lastPublishedAt ? (
                <span className="text-xs text-muted-foreground">
                  {live.publishStatus === "failed" ? "Last attempt" : "Sent"}{" "}
                  {formatDateTime(live.lastPublishedAt)}
                </span>
              ) : null}
              {live.publishedDraftUrl ? (
                <a
                  href={live.publishedDraftUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-foreground/80 underline underline-offset-4 inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> {t("editor.publish.viewDraft")}
                </a>
              ) : null}
              {live.publishStatus === "failed" && live.lastPublishError ? (
                <span className="text-xs text-destructive">{live.lastPublishError}</span>
              ) : null}
            </div>

            {live.publishStatus === "sent" && publishMode !== "draftOnly" ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2.5 border-t border-border/60">
                <Button
                  size="sm"
                  onClick={() => setLiveConfirmOpen(true)}
                  disabled={!liveConfigured || publishingLive}
                >
                  {publishingLive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Rocket className="h-3.5 w-3.5" />
                  )}
                  {live.livePublishStatus === "published"
                    ? t("editor.publish.rePublishLive")
                    : t("editor.publish.publishLive")}
                </Button>
                <LivePublishStatusBadge status={live.livePublishStatus} />
                {live.livePublishedAt ? (
                  <span className="text-xs text-muted-foreground">
                    {live.livePublishStatus === "failed" ? "Last attempt" : "Published"}{" "}
                    {formatDateTime(live.livePublishedAt)}
                  </span>
                ) : null}
                {live.liveUrl ? (
                  <a
                    href={live.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-foreground/80 underline underline-offset-4 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> {t("editor.publish.viewLive")}
                  </a>
                ) : null}
                {!liveConfigured ? (
                  <span className="text-xs text-muted-foreground">
                    Add a live publish endpoint in{" "}
                    <Link
                      to="/app/setup"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      Project Setup
                    </Link>
                    .
                  </span>
                ) : null}
                {live.livePublishStatus === "failed" && live.livePublishError ? (
                  <span className="text-xs text-destructive">{live.livePublishError}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {/*
          Scheduled-publish outcome. The background runner records failures on
          the asset, but until now nothing rendered them — a scheduled publish
          could fail and the only way to find out was to query the database.
          Shown regardless of connector, since the runner covers all of them.
        */}
        {live.scheduledPublishStatus === "failed" && live.scheduledPublishError ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <div className="text-xs font-medium text-destructive">
              {t("editor.schedule.failedTitle")}
            </div>
            <p className="mt-0.5 text-xs text-destructive/90">{live.scheduledPublishError}</p>
          </div>
        ) : live.scheduledPublishStatus === "pending" && live.scheduledPublishAt ? (
          <div
            className={
              "mt-3 rounded-md border px-3 py-2 " +
              (scheduleOverdue
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-secondary/40")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={
                  "text-xs " + (scheduleOverdue ? "text-amber-700" : "text-muted-foreground")
                }
              >
                {/* Overdue is not "still scheduled". A pending row well past its
                    time means nothing fired, and saying "Scheduled" there is the
                    exact lie this increment exists to remove. */}
                {scheduleOverdue
                  ? t("editor.schedule.overdue", { when: formatDateTime(live.scheduledPublishAt) })
                  : t("editor.schedule.pending", { when: formatDateTime(live.scheduledPublishAt) })}
              </span>
              <Button size="sm" variant="ghost" onClick={cancelSchedule} disabled={scheduling}>
                {t("editor.schedule.cancel")}
              </Button>
            </div>
            {live.scheduledPublishError ? (
              <p className="mt-1 text-xs text-amber-700">{live.scheduledPublishError}</p>
            ) : null}
          </div>
        ) : canSchedule ? (
          <div className="mt-3 rounded-md border border-border bg-card px-3 py-3">
            <div className="text-xs font-medium text-foreground">{t("editor.schedule.title")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("editor.schedule.hint")}</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor={goLiveId} className="text-[10px] uppercase tracking-[0.14em]">
                  {t("editor.schedule.pickLabel")}
                </Label>
                <Input
                  id={goLiveId}
                  type="datetime-local"
                  className="h-8 w-56 text-xs"
                  value={goLiveLocal}
                  min={minGoLiveLocal}
                  onChange={(e) => setGoLiveLocal(e.target.value)}
                />
              </div>
              {/* Picking a date is inert. Only this press arms anything, and its
                  label states the consequence in the user's own timezone. */}
              <Button size="sm" onClick={armSchedule} disabled={!goLiveLocal || scheduling}>
                {scheduling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarClock className="h-3.5 w-3.5" />
                )}
                {scheduling
                  ? t("editor.schedule.arming")
                  : t("editor.schedule.arm", { when: goLiveLabel })}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Milo Score — publishing readiness (Content Quality Engine v1) */}
      <div className="px-5 py-4 border-b border-border">
        <MiloScorePanel asset={live} onBeforeAiAction={flushPendingEdits} />
      </div>

      <CreateContentDialog
        opportunityId={contentOpen ? sourceOppId : null}
        open={contentOpen}
        onOpenChange={setContentOpen}
      />

      <Dialog open={sendOpen} onOpenChange={(o) => (!sending ? setSendOpen(o) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{t("editor.sendModal.title")}</DialogTitle>
            <DialogDescription>{t("editor.sendModal.body")}</DialogDescription>
          </DialogHeader>

          {f.status !== "Approved" ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground/80">
              {t("editor.sendModal.unapproved")}
            </div>
          ) : null}

          {live.qualityScore?.publishingRecommendation === "notReady" ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground/80">
              {t("quality.publishWarnNotReady")}
            </div>
          ) : !live.qualityScore ? (
            <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              {t("quality.publishWarnNoScore")}
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("editor.sendModal.destinationType")}
              </label>
              <Select
                value={destType}
                onValueChange={(v) => setDestType(v as PublishDestinationType)}
                disabled={sending}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blogPost">Blog post</SelectItem>
                  <SelectItem value="servicePage">Service page</SelectItem>
                  <SelectItem value="faq">FAQ section</SelectItem>
                  <SelectItem value="landingPage">Landing page</SelectItem>
                </SelectContent>
              </Select>
              {isShopify && destType !== "blogPost" ? (
                <p className="mt-1.5 text-xs text-amber-600">{t("shopify.blogOnly")}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("editor.sendModal.slug")}
              </label>
              <Input
                className="mt-1.5"
                value={publishSlug}
                onChange={(e) => setPublishSlug(e.target.value)}
                disabled={sending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={doSend} disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? t("editor.sendModal.sending") : t("editor.sendModal.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={liveConfirmOpen}
        onOpenChange={(o) => {
          if (!publishingLive) setLiveConfirmOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.liveModal.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("editor.liveModal.body")}
              {live.qualityScore?.publishingRecommendation === "notReady" ? (
                <span className="mt-2 block font-medium text-destructive">
                  {t("quality.publishWarnNotReady")}
                </span>
              ) : !live.qualityScore ? (
                <span className="mt-2 block text-muted-foreground">
                  {t("quality.publishWarnNoScore")}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishingLive}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doPublishLive();
              }}
              disabled={publishingLive}
            >
              {publishingLive ? t("editor.liveModal.publishing") : t("editor.liveModal.publish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="content" className="px-5 pt-3">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="meta">Metadata</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 py-5">
          <Field label="Title">
            {(id) => (
              <Input id={id} value={f.title} onChange={(e) => upd("title", e.target.value)} />
            )}
          </Field>
          <Field label="H1">
            {(id) => <Input id={id} value={f.h1} onChange={(e) => upd("h1", e.target.value)} />}
          </Field>
          <Field label="Markdown content">
            {(id) => (
              <Textarea
                id={id}
                rows={16}
                className="font-mono text-xs"
                value={f.markdown}
                onChange={(e) => upd("markdown", e.target.value)}
              />
            )}
          </Field>
          <Field label="Editor notes">
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={f.editorNotes}
                onChange={(e) => upd("editorNotes", e.target.value)}
              />
            )}
          </Field>
        </TabsContent>

        <TabsContent value="meta" className="space-y-4 py-5">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "metadata"}
              onClick={() => aiAction("metadata", () => generateMetadata(asset.id))}
            >
              {busy === "metadata" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Regenerate metadata
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "cta"}
              onClick={() => aiAction("cta", () => generateCta(asset.id))}
            >
              {busy === "cta" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Regenerate CTA
            </Button>
          </div>
          <Field label="Slug">
            {(id) => <Input id={id} value={f.slug} onChange={(e) => upd("slug", e.target.value)} />}
          </Field>
          <Field label={`Meta title (${f.metaTitle.length}/60)`}>
            {(id) => (
              <Input
                id={id}
                value={f.metaTitle}
                onChange={(e) => upd("metaTitle", e.target.value)}
              />
            )}
          </Field>
          <Field label={`Meta description (${f.metaDescription.length}/160)`}>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={f.metaDescription}
                onChange={(e) => upd("metaDescription", e.target.value)}
              />
            )}
          </Field>
          <Field label="Primary CTA">
            {(id) => <Input id={id} value={f.cta} onChange={(e) => upd("cta", e.target.value)} />}
          </Field>
        </TabsContent>

        <TabsContent value="structure" className="space-y-5 py-5">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor={outlineId} className="text-xs">
                Outline
              </Label>
            </div>
            <Textarea
              id={outlineId}
              rows={6}
              value={f.outline.join("\n")}
              onChange={(e) => upd("outline", e.target.value.split("\n").filter(Boolean))}
              className="mt-1.5"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">FAQ</Label>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === "faq"}
                onClick={() => aiAction("faq", () => generateFaq(asset.id))}
              >
                {busy === "faq" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Regenerate
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {f.faq.map((q, i) => (
                <div key={i} className="rounded-md border border-border p-3">
                  <Input
                    className="font-medium"
                    value={q.q}
                    onChange={(e) =>
                      upd(
                        "faq",
                        f.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)),
                      )
                    }
                  />
                  <Textarea
                    rows={2}
                    className="mt-2"
                    value={q.a}
                    onChange={(e) =>
                      upd(
                        "faq",
                        f.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={internalLinksId} className="text-xs">
                Internal link suggestions
              </Label>
              <Textarea
                id={internalLinksId}
                rows={4}
                className="mt-1.5 font-mono text-xs"
                value={f.internalLinks.join("\n")}
                onChange={(e) => upd("internalLinks", e.target.value.split("\n").filter(Boolean))}
              />
            </div>
            <div>
              <Label htmlFor={schemaId} className="text-xs">
                Schema notes
              </Label>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {isWordPress || isShopify ? (
                  <>
                    When you publish to {isWordPress ? "WordPress" : "Shopify"}, Milo includes valid
                    Article and FAQ structured data (schema.org JSON-LD) built from this
                    article&apos;s title and the FAQ written into the body. Whether your site keeps
                    inline structured data depends on your CMS setup (for example, a WordPress user
                    without the <span className="font-mono">unfiltered_html</span> capability, or an
                    SEO plugin that already outputs schema), so Milo can&apos;t confirm it was
                    retained — check with Google&apos;s Rich Results Test after publishing. Even when
                    retained, this makes the page <strong>eligible</strong> for rich results where it
                    qualifies; it does not guarantee a rich result <strong>appears</strong> (the
                    search engine decides that).
                  </>
                ) : (
                  <>
                    Structured data (schema.org JSON-LD) is generated for this article, but Milo does
                    not yet send it to a custom endpoint — your connector would need to add it. Milo
                    never guarantees a rich result appears; the search engine decides that.
                  </>
                )}{" "}
                The notes below are for your own reference and are not published.
              </p>
              <Textarea
                id={schemaId}
                rows={3}
                className="mt-1.5 font-mono text-xs"
                value={f.schemaSuggestions.join("\n")}
                onChange={(e) =>
                  upd("schemaSuggestions", e.target.value.split("\n").filter(Boolean))
                }
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="py-5">
          {/* Presentation only — the HTML comes from the canonical publish
              converter (markdown.ts), so the STRUCTURE matches what publishes.
              This <style> just makes the bare semantic tags readable here, the
              way a customer's theme styles them on the live site. */}
          <style>{PREVIEW_STYLE}</style>
          {droppedInternalLinks.length > 0 ? (
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-foreground/80">
              {droppedInternalLinks.length} internal link
              {droppedInternalLinks.length === 1 ? "" : "s"} won&apos;t publish as{" "}
              {droppedInternalLinks.length === 1 ? "a link" : "links"} because we can&apos;t confirm{" "}
              {droppedInternalLinks.length === 1 ? "it points" : "they point"} to a real page on your
              site: <span className="font-mono">{droppedInternalLinks.join(", ")}</span>. The text
              stays; the link is removed. Publish {droppedInternalLinks.length === 1 ? "it" : "them"}{" "}
              first, or link to a page Milo has already published.
            </div>
          ) : null}
          <div
            className="milo-preview rounded-lg border border-border bg-background p-6"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(f.markdown, renderOpts) }}
          />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-border bg-secondary/30">
        <Button size="sm" variant="outline" onClick={() => exportText("md")}>
          <Download className="h-3.5 w-3.5" /> Export Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportText("html")}>
          <Download className="h-3.5 w-3.5" /> Export HTML
        </Button>
        <Button size="sm" variant="ghost" onClick={copy}>
          <Copy className="h-3.5 w-3.5" /> Copy Markdown
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          Updated {formatDateTime(f.updatedAt)}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1.5">{children(id)}</div>
    </div>
  );
}

function PublishStatusBadge({ status }: { status?: PublishStatus }) {
  const t = useT();
  const map = {
    sent: {
      key: "editor.publish.sent",
      cls: "bg-accent/30 border-accent/40 text-accent-foreground",
    },
    failed: {
      key: "editor.publish.failed",
      cls: "bg-destructive/10 border-destructive/30 text-destructive",
    },
    notSent: { key: "editor.publish.notSent", cls: "bg-muted border-border text-muted-foreground" },
  } as const;
  const { key, cls } = map[status ?? "notSent"];
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}
    >
      {t(key)}
    </span>
  );
}

function LivePublishStatusBadge({ status }: { status?: LivePublishStatus }) {
  const t = useT();
  const map = {
    published: {
      key: "editor.publish.published",
      cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-600",
    },
    failed: {
      key: "editor.publish.liveFailed",
      cls: "bg-destructive/10 border-destructive/30 text-destructive",
    },
    notPublished: {
      key: "editor.publish.notPublished",
      cls: "bg-muted border-border text-muted-foreground",
    },
  } as const;
  const { key, cls } = map[status ?? "notPublished"];
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}
    >
      {t(key)}
    </span>
  );
}

