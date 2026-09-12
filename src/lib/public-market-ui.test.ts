import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DISPLAY_REGIONS, MARKETS, REGION_SELECTOR_LABELS, regionToBillingMarket } from "./markets";
import {
  MARKET_CURRENCY,
  PLAN_IDS,
  PLAN_META,
  planPrice,
  addOnPrice,
  formatMoney,
} from "./billing";
import { translate } from "@/i18n/translate";

const state = vi.hoisted(() => ({
  pick: undefined as undefined | ((value: string) => void),
  navigate: vi.fn(),
  store: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
    createElement("a", { ...props, href: to }, children),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => {
    state.pick = onValueChange;
    return createElement("div", { "data-region": value }, children);
  },
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) =>
    createElement("button", props, children),
  SelectValue: ({ placeholder }: { placeholder: string }) =>
    createElement("span", null, placeholder),
  SelectContent: ({ children, lang }: { children: ReactNode; lang: string }) =>
    createElement("div", { "data-menu-language": lang }, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-region-option": value }, children),
}));
import { MarketPage } from "@/components/MarketPage";
import { MarketingShell } from "@/components/MarketingShell";
const escaped = (text: string) =>
  renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
beforeEach(() => {
  vi.clearAllMocks();
  state.store.mockReset();
  vi.stubGlobal("localStorage", { setItem: state.store });
});
afterEach(() => vi.unstubAllGlobals());
it.each(DISPLAY_REGIONS)(
  "%s uses route language without device picker and preserves prices and destinations",
  (region) => {
    const config = MARKETS[region];
    const html = renderToStaticMarkup(createElement(MarketPage, { config }));
    const t = (key: string) => escaped(translate(config.lang, key));
    expect(html).toContain(`<main lang="${config.lang}"`);
    expect(html).not.toContain("<select");
    expect(html).toContain(`data-menu-language="${config.lang}"`);
    expect(html).toContain(`aria-label="${t("publicPricing.chooseRegion")}"`);
    for (const key of [
      "appShell.tagline",
      "publicPricing.regionNote",
      "publicPricing.hold",
      "publicPricing.setup",
      "publicPricing.care",
      "publicPricing.once",
      "publicPricing.month",
      "publicBeta.contentPrioritiesInPlan",
      "publicBeta.draftReviewContent",
      "publicBeta.theWordpressAndShopifyConnectorsRequireLive",
      "publicBeta.analyticsAndGscProofDependOnData",
    ])
      expect(html).toContain(t(key));
    const market = regionToBillingMarket(region);
    const currency = MARKET_CURRENCY[market];
    for (const pid of PLAN_IDS) {
      expect(html).toContain(escaped(PLAN_META[pid].name));
      expect(html).toContain(escaped(formatMoney(planPrice(market, pid), currency)));
    }
    for (const addon of ["assistedSetup", "monthlyCare"] as const)
      expect(html).toContain(escaped(formatMoney(addOnPrice(market, addon), currency)));
    expect(
      html.match(new RegExp(`href="/auth\\?source=market-beta&amp;market=${region}"`, "g")),
    ).toHaveLength(2);
    expect(html).toContain('href="mailto:support@milogrowth.com?subject=Milo%20Assisted%20Beta"');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>).)*<button\b/s);
    expect(html).toMatch(/<a[^>]*class="[^"]*h-10[^\"]*"[^>]*href="\/free-ai-visibility-audit"/);
    for (const option of DISPLAY_REGIONS) {
      expect(html).toContain(
        `data-region-option="${option}"><span lang="en">${escaped(REGION_SELECTOR_LABELS[option])}</span>`,
      );
    }
    expect(state.store).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
  },
);
it.each(DISPLAY_REGIONS)(
  "region picker stores %s and navigates without any language write",
  (region) => {
    renderToStaticMarkup(createElement(MarketPage, { config: MARKETS.se }));
    state.pick!(region);
    expect(state.store.mock.calls).toEqual([["milo_display_region", region]]);
    expect(state.navigate.mock.calls).toEqual([[{ to: `/${region}` }]]);
  },
);
it("region navigation survives unavailable device storage", () => {
  state.store.mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  renderToStaticMarkup(createElement(MarketPage, { config: MARKETS.pl }));
  state.pick!("dk");
  expect(state.navigate).toHaveBeenCalledWith({ to: "/dk" });
});
it("shell defaults to English and optional device controls retain precedence", () => {
  expect(renderToStaticMarkup(createElement(MarketingShell, { children: "body" }))).toContain(
    '<main lang="en"',
  );
  const chooseLanguage = vi.fn();
  const html = renderToStaticMarkup(
    createElement(MarketingShell, {
      children: "body",
      language: "pl",
      languageControls: { language: "da", chooseLanguage },
    }),
  );
  expect(html).toContain('<main lang="da"');
  expect(html).toContain('value="da" selected=""');
  expect(html.match(/<select/g)).toHaveLength(1);
  expect(chooseLanguage).not.toHaveBeenCalled();
});
