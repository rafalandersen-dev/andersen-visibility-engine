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

export function marketDefaults(market: Market) {
  const m = MARKETS.find((x) => x.value === market) ?? MARKETS[4];
  return { currency: m.currency, appLanguage: m.appLanguage, primaryContentLanguage: m.primaryContentLanguage };
}

/**
 * Map an onboarding content language to the Project.primaryLanguage enum used by
 * the AI generators. The enum supports Polish/Swedish/English only, so Danish
 * falls back to English for generation (content language is still stored as "da").
 */
export function contentLangToProjectLanguage(lang: OnboardingLanguage): Language {
  if (lang === "pl") return "Polish";
  if (lang === "sv") return "Swedish";
  return "English"; // en, da → English (enum has no Danish in v1)
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
