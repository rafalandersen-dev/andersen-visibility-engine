/**
 * Marker-aware connector credential checks (WP/Shopify token migration):
 * a migrated project holds only a browser-safe "…Set" marker — the credential
 * itself lives in the service-role secret store. The pure helpers must treat
 * the marker as "configured" (the server overlays the real value later), while
 * legacy plaintext fields keep working unchanged.
 */
import { describe, expect, it } from "vitest";
import { shopifyCreds, wpCreds } from "./publish-targets";
import { connectorConfigured, hasShopifyAdminToken, hasWordPressAppPassword } from "./launch";
import type { Project } from "./types";

const base = { id: "p1", name: "P" } as unknown as Project;

const wpProject = (wordpress: Project["wordpress"]): Project =>
  ({ ...base, connectorType: "wordpress", wordpress }) as Project;
const shopProject = (shopify: Project["shopify"]): Project =>
  ({ ...base, connectorType: "shopify", shopify }) as Project;

describe("wpCreds / shopifyCreds with store-held credentials", () => {
  it("accepts a marker-only WordPress project and returns an empty password", () => {
    const creds = wpCreds(
      wpProject({ siteUrl: "https://site.com", username: "u", applicationPasswordSet: true }),
    );
    expect(creds).toEqual({ siteUrl: "https://site.com", username: "u", applicationPassword: "" });
  });

  it("still accepts (and forwards) a legacy plaintext WordPress password", () => {
    const creds = wpCreds(
      wpProject({ siteUrl: "https://site.com", username: "u", applicationPassword: "p" }),
    );
    expect(creds.applicationPassword).toBe("p");
  });

  it("throws when a WordPress project has neither password nor marker", () => {
    expect(() => wpCreds(wpProject({ siteUrl: "https://site.com", username: "u" }))).toThrow(
      /Connect WordPress/,
    );
  });

  it("accepts a marker-only Shopify project and returns an empty token", () => {
    const creds = shopifyCreds(
      shopProject({ shopDomain: "s.myshopify.com", adminAccessTokenSet: true }),
    );
    expect(creds).toEqual({ shopDomain: "s.myshopify.com", adminAccessToken: "" });
  });

  it("throws when a Shopify project has neither token nor marker", () => {
    expect(() => shopifyCreds(shopProject({ shopDomain: "s.myshopify.com" }))).toThrow(
      /Connect Shopify/,
    );
  });
});

describe("connectorConfigured with store-held credentials", () => {
  it("counts a marker-only WordPress connector as configured", () => {
    expect(
      connectorConfigured(
        wpProject({ siteUrl: "https://site.com", username: "u", applicationPasswordSet: true }),
      ),
    ).toBe(true);
    expect(connectorConfigured(wpProject({ siteUrl: "https://site.com", username: "u" }))).toBe(
      false,
    );
  });

  it("counts a marker-only Shopify connector as configured", () => {
    expect(
      connectorConfigured(
        shopProject({
          shopDomain: "s.myshopify.com",
          adminAccessTokenSet: true,
          defaultBlogId: "1",
        }),
      ),
    ).toBe(true);
    expect(
      connectorConfigured(shopProject({ shopDomain: "s.myshopify.com", defaultBlogId: "1" })),
    ).toBe(false);
  });

  it("hasWordPressAppPassword / hasShopifyAdminToken accept marker or legacy value only", () => {
    expect(hasWordPressAppPassword({ applicationPasswordSet: true })).toBe(true);
    expect(hasWordPressAppPassword({ applicationPassword: "p" })).toBe(true);
    expect(hasWordPressAppPassword({ applicationPassword: "  " })).toBe(false);
    expect(hasWordPressAppPassword(undefined)).toBe(false);
    expect(hasShopifyAdminToken({ adminAccessTokenSet: true })).toBe(true);
    expect(hasShopifyAdminToken({ adminAccessToken: "t" })).toBe(true);
    expect(hasShopifyAdminToken({})).toBe(false);
  });
});
