/**
 * CQ — Search Console sync with real language-variant page URLs.
 *
 * Live evidence (22 October): the native 28-day page report for the Synergy
 * property contains public variants such as /book?lang=en. The previous sync threw
 * api_error on any page row with a query or fragment, so the whole report failed
 * and the UI offered reconnection. These regressions pin the explicit replacement:
 * such rows are withheld and counted (never retained, stripped or merged), the
 * independently queried aggregate and query table are kept, malformed data still
 * fails, and failures carry only a finite stage/category. No network: fetch is
 * stubbed and the service-role client is mocked.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState: { row: Record<string, unknown> | null } = { row: null };
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: dbState.row, error: null }) }),
        }),
      }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  },
}));
vi.mock("./auth", () => ({ useAuth: () => ({ isOwner: false }) }));
vi.mock("./store", () => ({
  useStore: (selector: (s: unknown) => unknown) => selector({ content: [] }),
  updateProject: vi.fn(),
  saveWorkspaceNow: vi.fn(),
  getState: vi.fn(),
}));
vi.mock("./gsc.functions", () => ({
  getGscOAuthStatusFn: vi.fn(),
  startGscOAuthFn: vi.fn(),
  listGscSitesFn: vi.fn(),
  selectGscSiteFn: vi.fn(),
  syncGscSearchAnalyticsFn: vi.fn(),
  disconnectGscFn: vi.fn(),
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));

import {
  GscSyncError,
  gscSyncDiagnostic,
  listSites,
  syncSearchAnalytics,
} from "./gsc-oauth.server";
import {
  classifyGscReportPage,
  gscImportSummary,
  gscPageUrl,
  gscSummaryBasis,
  gscSyncAdvice,
  gscWithheldPageRows,
  matchGscToPublishedContent,
} from "./gsc";
import { encryptSecret } from "./crypto.server";
import { searchConsoleEvidence } from "./milo-specialist-context";
import { GscLiteSection } from "@/components/GscLiteSection";
import { UI_CATALOGS } from "@/i18n/catalogs";
import type { GscImport, GscSyncCategory, Project } from "./types";

const PROPERTY = "sc-domain:synergymassage.se";
const PREFIX = "https://synergymassage.se/";
const BOOK_EN = "https://synergymassage.se/book?lang=en";
const SPORT_SV = "https://synergymassage.se/sportmassage-malmo?lang=sv";
const HOME = "https://synergymassage.se/";
const SECRET = "tok_9f8e7d6c5b4a";
const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_OAUTH_SCOPES",
  "GSC_TOKEN_ENCRYPTION_KEY",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI =
    "https://milogrowth.com/api/google/search-console/callback";
  delete process.env.GOOGLE_OAUTH_SCOPES;
  process.env.GSC_TOKEN_ENCRYPTION_KEY = Buffer.from(
    new Uint8Array(32).map((_, i) => i + 7),
  ).toString("base64");
  dbState.row = {
    encrypted_refresh_token: await encryptSecret("stored-refresh"),
    revoked_at: null,
  };
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

type Reply = Response | (() => Response | Promise<Response>);
interface Provider {
  aggregate?: Reply;
  query?: Reply;
  page?: Reply;
  sites?: Reply;
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
/** Stub Google: one token refresh plus at most one call per report table. */
function stubGoogle(p: Provider) {
  const calls: string[] = [];
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      calls.push("token");
      return json({ access_token: "at" });
    }
    if (url === "https://www.googleapis.com/webmasters/v3/sites") {
      calls.push("sites");
      const reply =
        p.sites ?? json({ siteEntry: [{ siteUrl: PROPERTY, permissionLevel: "siteOwner" }] });
      return typeof reply === "function" ? reply() : reply;
    }
    if (url.endsWith("/searchAnalytics/query")) {
      expect(init?.signal, "every provider request is bounded").toBeInstanceOf(AbortSignal);
      const body = JSON.parse(String(init?.body)) as { dimensions: string[]; rowLimit: number };
      const stage = (body.dimensions[0] ?? "aggregate") as "aggregate" | "query" | "page";
      calls.push(stage);
      const reply =
        p[stage] ??
        (stage === "aggregate"
          ? json({ rows: [{ clicks: 120, impressions: 2970, ctr: 120 / 2970, position: 14.2 }] })
          : stage === "query"
            ? json({
                rows: [
                  {
                    keys: ["massage malmö"],
                    clicks: 30,
                    impressions: 400,
                    ctr: 0.075,
                    position: 6.1,
                  },
                ],
              })
            : json({ rows: [] }));
      return typeof reply === "function" ? reply() : reply;
    }
    throw new Error("unexpected request");
  });
  vi.stubGlobal("fetch", request);
  return { calls, request };
}
const pages = (...rows: [string, number, number][]) =>
  json({
    rows: rows.map(([key, clicks, impressions]) => ({
      keys: [key],
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      position: 9.5,
    })),
  });
