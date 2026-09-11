import { it, expect, vi } from "vitest";
import { runBacklinkDetails } from "./backlink-details-lifecycle.server";
import type { fetchBacklinkDetails } from "./backlink-details-transport.server";
const user = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002",
  lease = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-11T12:00:00Z");
const input = {
  projectId: "p",
  expectedWebsite: "https://www.example.com/path",
  requestId,
  dateFrom: "2026-09-01",
  dateTo: "2026-09-01",
  includeSubdomains: false,
  selection: "first_seen" as const,
  limit: 100,
  offset: 0,
};
function setup() {
  const scope = {
    target: "www.example.com",
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    includeSubdomains: false,
    selection: "first_seen" as const,
    limit: 100,
    offset: 0,
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
        : name === "reserve_backlink_details"
          ? { claimed: true, record }
          : true,
    error: null,
  }));
  const fetch = vi.fn<typeof fetchBacklinkDetails>().mockResolvedValue({
    source: "dataforseo_index",
    scope,
    observedAt: now.toISOString(),
    providerTaskId: "fixture",
    providerReportedCostUsd: 0.024,
    providerTotalCount: 0,
    providerReturnedCount: 0,
    retainedCount: 0,
    retainedTruncated: false,
    moreProviderResults: false,
    coverage: "representative_links_from_referring_pages",
    links: [],
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
  const result = await runBacklinkDetails(user, input, d);
  expect(result.state).toBe("stored");
  expect(d.fetch).toHaveBeenCalledTimes(1);
  expect(d.rpc.mock.calls.map(([n]) => n)).toEqual([
    "read_backlink_monitoring_context",
    "reserve_backlink_details",
    "authorize_backlink_details_dispatch",
    "finish_backlink_details",
  ]);
  expect(d.fetch.mock.calls[0][0].target).toBe("www.example.com");
  expect(d.fetch.mock.calls[0][0].includeSubdomains).toBe(false);
  expect(JSON.stringify(result)).not.toContain("fixture-secret");
});
it("refuses supplied target/owner overrides before any request", async () => {
  const d = setup();
  await expect(
    runBacklinkDetails(user, { ...input, target: "other.test" } as typeof input, d),
  ).rejects.toThrow();
  expect(d.rpc).not.toHaveBeenCalled();
  expect(d.fetch).not.toHaveBeenCalled();
});
it("does not dispatch a replay or stale lease", async () => {
  const d = setup();
  d.rpc
    .mockResolvedValueOnce({ data: { website: d.record.website_value }, error: null })
    .mockResolvedValueOnce({ data: { claimed: false, record: d.record }, error: null });
  expect((await runBacklinkDetails(user, input, d)).state).toBe("existing");
  expect(d.fetch).not.toHaveBeenCalled();
  const stale = setup();
  stale.record.lease_until = now.toISOString();
  expect((await runBacklinkDetails(user, input, stale)).state).toBe("held");
  expect(stale.fetch).not.toHaveBeenCalled();
});
it("never calls the provider after denied or uncertain expense admission", async () => {
  const d = setup();
  const original = d.rpc.getMockImplementation()!;
  d.rpc.mockImplementation(async (n) =>
    n === "authorize_backlink_details_dispatch"
      ? { data: null, error: { message: "budget_unconfigured" } }
      : original(n),
  );
  expect((await runBacklinkDetails(user, input, d)).state).toBe("unknown");
  expect(d.fetch).not.toHaveBeenCalled();
});
it("records provider failure as unknown without retrying", async () => {
  const d = setup();
  d.fetch.mockRejectedValue(new Error("private provider response"));
  const result = await runBacklinkDetails(user, input, d);
  expect(result.state).toBe("unknown");
  expect(d.fetch).toHaveBeenCalledTimes(1);
  expect(d.rpc).toHaveBeenLastCalledWith("finish_backlink_details", {
    p_user: user,
    p_project: "p",
    p_request: requestId,
    p_lease: lease,
    p_observation: null,
  });
});

it.each([20000, 25000, 29999, 30000])(
  "keeps enough post-admission lease for collection and persistence: %s ms",
  async (remaining) => {
    const d = setup();
    let current = now;
    d.now = () => current;
    const rpc = d.rpc;
    d.rpc = vi.fn(async (name) => {
      const result = await rpc(name);
      if (name === "authorize_backlink_details_dispatch")
        current = new Date(now.getTime() + 60000 - remaining);
      return result;
    });
    const result = await runBacklinkDetails(user, input, d);
    if (remaining < 30000) {
      expect(result.state).toBe("unknown");
      expect(d.fetch).not.toHaveBeenCalled();
    } else {
      expect(result.state).toBe("stored");
      expect(d.fetch).toHaveBeenCalledOnce();
    }
  },
);
it("does not enter dispatch admission when the combined operation budget is unavailable", async () => {
  const d = setup();
  d.record.lease_until = new Date(now.getTime() + 39999).toISOString();
  expect((await runBacklinkDetails(user, input, d)).state).toBe("held");
  expect(d.rpc.mock.calls.some(([name]) => name === "authorize_backlink_details_dispatch")).toBe(
    false,
  );
  expect(d.fetch).not.toHaveBeenCalled();
});

it.each(["login", "password"] as const)(
  "rejects whitespace-only %s before expense admission",
  async (field) => {
    const d = setup();
    d.credentials = () => ({ login: "fixture", password: "fixture-secret", [field]: " \t\n " });
    await expect(runBacklinkDetails(user, input, d)).rejects.toThrow(
      "backlink_details_unconfigured",
    );
    expect(d.rpc).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  },
);
it("passes normalized credentials to the admitted provider dispatch", async () => {
  const d = setup();
  d.credentials = () => ({ login: " fixture ", password: "\tfixture-secret\n" });
  await runBacklinkDetails(user, input, d);
  expect(d.fetch.mock.calls[0][1]).toEqual({ login: "fixture", password: "fixture-secret" });
});

it("refuses an optimistic or stale displayed website before reserving or dispatching", async () => {
  const d = setup();
  expect(
    await runBacklinkDetails(user, { ...input, expectedWebsite: "https://different.example/" }, d),
  ).toEqual({ state: "website_changed", requestId });
  expect(d.rpc.mock.calls.map(([name]) => name)).toEqual(["read_backlink_monitoring_context"]);
  expect(d.fetch).not.toHaveBeenCalled();
});
it("matches surrounding whitespace without changing the saved request identity", async () => {
  const d = setup();
  d.record.website_value = "  https://www.example.com/path  ";
  expect(
    (
      await runBacklinkDetails(
        user,
        { ...input, expectedWebsite: "  https://www.example.com/path  " },
        d,
      )
    ).state,
  ).toBe("stored");
  expect(d.fetch).toHaveBeenCalledTimes(1);
  expect(d.fetch.mock.calls[0][0].target).toBe("www.example.com");
});
