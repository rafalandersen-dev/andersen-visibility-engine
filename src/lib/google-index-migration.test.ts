import { requestGoogleIndex } from "./google-index.server";
import { normalizeGoogleIndex } from "./google-index";
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
  await db.exec("ALTER TABLE workspace_entities ADD COLUMN ord integer NOT NULL DEFAULT 0");
  await db.exec(readFileSync("supabase/migrations/20260909200000_project_knowledge.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260911110000_technical_crawls.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/20260911120000_technical_crawl_opportunities.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/20260911130000_google_index_inspections.sql", "utf8"),
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE google_index_inspections,google_index_dispatch_limits,google_index_account_limits,technical_crawls CASCADE;DELETE FROM workspace_entities WHERE collection='opportunities';UPDATE workspace_meta SET rev=1;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.test"}' WHERE user_id='${owner}';`,
  );
  await db.exec(
    `UPDATE workspace_entities SET data=data || '{"gscOAuth":{"selectedSite":{"siteUrl":"sc-domain:example.test"}}}' WHERE user_id='${owner}'`,
  );
});
afterAll(async () => await db?.close());
const reserve = async (id = run, user = owner, property = "sc-domain:example.test") =>
  (
    await db.query<{
      result: { claimed: boolean; record: { lease_token?: string; status: string } };
    }>(
      "SELECT reserve_google_index_inspection($1,'p',$2,$3,'https://example.test/page?q=1') result",
      [user, id, property],
    )
  ).rows[0].result;
const observation = {
  source: "google_index",
  inspectionMode: "indexed_version",
  url: "https://example.test/page?q=1",
  property: "sc-domain:example.test",
};
const finish = async (lease: string, result: unknown = observation) => {
  await db.query("SELECT authorize_google_index_dispatch($1,'p',$2,$3)", [owner, run, lease]);
  return (
    await db.query<{ result: boolean }>(
      "SELECT finish_google_index_inspection($1,'p',$2,$3,$4,NULL) result",
      [owner, run, lease, result],
    )
  ).rows[0].result;
};
const list = async (user = owner) =>
  (
    await db.query<{ result: Array<Record<string, unknown>> }>(
      "SELECT list_google_index_inspections($1,'p') result",
      [user],
    )
  ).rows[0].result;
