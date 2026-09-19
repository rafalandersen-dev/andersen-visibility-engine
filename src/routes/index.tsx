import { AuthLanguagePicker } from "@/components/AuthLanguagePicker";
import { useAuthLanguage } from "@/hooks/use-auth-language";
import { translate } from "@/i18n/translate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PLAN_LIMITS } from "@/lib/billing";
import { hreflangLinks } from "@/lib/locales";
import {
  ArrowRight,
  CalendarBlank,
  ChartLineUp,
  Check,
  CheckCircle,
  Compass,
  FileText,
  Gauge,
  Globe,
  Leaf,
  LinkSimple,
  Lock,
  Medal,
  PaperPlaneTilt,
  PencilLine,
  ShieldCheck,
  Sparkle,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { RegionSuggestionBanner } from "@/components/RegionSuggestionBanner";
import { DISPLAY_REGIONS, REGION_SELECTOR_LABELS } from "@/lib/markets";

type HomeTranslate = ReturnType<typeof useAuthLanguage>["t"];

function homeFaq(t: HomeTranslate) {
  return [
    {
      id: "discovery",
      q: t("publicHome.faqDiscoveryQ"),
      a: t("publicHome.faqDiscoveryA"),
    },
    {
      id: "score",
      q: t("publicHome.faqScoreQ"),
      a: t("publicHome.faqScoreA"),
    },
    {
      id: "publish",
      q: t("publicHome.faqPublishQ"),
      a: t("publicHome.faqPublishA"),
    },
    {
      id: "backlinks",
      q: t("publicHome.faqBacklinksQ"),
      a: t("publicHome.faqBacklinksA"),
    },
    {
      id: "cancel",
      q: t("publicHome.faqCancelQ"),
      a: t("publicHome.faqCancelA"),
    },
    {
      id: "projects",
      q: t("publicHome.faqProjectsQ"),
      a: t("publicHome.faqProjectsA", { count: PLAN_LIMITS.agency.maxProjects }),
    },
  ];
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milo Growth — Your Monthly AI SEO Growth System" },
      {
        name: "description",
        content: `Turn site, search, competitor and AI visibility signals into a clear SEO plan, better content and measurable growth — across up to ${PLAN_LIMITS.agency.maxProjects} projects on Agency.`,
      },
      { property: "og:title", content: "Milo Growth — Your Monthly AI SEO Growth System" },
      {
        property: "og:description",
        content: "Discover, plan, create, publish and measure SEO work in one calm system.",
      },
      { property: "og:url", content: "https://milogrowth.com/" },
      { name: "twitter:title", content: "Milo Growth — Your Monthly AI SEO Growth System" },
      {
        name: "twitter:description",
        content: "Turn visibility signals into a clear growth plan and prove what changed.",
      },
    ],
    links: [{ rel: "canonical", href: "https://milogrowth.com/" }, ...hreflangLinks()],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: homeFaq((key, vars) => translate("en", key, vars)).map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const controls = useAuthLanguage();
  const { t } = controls;
  return (
    <main lang={controls.language} className="min-h-screen bg-[#fbfaf6] text-[#202221]">
      <RegionSuggestionBanner language={controls.language} />
      <PublicHeader controls={controls} />
      <Hero t={t} />
      <ProofStrip t={t} />
      <ConnectedWorkflow t={t} />
      <ProductSystem t={t} />
      <BacklinksAddOn t={t} />
      <TrustAndPricing t={t} />
      <Faq t={t} />
      <PublicFooter t={t} />
    </main>
  );
}

function PublicHeader({ controls }: { controls: ReturnType<typeof useAuthLanguage> }) {
  const { t } = controls;
  return (
    <header className="sticky top-0 z-40 border-b border-[#e6dfd2] bg-[#fbfaf6]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1340px] items-center justify-between px-5 py-4 md:px-8">
        <Link to="/" className="flex flex-col">
          <span className="font-display text-[21px] leading-tight tracking-[-0.02em]">
            Milo Growth
          </span>
          <span className="text-[9px] uppercase tracking-[0.22em] text-[#697282]">
            {t("publicHome.tagline")}
          </span>
        </Link>
        <nav
          className="hidden items-center gap-8 text-[13px] text-[#333b42] lg:flex"
          aria-label={t("publicHome.nav")}
        >
          <a href="#product" className="border-b border-[#b5862a] py-2">
            {t("publicHome.product")}
          </a>
          <a href="#how" className="py-2 hover:text-black">
            {t("publicHome.how")}
          </a>
          <Link to="/pricing" className="py-2 hover:text-black">
            {t("publicHome.pricing")}
          </Link>
          <a href="#backlinks" className="py-2 hover:text-black">
            {t("publicHome.backlinks")}
          </a>
          <a href="#resources" className="py-2 hover:text-black">
            {t("publicHome.resources")}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth" search={{ mode: "login" }}>
              {t("publicHome.signIn")}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ mode: "register" }}>
              {t("publicHome.startFree")}
            </Link>
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-[1340px] px-5 md:px-8">
        <AuthLanguagePicker language={controls.language} onChange={controls.chooseLanguage} />
      </div>
    </header>
  );
}

