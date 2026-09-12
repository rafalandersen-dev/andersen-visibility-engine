import { AuthLanguagePicker } from "@/components/AuthLanguagePicker";
import { useAuthLanguage } from "@/hooks/use-auth-language";
import { billingFeatureLabel, billingMarketLabel } from "@/lib/billing-presentation";
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
  const controls = useAuthLanguage();
  const { t, language } = controls;
  return (
    <main lang={language} className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap gap-3 items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("publicHome.tagline")}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">{t("publicBeta.home")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">{t("onboarding.getStarted")}</Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-[1240px] px-6">
          <AuthLanguagePicker language={language} onChange={controls.chooseLanguage} />
        </div>
      </header>

      <PricingBody t={t} language={language} />

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground">
          <span>{t("shell.footerBuiltBy")}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/free-ai-visibility-audit" className="hover:text-foreground">
              {t("publicHome.freeAudit")}
            </Link>
            <Link to="/beta" className="hover:text-foreground">
              {t("publicHome.beta")}
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              {t("publicHome.terms")}
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              {t("publicHome.privacy")}
            </Link>
            <Link to="/security" className="hover:text-foreground">
              {t("publicHome.security")}
            </Link>
            <Link to="/" className="hover:text-foreground">
              {t("publicPricing.backHome")}
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

