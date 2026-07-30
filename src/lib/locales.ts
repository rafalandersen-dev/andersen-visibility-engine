/**
 * Locale / market route metadata.
 *
 * The marketing site ships one page per market (`/dk`, `/se`, `/pl`, `/eu`,
 * `/uk`) plus the global English root. Crawlers need two things from that set:
 * a correct `<html lang>` per route, and reciprocal hreflang alternates on
 * every page in the group. Both derive from this single table.
 */

export const SITE_ORIGIN = "https://milogrowth.com";

export interface LocaleRoute {
  /** Route path, as served. */
  path: string;
  /** Value for the `lang` attribute on <html>. */
  lang: string;
  /** Value for rel="alternate" hreflang. */
  hreflang: string;
}

export const LOCALE_ROUTES: LocaleRoute[] = [
  { path: "/", lang: "en", hreflang: "en" },
  { path: "/uk", lang: "en-GB", hreflang: "en-GB" },
  { path: "/eu", lang: "en", hreflang: "en-150" },
  { path: "/dk", lang: "da", hreflang: "da-DK" },
  { path: "/se", lang: "sv", hreflang: "sv-SE" },
  { path: "/pl", lang: "pl", hreflang: "pl-PL" },
];

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

/**
 * Reciprocal hreflang alternates for the market group, including x-default
 * (the global English root). Safe to spread into a route's `links`.
 */
export function hreflangLinks(): Array<{ rel: string; hrefLang: string; href: string }> {
  return [
    ...LOCALE_ROUTES.map((l) => ({
      rel: "alternate",
      hrefLang: l.hreflang,
      href: `${SITE_ORIGIN}${l.path === "/" ? "/" : l.path}`,
    })),
    { rel: "alternate", hrefLang: "x-default", href: `${SITE_ORIGIN}/` },
  ];
}
