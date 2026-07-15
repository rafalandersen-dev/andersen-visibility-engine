import { describe, expect, it } from "vitest";
import { DEMO_MARKETPLACE_OFFERS, buildSuggestedTopic, matchMarketplaceOffers } from "./link-marketplace";
import type { BacklinkAnalysisResult, Project } from "./types";

const project = {
  id: "p1", name: "Shop", websiteUrl: "https://shop.example", businessName: "Shop", businessType: "ecommerce software",
  primaryLanguage: "English", additionalLanguages: [], mainLocation: "Stockholm", targetLocations: [], description: "Retail marketing platform",
  targetAudience: "online retailers", toneOfVoice: "clear", uniqueSellingPoints: "fast", brandNotes: "", market: "SE",
} as Project;

describe("link marketplace matching", () => {
  it("prioritizes topical and market matches", () => {
    const matches = matchMarketplaceOffers(DEMO_MARKETPLACE_OFFERS, project);
    expect(matches[0].domain).toMatch(/nordicfounders|digitalcommerce/);
    expect(matches[0].matchScore).toBeGreaterThan(matches.at(-1)!.matchScore);
  });

  it("boosts a domain found in the competitor link gap", () => {
    const analysis = { gapDomains: [{ domain: "localserviceguide.eu" }] } as BacklinkAnalysisResult;
    const match = matchMarketplaceOffers(DEMO_MARKETPLACE_OFFERS, project, analysis).find((item) => item.domain === "localserviceguide.eu")!;
    expect(match.isGapDomain).toBe(true);
    expect(match.matchReasons).toContain("linkGap");
  });

  it("builds a project-specific topic", () => {
    expect(buildSuggestedTopic(project, DEMO_MARKETPLACE_OFFERS[0])).toContain("ecommerce software");
  });
});
