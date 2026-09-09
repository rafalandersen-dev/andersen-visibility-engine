import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { selectProjectKnowledge } from "./project-knowledge";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const sid = "00000000-0000-4000-8000-000000000003",
  rid = "00000000-0000-4000-8000-000000000004";
const now = "2026-09-09T10:00:00Z";
const source = {
  ownerId: user,
  projectId: "p",
  id: sid,
  revision: 1,
  kind: "document",
  label: "Brand",
  fingerprint: "a".repeat(64),
  observedAt: now,
  status: "active",
};
const record = {
  ownerId: user,
  projectId: "p",
  id: rid,
  revision: 1,
  sourceId: sid,
  sourceRevision: 1,
  key: "voice.tone",
  category: "voice",
  appliesTo: "both",
  value: "Calm",
  locator: "Page 2",
  status: "accepted",
  updatedAt: now,
  reviewedAt: now,
};
const save = (
  kind: string,
  payload: unknown,
  expected = 0,
  owner = user,
  project = "p",
  id = kind === "source" ? sid : rid,
) =>
  db.query("SELECT public.save_project_knowledge($1,$2,$3,$4,$5,$6) result", [
    owner,
    project,
    kind,
    id,
    expected,
    JSON.stringify(payload),
  ]);
const forget = (kind: string, id = kind === "source" ? sid : rid, expected = 1) =>
  db.query("SELECT public.forget_project_knowledge($1,'p',$2,$3,$4)", [user, kind, id, expected]);
const read = async () =>
  (
    await db.query<{ result: { sources: unknown[]; records: unknown[] } }>(
      "SELECT public.read_project_knowledge($1,'p') result",
      [user],
    )
  ).rows[0].result;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${user}'),('${other}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text);
    INSERT INTO public.workspace_meta VALUES('${user}'),('${other}');
    INSERT INTO public.workspace_entities VALUES('${user}','projects','p'),('${other}','projects','p');`);
  await db.exec(readFileSync("supabase/migrations/20260909200000_project_knowledge.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; TRUNCATE public.project_knowledge_records,public.project_knowledge_sources,public.project_knowledge_history,public.project_knowledge_tombstones;",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("private revisioned project knowledge", () => {
  it("stores current records and immutable prior revisions", async () => {
    await save("source", source);
    await save("record", record);
    await save("record", { ...record, revision: 2, value: "Plain and calm" }, 1);
    expect((await read()).records).toEqual([{ ...record, revision: 2, value: "Plain and calm" }]);
    expect(
      (
        await db.query(
          "SELECT revision FROM public.project_knowledge_history WHERE kind='record' ORDER BY revision",
        )
      ).rows,
    ).toEqual([{ revision: 1 }, { revision: 2 }]);
  });
  it("accepts identical lost-response replay but rejects changed replay and stale owner edits", async () => {
    await save("source", source);
    await save("source", source);
    await expect(save("source", { ...source, label: "Overwrite" })).rejects.toThrow(
      "knowledge_changed",
    );
    await save("record", record);
    await save("record", { ...record, revision: 2, value: "Owner edit" }, 1);
    await expect(
      save("record", { ...record, revision: 2, value: "Stale edit" }, 1),
    ).rejects.toThrow("knowledge_changed");
  });
  it("authorizes the project and binds payload ownership independently", async () => {
    await expect(save("source", source, 0, user, "missing")).rejects.toThrow("project_unavailable");
    await expect(save("source", source, 0, other)).rejects.toThrow("invalid_project_knowledge");
    await save("source", source);
    await expect(save("record", { ...record, ownerId: other }, 0, other)).rejects.toThrow(
      "source_changed",
    );
    expect(
      (await db.query("SELECT public.read_project_knowledge($1,'p') result", [other])).rows,
    ).toEqual([{ result: { sources: [], records: [] } }]);
  });
  it.each(["anon", "authenticated"])("denies %s direct reads and RPC writes", async (role) => {
    await save("source", source);
    await db.exec(`SET ROLE ${role}`);
    try {
      await expect(db.query("SELECT * FROM public.project_knowledge_sources")).rejects.toThrow(
        "permission denied",
      );
      await expect(read()).rejects.toThrow("permission denied");
      await expect(save("record", record)).rejects.toThrow("permission denied");
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("requires source re-review after replacement and immediately excludes revoked records", async () => {
    await save("source", source);
    await save("record", record);
    await save("source", { ...source, revision: 2, fingerprint: "b".repeat(64) }, 1);
    await expect(save("record", { ...record, revision: 2 }, 1)).rejects.toThrow("source_changed");
    const state = await read();
    expect(
      selectProjectKnowledge(
        state.sources,
        state.records,
        { ownerId: user, projectId: "p" },
        "text",
        now,
      ).records,
    ).toEqual([]);
    await save("record", { ...record, revision: 2, sourceRevision: 2 }, 1);
    await save("source", { ...source, revision: 3, status: "revoked" }, 2);
    await expect(save("record", { ...record, revision: 3, sourceRevision: 3 }, 2)).rejects.toThrow(
      "source_changed",
    );
  });
  it("forgets all derived text/history and prevents a late save resurrecting it", async () => {
    await save("source", source);
    await save("record", record);
    await forget("source");
    await forget("source");
    expect(await read()).toEqual({ sources: [], records: [] });
    expect(
      (await db.query("SELECT count(*)::int n FROM public.project_knowledge_history")).rows,
    ).toEqual([{ n: 0 }]);
    await expect(save("source", source)).rejects.toThrow("knowledge_forgotten");
    await expect(save("record", record)).rejects.toThrow("knowledge_forgotten");
  });
  it("cannot forget a later owner revision with a stale action", async () => {
    await save("source", source);
    await save("record", record);
    await save("record", { ...record, revision: 2, value: "Owner edit" }, 1);
    await expect(forget("record")).rejects.toThrow("knowledge_changed");
    expect((await read()).records).toHaveLength(1);
  });
  it("does not let source replacement masquerade as owner-supplied knowledge", async () => {
    await save("source", source);
    await expect(save("source", { ...source, revision: 2, kind: "owner" }, 1)).rejects.toThrow(
      "identity_conflict",
    );
  });
});
