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
  PLAN_LIMITS,
  MARKET_CURRENCY,
  BILLING_MARKETS,
  planPrice,
  addOnPrice,
  formatMoney,
  type BillingMarket,
} from "@/lib/billing";
import { Check, CircleCheck, Link2, ShieldCheck, ShoppingCart } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Milo Growth" },
      {
        name: "description",
        content:
          "Simple per-project pricing for Milo Growth — free preview, Starter and Growth plans for small business visibility planning.",
      },
      { property: "og:title", content: "Pricing — Milo Growth" },
      {
        property: "og:description",
        content:
          "Simple per-project pricing for Milo Growth — free preview, Starter and Growth plans for small businesses.",
      },
      { property: "og:url", content: "https://milogrowth.com/pricing" },
      { name: "twitter:title", content: "Pricing — Milo Growth" },
      {
        name: "twitter:description",
        content:
          "Simple per-project pricing for Milo Growth — free preview, Starter and Growth plans.",
      },
    ],
    links: [{ rel: "canonical", href: "https://milogrowth.com/pricing" }],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Monthly AI growth planner
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm">
                Home
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <PricingBody />

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground">
          <span>Milo Growth — built by Andersen Innovations</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/free-ai-visibility-audit" className="hover:text-foreground">
              Free audit
            </Link>
            <Link to="/beta" className="hover:text-foreground">
              Beta
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/security" className="hover:text-foreground">
              Security
            </Link>
            <Link to="/" className="hover:text-foreground">
              Back to home
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

const PRICING_MARKETS: BillingMarket[] = [
  "Poland",
  "Sweden",
  "Denmark",
  "United Kingdom",
  "European Union",
];

