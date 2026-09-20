import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  getCitationImprovement,
  readCitationFindings,
  readCitationImprovements,
  removeCitationFinding,
  saveCitationFinding,
  saveCitationImprovement,
} from "./citation-record.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { ownerId: user, projectId: "p" };
const ANSWER = "10000000-0000-4000-8000-000000000001";
const ANSWER2 = "10000000-0000-4000-8000-000000000002";
const PROMPT = "20000000-0000-4000-8000-000000000001";
const SOURCE = "80000000-0000-4000-8000-000000000001";
const panelScope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 1,
  client: { name: "Acme", market: "US" },
};
const otherScope = { ...panelScope, client: { name: "Rival", market: "US" } };
const now = "2026-09-19T12:00:00Z";
const later = "2026-09-19T18:00:00Z";
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
const finding = (
  findingId: string,
  evidence: Array<{ kind: "answer" | "native" | "source"; id: string }> = [
    { kind: "answer", id: ANSWER },
  ],
  reviewer = user,
) => ({
  findingId,
  family: "citation_source" as const,
  evidence,
  entityMatch: "confirmed" as const,
  capture: { answerComplete: true, citationsComplete: true },
  observation: "The answer cites a competitor but not this business.",
  hypothesis: null,
  competitorCited: true,
  ownCited: false,
  recommendation: null,
  support: [],
  accuracy: [],
  priority: {
    harm: "medium" as const,
    relevance: "medium" as const,
    fixability: "medium" as const,
  },
  decision: "accepted" as const,
  review: { reviewer, reviewedAt: now },
  secondReview: null,
  linkedTaskId: null,
});
const improvement = (
  improvementId: string,
  findingId: string,
  opts: {
    method?: "publication_receipt" | "owner_inspection" | "index_inspection";
    reviewer?: string;
    verification?: boolean;
    baseline?: string;
  } = {},
) => ({
  improvementId,
  findingIds: [findingId],
  taskId: "50000000-0000-4000-8000-000000000001",
  change: {
    description: "Added a service page and updated the listing.",
    approvedVersion: "v1",
    approvedBy: user,
    approvedAt: now,
  },
  destination: { kind: "public_url" as const, reference: "https://example.com/services" },
  baselineCaptureIds: [opts.baseline ?? ANSWER],
  verification:
    opts.verification === false
      ? null
      : {
          method: opts.method ?? "owner_inspection",
          receipt: "https://example.com/services",
          verifiedAt: later,
          reviewer: opts.reviewer ?? user,
        },
});
const saveF = (f: unknown, s = scope, sc = panelScope) =>
  saveCitationFinding(s, { scope: sc, finding: f }, rpc);
const saveI = (i: unknown, s = scope, sc = panelScope) =>
  saveCitationImprovement(s, { scope: sc, improvement: i }, rpc);
const findingCount = async () =>
  Number(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM ai_citation_findings")).rows[0].n,
  );
