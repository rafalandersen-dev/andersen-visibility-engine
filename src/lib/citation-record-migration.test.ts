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
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { ownerId: user, projectId: "p" };
// Answer-evidence ids come from the RELEASED importAnswerEvidence service (real saved shape), assigned in
// beforeEach. ANSWER anchors accuracy capture (capturedAt = ACC_CAP); BASELINE is a distinct baseline.
let ANSWER: string;
let BASELINE: string;
const PROMPT = "20000000-0000-4000-8000-000000000001";
const SOURCE = "80000000-0000-4000-8000-000000000001";
const ACTION = "50000000-0000-4000-8000-000000000001"; // Plan action id == improvement.taskId
const PUB = "90000000-0000-4000-8000-000000000001"; // published attempt
const PUB_STARTED = "90000000-0000-4000-8000-000000000002"; // started attempt
const ASSET = "content-asset-1";
const VERSION = "a".repeat(64);
const VERSION2 = "b".repeat(64);
const LIVE = "https://acme.example/services";
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
// The declared change.approvedVersion defaults to the bound version_hash and approvedBy to the owner, so a
// bound improvement's declared approval facts reconcile with the actual approval (a mismatch is refused).
// `verified` records an owner verification block with the before/after baseline captures it improves on.
const improvement = (
  improvementId: string,
  findingId: string,
  opts: {
    reference?: string;
    taskId?: string;
    approvedVersion?: string;
    approvedBy?: string;
    verified?: boolean;
    baselines?: string[];
  } = {},
) => ({
  improvementId,
  findingIds: [findingId],
  taskId: opts.taskId ?? ACTION,
  change: {
    description: "Added a service page and updated the listing.",
    approvedVersion: opts.approvedVersion ?? VERSION,
    approvedBy: opts.approvedBy ?? user,
    approvedAt: now,
  },
  destination: { kind: "public_url" as const, reference: opts.reference ?? LIVE },
  baselineCaptureIds: opts.baselines ?? (opts.verified ? [ANSWER] : []),
  verification: opts.verified
    ? {
        method: "owner_inspection" as const,
        receipt: "owner inspected the published page",
        verifiedAt: later,
        reviewer: user,
      }
    : null,
});
const binding = (
  opts: {
    publicationId?: string;
    assetId?: string;
    versionHash?: string;
    inspection?: { checkResult: string; observedUrl?: string; observedAt?: string } | null;
  } = {},
) => ({
  publicationId: opts.publicationId ?? PUB,
  assetId: opts.assetId ?? ASSET,
  versionHash: opts.versionHash ?? VERSION,
  ownerInspection:
    opts.inspection === undefined || opts.inspection === null
      ? null
      : {
          observedAt: opts.inspection.observedAt ?? later,
          checkResult: opts.inspection.checkResult,
          observedUrl: opts.inspection.observedUrl ?? LIVE,
        },
});
const saveF = (f: unknown, s = scope, sc = panelScope) =>
  saveCitationFinding(s, { scope: sc, finding: f }, rpc);
const saveI = (i: unknown, b: unknown = null, s = scope, sc = panelScope) =>
  saveCitationImprovement(s, { scope: sc, improvement: i, binding: b }, rpc);
const findingCount = async () =>
  Number(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM ai_citation_findings")).rows[0].n,
  );
const ACC_CAP = "2024-03-01T00:00:00Z"; // ANSWER's real capture instant (past, <= runner now); anchors accuracy
const promptData = {
  prompt: "Where can I book a massage in Malmö?",
  intent: "discovery",
  source: "manual" as const,
  market: "Sweden",
  language: "sv-SE",
  brand: "Acme Massage",
  websiteUrl: "https://acme.example.com/",
  competitorUrls: [] as string[],
  active: true,
};
// Import a REAL answer through the released service so document.input.capturedAt is the actual saved shape.
const importReal = (capturedAt: string, rawAnswer: string) =>
  importAnswerEvidence(
    scope,
    {
      promptId: PROMPT,
      promptRevision: 1,
      surface: "ChatGPT web",
      mode: "search" as const,
      method: "manual consumer session",
      modelVersion: null,
      capturedAt,
      status: "complete" as const,
      rawAnswer,
      citations: [] as string[],
      citationsComplete: true,
      failure: null,
      reportedCostUsd: null,
      sourceUrl: null,
      supersedesId: null,
    },
    rpc,
  );
