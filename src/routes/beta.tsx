import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";
import { Search, Sparkles, FileText, Gauge, Send, BarChart3, Award, ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/beta")({
  head: () => ({
    meta: [
      { title: "Milo Growth Assisted Beta — Milo Growth" },
      { name: "description", content: "A guided 30-day setup to plan, create, publish and measure website growth for your small business." },
    ],
  }),
  component: BetaPage,
});

const HELPS = [
  { icon: Search, title: "Find website growth gaps" },
  { icon: Sparkles, title: "Create brand-aware content" },
  { icon: Gauge, title: "Score content before publishing" },
  { icon: Send, title: "Publish to your website" },
  { icon: BarChart3, title: "Measure visits, clicks and search signals" },
  { icon: Award, title: "Build safer authority opportunities" },
];

const INCLUDED = [
  "Free AI Visibility Readiness Audit",
  "Milo project setup",
  "Brand Intelligence setup",
  "Website / content gap review",
  "First 30-day growth plan",
  "3–5 prioritized content opportunities",
  "1–2 publish-ready content drafts with Milo Score",
  "Publishing support or WordPress/custom connector setup",
  "Basic analytics tracking setup",
  "GSC Lite import support if Search Console data exists",
  "Authority Builder starter list",
  "30-minute review call or async summary",
];

const JOURNEY = [
  { week: "Week 1", items: ["Free audit", "Project setup", "Brand Intelligence", "Tracking check"] },
  { week: "Week 2", items: ["Opportunities", "Content plan", "Milo Score baseline"] },
  { week: "Week 3", items: ["Draft / publish content", "Authority tasks", "Connector setup if possible"] },
  { week: "Week 4", items: ["Analytics & GSC review", "Next actions", "Handover or monthly support offer"] },
];

const PRICING = [
  { market: "Poland", oneTime: "699–1499 PLN one-time", monthly: "299–599 PLN / month optional support" },
  { market: "Sweden", oneTime: "2500–5000 SEK one-time", monthly: "799–1499 SEK / month optional support" },
  { market: "EU / English", oneTime: "€249–€499 one-time", monthly: "€79–€149 / month optional support" },
];

