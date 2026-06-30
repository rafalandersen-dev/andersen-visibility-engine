/**
 * Billing catalogue, plan limits and billing-market derivation (Sprint 14).
 *
 * Pure, client+server safe (no env, no secrets). The golden rule: PRICING IS
 * DETERMINED BY billingMarket, which is derived from the business/billing
 * COUNTRY — never by the public display region, app language or target market.
 */

export type PlanId = "freePreview" | "starter" | "growth" | "pro";
export type AddOnId = "assistedSetup" | "monthlyCare";
export type CustomerType = "business" | "consumer";

export type BillingMarket =
  | "Poland" | "Sweden" | "Denmark" | "United Kingdom" | "European Union" | "Other";

export type SubscriptionStatus =
  | "freePreview" | "checkoutPending" | "active" | "pastDue" | "cancelled" | "manualBeta" | "manualComped";

export interface PlanLimits {
  maxProjects: number;
  maxWebsites: number;
  monthlyAiCredits: number;
  monthlyContentGenerations: number;
  monthlyImproveDrafts: number;
  monthlyMiloScores: number;
  monthlyAudits: number;
  monthlyGscImports: number;
  monthlyAuthorityGenerations: number;
  publishingEnabled: boolean;
  wordpressConnectorEnabled: boolean;
  customConnectorEnabled: boolean;
  analyticsEnabled: boolean;
  gscLiteEnabled: boolean;
  authorityBuilderEnabled: boolean;
  aiEvaluationEnabled: boolean;
}

export interface BillingProfile {
  customerType: CustomerType;
  billingName?: string;
  businessName?: string;
  billingEmail?: string;
  billingCountry?: string; // ISO-2 code
  vatId?: string;
  billingMarket?: BillingMarket;
  billingMarketLockedAt?: string;
  billingMarketNeedsReview?: boolean;
  acceptedPricingCountryAt?: string;
  updatedAt?: string;
}

export interface SubscriptionPlan {
  planId: PlanId;
  status: SubscriptionStatus;
  billingMarket: BillingMarket;
  currency: string;
  priceMonthly: number;
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  paddleTransactionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  addOns?: { assistedSetup?: boolean; monthlyCare?: boolean };
  manualOverride?: boolean;
  updatedAt?: string;
}

export const PLAN_IDS: PlanId[] = ["freePreview", "starter", "growth", "pro"];
export const BILLING_MARKETS: BillingMarket[] = ["Poland", "Sweden", "Denmark", "United Kingdom", "European Union", "Other"];

export const MARKET_CURRENCY: Record<BillingMarket, string> = {
  Poland: "PLN",
  Sweden: "SEK",
  Denmark: "DKK",
  "United Kingdom": "GBP",
  "European Union": "EUR",
  Other: "EUR",
};

/** Monthly plan price per market (0 = Free Preview). */
export const PLAN_PRICING: Record<BillingMarket, Record<PlanId, number>> = {
  Poland: { freePreview: 0, starter: 249, growth: 599, pro: 1199 },
  Sweden: { freePreview: 0, starter: 799, growth: 1499, pro: 2999 },
  Denmark: { freePreview: 0, starter: 549, growth: 999, pro: 1999 },
  "United Kingdom": { freePreview: 0, starter: 69, growth: 129, pro: 249 },
  "European Union": { freePreview: 0, starter: 79, growth: 149, pro: 299 },
  Other: { freePreview: 0, starter: 79, growth: 149, pro: 299 },
};

/** Assisted Setup is one-time; Monthly Care is recurring. */
export const ADDON_PRICING: Record<BillingMarket, Record<AddOnId, number>> = {
  Poland: { assistedSetup: 999, monthlyCare: 599 },
  Sweden: { assistedSetup: 3500, monthlyCare: 1499 },
  Denmark: { assistedSetup: 2500, monthlyCare: 999 },
  "United Kingdom": { assistedSetup: 299, monthlyCare: 129 },
  "European Union": { assistedSetup: 349, monthlyCare: 149 },
  Other: { assistedSetup: 349, monthlyCare: 149 },
};

