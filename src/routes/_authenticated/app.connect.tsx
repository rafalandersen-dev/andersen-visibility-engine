import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { getConsentRequestFn, approveOAuthConsentFn, denyOAuthConsentFn, type ConsentView } from "@/lib/oauth.functions";
import { Bot, Check, Loader2, Lock, PenLine, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/connect")({
  validateSearch: z.object({ req: z.string().optional() }),
  head: () => ({ meta: [{ title: "Connect to Claude — Milo Growth" }, { name: "robots", content: "noindex" }] }),
  component: ConnectPage,
});

const CAN_KEYS = ["connect.can.projects", "connect.can.content", "connect.can.insights", "connect.can.authority"];
const CANNOT_KEYS = ["connect.cannot.create", "connect.cannot.edit", "connect.cannot.publish", "connect.cannot.delete", "connect.cannot.settings", "connect.cannot.billing"];

function ConnectPage() {
  const t = useT();
  const { user } = useAuth();
  const { req } = Route.useSearch();
  const [view, setView] = useState<ConsentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"allow" | "cancel" | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!req) {
      setView({ ok: false, reason: "not_found" });
      setLoading(false);
      return;
    }
    getConsentRequestFn({ data: { req } })
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView({ ok: false, reason: "error" }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [req]);

  async function onAllow() {
    if (!req) return;
    setBusy("allow");
    try {
      const res = await approveOAuthConsentFn({ data: { req } });
      if (res.ok && res.redirectUrl) {
        window.location.assign(res.redirectUrl);
        return;
      }
      toast.error(t("connect.error.generic"));
      setBusy(null);
    } catch {
      toast.error(t("connect.error.generic"));
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!req) return;
    setBusy("cancel");
    try {
      const res = await denyOAuthConsentFn({ data: { req } });
      if (res.ok && res.redirectUrl) {
        window.location.assign(res.redirectUrl);
        return;
      }
      toast.message(t("connect.error.generic"));
      setBusy(null);
    } catch {
      toast.error(t("connect.error.generic"));
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("connect.loading")}
          </div>
        ) : !view?.ok ? (
          <ErrorState reason={view?.reason} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-gold">
              <Bot className="h-5 w-5" />
              <span className="text-[10px] uppercase tracking-[0.22em]">{t("connect.badge")}</span>
            </div>
            <h1 className="mt-3 font-display text-2xl">{t("connect.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("connect.intro")}</p>

            <div className="mt-4 space-y-1 text-sm">
              {view.clientName ? (
                <div><span className="text-muted-foreground">{t("connect.requestedBy")}: </span><span className="font-medium">{view.clientName}</span></div>
              ) : null}
              {user?.email ? (
                <div><span className="text-muted-foreground">{t("connect.account")}: </span><span className="font-mono text-foreground/90">{user.email}</span></div>
              ) : null}
            </div>

            {(() => {
              const readScopes = (view.scopes ?? []).filter((s) => s.kind !== "write");
              const writeScopes = (view.scopes ?? []).filter((s) => s.kind === "write");
              const hasWrite = writeScopes.length > 0;
              // With write scopes granted, "cannot create/edit" would be false.
              const cannotKeys = hasWrite ? CANNOT_KEYS.filter((k) => k !== "connect.cannot.create" && k !== "connect.cannot.edit") : CANNOT_KEYS;
              return (
                <>
                  {hasWrite ? (
                    <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-amber-600/40 bg-amber-500/5 px-2.5 py-1 text-xs text-amber-600">
                      <PenLine className="h-3.5 w-3.5" /> {t("connect.write.badge")}
                    </div>
                  ) : (
                    <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-1 text-xs text-emerald-600">
                      <ShieldCheck className="h-3.5 w-3.5" /> {t("connect.readOnly")}
                    </div>
                  )}

                  {readScopes.length ? (
                    <div className="mt-5">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("connect.requesting")}</div>
                      <ul className="mt-2 space-y-1.5">
                        {readScopes.map((s) => (
                          <li key={s.scope} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
                            <span>{s.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {hasWrite ? (
                    <div className="mt-4 rounded-md border border-amber-600/40 bg-amber-500/5 p-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-amber-700">{t("connect.write.title")}</div>
                      <ul className="mt-2 space-y-1.5">
                        {writeScopes.map((s) => (
                          <li key={s.scope} className="flex items-start gap-2 text-sm">
                            <PenLine className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
                            <span>{s.label}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-amber-700/90">{t("connect.write.warning")}</p>
                    </div>
                  ) : null}

                  <div className="mt-5 grid sm:grid-cols-2 gap-4">
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs font-medium text-foreground">{t("connect.canTitle")}</div>
                      <ul className="mt-2 space-y-1.5">
                        {CAN_KEYS.map((k) => (
                          <li key={k} className="flex items-start gap-2 text-xs text-foreground/85"><Check className="mt-0.5 h-3.5 w-3.5 text-emerald-600 shrink-0" />{t(k)}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs font-medium text-foreground">{t("connect.cannotTitle")}</div>
                      <ul className="mt-2 space-y-1.5">
                        {cannotKeys.map((k) => (
                          <li key={k} className="flex items-start gap-2 text-xs text-muted-foreground"><X className="mt-0.5 h-3.5 w-3.5 text-destructive shrink-0" />{t(k)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={onAllow} disabled={busy !== null}>
                {busy === "allow" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("connect.allow")}
              </Button>
              <Button variant="outline" onClick={onCancel} disabled={busy !== null}>
                {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                {t("connect.cancel")}
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("connect.footer")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ErrorState({ reason }: { reason?: string }) {
  const t = useT();
  const key =
    reason === "expired" ? "connect.error.expired"
    : reason === "already_used" ? "connect.error.used"
    : reason === "invalid_client" ? "connect.error.client"
    : "connect.error.notFound";
  return (
    <div className="text-center py-6">
      <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
      <h1 className="mt-3 font-display text-xl">{t("connect.error.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(key)}</p>
      <p className="mt-4 text-xs text-muted-foreground">{t("connect.error.restart")}</p>
    </div>
  );
}
