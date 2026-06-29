import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PLANS, EXTRA_PROJECT, formatPrice, MAX_PROJECTS_PER_USER } from "@/lib/pricing";
import { seedProjects, seedOpportunities, seedContent } from "@/lib/mock-data";
import { Sparkles, CalendarDays, FileText, ShieldCheck, ArrowRight, Store, Building2, MapPin, FileSearch, ListChecks, MessageSquareQuote, Wrench, Layers, XCircle, CheckCircle2 } from "lucide-react";

const HOME_FAQ = [
  { q: "Will Milo Growth guarantee rankings or traffic?", a: "No. No honest SEO tool can. Milo helps you ship a steady stream of structured, well-grounded content — but rankings depend on your site, market and execution." },
  { q: "Does it publish to my website automatically?", a: "No. The workspace stops at approved, exportable Markdown or HTML. You stay in control of publishing." },
  { q: "Does it replace an SEO agency?", a: "Not for every use case. It replaces the monthly planning, ideation and briefing work many small businesses pay an agency for. It does not do rank tracking, backlinks or competitor scraping." },
  { q: "What is the Free Preview?", a: "A read-only tour of a fully populated demo project so you can see the workflow before creating your own." },
  { q: "When can I pay?", a: "Billing is coming soon. Today you can create up to your plan's project limit, and we'll enable paid upgrades shortly." },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milo Growth — AI Growth Planner for Small Businesses" },
      {
        name: "description",
        content:
          "Generate visibility ideas, content briefs, FAQ and monthly action plans for your small business — without hiring an agency.",
      },
      { property: "og:title", content: "Milo Growth — AI Growth Planner for Small Businesses" },
      { property: "og:description", content: "Your monthly AI growth planner for small businesses. Visibility ideas, content briefs, FAQ and clear monthly action plans." },
      { property: "og:url", content: "https://milogrowth.com/" },
      { name: "twitter:title", content: "Milo Growth — AI Growth Planner for Small Businesses" },
      { name: "twitter:description", content: "Your monthly AI growth planner for small businesses — without hiring an agency." },
    ],
    links: [{ rel: "canonical", href: "https://milogrowth.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HOME_FAQ.map((it) => ({
            "@type": "Question",
            name: it.q,
            acceptedAnswer: { "@type": "Answer", text: it.a },
          })),
        }),
      },
    ],
  }),
  component: Landing,
});


function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <Hero />
      <WhatYouCreate />
      <WhoItsFor />
      <WhatYouGet />
      <HowItWorks />
      <DemoPreview />
      <WhatItIsnt />
      <PricingTeaser />
      <FAQ />
      <Footer />
    </main>

  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex flex-col">
          <span className="font-display text-lg leading-tight">Milo Growth</span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Monthly AI growth planner
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#preview" className="hover:text-foreground">Preview</a>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/auth">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--gold)/0.10),transparent_55%)]" />
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 lg:pt-28 lg:pb-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-gold" /> Milo Growth · for small businesses
          </div>
          <h1 className="mt-6 font-display text-4xl md:text-6xl leading-[1.05] tracking-tight">
            Your monthly AI growth planner <span className="text-gold">for small businesses.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Get visibility ideas, content briefs, FAQ, service-page improvements and a clear monthly
            action plan — without hiring an agency.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Start free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline">See pricing</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Self-service software. No credit card. No agency call.
          </p>
        </div>
      </div>
    </section>
  );
}