function PricingBody() {
  const [market, setMarket] = useState<BillingMarket>("European Union");
  const currency = MARKET_CURRENCY[market];
  return (
    <section className="relative mx-auto max-w-[1240px] px-6 py-12 md:py-14">
      <div className="text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#b77f1f]">
          Pricing
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-[-0.035em] md:text-[54px]">
          Simple plans. Clear limits. No lock-in.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Start with one project. Scale to fifteen when your clients do.
        </p>
        <div className="mt-7 inline-block text-left lg:absolute lg:right-6 lg:top-1 lg:mt-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            Market
          </div>
          <Select value={market} onValueChange={(v) => setMarket(v as BillingMarket)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICING_MARKETS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLAN_IDS.map((pid) => {
          const meta = PLAN_META[pid];
          return (
            <div
              key={pid}
              className={
                "relative rounded-xl border p-6 pt-7 bg-card flex flex-col " +
                (meta.recommended
                  ? "border-[#bd8120] shadow-[0_0_0_1px_rgba(189,129,32,.2)]"
                  : "border-border")
              }
            >
              {meta.recommended ? (
                <div className="absolute inset-x-[-1px] top-[-29px] rounded-t-xl bg-[#bd8120] py-1.5 text-center text-xs font-medium text-white">
                  Recommended
                </div>
              ) : null}
              <h3 className="font-display text-xl">{meta.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl">
                  {formatMoney(planPrice(market, pid), currency)}
                </span>
                {pid !== "freePreview" ? (
                  <span className="text-sm text-muted-foreground">/month</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-medium">
                {PLAN_LIMITS[pid].maxProjects === 1
                  ? "1 project"
                  : `Up to ${PLAN_LIMITS[pid].maxProjects} projects`}
              </p>
              <div className="my-5 border-t border-border" />
              <ul className="space-y-3 text-sm flex-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-[#bd8120]" />
                    <span>{f}</span>
                  </li>
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

      <div className="mt-8 grid overflow-hidden rounded-xl border border-border bg-card md:grid-cols-3">
        <PricingPromise
          icon={CircleCheck}
          title="Cancel anytime"
          body="No lock-in. Manage or cancel in Billing."
        />
        <PricingPromise
          icon={Link2}
          title="Backlinks is a separate add-on"
          body="Activate it only when you are ready."
        />
        <PricingPromise
          icon={ShoppingCart}
          title="Marketplace placements billed individually"
          body="Review the publisher and price before purchase."
        />
      </div>

      <section className="mt-14">
        <h2 className="text-center font-display text-3xl">Compare everything included</h2>
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="border-b border-border bg-secondary/30">
              <tr>
                <th className="px-5 py-4 text-left font-medium">Capability</th>
                {PLAN_IDS.map((pid) => (
                  <th key={pid} className="px-5 py-4 text-center font-display text-base">
                    {PLAN_META[pid].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <CompareRow
                label="Projects"
                values={PLAN_IDS.map((pid) =>
                  PLAN_LIMITS[pid].maxProjects === 1
                    ? "1"
                    : `Up to ${PLAN_LIMITS[pid].maxProjects}`,
                )}
              />
              <CompareRow
                label="Monthly content generations"
                values={PLAN_IDS.map((pid) => String(PLAN_LIMITS[pid].monthlyContentGenerations))}
              />
              <CompareRow
                label="Milo Scores per month"
                values={PLAN_IDS.map((pid) => String(PLAN_LIMITS[pid].monthlyMiloScores))}
              />
              <CompareRow
                label="Publishing & connectors"
                values={PLAN_IDS.map((pid) => PLAN_LIMITS[pid].publishingEnabled)}
              />
              <CompareRow
                label="Analytics & GSC Lite"
                values={PLAN_IDS.map(
                  (pid) => PLAN_LIMITS[pid].analyticsEnabled && PLAN_LIMITS[pid].gscLiteEnabled,
                )}
              />
              <CompareRow
                label="AI evaluation"
                values={PLAN_IDS.map((pid) => PLAN_LIMITS[pid].aiEvaluationEnabled)}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Add-ons */}
      <h2 className="mt-14 font-display text-3xl">Optional services and add-ons</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Core SEO planning stays predictable. External services are kept separate so you always know
        what you are paying for.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-lg">Assisted Setup</h3>
          <div className="mt-1 font-display text-2xl">
            {formatMoney(addOnPrice(market, "assistedSetup"), currency)}{" "}
            <span className="text-sm text-muted-foreground">one-time</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Guided setup, Brand Intelligence, connector and first content.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-lg">Monthly Care</h3>
          <div className="mt-1 font-display text-2xl">
            {formatMoney(addOnPrice(market, "monthlyCare"), currency)}{" "}
            <span className="text-sm text-muted-foreground">/month</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly review, content, publishing and analytics support.
          </p>
        </div>
        <div className="rounded-xl border border-[#d8c290] bg-[#faf6ec] p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b6b19]">
            Separate add-on
          </div>
          <h3 className="mt-2 font-display text-lg">Backlinks workspace</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Link profile and gap analysis, marketplace access and reviewable outreach. Pricing is
            shown before activation; publisher placements are billed individually.
          </p>
          <a
            href="mailto:support@milogrowth.com?subject=Backlinks%20add-on"
            className="mt-5 inline-flex text-sm font-medium text-[#8d621b] underline underline-offset-4"
          >
            Review Backlinks add-on
          </a>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground max-w-3xl">
        Your billing market is based on your business/billing country. Changing the website language
        or public region does not change pricing eligibility. No rankings, traffic, revenue or AI
        citations are guaranteed.
      </p>
    </section>
  );
}

function PricingPromise({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof CircleCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 border-b border-border px-6 py-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#bd8120] text-[#bd8120]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-display text-base">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: Array<string | boolean> }) {
  return (
    <tr>
      <td className="px-5 py-4 font-medium">{label}</td>
      {values.map((value, index) => (
        <td
          key={`${label}-${PLAN_IDS[index]}`}
          className="px-5 py-4 text-center text-muted-foreground"
        >
          {typeof value === "boolean" ? (
            value ? (
              <Check className="mx-auto h-4 w-4 text-emerald-600" />
            ) : (
              "—"
            )
          ) : (
            value
          )}
        </td>
      ))}
    </tr>
  );
}
