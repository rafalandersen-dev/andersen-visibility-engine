import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { beforeEach, expect, it, vi } from "vitest";
import { HREFLANG_ROUTES, LOCALE_ROUTES, SITE_ORIGIN, localeHref } from "./locales";
import { MARKETS } from "./markets";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "./types";

/**
 * Public discoverability contract for the marketing routes: one honest
 * canonical per page, one reciprocal hreflang group across the supported
 * markets in both the HTML head and the sitemap, and a resource link to the
 * English guide that declares its language.
 *
 * The sitemap is read back through a real XML parser and the rendered pages
 * through a real HTML parser, so a malformed document fails here rather than
 * passing a substring search.
 */

const state = vi.hoisted(() => ({ locale: "en" as OnboardingLanguage }));
vi.mock("@/hooks/use-auth-language", () => ({
  useAuthLanguage: () => ({
    language: state.locale,
    chooseLanguage: () => undefined,
    t: (key: string, vars?: Record<string, string | number>) => translate(state.locale, key, vars),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => () => undefined,
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    search?: unknown;
  }) =>
    createElement(
      "a",
      { ...rest, href: to, "data-search": search ? JSON.stringify(search) : undefined },
      children,
    ),
}));
import { Route as Home } from "@/routes/index";
import { Route as Uk } from "@/routes/uk";
import { Route as Dk } from "@/routes/dk";
import { Route as Se } from "@/routes/se";
import { Route as Pl } from "@/routes/pl";
import { Route as Eu } from "@/routes/eu";
import { Route as Beta } from "@/routes/beta";
import { Route as CaseStudies } from "@/routes/case-studies";
import { Route as Audit } from "@/routes/free-ai-visibility-audit";
import { Route as Guide } from "@/routes/blog.local-seo-guide";
import { Route as Sitemap } from "@/routes/sitemap[.]xml";

type Tag = Record<string, string>;
type Head = {
  meta?: Tag[];
  links?: Tag[];
  scripts?: { type?: string; children: string }[];
};
type RouteLike = {
  options: { head: (context?: unknown) => Head; component?: ComponentType };
};
const head = (route: unknown, context?: unknown): Head =>
  (route as RouteLike).options.head(context);
const render = (route: unknown) =>
  renderToStaticMarkup(createElement((route as RouteLike).options.component as ComponentType));
const canonicals = (page: Head) =>
  (page.links ?? []).filter((link) => link.rel === "canonical").map((link) => link.href);
const alternates = (page: Head) =>
  (page.links ?? [])
    .filter((link) => link.rel === "alternate")
    .map((link) => ({ hrefLang: link.hrefLang, href: link.href }));
const metas = (page: Head, attribute: "name" | "property", value: string) =>
  (page.meta ?? [])
    .filter((tag) => tag[attribute] === value)
    .map((tag) => tag.content)
    .filter((content) => content !== undefined);
const titles = (page: Head) =>
  (page.meta ?? []).filter((tag) => "title" in tag).map((tag) => tag.title);

/** Anchors of a rendered page, read from the parsed HTML tree. */
function anchors(html: string) {
  const found: { href: string; hreflang: string; lang: string; text: string }[] = [];
  const pending: DefaultTreeAdapterMap["childNode"][] = [...parseFragment(html).childNodes];
  while (pending.length) {
    const node = pending.pop()!;
    if ("tagName" in node && node.tagName === "a") {
      const attr = (name: string) => node.attrs.find((a) => a.name === name)?.value ?? "";
      found.push({
        href: attr("href"),
        hreflang: attr("hreflang"),
        lang: attr("lang"),
        text: text(node),
      });
    }
    if ("childNodes" in node) for (const child of node.childNodes) pending.push(child);
  }
  return found;
}

function text(node: DefaultTreeAdapterMap["childNode"]): string {
  const pending: DefaultTreeAdapterMap["childNode"][] = [node];
  const chunks: string[] = [];
  while (pending.length) {
    const item = pending.pop()!;
    if ("value" in item && item.nodeName === "#text") chunks.push(String(item.value));
    else if ("childNodes" in item)
      for (let i = item.childNodes.length - 1; i >= 0; i--) pending.push(item.childNodes[i]);
  }
  return chunks.join("").replace(/\s+/g, " ").trim();
}

