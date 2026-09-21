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
  support?: unknown[];
  // Override the default observation prose. Used only to make a genuinely DISTINCT accepted successor version
  // (different record -> different digest) through the REAL save path, so production idempotency/dedup stands.
  observation?: string;
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
    observation: opts.observation ?? "The answer cites a competitor but not this business.",
    hypothesis: null,
    competitorCited: rec ? null : true,
    ownCited: rec ? null : false,
    recommendation: null,
    support: opts.support ?? [],
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
// A schema-valid ASSESSED support entry (finding 4059944844). `citedPassage` carries a SELECTED-EVIDENCE pin to an
// exact stored record + source revision — the only thing that makes a source independently inspectable (the reviewer
// then sees that ONE selected record's live material, never the source's other records). `recordedOnlyPassage` has
// the same owner-recorded text but NO pin, so it is honest recorded-only provenance and is NOT independently
// inspectable. An assessed status forces sourcePassage + sourceCapturedAt + review to be present (the superRefine).
const supportBase = (passage: string) => ({
  claimSpan: "It says massage from 500 SEK.",
  citedUrl: "https://acme.example/services",
  answerCapturedAt: ACC_CAP,
  status: "supports" as const,
  sourcePassage: passage,
  sourceCapturedAt: ACC_CAP,
  reason: "The recorded page excerpt confirms the claim.",
  review: { reviewer: user, reviewedAt: now },
});
const citedPassage = (
  passage: string,
  pin: { sourceId: string; recordId: string; sourceRevision: number; recordRevision: number },
) => ({ ...supportBase(passage), selectedRecord: pin });
const recordedOnlyPassage = (passage: string) => ({
  ...supportBase(passage),
  selectedRecord: null,
});
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
// A released knowledge record carrying substantive source MATERIAL, bound to a source id + source revision. Its
// timestamps are real and valid (reviewedAt >= updatedAt, both in the past) with status 'accepted' by default, so it
// is currently-valid citation evidence (finding 4060770032); validity tests seed their own explicit timestamps.
const seedRecord = (
  recordId: string,
  sourceId: string,
  sourceRevision: number,
  value: string,
  status = "accepted",
) =>
  db.query(
    "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) VALUES($1::uuid,'p',$2::uuid,$3::uuid,1,jsonb_build_object('ownerId',$1::text,'projectId','p','id',$2::text,'revision',1,'sourceId',$3::text,'sourceRevision',$4::int,'key','k1','category','fact','appliesTo','text','value',$5::text,'locator','Services > Pricing','status',$6::text,'updatedAt','2024-02-02T00:00:00Z','reviewedAt','2024-02-02T01:00:00Z')) ON CONFLICT(user_id,project_id,id) DO UPDATE SET source_id=EXCLUDED.source_id,revision=EXCLUDED.revision,payload=EXCLUDED.payload",
    [user, recordId, sourceId, sourceRevision, value, status],
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
    expect(view.record!.findingId).toBe("60000000-0000-4000-8000-000000000001");
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
  it("serves ONLY the SELECTED record for a source-cited finding, never the source's other records, and completes a valid selected-evidence review (finding 4059944844)", async () => {
    await seedSource("active");
    // The SELECTED (pinned) record and an UNRELATED private record, both under the SAME active source at its
    // current revision. Only the selected record may reach the reviewer.
    await seedRecord(RECORD, SOURCE, 1, "SELECTED-RECORD-VALUE-ALPHA: massage from 500 SEK.");
    await seedRecord(
      "b1000000-0000-4000-8000-0000000000b2",
      SOURCE,
      1,
      "UNRELATED-PRIVATE-SECRET-BETA: must never reach a reviewer.",
    );
    const CITED = "OWNER-RECORDED-PASSAGE-ALPHA: the owner's own recorded copy.";
    const f = await saveF("60000000-0000-4000-8000-000000000034", "accepted", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage(CITED, {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(true);
    const src = view.evidence.find((e) => e.kind === "source")!;
    expect(src.kind === "source" && src.available).toBe(true);
    expect(src.kind === "source" && src.inspectable).toBe(true); // live source + a RESOLVING selected-record pin
    expect(src.kind === "source" && src.status).toBe("active");
    // Exactly ONE selected record is served — the pinned one — carrying its ACTUAL stored value (not the copy).
    if (src.kind === "source") {
      expect(src.materialCount).toBe(1);
      expect(src.material).toHaveLength(1);
      expect(src.material[0]?.recordId).toBe(RECORD);
      expect(src.material[0]?.value).toContain("SELECTED-RECORD-VALUE-ALPHA");
    }
    // The owner's recorded passage stays visible in the record (honest recorded-only provenance).
    expect((view.record!.support[0] as { sourcePassage: string | null }).sourcePassage).toBe(CITED);
    // The UNRELATED same-source private record never appears ANYWHERE in the reviewer response.
    expect(JSON.stringify(view)).not.toContain("UNRELATED-PRIVATE-SECRET-BETA");
    // A valid selected-evidence review completes.
    await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(await reviewStatusOf(f.id)).toBe("independent_reviewed");
  });
  it("keeps an ASSESSED passage with NO resolving pin UNINSPECTABLE even when the source has a live record — arbitrary owner text is recorded-only provenance, never independent evidence (finding 4059944844)", async () => {
    await seedSource("active");
    // A live record exists under the source, but the assessed support entry carries NO selected-record pin. This is
    // exactly the hole a global passage+existence gate left open: arbitrary owner text + an unrelated live record.
    await seedRecord(
      RECORD,
      SOURCE,
      1,
      "UNSELECTED-PRIVATE-SECRET-GAMMA: present but never pinned.",
    );
    const TEXT =
      "OWNER-RECORDED-ONLY-GAMMA: an arbitrary owner passage with no selected-record pin.";
    const f = await saveF("60000000-0000-4000-8000-000000000035", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [recordedOnlyPassage(TEXT)],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    expect(src.kind === "source" && src.available).toBe(true);
    expect(src.kind === "source" && src.inspectable).toBe(false); // no resolving pin → not independent evidence
    if (src.kind === "source") expect(src.materialCount).toBe(0); // nothing selected → no material served
    // The owner's passage is shown honestly as recorded-only provenance; the unselected private record is absent.
    expect((view.record!.support[0] as { sourcePassage: string | null }).sourcePassage).toBe(TEXT);
    expect(JSON.stringify(view)).not.toContain("UNSELECTED-PRIVATE-SECRET-GAMMA");
    // An approve on an uninspectable required-second-review finding does NOT complete it (review/attest eligibility).
    await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("treats a revoked source as non-inspectable — the selected record is not served, the recorded passage is withheld, and a new review is blocked (finding 4059944844)", async () => {
    await seedSource("revoked");
    await seedRecord(
      RECORD,
      SOURCE,
      1,
      "SELECTED-BUT-REVOKED-SECRET-DELTA: under a now-revoked source.",
    );
    const CITED = "OWNER-RECORDED-PASSAGE-REVOKED: the owner's copy under a now-revoked source.";
    const f = await saveF("60000000-0000-4000-8000-000000000038", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage(CITED, {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
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
    if (src.kind === "source") expect(src.materialCount).toBe(0); // a revoked source serves no selected material
    // The whole record is withheld (masked -> record null), the digest is masked, and the selected record never
    // appears. A new review is BLOCKED (no pin), so the save cannot be a stale-vs-success oracle.
    expect(view.record).toBeNull();
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(view.recordSha256).toBeNull();
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("SELECTED-BUT-REVOKED-SECRET-DELTA");
    expect(whole).not.toContain("OWNER-RECORDED-PASSAGE-REVOKED");
    await expect(submit(reviewer, f.id, "a".repeat(64), "approved")).rejects.toThrow();
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
    // Owner retention: revocation is not a forget, so the stored copy is untouched.
    expect(
      (
        await db.query<{ p: string | null }>(
          "SELECT (record->'support'->0->>'sourcePassage') p FROM ai_citation_findings WHERE id=$1",
          [f.id],
        )
      ).rows[0].p,
    ).toBe(CITED);
  });
  it("cannot inspect a finding citing TWO sources when only ONE carries a resolving pin (finding 4059944844)", async () => {
    await seedSource("active", SOURCE);
    await seedSource("active", SOURCE2);
    await seedRecord(RECORD, SOURCE, 1, "Selected record of the FIRST source.");
    await seedRecord(
      "b1000000-0000-4000-8000-0000000000c2",
      SOURCE2,
      1,
      "A record of the SECOND source.",
    );
    // The finding cites BOTH sources but pins a record only in the first. The second source has a live record but
    // no pin, so it is unbound → the whole finding is not independently inspectable.
    const f = await saveF("60000000-0000-4000-8000-000000000039", "needs_second_review", {
      evidence: [
        { kind: "source", id: SOURCE },
        { kind: "source", id: SOURCE2 },
      ],
      support: [
        citedPassage("Bound to the first source.", {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const bound = view.evidence.find((e) => e.kind === "source" && e.id === SOURCE)!;
    const unbound = view.evidence.find((e) => e.kind === "source" && e.id === SOURCE2)!;
    expect(bound.kind === "source" && bound.inspectable).toBe(true);
    expect(unbound.kind === "source" && unbound.inspectable).toBe(false);
    if (unbound.kind === "source") expect(unbound.materialCount).toBe(0);
    await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("fails closed when the exact selected record is MISSING, and rejects a cross-project pin (finding 4059944844)", async () => {
    await seedSource("active");
    // The pin targets a record id that does not exist for this owner/project/source.
    const missing = await saveF("60000000-0000-4000-8000-00000000003a", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage("Points at a non-existent record.", {
          sourceId: SOURCE,
          recordId: "b1000000-0000-4000-8000-0000000000ff",
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    expect(
      (
        await getCitationFindingForReview(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: missing.id },
          rpc,
        )
      ).inspectionComplete,
    ).toBe(false);
    // A record that exists ONLY in another project 'q' cannot back a pin from project 'p'.
    await db.query(
      "INSERT INTO project_knowledge_sources(user_id,project_id,id,revision,payload) VALUES($1,'q',$2,1,jsonb_build_object('status','active')) ON CONFLICT DO NOTHING",
      [user, SOURCE],
    );
    const foreignRecord = "b1000000-0000-4000-8000-0000000000fe";
    await db.query(
      "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) VALUES($1::uuid,'q',$2::uuid,$3::uuid,1,jsonb_build_object('sourceId',$3::text,'sourceRevision',1,'value','FOREIGN-PROJECT-SECRET','status','accepted'))",
      [user, foreignRecord, SOURCE],
    );
    const cross = await saveF("60000000-0000-4000-8000-00000000003b", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage("Points at a record in another project.", {
          sourceId: SOURCE,
          recordId: foreignRecord,
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const crossView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: cross.id },
      rpc,
    );
    expect(crossView.inspectionComplete).toBe(false); // the pin does not resolve across the project boundary
    expect(JSON.stringify(crossView)).not.toContain("FOREIGN-PROJECT-SECRET");
  });
  it("resolves a pin with UPPERCASE ids (semantic uuid) but fails closed on a mismatched OR missing recordRevision (finding 4059944844)", async () => {
    await seedSource("active");
    await seedRecord(RECORD, SOURCE, 1, "SELECTED-RECORD-VALUE at revision 1.");
    // Uppercase source/record ids in the pin still resolve — matched by semantic uuid (lower(text)=uuid::text).
    const upper = await saveF("60000000-0000-4000-8000-00000000003c", "accepted", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage("Uppercase-id pin.", {
          sourceId: SOURCE.toUpperCase(),
          recordId: RECORD.toUpperCase(),
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const upView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: upper.id },
      rpc,
    );
    expect(upView.inspectionComplete).toBe(true);
    const upSrc = upView.evidence.find((e) => e.kind === "source")!;
    if (upSrc.kind === "source") expect(upSrc.materialCount).toBe(1);
    // A pin whose recordRevision does NOT match the record's current version resolves nothing (fail closed) — the
    // record is at revision 1, the pin claims revision 2.
    const wrong = await saveF("60000000-0000-4000-8000-00000000003d", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage("Wrong record revision.", {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 1,
          recordRevision: 2,
        }),
      ],
    });
    const wrongView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: wrong.id },
      rpc,
    );
    expect(wrongView.inspectionComplete).toBe(false);
    const wrongSrc = wrongView.evidence.find((e) => e.kind === "source")!;
    if (wrongSrc.kind === "source") expect(wrongSrc.materialCount).toBe(0);
    // A PARTIAL historical pin (no recordRevision) is backward-readable but never resolves — no fabricated default.
    const partial = await saveF("60000000-0000-4000-8000-00000000003f", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        {
          ...supportBase("Partial pin, no recordRevision."),
          selectedRecord: { sourceId: SOURCE, recordId: RECORD, sourceRevision: 1 },
        },
      ],
    });
    const partialView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: partial.id },
      rpc,
    );
    expect(partialView.inspectionComplete).toBe(false);
    const partialSrc = partialView.evidence.find((e) => e.kind === "source")!;
    if (partialSrc.kind === "source") expect(partialSrc.materialCount).toBe(0);
  });
  it("requires EVERY assessed support to resolve — one resolving pin does not certify a sibling stale pin sharing the source, and only the resolved record is served (finding 4059944844)", async () => {
    await seedSource("active");
    await seedRecord(RECORD, SOURCE, 1, "SELECTED-RECORD-VALUE for the valid entry.");
    const f = await saveF("60000000-0000-4000-8000-00000000003e", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage("Valid, resolves.", {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 1,
          recordRevision: 1,
        }),
        citedPassage("Sibling assessed pin at a MISSING record of the SAME source.", {
          sourceId: SOURCE,
          recordId: "b1000000-0000-4000-8000-0000000000ca",
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    // The source has a resolving pin (per-item inspectable true) and only the ONE resolved record is served...
    const src = view.evidence.find((e) => e.kind === "source")!;
    expect(src.kind === "source" && src.inspectable).toBe(true);
    if (src.kind === "source") {
      expect(src.materialCount).toBe(1);
      expect(src.material[0]?.recordId).toBe(RECORD);
    }
    // ...but the WHOLE finding is NOT complete: the sibling assessed pin does not resolve, so completeness fails.
    expect(view.inspectionComplete).toBe(false);
    await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("does not complete when an assessed pin targets a source ABSENT from the finding's evidence (even a live one), and never serves that uncited source's material (finding 4059944844)", async () => {
    await seedSource("active", SOURCE);
    await seedSource("active", SOURCE2);
    await seedRecord(RECORD, SOURCE, 1, "Cited source A material.");
    await seedRecord(
      "b1000000-0000-4000-8000-0000000000cb",
      SOURCE2,
      1,
      "UNCITED-SOURCE-B-SECRET: never shown.",
    );
    // Cite ONLY sourceA, but add a second assessed support entry pinning a live record of the UNCITED sourceB.
    const f = await saveF("60000000-0000-4000-8000-000000000040", "needs_second_review", {
      evidence: [{ kind: "source", id: SOURCE }],
      support: [
        citedPassage("A: cited and resolving.", {
          sourceId: SOURCE,
          recordId: RECORD,
          sourceRevision: 1,
          recordRevision: 1,
        }),
        citedPassage("B: resolves, but B is NOT cited in evidence.", {
          sourceId: SOURCE2,
          recordId: "b1000000-0000-4000-8000-0000000000cb",
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    // Completeness fails: the uncited-source pin cannot certify (its material is never shown by the read).
    expect(view.inspectionComplete).toBe(false);
    // The reviewer response carries only the cited source A; sourceB's material/secret never appears.
    expect(view.evidence.every((e) => e.kind !== "source" || e.id === SOURCE)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("UNCITED-SOURCE-B-SECRET");
    await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("does not complete an ANSWER-only finding whose assessed support pins an uncited source (finding 4059944844)", async () => {
    await seedSource("active", SOURCE2);
    await seedRecord(
      "b1000000-0000-4000-8000-0000000000cc",
      SOURCE2,
      1,
      "ANSWER-ONLY-UNCITED-SECRET: never shown.",
    );
    // The finding cites only the substantive ANSWER, but records an assessed support pin to the uncited sourceB.
    const f = await saveF("60000000-0000-4000-8000-000000000041", "needs_second_review", {
      evidence: [{ kind: "answer", id: ANSWER }],
      support: [
        citedPassage("Pins an uncited source on an answer-only finding.", {
          sourceId: SOURCE2,
          recordId: "b1000000-0000-4000-8000-0000000000cc",
          sourceRevision: 1,
          recordRevision: 1,
        }),
      ],
    });
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false); // the uncited-source pin never certifies the answer-only finding
    expect(JSON.stringify(view)).not.toContain("ANSWER-ONLY-UNCITED-SECRET");
    await submit(reviewer, f.id, view.recordSha256!, "approved");
    expect(await reviewStatusOf(f.id)).toBe("second_review_pending");
  });
  it("requires the SELECTED record to be currently-valid ACCEPTED knowledge; non-accepted / expired / future / unreviewed / review-before-update all fail closed, valid passes, and the read agrees with the canonical predicate (finding 4060770032)", async () => {
    await seedSource("active"); // active, observedAt 2024-02-01 (in the past)
    const base = {
      ownerId: user,
      projectId: "p",
      revision: 1,
      sourceId: SOURCE,
      sourceRevision: 1,
      key: "k1",
      category: "fact",
      appliesTo: "text",
      value: "Selected record value.",
      locator: "Services > Pricing",
      status: "accepted",
      updatedAt: "2024-02-02T00:00:00Z",
      reviewedAt: "2024-02-02T01:00:00Z",
    };
    const seedRec = (recordId: string, over: Record<string, unknown>) =>
      db.query(
        "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) VALUES($1::uuid,'p',$2::uuid,$3::uuid,1,$4::jsonb) ON CONFLICT(user_id,project_id,id) DO UPDATE SET payload=EXCLUDED.payload",
        [user, recordId, SOURCE, JSON.stringify({ ...base, id: recordId, ...over })],
      );
    const cases: Array<[string, string, Record<string, unknown>, boolean]> = [
      ["proposed", "b1000000-0000-4000-8000-000000000a01", { status: "proposed" }, false],
      ["disputed", "b1000000-0000-4000-8000-000000000a02", { status: "disputed" }, false],
      ["expired-status", "b1000000-0000-4000-8000-000000000a03", { status: "expired" }, false],
      ["rejected", "b1000000-0000-4000-8000-000000000a04", { status: "rejected" }, false],
      [
        "expired-validUntil",
        "b1000000-0000-4000-8000-000000000a05",
        { validUntil: "2024-03-01T00:00:00Z" },
        false,
      ],
      [
        "future-updated",
        "b1000000-0000-4000-8000-000000000a06",
        { updatedAt: "2999-01-01T00:00:00Z", reviewedAt: "2999-01-02T00:00:00Z" },
        false,
      ],
      [
        "future-reviewed",
        "b1000000-0000-4000-8000-000000000a07",
        { reviewedAt: "2999-01-01T00:00:00Z" },
        false,
      ],
      [
        "review-before-update",
        "b1000000-0000-4000-8000-000000000a08",
        { updatedAt: "2024-02-02T02:00:00Z", reviewedAt: "2024-02-02T01:00:00Z" },
        false,
      ],
      ["missing-review", "b1000000-0000-4000-8000-000000000a09", { reviewedAt: null }, false],
      [
        "malformed-updated",
        "b1000000-0000-4000-8000-000000000a0b",
        { updatedAt: "not-a-timestamp" },
        false,
      ],
      // Syntactically-ISO but IMPOSSIBLE instants pass the regex frame yet RAISE at ::timestamptz — an invalid
      // calendar date (month/day 99) and an invalid zone displacement (+99:99). The controlled datetime-only
      // exception in citation_knowledge_selectable must fail these CLOSED without crashing the reviewer read
      // (finding 4060770032 delta) — a poisoned historical record leaves `material` empty, not an error.
      [
        "impossible-date",
        "b1000000-0000-4000-8000-000000000a0c",
        { updatedAt: "2026-99-99T00:00:00Z" },
        false,
      ],
      [
        "impossible-offset",
        "b1000000-0000-4000-8000-000000000a0d",
        { reviewedAt: "2024-02-02T01:00:00+99:99" },
        false,
      ],
      ["valid", "b1000000-0000-4000-8000-000000000a10", {}, true],
    ];
    let seq = 0;
    for (const [label, recordId, over, expectInspectable] of cases) {
      await seedRec(recordId, over);
      seq += 1;
      const fid = `60000000-0000-4000-8000-0000000009${String(seq).padStart(2, "0")}`;
      const f = await saveF(fid, "accepted", {
        evidence: [{ kind: "source", id: SOURCE }],
        support: [
          citedPassage(`pin for ${label}`, {
            sourceId: SOURCE,
            recordId,
            sourceRevision: 1,
            recordRevision: 1,
          }),
        ],
      });
      const view = await getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: f.id },
        rpc,
      );
      expect(view.inspectionComplete, label).toBe(expectInspectable);
      const src = view.evidence.find((e) => e.kind === "source")!;
      expect(src.kind === "source" && src.inspectable, label).toBe(expectInspectable);
      if (src.kind === "source") {
        expect(src.materialCount, label).toBe(expectInspectable ? 1 : 0);
        // Only a valid record is served, and it carries its own status + validity metadata (never misrepresented).
        if (expectInspectable) {
          expect(src.material[0]?.status).toBe("accepted");
          expect(src.material[0]?.validUntil).toBeNull();
        }
      }
      // The reviewer read and the canonical inspection predicate agree exactly.
      const canonical = await db.query<{ ok: boolean }>(
        "SELECT public.citation_finding_inspectable($1,'p',(SELECT record FROM ai_citation_findings WHERE id=$2)) ok",
        [user, f.id],
      );
      expect(canonical.rows[0].ok, label).toBe(expectInspectable);
    }
  });
  it("citation_knowledge_selectable fails closed on a non-finite/NULL clock and on impossible calendar dates/offsets, never raising (finding 4060770032, helper boundary)", async () => {
    const src = JSON.stringify({ status: "active", observedAt: "2024-02-01T00:00:00Z" });
    const rec = JSON.stringify({
      status: "accepted",
      value: "v",
      updatedAt: "2024-02-02T00:00:00Z",
      reviewedAt: "2024-02-02T01:00:00Z",
    });
    const sel = async (s: string, r: string, now: string) =>
      (
        await db.query<{ ok: boolean | null }>(
          `SELECT public.citation_knowledge_selectable($1::jsonb,$2::jsonb,${now}) ok`,
          [s, r],
        )
      ).rows[0].ok;
    // A real, finite clock with valid material -> selectable (positive control).
    expect(await sel(src, rec, "'2024-03-01T00:00:00Z'::timestamptz")).toBe(true);
    // p_now must be finite/non-null, or every future/expiry comparison would pass vacuously -> fail closed.
    expect(await sel(src, rec, "NULL::timestamptz")).toBe(false);
    expect(await sel(src, rec, "'infinity'::timestamptz")).toBe(false);
    expect(await sel(src, rec, "'-infinity'::timestamptz")).toBe(false);
    // Impossible calendar date / zone displacement in ANY timestamp field is caught at the cast (returns false,
    // never RAISEs) — checked on the record's updatedAt, the record's reviewedAt offset, and the source observedAt.
    const badDate = JSON.stringify({ ...JSON.parse(rec), updatedAt: "2026-99-99T00:00:00Z" });
    const badOffset = JSON.stringify({
      ...JSON.parse(rec),
      reviewedAt: "2024-02-02T01:00:00+99:99",
    });
    const badObserved = JSON.stringify({ status: "active", observedAt: "2026-13-40T00:00:00Z" });
    expect(await sel(src, badDate, "'2024-03-01T00:00:00Z'::timestamptz")).toBe(false);
    expect(await sel(src, badOffset, "'2024-03-01T00:00:00Z'::timestamptz")).toBe(false);
    expect(await sel(badObserved, rec, "'2024-03-01T00:00:00Z'::timestamptz")).toBe(false);
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
  it("propagates erasure to a finding pinning a DELETED fact: prose + notes withheld from the reviewer, retained for the owner, new reviews blocked (finding 4059689464)", async () => {
    const OBS_SECRET = "OBS-SECRET-6M2P: the deleted fact recorded the private 999 rate.";
    const NOTE_SECRET = "NOTE-SECRET-6M2P: this reviewer note quotes the deleted fact.";
    const fact = await seedFact();
    const fid = "60000000-0000-4000-8000-000000000950";
    const saved = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: {
        ...finding(fid, "accepted", {
          family: "recommendation_accuracy",
          evidence: [{ kind: "answer" as const, id: ANSWER }],
          accuracy: [resolvedEntry(fact.id)],
        }),
        observation: OBS_SECRET,
      },
      p_scope: panelScope,
    });
    if (saved.error) throw saved.error;
    const row = (saved.data as { id: string }).id;
    // A reviewer records a receipt whose NOTE quotes the fact, while the fact is still live.
    await submit(reviewer, row, await shaFor(row), "approved", NOTE_SECRET);
    // Delete the pinned fact via the real RPC.
    expect(
      (
        await rpc("remove_ai_citation_business_fact", {
          p_user: user,
          p_project: "p",
          p_id: fact.id,
        })
      ).error,
    ).toBeNull();
    // The finding is now evidence-erased; the reviewer for-review read withholds the free prose AND the note,
    // and neither the observation nor the note secret appears anywhere in the response.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.record).toBeNull();
    expect(view.reviews[0].note).toBeNull();
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("OBS-SECRET-6M2P");
    expect(whole).not.toContain("NOTE-SECRET-6M2P");
    // The standalone receipt list also withholds the note for the reviewer.
    expect(
      (
        await readCitationFindingReviews(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: row },
          rpc,
        )
      ).reviews[0].note,
    ).toBeNull();
    // A NEW review on the erased finding is blocked (no note resurrection).
    await expect(submit(reviewer, row, "a".repeat(64), "approved")).rejects.toThrow();
    // The OWNER retains the free-text observation (honest retention); the note is ERASED in storage to the marker.
    expect(JSON.stringify(await getCitationFinding(scope, row, rpc))).toContain("OBS-SECRET-6M2P");
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(ownerList.reviews[0].note).toBe("[redacted: finding evidence forgotten]");
    expect(ownerList.reviews[0].decision).toBe("approved");
    const stored = await db.query<{ n: string | null; obs: string }>(
      "SELECT (SELECT note FROM ai_citation_finding_reviews WHERE finding_row_id=$1) n, (record->>'observation') obs FROM ai_citation_findings WHERE id=$1",
      [row],
    );
    expect(stored.rows[0].n).toBe("[redacted: finding evidence forgotten]");
    expect(stored.rows[0].obs).toBe(OBS_SECRET); // the owner's prose is genuinely retained in storage
  });
  it("blocks fact-erased resurrection at save, leaves a finding pinning a SURVIVING fact untouched, and survives a project delete without an orphaned marker (finding 4059689464)", async () => {
    const factA = await seedFact();
    const factB = (
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
      })
    ).data as { id: string };
    const survivingRow = (
      (
        await rpc("save_ai_citation_finding", {
          p_user: user,
          p_project: "p",
          p_record: finding("60000000-0000-4000-8000-000000000951", "accepted", {
            family: "recommendation_accuracy",
            evidence: [{ kind: "answer", id: ANSWER }],
            accuracy: [resolvedEntry(factB.id, { factId: FACT2 })],
          }),
          p_scope: panelScope,
        })
      ).data as { id: string }
    ).id;
    // Delete factA; a finding pinning the SURVIVING factB must be untouched (row-id scoped, no over-fire).
    await rpc("remove_ai_citation_business_fact", { p_user: user, p_project: "p", p_id: factA.id });
    // A FRESH finding pinning the now-deleted factA is erased at save (resurrection blocked).
    const freshRow = (
      (
        await rpc("save_ai_citation_finding", {
          p_user: user,
          p_project: "p",
          p_record: finding("60000000-0000-4000-8000-000000000952", "accepted", {
            family: "recommendation_accuracy",
            evidence: [{ kind: "answer", id: ANSWER }],
            accuracy: [resolvedEntry(factA.id)],
          }),
          p_scope: panelScope,
        })
      ).data as { id: string }
    ).id;
    const erasedOf = async (rowId: string) =>
      (
        await db.query<{ e: string | null }>(
          "SELECT evidence_erased_at::text e FROM ai_citation_findings WHERE id=$1",
          [rowId],
        )
      ).rows[0].e;
    expect(await erasedOf(freshRow)).not.toBeNull();
    expect(await erasedOf(survivingRow)).toBeNull();
    // A whole-project delete cascades the facts; the trigger's project-exists guard skips, so no orphaned marker
    // and no FK failure — the delete is atomic.
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    const remaining = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM ai_citation_business_facts WHERE user_id=$1 AND project_id='p'",
      [user],
    );
    expect(remaining.rows[0].n).toBe(0);
  });
  it("propagates erasure to a finding whose accuracy references the deleted fact by LOGICAL id+version with NO row-pin — prose+note withheld, resolution stays unresolved, owner retention (finding 4061340380)", async () => {
    const OBS_SECRET = "OBS-SECRET-4X8: the deleted fact recorded the private 999 rate.";
    const NOTE_SECRET = "NOTE-SECRET-4X8: this reviewer note quotes the deleted fact.";
    const fact = await seedFact();
    // The SCHEMA-ALLOWED rowless assessed shape: factId + factVersion, NO factRowId (assessed states require only
    // factId + reviewer). Saved through the CLIENT path so the schema itself admits it — not an RPC-forced fixture.
    const f = await saveF("60000000-0000-4000-8000-000000000953", "accepted", {
      family: "recommendation_accuracy",
      evidence: [{ kind: "answer", id: ANSWER }],
      accuracy: [
        {
          claimSpan: "The price is 500 SEK.",
          factKind: "price",
          status: "accurate_at_capture",
          factId: FACT,
          factVersion: fact.version,
          captureEvidenceId: ANSWER,
          review: { reviewer: user, reviewedAt: now },
        },
      ],
      observation: OBS_SECRET,
    });
    // While the fact is live the finding is visible, and the rowless entry is honestly UNRESOLVED (never rebound).
    const before = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(before.evidenceErased).toBe(false);
    expect(before.accuracyStatus).toBe("unresolved");
    await submit(reviewer, f.id, before.recordSha256!, "approved", NOTE_SECRET);
    // Delete the fact via the REAL RPC — the trigger passes its logical id + version, matching the rowless entry.
    expect(
      (
        await rpc("remove_ai_citation_business_fact", {
          p_user: user,
          p_project: "p",
          p_id: fact.id,
        })
      ).error,
    ).toBeNull();
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.record).toBeNull();
    expect(view.reviews[0].note).toBeNull();
    // Resolution is UNTOUCHED — the entry still resolves unresolved; erasure never rebinds or marks it resolved.
    expect(view.accuracyStatus).toBe("unresolved");
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("OBS-SECRET-4X8");
    expect(whole).not.toContain("NOTE-SECRET-4X8");
    // A NEW review is blocked (no note resurrection); the OWNER retains the prose; the note is erased in storage.
    await expect(submit(reviewer, f.id, "a".repeat(64), "approved")).rejects.toThrow();
    expect(JSON.stringify(await getCitationFinding(scope, f.id, rpc))).toContain("OBS-SECRET-4X8");
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: f.id },
      rpc,
    );
    expect(ownerList.reviews[0].note).toBe("[redacted: finding evidence forgotten]");
    expect(ownerList.reviews[0].decision).toBe("approved");
  });
  it("matches unpinned logical references for erasure + resurrection while preserving EXACT version/fact scope, project-delete safe (finding 4061340380)", async () => {
    const fact = await seedFact(); // (FACT, v1)
    // A schema-allowed rowless assessed entry referencing (factId, factVersion) with NO row-pin.
    const rowless = (factId: string, factVersion: number) => ({
      claimSpan: "The price is 500 SEK.",
      factKind: "price",
      status: "accurate_at_capture" as const,
      factId,
      factVersion,
      captureEvidenceId: ANSWER,
      review: { reviewer: user, reviewedAt: now },
    });
    const evidence = [{ kind: "answer" as const, id: ANSWER }];
    // (a) a rowless finding referencing a DIFFERENT VERSION of the same logical fact, and (b) one referencing a
    // DIFFERENT logical fact — both must be UNAFFECTED by deleting (FACT, v1).
    const otherVersion = await saveF("60000000-0000-4000-8000-000000000954", "accepted", {
      family: "recommendation_accuracy",
      evidence,
      accuracy: [rowless(FACT, 2)],
    });
    const otherFact = await saveF("60000000-0000-4000-8000-000000000955", "accepted", {
      family: "recommendation_accuracy",
      evidence,
      accuracy: [rowless(FACT2, 1)],
    });
    await rpc("remove_ai_citation_business_fact", { p_user: user, p_project: "p", p_id: fact.id });
    const erasedOf = async (rowId: string) =>
      (
        await db.query<{ e: string | null }>(
          "SELECT evidence_erased_at::text e FROM ai_citation_findings WHERE id=$1",
          [rowId],
        )
      ).rows[0].e;
    // Exact version scope + other-fact scope: a different version and a different logical fact are untouched.
    expect(await erasedOf(otherVersion.id)).toBeNull();
    expect(await erasedOf(otherFact.id)).toBeNull();
    // A FRESH rowless resave referencing the now-deleted (FACT, v1) is erased at save (no prose/note resurrection).
    const fresh = await saveF("60000000-0000-4000-8000-000000000956", "accepted", {
      family: "recommendation_accuracy",
      evidence,
      accuracy: [rowless(FACT, 1)],
      observation: "FRESH-SECRET-4X8: quotes the deleted fact.",
    });
    expect(await erasedOf(fresh.id)).not.toBeNull();
    const freshView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: fresh.id },
      rpc,
    );
    expect(freshView.evidenceErased).toBe(true);
    expect(freshView.record).toBeNull();
    expect(JSON.stringify(freshView)).not.toContain("FRESH-SECRET-4X8");
    await expect(
      submit(reviewer, fresh.id, "a".repeat(64), "approved", "resurrected note"),
    ).rejects.toThrow();
    // A whole-project delete cascades the findings and markers cleanly (the trigger's project-exists guard skips,
    // so no orphaned marker / FK 23503) — the erasure markers for the project are gone.
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_fact_erasures WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
describe("review-read identity + private-fact exposure boundaries (findings 4062040465, 4062040467)", () => {
  it("accepts a valid UPPERCASE finding-row UUID (canonical lowercase response) on both reviewer reads, scope not weakened (finding 4062040465)", async () => {
    const f = await saveF("60000000-0000-4000-8000-000000000070", "accepted");
    const upper = f.id.toUpperCase(); // a server-generated row UUID (effectively always carries hex letters)
    // Both reviewer reads accept the uppercase identity and return the canonical LOWERCASE id (previously a raw
    // !== re-check rejected the legitimate uppercase input).
    expect(
      (
        await getCitationFindingForReview(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: upper },
          rpc,
        )
      ).id,
    ).toBe(f.id);
    expect(
      (
        await readCitationFindingReviews(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: upper },
          rpc,
        )
      ).findingRowId,
    ).toBe(f.id);
    // Scope is NOT weakened: a genuinely different row, owner, or project is still rejected.
    await expect(
      getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: "60000000-0000-4000-8000-0000000000ee" },
        rpc,
      ),
    ).rejects.toThrow();
    await expect(
      getCitationFindingForReview(
        reviewer,
        { ownerId: "00000000-0000-4000-8000-000000000009", projectId: "p", findingRowId: f.id },
        rpc,
      ),
    ).rejects.toThrow();
    await expect(
      getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "q", findingRowId: f.id },
        rpc,
      ),
    ).rejects.toThrow();
  });
  it("exposes a private fact ONLY for a genuinely resolved assessed pin; hides it for unassessed / mismatched id·version·kind / missing / foreign / dated-unresolved pins (finding 4062040467)", async () => {
    const SECRET = "SECRET-FACT-9931 confidential rate 777 EUR";
    const FOREIGN = "FOREIGN-SECRET-5522 open 24-7";
    const savefact = (record: Record<string, unknown>) =>
      rpc("save_ai_citation_business_fact", { p_user: user, p_project: "p", p_record: record });
    const secretFact = (
      await savefact({
        factId: FACT,
        kind: "price",
        value: SECRET,
        confirmedBy: user,
        confirmedAt: "2026-01-02T00:00:00Z",
        validFrom: "2024-01-01T00:00:00Z",
        validUntil: null,
      })
    ).data as { id: string; version: number };
    // A SECOND, unrelated private fact (different logical id AND kind, so it never makes the price pin ambiguous).
    const foreignFact = (
      await savefact({
        factId: "a1000000-0000-4000-8000-000000000002",
        kind: "hours",
        value: FOREIGN,
        confirmedBy: user,
        confirmedAt: "2026-01-02T00:00:00Z",
        validFrom: "2024-01-01T00:00:00Z",
        validUntil: null,
      })
    ).data as { id: string };
    const early = await importReal("2023-06-01T00:00:00Z", "An older captured answer.");
    const ANS_EV = [{ kind: "answer" as const, id: ANSWER }];
    const accEntry = (over: Record<string, unknown>) => ({
      claimSpan: "The price is 777 EUR.",
      factKind: "price",
      status: "accurate_at_capture",
      factId: FACT,
      factVersion: secretFact.version,
      factRowId: secretFact.id,
      captureEvidenceId: ANSWER,
      review: { reviewer: user, reviewedAt: now },
      ...over,
    });
    const readCase = async (
      fid: string,
      evidence: Array<{ kind: "answer"; id: string }>,
      over: Record<string, unknown>,
    ) => {
      const saved = await rpc("save_ai_citation_finding", {
        p_user: user,
        p_project: "p",
        p_record: finding(fid, "accepted", {
          family: "recommendation_accuracy",
          evidence,
          accuracy: [accEntry(over)],
        }),
        p_scope: panelScope,
      });
      if (saved.error) throw saved.error;
      return getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: (saved.data as { id: string }).id },
        rpc,
      );
    };
    const hidden: Array<[string, Array<{ kind: "answer"; id: string }>, Record<string, unknown>]> =
      [
        ["not_checked", ANS_EV, { status: "not_checked", factId: null, review: null }],
        ["unclear", ANS_EV, { status: "unclear", factId: null, review: null }],
        ["mismatched factId", ANS_EV, { factId: "a1000000-0000-4000-8000-0000000000ee" }],
        ["mismatched factVersion", ANS_EV, { factVersion: 2 }],
        ["mismatched factKind", ANS_EV, { factKind: "hours" }],
        ["missing row", ANS_EV, { factRowId: "b2000000-0000-4000-8000-0000000000ff" }],
        ["foreign row (points at another fact)", ANS_EV, { factRowId: foreignFact.id }],
        [
          "dated-unresolved (out_of_period)",
          [{ kind: "answer", id: early }],
          { captureEvidenceId: early },
        ],
      ];
    let seq = 0;
    for (const [label, evidence, over] of hidden) {
      seq += 1;
      const view = await readCase(
        `60000000-0000-4000-8000-0000000009${String(seq).padStart(2, "0")}`,
        evidence,
        over,
      );
      const whole = JSON.stringify(view);
      expect(whole, label).not.toContain("SECRET-FACT-9931");
      expect(whole, label).not.toContain("FOREIGN-SECRET-5522");
      // Any emitted fact entry is truthfully unavailable — never a private value.
      expect(
        view.facts.every((x) => x.value === null),
        label,
      ).toBe(true);
    }
    // POSITIVE: a genuinely RESOLVED pin shows the selected fact — and only it (the foreign fact never appears).
    const okView = await readCase("60000000-0000-4000-8000-0000000000f0", ANS_EV, {});
    expect(okView.facts).toEqual([
      expect.objectContaining({
        factRowId: secretFact.id,
        available: true,
        kind: "price",
        value: SECRET,
      }),
    ]);
    expect(JSON.stringify(okView)).not.toContain("FOREIGN-SECRET-5522");
  });
});
describe("native artifact deletion propagates the evidence-forget policy (finding 4061786099)", () => {
  const rawSubmitN = async (
    actor: string,
    row: string,
    sha: string,
    decision = "approved",
    note: string | null = null,
  ) => {
    try {
      await db.query("SELECT public.save_ai_citation_finding_review($1,$2,'p',$3,$4,$5,$6)", [
        actor,
        user,
        row,
        sha,
        decision,
        note,
      ]);
      return "ok";
    } catch (e) {
      return (e as Error).message;
    }
  };
  const erasedOf = async (rowId: string) =>
    (
      await db.query<{ e: string | null }>(
        "SELECT evidence_erased_at::text e FROM ai_citation_findings WHERE id=$1",
        [rowId],
      )
    ).rows[0].e;
  const maskedN = async (rowId: string) =>
    (
      await db.query<{ m: boolean }>(
        "SELECT public.citation_finding_review_digest_masked($1,'p',$2) m",
        [user, rowId],
      )
    ).rows[0].m;
  // A finding citing a native artifact, created through the RPC so a native-only shape (which isolates native
  // masking from any source/answer confounder) is stored exactly as it would live.
  const nativeFinding = async (fid: string, nativeId: string | null, observation: string) => {
    const base = finding(fid, "accepted", { evidence: [{ kind: "native", id: "x" }] });
    const saved = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: {
        ...base,
        observation,
        evidence: nativeId === null ? [{ kind: "native" }] : [{ kind: "native", id: nativeId }],
      },
      p_scope: panelScope,
    });
    if (saved.error) throw saved.error;
    return (saved.data as { id: string }).id;
  };
  const seedOtherNative = (id: string) =>
    db.query(
      "INSERT INTO ai_native_report_artifacts(user_id,project_id,id,scope_key,artifact_sha256,byte_length,bytes,metadata,actor_id) VALUES($1::uuid,'p',$2::uuid,'sk2',$3::text,1,'\\x00'::bytea,'{}'::jsonb,$1::uuid)",
      [user, id, "e".repeat(64)],
    );
  it("erases a finding citing a DELETED native artifact — prose/digest/notes hidden on both reviewer routes, owner retention, new reviews blocked, no digest oracle (finding 4061786099)", async () => {
    const OBS_SECRET = "OBS-SECRET-NTV: the deleted native report measured a private 42% lift.";
    const NOTE_SECRET = "NOTE-SECRET-NTV: this note quotes the deleted native report.";
    await seedNative();
    const row = await nativeFinding("60000000-0000-4000-8000-000000000060", NATIVE, OBS_SECRET);
    // While the artifact is PRESENT the finding is visible (native present -> NOT masked) though non-inspectable.
    expect(await maskedN(row)).toBe(false);
    const before = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(before.evidenceErased).toBe(false);
    expect(before.evidence.find((x) => x.kind === "native")?.inspectable).toBe(false);
    const receipt = await submit(reviewer, row, before.recordSha256!, "approved", NOTE_SECRET);
    // Delete the native artifact via the REAL released RPC -> the AFTER DELETE trigger propagates erasure.
    expect(
      (
        await rpc("remove_ai_native_report_artifact", {
          p_user: user,
          p_project: "p",
          p_id: NATIVE,
        })
      ).error,
    ).toBeNull();
    expect(await erasedOf(row)).not.toBeNull();
    expect(await maskedN(row)).toBe(true);
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.record).toBeNull();
    expect(view.recordSha256).toBeNull();
    expect(view.reviews[0].note).toBeNull();
    expect(view.reviews[0].recordSha256).toBeNull();
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("OBS-SECRET-NTV");
    expect(whole).not.toContain("NOTE-SECRET-NTV");
    // The standalone reviewer receipt list masks the note + digest too.
    const rlist = await readCitationFindingReviews(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(rlist.reviews[0].note).toBeNull();
    expect(rlist.reviews[0].recordSha256).toBeNull();
    // The OWNER retains the prose; the note is storage-erased to the content-free marker (decision kept).
    expect(JSON.stringify(await getCitationFinding(scope, row, rpc))).toContain("OBS-SECRET-NTV");
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(ownerList.reviews[0].note).toBe("[redacted: finding evidence forgotten]");
    expect(ownerList.reviews[0].decision).toBe("approved");
    const stored = await db.query<{ n: string | null; o: string }>(
      "SELECT (SELECT note FROM ai_citation_finding_reviews WHERE id=$2) n, (record->>'observation') o FROM ai_citation_findings WHERE id=$1",
      [row, receipt.id],
    );
    expect(stored.rows[0].n).toBe("[redacted: finding evidence forgotten]");
    expect(stored.rows[0].o).toBe(OBS_SECRET);
    // A new review is blocked: a wrong hash and the finding's REAL stored digest raise the SAME unavailable error
    // (no stale-vs-success oracle for the hidden digest), and NO new receipt is written.
    const storedSha = (
      await db.query<{ s: string }>(
        "SELECT record_sha256 s FROM ai_citation_findings WHERE id=$1",
        [row],
      )
    ).rows[0].s;
    for (const sha of ["c".repeat(64), storedSha])
      expect(await rawSubmitN(reviewer, row, sha)).toMatch(/citation_finding_unavailable/);
    expect(await rawSubmitN(reviewer, row, storedSha, "approved", "new note")).toMatch(
      /citation_finding_unavailable/,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_finding_reviews WHERE finding_row_id=$1 AND note='new note'",
          [row],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("blocks native-erased resurrection at save, isolates an unrelated surviving artifact, masks missing/malformed/null native refs without a cast crash, and survives a project delete (finding 4061786099)", async () => {
    await seedNative(); // NATIVE
    const OTHER = "d0000000-0000-4000-8000-0000000000a1";
    await seedOtherNative(OTHER);
    const survivingRow = await nativeFinding(
      "60000000-0000-4000-8000-000000000061",
      OTHER,
      "unrelated",
    );
    // Delete NATIVE; the finding citing the SURVIVING OTHER artifact is untouched (semantic-uuid scoped).
    await rpc("remove_ai_native_report_artifact", { p_user: user, p_project: "p", p_id: NATIVE });
    expect(await erasedOf(survivingRow)).toBeNull();
    expect(await maskedN(survivingRow)).toBe(false);
    // A FRESH finding citing the now-deleted NATIVE is erased at save (resurrection blocked via the marker).
    const freshRow = await nativeFinding(
      "60000000-0000-4000-8000-000000000062",
      NATIVE,
      "FRESH-SECRET-NTV quotes the deleted native.",
    );
    expect(await erasedOf(freshRow)).not.toBeNull();
    const freshView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: freshRow },
      rpc,
    );
    expect(freshView.evidenceErased).toBe(true);
    expect(JSON.stringify(freshView)).not.toContain("FRESH-SECRET-NTV");
    await expect(submit(reviewer, freshRow, "a".repeat(64), "approved", "x")).rejects.toThrow();
    // A MALFORMED id, a MISSING (never-existent uuid) artifact, and a NULL id all fail CLOSED to masked with NO
    // cast crash (the non-uuid/null id never reaches ::uuid).
    const malformedRow = await nativeFinding(
      "60000000-0000-4000-8000-000000000063",
      "not-a-uuid-native",
      "m",
    );
    const missingRow = await nativeFinding(
      "60000000-0000-4000-8000-000000000064",
      "d0000000-0000-4000-8000-0000000000ff",
      "m2",
    );
    const nullRow = await nativeFinding("60000000-0000-4000-8000-000000000065", null, "m3");
    expect(await maskedN(malformedRow)).toBe(true);
    expect(await maskedN(missingRow)).toBe(true);
    expect(await maskedN(nullRow)).toBe(true);
    // A whole-project delete cascades findings + native artifacts + markers cleanly (the redactor's project-exists
    // guard skips, so no orphaned marker / FK 23503).
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_native_erasures WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows[0].n,
    ).toBe(0);
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
  it("BLOCKS a new review on a finding citing a MALFORMED or missing source id — the reviewer read masks it, and a wrong hash, a valid-format guess, AND the finding's REAL stored digest all raise the SAME unavailable error (no oracle, no receipt); a valid active source is unaffected (finding 4061393769)", async () => {
    const masked = async (rowId: string) =>
      (
        await db.query<{ m: boolean }>(
          "SELECT public.citation_finding_review_digest_masked($1,'p',$2) m",
          [user, rowId],
        )
      ).rows[0].m;
    // POSITIVE — independent inspectability is not weakened: a finding citing a VALID ACTIVE source is NOT masked,
    // so the reviewer gets the real digest and a NEW receipt is written.
    await seedSource("active", SOURCE);
    const okF = await saveF("60000000-0000-4000-8000-000000000053", "accepted", {
      evidence: [{ kind: "source", id: SOURCE }],
    });
    expect(await masked(okF.id)).toBe(false);
    const okSha = await shaFor(okF.id);
    expect(okSha).toMatch(/^[a-f0-9]{64}$/);
    expect((await submit(reviewer, okF.id, okSha, "approved")).recordSha256).toBe(okSha);
    // (1) A SCHEMA-VALID MALFORMED source id (evidence.id is free text(200)) that resolves to NO active row is
    // MASKED — previously it was silently skipped by the uuid-guarded IF and left un-masked.
    const badF = await saveF("60000000-0000-4000-8000-000000000054", "accepted", {
      evidence: [{ kind: "source", id: "not-a-uuid-source" }],
    });
    expect(await masked(badF.id)).toBe(true);
    // The reviewer read treats it as missing exactly as the digest gate now does: prose withheld, digest null,
    // NOT erased — so the read, the receipt surface, and the review-save gate all agree.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: badF.id },
      rpc,
    );
    expect(view.evidenceErased).toBe(false);
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(view.recordSha256).toBeNull();
    expect(view.record).toBeNull();
    // (2) A HISTORICAL missing-id source (straight through the RPC, bypassing the client's non-empty id) fails
    // CLOSED to masked WITHOUT a cast crash (the null id never reaches ::uuid).
    const nullSaved = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: {
        ...finding("60000000-0000-4000-8000-000000000055", "accepted", {
          evidence: [{ kind: "source", id: SOURCE }],
        }),
        evidence: [{ kind: "source" }],
      },
      p_scope: panelScope,
    });
    if (nullSaved.error) throw nullSaved.error;
    const nullRow = (nullSaved.data as { id: string }).id;
    expect(await masked(nullRow)).toBe(true);
    // The finding's REAL stored digest (owner-side; the reviewer never sees it — masked to null above).
    const badStored = (
      await db.query<{ s: string }>(
        "SELECT record_sha256 s FROM ai_citation_findings WHERE id=$1",
        [badF.id],
      )
    ).rows[0].s;
    // Delete the owner's workspace_meta so the lock fails closed if ever reached — proving the rejection is pre-lock.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    // A wrong hash, a valid-format guess, AND the finding's REAL stored digest ALL raise the SAME unavailable error
    // BEFORE the hash compare / idempotency / lock — so the withheld digest is never a stale-vs-success oracle.
    for (const sha of ["b".repeat(64), VALID_SHA, badStored])
      expect(await rawSubmit(reviewer, badF.id, sha)).toMatch(/citation_finding_unavailable/);
    // An identical retry cannot unmask via idempotency; the historical missing-id finding likewise fails closed.
    expect(await rawSubmit(reviewer, badF.id, badStored, "approved", null)).toMatch(
      /citation_finding_unavailable/,
    );
    expect(await rawSubmit(reviewer, nullRow, VALID_SHA)).toMatch(/citation_finding_unavailable/);
    // NO reviewer receipt was created on either masked finding (only the valid-source positive above wrote one).
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_finding_reviews WHERE finding_row_id IN ($1,$2)",
          [badF.id, nullRow],
        )
      ).rows[0].n,
    ).toBe(0);
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
  it("keeps a PREVIOUSLY owner_attested improvement capped once its version is dissented and then SUPERSEDED by a genuinely distinct accepted successor (no delete) — a dissent is sticky to the logical finding and only its reviewer can clear it (finding 4060794798)", async () => {
    await setMember(reviewer2, "reviewer");
    const fid = "60000000-0000-4000-8000-000000000026";
    const impId = "70000000-0000-4000-8000-000000000026";
    const f1 = await saveF(fid, "accepted");
    // f1 is INDEPENDENTLY REVIEWED (reviewer A approves, inspection-complete), and a bound improvement is genuinely
    // owner_attested FIRST — the attestation exists before any dissent.
    await submit(reviewer, f1.id, await shaFor(f1.id), "approved");
    const imp = await attestedImprovement(fid, impId);
    expect(imp.verificationStatus).toBe("owner_attested");
    // Reviewer B THEN DISSENTS on that exact version -> the finding reads independent_dissent and the previously
    // attested improvement drops to connector_receipt (an approval never overrides a live dissent).
    const dissent = await submit(
      reviewer2,
      f1.id,
      await shaFor(f1.id),
      "needs_changes",
      "Not accurate.",
    );
    expect(await reviewStatusOf(f1.id)).toBe("independent_dissent");
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "connector_receipt",
    );
    // The owner inserts a GENUINELY DISTINCT accepted successor (an altered record via the real save path, so
    // production idempotency stands — an identical re-save would just dedup back to f1). It SUPERSEDES f1 with NO
    // delete, gets a new row id and version, and — carrying no receipts and no second-review decision — reads
    // owner_only ON ITS OWN...
    const f2 = await saveF(fid, "accepted", {
      observation: "The answer still cites a competitor but not this business (rechecked).",
    });
    expect(f2.supersedesId).toBe(f1.id);
    expect(f2.id).not.toBe(f1.id);
    expect(await reviewStatusOf(f2.id)).toBe("owner_only");
    // ...while the dissented f1 SURVIVES with its live receipt (nothing was deleted, so NO tombstone was created —
    // exactly the gap the delete-tombstone path never covers). Read the superseded row directly (the finding list
    // surfaces only the head); its own row-scoped status is still independent_dissent.
    expect((await getCitationFinding(scope, f1.id, rpc)).reviewStatus).toBe("independent_dissent");
    // (1) OLD PINNED: the stored improvement still pins f1 and must NOT silently regain owner_attested.
    const existing = await getCitationImprovement(scope, imp.id, rpc);
    expect(existing.boundFindingRowIds).toEqual([f1.id]);
    expect(existing.verificationStatus).toBe("connector_receipt");
    // (2) EXPLICIT REBIND: re-attesting now REBINDS to the accepted successor f2, but the logical finding's
    // still-live dissent caps it just the same — supersession cannot launder a standing rejection.
    const rebound = await attestedImprovement(fid, impId);
    expect(rebound.verificationStatus).toBe("connector_receipt");
    // Re-attesting re-pins to the successor: read the NEW improvement version's own row (rebound.id, a v2 that
    // supersedes the v1 still pinned to f1 above) to confirm it bound to f2 yet is still capped.
    const reboundRead = await getCitationImprovement(scope, rebound.id, rpc);
    expect(reboundRead.boundFindingRowIds).toEqual([f2.id]);
    expect(reboundRead.verificationStatus).toBe("connector_receipt");
    // ISOLATION: an unrelated finding (no dissent) is entirely unaffected and attests normally meanwhile.
    const other = await saveF("60000000-0000-4000-8000-000000000027", "accepted");
    expect(other.supersedesId).toBeNull();
    expect(
      (
        await attestedImprovement(
          "60000000-0000-4000-8000-000000000027",
          "70000000-0000-4000-8000-000000000027",
        )
      ).verificationStatus,
    ).toBe("owner_attested");
    // POSITIVE — only the ACTUAL reviewer can clear the dissent (never the owner, never through supersession). A
    // legitimate withdrawal removes the standing objection, and the accepted current head is then a proper basis
    // that reaches owner_attested — so the cap is never a permanent blanket block on correction.
    await removeCitationFindingReview(
      reviewer2,
      { ownerId: user, projectId: "p", id: dissent.id },
      rpc,
    );
    expect(await reviewStatusOf(f2.id)).toBe("owner_only");
    expect((await attestedImprovement(fid, impId)).verificationStatus).toBe("owner_attested");
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
      selected?: {
        sourceId: string;
        recordId: string;
        sourceRevision: number;
        recordRevision: number;
      } | null;
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
        // Default SELECTED-EVIDENCE pin to RECORD at revision 1 (seeded by the inspectability/attestation tests);
        // `selected: null` omits it (recorded-only), or a test overrides the pin for a co-cited source.
        selectedRecord:
          opts.selected === undefined
            ? {
                sourceId: opts.source ?? SOURCE,
                recordId: RECORD,
                sourceRevision: 1,
                recordRevision: 1,
              }
            : opts.selected,
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
    // The whole record is withheld from the reviewer on erasure (record null); the owner retains the redacted copy.
    expect(view.record).toBeNull();
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
  it("withholds the free-text observation from the reviewer after a SOURCE forget while the owner retains it, leaving an unrelated finding's prose intact (finding 4059648507)", async () => {
    const OBS_SECRET =
      "OBSERVATION-SECRET-4K9Z: the forgotten source page quoted the private rate.";
    await seedSource("active", SOURCE);
    await seedSource("active", SOURCE2);
    const fid = "60000000-0000-4000-8000-0000000000f8";
    const row = await saveRaw(sourceFinding(fid, { observation: OBS_SECRET }));
    const unrelated = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000f9", {
        source: SOURCE2,
        observation: "Unrelated visible prose.",
      }),
    );
    expect((await forget("source", SOURCE)).error).toBeNull();
    // The reviewer never receives the free-text observation (it may quote the forgotten source); the secret is
    // absent from the whole response.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.record).toBeNull();
    expect(JSON.stringify(view)).not.toContain("SECRET-4K9Z");
    // The OWNER retains the real observation in storage (honest retention; the reviewer withholding is response-only).
    expect(JSON.stringify(await getCitationFinding(scope, row, rpc))).toContain("SECRET-4K9Z");
    // An unrelated finding (different, still-active source) is unaffected — its prose stays visible to the reviewer.
    const unrelatedView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: unrelated },
      rpc,
    );
    expect(unrelatedView.evidenceErased).toBe(false);
    expect(unrelatedView.record!.observation).toBe("Unrelated visible prose.");
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
  it("downgrades owner_attested when the bound source's revision advances past the selected record, and a replacement record at the new revision does NOT revalidate the stale pin (finding 4059944844)", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    const fid = "60000000-0000-4000-8000-0000000000e2";
    await saveRaw(sourceFinding(fid)); // default pin: SOURCE / RECORD / sourceRevision 1
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000e2");
    expect(imp.verificationStatus).toBe("owner_attested");
    // Source stays active but advances to revision 2; the pinned record RECORD is bound to revision 1, so the
    // selected-evidence pin no longer resolves at the CURRENT revision → not inspectable → owner_attested forfeited.
    await db.query(
      "UPDATE project_knowledge_sources SET revision=2 WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, SOURCE],
    );
    // A brand-new replacement record appears at revision 2 — but the stale pin targets RECORD at revision 1, so it
    // must NOT resurrect eligibility for the old unbound passage.
    await seedRecord(
      "b1000000-0000-4000-8000-0000000000e2",
      SOURCE,
      2,
      "Replacement at revision 2.",
    );
    const reread = await getCitationImprovement(scope, imp.id, rpc);
    expect(reread.verificationStatus).toBe("connector_receipt");
  });
  it("downgrades owner_attested when the SELECTED record is mutated IN PLACE via the real save_project_knowledge (r.revision bumped under the same sourceRevision); a fresh finding can pin the new revision, unrelated record untouched (finding 4059944844)", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "ORIGINAL selected value (record revision 1).");
    await seedRecord(RECORD2, SOURCE, 1, "UNRELATED record - must stay untouched.");
    const fid = "60000000-0000-4000-8000-0000000000ea";
    const row = await saveRaw(sourceFinding(fid)); // default pin SOURCE / RECORD / sourceRevision 1 / recordRevision 1
    await submit(reviewer, row, await shaFor(row), "approved");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000ea");
    expect(imp.verificationStatus).toBe("owner_attested");
    // Mutate the SELECTED record IN PLACE through the REAL released save_project_knowledge: same source id and
    // sourceRevision, but the record's OWN revision increments 1 -> 2 and its value changes.
    const saved = await rpc("save_project_knowledge", {
      p_user: user,
      p_project: "p",
      p_kind: "record",
      p_id: RECORD,
      p_expected: 1,
      p_payload: {
        ownerId: user,
        projectId: "p",
        id: RECORD,
        revision: 2,
        sourceId: SOURCE,
        sourceRevision: 1,
        key: "k1",
        category: "fact",
        appliesTo: "text",
        value: "MUTATED-SELECTED-VALUE (record revision 2).",
        locator: "Services > Pricing",
        status: "accepted",
        reviewedAt: "2024-02-03T00:00:00Z",
        updatedAt: "2024-02-03T00:00:00Z",
      },
    });
    expect(saved.error).toBeNull();
    // The record advanced to revision 2, so the old finding's recordRevision-1 pin no longer resolves: it cannot
    // inspect the changed payload, the changed value is NEVER served, and the attestation downgrades.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    if (src.kind === "source") expect(src.materialCount).toBe(0);
    expect(JSON.stringify(view)).not.toContain("MUTATED-SELECTED-VALUE");
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "connector_receipt",
    );
    // A FRESH finding that explicitly selects the NEW revision resolves and inspects the current material.
    const fresh = await saveRaw(
      sourceFinding("60000000-0000-4000-8000-0000000000eb", {
        selected: { sourceId: SOURCE, recordId: RECORD, sourceRevision: 1, recordRevision: 2 },
      }),
    );
    const freshView = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: fresh },
      rpc,
    );
    expect(freshView.inspectionComplete).toBe(true);
    const freshSrc = freshView.evidence.find((e) => e.kind === "source")!;
    if (freshSrc.kind === "source") {
      expect(freshSrc.materialCount).toBe(1);
      expect(freshSrc.material[0]?.value).toContain("MUTATED-SELECTED-VALUE");
    }
    // The UNRELATED record is untouched — same value, still revision 1.
    const other = await db.query<{ v: string; rev: number }>(
      "SELECT payload->>'value' v, revision rev FROM project_knowledge_records WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, RECORD2],
    );
    expect(other.rows[0]).toMatchObject({ v: "UNRELATED record - must stay untouched.", rev: 1 });
  });
  it("downgrades owner_attested when the selected record's validUntil PASSES (expiry via now), without rewriting the finding's pin or hash (finding 4060770032)", async () => {
    await seedApproval();
    await seedPublication();
    await seedSource("active", SOURCE);
    // A currently-valid accepted record that expires far in the future (so it attests now).
    await db.query(
      "INSERT INTO project_knowledge_records(user_id,project_id,id,source_id,revision,payload) VALUES($1::uuid,'p',$2::uuid,$3::uuid,1,jsonb_build_object('ownerId',$1::text,'projectId','p','id',$2::text,'revision',1,'sourceId',$3::text,'sourceRevision',1,'key','k1','category','fact','appliesTo','text','value','Massage from 500 SEK.','locator','Services > Pricing','status','accepted','updatedAt','2024-02-02T00:00:00Z','reviewedAt','2024-02-02T01:00:00Z','validUntil','2999-01-01T00:00:00Z'))",
      [user, RECORD, SOURCE],
    );
    const fid = "60000000-0000-4000-8000-0000000000ec";
    const row = await saveRaw(sourceFinding(fid)); // default pin SOURCE / RECORD / sourceRevision 1 / recordRevision 1
    await submit(reviewer, row, await shaFor(row), "approved");
    const imp = await attestedImprovement(fid, "70000000-0000-4000-8000-0000000000ec");
    expect(imp.verificationStatus).toBe("owner_attested");
    const before = await db.query<{ s: string; pin: string | null }>(
      "SELECT record_sha256 s, (record->'support'->0->'selectedRecord'->>'recordRevision') pin FROM ai_citation_findings WHERE id=$1",
      [row],
    );
    // Time passes the validUntil — simulated by moving it into the PAST. The record revision is unchanged, so the
    // finding's selectedRecord pin still matches; only current validity changes (now() > validUntil → expired).
    await db.query(
      "UPDATE project_knowledge_records SET payload=jsonb_set(payload,'{validUntil}','\"2024-03-01T00:00:00Z\"') WHERE user_id=$1 AND project_id='p' AND id=$2",
      [user, RECORD],
    );
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.inspectionComplete).toBe(false);
    const src = view.evidence.find((e) => e.kind === "source")!;
    if (src.kind === "source") expect(src.materialCount).toBe(0);
    expect((await getCitationImprovement(scope, imp.id, rpc)).verificationStatus).toBe(
      "connector_receipt",
    );
    // The finding's stored pin AND content hash are untouched by the expiry — nothing was rewritten.
    const after = await db.query<{ s: string; pin: string | null }>(
      "SELECT record_sha256 s, (record->'support'->0->'selectedRecord'->>'recordRevision') pin FROM ai_citation_findings WHERE id=$1",
      [row],
    );
    expect(after.rows[0].s).toBe(before.rows[0].s);
    expect(after.rows[0].pin).toBe("1");
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
    // Forget the PINNED record; the OTHER record survives but is NOT the selected (pinned) one, so the pin no
    // longer resolves, and the finding's evidence is erased — every CURRENT status path honors that.
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
    // Only SELECTED records are served (finding 4059944844); a revoked source resolves none, so its material is
    // empty — its records are never served.
    if (rev.kind === "source") {
      expect(rev.materialCount).toBe(0);
      expect(rev.material).toEqual([]);
    }
    // The co-cited ACTIVE source stays inspectable — its ONE pinned selected record is served, nothing else.
    const act = view.evidence.find((e) => e.kind === "source" && e.id === SOURCE)!;
    expect(act.kind === "source" && act.inspectable).toBe(true);
    if (act.kind === "source") {
      expect(act.materialCount).toBe(1);
      expect(act.material[0]?.recordId).toBe(RECORD);
    }
    // The revoked source's distinctive LIVE value/excerpt never appear ANYWHERE in the reviewer response — its
    // records are never served, and the copied-field path (support[].sourcePassage) carries only the
    // owner-authored passage, not the live records.
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("DISTINCTIVE-REVOKED-VALUE");
    expect(whole).not.toContain("DISTINCTIVE-REVOKED-EXCERPT");
    // Revocation is NOT erasure — but because a cited source is revoked, this reviewer response conservatively
    // WITHHOLDS the owner's copied support passage too (the copied-field boundary; asserted in full by the next
    // test). The finding is not evidence-erased, the withholding is flagged, and the owner's stored copy stays.
    expect(view.record).toBeNull();
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
        selected: { sourceId: ACTSRC, recordId: RECORD, sourceRevision: 1, recordRevision: 1 },
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
    expect((before.record!.support[0] as { sourcePassage: string | null }).sourcePassage).toBe(
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
    // The reviewer response withholds the WHOLE record (masked -> record null) + flags it; the secret appears
    // NOWHERE in the response.
    expect(view.record).toBeNull();
    expect(view.sourcePassagesWithheld).toBe(true);
    expect(JSON.stringify(view)).not.toContain(SECRET);
    // It is NOT erasure, and the co-cited ACTIVE source stays inspectable — its ONE pinned selected record is served.
    expect(view.evidenceErased).toBe(false);
    const act = view.evidence.find((e) => e.kind === "source" && e.id === ACTSRC)!;
    expect(act.kind === "source" && act.inspectable).toBe(true);
    if (act.kind === "source") expect(act.materialCount).toBe(1);
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
    expect(view.record).toBeNull();
    expect(JSON.stringify(view)).not.toContain("SECRET-STATUSLESS-PASSAGE-do-not-leak");
    // The digest is masked too (unified with citation_finding_review_digest_masked), closing the oracle.
    expect(view.recordSha256).toBeNull();
    // Not an erasure: the owner's stored copy is retained.
    expect(view.evidenceErased).toBe(false);
    expect(await storedPassage(row)).toBe("SECRET-STATUSLESS-PASSAGE-do-not-leak");
  });
  it("stamps a PASSAGE-FREE finding erased on a real record forget (source kept alive), withholding its free prose + note from the reviewer while the owner retains them, unrelated source untouched (finding 4059905627)", async () => {
    const OBS = "OBS-SECRET-9W7: the deleted record listed the private 999 cancellation fee.";
    const HYP = "HYP-SECRET-9W7: a hypothesis paraphrasing the forgotten record.";
    const REASON = "REASON-SECRET-9W7: a reason quoting the forgotten record text.";
    const NOTE = "NOTE-SECRET-9W7: a reviewer note quoting the forgotten record verbatim.";
    await seedSource("active", SOURCE);
    await seedRecord(RECORD, SOURCE, 1, "Massage from 500 SEK.");
    await seedRecord(RECORD2, SOURCE, 1, "Open Mon-Sat."); // a SECOND record keeps SOURCE alive after forgetting RECORD
    await seedSource("active", SOURCE2);
    // A finding citing SOURCE with NO copied sourcePassage — only free prose (observation / hypothesis /
    // support[].reason) that may quote the forgotten record. The single support entry is status "not_checked",
    // which the schema requires to carry a NULL sourcePassage, so this is the passage-free-yet-schema-valid shape.
    const rec = (fid: string, obs: string) => ({
      findingId: fid,
      family: "citation_source" as const,
      evidence: [{ kind: "source" as const, id: SOURCE }],
      entityMatch: "confirmed" as const,
      capture: { answerComplete: true, citationsComplete: true },
      observation: obs,
      hypothesis: HYP,
      competitorCited: true,
      ownCited: false,
      recommendation: null,
      support: [
        {
          claimSpan: "It says massage from 500 SEK.",
          citedUrl: "https://acme.example/services",
          answerCapturedAt: ACC_CAP,
          status: "not_checked" as const,
          sourcePassage: null,
          sourceCapturedAt: null,
          reason: REASON,
          review: null,
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
    const fid = "60000000-0000-4000-8000-0000000000fa";
    const v1 = await saveRaw(rec(fid, OBS));
    const v2 = await saveRaw(
      rec(fid, "OBS-SECRET-9W7 (revised): still quoting the forgotten record."),
    );
    // An unrelated finding citing a DIFFERENT active source, with its own clean prose, must stay fully visible.
    const unrelated = await saveRaw({
      ...rec("60000000-0000-4000-8000-0000000000fb", "Unrelated visible prose."),
      evidence: [{ kind: "source" as const, id: SOURCE2 }],
      hypothesis: "Unrelated visible hypothesis.",
      support: [
        {
          claimSpan: "Unrelated claim.",
          citedUrl: "https://acme.example/other",
          answerCapturedAt: ACC_CAP,
          status: "not_checked" as const,
          sourcePassage: null,
          sourceCapturedAt: null,
          reason: "Unrelated visible reason.",
          review: null,
        },
      ],
    });
    // The reviewer approves v2 while everything is live, recording a NOTE that quotes the forgotten record.
    await submit(reviewer, v2, await shaFor(v2), "approved", NOTE);
    // A REAL record forget: RECORD is deleted, SOURCE stays alive (RECORD2 remains). No copied passage exists.
    expect((await forget("record", RECORD)).error).toBeNull();
    // BOTH versions are now evidence-erased — the stamp is no longer gated on a copied passage being present.
    const erasedOf = async (rowId: string) =>
      (
        await db.query<{ e: string | null }>(
          "SELECT evidence_erased_at::text e FROM ai_citation_findings WHERE id=$1",
          [rowId],
        )
      ).rows[0].e;
    expect(await erasedOf(v1)).not.toBeNull();
    expect(await erasedOf(v2)).not.toBeNull();
    // The reviewer for-review read withholds ALL free prose + the note, masks the digest, and leaks no secret/hash.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: v2 },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    // The whole owner-authored record is withheld from the reviewer on erasure (record null); observation,
    // hypothesis and support[].reason are therefore all gone from the response.
    expect(view.record).toBeNull();
    expect(view.reviews[0].note).toBeNull();
    expect(view.recordSha256).toBeNull();
    const whole = JSON.stringify(view);
    for (const s of ["OBS-SECRET-9W7", "HYP-SECRET-9W7", "REASON-SECRET-9W7", "NOTE-SECRET-9W7"]) {
      expect(whole).not.toContain(s);
    }
    // The standalone reviewer receipt list also hides the note.
    expect(
      (
        await readCitationFindingReviews(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: v2 },
          rpc,
        )
      ).reviews[0].note,
    ).toBeNull();
    // A NEW review on the now-erased finding is refused (no note resurrection via a fresh receipt).
    await expect(submit(reviewer, v2, "a".repeat(64), "approved")).rejects.toThrow();
    // The OWNER retains the free prose (honest retention); the note is erased in storage to the content-free marker.
    expect(JSON.stringify(await getCitationFinding(scope, v2, rpc))).toContain("OBS-SECRET-9W7");
    const stored = await db.query<{
      obs: string;
      hyp: string;
      reason: string;
      note: string | null;
    }>(
      "SELECT (record->>'observation') obs,(record->>'hypothesis') hyp,(record->'support'->0->>'reason') reason,(SELECT note FROM ai_citation_finding_reviews WHERE finding_row_id=$1) note FROM ai_citation_findings WHERE id=$1",
      [v2],
    );
    expect(stored.rows[0].obs).toContain("OBS-SECRET-9W7");
    expect(stored.rows[0].hyp).toBe(HYP);
    expect(stored.rows[0].reason).toBe(REASON);
    expect(stored.rows[0].note).toBe("[redacted: finding evidence forgotten]");
    const ownerList = await readCitationFindingReviews(
      user,
      { ownerId: user, projectId: "p", findingRowId: v2 },
      rpc,
    );
    expect(ownerList.reviews[0].note).toBe("[redacted: finding evidence forgotten]");
    expect(ownerList.reviews[0].decision).toBe("approved");
    // The unrelated finding (different, still-active source) is untouched — its prose stays visible, not erased.
    const uview = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: unrelated },
      rpc,
    );
    expect(uview.evidenceErased).toBe(false);
    expect(uview.record!.observation).toBe("Unrelated visible prose.");
    expect(uview.record!.hypothesis).toBe("Unrelated visible hypothesis.");
  });
  it("stamps EMPTY-, ABSENT-, malformed-array-, and scalar/object/null-support findings erased on a source forget, preserving support byte-for-byte and never crashing on non-array support (findings 4059905627, 4059944844)", async () => {
    await seedSource("active", SOURCE);
    // Insert raw records directly so the odd/historical support shapes are exercised exactly as stored, bypassing
    // any client-side schema — the TRIGGER (not the save path) is what the fix changed, and it must tolerate them.
    const mk = (id: string, sha: string, record: string) =>
      db.query(
        "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1,'p',$2,$2,1,'citation_source','accepted',$3::jsonb,$4,$5,1,'Acme','US',$1,$1)",
        [user, id, record, sha, panelScope.panelId],
      );
    const ev = `[{"kind":"source","id":"${SOURCE}"}]`;
    const emptyId = "60000000-0000-4000-8000-0000000000fc";
    const absentId = "60000000-0000-4000-8000-0000000000fd";
    const malformedId = "60000000-0000-4000-8000-0000000000fe";
    const scalarId = "60000000-0000-4000-8000-0000000000ff";
    const objectId = "60000000-0000-4000-8000-00000000010a";
    const nullId = "60000000-0000-4000-8000-00000000010b";
    await mk(
      emptyId,
      "fc".repeat(32),
      `{"family":"citation_source","evidence":${ev},"observation":"empty-support prose","support":[]}`,
    );
    await mk(
      absentId,
      "fd".repeat(32),
      `{"family":"citation_source","evidence":${ev},"observation":"absent-support prose"}`,
    );
    await mk(
      malformedId,
      "fe".repeat(32),
      `{"family":"citation_source","evidence":${ev},"observation":"malformed-support prose","support":[1,"x",null]}`,
    );
    // Non-array support shapes (scalar / object / explicit JSON null): the redactor's CASE-normalised argument must
    // NOT rely on boolean short-circuit to guard the array expansion — these must stamp erased and never raise.
    await mk(
      scalarId,
      "a1".repeat(32),
      `{"family":"citation_source","evidence":${ev},"observation":"scalar-support prose","support":"oops"}`,
    );
    await mk(
      objectId,
      "a2".repeat(32),
      `{"family":"citation_source","evidence":${ev},"observation":"object-support prose","support":{"k":"v"}}`,
    );
    await mk(
      nullId,
      "a3".repeat(32),
      `{"family":"citation_source","evidence":${ev},"observation":"null-support prose","support":null}`,
    );
    expect((await forget("source", SOURCE)).error).toBeNull();
    const shape = async (id: string) =>
      (
        await db.query<{ e: string | null; sup: string | null }>(
          "SELECT evidence_erased_at::text e,(record->'support')::text sup FROM ai_citation_findings WHERE id=$1",
          [id],
        )
      ).rows[0];
    const empty = await shape(emptyId);
    const absent = await shape(absentId);
    const malformed = await shape(malformedId);
    const scalar = await shape(scalarId);
    const object_ = await shape(objectId);
    const null_ = await shape(nullId);
    // Every citing version is stamped erased regardless of support shape...
    expect(empty.e).not.toBeNull();
    expect(absent.e).not.toBeNull();
    expect(malformed.e).not.toBeNull();
    expect(scalar.e).not.toBeNull();
    expect(object_.e).not.toBeNull();
    expect(null_.e).not.toBeNull();
    // ...and the support is preserved byte-for-byte: empty stays empty, absent stays absent (no fabricated array),
    // malformed/scalar/object/null historical support is left intact (the redactor never crashed on a non-array).
    expect(empty.sup).toBe("[]");
    expect(absent.sup).toBeNull();
    expect(malformed.sup).toBe('[1, "x", null]');
    expect(scalar.sup).toBe('"oops"');
    expect(object_.sup).toBe('{"k": "v"}');
    expect(null_.sup).toBe("null"); // explicit JSON null renders as the text 'null' (distinct from an absent key)
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
  it("erases the answer-derived copies across ALL versions on a real answer remove — masks the reviewer digest + receipt, blocks new reviews, keeps prose for the OWNER while WITHHOLDING it from the reviewer, and leaves a finding citing a different answer intact", async () => {
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
    // The finding is erased: the reviewer read masks the digest + receipt, and NO evidence-derived content
    // appears — including the free-text observation, now WITHHELD on the reviewer surface (finding 4059648507)
    // because it may quote/paraphrase the erased answer.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: v2 },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.recordSha256).toBeNull();
    expect(view.reviews[0].recordSha256).toBeNull();
    expect(view.record).toBeNull();
    const whole = JSON.stringify(view);
    for (const secret of [REC, SUP, ACC]) expect(whole).not.toContain(secret);
    expect(whole).not.toContain("free-analysis prose"); // the reviewer never receives the owner's prose
    // The OWNER detail read shows the structured copies as markers (a forget is a deletion) but RETAINS the
    // owner's own free-text prose — honest owner retention; the reviewer withholding above is response-only.
    const detail = JSON.stringify(await getCitationFinding(scope, v2, rpc));
    for (const secret of [REC, SUP, ACC]) expect(detail).not.toContain(secret);
    expect(detail).toContain("Revised free-analysis prose (a new version).");
    // A NEW review on the erased finding is blocked.
    await expect(submit(reviewer, v2, "a".repeat(64), "approved")).rejects.toThrow();
    // Answer-scoped isolation: the finding citing a DIFFERENT answer keeps its copies.
    const otherRec = await storedRecord(other);
    for (const secret of [REC, SUP, ACC]) expect(otherRec).toContain(secret);
  });
  it("withholds the WHOLE record from a reviewer once the cited answer is deleted — RETAINED answer-derived fields (citedUrl, recommendation.target) cannot be recovered, while the owner keeps its audit copy (finding 4062101980)", async () => {
    // Unique secrets across BOTH the storage-erased answer copies (passage/claimSpans) AND the fields the answer
    // redactor deliberately RETAINS for the owner (recommendation.target, support[].citedUrl) — the exact fields a
    // per-field prose blacklist missed, letting a reviewer added after an answer delete recover them.
    const P = "SECRET-PASSAGE-4L2"; // recommendation.passage — storage-erased by the redactor
    const T = "SECRET-TARGET-4L2"; // recommendation.target — RETAINED (previously leaked to the reviewer)
    const CLAIM = "SECRET-CLAIM-4L2"; // support[].claimSpan — storage-erased
    const URLSECRET = "SECRET-URL-4L2"; // support[].citedUrl — RETAINED (previously leaked)
    const ACCS = "SECRET-ACC-4L2"; // accuracy[].claimSpan — storage-erased
    const OBS = "SECRET-OBS-4L2"; // observation — RETAINED for owner, reviewer-withheld
    const ans = await importReal(ACC_CAP, "The captured answer under review.");
    const rec = {
      ...answerFinding("60000000-0000-4000-8000-000000000f10", ans),
      observation: OBS,
      recommendation: {
        status: "recommended" as const,
        passage: P,
        target: T,
        suitability: "fits" as const,
        review: { reviewer: user, reviewedAt: now },
      },
      support: [
        {
          claimSpan: CLAIM,
          citedUrl: `https://acme.example/${URLSECRET}`,
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
          claimSpan: ACCS,
          factKind: "price" as const,
          status: "not_checked" as const,
          factId: null,
          review: null,
        },
      ],
    };
    const row = await saveRaw(rec);
    const unrelated = await saveRaw(
      answerFinding(
        "60000000-0000-4000-8000-000000000f11",
        await importReal(ACC_CAP, "Unrelated captured answer."),
      ),
    );
    // Delete the cited answer via the REAL released RPC -> the finding is erased.
    expect((await removeAnswer("answer", ans)).error).toBeNull();
    // A reviewer added AFTER the delete: the whole record is withheld (null), so NONE of the secrets — INCLUDING
    // the retained citedUrl / recommendation.target — appear ANYWHERE in the serialized response.
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: row },
      rpc,
    );
    expect(view.evidenceErased).toBe(true);
    expect(view.record).toBeNull();
    const whole = JSON.stringify(view);
    for (const s of [P, T, CLAIM, URLSECRET, ACCS, OBS]) expect(whole, s).not.toContain(s);
    // OWNER audit copy: the redactor storage-erases only the answer-derived passage/claimSpans, so the RETAINED
    // fields (target, citedUrl) and the owner's own prose stay present for the owner (honest retention).
    const owner = await storedRecord(row);
    for (const s of [T, URLSECRET, OBS]) expect(owner, s).toContain(s);
    for (const s of [P, CLAIM, ACCS]) expect(owner, s).not.toContain(s);
    // An UNRELATED valid finding (different, still-live answer) is fully readable — record present, not withheld.
    const uview = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: unrelated },
      rpc,
    );
    expect(uview.record).not.toBeNull();
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
