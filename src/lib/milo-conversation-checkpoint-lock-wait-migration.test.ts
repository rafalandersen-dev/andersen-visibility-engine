import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ConversationTurn } from "./milo-conversation";

// Candidate-only migration proof for 20260920180000: the executor checkpoint RPCs
// (claim / advance / check_execution) are redefined to run under a bounded
// `lock_timeout` and to take their owner/conversation/turn locks WITHOUT NOWAIT, via a
// new executor-only `assert_milo_conversation_execution`.
//
// The prerequisite chain is the ACTUAL released set the candidate redefines on top of:
// project-team reads (20260911020000), conversations (20260913120000) AND the dispatch
// migration (20260913160000) — so `claim` is validated against its LATEST released body
// (the enabled-control, dispatch-window, advisory-admission and global-8/actor-2 gates),
// not the older 20260913120000 definition. The candidate must PRESERVE every one of
// those gates and change only the lock wait + the executor assert. The net/vault/cron
// stubs mirror milo-dispatch-migration.test.ts so the dispatch migration applies, and
// the tests use the real begin/claim RPCs with valid owner/actor bindings so every row
// (conversation + turn, with a paired attempt_id/lease_until) is authentic.
//
// LIMITATION (honest): PGlite is single-connection, so it CANNOT hold a conflicting
// `workspace_meta`/conversation lock in another session; the actual bounded-WAIT
// behaviour under real cross-connection contention (the point of the change) is NOT
// exercised here and must be validated on a multi-connection PostgreSQL. These tests
// prove the redefinition is FUNCTIONALLY faithful (same gates, lease, expected count and
// idempotency) and that the bounded lock_timeout is set.

const users = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const owner = users[0];
const collaborator = users[1]; // an active project member (editor)
const stranger = users[9]; // authenticated, but never a project member
let db: PGlite;

async function query<T = unknown>(sql: string, params: unknown[] = []) {
  return (await db.query<{ result: T }>(`SELECT public.${sql} result`, params)).rows[0].result;
}
const target = (actorId = owner) => ({
  actorId,
  ownerId: owner,
  projectId: "p",
  conversationId: randomUUID(),
  turnId: randomUUID(),
});
type Target = ReturnType<typeof target>;
const params = (t: Target) => [t.actorId, t.ownerId, t.projectId, t.conversationId, t.turnId];
const begin = (t: Target) =>
  query<{ created: boolean; turn: ConversationTurn }>(
    "begin_milo_conversation_turn($1,$2,$3,$4,$5,'Stored task','en')",
    params(t),
  );
const claim = (t: Target) =>
  query<{ acquired: boolean; attemptId: string | null; turn: ConversationTurn }>(
    "claim_milo_conversation_turn($1,$2,$3,$4,$5)",
    params(t),
  );
const advance = (t: Target, attempt: string | null, expected: number, state = "running") =>
  query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    ...params(t),
    attempt,
    expected,
    JSON.stringify([{ kind: "handoff", role: "lead", text: "ok" }]),
    state,
  ]);
const windowOf = async (turnId: string) =>
  (
    await db.query<{ dispatch_until: string | null }>(
      "SELECT dispatch_until FROM milo_conversation_turns WHERE turn_id=$1",
      [turnId],
    )
  ).rows[0].dispatch_until;
const runningCount = async () =>
  (await db.query("SELECT 1 FROM milo_conversation_turns WHERE state='running'")).rows.length;
const enable = () => db.exec("UPDATE milo_conversation_dispatch_control SET enabled=true");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users(id) VALUES ${users.map((id) => `('${id}')`).join(",")};
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    INSERT INTO workspace_meta(user_id) VALUES('${owner}');
    CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"name":"Saved client"}');
    CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
    CREATE SCHEMA net;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
    RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE request_id bigint; BEGIN
      INSERT INTO net.requests(url,body,timeout_ms) VALUES(url,body,timeout_milliseconds) RETURNING id INTO request_id; RETURN request_id;
    END; $$;
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;
  `);
  for (const name of [
    "20260911020000_project_team_reads.sql",
    "20260913120000_milo_conversations.sql",
    "20260913160000_milo_conversation_dispatch.sql",
    "20260920180000_milo_conversation_checkpoint_lock_wait.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE workspace_entities,project_team_members,milo_conversations,milo_conversation_turns,project_team_preview_limits,milo_conversation_dispatch_attempts,net.requests;
    UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;
    UPDATE milo_conversation_dispatch_control SET enabled=false;
    DELETE FROM vault.decrypted_secrets; INSERT INTO vault.decrypted_secrets VALUES('auto_scheduler_secret','fixture-only');
    INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"name":"Saved client"}');
    INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES ${users
      .slice(1, 9)
      .map((id) => `('${owner}','p','${id}','editor')`)
      .join(",")};`);
});

