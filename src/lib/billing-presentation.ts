import { formatMoney, type BillingMarket } from "./billing";
import { UI_SUPPORTED_CURRENCY_EXPONENT } from "./stripe-commercial-ui";
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
  ["White-label monthly reports (on demand)", "billingScreen.feature.reports"],
  ["Highest monthly limits", "billingScreen.feature.highestLimits"],
  ["Connectors + AI Evaluation (where configured)", "billingScreen.feature.allConnectors"],
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

/**
 * A value the screen is allowed to state, or an explicit UNKNOWN.
 *
 * Missing, unreadable and unsupported are all `{ known: false }`, which the
 * caller renders as the unknown label. They are never rendered as zero, as the
 * free tier or as a successful outcome.
 */
export type PresentedValue = { known: true; text: string } | { known: false };

export const UNKNOWN_VALUE: PresentedValue = { known: false };

/**
 * Render an INTEGER MINOR-unit amount from the commercial API.
 *
 * `formatBillingMoney` above takes WHOLE units, so a minor amount must never be
 * passed to it directly. The conversion uses the accepted supported-currency
 * exponent map: an unlisted currency is unknown rather than universally divided
 * by one hundred. Real zero is a value; a missing amount is not.
 */
export function formatBillingMinorMoney(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
  locale: OnboardingLanguage,
): PresentedValue {
  if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor)) return UNKNOWN_VALUE;
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) return UNKNOWN_VALUE;
  const exponent = UI_SUPPORTED_CURRENCY_EXPONENT[currency.toLowerCase()];
  if (exponent === undefined) return UNKNOWN_VALUE;
  const code = currency.toUpperCase();
  const amount = amountMinor / 10 ** exponent;
  // The provider's exact precision is kept: a two-decimal currency always
  // shows both decimals, so 12345 minor units read as 123.45 and never 123.4.
  const fixed = amount.toFixed(exponent);
  // English keeps the existing representation of `formatMoney`.
  if (locale === "en")
    return {
      known: true,
      text: code === "GBP" ? `£${fixed}` : code === "EUR" ? `€${fixed}` : `${fixed} ${code}`,
    };
  try {
    return {
      known: true,
      text: new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        currencyDisplay: "code",
        minimumFractionDigits: exponent,
        maximumFractionDigits: exponent,
      }).format(amount),
    };
  } catch {
    return { known: true, text: `${fixed} ${code}` };
  }
}

/**
 * Render a date the SERVER supplied. An absent or unparseable value stays
 * unknown — a billing date the product cannot prove must not be invented.
 * Rendered in UTC so the stated effective/period day does not drift with the
 * reviewer's machine.
 */
export function formatBillingDate(
  iso: string | null | undefined,
  locale: OnboardingLanguage,
): PresentedValue {
  if (typeof iso !== "string" || iso.trim() === "") return UNKNOWN_VALUE;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return UNKNOWN_VALUE;
  try {
    return {
      known: true,
      text: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(parsed),
      ),
    };
  } catch {
    return { known: true, text: new Date(parsed).toISOString().slice(0, 10) };
  }
}

/**
 * Render an exact server INSTANT, with its time and an explicit zone.
 *
 * A quote can expire minutes after it was issued, so the day alone is not the
 * deadline the customer has to act within: two quotes issued the same morning
 * would read identically. UTC is used deliberately rather than the viewer's
 * zone — it is the zone the server timestamp is in, and labelling it is more
 * honest than silently re-anchoring a financial deadline to the machine's
 * clock settings.
 */
export function formatBillingDateTime(
  iso: string | null | undefined,
  locale: OnboardingLanguage,
): PresentedValue {
  if (typeof iso !== "string" || iso.trim() === "") return UNKNOWN_VALUE;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return UNKNOWN_VALUE;
  const when = new Date(parsed);
  try {
    return {
      known: true,
      // Explicit components, not `dateStyle`/`timeStyle`: ECMA-402 forbids
      // combining those with `timeZoneName`, and silently losing the zone is
      // exactly the defect this formatter exists to fix.
      text: new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(when),
    };
  } catch {
    return { known: true, text: `${when.toISOString().slice(0, 16).replace("T", " ")} UTC` };
  }
}

/** A count the backend supplied. `0` is a real count; null/undefined is not. */
export function formatBillingCount(value: number | null | undefined): PresentedValue {
  if (typeof value !== "number" || !Number.isFinite(value)) return UNKNOWN_VALUE;
  return { known: true, text: String(value) };
}
