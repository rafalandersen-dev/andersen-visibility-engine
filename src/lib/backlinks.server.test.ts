/**
 * Tests for the DataForSEO backlinks client's pure helpers: domain extraction
 * and response normalization. Fixtures mirror the documented live-endpoint
 * response shapes (summary, referring_domains, domain_intersection).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readBacklinkBody,
  fetchBacklinkSummary,
  fetchBacklinkGap,
  extractDomain,
  isDataForSeoConfigured,
  assertAccountUsable,
  normalizeSummaryResult,
  normalizeReferringDomainItems,
  normalizeIntersectionItems,
  normalizeDataForSeoHealth,
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

describe("normalizeDataForSeoHealth", () => {
  const response = (balance: number, expiry: string | null = "2050-01-01 00:00:00 +00:00") => ({
    status_code: 20000,
    status_message: "Ok.",
    tasks: [
      {
        status_code: 20000,
        status_message: "Ok.",
        result: [
          {
            money: { balance },
            backlinks_subscription_expiry_date: expiry,
          },
        ],
      },
    ],
  });

  it("reports an operational account and exposes only the balance", () => {
    expect(normalizeDataForSeoHealth(response(12.34))).toMatchObject({
      configured: true,
      state: "ready",
      balanceUsd: 12.34,
    });
  });

  it("warns when the balance is below one dollar", () => {
    expect(normalizeDataForSeoHealth(response(0.67))).toMatchObject({
      state: "low_balance",
      balanceUsd: 0.67,
    });
  });

  it("maps provider pause and payment codes without leaking the raw response", () => {
    expect(
      normalizeDataForSeoHealth({
        status_code: 40201,
        status_message: "unusual activity",
        tasks: [],
      }),
    ).toMatchObject({ state: "paused" });
    expect(
      normalizeDataForSeoHealth({
        status_code: 40200,
        status_message: "Payment Required.",
        tasks: [],
      }),
    ).toMatchObject({ state: "low_balance", balanceUsd: 0 });
  });

  it("reports an explicit inactive Backlinks subscription as an error", () => {
    expect(normalizeDataForSeoHealth(response(10, null))).toMatchObject({ state: "error" });
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

  it("rejects missing payloads and keeps absent metrics unavailable", () => {
    expect(() => normalizeSummaryResult([null], "new-domain.pl")).toThrow(/validated/);
    expect(
      normalizeSummaryResult([{ target: "new-domain.pl", backlinks: 0 }], "new-domain.pl"),
    ).toMatchObject({ fetchStatus: "partial", backlinks: 0, rank: null, referringDomains: null });
    expect(normalizeSummaryResult([{ target: "new-domain.pl" }], "new-domain.pl").fetchStatus).toBe(
      "unavailable",
    );
  });
  it.each(["12junk", "12", -1, Infinity, NaN, 1.2])("rejects malformed count %s", (value) => {
    expect(() =>
      normalizeSummaryResult([{ target: "example.com", backlinks: value }], "example.com"),
    ).toThrow();
  });
  it("rejects mismatched target, extra results and invalid dates", () => {
    expect(() => normalizeSummaryResult([{ target: "www.example.com" }], "example.com")).toThrow();
    expect(() => normalizeSummaryResult([{ target: "example.com" }, {}], "example.com")).toThrow();
    expect(() =>
      normalizeSummaryResult(
        [{ target: "example.com", first_seen: "2026-02-30 00:00:00" }],
        "example.com",
      ),
    ).toThrow();
  });
});

describe("normalizeReferringDomainItems", () => {
  it("maps valid items", () => {
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
    expect(() => normalizeReferringDomainItems([])).toThrow();
    expect(() => normalizeReferringDomainItems([{ items: null }])).toThrow();
    expect(
      normalizeReferringDomainItems([{ items: null, items_count: 0, total_count: 0 }]),
    ).toEqual([]);
  });
});

describe("normalizeIntersectionItems", () => {
  const keyMap = { "1": "moz.com", "2": "ahrefs.com" };

  it("aggregates per-target entries into one gap domain", () => {
    const gaps = normalizeIntersectionItems(
      [
        {
          targets: keyMap,
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

  it("deduplicates www aliases without loosening requested target identity", () => {
    expect(() =>
      normalizeIntersectionItems(
        [
          {
            targets: keyMap,
            items: [
              { domain_intersection: { "1": { target: "www.x.com" } } },
              { domain_intersection: { "2": { target: "x.com" } } },
            ],
          },
        ],
        keyMap,
      ),
    ).toThrow();
  });
  it("rejects malformed, unknown-key, mismatched and duplicate domains", () => {
    const normalize = (intersection: unknown) =>
      normalizeIntersectionItems(
        [{ targets: keyMap, items: [{ domain_intersection: intersection }] }],
        keyMap,
      );
    expect(() => normalize({ "1": { rank: 10 } })).toThrow();
    expect(() => normalize({ "3": { target: "x.com", backlinks: 500 } })).toThrow();
    expect(() => normalize({ "1": { target: "x.com" }, "2": { target: "y.com" } })).toThrow();
    expect(() =>
      normalizeIntersectionItems([{ targets: { "1": "wrong.com" }, items: [] }], keyMap),
    ).toThrow();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("bounded safe provider transport", () => {
  it("rejects overlarge bodies and invalid JSON", async () => {
    await expect(readBacklinkBody(new Response("x".repeat(2_000_001)))).rejects.toThrow(
      /validated/,
    );
    await expect(readBacklinkBody(new Response("private upstream text"))).rejects.toThrow(
      /validated/,
    );
  });
  it("expires during a stalled body, after headers arrived", async () => {
    vi.useFakeTimers();
    vi.stubEnv("DATAFORSEO_LOGIN", "fixture");
    vi.stubEnv("DATAFORSEO_PASSWORD", "fixture");
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ReadableStream({ cancel }))),
    );
    const request = expect(fetchBacklinkSummary("example.com")).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(25_001);
    await request;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects raw task errors safely and requires the exact echoed scope", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "fixture");
    vi.stubEnv("DATAFORSEO_PASSWORD", "fixture");
    const body = {
      status_code: 20000,
      tasks: [{ status_code: 50000, status_message: "PRIVATE sentinel", result: [] }],
    };
    const fetch = vi.fn(async () => Response.json(body));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchBacklinkSummary("example.com")).rejects.toThrow(
      "Backlink data request failed. Check the provider status before another analysis.",
    );
    fetch.mockImplementation(async () =>
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            data: { target: "other.com" },
            result: [{ target: "example.com", backlinks: 0 }],
          },
        ],
      }),
    );
    await expect(fetchBacklinkSummary("example.com")).rejects.toThrow(/request failed/);
    fetch.mockImplementation(async () =>
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            data: { target: "example.com" },
            result: [{ target: "example.com", backlinks: 0 }],
          },
        ],
      }),
    );
    await expect(fetchBacklinkSummary("example.com")).resolves.toMatchObject({
      backlinks: 0,
      rank: null,
      fetchStatus: "partial",
    });
  });
  it("excludes own and competitor www aliases from actual gap fetch results", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "fixture");
    vi.stubEnv("DATAFORSEO_PASSWORD", "fixture");
    const targets = { "1": "competitor.com" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              data: { targets, exclude_targets: ["example.com"] },
              result: [
                {
                  targets,
                  items: ["www.example.com", "www.competitor.com", "www.other.com"].map(
                    (target) => ({
                      domain_intersection: { "1": { target, rank: 5, backlinks: 2 } },
                    }),
                  ),
                },
              ],
            },
          ],
        }),
      ),
    );
    await expect(fetchBacklinkGap("example.com", ["competitor.com"])).resolves.toEqual([
      {
        domain: "other.com",
        rank: 5,
        intersections: 1,
        competitorsLinked: ["competitor.com"],
        totalCompetitorBacklinks: 2,
      },
    ]);
  });
  it("rejects oversized, duplicate and invalid referring rows", () => {
    const row = { domain: "x.com", backlinks: 0 };
    expect(() => normalizeReferringDomainItems([{ items: Array(26).fill(row) }])).toThrow();
    expect(() => normalizeReferringDomainItems([{ items: [row, row] }])).toThrow();
    expect(() =>
      normalizeReferringDomainItems([{ target: "other.com", items: [] }], "example.com"),
    ).toThrow();
    expect(() =>
      normalizeReferringDomainItems([{ items: [{ domain: "x.com/private?secret=a" }] }]),
    ).toThrow();
  });
});
