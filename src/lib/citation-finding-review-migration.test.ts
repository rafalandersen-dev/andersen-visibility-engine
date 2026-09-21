import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  getCitationFinding,
  getCitationImprovement,
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
  // Non-null assertion: shaFor is only used on ACTIVE/visible findings, whose recordSha256 is the real hash a
  // reviewer pins to submit. (The digest is masked to null only on erased/withheld reviewer surfaces.)
  (
    await getCitationFindingForReview(
      actor,
      { ownerId: user, projectId: "p", findingRowId: rowId },
      rpc,
    )
  ).recordSha256!;
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
    // The REAL released delegated-approval prerequisites the citation review authority AND the improvement
    // binding reuse: project_team_members + assert_project_team_account + the deleted/banned/lock admission
    // (20260911020000), then the publication_approvals delegate columns / approval-policy table / the CANONICAL
    // delegate-aware read_publication_approval (20260911060000). This is the ACTUAL released predicate, not a
    // hand-cut policy stub — a delegated approval whose reviewer's authority lapsed is refused by the real code.
    "20260911020000_project_team_reads.sql",
    "20260911060000_project_team_approval_policy.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  // 20260911060000's invalidation trigger (an UNRELATED release concern) fires on a member/policy UPDATE|DELETE
  // and UPDATEs public.scheduled_publishes — a table created by an out-of-tree migration (there is NO CREATE for
  // it in this worktree). These tests never enqueue a publish, so a minimal empty stand-in lets the REAL trigger
  // run as a harmless 0-row no-op; it is NOT the predicate under test and does not weaken read_publication_approval.
  await db.exec(
    "CREATE TABLE public.scheduled_publishes(user_id uuid NOT NULL,project_id text NOT NULL,asset_id text NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());",
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
      view.recordSha256!,
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
    await submit(reviewer, f.id, view.recordSha256!, "approved");
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
    await submit(reviewer, f.id, view.recordSha256!, "approved");
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
    // The audit digest is masked (a revoked source withholds its copied passages), so the reviewer has no pin,
    // and a NEW review is BLOCKED (not an opinion): even a guessed 64-hex hash is refused as unavailable, so the
    // save cannot be a stale-vs-success oracle for the withheld content.
    expect(view.recordSha256).toBeNull();
    await expect(submit(reviewer, f.id, "a".repeat(64), "approved")).rejects.toThrow();
    // With no admissible receipt, the needs_second_review finding stays honestly second_review_pending.
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
    await submit(reviewer, f.id, view.recordSha256!, "approved");
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
    await submit(reviewer, f.id, view.recordSha256!, "approved");
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
    const receipt = await submit(reviewer, f.id, view.recordSha256!, "approved");
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
    const receipt = await submit(reviewer, f.id, view.recordSha256!, "approved");
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
    const receipt = await submit(reviewer, rowId, view.recordSha256!, "approved");
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
describe("save review pre-lock boundary: finding/hash resolved and idempotency assessed before the victim workspace lock", () => {
  const VALID_SHA = "a".repeat(64); // schema-valid 64-hex sha that will not match any real finding
  const rawSubmit = async (
    actor: string,
    finding: string,
    sha: string,
    decision = "approved",
    note: string | null = null,
  ) => {
    try {
      await db.query("SELECT public.save_ai_citation_finding_review($1,$2,'p',$3,$4,$5,$6)", [
        actor,
        user,
        finding,
        sha,
        decision,
        note,
      ]);
      return "ok";
    } catch (e) {
      return (e as Error).message;
    }
  };
  it("resolves finding/hash BEFORE the workspace lock: an authorized reviewer's bogus finding or stale hash fails with the finding's own error even when the owner's workspace_meta is gone", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000050");
    const goodSha = await shaFor(f.id);
    // Delete the owner's workspace_meta: citation_lock_account FAILS CLOSED (citation_record_unavailable) if the
    // victim workspace lock is ever reached. So a pre-lock rejection with the finding's OWN error proves the
    // finding/hash is resolved before any lock — the queue-a-write DoS vector is closed at the source.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    // A schema-valid but RANDOM finding id by an authorized reviewer -> the finding's own error, not the lock's.
    expect(await rawSubmit(reviewer, "60000000-0000-4000-8000-0000000000dd", VALID_SHA)).toMatch(
      /citation_finding_unavailable/,
    );
    // A REAL finding with a STALE (wrong) hash -> stale, again before the lock.
    expect(await rawSubmit(reviewer, f.id, VALID_SHA)).toMatch(/citation_review_stale/);
    // Sanity: only a genuine NEW-receipt mutation (real finding + correct hash) proceeds to the lock and hits the
    // deleted workspace_meta — confirming the lock is genuinely downstream, reached only for the write.
    expect(await rawSubmit(reviewer, f.id, goodSha)).toMatch(/citation_record_unavailable/);
    // None of these wrote a receipt.
    expect(
      (await db.query("SELECT 1 FROM ai_citation_finding_reviews WHERE finding_row_id=$1", [f.id]))
        .rows.length,
    ).toBe(0);
  });
  it("returns an IDENTICAL receipt idempotently WITHOUT taking the workspace lock, while a changed decision still requires the lock (missing-workspace tripwire)", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000051");
    const sha = await shaFor(f.id);
    const first = await submit(reviewer, f.id, sha, "approved", "a note");
    // Delete workspace_meta: an identical resubmit is a pure no-op and must STILL return the same receipt without
    // reaching the (now-unavailable) lock.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    const again = await saveCitationFindingReview(
      reviewer,
      {
        projectId: "p",
        ownerId: user,
        findingRowId: f.id,
        expectedSha: sha,
        decision: "approved",
        note: "a note",
      },
      rpc,
    );
    expect(again.id).toBe(first.id);
    expect(again.withdrawn).toBe(false);
    // A CHANGED decision on the same content is a MUTATION (conflict): it must reach the now-unavailable lock and
    // fail, never silently overwrite the recorded decision before the lock.
    expect(await rawSubmit(reviewer, f.id, sha, "rejected", "a note")).toMatch(
      /citation_record_unavailable/,
    );
    // The stored decision is unchanged (still approved) — no pre-lock mutation occurred.
    const row = await db.query<{ decision: string }>(
      "SELECT decision FROM ai_citation_finding_reviews WHERE id=$1",
      [first.id],
    );
    expect(row.rows[0].decision).toBe("approved");
  });
  it("declares a bounded per-lock wait (SET lock_timeout='1500ms') and a pinned search_path in its function config", async () => {
    // The mutation path takes blocking FOR UPDATE locks (assert_knowledge_project + citation_lock_account) whose
    // released bodies have no timeout, so this RPC must declare its own lock_timeout to bound each wait. A single
    // in-memory PGlite connection cannot exercise a real concurrent lock WAIT, so this asserts the DECLARED bound
    // (and the pinned empty search_path), not an observed timeout.
    const cfg = await db.query<{ proconfig: string[] | null }>(
      "SELECT proconfig FROM pg_proc WHERE proname='save_ai_citation_finding_review'",
    );
    const proconfig = cfg.rows[0]?.proconfig ?? [];
    expect(proconfig.some((c) => c.startsWith("lock_timeout=") && c.includes("1500ms"))).toBe(true);
    expect(proconfig.some((c) => c.startsWith("search_path="))).toBe(true);
  });
  it("BLOCKS a new review on a MASKED (revoked-source) finding — the correct old hash and a guessed hash both fail unavailable before the lock, an identical retry cannot unmask, and a visible save still works", async () => {
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    const fid = "60000000-0000-4000-8000-000000000052";
    const f = await saveF(fid, "accepted", { evidence: [{ kind: "source", id: SOURCE }] });
    // While the source is ACTIVE the finding is fully visible: the reviewer gets the real pin and a NEW receipt
    // is written — normal visible save works.
    const sha = await shaFor(f.id);
    const first = await submit(reviewer, f.id, sha, "approved");
    expect(first.recordSha256).toBe(sha);
    // Revoke the cited source -> the copied passages are withheld, so the finding is MASKED. Delete workspace_meta
    // so the owner lock would fail-closed (citation_record_unavailable) if the flow ever reached it.
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_set(payload,'{status}','\"revoked\"') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    // The CORRECT old hash and a GUESSED wrong hash raise the SAME unavailable error BEFORE the lock — the save
    // is not a stale-vs-success oracle for the withheld passage (a stale hash would otherwise read differently).
    expect(await rawSubmit(reviewer, f.id, sha)).toMatch(/citation_finding_unavailable/);
    expect(await rawSubmit(reviewer, f.id, "b".repeat(64))).toMatch(/citation_finding_unavailable/);
    // An IDENTICAL retry (matching the existing receipt) is refused before idempotency too — it cannot unmask.
    expect(await rawSubmit(reviewer, f.id, sha, "approved", null)).toMatch(
      /citation_finding_unavailable/,
    );
    // The pre-existing receipt is untouched and still records the real hash server-side (owner audit intact).
    expect(
      (
        await db.query<{ s: string }>(
          "SELECT record_sha256 s FROM ai_citation_finding_reviews WHERE id=$1",
          [first.id],
        )
      ).rows[0].s,
    ).toBe(sha);
  });
});
describe("a failed/empty answer capture is visible but never completes an independent inspection (spec §4.5)", () => {
  beforeEach(async () => {
    await seedApproval();
    await seedPublication();
  });
  // Import a valid answer, then overwrite/remove its rawAnswer to simulate a FAILED / historical capture that
  // the current import contract would reject but that can exist in storage (nothing is fabricated in the read).
  const failedAnswer = async (raw: unknown) => {
    const id = await importReal(ACC_CAP, "placeholder to be overwritten below");
    await db.query(
      "UPDATE ai_answer_evidence SET document=jsonb_set(document,'{input,rawAnswer}',$2::jsonb) WHERE user_id=$1 AND project_id='p' AND id=$3",
      [user, JSON.stringify(raw), id],
    );
    return id;
  };
  it.each([
    ["empty", "", "60", "60"],
    ["whitespace-only", "   \n\t", "61", "61"],
  ])(
    "treats a %s answer as available but NOT inspectable across the canonical predicate, the reviewer read, the receipt, and the improvement",
    async (label, raw, fsfx, isfx) => {
      const ans = await failedAnswer(raw);
      const fid = `60000000-0000-4000-8000-0000000000${fsfx}`;
      const f = await saveF(fid, "accepted", { evidence: [{ kind: "answer", id: ans }] });
      // Per-item reviewer read: the failed attempt stays VISIBLE (available:true, its real empty content shown)
      // but is NOT inspectable, and the whole finding cannot complete an inspection.
      const view = await getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: f.id },
        rpc,
      );
      const item = view.evidence.find((e) => e.kind === "answer" && e.id === ans)!;
      expect(item.kind === "answer" && item.available, label).toBe(true);
      expect(item.kind === "answer" && item.inspectable, label).toBe(false);
      expect(view.inspectionComplete, label).toBe(false);
      // An 'approved' receipt records inspection_complete=false (an opinion, not a completed verification); the
      // finding's current reviewStatus is independent_opinion, NEVER independent_reviewed.
      const r = await submit(reviewer, f.id, view.recordSha256!, "approved");
      expect(r.inspectionComplete).toBe(false);
      expect(await reviewStatusOf(f.id)).toBe("independent_opinion");
      // A delivered improvement bound to it can be connector_receipt (the delivery is real) but NEVER
      // owner_attested — there is no inspectable material behind the attestation.
      const imp = await attestedImprovement(fid, `70000000-0000-4000-8000-0000000000${isfx}`);
      expect(imp.verificationStatus).toBe("connector_receipt");
    },
  );
  it("also rejects a missing, null, or non-string historical rawAnswer (canonical predicate + per-item gate)", async () => {
    // Import ALL placeholders while they are VALID first — importAnswerEvidence reads and strict-parses existing
    // answer rows on each import, so a row must not be corrupted before a later import reads it. Corrupt each
    // only AFTER all imports. This isolates the fixture without weakening the production strict input schema.
    const missingId = await importReal(ACC_CAP, "placeholder that loses its rawAnswer key");
    const nullId = await importReal(ACC_CAP, "placeholder that becomes json null");
    const numId = await importReal(ACC_CAP, "placeholder that becomes a number");
    await db.query(
      "UPDATE ai_answer_evidence SET document=document #- '{input,rawAnswer}' WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, missingId],
    );
    await db.query(
      "UPDATE ai_answer_evidence SET document=jsonb_set(document,'{input,rawAnswer}','null'::jsonb) WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, nullId],
    );
    await db.query(
      "UPDATE ai_answer_evidence SET document=jsonb_set(document,'{input,rawAnswer}','123'::jsonb) WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, numId],
    );
    const cases: Array<[string, string, string]> = [
      ["missing", missingId, "62"],
      ["null", nullId, "63"],
      ["number", numId, "64"],
    ];
    for (const [name, ans, sfx] of cases) {
      const f = await saveF(`60000000-0000-4000-8000-0000000000${sfx}`, "accepted", {
        evidence: [{ kind: "answer", id: ans }],
      });
      const view = await getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: f.id },
        rpc,
      );
      const item = view.evidence.find((e) => e.kind === "answer" && e.id === ans)!;
      expect(item.kind === "answer" && item.inspectable, name).toBe(false);
      expect(view.inspectionComplete, name).toBe(false);
    }
  });
  it("leaves a normal non-empty answer fully inspectable and attestable (valid-capture regression preserved)", async () => {
    const ans = await importReal(
      ACC_CAP,
      "A substantive captured answer with real content to inspect.",
    );
    const fid = "60000000-0000-4000-8000-000000000065";
    const f = await saveF(fid, "accepted", { evidence: [{ kind: "answer", id: ans }] });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    const item = view.evidence.find((e) => e.kind === "answer" && e.id === ans)!;
    expect(item.kind === "answer" && item.inspectable).toBe(true);
    expect(view.inspectionComplete).toBe(true);
    const r = await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(r.inspectionComplete).toBe(true);
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000065");
    expect(imp.verificationStatus).toBe("owner_attested");
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
  it("caps a delivered improvement at connector_receipt when the CURRENT head becomes needs_second_review, even though its pinned reviewed head keeps its approval (no stale approval on the new head)", async () => {
    const fid = "60000000-0000-4000-8000-000000000022";
    const f1 = await saveF(fid, "accepted");
    // f1 is independently APPROVED (completed), so ON ITS OWN it reads independent_reviewed.
    await submit(reviewer, f1.id, await shaFor(f1.id), "approved");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000022");
    expect(imp.verificationStatus).toBe("owner_attested");
    // The owner turns the finding into a needs_second_review correction — a NEW head supersedes f1.
    const f2 = await saveF(fid, "needs_second_review");
    expect(f2.supersedesId).toBe(f1.id);
    // The stored improvement still pins f1 (immutable), and f1 still carries its approval — but the CURRENT head
    // f2 is a pending second review with NO receipts of its own, so the review gate (evaluated on the head, not
    // the pinned row) reads second_review_pending and the improvement drops to connector_receipt. The stale f1
    // approval never approves the new head; current-truth is honored without rewriting the pin or the receipt.
    const read = await getCitationImprovement(scope, imp.id, rpc);
    expect(read.boundFindingRowIds).toEqual([f1.id]);
    expect(read.verificationStatus).toBe("connector_receipt");
    // The historic pin/receipt are untouched: f1 read on its own is still independent_reviewed.
    expect((await getCitationFinding(scope, f1.id, rpc)).reviewStatus).toBe("independent_reviewed");
  });
  it("removing a DISSENTED successor head does not silently regain owner_attested — the dissent survives as a content-free logical tombstone (finding 4059365611)", async () => {
    const fid = "60000000-0000-4000-8000-000000000023";
    const f1 = await saveF(fid, "accepted");
    await submit(reviewer, f1.id, await shaFor(f1.id), "approved"); // f1 independently reviewed
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-000000000023");
    expect(imp.verificationStatus).toBe("owner_attested");
    // A NEW head (a correction) that an independent reviewer DISSENTS on -> the improvement caps.
    const f2 = await saveF(fid, "needs_second_review");
    expect(f2.supersedesId).toBe(f1.id);
    await submit(reviewer, f2.id, await shaFor(f2.id), "needs_changes", "Still wrong.");
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "connector_receipt",
    );
    // The owner DELETES the dissented successor; its dissent receipt cascades away and f1 (accepted, approved)
    // becomes the head again — but the improvement must NOT silently regain owner_attested.
    expect(
      (await rpc("remove_ai_citation_finding", { p_user: user, p_project: "p", p_id: f2.id }))
        .error,
    ).toBeNull();
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "connector_receipt",
    );
    // The dissent survives as a content-free LOGICAL tombstone: the surviving head reads independent_dissent,
    // and re-attesting the improvement cannot silently resurrect authority.
    expect(await reviewStatusOf(f1.id)).toBe("independent_dissent");
    expect(
      (await attestedImprovement(fid, "70000000-0000-4000-8000-000000000023")).verificationStatus,
    ).toBe("connector_receipt");
  });
  it("removing a NON-dissented (or withdrawn-dissent) successor leaves the improvement sound — no spurious tombstone (finding 4059365611)", async () => {
    const fid = "60000000-0000-4000-8000-000000000024";
    const impId = "70000000-0000-4000-8000-000000000024";
    const f1 = await saveF(fid, "accepted");
    await submit(reviewer, f1.id, await shaFor(f1.id), "approved");
    expect((await attestedImprovement(fid, impId)).verificationStatus).toBe("owner_attested");
    // A pending correction with NO dissent -> the improvement caps while it is the head...
    const f2 = await saveF(fid, "needs_second_review");
    expect((await attestedImprovement(fid, impId)).verificationStatus).toBe("connector_receipt");
    // ...but removing it (no dissent erased) lets f1 legitimately re-attest — no spurious tombstone.
    await rpc("remove_ai_citation_finding", { p_user: user, p_project: "p", p_id: f2.id });
    expect(await reviewStatusOf(f1.id)).toBe("independent_reviewed");
    expect((await attestedImprovement(fid, impId)).verificationStatus).toBe("owner_attested");
    // A successor whose dissent is legitimately WITHDRAWN before deletion likewise leaves nothing to tombstone.
    const f3 = await saveF(fid, "needs_second_review");
    const d = await submit(reviewer, f3.id, await shaFor(f3.id), "needs_changes", "temp");
    await removeCitationFindingReview(reviewer, { ownerId: user, projectId: "p", id: d.id }, rpc);
    await rpc("remove_ai_citation_finding", { p_user: user, p_project: "p", p_id: f3.id });
    expect(await reviewStatusOf(f1.id)).toBe("independent_reviewed");
    expect((await attestedImprovement(fid, impId)).verificationStatus).toBe("owner_attested");
  });
});
// Two linked evidence-lifecycle fixes, exercised through the ACTUAL released forget_project_knowledge RPC:
//  (1) forgetting a SOURCE erases the copied support[].sourcePassage a finding kept in its own record (across
//      every version), on storage and both read surfaces, without touching unrelated sources or resurrecting
//      the passage on a re-save; and (2) a record-only forget or a source-revision advance (active source
//      kept, sources_available still true) makes the bound finding non-inspectable NOW, so a previously
//      owner_attested improvement honestly downgrades — the historical receipt staying auditable.
describe("evidence lifecycle: forgetting a source erases copied material and downgrades stale attestations", () => {
  const PASSAGE = "SECRET COPIED PASSAGE: Massage from 500 SEK, open Mon-Sat.";
  const REDACTED = "[redacted: source forgotten]";
  const RECORD2 = "b1000000-0000-4000-8000-000000000002"; // a SECOND record of SOURCE, so forgetting one keeps the source alive
  const sourceFinding = (
    findingId: string,
    opts: {
      source?: string;
      sourceRef?: string;
      observation?: string;
      passage?: string;
      evidence?: Array<{ kind: "answer" | "native" | "source"; id: string }>;
    } = {},
  ) => ({
    findingId,
    family: "citation_source" as const,
    // `sourceRef` lets a test cite the source id in a different CASE than the stored (canonical-lowercase)
    // source row, to prove the forget cascade matches by semantic uuid rather than raw text; `evidence` lets a
    // test cite several sources (e.g. a revoked + an active one) in the same finding.
    evidence: opts.evidence ?? [
      { kind: "source" as const, id: opts.sourceRef ?? opts.source ?? SOURCE },
    ],
    entityMatch: "confirmed" as const,
    capture: { answerComplete: true, citationsComplete: true },
    observation: opts.observation ?? "The answer cites a competitor but not this business.",
    hypothesis: null,
    competitorCited: true,
    ownCited: false,
    recommendation: null,
    support: [
      {
        claimSpan: "It says massage from 500 SEK.",
        citedUrl: "https://acme.example/services",
        answerCapturedAt: ACC_CAP,
        status: "supports",
        sourcePassage: opts.passage ?? PASSAGE,
        sourceCapturedAt: ACC_CAP,
        reason: "The page confirms the price.",
        review: { reviewer: user, reviewedAt: now },
      },
    ],
    accuracy: [],
    priority: {
      harm: "medium" as const,
      relevance: "medium" as const,
      fixability: "medium" as const,
    },
    decision: "accepted" as const,
    review: { reviewer: user, reviewedAt: now },
    secondReview: null,
    linkedTaskId: null,
  });
  const saveRaw = async (record: unknown) => {
    const r = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: record,
      p_scope: panelScope,
    });
    if (r.error) throw r.error;
    return (r.data as { id: string }).id;
  };
  const storedPassage = async (rowId: string) =>
    (
      await db.query<{ p: string | null }>(
        "SELECT (record->'support'->0->>'sourcePassage') p FROM ai_citation_findings WHERE id=$1",
        [rowId],
      )
    ).rows[0].p;
  const forget = (kind: string, id: string, expected = 1) =>
    rpc("forget_project_knowledge", {
      p_user: user,
      p_project: "p",
      p_kind: kind,
      p_id: id,
      p_expected: expected,
    });
  beforeEach(async () => {
    // The global beforeEach truncates sources (cascading records) but NOT the durable tombstones; clear both
    // so a forget in one test cannot mark a later test's freshly-seeded source as already-forgotten.
    await db.exec(
      "TRUNCATE public.project_knowledge_sources CASCADE; TRUNCATE public.project_knowledge_tombstones;",
    );
  });
  it("forgetting a source erases copied support passages from storage and both read surfaces across all versions, leaving an unrelated source intact", async () => {
    await seedSource("active", SOURCE);
    await seedSource("active", SOURCE2);
    const v1 = await saveRaw(sourceFinding("60000000-0000-4000-8000-0000000000d1"));
    const v2 = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000d1", {
        observation: "Revised observation of the same finding.",
      }),
    );
    const unrelated = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000d2", { source: SOURCE2 }),
    );
    expect(await storedPassage(v1)).toBe(PASSAGE);
    expect((await forget("source", SOURCE)).error).toBeNull();
    // Every version of the dependent finding is redacted in storage...
    expect(await storedPassage(v1)).toBe(REDACTED);
    expect(await storedPassage(v2)).toBe(REDACTED);
    // ...and on the reviewer and owner read surfaces, with the original text gone from both.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: v2 },
      rpc,
    );
    const sup = view.record.support[0] as { sourcePassage: string | null };
    expect(sup.sourcePassage).toBe(REDACTED);
    // The erasure is surfaced explicitly on the reviewer response, so the retained recordSha256 (and any
    // receipt referencing it) reads as a pre-erasure digest, not an attestation of the current payload.
    expect(view.evidenceErased).toBe(true);
    const detail = await getCitationFinding(scope, v2, rpc);
    expect(JSON.stringify(detail)).not.toContain("SECRET COPIED PASSAGE");
    expect(detail.evidenceErased).toBe(true);
    // The unrelated source's finding keeps its passage AND is NOT marked erased — no blanket deletion.
    expect(await storedPassage(unrelated)).toBe(PASSAGE);
    const unrelatedDetail = await getCitationFinding(scope, unrelated, rpc);
    expect(unrelatedDetail.evidenceErased).toBe(false);
  });
  it("does not resurrect a forgotten passage when the original finding is re-saved (idempotent to the redacted row)", async () => {
    await seedSource("active", SOURCE);
    const rec = sourceFinding("60000000-0000-4000-8000-0000000000d3");
    const id1 = await saveRaw(rec);
    expect((await forget("source", SOURCE)).error).toBeNull();
    expect(await storedPassage(id1)).toBe(REDACTED);
    // Re-submitting the EXACT original finding maps by its retained content digest back to the redacted row;
    // the forgotten passage is never re-stored.
    const id2 = await saveRaw(rec);
    expect(id2).toBe(id1);
    expect(await storedPassage(id1)).toBe(REDACTED);
  });
  it("erases receipt NOTES quoting a forgotten source across both reviewer routes; the owner sees the marker, not the secret (finding 4059365606)", async () => {
    const NOTE_SECRET =
      "REVIEWER-NOTE-SECRET-7Q2X: the forgotten page listed the private cancellation fee.";
    await seedSource("active", SOURCE);
    const fid = "60000000-0000-4000-8000-0000000000f0";
    const row = await saveRaw(sourceFinding(fid));
    // A reviewer records an approved receipt whose NOTE quotes the source verbatim (the finding record redaction
    // does not touch receipt notes).
    await submit(reviewer, row, await shaFor(row), "approved", NOTE_SECRET);
    // A REAL source forget: the finding is erased, and the note must be erased too.
    await forget("source", SOURCE);
    // Reviewer route 1: the for-review detail (embedded reviews[]) — the secret must not appear anywhere.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.reviews[0].note).toBeNull();
    expect(JSON.stringify(view)).not.toContain("SECRET-7Q2X");
    // Reviewer route 2: the standalone receipt list.
    const revList = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(revList.reviews[0].note).toBeNull();
    expect(JSON.stringify(revList)).not.toContain("SECRET-7Q2X");
    // The OWNER sees the note ERASED to the content-free marker (honest retention: the note is gone in storage,
    // not merely hidden) — never the secret — while the decision/attribution stay for audit.
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(ownerList.reviews[0].note).toBe("[redacted: finding evidence forgotten]");
    expect(ownerList.reviews[0].decision).toBe("approved");
    expect(JSON.stringify(ownerList)).not.toContain("SECRET-7Q2X");
    // Storage is genuinely erased (the retention claim is honest).
    const stored = await db.query<{ n: string }>(
      "SELECT note n FROM ai_citation_finding_reviews WHERE user_id=$1 AND finding_row_id=$2",
      [user, row],
    );
    expect(stored.rows[0].n).toBe("[redacted: finding evidence forgotten]");
  });
  it("withholds a receipt NOTE from the reviewer for a REVOKED (not forgotten) source while the owner retains it (finding 4059365606)", async () => {
    const NOTE_SECRET = "REVIEWER-NOTE-SECRET-8R4Y: quoted from the now-revoked source.";
    await seedSource("active", SOURCE);
    const fid = "60000000-0000-4000-8000-0000000000f1";
    const row = await saveRaw(sourceFinding(fid));
    await submit(reviewer, row, await shaFor(row), "approved", NOTE_SECRET);
    // Revocation is NOT a forget: the source row survives with status flipped, no trigger fires.
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_build_object('status','revoked') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    // Reviewer routes withhold the note (response-only); the secret is absent from both.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(false);
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(view.reviews[0].note).toBeNull();
    expect(JSON.stringify(view)).not.toContain("SECRET-8R4Y");
    expect(
      (
        await readCitationFindingReviews(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: row },
          rpc,
        )
      ).reviews[0].note,
    ).toBeNull();
    // The owner RETAINS the note (revocation is not erasure) — it is not destroyed in storage.
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(ownerList.reviews[0].note).toBe(NOTE_SECRET);
  });
  it("downgrades a previously owner_attested improvement to connector_receipt after a record-only forget, leaving the historical receipt auditable", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK; open Mon-Sat.");
    const fid = "60000000-0000-4000-8000-0000000000e1";
    const row = await saveRaw(sourceFinding(fid));
    await submit(reviewer, row, await shaFor(row), "approved");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000e1");
    expect(imp.verificationStatus).toBe("owner_attested");
    // A record-only forget is ALSO an erasure: the active source row stays (sources_available true) but the
    // forgotten record's material is gone. So (a) the copied passage is redacted and the finding marked
    // erased, and (b) the finding is no longer inspectable NOW, so the stale inspection can no longer support
    // owner_attested — the improvement downgrades to connector_receipt.
    expect((await forget("record", RECORD)).error).toBeNull();
    expect(await storedPassage(row)).toBe(REDACTED);
    const erasedView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(erasedView.evidenceErased).toBe(true);
    const reread = await getCitationImprovement(scope, imp.id, rpc);
    expect(reread.verificationStatus).toBe("connector_receipt");
    // The independent receipt is untouched and still auditable — historical validity is distinct from current.
    const list = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(list.reviews[0]).toMatchObject({ decision: "approved", withdrawn: false });
  });
  it("downgrades owner_attested to connector_receipt when the bound source's revision advances past its material", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    const fid = "60000000-0000-4000-8000-0000000000e2";
    await saveRaw(sourceFinding(fid));
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000e2");
    expect(imp.verificationStatus).toBe("owner_attested");
    // Source stays active but advances to revision 2; the material is still bound to revision 1, so no
    // current-revision material matches → not inspectable → owner_attested forfeited.
    await db.query(
      "UPDATE project_knowledge_sources SET revision=2 WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    const reread = await getCitationImprovement(scope, imp.id, rpc);
    expect(reread.verificationStatus).toBe("connector_receipt");
  });
  it("fails closed: a bound source with no current material never reaches owner_attested, and a mismatched forget expectation erases nothing", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE); // active source, but NO material records
    const fid = "60000000-0000-4000-8000-0000000000e3";
    const row = await saveRaw(sourceFinding(fid));
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000e3");
    // No current material → the finding is not inspectable → the top attested tier is withheld.
    expect(imp.verificationStatus).toBe("connector_receipt");
    // A forget with a mismatched expected revision is rejected and redacts nothing.
    expect((await forget("source", SOURCE, 999)).error).not.toBeNull();
    expect(await storedPassage(row)).toBe(PASSAGE);
  });
  it("matches a source cited in a DIFFERENT case (semantic uuid, not raw text) and erases across versions", async () => {
    const UP = "8000000a-000b-4000-8000-00000000000c"; // has hex letters, so upper/lower differ
    await seedSource("active", UP);
    const v1 = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000d4", { sourceRef: UP.toUpperCase() }),
    );
    const v2 = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000d4", {
        sourceRef: UP.toUpperCase(),
        observation: "Revised observation of the same finding.",
      }),
    );
    expect(await storedPassage(v1)).toBe(PASSAGE);
    expect((await forget("source", UP)).error).toBeNull();
    // The uppercase-cited source is still recognised as the forgotten source (a raw text compare would miss).
    expect(await storedPassage(v1)).toBe(REDACTED);
    expect(await storedPassage(v2)).toBe(REDACTED);
  });
  it("blocks a NEW review on a finding whose evidence was forgotten, while the pre-existing receipt stays auditable", async () => {
    await seedSource("active", SOURCE);
    const fid = "60000000-0000-4000-8000-0000000000d5";
    const row = await saveRaw(sourceFinding(fid));
    await submit(reviewer, row, await shaFor(row), "approved", "Looks right.");
    expect((await forget("source", SOURCE)).error).toBeNull();
    // A fresh review can no longer attest the finding: its retained (pre-erasure) sha must not be re-approved
    // onto the redacted payload. The evidence is unavailable, so the submit is refused.
    await setMember(reviewer2, "reviewer");
    await expect(submit(reviewer2, row, "a".repeat(64), "approved")).rejects.toThrow();
    // The historical receipt is retained and auditable (its original hash stays as the audit anchor; the
    // finding's evidenceErased state marks it historic, not an attestation of the current payload).
    const list = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(list.reviews[0]).toMatchObject({ decision: "approved", withdrawn: false });
  });
  it("does not resurrect the passage on an ALTERED re-save after the source is forgotten (save-time guard)", async () => {
    await seedSource("active", SOURCE);
    const fid = "60000000-0000-4000-8000-0000000000d6";
    await saveRaw(sourceFinding(fid));
    expect((await forget("source", SOURCE)).error).toBeNull();
    // An ALTERED re-save (new content → a different digest that would otherwise INSERT a fresh row with the
    // passage) still cites the tombstoned source, so the save-time guard strips the passage and marks the new
    // version erased — identical-hash idempotency alone would not have caught this.
    const altered = await saveRaw(
      sourceFinding(fid, {
        observation: "A materially altered observation to force a new version.",
      }),
    );
    expect(await storedPassage(altered)).toBe(REDACTED);
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: altered },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
  });
  it("treats a source REVOCATION (row kept) as NOT an erasure: the copied passage is retained", async () => {
    await seedSource("active", SOURCE);
    const row = await saveRaw(sourceFinding("60000000-0000-4000-8000-0000000000d7"));
    // Revoke (deactivate) the source WITHOUT deleting the row — no forget, no delete trigger, no erasure.
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_set(payload,'{status}','\"revoked\"') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    expect(await storedPassage(row)).toBe(PASSAGE);
    const detail = await getCitationFinding(scope, row, rpc);
    expect(detail.evidenceErased).toBe(false);
  });
  it("is tenant-scoped: forgetting one owner's source never touches another owner's finding citing the same source id", async () => {
    await seedSource("active", SOURCE);
    const mine = await saveRaw(sourceFinding("60000000-0000-4000-8000-0000000000d8"));
    // A DIFFERENT owner has their own project and a finding citing the SAME source id (a distinct row keyed by
    // its own user_id). Insert it directly — the other owner has no citation RPC access in this fixture.
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p') ON CONFLICT DO NOTHING",
      [stranger],
    );
    const theirRow = "60000000-0000-4000-8000-0000000000d9";
    await db.query(
      "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1,'p',$2,$2,1,'citation_source','accepted',$3::jsonb,$4,$5,1,'Acme','US',$1,$1)",
      [
        stranger,
        theirRow,
        JSON.stringify(sourceFinding(theirRow)),
        "c".repeat(64),
        panelScope.panelId,
      ],
    );
    expect((await forget("source", SOURCE)).error).toBeNull();
    // My finding is erased; the other owner's finding (same source id, different user_id) is untouched.
    expect(await storedPassage(mine)).toBe(REDACTED);
    expect(await storedPassage(theirRow)).toBe(PASSAGE);
  });
  it("a RECORD forget blocks passage resurrection on an altered re-save AND a fresh finding, while the surviving source stays usable", async () => {
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    await seedRecord(RECORD2, SOURCE, 1, "Open Mon-Sat.");
    const fid = "60000000-0000-4000-8000-0000000000da";
    await saveRaw(sourceFinding(fid));
    // Forget ONE record — the source and the OTHER record survive (an ordinary record update never DELETEs, so
    // a record delete is always a forget). The lost record tombstone has no source mapping; the source-level
    // erasure marker supplies it.
    expect((await forget("record", RECORD)).error).toBeNull();
    const src = await db.query(
      "SELECT 1 FROM project_knowledge_sources WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    expect(src.rows.length).toBe(1); // source still usable
    // An ALTERED re-save (new digest) no longer re-stores the passage...
    const altered = await saveRaw(
      sourceFinding(fid, {
        observation: "A materially altered observation to force a new version.",
      }),
    );
    expect(await storedPassage(altered)).toBe(REDACTED);
    // ...and a FRESH finding (new logical id) citing the same surviving source is redacted at save too.
    const fresh = await saveRaw(sourceFinding("60000000-0000-4000-8000-0000000000db"));
    expect(await storedPassage(fresh)).toBe(REDACTED);
  });
  it("honors erasure across review AND improvement status when one of two source records is forgotten (the other stays readable)", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    await seedRecord(RECORD2, SOURCE, 1, "Open Mon-Sat.");
    const fid = "60000000-0000-4000-8000-0000000000dc";
    const row = await saveRaw(sourceFinding(fid));
    await submit(reviewer, row, await shaFor(row), "approved");
    expect(await reviewStatusOf(row)).toBe("independent_reviewed");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000dc");
    expect(imp.verificationStatus).toBe("owner_attested");
    // Forget ONE record; the OTHER survives, so citation_finding_inspectable is still structurally satisfiable
    // — but the finding's evidence is erased, so every CURRENT status path honors that.
    expect((await forget("record", RECORD)).error).toBeNull();
    const rec2 = await db.query(
      "SELECT 1 FROM project_knowledge_records WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, RECORD2],
    );
    expect(rec2.rows.length).toBe(1); // the other record is still readable
    // review status collapses (no pretend independent_reviewed of the erased payload)...
    expect(await reviewStatusOf(row)).toBe("owner_only");
    // ...the improvement downgrades owner_attested -> connector_receipt...
    const reread = await getCitationImprovement(scope, imp.id, rpc);
    expect(reread.verificationStatus).toBe("connector_receipt");
    // ...owner detail and reviewer read agree (evidenceErased + reviewStatus), and the receipt is RETAINED.
    const detail = await getCitationFinding(scope, row, rpc);
    expect(detail.evidenceErased).toBe(true);
    expect(detail.reviewStatus).toBe("owner_only");
    const forReview = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(forReview.evidenceErased).toBe(true);
    expect(forReview.reviewStatus).toBe("owner_only");
    expect(forReview.reviews[0]).toMatchObject({ decision: "approved", withdrawn: false });
  });
  it("does not silently resurrect the review or attestation when new material appears after erasure", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    const fid = "60000000-0000-4000-8000-0000000000dd";
    const row = await saveRaw(sourceFinding(fid));
    await submit(reviewer, row, await shaFor(row), "approved");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000dd");
    expect(imp.verificationStatus).toBe("owner_attested");
    expect((await forget("record", RECORD)).error).toBeNull();
    expect(await reviewStatusOf(row)).toBe("owner_only");
    // New material appears LATER on the surviving source (inspectable becomes satisfiable again) — but the
    // finding stays erased: NO auto-promotion of the old review/attestation, and NO new review is admitted.
    await seedRecord(RECORD2, SOURCE, 1, "Open Mon-Sat (added later).");
    expect(await reviewStatusOf(row)).toBe("owner_only");
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "connector_receipt",
    );
    await expect(submit(reviewer, row, "a".repeat(64), "approved")).rejects.toThrow();
  });
  it("deletes a whole project (sources, records, findings, a preexisting erasure marker) atomically without orphaning provenance, leaving another project intact", async () => {
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    await seedRecord(RECORD2, SOURCE, 1, "Open Mon-Sat.");
    await saveRaw(sourceFinding("60000000-0000-4000-8000-0000000000de"));
    // Preexisting erasure marker: forget one record (source survives) → marker + finding erased.
    expect((await forget("record", RECORD)).error).toBeNull();
    expect(
      (
        await db.query(
          "SELECT 1 FROM ai_citation_source_erasures WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows.length,
    ).toBe(1);
    // Another project of the SAME owner, with its own source + finding, must survive the delete.
    await db.query(
      "INSERT INTO project_knowledge_sources(user_id,project_id,id,revision,payload) VALUES($1,'q',$2,1,'{\"status\":\"active\"}'::jsonb)",
      [user, SOURCE],
    );
    const qRow = "60000000-0000-4000-8000-0000000000df";
    await db.query(
      "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1,'q',$2,$2,1,'citation_source','accepted',$3::jsonb,$4,$5,1,'Acme','US',$1,$1)",
      [user, qRow, JSON.stringify(sourceFinding(qRow)), "e".repeat(64), panelScope.panelId],
    );
    // Delete the WHOLE project 'p' via a real DELETE (driving the released purge trigger + FK cascades). This
    // used to fail 23503 because the forget trigger re-inserted provenance after the project row was gone.
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    for (const t of [
      "project_knowledge_sources",
      "project_knowledge_records",
      "ai_citation_findings",
      "ai_citation_source_erasures",
    ]) {
      const r = await db.query(`SELECT 1 FROM ${t} WHERE user_id=$1 AND project_id='p'`, [user]);
      expect(r.rows.length, t).toBe(0);
    }
    // The other project is untouched (isolation).
    expect(
      (
        await db.query(
          "SELECT 1 FROM ai_citation_findings WHERE user_id=$1 AND project_id='q' AND id=$2",
          [user, qRow],
        )
      ).rows.length,
    ).toBe(1);
    expect(
      (
        await db.query(
          "SELECT 1 FROM project_knowledge_sources WHERE user_id=$1 AND project_id='q'",
          [user],
        )
      ).rows.length,
    ).toBe(1);
  });
  it("withholds a REVOKED source's live material from the reviewer response while a co-cited active source stays inspectable", async () => {
    const REVSRC = "8000000a-000b-4000-8000-00000000000e";
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Active-source material.");
    await seedSource("active", REVSRC);
    // The revoked source's record carries a distinctive live value + excerpt (records survive revocation).
    await db.query(
      "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) VALUES($1::uuid,'p',$2::uuid,$3::uuid,1,jsonb_build_object('sourceId',$3::text,'sourceRevision',1,'value',$4::text,'excerpt',$5::text,'status','accepted'))",
      [user, RECORD2, REVSRC, "DISTINCTIVE-REVOKED-VALUE", "DISTINCTIVE-REVOKED-EXCERPT"],
    );
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_set(payload,'{status}','\"revoked\"') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, REVSRC],
    );
    const row = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000e4", {
        evidence: [
          { kind: "source", id: SOURCE },
          { kind: "source", id: REVSRC },
        ],
      }),
    );
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    const rev = view.evidence.find((e) => e.kind === "source" && e.id === REVSRC)!;
    expect(rev.kind === "source" && rev.status).toBe("revoked");
    expect(rev.kind === "source" && rev.inspectable).toBe(false);
    expect(rev.kind === "source" && rev.materialCount).toBe(0);
    expect(rev.kind === "source" && rev.material).toEqual([]);
    // The co-cited ACTIVE source stays inspectable with its material served.
    const act = view.evidence.find((e) => e.kind === "source" && e.id === SOURCE)!;
    expect(act.kind === "source" && act.inspectable).toBe(true);
    expect(act.kind === "source" && act.materialCount).toBe(1);
    // The revoked source's distinctive LIVE value/excerpt never appear ANYWHERE in the reviewer response — the
    // material gate is not cosmetic, and the copied-field path (support[].sourcePassage) carries only the
    // owner-authored passage, not the live records.
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("DISTINCTIVE-REVOKED-VALUE");
    expect(whole).not.toContain("DISTINCTIVE-REVOKED-EXCERPT");
    // Revocation is NOT erasure — but because a cited source is revoked, this reviewer response conservatively
    // WITHHOLDS the owner's copied support passage too (the copied-field boundary; asserted in full by the next
    // test). The finding is not evidence-erased, the withholding is flagged, and the owner's stored copy stays.
    const sup = view.record.support[0] as { sourcePassage: string | null };
    expect(sup.sourcePassage).not.toBe(PASSAGE);
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(view.evidenceErased).toBe(false);
    expect(await storedPassage(row)).toBe(PASSAGE);
  });
  // The copied-field boundary: support[].sourcePassage is the OWNER's copy of source text, embedded in the
  // finding record. When a cited source is revoked, the reviewer's live-material gate above is not enough — the
  // reviewer response still returned that copied passage verbatim. This asserts the RESPONSE now withholds it
  // (there is no per-passage source pin, so withholding is conservative over ALL support passages once any cited
  // source is revoked), while the owner's stored record AND the owner's own detail read are untouched (revocation
  // is not a forget), and a co-cited active source's live material is still served. An all-active finding is
  // never withheld (the pre-revoke read below proves that).
  it("withholds the owner's COPIED support passage from the reviewer response when a cited source is revoked, but the owner DB/read retain it", async () => {
    const SECRET = "COPIED-SUPPORT-SECRET: revoke-me-but-owner-keeps-me";
    const ACTSRC = "8000000a-000b-4000-8000-00000000000f";
    await seedSource("active", SOURCE);
    await seedSource("active", ACTSRC);
    await seedRecord(RECORD, ACTSRC, 1, "Co-cited active material.");
    const row = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000e5", {
        passage: SECRET,
        evidence: [
          { kind: "source", id: SOURCE },
          { kind: "source", id: ACTSRC },
        ],
      }),
    );
    // While all cited sources are ACTIVE the reviewer sees the copied passage and nothing is withheld.
    const before = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect((before.record.support[0] as { sourcePassage: string | null }).sourcePassage).toBe(
      SECRET,
    );
    expect(before.sourcePassagesWithheld).toBe(false);
    // Revoke ONE cited source (a status flip, NOT a forget).
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_set(payload,'{status}','\"revoked\"') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    // The reviewer response withholds the copied passage + flags it; the secret appears NOWHERE in the response.
    expect((view.record.support[0] as { sourcePassage: string | null }).sourcePassage).not.toBe(
      SECRET,
    );
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(JSON.stringify(view)).not.toContain(SECRET);
    // It is NOT erasure, and the co-cited ACTIVE source's live material is still served (the gate is per-source).
    expect(view.evidenceErased).toBe(false);
    const act = view.evidence.find((e) => e.kind === "source" && e.id === ACTSRC)!;
    expect(act.kind === "source" && act.inspectable).toBe(true);
    expect(act.kind === "source" && act.materialCount).toBe(1);
    // The owner's stored record AND the owner's own detail read still hold the real copied passage.
    expect(await storedPassage(row)).toBe(SECRET);
    const detail = await getCitationFinding(scope, row, rpc);
    expect(JSON.stringify(detail)).toContain(SECRET);
  });
  it("MASKS the pre-erasure recordSha256 from the reviewer (detail + standalone + embedded receipts) after a forget, retaining it server-side and for the owner", async () => {
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    const fid = "60000000-0000-4000-8000-0000000000e6";
    const row = await saveRaw(sourceFinding(fid));
    // While active, the reviewer sees the REAL binding hash (needed to submit) and records an approved receipt.
    const active = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(active.recordSha256).toMatch(/^[a-f0-9]{64}$/);
    const realSha = active.recordSha256!;
    await submit(reviewer, row, realSha, "approved");
    // Forget the source -> the finding is erased; record_sha256 stays the PRE-erasure digest (an oracle for the
    // now-redacted price/hours passage) — so the reviewer surfaces must mask it.
    expect((await forget("source", SOURCE)).error).toBeNull();
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.recordSha256).toBeNull();
    expect(view.reviews[0].recordSha256).toBeNull();
    // The real digest appears NOWHERE in the reviewer response (no offline brute-force oracle).
    expect(JSON.stringify(view)).not.toContain(realSha);
    // The reviewer's standalone receipt list is masked too.
    const revList = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(revList.reviews[0].recordSha256).toBeNull();
    // OWNER audit vs reviewer access: the owner's receipt list retains the real digest.
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(ownerList.reviews[0].recordSha256).toBe(realSha);
    // Server audit rows RETAIN the real digest (never destroyed) on both the finding and the receipt.
    expect(
      (
        await db.query<{ s: string }>(
          "SELECT record_sha256 s FROM ai_citation_findings WHERE id=$1",
          [row],
        )
      ).rows[0].s,
    ).toBe(realSha);
    expect(
      (
        await db.query<{ s: string }>(
          "SELECT record_sha256 s FROM ai_citation_finding_reviews WHERE finding_row_id=$1",
          [row],
        )
      ).rows[0].s,
    ).toBe(realSha);
  });
  it("MASKS recordSha256 from the reviewer when a cited source is REVOKED (not erased), closing the copied-text digest oracle, while owner + server retain it", async () => {
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    const fid = "60000000-0000-4000-8000-0000000000e7";
    const row = await saveRaw(sourceFinding(fid));
    const active = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    const realSha = active.recordSha256!;
    await submit(reviewer, row, realSha, "approved");
    // Revoke the cited source (status flip, NOT a forget): its copied passages are withheld at the reviewer
    // response, so the digest of the (unchanged, still-real) record would be an oracle for the withheld passage.
    await db.query(
      "UPDATE project_knowledge_sources SET payload=jsonb_set(payload,'{status}','\"revoked\"') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(view.evidenceErased).toBe(false);
    expect(view.recordSha256).toBeNull();
    expect(view.reviews[0].recordSha256).toBeNull();
    expect(JSON.stringify(view)).not.toContain(realSha);
    const revList = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(revList.reviews[0].recordSha256).toBeNull();
    // Owner + server retain the real digest (revocation is not erasure; the audit trail is intact).
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(ownerList.reviews[0].recordSha256).toBe(realSha);
    expect(
      (
        await db.query<{ s: string }>(
          "SELECT record_sha256 s FROM ai_citation_findings WHERE id=$1",
          [row],
        )
      ).rows[0].s,
    ).toBe(realSha);
  });
  it("treats a source with a MISSING/null status key as NOT active — withholding the copied passage AND masking the digest (fail-closed, unified with the digest helper)", async () => {
    // A source row that exists but whose payload has NO 'status' key (a malformed/legacy row): a NULL status
    // must fail CLOSED to withheld+masked, not slip through a `<> 'active'` NULL comparison as visible. This is
    // the divergence the for-review read's `IS DISTINCT FROM 'active'` now closes, matching the helper.
    await db.query(
      "INSERT INTO project_knowledge_sources(user_id,project_id,id,revision,payload) VALUES($1,'p',$2,1,'{}'::jsonb)",
      [user, SOURCE],
    );
    const row = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000e8", {
        passage: "SECRET-STATUSLESS-PASSAGE-do-not-leak",
      }),
    );
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.sourcePassagesWithheld).toBe(true);
    expect((view.record.support[0] as { sourcePassage: string | null }).sourcePassage).not.toBe(
      "SECRET-STATUSLESS-PASSAGE-do-not-leak",
    );
    expect(JSON.stringify(view)).not.toContain("SECRET-STATUSLESS-PASSAGE-do-not-leak");
    // The digest is masked too (unified with citation_finding_review_digest_masked), closing the oracle.
    expect(view.recordSha256).toBeNull();
    // Not an erasure: the owner's stored copy is retained.
    expect(view.evidenceErased).toBe(false);
    expect(await storedPassage(row)).toBe("SECRET-STATUSLESS-PASSAGE-do-not-leak");
  });
});
describe("answer-delete erasure propagation: forgetting an answer erases a finding's answer-derived copies (P2)", () => {
  const REC = "SECRET-RECOMMENDATION-PASSAGE-from-answer";
  const SUP = "SECRET-SUPPORT-CLAIMSPAN-from-answer";
  const ACC = "SECRET-ACCURACY-CLAIMSPAN-from-answer";
  const MARKER = "[redacted: answer forgotten]";
  // A recommendation_accuracy finding citing ONE answer, carrying the three STRUCTURED answer-derived copies
  // (recommendation.passage, support[].claimSpan, accuracy[].claimSpan) plus free-analysis prose (observation).
  const answerFinding = (findingId: string, answerId: string) => ({
    findingId,
    family: "recommendation_accuracy" as const,
    evidence: [{ kind: "answer" as const, id: answerId }],
    entityMatch: "confirmed" as const,
    capture: { answerComplete: true, citationsComplete: true },
    observation: "Free-analysis prose that is deliberately NOT auto-wiped by an answer forget.",
    hypothesis: null,
    competitorCited: null,
    ownCited: null,
    recommendation: {
      status: "recommended" as const,
      passage: REC,
      target: "the business",
      suitability: "fits" as const,
      review: { reviewer: user, reviewedAt: now },
    },
    support: [
      {
        claimSpan: SUP,
        citedUrl: "https://acme.example/x",
        answerCapturedAt: ACC_CAP,
        status: "not_checked" as const,
        sourcePassage: null,
        sourceCapturedAt: null,
        reason: null,
        review: null,
      },
    ],
    accuracy: [
      {
        claimSpan: ACC,
        factKind: "price" as const,
        status: "not_checked" as const,
        factId: null,
        review: null,
      },
    ],
    priority: {
      harm: "medium" as const,
      relevance: "medium" as const,
      fixability: "medium" as const,
    },
    decision: "accepted" as const,
    review: { reviewer: user, reviewedAt: now },
    secondReview: null,
    linkedTaskId: null,
  });
  const saveRaw = async (record: unknown) => {
    const r = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: record,
      p_scope: panelScope,
    });
    if (r.error) throw r.error;
    return (r.data as { id: string }).id;
  };
  const removeAnswer = (kind: string, id: string) =>
    rpc("remove_ai_answer_evidence", { p_user: user, p_project: "p", p_kind: kind, p_id: id });
  const storedRecord = async (rowId: string) =>
    JSON.stringify(
      (
        await db.query<{ r: unknown }>("SELECT record r FROM ai_citation_findings WHERE id=$1", [
          rowId,
        ])
      ).rows[0].r,
    );
  it("erases the answer-derived copies across ALL versions on a real answer remove — masks the reviewer digest + receipt, blocks new reviews, keeps prose, and leaves a finding citing a different answer intact", async () => {
    const ans = await importReal(ACC_CAP, "The captured answer under review.");
    const ans2 = await importReal(ACC_CAP, "An unrelated captured answer.");
    const fid = "60000000-0000-4000-8000-0000000000f0";
    const v1 = await saveRaw(answerFinding(fid, ans));
    const v2 = await saveRaw({
      ...answerFinding(fid, ans),
      observation: "Revised free-analysis prose (a new version).",
    });
    const other = await saveRaw(answerFinding("60000000-0000-4000-8000-0000000000f5", ans2));
    // A reviewer records an approved receipt while the answer is live (real pin available).
    const sha = await shaFor(v2);
    await submit(reviewer, v2, sha, "approved");
    // Forget the answer via the REAL released remove RPC.
    expect((await removeAnswer("answer", ans)).error).toBeNull();
    // Every stored version of the citing finding has the three copies redacted; each version's OWN free-analysis
    // prose (the observation) is kept verbatim — v1 the default, v2 its revised text.
    const proseByVersion: Record<string, string> = {
      [v1]: "Free-analysis prose that is deliberately NOT auto-wiped by an answer forget.",
      [v2]: "Revised free-analysis prose (a new version).",
    };
    for (const v of [v1, v2]) {
      const rec = await storedRecord(v);
      for (const secret of [REC, SUP, ACC]) expect(rec, v).not.toContain(secret);
      expect(rec).toContain(MARKER);
      expect(rec, v).toContain(proseByVersion[v]); // this version's free reviewer prose is NOT auto-wiped
    }
    // The finding is erased: the reviewer read masks the digest + the receipt, and no secret appears anywhere.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: v2 },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.recordSha256).toBeNull();
    expect(view.reviews[0].recordSha256).toBeNull();
    const whole = JSON.stringify(view);
    for (const secret of [REC, SUP, ACC]) expect(whole).not.toContain(secret);
    // The OWNER detail read also shows markers — a forget is a deletion, erased for everyone (not just reviewers).
    const detail = JSON.stringify(await getCitationFinding(scope, v2, rpc));
    for (const secret of [REC, SUP, ACC]) expect(detail).not.toContain(secret);
    // A NEW review on the erased finding is blocked.
    await expect(submit(reviewer, v2, "a".repeat(64), "approved")).rejects.toThrow();
    // Answer-scoped isolation: the finding citing a DIFFERENT answer keeps its copies.
    const otherRec = await storedRecord(other);
    for (const secret of [REC, SUP, ACC]) expect(otherRec).toContain(secret);
  });
  it("prevents resurrection: an altered resave AND a fresh finding citing the deleted answer are redacted at save", async () => {
    const ans = await importReal(ACC_CAP, "The captured answer under review.");
    const fid = "60000000-0000-4000-8000-0000000000f1";
    await saveRaw(answerFinding(fid, ans));
    expect((await removeAnswer("answer", ans)).error).toBeNull();
    const altered = await saveRaw({
      ...answerFinding(fid, ans),
      observation: "A materially altered observation forcing a new version.",
    });
    const fresh = await saveRaw(answerFinding("60000000-0000-4000-8000-0000000000f2", ans));
    for (const row of [altered, fresh]) {
      const rec = await storedRecord(row);
      for (const secret of [REC, SUP, ACC]) expect(rec, row).not.toContain(secret);
      expect(rec).toContain(MARKER);
    }
  });
  it("propagates through a PROMPT removal (cascade delete of its answers)", async () => {
    const ans = await importReal(ACC_CAP, "An answer under the prompt.");
    const row = await saveRaw(answerFinding("60000000-0000-4000-8000-0000000000f3", ans));
    expect((await removeAnswer("prompt", PROMPT)).error).toBeNull();
    const rec = await storedRecord(row);
    for (const secret of [REC, SUP, ACC]) expect(rec).not.toContain(secret);
    expect(rec).toContain(MARKER);
    expect(
      (
        await db.query<{ e: string | null }>(
          "SELECT evidence_erased_at::text e FROM ai_citation_findings WHERE id=$1",
          [row],
        )
      ).rows[0].e,
    ).not.toBeNull();
  });
  it("deletes a whole project atomically on answer cascade without orphaning the answer-erasure marker, leaving another project intact", async () => {
    const ans = await importReal(ACC_CAP, "An answer to be project-deleted.");
    await saveRaw(answerFinding("60000000-0000-4000-8000-0000000000f6", ans));
    // Preexisting answer-erasure marker (a second answer forgotten first, so a marker row exists for project p).
    const ans2 = await importReal("2024-05-01T00:00:00Z", "A second answer, forgotten first.");
    await saveRaw(answerFinding("60000000-0000-4000-8000-0000000000f7", ans2));
    expect((await removeAnswer("answer", ans2)).error).toBeNull();
    expect(
      (
        await db.query(
          "SELECT 1 FROM ai_citation_answer_erasures WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows.length,
    ).toBe(1);
    // A q-project answer + finding must survive the delete of p.
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','q') ON CONFLICT DO NOTHING",
      [user],
    );
    const qRow = "60000000-0000-4000-8000-0000000000f8";
    await db.query(
      "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1,'q',$2,$2,1,'recommendation_accuracy','accepted',$3::jsonb,$4,$5,1,'Acme','US',$1,$1)",
      [user, qRow, JSON.stringify(answerFinding(qRow, ans)), "f".repeat(64), panelScope.panelId],
    );
    // Deleting the whole project p (real DELETE) cascades prompts -> answers, firing the trigger AFTER the
    // project row is gone; the redactor's project-exists guard skips, so no orphan 23503 and the delete succeeds.
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    for (const t of ["ai_citation_findings", "ai_citation_answer_erasures", "ai_answer_evidence"]) {
      const r = await db.query(`SELECT 1 FROM ${t} WHERE user_id=$1 AND project_id='p'`, [user]);
      expect(r.rows.length, t).toBe(0);
    }
    expect(
      (
        await db.query(
          "SELECT 1 FROM ai_citation_findings WHERE user_id=$1 AND project_id='q' AND id=$2",
          [user, qRow],
        )
      ).rows.length,
    ).toBe(1);
  });
});
