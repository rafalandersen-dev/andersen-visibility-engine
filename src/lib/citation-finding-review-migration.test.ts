import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  getCitationFinding,
  readCitationFindings,
  saveCitationFinding,
  saveCitationImprovement,
} from "./citation-record.server";
import {
  getCitationFindingForReview,
  readCitationFindingReviews,
  removeCitationFindingReview,
  saveCitationFindingReview,
} from "./citation-finding-review.server";
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
// Independent (two-person) review of citation findings (spec §4.5). This exercises the ACTUAL released team
// admission contract: the real `20260911020000_project_team_reads.sql` migration is applied (real
// project_team_members + assert_project_team_account + auth.users deleted/banned checks), not a hand-created
// stand-in. Only the small approval-policy lookup table is created directly (its own migration pulls in an
// unrelated scheduled_publishes trigger); the authority admission it gates is the real contract.
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001"; // project OWNER (primary reviewer)
const reviewer = "00000000-0000-4000-8000-0000000000a1"; // an independent studio reviewer
const reviewer2 = "00000000-0000-4000-8000-0000000000a4"; // a second independent reviewer
const editorActor = "00000000-0000-4000-8000-0000000000a2";
const viewerActor = "00000000-0000-4000-8000-0000000000a3";
const stranger = "00000000-0000-4000-8000-000000000002"; // no membership
const scope = { ownerId: user, projectId: "p" };
let ANSWER: string;
const PROMPT = "20000000-0000-4000-8000-000000000001";
const ACTION = "50000000-0000-4000-8000-000000000001";
const PUB = "90000000-0000-4000-8000-000000000001";
const NATIVE = "30000000-0000-4000-8000-000000000001";
const SOURCE = "80000000-0000-4000-8000-000000000001";
const SOURCE2 = "80000000-0000-4000-8000-000000000002";
const RECORD = "b1000000-0000-4000-8000-000000000001";
const FACT = "a1000000-0000-4000-8000-000000000001";
const ASSET = "content-asset-1";
const VERSION = "a".repeat(64);
const LIVE = "https://acme.example/services";
const ACC_CAP = "2024-03-01T00:00:00Z";
const now = "2026-09-19T12:00:00Z";
const later = "2026-09-19T18:00:00Z";
const panelScope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 1,
  client: { name: "Acme", market: "US" },
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
type FindingOpts = {
  family?: "citation_source" | "recommendation_accuracy";
  evidence?: Array<{ kind: "answer" | "native" | "source"; id: string }>;
  accuracy?: unknown[];
};
const finding = (
  findingId: string,
  decision: "accepted" | "dismissed" | "needs_second_review",
  opts: FindingOpts = {},
) => {
  const rec = opts.family === "recommendation_accuracy";
  return {
    findingId,
    family: opts.family ?? ("citation_source" as const),
    evidence: opts.evidence ?? [{ kind: "answer" as const, id: ANSWER }],
    entityMatch: "confirmed" as const,
    capture: { answerComplete: true, citationsComplete: true },
    observation: "The answer cites a competitor but not this business.",
    hypothesis: null,
    competitorCited: rec ? null : true,
    ownCited: rec ? null : false,
    recommendation: null,
    support: [],
    accuracy: opts.accuracy ?? [],
    priority: {
      harm: "medium" as const,
      relevance: "medium" as const,
      fixability: "medium" as const,
    },
    decision,
    review: { reviewer: user, reviewedAt: now },
    secondReview: null,
    linkedTaskId: null,
  };
};
const saveF = (
  findingId: string,
  decision: Parameters<typeof finding>[1] = "accepted",
  opts: FindingOpts = {},
) =>
  saveCitationFinding(
    scope,
    { scope: panelScope, finding: finding(findingId, decision, opts) },
    rpc,
  );
const shaFor = async (rowId: string, actor = reviewer) =>
  (
    await getCitationFindingForReview(
      actor,
      { ownerId: user, projectId: "p", findingRowId: rowId },
      rpc,
    )
  ).recordSha256;
const reviewStatusOf = async (rowId: string) =>
  (await readCitationFindings(scope, rpc)).findings.find((r) => r.id === rowId)?.reviewStatus;
const setPolicy = (mode: string) =>
  db.query(
    "INSERT INTO project_team_approval_policy(owner_id,project_id,mode,revision) VALUES($1,'p',$2,1) ON CONFLICT(owner_id,project_id) DO UPDATE SET mode=$2,revision=project_team_approval_policy.revision+1",
    [user, mode],
  );
const setMember = (actor: string, role: string, active = true) =>
  db.query(
    "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active) VALUES($1,'p',$2,$3,1,$4) ON CONFLICT(owner_id,project_id,actor_id) DO UPDATE SET role=$3,active=$4,expires_at=NULL,revision=project_team_members.revision+1",
    [user, actor, role, active],
  );
const submit = (
  actor: string,
  rowId: string,
  expectedSha: string,
  decision: "approved" | "rejected" | "needs_changes",
  note: string | null = null,
  ownerId = user,
  projectId = "p",
) =>
  saveCitationFindingReview(
    actor,
    { projectId, ownerId, findingRowId: rowId, expectedSha, decision, note },
    rpc,
  );
const isoAt = async (delta: string) =>
  (
    await db.query<{ t: string }>(
      `SELECT to_char((clock_timestamp() ${delta}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') t`,
    )
  ).rows[0].t;
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
const seedNative = () =>
  db.query(
    "INSERT INTO ai_native_report_artifacts(user_id,project_id,id,scope_key,artifact_sha256,byte_length,bytes,metadata,actor_id) VALUES($1::uuid,'p',$2::uuid,'sk',$3::text,1,'\\x00'::bytea,'{}'::jsonb,$1::uuid)",
    [user, NATIVE, "d".repeat(64)],
  );
