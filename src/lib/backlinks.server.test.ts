/**
 * Tests for the DataForSEO backlinks client's pure helpers: domain extraction
 * and response normalization. Fixtures mirror the documented live-endpoint
 * response shapes (summary, referring_domains, domain_intersection).
 */
import { describe, it, expect } from "vitest";
import {
  extractDomain,
  isDataForSeoConfigured,
  assertAccountUsable,
  normalizeSummaryResult,
  normalizeReferringDomainItems,
  normalizeIntersectionItems,
} from "./backlinks.server";

describe("assertAccountUsable", () => {
  it("passes through success codes", () => {
    expect(() => assertAccountUsable(20000, "Ok.")).not.toThrow();
    expect(() => assertAccountUsable(0, "")).not.toThrow();
  });
  it("maps 40200 / payment messages to the balance error", () => {
    expect(() => assertAccountUsable(40200, "Payment Required.")).toThrow(/remaining balance/);
    expect(() => assertAccountUsable(0, "not enough funds")).toThrow(/remaining balance/);
  });
  it("maps 40201 / paused-account messages to the reactivation error", () => {
    expect(() => assertAccountUsable(40201, "Account Blocked.")).toThrow(/temporarily paused/);
    expect(() => assertAccountUsable(0, "paused due to unusual activity")).toThrow(
      /support@dataforseo\.com/,
    );
  });
});

describe("extractDomain", () => {
  it("extracts the host from a full URL", () => {
    expect(extractDomain("https://www.butelkiwodorowe.pl/sklep")).toBe("butelkiwodorowe.pl");
  });
  it("accepts a bare domain without protocol", () => {
    expect(extractDomain("milogrowth.com")).toBe("milogrowth.com");
  });
  it("strips www and lowercases", () => {
    expect(extractDomain("HTTP://WWW.Example.COM")).toBe("example.com");
  });
  it("returns empty string for invalid values", () => {
    expect(extractDomain("")).toBe("");
    expect(extractDomain("   ")).toBe("");
    expect(extractDomain("localhost")).toBe("");
    expect(extractDomain("not a url")).toBe("");
  });
});

describe("isDataForSeoConfigured", () => {
  it("is false when credentials are absent", () => {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    expect(isDataForSeoConfigured()).toBe(false);
    if (login !== undefined) process.env.DATAFORSEO_LOGIN = login;
    if (password !== undefined) process.env.DATAFORSEO_PASSWORD = password;
  });
});

describe("normalizeSummaryResult", () => {
  it("maps the documented summary fields", () => {
    const summary = normalizeSummaryResult(
      [
        {
          target: "example.com",
          first_seen: "2020-01-18 11:50:58 +00:00",
          rank: 371,
          backlinks: 41245,
          backlinks_spam_score: 8,
          broken_backlinks: 209,
          referring_domains: 12372,
          referring_main_domains: 11438,
          info: { target_spam_score: 3 },
        },
      ],
      "example.com",
    );
    expect(summary).toMatchObject({
      target: "example.com",
      fetchStatus: "fetched",
      rank: 371,
      backlinks: 41245,
      referringDomains: 12372,
      referringMainDomains: 11438,
      brokenBacklinks: 209,
      spamScore: 8,
      firstSeen: "2020-01-18",
    });
  });

  it("degrades to zeros for an empty/unknown target", () => {
    const summary = normalizeSummaryResult([null], "new-domain.pl");
    expect(summary).toMatchObject({
      target: "new-domain.pl",
      fetchStatus: "fetched",
      rank: 0,
      backlinks: 0,
      referringDomains: 0,
    });
    expect(summary.firstSeen).toBeUndefined();
  });
});

describe("normalizeReferringDomainItems", () => {
  it("maps items and drops entries without a domain", () => {
    const rows = normalizeReferringDomainItems([
      {
        target: "example.com",
        items: [
          {
            domain: "menaccessories.net",
            rank: 302,
            backlinks: 9864,
            backlinks_spam_score: 5,
            first_seen: "2021-10-16 16:46:16 +00:00",
          },
          { rank: 100, backlinks: 3 },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domain: "menaccessories.net",
      rank: 302,
      backlinks: 9864,
      spamScore: 5,
      firstSeen: "2021-10-16",
    });
  });

  it("returns [] for an empty result", () => {
    expect(normalizeReferringDomainItems([])).toEqual([]);
    expect(normalizeReferringDomainItems([{ items: null }])).toEqual([]);
  });
});

describe("normalizeIntersectionItems", () => {
  const keyMap = { "1": "moz.com", "2": "ahrefs.com" };

  it("aggregates per-target entries into one gap domain", () => {
    const gaps = normalizeIntersectionItems(
      [
        {
          items: [
            {
              domain_intersection: {
                "1": { target: "www.xroxy.com", rank: 113, backlinks: 547189 },
                "2": { target: "www.xroxy.com", rank: 0, backlinks: 87 },
              },
              summary: { intersections_count: 2 },
            },
            {
              domain_intersection: {
                "2": { target: "onlyone.net", rank: 55, backlinks: 12 },
              },
            },
          ],
        },
      ],
      keyMap,
    );
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({
      domain: "xroxy.com",
      rank: 113,
      intersections: 2,
      competitorsLinked: ["moz.com", "ahrefs.com"],
      totalCompetitorBacklinks: 547276,
    });
    expect(gaps[1]).toMatchObject({
      domain: "onlyone.net",
      intersections: 1,
      competitorsLinked: ["ahrefs.com"],
    });
  });

  it("skips items with no resolvable domain", () => {
    expect(
      normalizeIntersectionItems(
        [{ items: [{ domain_intersection: { "1": { rank: 10 } } }] }],
        keyMap,
      ),
    ).toEqual([]);
  });
});
