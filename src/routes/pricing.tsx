import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PLANS, EXTRA_PROJECT, formatPrice, MAX_PROJECTS_PER_USER } from "@/lib/pricing";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Andersen Visibility Engine" },
      {
        name: "description",
        content: "Simple per-project pricing in PLN. Start free, add brands as you grow.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Andersen Innovations
            </span>
            <span className="font-display text-lg leading-tight">Visibility Engine</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost" size="sm">Home</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Pricing</div>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">One workspace. Pay per project.</h1>
          <p className="mt-3 text-muted-foreground">
            Start with the Free Preview. Move to Starter or Growth when you're ready to create real projects.
            Add brands as you grow — up to {MAX_PROJECTS_PER_USER} projects per account.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={
                "rounded-xl border p-6 bg-card flex flex-col " +
                (p.recommended ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold)/0.45)]" : "border-border")
              }
            >
              {p.recommended ? (
                <div className="mb-3 inline-block self-start rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold">
                  Recommended
                </div>
              ) : null}
              <h3 className="font-display text-2xl">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-4xl">{formatPrice(p.pricePerMonth)}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
              <ul className="mt-6 space-y-2 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 mt-0.5 text-gold/80" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link to="/auth">
                  <Button className="w-full" variant={p.recommended ? "default" : "outline"}>
                    {p.id === "free" ? "Start free preview" : "Get started"}
                  </Button>
                </Link>
                <p className="mt-2 text-[11px] text-muted-foreground text-center">
                  {p.id === "free" ? "No credit card required" : "Paid upgrades coming soon"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-border bg-card p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-xl">{EXTRA_PROJECT.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{EXTRA_PROJECT.description}</p>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl">{formatPrice(EXTRA_PROJECT.pricePerMonth)}</div>
            <div className="text-xs text-muted-foreground">per project / month</div>
          </div>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Hard cap: {MAX_PROJECTS_PER_USER} projects per account.
        </p>
      </section>
    </div>
  );
}