const seedSource = (status = "active", id = SOURCE) =>
  db.query(
    "INSERT INTO project_knowledge_sources(user_id,project_id,id,revision,payload) VALUES($1::uuid,'p',$2::uuid,1,jsonb_build_object('ownerId',$1::text,'projectId','p','id',$2::text,'revision',1,'kind','website','label','Acme Services Page','fingerprint',$3::text,'status',$4::text,'observedAt','2024-02-01T00:00:00Z','url','https://acme.example/services')) ON CONFLICT(user_id,project_id,id) DO UPDATE SET payload=EXCLUDED.payload",
    [user, id, "e".repeat(64), status],
  );
// A released knowledge record carrying substantive source MATERIAL, bound to a source id + source revision.
const seedRecord = (
  recordId: string,
  sourceId: string,
  sourceRevision: number,
  value: string,
  status = "accepted",
) =>
  db.query(
    "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) VALUES($1::uuid,'p',$2::uuid,$3::uuid,1,jsonb_build_object('ownerId',$1::text,'projectId','p','id',$2::text,'revision',1,'sourceId',$3::text,'sourceRevision',$4::int,'key','k1','category','fact','appliesTo','text','value',$5::text,'locator','Services > Pricing','status',$6::text,'updatedAt','2024-02-02T00:00:00Z')) ON CONFLICT(user_id,project_id,id) DO UPDATE SET source_id=EXCLUDED.source_id,revision=EXCLUDED.revision,payload=EXCLUDED.payload",
    [user, recordId, sourceId, sourceRevision, value, status],
  );
// N distinct substantive records bound to a source (each a unique row/id), for the >10 and overflow cases.
const seedRecords = (n: number, sourceId: string, sourceRevision: number) =>
  db.query(
    "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) SELECT $1::uuid,'p',gen_random_uuid(),$2::uuid,1,jsonb_build_object('sourceId',$2::text,'sourceRevision',$3::int,'value','Bound record '||g,'status','accepted') FROM generate_series(1,$4::int) g",
    [user, sourceId, sourceRevision, n],
  );
const seedFact = async () =>
  (
    await rpc("save_ai_citation_business_fact", {
      p_user: user,
      p_project: "p",
      p_record: {
        factId: FACT,
        kind: "price",
        value: "500 SEK",
        confirmedBy: user,
        confirmedAt: "2026-01-02T00:00:00Z",
        validFrom: "2024-01-01T00:00:00Z",
        validUntil: null,
      },
    })
  ).data as { id: string; version: number };
const seedApproval = () =>
  db.query(
    "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,updated_at) VALUES($1::uuid,'p',$2::text,'milo-publication-v1',$3::text,true,clock_timestamp() - interval '3 hours') ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=$3::text,approved=true,updated_at=clock_timestamp() - interval '3 hours'",
    [user, ASSET, VERSION],
  );
const seedPublication = () =>
  db.query(
    "INSERT INTO publication_evidence(user_id,project_id,id,asset_id,version_hash,snapshot,outcome,outcome_data,finished_at) VALUES($1::uuid,'p',$2::uuid,$3::text,$4::text,jsonb_build_object('actionId',$5::text,'assetId',$3::text,'version',$4::text),'published',$6::jsonb,clock_timestamp() - interval '2 hours')",
    [
      user,
      PUB,
      ASSET,
      VERSION,
      ACTION,
      JSON.stringify({ liveUrl: LIVE, externalId: "x", publishedAt: "2026-09-19T17:00:00Z" }),
    ],
  );
