import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { importLogEvidence, readLogEvidence, removeLogEvidence } from "./log-evidence.server";
import { prepareLogImport } from "./log-evidence";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  id = "00000000-0000-4000-8000-000000000003";
const scope = { ownerId: user, projectId: "p" };
const rpc: KnowledgeRpc = async (name, args) => {
  try {
    const keys = Object.keys(args);
    const result = await db.query<{ data: unknown }>(
      `SELECT public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) data`,
      Object.values(args),
    );
    return { data: result.rows[0].data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of ["20260909200000_project_knowledge.sql", "20260910220000_log_evidence.sql"])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q'),($2,'projects','p')",
    [user, other],
  );
});
afterAll(async () => {
  await db?.close();
});

const doc = () =>
  prepareLogImport({
    format: "milo-log-evidence-v1",
    source: "Synthetic SQL fixture",
    layer: "origin",
    method: "manual v1",
    hostname: "example.com",
    windowStart: "2026-08-01T00:00:00Z",
    windowEnd: "2026-08-02T00:00:00Z",
    completeness: "unknown",
    publicPathsConfirmed: true,
    supersedesId: null,
    rows: [
      {
        time: "2026-08-01T12:00:00Z",
        page: "/public",
        status: 404,
        method: "HEAD",
        userAgent: "GPTBot",
      },
    ],
  });
describe("real log history SQL/server integration", () => {
  it("deduplicates canonical identical imports and retains only safe data", async () => {
    const d = doc();
    const ids = await Promise.all([
      importLogEvidence(scope, d, rpc),
      importLogEvidence(scope, d, rpc),
    ]);
    expect(ids[0]).toBe(ids[1]);
    const rows = await readLogEvidence(scope, rpc);
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toEqual(d.input);
    expect(JSON.stringify(rows)).not.toContain("userAgent");
  });
  it("isolates owner and project reads, corrections and removals", async () => {
    const saved = await importLogEvidence(scope, doc(), rpc);
    for (const foreign of [
      { ownerId: other, projectId: "p" },
      { ownerId: user, projectId: "q" },
    ]) {
      expect(await readLogEvidence(foreign, rpc)).toEqual([]);
      await removeLogEvidence(foreign, saved, rpc);
      const d = doc();
      d.input.supersedesId = saved;
      await expect(importLogEvidence(foreign, d, rpc)).rejects.toThrow();
    }
    expect(await readLogEvidence(scope, rpc)).toHaveLength(1);
    await expect(
      importLogEvidence({ ...scope, projectId: "missing" }, doc(), rpc),
    ).rejects.toThrow();
  });
  it("preserves immutable correction chains and refuses competing replacements", async () => {
    const original = await importLogEvidence(scope, doc(), rpc);
    const d = doc();
    d.input.supersedesId = original;
    const corrected = await importLogEvidence(scope, d, rpc);
    d.input.source = "Competing";
    await expect(importLogEvidence(scope, d, rpc)).rejects.toThrow();
    d.input.supersedesId = corrected;
    await importLogEvidence(scope, d, rpc);
    expect(await readLogEvidence(scope, rpc)).toHaveLength(3);
    await removeLogEvidence(scope, original, rpc);
    expect(await readLogEvidence(scope, rpc)).toEqual([]);
  });
  it("erases all evidence when the owning project is removed", async () => {
    await importLogEvidence(scope, doc(), rpc);
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect((await db.query("SELECT count(*) n FROM project_log_evidence")).rows[0]).toEqual({
      n: 0,
    });
  });
  it("rejects durable raw fields and verification claims even at the SQL boundary", async () => {
    for (const change of [
      { verified: true },
      { input: { ...doc().input, ip: "secret" } },
      { input: { ...doc().input, rows: [{ ...doc().input.rows[0], userAgent: "secret" }] } },
      { input: { ...doc().input, rows: [{ ...doc().input.rows[0], page: "/x?token=secret" }] } },
    ])
      await expect(
        db.query("SELECT save_project_log_evidence($1,$2,$3)", [
          user,
          "p",
          { ...doc(), ...change },
        ]),
      ).rejects.toThrow();
    expect(await readLogEvidence(scope, rpc)).toEqual([]);
  });
  it("caps full history and allows identical dedupe at capacity", async () => {
    const saved = await importLogEvidence(scope, doc(), rpc);
    await db.query(
      "INSERT INTO project_log_evidence(user_id,project_id,document_hash,document) SELECT user_id,project_id,lpad(to_hex(g),64,'0'),document FROM project_log_evidence CROSS JOIN generate_series(1,49) g WHERE id=$1",
      [saved],
    );
    expect(await readLogEvidence(scope, rpc)).toHaveLength(50);
    expect(await importLogEvidence(scope, doc(), rpc)).toBe(saved);
    const d = doc();
    d.input.source = "Different";
    await expect(importLogEvidence(scope, d, rpc)).rejects.toThrow();
  });
  it("enforces RLS with no direct data access and only service RPC access", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM project_log_evidence")).rejects.toThrow(
        /permission denied/,
      );
      if (role !== "service_role")
        await expect(
          db.query("SELECT read_project_log_evidence($1,$2)", [user, "p"]),
        ).rejects.toThrow(/permission denied/);
      else
        expect(
          (await db.query("SELECT read_project_log_evidence($1,$2) data", [user, "p"])).rows[0],
        ).toEqual({ data: [] });
      await db.exec("RESET ROLE");
    }
    expect(
      (await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='project_log_evidence'"))
        .rows[0],
    ).toEqual({ relrowsecurity: true });
  });
});
