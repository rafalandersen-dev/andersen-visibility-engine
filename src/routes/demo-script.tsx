import { useAuthLanguage } from "@/hooks/use-auth-language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";

export const Route = createFileRoute("/demo-script")({
  head: () => ({
    meta: [
      { title: "Demo script — Milo Growth" },
      {
        name: "description",
        content: "An 8–10 minute walkthrough of the Milo Growth workflow for assisted-beta demos.",
      },
    ],
  }),
  component: DemoScriptPage,
});

function DemoScriptPage() {
  const languageControls = useAuthLanguage();
  const { t } = languageControls;
  const STEPS: { step: string; say: string }[] = [
    { step: t("publicBeta.startWithTheFreeAudit"), say: t("betaGuide.demoAudit") },
    { step: t("publicBeta.showScoreIssues"), say: t("betaGuide.demoScore") },
    { step: t("publicBeta.createProjectOnboarding"), say: t("betaGuide.demoSetup") },
    {
      step: t("publicBeta.showBrandIntelligence"),
      say: t("publicBeta.explainHowBrandRulesAndToneSupport"),
    },
    { step: t("publicBeta.showPlan"), say: t("publicBeta.showTheSavedContentPrioritiesInPlan") },
    { step: t("publicBeta.reviewAContentDraft"), say: t("betaGuide.demoDraft") },
    { step: t("publicBeta.showMiloScore"), say: t("betaGuide.demoQuality") },
    { step: t("publicBeta.reviewPublishingSetup"), say: t("betaGuide.demoPublishing") },
    {
      step: t("publicBeta.showAnalytics"),
      say: t("publicBeta.identifyTheSourcePeriodAndMissingData"),
    },
    {
      step: t("publicBeta.showGscLite"),
      say: t("publicBeta.showAvailableSearchConsoleEvidenceAndIts"),
    },
    { step: t("publicBeta.showAuthorityBuilder"), say: t("betaGuide.offerAuthority") },
    { step: t("publicBeta.closeWithTheBetaOffer"), say: t("betaGuide.demoClose") },
  ];

  return (
    <MarketingShell languageControls={languageControls}>
      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">
          {t("publicBeta.demoScript")}
        </div>
        <h1 className="mt-3 font-display text-4xl">{t("publicBeta.miloDemo810Minutes")}</h1>
        <p className="mt-3 text-muted-foreground">
          {t("publicBeta.aSimpleWalkthroughForAssistedBetaDemos")}{" "}
          <span className="text-foreground/85">
            {t("publicBeta.miloConnectsPlanningContentPublishingAndMeasurement")}
          </span>
        </p>

        <ol className="mt-8 space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="rounded-lg border border-border bg-card p-4 flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-[11px] font-medium text-gold">
                {i + 1}
              </span>
              <div>
                <div className="font-medium">{s.step}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{s.say}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-lg border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold">
            {t("beta.demoSafeTitle")}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-foreground/85">
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              {t("beta.demo.rankings")}
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              {t("publicBeta.paidLaunchIsOnHoldWhileStripe")}
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              {t("publicBeta.theWordpressAndShopifyConnectorsRequireLive")}
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              {t("publicBeta.analyticsAndGscProofDependOnData")}
            </li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/free-ai-visibility-audit">
            <Button>{t("publicBeta.startWithTheFreeAudit")}</Button>
          </Link>
          <Link to="/beta">
            <Button variant="outline">{t("publicBeta.seeTheBetaOffer")}</Button>
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          {t("publicBeta.miloIsAiAssistedAndHumanReviewed")}
        </p>
      </section>
    </MarketingShell>
  );
}