const promptDefaults = {
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
const attestedImprovement = async (findingId: string, improvementId: string) => {
  const observedAt = await isoAt("- interval '1 hour'");
  return saveCitationImprovement(
    scope,
    {
      scope: panelScope,
      improvement: {
        improvementId,
        findingIds: [findingId],
        taskId: ACTION,
        change: {
          description: "Added a service page.",
          approvedVersion: VERSION,
          approvedBy: user,
          approvedAt: now,
        },
        destination: { kind: "public_url" as const, reference: LIVE },
        baselineCaptureIds: [ANSWER],
        verification: {
          method: "owner_inspection" as const,
          receipt: "owner inspected the published page",
          verifiedAt: later,
          reviewer: user,
        },
      },
      binding: {
        publicationId: PUB,
        assetId: ASSET,
        versionHash: VERSION,
        ownerInspection: { observedAt, checkResult: "shows_approved_content", observedUrl: LIVE },
      },
    },
    rpc,
  );
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;" +
      "CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);" +
      "CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);" +
      "CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2),($3),($4),($5),($6)", [
    user,
    reviewer,
    reviewer2,
    editorActor,
    viewerActor,
    stranger,
  ]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1)", [user]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
    "20260910210000_answer_evidence.sql",
    "20260919165000_native_report_artifacts.sql",
    "20260920200000_citation_findings_improvements.sql",
    // The REAL team admission contract (real project_team_members + assert_project_team_account + the
    // deleted/banned/lock admission the citation review authority reuses).
    "20260911020000_project_team_reads.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  // The approval-policy lookup the authority reads for role/mode (its own migration adds an unrelated
  // scheduled_publishes trigger); columns match the released contract.
  await db.exec(
    "CREATE TABLE public.project_team_approval_policy(owner_id uuid NOT NULL,project_id text NOT NULL,mode text NOT NULL CHECK(mode IN ('disabled','separate_reviewers','editors_can_approve')),revision bigint NOT NULL,PRIMARY KEY(owner_id,project_id));",
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;TRUNCATE workspace_entities CASCADE;TRUNCATE public.project_team_approval_policy;TRUNCATE public.project_knowledge_sources CASCADE;",
  );
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1) ON CONFLICT DO NOTHING", [user]);
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q')",
    [user],
  );
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'content',$2,jsonb_build_object('projectId','p'))",
    [user, ASSET],
  );
  await saveEvidencePrompt(scope, PROMPT, 0, promptDefaults, rpc);
  ANSWER = await importReal(ACC_CAP, "Acme Massage in Malmö is a good option to book.");
  // Default authority: an active reviewer under a separate-reviewers policy.
  await setPolicy("separate_reviewers");
  await setMember(reviewer, "reviewer");
});
afterAll(async () => {
  await db?.close();
});
describe("independent finding review: authority is the live team membership/policy + account admission", () => {
  it("lets a current reviewer record a receipt bound to the exact row+content; reviewStatus flips on the canonical reads", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000001");
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.reviewStatus).toBe("owner_only");
    expect(view.inspectionComplete).toBe(true);
    expect(view.record.findingId).toBe("60000000-0000-4000-8000-000000000001");
    const receipt = await submit(
      reviewer,
      f.id,
      view.recordSha256,
      "approved",
      "Checked the answer.",
    );
    expect(receipt).toMatchObject({
      reviewerId: reviewer,
      reviewerRole: "reviewer",
      decision: "approved",
      findingVersion: 1,
      inspectionComplete: true,
      withdrawn: false,
    });
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
    expect((await getCitationFinding(scope, f.id, rpc)).reviewStatus).toBe("independent_reviewed");
    const list = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(list.reviews).toHaveLength(1);
    expect(list).toMatchObject({
      reviewTotal: 1,
      reviewsTruncated: false,
      activeApproved: 1,
      activeDissent: 0,
    });
    expect(list.reviews[0]).toMatchObject({ mine: true, owner: false, decision: "approved" });
  });
  it("refuses the owner as an independent reviewer (no self second-review) and refuses the reviewer-only view", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000002");
    await expect(submit(user, f.id, "a".repeat(64), "approved")).rejects.toThrow();
    await expect(
      getCitationFindingForReview(user, { ownerId: user, projectId: "p", findingRowId: f.id }, rpc),
    ).rejects.toThrow();
  });
  it("refuses a non-member, a viewer, an editor under separate_reviewers, and any actor when the policy is disabled", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000003");
    const sha = await shaFor(f.id);
    await expect(submit(stranger, f.id, sha, "approved")).rejects.toThrow();
    await setMember(viewerActor, "viewer");
    await expect(submit(viewerActor, f.id, sha, "approved")).rejects.toThrow();
    await setMember(editorActor, "editor");
    await expect(submit(editorActor, f.id, sha, "approved")).rejects.toThrow();
    await setPolicy("disabled");
    await expect(submit(reviewer, f.id, sha, "approved")).rejects.toThrow();
    expect(await reviewStatusOf(f.id)).toBe("owner_only");
  });
  it("lets an editor review only under an editors_can_approve policy (reusing the actual policy contract)", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000004");
    await setPolicy("editors_can_approve");
    await setMember(editorActor, "editor");
    const receipt = await submit(editorActor, f.id, await shaFor(f.id, editorActor), "approved");
    expect(receipt.reviewerRole).toBe("editor");
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
  it("refuses a revoked or expired membership, and a foreign project", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000005");
    const sha = await shaFor(f.id);
    await setMember(reviewer, "reviewer", false); // revoked
    await expect(submit(reviewer, f.id, sha, "approved")).rejects.toThrow();
    await setMember(reviewer, "reviewer", true);
    await db.query(
      "UPDATE project_team_members SET expires_at=clock_timestamp() - interval '1 day' WHERE owner_id=$1 AND actor_id=$2",
      [user, reviewer],
    );
    await expect(submit(reviewer, f.id, sha, "approved")).rejects.toThrow();
    await setMember(reviewer, "reviewer", true);
    // The reviewer is a member of project 'p' only: acting on the owner's OTHER project 'q' is refused.
    await expect(submit(reviewer, f.id, sha, "approved", null, user, "q")).rejects.toThrow();
  });
  it("refuses a suspended (deleted/banned) actor OR owner account, on both submit and withdraw (real admission)", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000006");
    const sha = await shaFor(f.id);
    const receipt = await submit(reviewer, f.id, sha, "approved");
    // A suspended actor cannot submit, and a suspended actor cannot even withdraw their own receipt.
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",
      [reviewer],
    );
    await expect(submit(reviewer, f.id, sha, "approved")).rejects.toThrow();
    await expect(
      removeCitationFindingReview(reviewer, { ownerId: user, projectId: "p", id: receipt.id }, rpc),
    ).rejects.toThrow();
    await db.query("UPDATE auth.users SET banned_until=NULL WHERE id=$1", [reviewer]);
    // A suspended OWNER account blocks review data access even for an authenticated reviewer session.
    await db.query("UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=$1", [user]);
    await expect(submit(reviewer, f.id, sha, "approved")).rejects.toThrow();
    await expect(
      getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: f.id },
        rpc,
      ),
    ).rejects.toThrow();
  });
});
describe("receipts are content-pinned, paginated, idempotent, and preserve the recorded decision", () => {
  it("refuses a stale content hash and does not replay across a new finding version", async () => {
    const fid = "60000000-0000-4000-8000-000000000010";
    const f1 = await saveF(fid);
    const sha1 = await shaFor(f1.id);
    await submit(reviewer, f1.id, sha1, "approved");
    expect(await reviewStatusOf(f1.id)).toBe("independent_reviewed");
    const f2 = await saveF(fid, "dismissed");
    expect(f2.supersedesId).toBe(f1.id);
    expect(await reviewStatusOf(f2.id)).toBe("owner_only");
    expect(await reviewStatusOf(f1.id)).toBe("independent_reviewed");
    await expect(submit(reviewer, f2.id, sha1, "approved")).rejects.toThrow();
    await expect(submit(reviewer, f2.id, "b".repeat(64), "approved")).rejects.toThrow();
    const ok = await submit(reviewer, f2.id, await shaFor(f2.id), "approved");
    expect(ok.findingVersion).toBe(2);
  });
  it("is idempotent for the same decision+note but refuses a changed decision OR a changed note", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000011");
    const sha = await shaFor(f.id);
    const first = await submit(reviewer, f.id, sha, "approved", "same note");
    expect((await submit(reviewer, f.id, sha, "approved", "same note")).id).toBe(first.id);
    await expect(submit(reviewer, f.id, sha, "rejected", "same note")).rejects.toThrow();
    // A changed note is NOT silently reported as saved — it is an explicit conflict.
    await expect(submit(reviewer, f.id, sha, "approved", "a different note")).rejects.toThrow();
  });
  it("reports a needs_second_review finding as pending until approval, and reports dissent", async () => {
    const pending = await saveF("60000000-0000-4000-8000-000000000012", "needs_second_review");
    expect(await reviewStatusOf(pending.id)).toBe("second_review_pending");
    await submit(reviewer, pending.id, await shaFor(pending.id), "approved");
    expect(await reviewStatusOf(pending.id)).toBe("independent_reviewed");
    const flagged = await saveF("60000000-0000-4000-8000-000000000013");
    await submit(
      reviewer,
      flagged.id,
      await shaFor(flagged.id),
      "rejected",
      "Passage does not support it.",
    );
    expect(await reviewStatusOf(flagged.id)).toBe("independent_dissent");
  });
  it("bounds the receipts page to 100 with an explicit total, but the aggregate status/dissent covers ALL", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000015");
    const sha = await shaFor(f.id);
    // A dissent recorded oldest (off the newest-100 page), then 100 approvals from distinct reviewers.
    await db.query(
      "INSERT INTO ai_citation_finding_reviews(user_id,project_id,id,finding_row_id,finding_id,finding_version,record_sha256,reviewer_id,reviewer_role,policy_mode,policy_revision,membership_revision,decision,inspection_complete,created_at) VALUES($1,'p',gen_random_uuid(),$2,$3,1,$4,gen_random_uuid(),'reviewer','separate_reviewers',1,1,'rejected',true,clock_timestamp()-interval '2 days')",
      [user, f.id, f.findingId, sha],
    );
    await db.query(
      "INSERT INTO ai_citation_finding_reviews(user_id,project_id,id,finding_row_id,finding_id,finding_version,record_sha256,reviewer_id,reviewer_role,policy_mode,policy_revision,membership_revision,decision,inspection_complete,created_at) SELECT $1,'p',gen_random_uuid(),$2,$3,1,$4,gen_random_uuid(),'reviewer','separate_reviewers',1,1,'approved',true,clock_timestamp() FROM generate_series(1,100)",
      [user, f.id, f.findingId, sha],
    );
    const list = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(list.reviews).toHaveLength(100);
    expect(list.reviewTotal).toBe(101);
    expect(list.reviewsTruncated).toBe(true);
    // The off-page dissent is NOT erased: the aggregate + status still report it.
    expect(list.activeDissent).toBe(1);
    expect(list.reviewStatus).toBe("independent_dissent");
    expect(await reviewStatusOf(f.id)).toBe("independent_dissent");
  });
  it("checks existing/idempotency BEFORE capacity: an identical retry still returns at the 2000 cap", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000016");
    const g = await saveF("60000000-0000-4000-8000-000000000017");
    const sha = await shaFor(f.id);
    const receipt = await submit(reviewer, f.id, sha, "approved");
    // Fill the project to the 2000 cap with synthetic receipts on a throwaway row.
    await db.query(
      "INSERT INTO ai_citation_finding_reviews(user_id,project_id,id,finding_row_id,finding_id,finding_version,record_sha256,reviewer_id,reviewer_role,policy_mode,policy_revision,membership_revision,decision,inspection_complete) SELECT $1,'p',gen_random_uuid(),$2,$3,1,$4,gen_random_uuid(),'reviewer','separate_reviewers',1,1,'approved',true FROM generate_series(1,1999)",
      [user, g.id, g.findingId, "c".repeat(64)],
    );
    // The reviewer's identical retry returns their existing receipt (no capacity charge)...
    expect((await submit(reviewer, f.id, sha, "approved")).id).toBe(receipt.id);
    // ...but a brand-new receipt from another authorized reviewer hits the cap.
    await setMember(reviewer2, "reviewer");
    await expect(submit(reviewer2, f.id, sha, "approved")).rejects.toThrow();
  });
});
describe("independent evidence inspection gates completed verification (spec §4.5)", () => {
  it("exposes the FULL answer content (well beyond 4000 chars) + citations/provenance and the dated accuracy fact", async () => {
    const f = await seedFact();
    const longId = await importReal(ACC_CAP, "x".repeat(4200) + " TAILMARKER-AT-END");
    const fid = "60000000-0000-4000-8000-000000000030";
    await saveF(fid, "accepted", {
      family: "recommendation_accuracy",
      evidence: [{ kind: "answer", id: longId }],
      accuracy: [
        {
          claimSpan: "The price is 500 SEK.",
          factKind: "price",
          status: "accurate_at_capture",
          factId: FACT,
          factVersion: f.version,
          factRowId: f.id,
          captureEvidenceId: longId,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
    });
    const row = (await readCitationFindings(scope, rpc)).findings.find((r) => r.findingId === fid)!;
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(true);
    const answer = view.evidence.find((e) => e.kind === "answer")!;
    if (answer.kind === "answer") {
      expect(answer).toMatchObject({ available: true, inspectable: true, capturedAt: ACC_CAP });
      // The old snippet cut at 4000; the full content + its length are now inspectable and NOT truncated.
      expect(answer.content).toContain("TAILMARKER-AT-END");
      expect(answer.contentLength).toBeGreaterThan(4000);
      expect(answer.contentTruncated).toBe(false);
      expect(Array.isArray(answer.citations)).toBe(true);
    }
    expect(view.facts).toEqual([
      expect.objectContaining({
        factRowId: f.id,
        available: true,
        kind: "price",
        value: "500 SEK",
      }),
    ]);
  });
  it("exposes bound source MATERIAL and completes a valid source-only review when real material exists", async () => {
    await seedSource("active");
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK; open Mon-Sat.");
    const f = await saveF("60000000-0000-4000-8000-000000000034", "accepted", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(true);
    const src = view.evidence.find((e) => e.kind === "source")!;
    if (src.kind === "source") {
      // Attribution/provenance is present, AND the actual substantive material is inspectable.
      expect(src).toMatchObject({
        available: true,
        inspectable: true,
        status: "active",
        sourceRevision: 1,
      });
      expect(src.label).toBe("Acme Services Page");
      expect(src.materialCount).toBe(1);
      expect(src.material[0]?.value).toContain("500 SEK");
    }
    // A valid source-only review with real bound material MUST work (review is not disabled).
    await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
  it("keeps a metadata-only source (no bound material) INCOMPLETE — attribution alone never completes", async () => {
    await seedSource("active"); // active + label/url/fingerprint, but NO knowledge record material
    const f = await saveF("60000000-0000-4000-8000-000000000035", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    // Provenance is available, but with no substantive material it is NOT inspectable.
    expect(src.kind === "source" && src.available).toBe(true);
    expect(src.kind === "source" && src.inspectable).toBe(false);
    expect(src.kind === "source" && src.materialCount).toBe(0);
    await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("does not count material bound to a WRONG source or a STALE source revision", async () => {
    await seedSource("active", SOURCE); // cited source, revision 1, no material of its own
    await seedSource("active", SOURCE2);
    await seedRecord(RECORD, SOURCE2, 1, "Material for a different source."); // wrong source
    await seedRecord("b1000000-0000-4000-8000-000000000002", SOURCE, 2, "Stale-revision material."); // stale (rev 2 != 1)
    const f = await saveF("60000000-0000-4000-8000-000000000037", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    expect(view.evidence.find((e) => e.kind === "source")?.inspectable).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    expect(src.kind === "source" && src.materialCount).toBe(0);
  });
  it("treats a revoked source (bytes gone) as non-inspectable even if stale material rows linger", async () => {
    await seedSource("revoked");
    await seedRecord(RECORD, SOURCE, 1, "Lingering material for a revoked source.");
    const f = await saveF("60000000-0000-4000-8000-000000000038", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    expect(src.kind === "source" && src.inspectable).toBe(false);
    expect(src.kind === "source" && src.status).toBe("revoked");
    await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("returns ALL bound material for a source with more than 10 records (a later record is reachable, not cut)", async () => {
    await seedSource("active");
    await seedRecords(10, SOURCE, 1);
    await seedRecord(RECORD, SOURCE, 1, "The eleventh LAST-RECORD-MARKER item.");
    const f = await saveF("60000000-0000-4000-8000-000000000039", "accepted", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(true);
    const src = view.evidence.find((e) => e.kind === "source")!;
    if (src.kind === "source") {
      expect(src.materialCount).toBe(11);
      expect(src.materialTruncated).toBe(false);
      expect(src.material).toHaveLength(11); // all 11 reachable, not cut at 10
      expect(src.material.some((m) => m.value.includes("LAST-RECORD-MARKER"))).toBe(true);
      expect(src.material.every((m) => typeof m.recordId === "string")).toBe(true); // provenance identity
      expect(src.inspectable).toBe(true);
    }
    await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
  it("marks a source whose material overflows the inspectable cap (300) INCOMPLETE, not silently complete", async () => {
    await seedSource("active");
    await seedRecords(301, SOURCE, 1);
    const f = await saveF("60000000-0000-4000-8000-00000000003a", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    expect(src.kind === "source" && src.materialCount).toBe(301);
    expect(src.kind === "source" && src.materialTruncated).toBe(true);
    expect(src.kind === "source" && src.inspectable).toBe(false);
    await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("treats a MIXED native+answer finding as incomplete — the opaque native blocks completion", async () => {
    await seedNative();
    const f = await saveF("60000000-0000-4000-8000-000000000036", "needs_second_review", {
      evidence: [
        { kind: "answer", id: ANSWER },
        { kind: "native", id: NATIVE },
      ],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    expect(view.evidence.find((e) => e.kind === "answer")?.inspectable).toBe(true);
    expect(view.evidence.find((e) => e.kind === "native")?.inspectable).toBe(false);
    const receipt = await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(receipt.inspectionComplete).toBe(false);
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("marks a native-only finding non-inspectable, so an approval is only an opinion that never completes a required review", async () => {
    await seedNative();
    const fid = "60000000-0000-4000-8000-000000000031";
    const f = await saveF(fid, "needs_second_review", {
      evidence: [{ kind: "native", id: NATIVE }],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    expect(view.evidence).toEqual([
      expect.objectContaining({ kind: "native", available: true, inspectable: false }),
    ]);
    const receipt = await submit(reviewer, f.id, view.recordSha256, "approved");
    expect(receipt.inspectionComplete).toBe(false);
    // The finding REQUIRED a second review; an un-inspectable opinion does not complete it.
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("records an approve-without-inspection on an accepted finding as an explicit opinion (never a false completion)", async () => {
    await seedNative();
    const f = await saveF("60000000-0000-4000-8000-000000000032", "accepted", {
      evidence: [{ kind: "native", id: NATIVE }],
    });
    await submit(reviewer, f.id, await shaFor(f.id), "approved");
    expect(await reviewStatusOf(f.id)).toBe("independent_opinion");
  });
  it("reports a deleted cited answer as available:false and no longer inspectable", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000033");
    await db.query("DELETE FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p' AND id=$2", [
      user,
      ANSWER,
    ]);
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    expect(view.evidence).toEqual([
      expect.objectContaining({ kind: "answer", available: false, inspectable: false }),
    ]);
  });
});
// The inspection gate no longer just checks that a pinned fact ROW exists: it delegates to the ONE canonical
// accuracy resolver (the same one the finding reads, the accuracy endpoint and the improvement gate use), so
// inspection is COMPLETE only when every ASSESSED accuracy entry resolves, and un/malformed/mismatched pins,
// bad captures, out-of-period or ambiguous/superseded facts leave it incomplete. Legitimately unassessed
// entries (not_checked / unclear) need no fact binding. The resolver's own per-branch verdicts are proven in
// the business-fact suite; here we prove the inspection gate honours them (not a second partial check).
describe("the independent inspection gate reuses the canonical accuracy resolver", () => {
  const FACT2 = "a1000000-0000-4000-8000-000000000002";
  let seq = 0;
  // A fully-resolving assessed entry against the seeded price fact + the ANSWER capture; override one field
  // per case to break exactly one dimension of resolution.
  const resolvedEntry = (rowId: string, over: Record<string, unknown> = {}) => ({
    claimSpan: "The price is 500 SEK.",
    factKind: "price",
    status: "accurate_at_capture",
    factId: FACT,
    factVersion: 1,
    factRowId: rowId,
    captureEvidenceId: ANSWER,
    review: { reviewer: user, reviewedAt: now },
    ...over,
  });
  // Store a recommendation_accuracy finding whose (inspectable) answer evidence is fixed and whose single
  // accuracy entry varies, via the RPC directly so the client schema cannot pre-reject a deliberately broken
  // pin — resolution is a live READ concern, exactly what this gate must recompute.
  const gate = async (
    accuracy: unknown[],
    evidence: Array<{ kind: "answer" | "native" | "source"; id: string }> = [
      { kind: "answer", id: ANSWER },
    ],
  ) => {
    seq += 1;
    const fid = `60000000-0000-4000-8000-0000000009${String(seq).padStart(2, "0")}`;
    const rec = finding(fid, "accepted", {
      family: "recommendation_accuracy",
      evidence,
      accuracy,
    });
    const saved = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: rec,
      p_scope: panelScope,
    });
    if (saved.error) throw saved.error;
    const rowId = (saved.data as { id: string }).id;
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: rowId },
      rpc,
    );
    return { rowId, view };
  };
  it("completes when every assessed accuracy entry resolves", async () => {
    const v1 = await seedFact();
    const { view } = await gate([resolvedEntry(v1.id)]);
    expect(view.inspectionComplete).toBe(true);
  });
  it("stays complete for legitimately unassessed entries (not_checked / unclear need no fact binding)", async () => {
    // Schema-valid unassessed entries: the required nullable factId/review are PRESENT as null (they carry no
    // binding), and the optional pin cross-checks are simply omitted.
    for (const status of ["not_checked", "unclear"]) {
      const { view } = await gate([
        {
          claimSpan: "The price is 500 SEK.",
          factKind: "price",
          status,
          factId: null,
          review: null,
        },
      ]);
      expect(view.inspectionComplete).toBe(true);
    }
  });
  it("does not complete for a SCHEMA-VALID assessed accuracy entry that does not resolve", async () => {
    const v1 = await seedFact();
    // Each entry is a schema-valid assessed (accurate_at_capture) entry — the required nullable factId/review
    // stay present — that breaks exactly one resolution dimension the canonical resolver checks. These are
    // genuinely-UNRESOLVED valid records (e.g. the optional factRowId is simply omitted, or a well-formed pin
    // disagrees with the stored fact), distinct from the malformed-record case tested at the SQL gate below.
    const nonResolving: Array<[string, unknown]> = [
      [
        "no pinned fact row (the optional factRowId is omitted)",
        {
          claimSpan: "The price is 500 SEK.",
          factKind: "price",
          status: "accurate_at_capture",
          factId: FACT,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
      ["a pin to a non-existent fact row", resolvedEntry("a1000000-0000-4000-8000-0000000000ff")],
      [
        "a factId that disagrees with the row",
        resolvedEntry(v1.id, { factId: "a1000000-0000-4000-8000-0000000000ee" }),
      ],
      ["a pinned version the row is not at", resolvedEntry(v1.id, { factVersion: 2 })],
      ["a valid fact kind the row does not carry", resolvedEntry(v1.id, { factKind: "hours" })],
      [
        "a capture not among the finding's answers",
        resolvedEntry(v1.id, { captureEvidenceId: "10000000-0000-4000-8000-0000000000cc" }),
      ],
    ];
    for (const [label, entry] of nonResolving) {
      const { view } = await gate([entry]);
      expect({ label, complete: view.inspectionComplete }).toEqual({ label, complete: false });
    }
  });
  it("a malformed stored accuracy pin fails the canonical gate closed (exercised at the SQL boundary)", async () => {
    await seedFact();
    // A genuinely MALFORMED historical record: its accuracy pin is not a uuid. The strict for-review response
    // schema refuses to echo such a record (the owner detail read carries its own explicit invalid-record
    // handling), so we exercise the canonical inspection gate directly — it must fail closed to unpinned
    // (never silently complete on a bad pin), the same defensive normalization the accuracy audit reports.
    const record = {
      evidence: [{ kind: "answer", id: ANSWER }],
      accuracy: [
        {
          claimSpan: "The price is 500 SEK.",
          factKind: "price",
          status: "accurate_at_capture",
          factId: FACT,
          factRowId: "nope",
          captureEvidenceId: ANSWER,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
    };
    const gated = await db.query<{ ok: boolean }>(
      "SELECT public.citation_finding_inspectable($1,'p',$2::jsonb) ok",
      [user, JSON.stringify(record)],
    );
    expect(gated.rows[0].ok).toBe(false);
  });
  it("does not complete when the capture predates the fact's validity window (out_of_period)", async () => {
    const v1 = await seedFact();
    const early = await importReal("2023-06-01T00:00:00Z", "An older captured answer.");
    const { view } = await gate(
      [resolvedEntry(v1.id, { captureEvidenceId: early })],
      [{ kind: "answer", id: early }],
    );
    expect(view.inspectionComplete).toBe(false);
  });
  it("does not complete when a second overlapping fact of the same kind makes the pin ambiguous", async () => {
    const v1 = await seedFact();
    await rpc("save_ai_citation_business_fact", {
      p_user: user,
      p_project: "p",
      p_record: {
        factId: FACT2,
        kind: "price",
        value: "600 SEK",
        confirmedBy: user,
        confirmedAt: "2026-01-02T00:00:00Z",
        validFrom: "2024-01-01T00:00:00Z",
        validUntil: null,
      },
    });
    const { view } = await gate([resolvedEntry(v1.id)]);
    expect(view.inspectionComplete).toBe(false);
  });
  it("does not complete when a newer correction of the same fact supersedes the pinned version", async () => {
    const v1 = await seedFact();
    const correction = await rpc("save_ai_citation_business_fact", {
      p_user: user,
      p_project: "p",
      p_record: {
        factId: FACT,
        kind: "price",
        value: "700 SEK",
        confirmedBy: user,
        confirmedAt: "2026-01-03T00:00:00Z",
        validFrom: "2024-01-01T00:00:00Z",
        validUntil: null,
      },
    });
    expect((correction.data as { version: number }).version).toBe(2);
    const { view } = await gate([resolvedEntry(v1.id, { factVersion: 1 })]);
    expect(view.inspectionComplete).toBe(false);
  });
  it("an assessed-but-unresolved accuracy makes an independent approve only an OPINION that never completes a required second review", async () => {
    const v1 = await seedFact();
    const fid = "60000000-0000-4000-8000-000000000940";
    // Required second review, but the accuracy no longer binds: a valid fact kind ('hours') that disagrees
    // with the pinned price row resolves to wrong_kind, so the inspection cannot complete.
    const rec = finding(fid, "needs_second_review", {
      family: "recommendation_accuracy",
      evidence: [{ kind: "answer", id: ANSWER }],
      accuracy: [resolvedEntry(v1.id, { factKind: "hours" })],
    });
    const saved = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: rec,
      p_scope: panelScope,
    });
    if (saved.error) throw saved.error;
    const rowId = (saved.data as { id: string }).id;
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: rowId },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const receipt = await submit(reviewer, rowId, view.recordSha256, "approved");
    // The stored receipt is honestly an opinion; the required second review is NOT satisfied by it.
    expect(receipt.inspectionComplete).toBe(false);
    expect(await reviewStatusOf(rowId)).toBe("second_review_pending");
  });
});
describe("withdrawal is reviewer-only, auditable, and never silently sanitises a dissent (gap 4)", () => {
  it("lets only the receipt's own reviewer withdraw (a content-free tombstone), never the owner or a stranger", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000040");
    const r1 = await submit(reviewer, f.id, await shaFor(f.id), "approved", "a note");
    await expect(
      removeCitationFindingReview(stranger, { ownerId: user, projectId: "p", id: r1.id }, rpc),
    ).rejects.toThrow();
    // The OWNER cannot delete another reviewer's decision.
    await expect(
      removeCitationFindingReview(user, { ownerId: user, projectId: "p", id: r1.id }, rpc),
    ).rejects.toThrow();
    expect(
      await removeCitationFindingReview(
        reviewer,
        { ownerId: user, projectId: "p", id: r1.id },
        rpc,
      ),
    ).toBe(true);
    expect(await reviewStatusOf(f.id)).toBe("owner_only");
    // The withdrawn receipt stays for audit: decision retained, note erased, withdrawn flagged.
    const list = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(list.reviews[0]).toMatchObject({ withdrawn: true, decision: "approved", note: null });
    expect(list.activeApproved).toBe(0);
  });
  it("does not let the owner sanitise a dissent: A dissents + B approves stays dissent until A retracts", async () => {
    await setMember(reviewer2, "reviewer");
    const f = await saveF("60000000-0000-4000-8000-000000000041");
    const sha = await shaFor(f.id);
    const dissent = await submit(reviewer, f.id, sha, "needs_changes", "Not supported.");
    await submit(reviewer2, f.id, sha, "approved");
    expect(await reviewStatusOf(f.id)).toBe("independent_dissent");
    // The owner cannot clear A's dissent to leave B's approval as independent_reviewed.
    await expect(
      removeCitationFindingReview(user, { ownerId: user, projectId: "p", id: dissent.id }, rpc),
    ).rejects.toThrow();
    expect(await reviewStatusOf(f.id)).toBe("independent_dissent");
    // Only the dissenting reviewer may retract their own decision; then B's approval stands.
    await removeCitationFindingReview(
      reviewer,
      { ownerId: user, projectId: "p", id: dissent.id },
      rpc,
    );
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
  it("keeps a historically valid receipt counting after the reviewer's membership is revoked", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000042");
    await submit(reviewer, f.id, await shaFor(f.id), "approved");
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
    // Later membership revocation does not retroactively invalidate the historical review.
    await setMember(reviewer, "reviewer", false);
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
  it("refuses an unauthorized caller BEFORE the victim's workspace lock (authorization precedes the blocking lock)", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000043");
    const r = await submit(reviewer, f.id, await shaFor(f.id), "approved", "a note");
    const rawRemove = async (actor: string, id: string) => {
      try {
        await db.query("SELECT public.remove_ai_citation_finding_review($1,$2,'p',$3)", [
          actor,
          user,
          id,
        ]);
        return "ok";
      } catch (e) {
        return (e as Error).message;
      }
    };
    // Delete the owner's workspace_meta row: the victim-scoped blocking lock (citation_lock_account) FAILS
    // CLOSED with citation_record_unavailable if it is ever reached. So if an outsider's guessed/foreign
    // receipt id reached the lock, we would see that error; instead the ownership check refuses first with
    // citation_review_forbidden — proving authorization strictly precedes queuing any write on the victim.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    expect(await rawRemove(stranger, "60000000-0000-4000-8000-0000000000cc")).toMatch(
      /citation_review_forbidden/,
    );
    // A FOREIGN but real receipt id (the reviewer's) by an authenticated outsider is likewise refused before
    // the lock, not with the lock-unavailable error.
    expect(await rawRemove(stranger, r.id)).toMatch(/citation_review_forbidden/);
    // The owner cannot erase another reviewer's receipt via a guessed id either — refused before the lock.
    expect(await rawRemove(user, r.id)).toMatch(/citation_review_forbidden/);
    // No mutation occurred: the reviewer's receipt is untouched (not withdrawn).
    const rows = await db.query<{ withdrawn: boolean }>(
      "SELECT withdrawn FROM ai_citation_finding_reviews WHERE id=$1",
      [r.id],
    );
    expect(rows.rows[0].withdrawn).toBe(false);
    // NOTE: PGlite runs a single in-memory connection, so genuine concurrent lock-WAIT/queue behaviour cannot
    // be exercised here; this asserts the observable ORDERING (authorization before the blocking lock).
  });
  it("an already-withdrawn own receipt is idempotent AND takes no workspace lock (returns true even with the owner's workspace_meta deleted)", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000044");
    const r = await submit(reviewer, f.id, await shaFor(f.id), "approved", "a note");
    expect(
      await removeCitationFindingReview(reviewer, { ownerId: user, projectId: "p", id: r.id }, rpc),
    ).toBe(true);
    expect(await reviewStatusOf(f.id)).toBe("owner_only");
    // Tripwire: delete the owner's workspace_meta so citation_lock_account would FAIL CLOSED
    // (citation_record_unavailable, surfaced generically as a throw) if the already-withdrawn path ever took
    // the workspace lock. A second withdrawal must STILL return true — proving the idempotent no-op returns
    // before any workspace lock, not merely that it returns true when the row is present.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    expect(
      await removeCitationFindingReview(reviewer, { ownerId: user, projectId: "p", id: r.id }, rpc),
    ).toBe(true);
  });
  it("declares a bounded per-lock wait (SET lock_timeout='1500ms') and a pinned search_path in its function config", async () => {
    // A CONFIG/BOUNDARY regression: the pending-withdrawal path takes blocking FOR UPDATE locks
    // (assert_knowledge_project + citation_lock_account) whose released bodies have no timeout, so this RPC
    // must declare its own lock_timeout to bound each wait. lock_timeout is PER LOCK ACQUISITION, not a
    // whole-RPC deadline; a single in-memory PGlite connection cannot exercise a real concurrent lock WAIT, so
    // this asserts the DECLARED bound (and the pinned empty search_path) rather than an observed timeout.
    const cfg = await db.query<{ proconfig: string[] | null }>(
      "SELECT proconfig FROM pg_proc WHERE proname='remove_ai_citation_finding_review'",
    );
    const proconfig = cfg.rows[0]?.proconfig ?? [];
    expect(proconfig.some((c) => c.startsWith("lock_timeout=") && c.includes("1500ms"))).toBe(true);
    expect(proconfig.some((c) => c.startsWith("search_path="))).toBe(true);
  });
  it("lets a reviewer whose membership was later revoked still withdraw their OWN historical receipt", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000045");
    const r = await submit(reviewer, f.id, await shaFor(f.id), "approved");
    // Membership revoked AFTER the attestation; the account is still current, so the own-receipt withdrawal
    // is permitted (current membership is not required to retract a historical receipt).
    await setMember(reviewer, "reviewer", false);
    expect(
      await removeCitationFindingReview(reviewer, { ownerId: user, projectId: "p", id: r.id }, rpc),
    ).toBe(true);
    expect(await reviewStatusOf(f.id)).toBe("owner_only");
  });
  it("refuses withdrawal from a suspended (banned) account, even for the reviewer's own receipt", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000046");
    const r = await submit(reviewer, f.id, await shaFor(f.id), "approved");
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",
      [reviewer],
    );
    await expect(
      removeCitationFindingReview(reviewer, { ownerId: user, projectId: "p", id: r.id }, rpc),
    ).rejects.toThrow();
    // The receipt still stands — a suspended session cannot mutate review state (the owner read is unaffected).
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
});
describe("improvement eligibility: a required-but-missing second review caps owner_attested", () => {
  beforeEach(async () => {
    await seedApproval();
    await seedPublication();
  });
  it("holds a bound needs_second_review finding at connector_receipt until an independent approval lifts it", async () => {
    const fid = "60000000-0000-4000-8000-000000000020";
    const f = await saveF(fid, "needs_second_review");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000020");
    expect(imp.verificationStatus).toBe("connector_receipt");
    await submit(reviewer, f.id, await shaFor(f.id), "approved");
    const lifted = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000020");
    expect(lifted.verificationStatus).toBe("owner_attested");
  });
  it("drops owner_attested to connector_receipt when an independent reviewer dissents on a bound finding", async () => {
    const fid = "60000000-0000-4000-8000-000000000021";
    const f = await saveF(fid, "accepted");
    const ok = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000021");
    expect(ok.verificationStatus).toBe("owner_attested");
    await submit(reviewer, f.id, await shaFor(f.id), "needs_changes", "Needs another look.");
    const dropped = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000021");
    expect(dropped.verificationStatus).toBe("connector_receipt");
  });
});