// Seed a dated business fact via its real RPC; returns the saved row id + version for pinning.
const seedFact = async (factId: string, validFrom: string, validUntil: string | null) => {
  const r = await rpc("save_ai_citation_business_fact", {
    p_user: user,
    p_project: "p",
    p_record: {
      factId,
      kind: "price",
      value: "500 SEK",
      confirmedBy: user,
      confirmedAt: "2026-01-02T00:00:00Z",
      validFrom,
      validUntil,
    },
  });
  return r.data as { id: string; version: number };
};
// An ISO-8601 UTC instant relative to the DB clock, so temporal fixtures (observed/publication/approval
// times) stay coherent on any runner wall clock instead of hardcoding a calendar date. `delta` is a SQL
// interval expression, e.g. "- interval '1 hour'".
const isoAt = async (delta: string) =>
  (
    await db.query<{ t: string }>(
      `SELECT to_char((clock_timestamp() ${delta}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') t`,
    )
  ).rows[0].t;
// The approval's updated_at is pinned ~3h before now so a valid owner inspection (~1h before now) is on or
// after it; all seed params are explicitly typed (they feed polymorphic jsonb_build_object / interval math).
const seedApproval = async (approved = true, version = VERSION, asset = ASSET) =>
  db.query(
    "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,updated_at) VALUES($1::uuid,'p',$2::text,'milo-publication-v1',$3::text,$4::boolean,clock_timestamp() - interval '3 hours') ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=$3::text,approved=$4::boolean,updated_at=clock_timestamp() - interval '3 hours'",
    [user, asset, version, approved],
  );