describe("durable Google inspection attempts", () => {
  it("integrates owner context, once-only dispatch and canonical persisted results", async () => {
    let calls = 0;
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (
        ![
          "read_google_index_context",
          "reserve_google_index_inspection",
          "authorize_google_index_dispatch",
          "finish_google_index_inspection",
          "list_google_index_inspections",
        ].includes(name)
      )
        throw new Error("unexpected_rpc");
      const entries = Object.entries(args);
      const r = await db.query<{ result: unknown }>(
        `SELECT ${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) result`,
        entries.map(([, value]) => value),
      );
      return { data: r.rows[0].result, error: null };
    };
    const inspect = async (
      user: string,
      property: string,
      url: string,
      authorize: () => Promise<boolean>,
    ) => {
      expect(user).toBe(owner);
      expect(await authorize()).toBe(true);
      expect(await authorize()).toBe(false);
      calls++;
      return normalizeGoogleIndex(
        { inspectionResult: { indexStatusResult: { verdict: "PASS" } } },
        { url, property, observedAt: new Date().toISOString() },
      );
    };
    const input = { projectId: "p", requestId: run, url: "https://example.test/page?q=1" };
    const first = await requestGoogleIndex(owner, input, { rpc, inspect });
    expect(first.status).toBe("succeeded");
    expect(JSON.parse(first.observationJson!)).toMatchObject({ url: input.url, verdict: "PASS" });
    expect(await requestGoogleIndex(owner, input, { rpc, inspect })).toEqual(first);
    expect(calls).toBe(1);
    await expect(
      requestGoogleIndex(owner, { ...input, property: "sc-domain:other.test" }, { rpc, inspect }),
    ).rejects.toThrow();
    await expect(
      requestGoogleIndex(owner, { ...input, url: "https://other.test/" }, { rpc, inspect }),
    ).rejects.toThrow("google_inspection_scope");
    expect(calls).toBe(1);
  });
  it.each(["expired", "changed"])(
    "refuses dispatch after refresh if authorization is %s",
    async (condition) => {
      const first = await reserve();
      if (condition === "expired")
        await db.exec(
          "UPDATE google_index_inspections SET lease_until=now()+interval '10 seconds'",
        );
      else
        await db.exec(
          `UPDATE workspace_entities SET data=jsonb_set(data,'{gscOAuth,selectedSite,siteUrl}','"sc-domain:other.test"') WHERE user_id='${owner}'`,
        );
      const result = await db.query<{ ok: boolean }>(
        "SELECT authorize_google_index_dispatch($1,'p',$2,$3) ok",
        [owner, run, first.record.lease_token],
      );
      expect(result.rows[0].ok).toBe(false);
      expect(await list()).toMatchObject([
        { status: condition === "expired" ? "unknown" : "held" },
      ]);
    },
  );

  it("claims once, keeps exact query evidence and hides lease tokens from history", async () => {
    const first = await reserve();
    expect(first.claimed).toBe(true);
    expect(await reserve()).toMatchObject({ claimed: false, record: { status: "running" } });
    expect((await reserve()).record.lease_token).toBeUndefined();
    await expect(reserve(second)).rejects.toThrow("google_inspection_active");
    expect(await finish(first.record.lease_token!)).toBe(true);
    expect(await finish(first.record.lease_token!)).toBe(false);
    expect(await list()).toMatchObject([{ status: "succeeded", observation }]);
    expect(JSON.stringify(await list())).not.toContain(first.record.lease_token!);
    expect((await reserve()).claimed).toBe(false);
  });
  it("holds changed properties and refuses an invented observation", async () => {
    const first = await reserve();
    await expect(
      finish(first.record.lease_token!, { ...observation, url: "https://other.test/" }),
    ).rejects.toThrow("google_inspection_result_invalid");
    await db.exec(
      `UPDATE workspace_entities SET data=jsonb_set(data,'{gscOAuth,selectedSite,siteUrl}','"sc-domain:other.test"') WHERE user_id='${owner}'`,
    );
    expect(await finish(first.record.lease_token!)).toBe(false);
    expect(await list()).toMatchObject([{ status: "held", observation: null }]);
  });
  it("does not reclaim or accept late results after a timed-out request", async () => {
    const first = await reserve();
    await db.exec("UPDATE google_index_inspections SET lease_until=now()-interval '1 second'");
    expect(await reserve()).toMatchObject({ claimed: false, record: { status: "unknown" } });
    expect(await finish(first.record.lease_token!)).toBe(false);
    expect((await reserve(second)).claimed).toBe(true);
  });
  it("isolates owners and rejects suspended accounts and changed properties", async () => {
    await reserve();
    expect(await list(other)).toEqual([]);
    await expect(reserve(second, other)).rejects.toThrow("google_inspection_scope");
    await expect(reserve(second, owner, "sc-domain:wrong.test")).rejects.toThrow(
      "google_inspection_scope",
    );
    await db.exec(`UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='${owner}'`);
    await expect(list()).rejects.toThrow("technical_crawl_unavailable");
  });
  it("bounds fresh requests while preserving history and exact retries", async () => {
    const first = await reserve();
    await finish(first.record.lease_token!);
    await db.query(
      "INSERT INTO google_index_inspections(user_id,project_id,request_id,property,url,status,lease_token,lease_until) SELECT $1,'p',gen_random_uuid(),'sc-domain:example.test','https://example.test/','failed',gen_random_uuid(),now() FROM generate_series(1,99)",
      [owner],
    );
    expect((await reserve()).claimed).toBe(false);
    await expect(reserve(second)).rejects.toThrow("google_inspection_quota");
    await db.exec("UPDATE google_index_inspections SET created_at=now()-interval '2 hours'");
    expect((await reserve(second)).claimed).toBe(true);
    expect((await db.query("SELECT count(*)::int n FROM google_index_inspections")).rows).toEqual([
      { n: 101 },
    ]);
    expect(await list()).toHaveLength(20);
  });
  it("records unavailable outcomes as unknown without replaying the provider request", async () => {
    const first = await reserve();
    await db.query("SELECT finish_google_index_inspection($1,'p',$2,$3,NULL,'unavailable')", [
      owner,
      run,
      first.record.lease_token,
    ]);
    expect(await reserve()).toMatchObject({ claimed: false, record: { status: "unknown" } });
  });
  it("keeps records private and restricts entrypoints to the service role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM google_index_inspections")).rejects.toThrow(
        "permission denied",
      );
      if (role !== "service_role") await expect(list()).rejects.toThrow("permission denied");
      await db.exec("RESET ROLE");
    }
  });
});

it("enforces the active-project invariant even for direct storage insertion", async () => {
  await reserve();
  await expect(
    db.query(
      "INSERT INTO google_index_inspections(user_id,project_id,request_id,property,url,status,lease_token,lease_until) VALUES($1,'p',$2,'sc-domain:example.test','https://example.test/','running',gen_random_uuid(),now()+interval '1 minute')",
      [owner, second],
    ),
  ).rejects.toThrow("google_index_one_active_project");
  expect((await reserve()).claimed).toBe(false);
});
it("refuses reservation without the common owner workspace lock row", async () => {
  await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [owner]);
  try {
    await expect(reserve()).rejects.toThrow("technical_crawl_unavailable");
  } finally {
    await db.query("INSERT INTO workspace_meta(user_id,rev) VALUES($1,1)", [owner]);
  }
});

