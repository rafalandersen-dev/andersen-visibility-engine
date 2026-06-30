import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, updateProject, saveWorkspaceNow } from "@/lib/store";
import { useT } from "@/i18n";
import {
  parseGscCsv,
  matchGscToPublishedContent,
  gscPageRecommendation,
  GscParseError,
  MAX_IMPORTS,
} from "@/lib/gsc";
import type { Project } from "@/lib/types";
import { Search, Loader2, Upload, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";

type OnsitePerf = {
  path: string;
  viewsSincePublish: number;
  ctaClicksSincePublish: number;
  bookingClicksSincePublish: number;
  conversionRateSincePublish: number;
};

function recClass(key: string) {
  return key === "keepMonitoring"
    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
    : key === "waitOrPromote"
    ? "bg-secondary border-border text-muted-foreground"
    : "bg-amber-500/10 border-amber-500/30 text-amber-600";
}

export function GscLiteSection({ project, onsite }: { project: Project; onsite?: OnsitePerf[] }) {
  const t = useT();
  const content = useStore((s) => s.content.filter((c) => c.projectId === project.id));
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [importing, setImporting] = useState(false);

  const gsc = project.gscLite;
  const latest = gsc?.imports.find((i) => i.id === gsc.latestImportId) ?? gsc?.imports[0];

  const onsiteByPath = useMemo(() => {
    const m = new Map<string, OnsitePerf>();
    for (const o of onsite ?? []) m.set(o.path, o);
    return m;
  }, [onsite]);

  const matched = useMemo(
    () => (latest ? matchGscToPublishedContent(content, latest) : []),
    [latest, content],
  );

  async function onImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error(t("gsc.error.noFile"));
      return;
    }
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error(t("gsc.error.notCsv"));
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const imp = parseGscCsv(text, file.name);
      if (label.trim()) imp.dateRange = { label: label.trim() };
      // Prepend, cap to MAX_IMPORTS — never wipe previous imports on failure.
      const existing = project.gscLite?.imports ?? [];
      const imports = [imp, ...existing].slice(0, MAX_IMPORTS);
      updateProject(project.id, { gscLite: { imports, latestImportId: imp.id } });
      await saveWorkspaceNow();
      if (imp.truncated) toast.message(t("gsc.warn.truncated"));
      if (imp.importType === "queries") toast.message(t("gsc.warn.queryOnly"));
      toast.success(t("gsc.toast.imported", { rows: imp.summary.rowCount }));
      if (fileRef.current) fileRef.current.value = "";
      setLabel("");
    } catch (e) {
      toast.error(e instanceof GscParseError ? e.message : t("gsc.error.generic"));
    } finally {
      setImporting(false);
    }
  }

  async function deleteImport(id: string) {
    const existing = project.gscLite?.imports ?? [];
    const imports = existing.filter((i) => i.id !== id);
    updateProject(project.id, {
      gscLite: imports.length ? { imports, latestImportId: imports[0].id } : undefined,
    });
    await saveWorkspaceNow();
    toast.success(t("gsc.toast.deleted"));
  }

  const queryRows = useMemo(() => (latest?.rows ?? []).filter((r) => r.query).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10), [latest]);
  const pageRows = useMemo(() => (latest?.rows ?? []).filter((r) => r.path).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10), [latest]);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-gold/80" />
        <h2 className="font-display text-lg">{t("gsc.title")}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground max-w-3xl">{t("gsc.subtitle")}</p>

      {/* Import controls */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("gsc.file")}</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="mt-1.5 block text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary/60 file:px-3 file:py-1.5 file:text-sm" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("gsc.label")}</label>
          <Input className="mt-1.5 w-48" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("gsc.labelPlaceholder")} />
        </div>
        <Button onClick={onImport} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {importing ? t("gsc.importing") : t("gsc.import")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("gsc.helper")}</p>
      <p className="text-xs text-muted-foreground">{t("gsc.privacy")}</p>

      {!latest ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("gsc.empty")}</p>
      ) : (
        <div className="mt-6 space-y-6">
          <p className="text-xs text-muted-foreground">{t("gsc.caution")}</p>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card label={t("gsc.stat.clicks")} value={latest.summary.totalClicks} />
            <Card label={t("gsc.stat.impressions")} value={latest.summary.totalImpressions} />
            <Card label={t("gsc.stat.ctr")} value={`${latest.summary.averageCtr}%`} />
            <Card label={t("gsc.stat.position")} value={latest.summary.averagePosition || "—"} />
            <Card label={t("gsc.stat.topQuery")} value={latest.summary.topQuery ?? "—"} small />
            <Card label={t("gsc.stat.topPage")} value={latest.summary.topPage ?? "—"} small />
          </div>

          {/* Milo-published SEO proof */}
          {matched.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("gsc.matched.heading")}</div>
              {latest.importType === "queries" ? (
                <p className="text-sm text-muted-foreground">{t("gsc.matched.queryOnly")}</p>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">{t("gsc.col.page")}</th>
                        <th className="text-left px-4 py-3 font-medium w-20">{t("gsc.stat.clicks")}</th>
                        <th className="text-left px-4 py-3 font-medium w-24">{t("gsc.stat.impressions")}</th>
                        <th className="text-left px-4 py-3 font-medium w-20">{t("gsc.col.ctr")}</th>
                        <th className="text-left px-4 py-3 font-medium w-20">{t("gsc.col.position")}</th>
                        <th className="text-left px-4 py-3 font-medium w-28">{t("gsc.col.onsite")}</th>
                        <th className="text-left px-4 py-3 font-medium w-44">{t("gsc.col.recommendation")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border align-top">
                      {matched.map((m) => {
                        const rec = gscPageRecommendation(m);
                        const o = onsiteByPath.get(m.path);
                        return (
                          <tr key={m.assetId} className="hover:bg-secondary/40">
                            <td className="px-4 py-3">
                              <div className="font-medium truncate max-w-xs">{m.title}</div>
                              <a href={m.liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline underline-offset-4 inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />{m.path}</a>
                              {m.hasGscData && m.topQueries[0] ? <div className="text-xs text-muted-foreground mt-0.5">“{m.topQueries[0].query}”</div> : null}
                            </td>
                            <td className="px-4 py-3 font-mono">{m.hasGscData ? m.gscClicks : "—"}</td>
                            <td className="px-4 py-3 font-mono">{m.hasGscData ? m.gscImpressions : "—"}</td>
                            <td className="px-4 py-3 font-mono">{m.hasGscData ? `${m.gscCtr}%` : "—"}</td>
                            <td className="px-4 py-3 font-mono">{m.hasGscData ? m.gscPosition : "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{o ? `${o.viewsSincePublish} views · ${o.ctaClicksSincePublish + o.bookingClicksSincePublish} clicks` : "—"}</td>
                            <td className="px-4 py-3"><span className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border ${recClass(rec)}`}>{t(`gsc.rec.${rec}`)}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {/* Top queries */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("gsc.topQueries")}</div>
            {queryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("gsc.noQueries")}</p>
            ) : (
              <GscTable
                head={[t("gsc.col.query"), t("gsc.stat.clicks"), t("gsc.stat.impressions"), t("gsc.col.ctr"), t("gsc.col.position")]}
                rows={queryRows.map((r) => [r.query ?? "—", String(r.clicks), String(r.impressions), `${r.ctr}%`, String(r.position)])}
              />
            )}
          </div>

          {/* Top pages */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("gsc.topPages")}</div>
            {pageRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("gsc.noPages")}</p>
            ) : (
              <GscTable
                head={[t("gsc.col.page"), t("gsc.stat.clicks"), t("gsc.stat.impressions"), t("gsc.col.ctr"), t("gsc.col.position")]}
                rows={pageRows.map((r) => [r.path ?? r.page ?? "—", String(r.clicks), String(r.impressions), `${r.ctr}%`, String(r.position)])}
              />
            )}
          </div>

          {/* Import history */}
          {gsc && gsc.imports.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("gsc.history")}</div>
              <ul className="space-y-1.5">
                {gsc.imports.slice(0, MAX_IMPORTS).map((imp) => (
                  <li key={imp.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{imp.dateRange?.label || imp.fileName || imp.importType}</span>
                      <span className="text-xs text-muted-foreground ml-2">{imp.importedAt.slice(0, 10)} · {imp.summary.rowCount} rows · {imp.summary.totalClicks} clicks</span>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteImport(imp.id)} aria-label={t("gsc.delete")}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Card({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display ${small ? "text-sm truncate" : "text-2xl"} text-foreground`} title={String(value)}>{value}</div>
    </div>
  );
}

function GscTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} className={"text-left px-4 py-3 font-medium" + (i > 0 ? " w-24" : "")}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-secondary/40">
              {r.map((c, j) => <td key={j} className={j === 0 ? "px-4 py-3 truncate max-w-md" : "px-4 py-3 font-mono"}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
