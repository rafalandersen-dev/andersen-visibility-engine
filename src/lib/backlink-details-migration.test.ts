import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  request = "00000000-0000-4000-8000-000000000003";
const scope = {
  target: "example.com",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-01",
  includeSubdomains: false,
  selection: "first_seen",
  limit: 100,
  offset: 0,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz); INSERT INTO auth.users(id) VALUES('${owner}'),('${other}'); CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint); INSERT INTO workspace_meta VALUES('${owner}',1); CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb,PRIMARY KEY(user_id,collection,entity_id)); INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"websiteUrl":"https://example.com"}');`,
  );
  for (const file of [
    "20260907140000_ai_expense_reservations.sql",
    "20260908210000_restricted_ai_expense_permits.sql",
    "20260911170000_backlink_monitoring_requests.sql",
    "20260911180000_backlink_detail_requests.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE; TRUNCATE backlink_monitoring_requests,backlink_details_requests,backlink_monitoring_limits,ai_expense_requests,ai_expense_budgets,ai_expense_permits; UPDATE auth.users SET deleted_at=NULL,banned_until=NULL; UPDATE workspace_entities SET data='{"websiteUrl":"https://example.com"}';`,
  );
});
afterAll(async () => await db?.close());
const reserve = (id = request, who = owner, next = scope) =>
  db.query<{
    result: {
      claimed: boolean;
      record: { lease_token?: string; ceiling_microusd: number; status: string };
    };
  }>("SELECT reserve_backlink_details($1,'p',$2,'https://example.com',$3) result", [who, id, next]);
const fund = () =>
  db.query(
    "INSERT INTO ai_expense_budgets(scope,period,cap_microusd) VALUES('global',to_char(now(),'YYYY-MM'),1000000),($1,to_char(now(),'YYYY-MM'),1000000)",
    ["user:" + owner],
  );
const dispatch = (lease: string) =>
  db.query<{ result: boolean }>("SELECT authorize_backlink_details_dispatch($1,'p',$2,$3) result", [
    owner,
    request,
    lease,
  ]);
const finish = (lease: string, observation: unknown) =>
  db.query("SELECT finish_backlink_details($1,'p',$2,$3,$4)", [owner, request, lease, observation]);
