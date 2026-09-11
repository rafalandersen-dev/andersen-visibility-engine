import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const review = "00000000-0000-4000-8000-000000000003";
const second = "00000000-0000-4000-8000-000000000004";
const sourceId = "00000000-0000-4000-8000-000000000005";
const version = "a".repeat(64);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${user}'),('${other}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${user}'),('${other}');
    INSERT INTO public.workspace_entities(user_id,collection,entity_id) VALUES('${user}','projects','p'),('${other}','projects','p');`);
  await db.exec(readFileSync("supabase/migrations/20260909200000_project_knowledge.sql", "utf8"));
  await db.exec(
    "CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb)",
  );
  for (const file of [
    "20260910100000_source_refresh.sql",
    "20260911000000_output_knowledge_integrity.sql",
    "20260911010000_output_knowledge_reviews.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.project_source_refresh,public.output_knowledge_reviews,public.project_output_source_dependencies,public.project_knowledge_sources,public.project_knowledge_records,public.project_knowledge_history,public.project_knowledge_tombstones,public.project_knowledge_documents;
  UPDATE public.workspace_meta SET rev=1;
  INSERT INTO public.workspace_entities VALUES('${user}','projects','p','{}'),('${other}','projects','p','{}'),('${user}','content','a','{"projectId":"p"}'),('${other}','content','a','{"projectId":"p"}') ON CONFLICT(user_id,collection,entity_id) DO UPDATE SET data=EXCLUDED.data;`);
});
afterAll(async () => {
  await db?.close();
});
const context = async (owner = user) =>
  (
    await db.query<{ result: { contextHash: string; registry: unknown[] } }>(
      "SELECT public.read_output_knowledge_review_context($1,'p','a') result",
      [owner],
    )
  ).rows[0].result;
const save = async (hash: string, id = review, expected = 1, owner = user) =>
  db.query("SELECT public.save_output_knowledge_review($1,'p','a',$2,$3,$4,$5)", [
    owner,
    id,
    expected,
    version,
    hash,
  ]);
const history = async (owner = user) =>
  (
    await db.query<{ result: { reviewId: string; active: boolean; withdrawnAt: string | null }[] }>(
      "SELECT public.read_output_knowledge_reviews($1,'p','a') result",
      [owner],
    )
  ).rows[0].result;
