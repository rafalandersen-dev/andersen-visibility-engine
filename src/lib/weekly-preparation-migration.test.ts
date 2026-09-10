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
    "CREATE TABLE ai_generation_usage_receipts(id uuid PRIMARY KEY,user_id uuid,native_attempt_id uuid);CREATE TABLE ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb,discarded_at timestamptz);CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 0);CREATE TABLE scheduled_publishes(id uuid DEFAULT gen_random_uuid(),user_id uuid,project_id text,asset_id text,publish_at timestamptz,status text,attempts integer DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p','{\"autoScheduler\":{\"enabled\":true}}')",
    [user],
  );
  await db.exec(
    "CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE id bigint; BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(p_name,p_schedule,p_command) RETURNING jobid INTO id; RETURN id; END; $$;CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1; $$;INSERT INTO cron.job(jobname,schedule,command) VALUES('monthly-auto-scheduler','0 6 25 * *','existing-monthly-command');",
  );
  for (const migration of [
    "20260907190000_auto_scheduler_leases.sql",
    "20260909200000_project_knowledge.sql",
    "20260910150000_weekly_preparation.sql",
    "20260910170000_publication_approval.sql",
    "20260910180000_weekly_executor.sql",
    "20260910190000_weekly_dispatch.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE;UPDATE workspace_meta SET rev=0;TRUNCATE project_scheduler_control,auto_scheduler_leases,weekly_preparation_stages,ai_generation_results,ai_generation_usage_receipts,weekly_preparation_summaries,publication_approvals,scheduled_publishes;",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("single scheduler cutover ownership", () => {
  it("creates weekly dispatch disabled until runtime verification, preserving the existing monthly timer", async () => {
    expect(
      (await db.query("SELECT jobname,schedule,active FROM cron.job ORDER BY jobname")).rows,
    ).toEqual([
      { jobname: "monthly-auto-scheduler", schedule: "0 6 25 * *", active: true },
      { jobname: "weekly-preparation", schedule: "*/5 * * * *", active: false },
    ]);
    await expect(
      db.exec(readFileSync("supabase/migrations/20260910190000_weekly_dispatch.sql", "utf8")),
    ).rejects.toThrow("weekly_dispatch_already_exists");
  });
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
  it("rechecks a project pause before admitting another stage", async () => {
    await set();
    const token = await claim(period);
    await db.exec('UPDATE workspace_entities SET data=\'{"autoScheduler":{"enabled":false}}\'');
    await expect(begin(token)).rejects.toThrow("scheduler_disabled");
    await db.exec('UPDATE workspace_entities SET data=\'{"autoScheduler":{"enabled":true}}\'');
    expect((await begin(token)).acquired).toBe(true);
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

describe("weekly executor durable cancellation, delivery and summaries", () => {
  const period = "week:2099-09-14",
    hash = "c".repeat(64);
  async function stage(kind = "research") {
    await set();
    const token = await claim(period);
    const result = (
      await db.query<{ result: { requestId: string; outputId: string } }>(
        "SELECT begin_weekly_preparation_stage($1,'p',$2,1,'2099-09-15T07:00:00Z',$3,$4) result",
        [user, token, kind, hash],
      )
    ).rows[0].result;
    return { token, ...result };
  }
  it("refuses cancellation while a worker may run, then reserves the entire slot permanently", async () => {
    const s = await stage();
    await expect(
      db.query("SELECT cancel_weekly_preparation_slot($1,'p',$2)", [user, s.requestId]),
    ).rejects.toThrow("weekly_worker_active");
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    await db.query("SELECT cancel_weekly_preparation_slot($1,'p',$2)", [user, s.requestId]);
    const token = await claim(period);
    await expect(
      db.query(
        "SELECT begin_weekly_preparation_stage($1,'p',$2,1,'2099-09-15T07:00:00Z','content',$3)",
        [user, token, hash],
      ),
    ).rejects.toThrow("weekly_slot_cancelled");
    await expect(
      db.query("SELECT finish_weekly_preparation_stage($1,'p',$2,$3,'{}'::jsonb)", [
        user,
        s.requestId,
        hash,
      ]),
    ).rejects.toThrow("weekly_stage_changed");
  });
  it("does not treat uncertain research as safely completed during automatic reconciliation", async () => {
    await stage();
    await db.exec("UPDATE auto_scheduler_leases SET lease_until=now()-interval '1 minute'");
    const result = await db.query<{ ok: boolean }>(
      "SELECT reconcile_weekly_preparation($1,'p',$2) ok",
      [user, period],
    );
    expect(result.rows[0].ok).toBe(false);
    expect(await claim(period)).toBeNull();
  });
  it("tracks delivery transactionally, detects owner edits and remembers a deletion", async () => {
    const s = await stage("content");
    await db.query(
      'INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,\'content\',$2,\'{"projectId":"p","title":"Original"}\')',
      [user, s.outputId],
    );
    const read = async () =>
      (
        await db.query<{ result: Array<{ deliveredAt: string | null; outputChanged: boolean }> }>(
          "SELECT read_weekly_preparation_stages($1,'p',$2) result",
          [user, period],
        )
      ).rows[0].result[0];
    expect(await read()).toMatchObject({ outputChanged: false });
    expect((await read()).deliveredAt).toBeTruthy();
    await db.query(
      'UPDATE workspace_entities SET data=data||\'{"title":"Owner edit"}\'::jsonb WHERE entity_id=$1',
      [s.outputId],
    );
    expect((await read()).outputChanged).toBe(true);
    await db.query("DELETE FROM workspace_entities WHERE entity_id=$1", [s.outputId]);
    expect((await read()).deliveredAt).toBeTruthy();
  });
  it.each(["none", "before", "alongside"])(
    "tracks retained image delivery without hiding %s owner edits",
    async (edit) => {
      const content = await stage("content");
      await db.query(
        "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'content',$2,$3)",
        [
          user,
          content.outputId,
          JSON.stringify({ projectId: "p", title: "Original", status: "Draft", images: [] }),
        ],
      );
      const image = (
        await db.query<{ result: { requestId: string; outputId: string } }>(
          "SELECT begin_weekly_preparation_stage($1,'p',$2,1,'2099-09-15T07:00:00Z','image',$3) result",
          [user, content.token, hash],
        )
      ).rows[0].result;
      await db.query("UPDATE weekly_preparation_stages SET state='retained' WHERE request_id=$1", [
        image.requestId,
      ]);
      if (edit === "before")
        await db.query(
          'UPDATE workspace_entities SET data=data||\'{"title":"Owner edit"}\'::jsonb WHERE entity_id=$1',
          [content.outputId],
        );
      const patch = {
        images: [{ id: image.outputId, status: "proposed" }],
        updatedAt: "2099-09-10T10:00:00Z",
        ...(edit === "alongside" ? { title: "Owner edit" } : {}),
      };
      await db.query("UPDATE workspace_entities SET data=data||$2::jsonb WHERE entity_id=$1", [
        content.outputId,
        JSON.stringify(patch),
      ]);
      const read = async () =>
        (
          await db.query<{ result: Array<{ stage: string; outputChanged: boolean }> }>(
            "SELECT read_weekly_preparation_stages($1,'p',$2) result",
            [user, period],
          )
        ).rows[0].result.find((s) => s.stage === "content");
      expect((await read())?.outputChanged).toBe(edit !== "none");
      await db.query(
        'UPDATE workspace_entities SET data=data||\'{"title":"Later owner edit"}\'::jsonb WHERE entity_id=$1',
        [content.outputId],
      );
      expect((await read())?.outputChanged).toBe(true);
    },
  );
  it("deduplicates identical in-app summaries without changing their update time", async () => {
    const summary = { slots: 2, drafted: 1, queued: 0, uncovered: 1, action: "review-required" };
    const save = () =>
      db.query("SELECT save_weekly_preparation_summary($1,'p',$2,$3)", [
        user,
        period,
        JSON.stringify(summary),
      ]);
    await save();
    await db.exec("UPDATE weekly_preparation_summaries SET updated_at='2026-01-01T00:00:00Z'");
    await save();
    expect(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM weekly_preparation_summaries"))
        .rows[0].n,
    ).toBe(1);
    const read = await db.query<{ result: { updatedAt: string } }>(
      "SELECT read_weekly_preparation_summary($1,'p',$2) result",
      [user, period],
    );
    expect(Date.parse(read.rows[0].result.updatedAt)).toBe(Date.parse("2026-01-01T00:00:00Z"));
    await expect(
      db.query("SELECT read_weekly_preparation_summary($1,'p',$2)", [other, period]),
    ).rejects.toThrow();
  });
  it("requires exact workspace revision, current autopilot and no withdrawal for atomic approval/queue", async () => {
    await db.exec(
      'UPDATE workspace_entities SET data=\'{"autoScheduler":{"enabled":true,"mode":"auto_publish"}}\' WHERE collection=\'projects\'',
    );
    const token = await claim("2099-09");
    await db.query(
      'INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,\'content\',\'atomic-asset\',\'{"projectId":"p","status":"Approved","autoSchedulerPlannedAt":"2099-09-15T07:00:00Z"}\')',
      [user],
    );
    const arm = (expected = 0) =>
      db.query<{ ok: boolean }>(
        "SELECT arm_scheduler_publication($1,'p','atomic-asset',$2,$3,'2099-09-15T07:00:00Z',$4) ok",
        [user, expected, hash, token],
      );
    await expect(arm(1)).rejects.toThrow("scheduler_publication_changed");
    expect((await db.query("SELECT * FROM publication_approvals")).rows).toHaveLength(0);
    await db.query("SELECT set_publication_approval($1,'p','atomic-asset',0,$2,false)", [
      user,
      hash,
    ]);
    await expect(arm()).rejects.toThrow("scheduler_authority_changed");
    expect((await db.query("SELECT * FROM scheduled_publishes")).rows).toHaveLength(0);
    await db.query("SELECT set_publication_approval($1,'p','atomic-asset',0,$2,true)", [
      user,
      hash,
    ]);
    expect((await arm()).rows[0].ok).toBe(true);
    expect((await arm()).rows[0].ok).toBe(false);
    expect((await db.query("SELECT * FROM scheduled_publishes")).rows).toHaveLength(1);
    await db.query("DELETE FROM workspace_entities WHERE entity_id='atomic-asset'");
    await db.exec(
      "UPDATE workspace_entities SET data='{\"autoScheduler\":{\"enabled\":true}}' WHERE collection='projects'",
    );
  });
});

describe("manual exact-approval scheduling admission", () => {
  const hash = "d".repeat(64);
  it("preserves a pending schedule on missing/stale approval and atomically replaces it after approval", async () => {
    await db.query(
      'INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,\'content\',\'manual-asset\',\'{"projectId":"p","status":"Approved"}\')',
      [user],
    );
    await db.query(
      "INSERT INTO scheduled_publishes(user_id,project_id,asset_id,publish_at,status) VALUES($1,'p','manual-asset','2099-09-15T07:00:00Z','pending')",
      [user],
    );
    const schedule = (expected = 0) =>
      db.query<{ result: { status: string; publish_at: string } }>(
        "SELECT schedule_approved_publication($1,'p','manual-asset',$2,$3,'2099-09-17T07:00:00Z') result",
        [user, expected, hash],
      );
    await expect(schedule()).rejects.toThrow("schedule_approval_changed");
    expect(
      (await db.query("SELECT * FROM scheduled_publishes WHERE status='pending'")).rows,
    ).toHaveLength(1);
    await db.query("SELECT set_publication_approval($1,'p','manual-asset',0,$2,true)", [
      user,
      hash,
    ]);
    await expect(schedule(1)).rejects.toThrow("schedule_approval_changed");
    expect(
      (await db.query("SELECT * FROM scheduled_publishes WHERE status='cancelled'")).rows,
    ).toHaveLength(0);
    expect((await schedule()).rows[0].result.status).toBe("pending");
    expect(
      (await db.query("SELECT * FROM scheduled_publishes WHERE status='cancelled'")).rows,
    ).toHaveLength(1);
    await db.exec("UPDATE scheduled_publishes SET status='publishing' WHERE status='pending'");
    await expect(schedule()).rejects.toThrow("schedule_in_flight");
    expect(
      (await db.query("SELECT * FROM scheduled_publishes WHERE status='publishing'")).rows,
    ).toHaveLength(1);
    await db.query("DELETE FROM workspace_entities WHERE entity_id='manual-asset'");
  });
});
