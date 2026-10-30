/**
 * Locale / market route metadata.
 *
 * The marketing site ships one page per market (`/dk`, `/se`, `/pl`, `/eu`,
 * `/uk`) plus the global English root. Two different things derive from this
 * table and must not be conflated:
 *
 *   1. every market route needs a correct `<html lang>`;
 *   2. only routes that are genuinely a *different language version of the same
 *      page* belong in the reciprocal hreflang group.
 *
 * `/eu` is a real market a visitor can pick, with its own content and its own
 * self-canonical — but it is not a separate language version of `/`. Both are
 * generic English, and the old `en-150` ("English, Europe") annotation claimed a
 * regional targeting the page does not implement, leaving two competing generic
 * English alternates in one group. So `/eu` carries no hreflang, stays out of
 * the group and is still listed in the sitemap under its own URL, while `/`
 * remains the single generic `en` and the `x-default`.
 */

export const SITE_ORIGIN = "https://milogrowth.com";

export interface LocaleRoute {
  /** Route path, as served. */
  path: string;
  /** Value for the `lang` attribute on <html>. */
  lang: string;
  /**
   * Value for rel="alternate" hreflang, or `null` for a market page that is not
   * part of the reciprocal group (see the note above).
   */
  hreflang: string | null;
}

/** Every market route, for `<html lang>` and sitemap priority. */
export const LOCALE_ROUTES: LocaleRoute[] = [
  { path: "/", lang: "en", hreflang: "en" },
  { path: "/uk", lang: "en-GB", hreflang: "en-GB" },
  { path: "/eu", lang: "en", hreflang: null },
  { path: "/dk", lang: "da", hreflang: "da-DK" },
  { path: "/se", lang: "sv", hreflang: "sv-SE" },
  { path: "/pl", lang: "pl", hreflang: "pl-PL" },
];

/** A market route that is part of the reciprocal hreflang group. */
export interface HreflangRoute extends LocaleRoute {
  hreflang: string;
}

/**
 * The supported alternates. Every page in this group lists the whole group
 * (including itself) plus x-default, so the annotations are reciprocal.
 */
export const HREFLANG_ROUTES: HreflangRoute[] = LOCALE_ROUTES.filter(
  (locale): locale is HreflangRoute => locale.hreflang !== null,
);

/** Normalize a pathname (drop trailing slash except for the root). */
function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** `<html lang>` for a given pathname; defaults to English. */
export function htmlLangForPath(pathname: string): string {
  const path = normalizePath(pathname);
  return LOCALE_ROUTES.find((l) => l.path === path)?.lang ?? "en";
}

/** Whether a pathname belongs to the reciprocal hreflang group. */
export function isHreflangRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  return HREFLANG_ROUTES.some((l) => l.path === path);
}

/** Absolute URL for a market route path. */
export function localeHref(path: string): string {
  return `${SITE_ORIGIN}${path === "/" ? "/" : path}`;
}

/**
 * Reciprocal hreflang alternates for the supported group, including x-default
 * (the global English root).
 *
 * Only spread this into a route that `isHreflangRoute` accepts: a page outside
 * the group that emits the group would claim a membership it is not part of.
 */
export function hreflangLinks(): Array<{ rel: string; hrefLang: string; href: string }> {
  return [
    ...HREFLANG_ROUTES.map((l) => ({
      rel: "alternate",
      hrefLang: l.hreflang,
      href: localeHref(l.path),
    })),
    { rel: "alternate", hrefLang: "x-default", href: localeHref("/") },
  ];
}