describe("durable knowledge review storage", () => {
  it("preserves a knowledge review across separate approval and scheduling metadata", async () => {
    await save((await context()).contextHash);
    await db.query(
      "UPDATE public.workspace_entities SET data=data || $1::jsonb WHERE user_id=$2 AND collection='content' AND entity_id='a'",
      [
        JSON.stringify({
          status: "Approved",
          updatedAt: "2026-09-11T01:00:00Z",
          scheduledPublishAt: "2026-09-12T01:00:00Z",
        }),
        user,
      ],
    );
    expect((await history())[0].active).toBe(true);
  });
  it("withdraws immediately when retained evidence changes", async () => {
    await save((await context()).contextHash);
    await db.query(
      "INSERT INTO public.project_output_source_dependencies(user_id,project_id,asset_id,output_id,kind,dependencies,knowledge_forgotten) VALUES($1,'p','a','a','content','[]',true)",
      [user],
    );
    expect((await history())[0].active).toBe(false);
  });
  it("withdraws immediately when project knowledge changes", async () => {
    await save((await context()).contextHash);
    await db.query("SELECT public.save_project_knowledge($1,'p','source',$2,0,$3)", [
      user,
      sourceId,
      JSON.stringify({
        ownerId: user,
        projectId: "p",
        id: sourceId,
        revision: 1,
        kind: "owner",
        status: "active",
        fingerprint: "b".repeat(64),
        label: "Changed",
        observedAt: "2026-09-11T00:00:00Z",
      }),
    ]);
    expect((await history())[0].active).toBe(false);
  });
  it("withdraws on a saved edit and does not revive when the edit is reverted", async () => {
    const hash = (await context()).contextHash;
    await save(hash);
    await db.query(
      "UPDATE public.workspace_entities SET data=$1 WHERE user_id=$2 AND collection='content' AND entity_id='a'",
      [JSON.stringify({ projectId: "p", markdown: "changed" }), user],
    );
    await db.query(
      "UPDATE public.workspace_entities SET data=$1 WHERE user_id=$2 AND collection='content' AND entity_id='a'",
      [JSON.stringify({ projectId: "p" }), user],
    );
    expect((await context()).contextHash).toBe(hash);
    expect((await history())[0].active).toBe(false);
    await expect(save(hash)).rejects.toThrow(/replay_conflict/);
  });
  it("rejects a context for a removed or moved output", async () => {
    await db.query(
      "UPDATE public.workspace_entities SET data=$1 WHERE user_id=$2 AND collection='content' AND entity_id='a'",
      [JSON.stringify({ projectId: "moved" }), user],
    );
    await expect(context()).rejects.toThrow(/output_unavailable/);
    await expect(history()).rejects.toThrow(/output_unavailable/);
  });
  it("retains metadata only and isolates owner history", async () => {
    await save((await context()).contextHash);
    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "active",
      "contextHash",
      "reviewId",
      "reviewedAt",
      "versionHash",
      "withdrawnAt",
    ]);
    expect(await history(other)).toEqual([]);
  });
  it("accepts an identical acknowledgement retry but never revives a withdrawn review", async () => {
    const hash = (await context()).contextHash;
    await save(hash);
    await save(hash);
    expect(await history()).toHaveLength(1);
    await db.query("SELECT public.withdraw_output_knowledge_review($1,'p','a',$2)", [user, review]);
    await expect(save(hash)).rejects.toThrow(/replay_conflict/);
    expect((await history())[0].active).toBe(false);
  });
  it("rejects saved-workspace and knowledge changes after inspection", async () => {
    const hash = (await context()).contextHash;
    await db.exec("UPDATE public.workspace_meta SET rev=2");
    await expect(save(hash)).rejects.toThrow(/output_changed/);
    await db.query("SELECT public.save_project_knowledge($1,'p','source',$2,0,$3)", [
      user,
      sourceId,
      JSON.stringify({
        ownerId: user,
        projectId: "p",
        id: sourceId,
        revision: 1,
        kind: "owner",
        status: "active",
        fingerprint: "b".repeat(64),
        label: "Changed",
        observedAt: "2026-09-11T00:00:00Z",
      }),
    ]);
    await expect(save(hash, review, 2)).rejects.toThrow(/context_changed/);
    expect(await history()).toEqual([]);
  });
  it("binds owner brand changes into the context", async () => {
    const first = (await context()).contextHash;
    await db.query(
      "UPDATE public.workspace_entities SET data=$1 WHERE user_id=$2 AND collection='projects'",
      [JSON.stringify({ toneOfVoice: "Formal" }), user],
    );
    expect((await context()).contextHash).not.toBe(first);
    await expect(save(first)).rejects.toThrow(/context_changed/);
  });
  it("refuses forgotten evidence even with its newest context", async () => {
    await db.query(
      "INSERT INTO public.project_output_source_dependencies(user_id,project_id,asset_id,output_id,kind,dependencies,knowledge_forgotten) VALUES($1,'p','a','a','content','[]',true)",
      [user],
    );
    await expect(save((await context()).contextHash)).rejects.toThrow(/forgotten/);
  });
  it("keeps prior history inactive when a new review replaces it", async () => {
    const hash = (await context()).contextHash;
    await save(hash);
    await save(hash, second);
    const rows = await history();
    expect(rows.filter((r) => r.active).map((r) => r.reviewId)).toEqual([second]);
    expect(rows.find((r) => r.reviewId === review)?.withdrawnAt).not.toBeNull();
    await expect(save(hash)).rejects.toThrow(/replay_conflict/);
  });
  it("cascades history on project or output deletion", async () => {
    await save((await context()).contextHash);
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect((await db.query("SELECT * FROM public.output_knowledge_reviews")).rows).toHaveLength(0);
  });
  it("blocks direct roles and exposes only service RPCs", async () => {
    const rows = (
      await db.query<{ name: string; anon: boolean; authenticated: boolean; service: boolean }>(
        `SELECT proname name,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service FROM pg_proc WHERE proname IN ('read_output_knowledge_review_context','save_output_knowledge_review','withdraw_output_knowledge_review','read_output_knowledge_reviews')`,
      )
    ).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => !r.anon && !r.authenticated && r.service)).toBe(true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM public.output_knowledge_reviews")).rejects.toThrow(
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
  });
});
