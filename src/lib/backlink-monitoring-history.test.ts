import { it, expect, vi } from "vitest";
import { projectBacklinkHistory, savedBacklinkObservation } from "./backlink-monitoring-history";
import {
  readBacklinkMonitoringHistory,
  recoverBacklinkMonitoringAccounting,
} from "./backlink-monitoring-history.server";
const user = "00000000-0000-4000-8000-000000000001";
const request = "00000000-0000-4000-8000-000000000002";
function fixture() {
  const scope = {
    target: "example.com",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-02",
    includeSubdomains: false,
  };
  const values = {
    newBacklinks: 0,
    lostBacklinks: 0,
    newReferringDomains: 0,
    lostReferringDomains: 0,
    newReferringMainDomains: 0,
    lostReferringMainDomains: 0,
  };
  return {
    user_id: user,
    project_id: "p",
    request_id: request,
    scope,
    status: "succeeded",
    accounting_state: "pending",
    created_at: "2026-09-11T12:00:00Z",
    lease_token: "private",
    observation: {
      source: "dataforseo_index",
      scope: { ...scope },
      observedAt: "2026-09-11T12:00:00Z",
      providerTaskId: "fixture",
      providerReportedCostUsd: 0.024,
      complete: false,
      days: [
        { date: "2026-09-01", state: "reported", ...values },
        {
          date: "2026-09-02",
          state: "missing",
          ...Object.fromEntries(Object.keys(values).map((k) => [k, null])),
        },
      ],
    },
  };
}
it("projects only public history fields and preserves missing versus zero", () => {
  const [row] = projectBacklinkHistory([fixture()], user, "p");
  expect(Object.keys(row)).toEqual([
    "requestId",
    "scope",
    "status",
    "accounting",
    "createdAt",
    "observation",
  ]);
  expect(row.observation?.days.map((d) => d.newBacklinks)).toEqual([0, null]);
});
it.each(["user", "project", "scope", "status", "count", "date", "complete", "missing"])(
  "rejects invalid saved %s evidence",
  (kind) => {
    const row = fixture();
    if (kind === "user") row.user_id = request;
    if (kind === "project") row.project_id = "other";
    if (kind === "scope") row.scope.target = "other.com";
    if (kind === "status") row.status = "unknown";
    if (kind === "count") row.observation.days.pop();
    if (kind === "date") row.observation.days[1].date = "2026-09-03";
    if (kind === "complete") row.observation.complete = true;
    if (kind === "missing") Object.assign(row.observation.days[1], { newBacklinks: 0 });
    expect(() => projectBacklinkHistory([row], user, "p")).toThrow();
  },
);
it("bounds history and accepts an empty history", () => {
  expect(projectBacklinkHistory([], user, "p")).toEqual([]);
  expect(() => projectBacklinkHistory(Array.from({ length: 21 }, fixture), user, "p")).toThrow();
});
it("rejects partially labelled complete metrics", () => {
  const row = fixture();
  row.observation.days[0].state = "partial";
  expect(() => savedBacklinkObservation(row.observation)).toThrow();
});
it("scopes read and accounting recovery to the verified actor and exact request", async () => {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "list_backlink_monitoring" ? [fixture()] : true,
    error: null,
  }));
  expect(await readBacklinkMonitoringHistory(user, { projectId: "p" }, rpc)).toHaveLength(1);
  expect(rpc).toHaveBeenLastCalledWith("list_backlink_monitoring", {
    p_user: user,
    p_project: "p",
  });
  expect(
    await recoverBacklinkMonitoringAccounting(user, { projectId: "p", requestId: request }, rpc),
  ).toEqual({ recovered: true });
  expect(rpc).toHaveBeenLastCalledWith("reconcile_backlink_monitoring", {
    p_user: user,
    p_project: "p",
    p_request: request,
  });
});
