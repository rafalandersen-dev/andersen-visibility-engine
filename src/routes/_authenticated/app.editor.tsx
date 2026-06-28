import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useStore, upsertContent } from "@/lib/store";
import { generateMetadata, generateFaq, generateCta } from "@/lib/mock-ai";
import type { ContentAsset, ContentStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { useEffect, useId, useMemo, useState } from "react";
import { Check, Copy, Download, FileEdit, FileX, Loader2, Sparkles } from "lucide-react";
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
  const activeProjectId = useStore((s) => s.activeProjectId);
  const assets = useStore((s) => s.content.filter((c) => c.projectId === activeProjectId));
  const search = Route.useSearch();
  const initialId = search.id ?? assets[0]?.id;
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId);

  useEffect(() => {
    if (!selectedId && assets[0]) setSelectedId(assets[0].id);
  }, [assets, selectedId]);

  const asset = useMemo(() => assets.find((a) => a.id === selectedId), [assets, selectedId]);

  return (
    <AppShell
      title="Content editor"
      description="Refine, approve and export AI-drafted assets."
    >
      <div className="grid lg:grid-cols-[260px,1fr] gap-6">
        <aside className="rounded-lg border border-border bg-card p-3 h-fit">
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Assets</div>
          <ul className="mt-1 space-y-0.5">
            {assets.length === 0 ? (
              <li className="px-2 py-6 text-xs text-muted-foreground">
                Generate a brief or draft from the Opportunities page.
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
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">{a.status}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {asset ? <Editor key={asset.id} asset={asset} /> : (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <div className="font-display text-lg mb-1">No asset selected</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Open the Opportunities page and click <span className="font-medium text-foreground">Brief</span> or <span className="font-medium text-foreground">Draft</span> on any card to create your first content asset. It will appear in this editor.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Editor({ asset }: { asset: ContentAsset }) {
  const [f, setF] = useState<ContentAsset>(asset);
  const [busy, setBusy] = useState<string | null>(null);
  const outlineId = useId();
  const internalLinksId = useId();
  const schemaId = useId();
  const upd = <K extends keyof ContentAsset>(k: K, v: ContentAsset[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const save = (status?: ContentStatus) => {
    const next = { ...f, status: status ?? f.status, updatedAt: new Date().toISOString() };
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

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Status</span>
          <Select value={f.status} onValueChange={(v) => save(v as ContentStatus)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["Draft","In Review","Approved","Rejected","Exported"] as ContentStatus[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => save("Draft")}><FileEdit className="h-3.5 w-3.5" /> Save draft</Button>
          <Button size="sm" variant="outline" onClick={() => save("In Review")}>Mark in review</Button>
          <Button size="sm" variant="outline" onClick={() => save("Approved")}><Check className="h-3.5 w-3.5" /> Approve</Button>
          <Button size="sm" variant="ghost" onClick={() => save("Rejected")}><FileX className="h-3.5 w-3.5" /> Reject</Button>
        </div>
      </div>

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
              <Label className="text-xs">Outline</Label>
            </div>
            <Textarea
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
              <Label className="text-xs">Internal link suggestions</Label>
              <Textarea rows={4} className="mt-1.5 font-mono text-xs" value={f.internalLinks.join("\n")} onChange={(e) => upd("internalLinks", e.target.value.split("\n").filter(Boolean))} />
            </div>
            <div>
              <Label className="text-xs">Schema suggestions</Label>
              <Textarea rows={4} className="mt-1.5 font-mono text-xs" value={f.schemaSuggestions.join("\n")} onChange={(e) => upd("schemaSuggestions", e.target.value.split("\n").filter(Boolean))} />
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
