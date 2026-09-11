import { describe, it, expect } from "vitest";
import { technicalCrawlCopy } from "./technical-crawl";
describe("technical crawl customer copy", () => {
  it.each(["en", "pl", "sv", "da"])("covers every crawl label in %s", (locale) => {
    const copy = technicalCrawlCopy[locale];
    expect(Object.keys(copy).sort()).toEqual(Object.keys(technicalCrawlCopy.en).sort());
    expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true);
    for (const state of [
      "preparing",
      "running",
      "completed",
      "cancelled",
      "failed",
      "held",
      "observed",
      "robots_disallowed",
      "robots_unknown",
      "fetch_failed",
      "out_of_scope",
      "non_html",
      "storage_limited",
    ])
      expect(copy[`crawl.${state}`]).toBeTruthy();
    expect(copy["crawl.counts"]).toContain("{done}");
    expect(copy["crawl.counts"]).toContain("{queued}");
  });
});
