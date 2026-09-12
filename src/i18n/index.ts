/** React bindings for the device UI preference; content, email and market stay separate. */
import { useStore } from "@/lib/store";
import type { OnboardingLanguage } from "@/lib/types";
import { isUiLanguage } from "./catalogs";
import { translate } from "./translate";
export { translate } from "./translate";

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
    return isUiLanguage(v) ? v : null;
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
    return isUiLanguage(p?.appLanguage) ? p!.appLanguage! : "en";
  });
  if (typeof window === "undefined") return projectLang;
  return getUiLocaleOverride() ?? projectLang;
}

/** Translation function bound to the active app language. */
export function useT() {
  const lang = useAppLanguage();
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