function Hero({ t }: { t: HomeTranslate }) {
  return (
    <section id="product" className="border-b border-[#e6dfd2]">
      <div className="mx-auto grid max-w-[1340px] items-center gap-10 px-5 py-12 md:px-8 lg:grid-cols-[430px_minmax(0,1fr)] lg:py-14">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ddd8cd] bg-[#fffdf8] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#697282]">
            <Sparkle size={13} weight="fill" className="text-[#b5862a]" />{" "}
            {t("publicHome.forSmall")}
          </div>
          <h1 className="mt-7 font-display text-[46px] leading-[1.08] tracking-[-0.045em] sm:text-[58px]">
            {t("publicHome.heroBefore")}{" "}
            <span className="text-[#bd9250]">{t("publicHome.heroEmphasis")}</span>{" "}
            {t("publicHome.heroAfter")}
          </h1>
          <p className="mt-6 text-[19px] leading-8 text-[#647183]">{t("publicHome.heroLead")}</p>
          <p className="mt-3 max-w-[410px] text-[15px] leading-6 text-[#647183]">
            {t("publicHome.heroBody", { count: PLAN_LIMITS.agency.maxProjects })}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="min-w-[142px] gap-2">
              <Link to="/auth" search={{ mode: "register" }}>
                {t("publicHome.startFree")}
                <ArrowRight size={17} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">{t("publicHome.seeHow")}</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-[10px] text-[#647183]">
            <TrustItem icon={CheckCircle} label={t("publicHome.noCard")} />
            <TrustItem icon={Lock} label={t("publicHome.noAgency")} />
            <TrustItem icon={Leaf} label={t("publicHome.selfService")} />
            <TrustItem
              icon={UsersThree}
              label={t("publicHome.agencyProjects", { count: PLAN_LIMITS.agency.maxProjects })}
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-[#d8d2c7] bg-[#fffdf8] shadow-[0_20px_60px_rgba(26,31,34,.12)]">
          <img
            src="/images/milo-plan-workspace.png"
            alt={t("publicHome.workspaceAlt")}
            width={1536}
            height={1024}
            loading="eager"
            fetchPriority="high"
            className="block aspect-[1.5/1] w-full object-cover object-left-top"
          />
        </div>
      </div>
    </section>
  );
}

function TrustItem({ icon: Icon, label }: { icon: typeof CheckCircle; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-r border-[#ddd8cd] pr-4 last:border-r-0 last:pr-0">
      <Icon size={15} className="text-[#557786]" /> {label}
    </span>
  );
}

function ProofStrip({ t }: { t: HomeTranslate }) {
  const points = [
    { icon: CalendarBlank, label: t("publicHome.onePlan") },
    { icon: LinkSimple, label: t("publicHome.fiveSteps") },
    { icon: UsersThree, label: t("publicHome.humanReview") },
    {
      icon: UsersThree,
      label: t("publicHome.agencyProjects", { count: PLAN_LIMITS.agency.maxProjects }),
    },
    { icon: XCircle, label: t("publicHome.billingControls") },
  ];
  return (
    <section className="border-b border-[#e6dfd2] bg-[#fffdf8]">
      <div className="mx-auto grid max-w-[1340px] gap-0 px-5 py-6 md:grid-cols-[1.1fr_repeat(5,1fr)] md:px-8">
        <div className="flex items-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#647183]">
          {t("publicHome.smallBusinesses")}
        </div>
        {points.map((point) => (
          <div
            key={point.label}
            className="mt-3 flex items-center gap-2 border-l border-[#ddd8cd] px-4 text-[10px] text-[#647183] md:mt-0"
          >
            <point.icon size={17} className="shrink-0 text-[#557786]" /> {point.label}
          </div>
        ))}
      </div>
    </section>
  );
}

function ConnectedWorkflow({ t }: { t: HomeTranslate }) {
  const steps = [
    {
      icon: Compass,
      title: t("publicHome.discover"),
      body: t("publicHome.discoverBody"),
    },
    {
      icon: CalendarBlank,
      title: t("publicHome.plan"),
      body: t("publicHome.planBody"),
    },
    {
      icon: PencilLine,
      title: t("publicHome.create"),
      body: t("publicHome.createBody"),
    },
    {
      icon: PaperPlaneTilt,
      title: t("publicHome.publish"),
      body: t("publicHome.publishBody"),
    },
    {
      icon: ChartLineUp,
      title: t("publicHome.measure"),
      body: t("publicHome.measureBody"),
    },
  ];
  return (
    <section id="how" className="border-b border-[#e6dfd2]">
      <div className="mx-auto max-w-[1340px] px-5 py-16 md:px-8 lg:py-20">
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
          {t("publicHome.how")}
        </div>
        <h2 className="mt-3 max-w-3xl font-display text-3xl tracking-[-0.03em] sm:text-[42px]">
          {t("publicHome.connectedSteps")}
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-5">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="relative border-t border-[#ddd8cd] pt-5 md:border-t-0 md:pt-0"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#ddd8cd] bg-[#fffdf8]">
                  <step.icon size={18} />
                </div>
                <div>
                  <div className="text-[9px] text-[#7a8390]">
                    {t("publicHome.step", { number: String(index + 1).padStart(2, "0") })}
                  </div>
                  <h3 className="mt-1 text-sm font-medium">{step.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-[#647183]">{step.body}</p>
              {index < steps.length - 1 ? (
                <ArrowRight
                  size={16}
                  className="absolute -right-3 top-5 hidden text-[#aaa397] md:block"
                />
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductSystem({ t }: { t: HomeTranslate }) {
  const capabilities = [
    {
      icon: Gauge,
      title: t("publicHome.siteAudit"),
      body: t("publicHome.siteAuditBody"),
    },
    {
      icon: UsersThree,
      title: t("publicHome.competitorGaps"),
      body: t("publicHome.competitorGapsBody"),
    },
    {
      icon: Medal,
      title: t("publicHome.authority"),
      body: t("publicHome.authorityBody"),
    },
    {
      icon: Globe,
      title: t("publicHome.aiVisibility"),
      body: t("publicHome.aiVisibilityBody"),
    },
    {
      icon: FileText,
      title: t("publicHome.contentScore"),
      body: t("publicHome.contentScoreBody"),
    },
    {
      icon: ChartLineUp,
      title: t("publicHome.analytics"),
      body: t("publicHome.analyticsBody"),
    },
  ];
  return (
    <section className="border-b border-[#e6dfd2] bg-[#f7f4ed]">
      <div className="mx-auto max-w-[1340px] px-5 py-16 md:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
              {t("publicHome.everythingRetained")}
            </div>
            <h2 className="mt-3 font-display text-3xl tracking-[-0.03em] sm:text-[42px]">
              {t("publicHome.connectedWork")}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#647183]">
              {t("publicHome.settingsBody")}
            </p>
            <Button asChild>
              <Link to="/auth" search={{ mode: "register" }} className="mt-6">
                {t("publicHome.startProject")}
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-[#ddd8cd] bg-[#fffdf8] p-5"
              >
                <item.icon size={20} className="text-[#b5862a]" />
                <h3 className="mt-4 font-display text-lg">{item.title}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#647183]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BacklinksAddOn({ t }: { t: HomeTranslate }) {
  const capabilities = [
    { label: t("publicHome.linkProfile"), icon: LinkSimple },
    { label: t("publicHome.marketplace"), icon: ShieldCheck },
    { label: t("publicHome.outreach"), icon: PaperPlaneTilt },
    { label: t("publicHome.costControls"), icon: Lock },
  ];

  return (
    <section id="backlinks" className="border-b border-[#e6dfd2] bg-[#18232c] text-[#eef0ee]">
      <div className="mx-auto grid max-w-[1340px] items-center gap-10 px-5 py-16 md:px-8 lg:grid-cols-[1fr_.9fr] lg:py-20">
        <div>
          <div className="inline-flex rounded-full border border-[#e0b34e]/35 bg-[#e0b34e]/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#e0b34e]">
            {t("publicHome.optionalAddon")}
          </div>
          <h2 className="mt-5 font-display text-3xl tracking-[-0.03em] sm:text-[42px]">
            {t("publicHome.backlinksHeading")}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#b9c1c4]">
            {t("publicHome.backlinksBody")}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="bg-[#eef0ee] text-[#18232c] hover:bg-white">
              <Link to="/pricing">{t("publicHome.addonPricing")}</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/auth" search={{ mode: "register" }}>
                {t("publicHome.exploreFirst")}
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {capabilities.map(({ label, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[.04] p-5">
              <Icon size={20} className="text-[#e0b34e]" />
              <div className="mt-4 text-sm font-medium">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustAndPricing({ t }: { t: HomeTranslate }) {
  return (
    <section className="border-b border-[#e6dfd2]">
      <div className="mx-auto grid max-w-[1340px] gap-8 px-5 py-16 md:px-8 lg:grid-cols-2 lg:py-20">
        <article className="rounded-lg border border-[#ddd8cd] bg-[#fffdf8] p-7">
          <ShieldCheck size={24} className="text-[#398a63]" />
          <h2 className="mt-5 font-display text-3xl">{t("publicHome.control")}</h2>
          <ul className="mt-5 grid gap-3 text-sm text-[#52606c]">
            {[
              t("publicHome.acceptFirst"),
              t("publicHome.reviewPublication"),
              t("publicHome.archiveRestore"),
              t("publicHome.versionScore"),
              t("publicHome.manageBilling"),
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-[#398a63]" />
                {item}
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-lg border border-[#d7c39c] bg-[#faf6ee] p-7">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8b6b2e]">
            {t("publicHome.simplePlans")}
          </div>
          <h2 className="mt-4 font-display text-3xl">
            {t("publicHome.pricingHeading", { count: PLAN_LIMITS.agency.maxProjects })}
          </h2>
          <p className="mt-4 text-sm leading-6 text-[#647183]">{t("publicHome.pricingBody")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/pricing">
                {t("publicHome.seePricing")}
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/auth" search={{ mode: "register" }}>
                {t("publicHome.startFree")}
              </Link>
            </Button>
          </div>
        </article>
      </div>
    </section>
  );
}

function Faq({ t }: { t: HomeTranslate }) {
  return (
    <section id="resources" className="border-b border-[#e6dfd2] bg-[#f7f4ed]">
      <div className="mx-auto max-w-4xl px-5 py-16 md:px-8 lg:py-20">
        <div className="text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
          {t("publicHome.plainAnswers")}
        </div>
        <h2 className="mt-3 text-center font-display text-3xl sm:text-[42px]">
          {t("publicHome.beforeStart")}
        </h2>
        <div className="mt-9 divide-y divide-[#ddd8cd] rounded-lg border border-[#ddd8cd] bg-[#fffdf8]">
          {homeFaq(t).map((item) => (
            <details key={item.id} className="group px-5 py-4">
              <summary className="cursor-pointer list-none pr-6 text-sm font-medium marker:hidden">
                {item.q}
              </summary>
              <p className="mt-3 max-w-3xl text-xs leading-5 text-[#647183]">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function PublicFooter({ t }: { t: HomeTranslate }) {
  return (
    <footer className="bg-[#fffdf8]">
      <div className="mx-auto max-w-[1340px] px-5 py-10 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="font-display text-xl">Milo Growth</div>
            <p className="mt-2 max-w-xs text-xs leading-5 text-[#647183]">
              {t("publicHome.footerBody")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-xs text-[#52606c] sm:grid-cols-4">
            <Link to="/pricing">{t("publicHome.pricing")}</Link>
            <Link to="/free-ai-visibility-audit">{t("publicHome.freeAudit")}</Link>
            <Link to="/case-studies">{t("publicHome.caseStudies")}</Link>
            <Link to="/beta">{t("publicHome.beta")}</Link>
            <Link to="/terms">{t("publicHome.terms")}</Link>
            <Link to="/privacy">{t("publicHome.privacy")}</Link>
            <Link to="/security">{t("publicHome.security")}</Link>
            <Link to="/trust">{t("publicHome.trust")}</Link>
            <Link to="/ai-disclaimer">{t("publicHome.disclaimer")}</Link>
          </div>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-[#e6dfd2] pt-6 text-[10px] text-[#697282]">
          <span>© {new Date().getUTCFullYear()} Andersen Innovations</span>
          <div className="flex flex-wrap gap-3">
            <span className="uppercase tracking-[0.16em]">{t("publicHome.markets")}</span>
            {DISPLAY_REGIONS.map((region) => (
              <Link key={region} to={`/${region}` as never}>
                {REGION_SELECTOR_LABELS[region]}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
