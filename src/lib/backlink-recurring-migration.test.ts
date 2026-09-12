import { planBacklinkMonitorRun } from "./backlink-recurring";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  change = "00000000-0000-4000-8000-000000000003",
  second = "00000000-0000-4000-8000-000000000004";
const settings = {
  enabled: true,
  cadence: "weekly" as const,
  lookbackDays: 7,
  includeSubdomains: false,
  monthlyCapMicrousd: 1_000_000,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);INSERT INTO auth.users(id) VALUES('${user}'),('${other}');CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint);INSERT INTO workspace_meta VALUES('${user}',1),('${other}',1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb,PRIMARY KEY(user_id,collection,entity_id));INSERT INTO workspace_entities VALUES('${user}','projects','p','{"websiteUrl":"https://example.com"}');`,
  );
  for (const file of [
    "20260907140000_ai_expense_reservations.sql",
    "20260908210000_restricted_ai_expense_permits.sql",
    "20260911170000_backlink_monitoring_requests.sql",
    "20260912010000_backlink_recurring_monitors.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE backlink_recurring_observations,backlink_recurring_monitors,backlink_monitoring_requests,backlink_monitoring_limits,ai_expense_requests,ai_expense_budgets,ai_expense_permits;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.com"}';`,
  );
});
afterAll(async () => await db?.close());
const save = async (
  value: unknown = settings,
  revision = 0,
  id = change,
  who = user,
  website = "https://example.com",
) =>
  (
    await db.query<{
      value: { revision: number; monitor_id: string; next_due_at: string; settings: unknown };
    }>("SELECT save_backlink_recurring_monitor($1,'p',$2,$3,$4,$5) value", [
      who,
      id,
      revision,
      website,
      value,
    ])
  ).rows[0].value;
it("creates private revisioned settings and replays an acknowledged change exactly", async () => {
  const saved = await save();
  expect(saved.revision).toBe(1);
  expect(saved.settings).toEqual(settings);
  expect(await save()).toEqual(saved);
  expect(JSON.stringify(saved)).not.toContain("last_change_id");
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
  expect((await db.query("SELECT * FROM backlink_monitoring_requests")).rows).toEqual([]);
});
it("preserves monitor identity and due anchor through edits and pause", async () => {
  const first = await save();
  const next = await save({ ...settings, enabled: false, monthlyCapMicrousd: 0 }, 1, second);
  expect(next).toMatchObject({
    revision: 2,
    monitor_id: first.monitor_id,
    next_due_at: first.next_due_at,
  });
});
it("refuses stale revisions and reuse of one change identity for different settings", async () => {
  await save();
  await expect(save({ ...settings, enabled: false })).rejects.toThrow("backlink_monitor_replay");
  await expect(save(settings, 0, second)).rejects.toThrow("backlink_monitor_conflict");
});
it.each(["foreign", "website", "suspended", "removed"])(
  "refuses invalid current owner context: %s",
  async (kind) => {
    if (kind === "suspended")
      await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [
        user,
      ]);
    if (kind === "removed")
      await db.query("UPDATE auth.users SET deleted_at=now() WHERE id=$1", [user]);
    await expect(
      save(
        settings,
        0,
        change,
        kind === "foreign" ? other : user,
        kind === "website" ? "https://other.test" : "https://example.com",
      ),
    ).rejects.toThrow();
    expect((await db.query("SELECT * FROM backlink_recurring_monitors")).rows).toEqual([]);
  },
);
it.each([
  { ...settings, userId: user },
  { ...settings, lookbackDays: 93 },
  { ...settings, lookbackDays: 1.5 },
  { ...settings, monthlyCapMicrousd: 24251 },
  { ...settings, monthlyCapMicrousd: 100000001 },
  { ...settings, cadence: null },
  { ...settings, enabled: "true" },
])("refuses invalid settings without creating a monitor: %j", async (value) => {
  await expect(save(value)).rejects.toThrow("backlink_monitor_settings");
  expect((await db.query("SELECT * FROM backlink_recurring_monitors")).rows).toEqual([]);
});
it("blocks direct table access and reserves configuration functions for the service role", async () => {
  await save();
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT * FROM backlink_recurring_monitors")).rejects.toThrow(
      "permission denied",
    );
    if (role !== "service_role")
      await expect(
        db.query("SELECT read_backlink_recurring_monitor($1,'p')", [user]),
      ).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  }
});

const requestId = "00000000-0000-4000-8000-000000000005",
  nextRequest = "00000000-0000-4000-8000-000000000006";
