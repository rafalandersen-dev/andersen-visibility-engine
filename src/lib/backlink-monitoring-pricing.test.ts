import { expect, it } from "vitest";
import { backlinkMonitoringExpense } from "./backlink-monitoring-pricing";
const now = new Date("2026-09-11T12:00:00Z");
const scope = {
  target: "example.com",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-01",
  includeSubdomains: true,
};
it("uses integer supplier expense for the inclusive daily row bound", () => {
  expect(backlinkMonitoringExpense(scope, now)).toMatchObject({
    maximumRows: 1,
    ceilingMicrousd: 24036,
  });
  expect(
    backlinkMonitoringExpense({ ...scope, dateFrom: "2026-06-12", dateTo: "2026-09-11" }, now),
  ).toMatchObject({ maximumRows: 92, ceilingMicrousd: 27312 });
});
it("rejects unbounded or future intervals before pricing them", () => {
  expect(() => backlinkMonitoringExpense({ ...scope, dateFrom: "2020-01-01" }, now)).toThrow();
  expect(() => backlinkMonitoringExpense({ ...scope, dateTo: "2026-09-12" }, now)).toThrow();
});
