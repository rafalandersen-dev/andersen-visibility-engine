import { AuthLanguagePicker } from "@/components/AuthLanguagePicker";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "@/lib/types";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DISPLAY_REGIONS, REGION_SELECTOR_LABELS } from "@/lib/markets";

/**
 * Shared public (no-auth) chrome for marketing/sales pages: /beta,
 * /case-studies, /demo-script. Mirrors the pricing/legal page header & footer.
 */
export function MarketingShell({
  children,
  languageControls,
  language = "en",
}: {
  children: ReactNode;
  language?: OnboardingLanguage;
  languageControls?: { language: OnboardingLanguage; chooseLanguage: (value: string) => void };
}) {
  const pageLanguage = languageControls?.language ?? language;
  const t = (key: string) => translate(pageLanguage, key);
  return (
    <main lang={pageLanguage} className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl flex flex-wrap gap-3 items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("appShell.tagline")}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/free-ai-visibility-audit">{t("publicAudit.badge")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">{t("onboarding.getStarted")}</Link>
            </Button>
          </div>
        </div>
        {languageControls && (
          <div className="mx-auto max-w-6xl px-6">
            <AuthLanguagePicker
              language={languageControls.language}
              onChange={languageControls.chooseLanguage}
            />
          </div>
        )}
      </header>

      {children}

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-8 space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("shell.footerBuiltBy")}</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link to="/free-ai-visibility-audit" className="hover:text-foreground">
                {t("publicAudit.badge")}
              </Link>
              <Link to="/beta" className="hover:text-foreground">
                {t("publicBeta.beta")}
              </Link>
              <Link to="/case-studies" className="hover:text-foreground">
                {t("publicBeta.caseStudies")}
              </Link>
              <Link to="/pricing" className="hover:text-foreground">
                {t("betaScreen.pricing")}
              </Link>
              <Link to="/terms" className="hover:text-foreground">
                {t("shell.terms")}
              </Link>
              <Link to="/privacy" className="hover:text-foreground">
                {t("shell.privacy")}
              </Link>
              <Link to="/ai-disclaimer" className="hover:text-foreground">
                {t("shell.aiDisclaimer")}
              </Link>
              <Link to="/" className="hover:text-foreground">
                {t("publicBeta.home")}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="uppercase tracking-[0.18em]">{t("publicBeta.markets")}</span>
            {DISPLAY_REGIONS.map((r) => (
              <Link key={r} to={`/${r}` as never} className="hover:text-foreground">
                <span lang="en">{REGION_SELECTOR_LABELS[r]}</span>
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