const sync = () => syncSearchAnalytics({ userId: "u", siteUrl: PROPERTY, range: "28d" });
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected failure");
}

describe("CQ language-variant page rows", () => {
  it("the observed valid ?lang= URLs are exactly what the previous page check refused", () => {
    // The previous sync loop was `if (!gscPageUrl(page) || …) throw api_error`.
    for (const url of [BOOK_EN, SPORT_SV]) expect(gscPageUrl(url)).toBeNull();
    expect(gscPageUrl(HOME)).toBe(HOME);
  });

  it("withholds them explicitly while retaining the aggregate, query table and clean pages", async () => {
    const { calls } = stubGoogle({
      page: pages([HOME, 40, 900], [BOOK_EN, 2, 82], [SPORT_SV, 2, 50]),
    });
    const imp = await sync();
    expect(imp.integrityVersion).toBe(2);
    expect(imp.withheldPageRows).toEqual({ queryOrFragment: 2 });
    expect(gscWithheldPageRows(imp)).toBe(2);
    expect(imp.rows.filter((r) => r.type === "page").map((r) => r.page)).toEqual([HOME]);
    expect(imp.rows.filter((r) => r.type === "query").map((r) => r.query)).toEqual([
      "massage malmö",
    ]);
    // Totals stay the separately queried property aggregate: nothing added or subtracted.
    expect(imp.summary).toMatchObject({
      totalClicks: 120,
      totalImpressions: 2970,
      averagePosition: 14.2,
    });
    expect(gscSummaryBasis(imp)).toBe("aggregate");
    expect(imp.rows.find((r) => r.page === HOME)).toMatchObject({
      clicks: 40,
      impressions: 900,
      position: 9.5,
    });
    // One request per table, no retry.
    expect(calls.sort()).toEqual(["aggregate", "page", "query", "token"]);
  });

  it("never strips a variant into, or merges it with, the clean page of the same path", async () => {
    stubGoogle({ page: pages(["https://synergymassage.se/book", 5, 70], [BOOK_EN, 2, 82]) });
    const imp = await sync();
    const book = imp.rows.filter((r) => r.type === "page");
    expect(book).toHaveLength(1);
    expect(book[0]).toMatchObject({
      page: "https://synergymassage.se/book",
      clicks: 5,
      impressions: 70,
    });
    expect(imp.withheldPageRows).toEqual({ queryOrFragment: 1 });
  });

  it("records an explicit zero when nothing was withheld, and a fully withheld table is still truthful", async () => {
    stubGoogle({ page: pages([HOME, 1, 10]) });
    expect((await sync()).withheldPageRows).toEqual({ queryOrFragment: 0 });
    stubGoogle({ page: pages([BOOK_EN, 2, 82], [SPORT_SV, 2, 50]) });
    const only = await sync();
    expect(only.rows.every((r) => r.type === "query")).toBe(true);
    expect(only.summary.topPage).toBeUndefined();
    expect(only.summary.totalClicks).toBe(120);
    expect(only.withheldPageRows).toEqual({ queryOrFragment: 2 });
  });

  it("never retains query values, fragments or private tokens anywhere in the saved import", async () => {
    stubGoogle({
      page: pages(
        [HOME, 3, 30],
        [`https://synergymassage.se/book?token=${SECRET}&email=owner%40example.com`, 1, 5],
        [`https://synergymassage.se/offer#${SECRET}`, 1, 4],
      ),
    });
    const serialized = JSON.stringify(await sync());
    for (const leaked of [SECRET, "token=", "email", "lang=", "?", "#"])
      expect(serialized).not.toContain(leaked);
  });
});

