import { FI_STAGED_CATALOG } from "../../src/i18n/staged/fi";
import { CS_STAGED_CATALOG } from "../../src/i18n/staged/cs";
import { SK_STAGED_CATALOG } from "../../src/i18n/staged/sk";
export const locale = __REVIEW_LOCALE__;
export const t = (key, variables) => {
  if (locale === "keys") return key;
  const value = { cs: CS_STAGED_CATALOG, fi: FI_STAGED_CATALOG, sk: SK_STAGED_CATALOG }[locale][
    key
  ];
  if (value === undefined) throw Error(`Missing ${locale} translation: ${key}`);
  return value.replace(/\{([^{}]+)\}/g, (placeholder, name) =>
    variables && Object.prototype.hasOwnProperty.call(variables, name)
      ? String(variables[name])
      : placeholder,
  );
};
export const useT = () => t;
export const useAppLanguage = () => (locale === "keys" ? "en" : locale);
