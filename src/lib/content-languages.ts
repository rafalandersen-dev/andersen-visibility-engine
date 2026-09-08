/** Canonical article languages. App translations and billing markets are
 * separate settings; adding an article language does not change either.
 * EU list verified 2026-09-08: https://european-union.europa.eu/principles-countries-history/languages_en
 */
export const CONTENT_LANGUAGE_OPTIONS = [
  { value: "bg", label: "Bulgarian", native: "Български" },
  { value: "hr", label: "Croatian", native: "Hrvatski" },
  { value: "cs", label: "Czech", native: "Čeština" },
  { value: "da", label: "Danish", native: "Dansk" },
  { value: "nl", label: "Dutch", native: "Nederlands" },
  { value: "en", label: "English", native: "English" },
  { value: "et", label: "Estonian", native: "Eesti" },
  { value: "fi", label: "Finnish", native: "Suomi" },
  { value: "fr", label: "French", native: "Français" },
  { value: "de", label: "German", native: "Deutsch" },
  { value: "el", label: "Greek", native: "Ελληνικά" },
  { value: "hu", label: "Hungarian", native: "Magyar" },
  { value: "ga", label: "Irish", native: "Gaeilge" },
  { value: "it", label: "Italian", native: "Italiano" },
  { value: "lv", label: "Latvian", native: "Latviešu" },
  { value: "lt", label: "Lithuanian", native: "Lietuvių" },
  { value: "mt", label: "Maltese", native: "Malti" },
  { value: "pl", label: "Polish", native: "Polski" },
  { value: "pt", label: "Portuguese", native: "Português" },
  { value: "ro", label: "Romanian", native: "Română" },
  { value: "sk", label: "Slovak", native: "Slovenčina" },
  { value: "sl", label: "Slovenian", native: "Slovenščina" },
  { value: "es", label: "Spanish", native: "Español" },
  { value: "sv", label: "Swedish", native: "Svenska" },
] as const;

export type ContentLanguageCode = (typeof CONTENT_LANGUAGE_OPTIONS)[number]["value"];
export type ContentLanguage = (typeof CONTENT_LANGUAGE_OPTIONS)[number]["label"];
// Non-empty tuple for shared Zod enums; derived from the same registry.
export const CONTENT_LANGUAGES = CONTENT_LANGUAGE_OPTIONS.map((option) => option.label) as [
  ContentLanguage,
  ...ContentLanguage[],
];

export function isContentLanguage(value: unknown): value is ContentLanguage {
  return CONTENT_LANGUAGE_OPTIONS.some((option) => option.label === value);
}

const normalize = (value: string) =>
  value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const legacyAliases: Record<string, ContentLanguage> = {
  svensk: "Swedish",
  sverige: "Swedish",
  sweden: "Swedish",
  polsk: "Polish",
  polska: "Polish",
  poland: "Polish",
  danmark: "Danish",
  denmark: "Danish",
  engelsk: "English",
  angielski: "English",
};

/** Exact names, native names, ISO codes and ordinary regional language tags.
 * No fuzzy prefix matching: Slovak and Slovenian must remain distinct.
 */
export function resolveContentLanguage(value: unknown): ContentLanguage | undefined {
  if (typeof value !== "string" || value.length > 100) return;
  const key = normalize(value);
  const code = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/.test(key) ? key.split("-")[0] : key;
  return (
    CONTENT_LANGUAGE_OPTIONS.find(
      (option) =>
        option.value === code ||
        normalize(option.label) === key ||
        normalize(option.native) === key,
    )?.label ?? (Object.hasOwn(legacyAliases, key) ? legacyAliases[key] : undefined)
  );
}

export function contentLanguageName(code: ContentLanguageCode): ContentLanguage {
  return resolveContentLanguage(code) ?? "English";
}

export function projectContentLanguage(project: {
  primaryContentLanguage?: unknown;
  primaryLanguage?: unknown;
}): ContentLanguage {
  return (
    resolveContentLanguage(project.primaryContentLanguage) ??
    resolveContentLanguage(project.primaryLanguage) ??
    "English"
  );
}

/** An explicit language edit updates both persisted representations. */
export function contentLanguagePatch(language: ContentLanguage) {
  const option = CONTENT_LANGUAGE_OPTIONS.find((item) => item.label === language);
  if (!option) throw new Error("Choose a supported content language.");
  return { primaryLanguage: option.label, primaryContentLanguage: option.value };
}
