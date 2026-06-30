/**
 * Milo Growth — lightweight i18n (no dependency).
 *
 * App UI language = active project's `appLanguage` (fallback English). Content
 * generation language is separate (`primaryContentLanguage`) and handled in the
 * AI prompt layer, not here.
 *
 * - English fallback for unknown language and for any missing key.
 * - Never throws: a missing key returns the key string itself.
 */
import { useStore } from "@/lib/store";
import type { OnboardingLanguage } from "@/lib/types";
import { en } from "./en";
import { pl } from "./pl";
import { sv } from "./sv";
import { da } from "./da";

type Dict = Record<string, string>;
const DICTS: Record<OnboardingLanguage, Dict> = { en, pl, sv, da };

function isSupported(lang: unknown): lang is OnboardingLanguage {
  return lang === "en" || lang === "pl" || lang === "sv" || lang === "da";
}

export function translate(
  lang: OnboardingLanguage | undefined,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const l = isSupported(lang) ? lang : "en";
  let s = DICTS[l][key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

/** The active project's app language (English fallback). Reactive to store changes. */
export function useAppLanguage(): OnboardingLanguage {
  return useStore((s) => {
    const p = s.projects.find((x) => x.id === s.activeProjectId) ?? s.projects[0];
    return isSupported(p?.appLanguage) ? p!.appLanguage! : "en";
  });
}

/** Translation function bound to the active app language. */
export function useT() {
  const lang = useAppLanguage();
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
