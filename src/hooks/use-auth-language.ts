import { useEffect, useState } from "react";
import { getUiLocaleOverride, setUiLocaleOverride, translate } from "@/i18n";
import { isUiLanguage } from "@/i18n/catalogs";
import type { OnboardingLanguage } from "@/lib/types";

/** Public authentication forms use the device choice, without reading a prior
 * workspace or reloading a page that may hold a recovery session. English on
 * the first render keeps server/client hydration consistent. */
export function useAuthLanguage() {
  const [language, setLanguage] = useState<OnboardingLanguage>("en");
  useEffect(() => {
    setLanguage(getUiLocaleOverride() ?? "en");
  }, []);

  const chooseLanguage = (value: string) => {
    if (!isUiLanguage(value)) return;
    setUiLocaleOverride(value, { reload: false });
    setLanguage(value);
  };
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  return { language, chooseLanguage, t };
}