describe("executor checkpoint RPCs: bounded lock wait added, all released gates preserved", () => {
  it("sets a bounded lock_timeout on the redefined RPCs and the executor access assert, keeping search_path locked", async () => {
    const rows = (
      await db.query<{ proname: string; proconfig: string[] | null }>(
        `SELECT proname, proconfig FROM pg_proc WHERE proname IN
           ('assert_milo_conversation_execution','claim_milo_conversation_turn',
            'advance_milo_conversation_turn','check_milo_conversation_execution')
         ORDER BY proname`,
      )
    ).rows;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const lockCfg = row.proconfig?.find((c) => c.startsWith("lock_timeout="));
      expect(lockCfg).toBeDefined();
      // A bounded, non-zero value (0/empty would mean "wait forever").
      const ms = Number(/^lock_timeout=(\d+)/.exec(lockCfg ?? "")?.[1] ?? "0");
      expect(ms).toBeGreaterThan(0);
      // Per-lock; up to ~4 blocking acquisitions per RPC must stay under the 10s teamCall.
      expect(ms * 4).toBeLessThan(10000);
      expect(row.proconfig?.some((c) => c.startsWith("search_path="))).toBe(true);
    }
  });

  it("does not acquire while the dispatch control is OFF (enabled gate preserved)", async () => {
    const task = target();
    await begin(task); // a window is armed by default; the control itself is disabled
    expect(await claim(task)).toMatchObject({ acquired: false, attemptId: null });
    expect((await claim(task)).turn.state).toBe("pending");
  });

  it("does not acquire without a fresh dispatch window (absent or expired), a gate distinct from the disabled control", async () => {
    // Precondition: `begin` initializes a start window (the dispatch_until column
    // default) even while the control is OFF — so the disabled-control refusal above is
    // the `enabled` gate, NOT an absent window. The two gates are exercised separately.
    const armed = target();
    await begin(armed);
    expect(await windowOf(armed.turnId)).not.toBeNull();

    await enable();
    // Absent window: force dispatch_until NULL and confirm the NULL gate denies.
    await db.query("UPDATE milo_conversation_turns SET dispatch_until=NULL WHERE turn_id=$1", [
      armed.turnId,
    ]);
    expect((await claim(armed)).acquired).toBe(false);
    // Expired window: a past dispatch_until denies.
    const expired = target();
    await begin(expired);
    await db.query(
      "UPDATE milo_conversation_turns SET dispatch_until=clock_timestamp()-interval '1 second' WHERE turn_id=$1",
      [expired.turnId],
    );
    expect((await claim(expired)).acquired).toBe(false);
    expect(await runningCount()).toBe(0);
  });

  it("preserves the actor-2 running-turn concurrency admission gate", async () => {
    await enable();
    const mine = [target(), target(), target()]; // actor == owner
    for (const t of mine) await begin(t);
    expect((await claim(mine[0])).acquired).toBe(true);
    expect((await claim(mine[1])).acquired).toBe(true);
    expect((await claim(mine[2])).acquired).toBe(false);
    expect((await claim(mine[2])).turn.state).toBe("pending");
  });

  it("preserves the global-8 running-turn concurrency admission gate", async () => {
    await enable();
    // Four members each hold the actor-2 maximum ⇒ eight running turns, all real rows
    // (conversation + turn) with paired attempt_id/lease_until minted by claim.
    for (const who of users.slice(1, 5))
      for (let i = 0; i < 2; i++) {
        const t = target(who);
        await begin(t);
        expect((await claim(t)).acquired).toBe(true);
      }
    expect(await runningCount()).toBe(8);
    const ninth = target(users[5]);
    await begin(ninth);
    expect((await claim(ninth)).acquired).toBe(false);
    expect((await claim(ninth)).turn.state).toBe("pending");
    // Freeing one running slot re-opens global admission for the ninth.
    await db.exec(
      "UPDATE milo_conversation_turns SET state='completed' WHERE turn_id=(SELECT turn_id FROM milo_conversation_turns WHERE state='running' LIMIT 1)",
    );
    expect((await claim(ninth)).acquired).toBe(true);
  });

  it("does not re-acquire an already-claimed turn (no attempt replay)", async () => {
    await enable();
    const task = target();
    await begin(task);
    const first = await claim(task);
    expect(first.acquired).toBe(true);
    const second = await claim(task);
    expect(second.acquired).toBe(false);
    expect(second.attemptId).toBeNull();
    expect(second.turn.state).toBe("running"); // the live claim is unchanged
  });

  it("refuses a stranger, a suspended account and a revoked collaborator at the executor assert", async () => {
    await enable();
    const task = target();
    await begin(task);
    // Non-member actor (authenticated but never granted the project).
    await expect(
      claim({ ...task, actorId: stranger, conversationId: randomUUID() }),
    ).rejects.toThrow(/milo_conversation_unavailable/);
    // Suspended owner account.
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=$1",
      [owner],
    );
    await expect(claim(task)).rejects.toThrow(/milo_conversation_unavailable/);
    await db.exec("UPDATE auth.users SET banned_until=NULL");
    // Revoked collaborator membership.
    const collab = target(collaborator);
    await begin(collab);
    await db.query("UPDATE project_team_members SET active=false WHERE actor_id=$1", [
      collaborator,
    ]);
    await expect(claim(collab)).rejects.toThrow(/milo_conversation_unavailable/);
  });

  it("claims, advances and rechecks a valid turn end to end, persisting the checkpoint", async () => {
    await enable();
    const task = target();
    await begin(task);
    const claimed = await claim(task);
    expect(claimed.acquired).toBe(true);
    const attempt = claimed.attemptId!;
    // Wrong expected count and wrong attempt token still conflict and persist nothing.
    await expect(advance(task, attempt, 5)).rejects.toThrow(/milo_conversation_conflict/);
    await expect(advance(task, randomUUID(), 0)).rejects.toThrow(/milo_conversation_conflict/);
    // A correct checkpoint commits the event.
    await advance(task, attempt, 0);
    const stored = await db.query<{ events: unknown[]; state: string }>(
      "SELECT events,state FROM milo_conversation_turns WHERE turn_id=$1",
      [task.turnId],
    );
    expect(stored.rows[0].events).toHaveLength(1);
    expect(stored.rows[0].state).toBe("running");
    // The liveness recheck confirms the same live claim.
    expect(
      await query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...params(task),
        attempt,
      ]),
    ).toBe(true);
    // A stale attempt token is refused by the recheck.
    await expect(
      query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...params(task),
        randomUUID(),
      ]),
    ).rejects.toThrow(/milo_conversation_unavailable/);
  });

  it("does not accept a late checkpoint after the attempt lease expires", async () => {
    await enable();
    const task = target();
    await begin(task);
    const attempt = (await claim(task)).attemptId!;
    await db.exec(
      "UPDATE milo_conversation_turns SET lease_until=clock_timestamp()-interval '1 second'",
    );
    await expect(advance(task, attempt, 0)).rejects.toThrow(/milo_conversation_conflict/);
    await expect(
      query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [...params(task), attempt]),
    ).rejects.toThrow(/milo_conversation_unavailable/);
  });

  it("keeps the executor access assert ungranted and the three RPCs service_role-only", async () => {
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "SELECT has_function_privilege($1,'assert_milo_conversation_execution(uuid,uuid,text)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(false);
    for (const fn of [
      "claim_milo_conversation_turn(uuid,uuid,text,uuid,uuid)",
      "advance_milo_conversation_turn(uuid,uuid,text,uuid,uuid,uuid,integer,jsonb,text)",
      "check_milo_conversation_execution(uuid,uuid,text,uuid,uuid,uuid)",
    ])
      for (const role of ["anon", "authenticated", "service_role"])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "SELECT has_function_privilege($1,$2,'EXECUTE') allowed",
              [role, fn],
            )
          ).rows[0].allowed,
        ).toBe(role === "service_role");
  });
});