const observation = () => ({
  source: "dataforseo_index",
  scope,
  observedAt: new Date().toISOString(),
  providerTaskId: "fixture-task",
  providerReportedCostUsd: 0.024,
  complete: false,
  links: [],
});
it("binds stable requests and refuses replay changes without exposing leases", async () => {
  const first = (await reserve()).rows[0].result;
  expect(first.claimed).toBe(true);
  expect(first.record.ceiling_microusd).toBe(27600);
  const repeat = (await reserve()).rows[0].result;
  expect(repeat.claimed).toBe(false);
  expect(repeat.record).not.toHaveProperty("lease_token");
  await expect(reserve(request, owner, { ...scope, includeSubdomains: true })).rejects.toThrow(
    "backlink_details_replay",
  );
  await expect(reserve(other)).rejects.toThrow("backlink_details_active");
});
it("rejects wrong or suspended owners before creating quota rows", async () => {
  await expect(reserve(request, other)).rejects.toThrow("backlink_monitoring_access");
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [owner]);
  await expect(reserve()).rejects.toThrow("backlink_monitoring_access");
  expect((await db.query("SELECT * FROM backlink_monitoring_limits")).rows).toEqual([]);
});
it("reserves money atomically with a once-only dispatch", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await expect(dispatch(lease)).rejects.toThrow("backlink_details_expense");
  expect(
    (await db.query("SELECT status,dispatched_at FROM backlink_details_requests")).rows,
  ).toEqual([{ status: "reserved", dispatched_at: null }]);
  expect(
    (
      await db.query<{ dispatches: string[] }>(
        "SELECT dispatches FROM backlink_monitoring_limits WHERE scope='global'",
      )
    ).rows,
  ).toEqual([{ dispatches: [] }]);
  await fund();
  expect((await dispatch(lease)).rows[0].result).toBe(true);
  expect((await dispatch(lease)).rows[0].result).toBe(false);
  expect(
    (await db.query("SELECT reserved_microusd,provider,operation FROM ai_expense_requests")).rows,
  ).toEqual([{ reserved_microusd: 27600, provider: "dataforseo", operation: "backlink_details" }]);
});
it("cannot consume a restricted benchmark budget without an exact permit", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await db.exec("UPDATE ai_expense_budgets SET requires_permit=true");
  await expect(dispatch(lease)).rejects.toThrow("backlink_details_expense");
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
});
it.each([false, true])(
  "settles reported cost or retains unknown supplier expense: unknown=%s",
  async (unknown) => {
    const lease = (await reserve()).rows[0].result.record.lease_token!;
    await fund();
    await dispatch(lease);
    await finish(lease, unknown ? null : observation());
    expect(
      (await db.query("SELECT status,accounting_state FROM backlink_details_requests")).rows,
    ).toEqual([
      {
        status: unknown ? "unknown" : "succeeded",
        accounting_state: unknown ? "unknown" : "settled",
      },
    ]);
    expect((await db.query("SELECT state,actual_microusd FROM ai_expense_requests")).rows).toEqual([
      { state: unknown ? "unknown" : "settled", actual_microusd: unknown ? null : 24000 },
    ]);
    expect((await reserve()).rows[0].result.claimed).toBe(false);
  },
);
it("preserves valid evidence if expense reconciliation is unavailable", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await dispatch(lease);
  await db.exec("DELETE FROM ai_expense_budgets");
  const result = observation();
  await finish(lease, result);
  expect(
    (await db.query("SELECT status,accounting_state,observation FROM backlink_details_requests"))
      .rows,
  ).toEqual([{ status: "succeeded", accounting_state: "pending", observation: result }]);
  expect((await db.query("SELECT state FROM ai_expense_requests")).rows).toEqual([
    { state: "reserved" },
  ]);
});
it("holds changed-site or nearly expired requests without money admission", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await db.exec("UPDATE backlink_details_requests SET lease_until=now()+interval '20 seconds'");
  expect((await dispatch(lease)).rows[0].result).toBe(false);
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
});
it("denies direct roles access to request records, limits and functions", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT * FROM backlink_details_requests")).rejects.toThrow();
    await expect(db.query("SELECT * FROM backlink_monitoring_limits")).rejects.toThrow();
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE authenticated");
  await expect(reserve()).rejects.toThrow();
  await db.exec("RESET ROLE");
});

