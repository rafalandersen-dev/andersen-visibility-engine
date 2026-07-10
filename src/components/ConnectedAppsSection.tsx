import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/i18n";
import { getConnectedAppsFn, revokeConnectedAppFn, type ConnectedAppView } from "@/lib/oauth.functions";
import { scopePillTone } from "@/lib/pending-actions.ui";
import { Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

// Connected apps (Claude.ai OAuth grants) — list + revoke. Renders nothing
// while loading and nothing at all when the user has no grants (most users).
// Shows display-safe fields only: name, status, scope labels, dates.

const STATUS_STYLES: Record<ConnectedAppView["status"], string> = {
  active: "border-emerald-600/40 text-emerald-600",
  expired: "border-amber-600/40 text-amber-600",
  revoked: "border-border text-muted-foreground",
};

export function ConnectedAppsSection() {
  const t = useT();
  const [apps, setApps] = useState<ConnectedAppView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await getConnectedAppsFn();
      setApps(res.apps);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onRevoke(clientId: string) {
    setRevoking(clientId);
    try {
      await revokeConnectedAppFn({ data: { clientId } });
      await refresh();
      toast.success(t("claude.apps.revoked"));
    } catch {
      toast.error(t("claude.apps.revokeError"));
    } finally {
      setRevoking(null);
    }
  }

  // Hidden while loading; hidden entirely for users with no grants.
  if (!loaded || (!loadError && apps.length === 0)) return null;

  return (
    <div className="mt-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">{t("claude.apps.title")}</div>
      {loadError ? (
        <p className="text-xs text-muted-foreground">{t("claude.apps.loadError")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2 max-w-2xl">{t("claude.apps.subtitle")}</p>
          <ul className="space-y-1.5">
            {apps.map((app) => (
              <li key={app.clientId} className="rounded-md border border-border px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{app.clientName || t("claude.apps.unnamed")}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_STYLES[app.status]}`}>
                        {t(`claude.apps.status.${app.status}`)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {app.scopes.map((s) => (
                        <span
                          key={s.scope}
                          className={
                            scopePillTone(s.scope) === "amber"
                              ? "rounded-full border border-amber-600/40 bg-amber-500/5 px-2.5 py-0.5 text-xs text-amber-700"
                              : "rounded-full border border-border bg-secondary/30 px-2.5 py-0.5 text-xs"
                          }
                        >
                          {s.label}
                          {s.scope.endsWith(".propose") ? <span className="ml-1 opacity-80">· {t("claude.apps.scope.needsApproval")}</span> : null}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {t("claude.apps.connected")} {app.grantedAt ? app.grantedAt.slice(0, 10) : "—"} · {t("claude.lastUsed")}{" "}
                      {app.latestTokenLastUsedAt ? app.latestTokenLastUsedAt.slice(0, 10) : t("claude.never")}
                      {app.status === "active" && app.latestTokenExpiresAt ? (
                        <>
                          {" "}
                          · {t("claude.apps.expires")} {app.latestTokenExpiresAt.slice(0, 16).replace("T", " ")}
                        </>
                      ) : null}
                    </div>
                  </div>
                  {app.status !== "revoked" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={revoking === app.clientId}
                        >
                          {revoking === app.clientId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                          {t("claude.apps.revoke")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("claude.apps.revokeTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("claude.apps.revokeBody")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onRevoke(app.clientId)}>{t("claude.apps.revoke")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
