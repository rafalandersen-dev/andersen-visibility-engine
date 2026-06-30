import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, updateProject, saveWorkspaceNow } from "@/lib/store";
import { useT } from "@/i18n";
import {
  parseGscCsv,
  matchGscToPublishedContent,
  gscPageRecommendation,
  GscParseError,
  MAX_IMPORTS,
} from "@/lib/gsc";
import {
  getGscOAuthStatusFn,
  startGscOAuthFn,
  listGscSitesFn,
  selectGscSiteFn,
  syncGscSearchAnalyticsFn,
  disconnectGscFn,
  type GscOAuthStatus,
} from "@/lib/gsc.functions";
import type { Project, GscSiteEntry, GscOAuthMetadata } from "@/lib/types";
import { Search, Loader2, Upload, ExternalLink, Trash2, Link2, Link2Off, RefreshCw, Plug } from "lucide-react";
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

      {/* OAuth / API sync connection */}
      <GscConnectionCard project={project} />

      {/* Manual CSV import (always available) */}
      <div className="mt-6 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("gsc.csvHeading")}</div>
      <p className="mt-1 text-xs text-muted-foreground max-w-3xl">{t("gsc.csvFallbackNote")}</p>

      {/* Import controls */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
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
                      <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${imp.source === "api" ? "border-emerald-500/40 text-emerald-600" : "border-border text-muted-foreground"}`}>
                        {imp.source === "api" ? t("gsc.sourceApi") : t("gsc.sourceCsv")}
                      </span>
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

function GscConnectionCard({ project }: { project: Project }) {
  const t = useT();
  const [status, setStatus] = useState<GscOAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"connect" | "sites" | "select" | "sync28" | "sync90" | "disconnect" | null>(null);
  const [sites, setSites] = useState<GscSiteEntry[]>([]);
  const meta = project.gscOAuth;
  const selectedSiteUrl = meta?.selectedSite?.siteUrl ?? "";

  // Persist safe metadata only (never tokens) into the workspace JSONB.
  async function persistMeta(patch: Partial<GscOAuthMetadata>) {
    const next: GscOAuthMetadata = { ...(project.gscOAuth ?? {}), ...patch };
    updateProject(project.id, { gscOAuth: next });
    await saveWorkspaceNow();
  }

  async function refreshStatus() {
    try {
      const s = await getGscOAuthStatusFn();
      setStatus(s);
      // Mirror connection status into metadata so the launch checklist sees it.
      if (s.status !== project.gscOAuth?.status || (s.googleAccountEmail && s.googleAccountEmail !== project.gscOAuth?.googleAccountEmail)) {
        await persistMeta({ status: s.status, googleAccountEmail: s.googleAccountEmail });
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  // Initial status + handle the OAuth callback redirect (?gsc=...).
  useEffect(() => {
    refreshStatus();
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const gsc = params.get("gsc");
    if (gsc) {
      if (gsc === "connected") toast.success(t("gsc.oauth.connectedToast"));
      else if (gsc === "denied") toast.message(t("gsc.oauth.deniedToast"));
      else if (gsc === "error") toast.error(t("gsc.oauth.errorToast"));
      params.delete("gsc");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConnect() {
    setBusy("connect");
    try {
      const res = await startGscOAuthFn({ data: { projectId: project.id } });
      if (res.configured && res.url) {
        window.location.href = res.url;
        return;
      }
      toast.message(res.message || t("gsc.oauth.notConfigured"));
    } catch {
      toast.error(t("gsc.oauth.errorToast"));
    } finally {
      setBusy(null);
    }
  }

  async function onLoadSites() {
    setBusy("sites");
    try {
      const res = await listGscSitesFn();
      setStatus((s) => (s ? { ...s, status: res.status } : s));
      if (res.status !== "connected") {
        await persistMeta({ status: res.status });
        if (res.error) toast.error(res.error);
        return;
      }
      setSites(res.sites);
      if (!res.sites.length) toast.message(t("gsc.oauth.noSites"));
    } catch {
      toast.error(t("gsc.oauth.sitesError"));
    } finally {
      setBusy(null);
    }
  }

  async function onSelect(siteUrl: string) {
    setBusy("select");
    try {
      const site = sites.find((s) => s.siteUrl === siteUrl);
      const res = await selectGscSiteFn({ data: { siteUrl, permissionLevel: site?.permissionLevel } });
      if (!res.success) {
        toast.error(res.error || t("gsc.oauth.selectError"));
        return;
      }
      await persistMeta({
        status: "connected",
        selectedSite: { siteUrl: res.siteUrl!, permissionLevel: res.permissionLevel, selectedAt: new Date().toISOString() },
      });
      toast.success(t("gsc.oauth.selected"));
    } catch {
      toast.error(t("gsc.oauth.selectError"));
    } finally {
      setBusy(null);
    }
  }

  async function onSync(range: "28d" | "90d") {
    if (!selectedSiteUrl) return;
    setBusy(range === "28d" ? "sync28" : "sync90");
    try {
      const res = await syncGscSearchAnalyticsFn({ data: { siteUrl: selectedSiteUrl, range } });
      if (!res.success || !res.import) {
        if (res.status) setStatus((s) => (s ? { ...s, status: res.status! } : s));
        await persistMeta({ status: res.status, sync: { ...(project.gscOAuth?.sync ?? {}), lastError: res.error } });
        toast.error(res.error || t("gsc.oauth.syncError"));
        return;
      }
      const imp = res.import;
      const existing = project.gscLite?.imports ?? [];
      const imports = [imp, ...existing].slice(0, MAX_IMPORTS);
      updateProject(project.id, {
        gscLite: { imports, latestImportId: imp.id },
        gscOAuth: {
          ...(project.gscOAuth ?? {}),
          status: "connected",
          sync: {
            lastSyncedAt: imp.importedAt,
            lastSyncRange: range,
            lastSyncStartDate: imp.dateRange?.start,
            lastSyncEndDate: imp.dateRange?.end,
            lastRowCount: imp.summary.rowCount,
            lastError: undefined,
          },
        },
      });
      await saveWorkspaceNow();
      toast.success(t("gsc.oauth.syncToast", { rows: imp.summary.rowCount }));
    } catch {
      toast.error(t("gsc.oauth.syncError"));
    } finally {
      setBusy(null);
    }
  }

  async function onDisconnect() {
    setBusy("disconnect");
    try {
      await disconnectGscFn();
      setSites([]);
      setStatus((s) => (s ? { ...s, status: "disconnected", googleAccountEmail: undefined } : s));
      await persistMeta({ status: "disconnected", googleAccountEmail: undefined, selectedSite: undefined });
      toast.success(t("gsc.oauth.disconnected"));
    } catch {
      toast.error(t("gsc.oauth.errorToast"));
    } finally {
      setBusy(null);
    }
  }

  const box = "mt-4 rounded-lg border border-border bg-background/40 p-4";

  if (loading) {
    return (
      <div className={box}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("gsc.oauth.title")}
        </div>
      </div>
    );
  }

  const connStatus = status?.status ?? "notConfigured";

  return (
    <div className={box}>
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-gold/80" />
        <span className="text-sm font-medium text-foreground">{t("gsc.oauth.title")}</span>
        <StatusPill status={connStatus} />
      </div>

      {/* Not configured */}
      {connStatus === "notConfigured" ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("gsc.oauth.notConfigured")}</p>
      ) : null}

      {/* Disconnected */}
      {connStatus === "disconnected" ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">{t("gsc.oauth.consent")}</p>
          <Button size="sm" onClick={onConnect} disabled={busy === "connect"}>
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {t("gsc.oauth.connect")}
          </Button>
        </div>
      ) : null}

      {/* Error / expired */}
      {connStatus === "error" || connStatus === "expired" ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-amber-600">{t(connStatus === "expired" ? "gsc.oauth.expired" : "gsc.oauth.errorState")}</p>
          <Button size="sm" variant="outline" onClick={onConnect} disabled={busy === "connect"}>
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("gsc.oauth.reconnect")}
          </Button>
        </div>
      ) : null}

      {/* Connected */}
      {connStatus === "connected" ? (
        <div className="mt-3 space-y-3">
          {status?.googleAccountEmail ? (
            <div className="text-xs text-muted-foreground">{t("gsc.oauth.account")}: <span className="font-mono text-foreground/80">{status.googleAccountEmail}</span></div>
          ) : null}

          {selectedSiteUrl ? (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">{t("gsc.oauth.selectedProperty")}: </span>
                <span className="font-mono text-foreground/90">{selectedSiteUrl}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => onSync("28d")} disabled={busy !== null}>
                  {busy === "sync28" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t("gsc.oauth.sync28")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSync("90d")} disabled={busy !== null}>
                  {busy === "sync90" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t("gsc.oauth.sync90")}
                </Button>
                <Button size="sm" variant="ghost" onClick={onLoadSites} disabled={busy !== null}>{t("gsc.oauth.changeProperty")}</Button>
              </div>
              {meta?.sync?.lastSyncedAt ? (
                <div className="text-xs text-muted-foreground">
                  {t("gsc.oauth.lastSync")}: {meta.sync.lastSyncedAt.slice(0, 10)} · {meta.sync.lastRowCount ?? 0} {t("gsc.oauth.rows")}
                  {meta.sync.lastSyncStartDate ? ` · ${meta.sync.lastSyncStartDate} → ${meta.sync.lastSyncEndDate}` : ""}
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("gsc.oauth.chooseProperty")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={onLoadSites} disabled={busy === "sites"}>
                  {busy === "sites" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t("gsc.oauth.loadSites")}
                </Button>
                {sites.length > 0 ? (
                  <Select onValueChange={onSelect} disabled={busy === "select"}>
                    <SelectTrigger className="w-72"><SelectValue placeholder={t("gsc.oauth.selectProperty")} /></SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </div>
          )}

          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDisconnect} disabled={busy === "disconnect"}>
            {busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
            {t("gsc.oauth.disconnect")}
          </Button>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">{t("gsc.oauth.readOnlyNote")}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const t = useT();
  const map: Record<string, { cls: string; key: string }> = {
    connected: { cls: "border-emerald-500/40 text-emerald-600", key: "gsc.oauth.status.connected" },
    disconnected: { cls: "border-border text-muted-foreground", key: "gsc.oauth.status.disconnected" },
    expired: { cls: "border-amber-500/40 text-amber-600", key: "gsc.oauth.status.expired" },
    error: { cls: "border-destructive/40 text-destructive", key: "gsc.oauth.status.error" },
    notConfigured: { cls: "border-border text-muted-foreground", key: "gsc.oauth.status.notConfigured" },
  };
  const m = map[status] ?? map.notConfigured;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${m.cls}`}>{t(m.key)}</span>;
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