it.each(["global", "account"])("enforces persistent request quota: %s", async (kind) => {
  await reserve();
  await db.exec("UPDATE backlink_details_requests SET status='held'");
  await db.query(
    "UPDATE backlink_monitoring_limits SET requests=array_fill(now(),ARRAY[$1::int]) WHERE scope=$2",
    [kind === "global" ? 200 : 20, kind === "global" ? "global" : "user:" + owner],
  );
  await expect(reserve(other)).rejects.toThrow("backlink_details_quota");
  expect((await db.query("SELECT * FROM backlink_details_requests")).rows).toHaveLength(1);
});
it("retains provider quota after project deletion", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await dispatch(lease);
  await db.exec("DELETE FROM workspace_entities");
  expect((await db.query("SELECT * FROM backlink_details_requests")).rows).toHaveLength(0);
  const bucket = (
    await db.query<{ dispatches: unknown[]; leases: Record<string, string> }>(
      "SELECT dispatches,leases FROM backlink_monitoring_limits WHERE scope='global'",
    )
  ).rows[0];
  expect(bucket.dispatches).toHaveLength(1);
  expect(bucket.leases).toHaveProperty(request);
  await db.query("INSERT INTO workspace_entities VALUES($1,'projects','p',$2)", [
    owner,
    { websiteUrl: "https://example.com" },
  ]);
});
it("holds a changed website before dispatch and never treats expired dispatched work as retryable", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await db.query("UPDATE workspace_entities SET data=$1", [{ websiteUrl: "https://changed.test" }]);
  expect((await dispatch(lease)).rows[0].result).toBe(false);
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toHaveLength(0);
  await db.query("UPDATE workspace_entities SET data=$1", [{ websiteUrl: "https://example.com" }]);
  const second = other;
  const next = (await reserve(second)).rows[0].result.record.lease_token!;
  await db.query("SELECT authorize_backlink_details_dispatch($1,'p',$2,$3)", [owner, second, next]);
  await db.exec("UPDATE backlink_details_requests SET lease_until=now()-interval '1 second'");
  const history = (
    await db.query<{ result: Array<{ request_id: string; status: string }> }>(
      "SELECT list_backlink_details($1,'p') result",
      [owner],
    )
  ).rows[0].result;
  expect(history.find((r) => r.request_id === second)?.status).toBe("unknown");
  expect((await reserve(second)).rows[0].result.claimed).toBe(false);
  expect((await db.query("SELECT state FROM ai_expense_requests")).rows).toEqual([
    { state: "reserved" },
  ]);
});
it("refuses negative or wrong-scope expense evidence without settling money", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await dispatch(lease);
  await expect(
    finish(lease, { ...observation(), providerReportedCostUsd: -0.0000001 }),
  ).rejects.toThrow("backlink_details_result");
  await expect(
    finish(lease, { ...observation(), scope: { ...scope, includeSubdomains: true } }),
  ).rejects.toThrow("backlink_details_result");
  expect((await db.query("SELECT state FROM ai_expense_requests")).rows).toEqual([
    { state: "reserved" },
  ]);
});

it("recovers accounting from immutable saved cost without new dispatch or duplicate charges", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await dispatch(lease);
  // Model temporarily unavailable accounting while retaining the exact budgets for restoration.
  const budgets = (
    await db.query<{
      scope: string;
      period: string;
      cap_microusd: number;
      reserved_microusd: number;
      spent_microusd: number;
      paused: boolean;
      requires_permit: boolean;
    }>("SELECT * FROM ai_expense_budgets")
  ).rows;
  await db.exec("DELETE FROM ai_expense_budgets");
  const saved = observation();
  await finish(lease, saved);
  for (const b of budgets)
    await db.query(
      "INSERT INTO ai_expense_budgets(scope,period,cap_microusd,reserved_microusd,spent_microusd,paused,requires_permit) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        b.scope,
        b.period,
        b.cap_microusd,
        b.reserved_microusd,
        b.spent_microusd,
        b.paused,
        b.requires_permit,
      ],
    );
  const reconcile = () =>
    db.query<{ result: boolean }>("SELECT reconcile_backlink_details($1,'p',$2) result", [
      owner,
      request,
    ]);
  expect((await reconcile()).rows[0].result).toBe(true);
  expect((await reconcile()).rows[0].result).toBe(true);
  expect(
    (await db.query("SELECT accounting_state,observation FROM backlink_details_requests")).rows,
  ).toEqual([{ accounting_state: "settled", observation: saved }]);
  expect(
    (
      await db.query(
        "SELECT spent_microusd,reserved_microusd FROM ai_expense_budgets ORDER BY scope",
      )
    ).rows,
  ).toEqual([
    { spent_microusd: 24000, reserved_microusd: 0 },
    { spent_microusd: 24000, reserved_microusd: 0 },
  ]);
  expect(
    (
      await db.query<{ dispatches: string[] }>(
        "SELECT dispatches FROM backlink_monitoring_limits WHERE scope='global'",
      )
    ).rows[0].dispatches,
  ).toHaveLength(1);
  await expect(
    db.query("SELECT reconcile_backlink_details($1,'p',$2)", [other, request]),
  ).rejects.toThrow("backlink_monitoring_access");
});
it("cannot turn unknown provider outcomes into zero-cost settlements", async () => {
  const lease = (await reserve()).rows[0].result.record.lease_token!;
  await fund();
  await dispatch(lease);
  await finish(lease, null);
  expect(
    (
      await db.query<{ result: boolean }>("SELECT reconcile_backlink_details($1,'p',$2) result", [
        owner,
        request,
      ])
    ).rows[0].result,
  ).toBe(false);
  expect((await db.query("SELECT state,actual_microusd FROM ai_expense_requests")).rows).toEqual([
    { state: "unknown", actual_microusd: null },
  ]);
});

