import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  run = "00000000-0000-4000-8000-000000000003",
  second = "00000000-0000-4000-8000-000000000004";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);INSERT INTO auth.users(id) VALUES('${owner}'),('${other}');CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint);INSERT INTO workspace_meta VALUES('${owner}',1),('${other}',1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb,PRIMARY KEY(user_id,collection,entity_id));INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"websiteUrl":"https://example.test"}'),('${other}','projects','p','{"websiteUrl":"https://other.test"}');`,
  );
  await db.exec(readFileSync("supabase/migrations/20260909200000_project_knowledge.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260911110000_technical_crawls.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE technical_crawls;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.test"}' WHERE user_id='${owner}';`,
  );
});
afterAll(async () => await db?.close());
const start = (id = run) =>
  db.query(
    "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test') result",
    [owner, id],
  );
const claim = async () =>
  (
    await db.query<{ result: { lease_token: string; revision: number } | null }>(
      "SELECT claim_technical_crawl($1,'p',$2) result",
      [owner, run],
    )
  ).rows[0].result;
const save = async (lease: string, revision = 1) =>
  (
    await db.query<{ result: boolean }>(
      "SELECT save_technical_crawl_step($1,'p',$2,$3,$4,$5,'running') result",
      [owner, run, lease, revision, { origin: "https://example.test", pages: [] }],
    )
  ).rows[0].result;
describe("durable technical crawl state", () => {
  it("starts idempotently and refuses a second active run", async () => {
    await start();
    await start();
    await expect(start(second)).rejects.toThrow("technical_crawl_active");
    expect((await db.query("SELECT count(*)::int n FROM technical_crawls")).rows[0]).toEqual({
      n: 1,
    });
  });
  it("claims exclusively and rejects stale tokens and revisions", async () => {
    await start();
    const c = (await claim())!;
    expect(await claim()).toBeNull();
    expect(await save(second)).toBe(false);
    expect(await save(c.lease_token, 2)).toBe(false);
    expect(await save(c.lease_token)).toBe(true);
    expect(await save(c.lease_token)).toBe(false);
    expect((await claim())?.revision).toBe(2);
  });
  it("reclaims expired work while invalidating the old token", async () => {
    await start();
    const old = (await claim())!;
    await db.exec("UPDATE technical_crawls SET lease_until=now()-interval '1 second'");
    const current = (await claim())!;
    expect(current.lease_token).not.toBe(old.lease_token);
    expect(await save(old.lease_token)).toBe(false);
    expect(await save(current.lease_token)).toBe(true);
  });
  it("cancels atomically and cannot be revived by a late response", async () => {
    await start();
    const c = (await claim())!;
    await db.query("SELECT cancel_technical_crawl($1,'p',$2)", [owner, run]);
    expect(await save(c.lease_token)).toBe(false);
    expect(await claim()).toBeNull();
    await start(second);
  });
  it.each(["claim", "save"])("holds changed websites at %s", async (phase) => {
    await start();
    const c = phase === "save" ? (await claim())! : null;
    await db.query("UPDATE workspace_entities SET data=$1 WHERE user_id=$2", [
      { websiteUrl: "https://changed.test" },
      owner,
    ]);
    if (c) expect(await save(c.lease_token)).toBe(false);
    else expect(await claim()).toBeNull();
    expect((await db.query("SELECT status FROM technical_crawls")).rows[0]).toEqual({
      status: "held",
    });
  });
  it("scopes reads and never exposes lease tokens through history", async () => {
    await start();
    await claim();
    expect(
      (await db.query("SELECT read_technical_crawl($1,'p',$2) result", [other, run])).rows[0],
    ).toEqual({ result: null });
    const r = (await db.query("SELECT read_technical_crawl($1,'p',$2) result", [owner, run]))
      .rows[0].result;
    expect(r).not.toHaveProperty("lease_token");
    expect(r).not.toHaveProperty("lease_until");
  });
  it.each(["banned_until=now()+interval '1 hour'", "deleted_at=now()"])(
    "rejects current account restriction %s",
    async (restriction) => {
      await start();
      await db.exec(`UPDATE auth.users SET ${restriction} WHERE id='${owner}'`);
      await expect(claim()).rejects.toThrow("technical_crawl_unavailable");
    },
  );
  it("restricts direct table and RPC access", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM technical_crawls")).rejects.toThrow();
      await expect(start()).rejects.toThrow();
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    await expect(db.query("SELECT * FROM technical_crawls")).rejects.toThrow();
  });
});