async function occurrence(id = requestId, config?: Awaited<ReturnType<typeof save>>) {
  const monitor = config ?? (await save());
  const plan = planBacklinkMonitorRun("example.com", settings, monitor.next_due_at, new Date());
  if (plan.state !== "due") throw Error("fixture_not_due");
  const args = [
    user,
    "p",
    id,
    "https://example.com",
    plan.scope,
    monitor.monitor_id,
    monitor.revision,
    plan.occurrenceAt,
  ];
  const result = (
    await db.query<{
      value: { claimed: boolean; record: { lease_token: string; scope: unknown } };
    }>("SELECT reserve_backlink_recurring_observation($1,$2,$3,$4,$5,$6,$7,$8) value", args)
  ).rows[0].value;
  return { monitor, plan, args, result };
}
const spending = async (monitor: string) =>
  (
    await db.query<{ value: { reservedOrSpentMicrousd: number; unsettled: boolean } }>(
      "SELECT backlink_recurring_spending($1,$2,to_char(timezone('UTC',clock_timestamp()),'YYYY-MM')) value",
      [user, monitor],
    )
  ).rows[0].value;
it("reserves one stable occurrence and its whole local ceiling without granting supplier dispatch", async () => {
  const first = await occurrence();
  expect(first.result.claimed).toBe(true);
  expect(await spending(first.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24252,
    unsettled: true,
  });
  const replay = (
    await db.query<{ value: { claimed: boolean } }>(
      "SELECT reserve_backlink_recurring_observation($1,$2,$3,$4,$5,$6,$7,$8) value",
      first.args,
    )
  ).rows[0].value;
  expect(replay.claimed).toBe(false);
  expect(JSON.stringify(replay)).not.toContain("lease_token");
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
  const due = (
    await db.query<{ next_due_at: string }>("SELECT next_due_at FROM backlink_recurring_monitors")
  ).rows[0].next_due_at;
  expect(new Date(due).toISOString()).toBe(first.plan.nextDueAt);
  const duplicate = [...first.args];
  duplicate[2] = nextRequest;
  await expect(
    db.query("SELECT reserve_backlink_recurring_observation($1,$2,$3,$4,$5,$6,$7,$8)", duplicate),
  ).rejects.toThrow("backlink_monitor_not_due");
});
it("blocks another due occurrence while an earlier cost is unresolved", async () => {
  const first = await occurrence();
  await db.exec(
    "UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  const monitor = (
    await db.query<{ value: Awaited<ReturnType<typeof save>> }>(
      "SELECT read_backlink_recurring_monitor($1,'p') value",
      [user],
    )
  ).rows[0].value;
  await expect(occurrence(nextRequest, monitor)).rejects.toThrow("backlink_monitor_unsettled");
  expect(await spending(first.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24252,
    unsettled: true,
  });
});
it("releases only an expired, never-admitted occurrence before admitting a new local reservation", async () => {
  const first = await occurrence();
  await db.exec(
    "UPDATE backlink_monitoring_requests SET lease_until=clock_timestamp()-interval '1 second';UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  const monitor = (
    await db.query<{ value: Awaited<ReturnType<typeof save>> }>(
      "SELECT read_backlink_recurring_monitor($1,'p') value",
      [user],
    )
  ).rows[0].value;
  const next = await occurrence(nextRequest, monitor);
  expect(next.result.claimed).toBe(true);
  expect(await spending(first.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24252,
    unsettled: true,
  });
  expect(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM backlink_monitoring_requests WHERE request_id=$1",
        [requestId],
      )
    ).rows[0].status,
  ).toBe("held");
});
it("refuses a changed window or subdomain scope before creating a reservation", async () => {
  const monitor = await save();
  const plan = planBacklinkMonitorRun("example.com", settings, monitor.next_due_at, new Date());
  if (plan.state !== "due") throw Error("fixture_not_due");
  for (const scope of [
    { ...plan.scope, dateFrom: plan.scope.dateTo },
    { ...plan.scope, includeSubdomains: true },
  ]) {
    await expect(
      db.query(
        "SELECT reserve_backlink_recurring_observation($1,'p',$2,'https://example.com',$3,$4,1,$5)",
        [user, requestId, scope, monitor.monitor_id, plan.occurrenceAt],
      ),
    ).rejects.toThrow("backlink_monitor_scope");
  }
  expect((await db.query("SELECT * FROM backlink_monitoring_requests")).rows).toEqual([]);
});

const fund = () =>
  db.query(
    "INSERT INTO ai_expense_budgets(scope,period,cap_microusd) VALUES('global',to_char(now(),'YYYY-MM'),1000000),($1,to_char(now(),'YYYY-MM'),1000000)",
    ["user:" + user],
  );
const authorize = (r: Awaited<ReturnType<typeof occurrence>>) =>
  db.query<{ ok: boolean }>("SELECT authorize_backlink_recurring_dispatch($1,'p',$2,$3) ok", [
    user,
    r.args[2],
    r.result.record.lease_token,
  ]);
const finish = (r: Awaited<ReturnType<typeof occurrence>>, value: unknown) =>
  db.query<{ ok: boolean }>("SELECT finish_backlink_recurring_observation($1,'p',$2,$3,$4) ok", [
    user,
    r.args[2],
    r.result.record.lease_token,
    value,
  ]);
