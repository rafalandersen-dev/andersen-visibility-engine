import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const settings = { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 };
const set = (engine = "weekly", expected = 0) =>
  db.query("SELECT set_project_scheduler_control($1,'p',$2,$3,$4)", [
    user,
    expected,
    engine,
    JSON.stringify(settings),
  ]);
const claim = async (period = "2026-10") =>
  (
    await db.query<{ token: string | null }>("SELECT claim_auto_scheduler_lease($1,'p',$2) token", [
      user,
      period,
    ])
  ).rows[0].token;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta VALUES($1),($2)", [user, other]);
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p')",
    [user],
  );
  for (const migration of [
    "20260907190000_auto_scheduler_leases.sql",
    "20260909200000_project_knowledge.sql",
    "20260910150000_weekly_preparation.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE project_scheduler_control,auto_scheduler_leases;");
});
afterAll(async () => {
  await db?.close();
});
describe("single scheduler cutover ownership", () => {
  it("keeps existing projects monthly until explicit cutover and refuses the old engine afterward", async () => {
    await expect(claim("week:2026-09-14")).rejects.toThrow("scheduler_engine_changed");
    await set();
    await expect(claim()).rejects.toThrow("scheduler_engine_changed");
    expect(await claim("week:2026-09-14")).toBeTruthy();
  });
  it("refuses cutover during active or expired unknown work", async () => {
    const token = await claim();
    await expect(set()).rejects.toThrow("scheduler_recovery_required");
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    expect(await claim()).toBeNull();
    await expect(set()).rejects.toThrow("scheduler_recovery_required");
    await db.query("SELECT release_auto_scheduler_lease($1,'p',$2)", [user, token]);
    await set();
    expect(await claim("week:2026-09-14")).toBeTruthy();
  });
  it("serializes weekly starts and requires stale revision rejection on settings", async () => {
    await set();
    await expect(set("paused", 0)).rejects.toThrow("scheduler_control_changed");
    expect(await claim("week:2026-09-14")).toBeTruthy();
    expect(await claim("week:2026-09-21")).toBeNull();
  });
  it("pauses both engines and permits rollback only after prior work completes", async () => {
    await set("paused");
    await expect(claim()).rejects.toThrow("scheduler_engine_changed");
    await expect(claim("week:2026-09-14")).rejects.toThrow("scheduler_engine_changed");
    await set("monthly", 1);
    expect(await claim()).toBeTruthy();
  });
  it("rejects invalid week dates and foreign projects without exposing control to browsers", async () => {
    await set();
    await expect(claim("week:2026-09-15")).rejects.toThrow("invalid_scheduler_lease");
    await expect(claim("week:2026-02-30")).rejects.toThrow();
    await expect(
      db.query("SELECT read_project_scheduler_control($1,'p')", [other]),
    ).rejects.toThrow();
    await db.exec("SET ROLE authenticated");
    await expect(db.query("SELECT read_project_scheduler_control($1,'p')", [user])).rejects.toThrow(
      "permission denied",
    );
    await expect(db.exec("SELECT * FROM project_scheduler_control")).rejects.toThrow(
      "permission denied",
    );
  });
});
