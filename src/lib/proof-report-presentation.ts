import { reportDayKey } from "./proof-report-dates";
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

/** Use UTC for timestamp evidence; date-only plan/window values keep their day. */
export function formatReportDate(
  value: string | undefined,
  language: OnboardingLanguage = "en",
): string {
  const day = reportDayKey(value);
  if (!day) return "—";
  const parsed = new Date(`${day}T00:00:00.000Z`);
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