const observed = (r: Awaited<ReturnType<typeof occurrence>>) => ({
  source: "dataforseo_index",
  scope: r.plan.scope,
  providerReportedCostUsd: 0.024,
  providerTaskId: "fixture",
  days: [],
});
it("admits the existing account/global expense exactly once and projects immutable actual cost", async () => {
  await fund();
  const r = await occurrence();
  expect((await authorize(r)).rows[0].ok).toBe(true);
  expect((await authorize(r)).rows[0].ok).toBe(false);
  expect((await finish(r, observed(r))).rows[0].ok).toBe(true);
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24000,
    unsettled: false,
  });
  expect(
    (await db.query("SELECT reserved_microusd,actual_microusd FROM ai_expense_requests")).rows,
  ).toEqual([{ reserved_microusd: 24252, actual_microusd: 24000 }]);
});
it("releases a known-undispatched local ceiling when account funding is unavailable", async () => {
  const r = await occurrence();
  expect((await authorize(r)).rows[0].ok).toBe(false);
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 0,
    unsettled: false,
  });
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
  expect((await finish(r, observed(r))).rows[0].ok).toBe(false);
});
it("retains an uncertain dispatched ceiling even after lease expiry", async () => {
  await fund();
  const r = await occurrence();
  await authorize(r);
  await finish(r, null);
  await db.exec(
    "UPDATE backlink_monitoring_requests SET lease_until=clock_timestamp()-interval '1 second'",
  );
  await db.query("SELECT release_undispatched_backlink_observations($1,$2)", [
    user,
    r.monitor.monitor_id,
  ]);
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24252,
    unsettled: true,
  });
});
it.each(["pause", "revision", "website", "month"])(
  "rechecks %s immediately before admitting the supplier expense",
  async (kind) => {
    await fund();
    const r = await occurrence();
    if (kind === "pause") await save({ ...settings, enabled: false }, 1, second);
    if (kind === "revision") await save({ ...settings, lookbackDays: 8 }, 1, second);
    if (kind === "website")
      await db.exec(`UPDATE workspace_entities SET data='{"websiteUrl":"https://changed.test"}'`);
    if (kind === "month")
      await db.exec("UPDATE backlink_recurring_observations SET billing_month='2020-01'");
    expect((await authorize(r)).rows[0].ok).toBe(false);
    expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
    expect(
      (
        await db.query<{ undispatched_at: string | null }>(
          "SELECT undispatched_at FROM backlink_recurring_observations",
        )
      ).rows[0].undispatched_at,
    ).not.toBeNull();
  },
);
it("keeps successful evidence while accounting is pending and reflects later recovery", async () => {
  await fund();
  const r = await occurrence();
  await authorize(r);
  await db.exec("DELETE FROM ai_expense_budgets");
  await finish(r, observed(r));
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24252,
    unsettled: true,
  });
  // Restore the actual previously reserved amount, as a local reconciliation fixture.
  await fund();
  await db.exec("UPDATE ai_expense_budgets SET reserved_microusd=24252");
  await db.query("SELECT reconcile_backlink_monitoring($1,'p',$2)", [user, requestId]);
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24000,
    unsettled: false,
  });
});

it("refuses a new occurrence whose whole ceiling exceeds remaining monitor allowance", async () => {
  await fund();
  const r = await occurrence();
  await authorize(r);
  await finish(r, observed(r));
  await save({ ...settings, monthlyCapMicrousd: 24252 }, 1, second);
  await db.exec(
    "UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  const monitor = (
    await db.query<{ value: Awaited<ReturnType<typeof save>> }>(
      "SELECT read_backlink_recurring_monitor($1,'p') value",
      [user],
    )
  ).rows[0].value;
  const before = (await db.query("SELECT requests FROM backlink_monitoring_limits ORDER BY scope"))
    .rows;
  await expect(occurrence(nextRequest, monitor)).rejects.toThrow("backlink_monitor_cap");
  expect(
    (await db.query("SELECT requests FROM backlink_monitoring_limits ORDER BY scope")).rows,
  ).toEqual(before);
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24000,
    unsettled: false,
  });
});
it.each(["restricted", "paused", "exhausted"])(
  "retains the existing %s account/global spending boundary",
  async (kind) => {
    await fund();
    const r = await occurrence();
    if (kind === "restricted") await db.exec("UPDATE ai_expense_budgets SET requires_permit=true");
    if (kind === "paused") await db.exec("UPDATE ai_expense_budgets SET paused=true");
    if (kind === "exhausted") await db.exec("UPDATE ai_expense_budgets SET cap_microusd=0");
    expect((await authorize(r)).rows[0].ok).toBe(false);
    expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
    expect(await spending(r.monitor.monitor_id)).toEqual({
      reservedOrSpentMicrousd: 0,
      unsettled: false,
    });
  },
);
