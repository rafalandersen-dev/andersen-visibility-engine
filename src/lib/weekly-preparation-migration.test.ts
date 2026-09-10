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
    "CREATE TABLE ai_generation_usage_receipts(id uuid PRIMARY KEY,user_id uuid,native_attempt_id uuid);CREATE TABLE ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb,discarded_at timestamptz);CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
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
  await db.exec(
    "RESET ROLE;TRUNCATE project_scheduler_control,auto_scheduler_leases,weekly_preparation_stages,ai_generation_results,ai_generation_usage_receipts;",
  );
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

describe("durable weekly stage identity", () => {
  const hash = "a".repeat(64);
  const period = "week:2099-09-14";
  async function begin(token: string | null, stage = "content", inputHash = hash, owner = user) {
    return (
      await db.query<{
        result: {
          acquired: boolean;
          requestId: string;
          outputId: string;
          state: string;
          inputHash: string;
          result: unknown;
        };
      }>("SELECT begin_weekly_preparation_stage($1,'p',$2,1,'2099-09-15T07:00:00Z',$3,$4) result", [
        owner,
        token,
        stage,
        inputHash,
      ])
    ).rows[0].result;
  }
  it("allocates once and retains identity after an uncertain completion", async () => {
    await set();
    const token = await claim(period);
    const first = await begin(token);
    expect(first.acquired).toBe(true);
    const duplicate = await begin(token, "content", "b".repeat(64));
    expect(duplicate).toMatchObject({
      acquired: false,
      requestId: first.requestId,
      outputId: first.outputId,
      state: "unknown",
      inputHash: hash,
    });
    await db.query("SELECT finish_weekly_preparation_stage($1,'p',$2,$3,NULL)", [
      user,
      first.requestId,
      hash,
    ]);
    await db.query("SELECT release_auto_scheduler_lease($1,'p',$2)", [user, token]);
    await expect(set("monthly", 1)).rejects.toThrow("scheduler_recovery_required");
    expect(await claim(period)).toBeNull();
  });
  it("accepts late same-attempt retention but never overwrites a retained result", async () => {
    await set();
    const token = await claim(period);
    const first = await begin(token);
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    await db.query("INSERT INTO ai_generation_usage_receipts VALUES($1,$2,$1)", [
      first.requestId,
      user,
    ]);
    await db.query(
      "INSERT INTO ai_generation_results(receipt_id,user_id,payload) VALUES($1,$2,$3)",
      [
        first.requestId,
        user,
        JSON.stringify({ projectId: "p", kind: "content", assetId: first.outputId }),
      ],
    );
    await db.query("SELECT finish_weekly_preparation_stage($1,'p',$2,$3,$4)", [
      user,
      first.requestId,
      hash,
      JSON.stringify({ receiptId: first.requestId }),
    ]);
    await expect(
      db.query("SELECT finish_weekly_preparation_stage($1,'p',$2,$3,$4)", [
        user,
        first.requestId,
        hash,
        JSON.stringify({ receiptId: "different" }),
      ]),
    ).rejects.toThrow("weekly_stage_changed");
    const read = await db.query<{ result: Array<{ state: string }> }>(
      "SELECT read_weekly_preparation_stages($1,'p',$2) result",
      [user, period],
    );
    expect(read.rows[0].result[0].state).toBe("retained");
  });
  it("recovers only an exact archived attempt and output without generating again", async () => {
    await set();
    const token = await claim(period);
    const first = await begin(token);
    await expect(
      db.query("SELECT finish_weekly_preparation_stage($1,'p',$2,$3,$4)", [
        user,
        first.requestId,
        hash,
        JSON.stringify({ receiptId: first.requestId }),
      ]),
    ).rejects.toThrow("weekly_result_unconfirmed");
    const recover = () =>
      db.query<{ result: unknown }>("SELECT recover_weekly_preparation_stage($1,'p',$2) result", [
        user,
        first.requestId,
      ]);
    expect((await recover()).rows[0].result).toBeNull();
    await db.query("INSERT INTO ai_generation_usage_receipts VALUES($1,$2,$1)", [
      first.requestId,
      user,
    ]);
    await db.query(
      "INSERT INTO ai_generation_results(receipt_id,user_id,payload) VALUES($1,$2,$3)",
      [
        first.requestId,
        user,
        JSON.stringify({ projectId: "foreign", kind: "content", assetId: first.outputId }),
      ],
    );
    expect((await recover()).rows[0].result).toBeNull();
    await db.query(
      'UPDATE ai_generation_results SET payload=payload||\'{"projectId":"p"}\'::jsonb',
    );
    expect((await recover()).rows[0].result).toEqual({ receiptId: first.requestId });
    expect(await begin(token)).toMatchObject({
      acquired: false,
      state: "retained",
      requestId: first.requestId,
    });
  });
  it("rejects foreign scope, expired lease, another period and browser direct access", async () => {
    await set();
    const token = await claim(period);
    await expect(begin(token, "content", hash, other)).rejects.toThrow(
      "knowledge_project_unavailable",
    );
    await expect(
      db.query(
        "SELECT begin_weekly_preparation_stage($1,'p',$2,1,'2099-09-22T07:00:00Z','content',$3)",
        [user, token, hash],
      ),
    ).rejects.toThrow("invalid_weekly_stage");
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    await expect(begin(token)).rejects.toThrow("scheduler_engine_changed");
    await db.exec("SET ROLE authenticated");
    await expect(db.query("SELECT * FROM weekly_preparation_stages")).rejects.toThrow(
      "permission denied",
    );
    await expect(begin(token)).rejects.toThrow("permission denied");
  });
});