/** `<url>` entries of the generated sitemap, via a namespace-aware XML parse. */
async function sitemapEntries() {
  const response = await (
    Sitemap as unknown as {
      options: { server: { handlers: { GET: () => Promise<Response> } } };
    }
  ).options.server.handlers.GET();
  expect(response.headers.get("Content-Type")).toBe("application/xml");
  const xml = await response.text();

  const XHTML = "http://www.w3.org/1999/xhtml";
  const SITEMAP = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const entries: { loc: string; alternates: { hreflang: string; href: string }[] }[] = [];
  const stack: SaxesTagNS[] = [];
  let collecting = false;
  let value = "";
  const parser = new SaxesParser({ xmlns: true });
  parser.on("error", (error) => {
    throw error;
  });
  parser.on("opentag", (tag) => {
    stack.push(tag);
    if (stack.length === 1) {
      expect([tag.uri, tag.local]).toEqual([SITEMAP, "urlset"]);
    }
    if (stack.length === 2 && tag.uri === SITEMAP && tag.local === "url")
      entries.push({ loc: "", alternates: [] });
    const entry = entries[entries.length - 1];
    if (stack.length === 3 && entry) {
      if (tag.uri === SITEMAP && tag.local === "loc") {
        collecting = true;
        value = "";
      }
      if (tag.uri === XHTML && tag.local === "link")
        entry.alternates.push({
          hreflang: tag.attributes.hreflang?.value ?? "",
          href: tag.attributes.href?.value ?? "",
        });
    }
  });
  parser.on("text", (chunk) => {
    if (collecting) value += chunk;
  });
  parser.on("closetag", () => {
    if (collecting && stack.length === 3) {
      entries[entries.length - 1].loc = value.trim();
      collecting = false;
    }
    stack.pop();
  });
  parser.write(xml).close();
  return entries;
}

const SUPPORTED = ["/", "/uk", "/dk", "/se", "/pl"] as const;
const MARKET_PAGES: [string, unknown][] = [
  ["/", Home],
  ["/uk", Uk],
  ["/dk", Dk],
  ["/se", Se],
  ["/pl", Pl],
];
const META_PAGES: [string, unknown][] = [
  ["/beta", Beta],
  ["/case-studies", CaseStudies],
  ["/free-ai-visibility-audit", Audit],
  ["/blog/local-seo-guide", Guide],
];
/** The group every supported page must publish, as (hreflang, href) pairs. */
const expectedGroup = [
  ...HREFLANG_ROUTES.map((locale) => ({
    hrefLang: locale.hreflang,
    href: localeHref(locale.path),
  })),
  { hrefLang: "x-default", href: localeHref("/") },
];

beforeEach(() => {
  state.locale = "en";
});

it("publishes one reciprocal alternate group across the supported market pages", () => {
  expect(HREFLANG_ROUTES.map((locale) => locale.path)).toEqual([...SUPPORTED]);
  for (const [path, route] of MARKET_PAGES) {
    const page = head(route);
    expect(canonicals(page)).toEqual([localeHref(path)]);
    const group = alternates(page);
    // Identical on every member, so the annotations are reciprocal, and each
    // member (including this page itself) appears exactly once.
    expect(group).toEqual(expectedGroup);
    expect(group.filter((a) => a.hrefLang === "en")).toHaveLength(1);
    expect(group.filter((a) => a.hrefLang === "x-default")).toHaveLength(1);
    expect(group.map((a) => a.hrefLang)).not.toContain("en-150");
    expect(group.filter((a) => a.href === localeHref(path)).length).toBeGreaterThan(0);
    expect(new Set(group.map((a) => a.href))).toEqual(
      new Set(SUPPORTED.map((member) => localeHref(member))),
    );
  }
});

it("keeps /eu a selectable market with its own canonical and no one-sided group", () => {
  const page = head(Eu);
  expect(canonicals(page)).toEqual([localeHref("/eu")]);
  expect(alternates(page)).toEqual([]);
  // Market content and address are untouched by the hreflang correction.
  expect(titles(page)).toEqual([MARKETS.eu.title]);
  expect(metas(page, "name", "description")).toEqual([MARKETS.eu.metaDescription]);
  expect(LOCALE_ROUTES.find((locale) => locale.path === "/eu")?.lang).toBe("en");
});

