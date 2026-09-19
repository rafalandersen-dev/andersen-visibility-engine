import { CONTENT_LANGUAGE_OPTIONS } from "../lib/content-languages";

/** Active interface languages. Kept free of catalog imports so public pages can
 * state the current list without bundling every dictionary. */
export const UI_LANGUAGE_CODES = ["en", "pl", "sv", "da"] as const;

/** English names of the active interface languages, e.g. "English, Polish, Swedish and Danish". */
export function uiLanguageListEnglish() {
  const names = UI_LANGUAGE_CODES.map(
    (code) => CONTENT_LANGUAGE_OPTIONS.find((option) => option.value === code)!.label,
  );
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}
