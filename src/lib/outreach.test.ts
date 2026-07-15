import { describe, expect, it } from "vitest";
import { buildOutreachTargets, normalizeOutreachDomain } from "./outreach";
import type { BacklinkAnalysisResult, LinkMarketplaceOrder } from "./types";

describe("outreach helpers", () => {
  it("normalizes a domain without paths or www", () => {
    expect(normalizeOutreachDomain("https://www.Example.com/articles")).toBe("example.com");
    expect(normalizeOutreachDomain("not a domain")).toBe("");
  });

  it("deduplicates link-gap and marketplace targets", () => {
    const analysis = { gapDomains: [{ domain: "example.com", intersections: 2 }] } as BacklinkAnalysisResult;
    const order = { domain: "www.example.com", publicationTitle: "Feature" } as LinkMarketplaceOrder;
    const targets = buildOutreachTargets(analysis, [order]);
    expect(targets).toHaveLength(1);
    expect(targets[0].source).toBe("linkGap");
  });
});