const seedAnswer = async (id: string) => {
  await db.query(
    "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document) VALUES($1,'p',$2,$3,1,$4,'{}'::jsonb)",
    [user, id, PROMPT, "hash-" + id],
  );
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910210000_answer_evidence.sql",
    "20260919165000_native_report_artifacts.sql",
    "20260920200000_citation_findings_improvements.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2) ON CONFLICT DO NOTHING", [
    user,
    other,
  ]);
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q'),($2,'projects','p')",
    [user, other],
  );
  await db.query(
    "INSERT INTO ai_visibility_prompts(user_id,project_id,id,revision,data) VALUES($1,'p',$2,1,'{}'::jsonb)",
    [user, PROMPT],
  );
  await seedAnswer(ANSWER);
  await seedAnswer(ANSWER2);
  // project_knowledge_sources references auth.users, not workspace_entities, so the TRUNCATE above does
  // not clear it; reset it explicitly each test.
  await db.exec("DELETE FROM public.project_knowledge_sources");
  await db.query(
    "INSERT INTO project_knowledge_sources(user_id,project_id,id,revision,payload) VALUES($1,'p',$2,1,'{}'::jsonb)",
    [user, SOURCE],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("citation findings storage with server-derived, forgery-resistant provenance", () => {
  it("stores a finding with server-derived actor/reviewer and round-trips it idempotently", async () => {
    const f = finding("60000000-0000-4000-8000-000000000001");
    const saved = await saveF(f);
    expect(saved).toMatchObject({
      actorId: user,
      reviewerId: user,
      version: 1,
      sourceAvailable: true,
    });
    expect((await saveF(f)).id).toBe(saved.id);
    expect(await findingCount()).toBe(1);
  });
  it("refuses a forged top-level OR nested reviewer identity (only the authenticated actor may review)", async () => {
    await expect(
      saveF(finding("60000000-0000-4000-8000-000000000002", undefined, other)),
    ).rejects.toThrow();
    // A nested secondReview naming a different identity is a forged provenance claim and is refused.
    const nested = {
      ...finding("60000000-0000-4000-8000-000000000003"),
      secondReview: { reviewer: other, reviewedAt: now },
    };
    await expect(saveF(nested)).rejects.toThrow();
    expect(await findingCount()).toBe(0);
  });
  it("resolves a kind=source citation against a trusted in-scope source, unavailable once removed", async () => {
    const saved = await saveF(
      finding("60000000-0000-4000-8000-000000000004", [{ kind: "source", id: SOURCE }]),
    );
    expect(saved.sourceAvailable).toBe(true);
    await db.query(
      "DELETE FROM project_knowledge_sources WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    const listed = await readCitationFindings(scope, rpc);
    expect(listed.findings.find((r) => r.id === saved.id)?.sourceAvailable).toBe(false);
  });
  it("accepts a multilingual client name at the aligned byte bound (200 CJK units = 600 bytes)", async () => {
    const cjk = "文".repeat(200);
    const saved = await saveF(finding("60000000-0000-4000-8000-000000000005"), scope, {
      ...panelScope,
      client: { name: cjk, market: "US" },
    });
    expect(saved.client.name).toBe(cjk);
  });
  it("refuses reusing one finding id under a different declared scope (no cross-panel drift)", async () => {
    const id = "60000000-0000-4000-8000-000000000006";
    await saveF(finding(id), scope, panelScope);
    await expect(saveF(finding(id), scope, otherScope)).rejects.toThrow();
  });
});
describe("improvement verification is server-derived, never authenticated from a caller string", () => {
  it("marks an owner_inspection by the authenticated owner over resolvable evidence as owner_attested", async () => {
    const fid = "60000000-0000-4000-8000-000000000010";
    await saveF(finding(fid));
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000001", fid));
    expect(imp.verificationStatus).toBe("owner_attested");
  });
  it("never authenticates a publication_receipt / index_inspection: status stays unresolved", async () => {
    const fid = "60000000-0000-4000-8000-000000000011";
    await saveF(finding(fid));
    for (const method of ["publication_receipt", "index_inspection"] as const) {
      const imp = await saveI(
        improvement(
          "70000000-0000-4000-8000-00000000001" + (method === "publication_receipt" ? "2" : "3"),
          fid,
          { method },
        ),
      );
      expect(imp.verificationStatus).toBe("unresolved");
    }
  });
  it("refuses a verification whose reviewer is not the authenticated actor", async () => {
    const fid = "60000000-0000-4000-8000-000000000014";
    await saveF(finding(fid));
    await expect(
      saveI(improvement("70000000-0000-4000-8000-000000000004", fid, { reviewer: other })),
    ).rejects.toThrow();
  });
  it("records an unverified draft with no verification receipt", async () => {
    const fid = "60000000-0000-4000-8000-000000000015";
    await saveF(finding(fid));
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000005", fid, { verification: false }),
    );
    expect(imp.verificationStatus).toBe("unverified");
  });
  it("refuses an improvement that references a finding outside its declared scope", async () => {
    const fid = "60000000-0000-4000-8000-000000000016";
    await saveF(finding(fid), scope, panelScope);
    await expect(
      saveI(improvement("70000000-0000-4000-8000-000000000006", fid), scope, otherScope),
    ).rejects.toThrow();
  });
  it("downgrades to unverified when a baseline capture is deleted", async () => {
    const fid = "60000000-0000-4000-8000-000000000017";
    await saveF(finding(fid, [{ kind: "answer", id: ANSWER2 }]), scope, panelScope);
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000007", fid, { baseline: ANSWER }),
    );
    expect(imp.verificationStatus).toBe("owner_attested");
    await db.query("DELETE FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p' AND id=$2", [
      user,
      ANSWER,
    ]);
    const listed = await readCitationImprovements(scope, rpc);
    expect(listed.improvements.find((r) => r.id === imp.id)?.verificationStatus).toBe("unverified");
  });
});
describe("atomic invalidation pins the exact finding version and never rebinds to an older one", () => {
  it("invalidates the dependent improvement when the pinned finding version is deleted, without rebinding", async () => {
    const fid = "60000000-0000-4000-8000-000000000020";
    await saveF(finding(fid)); // v1
    const v2 = await saveF({ ...finding(fid), observation: "Corrected." }); // v2 becomes head
    // The improvement binds the CURRENT head (v2) at save.
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000010", fid));
    expect(imp.verificationStatus).toBe("owner_attested");
    // Deleting the pinned newest version invalidates the claim; it is NOT rebound to the surviving v1.
    await removeCitationFinding(scope, v2.id, rpc);
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "unverified",
    );
  });
});
describe("account lock and fail-closed status", () => {
  it("refuses a write when the account lock row is missing, and succeeds after it is restored", async () => {
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    await expect(saveF(finding("60000000-0000-4000-8000-000000000030"))).rejects.toThrow();
    expect(await findingCount()).toBe(0);
    await db.query("INSERT INTO workspace_meta(user_id) VALUES($1)", [user]);
    expect((await saveF(finding("60000000-0000-4000-8000-000000000030"))).version).toBe(1);
  });
  it("citation_improvement_status fails closed on a pre-baseline verification or an empty binding", async () => {
    // verifiedAt before approvedAt, valid shape otherwise, but no pinned findings -> unverified.
    const rec = await db.query<{ s: string }>(
      "SELECT citation_improvement_status($1,'p',$2::jsonb,ARRAY[]::uuid[]) s",
      [
        user,
        JSON.stringify({
          verification: {
            method: "owner_inspection",
            reviewer: user,
            verifiedAt: "2020-01-01T00:00:00Z",
            receipt: "r",
          },
          change: { approvedAt: "2026-01-01T00:00:00Z" },
          baselineCaptureIds: [ANSWER],
        }),
      ],
    );
    expect(rec.rows[0].s).toBe("unverified");
    // A missing reviewer also fails closed.
    const rec2 = await db.query<{ s: string }>(
      "SELECT citation_improvement_status($1,'p',$2::jsonb,ARRAY[]::uuid[]) s",
      [
        user,
        JSON.stringify({
          verification: { method: "owner_inspection", verifiedAt: later, receipt: "r" },
          change: { approvedAt: now },
          baselineCaptureIds: [ANSWER],
        }),
      ],
    );
    expect(rec2.rows[0].s).toBe("unverified");
  });
});
describe("isolation and access boundaries", () => {
  it("isolates owners and projects for read", async () => {
    await saveF(finding("60000000-0000-4000-8000-000000000040"));
    for (const foreign of [
      { ownerId: other, projectId: "p" },
      { ownerId: user, projectId: "q" },
    ])
      expect((await readCitationFindings(foreign, rpc)).findings).toEqual([]);
  });
  it("closes the tables and internal helpers to every client role; only service RPCs are callable", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM ai_citation_findings")).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query("SELECT * FROM ai_citation_improvements")).rejects.toThrow(
        /permission denied/,
      );
      for (const helper of [
        "citation_finding_sources_available($1,'p','{}'::jsonb)",
        "citation_improvement_status($1,'p','{}'::jsonb,ARRAY[]::uuid[])",
        "citation_lock_account($1)",
      ])
        await expect(db.query("SELECT " + helper, [user])).rejects.toThrow(/permission denied/);
      if (role !== "service_role")
        await expect(db.query("SELECT read_ai_citation_findings($1,'p')", [user])).rejects.toThrow(
          /permission denied/,
        );
      else
        expect(
          (await db.query("SELECT read_ai_citation_findings($1,'p') data", [user])).rows[0],
        ).toEqual({ data: { findings: [] } });
      await db.exec("RESET ROLE");
    }
  });
});
