import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PLAN_IDS,
  PLAN_META,
  MARKET_CURRENCY,
  BILLING_MARKETS,
  planPrice,
  addOnPrice,
  formatMoney,
  type BillingMarket,
} from "@/lib/billing";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Milo Growth" },
      {
        name: "description",
        content: "Simple per-project pricing for Milo Growth — free preview, Starter and Growth plans for small business visibility planning.",
      },
      { property: "og:title", content: "Pricing — Milo Growth" },
      { property: "og:description", content: "Simple per-project pricing for Milo Growth — free preview, Starter and Growth plans for small businesses." },
      { property: "og:url", content: "https://milogrowth.com/pricing" },
      { name: "twitter:title", content: "Pricing — Milo Growth" },
      { name: "twitter:description", content: "Simple per-project pricing for Milo Growth — free preview, Starter and Growth plans." },
    ],
    links: [{ rel: "canonical", href: "https://milogrowth.com/pricing" }],
  }),
  component: PricingPage,
});


function PricingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Monthly AI growth planner
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost" size="sm">Home</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <PricingBody />

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Milo Growth — built by Andersen Innovations</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/free-ai-visibility-audit" className="hover:text-foreground">Free audit</Link>
            <Link to="/beta" className="hover:text-foreground">Beta</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/security" className="hover:text-foreground">Security</Link>
            <Link to="/" className="hover:text-foreground">Back to home</Link>
          </div>
        </div>
      </footer>
    </main>

  );
}

const PRICING_MARKETS: BillingMarket[] = ["Poland", "Sweden", "Denmark", "United Kingdom", "European Union"];

function PricingBody() {
  const [market, setMarket] = useState<BillingMarket>("European Union");
  const currency = MARKET_CURRENCY[market];
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Pricing</div>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">Milo Growth Pricing</h1>
          <p className="mt-3 text-muted-foreground">
            Self-service plans for small businesses that want a monthly growth, SEO and visibility workflow.
            Prices below are shown for the selected market — your final price is based on your business/billing country.
          </p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Market</div>
          <Select value={market} onValueChange={(v) => setMarket(v as BillingMarket)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRICING_MARKETS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_IDS.map((pid) => {
          const meta = PLAN_META[pid];
          return (
            <div key={pid} className={"rounded-xl border p-6 bg-card flex flex-col " + (meta.recommended ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold)/0.45)]" : "border-border")}>
              {meta.recommended ? <div className="mb-3 inline-block self-start rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold">Recommended</div> : null}
              <h3 className="font-display text-xl">{meta.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl">{formatMoney(planPrice(market, pid), currency)}</span>
                {pid !== "freePreview" ? <span className="text-sm text-muted-foreground">/month</span> : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{meta.tagline}</p>
              <ul className="mt-5 space-y-2 text-sm flex-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex gap-2"><ShieldCheck className="h-4 w-4 mt-0.5 text-gold/80" /><span>{f}</span></li>
                ))}
              </ul>
              <Link to="/auth" className="mt-6">
                <Button className="w-full" variant={meta.recommended ? "default" : "outline"}>
                  {pid === "freePreview" ? "Start free preview" : "Get started"}
                </Button>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Add-ons */}
      <div className="mt-10 grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-lg">Assisted Setup</h3>
          <div className="mt-1 font-display text-2xl">{formatMoney(addOnPrice(market, "assistedSetup"), currency)} <span className="text-sm text-muted-foreground">one-time</span></div>
          <p className="mt-1 text-sm text-muted-foreground">Guided setup, Brand Intelligence, connector and first content.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-lg">Monthly Care</h3>
          <div className="mt-1 font-display text-2xl">{formatMoney(addOnPrice(market, "monthlyCare"), currency)} <span className="text-sm text-muted-foreground">/month</span></div>
          <p className="mt-1 text-sm text-muted-foreground">Monthly review, content, publishing and analytics support.</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground max-w-3xl">
        Your billing market is based on your business/billing country. Changing the website language or public region
        does not change pricing eligibility. No rankings, traffic, revenue or AI citations are guaranteed.
      </p>
    </section>
  );
}
