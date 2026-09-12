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
  cadence: "weekly",
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
    `RESET ROLE;TRUNCATE backlink_recurring_monitors;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.com"}';`,
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
