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
  approveProjectInternalPath,
  getState,
  reloadWorkspaceForUser,
} from "@/lib/store";
import { useT } from "@/i18n";
import {
  generateMetadata,
  generateFaq,
  generateCta,
  refreshSitemapInventory,
  sendContentToWebsite,
  publishContentLive,
  validateAssetSources,
} from "@/lib/mock-ai";
import { isControlledImageOrigin } from "@/lib/images";
import { hasPublishSecret } from "@/lib/launch";
import { normalizeSourceUrl } from "@/lib/sources";
import { generateArticleImageFn } from "@/lib/image-gen.functions";
import {
  uploadArticleImageFn,
  promoteArticleImageFn,
  removeArticleImageFn,
} from "@/lib/image-storage.functions";
import { reusedImageMeta } from "@/lib/image-storage";
import { editorFormDirty } from "@/lib/editor-form";
import {
  HOOK_TYPES,
  validateHook,
  newHookFromProposal,
  applyHookEdit,
  approveHook,
  verifiedSourcesForHook,
} from "@/lib/hook";
import { articleVisualPolicy } from "@/lib/visual-model";
import {
  serializeAnchor,
  parseAnchor,
  anchorSectionId,
  type PlacementAnchor,
  type AnchorKind,
} from "@/lib/anchors";
import { reconcileSectionIndex } from "@/lib/section-index";
import { resolveImageAnchors } from "@/lib/image-anchors";
import "@/styles/milo-image.css";
// Raw text of the SAME stylesheet, inlined into the mobile-preview iframe so
// the milo-m-* media query fires against the iframe's real 390px viewport.
import miloImageCss from "@/styles/milo-image.css?raw";
import { buildPreviewSrcDoc, poorMobileCropWarnings } from "@/lib/responsive-preview";
import { effectiveVisualState, beginVisualUpgrade, visualCompleteness } from "@/lib/visual-model";
import {
  buildArrangeModel,
  moveImageToAnchor,
  anchorFromDropzone,
  dropzoneLabel,
} from "@/lib/arrange-model";
import {
  IMAGE_SIZES,
  IMAGE_ALIGNMENTS,
  IMAGE_ASPECTS,
  IMAGE_FITS,
  IMAGE_STYLES,
  DEFAULT_PRESENTATION,
} from "@/lib/presentation-compiler";
import type {
  FeaturedImage,
  ImagePresentation,
  ImagePresentationOverride,
  PresentationVariant,
} from "@/lib/types";
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
  HookType,
  HookProposal,
} from "@/lib/types";
import { formatDateTime, formatDateTimeLocal } from "@/lib/format";
// P0.3 — Preview and Export use the SAME canonical converter as publishing, so
// what you see is what publishes (tables, links, bold, ordered lists included).
// P0.4 — resolve internal links against the same inventory the publisher uses,
// so preview parity holds and dropped links can be flagged.
import {
  markdownToHtml,
  classifyInternalLinks,
  linkPathToTextAt,
  removeLinkAt,
  replaceLinkPathAt,
  type ClassifiedInternalLink,
} from "@/lib/markdown";
import { buildKnownInternalPaths, buildActiveInternalPaths } from "@/lib/publish-targets";
import { assembleContentAsset } from "@/lib/content-assembler";
import { buildPublishingChecklist } from "@/lib/checklist";
import { schemaConnectorCapability } from "@/lib/schema-delivery";
import type { ChecklistItem } from "@/lib/types";

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
  AlertTriangle,
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
  Save,
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
  // Three-state internal-link model (link-safety P0), applied to EVERY connector
  // including the custom endpoint:
  //   VERIFIED      — root + a page Milo has published (deterministic inventory)
  //   USER_APPROVED — a path the user explicitly approved for this project
  //   UNRESOLVED    — anything else; publishing is BLOCKED until it is resolved.
  const verifiedPaths = useMemo(
    () => (project ? buildKnownInternalPaths(project, projectContent) : []),
    [project, projectContent],
  );
  const approvedPaths = useMemo(() => project?.approvedInternalPaths ?? [], [project]);
  // The ACTIVE set (verified ∪ approved) is what publishes as a live link, and is
  // exactly what Preview/Export/publish all pass to the converter — so what you
  // see is what publishes, on every connector.
  const activePaths = useMemo(
    () => (project ? buildActiveInternalPaths(project, projectContent) : []),
    [project, projectContent],
  );
  const renderOpts = useMemo(() => ({ knownInternalPaths: new Set(activePaths) }), [activePaths]);
  // Preview and Export render the CANONICAL assembled asset (P1.1 B) — the exact
  // markdown/HTML that publishes — so WYSIWYG parity holds. Identical to
  // markdownToHtml(f.markdown) for an asset with no Article-Studio-2.0 fields.
  const assembled = useMemo(
    () =>
      project
        ? assembleContentAsset(f, project, { activeInternalPaths: renderOpts.knownInternalPaths })
        : null,
    [f, project, renderOpts],
  );
  const classifiedLinks = useMemo(
    () => classifyInternalLinks(f.markdown, new Set(verifiedPaths), new Set(approvedPaths)),
    [f.markdown, verifiedPaths, approvedPaths],
  );
  const unresolvedLinks = useMemo(
    () => classifiedLinks.filter((l) => l.state === "UNRESOLVED"),
    [classifiedLinks],
  );
  const hasUnresolvedLinks = unresolvedLinks.length > 0;

  // Load the site's real page map when the editor opens (freshness-cached, so
  // this is a no-op within the TTL). It feeds verified paths AND the resolver's
  // Replace-with picker, so an invented "/services" can be repointed to a page
  // that actually exists in one click instead of being unresolvable.
  useEffect(() => {
    if (project?.id && project.websiteUrl) {
      refreshSitemapInventory(project.id).catch(() => null);
    }
  }, [project?.id, project?.websiteUrl]);

  // ---- Publishing checklist (P1.1 J) — the same deterministic gate the server
  // uses, so the editor and the runner agree on what is safe to publish. ----
  const checklist = useMemo(
    () => (project ? buildPublishingChecklist(f, project, projectContent) : []),
    [f, project, projectContent],
  );
  const publishBlockers = useMemo(
    () => checklist.filter((i) => i.blocking && !i.passed),
    [checklist],
  );
  const publishBlocked = publishBlockers.length > 0;
  const schemaCapability = useMemo(
    () => schemaConnectorCapability(project?.connectorType, (assembled?.jsonLd.length ?? 0) > 0),
    [project?.connectorType, assembled],
  );
  const [previewMobile, setPreviewMobile] = useState(false);
  // ---- Arrange mode (Article Studio 3.0 / P1.2E) ----
  const [arrangeMode, setArrangeMode] = useState(false);
  const [selectedArrangeImage, setSelectedArrangeImage] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);
  // ---- Sources / Author / Image form inputs (P1.1 Phase 3) ----
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceClaim, setNewSourceClaim] = useState("");
  const [validatingSources, setValidatingSources] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newImageAlt, setNewImageAlt] = useState("");
  const [newImageConcept, setNewImageConcept] = useState("");

  const setSources = (sources: NonNullable<ContentAsset["sources"]>) =>
    setF((p) => ({ ...p, sources }));
  const addSource = () => {
    const url = newSourceUrl.trim();
    if (!url) return;
    setSources([
      ...(f.sources ?? []),
      { url, claim: newSourceClaim.trim() || undefined, status: "unchecked" },
    ]);
    setNewSourceUrl("");
    setNewSourceClaim("");
  };
  const removeSource = (i: number) => setSources((f.sources ?? []).filter((_, idx) => idx !== i));
  const revalidateSources = async () => {
    flushPendingEdits(); // persist f.sources first — the fn re-reads from the store
    setValidatingSources(true);
    try {
      await validateAssetSources(f.id, true);
      toast.success("Sources re-checked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not validate sources");
    } finally {
      setValidatingSources(false);
    }
  };
  const updAuthor = (patch: Partial<NonNullable<ContentAsset["author"]>>) =>
    setF((p) => ({ ...p, author: { ...(p.author ?? { name: "" }), ...patch } }));
  // ---- Opening hook (Article Studio 3.0 / P1.2A) ----
  const nowIso = () => new Date().toISOString();
  const hookIsV3 = articleVisualPolicy(f) === "v3";
  const hookFindings = useMemo(() => validateHook(f), [f]);
  const selectHookProposal = (p: HookProposal) =>
    setF((prev) => ({ ...prev, hook: newHookFromProposal(p, crypto.randomUUID(), nowIso()) }));
  const addHook = () =>
    setF((prev) => ({
      ...prev,
      hook: {
        id: crypto.randomUUID(),
        text: "",
        type: "question",
        provenance: "user-edited",
        approval: "draft",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    }));
  const editHook = (patch: Parameters<typeof applyHookEdit>[1]) =>
    setF((prev) =>
      prev.hook ? { ...prev, hook: applyHookEdit(prev.hook, patch, nowIso()) } : prev,
    );
  const approveHookAction = () =>
    setF((prev) => (prev.hook ? { ...prev, hook: approveHook(prev.hook, nowIso()) } : prev));
  const removeHook = () => setF((prev) => ({ ...prev, hook: undefined }));
  // Hook evidence: attach an EXISTING verified source (no fetch/AI). Evidence is
  // supporting metadata — it updates the hook (marks dirty, persists, revalidates)
  // but does not change provenance or approval.
  const hookVerifiedSources = useMemo(() => verifiedSourcesForHook(f), [f]);
  const [hookEvidenceUrl, setHookEvidenceUrl] = useState("");
  const [hookEvidenceClaim, setHookEvidenceClaim] = useState("");
  const setHookEvidence = (evidence: NonNullable<ContentAsset["hook"]>["evidence"]) =>
    setF((prev) =>
      prev.hook ? { ...prev, hook: { ...prev.hook, evidence, updatedAt: nowIso() } } : prev,
    );
  const attachHookEvidence = () => {
    const url = hookEvidenceUrl.trim();
    if (!url) return;
    const claim = hookEvidenceClaim.trim();
    setHookEvidence([{ url, ...(claim ? { claim } : {}) }]);
    setHookEvidenceUrl("");
    setHookEvidenceClaim("");
  };
  const removeHookEvidence = () => setHookEvidence(undefined);
  const setImages = (images: NonNullable<ContentAsset["images"]>) =>
    setF((p) => ({ ...p, images }));
  const addImage = () => {
    setImages([
      ...(f.images ?? []),
      {
        id: crypto.randomUUID(),
        concept: newImageConcept.trim() || "Image",
        url: newImageUrl.trim() || undefined,
        alt: newImageAlt.trim(),
        placement: "inline",
        source: "existing",
        status: "proposed",
        required: false,
      },
    ]);
    setNewImageUrl("");
    setNewImageAlt("");
    setNewImageConcept("");
  };
  const updImage = (i: number, patch: Partial<NonNullable<ContentAsset["images"]>[number]>) =>
    setImages((f.images ?? []).map((im, idx) => (idx === i ? { ...im, ...patch } : im)));
  // ---- Stable image anchors (Article Studio 3.0 / P1.2C) ----
  const ANCHOR_KIND_OPTIONS: AnchorKind[] = [
    "before-hook",
    "after-hook",
    "before-section",
    "after-section",
    "before-faq",
    "before-cta",
    "article-end",
  ];
  const arrangeBlocks = useMemo(
    () => (project && arrangeMode ? buildArrangeModel(f, project) : []),
    [f, project, arrangeMode],
  );
  /**
   * A drop resolves to a SEMANTIC anchor only (spec §5.1 hard rule) and goes
   * through the same images field the anchor selector writes — dirty tracking,
   * Save, refresh-guard and the assembler all see one source of truth.
   */
  const onArrangeDrop = (serialized: string, imageId: string) => {
    const anchor = anchorFromDropzone(serialized);
    if (!anchor || !imageId) return;
    setF((prev) => ({ ...prev, images: moveImageToAnchor(prev.images ?? [], imageId, anchor) }));
    setDragOverZone(null);
    setSelectedArrangeImage(imageId);
  };
  const imageAnchorRes = useMemo(
    () => (project ? resolveImageAnchors(f, project) : null),
    [f, project],
  );
  const imageAnchorStatus = (imgId: string): string | null => {
    if (!imageAnchorRes) return null;
    const a = imageAnchorRes.anchored.find((x) => x.image.id === imgId);
    if (a) return a.status;
    if (imageAnchorRes.invalid.some((x) => x.id === imgId)) return "invalid";
    if (imageAnchorRes.unanchored.some((x) => x.id === imgId)) return "unplaced";
    return null;
  };
  const onAnchorKind = (i: number, kind: string) => {
    if (kind === "none") return updImage(i, { anchor: undefined });
    if (kind === "before-section" || kind === "after-section") {
      const cur = parseAnchor((f.images ?? [])[i]?.anchor);
      const sid = (cur && anchorSectionId(cur)) || f.sectionIndex?.[0]?.id || "";
      return updImage(i, { anchor: sid ? serializeAnchor({ kind, sectionId: sid }) : undefined });
    }
    return updImage(i, { anchor: serializeAnchor({ kind } as PlacementAnchor) });
  };
  const onAnchorSection = (
    i: number,
    kind: "before-section" | "after-section",
    sectionId: string,
  ) => updImage(i, { anchor: sectionId ? serializeAnchor({ kind, sectionId }) : undefined });
  // ---- Image presentation (Article Studio 3.0 / P1.2D) ----
  const setPresentation = (i: number, patch: Partial<ImagePresentation>) =>
    updImage(i, {
      presentation: {
        ...((f.images ?? [])[i]?.presentation ?? DEFAULT_PRESENTATION),
        ...patch,
      },
    });
  const setPresFocal = (i: number, axis: "x" | "y", val: string) => {
    const p = (f.images ?? [])[i]?.presentation ?? DEFAULT_PRESENTATION;
    const cur = p.focalPoint ?? { x: 0.5, y: 0.5 };
    const n = Math.min(1, Math.max(0, Number(val) || 0));
    setPresentation(i, { focalPoint: { ...cur, [axis]: n } });
  };
  const setMobilePres = (i: number, patch: Partial<ImagePresentationOverride>) =>
    updImage(i, {
      mobilePresentation: {
        ...((f.images ?? [])[i]?.mobilePresentation ?? {}),
        ...patch,
      },
    });
  // ---- Featured image (Article Studio 3.0 / P1.2B) ----
  const updFeatured = (patch: Partial<FeaturedImage> | null) =>
    setF((prev) => ({
      ...prev,
      featuredImage:
        patch === null ? undefined : ({ ...(prev.featuredImage ?? {}), ...patch } as FeaturedImage),
    }));
  const updFeaturedVariant = (key: "hero" | "mobile", patch: Partial<PresentationVariant>) =>
    setF((prev) => {
      const f0 = prev.featuredImage;
      if (!f0) return prev;
      const cur = key === "hero" ? f0.hero : (f0.mobile ?? { aspectRatio: "wide", fit: "cover" });
      return {
        ...prev,
        featuredImage: { ...f0, [key]: { ...cur, ...patch } },
      };
    });

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result);
        resolve(s.slice(s.indexOf(",") + 1));
      };
      r.onerror = () => reject(new Error("Could not read the file"));
      r.readAsDataURL(file);
    });
  const onUploadImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const { path, previewUrl } = await uploadArticleImageFn({
        data: { projectId: f.projectId, assetId: f.id, dataBase64 },
      });
      // Functional update — same stale-closure guard as the generate path.
      setF((p) => ({
        ...p,
        images: [
          ...(p.images ?? []),
          {
            id: crypto.randomUUID(),
            concept: newImageConcept.trim() || "Image",
            storagePath: path,
            previewUrl,
            alt: "",
            placement: "inline",
            source: "uploaded",
            status: "proposed",
            required: false,
          },
        ],
      }));
      setNewImageConcept("");
      toast.success("Uploaded — add alt text, then Approve to make it publishable.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };
  const [generatingImage, setGeneratingImage] = useState(false);
  const onGenerateImage = async () => {
    const concept = newImageConcept.trim();
    if (concept.length < 3) {
      toast.error(t("imgGen.needConcept"));
      return;
    }
    setGeneratingImage(true);
    try {
      const { path, previewUrl, alt } = await generateArticleImageFn({
        data: {
          projectId: f.projectId,
          assetId: f.id,
          concept,
          articleTitle: f.title,
          project: {
            businessName: project?.businessName ?? "",
            businessType: project?.businessType ?? "",
            toneOfVoice: project?.toneOfVoice ?? "",
          },
        },
      });
      // Identical shape to an upload: proposed + staged. Nothing publishes
      // until the user approves it (promote-to-public), same as any upload.
      // FUNCTIONAL update: generation takes seconds — appending onto the
      // render-closure's f would silently revert any approval/alt edit made
      // while it ran (the P1.1 image-loss bug class).
      setF((p) => ({
        ...p,
        images: [
          ...(p.images ?? []),
          {
            id: crypto.randomUUID(),
            concept,
            storagePath: path,
            previewUrl,
            alt,
            placement: "inline",
            source: "generated",
            status: "proposed",
            required: false,
          },
        ],
      }));
      setNewImageConcept("");
      toast.success(t("imgGen.done"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setGeneratingImage(false);
    }
  };
  const approveImage = async (i: number) => {
    const im = (f.images ?? [])[i];
    if (!im) return;
    try {
      if (im.storagePath) {
        // Promote the staged private object to the public bucket (stable URL).
        const { publicUrl } = await promoteArticleImageFn({ data: { path: im.storagePath } });
        updImage(i, { url: publicUrl, status: "accepted" });
      } else {
        updImage(i, { status: "accepted" }); // an already-controlled-origin URL
      }
      toast.success("Image approved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve the image");
    }
  };
  const removeImage = async (i: number) => {
    const im = (f.images ?? [])[i];
    if (im?.storagePath) {
      try {
        await removeArticleImageFn({ data: { path: im.storagePath } });
      } catch {
        /* best effort — the metadata is removed either way */
      }
    }
    setImages((f.images ?? []).filter((_, idx) => idx !== i));
  };
  // Approved, published images from the project's other assets — reusable here.
  const existingApprovedImages = useMemo(() => {
    const seen = new Set<string>();
    const out: NonNullable<ContentAsset["images"]>[number][] = [];
    for (const c of projectContent) {
      for (const im of c.images ?? []) {
        if (im.status === "accepted" && im.url && !seen.has(im.url)) {
          seen.add(im.url);
          out.push(im);
        }
      }
    }
    return out;
  }, [projectContent]);
  const addExistingImage = (url: string) => {
    const src = existingApprovedImages.find((im) => im.url === url);
    if (!src) return;
    // reusedImageMeta deliberately drops the source's storagePath — a reuse is a
    // read-only reference to the shared PUBLIC object, so removing this copy must
    // not delete it out from under the origin asset / a live article (review fix B).
    setImages([...(f.images ?? []), { id: crypto.randomUUID(), ...reusedImageMeta(src) }]);
  };

  // ---- Link-safety resolver actions (one explicit choice per unresolved link) ----
  async function persistMarkdown(nextMarkdown: string, successMsg: string) {
    const merged = mergeEditorEdits({ ...f, markdown: nextMarkdown });
    const next = {
      ...merged,
      updatedAt: new Date().toISOString(),
      // Body changed → the Milo Score no longer reflects it.
      qualityScoreStale: f.qualityScore ? true : f.qualityScoreStale,
    };
    setF(next);
    upsertContent(next);
    await saveWorkspaceNow();
    toast.success(successMsg);
  }
  async function approveLinkPath(path: string) {
    if (!project) return;
    approveProjectInternalPath(project.id, path);
    await saveWorkspaceNow();
    toast.success(`Approved ${path} — it will now publish as a link.`);
  }
  // Occurrence-scoped: each action targets exactly the ROW the user clicked.
  // The old path-scoped versions swept every link sharing the path — five
  // /services links collapsed to one target on the first Replace.
  const replaceLink = (link: ClassifiedInternalLink, newPath: string) =>
    persistMarkdown(
      replaceLinkPathAt(f.markdown, link.path, link.occurrence, newPath),
      `Repointed “${link.anchor}” to ${newPath}`,
    );
  const linkToText = (link: ClassifiedInternalLink) =>
    persistMarkdown(
      linkPathToTextAt(f.markdown, link.path, link.occurrence),
      "Converted to plain text",
    );
  const removeLink = (link: ClassifiedInternalLink) =>
    persistMarkdown(removeLinkAt(f.markdown, link.path, link.occurrence), "Removed the link");
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
      : Boolean(project?.publishEndpoint && project && hasPublishSecret(project));
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
      : Boolean(project?.livePublishEndpoint && project && hasPublishSecret(project));
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [publishingLive, setPublishingLive] = useState(false);
  const outlineId = useId();
  const internalLinksId = useId();
  const schemaId = useId();
  // Stable-anchor section identity (P1.2C): a valid `sec_…` id from a UUID.
  const allocSectionId = () =>
    "sec_" + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const upd = <K extends keyof ContentAsset>(k: K, v: ContentAsset[K]) =>
    setF((p) => {
      const next = { ...p, [k]: v } as ContentAsset;
      // When the body changes, reconcile the persisted section index so anchor ids
      // stay stable across heading edits (the reconciler keeps matched ids).
      if (k === "markdown") {
        next.sectionIndex = reconcileSectionIndex(p.sectionIndex, v as string, allocSectionId);
      }
      return next;
    });

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
    // Reconcile the section index against the current body at the persistence
    // boundary so stable-anchor ids are consistent with what publishes (P1.2C).
    const reconciled: ContentAsset = {
      ...f,
      sectionIndex: reconcileSectionIndex(f.sectionIndex, f.markdown, allocSectionId),
    };
    const next = {
      // Merge, never replace: saving after a publish must not drop the
      // publish/schedule fields the form does not own (see mergeEditorEdits).
      ...mergeEditorEdits(reconciled),
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

  // Unsaved-changes detection. An uploaded-but-unsaved image lives only in `f`
  // (+ Storage) until Save writes it to the store, so without an obvious Save +
  // this guard the user loses it on refresh (and orphans the Storage object).
  const storedNow = getState().content.find((c) => c.id === f.id);
  const isDirty = editorFormDirty(f, storedNow);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

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
      // Article Studio 2.0 fields the editor forms own — must survive save (P1.1 J):
      author: local.author,
      sources: local.sources,
      images: local.images,
      tldr: local.tldr,
      keyTakeaways: local.keyTakeaways,
      breadcrumbs: local.breadcrumbs,
      // Article Studio 3.0 / P1.2A — the opening hook the Hook panel owns. Must be
      // merged so an edited/approved hook survives Save (the P1.1 image-loss class).
      hook: local.hook,
      // P1.2B — the featured image the Featured panel owns; same survival rule.
      featuredImage: local.featuredImage,
      // P1.2H upgrade markers — without these, "Upgrade to 3.0" would be
      // silently dropped by Save/flushPendingEdits (the P1.1 defect class).
      visualState: local.visualState,
      visualModelVersion: local.visualModelVersion,
      // Article Studio 3.0 / P1.2C — persisted section identities for stable image
      // anchors. Reconciled at Save (see save()) so ids stay stable across edits.
      sectionIndex: local.sectionIndex,
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
    const body =
      type === "md"
        ? (assembled?.markdown ?? f.markdown)
        : (assembled?.html ?? markdownToHtml(f.markdown, renderOpts));
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
    // Copy the CANONICAL assembled markdown — what actually publishes — matching
    // Export Markdown (review fix; raw f.markdown diverged from both).
    await navigator.clipboard.writeText(assembled?.markdown ?? f.markdown);
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
  // Local rendering: the label must echo the wall-clock time the user just
  // typed into the datetime-local input, not its UTC translation.
  const goLiveLabel = goLiveValid ? formatDateTimeLocal(goLiveInstant!.toISOString()) : "…";
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
              live.scheduledPublishAt ? formatDateTimeLocal(live.scheduledPublishAt) : undefined
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

      {/* Link-safety resolver — every unresolved internal link must be given one
          explicit state before this article can be sent or published anywhere. */}
      {hasUnresolvedLinks ? (
        <div className="px-5 py-3 border-b border-border">
          <LinkSafetyPanel
            links={unresolvedLinks}
            replaceOptions={activePaths}
            onApprove={approveLinkPath}
            onReplace={replaceLink}
            onTextOnly={linkToText}
            onRemove={removeLink}
          />
        </div>
      ) : null}

      {/* Publishing checklist (P1.1 J) — deterministic states from the canonical
          asset. Hard blockers disable the publish buttons; warnings are advisory. */}
      {project ? (
        <div id="publishing-checklist" className="px-5 py-3 border-b border-border">
          <PublishingChecklist items={checklist} schema={schemaCapability} />
        </div>
      ) : null}

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
              <Button size="sm" variant="outline" onClick={openSend} disabled={publishBlocked}>
                <Send className="h-3.5 w-3.5" />
                {live.publishStatus === "sent"
                  ? t("editor.publish.reSendToWebsite")
                  : t("editor.publish.sendToWebsite")}
              </Button>
              <PublishStatusBadge status={live.publishStatus} />
              {hasUnresolvedLinks ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  Resolve {unresolvedLinks.length} internal link
                  {unresolvedLinks.length === 1 ? "" : "s"} above to send or publish.
                </span>
              ) : null}
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
                  disabled={!liveConfigured || publishingLive || publishBlocked}
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
                  ? t("editor.schedule.overdue", {
                      when: formatDateTimeLocal(live.scheduledPublishAt),
                    })
                  : t("editor.schedule.pending", {
                      when: formatDateTimeLocal(live.scheduledPublishAt),
                    })}
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
              <Button
                size="sm"
                onClick={armSchedule}
                disabled={!goLiveLocal || scheduling || publishBlocked}
              >
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
            {/* P1-3 fix (2026-07-25): a disabled Schedule button must SAY why.
                It used to silently eat clicks while publishBlocked. */}
            {publishBlocked ? (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-foreground/80">
                <span className="font-medium">{t("editor.schedule.blockedTitle")}</span>
                <ul className="mt-1 list-disc pl-4">
                  {publishBlockers.map((b) => (
                    <li key={b.key}>{b.detail || b.label}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-1 underline"
                  onClick={() =>
                    document
                      .getElementById("publishing-checklist")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  {t("editor.schedule.blockedCta")}
                </button>
              </div>
            ) : null}
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

      {effectiveVisualState(f) === "needsVisualUpgrade" ? (
        <div className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-4 py-3 text-xs">
          <span className="text-foreground/80">{t("visual.upgradePrompt")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setF((prev) => beginVisualUpgrade(prev))}
          >
            {t("visual.upgradeAction")}
          </Button>
        </div>
      ) : null}
      {effectiveVisualState(f) === "upgrading" || effectiveVisualState(f) === "current"
        ? (() => {
            const vc = visualCompleteness(f);
            return (
              <div className="mx-5 mt-3 text-xs text-muted-foreground">
                {t("visual.completeness")}:{" "}
                <strong className="text-foreground">{vc.score}/100</strong>
                {vc.missing.length ? (
                  <> · {vc.missing.map((m) => t(`visual.missing.${m}`)).join(" · ")}</>
                ) : null}
              </div>
            );
          })()
        : null}

      <Tabs defaultValue="content" className="px-5 pt-3">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="meta">Metadata</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="eeat">Sources &amp; Author</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 py-5">
          {/* ---- Opening hook (Article Studio 3.0 / P1.2A) ---- */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{t("hook.panel.title")}</h3>
              {f.hook ? (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {f.hook.provenance === "user-edited"
                      ? t("hook.provenance.edited")
                      : t("hook.provenance.generated")}
                  </span>
                  <span
                    className={
                      f.hook.approval === "approved"
                        ? "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    }
                  >
                    {f.hook.approval === "approved"
                      ? t("hook.approval.approved")
                      : t("hook.approval.draft")}
                  </span>
                </div>
              ) : null}
            </div>

            {hookIsV3 ? (
              <p className="text-xs text-muted-foreground">{t("hook.panel.v3Note")}</p>
            ) : null}

            {!f.hook && (f.hookProposals?.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                <Label>{t("hook.proposals.label")}</Label>
                <div className="space-y-1">
                  {f.hookProposals!.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectHookProposal(p)}
                      className="block w-full rounded border border-border px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="text-muted-foreground">[{t(`hook.type.${p.type}`)}]</span>{" "}
                      {p.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {f.hook ? (
              <>
                <Field label={t("hook.field.text")}>
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={f.hook!.text}
                      onChange={(e) => editHook({ text: e.target.value })}
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("hook.field.type")}>
                    {(id) => (
                      <select
                        id={id}
                        value={f.hook!.type}
                        onChange={(e) => editHook({ type: e.target.value as HookType })}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {HOOK_TYPES.map((ht) => (
                          <option key={ht} value={ht}>
                            {t(`hook.type.${ht}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label={t("hook.field.purpose")}>
                    {(id) => (
                      <Input
                        id={id}
                        value={f.hook!.purpose ?? ""}
                        onChange={(e) => editHook({ purpose: e.target.value })}
                      />
                    )}
                  </Field>
                </div>

                {/* Blockers (with resolution hints) then warnings */}
                {hookFindings.blockers.map((b, i) => (
                  <div key={`hb-${i}`} className="text-xs text-destructive">
                    <p>⛔ {t(`hook.finding.${b.code}`)}</p>
                    <p className="text-muted-foreground">
                      {t("hook.action.suggested")}:{" "}
                      {b.actions.map((a) => t(`hook.resolution.${a}`)).join(" · ")}
                    </p>
                  </div>
                ))}
                {hookFindings.warnings.map((w, i) => (
                  <p key={`hw-${i}`} className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ {t(`hook.finding.${w.code}`)}
                  </p>
                ))}

                {/* Evidence — attach an EXISTING verified source (no fetch / no AI) */}
                <div className="space-y-1.5 rounded border border-border/60 p-2">
                  <Label>{t("hook.evidence.label")}</Label>
                  {f.hook.evidence && f.hook.evidence.length > 0 ? (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">
                        {t("hook.evidence.supportedBy")}:{" "}
                        <span className="text-muted-foreground">{f.hook.evidence[0].url}</span>
                        {f.hook.evidence[0].claim ? ` — ${f.hook.evidence[0].claim}` : ""}
                      </span>
                      <Button size="sm" variant="ghost" onClick={removeHookEvidence}>
                        {t("hook.evidence.remove")}
                      </Button>
                    </div>
                  ) : hookVerifiedSources.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={hookEvidenceUrl}
                        onChange={(e) => setHookEvidenceUrl(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">{t("hook.evidence.attach")}</option>
                        {hookVerifiedSources.map((s) => (
                          <option key={s.url} value={s.url}>
                            {s.title ? `${s.title} — ${s.url}` : s.url}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={hookEvidenceClaim}
                        onChange={(e) => setHookEvidenceClaim(e.target.value)}
                        placeholder={t("hook.evidence.claimPlaceholder")}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={attachHookEvidence}
                        disabled={!hookEvidenceUrl}
                      >
                        {t("hook.evidence.attach")}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("hook.evidence.none")}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={f.hook.approval === "approved" ? "outline" : "default"}
                    onClick={approveHookAction}
                    disabled={!f.hook.text.trim() || f.hook.approval === "approved"}
                  >
                    {f.hook.approval === "approved"
                      ? t("hook.action.approved")
                      : t("hook.action.approve")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={removeHook}>
                    {t("hook.action.remove")}
                  </Button>
                </div>

                {isDirty ? (
                  <p className="text-[11px] text-muted-foreground">{t("hook.unsaved")}</p>
                ) : null}
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={addHook}>
                {t("hook.action.add")}
              </Button>
            )}
          </div>

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
                    retained — check with Google&apos;s Rich Results Test after publishing. Even
                    when retained, this makes the page <strong>eligible</strong> for rich results
                    where it qualifies; it does not guarantee a rich result <strong>appears</strong>{" "}
                    (the search engine decides that).
                  </>
                ) : (
                  <>
                    Structured data (schema.org JSON-LD) is generated for this article, but Milo
                    does not yet send it to a custom endpoint — your connector would need to add it.
                    Milo never guarantees a rich result appears; the search engine decides that.
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

        <TabsContent value="eeat" className="space-y-6 py-5">
          {/* ---- Sources (P1.1 C) ---- */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Sources</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={revalidateSources}
                disabled={validatingSources || !(f.sources?.length ?? 0)}
              >
                {validatingSources ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Re-check sources
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Attach real reference URLs. Milo checks each resolves — only <strong>verified</strong>{" "}
              sources are cited on the page. &ldquo;Verified&rdquo; is set by validation, never
              chosen by hand.
            </p>
            <ul className="space-y-1.5">
              {(f.sources ?? []).map((s, i) => (
                <li
                  key={`${s.url}-${i}`}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-foreground/80">
                      {normalizeSourceUrl(s.url)}
                    </span>
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                        (s.status === "verified"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-500")
                      }
                    >
                      {s.status}
                      {s.checkNote && s.status !== "verified" ? ` · ${s.checkNote}` : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => removeSource(i)}
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </div>
                  {s.claim ? (
                    <p className="mt-1 text-muted-foreground">Supports: {s.claim}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs text-muted-foreground">Source URL</Label>
                <Input
                  className="mt-1"
                  placeholder="https://…"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs text-muted-foreground">Supported claim (optional)</Label>
                <Input
                  className="mt-1"
                  placeholder="What this source backs"
                  value={newSourceClaim}
                  onChange={(e) => setNewSourceClaim(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={addSource} disabled={!newSourceUrl.trim()}>
                Add source
              </Button>
            </div>
          </section>

          {/* ---- Featured image (Article Studio 3.0 / P1.2B) ---- */}
          <section className="space-y-2.5 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground">{t("featured.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("featured.hint")}</p>
            {!f.featuredImage ? (
              <div className="flex flex-wrap gap-1.5">
                {(f.images ?? [])
                  .filter(
                    (im) =>
                      (im.status === "accepted" || im.status === "generated") &&
                      (im.url ?? "").trim(),
                  )
                  .map((im) => (
                    <Button
                      key={im.id}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updFeatured({
                          imageId: im.id,
                          storagePath: im.storagePath ?? "",
                          url: im.url,
                          alt: im.alt ?? "",
                          caption: im.caption,
                          hero: { aspectRatio: "wide", fit: "cover" },
                          approval: "draft",
                        })
                      }
                    >
                      {t("featured.use", { concept: im.concept || im.alt || im.id })}
                    </Button>
                  ))}
                {(f.images ?? []).every(
                  (im) => !(im.status === "accepted" || im.status === "generated") || !im.url,
                ) ? (
                  <p className="text-xs text-muted-foreground">{t("featured.none")}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-2.5">
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {f.featuredImage.url}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("featured.alt")}</Label>
                    <Input
                      className="mt-1"
                      value={f.featuredImage.alt}
                      onChange={(e) => updFeatured({ alt: e.target.value, approval: "draft" })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("featured.caption")}</Label>
                    <Input
                      className="mt-1"
                      value={f.featuredImage.caption ?? ""}
                      onChange={(e) => updFeatured({ caption: e.target.value })}
                    />
                  </div>
                </div>
                {(["hero", "mobile"] as const).map((variantKey) => {
                  const v = variantKey === "hero" ? f.featuredImage!.hero : f.featuredImage!.mobile;
                  return (
                    <div key={variantKey} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <span className="col-span-2 self-center text-[11px] text-muted-foreground sm:col-span-1">
                        {t(`featured.variant.${variantKey}`)}
                      </span>
                      <select
                        value={v?.aspectRatio ?? ""}
                        onChange={(e) =>
                          updFeaturedVariant(variantKey, {
                            aspectRatio: e.target.value as PresentationVariant["aspectRatio"],
                          })
                        }
                        className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground"
                      >
                        {variantKey === "mobile" && !v ? <option value="">—</option> : null}
                        {IMAGE_ASPECTS.map((o) => (
                          <option key={o} value={o}>
                            {t(`pres.val.${o}`)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={v?.fit ?? "cover"}
                        onChange={(e) =>
                          updFeaturedVariant(variantKey, {
                            fit: e.target.value as PresentationVariant["fit"],
                          })
                        }
                        className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground"
                      >
                        {IMAGE_FITS.map((o) => (
                          <option key={o} value={o}>
                            {t(`pres.val.${o}`)}
                          </option>
                        ))}
                      </select>
                      {/* Focal applies to the HERO crop only — the P1.2D mobile
                          channel deliberately renders no mobile focal, so offering
                          inputs there would be a dead control. */}
                      {variantKey === "hero" ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={v?.focalPoint?.x ?? 0.5}
                            onChange={(e) =>
                              updFeaturedVariant(variantKey, {
                                focalPoint: {
                                  x: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                                  y: v?.focalPoint?.y ?? 0.5,
                                },
                              })
                            }
                            className="h-7 w-14 text-xs"
                          />
                          <Input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={v?.focalPoint?.y ?? 0.5}
                            onChange={(e) =>
                              updFeaturedVariant(variantKey, {
                                focalPoint: {
                                  x: v?.focalPoint?.x ?? 0.5,
                                  y: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                                },
                              })
                            }
                            className="h-7 w-14 text-xs"
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {f.featuredImage.approval === "approved" ? (
                    <span className="text-xs text-[#398a63]">{t("featured.approved")}</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => updFeatured({ approval: "approved" })}
                      disabled={!f.featuredImage.alt.trim()}
                    >
                      {t("featured.approve")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => updFeatured(null)}>
                    {t("featured.remove")}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ---- Author / E-E-A-T (P1.1 F) ---- */}
          <section className="space-y-2.5 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground">Author (E-E-A-T)</h3>
            <p className="text-xs text-muted-foreground">
              A named byline must be a <strong>real, consenting person</strong> — Milo never invents
              a name or credential.
            </p>
            {checklist.some((b) => b.key === "author" && !b.passed) ? (
              <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
                <AlertTriangle className="h-3 w-3" /> Recommended for E-E-A-T: add a resolved author
                (name + a real bio/credential/profile) for health/finance/legal content. This no
                longer blocks publishing.
              </p>
            ) : null}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  className="mt-1"
                  value={f.author?.name ?? ""}
                  onChange={(e) => updAuthor({ name: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Input
                  className="mt-1"
                  value={f.author?.role ?? ""}
                  onChange={(e) => updAuthor({ role: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Qualifications / credentials
                </Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. PT, MSc"
                  value={f.author?.credentials ?? ""}
                  onChange={(e) => updAuthor({ credentials: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Profile URL</Label>
                <Input
                  className="mt-1"
                  placeholder="https://…"
                  value={f.author?.url ?? ""}
                  onChange={(e) => updAuthor({ url: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Bio</Label>
                <Textarea
                  rows={2}
                  className="mt-1"
                  value={f.author?.bio ?? ""}
                  onChange={(e) => updAuthor({ bio: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  sameAs profiles (one per line)
                </Label>
                <Textarea
                  rows={2}
                  className="mt-1 font-mono text-xs"
                  value={(f.author?.sameAs ?? []).join("\n")}
                  onChange={(e) =>
                    updAuthor({
                      sameAs: e.target.value
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          </section>

          {/* ---- Images (P1.1 G — non-upload MVP) ---- */}
          <section className="space-y-2.5 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground">Images</h3>
            <p className="text-xs text-muted-foreground">
              Upload an image (JPEG/PNG/WebP, ≤5&nbsp;MB), reuse an approved project asset, or paste
              a controlled-origin URL. Uploads are staged privately; an image publishes only once it
              has alt text and you <strong>approve</strong> it (which promotes it to a stable public
              URL). Pasted third-party URLs never publish — approval requires a controlled origin.
            </p>
            <ul className="space-y-1.5">
              {(f.images ?? []).map((im, i) => {
                const controlled = project ? isControlledImageOrigin(im.url ?? "", project) : false;
                return (
                  <li
                    key={im.id}
                    className="rounded-md border border-border bg-background px-3 py-2 text-xs space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {im.previewUrl || im.url ? (
                        <img
                          src={im.previewUrl || im.url}
                          alt=""
                          className="h-8 w-8 rounded object-cover border border-border"
                        />
                      ) : null}
                      <span className="font-medium">{im.concept || "Image"}</span>
                      <span className="text-muted-foreground">{im.placement}</span>
                      <span
                        className={
                          "rounded-full px-1.5 py-0.5 text-[10px] uppercase " +
                          (im.status === "accepted" || im.status === "generated"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-secondary text-muted-foreground")
                        }
                      >
                        {im.status}
                      </span>
                      {im.required ? <span className="text-amber-600">required</span> : null}
                      {im.url && !controlled ? (
                        <span className="text-destructive">not a controlled origin</span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => removeImage(i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      className="text-xs"
                      placeholder="Alt text (required to publish)"
                      value={im.alt}
                      onChange={(e) => updImage(i, { alt: e.target.value })}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={im.placement === "featured" ? "outline" : "ghost"}
                        onClick={() =>
                          updImage(i, {
                            placement: im.placement === "featured" ? "inline" : "featured",
                          })
                        }
                      >
                        {im.placement === "featured" ? "Featured" : "Inline"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updImage(i, { required: !im.required })}
                      >
                        {im.required ? "Required" : "Optional"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!im.alt.trim() || (!im.storagePath && !controlled)}
                        onClick={() => approveImage(i)}
                      >
                        Approve
                      </Button>
                    </div>
                    {im.placement === "inline"
                      ? (() => {
                          const cur = parseAnchor(im.anchor);
                          const curKind = cur?.kind ?? "none";
                          const curSid =
                            cur && (cur.kind === "before-section" || cur.kind === "after-section")
                              ? cur.sectionId
                              : "";
                          const st = imageAnchorStatus(im.id);
                          return (
                            <div className="space-y-1 rounded border border-border/60 p-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground">{t("anchor.label")}</span>
                                <select
                                  value={curKind}
                                  onChange={(e) => onAnchorKind(i, e.target.value)}
                                  className="h-7 rounded border border-input bg-background px-1 text-xs"
                                >
                                  <option value="none">{t("anchor.kind.none")}</option>
                                  {ANCHOR_KIND_OPTIONS.map((k) => (
                                    <option key={k} value={k}>
                                      {t(`anchor.kind.${k}`)}
                                    </option>
                                  ))}
                                </select>
                                {curKind === "before-section" || curKind === "after-section" ? (
                                  <select
                                    value={curSid}
                                    onChange={(e) => onAnchorSection(i, curKind, e.target.value)}
                                    className="h-7 rounded border border-input bg-background px-1 text-xs"
                                  >
                                    <option value="">{t("anchor.section.choose")}</option>
                                    {(f.sectionIndex ?? []).map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.heading}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                              </div>
                              {st && st !== "resolved" ? (
                                <p
                                  className={
                                    st === "unplaced" ? "text-muted-foreground" : "text-destructive"
                                  }
                                >
                                  {t(`anchor.status.${st}`)}
                                </p>
                              ) : null}
                              {(st === "unplaced" || st === "broken" || st === "ambiguous") &&
                              !im.placementReviewedAt ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => updImage(i, { placementReviewedAt: nowIso() })}
                                >
                                  {t("anchor.reviewAck")}
                                </Button>
                              ) : null}
                              {im.placementReviewedAt ? (
                                <span className="text-muted-foreground">
                                  {t("anchor.reviewed")}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()
                      : null}
                    {/* ---- Presentation (Article Studio 3.0 / P1.2D) ---- */}
                    {(() => {
                      const p = im.presentation;
                      const preSel = (
                        field: string,
                        options: readonly string[],
                        value: string,
                        onChange: (v: string) => void,
                      ) => (
                        <label className="flex flex-col text-[11px] text-muted-foreground">
                          {t(`pres.field.${field}`)}
                          <select
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground"
                          >
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {t(`pres.val.${o}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                      return (
                        <div className="space-y-1.5 rounded border border-border/60 p-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t("pres.label")}</span>
                            {p ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  updImage(i, {
                                    presentation: undefined,
                                    mobilePresentation: undefined,
                                  })
                                }
                              >
                                {t("pres.clear")}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updImage(i, {
                                    presentation: { ...DEFAULT_PRESENTATION },
                                  })
                                }
                              >
                                {t("pres.add")}
                              </Button>
                            )}
                          </div>
                          {p ? (
                            <>
                              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                {preSel("size", IMAGE_SIZES, p.size, (v) =>
                                  setPresentation(i, {
                                    size: v as ImagePresentation["size"],
                                  }),
                                )}
                                {preSel("alignment", IMAGE_ALIGNMENTS, p.alignment, (v) =>
                                  setPresentation(i, {
                                    alignment: v as ImagePresentation["alignment"],
                                  }),
                                )}
                                {preSel("aspectRatio", IMAGE_ASPECTS, p.aspectRatio, (v) =>
                                  setPresentation(i, {
                                    aspectRatio: v as ImagePresentation["aspectRatio"],
                                  }),
                                )}
                                {preSel("fit", IMAGE_FITS, p.fit, (v) =>
                                  setPresentation(i, {
                                    fit: v as ImagePresentation["fit"],
                                  }),
                                )}
                                {preSel("visualStyle", IMAGE_STYLES, p.visualStyle, (v) =>
                                  setPresentation(i, {
                                    visualStyle: v as ImagePresentation["visualStyle"],
                                  }),
                                )}
                              </div>
                              {p.fit === "cover" ? (
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <span>{t("pres.field.focal")}</span>
                                  <Input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    max="1"
                                    value={p.focalPoint?.x ?? 0.5}
                                    onChange={(e) => setPresFocal(i, "x", e.target.value)}
                                    className="h-7 w-16 text-xs"
                                  />
                                  <Input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    max="1"
                                    value={p.focalPoint?.y ?? 0.5}
                                    onChange={(e) => setPresFocal(i, "y", e.target.value)}
                                    className="h-7 w-16 text-xs"
                                  />
                                </div>
                              ) : null}
                              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={p.captionVisible !== false}
                                  onChange={(e) =>
                                    setPresentation(i, {
                                      captionVisible: e.target.checked,
                                    })
                                  }
                                />
                                {t("pres.field.captionVisible")}
                              </label>
                              <div className="grid grid-cols-2 gap-1.5">
                                <label className="flex flex-col text-[11px] text-muted-foreground">
                                  {t("pres.mobile.size")}
                                  <select
                                    value={im.mobilePresentation?.size ?? ""}
                                    onChange={(e) =>
                                      setMobilePres(i, {
                                        size: (e.target.value ||
                                          undefined) as ImagePresentationOverride["size"],
                                      })
                                    }
                                    className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground"
                                  >
                                    <option value="">{t("pres.mobile.inherit")}</option>
                                    {IMAGE_SIZES.map((o) => (
                                      <option key={o} value={o}>
                                        {t(`pres.val.${o}`)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex flex-col text-[11px] text-muted-foreground">
                                  {t("pres.mobile.align")}
                                  <select
                                    value={im.mobilePresentation?.alignment ?? ""}
                                    onChange={(e) =>
                                      setMobilePres(i, {
                                        alignment: (e.target.value ||
                                          undefined) as ImagePresentationOverride["alignment"],
                                      })
                                    }
                                    className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground"
                                  >
                                    <option value="">{t("pres.mobile.inherit")}</option>
                                    {IMAGE_ALIGNMENTS.map((o) => (
                                      <option key={o} value={o}>
                                        {t(`pres.val.${o}`)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {t("pres.capability")}
                              </p>
                            </>
                          ) : null}
                        </div>
                      );
                    })()}
                  </li>
                );
              })}
            </ul>
            {(f.images?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">No images yet.</p>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Concept (for a new image)</Label>
                <Input
                  className="mt-1"
                  maxLength={500}
                  value={newImageConcept}
                  onChange={(e) => setNewImageConcept(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={onGenerateImage}
                disabled={generatingImage || uploadingImage}
              >
                {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("imgGen.generate")}
              </Button>
              <Button size="sm" variant="outline" asChild disabled={uploadingImage}>
                <label className="cursor-pointer">
                  {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Upload image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      onUploadImage(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {existingApprovedImages.length ? (
                <select
                  aria-label="Reuse an approved project image"
                  className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addExistingImage(e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">Reuse approved asset…</option>
                  {existingApprovedImages.map((im) => (
                    <option key={im.url} value={im.url}>
                      {im.concept || im.url}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs text-muted-foreground">
                  …or paste a controlled-origin URL
                </Label>
                <Input
                  className="mt-1"
                  placeholder="https://your-site/image.jpg"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={addImage} disabled={!newImageUrl.trim()}>
                Add URL
              </Button>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Author, sources and images are saved with the <strong>Save</strong> button in the footer
            below — uploads aren&apos;t kept until you Save.
          </p>
        </TabsContent>

        <TabsContent value="preview" className="py-5">
          {/* Presentation only — the HTML comes from the canonical publish
              converter (markdown.ts), so the STRUCTURE matches what publishes.
              This <style> just makes the bare semantic tags readable here, the
              way a customer's theme styles them on the live site. */}
          <style>{PREVIEW_STYLE}</style>
          {hasUnresolvedLinks ? (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-foreground/80">
              This is exactly how the article publishes. {unresolvedLinks.length} internal link
              {unresolvedLinks.length === 1 ? "" : "s"} can&apos;t be confirmed to point to a real
              page on your site, so {unresolvedLinks.length === 1 ? "it shows" : "they show"} as
              plain text here and <strong>publishing is blocked</strong> until{" "}
              {unresolvedLinks.length === 1 ? "it is" : "they are"} resolved. Use the link-safety
              panel below the tabs to approve, replace, keep as text, or remove each one.
            </div>
          ) : null}
          <div className="mb-3 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Preview:</span>
            <Button
              size="sm"
              variant={previewMobile ? "ghost" : "outline"}
              onClick={() => setPreviewMobile(false)}
            >
              Desktop
            </Button>
            <Button
              size="sm"
              variant={previewMobile ? "outline" : "ghost"}
              onClick={() => setPreviewMobile(true)}
            >
              Mobile
            </Button>
            <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
            <Button
              size="sm"
              variant={arrangeMode ? "ghost" : "outline"}
              onClick={() => setArrangeMode(false)}
            >
              {t("arrange.modePreview")}
            </Button>
            <Button
              size="sm"
              variant={arrangeMode ? "outline" : "ghost"}
              onClick={() => setArrangeMode(true)}
            >
              {t("arrange.modeArrange")}
            </Button>
          </div>
          {arrangeMode ? (
            <ArrangeSurface
              blocks={arrangeBlocks}
              asset={f}
              t={t}
              selected={selectedArrangeImage}
              onSelect={setSelectedArrangeImage}
              dragOverZone={dragOverZone}
              onDragOverZone={setDragOverZone}
              onDrop={onArrangeDrop}
              imageIndexOf={(id) => (f.images ?? []).findIndex((im) => im.id === id)}
              updImage={updImage}
              setPresentation={setPresentation}
              setPresFocal={setPresFocal}
              hook={{
                edit: (text: string) => editHook({ text }),
                approve: approveHookAction,
              }}
            />
          ) : null}
          {!arrangeMode && previewMobile && poorMobileCropWarnings(f).length > 0 ? (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-foreground/80">
              {t("prev.cropWarn")}{" "}
              <strong>
                {poorMobileCropWarnings(f)
                  .map((w) => w.label)
                  .join(", ")}
              </strong>
            </div>
          ) : null}
          {!arrangeMode && previewMobile ? (
            /* A REAL 390px viewport: media queries (milo-m-*) fire exactly as
               on a phone, over the same assembled HTML and the same stylesheet
               the desktop preview uses. sandbox="" — no scripts can ever run. */
            <iframe
              title={t("prev.mobileTitle")}
              sandbox=""
              className="mx-auto block w-[390px] rounded-lg border border-border bg-white"
              style={{ height: "70vh" }}
              srcDoc={buildPreviewSrcDoc(
                assembled?.html ?? markdownToHtml(f.markdown, renderOpts),
                [
                  // The iframe has no app stylesheet, so PREVIEW_STYLE's var()
                  // tokens must resolve here or table borders/shading vanish.
                  ":root{--foreground:#1a1a1a;--border:#e5e7eb;--secondary:#f4f4f5}",
                  "body{margin:0;padding:20px;background:#fff;color:#1a1a1a}",
                  PREVIEW_STYLE,
                  miloImageCss,
                ],
              )}
            />
          ) : null}
          {!arrangeMode && !previewMobile ? (
            <div
              className="milo-preview rounded-lg border border-border bg-background p-6"
              dangerouslySetInnerHTML={{
                __html: assembled?.html ?? markdownToHtml(f.markdown, renderOpts),
              }}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-border bg-secondary/30">
        {/* Always-visible editor-wide Save — persists every tab's edits (incl.
            uploaded images) to the store. save() preserves the current status
            and never approves; repeated clicks are idempotent (no re-upload). */}
        <Button size="sm" variant="default" onClick={() => save()}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        {isDirty ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            Unsaved changes
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">All changes saved</span>
        )}
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" aria-hidden="true" />
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

/**
 * Repoint control — a plain select of the paths Milo can vouch for (verified +
 * already-approved). Kept separate so choosing a target is one deliberate action
 * and the control resets itself afterwards.
 */
function ReplaceControl({
  options,
  onReplace,
}: {
  options: string[];
  onReplace: (to: string) => void;
}) {
  const id = useId();
  return (
    <select
      id={id}
      aria-label="Replace with a verified page"
      className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
      defaultValue=""
      onChange={(e) => {
        const to = e.target.value;
        e.target.value = "";
        if (to) onReplace(to);
      }}
    >
      <option value="">Replace with…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * Link-safety resolver (link-safety P0). Lists every UNRESOLVED internal link —
 * anchor text, the path as written, the source section and why it's unresolved —
 * and forces one explicit choice per link before the article can be sent or
 * published: approve this exact URL, replace it with a verified page, keep the
 * text without the link, or remove it. There is deliberately NO "approve all".
 */
/**
 * Publishing checklist panel (P1.1 J). Shows the deterministic hard blockers
 * (with a resolution hint each), advisory warnings, and the honest structured-data
 * delivery status. The publish buttons are disabled while any hard blocker fails.
 */
function PublishingChecklist({
  items,
  schema,
}: {
  items: ChecklistItem[];
  schema: ReturnType<typeof schemaConnectorCapability>;
}) {
  const blockers = items.filter((i) => i.blocking && !i.passed);
  const warnings = items.filter((i) => !i.blocking && !i.passed);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {blockers.length ? (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            Publishing blocked — {blockers.length} to resolve
          </>
        ) : (
          <>
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            Ready to publish — all safety checks pass
          </>
        )}
      </div>
      {blockers.length ? (
        <ul className="space-y-1.5">
          {blockers.map((b) => (
            <li
              key={b.key}
              className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
            >
              <div className="font-medium text-foreground">{b.label}</div>
              {b.detail ? <p className="mt-0.5 text-muted-foreground">{b.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {warnings.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {warnings.length} advisory warning{warnings.length === 1 ? "" : "s"} (won&apos;t block
            publishing)
          </summary>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w) => (
              <li key={w.key} className="text-muted-foreground">
                <span className="text-foreground/80">{w.label}</span>
                {w.detail ? ` — ${w.detail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Structured data: {schema.generated ? "generated" : "none generated"}
        {" · "}
        {!schema.generated
          ? "nothing to deliver"
          : schema.connector === "custom"
            ? "custom endpoint — JSON-LD delivery not supported"
            : `included in the ${schema.connector} payload (retention on your site is not verified — implementation, not confirmed appearance)`}
        .
      </p>
    </div>
  );
}

function LinkSafetyPanel({
  links,
  replaceOptions,
  onApprove,
  onReplace,
  onTextOnly,
  onRemove,
}: {
  links: ClassifiedInternalLink[];
  replaceOptions: string[];
  /** Approving is PATH-scoped by design — a path is valid everywhere or nowhere. */
  onApprove: (path: string) => void;
  /** Replace/text/remove are OCCURRENCE-scoped — they act on this row only. */
  onReplace: (link: ClassifiedInternalLink, newPath: string) => void;
  onTextOnly: (link: ClassifiedInternalLink) => void;
  onRemove: (link: ClassifiedInternalLink) => void;
}) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
        {links.length} unresolved internal link{links.length === 1 ? "" : "s"} — publishing is
        blocked
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Each link below points to a path Milo can&apos;t confirm exists on your site. Nothing sends
        or publishes — on any connector — until every one is resolved. Choose an action per link.
      </p>
      <ul className="mt-3 space-y-2.5">
        {links.map((l, i) => (
          <li
            key={`${l.path}-${i}`}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-foreground">“{l.anchor}”</span>
              <span className="font-mono text-foreground/70">{l.href}</span>
              {l.section ? (
                <span className="text-muted-foreground">
                  in “<span className="text-foreground/80">{l.section}</span>”
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-muted-foreground">{l.reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => onApprove(l.path)}>
                <Check className="h-3 w-3" /> Approve this URL
              </Button>
              {replaceOptions.length ? (
                <ReplaceControl options={replaceOptions} onReplace={(to) => onReplace(l, to)} />
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => onTextOnly(l)}>
                Keep as text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onRemove(l)}>
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
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

// ---------------------------------------------------------------------------
// Arrange mode surface (Article Studio 3.0 / P1.2E, spec §5.1)
// ---------------------------------------------------------------------------

/**
 * A visual composition surface over the SAME canonical asset: blocks come from
 * buildArrangeModel (assembler-order), drops resolve to semantic anchors only,
 * and every control writes the exact fields the panels below write — one
 * source of truth, one Save, one dirty tracker.
 */
function ArrangeSurface(props: {
  blocks: import("@/lib/arrange-model").ArrangeBlock[];
  asset: ContentAsset;
  t: (key: string) => string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  dragOverZone: string | null;
  onDragOverZone: (zone: string | null) => void;
  onDrop: (serialized: string, imageId: string) => void;
  imageIndexOf: (id: string) => number;
  updImage: (i: number, patch: Partial<NonNullable<ContentAsset["images"]>[number]>) => void;
  setPresentation: (i: number, patch: Partial<ImagePresentation>) => void;
  setPresFocal: (i: number, axis: "x" | "y", val: string) => void;
  hook: { edit: (text: string) => void; approve: () => void };
}) {
  const { blocks, asset, t } = props;
  const sections = blocks.flatMap((b) =>
    b.kind === "section" ? [{ sectionId: b.sectionId, heading: b.heading }] : [],
  );

  const zoneLabel = (b: Extract<(typeof blocks)[number], { kind: "dropzone" }>) => {
    const l = dropzoneLabel(b.anchor, sections);
    return l.heading ? `${t(l.key)} “${l.heading}”` : t(l.key);
  };

  const imageCard = (
    entry: import("@/lib/arrange-model").ArrangeImageEntry,
    opts: { attention?: boolean } = {},
  ) => {
    const img = entry.image;
    const idx = props.imageIndexOf(img.id);
    const selected = props.selected === img.id;
    const pres = img.presentation ?? DEFAULT_PRESENTATION;
    return (
      <div
        key={img.id}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", img.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={(e) => {
          // Without this the click bubbles to the surface root, whose
          // deselect handler would immediately undo the selection (review H1).
          e.stopPropagation();
          props.onSelect(selected ? null : img.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            props.onSelect(selected ? null : img.id);
          }
        }}
        onDragEnd={() => props.onDragOverZone(null)}
        className={
          "cursor-grab rounded-md border px-3 py-2 text-xs transition-colors " +
          (selected
            ? "border-accent bg-accent/10"
            : opts.attention
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-border bg-secondary/40 hover:border-accent")
        }
      >
        <div className="flex items-center gap-2">
          {img.previewUrl || img.url ? (
            <img
              src={img.previewUrl || img.url}
              alt=""
              className="h-9 w-12 rounded object-cover"
              draggable={false}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{img.alt || img.concept}</div>
            <div className="truncate text-muted-foreground">
              {opts.attention
                ? `${t("arrange.status")}: ${t(`arrange.status.${entry.status}`)}`
                : entry.status === "unplaced"
                  ? t("arrange.unplacedNote")
                  : t("arrange.dragHint")}
            </div>
          </div>
        </div>
        {selected && idx >= 0 ? (
          <div
            className="mt-2 grid gap-2 md:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="group"
            aria-label={t("arrange.inlineControls")}
          >
            <Input
              value={img.alt ?? ""}
              placeholder={t("arrange.altPlaceholder")}
              onChange={(e) => props.updImage(idx, { alt: e.target.value })}
            />
            <Input
              value={img.caption ?? ""}
              placeholder={t("arrange.captionPlaceholder")}
              onChange={(e) => props.updImage(idx, { caption: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-1.5 md:col-span-2">
              {(
                [
                  ["size", IMAGE_SIZES, pres.size],
                  ["alignment", IMAGE_ALIGNMENTS, pres.alignment],
                  ["aspectRatio", IMAGE_ASPECTS, pres.aspectRatio],
                  ["fit", IMAGE_FITS, pres.fit],
                ] as const
              ).map(([field, options, value]) => (
                <select
                  key={field}
                  aria-label={field}
                  className="h-8 rounded-md border border-border bg-background px-1.5 text-xs"
                  value={value}
                  onChange={(e) =>
                    props.setPresentation(idx, {
                      [field]: e.target.value,
                    } as Partial<ImagePresentation>)
                  }
                >
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {t(`pres.val.${o}`)}
                    </option>
                  ))}
                </select>
              ))}
              {pres.fit === "cover" ? (
                <>
                  <Input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={pres.focalPoint?.x ?? 0.5}
                    onChange={(e) => props.setPresFocal(idx, "x", e.target.value)}
                    className="h-8 w-16 text-xs"
                    aria-label="focal x"
                  />
                  <Input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={pres.focalPoint?.y ?? 0.5}
                    onChange={(e) => props.setPresFocal(idx, "y", e.target.value)}
                    className="h-8 w-16 text-xs"
                    aria-label="focal y"
                  />
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-1.5" onClick={() => props.onSelect(null)}>
      <p className="mb-2 text-xs text-muted-foreground">{t("arrange.hint")}</p>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "featured": {
            const feat = asset.featuredImage;
            return (
              <div
                key={`feat-${i}`}
                className="rounded-md border border-dashed border-border px-3 py-2 text-xs"
              >
                <span className="font-medium">{t("arrange.featured")}</span>{" "}
                <span className="text-muted-foreground">
                  {feat
                    ? `${feat.alt || feat.imageId} · ${t(`hook.approval.${feat.approval}`)}`
                    : t("arrange.featuredNone")}
                </span>
              </div>
            );
          }
          case "hook":
            return (
              <div
                key={`hook-${i}`}
                className="rounded-md border border-border bg-secondary/30 px-3 py-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{t("arrange.hook")}</span>
                  {asset.hook ? (
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {t(`hook.approval.${asset.hook.approval}`)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={asset.hook.approval === "approved" || !asset.hook.text.trim()}
                        onClick={props.hook.approve}
                      >
                        {t("hook.action.approve")}
                      </Button>
                    </span>
                  ) : null}
                </div>
                {asset.hook ? (
                  <Input
                    value={asset.hook.text}
                    onChange={(e) => props.hook.edit(e.target.value)}
                    placeholder={t("arrange.hookPlaceholder")}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">{t("arrange.hookNone")}</p>
                )}
              </div>
            );
          case "dropzone": {
            const active = props.dragOverZone === b.serialized;
            return (
              <div
                key={`zone-${b.serialized}-${i}`}
                data-anchor={b.serialized}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  props.onDragOverZone(b.serialized);
                }}
                onDragLeave={() => props.onDragOverZone(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  props.onDrop(b.serialized, e.dataTransfer.getData("text/plain"));
                }}
                className={
                  "flex h-6 items-center justify-center rounded border border-dashed text-[10px] transition-colors " +
                  (active
                    ? "border-accent bg-accent/15 text-accent-foreground"
                    : "border-border/60 text-muted-foreground/70")
                }
              >
                {zoneLabel(b)}
              </div>
            );
          }
          case "section":
            return (
              <div
                key={`sec-${b.sectionId ?? i}`}
                className="rounded-md border border-border bg-background px-3 py-2"
              >
                <div
                  className={
                    "font-medium text-foreground " + (b.level <= 2 ? "text-sm" : "text-xs pl-3")
                  }
                >
                  {b.heading}
                </div>
                {b.excerpt ? (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{b.excerpt}</div>
                ) : null}
              </div>
            );
          case "image":
            return imageCard(b.entry);
          case "attention":
            return (
              <div
                key={`att-${i}`}
                className="mt-4 space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
              >
                <div className="text-xs font-medium">{t("arrange.attention")}</div>
                <p className="text-[11px] text-muted-foreground">{t("arrange.attentionHint")}</p>
                {b.entries.map((entry) => imageCard(entry, { attention: true }))}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