export const PLAN_META: Record<PlanId, { name: string; recommended?: boolean; tagline: string; features: string[] }> = {
  freePreview: {
    name: "Free Preview",
    tagline: "Activation and evaluation.",
    features: ["1 project / 1 website", "Free AI Visibility Audit", "Limited content & Milo Score", "Analytics & GSC Lite", "Authority preview"],
  },
  starter: {
    name: "Starter",
    tagline: "For one small business website.",
    features: ["1 project / 1 website", "Brand Intelligence & opportunities", "Content + Milo Score", "Publishing (custom & WordPress)", "Analytics v2, GSC Lite, Authority"],
  },
  growth: {
    name: "Growth",
    recommended: true,
    tagline: "The full monthly workflow.",
    features: ["Up to 3 projects / websites", "Higher content & Improve limits", "Publishing + connectors", "Analytics v2, GSC Lite, Authority v2", "AI Visibility planner"],
  },
  pro: {
    name: "Pro",
    tagline: "For freelancers, agencies and multi-site businesses.",
    features: ["Up to 10 projects / websites", "High monthly limits", "More GSC imports & authority", "AI Evaluation (where configured)", "Priority support"],
  },
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  freePreview: {
    maxProjects: 1, maxWebsites: 1, monthlyAiCredits: 50, monthlyContentGenerations: 3, monthlyImproveDrafts: 3,
    monthlyMiloScores: 5, monthlyAudits: 2, monthlyGscImports: 1, monthlyAuthorityGenerations: 1,
    publishingEnabled: false, wordpressConnectorEnabled: false, customConnectorEnabled: false,
    analyticsEnabled: true, gscLiteEnabled: true, authorityBuilderEnabled: true, aiEvaluationEnabled: false,
  },
  starter: {
    maxProjects: 1, maxWebsites: 1, monthlyAiCredits: 300, monthlyContentGenerations: 10, monthlyImproveDrafts: 10,
    monthlyMiloScores: 30, monthlyAudits: 5, monthlyGscImports: 3, monthlyAuthorityGenerations: 3,
    publishingEnabled: true, wordpressConnectorEnabled: true, customConnectorEnabled: true,
    analyticsEnabled: true, gscLiteEnabled: true, authorityBuilderEnabled: true, aiEvaluationEnabled: false,
  },
  growth: {
    maxProjects: 3, maxWebsites: 3, monthlyAiCredits: 1200, monthlyContentGenerations: 40, monthlyImproveDrafts: 40,
    monthlyMiloScores: 100, monthlyAudits: 15, monthlyGscImports: 10, monthlyAuthorityGenerations: 10,
    publishingEnabled: true, wordpressConnectorEnabled: true, customConnectorEnabled: true,
    analyticsEnabled: true, gscLiteEnabled: true, authorityBuilderEnabled: true, aiEvaluationEnabled: false,
  },
  pro: {
    maxProjects: 10, maxWebsites: 10, monthlyAiCredits: 4000, monthlyContentGenerations: 120, monthlyImproveDrafts: 120,
    monthlyMiloScores: 300, monthlyAudits: 40, monthlyGscImports: 30, monthlyAuthorityGenerations: 30,
    publishingEnabled: true, wordpressConnectorEnabled: true, customConnectorEnabled: true,
    analyticsEnabled: true, gscLiteEnabled: true, authorityBuilderEnabled: true, aiEvaluationEnabled: true,
  },
};

/** Curated billing-country options. Stored value is the ISO-2 code. */
export const COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: "PL", name: "Poland" },
  { code: "SE", name: "Sweden" },
  { code: "DK", name: "Denmark" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "IE", name: "Ireland" },
  { code: "FI", name: "Finland" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "PT", name: "Portugal" },
  { code: "CZ", name: "Czechia" },
  { code: "OTHER", name: "Other / not listed" },
];

/** EU member ISO-2 codes that map to the generic "European Union" market. */
const EU_MARKET_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PT","RO","SK","SI","ES",
]);

/** Map a billing country (ISO-2) to its billing market. Never trusts display region. */
export function deriveBillingMarket(country: string | undefined): BillingMarket {
  const c = (country || "").trim().toUpperCase();
  if (c === "PL") return "Poland";
  if (c === "SE") return "Sweden";
  if (c === "DK") return "Denmark";
  if (c === "GB" || c === "UK") return "United Kingdom";
  if (EU_MARKET_COUNTRIES.has(c)) return "European Union";
  return "Other";
}

export function planPrice(market: BillingMarket, planId: PlanId): number {
  return (PLAN_PRICING[market] ?? PLAN_PRICING.Other)[planId];
}
export function addOnPrice(market: BillingMarket, addOn: AddOnId): number {
  return (ADDON_PRICING[market] ?? ADDON_PRICING.Other)[addOn];
}

/** Render a money amount in the market's currency. */
export function formatMoney(amount: number, currency: string): string {
  if (currency === "GBP") return amount === 0 ? "£0" : `£${amount}`;
  if (currency === "EUR") return amount === 0 ? "€0" : `€${amount}`;
  return `${amount} ${currency}`;
}

export function getCurrentPlanId(sub?: SubscriptionPlan): PlanId {
  return sub?.planId ?? "freePreview";
}
export function getPlanLimitsFor(sub?: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[getCurrentPlanId(sub)];
}

/** True for a genuinely active paid/manual plan (not free preview). */
export function isActivePaid(sub?: SubscriptionPlan): boolean {
  if (!sub) return false;
  const active = sub.status === "active" || sub.status === "manualBeta" || sub.status === "manualComped";
  return active && sub.planId !== "freePreview";
}

/**
 * Light feature gate. Owners always pass. Boolean limits gate directly; numeric
 * limits pass when > 0 (detailed monthly metering is deferred — see report).
 */
export function canUseFeature(opts: { isOwner: boolean; sub?: SubscriptionPlan; feature: keyof PlanLimits }): boolean {
  if (opts.isOwner) return true;
  const limits = getPlanLimitsFor(opts.sub);
  const v = limits[opts.feature];
  return typeof v === "boolean" ? v : v > 0;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  freePreview: "Free Preview",
  checkoutPending: "Checkout pending",
  active: "Active",
  pastDue: "Past due",
  cancelled: "Cancelled",
  manualBeta: "Manual beta",
  manualComped: "Manual comped",
};
