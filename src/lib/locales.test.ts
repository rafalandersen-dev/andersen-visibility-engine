import { expect, it } from "vitest";
import {
  HREFLANG_ROUTES,
  LOCALE_ROUTES,
  SITE_ORIGIN,
  hreflangLinks,
  htmlLangForPath,
  isHreflangRoute,
  localeHref,
} from "./locales";

/**
 * A usable hreflang value: a language subtag, optionally with a two-letter
 * country region. This rejects both an invented region ("en-150" — a UN M.49
 * area Google does not accept for hreflang) and a route accidentally annotated
 * with a missing value.
 */
const HREFLANG = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const primary = (tag: string) => tag.split("-")[0].toLowerCase();

it("keeps every market route addressable with its own content language", () => {
  const paths = LOCALE_ROUTES.map((l) => l.path);
  expect(new Set(paths).size).toBe(paths.length);
  for (const locale of LOCALE_ROUTES) {
    expect(locale.path.startsWith("/")).toBe(true);
    expect(locale.lang).toMatch(HREFLANG);
    expect(htmlLangForPath(locale.path)).toBe(locale.lang);
    expect(htmlLangForPath(`${locale.path}/`)).toBe(locale.lang);
  }
  // A page outside the table is the global English site, never a locale guess.
  expect(htmlLangForPath("/pricing")).toBe("en");
  expect(htmlLangForPath("")).toBe("en");
});

it("annotates the supported group with real language targets and one generic English", () => {
  expect(HREFLANG_ROUTES.length).toBeGreaterThan(1);
  const tags = HREFLANG_ROUTES.map((l) => l.hreflang);
  expect(new Set(tags).size).toBe(tags.length);
  for (const locale of HREFLANG_ROUTES) {
    expect(locale.hreflang).toMatch(HREFLANG);
    // The annotation and the document language must describe the same language.
    expect(primary(locale.hreflang)).toBe(primary(locale.lang));
  }
  // Two members claiming the same language would compete for the same queries.
  const langs = HREFLANG_ROUTES.map((l) => l.lang);
  expect(new Set(langs).size).toBe(langs.length);
  // Exactly one region-less alternate, and it is the global root.
  const generic = HREFLANG_ROUTES.filter((l) => !l.hreflang.includes("-"));
  expect(generic.map((l) => [l.hreflang, l.path])).toEqual([["en", "/"]]);
});

it("keeps the generic European market selectable but out of the group", () => {
  const eu = LOCALE_ROUTES.find((l) => l.path === "/eu");
  expect(eu).toBeDefined();
  expect(eu?.hreflang).toBeNull();
  expect(htmlLangForPath("/eu")).toBe("en");
  expect(isHreflangRoute("/eu")).toBe(false);
  expect(isHreflangRoute("/eu/")).toBe(false);
  expect(HREFLANG_ROUTES.map((l) => l.path)).toEqual(["/", "/uk", "/dk", "/se", "/pl"]);
  for (const path of ["/", "/uk", "/dk", "/se", "/pl"]) {
    expect(isHreflangRoute(path)).toBe(true);
    expect(isHreflangRoute(`${path}/`)).toBe(true);
  }
  expect(isHreflangRoute("/pricing")).toBe(false);
});

it("emits one reciprocal group with x-default, identical for every member", () => {
  const links = hreflangLinks();
  expect(links.every((link) => link.rel === "alternate")).toBe(true);
  const tags = links.map((link) => link.hrefLang);
  expect(new Set(tags).size).toBe(tags.length);
  expect(tags).toEqual([...HREFLANG_ROUTES.map((l) => l.hreflang), "x-default"]);
  expect(tags).not.toContain("en-150");

  for (const link of links) {
    expect(link.href.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
    expect(link.href).not.toMatch(/[?#]/);
  }
  // Every member is annotated by the group it belongs to (self-reference), and
  // x-default resolves to the global root rather than a market.
  for (const locale of HREFLANG_ROUTES) {
    expect(links.filter((link) => link.href === localeHref(locale.path))).toHaveLength(
      locale.path === "/" ? 2 : 1, // the root is also the x-default target
    );
  }
  expect(links.filter((link) => link.hrefLang === "x-default")).toEqual([
    { rel: "alternate", hrefLang: "x-default", href: `${SITE_ORIGIN}/` },
  ]);
  // The helper is the whole group, so spreading it into any member page yields
  // reciprocal annotations by construction.
  expect(hreflangLinks()).toEqual(links);
});
