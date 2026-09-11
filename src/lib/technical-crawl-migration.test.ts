import { stepTechnicalRun } from "./technical-crawl.server";
import { robotsEvidence } from "./technical-robots";
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
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE technical_crawls CASCADE;DELETE FROM workspace_entities WHERE collection='opportunities';UPDATE workspace_meta SET rev=1;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.test"}' WHERE user_id='${owner}';`,
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
  it("runs the controller through actual scoped SQL and persists one page", async () => {
    await start();
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (!/^(?:claim|save|read)_technical_crawl(?:_step)?$/.test(name))
        throw new Error("unexpected_rpc");
      const entries = Object.entries(args);
      const result = await db.query<{ result: unknown }>(
        `SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) result`,
        entries.map(([, value]) => value),
      );
      return { data: result.rows[0].result, error: null };
    };
    const deps = {
      rpc,
      robots: async () => robotsEvidence(404),
      sitemaps: () => async (url: string) => ({
        url,
        status: url.endsWith("/sitemap.xml") ? 200 : 404,
        contentAccepted: true,
        truncated: false,
        observedAt: new Date().toISOString(),
        body: "<urlset><url><loc>https://example.test/from-map?q=2</loc></url></urlset>",
      }),
      fetcher: () => async (url: string) => ({
        state: "response" as const,
        url,
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<h1>Observed</h1>",
      }),
      now: () => new Date(),
    };
    expect((await stepTechnicalRun(owner, { projectId: "p", runId: run }, deps))?.status).toBe(
      "running",
    );
    await stepTechnicalRun(owner, { projectId: "p", runId: run }, deps);
    await stepTechnicalRun(owner, { projectId: "p", runId: run }, deps);
    await stepTechnicalRun(owner, { projectId: "p", runId: run }, deps);
    const finished = await stepTechnicalRun(owner, { projectId: "p", runId: run }, deps);
    expect(finished?.status).toBe("completed");
    expect(finished?.state?.pages[0].observation?.headings).toEqual(["Observed"]);
    expect(finished?.state?.pages[1]).toMatchObject({
      requestedUrl: "https://example.test/from-map?q=2",
      depth: null,
      state: "observed",
    });
    expect(finished?.state?.sitemaps?.entries[0].files).toEqual([
      "https://example.test/sitemap.xml",
    ]);
  });
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
    const r = (
      await db.query<{ result: unknown }>("SELECT read_technical_crawl($1,'p',$2) result", [
        owner,
        run,
      ])
    ).rows[0].result;
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

