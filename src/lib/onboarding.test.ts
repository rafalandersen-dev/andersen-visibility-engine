/**
 * Onboarding TTFV (Europe move 2): pickSampleOpportunity chooses what becomes
 * the user's FIRST article — a blog article in the project's own content
 * language, highest priority first. Wrong pick = a bad first impression, so
 * the ranking is pinned here.
 */
import { describe, it, expect } from "vitest";
import { pickSampleOpportunity } from "./onboarding";
import type { Opportunity } from "./types";

const opp = (over: Partial<Opportunity>): Opportunity =>
  ({
    id: over.id ?? "o1",
    projectId: "p1",
    title: "T",
    language: "English",
    contentType: "Blog Article",
    priority: "Medium",
    ...over,
  }) as Opportunity;

describe("pickSampleOpportunity", () => {
  it("returns null when there is nothing to write", () => {
    expect(pickSampleOpportunity([], "English")).toBeNull();
  });

  it("prefers a blog article over page types even at lower priority", () => {
    const picked = pickSampleOpportunity(
      [
        opp({ id: "svc", contentType: "Service Page", priority: "High" }),
        opp({ id: "blog", contentType: "Blog Article", priority: "Low" }),
      ],
      "English",
    );
    expect(picked?.id).toBe("blog");
  });

  it("prefers the project's content language, then priority", () => {
    const picked = pickSampleOpportunity(
      [
        opp({ id: "en-high", language: "English", priority: "High" }),
        opp({ id: "pl-low", language: "Polish", priority: "Low" }),
        opp({ id: "pl-med", language: "Polish", priority: "Medium" }),
      ],
      "Polish",
    );
    expect(picked?.id).toBe("pl-med");
  });

  it("falls back to the best non-blog opportunity when no blog exists", () => {
    const picked = pickSampleOpportunity(
      [
        opp({ id: "faq", contentType: "FAQ Page", priority: "Low" }),
        opp({ id: "svc", contentType: "Service Page", priority: "High" }),
      ],
      "English",
    );
    expect(picked?.id).toBe("svc");
  });
});