function PricingBody({ t, language }: Pick<ReturnType<typeof useAuthLanguage>, "t" | "language">) {
  const [market, setMarket] = useState<BillingMarket>("European Union");
  const currency = MARKET_CURRENCY[market];
  return (
    <section className="relative mx-auto max-w-[1240px] px-6 py-12 md:py-14">
      <div className="text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#b77f1f]">
          {t("publicHome.pricing")}
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-[-0.035em] md:text-[54px]">
          {t("publicPricing.title")}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t("publicPricing.intro", { count: PLAN_LIMITS.agency.maxProjects })}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{t("publicPricing.hold")}</p>
        <div className="mt-7 inline-block text-left lg:absolute lg:right-6 lg:top-1 lg:mt-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            {t("publicPricing.market")}
          </div>
          <Select value={market} onValueChange={(v) => setMarket(v as BillingMarket)}>
            <SelectTrigger className="w-48" aria-label={t("publicPricing.market")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent lang={language}>
              {PRICING_MARKETS.map((m) => (
                <SelectItem key={m} value={m}>
                  {billingMarketLabel(m, t)}
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
                  {t("publicPricing.recommended")}
                </div>
              ) : null}
              <h3 className="font-display text-xl">
                {pid === "freePreview" ? t("billingScreen.freePreview") : meta.name}
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl">
                  {formatMoney(planPrice(market, pid), currency)}
                </span>
                {pid !== "freePreview" ? (
                  <span className="text-sm text-muted-foreground">{t("publicPricing.month")}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-medium">
                {PLAN_LIMITS[pid].maxProjects === 1
                  ? t("publicPricing.oneProject")
                  : t("publicPricing.projects", { count: PLAN_LIMITS[pid].maxProjects })}
              </p>
              <div className="my-5 border-t border-border" />
              <ul className="space-y-3 text-sm flex-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-[#bd8120]" />
                    <span>{billingFeatureLabel(f, t)}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full" variant={meta.recommended ? "default" : "outline"}>
                <Link to="/auth" className="mt-6">
                  {pid === "freePreview"
                    ? t("publicPricing.startPreview")
                    : t("onboarding.getStarted")}
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid overflow-hidden rounded-xl border border-border bg-card md:grid-cols-3">
        <PricingPromise
          icon={CircleCheck}
          title={t("publicPricing.manage")}
          body={t("publicPricing.manageBody")}
        />
        <PricingPromise
          icon={Link2}
          title={t("publicPricing.backlinksSeparate")}
          body={t("publicPricing.activationHold")}
        />
        <PricingPromise
          icon={ShoppingCart}
          title={t("publicPricing.placements")}
          body={t("publicPricing.purchasesHold")}
        />
      </div>

      <section className="mt-14">
        <h2 className="text-center font-display text-3xl">{t("publicPricing.compare")}</h2>
        <div className="relative mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="border-b border-border bg-secondary/30">
              <tr>
                <th scope="col" className="px-5 py-4 text-left font-medium">
                  {t("publicPricing.capability")}
                </th>
                {PLAN_IDS.map((pid) => (
                  <th
                    scope="col"
                    key={pid}
                    className="px-5 py-4 text-center font-display text-base"
                  >
                    {pid === "freePreview" ? t("billingScreen.freePreview") : PLAN_META[pid].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <CompareRow
                t={t}
                label={t("publicPricing.projectLabel")}
                values={PLAN_IDS.map((pid) =>
                  PLAN_LIMITS[pid].maxProjects === 1
                    ? "1"
                    : t("publicPricing.upTo", { count: PLAN_LIMITS[pid].maxProjects }),
                )}
              />
              <CompareRow
                t={t}
                label={t("publicPricing.content")}
                values={PLAN_IDS.map((pid) => String(PLAN_LIMITS[pid].monthlyContentGenerations))}
              />
              <CompareRow
                t={t}
                label={t("publicPricing.scores")}
                values={PLAN_IDS.map((pid) => String(PLAN_LIMITS[pid].monthlyMiloScores))}
              />
              <CompareRow
                t={t}
                label={t("publicPricing.publishing")}
                values={PLAN_IDS.map((pid) => PLAN_LIMITS[pid].publishingEnabled)}
              />
              <CompareRow
                t={t}
                label={t("billingScreen.feature.analyticsLite")}
                values={PLAN_IDS.map(
                  (pid) => PLAN_LIMITS[pid].analyticsEnabled && PLAN_LIMITS[pid].gscLiteEnabled,
                )}
              />
              <CompareRow
                t={t}
                label={t("billingScreen.feature.images")}
                values={PLAN_IDS.map((pid) => PLAN_LIMITS[pid].imageGenerationEnabled)}
              />
              <CompareRow
                t={t}
                label={t("publicPricing.evaluation")}
                values={PLAN_IDS.map((pid) => PLAN_LIMITS[pid].aiEvaluationEnabled)}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Add-ons */}
      <h2 className="mt-14 font-display text-3xl">{t("publicPricing.optional")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {t("publicPricing.optionalBody")}
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-lg">{t("publicPricing.setup")}</h3>
          <div className="mt-1 font-display text-2xl">
            {formatMoney(addOnPrice(market, "assistedSetup"), currency)}{" "}
            <span className="text-sm text-muted-foreground">{t("publicPricing.once")}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("publicPricing.setupBody")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-lg">{t("publicPricing.care")}</h3>
          <div className="mt-1 font-display text-2xl">
            {formatMoney(addOnPrice(market, "monthlyCare"), currency)}{" "}
            <span className="text-sm text-muted-foreground">{t("publicPricing.month")}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("publicPricing.careBody")}</p>
        </div>
        <div className="rounded-xl border border-[#d8c290] bg-[#faf6ec] p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b6b19]">
            {t("publicPricing.separate")}
          </div>
          <h3 className="mt-2 font-display text-lg">{t("publicPricing.workspace")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("publicPricing.workspaceBody")}</p>
          <a
            href="mailto:support@milogrowth.com?subject=Backlinks%20add-on"
            className="mt-5 inline-flex text-sm font-medium text-[#8d621b] underline underline-offset-4"
          >
            {t("publicPricing.review")}
          </a>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground max-w-3xl">
        {t("publicPricing.eligibility")}
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

function CompareRow({
  label,
  values,
  t,
}: {
  label: string;
  values: Array<string | boolean>;
  t: (key: string) => string;
}) {
  return (
    <tr>
      <th scope="row" className="px-5 py-4 text-left font-medium">
        {label}
      </th>
      {values.map((value, index) => (
        <td
          key={`${label}-${PLAN_IDS[index]}`}
          className="px-5 py-4 text-center text-muted-foreground"
        >
          {typeof value === "boolean" ? (
            <>
              <span className="sr-only">
                {t(value ? "publicPricing.included" : "publicPricing.notIncluded")}
              </span>
              {value ? (
                <Check aria-hidden="true" className="mx-auto h-4 w-4 text-emerald-600" />
              ) : (
                <span aria-hidden="true">—</span>
              )}
            </>
          ) : (
            value
          )}
        </td>
      ))}
    </tr>
  );
}