it.each([25, 29, 30, 35, 40])(
  "does not reserve expense when only %s seconds remain before dispatch admission",
  async (seconds) => {
    const lease = (await reserve()).rows[0].result.record.lease_token!;
    await fund();
    await db.query(
      "UPDATE backlink_details_requests SET lease_until=clock_timestamp()+$1*interval '1 second'",
      [seconds],
    );
    expect((await dispatch(lease)).rows[0].result).toBe(false);
    expect(
      (await db.query("SELECT status,dispatched_at FROM backlink_details_requests")).rows,
    ).toEqual([{ status: "held", dispatched_at: null }]);
    expect(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM ai_expense_requests")).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT sum(reserved_microusd)::int n FROM ai_expense_budgets",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (await db.query("SELECT cardinality(dispatches) n,leases FROM backlink_monitoring_limits"))
        .rows,
    ).toEqual([
      { n: 0, leases: {} },
      { n: 0, leases: {} },
    ]);
  },
);

it.each([1, 100])("reserves the documented maximum for %i rows", async (limit) => {
  expect(
    (await reserve(request, owner, { ...scope, limit })).rows[0].result.record.ceiling_microusd,
  ).toBe(24000 + 36 * limit);
});
it.each([0, 101, 1.5])("refuses unsupported row limits %i", async (limit) => {
  await expect(reserve(request, owner, { ...scope, limit })).rejects.toThrow(
    "backlink_details_scope",
  );
  expect((await db.query("SELECT * FROM backlink_monitoring_limits")).rows).toEqual([]);
});
it("shares rate admission with daily monitoring", async () => {
  const dailyScope = {
    target: scope.target,
    dateFrom: scope.dateFrom,
    dateTo: scope.dateTo,
    includeSubdomains: false,
  };
  await db.query("SELECT reserve_backlink_monitoring($1,'p',$2,'https://example.com',$3)", [
    owner,
    other,
    dailyScope,
  ]);
  await reserve();
  expect(
    (
      await db.query(
        "SELECT cardinality(requests) n FROM backlink_monitoring_limits WHERE scope='global'",
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
  await db.query(
    "UPDATE backlink_monitoring_limits SET dispatches=array_fill(now(),ARRAY[5]) WHERE scope=$1",
    ["user:" + owner],
  );
  await fund();
  const lease = (
    await db.query<{ lease_token: string }>("SELECT lease_token FROM backlink_details_requests")
  ).rows[0].lease_token;
  await expect(dispatch(lease)).rejects.toThrow("backlink_details_quota");
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
});

it("binds the offset to stable replay without changing the per-page expense ceiling", async () => {
  const first = (await reserve(request, owner, { ...scope, offset: 100 })).rows[0].result;
  expect(first.record.ceiling_microusd).toBe(27600);
  await expect(reserve(request, owner, { ...scope, offset: 200 })).rejects.toThrow(
    "backlink_details_replay",
  );
});
it.each([-1, 20001, 0.5])(
  "rejects invalid page offset %s before quota consumption",
  async (offset) => {
    await expect(reserve(request, owner, { ...scope, offset })).rejects.toThrow(
      "backlink_details_scope",
    );
    expect((await db.query("SELECT * FROM backlink_monitoring_limits")).rows).toEqual([]);
  },
);
