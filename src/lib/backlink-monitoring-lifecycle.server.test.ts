import { it, expect, vi } from "vitest";
import { runBacklinkMonitoring } from "./backlink-monitoring-lifecycle.server";
import type { fetchBacklinkMonitoring } from "./backlink-monitoring-transport.server";
const user = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002",
  lease = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-11T12:00:00Z");
const input = {
  projectId: "p",
  requestId,
  dateFrom: "2026-09-01",
  dateTo: "2026-09-01",
  includeSubdomains: false,
};
function setup() {
  const scope = {
    target: "www.example.com",
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    includeSubdomains: false,
  };
  const record = {
    user_id: user,
    project_id: "p",
    request_id: requestId,
    website_value: "https://www.example.com/path",
    scope,
    lease_token: lease,
    lease_until: new Date(now.getTime() + 60000).toISOString(),
  };
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: unknown }> => ({
    data:
      name === "read_backlink_monitoring_context"
        ? { website: record.website_value }
        : name === "reserve_backlink_monitoring"
          ? { claimed: true, record }
          : true,
    error: null,
  }));
  const fetch = vi.fn<typeof fetchBacklinkMonitoring>().mockResolvedValue({
    source: "dataforseo_index",
    scope,
    observedAt: now.toISOString(),
    providerTaskId: "fixture",
    providerReportedCostUsd: 0.024,
    complete: false,
    days: [],
  });
  return {
    rpc,
    fetch,
    record,
    now: () => now,
    credentials: () => ({ login: "fixture", password: "fixture-secret" }),
  };
}
it("derives exact hostname and admits expense before one provider invocation", async () => {
  const d = setup();
  const result = await runBacklinkMonitoring(user, input, d);
  expect(result.state).toBe("stored");
  expect(d.fetch).toHaveBeenCalledTimes(1);
  expect(d.rpc.mock.calls.map(([n]) => n)).toEqual([
    "read_backlink_monitoring_context",
    "reserve_backlink_monitoring",
    "authorize_backlink_monitoring_dispatch",
    "finish_backlink_monitoring",
  ]);
  expect(d.fetch.mock.calls[0][0].target).toBe("www.example.com");
  expect(d.fetch.mock.calls[0][0].includeSubdomains).toBe(false);
  expect(JSON.stringify(result)).not.toContain("fixture-secret");
});
it("refuses supplied target/owner overrides before any request", async () => {
  const d = setup();
  await expect(
    runBacklinkMonitoring(user, { ...input, target: "other.test" } as typeof input, d),
  ).rejects.toThrow();
  expect(d.rpc).not.toHaveBeenCalled();
  expect(d.fetch).not.toHaveBeenCalled();
});
it("does not dispatch a replay or stale lease", async () => {
  const d = setup();
  d.rpc
    .mockResolvedValueOnce({ data: { website: d.record.website_value }, error: null })
    .mockResolvedValueOnce({ data: { claimed: false, record: d.record }, error: null });
  expect((await runBacklinkMonitoring(user, input, d)).state).toBe("existing");
  expect(d.fetch).not.toHaveBeenCalled();
  const stale = setup();
  stale.record.lease_until = now.toISOString();
  expect((await runBacklinkMonitoring(user, input, stale)).state).toBe("held");
  expect(stale.fetch).not.toHaveBeenCalled();
});
it("never calls the provider after denied or uncertain expense admission", async () => {
  const d = setup();
  const original = d.rpc.getMockImplementation()!;
  d.rpc.mockImplementation(async (n) =>
    n === "authorize_backlink_monitoring_dispatch"
      ? { data: null, error: { message: "budget_unconfigured" } }
      : original(n),
  );
  expect((await runBacklinkMonitoring(user, input, d)).state).toBe("unknown");
  expect(d.fetch).not.toHaveBeenCalled();
});
it("records provider failure as unknown without retrying", async () => {
  const d = setup();
  d.fetch.mockRejectedValue(new Error("private provider response"));
  const result = await runBacklinkMonitoring(user, input, d);
  expect(result.state).toBe("unknown");
  expect(d.fetch).toHaveBeenCalledTimes(1);
  expect(d.rpc).toHaveBeenLastCalledWith("finish_backlink_monitoring", {
    p_user: user,
    p_project: "p",
    p_request: requestId,
    p_lease: lease,
    p_observation: null,
  });
});
