import { describe, expect, it } from "vitest";
import { normalizeGoogleIndex } from "./google-index";
import { readGoogleIndexObservation } from "./google-index-view";
import { googleIndexCopy } from "@/i18n/google-index";
const context = {
  url: "https://example.test/page?q=1",
  property: "sc-domain:example.test",
  observedAt: "2026-09-11T10:00:00Z",
};
const observation = normalizeGoogleIndex(
  { inspectionResult: { indexStatusResult: { verdict: "PASS" } } },
  context,
);
const row = { ...context, observationJson: JSON.stringify(observation) };
describe("Google inspection result presentation", () => {
  it("retains missing crawl evidence and exact query identity", () => {
    expect(readGoogleIndexObservation(row)).toMatchObject({
      url: context.url,
      lastCrawlTime: null,
      verdict: "PASS",
    });
    expect(readGoogleIndexObservation({ ...row, url: "https://example.test/page?q=2" })).toBeNull();
    expect(readGoogleIndexObservation({ ...row, property: "sc-domain:other.test" })).toBeNull();
  });
  it("rejects malformed saved evidence and untrusted navigation", () => {
    for (const observationJson of [
      null,
      "not-json",
      "{}",
      JSON.stringify({ ...observation, inspectionMode: "live" }),
    ])
      expect(readGoogleIndexObservation({ ...row, observationJson })).toBeNull();
    expect(
      readGoogleIndexObservation({
        ...row,
        observationJson: JSON.stringify({
          ...observation,
          inspectionResultLink: "https://evil.test/",
        }),
      })?.inspectionResultLink,
    ).toBeNull();
  });
  it.each(["en", "pl", "sv", "da"])("provides complete customer copy in %s", (locale) => {
    const copy = googleIndexCopy[locale];
    expect(Object.keys(copy).sort()).toEqual(Object.keys(googleIndexCopy.en).sort());
    expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true);
    for (const state of ["running", "succeeded", "failed", "unknown", "held"])
      expect(copy[`gindex.${state}`]).toBeTruthy();
    for (const verdict of ["PASS", "PARTIAL", "FAIL", "NEUTRAL"])
      expect(copy[`gindex.verdict_${verdict}`]).toBeTruthy();
  });
});
