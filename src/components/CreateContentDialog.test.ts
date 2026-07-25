/**
 * P1-6 regression: the create dialog's default asset type derives from the
 * opportunity's content type (never a silent hard-reset to "brief"), with the
 * session's last manual choice as fallback.
 */
import { describe, it, expect } from "vitest";
import { defaultAssetTypeFor } from "./CreateContentDialog";

describe("defaultAssetTypeFor", () => {
  it("derives from the opportunity content type", () => {
    expect(defaultAssetTypeFor("Blog Article", null)).toBe("article");
    expect(defaultAssetTypeFor("Landing Page", null)).toBe("landingPage");
    expect(defaultAssetTypeFor("Service Page", null)).toBe("servicePage");
    expect(defaultAssetTypeFor("FAQ Page", null)).toBe("faq");
    expect(defaultAssetTypeFor("Comparison", null)).toBe("comparison");
    expect(defaultAssetTypeFor("Guide", null)).toBe("article");
  });

  it("falls back to the last manual choice, then to article — never brief by default", () => {
    expect(defaultAssetTypeFor("Something Unknown", "gbpPost")).toBe("gbpPost");
    expect(defaultAssetTypeFor(undefined, null)).toBe("article");
  });
});
