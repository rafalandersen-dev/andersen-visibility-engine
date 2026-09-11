import { expect, it } from "vitest";
import {
  backlinkMonitoringPayload,
  monitoringScope,
  normalizeBacklinkMonitoring,
} from "./backlink-monitoring";
const observed = "2026-09-11T12:00:00Z";
const scope = {
  target: "example.com",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-03",
  includeSubdomains: true,
};
const entry = (date: string) => ({
  type: "backlinks_timeseries_new_lost_summary",
  date: date + " 00:00:00 +00:00",
  new_backlinks: 0,
  lost_backlinks: 2,
  new_referring_domains: 1,
  lost_referring_domains: 0,
  new_referring_main_domains: 1,
  lost_referring_main_domains: 0,
});
const fixture = () => ({
  status_code: 20000,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [
    {
      id: "fixture-task",
      status_code: 20000,
      cost: 0.02,
      data: backlinkMonitoringPayload(scope, new Date(observed)),
      result: [
        {
          target: scope.target,
          date_from: scope.dateFrom,
          date_to: scope.dateTo,
          group_range: "day",
          items_count: 2,
          items: [entry("2026-09-03"), entry("2026-09-01")],
        },
      ],
    },
  ],
});
it("sorts daily observations and keeps missing days distinct from reported zero", () => {
  const actual = normalizeBacklinkMonitoring(fixture(), scope, observed);
  expect(actual.days.map((d) => [d.date, d.state, d.newBacklinks])).toEqual([
    ["2026-09-01", "reported", 0],
    ["2026-09-02", "missing", null],
    ["2026-09-03", "reported", 0],
  ]);
  expect(actual.complete).toBe(false);
  expect(actual.providerReportedCostUsd).toBe(0.02);
});
it("marks absent metrics partial without manufacturing counts", () => {
  const body = fixture();
  delete (body.tasks[0].result[0].items[0] as Partial<ReturnType<typeof entry>>).lost_backlinks;
  expect(normalizeBacklinkMonitoring(body, scope, observed).days[2]).toMatchObject({
    state: "partial",
    lostBacklinks: null,
  });
});
it("accepts a complete interval including a real leap day", () => {
  const requested = { ...scope, dateFrom: "2024-02-28", dateTo: "2024-03-01" };
  const body = fixture();
  body.tasks[0].data = backlinkMonitoringPayload(requested, new Date(observed));
  body.tasks[0].result[0] = {
    target: scope.target,
    date_from: requested.dateFrom,
    date_to: requested.dateTo,
    group_range: "day",
    items_count: 3,
    items: [entry("2024-02-28"), entry("2024-02-29"), entry("2024-03-01")],
  };
  expect(normalizeBacklinkMonitoring(body, requested, observed).complete).toBe(true);
});
it.each([
  { dateFrom: "2026-02-30" },
  { dateTo: "2026-09-12" },
  { dateFrom: "2026-09-04" },
  { dateFrom: "2025-01-01" },
  { target: "https://example.com" },
  { target: "example.com/path" },
  { target: "127.0.0.1" },
])("rejects invalid request scope %j", (change) => {
  expect(() => monitoringScope({ ...scope, ...change }, new Date(observed))).toThrow();
});
it.each(["target", "date_from", "date_to", "group_range", "include_subdomains"])(
  "requires exact echoed %s",
  (key) => {
    const body = fixture();
    (body.tasks[0].data as unknown as Record<string, unknown>)[key] = "wrong";
    expect(() => normalizeBacklinkMonitoring(body, scope, observed)).toThrow();
  },
);
it.each(["duplicate", "outside", "count", "negative", "fraction", "unsafe", "wrong_result"])(
  "rejects inconsistent provider evidence %s",
  (mode) => {
    const body = fixture(),
      row = body.tasks[0].result[0];
    if (mode === "duplicate") row.items[1] = row.items[0];
    if (mode === "outside") row.items[0] = entry("2026-08-31");
    if (mode === "count") row.items_count = 3;
    if (mode === "negative") row.items[0].new_backlinks = -1;
    if (mode === "fraction") row.items[0].new_backlinks = 0.5;
    if (mode === "unsafe") row.items[0].new_backlinks = Number.MAX_SAFE_INTEGER + 1;
    if (mode === "wrong_result") row.target = "other.com";
    expect(() => normalizeBacklinkMonitoring(body, scope, observed)).toThrow();
  },
);
