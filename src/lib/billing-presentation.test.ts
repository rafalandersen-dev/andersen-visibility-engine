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
  formatBillingCount,
  formatBillingDate,
  formatBillingDateTime,
  formatBillingMinorMoney,
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

/**
 * The commercial API returns INTEGER MINOR UNITS, which the existing
 * whole-unit formatter above must never be handed directly. These checks exist
 * because both failure modes are money bugs: a hundredfold error from a guessed
 * exponent, and an unknown amount rendered as zero.
 */
describe("minor-unit money, dates and counts keep unknown distinct from zero", () => {
  it("converts 12345 minor units to 123.45 in every supported two-decimal currency", () => {
    expect(formatBillingMinorMoney(12_345, "eur", "en")).toEqual({ known: true, text: "€123.45" });
    expect(formatBillingMinorMoney(12_345, "gbp", "en")).toEqual({ known: true, text: "£123.45" });
    expect(formatBillingMinorMoney(12_345, "pln", "en")).toEqual({
      known: true,
      text: "123.45 PLN",
    });
    for (const [currency, locale] of [
      ["pln", "pl"],
      ["sek", "sv"],
      ["dkk", "da"],
    ] as const) {
      const shown = formatBillingMinorMoney(12_345, currency, locale);
      expect(shown.known).toBe(true);
      if (shown.known) {
        expect(shown.text).toContain(currency.toUpperCase());
        expect(shown.text).toMatch(/123[.,]45/);
      }
    }
  });

  it("keeps the trailing decimal rather than truncating an exact value", () => {
    // 269.1 and 269.10 are the same number; only one of them reads as money.
    expect(formatBillingMinorMoney(26_910, "eur", "en")).toEqual({ known: true, text: "€269.10" });
    expect(formatBillingMinorMoney(14_900, "eur", "en")).toEqual({ known: true, text: "€149.00" });
  });

  it("treats a real zero as a value and a missing amount as unknown", () => {
    expect(formatBillingMinorMoney(0, "eur", "en")).toEqual({ known: true, text: "€0.00" });
    for (const amount of [null, undefined, Number.NaN, 12.5, -0.5, "1000" as unknown as number])
      expect(formatBillingMinorMoney(amount as number, "eur", "en")).toEqual({ known: false });
  });

  it("holds an unsupported or malformed currency instead of dividing by a guess", () => {
    // Zero-decimal and unlisted currencies are refused, not divided by 100.
    for (const currency of ["jpy", "usd", "chf", "", "eu", "euro", null, undefined])
      expect(formatBillingMinorMoney(12_345, currency as string, "en"), String(currency)).toEqual({
        known: false,
      });
  });

  it("renders a server date in UTC and keeps an unreadable one unknown", () => {
    expect(formatBillingDate("2026-11-27T00:00:00.000Z", "en")).toEqual({
      known: true,
      text: "Nov 27, 2026",
    });
    // The stated day does not drift with the reviewer's machine.
    expect(formatBillingDate("2026-11-27T23:30:00.000Z", "en")).toEqual({
      known: true,
      text: "Nov 27, 2026",
    });
    for (const value of [null, undefined, "", "   ", "not-a-date"])
      expect(formatBillingDate(value, "en")).toEqual({ known: false });
    for (const locale of UI_LANGUAGE_CODES) {
      const shown = formatBillingDate("2026-11-27T00:00:00.000Z", locale);
      expect(shown.known).toBe(true);
      if (shown.known) expect(shown.text).toContain("2026");
    }
  });

  it("renders a precise instant with its time and zone, so a deadline is a deadline", () => {
    // A quote can expire two minutes after it is issued; the day alone cannot
    // distinguish two offers made the same morning.
    const morning = formatBillingDateTime("2026-10-29T09:05:00.000Z", "en");
    const evening = formatBillingDateTime("2026-10-29T21:40:00.000Z", "en");
    expect(morning.known && evening.known).toBe(true);
    if (!morning.known || !evening.known) return;
    expect(morning.text).not.toBe(evening.text);
    expect(morning.text).toContain("Oct 29, 2026");
    expect(morning.text).toMatch(/9:05/);
    expect(evening.text).toMatch(/9:40/);
    for (const shown of [morning.text, evening.text]) expect(shown).toContain("UTC");
    for (const locale of UI_LANGUAGE_CODES) {
      const shown = formatBillingDateTime("2026-10-29T09:05:00.000Z", locale);
      expect(shown.known, locale).toBe(true);
      if (shown.known) {
        expect(shown.text, locale).toContain("UTC");
        expect(shown.text, locale).toMatch(/0?9[:.]05/);
      }
    }
  });

  it("keeps an unreadable or absent instant unknown", () => {
    for (const value of [null, undefined, "", "   ", "not-a-date"])
      expect(formatBillingDateTime(value, "en")).toEqual({ known: false });
  });

  it("reports a zero count as zero and an absent one as unknown", () => {
    expect(formatBillingCount(0)).toEqual({ known: true, text: "0" });
    expect(formatBillingCount(3)).toEqual({ known: true, text: "3" });
    for (const value of [null, undefined, Number.NaN])
      expect(formatBillingCount(value)).toEqual({
        known: false,
      });
  });
});
