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
import { Route } from "@/routes/case-studies";
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
const escaped = (text: string) =>
  renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
beforeEach(() => {
  state.locale = "en";
  vi.clearAllMocks();
});
it.each(UI_LANGUAGE_CODES)(
  "case studies %s retain identities, destinations and acceptance limitations",
  (language) => {
    const baseline = render();
    state.locale = language;
    const html = render();
    expect([...html.matchAll(/href="[^"]*"/g)].map((m) => m[0])).toEqual(
      [...baseline.matchAll(/href="[^"]*"/g)].map((m) => m[0]),
    );
    expect(html).toContain(`<main lang="${language}"`);
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain(`value="${language}" selected=""`);
    expect(html).not.toMatch(/value="(?:fr|de)"|publicStudies\./);
    for (const [id, name] of [
      ["synergy-massage", "Synergy Massage"],
      ["andersen-innovations", "Andersen Innovations"],
      ["si-longevity-demo", "SI Longevity"],
    ]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(name);
    }
    expect(html.match(/<article/g)).toHaveLength(3);
    for (const key of [
      "synergy.built",
      "synergy.status",
      "synergy.next",
      "andersen.status",
      "si.note",
      "intro",
      "disclaimer",
    ])
      expect(html).toContain(escaped(translate(language, `publicStudies.${key}`)));
    expect(state.choose).not.toHaveBeenCalled();
  },
);
