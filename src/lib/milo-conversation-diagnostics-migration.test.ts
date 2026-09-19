import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Candidate-only migration proof (NOT part of the applied release set): the
// service-only diagnostics receipt validates its constrained enums, is reachable
// only by the service role through the SECURITY DEFINER writer, is directly
// readable for inspection, cascades on turn erase and prunes on retention. PGlite
// is single-connection, so this proves the SQL surface, not live concurrency.

const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
let turnId: string;
let conversationId: string;
let nextOrdinal: number;

beforeAll(async () => {
  db = new PGlite();
  // The candidate migration wires a daily pg_cron retention sweep, so the fixture
  // stubs the cron surface it schedules against (same shape as the released
  // dispatch/candidate-chain fixtures) before the migration is applied.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users(id) VALUES('${owner}'),('${actor}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}');
    INSERT INTO public.workspace_entities(user_id,collection,entity_id) VALUES('${owner}','projects','p');
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;`);
  for (const name of [
    "20260911020000_project_team_reads.sql",
    "20260913120000_milo_conversations.sql",
    "20260919160000_milo_conversation_diagnostics.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(
    `RESET ROLE; TRUNCATE public.milo_conversations,public.milo_conversation_turns,public.milo_conversation_diagnostics CASCADE;`,
  );
  conversationId = randomUUID();
  turnId = randomUUID();
  // Additional turns for one-per-turn/retention proofs take ordinals from here; the
  // single active turn stays the running one, so seeded turns are terminal.
  nextOrdinal = 2;
  await db.query(
    "INSERT INTO public.milo_conversations(conversation_id,actor_id,owner_id,project_id,title,turn_count) VALUES($1,$2,$3,'p','Safari',1)",
    [conversationId, actor, owner],
  );
  await db.query(
    "INSERT INTO public.milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state) VALUES($1,$2,$3,1,'Pytanie','pl',1,'running')",
    [turnId, conversationId, actor],
  );
});

// A distinct, terminal-state turn in the same conversation, so multiple receipts
// can exist across turns without violating the one-active-turn or one-per-turn rules.
const seedTurn = async (state = "failed") => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO public.milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state) VALUES($1,$2,$3,$4,'Pytanie','pl',1,$5)",
    [id, conversationId, actor, nextOrdinal++, state],
  );
  return id;
};

const record = (
  overrides: Partial<{
    turn: string;
    operation: string | null;
    stage: string;
    outcome: string;
    outcomeCode: string;
    errorClass: string;
    nameCategory: string;
    httpStatus: number | null;
    sqlState: string | null;
    provenance: string;
  }> = {},
) =>
  db.query("SELECT public.record_milo_conversation_diagnostic($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
    overrides.turn ?? turnId,
    overrides.operation === undefined ? null : overrides.operation,
    overrides.stage ?? "brief_start",
    overrides.outcome ?? "unknown",
    overrides.outcomeCode ?? "execution_unknown",
    overrides.errorClass ?? "unknown",
    overrides.nameCategory ?? "other",
    overrides.httpStatus === undefined ? null : overrides.httpStatus,
    overrides.sqlState === undefined ? "55P03" : overrides.sqlState,
    // Default to a terminal (acquired-execution) receipt, so the existing single-row
    // proofs are terminal->terminal first-wins; provenance transitions are covered below.
    overrides.provenance ?? "terminal",
  ]);
const rows = async () =>
  (
    await db.query<{ turn_id: string; stage: string; sql_state: string | null }>(
      "SELECT turn_id,stage,sql_state FROM public.milo_conversation_diagnostics ORDER BY created_at",
    )
  ).rows;

describe("service-only Milo conversation diagnostics receipts", () => {
  it("stores a bounded receipt with only correlation ids and constrained enums", async () => {
    const operation = randomUUID();
    await record({ operation });
    const stored = await db.query<{
      turn_id: string;
      operation_id: string;
      stage: string;
      outcome: string;
      outcome_code: string;
      error_class: string;
      name_category: string;
      http_status: number | null;
      sql_state: string | null;
    }>("SELECT * FROM public.milo_conversation_diagnostics");
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      turn_id: turnId,
      operation_id: operation,
      stage: "brief_start",
      outcome: "unknown",
      outcome_code: "execution_unknown",
      error_class: "unknown",
      name_category: "other",
      http_status: null,
      sql_state: "55P03",
    });
    // Columns are strictly the safe correlation/enum set — no body/prompt/message.
    expect(Object.keys(stored.rows[0]).sort()).toEqual(
      [
        "created_at",
        "error_class",
        "http_status",
        "id",
        "name_category",
        "operation_id",
        "outcome",
        "outcome_code",
        "provenance",
        "sql_state",
        "stage",
        "turn_id",
      ].sort(),
    );
  });
  it("is a silent no-op when the turn does not exist, never raising back to the executor", async () => {
    await expect(record({ turn: randomUUID() })).resolves.toBeDefined();
    expect(await rows()).toHaveLength(0);
  });
  it("rejects any value outside the constrained enums, http range or SQLSTATE allowlist", async () => {
    await expect(record({ stage: "provider_dispatch" })).rejects.toThrow();
    await expect(record({ outcome: "completed" })).rejects.toThrow();
    await expect(record({ outcomeCode: "history_partial" })).rejects.toThrow();
    await expect(record({ errorClass: "made_up" })).rejects.toThrow();
    await expect(record({ nameCategory: "SecretName" })).rejects.toThrow();
    await expect(record({ httpStatus: 200 })).rejects.toThrow();
    await expect(record({ sqlState: "99999" })).rejects.toThrow();
    await expect(record({ provenance: "guessed" })).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });
  it("accepts a null SQLSTATE and null operation for non-lock, turn-level failures", async () => {
    await record({ operation: null, stage: "continuity_check", sqlState: null });
    expect(await rows()).toEqual([{ turn_id: turnId, stage: "continuity_check", sql_state: null }]);
  });
  it("keeps at most one receipt per turn, preserving the first stage, SQLSTATE and time", async () => {
    await record({ stage: "brief_start", sqlState: "55P03" });
    const original = (
      await db.query<{ created_at: string }>(
        "SELECT created_at FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
        [turnId],
      )
    ).rows[0].created_at;
    // Both writes are terminal (the helper default), so the second terminal write for
    // the SAME turn is ignored: a duplicate or racing terminal can never overwrite the
    // first terminal's stage/SQLSTATE/outcome/time (first-terminal-wins idempotency).
    await record({
      stage: "assert_live",
      sqlState: null,
      outcome: "failed",
      outcomeCode: "provider_unavailable",
    });
    const stored = await db.query<{
      stage: string;
      sql_state: string | null;
      outcome: string;
      created_at: string;
    }>(
      "SELECT stage,sql_state,outcome,created_at FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
      [turnId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      stage: "brief_start",
      sql_state: "55P03",
      outcome: "unknown",
    });
    expect(stored.rows[0].created_at).toEqual(original);
  });
  it("upgrades a preliminary claim receipt to a later terminal acquired-execution receipt", async () => {
    // A pre-claim (preliminary) receipt reserves the turn's single row, but the turn is
    // still pending and may be re-dispatched; a later terminal (acquired-execution)
    // failure MUST replace it in place so the real evidence is never lost.
    await record({ stage: "unknown", sqlState: "55P03", provenance: "preliminary" });
    await record({
      stage: "reply_model",
      sqlState: null,
      outcome: "failed",
      outcomeCode: "provider_unavailable",
      provenance: "terminal",
    });
    const stored = await db.query<{
      stage: string;
      sql_state: string | null;
      outcome: string;
      provenance: string;
    }>(
      "SELECT stage,sql_state,outcome,provenance FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
      [turnId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      stage: "reply_model",
      sql_state: null,
      outcome: "failed",
      provenance: "terminal",
    });
  });
  it("never lets a delayed preliminary claim receipt overwrite an existing terminal receipt", async () => {
    await record({
      stage: "reply_model",
      sqlState: null,
      outcome: "failed",
      outcomeCode: "provider_unavailable",
      provenance: "terminal",
    });
    // A late claim-time (preliminary) write for the same turn — e.g. a retry that fails
    // at claim after the terminal outcome was already recorded — is ignored.
    await record({ stage: "unknown", sqlState: "55P03", provenance: "preliminary" });
    const stored = await db.query<{ stage: string; provenance: string }>(
      "SELECT stage,provenance FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
      [turnId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ stage: "reply_model", provenance: "terminal" });
  });
  it("keeps the first terminal receipt when a second terminal write arrives (first-terminal-wins)", async () => {
    await record({ stage: "reply_model", sqlState: null, provenance: "terminal" });
    const original = (
      await db.query<{ created_at: string }>(
        "SELECT created_at FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
        [turnId],
      )
    ).rows[0].created_at;
    await record({
      stage: "tool_dispatch",
      sqlState: "55P03",
      outcome: "failed",
      outcomeCode: "budget_unavailable",
      provenance: "terminal",
    });
    const stored = await db.query<{ stage: string; sql_state: string | null; created_at: string }>(
      "SELECT stage,sql_state,created_at FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
      [turnId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ stage: "reply_model", sql_state: null });
    expect(stored.rows[0].created_at).toEqual(original);
  });
  it("cascades diagnostics on turn erase and prunes only receipts past the 30-day window", async () => {
    // Two DISTINCT turns each hold one receipt (one-per-turn forbids two for the
    // same turn); the older one is swept, and erasing the survivor cascades its row.
    const aged = await seedTurn();
    await record();
    await record({ turn: aged, stage: "assert_live", sqlState: null });
    expect(await rows()).toHaveLength(2);
    await db.query(
      "UPDATE public.milo_conversation_diagnostics SET created_at=now()-interval '40 days' WHERE turn_id=$1",
      [aged],
    );
    const pruned = await db.query<{ result: number }>(
      "SELECT public.prune_milo_conversation_diagnostics() result",
    );
    expect(pruned.rows[0].result).toBe(1);
    expect(await rows()).toEqual([{ turn_id: turnId, stage: "brief_start", sql_state: "55P03" }]);
    // Erasing the surviving turn cascades to its diagnostic.
    await db.query("DELETE FROM public.milo_conversation_turns WHERE turn_id=$1", [turnId]);
    expect(await rows()).toHaveLength(0);
  });
  it("prunes in a bounded batch, leaving a backlog for the next daily run", async () => {
    // Three aged receipts across distinct turns. A limited sweep removes only its
    // batch instead of an unbounded delete; a later run drains the remainder.
    for (const turn of [await seedTurn(), await seedTurn(), await seedTurn()])
      await record({ turn, sqlState: null });
    await db.query(
      "UPDATE public.milo_conversation_diagnostics SET created_at=now()-interval '40 days'",
    );
    const first = await db.query<{ result: number }>(
      "SELECT public.prune_milo_conversation_diagnostics(now()-interval '30 days',2) result",
    );
    expect(first.rows[0].result).toBe(2);
    expect(await rows()).toHaveLength(1);
    const second = await db.query<{ result: number }>(
      "SELECT public.prune_milo_conversation_diagnostics(now()-interval '30 days',2) result",
    );
    expect(second.rows[0].result).toBe(1);
    expect(await rows()).toHaveLength(0);
  });
  it("schedules an active daily retention sweep that runs regardless of conversation dispatch", async () => {
    // Active on apply (unlike the release-gated dispatcher): ordinary data retention
    // must keep running even while conversation dispatch is disabled.
    const jobs = await db.query<{
      jobname: string;
      schedule: string;
      command: string;
      active: boolean;
    }>(
      "SELECT jobname,schedule,command,active FROM cron.job WHERE jobname='milo-conversation-diagnostics-prune'",
    );
    expect(jobs.rows).toEqual([
      {
        jobname: "milo-conversation-diagnostics-prune",
        schedule: "23 4 * * *",
        command: "SELECT public.prune_milo_conversation_diagnostics();",
        active: true,
      },
    ]);
  });
  it("keeps writes function-only and reads service-only, denying browser roles", async () => {
    await record();
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM public.milo_conversation_diagnostics")).rejects.toThrow(
        /permission denied/,
      );
      await expect(record()).rejects.toThrow(/permission denied/);
      await expect(db.query("SELECT public.prune_milo_conversation_diagnostics()")).rejects.toThrow(
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    // The service role inspects via a direct read but cannot write except through
    // the SECURITY DEFINER function.
    await db.exec("SET ROLE service_role");
    expect(
      (await db.query("SELECT * FROM public.milo_conversation_diagnostics")).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        "INSERT INTO public.milo_conversation_diagnostics(turn_id,stage,outcome,outcome_code,error_class,name_category) VALUES($1,'brief_start','unknown','execution_unknown','unknown','other')",
        [turnId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("DELETE FROM public.milo_conversation_diagnostics")).rejects.toThrow(
      /permission denied/,
    );
    await expect(record()).resolves.toBeDefined();
    await db.exec("RESET ROLE");
  });
});
