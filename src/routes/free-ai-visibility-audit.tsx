import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthLanguage } from "@/hooks/use-auth-language";
import { AuthLanguagePicker } from "@/components/AuthLanguagePicker";
import { contentLangToProjectLanguage } from "@/lib/onboarding";
import { PublicAuditUnavailableError, runPublicAudit } from "@/lib/public-audit-client";
import {
  PUBLIC_AUDIT_CATEGORY_KEYS,
  type PublicAiVisibilityAudit,
  type PublicAuditStatus,
} from "@/lib/public-audit";
import { Gauge, Loader2, Search, AlertTriangle, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/free-ai-visibility-audit")({
  head: () => ({
    meta: [
      { title: "Free AI Visibility Readiness Audit — Milo Growth" },
      {
        name: "description",
        content:
          "Check how clearly your website explains your business to modern search engines and AI-assisted discovery tools.",
      },
    ],
  }),
  component: PublicAuditPage,
});

function statusClasses(s: PublicAuditStatus) {
  return s === "strong"
    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
    : s === "okay"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
      : "bg-destructive/10 border-destructive/30 text-destructive";
}

function PublicAuditPage() {
  const navigate = useNavigate();
  const { language: lang, chooseLanguage, t } = useAuthLanguage();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [result, setResult] = useState<PublicAiVisibilityAudit | null>(null);
  const [botProof, setBotProof] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  async function run() {
    const trimmed = url.trim();
    if (!trimmed || !/\.\w{2,}/.test(trimmed)) {
      setError(t("publicAudit.invalidUrl"));
      return;
    }
    if (import.meta.env.PROD && !botProof) {
      setError("Please complete the bot check and try again.");
      return;
    }
    setLoading(true);
    setError(null);
    setUnavailable(false);
    setResult(null);
    try {
      const audit = await runPublicAudit({
        url: trimmed,
        language: contentLangToProjectLanguage(lang),
        botProof,
      });
      setResult(audit);
    } catch (e) {
      setUnavailable(e instanceof PublicAuditUnavailableError);
      setError(e instanceof Error ? e.message : t("publicAudit.genericError"));
    } finally {
      setLoading(false);
      setBotProof("");
      setTurnstileReset((value) => value + 1);
    }
  }

  function startProject() {
    if (result) {
      try {
        sessionStorage.setItem(
          "milo_free_audit",
          JSON.stringify({
            url: result.normalizedUrl,
            businessName: result.extractedSignals?.detectedBusinessName ?? "",
            at: result.auditedAt,
          }),
        );
      } catch {
        /* ignore */
      }
    }
    const website = encodeURIComponent(result?.normalizedUrl ?? url.trim());
    navigate({ to: `/auth?source=free-audit&website=${website}` as never });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("appShell.tagline")}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">{t("shell.nav.home")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">{t("onboarding.getStarted")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-14">
        <AuthLanguagePicker language={lang} onChange={chooseLanguage} disabled={loading} />
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold inline-flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5" /> {t("publicAudit.badge")}
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">{t("publicAudit.title")}</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">{t("publicAudit.subtitle")}</p>

        <div className="mt-7 flex flex-wrap gap-2 max-w-xl">
          <Input
            className="flex-1 min-w-[220px]"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) run();
            }}
            aria-label={t("launch.conn.website")}
            placeholder="yourbusiness.com"
            disabled={loading}
          />
          <Button onClick={run} disabled={loading || (import.meta.env.PROD && !botProof)}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? t("publicAudit.running") : t("publicAudit.run")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("publicAudit.helper")}</p>
        <p className="text-xs text-muted-foreground">{t("publicAudit.safeNote")}</p>

        {turnstileSiteKey ? (
          <div className="mt-4">
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              resetKey={turnstileReset}
              onToken={setBotProof}
            />
          </div>
        ) : import.meta.env.PROD ? (
          <p className="mt-4 text-xs text-destructive">
            Bot protection is temporarily unavailable. Please try again later.
          </p>
        ) : null}

        {/* The endpoint returns a final result, not stage progress. */}
        {loading ? (
          <div
            role="status"
            className="mt-8 rounded-lg border border-border bg-card p-5 flex items-center gap-2 text-sm"
          >
            <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden="true" />
            {t("publicAudit.running")}
          </div>
        ) : null}

        {/* Error */}
        {error && !loading ? (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-border bg-card p-6 text-center"
          >
            <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" strokeWidth={1.5} />
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
            {/* Offer project setup when no usable service response was received. */}
            {unavailable ? (
              <Button className="mt-4" onClick={startProject}>
                {t("publicAudit.cta")}
              </Button>
            ) : (
              <Button className="mt-4" variant="outline" onClick={run}>
                {t("common.retry")}
              </Button>
            )}
          </div>
        ) : null}

        {/* Results */}
        {result && !loading ? (
          <div className="mt-10 space-y-7">
            <div className="rounded-lg border border-border bg-card p-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-5xl">{result.overall}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("publicAudit.overall")}
                </div>
                <span
                  className={`mt-1 inline-block text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${statusClasses(result.status)}`}
                >
                  {t(`publicAudit.status.${result.status}`)}
                </span>
              </div>
            </div>

            {result.summary ? (
              <p className="text-sm text-foreground/85 max-w-2xl">{result.summary}</p>
            ) : null}

            {/* Category breakdown */}
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
                {t("publicAudit.breakdown")}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {PUBLIC_AUDIT_CATEGORY_KEYS.map((k) => {
                  const c = result.categories[k];
                  return (
                    <div key={k} className="rounded-md border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{t(`publicAudit.cat.${k}`)}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-mono">{c.score}</span>
                          <span
                            className={`text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full border ${statusClasses(c.status)}`}
                          >
                            {t(`publicAudit.status.${c.status}`)}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{c.explanation}</p>
                      {c.suggestions.length ? (
                        <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
                          {c.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Issues / wins / actions */}
            <div className="grid md:grid-cols-3 gap-4">
              <ListCard title={t("publicAudit.topIssues")} items={result.topIssues} />
              <ListCard title={t("publicAudit.quickWins")} items={result.quickWins} />
              <ListCard title={t("publicAudit.recommended")} items={result.recommendedActions} />
            </div>

            {/* Extracted signals */}
            {result.extractedSignals ? (
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {t("publicAudit.signals")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("publicAudit.approxNote")}</p>
                <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Sig
                    label={t("publicAudit.signal.title")}
                    value={result.extractedSignals.title}
                  />
                  <Sig
                    label={t("publicAudit.signal.meta")}
                    value={result.extractedSignals.metaDescription}
                  />
                  <Sig label={t("publicAudit.signal.h1")} value={result.extractedSignals.h1} />
                  <Sig
                    label={t("publicAudit.signal.business")}
                    value={result.extractedSignals.detectedBusinessName}
                  />
                  <Sig
                    label={t("publicAudit.signal.services")}
                    value={result.extractedSignals.detectedServices?.join(", ")}
                  />
                  <Sig
                    label={t("publicAudit.signal.locations")}
                    value={result.extractedSignals.detectedLocations?.join(", ")}
                  />
                  <Sig
                    label={t("publicAudit.signal.faq")}
                    value={
                      result.extractedSignals.hasFaqSignals
                        ? t("publicAudit.yes")
                        : t("publicAudit.no")
                    }
                  />
                  <Sig
                    label={t("publicAudit.signal.contact")}
                    value={
                      result.extractedSignals.hasContactSignals
                        ? t("publicAudit.yes")
                        : t("publicAudit.no")
                    }
                  />
                  <Sig
                    label={t("publicAudit.signal.trust")}
                    value={
                      result.extractedSignals.hasTrustSignals
                        ? t("publicAudit.yes")
                        : t("publicAudit.no")
                    }
                  />
                </dl>
              </div>
            ) : null}

            {/* CTA */}
            <div className="rounded-lg border border-gold/40 bg-gold/5 p-6 text-center">
              <h2 className="font-display text-xl">{t("publicAudit.ctaTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl mx-auto">
                {t("publicAudit.ctaBody")}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={startProject}>
                  {t("publicAudit.cta")} <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setUrl("");
                  }}
                >
                  {t("publicAudit.ctaSecondary")}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
          </div>
        ) : null}

        {!result && !loading ? (
          <p className="mt-8 text-xs text-muted-foreground">{t("publicAudit.privacy")}</p>
        ) : null}
      </section>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Milo Growth — built by Andersen Innovations</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {title}
      </div>
      <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/85">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Sig({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <dt className="text-muted-foreground shrink-0">{label}:</dt>
      <dd className="truncate text-foreground/85">{value || "—"}</dd>
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          theme: "auto";
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
}: {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;

    const render = () => {
      if (!active || !elementRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(elementRef.current, {
        sitekey: siteKey,
        action: "public_audit",
        theme: "auto",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };

    const scriptId = "milo-turnstile-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existing?.removeEventListener("load", render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, resetKey, siteKey]);

  return <div ref={elementRef} aria-label="Bot protection check" />;
}
