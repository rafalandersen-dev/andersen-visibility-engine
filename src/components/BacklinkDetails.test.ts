import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { backlinkDetailsCopy } from "@/i18n/backlink-details";
import { backlinkMonitoringCopy } from "@/i18n/backlink-monitoring";
const h = vi.hoisted(() => ({
  locale: "en" as "en" | "pl" | "sv" | "da",
  rows: [] as unknown[],
  error: false,
  mutations: [] as { retry?: unknown }[],
  run: vi.fn(),
  recover: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "owner-fixture" } }) }));
vi.mock("@/i18n", () => ({
  useT: () => (key: string) =>
    backlinkDetailsCopy[h.locale][key] ?? backlinkMonitoringCopy[h.locale][key] ?? key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: h.rows,
    isSuccess: !h.error,
    isError: h.error,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useMutation: (options: { retry?: unknown }) => {
    h.mutations.push(options);
    return { isPending: false, mutate: vi.fn(), reset: vi.fn() };
  },
}));
vi.mock("@/lib/backlink-details.functions", () => ({
  readBacklinkDetailsHistoryFn: vi.fn(),
  requestBacklinkDetailsFn: h.run,
  recoverBacklinkDetailsAccountingFn: h.recover,
}));
import { BacklinkDetails } from "./BacklinkDetails";
const render = (collectionAvailable = true) =>
  renderToStaticMarkup(
    createElement(BacklinkDetails, {
      projectId: "p",
      website: "https://example.com",
      collectionAvailable,
    }),
  );
beforeEach(() => {
  h.rows = [];
  h.error = false;
  h.locale = "en";
  h.mutations = [];
  vi.clearAllMocks();
});
it.each(["en", "pl", "sv", "da"] as const)(
  "renders localized controls without supplier dispatch or automatic mutation retries: %s",
  (locale) => {
    h.locale = locale;
    const html = render();
    expect(html).toContain(backlinkDetailsCopy[locale]["backlinkDetails.title"]);
    expect(html).toContain(backlinkMonitoringCopy[locale]["backlinkMonitor.empty"]);
    expect(html).not.toContain("backlinkMonitor.");
    expect(h.run).not.toHaveBeenCalled();
    expect(h.recover).not.toHaveBeenCalled();
    expect(h.mutations.map((m) => m.retry)).toEqual([false, false]);
  },
);

it("renders bounded link evidence without inventing placement dates", () => {
  h.rows = [
    {
      requestId: "saved",
      scope: {
        target: "example.com",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-10",
        includeSubdomains: false,
        selection: "first_seen",
        limit: 100,
      },
      status: "succeeded",
      accounting: "pending",
      observation: {
        observedAt: "2026-09-11T00:00:00Z",
        retainedCount: 1,
        providerReturnedCount: 2,
        providerTotalCount: 4,
        retainedTruncated: true,
        moreProviderResults: true,
        links: [
          {
            sourceUrl: "https://source.test/",
            targetUrl: "https://example.com/a",
            anchor: "<script>unsafe</script>",
            anchorTruncated: false,
            firstSeenAt: "2026-09-01T00:00:00Z",
            lastSeenAt: null,
            rank: 0,
            spamScore: null,
            providerLost: null,
          },
        ],
      },
    },
  ];
  const html = render();
  expect(html).toContain('href="https://source.test/"');
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain(backlinkDetailsCopy.en["backlinkDetails.partial"]);
  expect(html).toContain("Provider rank: 0");
  expect(html).toContain(backlinkMonitoringCopy.en["backlinkMonitor.recover"]);
  h.error = true;
  expect(render()).not.toContain('href="https://source.test/"');
});
it("disables collection while preserving saved-history access when provider unavailable", () => {
  const html = render(false);
  expect(html).toContain(backlinkMonitoringCopy.en["backlinkMonitor.unavailable"]);
  expect(html).toContain('disabled=""');
  expect(html).toContain(backlinkMonitoringCopy.en["backlinkMonitor.refresh"]);
  expect(h.run).not.toHaveBeenCalled();
});

const paged = () => ({
  requestId: "parent-fixture",
  scope: {
    target: "example.com",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-10",
    includeSubdomains: false,
    selection: "first_seen",
    limit: 100,
    offset: 20000,
  },
  status: "succeeded",
  accounting: "settled",
  observation: null,
  pageInfo: {
    parentRequestId: null,
    pageNumber: 1,
    priorReturnedCount: 0,
    childRequestId: null,
    canContinue: true,
  },
});
it.each(["en", "pl", "sv", "da"] as const)(
  "renders explicit next-page allowance notice without dispatch: %s",
  (locale) => {
    h.locale = locale;
    h.rows = [paged()];
    const html = render();
    expect(html).toContain(backlinkDetailsCopy[locale]["backlinkDetails.next"]);
    expect(html).toContain(backlinkDetailsCopy[locale]["backlinkDetails.nextNote"]);
    expect(html).not.toContain("backlinkDetails.");
    expect(h.run).not.toHaveBeenCalled();
    expect(h.mutations.every((m) => m.retry === false)).toBe(true);
  },
);
it("shows an existing child identity instead of offering another charged page", () => {
  h.rows = [
    {
      ...paged(),
      pageInfo: { ...paged().pageInfo, childRequestId: "existing-child", canContinue: false },
    },
  ];
  const html = render();
  expect(html).toContain("existing-child");
  expect(html).toContain(backlinkDetailsCopy.en["backlinkDetails.child"]);
  expect(html).not.toContain(backlinkDetailsCopy.en["backlinkDetails.next"]);
  expect(h.run).not.toHaveBeenCalled();
});
it("keeps the next-page button disabled when collection is unavailable", () => {
  h.rows = [paged()];
  const html = render(false);
  const label = backlinkDetailsCopy.en["backlinkDetails.next"];
  const beforeLabel = html.slice(0, html.indexOf(label));
  expect(beforeLabel.slice(beforeLabel.lastIndexOf("<button"))).toContain('disabled=""');
});
