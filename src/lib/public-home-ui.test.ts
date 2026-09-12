import { createElement, type ComponentType, type ReactNode } from "react";
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
    t: (key: string, vars?: Record<string, string | number>) => translate(state.locale, key, vars),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to, search }: { children: ReactNode; to: string; search?: unknown }) =>
    createElement(
      "a",
      { href: to, "data-search": search ? JSON.stringify(search) : undefined },
      children,
    ),
}));
vi.mock("@/lib/billing", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing")>();
  return {
    ...original,
    PLAN_LIMITS: {
      ...original.PLAN_LIMITS,
      agency: { ...original.PLAN_LIMITS.agency, maxProjects: 17 },
    },
  };
});
import { Route } from "@/routes/index";
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
const destinations = (html: string) =>
  [...html.matchAll(/(?:href|data-search|src)="[^"]*"/g)].map((match) => match[0]);
const escaped = (text: string) =>
  renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
beforeEach(() => {
  state.locale = "en";
  vi.clearAllMocks();
});

it.each(UI_LANGUAGE_CODES)(
  "home %s shares one locale, preserves destinations and derives every Agency limit",
  (language) => {
    const baseline = render();
    state.locale = language;
    const html = render();
    expect(destinations(html)).toEqual(destinations(baseline));
    expect(html).toContain(`<main lang="${language}"`);
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain(`value="${language}" selected=""`);
    expect(html).not.toContain('value="fr"');
    expect(html).not.toMatch(/publicHome\.[A-Za-z]|\{count\}|\{number\}/);
    for (const key of ["heroBody", "agencyProjects", "pricingHeading", "faqProjectsA"])
      expect(html).toContain(escaped(translate(language, `publicHome.${key}`, { count: 17 })));
    for (const key of [
      "nav",
      "heroLead",
      "workspaceAlt",
      "publishBody",
      "measureBody",
      "faqCancelA",
      "backlinksBody",
      "footerBody",
    ])
      expect(html).toContain(escaped(translate(language, `publicHome.${key}`)));
    expect(state.choose).not.toHaveBeenCalled();
  },
);

it("keeps crawler FAQ English and truthful when the device presentation language changes", () => {
  const head = Route.options.head as () => { scripts: Array<{ children: string }> };
  const english = head();
  state.locale = "pl";
  expect(head()).toEqual(english);
  const faq = JSON.parse(english.scripts[0].children).mainEntity;
  expect(faq).toHaveLength(6);
  expect(faq[5].acceptedAnswer.text).toBe(
    translate("en", "publicHome.faqProjectsA", { count: 17 }),
  );
  expect(faq[2].acceptedAnswer.text).toBe(translate("en", "publicHome.faqPublishA"));
});