it.each(META_PAGES)(
  "%s declares one canonical and its own share metadata without URL parameters",
  (path, route) => {
    const page = head(route);
    const url = `${SITE_ORIGIN}${path}`;
    expect(canonicals(page)).toEqual([url]);
    expect(metas(page, "property", "og:url")).toEqual([url]);
    // Not part of the market group: no alternates to contradict the canonical.
    expect(alternates(page)).toEqual([]);

    const [documentTitle] = titles(page);
    const ogTitle = metas(page, "property", "og:title");
    const ogDescription = metas(page, "property", "og:description");
    const description = metas(page, "name", "description");
    expect(ogTitle).toHaveLength(1);
    expect(ogDescription).toHaveLength(1);
    expect(description).toHaveLength(1);
    expect(documentTitle).toContain(ogTitle[0]);
    expect(ogDescription[0]).not.toBe(ogTitle[0]);
    expect(ogDescription[0].length).toBeGreaterThan(40);
    for (const value of [...canonicals(page), ...metas(page, "property", "og:url")]) {
      expect(value.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
      expect(value).not.toMatch(/[?#]/);
    }

    // A visited URL carrying query parameters cannot reach canonical or og:url.
    expect(
      head(route, {
        params: { ref: "newsletter" },
        search: { utm_source: "newsletter", source: "beta" },
        location: { href: `${url}?utm_source=newsletter`, searchStr: "?utm_source=newsletter" },
      }),
    ).toEqual(page);
  },
);

it("gives each public page share metadata of its own", () => {
  const described = [...MARKET_PAGES, ["/eu", Eu] as [string, unknown], ...META_PAGES].map(
    ([path, route]) => ({ path, page: head(route) }),
  );
  const canonical = described.map(({ page }) => canonicals(page)[0]);
  expect(new Set(canonical).size).toBe(canonical.length);
  const share = META_PAGES.map(([, route]) => metas(head(route), "property", "og:description")[0]);
  expect(new Set(share).size).toBe(share.length);
  const documentTitles = described.map(({ page }) => titles(page)[0]);
  expect(new Set(documentTitles).size).toBe(documentTitles.length);
});

it("dates the guide by review only, without an invented author or publication date", () => {
  const page = head(Guide);
  const data = JSON.parse(page.scripts?.[0].children ?? "{}") as Record<string, unknown>;
  expect(data["@type"]).toBe("Article");
  expect(data.inLanguage).toBe("en");
  expect(data.datePublished).toBeUndefined();
  expect(data.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(new Date(String(data.dateModified)).getTime()).toBeLessThanOrEqual(Date.now());
  expect((data.author as { "@type": string })["@type"]).toBe("Organization");
  expect(data.mainEntityOfPage).toBe(`${SITE_ORIGIN}/blog/local-seo-guide`);
});

it("links the guide from the home footer as an English resource in every UI language", () => {
  for (const locale of ["en", "pl", "sv", "da"] as OnboardingLanguage[]) {
    state.locale = locale;
    const guideLinks = anchors(render(Home)).filter(
      (link) => link.href === "/blog/local-seo-guide",
    );
    expect(guideLinks).toHaveLength(1);
    const [link] = guideLinks;
    // The guide exists only in English: both the reader and the crawler are told.
    expect(link.lang).toBe("en");
    expect(link.hreflang).toBe("en");
    expect(link.text).toMatch(/English/);
    expect(link.text.length).toBeGreaterThan(0);
  }
});

it("keeps the guide's own claims checkable against linked official sources", () => {
  const html = render(Guide);
  const external = anchors(html).filter((link) => link.href.startsWith("https://"));
  expect(external.length).toBeGreaterThanOrEqual(4);
  for (const link of external) {
    // A source list is only useful if each entry says what it documents.
    expect(link.text.length).toBeGreaterThan(10);
    expect(new URL(link.href).hostname).toMatch(/\.google\.com$/);
  }
  for (const host of ["support.google.com", "developers.google.com"])
    expect(external.some((link) => new URL(link.href).hostname === host)).toBe(true);

  const body = text(parseFragment(html).childNodes[0]) + " " + html;
  // Corrected claims must not come back: absolute ranking promises, the exact
  // legal name instruction, a category per service, or rewarded activity.
  for (const claim of [
    /single highest/i,
    /the better it ranks/i,
    /rewards active profiles/i,
    /exact legal business name/i,
    /secondary categories for each service/i,
  ])
    expect(body).not.toMatch(claim);
});

it("lists every market in the sitemap and annotates only the supported group", async () => {
  const entries = await sitemapEntries();
  const locs = entries.map((entry) => entry.loc);
  expect(new Set(locs).size).toBe(locs.length);
  for (const locale of LOCALE_ROUTES) expect(locs).toContain(localeHref(locale.path));
  for (const path of ["/pricing", "/beta", "/case-studies", "/blog/local-seo-guide"])
    expect(locs).toContain(`${SITE_ORIGIN}${path}`);
  expect(locs).not.toContain(`${SITE_ORIGIN}/sitemap.xml`);

  const annotated = entries.filter((entry) => entry.alternates.length > 0);
  expect(annotated.map((entry) => entry.loc).sort()).toEqual(
    SUPPORTED.map((path) => localeHref(path)).sort(),
  );
  for (const entry of annotated) {
    expect(entry.alternates).toEqual(
      expectedGroup.map((link) => ({ hreflang: link.hrefLang, href: link.href })),
    );
    expect(entry.alternates.filter((a) => a.hreflang === "en")).toHaveLength(1);
    expect(entry.alternates.filter((a) => a.hreflang === "x-default")).toHaveLength(1);
    for (const alternate of entry.alternates) {
      expect(alternate.hreflang).toMatch(/^(x-default|[a-z]{2,3}(-[A-Z]{2})?)$/);
      expect(alternate.href.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
    }
  }
  // /eu keeps its URL but claims no membership.
  const eu = entries.find((entry) => entry.loc === localeHref("/eu"));
  expect(eu?.alternates).toEqual([]);
});
