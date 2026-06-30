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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useStore, upsertContent, deleteContentAsset, saveWorkspaceNow } from "@/lib/store";
import { useT } from "@/i18n";
import { generateMetadata, generateFaq, generateCta, sendContentToWebsite, publishContentLive, runAutoPublishOnApprove } from "@/lib/mock-ai";
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
import type { ContentAsset, ContentStatus, PublishDestinationType, PublishStatus, LivePublishStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, FileEdit, FilePlus2, FileX, Globe, Loader2, Rocket, Send, Sparkles, Trash2 } from "lucide-react";
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
    <AppShell
      title={t("editor.title")}
      description={t("editor.subtitle")}
    >
      <div className="grid lg:grid-cols-[260px,1fr] gap-6">
        <aside className="rounded-lg border border-border bg-card p-3 h-fit">
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("editor.assets")}</div>
          <ul className="mt-1 space-y-0.5">
            {assets.length === 0 ? (
              <li className="px-2 py-6 text-xs text-muted-foreground">
                Use “Create content” on any opportunity to generate your first asset.
              </li>
            ) : assets.map((a) => (
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
                    {a.assetType ? `${ASSET_TYPE_LABELS[a.assetType]} · ` : ""}{t(`status.${a.status}`)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {asset ? <Editor key={asset.id} asset={asset} onRequestDelete={() => setDeleteId(asset.id)} /> : (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <div className="font-display text-lg mb-1">{t("editor.noAssetSelectedTitle")}</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Open the Opportunities page and click <span className="font-medium text-foreground">Create content</span> on any card to generate your first asset. It will appear in this editor.
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.action.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this draft from the editor. The original opportunity and
              calendar item will stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("editor.action.delete")}</AlertDialogAction>
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
  const sourceOppId = asset.sourceOpportunityId ?? asset.opportunityId ?? null;

  // ---- Publishing v1 ----
  const project = useStore((s) => s.projects.find((p) => p.id === asset.projectId));
  const publishConfigured = Boolean(project?.publishEndpoint && project?.publishSecret);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [destType, setDestType] = useState<PublishDestinationType>(
    project?.defaultDestinationType ?? "blogPost",
  );
  const [publishSlug, setPublishSlug] = useState(asset.slug);
  // ---- Publishing v1.1 (live + auto-publish) ----
  const publishMode = project?.publishMode ?? "draftOnly";
  const liveConfigured = Boolean(project?.livePublishEndpoint && project?.publishSecret);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [publishingLive, setPublishingLive] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
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
      ...f,
      status: status ?? f.status,
      updatedAt: new Date().toISOString(),
      qualityScoreStale: f.qualityScore ? f.qualityScoreStale || contentChanged : f.qualityScoreStale,
    };
    setF(next);
    upsertContent(next);
    toast.success(status ? `Marked ${status}` : "Saved");
  };

  const aiAction = async (name: string, fn: () => Promise<void>) => {
    // Persist current in-flight edits BEFORE the AI reads from the store,
    // so regenerating one field never wipes other unsaved changes.
    const snapshot = { ...f, updatedAt: new Date().toISOString() };
    upsertContent(snapshot);
    setF(snapshot);
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
    const body = type === "md" ? f.markdown : markdownToHtml(f.markdown);
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

  // Approve, and — only in autoPublishApproved mode — run the auto-publish flow
  // once on this explicit transition (never on render).
  async function approve() {
    save("Approved");
    if (publishMode !== "autoPublishApproved") return;
    setAutoBusy(true);
    try {
      const r = await runAutoPublishOnApprove(asset.id);
      if (r) toast.success("Approved and published live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-publish failed — you can retry with Publish live");
    } finally {
      setAutoBusy(false);
    }
  }

  async function doPublishLive() {
    setPublishingLive(true);
    try {
      await publishContentLive(asset.id);
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
          {f.language ? <span>{t("onboarding.summary.language")}: {f.language}</span> : null}
          <span>{formatDateTime(f.createdAt ?? f.updatedAt)}</span>
          <span>{t("editor.status")}: {t(`status.${f.status}`)}</span>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground/80">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold/80 mt-0.5" />
          <span>{t("editor.aiReviewNote")}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("editor.status")}</span>
          <Select value={f.status} onValueChange={(v) => (v === "Approved" ? approve() : save(v as ContentStatus))}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["Draft","In Review","Approved","Rejected","Exported"] as ContentStatus[]).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {sourceOppId ? (
            <Button size="sm" variant="outline" onClick={() => setContentOpen(true)}>
              <FilePlus2 className="h-3.5 w-3.5" /> {t("editor.action.createContent")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => save("Draft")}><FileEdit className="h-3.5 w-3.5" /> {t("editor.action.saveDraft")}</Button>
          <Button size="sm" variant="outline" onClick={() => save("In Review")}>{t("editor.action.markInReview")}</Button>
          <Button size="sm" variant="outline" onClick={approve} disabled={autoBusy}>{autoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {t("editor.action.approve")}</Button>
          <Button size="sm" variant="ghost" onClick={() => save("Rejected")}><FileX className="h-3.5 w-3.5" /> {t("editor.action.reject")}</Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onRequestDelete}><Trash2 className="h-3.5 w-3.5" /> {t("editor.action.delete")}</Button>
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
                {live.publishStatus === "sent" ? t("editor.publish.reSendToWebsite") : t("editor.publish.sendToWebsite")}
              </Button>
              <PublishStatusBadge status={live.publishStatus} />
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
                <Button size="sm" onClick={() => setLiveConfirmOpen(true)} disabled={!liveConfigured || publishingLive}>
                  {publishingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                  {live.livePublishStatus === "published" ? t("editor.publish.rePublishLive") : t("editor.publish.publishLive")}
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
                    <Link to="/app/setup" className="underline underline-offset-4 hover:text-foreground">Project Setup</Link>.
                  </span>
                ) : null}
                {live.livePublishStatus === "failed" && live.livePublishError ? (
                  <span className="text-xs text-destructive">{live.livePublishError}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Milo Score — publishing readiness (Content Quality Engine v1) */}
      <div className="px-5 py-4 border-b border-border">
        <MiloScorePanel asset={live} />
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
            <DialogDescription>
              {t("editor.sendModal.body")}
            </DialogDescription>
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
              <Select value={destType} onValueChange={(v) => setDestType(v as PublishDestinationType)} disabled={sending}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blogPost">Blog post</SelectItem>
                  <SelectItem value="servicePage">Service page</SelectItem>
                  <SelectItem value="faq">FAQ section</SelectItem>
                  <SelectItem value="landingPage">Landing page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("editor.sendModal.slug")}</label>
              <Input className="mt-1.5" value={publishSlug} onChange={(e) => setPublishSlug(e.target.value)} disabled={sending} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>{t("common.cancel")}</Button>
            <Button onClick={doSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? t("editor.sendModal.sending") : t("editor.sendModal.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={liveConfirmOpen} onOpenChange={(o) => { if (!publishingLive) setLiveConfirmOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.liveModal.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("editor.liveModal.body")}
              {live.qualityScore?.publishingRecommendation === "notReady" ? (
                <span className="mt-2 block font-medium text-destructive">{t("quality.publishWarnNotReady")}</span>
              ) : !live.qualityScore ? (
                <span className="mt-2 block text-muted-foreground">{t("quality.publishWarnNoScore")}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishingLive}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); doPublishLive(); }}
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
          <Field label="Title">{(id) => <Input id={id} value={f.title} onChange={(e) => upd("title", e.target.value)} />}</Field>
          <Field label="H1">{(id) => <Input id={id} value={f.h1} onChange={(e) => upd("h1", e.target.value)} />}</Field>
          <Field label="Markdown content">
            {(id) => <Textarea id={id} rows={16} className="font-mono text-xs" value={f.markdown} onChange={(e) => upd("markdown", e.target.value)} />}
          </Field>
          <Field label="Editor notes">
            {(id) => <Textarea id={id} rows={3} value={f.editorNotes} onChange={(e) => upd("editorNotes", e.target.value)} />}
          </Field>
        </TabsContent>

        <TabsContent value="meta" className="space-y-4 py-5">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy === "metadata"} onClick={() => aiAction("metadata", () => generateMetadata(asset.id))}>
              {busy === "metadata" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Regenerate metadata
            </Button>
            <Button size="sm" variant="outline" disabled={busy === "cta"} onClick={() => aiAction("cta", () => generateCta(asset.id))}>
              {busy === "cta" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Regenerate CTA
            </Button>
          </div>
          <Field label="Slug">{(id) => <Input id={id} value={f.slug} onChange={(e) => upd("slug", e.target.value)} />}</Field>
          <Field label={`Meta title (${f.metaTitle.length}/60)`}>{(id) => <Input id={id} value={f.metaTitle} onChange={(e) => upd("metaTitle", e.target.value)} />}</Field>
          <Field label={`Meta description (${f.metaDescription.length}/160)`}>
            {(id) => <Textarea id={id} rows={3} value={f.metaDescription} onChange={(e) => upd("metaDescription", e.target.value)} />}
          </Field>
          <Field label="Primary CTA">{(id) => <Input id={id} value={f.cta} onChange={(e) => upd("cta", e.target.value)} />}</Field>
        </TabsContent>

        <TabsContent value="structure" className="space-y-5 py-5">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor={outlineId} className="text-xs">Outline</Label>
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
              <Button size="sm" variant="ghost" disabled={busy === "faq"} onClick={() => aiAction("faq", () => generateFaq(asset.id))}>
                {busy === "faq" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Regenerate
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {f.faq.map((q, i) => (
                <div key={i} className="rounded-md border border-border p-3">
                  <Input className="font-medium" value={q.q} onChange={(e) => upd("faq", f.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} />
                  <Textarea rows={2} className="mt-2" value={q.a} onChange={(e) => upd("faq", f.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={internalLinksId} className="text-xs">Internal link suggestions</Label>
              <Textarea id={internalLinksId} rows={4} className="mt-1.5 font-mono text-xs" value={f.internalLinks.join("\n")} onChange={(e) => upd("internalLinks", e.target.value.split("\n").filter(Boolean))} />
            </div>
            <div>
              <Label htmlFor={schemaId} className="text-xs">Schema suggestions</Label>
              <Textarea id={schemaId} rows={4} className="mt-1.5 font-mono text-xs" value={f.schemaSuggestions.join("\n")} onChange={(e) => upd("schemaSuggestions", e.target.value.split("\n").filter(Boolean))} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="py-5">
          <div className="rounded-lg border border-border bg-background p-6 prose-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(f.markdown) }} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-border bg-secondary/30">
        <Button size="sm" variant="outline" onClick={() => exportText("md")}><Download className="h-3.5 w-3.5" /> Export Markdown</Button>
        <Button size="sm" variant="outline" onClick={() => exportText("html")}><Download className="h-3.5 w-3.5" /> Export HTML</Button>
        <Button size="sm" variant="ghost" onClick={copy}><Copy className="h-3.5 w-3.5" /> Copy Markdown</Button>
        <div className="ml-auto text-xs text-muted-foreground">Updated {formatDateTime(f.updatedAt)}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children(id)}</div>
    </div>
  );
}

function PublishStatusBadge({ status }: { status?: PublishStatus }) {
  const t = useT();
  const map = {
    sent: { key: "editor.publish.sent", cls: "bg-accent/30 border-accent/40 text-accent-foreground" },
    failed: { key: "editor.publish.failed", cls: "bg-destructive/10 border-destructive/30 text-destructive" },
    notSent: { key: "editor.publish.notSent", cls: "bg-muted border-border text-muted-foreground" },
  } as const;
  const { key, cls } = map[status ?? "notSent"];
  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {t(key)}
    </span>
  );
}

function LivePublishStatusBadge({ status }: { status?: LivePublishStatus }) {
  const t = useT();
  const map = {
    published: { key: "editor.publish.published", cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-600" },
    failed: { key: "editor.publish.liveFailed", cls: "bg-destructive/10 border-destructive/30 text-destructive" },
    notPublished: { key: "editor.publish.notPublished", cls: "bg-muted border-border text-muted-foreground" },
  } as const;
  const { key, cls } = map[status ?? "notPublished"];
  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {t(key)}
    </span>
  );
}

function markdownToHtml(md: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    if (/^# /.test(line)) { closeList(); html += `<h1>${esc(line.slice(2))}</h1>`; continue; }
    if (/^## /.test(line)) { closeList(); html += `<h2>${esc(line.slice(3))}</h2>`; continue; }
    if (/^### /.test(line)) { closeList(); html += `<h3>${esc(line.slice(4))}</h3>`; continue; }
    if (/^[-*] /.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${esc(line.slice(2))}</li>`;
      continue;
    }
    closeList();
    if (line.trim() === "") { html += ""; continue; }
    html += `<p>${esc(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
  }
  if (inList) html += "</ul>";
  return `<div style="font-family:Inter,system-ui;color:var(--foreground);line-height:1.65"><style>
    .prose-preview h1{font-family:Fraunces,serif;font-size:1.875rem;margin:0 0 .75rem;letter-spacing:-.015em}
    .prose-preview h2{font-family:Fraunces,serif;font-size:1.35rem;margin:1.5rem 0 .5rem}
    .prose-preview h3{font-family:Fraunces,serif;font-size:1.1rem;margin:1.25rem 0 .4rem}
    .prose-preview p{margin:.5rem 0}
    .prose-preview ul{padding-left:1.2rem;margin:.5rem 0}
    .prose-preview li{margin:.2rem 0}
  </style>${html}</div>`;
}
