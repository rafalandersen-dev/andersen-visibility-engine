import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
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
  useT: () => (key: string) => backlinkMonitoringCopy[h.locale][key] ?? key,
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
vi.mock("@/lib/backlink-monitoring.functions", () => ({
  readBacklinkMonitoringHistoryFn: vi.fn(),
  requestBacklinkMonitoringFn: h.run,
  recoverBacklinkMonitoringAccountingFn: h.recover,
}));
import { BacklinkMonitoring } from "./BacklinkMonitoring";
const render = () =>
  renderToStaticMarkup(
    createElement(BacklinkMonitoring, { projectId: "p", website: "https://example.com" }),
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
    expect(html).toContain(backlinkMonitoringCopy[locale]["backlinkMonitor.title"]);
    expect(html).toContain(backlinkMonitoringCopy[locale]["backlinkMonitor.empty"]);
    expect(html).not.toContain("backlinkMonitor.");
    expect(h.run).not.toHaveBeenCalled();
    expect(h.recover).not.toHaveBeenCalled();
    expect(h.mutations.map((m) => m.retry)).toEqual([false, false]);
  },
);
it("preserves missing versus zero and only offers recovery for saved pending accounting", () => {
  const scope = {
    target: "example.com",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-01",
    includeSubdomains: true,
  };
  h.rows = [
    {
      requestId: "saved",
      scope,
      status: "succeeded",
      accounting: "pending",
      observation: {
        observedAt: "2026-09-11T12:00:00Z",
        days: [
          {
            date: scope.dateFrom,
            state: "partial",
            newBacklinks: 0,
            lostBacklinks: null,
            newReferringDomains: 0,
            lostReferringDomains: null,
            newReferringMainDomains: 0,
            lostReferringMainDomains: null,
          },
        ],
      },
    },
  ];
  let html = render();
  expect(html).toMatch(/<td[^>]*>0<\/td>/);
  expect(html).toMatch(/<td[^>]*>—<\/td>/);
  expect(html).toContain("Recover accounting");
  h.rows = [
    { requestId: "unknown", scope, status: "unknown", accounting: "unknown", observation: null },
  ];
  html = render();
  expect(html).not.toContain("Recover accounting");
  expect(html).not.toContain("<table");
});
it("hides stale history and disables new collection while the current read is unavailable", () => {
  h.error = true;
  h.rows = [{ requestId: "stale-private" }];
  const html = render();
  expect(html).not.toContain("stale-private");
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  expect(html).toContain("History is unavailable");
});
