/**
 * CV — Stop must not turn an unknown outcome into "cancelled" (23 October 2026).
 *
 * Released cancel_milo_conversation_turn set ANY running row to cancelled, including
 * one whose lease had expired and which every reader therefore sees as `unknown`
 * (the executor may have run and been charged, or lost its outcome write). The UI
 * shows Stop while its last read said running and polls every 3 s, so a stale view
 * (or a direct cancel call) could rewrite that uncertainty into a definite
 * cancellation. Real migrations in PGlite; the candidate migration is applied last.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const owner = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
const conversation = "00000000-0000-4000-8000-000000000004";
const turn = "00000000-0000-4000-8000-000000000005";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users(id) VALUES('${owner}'),('${member}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}');`);
  for (const name of [
    "20260911020000_project_team_reads.sql",
    "20260913120000_milo_conversations.sql",
    "20260914120000_milo_provider_check_consent.sql",
    "20261023120000_milo_conversation_cancel_expired_unknown.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`TRUNCATE public.workspace_entities,public.project_team_members,public.milo_conversations,public.milo_conversation_turns;
    INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{}'),('${owner}','projects','q','{}');
    INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${member}','editor');`);
});
afterAll(async () => {
  await db?.close();
});

type View = { state: string; events: unknown[] };
const call = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<{ r: T }>(`SELECT ${sql} r`, params)).rows[0].r;
const begin = (who = owner, turnId = turn, project = "p") =>
  call(`public.begin_milo_conversation_turn($1,$2,$3,$4,$5,'Read-only task','en')`, [
    who,
    owner,
    project,
    conversation,
    turnId,
  ]);
const claim = (who = owner) =>
  call<{ acquired: boolean; attemptId: string | null }>(
    `public.claim_milo_conversation_turn($1,$2,'p',$3,$4)`,
    [who, owner, conversation, turn],
  );
const cancel = (who = owner, project = "p") =>
  call<View>(`public.cancel_milo_conversation_turn($1,$2,$3,$4,$5)`, [
    who,
    owner,
    project,
    conversation,
    turn,
  ]);
const read = async (who = owner) =>
  (
    await call<{ turns: View[] }>(`public.read_milo_conversation($1,$2,'p',$3,0)`, [
      who,
      owner,
      conversation,
    ])
  ).turns;
const advance = (attempt: string | null, who = owner) =>
  call(
    `public.advance_milo_conversation_turn($1,$2,'p',$3,$4,$5,0,'[{"kind":"assistant","role":"seo","text":"Late answer"}]'::jsonb,'completed')`,
    [who, owner, conversation, turn, attempt],
  );
/** The complete stored row (every column, events/lease/consents/attempt included). */
const raw = async () =>
  (
    await db.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) row FROM public.milo_conversation_turns t WHERE turn_id='${turn}'`,
    )
  ).rows[0].row;
const expireLease = () =>
  db.exec(
    `UPDATE public.milo_conversation_turns SET lease_until=clock_timestamp()-interval '1 second' WHERE turn_id='${turn}'`,
  );

describe("CV Stop on an expired-lease (unknown) turn", () => {
  it.each([owner, member])(
    "keeps the outcome unknown and writes nothing (actor %s)",
    async (who) => {
      await begin(who);
      const taken = await claim(who);
      expect(taken.acquired).toBe(true);
      await expireLease();
      const before = await raw();
      expect((await read(who))[0].state).toBe("unknown");
      // The stale-view Stop (or a direct call) now returns the honest unknown view.
      expect((await cancel(who)).state).toBe("unknown");
      expect((await cancel(who)).state).toBe("unknown");
      expect((await read(who))[0].state).toBe("unknown");
      // Nothing was rewritten: the complete raw row is untouched, not 'cancelled'.
      expect(await raw()).toEqual(before);
      // Still never reclaimed, and its late result is refused.
      expect(await claim(who)).toMatchObject({ acquired: false, attemptId: null });
      await expect(advance(taken.attemptId, who)).rejects.toThrow("conflict");
      expect((await read(who))[0].state).toBe("unknown");
    },
  );

  it("an unknown turn already normalised by a later begin stays unknown on cancel", async () => {
    await begin();
    await claim();
    await expireLease();
    // A new task in the same conversation records the uncertain row as unknown.
    await begin(owner, "00000000-0000-4000-8000-000000000006");
    expect((await raw()).state).toBe("unknown");
    const normalised = await raw();
    expect((await cancel()).state).toBe("unknown");
    expect(await raw()).toEqual(normalised);
  });
});

describe("CV Stop keeps its released behaviour elsewhere", () => {
  it("cancels a live running turn and refuses its late result", async () => {
    await begin();
    const taken = await claim();
    expect((await cancel()).state).toBe("cancelled");
    expect((await raw()).state).toBe("cancelled");
    await expect(advance(taken.attemptId)).rejects.toThrow("conflict");
    expect(await claim()).toMatchObject({ acquired: false });
  });

  it("cancels a queued (pending) turn idempotently and it can never be claimed", async () => {
    await begin();
    expect((await cancel()).state).toBe("cancelled");
    expect((await cancel()).state).toBe("cancelled");
    expect(await claim()).toMatchObject({ acquired: false, attemptId: null });
  });

  it("leaves a completed turn and its evidence unchanged", async () => {
    await begin();
    await advance((await claim()).attemptId);
    const before = await raw();
    const view = await cancel();
    expect(view.state).toBe("completed");
    expect(view.events).toHaveLength(1);
    expect(await raw()).toEqual(before);
  });

  it("still refuses a foreign project and a revoked collaborator", async () => {
    await begin(member);
    await expect(cancel(member, "q")).rejects.toThrow("milo_conversation_unavailable");
    await db.exec("UPDATE public.project_team_members SET active=false");
    await expect(cancel(member)).rejects.toThrow("milo_conversation_unavailable");
  });

  it("stays executable by service_role only", async () => {
    const allowed = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(
          "SELECT has_function_privilege($1,'public.cancel_milo_conversation_turn(uuid,uuid,text,uuid,uuid)','EXECUTE') ok",
          [role],
        )
      ).rows[0].ok;
    expect(await allowed("service_role")).toBe(true);
    for (const role of ["anon", "authenticated", "public"]) expect(await allowed(role)).toBe(false);
  });
});
