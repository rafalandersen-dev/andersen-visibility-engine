import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
const approve = (approved = true, revision = 1) =>
  db.query("SELECT set_publication_approval($1,'p','a',$2,$3,$4)", [
    user,
    revision,
    hash,
    approved,
  ]);
const read = async (version = hash) =>
  (
    await db.query<{ approved: boolean }>(
      "SELECT read_publication_approval($1,'p','a',$2) approved",
      [user, version],
    )
  ).rows[0].approved;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const file of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;UPDATE workspace_meta SET rev=1;");
  await db.query(
    "INSERT INTO workspace_entities VALUES($1,'projects','p','{}'),($1,'projects','q','{}'),($1,'content','a','{\"projectId\":\"p\",\"status\":\"Approved\"}')",
    [user],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("server-owned exact publication approval", () => {
  it("does not infer approval from browser status and matches only the reviewed version", async () => {
    expect(await read()).toBe(false);
    await approve();
    expect(await read()).toBe(true);
    expect(await read("b".repeat(64))).toBe(false);
    await approve(false);
    expect(await read()).toBe(false);
  });
  it("rejects stale workspace revisions without replacing the existing approval", async () => {
    await approve();
    await db.exec("UPDATE workspace_meta SET rev=2");
    await expect(approve(false)).rejects.toThrow("publication_workspace_changed");
    expect(await read()).toBe(true);
  });
  it("rejects foreign owners and moved assets", async () => {
    await expect(
      db.query("SELECT set_publication_approval($1,'p','a',1,$2,true)", [other, hash]),
    ).rejects.toThrow();
    await approve();
    await db.exec(
      "UPDATE workspace_entities SET data='{\"projectId\":\"q\"}' WHERE collection='content'",
    );
    await expect(read()).rejects.toThrow("publication_asset_unavailable");
    await expect(approve()).rejects.toThrow("publication_asset_unavailable");
  });
  it("purges approval on deletion and cannot revive it by recreating the asset", async () => {
    await approve();
    await db.exec("DELETE FROM workspace_entities WHERE collection='content'");
    expect((await db.query("SELECT * FROM publication_approvals")).rows).toEqual([]);
    await db.query(
      "INSERT INTO workspace_entities VALUES($1,'content','a','{\"projectId\":\"p\"}')",
      [user],
    );
    expect(await read()).toBe(false);
  });
  it("allows only service RPC execution, with no direct browser or service table access", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.exec("SELECT * FROM publication_approvals")).rejects.toThrow(
        "permission denied",
      );
      if (role !== "service_role") await expect(approve()).rejects.toThrow("permission denied");
      else {
        await approve();
        expect(await read()).toBe(true);
      }
      await db.exec("RESET ROLE");
    }
  });
});