const FOR = [
  "Businesses with an existing website",
  "Businesses that need clearer services and content",
  "Local service businesses (wellness, beauty, clinics, consultants)",
  "People who want guidance, not just another tool",
];
const NOT_FOR = [
  "People wanting guaranteed rankings",
  "Link spam or backlink networks",
  "Fully automated publishing without review",
  "Businesses needing enterprise SEO agency work",
];

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
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">Assisted Beta</div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">Milo Growth Assisted Beta</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          A guided 30-day setup to plan, create, publish and measure website growth for your small business.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-foreground/80">
          In 30 days, we help you turn your website into a clearer, more measurable growth system.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/free-ai-visibility-audit"><Button size="lg" className="gap-2">Run free audit <ArrowRight className="h-4 w-4" /></Button></Link>
          <a href="#apply"><Button size="lg" variant="outline">Apply for beta</Button></a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Beta availability is limited while Milo is being tested with early businesses.
        </p>
      </section>

      {/* What Milo helps you do */}
      <section className="mx-auto max-w-5xl px-6 pb-4">
        <h2 className="font-display text-2xl md:text-3xl">What Milo helps you do</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HELPS.map((h) => (
            <div key={h.title} className="rounded-lg border border-border bg-card p-5">
              <h.icon className="h-5 w-5 text-gold/80" strokeWidth={1.6} />
              <div className="mt-3 font-medium">{h.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What is included */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-2xl md:text-3xl">What is included</h2>
        <div className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
          {INCLUDED.map((i) => (
            <div key={i} className="flex gap-2 text-sm">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-gold/80" />
              <span className="text-foreground/85">{i}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground max-w-2xl">
          You leave with a clearer website growth plan, better content priorities, a publishing workflow and early
          performance tracking.
        </p>
      </section>

      {/* 30-day journey */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">Your 30-day beta journey</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {JOURNEY.map((w) => (
            <div key={w.week} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-gold">{w.week}</div>
              <ul className="mt-2 space-y-1 text-sm text-foreground/85">
                {w.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Case studies preview */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">Examples</h2>
        <p className="mt-2 text-sm text-muted-foreground">Early implementations and workflow examples — not performance guarantees.</p>
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {[
            { t: "Synergy Massage", d: "Local massage & recovery studio — connector and analytics implemented.", tag: "Early implementation" },
            { t: "Andersen Innovations", d: "Innovation studio planning its own growth content with Milo.", tag: "Internal example" },
            { t: "SI Longevity", d: "Longevity/wellness brand workflow example.", tag: "Demo workflow" },
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{c.tag}</div>
              <div className="mt-1 font-display text-lg">{c.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link to="/case-studies" className="text-sm text-foreground/70 underline underline-offset-4 hover:text-foreground">Read the case studies →</Link>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">Beta pricing</h2>
        <p className="mt-2 text-sm text-muted-foreground">Beta pricing. Final subscription plans may change after the private beta.</p>
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {PRICING.map((p) => (
            <div key={p.market} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{p.market}</div>
              <div className="mt-2 font-display text-lg">{p.oneTime}</div>
              <div className="mt-1 text-sm text-muted-foreground">{p.monthly}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Final pricing may vary based on website size, connector setup and support level. No checkout — beta is invoiced manually.
          A founding-beta price is available for the first pilot businesses only.
        </p>
      </section>

      {/* Who this is for / not for */}
      <section className="mx-auto max-w-5xl px-6 pb-12 grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-display text-lg">Who this is for</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/85">
            {FOR.map((x) => <li key={x} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />{x}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-display text-lg">Who this is not for</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {NOT_FOR.map((x) => <li key={x}>• {x}</li>)}
          </ul>
        </div>
      </section>

      {/* Outreach copy */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <details className="rounded-lg border border-border bg-card p-5">
          <summary className="cursor-pointer font-display text-lg">Outreach templates (internal)</summary>
          <div className="mt-4 space-y-4">
            {OUTREACH.map((o) => (
              <div key={o.label}>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">{o.label}</div>
                <p className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-foreground/85">{o.text}</p>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/* Apply */}
      <section id="apply" className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-8 text-center">
          <h2 className="font-display text-2xl">Apply for the Assisted Beta</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
            Start with a free audit, or get in touch to apply. Beta places are limited.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to={"/auth?source=beta" as never}><Button>Apply for beta <ArrowRight className="h-4 w-4" /></Button></Link>
            <a href="mailto:support@milogrowth.com?subject=Milo%20Assisted%20Beta"><Button variant="outline">Email us</Button></a>
            <Link to="/free-ai-visibility-audit"><Button variant="outline">Run free audit</Button></Link>
          </div>
        </div>

        {/* Trust / safety */}
        <div className="mt-8 text-xs text-muted-foreground max-w-3xl space-y-1.5">
          <p>
            Milo helps you identify opportunities, create better content, publish it and measure early signals. It is
            AI-assisted, human-reviewed and publishing-ready. It does not guarantee rankings, traffic, revenue or AI citations.
          </p>
          <p>
            Milo is AI-assisted. Content should be reviewed before publishing, especially claims, pricing, legal, medical,
            financial or regulated information.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy</Link>
            <Link to="/ai-disclaimer" className="underline underline-offset-4 hover:text-foreground">AI Disclaimer</Link>
            <Link to="/security" className="underline underline-offset-4 hover:text-foreground">Security</Link>
            <Link to="/cookies" className="underline underline-offset-4 hover:text-foreground">Cookies</Link>
          </p>
          <p className="pt-1">Localized beta pages (PL / SV / DA) may follow.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
