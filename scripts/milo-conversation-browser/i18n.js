import { UI_CATALOGS } from "../../src/i18n/catalogs";
export const locale = __MILO_CONVERSATION_LOCALE__;
export function t(key, variables = {}) {
  const text = UI_CATALOGS[locale][key];
  if (!text) throw new Error(`Missing ${locale} translation: ${key}`);
  return text.replace(/\{([^{}]+)\}/g, (match, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : match,
  );
}
export const useT = () => t;
export const useAppLanguage = () => locale;
export const getUiLocaleOverride = () => locale;
export const setUiLocaleOverride = () => {
  throw new Error("Locale settings are outside this local fixture.");
};
