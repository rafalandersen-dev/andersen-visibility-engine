import { describe, expect, it } from "vitest";
import { resolveBacklinkCompetitors } from "./backlinks";

describe("resolveBacklinkCompetitors", () => {
  it("prefers project competitors and removes empty/duplicate values", () => {
    expect(
      resolveBacklinkCompetitors(
        ["https://one.example", " ", "https://one.example"],
        ["https://fallback.example"],
      ),
    ).toEqual({ urls: ["https://one.example"], source: "project" });
  });

  it("falls back to the latest competitor analysis", () => {
    expect(resolveBacklinkCompetitors([], ["https://fallback.example"])).toEqual({
      urls: ["https://fallback.example"],
      source: "competitor_analysis",
    });
  });

  it("reports when no competitor source exists", () => {
    expect(resolveBacklinkCompetitors(undefined, undefined)).toEqual({ urls: [], source: "none" });
  });
});
