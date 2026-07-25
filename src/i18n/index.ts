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

const UI_LOCALE_KEY = "milo.uiLocale";

/**
 * Device-level UI-locale override (2026-07-25). The UI language used to be the
 * ACTIVE PROJECT's appLanguage — switching from a Swedish project to a Polish
 * one flipped the whole interface mid-session. The device override wins when
 * set; the project appLanguage remains the default for devices that never
 * chose. Stable per page load — the picker reloads on change (a language
 * switch is rare, and a reload keeps every mounted string consistent).
 */
export function getUiLocaleOverride(): OnboardingLanguage | null {
  try {
    const v = window.localStorage.getItem(UI_LOCALE_KEY);
    return isSupported(v) ? v : null;
  } catch {
    return null;
  }
}

export function setUiLocaleOverride(lang: OnboardingLanguage | null): void {
  try {
    if (lang) window.localStorage.setItem(UI_LOCALE_KEY, lang);
    else window.localStorage.removeItem(UI_LOCALE_KEY);
  } catch {
    /* private mode — the project default applies */
  }
  window.location.reload();
}

/** The UI language: device override first, else the active project's appLanguage. */
export function useAppLanguage(): OnboardingLanguage {
  const projectLang = useStore((s) => {
    const p = s.projects.find((x) => x.id === s.activeProjectId) ?? s.projects[0];
    return isSupported(p?.appLanguage) ? p!.appLanguage! : "en";
  });
  if (typeof window === "undefined") return projectLang;
  return getUiLocaleOverride() ?? projectLang;
}

/** Translation function bound to the active app language. */
export function useT() {
  const lang = useAppLanguage();
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