const requestAt = async (user: string, project: string, id: string) =>
  (
    await db.query<{ result: { claimed: boolean; record: { lease_token: string } } }>(
      "SELECT reserve_google_index_inspection($1,$2,$3,'sc-domain:example.test','https://example.test/page?q=1') result",
      [user, project, id],
    )
  ).rows[0].result;
const addProject = (user: string, project: string) =>
  db.query(
    `INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects',$2,'{"websiteUrl":"https://example.test","gscOAuth":{"selectedSite":{"siteUrl":"sc-domain:example.test"}}}')`,
    [user, project],
  );
const sharedBudget = async () =>
  (
    await db.query<{ minute_count: number; hour_count: number; leases: Record<string, string> }>(
      "SELECT minute_count,hour_count,leases FROM google_index_dispatch_limits",
    )
  ).rows[0];

it("bounds one account across projects while preserving capacity for another", async () => {
  await db.exec("BEGIN");
  try {
    await addProject(owner, "q");
    await addProject(owner, "r");
    await addProject(other, "q");
    await requestAt(owner, "p", run);
    await requestAt(owner, "q", second);
    const before = await sharedBudget();
    await db.exec("SAVEPOINT account_full");
    await expect(requestAt(owner, "r", other)).rejects.toThrow("google_inspection_quota");
    await db.exec("ROLLBACK TO SAVEPOINT account_full");
    expect(await sharedBudget()).toEqual(before);
    expect((await requestAt(other, "q", other)).claimed).toBe(true);
    expect(Object.keys((await sharedBudget()).leases)).toHaveLength(3);
  } finally {
    await db.exec("ROLLBACK");
  }
});

it("caps simultaneous Google work across independent accounts before any claim", async () => {
  await db.exec("BEGIN");
  try {
    for (let i = 10; i < 18; i++) {
      const who = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      await db.query("INSERT INTO auth.users(id) VALUES($1)", [who]);
      await db.query("INSERT INTO workspace_meta VALUES($1,1)", [who]);
      await addProject(who, "p");
      await requestAt(who, "p", who);
    }
    const before = await sharedBudget();
    expect(Object.keys(before.leases)).toHaveLength(8);
    await db.exec("SAVEPOINT global_full");
    await expect(reserve()).rejects.toThrow("google_inspection_quota");
    await db.exec("ROLLBACK TO SAVEPOINT global_full");
    expect(await sharedBudget()).toEqual(before);
    expect(
      (
        await db.query("SELECT count(*)::int n FROM google_index_inspections WHERE user_id=$1", [
          owner,
        ])
      ).rows,
    ).toEqual([{ n: 0 }]);
  } finally {
    await db.exec("ROLLBACK");
  }
});

it.each([
  ["google_index_dispatch_limits", "minute_count=30"],
  ["google_index_dispatch_limits", "hour_count=300"],
  ["google_index_account_limits", "minute_count=5"],
  ["google_index_account_limits", "hour_count=30"],
])("retains rate limits after completion and refuses %s %s", async (table, limit) => {
  const first = await reserve();
  await finish(first.record.lease_token!);
  await db.exec(`UPDATE ${table} SET ${limit}`);
  const before = await sharedBudget();
  await expect(reserve(second)).rejects.toThrow("google_inspection_quota");
  expect(await sharedBudget()).toEqual(before);
  expect((await reserve()).claimed).toBe(false);
});

it("keeps exact request replay free of new reservations and retains leases after deletion", async () => {
  await db.exec("BEGIN");
  try {
    await reserve();
    const before = await sharedBudget();
    await reserve();
    expect(await sharedBudget()).toEqual(before);
    await db.query("DELETE FROM workspace_entities WHERE user_id=$1 AND entity_id='p'", [owner]);
    await db.query("DELETE FROM auth.users WHERE id=$1", [owner]);
    expect(await sharedBudget()).toEqual(before);
    expect(
      (
        await db.query("SELECT count(*)::int n FROM google_index_account_limits WHERE user_id=$1", [
          owner,
        ])
      ).rows,
    ).toEqual([{ n: 1 }]);
  } finally {
    await db.exec("ROLLBACK");
  }
});

it("refuses dispatch when the saved shared lease is absent", async () => {
  const first = await reserve();
  await db.exec("UPDATE google_index_dispatch_limits SET leases='{}'");
  expect(
    (
      await db.query<{ ok: boolean }>("SELECT authorize_google_index_dispatch($1,'p',$2,$3) ok", [
        owner,
        run,
        first.record.lease_token,
      ])
    ).rows[0].ok,
  ).toBe(false);
  expect((await list())[0].dispatched_at).toBeNull();
});

it("protects shared and account admission tables from every exposed role", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ["google_index_dispatch_limits", "google_index_account_limits"]) {
      await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow("permission denied");
      await expect(db.query(`UPDATE ${table} SET hour_count=0`)).rejects.toThrow(
        "permission denied",
      );
    }
    await db.exec("RESET ROLE");
  }
});
