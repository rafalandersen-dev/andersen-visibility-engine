/**
 * Onboarding Wizard v1 — option lists, market defaults, language mapping and the
 * "is this project set up?" heuristic used by the redirect guard.
 *
 * Onboarding data lives in the workspace JSONB (Project), so there is no DB
 * schema change. All fields are optional → existing projects keep working.
 */
import type { Currency, Market, OnboardingLanguage, Language, Project } from "./types";

export const MARKETS: {
  value: Market;
  label: string;
  currency: Currency;
  appLanguage: OnboardingLanguage;
  primaryContentLanguage: OnboardingLanguage;
}[] = [
  { value: "PL", label: "Poland", currency: "PLN", appLanguage: "pl", primaryContentLanguage: "pl" },
  { value: "SE", label: "Sweden", currency: "SEK", appLanguage: "sv", primaryContentLanguage: "sv" },
  { value: "DK", label: "Denmark", currency: "DKK", appLanguage: "da", primaryContentLanguage: "da" },
  { value: "UK", label: "United Kingdom", currency: "GBP", appLanguage: "en", primaryContentLanguage: "en" },
  { value: "EU", label: "Europe / Other", currency: "EUR", appLanguage: "en", primaryContentLanguage: "en" },
];

export const LANGUAGE_OPTIONS: { value: OnboardingLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "da", label: "Danish" },
];

export const GROWTH_GOALS = [
  "More website visits",
  "More local leads",
  "More bookings",
  "More product sales",
  "Better Google visibility",
  "Better AI/search readiness",
  "Better content quality",
  "More trust and authority",
] as const;

/**
 * Maps each canonical (English, stored verbatim) growth goal to a translation
 * key, so the UI can render a localized label without changing what is stored.
 */
export const GOAL_KEYS: Record<string, string> = {
  "More website visits": "goal.visits",
  "More local leads": "goal.localLeads",
  "More bookings": "goal.bookings",
  "More product sales": "goal.productSales",
  "Better Google visibility": "goal.googleVisibility",
  "Better AI/search readiness": "goal.aiReadiness",
  "Better content quality": "goal.contentQuality",
  "More trust and authority": "goal.trustAuthority",
};

/** Translation key for a market value (e.g. "PL" → "market.PL"). */
export function marketKey(market: Market): string {
  return `market.${market}`;
}

export function marketDefaults(market: Market) {
  const m = MARKETS.find((x) => x.value === market) ?? MARKETS[4];
  return { currency: m.currency, appLanguage: m.appLanguage, primaryContentLanguage: m.primaryContentLanguage };
}

/**
 * Map an onboarding content language to the Project.primaryLanguage / content
 * asset Language enum used by the AI generators. The enum now supports
 * Polish/Swedish/English/Danish.
 */
export function contentLangToProjectLanguage(lang: OnboardingLanguage): Language {
  if (lang === "pl") return "Polish";
  if (lang === "sv") return "Swedish";
  if (lang === "da") return "Danish";
  return "English"; // en → English
}

/**
 * A project counts as "set up" when onboarding marked it complete, OR it already
 * has meaningful details from the legacy setup flow (protects existing projects
 * like Synergy / Nordic Crumb from being trapped in the wizard).
 */
export function isProjectSetupComplete(p: Project | undefined): boolean {
  if (!p) return false;
  if (p.setupComplete === true) return true;
  return Boolean(p.businessName?.trim() && p.description?.trim());
}