describe("CQ page URL classification boundary", () => {
  it.each([
    [BOOK_EN, PROPERTY, "withhold"],
    ["https://synergymassage.se/a#section", PROPERTY, "withhold"],
    ["https://www.synergymassage.se/a?lang=da", PROPERTY, "withhold"],
    [BOOK_EN, PREFIX, "withhold"],
    [HOME, PREFIX, "retain"],
    ["https://synergymassage.se/a", PROPERTY, "retain"],
    // Unsafe or out-of-property shapes remain malformed report rows.
    ["https://user:pw@synergymassage.se/a?lang=en", PROPERTY, "invalid"],
    ["https://evil.example/a?lang=en", PROPERTY, "invalid"],
    ["http://synergymassage.se/a?lang=en", PREFIX, "invalid"],
    ["javascript:alert(1)?x", PROPERTY, "invalid"],
    ["https://synergymassage.se/a b?lang=en", PROPERTY, "invalid"],
    ["https://synergymassage.se/a?lang=en\u0000", PROPERTY, "invalid"],
    ["https://synergymassage.se\\a?lang=en", PROPERTY, "invalid"],
    [`https://synergymassage.se/a?${"x".repeat(2000)}`, PROPERTY, "invalid"],
    ["/book?lang=en", PROPERTY, "invalid"],
    [42, PROPERTY, "invalid"],
  ] as const)("%s in %s → %s", (value, property, expected) => {
    expect(classifyGscReportPage(value, property)).toBe(expected);
  });

  it("an unsafe or out-of-property page fails the whole sync instead of being withheld", async () => {
    for (const bad of [
      "https://user:pw@synergymassage.se/a?lang=en",
      "https://other.example/?lang=en",
    ]) {
      stubGoogle({ page: pages([HOME, 1, 10], [bad, 1, 2]) });
      const error = await failure(sync());
      expect(gscSyncDiagnostic(error)).toEqual({ stage: "page", category: "page_url_invalid" });
      expect(String((error as Error).message)).toBe("api_error");
    }
  });
});

describe("CQ no false metrics", () => {
  it.each([
    ["negative clicks", { keys: [BOOK_EN], clicks: -1, impressions: 3 }],
    ["clicks above impressions", { keys: [BOOK_EN], clicks: 9, impressions: 3 }],
    ["ctr above one", { keys: [BOOK_EN], clicks: 1, impressions: 3, ctr: 2 }],
    ["fractional count", { keys: [BOOK_EN], clicks: 1.5, impressions: 3 }],
    ["string metric", { keys: [BOOK_EN], clicks: "2", impressions: 3 }],
    ["missing key", { clicks: 1, impressions: 3 }],
  ])("a withheld-shaped row with %s still fails as malformed", async (_, row) => {
    stubGoogle({ page: json({ rows: [row] }) });
    expect(gscSyncDiagnostic(await failure(sync()))).toEqual({
      stage: "page",
      category: "response_malformed",
    });
  });

  it("duplicate variant keys stay a structural failure", async () => {
    stubGoogle({ page: pages([BOOK_EN, 1, 2], [BOOK_EN, 1, 2]) });
    expect(gscSyncDiagnostic(await failure(sync()))).toEqual({
      stage: "page",
      category: "response_malformed",
    });
  });

  it("an omitted aggregate stays unknown rather than becoming a row sum or zero", async () => {
    stubGoogle({ aggregate: json({}), page: pages([HOME, 40, 900], [BOOK_EN, 2, 82]) });
    const imp = await sync();
    expect(imp.aggregate).toBeUndefined();
    expect(gscSummaryBasis(imp)).toBe("unknown");
    expect(imp.summary).toMatchObject({
      totalClicks: null,
      totalImpressions: null,
      averageCtr: null,
    });
  });
});

