import { describe, expect, it } from "vitest";
import { observePublicPage } from "./source-refresh-page";
const page = (data: unknown) =>
  `<p>${"Source-reported product information. ".repeat(5)}</p><script type="application/ld+json">${JSON.stringify(data)}</script>`;
const product = {
  "@type": "Product",
  sku: "blue-small",
  name: "Blue shirt",
  offers: {
    "@type": "Offer",
    price: "120.00",
    priceCurrency: "SEK",
    eligibleRegion: "SE",
    availability: "https://schema.org/InStock",
    priceValidUntil: "2026-09-12T12:00:00+02:00",
  },
};
describe("public page observations", () => {
  it("extracts explicit product/offer identity and facts with partial coverage", async () => {
    const result = await observePublicPage(page(product));
    expect(result.coverage).toBe("public-page");
    expect(result.facts.find((f) => f.field === "price")).toMatchObject({
      value: "120.00",
      productId: "blue-small",
      variantId: "blue-small",
      currency: "SEK",
      market: "SE",
      validUntil: "2026-09-12T12:00:00+02:00",
    });
    expect(result.conflicts).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
  it("changes only the affected fact hash when a price changes", async () => {
    const before = await observePublicPage(page(product));
    const after = await observePublicPage(
      page({ ...product, offers: { ...product.offers, price: "125.00" } }),
    );
    expect(
      before.facts
        .filter((f, i) => f.fingerprint !== after.facts[i].fingerprint)
        .map((f) => f.field),
    ).toEqual(["price"]);
    expect(before.facts.map((f) => f.key)).toEqual(after.facts.map((f) => f.key));
  });
  it("does not infer a timezone for a date-only expiry", async () => {
    const result = await observePublicPage(
      page({ ...product, offers: { ...product.offers, priceValidUntil: "2026-09-12" } }),
    );
    expect(result.facts.find((f) => f.field === "price")).toMatchObject({ validityUnknown: true });
    expect(result.facts.find((f) => f.field === "price")?.validUntil).toBeUndefined();
    expect(result.warnings).toContain("offer_expiry_unknown");
  });
  it("excludes conflicting offers instead of choosing the last price", async () => {
    const result = await observePublicPage(
      page({ ...product, offers: [product.offers, { ...product.offers, price: "99" }] }),
    );
    expect(result.facts.some((f) => f.field === "price")).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });
  it("keeps separate markets and currencies distinct", async () => {
    const result = await observePublicPage(
      page({
        ...product,
        offers: [
          product.offers,
          { ...product.offers, price: "12", priceCurrency: "EUR", eligibleRegion: "DE" },
        ],
      }),
    );
    expect(result.facts.filter((f) => f.field === "price")).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });
  it("does not invent a currency, product ID, or exact AggregateOffer price", async () => {
    const noCurrency = await observePublicPage(
      page({ ...product, offers: { ...product.offers, priceCurrency: undefined } }),
    );
    expect(noCurrency.facts.some((f) => f.field === "price")).toBe(false);
    expect(noCurrency.warnings).toContain("unresolved_price");
    const noId = await observePublicPage(page({ ...product, sku: undefined }));
    expect(noId.facts.some((f) => f.productId)).toBe(false);
    const aggregate = await observePublicPage(
      page({
        ...product,
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "1",
          highPrice: "100",
          priceCurrency: "SEK",
        },
      }),
    );
    expect(aggregate.facts.some((f) => f.field === "price")).toBe(false);
  });
  it("handles explicit graphs and preserves bounded specifications", async () => {
    const result = await observePublicPage(
      page({
        "@graph": [
          {
            ...product,
            additionalProperty: [{ "@type": "PropertyValue", name: "Material", value: "Cotton" }],
          },
        ],
      }),
    );
    expect(result.facts.find((f) => f.field === "specification")?.value).toBe("Material: Cotton");
  });
  it("keeps scripts inert and handles malformed, oversized and deeply nested input", async () => {
    const malformed = await observePublicPage(
      '<script type="application/ld+json">not json</script><script>throw new Error("executed")</script>',
    );
    expect(malformed.facts).toEqual([]);
    expect(malformed.warnings).toContain("invalid_structured_data");
    await expect(observePublicPage("x".repeat(300001))).rejects.toThrow("source_page_capacity");
    let nested: unknown = product;
    for (let i = 0; i < 15; i++) nested = { "@graph": [nested] };
    expect((await observePublicPage(page(nested))).warnings).toContain("structured_data_limit");
  });
});
