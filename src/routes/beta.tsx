import { useAuthLanguage } from "@/hooks/use-auth-language";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";
import { Search, Sparkles, Gauge, Send, BarChart3, Award, ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/beta")({
  head: () => ({
    meta: [
      { title: "Milo Growth Assisted Beta — Milo Growth" },
      {
        name: "description",
        content:
          "A guided 30-day setup to plan, create, publish and measure website growth for your small business.",
      },
    ],
  }),
  component: BetaPage,
});

const OUTREACH = [
  {
    label: "Polish — short",
    text: "Cześć, przygotowałem krótkie narzędzie, które sprawdza, czy strona firmy jest czytelna dla nowoczesnego SEO i AI search. Nie chodzi o magiczne obietnice rankingów — bardziej o to, czy strona jasno pokazuje ofertę, lokalizację, zaufanie i odpowiedzi na pytania klientów. Mogę zrobić Ci darmowy szybki audit i pokazać 3–5 konkretnych rzeczy do poprawy.",
  },
  {
    label: "English — short",
    text: "Hi, I built a quick tool that checks whether a business website is clear enough for modern search and AI-assisted discovery. It’s not about magic ranking promises — it’s about whether your site clearly shows your offer, location, trust and answers to customer questions. I can run a free quick audit and show you 3–5 concrete things to improve.",
  },
  {
    label: "Swedish — short",
    text: "Hej, jag har byggt ett snabbt verktyg som kontrollerar om en företagswebbplats är tillräckligt tydlig för modern sökning och AI-assisterad upptäckt. Det handlar inte om magiska placeringslöften — utan om huruvida din sajt tydligt visar ert erbjudande, plats, förtroende och svar på kundernas frågor. Jag kan göra en gratis snabb granskning och visa 3–5 konkreta saker att förbättra.",
  },
  {
    label: "Follow-up",
    text: "Hi again — just following up on the free website visibility audit. No pressure: if it’s useful I can walk you through the 3–5 priorities and what a 30-day plan would look like. If now isn’t the right time, no problem at all.",
  },
];

