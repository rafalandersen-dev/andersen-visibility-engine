import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";
import { RegionSelector } from "@/components/RegionSelector";
import { type MarketConfig, regionToBillingMarket } from "@/lib/markets";
import { PLAN_IDS, PLAN_META, MARKET_CURRENCY, planPrice, addOnPrice, formatMoney } from "@/lib/billing";
import { ArrowRight, Check } from "lucide-react";

const SELECTOR_NOTE =
  "Region changes the public page and displayed beta pricing. Billing country will determine final pricing when paid plans are available.";

export function MarketPage({ config }: { config: MarketConfig }) {
  const betaHref = `/auth?source=market-beta&market=${config.region}`;
  const billingMarket = regionToBillingMarket(config.region);
  const currency = MARKET_CURRENCY[billingMarket];
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold">{config.name}</div>
          <RegionSelector current={config.region} note={SELECTOR_NOTE} />
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">{config.heroTitle}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{config.heroSubtitle}</p>
        <p className="mt-3 max-w-2xl text-sm text-foreground/80">{config.positioning}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/free-ai-visibility-audit"><Button size="lg" className="gap-2">{config.ctaAudit} <ArrowRight className="h-4 w-4" /></Button></Link>
          <a href={betaHref}><Button size="lg" variant="outline">{config.ctaBeta}</Button></a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{config.availabilityNote}</p>
      </section>

      {/* Helps */}
      <section className="mx-auto max-w-5xl px-6 pb-4">
        <h2 className="font-display text-2xl md:text-3xl">{config.helpsHeading}</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {config.helps.map((h) => (
            <div key={h} className="rounded-lg border border-border bg-card p-5 text-sm font-medium">{h}</div>
          ))}
        </div>
      </section>

      {/* 30-day journey */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-2xl md:text-3xl">{config.journeyHeading}</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {config.journey.map((w) => (
            <div key={w.week} className="rounded-lg border border-border bg-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-gold">{w.week}</div>
              <ul className="mt-2 space-y-1 text-sm text-foreground/85">
                {w.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — final plans in this market's currency */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">{config.pricingHeading}</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLAN_IDS.map((pid) => (
            <div key={pid} className={"rounded-lg border p-4 " + (PLAN_META[pid].recommended ? "border-gold/40 bg-gold/5" : "border-border bg-card")}>
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{PLAN_META[pid].name}</div>
              <div className="mt-1 font-display text-xl">{formatMoney(planPrice(billingMarket, pid), currency)}{pid !== "freePreview" ? <span className="text-xs text-muted-foreground"> /mo</span> : null}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid sm:grid-cols-2 gap-3 max-w-2xl text-sm text-muted-foreground">
          <div className="rounded-md border border-border bg-card px-3 py-2">Assisted Setup: {formatMoney(addOnPrice(billingMarket, "assistedSetup"), currency)} one-time</div>
          <div className="rounded-md border border-border bg-card px-3 py-2">Monthly Care: {formatMoney(addOnPrice(billingMarket, "monthlyCare"), currency)} /month</div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{config.pricingNote}</p>
        <p className="mt-2 text-xs text-muted-foreground max-w-3xl">{config.eligibility}</p>
      </section>

      {/* Who for */}
      <section className="mx-auto max-w-5xl px-6 pb-12">
        <h2 className="font-display text-2xl md:text-3xl">{config.whoForHeading}</h2>
        <ul className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-2xl">
          {config.whoFor.map((x) => (
            <li key={x} className="flex gap-2 text-sm text-foreground/85"><Check className="h-4 w-4 mt-0.5 text-gold/80 shrink-0" />{x}</li>
          ))}
        </ul>
      </section>

      {/* Apply */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-8 text-center">
          <h2 className="font-display text-2xl">{config.applyHeading}</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">{config.applyBody}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a href={betaHref}><Button>{config.ctaBeta} <ArrowRight className="h-4 w-4" /></Button></a>
            <a href="mailto:support@milogrowth.com?subject=Milo%20Assisted%20Beta"><Button variant="outline">Email us</Button></a>
            <Link to="/free-ai-visibility-audit"><Button variant="outline">{config.ctaAudit}</Button></Link>
          </div>
        </div>

        {/* More links + trust */}
        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">{config.moreHeading}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link to="/beta" className="underline underline-offset-4 hover:text-foreground">Assisted Beta</Link>
            <Link to="/case-studies" className="underline underline-offset-4 hover:text-foreground">Case studies</Link>
            <Link to="/demo-script" className="underline underline-offset-4 hover:text-foreground">Demo</Link>
            <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy</Link>
            <Link to="/ai-disclaimer" className="underline underline-offset-4 hover:text-foreground">AI Disclaimer</Link>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground max-w-3xl space-y-1.5">
          <p>{config.trustReview}</p>
          <p>{config.trustNoGuarantee}</p>
        </div>
      </section>
    </MarketingShell>
  );
}
