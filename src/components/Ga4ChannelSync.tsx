import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateProject, saveWorkspaceNow, getState } from "@/lib/store";
import { useT } from "@/i18n";
import {
  disconnectGa4Fn,
  getGa4StatusFn,
  listGa4PropertiesFn,
  selectGa4PropertyFn,
  startGa4OAuthFn,
  syncGa4Fn,
  type Ga4Status,
} from "@/lib/ga4.functions";
import { isGa4RolloutProject, shouldAutoRefreshGa4, type Ga4Property } from "@/lib/ga4";
import { applyGa4ApiSnapshot, normalizeChatGptReports } from "@/lib/chatgpt-channel";
import type {
  ChatGptChannelReport,
  Ga4DailyReport,
  Ga4SyncErrorCode,
  Ga4SyncState,
  Project,
} from "@/lib/types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PanelProps {
  project: Project;
  /** Daily cron row; undefined while it loads. */
  daily: Ga4DailyReport | null | undefined;
  /** Stored reports with the daily row overlaid (display only). */
  reports: ChatGptChannelReport[];
}

/** Test rollout: hidden unless the project qualifies here AND the server confirms the caller. */
export function Ga4ChannelSync(props: PanelProps) {
  return isGa4RolloutProject(props.project) ? <Ga4ChannelSyncPanel {...props} /> : null;
}

/** Thrown when the signed-in owner or active project changed while a request was in flight. */
class StaleWrite extends Error {}

