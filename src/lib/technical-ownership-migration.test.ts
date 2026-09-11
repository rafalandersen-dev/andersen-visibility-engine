import { startTechnicalCrawl } from "./technical-crawl";
import { robotsEvidence } from "./technical-robots";
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
    "20260911120000_technical_crawl_opportunities.sql",
    "20260911130000_google_index_inspections.sql",
    "20260911140000_technical_performance_requests.sql",
    "20260911150000_technical_crawl_ownership.sql",
    "20260911160000_technical_crawl_dispatch.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE technical_crawls,technical_crawl_ownership,technical_ownership_limits,technical_crawl_dispatch_limits CASCADE;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.test"}';`,
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
  it("keeps history/context reads independent of exclusive mutation admission", async () => {
    await db.exec("BEGIN");
    try {
      await db.exec(
        "CREATE OR REPLACE FUNCTION public.assert_technical_crawl_owner(p_user uuid,p_project text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'exclusive_admission_busy' USING ERRCODE='55P03'; END; $$;",
      );
      for (const name of [
        "list_technical_crawls",
        "read_technical_crawl_context",
        "list_google_index_inspections",
        "read_google_index_context",
        "list_technical_performance_requests",
        "read_technical_performance_context",
        "read_technical_crawl_ownership",
      ]) {
        await db.query(`SELECT ${name}($1,'p')`, [owner]);
      }
      await db.query("SELECT read_technical_crawl($1,'p',$2)", [owner, other]);
      await db.query("SELECT read_technical_crawl_finding($1,'p',$2)", [owner, other]);
      for (const statement of [
        "SELECT reserve_google_index_inspection($1,'p',$2,'sc-domain:example.test','https://example.test/')",
        "SELECT reserve_technical_performance_request($1,'p',$2,'https://example.test','https://example.test','https://example.test/','crux','url','mobile')",
      ]) {
        await db.exec("SAVEPOINT mutation_check");
        await expect(db.query(statement, [owner, other])).rejects.toThrow(
          "exclusive_admission_busy",
        );
        await db.exec("ROLLBACK TO SAVEPOINT mutation_check");
      }
      await expect(issue()).rejects.toThrow("exclusive_admission_busy");
    } finally {
      await db.exec("ROLLBACK");
    }
  });
  it("still refuses read-only history for a banned or wrong project owner", async () => {
    for (const name of [
      "list_technical_crawls",
      "list_google_index_inspections",
      "list_technical_performance_requests",
      "read_technical_crawl_ownership",
    ]) {
      await expect(db.query(`SELECT ${name}($1,'p')`, [other])).rejects.toThrow();
    }
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1", [
      owner,
    ]);
    for (const name of [
      "list_technical_crawls",
      "list_google_index_inspections",
      "list_technical_performance_requests",
      "read_technical_crawl_ownership",
    ]) {
      await expect(db.query(`SELECT ${name}($1,'p')`, [owner])).rejects.toThrow();
    }
  });

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
    expect(
      (await db.query("SELECT admission_hold,resume_status FROM technical_crawls")).rows,
    ).toEqual([{ admission_hold: "ownership", resume_status: "preparing" }]);
    await issue();
    await finish(await begin());
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT resume_technical_crawl_admission($1,'p',$2) result",
          [owner, run],
        )
      ).rows[0].result,
    ).toBe(true);
    expect(
      (await db.query("SELECT status,state,admission_hold,resume_status FROM technical_crawls"))
        .rows,
    ).toEqual([{ status: "preparing", state: {}, admission_hold: null, resume_status: null }]);
  });
  it("resumes saved running evidence after ownership verification expires", async () => {
    const run = "00000000-0000-4000-8000-000000000003";
    await issue();
    await finish(await begin());
    await db.query(
      "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test')",
      [owner, run],
    );
    const grant = (
      await db.query<{ result: { lease_token: string } }>(
        "SELECT claim_technical_crawl($1,'p',$2) result",
        [owner, run],
      )
    ).rows[0].result;
    const now = new Date().toISOString();
    const state = startTechnicalCrawl({
      siteUrl: "https://example.test",
      robots: robotsEvidence(404),
      robotsFetchedAt: now,
      now,
    });
    await db.query("SELECT save_technical_crawl_step($1,'p',$2,$3,1,$4,'running')", [
      owner,
      run,
      grant.lease_token,
      state,
    ]);
    await db.exec("UPDATE technical_crawl_ownership SET verified_until=now()-interval '1 second'");
    await db.query("SELECT claim_technical_crawl($1,'p',$2)", [owner, run]);
    expect(
      (await db.query("SELECT status,resume_status,state FROM technical_crawls")).rows,
    ).toEqual([{ status: "held", resume_status: "running", state }]);
    await finish(await begin());
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT resume_technical_crawl_admission($1,'p',$2) result",
          [owner, run],
        )
      ).rows[0].result,
    ).toBe(true);
    expect((await db.query("SELECT status,state FROM technical_crawls")).rows).toEqual([
      { status: "running", state },
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
    expect(
      (await db.query("SELECT admission_hold,resume_status FROM technical_crawls")).rows,
    ).toEqual([{ admission_hold: "ownership", resume_status: "preparing" }]);
    await issue();
    await finish(await begin());
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT resume_technical_crawl_admission($1,'p',$2) result",
          [owner, run],
        )
      ).rows[0].result,
    ).toBe(true);
    expect(
      (await db.query("SELECT status,state,admission_hold,resume_status FROM technical_crawls"))
        .rows,
    ).toEqual([{ status: "preparing", state: {}, admission_hold: null, resume_status: null }]);
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
      await expect(db.query("SELECT * FROM technical_crawl_dispatch_limits")).rejects.toThrow(
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

describe("per-connection crawl dispatch", () => {
  const run = "00000000-0000-4000-8000-000000000003";
  async function ready() {
    await issue();
    await finish(await begin());
    await db.query(
      "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test')",
      [owner, run],
    );
    return (
      await db.query<{ result: { lease_token: string } }>(
        "SELECT claim_technical_crawl($1,'p',$2) result",
        [owner, run],
      )
    ).rows[0].result.lease_token;
  }
  const acquire = async (lease: string, origin = "https://example.test") =>
    (
      await db.query<{ result: { lease: string; expiresAt: string } }>(
        "SELECT acquire_technical_crawl_dispatch($1,'p',$2,$3,$4,'8.8.8.8') result",
        [owner, run, lease, origin],
      )
    ).rows[0].result;
  const release = (lease: string, who = owner) =>
    db.query("SELECT release_technical_crawl_dispatch($1,'https://example.test',$2,'8.8.8.8')", [
      who,
      lease,
    ]);
  it("admits two connections, scopes release ownership and recovers expired leases", async () => {
    const runLease = await ready();
    const first = await acquire(runLease);
    await acquire(runLease);
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    await release(first.lease, other);
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    await release(first.lease);
    await acquire(runLease);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET leases=jsonb_build_object($1::text,now()-interval '1 second')",
      [other],
    );
    await acquire(runLease);
  });
  it("requires current proof, origin and live run lease before touching budgets", async () => {
    const runLease = await ready();
    await expect(acquire(runLease, "https://foreign.test")).rejects.toThrow();
    await expect(acquire(other)).rejects.toThrow("technical_dispatch_ownership");
    expect((await db.query("SELECT * FROM technical_crawl_dispatch_limits")).rows).toEqual([]);
    await db.query("SELECT revoke_technical_crawl_ownership($1,'p')", [owner]);
    await expect(acquire(runLease)).rejects.toThrow("technical_ownership_required");
  });
  it("enforces target rate atomically without consuming the failed account allowance", async () => {
    const runLease = await ready();
    const first = await acquire(runLease);
    await release(first.lease);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_count=60 WHERE scope='target'",
    );
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    expect(
      (
        await db.query(
          "SELECT minute_count FROM technical_crawl_dispatch_limits WHERE scope='account'",
        )
      ).rows,
    ).toEqual([{ minute_count: 1 }]);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_start=now()-interval '2 minutes',hour_count=600 WHERE scope='target'",
    );
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET hour_start=now()-interval '2 hours'",
    );
    await acquire(runLease);
  });
  it("enforces address quotas atomically and canonicalizes IPv6 addresses", async () => {
    const runLease = await ready();
    const first = await acquire(runLease);
    await release(first.lease);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_count=60 WHERE scope='address'",
    );
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    expect(
      (
        await db.query(
          "SELECT minute_count FROM technical_crawl_dispatch_limits WHERE scope IN ('account','target')",
        )
      ).rows,
    ).toEqual([{ minute_count: 1 }, { minute_count: 1 }]);
    for (const address of ["2606:4700:0000:0000:0000:0000:0000:1111", "2606:4700::1111"]) {
      await db.query(
        "SELECT acquire_technical_crawl_dispatch($1,'p',$2,$3,'https://example.test',$4::inet)",
        [owner, run, runLease, address],
      );
    }
    expect(
      (
        await db.query(
          "SELECT scope_key,minute_count FROM technical_crawl_dispatch_limits WHERE scope='address' AND scope_key<>'8.8.8.8'",
        )
      ).rows,
    ).toEqual([{ scope_key: "2606:4700::1111", minute_count: 2 }]);
  });
  it("enforces account minute and hour limits and denies expired run leases", async () => {
    const runLease = await ready();
    const first = await acquire(runLease);
    await release(first.lease);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_count=120 WHERE scope='account'",
    );
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_start=now()-interval '2 minutes',hour_count=1200 WHERE scope='account'",
    );
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET hour_start=now()-interval '2 hours'",
    );
    await db.query("UPDATE technical_crawls SET lease_until=now()+interval '1 second'");
    await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_ownership");
  });
  it.each(["capacity", "ownership"])(
    "keeps changed-website connection holds nonresumable: %s",
    async (reason) => {
      const runLease = await ready();
      const state = { origin: "https://example.test", retained: "evidence", queue: ["pending"] };
      await db.query("UPDATE technical_crawls SET state=$1", [state]);
      await db.query("UPDATE workspace_entities SET data=$1 WHERE user_id=$2 AND entity_id='p'", [
        { websiteUrl: "https://changed.test" },
        owner,
      ]);
      expect(
        (
          await db.query<{ result: boolean }>(
            "SELECT hold_technical_crawl_admission($1,'p',$2,$3,1,$4) result",
            [owner, run, runLease, reason],
          )
        ).rows[0].result,
      ).toBe(true);
      expect(
        (
          await db.query(
            "SELECT status,state,admission_hold,resume_status,retry_after FROM technical_crawls",
          )
        ).rows,
      ).toEqual([
        { status: "held", state, admission_hold: null, resume_status: null, retry_after: null },
      ]);
    },
  );
  it("holds and explicitly resumes without altering saved evidence or queue", async () => {
    const runLease = await ready();
    const state = { origin: "https://example.test", retained: "evidence", queue: ["pending"] };
    await db.query("UPDATE technical_crawls SET state=$1", [state]);
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT hold_technical_crawl_admission($1,'p',$2,$3,1,'capacity') result",
          [owner, run, runLease],
        )
      ).rows[0].result,
    ).toBe(true);
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT resume_technical_crawl_admission($1,'p',$2) result",
          [owner, run],
        )
      ).rows[0].result,
    ).toBe(false);
    await db.query("UPDATE technical_crawls SET retry_after=now()-interval '1 second'");
    expect(
      (
        await db.query<{ result: boolean }>(
          "SELECT resume_technical_crawl_admission($1,'p',$2) result",
          [owner, run],
        )
      ).rows[0].result,
    ).toBe(true);
    expect(
      (await db.query("SELECT status,state,admission_hold FROM technical_crawls")).rows,
    ).toEqual([{ status: "preparing", state, admission_hold: null }]);
  });
  it("keeps global target quotas shared between verified owners", async () => {
    const runLease = await ready();
    const first = await acquire(runLease);
    await release(first.lease);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_count=60 WHERE scope='target'",
    );
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p',$2)",
      [other, { websiteUrl: "https://example.test" }],
    );
    try {
      await issue("p", other);
      const attempt = (
        await db.query<{ result: { attempt_token: string } }>(
          "SELECT begin_technical_ownership_verification($1,'p') result",
          [other],
        )
      ).rows[0].result.attempt_token;
      await db.query("SELECT finish_technical_ownership_verification($1,'p',$2,true)", [
        other,
        attempt,
      ]);
      await db.query(
        "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test')",
        [other, run],
      );
      const lease = (
        await db.query<{ result: { lease_token: string } }>(
          "SELECT claim_technical_crawl($1,'p',$2) result",
          [other, run],
        )
      ).rows[0].result.lease_token;
      await expect(
        db.query(
          "SELECT acquire_technical_crawl_dispatch($1,'p',$2,$3,'https://example.test','8.8.8.8')",
          [other, run, lease],
        ),
      ).rejects.toThrow("technical_dispatch_capacity");
      expect(
        (
          await db.query(
            "SELECT * FROM technical_crawl_dispatch_limits WHERE scope='account' AND scope_key=$1",
            [other],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await db.query("DELETE FROM workspace_entities WHERE user_id=$1", [other]);
    }
  });

  it.each(["minute", "hour"])(
    "leaves shared-IP capacity after one owner exhausts its %s share",
    async (window) => {
      const field = window === "minute" ? "minute_count" : "hour_count";
      const cap = window === "minute" ? 30 : 300;
      const runLease = await ready();
      const first = await acquire(runLease);
      await release(first.lease);
      await db.query(
        "UPDATE technical_crawl_dispatch_limits SET " +
          field +
          "=$1 WHERE scope IN ('address','account_address')",
        [cap],
      );
      await expect(acquire(runLease)).rejects.toThrow("technical_dispatch_capacity");
      await db.query(
        "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p',$2)",
        [other, { websiteUrl: "https://alias.test" }],
      );
      try {
        await db.query(
          "SELECT issue_technical_crawl_ownership($1,'p','https://alias.test','https://alias.test',$2)",
          [other, token],
        );
        const attempt = (
          await db.query<{ result: { attempt_token: string } }>(
            "SELECT begin_technical_ownership_verification($1,'p') result",
            [other],
          )
        ).rows[0].result.attempt_token;
        await db.query("SELECT finish_technical_ownership_verification($1,'p',$2,true)", [
          other,
          attempt,
        ]);
        await db.query(
          "SELECT start_technical_crawl($1,'p',$2,1,'https://alias.test','https://alias.test')",
          [other, run],
        );
        const grant = (
          await db.query<{ result: { lease_token: string } }>(
            "SELECT claim_technical_crawl($1,'p',$2) result",
            [other, run],
          )
        ).rows[0].result.lease_token;
        await db.query(
          "SELECT acquire_technical_crawl_dispatch($1,'p',$2,$3,'https://alias.test','8.8.8.8')",
          [other, run, grant],
        );
        expect(
          (
            await db.query(
              "SELECT " +
                field +
                " AS consumed FROM technical_crawl_dispatch_limits WHERE scope='address'",
            )
          ).rows,
        ).toEqual([{ consumed: cap + 1 }]);
        expect(
          (
            await db.query(
              "SELECT " +
                field +
                " AS consumed FROM technical_crawl_dispatch_limits WHERE scope='account_address' AND scope_key=$1",
              [owner + ":8.8.8.8"],
            )
          ).rows,
        ).toEqual([{ consumed: cap }]);
      } finally {
        await db.query("DELETE FROM workspace_entities WHERE user_id=$1", [other]);
      }
    },
  );
  it("shares address quotas across different verified hostnames and owners", async () => {
    const runLease = await ready();
    const first = await acquire(runLease);
    await release(first.lease);
    await db.query(
      "UPDATE technical_crawl_dispatch_limits SET minute_count=60 WHERE scope='address'",
    );
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','p',$2)",
      [other, { websiteUrl: "https://alias.test" }],
    );
    try {
      await db.query(
        "SELECT issue_technical_crawl_ownership($1,'p','https://alias.test','https://alias.test',$2)",
        [other, token],
      );
      const attempt = (
        await db.query<{ result: { attempt_token: string } }>(
          "SELECT begin_technical_ownership_verification($1,'p') result",
          [other],
        )
      ).rows[0].result.attempt_token;
      await db.query("SELECT finish_technical_ownership_verification($1,'p',$2,true)", [
        other,
        attempt,
      ]);
      await db.query(
        "SELECT start_technical_crawl($1,'p',$2,1,'https://alias.test','https://alias.test')",
        [other, run],
      );
      const lease = (
        await db.query<{ result: { lease_token: string } }>(
          "SELECT claim_technical_crawl($1,'p',$2) result",
          [other, run],
        )
      ).rows[0].result.lease_token;
      await expect(
        db.query(
          "SELECT acquire_technical_crawl_dispatch($1,'p',$2,$3,'https://alias.test','8.8.8.8')",
          [other, run, lease],
        ),
      ).rejects.toThrow("technical_dispatch_capacity");
      expect(
        (
          await db.query(
            "SELECT * FROM technical_crawl_dispatch_limits WHERE scope='account' AND scope_key=$1",
            [other],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await db.query("DELETE FROM workspace_entities WHERE user_id=$1", [other]);
    }
  });
});

it.each([false, true])(
  "does not offer admission resume for a changed website: save=%s",
  async (saving) => {
    const run = "00000000-0000-4000-8000-000000000003";
    await issue();
    await finish(await begin());
    await db.query(
      "SELECT start_technical_crawl($1,'p',$2,1,'https://example.test','https://example.test')",
      [owner, run],
    );
    const lease = saving
      ? (
          await db.query<{ result: { lease_token: string; revision: number } }>(
            "SELECT claim_technical_crawl($1,'p',$2) result",
            [owner, run],
          )
        ).rows[0].result
      : null;
    await db.query("UPDATE workspace_entities SET data=$1 WHERE user_id=$2 AND entity_id='p'", [
      { websiteUrl: "https://changed.test" },
      owner,
    ]);
    if (lease)
      await db.query("SELECT save_technical_crawl_step($1,'p',$2,$3,$4,$5,'running')", [
        owner,
        run,
        lease.lease_token,
        lease.revision,
        { origin: "https://example.test" },
      ]);
    else await db.query("SELECT claim_technical_crawl($1,'p',$2)", [owner, run]);
    expect(
      (await db.query("SELECT status,state,admission_hold,resume_status FROM technical_crawls"))
        .rows,
    ).toEqual([{ status: "held", state: {}, admission_hold: null, resume_status: null }]);
  },
);
