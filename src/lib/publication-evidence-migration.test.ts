import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  id = "00000000-0000-4000-8000-000000000003",
  hash = "a".repeat(64);
const snapshot = {
  assetId: "a",
  projectId: "p",
  version: { hash },
  title: "Original",
  markdown: "Original body",
  actionId: "op",
  sources: [],
  knowledgeReferences: [],
};
const begin = () =>
  db.query("SELECT begin_publication_evidence($1,'p','a',$2,$3,$4)", [user, id, hash, snapshot]);
const finish = (
  state = "published",
  data = { liveUrl: "https://example.com/a", publishedAt: "2026-08-15T12:00:00Z" },
) => db.query("SELECT finish_publication_evidence($1,'p',$2,$3,$4)", [user, id, state, data]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));CREATE TABLE weekly_preparation_stages(user_id uuid,project_id text,publish_at timestamptz,stage text,output_id uuid,request_id uuid,input_hash text,state text);",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;UPDATE workspace_meta SET rev=1;");
  await db.query(
    "INSERT INTO workspace_entities VALUES($1,'projects','p','{}'),($1,'content','a','{\"projectId\":\"p\",\"status\":\"Approved\"}'),($1,'opportunities','op','{\"projectId\":\"p\",\"title\":\"Saved action\"}')",
    [user],
  );
});
afterAll(async () => {
  await db?.close();
});
const approve = () =>
  db.query("SELECT set_publication_approval($1,'p','a',1,$2,true)", [user, hash]);
describe("publication provenance SQL", () => {
  it("requires exact approval before creating an attempt and refuses replay", async () => {
    await expect(begin()).rejects.toThrow("not_approved");
    await approve();
    await begin();
    await expect(begin()).rejects.toThrow("attempt_exists");
    expect(
      (await db.query("SELECT action_snapshot->>'title' AS title FROM publication_evidence"))
        .rows[0],
    ).toEqual({ title: "Saved action" });
  });
  it("allows idempotent outcome acknowledgement, never rewriting history", async () => {
    await approve();
    await begin();
    await finish();
    await finish();
    await expect(finish("unknown")).rejects.toThrow("immutable");
    await db.exec(
      "UPDATE workspace_entities SET data=data||'{\"title\":\"Changed\"}' WHERE collection='content';DELETE FROM workspace_entities WHERE collection='content';",
    );
    expect(
      (await db.query("SELECT snapshot->>'title' AS title FROM publication_evidence")).rows[0],
    ).toEqual({ title: "Original" });
  });
  it("isolates owners/projects and erases history when the owning project is deleted", async () => {
    await approve();
    await begin();
    await expect(db.query("SELECT read_publication_evidence($1,'p',0)", [other])).rejects.toThrow();
    await expect(
      db.query("SELECT read_publication_snapshot($1,'q',$2)", [user, id]),
    ).rejects.toThrow();
    await db.exec("DELETE FROM workspace_entities WHERE collection='projects'");
    expect(
      (await db.query<{ n: number }>("SELECT count(*) n FROM publication_evidence")).rows[0].n,
    ).toBe(0);
  });
  it("has no direct anon/authenticated/service data access", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM publication_evidence")).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query("SELECT * FROM publication_observations")).rejects.toThrow(
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*) n FROM pg_class WHERE relname IN ('publication_evidence','publication_observations') AND relrowsecurity",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("freezes observations from an exact saved import and refuses source replacement", async () => {
    await approve();
    await begin();
    await finish();
    const imp = { id: "gsc", rows: [], dateRange: { start: "2026-08-16", end: "2026-08-22" } };
    await db.query(
      "UPDATE workspace_entities SET data=jsonb_build_object('gscLite',jsonb_build_object('imports',jsonb_build_array($1::jsonb))) WHERE collection='projects'",
      [imp],
    );
    const link = (source = imp, obs = { clicks: 3 }) =>
      db.query("SELECT link_publication_observation($1,'p',$2,$3,$4)", [user, id, source, obs]);
    await link();
    await link();
    await expect(link(imp, { clicks: 4 })).rejects.toThrow("immutable");
    await expect(link({ ...imp, id: "foreign" })).rejects.toThrow("source_changed");
    expect(
      (await db.query<{ n: number }>("SELECT count(*) n FROM publication_observations")).rows[0].n,
    ).toBe(1);
  });
  it("supports direct item retrieval and bounded paging", async () => {
    await approve();
    await begin();
    const r = (
      await db.query<{ data: { items: unknown[]; total: number } }>(
        "SELECT read_publication_evidence($1,'p',0,$2) data",
        [user, id],
      )
    ).rows[0].data;
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(1);
    await expect(db.query("SELECT read_publication_evidence($1,'p',20)", [user])).rejects.toThrow(
      "invalid_evidence_page",
    );
  });
});

it("deduplicates immutable workflow comparisons and refuses other project data", async () => {
  const document = {
    input: {
      projectId: "p",
      suiteName: "Synthetic",
      baselineVersion: "one",
      candidateVersion: "two",
      cases: [],
    },
    fixedBriefHash: "b".repeat(64),
    verdict: "incomplete_cost_evidence",
    baselineCost: null,
    candidateCost: null,
  };
  const save = (value = document) =>
    db.query<{ id: string }>("SELECT save_workflow_evaluation($1,'p',$2) id", [user, value]);
  const first = (await save()).rows[0].id;
  expect((await save()).rows[0].id).toBe(first);
  await expect(
    save({ ...document, input: { ...document.input, projectId: "other" } }),
  ).rejects.toThrow("invalid_workflow_evaluation");
  await db.exec("SET ROLE service_role");
  await expect(db.query("UPDATE workflow_evaluations SET document='{}'")).rejects.toThrow(
    /permission denied/,
  );
  await db.exec("RESET ROLE");
});
