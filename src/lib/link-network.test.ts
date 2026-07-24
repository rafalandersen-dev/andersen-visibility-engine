/**
 * Link Growth Network — pins the compliance-aware core: relevance-first
 * matching (zero topic overlap can NEVER reach the suggestion threshold),
 * forward-only status machine, real-anchor verification (the only path to
 * live_verified), and the reciprocity advisory.
 */
import { describe, it, expect } from "vitest";
import {
  deriveTopics,
  scoreListingMatch,
  sameSite,
  canTransition,
  containsLinkToSite,
  isReciprocalSwap,
  introEmail,
  MIN_MATCH_SCORE,
  type NetworkListingLike,
} from "./link-network";

const listing = (over: Partial<NetworkListingLike>): NetworkListingLike => ({
  siteUrl: "https://synergymassage.se",
  topics: ["massage", "recovery", "aterhamtning"],
  language: "sv",
  locale: "Malmö, Sweden",
  ...over,
});

describe("deriveTopics", () => {
  it("folds diacritics, drops stopwords, dedupes and caps", () => {
    const topics = deriveTopics(
      { businessType: "Premium massage och recovery studio", description: "" },
      [{ name: "Svensk massage" }, { name: "Återhämtning för löpare" }, { name: "Massage" }],
    );
    expect(topics).toContain("massage");
    expect(topics).toContain("aterhamtning");
    expect(topics).not.toContain("och"); // stopword
    expect(new Set(topics).size).toBe(topics.length); // deduped
    expect(topics.length).toBeLessThanOrEqual(12);
  });
});

describe("scoreListingMatch (relevance-first, anti-link-farm)", () => {
  it("zero topic overlap can never reach the suggestion threshold", () => {
    const a = listing({});
    const b = listing({
      siteUrl: "https://plumber.se",
      topics: ["plumbing", "pipes"],
      language: "sv",
      locale: "Malmö, Sweden",
    });
    // Same language + same city but NO shared topic: hard zero — language
    // and locale must never suggest a pair on their own (anti-link-farm).
    const s = scoreListingMatch(a, b);
    expect(s.sharedTopics).toEqual([]);
    expect(s.score).toBe(0);
    expect(s.score).toBeLessThan(MIN_MATCH_SCORE);
  });

  it("shared topics dominate; language and locale add", () => {
    const a = listing({});
    const strong = scoreListingMatch(
      a,
      listing({ siteUrl: "https://recoverylab.se", topics: ["recovery", "massage", "sauna"] }),
    );
    expect(strong.score).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
    expect(strong.sharedTopics.sort()).toEqual(["massage", "recovery"]);
    const crossLang = scoreListingMatch(
      a,
      listing({ siteUrl: "https://recovery.pl", language: "pl", locale: "Warszawa" }),
    );
    expect(crossLang.score).toBeLessThan(strong.score);
  });

  it("sameSite is www/protocol-insensitive", () => {
    expect(sameSite("https://www.synergymassage.se/x", "http://synergymassage.se")).toBe(true);
    expect(sameSite("https://a.se", "https://b.se")).toBe(false);
  });
});

describe("status machine (forward-only)", () => {
  it("suggested→contacted→agreed→live_verified; declined terminal; no skips", () => {
    expect(canTransition("suggested", "contacted")).toBe(true);
    expect(canTransition("contacted", "agreed")).toBe(true);
    expect(canTransition("agreed", "live_verified")).toBe(true);
    expect(canTransition("suggested", "live_verified")).toBe(false); // never skip verification
    expect(canTransition("live_verified", "suggested")).toBe(false);
    expect(canTransition("declined", "contacted")).toBe(false);
    expect(canTransition("suggested", "declined")).toBe(true);
  });
});

describe("containsLinkToSite (verification is the only path to live)", () => {
  const html = `
    <p>Read <a class="x" href="https://www.synergymassage.se/treatments" rel="nofollow noopener">this guide</a></p>
    <a href="/internal">internal</a>
    <a href="https://other.se/page">other</a>`;

  it("finds a real anchor to the partner host, www-insensitive, and reports rel", () => {
    const r = containsLinkToSite(html, "https://synergymassage.se");
    expect(r.found).toBe(true);
    expect(r.rel).toContain("nofollow");
  });

  it("plain-text mentions and other hosts never count", () => {
    expect(
      containsLinkToSite("visit synergymassage.se today", "https://synergymassage.se").found,
    ).toBe(false);
    expect(containsLinkToSite(html, "https://unrelated.com").found).toBe(false);
    expect(containsLinkToSite(html, "not a url").found).toBe(false);
  });
});

describe("reciprocity advisory", () => {
  it("flags completing a plain A↔B swap; unrelated partners do not trip it", () => {
    const matches = [
      {
        partnerSite: "https://recoverylab.se",
        direction: "inbound" as const,
        status: "live_verified" as const,
      },
    ];
    expect(isReciprocalSwap(matches, "https://www.recoverylab.se", "outbound")).toBe(true);
    expect(isReciprocalSwap(matches, "https://other.se", "outbound")).toBe(false);
    expect(isReciprocalSwap(matches, "https://recoverylab.se", "inbound")).toBe(false);
  });
});

describe("introEmail", () => {
  it("localizes per recipient language and falls back to English", () => {
    const args = {
      fromName: "Synergy Massage",
      fromSite: "https://synergymassage.se",
      toSite: "https://recoverylab.se",
      topics: ["massage", "recovery"],
    };
    expect(introEmail({ ...args, language: "sv" }).body).toContain("Hej");
    expect(introEmail({ ...args, language: "pl" }).subject).toContain("partnerstwo");
    expect(introEmail({ ...args, language: "xx" }).body).toContain("Hi,");
    // The template itself encodes the policy stance.
    expect(introEmail({ ...args, language: "en" }).body).toContain("No mass exchanges");
  });
});
