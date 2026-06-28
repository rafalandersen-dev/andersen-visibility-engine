import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PLANS, EXTRA_PROJECT, formatPrice, MAX_PROJECTS_PER_USER } from "@/lib/pricing";
import { seedProjects, seedOpportunities, seedContent } from "@/lib/mock-data";
import { Sparkles, CalendarDays, FileText, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milo Growth — Monthly AI Growth Planner for Small Businesses" },
      {
        name: "description",
        content:
          "Generate visibility ideas, content briefs, FAQ, service-page improvements and monthly action plans for your small business — without hiring an agency.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <Hero />
      <HowItWorks />
      <DemoPreview />
      <PricingTeaser />
      <FAQ />
      <Footer />
    </div>
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
            <Sparkles className="h-3 w-3 text-gold" /> AI SEO workspace · MVP 0.1
          </div>
          <h1 className="mt-6 font-display text-4xl md:text-6xl leading-[1.05] tracking-tight">
            Structured SEO content for Google <span className="text-gold">and</span> AI search.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Andersen Visibility Engine is a calm, focused workspace for small businesses to plan,
            draft and approve content that ranks on Google and gets cited by AI answers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Start free preview <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline">See pricing</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card. Free Preview is read-only on demo data.
          </p>
        </div>
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
  const demoProject = seedProjects[0];
  const opps = seedOpportunities.filter((o) => o.projectId === demoProject.id).slice(0, 3);
  const content = seedContent.filter((c) => c.projectId === demoProject.id).slice(0, 3);
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
              SEO Opportunities · {demoProject.name}
            </div>
            <div className="mt-4 space-y-3">
              {opps.map((o) => (
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
              {content.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/70 bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium">{c.title}</h4>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {c.metaDescription || "Draft in progress."}
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
  const items = [
    {
      q: "Is this a clone of Surfer, Jasper or Semrush?",
      a: "No. Andersen Visibility Engine is built around a calm, opinionated workflow for small businesses — opportunities, calendar, editor, approval and export.",
    },
    {
      q: "Does it publish to my website automatically?",
      a: "No. The workspace stops at approved, exportable Markdown or HTML. You stay in control of publishing.",
    },
    {
      q: "What is the Free Preview?",
      a: "A read-only tour of a fully populated demo project so you can see the workflow before creating your own.",
    },
    {
      q: "When can I pay?",
      a: "Billing is coming soon. Today you can create up to your plan's project limit, and we'll enable paid upgrades shortly.",
    },
  ];
  return (
    <section id="faq" className="border-t border-border">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">FAQ</div>
        <h2 className="mt-2 font-display text-3xl md:text-4xl">Questions, answered.</h2>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {items.map((it) => (
            <details key={it.q} className="group py-5">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                <span className="font-medium">{it.q}</span>
                <span className="text-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{it.a}</p>
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
          <span className="font-display text-base text-foreground">Andersen Visibility Engine</span>
          <span className="mx-2">·</span>
          <span>© {new Date().getUTCFullYear()} Andersen Innovations</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
