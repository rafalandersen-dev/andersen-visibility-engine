import { isUiLanguage } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "./types";
import { formatDate } from "./format";

const localeOf = (language: OnboardingLanguage | undefined) =>
  isUiLanguage(language) ? language : "en";

/** Display a canonical report month; never change the key used for aggregation. */
export function formatReportMonth(monthKey: string, language: OnboardingLanguage = "en"): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return "—";
  return new Intl.DateTimeFormat(localeOf(language), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

/** Preserve the recorded calendar day, as the report's existing date slices did.
 * Date-only plan/window values must not shift with the viewer's timezone. */
export function formatReportDate(
  value: string | undefined,
  language: OnboardingLanguage = "en",
): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return "—";
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return "—";
  return formatDate(parsed, localeOf(language));
}

/** Retain the report's existing two-decimal metric precision and unknown state. */
export function formatReportNumber(
  value: number | null | undefined,
  language: OnboardingLanguage = "en",
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(localeOf(language), { maximumFractionDigits: 2 }).format(
    Math.round(value * 100) / 100,
  );
}

export function proofReportSubject(
  projectName: string,
  monthKey: string,
  language: OnboardingLanguage = "en",
): string {
  return `${translate(language, "report.title")} — ${projectName} · ${formatReportMonth(monthKey, language)}`;
}