function BetaPage() {
  const languageControls = useAuthLanguage();
  const { t } = languageControls;
  const HELPS = [
    { icon: Search, title: t("publicBeta.findWebsiteGrowthGaps") },
    { icon: Sparkles, title: t("publicBeta.createBrandAwareContent") },
    { icon: Gauge, title: t("publicBeta.scoreContentBeforePublishing") },
    { icon: Send, title: t("publicBeta.preparePublishingToYourWebsite") },
    { icon: BarChart3, title: t("publicBeta.measureVisitsClicksAndSearchSignals") },
    { icon: Award, title: t("publicBeta.reviewAuthorityOpportunities") },
  ];

  const INCLUDED = [
    t("publicAudit.title"),
    t("publicBeta.miloProjectSetup"),
    t("publicBeta.brandIntelligenceSetup"),
    t("publicBeta.websiteContentGapReview"),
    t("betaGuide.offerPlan"),
    t("betaGuide.offerPriorities"),
    t("betaGuide.offerDrafts"),
    t("betaGuide.offerPublishing"),
    t("publicBeta.analyticsTrackingSetupWhereAccessIsVerified"),
    t("publicBeta.gscLiteImportSupportIfSearchConsole"),
    t("betaGuide.offerAuthority"),
    t("publicBeta.reviewCall"),
  ];

  const JOURNEY = [
    {
      week: t("publicBeta.week1"),
      items: [
        t("publicAudit.badge"),
        t("setup.title"),
        t("brand.title"),
        t("publicBeta.trackingCheck"),
      ],
    },
    {
      week: t("publicBeta.week2"),
      items: [
        t("publicBeta.contentPrioritiesInPlan"),
        t("publicBeta.contentPlan"),
        t("publicBeta.miloScoreBaseline"),
      ],
    },
    {
      week: t("publicBeta.week3"),
      items: [
        t("publicBeta.draftReviewContent"),
        t("publicBeta.authorityTasks"),
        t("publicBeta.connectorSetupIfPossible"),
      ],
    },
    {
      week: t("publicBeta.week4"),
      items: [
        t("publicBeta.analyticsGscReview"),
        t("publicBeta.nextActions"),
        t("publicBeta.handoverOrMonthlySupportOffer"),
      ],
    },
  ];

  const PRICING = [
    {
      market: t("market.PL"),
      oneTime: t("publicBeta.pricePlOnce"),
      monthly: t("publicBeta.pricePlMonthly"),
    },
    {
      market: t("market.SE"),
      oneTime: t("publicBeta.priceSeOnce"),
      monthly: t("publicBeta.priceSeMonthly"),
    },
    {
      market: t("publicBeta.euEnglish"),
      oneTime: t("publicBeta.priceEuOnce"),
      monthly: t("publicBeta.priceEuMonthly"),
    },
  ];

  const FOR = [
    t("publicBeta.businessesWithAnExistingWebsite"),
    t("publicBeta.businessesThatNeedClearerServicesAndContent"),
    t("publicBeta.localServiceBusinessesWellnessBeautyClinicsConsultants"),
    t("publicBeta.peopleWhoWantGuidanceNotJustAnother"),
  ];
  const NOT_FOR = [
    t("publicBeta.peopleWantingGuaranteedRankings"),
    t("publicBeta.linkSpamOrBacklinkNetworks"),
    t("publicBeta.fullyAutomatedPublishingWithoutReview"),
    t("publicBeta.businessesNeedingEnterpriseSeoAgencyWork"),
  ];

  return (
    <MarketingShell languageControls={languageControls}>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">
          {t("publicBeta.assistedBeta")}
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">
          {t("publicBeta.miloGrowthAssistedBeta")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {t("publicBeta.aGuided30DaySetupToPlan")}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-foreground/80">{t("betaGuide.promise")}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/free-ai-visibility-audit">
            <Button size="lg" className="gap-2">
              {t("publicAudit.run")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#apply">
            <Button size="lg" variant="outline">
              {t("publicBeta.applyForBeta")}
            </Button>
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("publicBeta.pilotAvailabilityAndScopeAreAgreedIndividually")}
        </p>
      </section>

      {/* What Milo helps you do */}
      <section className="mx-auto max-w-5xl px-6 pb-4">
        <h2 className="font-display text-2xl md:text-3xl">{t("publicBeta.whatMiloHelpsYouDo")}</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HELPS.map((h) => (
            <div key={h.title} className="rounded-lg border border-border bg-card p-5">
              <h.icon className="h-5 w-5 text-gold/80" strokeWidth={1.6} />
              <div className="mt-3 font-medium">{h.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Proposed pilot scope */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-2xl md:text-3xl">{t("publicBeta.proposedPilotScope")}</h2>
        <div className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
          {INCLUDED.map((i) => (
            <div key={i} className="flex gap-2 text-sm">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-gold/80" />
              <span className="text-foreground/85">{i}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground max-w-2xl">{t("betaGuide.outcome")}</p>
      </section>

      {/* 30-day journey */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">
          {t("publicBeta.your30DayBetaJourney")}
        </h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {JOURNEY.map((w) => (
            <div key={w.week} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-gold">{w.week}</div>
              <ul className="mt-2 space-y-1 text-sm text-foreground/85">
                {w.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Case studies preview */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">{t("publicBeta.examples")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("publicBeta.earlyImplementationsAndWorkflowExamplesNotPerformance")}
        </p>
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {[
            {
              t: "Synergy Massage",
              d: t("publicBeta.localMassageAndRecoveryStudioSetupExample"),
              tag: t("publicBeta.earlyImplementation"),
            },
            {
              t: "Andersen Innovations",
              d: t("publicBeta.innovationStudioPlanningItsOwnGrowthContent"),
              tag: t("publicBeta.internalExample"),
            },
            {
              t: "SI Longevity",
              d: t("publicBeta.longevityWellnessBrandWorkflowExample"),
              tag: t("publicBeta.demoWorkflow"),
            },
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {c.tag}
              </div>
              <div className="mt-1 font-display text-lg">{c.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link
            to="/case-studies"
            className="text-sm text-foreground/70 underline underline-offset-4 hover:text-foreground"
          >
            {t("publicBeta.readTheCaseStudies")}
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">{t("publicBeta.betaPricing")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("publicBeta.betaPricingFinalSubscriptionPlansMayChange")}
        </p>
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {PRICING.map((p) => (
            <div key={p.market} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {p.market}
              </div>
              <div className="mt-2 font-display text-lg">{p.oneTime}</div>
              <div className="mt-1 text-sm text-muted-foreground">{p.monthly}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("publicBeta.finalPricingMayVaryBasedOnWebsite")}
        </p>
      </section>

      {/* Who this is for / not for */}
      <section className="mx-auto max-w-5xl px-6 pb-12 grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-display text-lg">{t("publicBeta.whoThisIsFor")}</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/85">
            {FOR.map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-display text-lg">{t("publicBeta.whoThisIsNotFor")}</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {NOT_FOR.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Outreach copy */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <details className="rounded-lg border border-border bg-card p-5">
          <summary className="cursor-pointer font-display text-lg">
            {t("publicBeta.outreachTemplatesInternal")}
          </summary>
          <div className="mt-4 space-y-4">
            {OUTREACH.map((o) => (
              <div key={o.label}>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
                  {o.label}
                </div>
                <p className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-foreground/85">
                  {o.text}
                </p>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/* Apply */}
      <section id="apply" className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-8 text-center">
          <h2 className="font-display text-2xl">{t("publicBeta.applyForTheAssistedBeta")}</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
            {t("publicBeta.startWithAFreeAuditOrGet")}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to={"/auth?source=beta" as never}>
              <Button>
                {t("publicBeta.applyForBeta")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="mailto:support@milogrowth.com?subject=Milo%20Assisted%20Beta">
              <Button variant="outline">{t("publicBeta.emailUs")}</Button>
            </a>
            <Link to="/free-ai-visibility-audit">
              <Button variant="outline">{t("publicAudit.run")}</Button>
            </Link>
          </div>
        </div>

        {/* Trust / safety */}
        <div className="mt-8 text-xs text-muted-foreground max-w-3xl space-y-1.5">
          <p>{t("publicBeta.miloIsAiAssistedAndHumanReviewed")}</p>
          <p>{t("publicBeta.miloIsAiAssistedContentShouldBe")}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
              {t("shell.terms")}
            </Link>
            <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
              {t("shell.privacy")}
            </Link>
            <Link
              to="/ai-disclaimer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              {t("publicBeta.aiDisclaimer")}
            </Link>
            <Link to="/security" className="underline underline-offset-4 hover:text-foreground">
              {t("shell.security")}
            </Link>
            <Link to="/cookies" className="underline underline-offset-4 hover:text-foreground">
              {t("publicBeta.cookies")}
            </Link>
          </p>
          <p className="pt-1">{t("publicBeta.thisPageSupportsEnglishPolishSwedishAnd")}</p>
        </div>
      </section>
    </MarketingShell>
  );
}
