import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const token = "a".repeat(64);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);INSERT INTO auth.users(id) VALUES('${owner}'),('${other}');CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint);INSERT INTO workspace_meta VALUES('${owner}',1),('${other}',1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb,PRIMARY KEY(user_id,collection,entity_id));INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"websiteUrl":"https://example.test"}'),('${owner}','projects','q','{"websiteUrl":"https://example.test"}');`,
  );
  for (const file of [
    "20260909200000_project_knowledge.sql",
    "20260911110000_technical_crawls.sql",
    "20260911150000_technical_crawl_ownership.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE technical_crawls,technical_crawl_ownership,technical_ownership_limits;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.test"}';`,
  );
});
afterAll(async () => await db?.close());
const issue = (project = "p", who = owner) =>
  db.query<{ result: { token: string; verified_until: string | null } }>(
    "SELECT issue_technical_crawl_ownership($1,$2,'https://example.test','https://example.test',$3) result",
    [who, project, token],
  );
const begin = async (project = "p") =>
  (
    await db.query<{ result: { attempt_token: string } }>(
      "SELECT begin_technical_ownership_verification($1,$2) result",
      [owner, project],
    )
  ).rows[0].result.attempt_token;
const finish = async (attempt: string, verified = true) =>
  (
    await db.query<{ result: boolean }>(
      "SELECT finish_technical_ownership_verification($1,'p',$2,$3) result",
      [owner, attempt, verified],
    )
  ).rows[0].result;
const authorized = () =>
  db.query("SELECT assert_technical_crawl_ownership($1,'p','https://example.test')", [owner]);
describe("durable crawl ownership", () => {
  it("requires proof at run creation and holds a saved run after revocation", async () => {
    const run = "00000000-0000-4000-8000-000000000003";
    const start = () =>
      db.query(
        "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test')",
        [owner, run],
      );
    await expect(start()).rejects.toThrow("technical_ownership_required");
    await issue();
    await finish(await begin());
    await start();
    await db.query("SELECT revoke_technical_crawl_ownership($1,'p')", [owner]);
    expect(
      (
        await db.query<{ result: unknown }>("SELECT claim_technical_crawl($1,'p',$2) result", [
          owner,
          run,
        ])
      ).rows[0].result,
    ).toBeNull();
    expect((await db.query("SELECT status,state FROM technical_crawls")).rows).toEqual([
      { status: "held", state: {} },
    ]);
  });
  it("refuses saving a step after proof is revoked", async () => {
    const run = "00000000-0000-4000-8000-000000000003";
    await issue();
    await finish(await begin());
    await db.query(
      "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test')",
      [owner, run],
    );
    const lease = (
      await db.query<{ result: { lease_token: string } }>(
        "SELECT claim_technical_crawl($1,'p',$2) result",
        [owner, run],
      )
    ).rows[0].result.lease_token;
    await db.query("SELECT revoke_technical_crawl_ownership($1,'p')", [owner]);
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT save_technical_crawl_step($1,'p',$2,$3,1,$4,'completed') result",
          [owner, run, lease, { origin: "https://example.test", pages: [] }],
        )
      ).rows[0].result,
    ).toBe(false);
    expect((await db.query("SELECT status,state FROM technical_crawls")).rows).toEqual([
      { status: "held", state: {} },
    ]);
  });

  it("requires an admitted saved challenge, and accepts a current exact attempt once", async () => {
    await expect(authorized()).rejects.toThrow("technical_ownership_required");
    const first = (await issue()).rows[0].result;
    expect(first.verified_until).toBeNull();
    expect((await issue()).rows[0].result).toEqual(first);
    const attempt = await begin();
    expect(await finish(other)).toBe(false);
    expect(await finish(attempt)).toBe(true);
    await authorized();
    expect(await finish(attempt)).toBe(false);
    await expect(
      db.query("SELECT assert_technical_crawl_ownership($1,'p','https://other.test')", [owner]),
    ).rejects.toThrow("technical_ownership_required");
  });
  it("refuses other owners, direct roles, and service writes to private proof", async () => {
    await expect(issue("p", other)).rejects.toThrow();
    await issue();
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM technical_crawl_ownership")).rejects.toThrow(
        "permission denied",
      );
      await expect(db.query("SELECT * FROM technical_ownership_limits")).rejects.toThrow(
        "permission denied",
      );
      if (role !== "service_role") await expect(issue()).rejects.toThrow("permission denied");
      await db.exec("RESET ROLE");
    }
  });
  it("shares concurrency across projects and retains it after revocation", async () => {
    await issue();
    await issue("q");
    const attempt = await begin();
    await expect(begin("q")).rejects.toThrow("technical_ownership_capacity");
    await db.query("SELECT revoke_technical_crawl_ownership($1,'p')", [owner]);
    expect(await finish(attempt)).toBe(false);
    await expect(begin("q")).rejects.toThrow("technical_ownership_capacity");
    await expect(authorized()).rejects.toThrow("technical_ownership_required");
    await db.query("UPDATE technical_ownership_limits SET active_until=now()-interval '1 second'");
    await begin("q");
  });
  it("rejects stale, changed-website, failed and expired proof", async () => {
    await issue();
    let attempt = await begin();
    await db.query("UPDATE technical_crawl_ownership SET attempt_until=now()-interval '1 second'");
    expect(await finish(attempt)).toBe(false);
    attempt = await begin();
    await db.query("UPDATE workspace_entities SET data='{}'");
    expect(await finish(attempt)).toBe(false);
    expect(
      (
        await db.query<{ result: unknown }>(
          "SELECT read_technical_crawl_ownership($1,'p') result",
          [owner],
        )
      ).rows[0].result,
    ).toBeNull();
    await db.query(
      "UPDATE workspace_entities SET data='{" + '"websiteUrl":"https://example.test"' + "}'",
    );
    attempt = await begin();
    expect(await finish(attempt, false)).toBe(false);
    await expect(authorized()).rejects.toThrow("technical_ownership_required");
    attempt = await begin();
    expect(await finish(attempt)).toBe(true);
    await db.query(
      "UPDATE technical_crawl_ownership SET issued_at=now()-interval '2 days',expires_at=now()-interval '1 day',verified_until=NULL",
    );
    await expect(authorized()).rejects.toThrow("technical_ownership_required");
    await expect(begin()).rejects.toThrow("technical_ownership_unavailable");
  });
  it("bounds verification and issuance across projects with recoverable windows", async () => {
    await issue();
    await db.query("UPDATE technical_ownership_limits SET verify_count=60");
    await expect(begin()).rejects.toThrow("technical_ownership_capacity");
    await db.query("UPDATE technical_ownership_limits SET issue_count=20");
    await expect(issue("q")).rejects.toThrow("technical_ownership_capacity");
    await db.query("UPDATE technical_ownership_limits SET hour_start=now()-interval '2 hours'");
    await issue("q");
    await begin();
    expect(
      (await db.query("SELECT issue_count,verify_count FROM technical_ownership_limits")).rows,
    ).toEqual([{ issue_count: 1, verify_count: 1 }]);
  });
  it("refuses banned owners even with existing verified proof", async () => {
    await issue();
    expect(await finish(await begin())).toBe(true);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1", [
      owner,
    ]);
    await expect(authorized()).rejects.toThrow();
    await expect(begin()).rejects.toThrow();
    await expect(issue()).rejects.toThrow();
  });
});