describe("CQ finite diagnostics instead of reconnect", () => {
  const cases: [string, Provider, GscSyncCategory, "aggregate" | "query" | "page"][] = [
    [
      "403 on a report",
      { page: json({ error: { message: SECRET } }, 403) },
      "access_denied",
      "page",
    ],
    ["429", { query: json({}, 429) }, "rate_limited", "query"],
    [
      "500",
      { aggregate: new Response(SECRET, { status: 500 }) },
      "provider_unavailable",
      "aggregate",
    ],
    ["400", { page: json({ error: SECRET }, 400) }, "request_rejected", "page"],
    [
      "timeout",
      { page: () => Promise.reject(Object.assign(new Error(SECRET), { name: "TimeoutError" })) },
      "timeout",
      "page",
    ],
    [
      "network failure",
      { query: () => Promise.reject(new TypeError(SECRET)) },
      "provider_unavailable",
      "query",
    ],
    ["oversized body", { page: new Response(" ".repeat(2_000_001)) }, "response_too_large", "page"],
    [
      "non-JSON body",
      { page: new Response(`<html>${SECRET}</html>`) },
      "response_malformed",
      "page",
    ],
    [
      "invalid UTF-8",
      { query: new Response(new Uint8Array([0x7b, 0xff, 0x7d])) },
      "response_malformed",
      "query",
    ],
    ["array body", { aggregate: json([1]) }, "response_malformed", "aggregate"],
  ];
  it.each(cases)(
    "%s → %s at %s, payload-free, nothing returned",
    async (_, provider, category, stage) => {
      const { calls } = stubGoogle(provider);
      const error = await failure(sync());
      const diagnostic = gscSyncDiagnostic(error);
      expect(diagnostic).toEqual({ stage, category });
      expect(Object.keys(diagnostic!).sort()).toEqual(["category", "stage"]);
      expect(error).toBeInstanceOf(GscSyncError);
      expect((error as Error).message).toBe("api_error");
      expect(JSON.stringify(diagnostic)).not.toContain(SECRET);
      expect(String((error as Error).stack ?? "")).not.toContain(SECRET);
      // No implicit retry: each table is requested at most once.
      for (const table of ["aggregate", "query", "page"])
        expect(calls.filter((c) => c === table).length).toBeLessThanOrEqual(1);
      const advice = gscSyncAdvice(diagnostic!);
      expect(advice.code).toBe(`${stage}/${category}`);
      expect(advice.key).toBe(
        category === "access_denied"
          ? "gsc.sync.accessDenied"
          : ["timeout", "rate_limited", "provider_unavailable"].includes(category)
            ? "gsc.sync.retryLater"
            : "gsc.sync.unreadable",
      );
    },
  );

  it("only a 401 on a report or a refused refresh still means the connection expired", async () => {
    stubGoogle({ page: json({}, 401) });
    const error = await failure(sync());
    expect((error as Error).message).toBe("expired");
    expect(gscSyncDiagnostic(error)).toBeNull();
  });

  it("no advice key tells the owner to reconnect for a data or provider failure", () => {
    for (const key of ["gsc.sync.retryLater", "gsc.sync.accessDenied", "gsc.sync.unreadable"]) {
      for (const lang of ["en", "pl", "sv", "da"] as const) {
        const copy = UI_CATALOGS[lang][key];
        expect(copy, `${lang} ${key}`).toContain("{code}");
      }
    }
    expect(UI_CATALOGS.en["gsc.sync.unreadable"]).toMatch(/Reconnecting will not fix this/);
    expect(UI_CATALOGS.en["gsc.warn.withheldPages"]).toContain("{count}");
  });
});

