import { UI_CATALOGS, isUiLanguage } from "./catalogs";
import type { OnboardingLanguage } from "@/lib/types";

/** Pure translation also works for server-rendered text and offline locale checks.
 * Values are inserted literally in one pass: prices, dollar signs and braces in
 * supplied project names cannot act as replacement syntax or another variable. */
export function translate(
  language: OnboardingLanguage | undefined,
  key: string,
  variables?: Record<string, string | number>,
): string {
  const locale = isUiLanguage(language) ? language : "en";
  const text = UI_CATALOGS[locale][key] ?? UI_CATALOGS.en[key] ?? key;
  if (!variables) return text;
  return text.replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : placeholder,
  );
}
