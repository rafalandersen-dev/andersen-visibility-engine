import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Candidate-only proof for 20261022120000: the diagnostics outcome_code CHECK gains
// exactly `response_unreadable` (a confirmed unreadable plan reply). Before it, the
// released table refuses that code; after it, the code is accepted, every other
// constraint is unchanged and an existing receipt survives the swap.

const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
let conversationId: string;
let ordinal = 1;

beforeAll(async () => {
  db = new PGlite();
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
  conversationId = randomUUID();
  await db.query(
    "INSERT INTO public.milo_conversations(conversation_id,actor_id,owner_id,project_id,title,turn_count) VALUES($1,$2,$3,'p','Safari',1)",
    [conversationId, actor, owner],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

const turn = async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO public.milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state) VALUES($1,$2,$3,$4,'Pytanie','pl',1,'failed')",
    [id, conversationId, actor, ordinal++],
  );
  return id;
};
const record = (id: string, outcome: string, code: string) =>
  db.query("SELECT public.record_milo_conversation_diagnostic($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
    id,
    null,
    "plan_parse",
    outcome,
    code,
    "response_format",
    "MiloAiError",
    null,
    null,
    "terminal",
  ]);
const stored = async (id: string) =>
  (
    await db.query<{ outcome: string; outcome_code: string; stage: string }>(
      "SELECT outcome,outcome_code,stage FROM public.milo_conversation_diagnostics WHERE turn_id=$1",
      [id],
    )
  ).rows;

describe("response_unreadable diagnostics outcome", () => {
  it("is refused by the released constraint, accepted after the migration, nothing else widens", async () => {
    const before = await turn();
    await record(before, "unknown", "execution_unknown");
    await expect(record(await turn(), "failed", "response_unreadable")).rejects.toThrow();

    await db.exec(
      readFileSync(
        "supabase/migrations/20261022120000_milo_conversation_response_unreadable.sql",
        "utf8",
      ),
    );

    const after = await turn();
    await record(after, "failed", "response_unreadable");
    expect(await stored(after)).toEqual([
      { outcome: "failed", outcome_code: "response_unreadable", stage: "plan_parse" },
    ]);
    // The pre-existing receipt is untouched by the constraint swap.
    expect(await stored(before)).toEqual([
      { outcome: "unknown", outcome_code: "execution_unknown", stage: "plan_parse" },
    ]);
    // Unknown codes and outcomes remain refused.
    await expect(record(await turn(), "failed", "format_error")).rejects.toThrow();
    await expect(record(await turn(), "refused", "response_unreadable")).rejects.toThrow();
  });
});
