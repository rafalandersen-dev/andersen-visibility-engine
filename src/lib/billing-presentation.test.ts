import { describe, expect, it } from "vitest";
import {
  COUNTRY_OPTIONS,
  BILLING_MARKETS,
  PLAN_META,
  PLAN_PRICING,
  MARKET_CURRENCY,
  deriveBillingMarket,
  formatMoney,
} from "./billing";
import {
  billingCountryLabel,
  billingFeatureLabel,
  billingMarketLabel,
  formatBillingMoney,
} from "./billing-presentation";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";

describe("billing presentation keeps commercial values separate from language", () => {
  it.each(UI_LANGUAGE_CODES)(
    "%s retains every market's amount, currency and stored country",
    (locale) => {
      const before = structuredClone({
        countries: COUNTRY_OPTIONS,
        prices: PLAN_PRICING,
        plans: PLAN_META,
      });
      const t = (key: string) => translate(locale, key);
      for (const market of BILLING_MARKETS) {
        expect(billingMarketLabel(market, t)).not.toContain("billingScreen.");
        const currency = MARKET_CURRENCY[market];
        // The same 12.5 units in every market must not become a converted value or
        // lose the fractional part when only the interface language changes.
        const money = formatBillingMoney(12.5, currency, locale);
        if (locale === "en") expect(money).toBe(formatMoney(12.5, currency));
        else {
          expect(money).toContain(currency);
          expect(money).toContain("12,5");
        }
      }
      for (const country of COUNTRY_OPTIONS) {
        const market = deriveBillingMarket(country.code);
        expect(billingCountryLabel(country, locale, t)).not.toContain("billingScreen.");
        expect(deriveBillingMarket(country.code)).toBe(market);
      }
      expect({ countries: COUNTRY_OPTIONS, prices: PLAN_PRICING, plans: PLAN_META }).toEqual(
        before,
      );
    },
  );

  it("preserves existing English money, including zero and decimal values", () => {
    for (const currency of ["GBP", "EUR", "PLN", "SEK", "DKK"])
      for (const amount of [0, 69, 1499, 12.5])
        expect(formatBillingMoney(amount, currency, "en")).toBe(formatMoney(amount, currency));
  });

  it("localizes grouping and explicitly distinguishes SEK from DKK", () => {
    expect(formatBillingMoney(1499, "SEK", "sv").replace(/\s/g, " ")).toBe("1 499 SEK");
    expect(formatBillingMoney(1499, "DKK", "da").replace(/\s/g, " ")).toBe("1.499 DKK");
    expect(formatBillingMoney(249, "PLN", "pl").replace(/\s/g, " ")).toBe("249 PLN");
  });

  it("retains a safe original representation when a currency cannot be formatted", () => {
    expect(formatBillingMoney(12.5, "not-a-currency", "pl")).toBe("12.5 not-a-currency");
  });

  it("uses the selected language for country names and handles the non-ISO Other option", () => {
    const country = { code: "PL", name: "Poland" };
    expect(billingCountryLabel(country, "pl", (key) => translate("pl", key))).toBe("Polska");
    expect(billingCountryLabel(country, "sv", (key) => translate("sv", key))).toBe("Polen");
    expect(
      billingCountryLabel({ code: "OTHER", name: "Other / not listed" }, "pl", (key) =>
        translate("pl", key),
      ),
    ).toBe("Inny / brak na liście");
    expect(
      billingCountryLabel(
        { code: "not-an-iso-code", name: "Supplied name" },
        "pl",
        () => "unexpected",
      ),
    ).toBe("Supplied name");
    expect(country).toEqual({ code: "PL", name: "Poland" });
  });

  it.each(UI_LANGUAGE_CODES)(
    "%s covers shared plan features without relying on their order",
    (locale) => {
      const t = (key: string) => translate(locale, key);
      for (const plan of Object.values(PLAN_META)) {
        for (const feature of [...plan.features].reverse()) {
          const label = billingFeatureLabel(feature, t);
          expect(label).not.toContain("billingScreen.");
          if (locale === "en") expect(label).toBe(feature);
          else expect(label).not.toBe(feature);
        }
      }
      expect(billingFeatureLabel("Future feature", t)).toBe("Future feature");
      expect(billingFeatureLabel("__proto__", t)).toBe("__proto__");
    },
  );
});
