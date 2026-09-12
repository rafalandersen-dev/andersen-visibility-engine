import { formatMoney, type BillingMarket } from "./billing";
import type { OnboardingLanguage } from "./types";

type TranslateLabel = (key: string) => string;

// Exact source text identifies a catalog feature, not its array position. Unknown
// future features retain their supplied text until explicitly translated.
const FEATURE_KEYS: ReadonlyMap<string, string> = new Map([
  ["1 project / 1 website", "billingScreen.feature.oneSite"],
  ["Free AI Visibility Audit", "billingScreen.feature.audit"],
  ["Limited content & Milo Score", "billingScreen.feature.limitedContent"],
  ["Analytics & GSC Lite", "billingScreen.feature.analyticsLite"],
  ["Authority preview", "billingScreen.feature.authorityPreview"],
  ["Brand Intelligence & opportunities", "billingScreen.feature.brandOpportunities"],
  ["Content + Milo Score", "billingScreen.feature.contentScore"],
  ["Publishing (custom & WordPress)", "billingScreen.feature.publishingCustom"],
  ["Analytics v2, GSC Lite, Authority", "billingScreen.feature.analyticsAuthority"],
  ["Up to 3 projects / websites", "billingScreen.feature.threeSites"],
  ["Higher content & Improve limits", "billingScreen.feature.higherContent"],
  ["Publishing + connectors", "billingScreen.feature.publishingConnectors"],
  ["Analytics v2, GSC Lite, Authority v2", "billingScreen.feature.analyticsAuthorityV2"],
  ["AI Visibility planner", "billingScreen.feature.planner"],
  ["Up to 5 projects / websites", "billingScreen.feature.fiveSites"],
  ["High monthly limits", "billingScreen.feature.highLimits"],
  ["AI image generation", "billingScreen.feature.images"],
  ["More GSC imports & authority", "billingScreen.feature.moreGsc"],
  ["AI Evaluation (where configured)", "billingScreen.feature.evaluationConfigured"],
  ["Priority support", "billingScreen.feature.prioritySupport"],
  ["Up to 15 client projects", "billingScreen.feature.clientProjects"],
  ["White-label monthly proof reports", "billingScreen.feature.reports"],
  ["Highest monthly limits", "billingScreen.feature.highestLimits"],
  ["All connectors + AI Evaluation", "billingScreen.feature.allConnectors"],
]);

export function billingFeatureLabel(feature: string, t: TranslateLabel): string {
  const key = FEATURE_KEYS.get(feature);
  return key ? t(key) : feature;
}

export function billingMarketLabel(market: BillingMarket, t: TranslateLabel): string {
  return t(`billingScreen.market.${market}`);
}

/** Country labels never replace the original ISO code used for pricing. */
export function billingCountryLabel(
  country: { code: string; name: string },
  locale: OnboardingLanguage,
  t: TranslateLabel,
): string {
  if (country.code === "OTHER") return t("billingScreen.otherCountry");
  if (locale === "en" || !/^[A-Z]{2}$/.test(country.code)) return country.name;
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(country.code) ??
      country.name
    );
  } catch {
    return country.name;
  }
}

/** Selected UI language affects presentation only; currency and amount remain
 * determined by the billing market. English keeps its existing representation. */
export function formatBillingMoney(
  amount: number,
  currency: string,
  locale: OnboardingLanguage,
): string {
  if (locale === "en") return formatMoney(amount, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 0,
      maximumFractionDigits: 20,
    }).format(amount);
  } catch {
    return formatMoney(amount, currency);
  }
}
