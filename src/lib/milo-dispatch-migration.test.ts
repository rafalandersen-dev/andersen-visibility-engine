import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceConversationTurn,
  assertConversationExecution,
  beginConversationTurn,
  claimConversationTurn,
  readConversation,
  resumeConversationTurn,
} from "./milo-conversation.server";
import { runConversationSpecialists } from "./milo-specialist-executor.server";
import { runSpecialistTool } from "./milo-specialist-tools.server";
import { handleMiloDispatch } from "./milo-dispatch.server";
import type { TeamReadRpc } from "./project-team-read.server";
import type { ConversationTurn } from "./milo-conversation";
const users = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [owner, actor, other] = users;
let db: PGlite;
let legacyWindow: unknown;
const migration = readFileSync(
  "supabase/migrations/20260913160000_milo_conversation_dispatch.sql",
  "utf8",
);
const legacyConversation = randomUUID(),
  legacyTurn = randomUUID();
async function query<T = unknown>(sql: string, params: unknown[] = []) {
  return (await db.query<{ result: T }>(`SELECT public.${sql} result`, params)).rows[0].result;
}
const target = (who = actor) => ({
  actorId: who,
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
const resume = (t: Target) =>
  query<ConversationTurn>("resume_milo_conversation_turn($1,$2,$3,$4,$5)", params(t));
const cancel = (t: Target) => query("cancel_milo_conversation_turn($1,$2,$3,$4,$5)", params(t));
const enable = () => db.exec("UPDATE milo_conversation_dispatch_control SET enabled=true");
const drain = () => query<number>("dispatch_pending_milo_turns()");
const queued = async () =>
  (
    await db.query<{ body: Target; url: string; timeout_ms: number }>(
      "SELECT body,url,timeout_ms FROM net.requests ORDER BY id",
    )
  ).rows;
const rpc: TeamReadRpc = async (name, args) => {
  const entries = Object.entries(args);
  try {
    return {
      data: await query(
        `${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")})`,
        entries.map(([, value]) => value),
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};
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
    CREATE TABLE net.control(fail boolean DEFAULT false); INSERT INTO net.control DEFAULT VALUES;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
    RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE request_id bigint; BEGIN
      IF (SELECT fail FROM net.control) THEN RAISE EXCEPTION 'fixture_transport_failure'; END IF;
      IF headers->>'Authorization'<>'Bearer fixture-only' THEN RAISE EXCEPTION 'fixture_auth_invalid'; END IF;
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
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await begin({
    actorId: owner,
    ownerId: owner,
    projectId: "p",
    conversationId: legacyConversation,
    turnId: legacyTurn,
  });
  await db.exec(migration);
  legacyWindow = (
    await db.query<{ dispatch_until: unknown }>(
      "SELECT dispatch_until FROM milo_conversation_turns",
    )
  ).rows[0].dispatch_until;
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE workspace_entities,project_team_members,milo_conversations,milo_conversation_turns,project_team_preview_limits,milo_conversation_dispatch_attempts,net.requests;
    UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;
    UPDATE milo_conversation_dispatch_control SET enabled=false;
    UPDATE net.control SET fail=false;
    DELETE FROM vault.decrypted_secrets; INSERT INTO vault.decrypted_secrets VALUES('auto_scheduler_secret','fixture-only');
    INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"name":"Saved client"}');
    INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES ${users
      .slice(1)
      .map((id) => `('${owner}','p','${id}','editor')`)
      .join(",")};
  `);
});
afterAll(async () => db?.close());
describe("durable independent conversation dispatch SQL", () => {
  it("starts disabled, creates a disabled fixed cron and leaves legacy tasks unarmed", async () => {
    expect(legacyWindow).toBeNull();
    expect((await db.query("SELECT jobname,schedule,command,active FROM cron.job")).rows).toEqual([
      {
        jobname: "milo-conversation-dispatch",
        schedule: "* * * * *",
        command: "SELECT public.dispatch_pending_milo_turns();",
        active: false,
      },
    ]);
    const task = target();
    await begin(task);
    expect(await queued()).toEqual([]);
    expect(await drain()).toBe(0);
    expect(await claim(task)).toMatchObject({
      acquired: false,
      attemptId: null,
      turn: { state: "pending" },
    });
  });
  it("queues only saved identifiers atomically and deduplicates lost submission replies and repeated resumes", async () => {
    await enable();
    const task = target();
    expect((await begin(task)).turn.state).toBe("pending");
    expect((await begin(task)).created).toBe(false);
    await resume(task);
    await resume(task);
    await drain();
    expect(await queued()).toEqual([
      { body: task, url: "https://milogrowth.com/api/milo/run", timeout_ms: 290000 },
    ]);
    expect((await claim(task)).acquired).toBe(true);
    expect((await claim(task)).acquired).toBe(false);
  });
  it("does not queue a rolled-back submission", async () => {
    await enable();
    await db.exec("BEGIN");
    await begin(target());
    expect(await queued()).toHaveLength(1);
    await db.exec("ROLLBACK");
    expect(await queued()).toEqual([]);
    expect((await db.query("SELECT * FROM milo_conversation_turns")).rows).toEqual([]);
  });
  it("keeps a saved task pending on missing credentials or enqueue failure and later recovers without a new submission", async () => {
    await enable();
    await db.exec("DELETE FROM vault.decrypted_secrets");
    const first = target();
    expect((await begin(first)).turn.state).toBe("pending");
    expect(await queued()).toEqual([]);
    await db.exec(
      "INSERT INTO vault.decrypted_secrets VALUES('auto_scheduler_secret','fixture-only'); UPDATE net.control SET fail=true",
    );
    const second = target();
    expect((await begin(second)).turn.state).toBe("pending");
    expect(await drain()).toBe(0);
    expect(await queued()).toEqual([]);
    await db.exec("UPDATE net.control SET fail=false");
    expect(await drain()).toBe(2);
    expect((await queued()).map((x) => x.body.turnId).sort()).toEqual(
      [first.turnId, second.turnId].sort(),
    );
  });
  it("does not auto-start stale pending work or renew it by replaying a send; explicit resume preserves the same original task", async () => {
    const task = target();
    await begin(task);
    await db.exec(
      "UPDATE milo_conversation_turns SET dispatch_until=clock_timestamp()-interval '1 second'",
    );
    await enable();
    expect(await drain()).toBe(0);
    expect((await claim(task)).acquired).toBe(false);
    await begin(task);
    expect(await drain()).toBe(0);
    expect((await resume(task)).body).toBe("Stored task");
    expect(await queued()).toHaveLength(1);
    expect((await claim(task)).acquired).toBe(true);
  });
  it("requeues only unclaimed requests after a lost network delivery, never running or terminal attempts", async () => {
    await enable();
    const task = target();
    await begin(task);
    await db.exec(
      "UPDATE milo_conversation_turns SET dispatch_last_at=clock_timestamp()-interval '2 minutes'; UPDATE milo_conversation_dispatch_attempts SET requested_at=clock_timestamp()-interval '2 minutes'",
    );
    expect(await drain()).toBe(1);
    const taken = await claim(task);
    expect(taken.acquired).toBe(true);
    for (const state of ["running", "completed", "failed", "cancelled", "unknown"]) {
      await db.query(
        "UPDATE milo_conversation_turns SET state=$1,dispatch_last_at=NULL WHERE turn_id=$2",
        [state, task.turnId],
      );
      expect(await drain()).toBe(0);
      expect((await resume(task)).state).toBe(state);
      expect((await claim(task)).acquired).toBe(false);
    }
    expect(await queued()).toHaveLength(2);
  });
  it("does not reclaim an expired attempt and refuses its late result", async () => {
    await enable();
    const task = target();
    await begin(task);
    const taken = await claim(task);
    await db.exec(
      "UPDATE milo_conversation_turns SET lease_until=clock_timestamp()-interval '1 second'",
    );
    expect((await resume(task)).state).toBe("unknown");
    expect((await claim(task)).acquired).toBe(false);
    expect(await drain()).toBe(0);
    await expect(
      query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'completed')", [
        ...params(task),
        taken.attemptId,
        [{ kind: "assistant", role: "lead", text: "Late" }],
      ]),
    ).rejects.toThrow("conflict");
  });
  it("rechecks cancellation, account suspension and membership at dispatch, including remove and regrant", async () => {
    await enable();
    const task = target();
    await begin(task);
    await db.exec("UPDATE project_team_members SET active=false");
    await expect(claim(task)).rejects.toThrow("unavailable");
    await expect(resume(task)).rejects.toThrow("unavailable");
    expect(await drain()).toBe(0);
    await db.exec("UPDATE project_team_members SET active=true,revision=2");
    await expect(claim(task)).rejects.toThrow("unavailable");
    await db.exec("UPDATE project_team_members SET revision=1");
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=$1",
      [actor],
    );
    await expect(claim(task)).rejects.toThrow("unavailable");
    await db.exec("UPDATE auth.users SET banned_until=NULL");
    await cancel(task);
    expect((await claim(task)).acquired).toBe(false);
    expect((await resume(task)).state).toBe("cancelled");
  });
  it("rejects cross-actor and cross-client envelopes without touching the saved turn", async () => {
    await enable();
    const task = target();
    await begin(task);
    for (const changed of [
      { ...task, actorId: other },
      { ...task, ownerId: other },
      { ...task, projectId: "other" },
      { ...task, conversationId: randomUUID() },
    ]) {
      await expect(claim(changed)).rejects.toThrow("unavailable");
      await expect(resume(changed)).rejects.toThrow("unavailable");
    }
    expect((await claim(task)).acquired).toBe(true);
  });
  it("limits native concurrency to two per actor and eight globally, releasing only completed or expired slots", async () => {
    await enable();
    for (const who of users.slice(1, 5)) {
      for (let i = 0; i < 2; i++) {
        const task = target(who);
        await begin(task);
        expect((await claim(task)).acquired).toBe(true);
      }
      if (who === actor) {
        const excess = target(who);
        await begin(excess);
        expect((await claim(excess)).acquired).toBe(false);
      }
    }
    const excess = target(users[5]);
    await begin(excess);
    expect((await claim(excess)).acquired).toBe(false);
    await db.exec(
      "UPDATE milo_conversation_turns SET state='completed' WHERE turn_id=(SELECT turn_id FROM milo_conversation_turns WHERE state='running' LIMIT 1)",
    );
    expect((await claim(excess)).acquired).toBe(true);
  });
  it("bounds enqueues at four per actor and twenty globally per minute across different tasks", async () => {
    await enable();
    for (const who of users.slice(1, 6)) {
      for (let i = 0; i < 5; i++) await begin(target(who));
    }
    expect(await queued()).toHaveLength(20);
    const next = target(users[6]);
    await begin(next);
    await resume(next);
    expect(await queued()).toHaveLength(20);
    expect(await drain()).toBe(0);
  });
  it("selects no more than two pending tasks per actor in a cron batch and skips revoked actors", async () => {
    for (const who of [actor, other]) for (let i = 0; i < 4; i++) await begin(target(who));
    await db.query("UPDATE project_team_members SET active=false WHERE actor_id=$1", [actor]);
    await enable();
    expect(await drain()).toBe(2);
    expect((await queued()).every((x) => x.body.actorId === other)).toBe(true);
  });
  it("release rollback prevents queued-but-unclaimed work from starting", async () => {
    await enable();
    const first = target(),
      second = target();
    await begin(first);
    await begin(second);
    const taken = await claim(first);
    expect(taken.acquired).toBe(true);
    await db.exec("UPDATE milo_conversation_dispatch_control SET enabled=false");
    expect((await claim(second)).acquired).toBe(false);
    expect(await drain()).toBe(0);
    expect(
      await query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...params(first),
        taken.attemptId,
      ]),
    ).toBe(true);
  });
  it("keeps raw control, queue and enqueuer inaccessible to browser and service roles", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of [
        "milo_conversation_dispatch_control",
        "milo_conversation_dispatch_attempts",
      ])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",
              [role, table],
            )
          ).rows[0].allowed,
        ).toBe(false);
      for (const fn of [
        "enqueue_milo_conversation_turn(uuid)",
        "trigger_milo_conversation_dispatch()",
        "dispatch_pending_milo_turns()",
      ])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "SELECT has_function_privilege($1,$2,'EXECUTE') allowed",
              [role, fn],
            )
          ).rows[0].allowed,
        ).toBe(false);
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "SELECT has_function_privilege($1,'resume_milo_conversation_turn(uuid,uuid,text,uuid,uuid)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(role === "service_role");
    }
  });
  it("finishes through the queued HTTP handler and real executor after submission has returned, then reloads without another model call", async () => {
    await enable();
    const task = target();
    const { actorId, ...savedTarget } = task;
    const saved = await beginConversationTurn(
      actorId,
      { ...savedTarget, body: "Explain this saved project", locale: "en" },
      rpc,
    );
    expect(saved.turn.state).toBe("pending");
    const replies = [
      JSON.stringify({
        handoff: "SEO will explain the saved project.",
        assignments: [{ role: "seo", task: "Explain saved project", tools: [] }],
      }),
      "The saved project is Saved client.",
    ];
    const model = vi.fn(
      async ({
        context,
      }: Parameters<
        import("./milo-specialist-executor.server").SpecialistExecutorDeps["model"]
      >[0]) => {
        await context.beforeDispatch!();
        return replies.shift()!;
      },
    );
    const unavailable = async (): Promise<never> => {
      throw new Error("Private owner tool not authorized");
    };
    const run = (who: string, input: Parameters<typeof runConversationSpecialists>[1]) =>
      runConversationSpecialists(who, input, {
        claim: (a, t) => claimConversationTurn(a, t, rpc),
        read: (a, t) => readConversation(a, t, rpc),
        assert: (a, t, id) => assertConversationExecution(a, t, id, rpc),
        advance: (a, t, change) => advanceConversationTurn(a, t, change, rpc),
        tool: (input, context) =>
          runSpecialistTool(input, context, {
            rpc,
            workspace: unavailable,
            knowledge: unavailable,
            weekly: unavailable,
            generate: unavailable,
          }),
        model,
      });
    const envelope = (await queued())[0];
    const dispatch = () =>
      handleMiloDispatch(
        new Request(envelope.url, {
          method: "POST",
          headers: { authorization: "Bearer fixture-only", "content-type": "application/json" },
          body: JSON.stringify(envelope.body),
        }),
        { secret: async () => "fixture-only", run },
      );
    expect(await (await dispatch()).json()).toEqual({ ok: true, state: "completed" });
    expect(await (await dispatch()).json()).toEqual({ ok: true, state: "completed" });
    expect(model).toHaveBeenCalledTimes(2);
    expect((await resumeConversationTurn(actorId, savedTarget, rpc)).state).toBe("completed");
    const history = await readConversation(
      actorId,
      { ownerId: owner, projectId: "p", conversationId: task.conversationId },
      rpc,
    );
    expect(history.turns[0].events.at(-1)?.text).toBe("The saved project is Saved client.");
    expect(model).toHaveBeenCalledTimes(2);
    expect(await queued()).toHaveLength(1);
  });
});