function WhatYouCreate() {
  const items = [
    { icon: FileSearch, title: "Visibility ideas", body: "Structured SEO opportunities ranked by intent, language and business value — not a keyword dump." },
    { icon: FileText, title: "Content briefs", body: "Outline, H1, meta, internal links and schema suggestions ready for a writer or the built-in editor." },
    { icon: MessageSquareQuote, title: "FAQ sections", body: "Question-and-answer blocks designed for both Google snippets and AI search citations." },
    { icon: Wrench, title: "Service-page improvements", body: "Concrete rewrites for existing service pages so they rank and convert better." },
    { icon: ListChecks, title: "Monthly action plans", body: "A clear 30-day plan grouped by ISO week, so you always know what to ship next." },
    { icon: Layers, title: "Markdown / HTML exports", body: "Approved assets you can paste into WordPress, Webflow, Shopify or hand to your developer." },
  ];
  return (
    <section id="create" className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">What Milo helps you create</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Six concrete outputs, every month.</h2>
          <p className="mt-3 text-sm text-muted-foreground">Milo Growth is a planner, not a publisher. It gives you the artefacts an in-house marketer or freelance writer would produce — without the agency price tag.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.title} className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold">
                <i.icon className="h-4 w-4" strokeWidth={1.6} />
              </div>
              <h3 className="mt-4 font-display text-lg">{i.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{i.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhoItsFor() {
  const groups = [
    { icon: Store, title: "Local service businesses", body: "Clinics, salons, studios, contractors and trades that want to be found in their city or region." },
    { icon: Building2, title: "Small B2B & SaaS teams", body: "Founders and solo marketers who need a steady content rhythm without a full agency retainer." },
    { icon: MapPin, title: "Multi-location & multi-brand owners", body: "Owners running two or three small businesses who want one calm planning workspace." },
  ];
  return (
    <section id="who" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Who it is for</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Built for small businesses, not enterprise SEO teams.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title} className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold">
                <g.icon className="h-4 w-4" strokeWidth={1.6} />
              </div>
              <h3 className="mt-4 font-display text-lg">{g.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{g.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatYouGet() {
  const rows = [
    "A fresh batch of SEO opportunities, ranked by priority",
    "A 30-day content calendar grouped by week",
    "Briefs, drafts, FAQ and metadata you can approve in one place",
    "Service-page improvement suggestions tied to what you actually sell",
    "Markdown and HTML exports for your CMS or developer",
  ];
  return (
    <section id="monthly" className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-20 grid gap-10 lg:grid-cols-[1.1fr,1fr] lg:items-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">What you get every month</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">One calm monthly rhythm.</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl">
            Each month, Milo refreshes your visibility plan so you always have something concrete to ship — without scrambling for ideas or paying for a full agency retainer.
          </p>
          <div className="mt-7">
            <Link to="/auth">
              <Button className="gap-2">Start free <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
        <ul className="rounded-xl border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r} className="flex items-start gap-3 px-5 py-4 text-sm">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-gold shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WhatItIsnt() {
  const items = [
    "It does not auto-publish content to your website",
    "It does not guarantee rankings or traffic",
    "It does not replace every SEO agency use case",
    "It does not do rank tracking, backlinks or competitor scraping",
  ];
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">What Milo is not</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Honest about scope.</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Milo Growth is a focused planning tool, not an all-in-one SEO suite. We tell you upfront what is out of scope so you can choose with eyes open.
          </p>
        </div>
        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {items.map((i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card/60 px-5 py-4 text-sm">
              <XCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}


function HowItWorks() {
  const steps = [
    {
      icon: Sparkles,
      title: "Find opportunities",
      body: "Curated SEO ideas grounded in your brand, services and target locations — not generic keyword dumps.",
    },
    {
      icon: CalendarDays,
      title: "Plan the month",
      body: "A 30-day content calendar grouped by ISO week, with clear status from idea to approved.",
    },
    {
      icon: FileText,
      title: "Draft & approve",
      body: "A clean editor with metadata, outline, FAQ and HTML preview. Export Markdown or HTML when ready.",
    },
  ];
  return (
    <section id="how" className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">How it works</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Three calm steps, one workspace.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold">
                <s.icon className="h-4 w-4" strokeWidth={1.6} />
              </div>
              <h3 className="mt-5 font-display text-xl">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoPreview() {
  const demoOpportunities = [
    {
      id: "demo-o-1",
      title: "Best espresso machines for small cafés under $2,000",
      searchIntent: "Commercial",
      businessValue:
        "Captures owners actively comparing entry-level commercial machines — high purchase intent and strong fit for product pages.",
    },
    {
      id: "demo-o-2",
      title: "How to clean a steam wand without damaging the seals",
      searchIntent: "Informational",
      businessValue:
        "Builds trust with existing customers and earns long-tail visibility in AI answers about espresso machine maintenance.",
    },
    {
      id: "demo-o-3",
      title: "Single boiler vs dual boiler espresso machines explained",
      searchIntent: "Comparison",
      businessValue:
        "Helps undecided buyers choose a category — a natural lead-in to your product line and a strong internal-link hub.",
    },
  ];

  const demoContent = [
    {
      id: "demo-c-1",
      title: "Best espresso machines for small cafés under $2,000",
      status: "Draft",
      metaDescription:
        "A practical shortlist of reliable commercial espresso machines under $2,000, with notes on workflow, durability and service.",
    },
    {
      id: "demo-c-2",
      title: "How to clean a steam wand the right way",
      status: "In review",
      metaDescription:
        "A simple weekly routine to keep your steam wand clean, hygienic and free of milk build-up — without damaging the seals.",
    },
    {
      id: "demo-c-3",
      title: "Single boiler vs dual boiler: which one fits your café?",
      status: "Approved",
      metaDescription:
        "Plain-language comparison of single and dual boiler espresso machines, with guidance on volume, milk drinks and budget.",
    },
  ];

  return (
    <section id="preview" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Preview</div>
            <h2 className="mt-2 font-display text-3xl md:text-4xl">A look at the workspace.</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              A static preview of what your dashboard and content cards will look like. Sign in to explore the live demo.
            </p>
          </div>
          <Link to="/auth">
            <Button variant="outline">Open the live demo</Button>
          </Link>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              SEO Opportunities · Northbound Coffee Co.
            </div>
            <div className="mt-4 space-y-3">
              {demoOpportunities.map((o) => (
                <div key={o.id} className="rounded-lg border border-border/70 bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium">{o.title}</h4>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-gold">{o.searchIntent}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{o.businessValue}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Content in progress
            </div>
            <div className="mt-4 space-y-3">
              {demoContent.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/70 bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium">{c.title}</h4>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {c.metaDescription}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section id="pricing-teaser" className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Pricing</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Simple, per project.</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start free. Upgrade when you're ready to create real projects. Add brands as you grow,
            up to {MAX_PROJECTS_PER_USER} per account.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={
                "rounded-xl border p-6 bg-card " +
                (p.recommended ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold)/0.45)]" : "border-border")
              }
            >
              {p.recommended ? (
                <div className="mb-3 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold">
                  Recommended
                </div>
              ) : null}
              <h3 className="font-display text-xl">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl">{formatPrice(p.pricePerMonth)}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 mt-0.5 text-gold/80" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Need more brands? Add up to {MAX_PROJECTS_PER_USER} projects at {formatPrice(EXTRA_PROJECT.pricePerMonth)}/project/month.
        </p>
        <div className="mt-8">
          <Link to="/pricing">
            <Button variant="outline">See full pricing</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="border-t border-border">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">FAQ</div>
        <h2 className="mt-2 font-display text-3xl md:text-4xl">Questions, answered.</h2>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {HOME_FAQ.map((it) => (
            <details key={it.q} className="group py-5">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                <span className="font-medium text-foreground">{it.q}</span>
                <span className="text-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-foreground/80">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}


function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div>
          <span className="font-display text-base text-foreground">Milo Growth</span>
          <span className="mx-2">—</span>
          <span>built by Andersen Innovations</span>
          <span className="mx-2">·</span>
          <span>© {new Date().getUTCFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
