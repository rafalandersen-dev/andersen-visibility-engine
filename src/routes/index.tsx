import { createFileRoute, Link } from "@tanstack/react-router";
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

const HOME_FAQ = [
  {
    q: "Where do discovered opportunities go?",
    a: "Discovery results stay as suggestions until you accept them. Accepted ideas enter Plan in Captured, with their source, reason, evidence, owner, status and next action attached.",
  },
  {
    q: "What does Milo Score evaluate?",
    a: "Milo Score evaluates a specific content version before review. It checks search readiness, brand fit, structure, evidence, conversion and related quality signals. It never ranks Opportunities.",
  },
  {
    q: "Can Milo publish to my website?",
    a: "Yes. Connected WordPress, Shopify or custom publishing workflows can send approved content as a draft or publish it live, depending on the controls you choose.",
  },
  {
    q: "Are backlinks included?",
    a: "Backlink intelligence, marketplace purchasing and outreach are a separate paid workspace because external data and placements create additional costs. The add-on is always labeled clearly.",
  },
  {
    q: "Can I cancel without contacting support?",
    a: "Yes. Manage billing and Cancel subscription are visible inside Settings → Billing. Paid users are sent to an authenticated Paddle portal where they can manage or cancel directly.",
  },
  {
    q: "How many projects can I manage?",
    a: "Milo supports up to five projects in one account. Each project keeps its own site, services, competitors, opportunities, content, integrations and analytics context.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milo Growth — Your Monthly AI SEO Growth System" },
      {
        name: "description",
        content:
          "Turn site, search, competitor and AI visibility signals into a clear SEO plan, better content and measurable growth — across up to five projects.",
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
    links: [{ rel: "canonical", href: "https://milogrowth.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HOME_FAQ.map((item) => ({
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
  return (
    <main className="min-h-screen bg-[#fbfaf6] text-[#202221]">
      <RegionSuggestionBanner />
      <PublicHeader />
      <Hero />
      <ProofStrip />
      <ConnectedWorkflow />
      <ProductSystem />
      <BacklinksAddOn />
      <TrustAndPricing />
      <Faq />
      <PublicFooter />
    </main>
  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e6dfd2] bg-[#fbfaf6]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1340px] items-center justify-between px-5 py-4 md:px-8">
        <Link to="/" className="flex flex-col">
          <span className="font-display text-[21px] leading-tight tracking-[-0.02em]">
            Milo Growth
          </span>
          <span className="text-[9px] uppercase tracking-[0.22em] text-[#697282]">
            Monthly AI growth planner
          </span>
        </Link>
        <nav
          className="hidden items-center gap-8 text-[13px] text-[#333b42] lg:flex"
          aria-label="Public navigation"
        >
          <a href="#product" className="border-b border-[#b5862a] py-2">
            Product
          </a>
          <a href="#how" className="py-2 hover:text-black">
            How it works
          </a>
          <Link to="/pricing" className="py-2 hover:text-black">
            Pricing
          </Link>
          <a href="#backlinks" className="py-2 hover:text-black">
            Backlinks
          </a>
          <a href="#resources" className="py-2 hover:text-black">
            Resources
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth" search={{ mode: "login" }}>
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/auth" search={{ mode: "register" }}>
            <Button size="sm">Start free</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="product" className="border-b border-[#e6dfd2]">
      <div className="mx-auto grid max-w-[1340px] items-center gap-10 px-5 py-12 md:px-8 lg:grid-cols-[430px_minmax(0,1fr)] lg:py-14">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ddd8cd] bg-[#fffdf8] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#697282]">
            <Sparkle size={13} weight="fill" className="text-[#b5862a]" /> Milo Growth · for small
            businesses
          </div>
          <h1 className="mt-7 font-display text-[46px] leading-[1.08] tracking-[-0.045em] sm:text-[58px]">
            Your monthly <span className="text-[#bd9250]">AI growth</span> system
          </h1>
          <p className="mt-6 text-[19px] leading-8 text-[#647183]">
            Turn visibility signals into a clear growth plan.
          </p>
          <p className="mt-3 max-w-[410px] text-[15px] leading-6 text-[#647183]">
            Find the right opportunities, schedule the work, create better content and prove what
            changed — across up to five projects.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth" search={{ mode: "register" }}>
              <Button size="lg" className="min-w-[142px] gap-2">
                Start free <ArrowRight size={17} />
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline">
                See how Milo works
              </Button>
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-[10px] text-[#647183]">
            <TrustItem icon={CheckCircle} label="No credit card" />
            <TrustItem icon={Lock} label="No agency" />
            <TrustItem icon={Leaf} label="Self-service" />
            <TrustItem icon={UsersThree} label="Up to 5 projects" />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-[#d8d2c7] bg-[#fffdf8] shadow-[0_20px_60px_rgba(26,31,34,.12)]">
          <img
            src="/images/milo-plan-workspace.png"
            alt="Milo Growth Plan workspace showing traceable SEO opportunities on a lifecycle board"
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

function ProofStrip() {
  const points = [
    { icon: CalendarBlank, label: "One clear monthly plan" },
    { icon: LinkSimple, label: "Five connected steps" },
    { icon: UsersThree, label: "Human review before publish" },
    { icon: UsersThree, label: "Up to five projects" },
    { icon: XCircle, label: "Cancel anytime" },
  ];
  return (
    <section className="border-b border-[#e6dfd2] bg-[#fffdf8]">
      <div className="mx-auto grid max-w-[1340px] gap-0 px-5 py-6 md:grid-cols-[1.1fr_repeat(5,1fr)] md:px-8">
        <div className="flex items-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#647183]">
          Designed for small businesses
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

function ConnectedWorkflow() {
  const steps = [
    {
      icon: Compass,
      title: "Discover",
      body: "Find visibility opportunities from search, competitors and your site.",
    },
    {
      icon: CalendarBlank,
      title: "Plan",
      body: "Turn accepted ideas into a clear plan with priority, owner and date.",
    },
    {
      icon: PencilLine,
      title: "Create",
      body: "Brief and draft content that matches intent and your brand voice.",
    },
    {
      icon: PaperPlaneTilt,
      title: "Publish",
      body: "Review, approve and send content through connected workflows.",
    },
    {
      icon: ChartLineUp,
      title: "Measure",
      body: "Connect rankings, traffic and conversion impact back to the idea.",
    },
  ];
  return (
    <section id="how" className="border-b border-[#e6dfd2]">
      <div className="mx-auto max-w-[1340px] px-5 py-16 md:px-8 lg:py-20">
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
          How it works
        </div>
        <h2 className="mt-3 max-w-3xl font-display text-3xl tracking-[-0.03em] sm:text-[42px]">
          One system. Every next step connected.
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
                    Step {String(index + 1).padStart(2, "0")}
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

function ProductSystem() {
  const capabilities = [
    {
      icon: Gauge,
      title: "Site audit",
      body: "Turn technical, content and internal-link findings into traceable work — without losing the affected URL or evidence.",
    },
    {
      icon: UsersThree,
      title: "Competitor gaps",
      body: "See where competitors cover topics, offers or links that your project does not, then accept only the gaps worth pursuing.",
    },
    {
      icon: Medal,
      title: "Authority",
      body: "Plan credible proof, expert contributions, directories, mentions and trust signals alongside content work.",
    },
    {
      icon: Globe,
      title: "AI visibility",
      body: "Track how your brand appears in AI answers and convert missing or weak coverage into focused opportunities.",
    },
    {
      icon: FileText,
      title: "Content + Milo Score",
      body: "Create linked briefs and drafts, evaluate a specific version, send it for review and keep its provenance attached.",
    },
    {
      icon: ChartLineUp,
      title: "Premium analytics",
      body: "Bring Milo activity, Search Console and site analytics together to show what shipped and what changed afterward.",
    },
  ];
  return (
    <section className="border-b border-[#e6dfd2] bg-[#f7f4ed]">
      <div className="mx-auto max-w-[1340px] px-5 py-16 md:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
              Everything retained
            </div>
            <h2 className="mt-3 font-display text-3xl tracking-[-0.03em] sm:text-[42px]">
              Fewer tabs. No missing functionality.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#647183]">
              Audit, competitors, authority and AI visibility now feed one Plan. Project setup,
              services, connections and billing live together in Settings. Content and Insights each
              have one clear job.
            </p>
            <Link to="/auth" search={{ mode: "register" }} className="mt-6 inline-block">
              <Button>
                Start with one project <ArrowRight size={16} />
              </Button>
            </Link>
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

function BacklinksAddOn() {
  const capabilities = [
    { label: "Link profile & gaps", icon: LinkSimple },
    { label: "Paid marketplace", icon: ShieldCheck },
    { label: "Reviewable outreach", icon: PaperPlaneTilt },
    { label: "Clear cost controls", icon: Lock },
  ];

  return (
    <section id="backlinks" className="border-b border-[#e6dfd2] bg-[#18232c] text-[#eef0ee]">
      <div className="mx-auto grid max-w-[1340px] items-center gap-10 px-5 py-16 md:px-8 lg:grid-cols-[1fr_.9fr] lg:py-20">
        <div>
          <div className="inline-flex rounded-full border border-[#e0b34e]/35 bg-[#e0b34e]/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#e0b34e]">
            Optional paid add-on
          </div>
          <h2 className="mt-5 font-display text-3xl tracking-[-0.03em] sm:text-[42px]">
            Backlinks deserve their own workspace.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#b9c1c4]">
            Analyse referring domains, find competitor link gaps, review marketplace offers and
            prepare outreach without mixing external placement costs into everyday content planning.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/pricing">
              <Button className="bg-[#eef0ee] text-[#18232c] hover:bg-white">
                See add-on pricing
              </Button>
            </Link>
            <Link to="/auth" search={{ mode: "register" }}>
              <Button
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                Explore Milo first
              </Button>
            </Link>
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

function TrustAndPricing() {
  return (
    <section className="border-b border-[#e6dfd2]">
      <div className="mx-auto grid max-w-[1340px] gap-8 px-5 py-16 md:px-8 lg:grid-cols-2 lg:py-20">
        <article className="rounded-lg border border-[#ddd8cd] bg-[#fffdf8] p-7">
          <ShieldCheck size={24} className="text-[#398a63]" />
          <h2 className="mt-5 font-display text-3xl">Control stays with you.</h2>
          <ul className="mt-5 grid gap-3 text-sm text-[#52606c]">
            {[
              "Nothing enters Plan until you accept it",
              "Human review before publication",
              "Archive and restore instead of disappearing work",
              "Content score is version-specific and explainable",
              "Manage or cancel subscription from Billing",
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
            Straightforward plans
          </div>
          <h2 className="mt-4 font-display text-3xl">Start small. Grow to five projects.</h2>
          <p className="mt-4 text-sm leading-6 text-[#647183]">
            Choose the usage level that fits today. Backlinks remains an explicit add-on, and
            cancellation stays visible in your account.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/pricing">
              <Button>
                See pricing <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/auth" search={{ mode: "register" }}>
              <Button variant="outline">Start free</Button>
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="resources" className="border-b border-[#e6dfd2] bg-[#f7f4ed]">
      <div className="mx-auto max-w-4xl px-5 py-16 md:px-8 lg:py-20">
        <div className="text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-[#647183]">
          Plain answers
        </div>
        <h2 className="mt-3 text-center font-display text-3xl sm:text-[42px]">Before you start</h2>
        <div className="mt-9 divide-y divide-[#ddd8cd] rounded-lg border border-[#ddd8cd] bg-[#fffdf8]">
          {HOME_FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4">
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

function PublicFooter() {
  return (
    <footer className="bg-[#fffdf8]">
      <div className="mx-auto max-w-[1340px] px-5 py-10 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="font-display text-xl">Milo Growth</div>
            <p className="mt-2 max-w-xs text-xs leading-5 text-[#647183]">
              A calmer way for small businesses to discover, plan, create, publish and measure SEO
              growth.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-xs text-[#52606c] sm:grid-cols-4">
            <Link to="/pricing">Pricing</Link>
            <Link to="/free-ai-visibility-audit">Free audit</Link>
            <Link to="/case-studies">Case studies</Link>
            <Link to="/beta">Beta</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/security">Security</Link>
            <Link to="/trust">EU Trust Centre</Link>
            <Link to="/ai-disclaimer">AI disclaimer</Link>
          </div>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-[#e6dfd2] pt-6 text-[10px] text-[#697282]">
          <span>© {new Date().getUTCFullYear()} Andersen Innovations</span>
          <div className="flex flex-wrap gap-3">
            <span className="uppercase tracking-[0.16em]">Markets</span>
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