describe("CQ membership validation is unchanged in meaning and now bounded", () => {
  it("still lists only string properties and maps 401/403 to expired", async () => {
    stubGoogle({
      sites: json({
        siteEntry: [{ siteUrl: PROPERTY, permissionLevel: "siteOwner" }, { permissionLevel: "x" }],
      }),
    });
    expect(await listSites("u")).toEqual([{ siteUrl: PROPERTY, permissionLevel: "siteOwner" }]);
    for (const status of [401, 403]) {
      stubGoogle({ sites: json({}, status) });
      await expect(listSites("u")).rejects.toThrow("expired");
    }
    stubGoogle({ sites: json({}) });
    expect(await listSites("u")).toEqual([]);
  });

  it("a malformed property list is a sites-stage failure, never a silent empty list", async () => {
    for (const body of ["not json", "[]", JSON.stringify({ siteEntry: {} })]) {
      stubGoogle({ sites: new Response(body) });
      expect(gscSyncDiagnostic(await failure(listSites("u")))).toEqual({
        stage: "sites",
        category: "response_malformed",
      });
    }
  });

  it("the property list request carries a timeout signal", async () => {
    const { request } = stubGoogle({});
    await listSites("u");
    const sitesCall = request.mock.calls.find(([url]) => String(url).endsWith("/v3/sites"));
    expect(sitesCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("CQ legacy imports and readers", () => {
  const legacy = {
    id: "legacy",
    importedAt: "2026-09-06T00:00:00Z",
    source: "api",
    importType: "mixed",
    rows: [{ type: "page", page: HOME, clicks: 999, impressions: 9999, ctr: 9, position: 1 }],
    summary: {
      totalClicks: 999,
      totalImpressions: 9999,
      averageCtr: 9,
      averagePosition: 1,
      rowCount: 1,
    },
    withheldPageRows: { queryOrFragment: 7 },
  } as unknown as GscImport;

  it("legacy unknowns are unchanged and a forged count cannot make one trusted", () => {
    expect(gscSummaryBasis(legacy)).toBe("legacy");
    expect(gscImportSummary(legacy)).toMatchObject({ totalClicks: null, totalImpressions: null });
    const evidence = JSON.parse(searchConsoleEvidence([legacy])) as {
      content: {
        imports: {
          basis: string;
          rowScopes: { sourceWithheldPageVariants: number | null };
          summary: { clicks: unknown; savedRows: unknown };
          topRowsByClicks: unknown[];
        }[];
      };
    };
    const [item] = evidence.content.imports;
    expect(item).toMatchObject({ basis: "legacy", summary: { clicks: null, savedRows: null } });
    expect(item.topRowsByClicks).toEqual([]);
    // A count is only reported for integrity-v2 imports; a legacy record (even with a
    // forged count) is unknown, never zero.
    expect(item.rowScopes.sourceWithheldPageVariants).toBeNull();
  });

  it("only a positive safe integer count on an integrity-v2 API sync is reported", () => {
    const v2 = { integrityVersion: 2, source: "api" } as const;
    for (const value of [undefined, -1, 1.5, "3", Number.NaN, Infinity])
      expect(
        gscWithheldPageRows({
          ...v2,
          withheldPageRows: { queryOrFragment: value },
        } as unknown as GscImport),
      ).toBe(0);
    expect(
      gscWithheldPageRows({ ...v2, withheldPageRows: { queryOrFragment: 3 } } as GscImport),
    ).toBe(3);
    for (const other of [{ source: "api" }, { integrityVersion: 2, source: "manual_csv" }])
      expect(
        gscWithheldPageRows({ ...other, withheldPageRows: { queryOrFragment: 3 } } as GscImport),
      ).toBe(0);
  });

  it("agent evidence and the visible section disclose the withheld page rows", async () => {
    stubGoogle({ page: pages([HOME, 40, 900], [BOOK_EN, 2, 82], [SPORT_SV, 2, 50]) });
    const imp = await sync();
    const evidence = JSON.parse(searchConsoleEvidence([imp])) as {
      content: { imports: { rowScopes: { sourceWithheldPageVariants: number }; basis: string }[] };
    };
    expect(evidence.content.imports[0]).toMatchObject({
      rowScopes: { sourceWithheldPageVariants: 2 },
      basis: "aggregate",
    });
    expect(JSON.stringify(evidence)).not.toContain("lang=");
    const html = renderToStaticMarkup(
      createElement(GscLiteSection, {
        project: { id: "p", gscLite: { imports: [imp], latestImportId: imp.id } } as Project,
        onsite: [],
      }),
    );
    expect(html).toContain("gsc.warn.withheldPages:2");
    expect(html).not.toContain("lang=");
    const legacyHtml = renderToStaticMarkup(
      createElement(GscLiteSection, {
        project: {
          id: "p",
          gscLite: { imports: [{ ...legacy, withheldPageRows: undefined }] },
        } as Project,
        onsite: [],
      }),
    );
    expect(legacyHtml).not.toContain("gsc.warn.withheldPages");
  });

  it("published-content matching still ignores anything but exact clean page URLs", async () => {
    stubGoogle({ page: pages([HOME, 40, 900], [BOOK_EN, 2, 82]) });
    const imp = await sync();
    const matched = matchGscToPublishedContent(
      [
        {
          id: "a",
          title: "Book",
          livePublishStatus: "published",
          liveUrl: "https://synergymassage.se/book",
        },
      ] as never,
      imp,
    );
    expect(matched[0]).toMatchObject({ gscClicks: null, gscImpressions: null, hasGscData: false });
  });
});
