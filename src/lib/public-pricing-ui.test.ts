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
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-market": value }, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectValue: () => null,
  SelectContent: ({ children, lang }: { children: ReactNode; lang: string }) =>
    createElement("div", { "data-menu-language": lang }, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-market-option": value }, children),
}));
import { Route } from "@/routes/pricing";
import {
  PLAN_IDS,
  PLAN_META,
  PLAN_LIMITS,
  planPrice,
  addOnPrice,
  formatMoney,
} from "@/lib/billing";
import { billingFeatureLabel, billingMarketLabel } from "@/lib/billing-presentation";
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
const escaped = (text: string) =>
  renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
beforeEach(() => {
  state.locale = "en";
  vi.clearAllMocks();
});
it.each(UI_LANGUAGE_CODES)(
  "pricing %s preserves billing market values, amounts, destinations and canonical limits",
  (language) => {
    const baseline = render();
    state.locale = language;
    const html = render();
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>).)*<button\b/s);
    expect([...html.matchAll(/href="[^"]*"/g)].map((m) => m[0])).toEqual(
      [...baseline.matchAll(/href="[^"]*"/g)].map((m) => m[0]),
    );
    expect(html).toContain(`<main lang="${language}"`);
    expect(html).toContain(`data-menu-language="${language}"`);
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain(`value="${language}" selected=""`);
    expect(html).not.toContain('value="fr"');
    expect(html).not.toMatch(/publicPricing\.[A-Za-z]|\{count\}/);
    expect(html).toContain('data-market="European Union"');
    for (const market of [
      "Poland",
      "Sweden",
      "Denmark",
      "United Kingdom",
      "European Union",
    ] as const) {
      expect(html).toContain(`data-market-option="${market}"`);
      expect(html).toContain(
        escaped(billingMarketLabel(market, (key) => translate(language, key))),
      );
    }
    for (const id of PLAN_IDS) {
      expect(html).toContain(escaped(formatMoney(planPrice("European Union", id), "EUR")));
      for (const feature of PLAN_META[id].features)
        expect(html).toContain(
          escaped(billingFeatureLabel(feature, (key) => translate(language, key))),
        );
    }
    for (const addon of ["assistedSetup", "monthlyCare"] as const)
      expect(html).toContain(escaped(formatMoney(addOnPrice("European Union", addon), "EUR")));
    for (const key of ["intro", "projects", "upTo"])
      expect(html).toContain(escaped(translate(language, `publicPricing.${key}`, { count: 17 })));
    for (const key of ["hold", "manageBody", "activationHold", "purchasesHold", "eligibility"])
      expect(html).toContain(escaped(translate(language, `publicPricing.${key}`)));
    expect(state.choose).not.toHaveBeenCalled();
  },
);

it.each(UI_LANGUAGE_CODES)(
  "pricing %s exposes every comparison value with associated headers",
  (language) => {
    state.locale = language;
    const table = render().match(/<table[\s\S]*?<\/table>/)![0];
    expect(table.match(/<th scope="col"/g)).toHaveLength(PLAN_IDS.length + 1);
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1);
    expect(rows).toHaveLength(7);
    for (const [rowIndex, row] of rows.entries()) {
      expect(row[1]).toContain('<th scope="row"');
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      expect(cells).toHaveLength(PLAN_IDS.length);
      for (const [index, cell] of cells.entries()) {
        const limits = PLAN_LIMITS[PLAN_IDS[index]];
        const values = [
          limits.maxProjects,
          limits.monthlyContentGenerations,
          limits.monthlyMiloScores,
          limits.publishingEnabled,
          limits.analyticsEnabled && limits.gscLiteEnabled,
          limits.imageGenerationEnabled,
          limits.aiEvaluationEnabled,
        ];
        const value = values[rowIndex];
        if (typeof value === "boolean") {
          expect(cell[1]).toContain(
            `<span class="sr-only">${escaped(
              translate(language, value ? "publicPricing.included" : "publicPricing.notIncluded"),
            )}</span>`,
          );
          expect(cell[1]).toContain('aria-hidden="true"');
          if (value) expect(cell[1]).toMatch(/<svg[^>]*aria-hidden="true"/);
          else expect(cell[1]).toContain('<span aria-hidden="true">—</span>');
        } else {
          expect(cell[1]).toContain(String(value));
          expect(cell[1]).not.toContain("sr-only");
        }
      }
    }
  },
);