describe("immutable crawl evidence to opportunity", () => {
  async function prepare() {
    await start();
    const page = {
      requestedUrl: "https://example.test/a",
      depth: 1,
      state: "observed",
      observation: {
        url: "https://example.test/a",
        status: 200,
        observedAt: "2026-09-11T00:00:00Z",
        complete: true,
        title: "",
        descriptions: [],
        headings: [],
        canonicals: [],
        robots: [],
        structuredData: [],
      },
    };
    await db.query(
      "UPDATE technical_crawls SET status='completed',revision=3,state=$1 WHERE user_id=$2 AND run_id=$3",
      [
        { origin: "https://example.test", pages: [page], coverageLimits: ["page_limit"] },
        owner,
        run,
      ],
    );
  }
  const capture = (code = "missing_title", revision = 3) =>
    db.query<{ result: { evidenceId: string; opportunityId: string; hash: string } }>(
      "SELECT capture_technical_crawl_finding($1,'p',$2,$3,0,$4,'Review observed title') result",
      [owner, run, revision, code],
    );
  it.each(["none", "NONE", "googlebot: none", "follow, none"])(
    "captures the observed none alias %s",
    async (value) => {
      await prepare();
      await db.query(
        "UPDATE technical_crawls SET state=jsonb_set(state,'{pages,0,observation,robots}',$1) WHERE run_id=$2",
        [JSON.stringify([{ source: "header", agent: "*", value }]), run],
      );
      expect((await capture("noindex")).rows[0].result.evidenceId).toBeTruthy();
    },
  );
  it.each(["nonetheless", "x-none", "none-other", "index, follow"])(
    "refuses an unsupported noindex capture for %s",
    async (value) => {
      await prepare();
      await db.query(
        "UPDATE technical_crawls SET state=jsonb_set(state,'{pages,0,observation,robots}',$1) WHERE run_id=$2",
        [JSON.stringify([{ source: "meta", agent: "*", value }]), run],
      );
      await expect(capture("noindex")).rejects.toThrow();
    },
  );
  it("captures sitemap membership for both requested and observed URLs", async () => {
    await prepare();
    const entries = [
      { url: "https://example.test/a", files: ["old.xml"] },
      { url: "https://example.test/final", files: ["final.xml"] },
      { url: "https://example.test/other", files: ["other.xml"] },
    ];
    await db.query(
      "UPDATE technical_crawls SET state=jsonb_set(jsonb_set(state,'{pages,0,observation,url}',$1),'{sitemaps}',$2)",
      [JSON.stringify("https://example.test/final"), JSON.stringify({ entries })],
    );
    const result = (await capture()).rows[0].result;
    const files = (
      await db.query<{ files: unknown }>(
        "SELECT read_technical_crawl_finding($1,'p',$2)->'snapshot'->'sitemapFiles' files",
        [owner, result.evidenceId],
      )
    ).rows[0].files;
    expect(files).toEqual(entries.slice(0, 2));
  });
  it("keeps independently valid finding snapshots small even when traversal links are large", async () => {
    await prepare();
    const links = Array.from(
      { length: 500 },
      (_, i) => "https://example.test/" + "a".repeat(3400) + i,
    );
    await db.query(
      "UPDATE technical_crawls SET state=jsonb_set(jsonb_set(jsonb_set(jsonb_set(state,'{pages,0,observation,internalLinks}',$1),'{pages,0,observation,canonicals}',$2),'{pages,0,observation,robots}',$3),'{pages,0,observation,structuredData}',$4)",
      [
        JSON.stringify(links),
        JSON.stringify(["https://example.test/a", "https://example.test/b"]),
        JSON.stringify([{ source: "meta", agent: "*", value: "noindex" }]),
        JSON.stringify([{ state: "invalid_json", types: [], complete: true }]),
      ],
    );
    for (const code of [
      "missing_title",
      "missing_description",
      "missing_h1",
      "multiple_canonicals",
      "noindex",
      "invalid_jsonld",
    ])
      await capture(code);
    const rows = (
      await db.query<{ code: string; bytes: number; observation: Record<string, unknown> }>(
        "SELECT code,octet_length(snapshot::text) bytes,snapshot->'page'->'observation' observation FROM technical_crawl_findings",
      )
    ).rows;
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.bytes).toBeLessThan(2000);
      expect(row.observation).not.toHaveProperty("internalLinks");
    }
    expect(rows.find((r) => r.code === "multiple_canonicals")?.observation.canonicalCount).toBe(2);
    expect(rows.find((r) => r.code === "missing_title")?.observation).not.toHaveProperty("robots");
    await expect(
      db.query(
        "UPDATE technical_crawl_findings SET snapshot=snapshot||jsonb_build_object('padding',repeat('x',33000))",
      ),
    ).rejects.toThrow(/check constraint/);
  });
  it("appends findings after existing workspace opportunities in capture order", async () => {
    await prepare();
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,ord,data) VALUES($1,'opportunities','existing',7,'{}')",
      [owner],
    );
    const first = (await capture("missing_title")).rows[0].result;
    const second = (await capture("missing_description")).rows[0].result;
    const rows = (
      await db.query<{ entity_id: string; ord: number }>(
        "SELECT entity_id,ord FROM workspace_entities WHERE collection='opportunities' ORDER BY ord,entity_id",
      )
    ).rows;
    expect(rows).toEqual([
      { entity_id: "existing", ord: 7 },
      { entity_id: first.opportunityId, ord: 8 },
      { entity_id: second.opportunityId, ord: 9 },
    ]);
    await capture("missing_title");
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM workspace_entities WHERE collection='opportunities'",
        )
      ).rows,
    ).toEqual([{ n: 3 }]);
  });
  it("atomically creates one captured opportunity and immutable source receipt, retaining idempotency", async () => {
    await prepare();
    const first = (await capture()).rows[0].result;
    expect((await capture()).rows[0].result).toEqual(first);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM workspace_entities WHERE collection='opportunities'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    const evidence = (
      await db.query<{
        result: { snapshot: { page: unknown; coverageLimits: string[] }; hash: string };
      }>("SELECT read_technical_crawl_finding($1,'p',$2) result", [owner, first.evidenceId])
    ).rows[0].result;
    expect(evidence.snapshot.coverageLimits).toEqual(["page_limit"]);
    expect(evidence.hash).toMatch(/^[a-f0-9]{64}$/);
    await db.query(
      "UPDATE workspace_entities SET data=jsonb_set(data,'{title}','\"Edited opportunity\"') WHERE collection='opportunities'",
    );
    const unchanged = (
      await db.query<{ result: { snapshot: unknown; hash: string } }>(
        "SELECT read_technical_crawl_finding($1,'p',$2) result",
        [owner, first.evidenceId],
      )
    ).rows[0].result;
    expect(unchanged.snapshot).toEqual(evidence.snapshot);
    expect(unchanged.hash).toBe(evidence.hash);
    await db.query(
      "DELETE FROM workspace_entities WHERE collection='opportunities' AND entity_id=$1",
      [first.opportunityId],
    );
    expect((await capture()).rows[0].result).toEqual({ ...first, opportunityExists: false });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM workspace_entities WHERE collection='opportunities'",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
  });
  it("denies direct evidence access and unauthenticated RPC use", async () => {
    await prepare();
    await db.exec("SET ROLE authenticated");
    await expect(db.query("SELECT * FROM technical_crawl_findings")).rejects.toThrow(
      "permission denied",
    );
    await expect(capture()).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE;SET ROLE service_role");
    await expect(db.query("UPDATE technical_crawl_findings SET code='noindex'")).rejects.toThrow(
      "permission denied",
    );
    await db.exec("RESET ROLE");
  });
  it("rejects stale or invented findings and prevents cross-owner reads", async () => {
    await prepare();
    await expect(capture("missing_title", 2)).rejects.toThrow("technical_finding_changed");
    await expect(capture("http_error")).rejects.toThrow("technical_finding_not_observed");
    const record = (await capture()).rows[0].result;
    expect(
      (
        await db.query("SELECT read_technical_crawl_finding($1,'p',$2) result", [
          other,
          record.evidenceId,
        ])
      ).rows[0],
    ).toEqual({ result: null });
  });
  it("does not infer absent elements from a partial read or admit active crawls", async () => {
    await prepare();
    await db.query(
      "UPDATE technical_crawls SET state=jsonb_set(state,'{pages,0,observation,complete}','false')",
    );
    await expect(capture()).rejects.toThrow("technical_finding_not_observed");
    await db.query("UPDATE technical_crawls SET status='running'");
    await expect(capture()).rejects.toThrow("technical_finding_changed");
  });
});
