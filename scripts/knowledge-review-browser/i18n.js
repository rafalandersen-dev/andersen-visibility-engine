import { FI_STAGED_CATALOG } from "../../src/i18n/staged/fi";
export const locale = __REVIEW_LOCALE__;
export const t = (key, variables) => {
  if (locale === "keys") return key;
  const value = FI_STAGED_CATALOG[key];
  if (value === undefined) throw Error(`Missing Finnish translation: ${key}`);
  return value.replace(/\{([^{}]+)\}/g, (placeholder, name) =>
    variables && Object.prototype.hasOwnProperty.call(variables, name)
      ? String(variables[name])
      : placeholder,
  );
};
export const useT = () => t;
export const useAppLanguage = () => (locale === "fi" ? "fi" : "en");