function Ga4ChannelSyncPanel({ project, daily, reports }: PanelProps) {
  const t = useT();
  const sync = project.ga4Sync;
  // Status shown: the newest attempt of the panel refresh or the daily job, best success of both.
  const day = daily && sync && daily.propertyId === sync.propertyId ? daily : undefined;
  const lastSuccessAt = [sync?.lastSuccessAt, day?.lastSuccessAt].filter(Boolean).sort().pop();
  const lastError =
    day && day.lastAttemptAt > (sync?.lastAttemptAt ?? "") ? day.lastError : sync?.lastError;
  const [conn, setConn] = useState<Ga4Status | null>(null);
  const [props, setProps] = useState<Ga4Property[] | null>(null);
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);
  const err = (code: Ga4SyncErrorCode) => t(`chatGptChannel.api.err.${code}`);
  const projectId = project.id;

  /** Owner identity at request start; every later write must still match it. */
  const actor = () => getState().userId;
  function save(owner: string | null, patch: Partial<Project>) {
    const s = getState();
    if (!s.hydrated || !owner || s.userId !== owner || s.activeProjectId !== projectId)
      throw new StaleWrite();
    updateProject(projectId, patch);
    return saveWorkspaceNow();
  }
  const liveSync = () => getState().projects.find((p) => p.id === projectId)?.ga4Sync;

  async function refresh(base: Ga4SyncState | undefined = sync) {
    if (!base) return;
    const owner = actor();
    setBusy(true);
    const now = new Date();
    try {
      const res = await syncGa4Fn({ data: { projectId } });
      const live = getState().projects.find((p) => p.id === projectId);
      const current = live?.ga4Sync;
      // A property switch or disconnect during the request makes this result stale.
      if (!live || !current || current.propertyId !== base.propertyId) return;
      if (!res.success) {
        await save(owner, {
          ga4Sync: { ...current, lastAttemptAt: now.toISOString(), lastError: res.error },
        });
        toast.error(err(res.error));
        return;
      }
      if (res.snapshot.propertyId !== base.propertyId) return;
      const next = applyGa4ApiSnapshot(
        normalizeChatGptReports(live.chatGptReports),
        res,
        res.snapshot,
        now,
      );
      if (!next.ok) {
        toast.error(t("chatGptChannel.errCapacity"));
        return;
      }
      await save(owner, {
        chatGptReports: next.reports,
        ga4Sync: {
          propertyId: res.snapshot.propertyId,
          propertyName: res.snapshot.propertyName,
          timeZone: res.snapshot.timeZone,
          lastAttemptAt: now.toISOString(),
          lastSuccessAt: res.snapshot.fetchedAt,
        },
      });
      toast.success(t("chatGptChannel.api.synced"));
    } catch (e) {
      if (!(e instanceof StaleWrite)) toast.error(t("chatGptChannel.errSave"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    getGa4StatusFn({ data: { projectId } })
      .then((r) => live && setConn(r.status))
      .catch(() => live && setConn("unavailable"));
    const q = new URLSearchParams(window.location.search);
    const cb = q.get("ga4");
    if (cb === "connected" || cb === "denied" || cb === "error") {
      toast[cb === "connected" ? "success" : "error"](
        t(`chatGptChannel.api.cb${cb[0].toUpperCase()}${cb.slice(1)}`),
      );
      q.delete("ga4");
      const qs = q.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open-time refresh: once per mount, only when neither the saved nor the daily snapshot is fresh.
  useEffect(() => {
    if (auto.current || conn !== "connected" || daily === undefined) return;
    if (!shouldAutoRefreshGa4(sync, reports, new Date())) return;
    auto.current = true;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, sync?.propertyId, daily === undefined]);

  async function connect() {
    const r = await startGa4OAuthFn({ data: { projectId } }).catch(() => null);
    if (r?.url) window.location.href = r.url;
    else toast.error(err(r?.error ?? "failed"));
  }
  async function load() {
    setBusy(true);
    const r = await listGa4PropertiesFn({ data: { projectId } }).catch(() => null);
    setBusy(false);
    if (!r || r.error) toast.error(err(r?.error ?? "failed"));
    else setProps(r.properties);
  }
  async function choose(id: string) {
    const owner = actor();
    setBusy(true);
    const r = await selectGa4PropertyFn({ data: { projectId, propertyId: id } }).catch(() => null);
    setBusy(false);
    if (!r || !r.success) return toast.error(err(r ? r.error : "failed"));
    const base: Ga4SyncState = {
      propertyId: r.propertyId,
      propertyName: r.name,
      timeZone: r.timeZone,
    };
    try {
      await save(owner, { ga4Sync: base });
      setProps(null);
      auto.current = true;
      await refresh(base);
    } catch (e) {
      if (!(e instanceof StaleWrite)) toast.error(t("chatGptChannel.errSave"));
    }
  }
  async function disconnect() {
    if (!window.confirm(t("chatGptChannel.api.disconnectPrompt"))) return;
    const owner = actor();
    setBusy(true);
    const r = await disconnectGa4Fn({ data: { projectId } }).catch(() => null);
    setBusy(false);
    if (!r || !r.success) return toast.error(err(r ? r.error : "failed"));
    setConn("disconnected");
    setProps(null);
    try {
      if (liveSync()) await save(owner, { ga4Sync: undefined });
    } catch {
      /* the server no longer holds the token or property; local metadata is re-checked on next open */
    }
    toast.success(t("chatGptChannel.api.disconnected"));
  }

  if (conn === null || conn === "unavailable") return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/40 p-4">
      <h3 className="text-sm font-medium">{t("chatGptChannel.api.title")}</h3>
      <p className="text-xs text-muted-foreground max-w-3xl">{t("chatGptChannel.api.intro")}</p>
      {conn === "error" ? (
        <p className="text-xs text-amber-600">{err("failed")}</p>
      ) : conn === "notConfigured" ? (
        <p className="text-xs text-amber-600">{err("not_configured")}</p>
      ) : conn === "disconnected" ? (
        <Button size="sm" onClick={connect}>
          {t("chatGptChannel.api.connect")}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs">{t("chatGptChannel.api.connected")}</p>
          {sync ? (
            <>
              <p className="text-xs">
                {t("chatGptChannel.api.property", {
                  name: sync.propertyName,
                  id: sync.propertyId,
                  tz: sync.timeZone,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastSuccessAt
                  ? t("chatGptChannel.api.lastSuccess", {
                      date: lastSuccessAt.slice(0, 16).replace("T", " "),
                    })
                  : t("chatGptChannel.api.never")}
              </p>
              {lastError ? (
                <p className="text-xs text-amber-600">
                  {err(lastError)} {t("chatGptChannel.api.stale")}
                </p>
              ) : null}
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {sync ? (
              <Button size="sm" onClick={() => refresh()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("chatGptChannel.api.refresh")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={load} disabled={busy}>
              {t("chatGptChannel.api.loadProps")}
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy}>
              {t("chatGptChannel.api.disconnect")}
            </Button>
          </div>
          {props ? (
            props.length ? (
              <ul className="space-y-1">
                {props.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {p.account} · {p.name} ({p.id})
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => choose(p.id)}
                    >
                      {t("chatGptChannel.api.useProp")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs">{t("chatGptChannel.api.noProps")}</p>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
