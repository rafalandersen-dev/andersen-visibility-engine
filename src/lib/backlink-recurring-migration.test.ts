import { runBacklinkRecurringScheduler } from "./backlink-recurring-executor.server";
import { monitoringScope } from "./backlink-monitoring";
import type { TeamReadRpc } from "./project-team-read.server";
import type { fetchBacklinkMonitoring } from "./backlink-monitoring-transport.server";
import { vi } from "vitest";
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

const due = async () =>
  (
    await db.query<{
      value: Array<{ userId: string; projectId: string; monitorId: string; nextDueAt: string }>;
    }>("SELECT claim_due_backlink_monitors() value")
  ).rows[0].value;
it("claims only eligible inspections without reserving an occurrence or dispatching", async () => {
  const monitor = await save();
  expect(await due()).toMatchObject([
    { userId: user, projectId: "p", monitorId: monitor.monitor_id },
  ]);
  expect((await db.query("SELECT * FROM backlink_monitoring_requests")).rows).toEqual([]);
  await save({ ...settings, enabled: false }, 1, second);
  expect(await due()).toEqual([]);
});
it("treats expired never-admitted work as a candidate without releasing its costs during an inspection claim", async () => {
  const r = await occurrence();
  await db.exec(
    "UPDATE backlink_monitoring_requests SET lease_until=clock_timestamp()-interval '1 second';UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  expect(await due()).toMatchObject([{ monitorId: r.monitor.monitor_id }]);
  expect(await spending(r.monitor.monitor_id)).toEqual({
    reservedOrSpentMicrousd: 24252,
    unsettled: true,
  });
  expect(
    (
      await db.query<{ undispatched_at: string | null }>(
        "SELECT undispatched_at FROM backlink_recurring_observations",
      )
    ).rows[0].undispatched_at,
  ).toBeNull();
});
it("excludes unknown outcomes and exhausted monitor caps from the due queue", async () => {
  await fund();
  const r = await occurrence();
  await authorize(r);
  await finish(r, null);
  await db.exec(
    "UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  expect(await due()).toEqual([]);
});
it("returns the current receipt-based spending alongside owner configuration", async () => {
  await fund();
  const r = await occurrence();
  await authorize(r);
  await finish(r, observed(r));
  const result = (
    await db.query<{ value: { spending: unknown } }>(
      "SELECT read_backlink_recurring_monitor($1,'p') value",
      [user],
    )
  ).rows[0].value;
  expect(result.spending).toEqual({ reservedOrSpentMicrousd: 24000, unsettled: false });
  await save({ ...settings, monthlyCapMicrousd: 24252 }, 1, second);
  await db.exec(
    "UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  expect(await due()).toEqual([]);
});

function worker() {
  const rpc: TeamReadRpc = async (name, args) => {
    try {
      const entries = Object.entries(args);
      const result = await db.query<{ value: unknown }>(
        `SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) value`,
        entries.map(([, value]) => value),
      );
      return { data: result.rows[0].value, error: null };
    } catch (error) {
      return { data: null, error: { message: String(error) } };
    }
  };
  const fetch = vi.fn<typeof fetchBacklinkMonitoring>().mockImplementation(async (raw) => {
    const scope = monitoringScope(raw);
    const n = (Date.parse(scope.dateTo) - Date.parse(scope.dateFrom)) / 86400000 + 1;
    const admitted = (
      await db.query<{ count: number }>("SELECT count(*)::int count FROM ai_expense_requests")
    ).rows[0].count;
    expect(admitted).toBeGreaterThan(0);
    return {
      source: "dataforseo_index",
      scope,
      observedAt: new Date().toISOString(),
      providerTaskId: "fixture-worker",
      providerReportedCostUsd: 0.024,
      complete: true,
      days: Array.from({ length: n }, (_, i) => ({
        date: new Date(Date.parse(scope.dateFrom) + i * 86400000).toISOString().slice(0, 10),
        state: "reported" as const,
        newBacklinks: 0,
        lostBacklinks: 0,
        newReferringDomains: 0,
        lostReferringDomains: 0,
        newReferringMainDomains: 0,
        lostReferringMainDomains: 0,
      })),
    };
  });
  return { rpc, fetch, credentials: () => ({ login: "fixture", password: "fixture-secret" }) };
}
it("runs an eligible occurrence through private SQL and the existing single-dispatch lifecycle", async () => {
  await fund();
  await save();
  const deps = worker();
  const result = await runBacklinkRecurringScheduler(deps);
  expect(result).toEqual({ considered: 1, stored: 1, held: 0, unknown: 0, skipped: 0 });
  expect(deps.fetch).toHaveBeenCalledOnce();
  expect((await runBacklinkRecurringScheduler(deps)).considered).toBe(0);
  expect(deps.fetch).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toMatch(/example.com|fixture-secret|00000000/);
  expect((await db.query("SELECT operation FROM ai_expense_requests")).rows).toEqual([
    { operation: "backlink_monitoring" },
  ]);
});
it("does not call the supplier when only a monitor allowance exists without account funding", async () => {
  await save();
  const deps = worker();
  expect(await runBacklinkRecurringScheduler(deps)).toMatchObject({
    considered: 1,
    stored: 0,
    held: 1,
  });
  expect(deps.fetch).not.toHaveBeenCalled();
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
});
it("retains uncertainty after one supplier failure and holds later automatic collection", async () => {
  await fund();
  await save();
  const deps = worker();
  deps.fetch.mockRejectedValue(Error("fixture-private-failure"));
  expect(await runBacklinkRecurringScheduler(deps)).toMatchObject({ considered: 1, unknown: 1 });
  await db.exec(
    "UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 day'",
  );
  expect((await runBacklinkRecurringScheduler(deps)).considered).toBe(0);
  expect(deps.fetch).toHaveBeenCalledOnce();
});
it("does not start an occurrence after the worker has spent its admission margin", async () => {
  await fund();
  await save();
  const deps = worker();
  let calls = 0;
  expect(
    await runBacklinkRecurringScheduler({ ...deps, monotonic: () => (calls++ === 0 ? 0 : 10001) }),
  ).toMatchObject({ considered: 1, skipped: 1 });
  expect(deps.fetch).not.toHaveBeenCalled();
  expect((await db.query("SELECT * FROM backlink_recurring_observations")).rows).toEqual([]);
});
it("attaches private recurring origin to existing owner history while preserving manual records", async () => {
  const r = await occurrence();
  expect((await authorize(r)).rows[0].ok).toBe(false);
  const manualScope = { ...r.plan.scope };
  await db.query("SELECT reserve_backlink_monitoring($1,'p',$2,'https://example.com',$3)", [
    user,
    nextRequest,
    manualScope,
  ]);
  const rows = (
    await db.query<{
      value: Array<{
        request_id: string;
        recurring: { occurrenceAt: string; undispatched: boolean } | null;
      }>;
    }>("SELECT list_backlink_monitoring_with_origin($1,'p') value", [user])
  ).rows[0].value;
  expect(rows).toHaveLength(2);
  const origin = rows.find((row) => row.request_id === requestId)?.recurring;
  expect(origin?.undispatched).toBe(true);
  expect(Date.parse(origin!.occurrenceAt)).toBe(Date.parse(r.plan.occurrenceAt));
  expect(rows.find((row) => row.request_id === nextRequest)?.recurring).toBeNull();
  expect(JSON.stringify(rows)).not.toContain("lease_token");
  await expect(
    db.query("SELECT list_backlink_monitoring_with_origin($1,'p')", [other]),
  ).rejects.toThrow();
});
it("keeps due enumeration and recurring history unavailable to browser database roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT claim_due_backlink_monitors()")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query("SELECT list_backlink_monitoring_with_origin($1,'p')", [user]),
    ).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  }
});
it("records a disabled scheduler job without touching existing timers and refuses duplicate installation", async () => {
  await db.exec(
    `CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text,schedule text,command text,active boolean DEFAULT true);CREATE FUNCTION cron.schedule(job_name text,expression text,body text) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE id bigint;BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(job_name,expression,body) RETURNING jobid INTO id;RETURN id;END;$$;CREATE FUNCTION cron.alter_job(id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;INSERT INTO cron.job(jobname,schedule,command) VALUES('existing','0 * * * *','existing command');`,
  );
  const sql = readFileSync(
    "supabase/migrations/20260912020000_backlink_recurring_dispatch.sql",
    "utf8",
  );
  await db.exec(sql);
  const rows = (
    await db.query<{ jobname: string; schedule: string; command: string; active: boolean }>(
      "SELECT jobname,schedule,command,active FROM cron.job ORDER BY jobid",
    )
  ).rows;
  expect(rows[0]).toEqual({
    jobname: "existing",
    schedule: "0 * * * *",
    command: "existing command",
    active: true,
  });
  expect(rows[1]).toMatchObject({
    jobname: "backlink-monitoring",
    schedule: "*/5 * * * *",
    active: false,
  });
  expect(rows[1].command).toContain("?engine=backlinks");
  expect(rows[1].command).toContain("timeout_milliseconds := 80000");
  await expect(db.exec(sql)).rejects.toThrow("backlink_dispatch_already_exists");
  expect((await db.query("SELECT * FROM backlink_recurring_monitors")).rows).toHaveLength(0);
  await db.exec("DROP SCHEMA cron CASCADE");
});
it("rotates bounded inspections so invalid websites cannot starve later due monitors", async () => {
  await fund();
  await db.exec("UPDATE workspace_entities SET data='{}' WHERE entity_id='p'");
  for (const [index, website] of ["https://", "https://", "https://example.com"].entries()) {
    const project = `fair${index}`;
    await db.query("INSERT INTO workspace_entities VALUES($1,'projects',$2,$3)", [
      user,
      project,
      { websiteUrl: website },
    ]);
    await db.query("SELECT save_backlink_recurring_monitor($1,$2,gen_random_uuid(),0,$3,$4)", [
      user,
      project,
      website,
      settings,
    ]);
    await db.query(
      "UPDATE backlink_recurring_monitors SET next_due_at=date_trunc('milliseconds',clock_timestamp())-interval '3 hours'+$2::int*interval '1 minute' WHERE project_id=$1",
      [project, index],
    );
  }
  const deps = worker();
  expect(await runBacklinkRecurringScheduler(deps)).toMatchObject({
    considered: 2,
    held: 2,
    stored: 0,
  });
  expect(deps.fetch).not.toHaveBeenCalled();
  expect(await runBacklinkRecurringScheduler(deps)).toMatchObject({ considered: 1, stored: 1 });
  expect(deps.fetch).toHaveBeenCalledOnce();
  expect(await runBacklinkRecurringScheduler(deps)).toMatchObject({ considered: 0 });
  await db.exec("DELETE FROM workspace_entities WHERE entity_id LIKE 'fair%'");
});
