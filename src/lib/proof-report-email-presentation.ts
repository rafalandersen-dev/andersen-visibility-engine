import { proofReportEmailCopy } from "@/i18n/proof-report-email-copy";
import { emailLocaleSchema, type EmailLanguage } from "./email-languages";

export function reportEmailLanguage(value: unknown): EmailLanguage {
  const parsed = emailLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : "en";
}
export function translateProofReportEmail(
  language: EmailLanguage | undefined,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const copy = proofReportEmailCopy[reportEmailLanguage(language)];
  if (!Object.prototype.hasOwnProperty.call(copy, key)) return key;
  const text = copy[key as keyof typeof copy];
  return vars
    ? text.replace(/\{([^{}]+)\}/g, (token, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : token,
      )
    : text;
}
export function formatReportEmailMonth(value: string, language: EmailLanguage = "en"): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return "—";
  return new Intl.DateTimeFormat(reportEmailLanguage(language), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}
export function formatReportEmailDate(
  value: string | undefined,
  language: EmailLanguage = "en",
): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return "—";
  const day = value.slice(0, 10),
    date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return "—";
  if (language === "en") {
    // Keep the existing report's English representation for current recipients.
    return `${day.slice(8)} ${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date)} ${day.slice(0, 4)}`;
  }
  return new Intl.DateTimeFormat(reportEmailLanguage(language), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
export function formatReportEmailNumber(
  value: number | null | undefined,
  language: EmailLanguage = "en",
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(reportEmailLanguage(language), { maximumFractionDigits: 2 }).format(
    Math.round(value * 100) / 100,
  );
}
export function proofReportEmailSubject(
  projectName: string,
  monthKey: string,
  language: EmailLanguage = "en",
): string {
  return `${translateProofReportEmail(language, "report.title")} — ${projectName} · ${formatReportEmailMonth(monthKey, language)}`;
}
