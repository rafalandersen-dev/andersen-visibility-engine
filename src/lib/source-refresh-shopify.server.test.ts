import { describe, expect, it, vi } from "vitest";
import {
  catalogShopDomain,
  configuredCatalogDomain,
  fetchShopifyCatalog,
  observeShopifyCatalog,
  SHOPIFY_CATALOG_QUERY,
} from "./source-refresh-shopify.server";
const domain = "example.myshopify.com";
const fixture = () => ({
  data: {
    shop: { myshopifyDomain: domain, currencyCode: "SEK" },
    productVariants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1",
          title: "Blue",
          price: "100.00",
          availableForSale: true,
          selectedOptions: [{ name: "Color", value: "Blue" }],
          product: {
            id: "gid://shopify/Product/1",
            title: "Product",
            description: "Description",
            status: "ACTIVE",
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
});
describe("bounded authenticated Shopify catalog", () => {
  it("preserves product/variant/default currency identity without a country-price claim", async () => {
    const observed = await observeShopifyCatalog(fixture(), domain);
    expect(observed.coverage).toBe("catalog-complete");
    expect(observed.facts).toHaveLength(5);
    expect(observed.facts.find((f) => f.field === "price")).toMatchObject({
      productId: "gid://shopify/Product/1",
      variantId: "gid://shopify/ProductVariant/1",
      value: "100.00",
      currency: "SEK",
      market: "shop-default",
    });
  });
  it("labels truncated enumeration partial and never follows unbounded pages", async () => {
    const raw = fixture();
    raw.data.productVariants.pageInfo.hasNextPage = true;
    expect(await observeShopifyCatalog(raw, domain)).toMatchObject({
      coverage: "catalog-partial",
      warnings: ["fact_limit"],
    });
    expect(SHOPIFY_CATALOG_QUERY).toContain("first: 20");
    expect(SHOPIFY_CATALOG_QUERY).not.toContain("mutation");
  });
  it("rejects GraphQL partial errors, foreign shop identities and duplicate variants", async () => {
    await expect(
      observeShopifyCatalog({ ...fixture(), errors: [{ message: "permission denied" }] }, domain),
    ).rejects.toThrow();
    await expect(observeShopifyCatalog(fixture(), "other.myshopify.com")).rejects.toThrow();
    const raw = fixture();
    raw.data.productVariants.nodes.push(raw.data.productVariants.nodes[0]);
    await expect(observeShopifyCatalog(raw, domain)).rejects.toThrow();
  });
  it.each([
    "example.com",
    "example.myshopify.com.evil.test",
    "user@example.myshopify.com",
    "example.myshopify.com:443",
    "https://example.myshopify.com",
    "localhost",
  ])("refuses noncanonical credential destinations %s", async (host) => {
    const request = vi.fn();
    expect(catalogShopDomain.safeParse(host).success).toBe(false);
    await expect(fetchShopifyCatalog(host, "synthetic-token", request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("uses fixed API URL, refuses redirects, bounds response and does not retry access denial", async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture()), {
          headers: { "content-type": "application/json" },
        }),
    );
    expect(
      (await fetchShopifyCatalog(domain, "synthetic-token", request as typeof fetch)).facts,
    ).toHaveLength(5);
    expect(request.mock.calls[0]).toMatchObject([
      `https://${domain}/admin/api/2026-07/graphql.json`,
      { method: "POST", redirect: "error", credentials: "omit" },
    ]);
    const denied = vi.fn(async () => new Response("private error", { status: 403 }));
    await expect(
      fetchShopifyCatalog(domain, "synthetic-token", denied as typeof fetch),
    ).rejects.toThrow("catalog_unavailable");
    expect(denied).toHaveBeenCalledOnce();
    const huge = vi.fn(
      async () =>
        new Response(" ".repeat(300001), { headers: { "content-type": "application/json" } }),
    );
    await expect(
      fetchShopifyCatalog(domain, "synthetic-token", huge as typeof fetch),
    ).rejects.toThrow("catalog_unavailable");
  });
});

it.each(["example", " EXAMPLE ", "https://example.myshopify.com/path", "example.myshopify.com/"])(
  "normalizes connector-supported saved domain %s",
  (raw) => {
    expect(configuredCatalogDomain(raw)).toBe(domain);
  },
);
it.each([
  "https://example.com/path",
  "user@example.myshopify.com",
  "example.myshopify.com.evil.test",
  "example.myshopify.com:443",
])("rejects unsafe configured catalog domain %s", (raw) => {
  expect(() => configuredCatalogDomain(raw)).toThrow();
});
