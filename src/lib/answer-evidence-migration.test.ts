import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  importAnswerEvidence,
  readAnswerEvidence,
  saveEvidencePrompt,
  removeAnswerEvidence,
} from "./answer-evidence.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  id = "00000000-0000-4000-8000-000000000003";
const scope = { ownerId: user, projectId: "p" };
const data = {
  prompt: "Synthetic fixture prompt",
  intent: "discovery",
  source: "manual",
  market: "SE",
  language: "sv",
  brand: "Milo",
  websiteUrl: "https://example.com",
  competitorUrls: [],
  active: true,
};
const input = {
  promptId: id,
  promptRevision: 1,
  surface: "Synthetic fixture",
  mode: "api",
  method: "fixture v1",
  modelVersion: null,
  capturedAt: "2026-08-01T00:00:00Z",
  status: "complete",
  rawAnswer: "Milo",
  citations: [],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
};
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
  for (const name of ["20260909200000_project_knowledge.sql", "20260910210000_answer_evidence.sql"])
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
describe("private answer history SQL with real server round trips", () => {
  it("saves immutable prompt revisions and rejects stale concurrent edits", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    const edits = await Promise.allSettled([
      saveEvidencePrompt(scope, id, 1, { ...data, prompt: "first change" }, rpc),
      saveEvidencePrompt(scope, id, 1, { ...data, prompt: "second change" }, rpc),
    ]);
    expect(edits.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const state = await readAnswerEvidence(scope, rpc);
    expect(state.prompts).toHaveLength(2);
    expect(state.prompts.find((p) => p.revision === 1)?.data.prompt).toBe(data.prompt);
  });
  it("atomically deduplicates identical imports and preserves prompt snapshot after edits", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    const ids = await Promise.all([
      importAnswerEvidence(scope, input, rpc),
      importAnswerEvidence(scope, input, rpc),
    ]);
    expect(ids[0]).toBe(ids[1]);
    await saveEvidencePrompt(scope, id, 1, { ...data, brand: "Other" }, rpc);
    const state = await readAnswerEvidence(scope, rpc);
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0].prompt.data.brand).toBe("Milo");
    expect(state.answers[0].analysis.mention).toBe(true);
  });
  it("isolates owners/projects for reads, imports and erasure", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    const answer = await importAnswerEvidence(scope, input, rpc);
    for (const foreign of [
      { ownerId: other, projectId: "p" },
      { ownerId: user, projectId: "q" },
    ]) {
      expect((await readAnswerEvidence(foreign, rpc)).answers).toEqual([]);
      await expect(importAnswerEvidence(foreign, input, rpc)).rejects.toThrow();
      await removeAnswerEvidence(foreign, "answer", answer, rpc);
    }
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
    await expect(readAnswerEvidence({ ...scope, projectId: "missing" }, rpc)).rejects.toThrow();
  });
  it("preserves corrections and refuses competing replacements or foreign targets", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    const original = await importAnswerEvidence(scope, input, rpc);
    const corrected = await importAnswerEvidence(
      scope,
      { ...input, rawAnswer: "Another answer", supersedesId: original },
      rpc,
    );
    expect(corrected).not.toBe(original);
    await expect(
      importAnswerEvidence(
        scope,
        { ...input, rawAnswer: "Competing correction", supersedesId: original },
        rpc,
      ),
    ).rejects.toThrow();
    await expect(
      importAnswerEvidence(scope, { ...input, supersedesId: id }, rpc),
    ).rejects.toThrow();
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(2);
    await removeAnswerEvidence(scope, "answer", original, rpc);
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]);
  });
  it("rejects tampered snapshots and verified flags at database boundary", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    const answer = await importAnswerEvidence(scope, input, rpc);
    const state = await readAnswerEvidence(scope, rpc);
    const original = state.answers.find((a) => a.id === answer)!;
    const document = {
      input: { ...input, rawAnswer: "different" },
      prompt: original.prompt,
      analysis: original.analysis,
    };
    await expect(
      db.query("SELECT save_ai_answer_evidence($1,$2,$3)", [
        user,
        "p",
        { ...document, prompt: { ...document.prompt, data: { ...data, brand: "Tampered" } } },
      ]),
    ).rejects.toThrow("prompt_changed");
    await expect(
      db.query("SELECT save_ai_answer_evidence($1,$2,$3)", [
        user,
        "p",
        { ...document, analysis: { ...document.analysis, verified: true } },
      ]),
    ).rejects.toThrow("invalid_answer");
  });
  it("erases dependent history on prompt or project removal", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    await importAnswerEvidence(scope, input, rpc);
    await removeAnswerEvidence(scope, "prompt", id, rpc);
    expect(await readAnswerEvidence(scope, rpc)).toEqual({ prompts: [], answers: [] });
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    await importAnswerEvidence(scope, input, rpc);
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect((await db.query("SELECT count(*) n FROM ai_answer_evidence")).rows[0]).toEqual({ n: 0 });
  });
  it("enforces history caps while allowing identical dedupe at capacity", async () => {
    await saveEvidencePrompt(scope, id, 0, data, rpc);
    const original = await importAnswerEvidence(scope, input, rpc);
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,prompt_id,prompt_revision,document_hash,document) SELECT user_id,project_id,prompt_id,prompt_revision,'synthetic-'||g,document FROM ai_answer_evidence CROSS JOIN generate_series(1,99) g WHERE id=$1",
      [original],
    );
    expect(await importAnswerEvidence(scope, input, rpc)).toBe(original);
    await expect(
      importAnswerEvidence(scope, { ...input, rawAnswer: "new" }, rpc),
    ).rejects.toThrow();
    await db.query(
      "INSERT INTO ai_visibility_prompts(user_id,project_id,id,revision,data) SELECT $1,'p',$2,g,$3 FROM generate_series(2,200) g",
      [user, id, data],
    );
    await expect(saveEvidencePrompt(scope, id, 200, data, rpc)).rejects.toThrow();
  });
  it("has RLS and no direct data access, only four service RPCs", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of ["ai_visibility_prompts", "ai_answer_evidence"])
        await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      if (role !== "service_role")
        await expect(
          db.query("SELECT read_ai_answer_evidence($1,$2)", [user, "p"]),
        ).rejects.toThrow(/permission denied/);
      else
        expect(
          (await db.query("SELECT read_ai_answer_evidence($1,$2) data", [user, "p"])).rows[0],
        ).toEqual({ data: { prompts: [], answers: [] } });
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query(
          "SELECT count(*) n FROM pg_class WHERE relname IN ('ai_visibility_prompts','ai_answer_evidence') AND relrowsecurity",
        )
      ).rows[0],
    ).toEqual({ n: 2 });
  });
});
