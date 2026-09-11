import { describe, it, expect } from "vitest";
import { sitemapFilesForPage } from "./technical-sitemap-membership";
describe("sitemap membership for redirected pages", () => {
  it("combines requested and observed membership without duplicate file names", () => {
    const entries = [
      { url: "https://example.test/", files: ["root.xml", "shared.xml"] },
      { url: "https://example.test/home", files: ["shared.xml", "home.xml"] },
      { url: "https://example.test/other", files: ["other.xml"] },
    ];
    expect(
      sitemapFilesForPage(entries, "https://example.test/", "https://example.test/home"),
    ).toEqual(["root.xml", "shared.xml", "home.xml"]);
    expect(
      sitemapFilesForPage(entries, "https://example.test/unknown", "https://example.test/home"),
    ).toEqual(["shared.xml", "home.xml"]);
    expect(sitemapFilesForPage(entries, "https://example.test/unknown")).toEqual([]);
  });
});