const seedPublication = async (
  id: string,
  opts: { outcome?: string; live?: string; action?: string; asset?: string; version?: string } = {},
) =>
  db.query(
    "INSERT INTO publication_evidence(user_id,project_id,id,asset_id,version_hash,snapshot,outcome,outcome_data,finished_at) VALUES($1::uuid,'p',$2::uuid,$3::text,$4::text,jsonb_build_object('actionId',$5::text,'assetId',$3::text,'version',$4::text),$6::text,$7::jsonb,CASE WHEN $6::text='published' THEN clock_timestamp() - interval '2 hours' ELSE NULL END)",
    [
      user,
      id,
      opts.asset ?? ASSET,
      opts.version ?? VERSION,
      opts.action ?? ACTION,
      opts.outcome ?? "published",
      (opts.outcome ?? "published") === "published"
        ? JSON.stringify({
            liveUrl: opts.live ?? LIVE,
            externalId: "x",
            publishedAt: "2026-09-19T17:00:00Z",
            verification: "connector_response_only",
          })
        : null,
    ],
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
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
    "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'content',$2,jsonb_build_object('projectId','p'))",
    [user, ASSET],
  );
  await saveEvidencePrompt(scope, PROMPT, 0, promptData, rpc);
  ANSWER = await importReal(ACC_CAP, "Acme Massage in Malmö is a good option to book.");
  BASELINE = await importReal("2024-04-01T00:00:00Z", "Acme Massage in Malmö is worth comparing.");
  // TRUNCATE (not DELETE) to reset sources between tests: a full-table reset that does not fire the candidate's
  // AFTER DELETE forget-cascade trigger, so cleanup never leaves a spurious source-erasure marker.
  await db.exec("TRUNCATE public.project_knowledge_sources CASCADE");
  // A trusted, ACTIVE in-scope source (availability requires status='active', mirroring the inspectable
  // gate; a released-side revoke flips this to 'revoked' while retaining the row — see the revoke regression).
  await db.query(
    "INSERT INTO project_knowledge_sources(user_id,project_id,id,revision,payload) VALUES($1,'p',$2,1,'{\"status\":\"active\"}'::jsonb)",
    [user, SOURCE],
  );
  await seedApproval(true);
  await seedPublication(PUB, { outcome: "published" });
  await seedPublication(PUB_STARTED, { outcome: "started" });
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
  it("refuses a forged top-level OR nested reviewer identity", async () => {
    await expect(
      saveF(finding("60000000-0000-4000-8000-000000000002", undefined, other)),
    ).rejects.toThrow();
    await expect(
      saveF({
        ...finding("60000000-0000-4000-8000-000000000003"),
        secondReview: { reviewer: other, reviewedAt: now },
      }),
    ).rejects.toThrow();
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
});
describe("improvement verification binds to trusted publication/approval records", () => {
  const seedFinding = async (fid: string) => saveF(finding(fid));
  it("returns approval_bound for a current approval with a not-yet-published attempt", async () => {
    const fid = "60000000-0000-4000-8000-000000000010";
    await seedFinding(fid);
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000001", fid),
      binding({ publicationId: PUB_STARTED }),
    );
    expect(imp.verificationStatus).toBe("approval_bound");
  });
  it("returns connector_receipt for a published attempt whose liveUrl and Plan action match", async () => {
    const fid = "60000000-0000-4000-8000-000000000011";
    await seedFinding(fid);
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000002", fid), binding());
    expect(imp.verificationStatus).toBe("connector_receipt");
    // Delivery ladder and the before/after axis are separate: a delivered change with no verification block
    // is honestly connector_receipt + baseline_absent, never silently an owner/before-after proof.
    expect(imp.evidenceStatus).toBe("baseline_absent");
  });
  it("returns owner_attested only with an inspection of the exact liveUrl AND a resolving scoped baseline", async () => {
    const fid = "60000000-0000-4000-8000-000000000012";
    await seedFinding(fid);
    const observedAt = await isoAt("- interval '1 hour'");
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000003", fid, { verified: true }),
      binding({ inspection: { checkResult: "shows_approved_content", observedAt } }),
    );
    expect(imp.verificationStatus).toBe("owner_attested");
    expect(imp.evidenceStatus).toBe("baseline_recorded");
  });
  it("stays approval_bound (never connector_receipt) for a rejected/unknown connector outcome", async () => {
    const fid = "60000000-0000-4000-8000-000000000013";
    await seedFinding(fid);
    await db.query(
      "UPDATE publication_evidence SET outcome='rejected',outcome_data=NULL WHERE user_id=$1 AND id=$2",
      [user, PUB],
    );
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000004", fid), binding());
    expect(imp.verificationStatus).toBe("approval_bound");
  });
  it("records an unbound improvement (no binding) as unverified", async () => {
    const fid = "60000000-0000-4000-8000-000000000014";
    await seedFinding(fid);
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000005", fid), null);
    expect(imp.verificationStatus).toBe("unverified");
  });
  it("a released-side source REVOKE (row retained, status flipped) drops a delivered improvement to unverified while the finding row and its revoked reason survive", async () => {
    const fid = "60000000-0000-4000-8000-000000000015";
    // A finding whose cited evidence is the trusted in-scope SOURCE (active at save), delivered to
    // connector_receipt — a real "valid finding/improvement at a delivery status" before the revoke.
    const savedF = await saveF(finding(fid, [{ kind: "source", id: SOURCE }]));
    expect(savedF.sourceAvailable).toBe(true);
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000006", fid), binding());
    expect(imp.verificationStatus).toBe("connector_receipt");
    // Released-side revoke: the source row SURVIVES with its bytes cleared and status flipped to 'revoked'
    // (this is NOT a delete). Mere row existence must no longer count as current availability.
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_build_object('status','revoked') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    // Current proof collapses honestly: the delivered improvement re-reads unverified (its bound finding's
    // source is no longer active) and the finding's live sourceAvailable is false.
    const readImp = await getCitationImprovement(scope, imp.id, rpc);
    expect(readImp.verificationStatus).toBe("unverified");
    const listed = await readCitationFindings(scope, rpc);
    expect(listed.findings.find((r) => r.id === savedF.id)?.sourceAvailable).toBe(false);
    // The source row is NOT deleted and its reason stays inspectable — revoked is distinct from nonexistent,
    // so a historical review receipt (recorded when it was active) is never rewritten into a "gone" claim.
    const surviving = await db.query<{ n: number; status: string }>(
      "SELECT count(*)::int n, max(payload->>'status') status FROM project_knowledge_sources WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    expect(surviving.rows[0].n).toBe(1);
    expect(surviving.rows[0].status).toBe("revoked");
  });
});
describe("binding is structured and forgery-resistant: arbitrary/mismatched bindings are refused", () => {
  const fid = "60000000-0000-4000-8000-000000000020";
  beforeEach(async () => {
    await saveF(finding(fid));
  });
  const attempt = (b: unknown, taskId?: string) =>
    saveI(improvement("70000000-0000-4000-8000-000000000020", fid, taskId ? { taskId } : {}), b);
  it("refuses an arbitrary/unknown publication id (a receipt string cannot bind)", async () => {
    await expect(
      attempt(binding({ publicationId: "90000000-0000-4000-8000-0000000000ff" })),
    ).rejects.toThrow();
  });
  it("refuses a wrong asset or wrong version", async () => {
    await expect(attempt(binding({ assetId: "other-asset" }))).rejects.toThrow();
    await expect(attempt(binding({ versionHash: VERSION2 }))).rejects.toThrow();
  });
  it("refuses a version that is not the current approval", async () => {
    await seedApproval(false); // withdraw
    await expect(attempt(binding())).rejects.toThrow();
    await seedApproval(true, VERSION2); // approved, but a different version than the binding claims
    await expect(attempt(binding())).rejects.toThrow();
  });
  it("refuses a Plan action / task mismatch and a destination url mismatch", async () => {
    await expect(attempt(binding(), "50000000-0000-4000-8000-0000000000ee")).rejects.toThrow();
    await expect(
      saveI(
        improvement("70000000-0000-4000-8000-000000000021", fid, {
          reference: "https://acme.example/wrong",
        }),
        binding(),
      ),
    ).rejects.toThrow();
  });
  it("refuses an owner inspection of an unpublished attempt or of a different url", async () => {
    await expect(
      attempt(
        binding({
          publicationId: PUB_STARTED,
          inspection: { checkResult: "shows_approved_content" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      attempt(
        binding({
          inspection: {
            checkResult: "shows_approved_content",
            observedUrl: "https://acme.example/other",
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
describe("declared approval facts must reconcile with the actually-bound approval", () => {
  const fid = "60000000-0000-4000-8000-000000000050";
  beforeEach(async () => {
    await saveF(finding(fid));
  });
  it("accepts a declared approvedVersion == the bound version_hash and approvedBy == the owner", async () => {
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000050", fid, {
        approvedVersion: VERSION,
        approvedBy: user,
      }),
      binding({ publicationId: PUB_STARTED }),
    );
    expect(imp.verificationStatus).toBe("approval_bound");
  });
  it("refuses a forged declared approver or a declared version other than the bound approval", async () => {
    await expect(
      saveI(
        improvement("70000000-0000-4000-8000-000000000051", fid, { approvedBy: other }),
        binding({ publicationId: PUB_STARTED }),
      ),
    ).rejects.toThrow();
    await expect(
      saveI(
        improvement("70000000-0000-4000-8000-000000000052", fid, { approvedVersion: "v1" }),
        binding({ publicationId: PUB_STARTED }),
      ),
    ).rejects.toThrow();
  });
});
describe("before/after baseline axis is reported separately and gates owner_attested", () => {
  const fid = "60000000-0000-4000-8000-000000000060";
  beforeEach(async () => {
    await saveF(finding(fid));
  });
  it("does not promote to owner_attested without a baseline (inspection alone stays connector_receipt)", async () => {
    const observedAt = await isoAt("- interval '1 hour'");
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000060", fid), // no verification block => no baseline
      binding({ inspection: { checkResult: "shows_approved_content", observedAt } }),
    );
    expect(imp.verificationStatus).toBe("connector_receipt");
    expect(imp.evidenceStatus).toBe("baseline_absent");
  });
  it("invalidates the baseline (owner_attested -> connector_receipt) when a baseline capture is deleted", async () => {
    const observedAt = await isoAt("- interval '1 hour'");
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000061", fid, {
        verified: true,
        baselines: [BASELINE],
      }),
      binding({ inspection: { checkResult: "shows_approved_content", observedAt } }),
    );
    expect(imp.verificationStatus).toBe("owner_attested");
    expect(imp.evidenceStatus).toBe("baseline_recorded");
    await db.query("DELETE FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p' AND id=$2", [
      user,
      BASELINE,
    ]);
    const read = await getCitationImprovement(scope, imp.id, rpc);
    expect(read.evidenceStatus).toBe("baseline_missing");
    expect(read.verificationStatus).toBe("connector_receipt"); // finding still cites ANSWER, so delivery stands
  });
  it("refuses at save a baseline capture from another project", async () => {
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'projects','q2',jsonb_build_object('projectId','q2')) ON CONFLICT DO NOTHING",
      [user],
    );
    await db.query(
      "INSERT INTO ai_visibility_prompts(user_id,project_id,id,revision,data) VALUES($1,'q2',$2,1,'{}'::jsonb)",
      [user, PROMPT],
    );
    const foreign = "10000000-0000-4000-8000-0000000000f0";
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document) VALUES($1,'q2',$2,$3,1,'h','{}'::jsonb)",
      [user, foreign, PROMPT],
    );
    await expect(
      saveI(
        improvement("70000000-0000-4000-8000-000000000062", fid, {
          verified: true,
          baselines: [foreign],
        }),
        binding({
          inspection: {
            checkResult: "shows_approved_content",
            observedAt: await isoAt("- interval '1 hour'"),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
describe("owner inspection time is bound to a real, on/after-publication, non-future instant", () => {
  const fid = "60000000-0000-4000-8000-000000000070";
  beforeEach(async () => {
    await saveF(finding(fid));
  });
  const attemptInspection = (observedAt: string) =>
    saveI(
      improvement("70000000-0000-4000-8000-000000000070", fid, { verified: true }),
      binding({ inspection: { checkResult: "shows_approved_content", observedAt } }),
    );
  it("accepts an inspection observed after the publication and approval", async () => {
    const imp = await attemptInspection(await isoAt("- interval '1 hour'"));
    expect(imp.verificationStatus).toBe("owner_attested");
  });
  it("refuses a pre-publication observation", async () => {
    await expect(attemptInspection(await isoAt("- interval '5 hours'"))).rejects.toThrow();
  });
  it("refuses a future observation beyond the clock-skew allowance", async () => {
    await expect(attemptInspection(await isoAt("+ interval '2 hours'"))).rejects.toThrow();
  });
  it("refuses a non-finite observedAt at the RPC even if it bypasses the client schema", async () => {
    const rec = improvement("70000000-0000-4000-8000-000000000071", fid, { verified: true });
    const b = {
      publicationId: PUB,
      assetId: ASSET,
      versionHash: VERSION,
      ownerInspection: {
        observedAt: "infinity",
        checkResult: "shows_approved_content",
        observedUrl: LIVE,
      },
    };
    const r = await rpc("save_ai_citation_improvement", {
      p_user: user,
      p_project: "p",
      p_record: rec,
      p_scope: panelScope,
      p_binding: b,
    });
    expect(r.error).not.toBeNull();
  });
});
describe("detail read exposes the pinned dependency identity for audit/export", () => {
  it("round-trips the exact structured binding, owner inspection and pinned finding rows", async () => {
    const fid = "60000000-0000-4000-8000-000000000080";
    const savedFinding = await saveF(finding(fid));
    const observedAt = await isoAt("- interval '1 hour'");
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-000000000080", fid, { verified: true }),
      binding({ inspection: { checkResult: "shows_approved_content", observedAt } }),
    );
    const detail = await getCitationImprovement(scope, imp.id, rpc);
    expect(detail.boundFindingRowIds).toEqual([savedFinding.id]);
    expect(detail.publicationBinding).toEqual({
      publicationId: PUB,
      assetId: ASSET,
      versionHash: VERSION,
      ownerInspection: { observedAt, checkResult: "shows_approved_content", observedUrl: LIVE },
    });
  });
  it("returns a null binding for an unbound improvement", async () => {
    const fid = "60000000-0000-4000-8000-000000000081";
    await saveF(finding(fid));
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000081", fid), null);
    const detail = await getCitationImprovement(scope, imp.id, rpc);
    expect(detail.publicationBinding).toBeNull();
    expect(detail.boundFindingRowIds.length).toBe(1);
  });
});
describe("live invalidation and non-silent rebinding", () => {
  const fid = "60000000-0000-4000-8000-000000000030";
  it("invalidates the current status when the publication, approval, asset or pinned finding goes", async () => {
    const savedFinding = await saveF(finding(fid));
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000030", fid), binding());
    expect(imp.verificationStatus).toBe("connector_receipt");
    const status = async () =>
      (await getCitationImprovement(scope, imp.id, rpc)).verificationStatus;
    // Approval withdrawn -> current proof gone (record preserved).
    await seedApproval(false);
    expect(await status()).toBe("unverified");
    await seedApproval(true);
    expect(await status()).toBe("connector_receipt");
    // Publication deleted -> unverified.
    await db.query("DELETE FROM publication_evidence WHERE user_id=$1 AND id=$2", [user, PUB]);
    expect(await status()).toBe("unverified");
    await seedPublication(PUB, { outcome: "published" });
    expect(await status()).toBe("connector_receipt");
    // Pinned finding removed -> unverified (dependency gate).
    await removeCitationFinding(scope, savedFinding.id, rpc);
    expect(await status()).toBe("unverified");
  });
  it("does not silently rebind on resave: a different binding is a new version", async () => {
    await saveF(finding(fid));
    const v1 = await saveI(improvement("70000000-0000-4000-8000-000000000031", fid), binding());
    expect(v1.version).toBe(1);
    const v2 = await saveI(
      improvement("70000000-0000-4000-8000-000000000031", fid),
      binding({ publicationId: PUB_STARTED }),
    );
    expect(v2.version).toBe(2);
    expect(v2.verificationStatus).toBe("approval_bound");
  });
  it("resaving the identical payload after an ACCEPTED correction supersedes the head pins the new head (not a stale rebind)", async () => {
    const f1 = await saveF(finding(fid));
    const imp1 = await saveI(improvement("70000000-0000-4000-8000-000000000032", fid), binding());
    expect(imp1.version).toBe(1);
    // Supersede the referenced finding with an ACCEPTED correction (changed content, decision still accepted):
    // a new version becomes the head under the same logical id + scope, and — being accepted — it stays
    // bindable, so idempotent rebinding to the current correction is preserved (not broken by the decision gate).
    const f2 = await saveF({
      ...finding(fid),
      observation: "Corrected: the answer now cites this business but with a stale price.",
    });
    expect(f2.supersedesId).toBe(f1.id);
    expect(f2.decision).toBe("accepted");
    // The identical improvement payload + binding now resolves to the NEW accepted head row, so the resolved
    // pinned ids differ, the digest differs, and a v2 is recorded pinning the current correction — the stale v1
    // is never silently returned. v1 stays pinned to f1 (immutable), which still exists.
    const imp2 = await saveI(improvement("70000000-0000-4000-8000-000000000032", fid), binding());
    expect(imp2.version).toBe(2);
    expect((await getCitationImprovement(scope, imp2.id, rpc)).boundFindingRowIds).toEqual([f2.id]);
    expect((await getCitationImprovement(scope, imp1.id, rpc)).boundFindingRowIds).toEqual([f1.id]);
  });
  it("refuses to bind an improvement to a DISMISSED head, downgrades a historic binding whose head is later dismissed, and keeps a provisional needs_second_review head bindable", async () => {
    const dfid = "60000000-0000-4000-8000-000000000033";
    const f1 = await saveF(finding(dfid));
    // A valid accepted head → a delivered improvement (connector_receipt).
    const imp = await saveI(improvement("70000000-0000-4000-8000-000000000033", dfid), binding());
    expect(imp.verificationStatus).toBe("connector_receipt");
    // The owner DISMISSES the finding via a NEW head superseding the accepted one.
    const f2 = await saveF({ ...finding(dfid), decision: "dismissed" as const });
    expect(f2.supersedesId).toBe(f1.id);
    // Immutable pin vs current truth: the improvement still pins f1 (auditable), but its CURRENT status collapses
    // to unverified — the owner's dismissal is NOT bypassed via the old accepted pinned row.
    const read = await getCitationImprovement(scope, imp.id, rpc);
    expect(read.boundFindingRowIds).toEqual([f1.id]);
    expect(read.verificationStatus).toBe("unverified");
    // A NEW improvement cannot bind to the now-dismissed head at all (save refuses; no fallback to f1).
    await expect(
      saveI(improvement("70000000-0000-4000-8000-000000000034", dfid), binding()),
    ).rejects.toThrow();
    // needs_second_review is PROVISIONAL, not rejected: a binding to such a head is NOT refused — it delivers
    // (connector_receipt) and is only held back from owner_attested by the review-incomplete gate (proved in
    // the review-migration suite), so the deliver-then-attest flow is preserved. Only a DISMISSED head is barred.
    const nfid = "60000000-0000-4000-8000-000000000035";
    await saveF({ ...finding(nfid), decision: "needs_second_review" as const });
    const nImp = await saveI(improvement("70000000-0000-4000-8000-000000000036", nfid), binding());
    expect(nImp.verificationStatus).toBe("connector_receipt");
    // Scope isolation: an unrelated ACCEPTED finding's improvement in the same project is untouched.
    const ofid = "60000000-0000-4000-8000-000000000038";
    await saveF(finding(ofid));
    const okImp = await saveI(improvement("70000000-0000-4000-8000-000000000039", ofid), binding());
    expect(okImp.verificationStatus).toBe("connector_receipt");
  });
  it("the status helper itself downgrades a binding to a dismissed finding head to unverified (historical bad row)", async () => {
    // Simulates a binding stored BEFORE the save-time guard: a bound row whose chain head is dismissed. The
    // status helper (called directly, as in the closed-helper test) resolves the head decision and returns
    // unverified regardless of an otherwise-shaped binding — the decision gate fires before publication checks.
    const bfid = "60000000-0000-4000-8000-000000000037";
    const f = await saveF({ ...finding(bfid), decision: "dismissed" as const });
    const s = await db.query<{ s: string }>(
      "SELECT citation_improvement_status($1,'p','{}'::jsonb,ARRAY[$2::uuid],'{\"publicationId\":\"x\"}'::jsonb) s",
      [user, f.id],
    );
    expect(s.rows[0].s).toBe("unverified");
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
  it("returns unverified from the status helper with no binding or an empty pinned set", async () => {
    for (const args of ["ARRAY[]::uuid[],NULL", "ARRAY[]::uuid[],'{}'::jsonb"])
      expect(
        (
          await db.query<{ s: string }>(
            `SELECT citation_improvement_status($1,'p','{}'::jsonb,${args}) s`,
            [user],
          )
        ).rows[0].s,
      ).toBe("unverified");
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
      await expect(db.query("SELECT * FROM ai_citation_finding_reviews")).rejects.toThrow(
        /permission denied/,
      );
      for (const helper of [
        "citation_finding_sources_available($1,'p','{}'::jsonb)",
        "citation_improvement_status($1,'p','{}'::jsonb,ARRAY[]::uuid[],NULL)",
        "citation_lock_account($1)",
        "citation_review_authorized($1,$1,'p')",
        "citation_finding_review_status($1,'p',$1)",
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
describe("guard gaps: evidence axis and binding-shape are fail-closed", () => {
  const ev = async (record: unknown) =>
    (
      await db.query<{ s: string }>(
        "SELECT public.citation_improvement_evidence($1::uuid,'p',$2::jsonb) s",
        [user, JSON.stringify(record)],
      )
    ).rows[0].s;
  const V = { method: "owner_inspection" };
  it("never earns baseline_recorded from a missing/malformed/empty baselineCaptureIds", async () => {
    expect(await ev({ verification: V })).toBe("baseline_missing"); // key absent (the fixed fall-through)
    expect(await ev({ verification: V, baselineCaptureIds: "x" })).toBe("baseline_missing"); // not an array
    expect(await ev({ verification: V, baselineCaptureIds: [] })).toBe("baseline_missing"); // empty
    expect(await ev({})).toBe("baseline_absent"); // no verification block
    expect(await ev({ verification: V, baselineCaptureIds: [ANSWER] })).toBe("baseline_recorded");
  });
  it("refuses a non-null, non-object binding (array / scalar / json null) at the save RPC boundary", async () => {
    const badBinding = async (lit: string) => {
      try {
        await db.query(
          `SELECT public.save_ai_citation_improvement($1::uuid,'p',$2::jsonb,$3::jsonb,${lit})`,
          [user, JSON.stringify({}), JSON.stringify(panelScope)],
        );
        return null;
      } catch (error) {
        return error;
      }
    };
    for (const lit of ["'[]'::jsonb", "'5'::jsonb", "'\"x\"'::jsonb", "'null'::jsonb"])
      expect(await badBinding(lit)).not.toBeNull();
  });
});
describe("a bound finding's unresolved accuracy downgrades the dependent improvement", () => {
  const FACTX = "a1000000-0000-4000-8000-000000000001";
  const accFindingId = "60000000-0000-4000-8000-0000000000a1";
  it("reports unresolved accuracy through readCitationImprovements instead of retaining owner_attested", async () => {
    const f = await seedFact(FACTX, "2024-01-01T00:00:00Z", null); // validity covers ACC_CAP (2024-03-01)
    // A recommendation_accuracy finding whose assessed accuracy binds to the dated fact (resolves now).
    await saveF({
      findingId: accFindingId,
      family: "recommendation_accuracy" as const,
      evidence: [{ kind: "answer" as const, id: ANSWER }],
      entityMatch: "confirmed" as const,
      capture: { answerComplete: true, citationsComplete: true },
      observation: "The answer states a price to check against dated facts.",
      hypothesis: null,
      competitorCited: null,
      ownCited: null,
      recommendation: null,
      support: [],
      accuracy: [
        {
          claimSpan: "The price is 500 SEK.",
          factKind: "price" as const,
          status: "accurate_at_capture" as const,
          factId: FACTX,
          factVersion: f.version,
          factRowId: f.id,
          captureEvidenceId: ANSWER,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
      priority: {
        harm: "medium" as const,
        relevance: "medium" as const,
        fixability: "medium" as const,
      },
      // 'accepted' (not 'needs_second_review') so this test isolates the ACCURACY gate: a finding that asks
      // for a second review is separately capped by the independent-review gate (see the dedicated review
      // migration test), which would otherwise also hold this improvement below owner_attested.
      decision: "accepted" as const,
      review: { reviewer: user, reviewedAt: now },
      secondReview: null,
      linkedTaskId: null,
    });
    const observedAt = await isoAt("- interval '1 hour'");
    const imp = await saveI(
      improvement("70000000-0000-4000-8000-0000000000a1", accFindingId, { verified: true }),
      binding({ inspection: { checkResult: "shows_approved_content", observedAt } }),
    );
    expect(imp.verificationStatus).toBe("owner_attested");
    // Delete the bound fact -> the finding's accuracy no longer binds -> the improvement must drop the
    // before/after owner-attested claim, visible through the EXISTING list read (not just a helper).
    await rpc("remove_ai_citation_business_fact", { p_user: user, p_project: "p", p_id: f.id });
    const status = (await readCitationImprovements(scope, rpc)).improvements.find(
      (r) => r.id === imp.id,
    )?.verificationStatus;
    expect(status).toBe("connector_receipt");
  });
});
