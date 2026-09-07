import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectSchedulerRecovery } from "./scheduler-recovery.server";
const now = new Date("2026-09-07T10:00:00Z");
let workspace: ReturnType<typeof vi.fn>, db: ReturnType<typeof makeDb>;
let replies: Record<string, { data: unknown; error: unknown }>;
const queries: Array<{
  table: string;
  select?: string;
  filters: Array<[string, unknown]>;
  limit?: number;
}> = [];
const asset = (id: string, projectId = "p", period = "2026-10") => ({
  id,
  projectId,
  autoScheduledFor: period,
  title: `Draft ${id}`,
  status: "Draft",
  updatedAt: "2026-09-07T09:00:00Z",
  markdown: "private body",
  images: [{ previewUrl: "private-preview" }],
});
function makeDb() {
  return {
    from(table: string) {
      const record = { table, filters: [] as Array<[string, unknown]> } as (typeof queries)[number];
      queries.push(record);
      const q = {
        select(columns: string) {
          record.select = columns;
          return q;
        },
        eq(column: string, value: unknown) {
          record.filters.push([column, value]);
          return q;
        },
        limit(n: number) {
          record.limit = n;
          return q;
        },
        then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(replies[table]).then(resolve, reject),
      };
      return q;
    },
  };
}
const run = (projectId = "p") =>
  inspectSchedulerRecovery("owner", projectId, now, { workspace, db } as Parameters<
    typeof inspectSchedulerRecovery
  >[3]);
beforeEach(() => {
  queries.length = 0;
  db = makeDb();
  workspace = vi.fn(async () => ({
    rev: 7,
    data: {
      projects: [{ id: "p", name: "Project", businessName: "Business" }],
      content: [asset("saved"), asset("foreign", "other"), asset("earlier", "p", "2026-09")],
    },
  }));
  replies = {
    auto_scheduler_leases: {
      error: null,
      data: [
        {
          planned_period: "2026-10",
          status: "unknown",
          acquired_at: "2026-09-07T09:00:00Z",
          lease_until: "2026-09-07T09:15:00Z",
          lease_token: "private-lease-token",
        },
      ],
    },
    scheduled_publishes: {
      error: null,
      data: [
        { asset_id: "saved", status: "failed", last_error: "private provider response" },
        { asset_id: "foreign", status: "published" },
        { asset_id: "earlier", status: "pending" },
      ],
    },
  };
});
describe("read-only scheduler recovery inspection", () => {
  it("scopes every source to the authenticated workspace and requested owned project", async () => {
    const report = await run();
    expect(workspace).toHaveBeenCalledWith("owner");
    for (const query of queries)
      expect(query.filters).toEqual([
        ["user_id", "owner"],
        ["project_id", "p"],
      ]);
    expect(queries.map((q) => q.limit)).toEqual([2, 1001]);
    expect(report).toMatchObject({
      state: "review_required",
      plannedPeriod: "2026-10",
      counts: { saved: 1, pending: 0, publishing: 0, published: 0, failed: 1, cancelled: 0 },
      assets: [{ id: "saved", title: "Draft saved", plannedAt: null }],
    });
  });
  it("returns only bounded public inspection fields, never bodies, previews, ownership tokens or errors", async () => {
    const report = JSON.stringify(await run());
    for (const value of [
      "private body",
      "private-preview",
      "private-lease-token",
      "private provider response",
      "foreign",
      "earlier",
    ])
      expect(report).not.toContain(value);
    expect(queries[0].select).toBe("planned_period,status,acquired_at,lease_until");
    expect(queries[1].select).toBe("asset_id,status");
  });
  it("refuses another project before any service-role table query", async () => {
    await expect(run("other")).rejects.toThrow("recovery_project_unavailable");
    expect(queries).toEqual([]);
  });
  it("does not turn an unavailable workspace into an empty recovery report", async () => {
    workspace.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("recovery_source_unavailable");
    expect(queries).toEqual([]);
  });
  it("distinguishes a missing run record from zero saved work", async () => {
    replies.auto_scheduler_leases.data = [];
    expect(await run()).toEqual({ state: "absent", checkedAt: now.toISOString() });
    expect(queries).toHaveLength(1);
  });
  it.each([
    ["active", "2026-09-07T10:15:00Z", "running"],
    ["active", "2026-09-07T09:15:00Z", "review_required"],
    ["released", "2026-09-07T09:15:00Z", "completed"],
  ])(
    "reports %s lease status at %s as %s without resetting it",
    async (status, leaseUntil, expected) => {
      replies.auto_scheduler_leases.data = [
        {
          planned_period: "2026-10",
          status,
          acquired_at: "2026-09-07T09:00:00Z",
          lease_until: leaseUntil,
        },
      ];
      expect(await run()).toMatchObject({ state: expected });
      expect(Object.keys(db)).toEqual(["from"]);
    },
  );
  it.each(["auto_scheduler_leases", "scheduled_publishes"])(
    "refuses unavailable %s data",
    async (table) => {
      replies[table] = { data: null, error: { message: "private" } };
      await expect(run()).rejects.toThrow("recovery_source_unavailable");
    },
  );
  it("refuses a truncated queue snapshot instead of undercounting", async () => {
    replies.scheduled_publishes.data = Array(1001).fill({ asset_id: "saved", status: "pending" });
    await expect(run()).rejects.toThrow();
  });
  it("refuses ambiguous duplicate leases", async () => {
    replies.auto_scheduler_leases.data = Array(2).fill(
      (replies.auto_scheduler_leases.data as unknown[])[0],
    );
    await expect(run()).rejects.toThrow();
  });
  it("keeps full saved counts while returning at most 25 links in stable order", async () => {
    workspace.mockResolvedValue({
      rev: 7,
      data: {
        projects: [{ id: "p", name: "Project", businessName: "Business" }],
        content: Array.from({ length: 30 }, (_, n) => asset(`draft-${String(n).padStart(2, "0")}`)),
      },
    });
    const report = await run();
    expect(report).toMatchObject({ counts: { saved: 30 } });
    expect(report.state !== "absent" && report.assets).toHaveLength(25);
  });
  it("refuses duplicate draft identities rather than showing inflated counts", async () => {
    workspace.mockResolvedValue({
      rev: 7,
      data: {
        projects: [{ id: "p", name: "Project", businessName: "Business" }],
        content: [asset("same"), asset("same")],
      },
    });
    await expect(run()).rejects.toThrow("recovery_source_unavailable");
  });
});
