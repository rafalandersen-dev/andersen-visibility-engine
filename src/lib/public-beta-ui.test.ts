import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "@/lib/types";

const state = vi.hoisted(() => ({ locale: "en" as OnboardingLanguage, choose: vi.fn() }));
vi.mock("@/hooks/use-auth-language", () => ({
  useAuthLanguage: () => ({
    language: state.locale,
    chooseLanguage: state.choose,
    t: (key: string) => translate(state.locale, key),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
    createElement("a", { ...props, href: to }, children),
}));
import { Route as Beta } from "@/routes/beta";
import { Route as Demo } from "@/routes/demo-script";
import { MarketingShell } from "@/components/MarketingShell";
const render = (route: typeof Beta | typeof Demo) =>
  renderToStaticMarkup(createElement(route.options.component as ComponentType));
const links = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
const paragraphs = (html: string) =>
  [...html.matchAll(/<p class="rounded-md[^>]*>(.*?)<\/p>/g)].map((match) => match[1]);
beforeEach(() => {
  state.locale = "en";
  vi.clearAllMocks();
});

it.each(UI_LANGUAGE_CODES)(
  "beta %s retains commercial values, destinations and independent outreach",
  (language) => {
    const baseline = render(Beta);
    state.locale = language;
    const html = render(Beta);
    expect(links(html)).toEqual(links(baseline));
    expect(links(html)).toContain("/auth?source=beta");
    expect(links(html)).toContain("mailto:support@milogrowth.com?subject=Milo%20Assisted%20Beta");
    expect(paragraphs(html)).toHaveLength(4);
    expect(paragraphs(html)).toEqual(paragraphs(baseline));
    for (const value of [
      "699–1499 PLN",
      "299–599 PLN",
      "2500–5000 SEK",
      "799–1499 SEK",
      "€249–€499",
      "€79–€149",
    ])
      expect(html).toContain(value);
    expect(html).toContain(`<main lang="${language}"`);
    expect(html).toContain(`value="${language}" selected=""`);
    expect(html).not.toContain('value="fr"');
    expect(html).not.toMatch(/(?:publicBeta|betaGuide|betaScreen|shell|publicAudit)\.[A-Za-z]/);
    expect(state.choose).not.toHaveBeenCalled();
  },
);

it.each(UI_LANGUAGE_CODES)(
  "demo %s shares the language with its shell and retains action links",
  (language) => {
    const baseline = render(Demo);
    state.locale = language;
    const html = render(Demo);
    expect(links(html)).toEqual(links(baseline));
    expect(html).toContain(`<main lang="${language}"`);
    expect(html).toContain(translate(language, "publicBeta.demoScript"));
    expect(html).not.toMatch(/(?:publicBeta|betaGuide|betaScreen|shell|publicAudit)\.[A-Za-z]/);
    expect(html.match(/<li /g)).toHaveLength(16);
    expect(html).not.toContain('value="fr"');
    expect(state.choose).not.toHaveBeenCalled();
  },
);

it("keeps callers without localized content in English without a misleading language control", () => {
  state.locale = "sv";
  const html = renderToStaticMarkup(createElement(MarketingShell, { children: "Existing page" }));
  expect(html).toContain('<main lang="en"');
  expect(html).toContain("Existing page");
  expect(html).not.toContain("<select");
});
