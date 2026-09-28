/**
 * Candidate migration 20260928120000 (UNAPPLIED): change artifacts → version-bound approval → performed receipt →
 * improvement (v4 explicit change branch) → owner inspection → independent inspection chains, plus the
 * publication actor record and the live v2 projection (`verifiedEligible`). Exercised against PGlite with the
 * REAL migration chain including the PR156 candidate v3. Covers: subject ordering and each subject's own
 * identity/idempotency, secret-field refusal, delegate authority and revocation, loss/retry/stale/ABA, project
 * isolation, deletion audit-only survival, dissent/contradictory inspections (a disputed delivery is NOT
 * eligible although the owner's observation stays visible), withdrawal non-resurrection, unknown/known public
 * performer, listing/configuration binding and downstream eligibility.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveCitationFinding } from "./citation-record.server";
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import { lockedPanelInsert } from "./citation-panel-fixture";
import type { KnowledgeRpc } from "./project-knowledge.server";
import { changeArtifactsStateSchema, inspectionViewSchema } from "./citation-change";
import { citationImprovementDetailSchema } from "./citation-record";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const delegate = "00000000-0000-4000-8000-0000000000a1"; // team reviewer (may approve / perform / inspect)
const inspector2 = "00000000-0000-4000-8000-0000000000a4"; // second team reviewer
const stranger = "00000000-0000-4000-8000-0000000000a9"; // account exists, no membership
const scope = { ownerId: user, projectId: "p" };
const PROMPT = "20000000-0000-4000-8000-000000000001";
const FID = "60000000-0000-4000-8000-000000000001";
const IMP = "70000000-0000-4000-8000-000000000001";
const IMP2 = "70000000-0000-4000-8000-000000000002";
const PUB = "90000000-0000-4000-8000-000000000001";
const TASK = "k3j9x2ab";
const ASSET = "content-asset-1";
const VERSION = "a".repeat(64);
const LIVE = "https://acme.example/services";
const now = "2026-09-19T12:00:00Z";
let ANSWER: string;
let BASELINE: string;
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
/** Direct RPC call: resolves with the JSON result or rejects with Error(<database code>). */
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await rpc(name, args);
  if (r.error) throw new Error(String((r.error as { message?: string }).message ?? "error"));
  return r.data as Record<string, unknown>;
};
const isoAt = async (delta: string) =>
  (
    await db.query<{ t: string }>(
      `SELECT to_char((clock_timestamp() ${delta}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') t`,
    )
  ).rows[0].t;
const finding = () => ({
  findingId: FID,
  family: "citation_source" as const,
  evidence: [{ kind: "answer" as const, id: ANSWER }],
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
  review: { reviewer: user, reviewedAt: now },
  secondReview: null,
  linkedTaskId: null,
});
const LISTING_FIELDS = { openingHours: { before: "Mon–Fri 9–17", after: "Mon–Sat 9–18" } };
const artifact = (over: Record<string, unknown> = {}) =>
  call("save_ai_citation_change_artifact", {
    p_user: user,
    p_project: "p",
    p_kind: "listing",
    p_reference: "google-business-profile:acme-malmo",
    p_fields: LISTING_FIELDS,
    ...over,
  });
/** Approval write with the subject's OWN expected head (R1/2): by default the CURRENT revision is read first (a
 * reviewed decision) and a fresh request identity is minted; pass `expectedRevision`/`requestId` to model a
 * frozen or stale payload. */
const approve = async (
  actor: string,
  artifactId: string,
  sha: string,
  approved = true,
  frozen: { expectedRevision?: number; requestId?: string } = {},
) => {
  const expectedRevision =
    frozen.expectedRevision ??
    Number(
      (
        await call("read_ai_citation_change_approval_provenance", {
          p_user: user,
          p_project: "p",
          p_artifact: artifactId,
        })
      ).currentRevision,
    );
  return call("set_ai_citation_change_approval", {
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_artifact: artifactId,
    p_expected_sha: sha,
    p_approved: approved,
    p_expected_revision: expectedRevision,
    p_request: frozen.requestId ?? crypto.randomUUID(),
  });
};
const provenance = (artifactId: string) =>
  call("read_ai_citation_change_approval_provenance", {
    p_user: user,
    p_project: "p",
    p_artifact: artifactId,
  });
const recordSha = async (rowId: string) =>
  (
    await db.query<{ s: string }>(
      "SELECT record_sha256 s FROM ai_citation_improvements WHERE id=$1",
      [rowId],
    )
  ).rows[0].s;
const receiptState = async (rowId: string, inspector: string) =>
  (
    (await readRow(rowId)).inspections as Array<{
      inspectorId: string;
      version: number;
      effective: boolean;
      ineffectiveReason: string | null;
    }>
  )
    .filter((i) => i.inspectorId === inspector)
    .sort((a, b) => b.version - a.version)[0];
const receipt = (actor: string, artifactId: string, performedAt: string) =>
  call("save_ai_citation_change_receipt", {
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_artifact: artifactId,
    p_performed_at: performedAt,
  });
const changeRecord = (
  art: { artifactSha256: string; reference: string },
  approvedBy: string,
  over: Record<string, unknown> = {},
) => ({
  improvementId: IMP,
  findingIds: [FID],
  taskId: TASK,
  change: {
    description: "Corrected the opening hours on the listing.",
    approvedVersion: art.artifactSha256,
    approvedBy,
    approvedAt: now,
  },
  destination: { kind: "listing", reference: art.reference },
  baselineCaptureIds: [BASELINE],
  verification: null,
  ...over,
});
const saveChange = (
  record: Record<string, unknown>,
  binding: Record<string, unknown>,
  token: { expectedVersion: number | null; expectedHeadId: string | null } = {
    expectedVersion: 0,
    expectedHeadId: null,
  },
  expectedFindings: string[] | null = null,
) =>
  call("save_ai_citation_improvement_v4", {
    p_user: user,
    p_project: "p",
    p_record: record,
    p_scope: panelScope,
    p_binding: null,
    p_change_binding: binding,
    p_expected_version: token.expectedVersion,
    p_expected_head: token.expectedHeadId,
    p_expected_findings: expectedFindings,
  });
const readRow = (id: string, owner = user) =>
  call("read_ai_citation_improvement_v4", { p_user: owner, p_project: "p", p_id: id });
const findingHead = async () =>
  (
    await db.query<{ id: string; version: number }>(
      "SELECT id,version FROM ai_citation_findings WHERE user_id=$1 AND project_id='p' AND finding_id=$2 ORDER BY version DESC LIMIT 1",
      [user, FID],
    )
  ).rows[0];
const seedTeam = async (
  members: Array<[string, string]> = [
    [delegate, "reviewer"],
    [inspector2, "reviewer"],
  ],
) => {
  await db.query(
    "INSERT INTO project_team_approval_policy(owner_id,project_id,mode,revision) VALUES($1::uuid,'p','separate_reviewers',4) ON CONFLICT DO NOTHING",
    [user],
  );
  for (const [actor, role] of members)
    await db.query(
      "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active,expires_at) VALUES($1::uuid,'p',$2::uuid,$3::text,2,true,NULL)",
      [user, actor, role],
    );
};
const seedApproval = (approved: boolean) =>
  db.query(
    "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,updated_at) VALUES($1::uuid,'p',$2::text,'milo-publication-v1',$3::text,$4::boolean,clock_timestamp() - interval '3 hours') ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=$3::text,approved=$4::boolean,updated_at=clock_timestamp() - interval '3 hours'",
    [user, ASSET, VERSION, approved],
  );
const seedPublication = () =>
  db.query(
    "INSERT INTO publication_evidence(user_id,project_id,id,asset_id,version_hash,snapshot,outcome,outcome_data,finished_at) VALUES($1::uuid,'p',$2::uuid,$3::text,$4::text,jsonb_build_object('actionId',$5::text,'assetId',$3::text,'version',$4::text,'markdown','# Approved services page'),'published',$6::jsonb,clock_timestamp() - interval '2 hours')",
    [
      user,
      PUB,
      ASSET,
      VERSION,
      TASK,
      JSON.stringify({
        liveUrl: LIVE,
        externalId: "x",
        publishedAt: "2026-09-19T17:00:00Z",
        verification: "connector_response_only",
      }),
    ],
  );
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
/** A public-URL improvement through the v4 wrapper (delegates to v3), optionally with a positive owner inspection. */
const savePublic = async (
  improvementId: string,
  opts: {
    inspect?: boolean;
    token?: { expectedVersion: number; expectedHeadId: string | null };
  } = {},
) => {
  const observedAt = await isoAt("- interval '1 hour'");
  const record = {
    improvementId,
    findingIds: [FID],
    taskId: TASK,
    change: {
      description: "Added a service page.",
      approvedVersion: VERSION,
      approvedBy: user,
      approvedAt: now,
    },
    destination: { kind: "public_url", reference: LIVE },
    baselineCaptureIds: [BASELINE],
    verification: opts.inspect
      ? {
          method: "owner_inspection",
          receipt: "owner_inspection",
          verifiedAt: observedAt,
          reviewer: user,
        }
      : null,
  };
  const binding = {
    publicationId: PUB,
    assetId: ASSET,
    versionHash: VERSION,
    ownerInspection: opts.inspect
      ? { observedAt, checkResult: "shows_approved_content", observedUrl: LIVE }
      : null,
  };
  return call("save_ai_citation_improvement_v4", {
    p_user: user,
    p_project: "p",
    p_record: record,
    p_scope: panelScope,
    p_binding: binding,
    p_change_binding: null,
    p_expected_version: opts.token?.expectedVersion ?? 0,
    p_expected_head: opts.token?.expectedHeadId ?? null,
    p_expected_findings: null,
  });
};
const inspect = (
  actor: string,
  rowId: string,
  sha: string,
  check: string,
  observedAt: string | null,
  token: { expectedVersion: number; expectedHeadId: string | null } = {
    expectedVersion: 0,
    expectedHeadId: null,
  },
) =>
  call("save_ai_citation_improvement_inspection", {
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_row: rowId,
    p_expected_sha: sha,
    p_check: check,
    p_observed_at: observedAt,
    p_expected_version: token.expectedVersion,
    p_expected_head: token.expectedHeadId,
  });
const grant = (rowId: string, inspector: string) =>
  call("grant_ai_citation_inspection_assignment", {
    p_owner: user,
    p_project: "p",
    p_row: rowId,
    p_inspector: inspector,
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2),($3),($4),($5)", [
    user,
    other,
    delegate,
    inspector2,
    stranger,
  ]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
    "20260910210000_answer_evidence.sql",
    "20260919165000_native_report_artifacts.sql",
    "20260911020000_project_team_reads.sql",
    "20260911060000_project_team_approval_policy.sql",
    "20260920190000_citation_protocol.sql",
    "20260920200000_citation_findings_improvements.sql",
    "20260926190000_citation_scope_binding_versions.sql",
    "20260927190000_citation_improvement_head_guard.sql",
    // The candidate under test, applied last exactly as production would.
    "20260928120000_citation_change_evidence.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  // The released membership-invalidation trigger touches the real scheduler queue table even when it is empty;
  // load exactly its CREATE TABLE so membership revisions can be edited like production does.
  const queue = readFileSync("supabase/migrations/20260719120000_scheduled_publishes.sql", "utf8");
  await db.exec(
    queue.slice(
      queue.indexOf("CREATE TABLE IF NOT EXISTS public.scheduled_publishes ("),
      queue.indexOf("ALTER TABLE public.scheduled_publishes"),
    ),
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;TRUNCATE workspace_entities CASCADE;TRUNCATE project_team_members,project_team_approval_policy CASCADE;",
  );
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
  for (const [userId, projectId] of [
    [user, "p"],
    [user, "q"],
    [other, "p"],
  ] as const)
    await db.query(
      ...lockedPanelInsert({
        userId,
        projectId,
        panelId: panelScope.panelId,
        version: panelScope.panelVersion,
        client: panelScope.client,
      }),
    );
  await saveEvidencePrompt(
    scope,
    PROMPT,
    0,
    {
      prompt: "Where can I book a massage in Malmö?",
      intent: "discovery",
      source: "manual" as const,
      market: "Sweden",
      language: "sv-SE",
      brand: "Acme Massage",
      websiteUrl: "https://acme.example.com/",
      competitorUrls: [] as string[],
      active: true,
    },
    rpc,
  );
  ANSWER = await importReal(
    "2024-03-01T00:00:00Z",
    "Acme Massage in Malmö is a good option to book.",
  );
  BASELINE = await importReal("2024-04-01T00:00:00Z", "Acme Massage in Malmö is worth comparing.");
  await saveCitationFinding(
    scope,
    { scope: panelScope, finding: finding(), expectedVersion: 0, expectedHeadId: null },
    rpc,
  );
  await seedApproval(true);
  await seedPublication();
});
afterAll(async () => {
  await db?.close();
});

describe("subject lifecycle: artifact → approval → performed receipt (own identities, idempotency, secrets refused)", () => {
  it("stores an enumerated non-secret artifact idempotently and refuses unknown/secret fields, credentials in values and unknown kinds", async () => {
    const a = await artifact();
    expect(a).toMatchObject({
      kind: "listing",
      reference: "google-business-profile:acme-malmo",
      createdBy: user,
    });
    expect(String(a.artifactSha256)).toMatch(/^[a-f0-9]{64}$/);
    expect((await artifact()).id).toBe(a.id);
    for (const bad of [
      { p_fields: { apiKey: { after: "x" } } },
      { p_fields: { applicationPassword: { after: "x" } } },
      { p_kind: "configuration", p_fields: { openingHours: { after: "x" } } },
      { p_fields: { website: { after: "https://user:secret@acme.example/" } } },
      { p_fields: { name: { after: "" } } },
      { p_fields: { name: "just a string" } },
      { p_fields: {} },
      { p_kind: "public_url" },
      // R1/1: exact nested shape — an unknown second key (even with `before` absent), a structured value or a
      // non-text `before` are refused, not stored, not returned.
      { p_fields: { openingHours: { after: "09-17", password: "DUMMY_NONSECRET_SENTINEL" } } },
      { p_fields: { openingHours: { before: null, after: "09-17", token: "x" } } },
      { p_fields: { openingHours: { after: { nested: "x" } } } },
      { p_fields: { openingHours: { before: 12, after: "09-17" } } },
      { p_fields: { openingHours: { before: "x" } } },
    ])
      await expect(artifact(bad)).rejects.toThrow("citation_change_unsupported");
    expect(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM ai_citation_change_artifacts"))
        .rows[0].n,
    ).toBe(1);
  });
  it("approval is its own subject: owner approval, identical re-approval keeps the instant, revoke, stale digest, delegate authority and its live revocation", async () => {
    const a = await artifact();
    const sha = String(a.artifactSha256);
    const p1 = await approve(user, String(a.id), sha);
    expect(p1).toMatchObject({ approved: true, approverKind: "owner", approverId: user });
    const p2 = await approve(user, String(a.id), sha);
    expect(p2.approvedAt).toBe(p1.approvedAt);
    await expect(approve(user, String(a.id), "b".repeat(64))).rejects.toThrow(
      "citation_change_stale",
    );
    expect((await approve(user, String(a.id), sha, false)).approved).toBe(false);
    // A team reviewer may approve as a DELEGATE under the same policy predicate; a stranger may not.
    await expect(approve(delegate, String(a.id), sha)).rejects.toThrow("citation_change_forbidden");
    await seedTeam();
    const d = await approve(delegate, String(a.id), sha);
    expect(d).toMatchObject({ approved: true, approverKind: "delegate", approverId: delegate });
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp() + interval '1 day' WHERE id=$1",
      [delegate],
    );
    expect(
      await call("read_ai_citation_change_approval_provenance", {
        p_user: user,
        p_project: "p",
        p_artifact: a.id,
      }),
    ).toMatchObject({ approved: false, approverId: null });
    await db.query("UPDATE auth.users SET banned_until=NULL WHERE id=$1", [delegate]);
    expect(
      (
        await call("read_ai_citation_change_approval_provenance", {
          p_user: user,
          p_project: "p",
          p_artifact: a.id,
        })
      ).approved,
    ).toBe(true);
    await expect(approve(stranger, String(a.id), sha)).rejects.toThrow("citation_change_forbidden");
  });
  it("a performed receipt needs a current approval, a bounded declared instant and an eligible performer; identical declarations are one receipt", async () => {
    const a = await artifact();
    await expect(receipt(user, String(a.id), await isoAt("+ interval '1 second'"))).rejects.toThrow(
      "citation_change_unapproved",
    );
    await approve(user, String(a.id), String(a.artifactSha256));
    const performedAt = await isoAt("+ interval '1 second'");
    await expect(receipt(user, String(a.id), "2020-01-01T00:00:00Z")).rejects.toThrow(
      "citation_change_receipt_invalid",
    );
    await expect(receipt(user, String(a.id), await isoAt("+ interval '1 day'"))).rejects.toThrow(
      "citation_change_receipt_invalid",
    );
    const r1 = await receipt(user, String(a.id), performedAt);
    expect(r1).toMatchObject({ performedBy: user, performerKind: "owner", kind: "listing" });
    expect((await receipt(user, String(a.id), performedAt)).id).toBe(r1.id);
    await expect(receipt(stranger, String(a.id), performedAt)).rejects.toThrow(
      "citation_change_forbidden",
    );
    await seedTeam();
    const r2 = await receipt(delegate, String(a.id), performedAt);
    expect(r2).toMatchObject({ performedBy: delegate, performerKind: "delegate" });
    expect(r2.id).not.toBe(r1.id);
  });
});

describe("v4 explicit change branch: binding, approval reconciliation, owner inspection, retry/head/finding-row guards, isolation", () => {
  const prepared = async (approver = user, performer = user) => {
    const a = await artifact();
    await approve(approver, String(a.id), String(a.artifactSha256));
    const r = await receipt(performer, String(a.id), await isoAt("+ interval '1 second'"));
    return {
      a: a as { id: string; artifactSha256: string; reference: string },
      r: r as { id: string },
    };
  };
  const binding = (
    a: { id: string; artifactSha256: string },
    r: { id: string },
    ownerInspection: unknown = null,
  ) => ({
    artifactId: a.id,
    artifactSha256: a.artifactSha256,
    receiptId: r.id,
    ownerInspection,
  });
  it("binds a listing change to its artifact/approval/receipt with receipt_recorded, reconciles the approver, and refuses mismatches", async () => {
    const { a, r } = await prepared();
    const v1 = await saveChange(changeRecord(a, user), binding(a, r));
    expect(v1).toMatchObject({
      version: 1,
      verificationStatus: "receipt_recorded",
      independentStatus: "none",
      verifiedEligible: false,
      evidenceStatus: "baseline_absent",
    });
    const detail = await readRow(String(v1.id));
    expect(detail.changeBinding).toMatchObject({
      kind: "listing",
      artifactId: a.id,
      receiptId: r.id,
      artifactDeleted: false,
    });
    // Identical frozen payload → the same row (no new version); wrong approver / wrong sha / unknown receipt refused.
    expect((await saveChange(changeRecord(a, user), binding(a, r))).id).toBe(v1.id);
    await expect(
      saveChange(changeRecord(a, delegate), binding(a, r), {
        expectedVersion: 1,
        expectedHeadId: String(v1.id),
      }),
    ).rejects.toThrow("citation_improvement_binding_approval_mismatch");
    await expect(
      saveChange(
        changeRecord({ ...a, artifactSha256: "c".repeat(64) }, user),
        binding({ ...a, artifactSha256: "c".repeat(64) }, r),
        { expectedVersion: 1, expectedHeadId: String(v1.id) },
      ),
    ).rejects.toThrow("citation_improvement_binding_unresolved");
    await expect(
      saveChange(
        changeRecord(a, user),
        binding(a, { id: "90000000-0000-4000-8000-0000000000ee" }),
        { expectedVersion: 1, expectedHeadId: String(v1.id) },
      ),
    ).rejects.toThrow("citation_improvement_binding_unresolved");
    // A public-URL binding never enters the change branch and vice versa.
    await expect(
      call("save_ai_citation_improvement_v4", {
        p_user: user,
        p_project: "p",
        p_record: changeRecord(a, user),
        p_scope: panelScope,
        p_binding: {
          publicationId: PUB,
          assetId: ASSET,
          versionHash: VERSION,
          ownerInspection: null,
        },
        p_change_binding: binding(a, r),
        p_expected_version: 1,
        p_expected_head: v1.id,
        p_expected_findings: null,
      }),
    ).rejects.toThrow("invalid_citation_improvement");
  });
  it("delegate-approved artifact: the record must name the delegate; an owner default is refused", async () => {
    await seedTeam();
    const { a, r } = await prepared(delegate, user);
    await expect(saveChange(changeRecord(a, user), binding(a, r))).rejects.toThrow(
      "citation_improvement_binding_approval_mismatch",
    );
    expect((await saveChange(changeRecord(a, delegate), binding(a, r))).verificationStatus).toBe(
      "receipt_recorded",
    );
  });
  it("owner inspection: positive → owner_attested + verifiedEligible (derived verification block); negative/inconclusive never carry one; a forged verification is refused; head + reviewed-row tokens guard corrections", async () => {
    const { a, r } = await prepared();
    const v1 = await saveChange(changeRecord(a, user), binding(a, r));
    const observedAt = await isoAt("+ interval '2 seconds'");
    const positive = await saveChange(
      changeRecord(a, user, {
        verification: {
          method: "owner_inspection",
          receipt: "x",
          verifiedAt: observedAt,
          reviewer: user,
        },
      }),
      binding(a, r, {
        checkResult: "shows_approved_content",
        observedReference: a.reference,
        observedAt,
      }),
      { expectedVersion: 1, expectedHeadId: String(v1.id) },
      [(await findingHead()).id],
    );
    expect(positive).toMatchObject({
      version: 2,
      verificationStatus: "owner_attested",
      verifiedEligible: true,
      evidenceStatus: "baseline_recorded",
    });
    expect(typeof positive.verifiedAt).toBe("string");
    const stored = await readRow(String(positive.id));
    expect((stored.record as { verification: { method: string } }).verification.method).toBe(
      "owner_inspection",
    );
    // Negative: stored, no verification, not eligible.
    const negative = await saveChange(
      changeRecord(a, user),
      binding(a, r, { checkResult: "does_not_show", observedReference: a.reference, observedAt }),
      { expectedVersion: 2, expectedHeadId: String(positive.id) },
    );
    expect(negative).toMatchObject({
      version: 3,
      verificationStatus: "receipt_recorded",
      verifiedEligible: false,
    });
    // Forged: a verification block backed by a negative inspection.
    await expect(
      saveChange(
        changeRecord(a, user, {
          description: "forged",
          verification: {
            method: "owner_inspection",
            receipt: "x",
            verifiedAt: observedAt,
            reviewer: user,
          },
        }),
        binding(a, r, { checkResult: "inconclusive", observedReference: a.reference, observedAt }),
        { expectedVersion: 3, expectedHeadId: String(negative.id) },
      ),
    ).rejects.toThrow("citation_improvement_verification_unbacked");
    // Stale head token and stale reviewed rows are refused atomically.
    await expect(
      saveChange(
        changeRecord(a, user, {
          change: { ...changeRecord(a, user).change, description: "edited" },
        }),
        binding(a, r),
        { expectedVersion: 1, expectedHeadId: String(v1.id) },
      ),
    ).rejects.toThrow("citation_improvement_version_conflict");
    await expect(
      saveChange(
        changeRecord(a, user, {
          change: { ...changeRecord(a, user).change, description: "edited" },
        }),
        binding(a, r),
        { expectedVersion: 3, expectedHeadId: String(negative.id) },
        ["00000000-0000-4000-8000-0000000000f0"],
      ),
    ).rejects.toThrow("citation_improvement_finding_stale");
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_improvements WHERE improvement_id=$1",
          [IMP],
        )
      ).rows[0].n,
    ).toBe(3);
  });
  it("other owners and other projects see nothing and cannot bind the owner's artifact", async () => {
    const { a, r } = await prepared();
    const v1 = await saveChange(changeRecord(a, user), binding(a, r));
    expect(
      (await call("read_ai_citation_improvements_v4", { p_user: other, p_project: "p" }))
        .improvements,
    ).toEqual([]);
    expect(
      (await call("read_ai_citation_improvements_v4", { p_user: user, p_project: "q" }))
        .improvements,
    ).toEqual([]);
    expect(
      (await call("read_ai_citation_change_artifacts", { p_user: other, p_project: "p" }))
        .artifacts,
    ).toEqual([]);
    await expect(readRow(String(v1.id), other)).rejects.toThrow();
    await expect(
      call("save_ai_citation_improvement_v4", {
        p_user: other,
        p_project: "p",
        p_record: changeRecord(a, other),
        p_scope: panelScope,
        p_binding: null,
        p_change_binding: binding(a, r),
        p_expected_version: 0,
        p_expected_head: null,
        p_expected_findings: null,
      }),
    ).rejects.toThrow("citation_improvement_binding_unresolved");
  });
  it("deleting the artifact removes its content, keeps only audit metadata on dependents and collapses the live status; deleting the row cascades its inspections", async () => {
    const { a, r } = await prepared();
    const v1 = await saveChange(changeRecord(a, user), binding(a, r));
    await call("remove_ai_citation_change_artifact", { p_user: user, p_project: "p", p_id: a.id });
    expect(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM ai_citation_change_artifacts"))
        .rows[0].n,
    ).toBe(0);
    const rc = (
      await db.query<{ reference: string; deleted: boolean; sha: string }>(
        "SELECT reference, artifact_deleted_at IS NOT NULL deleted, artifact_sha256 sha FROM ai_citation_change_receipts WHERE id=$1",
        [r.id],
      )
    ).rows[0];
    expect(rc).toMatchObject({ reference: a.reference, deleted: true, sha: a.artifactSha256 });
    const row = await readRow(String(v1.id));
    expect(row).toMatchObject({ verificationStatus: "unverified", verifiedEligible: false });
    expect(row.changeBinding).toMatchObject({ artifactDeleted: true });
    expect(
      (
        await call("read_ai_citation_change_approval_provenance", {
          p_user: user,
          p_project: "p",
          p_artifact: a.id,
        })
      ).approved,
    ).toBe(false);
    // Row deletion cascades assignments/inspections (nothing dangling, nothing undeletable).
    await seedTeam();
    await grant(String(v1.id), inspector2);
    await call("remove_ai_citation_improvement", { p_user: user, p_project: "p", p_id: v1.id });
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_inspection_assignments",
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

describe("independent inspection chains", () => {
  it("assignment: owner-only grant to an eligible member; self, stranger, the known performer/approver are refused; revocation removes effect live", async () => {
    await seedTeam();
    const a = await artifact();
    await approve(delegate, String(a.id), String(a.artifactSha256));
    const r = await receipt(user, String(a.id), await isoAt("+ interval '1 second'"));
    const v1 = await saveChange(changeRecord(a as never, delegate), {
      artifactId: a.id,
      artifactSha256: a.artifactSha256,
      receiptId: r.id,
      ownerInspection: null,
    });
    await expect(grant(String(v1.id), user)).rejects.toThrow("citation_inspection_invalid");
    await expect(grant(String(v1.id), stranger)).rejects.toThrow("citation_inspection_forbidden");
    await expect(grant(String(v1.id), delegate)).rejects.toThrow(
      "citation_inspection_not_independent",
    ); // the approver
    expect(await grant(String(v1.id), inspector2)).toMatchObject({
      inspectorId: inspector2,
      active: true,
    });
    const view = await call("read_ai_citation_improvement_for_inspection", {
      p_actor: inspector2,
      p_owner: user,
      p_project: "p",
      p_row: v1.id,
    });
    expect(view).toMatchObject({
      kind: "listing",
      destinationReference: a.reference,
      approvedVersion: a.artifactSha256,
      independenceAvailable: true,
      myHead: null,
    });
    expect((view.approvedContent as { fields: unknown }).fields).toEqual(LISTING_FIELDS);
    expect(view).not.toHaveProperty("baselineCaptureIds");
    expect(JSON.stringify(view)).not.toContain(BASELINE);
    await call("revoke_ai_citation_inspection_assignment", {
      p_owner: user,
      p_project: "p",
      p_row: v1.id,
      p_inspector: inspector2,
    });
    await expect(
      call("read_ai_citation_improvement_for_inspection", {
        p_actor: inspector2,
        p_owner: user,
        p_project: "p",
        p_row: v1.id,
      }),
    ).rejects.toThrow("citation_improvement_unavailable");
  });
  it("a positive independent inspection qualifies under the same gates (separately labelled); a disputed delivery is NOT eligible even with a positive owner inspection; withdrawal never resurrects a superseded receipt; a newer positive elsewhere never hides active negative evidence", async () => {
    await seedTeam([
      [delegate, "reviewer"],
      [inspector2, "reviewer"],
      [stranger, "reviewer"],
    ]);
    const a = await artifact();
    await approve(user, String(a.id), String(a.artifactSha256));
    const r = await receipt(user, String(a.id), await isoAt("+ interval '1 second'"));
    const v1 = await saveChange(changeRecord(a as never, user), {
      artifactId: a.id,
      artifactSha256: a.artifactSha256,
      receiptId: r.id,
      ownerInspection: null,
    });
    const sha = String(
      (await readRow(String(v1.id))).expectedSha ??
        (
          await db.query<{ s: string }>(
            "SELECT record_sha256 s FROM ai_citation_improvements WHERE id=$1",
            [v1.id],
          )
        ).rows[0].s,
    );
    await grant(String(v1.id), delegate);
    await grant(String(v1.id), inspector2);
    const t1 = await isoAt("+ interval '2 seconds'");
    // Independent positive (no owner inspection) → eligible, labelled independently_inspected.
    const i1 = await inspect(delegate, String(v1.id), sha, "shows_approved_content", t1);
    expect(i1).toMatchObject({ version: 1, checkResult: "shows_approved_content" });
    let live = await readRow(String(v1.id));
    expect(live).toMatchObject({
      verificationStatus: "receipt_recorded",
      independentStatus: "independently_inspected",
      verifiedEligible: true,
    });
    // Idempotent retry of the same frozen receipt; a stale sha and a stale chain head are refused.
    expect((await inspect(delegate, String(v1.id), sha, "shows_approved_content", t1)).id).toBe(
      i1.id,
    );
    await expect(
      inspect(delegate, String(v1.id), "d".repeat(64), "inconclusive", t1, {
        expectedVersion: 1,
        expectedHeadId: String(i1.id),
      }),
    ).rejects.toThrow("citation_inspection_stale");
    await expect(inspect(delegate, String(v1.id), sha, "inconclusive", t1)).rejects.toThrow(
      "citation_inspection_version_conflict",
    );
    // Owner records a positive inspection (new improvement version) — the owner's observation is visible…
    const obs = await isoAt("+ interval '3 seconds'");
    const v2 = await saveChange(
      changeRecord(a as never, user, {
        verification: { method: "owner_inspection", receipt: "x", verifiedAt: obs, reviewer: user },
      }),
      {
        artifactId: a.id,
        artifactSha256: a.artifactSha256,
        receiptId: r.id,
        ownerInspection: {
          checkResult: "shows_approved_content",
          observedReference: a.reference,
          observedAt: obs,
        },
      },
      { expectedVersion: 1, expectedHeadId: String(v1.id) },
    );
    expect(v2).toMatchObject({ verificationStatus: "owner_attested", verifiedEligible: true });
    // …but a second inspector's active negative on THAT row makes the delivery disputed and NOT eligible.
    const sha2 = (
      await db.query<{ s: string }>(
        "SELECT record_sha256 s FROM ai_citation_improvements WHERE id=$1",
        [v2.id],
      )
    ).rows[0].s;
    await grant(String(v2.id), inspector2);
    await grant(String(v2.id), delegate);
    const n1 = await inspect(
      inspector2,
      String(v2.id),
      sha2,
      "does_not_show",
      await isoAt("+ interval '4 seconds'"),
    );
    live = await readRow(String(v2.id));
    expect(live).toMatchObject({
      verificationStatus: "owner_attested",
      independentStatus: "disputed",
      verifiedEligible: false,
    });
    expect(
      (live.changeBinding as { ownerInspection: { checkResult: string } }).ownerInspection
        .checkResult,
    ).toBe("shows_approved_content");
    // Another inspector's later positive does not hide the active negative.
    await inspect(
      delegate,
      String(v2.id),
      sha2,
      "shows_approved_content",
      await isoAt("+ interval '5 seconds'"),
    );
    expect((await readRow(String(v2.id))).independentStatus).toBe("disputed");
    // The negative inspector withdraws (a NEW head): the dispute lifts; nothing older is resurrected.
    await inspect(inspector2, String(v2.id), sha2, "withdrawn", null, {
      expectedVersion: 1,
      expectedHeadId: String(n1.id),
    });
    live = await readRow(String(v2.id));
    expect(live).toMatchObject({
      independentStatus: "independently_inspected",
      verifiedEligible: true,
    });
    // Replacement chain: positive → negative → withdrawn for the same inspector leaves NO effect (the old positive
    // is not revived), and inconclusive is never affirmative.
    await grant(String(v2.id), stranger);
    const p = await inspect(
      stranger,
      String(v2.id),
      sha2,
      "shows_approved_content",
      await isoAt("+ interval '6 seconds'"),
    );
    const q = await inspect(
      stranger,
      String(v2.id),
      sha2,
      "does_not_show",
      await isoAt("+ interval '7 seconds'"),
      { expectedVersion: 1, expectedHeadId: String(p.id) },
    );
    expect((await readRow(String(v2.id))).independentStatus).toBe("disputed");
    await inspect(stranger, String(v2.id), sha2, "withdrawn", null, {
      expectedVersion: 2,
      expectedHeadId: String(q.id),
    });
    expect((await readRow(String(v2.id))).independentStatus).toBe("independently_inspected"); // delegate's positive only
    const delegateHead = (
      await db.query<{ id: string }>(
        "SELECT id FROM ai_citation_improvement_inspections WHERE improvement_row_id=$1 AND inspector_id=$2 ORDER BY version DESC LIMIT 1",
        [v2.id, delegate],
      )
    ).rows[0].id;
    await inspect(delegate, String(v2.id), sha2, "withdrawn", null, {
      expectedVersion: 1,
      expectedHeadId: delegateHead,
    });
    await inspect(
      inspector2,
      String(v2.id),
      sha2,
      "inconclusive",
      await isoAt("+ interval '8 seconds'"),
      {
        expectedVersion: 2,
        expectedHeadId: (
          await db.query<{ id: string }>(
            "SELECT id FROM ai_citation_improvement_inspections WHERE improvement_row_id=$1 AND inspector_id=$2 ORDER BY version DESC LIMIT 1",
            [v2.id, inspector2],
          )
        ).rows[0].id,
      },
    );
    live = await readRow(String(v2.id));
    // Owner attestation alone still counts (spec §7); the independent column reads inconclusive, not affirmative.
    expect(live).toMatchObject({
      verificationStatus: "owner_attested",
      independentStatus: "inconclusive",
      verifiedEligible: true,
    });
    // Membership removal of the delegate makes their receipts ineffective live; approval revoke drops eligibility.
    // Account suspension (the same live predicate as membership expiry/removal; the released membership
    // invalidation trigger needs scheduled_publishes, which these fixtures do not create).
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp() + interval '1 day' WHERE id=$1",
      [delegate],
    );
    const history = await readRow(String(v2.id));
    expect(
      (history.inspections as Array<{ inspectorId: string; effective: boolean }>)
        .filter((i) => i.inspectorId === delegate)
        .every((i) => !i.effective),
    ).toBe(true);
    await approve(user, String(a.id), String(a.artifactSha256), false);
    expect(await readRow(String(v2.id))).toMatchObject({
      verificationStatus: "unverified",
      verifiedEligible: false,
    });
  });
  it("public URL: an older publication without an actor record refuses independent verification; a recorded actor enables it and the actor themselves is refused", async () => {
    await seedTeam();
    const v1 = await savePublic(IMP2);
    expect(v1).toMatchObject({
      verificationStatus: "connector_receipt",
      independentStatus: "none",
      verifiedEligible: false,
    });
    const sha = (
      await db.query<{ s: string }>(
        "SELECT record_sha256 s FROM ai_citation_improvements WHERE id=$1",
        [v1.id],
      )
    ).rows[0].s;
    await grant(String(v1.id), inspector2);
    const view = await call("read_ai_citation_improvement_for_inspection", {
      p_actor: inspector2,
      p_owner: user,
      p_project: "p",
      p_row: v1.id,
    });
    expect(view).toMatchObject({
      kind: "public_url",
      destinationReference: LIVE,
      approvedVersion: VERSION,
      independenceAvailable: false,
    });
    expect((view.approvedContent as { markdown: string }).markdown).toContain(
      "Approved services page",
    );
    await expect(
      inspect(
        inspector2,
        String(v1.id),
        sha,
        "shows_approved_content",
        await isoAt("- interval '20 minutes'"),
      ),
    ).rejects.toThrow("citation_inspection_identity_unavailable");
    // A future publication carries its authenticated initiator; the first record wins and the actor cannot inspect.
    expect(
      await call("record_publication_actor", {
        p_user: user,
        p_project: "p",
        p_id: PUB,
        p_actor: delegate,
        p_initiator: "interactive",
      }),
    ).toBe(true);
    expect(
      await call("record_publication_actor", {
        p_user: user,
        p_project: "p",
        p_id: PUB,
        p_actor: inspector2,
        p_initiator: "scheduler",
      }),
    ).toBe(true);
    expect(
      (
        await db.query<{ a: string }>(
          "SELECT actor_id a FROM publication_evidence_actors WHERE publication_id=$1",
          [PUB],
        )
      ).rows[0].a,
    ).toBe(delegate);
    await expect(grant(String(v1.id), delegate)).rejects.toThrow(
      "citation_inspection_not_independent",
    );
    const ok = await inspect(
      inspector2,
      String(v1.id),
      sha,
      "shows_approved_content",
      await isoAt("- interval '20 minutes'"),
    );
    expect(ok.version).toBe(1);
    expect(await readRow(String(v1.id))).toMatchObject({
      verificationStatus: "connector_receipt",
      independentStatus: "independently_inspected",
      verifiedEligible: true,
    });
    // Pre-publication or future observation instants are refused; the owner can never inspect as an independent.
    await expect(
      inspect(inspector2, String(v1.id), sha, "inconclusive", "2020-01-01T00:00:00Z", {
        expectedVersion: 1,
        expectedHeadId: String(ok.id),
      }),
    ).rejects.toThrow("citation_inspection_invalid");
    await expect(
      inspect(
        user,
        String(v1.id),
        sha,
        "shows_approved_content",
        await isoAt("- interval '20 minutes'"),
      ),
    ).rejects.toThrow("citation_inspection_forbidden");
    // The v4 read of the existing public path keeps the released ladder and adds the live fields for the owner too.
    const withOwner = await savePublic(IMP2, {
      inspect: true,
      token: { expectedVersion: 1, expectedHeadId: String(v1.id) },
    });
    expect(withOwner).toMatchObject({
      verificationStatus: "owner_attested",
      verifiedEligible: true,
    });
  });
});

describe("R1 regressions (Codex SQL-stage review 2026-09-28): the required behaviour of each reproduced defect", () => {
  const readyChange = async () => {
    await seedTeam();
    const a = await artifact();
    await approve(user, String(a.id), String(a.artifactSha256));
    const r = await receipt(user, String(a.id), await isoAt("+ interval '1 second'"));
    const binding = {
      artifactId: a.id,
      artifactSha256: a.artifactSha256,
      receiptId: r.id,
      ownerInspection: null,
    };
    const v = await saveChange(changeRecord(a as never, user), binding);
    const sha = await recordSha(String(v.id));
    await grant(String(v.id), delegate);
    return {
      a: a as { id: string; artifactSha256: string; reference: string },
      r,
      binding,
      v,
      sha,
    };
  };
  it("R1/1 nested allow-list: a nested unknown key is refused by the RPC AND by the table, and every read projects only {before, after}", async () => {
    const withPassword = { openingHours: { after: "09-17", password: "DUMMY_NONSECRET_SENTINEL" } };
    await expect(artifact({ p_fields: withPassword })).rejects.toThrow(
      "citation_change_unsupported",
    );
    await expect(
      db.query(
        "INSERT INTO ai_citation_change_artifacts(user_id,project_id,kind,reference,fields,artifact_sha256,created_by) VALUES($1,'p','listing','x',$2::jsonb,repeat('c',64),$1)",
        [user, JSON.stringify(withPassword)],
      ),
    ).rejects.toThrow(/check constraint/);
    const a = await artifact();
    expect(a.fields).toEqual(LISTING_FIELDS);
    expect(JSON.stringify(await artifact())).not.toContain("SENTINEL");
    const listed = await call("read_ai_citation_change_artifacts", {
      p_user: user,
      p_project: "p",
    });
    expect((listed.artifacts as Array<{ fields: unknown }>)[0].fields).toEqual(LISTING_FIELDS);
    // A `before` omitted on write reads back as null (exact projected shape), never as an open object.
    const b = await artifact({ p_fields: { name: { after: "Acme Massage" } } });
    expect(b.fields).toEqual({ name: { before: null, after: "Acme Massage" } });
    // The assigned inspector's read goes through the same projection.
    await seedTeam();
    const r = await receipt(
      user,
      String(a.id),
      (await approve(user, String(a.id), String(a.artifactSha256)),
      await isoAt("+ interval '1 second'")),
    );
    const v = await saveChange(changeRecord(a as never, user), {
      artifactId: a.id,
      artifactSha256: a.artifactSha256,
      receiptId: r.id,
      ownerInspection: null,
    });
    await grant(String(v.id), delegate);
    const view = await call("read_ai_citation_improvement_for_inspection", {
      p_actor: delegate,
      p_owner: user,
      p_project: "p",
      p_row: v.id,
    });
    expect((view.approvedContent as { fields: unknown }).fields).toEqual(LISTING_FIELDS);
  });
  it("R1/2 approval head: a frozen approve replayed after a later revoke returns its historical result and never re-approves; a stale head is refused; explicit re-approval is a new revision", async () => {
    const a = await artifact();
    const sha = String(a.artifactSha256);
    const request = crypto.randomUUID();
    const p1 = await approve(user, String(a.id), sha, true, {
      expectedRevision: 0,
      requestId: request,
    });
    expect(p1).toMatchObject({ approved: true, revision: 1, currentRevision: 1, replayed: false });
    // Identical decision at the current head (new request): no change, instant + revision preserved.
    const p1b = await approve(user, String(a.id), sha);
    expect(p1b).toMatchObject({ approved: true, revision: 1, approvedAt: p1.approvedAt });
    // Lost-response retry of the ORIGINAL request replays the same result.
    expect(
      await approve(user, String(a.id), sha, true, { expectedRevision: 0, requestId: request }),
    ).toMatchObject({
      approved: true,
      revision: 1,
      currentRevision: 1,
      replayed: true,
      approvedAt: p1.approvedAt,
    });
    const revoke = await approve(user, String(a.id), sha, false);
    expect(revoke).toMatchObject({ approved: false, revision: 2, currentRevision: 2 });
    // The frozen ORIGINAL approve replayed now: its historical result (revision 1) — the current decision stays
    // revoked, no conflict, no fresh timestamp.
    const replay = await approve(user, String(a.id), sha, true, {
      expectedRevision: 0,
      requestId: request,
    });
    expect(replay).toMatchObject({
      approved: true,
      revision: 1,
      currentRevision: 2,
      replayed: true,
      approvedAt: p1.approvedAt,
    });
    expect(await provenance(String(a.id))).toMatchObject({ approved: false, currentRevision: 2 });
    // A NEW request naming the stale head (the ABA approve→revoke→approve) is refused, still not approved.
    await expect(approve(user, String(a.id), sha, true, { expectedRevision: 0 })).rejects.toThrow(
      "citation_change_stale",
    );
    await expect(approve(user, String(a.id), sha, true, { expectedRevision: 1 })).rejects.toThrow(
      "citation_change_stale",
    );
    expect((await provenance(String(a.id))).approved).toBe(false);
    // A receipt cannot ride on the replayed historical approval.
    await expect(receipt(user, String(a.id), await isoAt("+ interval '1 second'"))).rejects.toThrow(
      "citation_change_unapproved",
    );
    // Explicit re-approval against the current head: a new revision with a NEW instant.
    const p3 = await approve(user, String(a.id), sha, true, { expectedRevision: 2 });
    expect(p3).toMatchObject({ approved: true, revision: 3, currentRevision: 3, replayed: false });
    expect(String(p3.approvedAt) > String(p1.approvedAt)).toBe(true);
    // Delegate decisions carry the same head discipline.
    await seedTeam();
    await expect(
      approve(delegate, String(a.id), sha, false, { expectedRevision: 2 }),
    ).rejects.toThrow("citation_change_stale");
    expect(await approve(delegate, String(a.id), sha, false)).toMatchObject({
      approved: false,
      revision: 4,
    });
    // Ambiguous inputs (no request identity) are unsupported.
    await expect(
      call("set_ai_citation_change_approval", {
        p_actor: user,
        p_owner: user,
        p_project: "p",
        p_artifact: a.id,
        p_expected_sha: sha,
        p_approved: true,
        p_expected_revision: 4,
        p_request: null,
      }),
    ).rejects.toThrow("citation_change_unsupported");
  });
  it("R2/1 live authorization precedes replay: a revoked, expired, banned or removed delegate cannot replay an old decision; a still-authorized delegate replays without mutation", async () => {
    await seedTeam();
    const a = await artifact();
    const sha = String(a.artifactSha256);
    const request = crypto.randomUUID();
    const d1 = await approve(delegate, String(a.id), sha, true, {
      expectedRevision: 0,
      requestId: request,
    });
    expect(d1).toMatchObject({ approved: true, approverKind: "delegate", revision: 1 });
    const replay = () =>
      approve(delegate, String(a.id), sha, true, { expectedRevision: 0, requestId: request });
    expect(await replay()).toMatchObject({
      approved: true,
      revision: 1,
      currentRevision: 1,
      replayed: true,
    });
    // Removed membership (inactive): the replay is forbidden like a fresh request; nothing is disclosed.
    await db.query(
      "UPDATE project_team_members SET active=false,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    await expect(replay()).rejects.toThrow("citation_change_forbidden");
    await expect(
      approve(delegate, String(a.id), sha, true, { expectedRevision: 1 }),
    ).rejects.toThrow("citation_change_forbidden");
    // Expired membership.
    await db.query(
      "UPDATE project_team_members SET active=true,expires_at=clock_timestamp() - interval '1 second',revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    await expect(replay()).rejects.toThrow("citation_change_forbidden");
    // Banned account.
    await db.query(
      "UPDATE project_team_members SET expires_at=NULL,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp() + interval '1 day' WHERE id=$1",
      [delegate],
    );
    await expect(replay()).rejects.toThrow(/team_project_unavailable|citation_change_forbidden/);
    await db.query("UPDATE auth.users SET banned_until=NULL WHERE id=$1", [delegate]);
    // A stranger presenting the same request id is forbidden (the digest binds the actor anyway).
    await expect(
      approve(stranger, String(a.id), sha, true, { expectedRevision: 0, requestId: request }),
    ).rejects.toThrow("citation_change_forbidden");
    // Policy disabled: forbidden as well.
    await db.query(
      "UPDATE project_team_approval_policy SET mode='disabled',revision=revision+1 WHERE owner_id=$1",
      [user],
    );
    await expect(replay()).rejects.toThrow("citation_change_forbidden");
    await db.query(
      "UPDATE project_team_approval_policy SET mode='separate_reviewers',revision=revision+1 WHERE owner_id=$1",
      [user],
    );
    // Re-authorized delegate: the replay works again and STILL does not mutate the current decision (which the
    // moved membership revision has made non-current).
    expect(await replay()).toMatchObject({
      approved: true,
      revision: 1,
      currentRevision: 1,
      replayed: true,
    });
    expect(await provenance(String(a.id))).toMatchObject({ approved: false, currentRevision: 1 });
    // The owner replaying the delegate's request id gets nothing historical: a different actor is a different
    // request (and at the stale head it is refused).
    await expect(
      approve(user, String(a.id), sha, true, { expectedRevision: 0, requestId: request }),
    ).rejects.toThrow("citation_change_stale");
  });
  it("R2/2 explicit re-approval renews delegated authority: after a membership or policy revision moves, a NEW request at the current head is a real new decision with the live revisions; old requests stay frozen; renewed membership alone revives nothing", async () => {
    await seedTeam();
    const a = await artifact();
    const sha = String(a.artifactSha256);
    const first = crypto.randomUUID();
    const d1 = await approve(delegate, String(a.id), sha, true, {
      expectedRevision: 0,
      requestId: first,
    });
    expect(d1).toMatchObject({ approved: true, revision: 1 });
    // Membership revision advances (still eligible): the stored grant is stale → not currently approved.
    await db.query("UPDATE project_team_members SET revision=revision+1 WHERE actor_id=$1", [
      delegate,
    ]);
    expect(await provenance(String(a.id))).toMatchObject({ approved: false, currentRevision: 1 });
    // Renewed membership alone revives nothing; a receipt is refused.
    await expect(
      receipt(delegate, String(a.id), await isoAt("+ interval '1 second'")),
    ).rejects.toThrow("citation_change_unapproved");
    // Explicit re-approval at the current head: a REAL new decision (revision 2, new instant, live revisions).
    const d2 = await approve(delegate, String(a.id), sha, true, { expectedRevision: 1 });
    expect(d2).toMatchObject({
      approved: true,
      approverKind: "delegate",
      revision: 2,
      currentRevision: 2,
      replayed: false,
    });
    expect(String(d2.approvedAt) > String(d1.approvedAt)).toBe(true);
    expect(
      (
        await db.query<{ m: string }>(
          "SELECT delegate_membership_revision::text m FROM ai_citation_change_approvals WHERE artifact_id=$1",
          [a.id],
        )
      ).rows[0].m,
    ).toBe("3");
    expect(await provenance(String(a.id))).toMatchObject({ approved: true, revision: 2 });
    // Identical decision while the authority is unchanged: a no-op that keeps the instant and revision.
    expect(await approve(delegate, String(a.id), sha, true, { expectedRevision: 2 })).toMatchObject(
      { revision: 2, approvedAt: d2.approvedAt },
    );
    // Policy revision moves: same recovery path (revision 3 with the live policy revision).
    await db.query(
      "UPDATE project_team_approval_policy SET revision=revision+1 WHERE owner_id=$1",
      [user],
    );
    expect((await provenance(String(a.id))).approved).toBe(false);
    const d3 = await approve(delegate, String(a.id), sha, true, { expectedRevision: 2 });
    expect(d3).toMatchObject({ approved: true, revision: 3 });
    expect(
      (
        await db.query<{ p: string }>(
          "SELECT delegate_policy_revision::text p FROM ai_citation_change_approvals WHERE artifact_id=$1",
          [a.id],
        )
      ).rows[0].p,
    ).toBe("5");
    // The receipt path now works and anchors on the renewed instant.
    await expect(receipt(delegate, String(a.id), d1.approvedAt as string)).rejects.toThrow(
      "citation_change_receipt_invalid",
    );
    expect(
      await receipt(delegate, String(a.id), await isoAt("+ interval '1 second'")),
    ).toMatchObject({ performerKind: "delegate" });
    // The first request replays its frozen revision-1 result; the current decision is untouched.
    expect(
      await approve(delegate, String(a.id), sha, true, { expectedRevision: 0, requestId: first }),
    ).toMatchObject({ approved: true, revision: 1, currentRevision: 3, replayed: true });
    expect(await provenance(String(a.id))).toMatchObject({ approved: true, revision: 3 });
    // Owner ↔ delegate transitions are always new decisions (different actor), each a new revision.
    expect(await approve(user, String(a.id), sha, true, { expectedRevision: 3 })).toMatchObject({
      approverKind: "owner",
      revision: 4,
    });
    expect(await approve(delegate, String(a.id), sha, true, { expectedRevision: 4 })).toMatchObject(
      { approverKind: "delegate", revision: 5 },
    );
    // Owner identical decision is a no-op regardless of team revisions.
    await approve(user, String(a.id), sha, false, { expectedRevision: 5 });
    const o = await approve(user, String(a.id), sha, true, { expectedRevision: 6 });
    await db.query("UPDATE project_team_members SET revision=revision+1 WHERE actor_id=$1", [
      delegate,
    ]);
    expect(await approve(user, String(a.id), sha, true, { expectedRevision: 7 })).toMatchObject({
      revision: 7,
      approvedAt: o.approvedAt,
    });
  });
  it("R1/3 withdrawal idempotency: a lost-response retry of a withdrawal replays its receipt; a later fresh inspection is a new head and the old withdrawal replay never touches it", async () => {
    const { v, sha } = await readyChange();
    // A withdrawal on an EMPTY chain is invalid (nothing to withdraw).
    await expect(inspect(delegate, String(v.id), sha, "withdrawn", null)).rejects.toThrow(
      "citation_inspection_invalid",
    );
    const p = await inspect(
      delegate,
      String(v.id),
      sha,
      "shows_approved_content",
      await isoAt("+ interval '2 seconds'"),
    );
    const token = { expectedVersion: 1, expectedHeadId: String(p.id) };
    const w = await inspect(delegate, String(v.id), sha, "withdrawn", null, token);
    expect(w).toMatchObject({ version: 2, checkResult: "withdrawn", supersedesId: p.id });
    const retry = await inspect(delegate, String(v.id), sha, "withdrawn", null, token);
    expect(retry).toMatchObject({ id: w.id, version: 2 });
    expect((await readRow(String(v.id))).independentStatus).toBe("none");
    // A withdrawal must still name the reviewed head: a wrong or missing token conflicts (never a silent new head).
    await expect(
      inspect(delegate, String(v.id), sha, "withdrawn", null, {
        expectedVersion: 1,
        expectedHeadId: String(w.id),
      }),
    ).rejects.toThrow("citation_inspection_version_conflict");
    await expect(inspect(delegate, String(v.id), sha, "withdrawn", null)).rejects.toThrow(
      "citation_inspection_version_conflict",
    );
    // Fresh positive against the withdrawal head → v3 (a new receipt, effective).
    const p2 = await inspect(
      delegate,
      String(v.id),
      sha,
      "shows_approved_content",
      await isoAt("+ interval '3 seconds'"),
      { expectedVersion: 2, expectedHeadId: String(w.id) },
    );
    expect(p2).toMatchObject({ version: 3, supersedesId: w.id });
    expect(await readRow(String(v.id))).toMatchObject({
      independentStatus: "independently_inspected",
      verifiedEligible: true,
    });
    // Replaying the OLD withdrawal request returns its historical v2 receipt; the head stays v3.
    expect((await inspect(delegate, String(v.id), sha, "withdrawn", null, token)).id).toBe(w.id);
    expect(await receiptState(String(v.id), delegate)).toMatchObject({
      version: 3,
      effective: true,
    });
    expect((await readRow(String(v.id))).independentStatus).toBe("independently_inspected");
  });
  it("R1/4 renewed authority: membership re-grant or assignment re-grant never revives an older positive; the inspector records a fresh receipt against their current head", async () => {
    const { v, sha } = await readyChange();
    const t = await isoAt("+ interval '2 seconds'");
    const p = await inspect(delegate, String(v.id), sha, "shows_approved_content", t);
    expect((await readRow(String(v.id))).verifiedEligible).toBe(true);
    await db.query(
      "UPDATE project_team_members SET active=false,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    expect(await readRow(String(v.id))).toMatchObject({
      verifiedEligible: false,
      independentStatus: "none",
    });
    await db.query(
      "UPDATE project_team_members SET active=true,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    // Re-membership: the old receipt stays ineffective (authority revision moved) and the row is NOT eligible.
    expect(await readRow(String(v.id))).toMatchObject({
      verifiedEligible: false,
      independentStatus: "none",
    });
    expect(await receiptState(String(v.id), delegate)).toMatchObject({
      version: 1,
      effective: false,
      ineffectiveReason: "authority",
    });
    const view = await call("read_ai_citation_improvement_for_inspection", {
      p_actor: delegate,
      p_owner: user,
      p_project: "p",
      p_row: v.id,
    });
    expect(view.myHead).toMatchObject({
      version: 1,
      effective: false,
      ineffectiveReason: "authority",
    });
    // The same frozen request replays the OLD receipt (still ineffective) — it is not silently a new one.
    expect((await inspect(delegate, String(v.id), sha, "shows_approved_content", t)).id).toBe(p.id);
    expect((await readRow(String(v.id))).verifiedEligible).toBe(false);
    // Fresh inspection against the current head under the new authority → new effective receipt.
    const p2 = await inspect(
      delegate,
      String(v.id),
      sha,
      "shows_approved_content",
      await isoAt("+ interval '3 seconds'"),
      { expectedVersion: 1, expectedHeadId: String(p.id) },
    );
    expect(p2).toMatchObject({ version: 2 });
    expect(await readRow(String(v.id))).toMatchObject({
      verifiedEligible: true,
      independentStatus: "independently_inspected",
    });
    // Assignment revoke + re-grant is a new assignment revision: the v2 positive is ineffective until re-inspected.
    await call("revoke_ai_citation_inspection_assignment", {
      p_owner: user,
      p_project: "p",
      p_row: v.id,
      p_inspector: delegate,
    });
    expect((await readRow(String(v.id))).verifiedEligible).toBe(false);
    expect(await grant(String(v.id), delegate)).toMatchObject({ revision: 2 });
    expect(await readRow(String(v.id))).toMatchObject({
      verifiedEligible: false,
      independentStatus: "none",
    });
    expect(await receiptState(String(v.id), delegate)).toMatchObject({
      version: 2,
      effective: false,
      ineffectiveReason: "assignment",
    });
    const p3 = await inspect(
      delegate,
      String(v.id),
      sha,
      "shows_approved_content",
      await isoAt("+ interval '4 seconds'"),
      { expectedVersion: 2, expectedHeadId: String(p2.id) },
    );
    expect(p3).toMatchObject({ version: 3 });
    expect(await readRow(String(v.id))).toMatchObject({
      verifiedEligible: true,
      independentStatus: "independently_inspected",
    });
    // A grant on an already-active assignment does not bump the revision (no accidental invalidation).
    expect(await grant(String(v.id), delegate)).toMatchObject({ revision: 2 });
    expect((await readRow(String(v.id))).verifiedEligible).toBe(true);
    // Live independence: if the inspector later becomes the approver, their positive stops counting.
    const a = (await call("read_ai_citation_change_artifacts", { p_user: user, p_project: "p" }))
      .artifacts as Array<{ id: string; artifactSha256: string }>;
    await approve(delegate, a[0].id, a[0].artifactSha256);
    expect(await receiptState(String(v.id), delegate)).toMatchObject({
      version: 3,
      effective: false,
      ineffectiveReason: "independence",
    });
    expect((await readRow(String(v.id))).verifiedEligible).toBe(false);
  });
  it("R1/5 dissent follows the delivered change: an owner correction with the identical artifact + receipt stays disputed (provenance exposed) until the reviewer withdraws or a distinct performed change is bound; owner-side revocation never clears it", async () => {
    const { a, r, binding, v, sha } = await readyChange();
    const n = await inspect(
      delegate,
      String(v.id),
      sha,
      "does_not_show",
      await isoAt("+ interval '2 seconds'"),
    );
    expect((await readRow(String(v.id))).independentStatus).toBe("disputed");
    const observedAt = await isoAt("+ interval '3 seconds'");
    const ownerPositive = (
      over: Record<string, unknown>,
      token: { expectedVersion: number; expectedHeadId: string | null },
    ) =>
      saveChange(
        changeRecord(a as never, user, {
          verification: {
            method: "owner_inspection",
            receipt: "x",
            verifiedAt: observedAt,
            reviewer: user,
          },
          ...over,
        }),
        {
          ...binding,
          ownerInspection: {
            checkResult: "shows_approved_content",
            observedReference: a.reference,
            observedAt,
          },
        },
        token,
      );
    const v2 = await ownerPositive({}, { expectedVersion: 1, expectedHeadId: String(v.id) });
    const live = await readRow(String(v2.id));
    expect(live).toMatchObject({
      verificationStatus: "owner_attested",
      independentStatus: "disputed",
      verifiedEligible: false,
    });
    expect(live.dissent).toEqual([
      {
        receiptId: n.id,
        improvementRowId: v.id,
        inspectorId: delegate,
        observedAt: expect.stringMatching(/Z$/),
      },
    ]);
    // Downstream: the list projection of the HEAD (what readiness counts) is not eligible either.
    const heads = (await call("read_ai_citation_improvements_v4", { p_user: user, p_project: "p" }))
      .improvements as Array<{ id: string; verifiedEligible: boolean; independentStatus: string }>;
    expect(heads.find((h) => h.id === v2.id)).toMatchObject({
      verifiedEligible: false,
      independentStatus: "disputed",
    });
    // Owner-controlled gates do not resolve dissent: revoking the inspector's assignment on the disputed row, or
    // re-granting it, leaves the dispute (the negative head is sticky).
    await call("revoke_ai_citation_inspection_assignment", {
      p_owner: user,
      p_project: "p",
      p_row: v.id,
      p_inspector: delegate,
    });
    expect((await readRow(String(v2.id))).independentStatus).toBe("disputed");
    await grant(String(v.id), delegate);
    expect((await readRow(String(v2.id))).independentStatus).toBe("disputed");
    // Even a further cosmetic correction (new description) keeps it.
    const v3 = await ownerPositive(
      {
        change: {
          description: "Corrected the opening hours (typo fixed).",
          approvedVersion: a.artifactSha256,
          approvedBy: user,
          approvedAt: now,
        },
      },
      { expectedVersion: 2, expectedHeadId: String(v2.id) },
    );
    expect(await readRow(String(v3.id))).toMatchObject({
      independentStatus: "disputed",
      verifiedEligible: false,
    });
    // Resolution A: a DISTINCT approved+performed change (a new receipt) is a different delivery — not disputed.
    const r2 = await receipt(user, String(a.id), await isoAt("+ interval '4 seconds'"));
    expect(r2.id).not.toBe(r.id);
    const v4 = await saveChange(
      changeRecord(a as never, user),
      { ...binding, receiptId: r2.id },
      { expectedVersion: 3, expectedHeadId: String(v3.id) },
    );
    expect(await readRow(String(v4.id))).toMatchObject({ independentStatus: "none", dissent: [] });
    // Resolution B: the reviewer's own withdrawal on the row they inspected lifts the dispute for the SAME delivery.
    await inspect(delegate, String(v.id), sha, "withdrawn", null, {
      expectedVersion: 1,
      expectedHeadId: String(n.id),
    });
    expect(await readRow(String(v3.id))).toMatchObject({
      independentStatus: "none",
      verifiedEligible: true,
      dissent: [],
    });
    // The same scoping protects a public-URL delivery: dissent on one row of an attempt reaches its correction.
    await savePublic(IMP2);
    const pubRows = (
      await db.query<{ id: string; s: string }>(
        "SELECT id,record_sha256 s FROM ai_citation_improvements WHERE improvement_id=$1 ORDER BY version",
        [IMP2],
      )
    ).rows;
    await db.query(
      "INSERT INTO publication_evidence_actors(user_id,project_id,publication_id,actor_id,initiator) VALUES($1,'p',$2,$1,'interactive') ON CONFLICT DO NOTHING",
      [user, PUB],
    );
    await grant(pubRows[0].id, inspector2);
    await inspect(
      inspector2,
      pubRows[0].id,
      pubRows[0].s,
      "does_not_show",
      await isoAt("+ interval '5 seconds'"),
    );
    const pub2 = await savePublic(IMP2, {
      inspect: true,
      token: { expectedVersion: 1, expectedHeadId: pubRows[0].id },
    });
    expect(await readRow(String(pub2.id))).toMatchObject({
      verificationStatus: "owner_attested",
      independentStatus: "disputed",
      verifiedEligible: false,
    });
  });
});

describe("T2 (PR157 exact-head finding 4118473980): a performed receipt never outlives its approval epoch", () => {
  const bindingOf = (
    a: { id: string; artifactSha256: string },
    r: { id: string },
    ownerInspection: unknown = null,
  ) => ({ artifactId: a.id, artifactSha256: a.artifactSha256, receiptId: r.id, ownerInspection });
  const listedCurrent = async (artifactId: string, receiptId: string) => {
    const state = await call("read_ai_citation_change_artifacts", { p_user: user, p_project: "p" });
    const art = (
      state.artifacts as Array<{ id: string; receipts: Array<{ id: string; current: boolean }> }>
    ).find((x) => x.id === artifactId);
    return art?.receipts.find((x) => x.id === receiptId)?.current;
  };
  const recordSha256 = async (rowId: string) =>
    (
      await db.query<{ s: string }>(
        "SELECT record_sha256 s FROM ai_citation_improvements WHERE id=$1",
        [rowId],
      )
    ).rows[0].s;
  it("approve → perform → revoke → re-approve: the old receipt is refused for a NEW binding (a positive owner inspection included), an EXISTING binding holds at approval_bound live and an independent positive never qualifies it, the owner read marks it stale, a fresh declaration restores the path; an identical re-approval and a frozen replay keep the receipt current", async () => {
    await seedTeam([[delegate, "reviewer"]]);
    const a = (await artifact()) as { id: string; artifactSha256: string; reference: string };
    const REQ = crypto.randomUUID();
    const p1 = await approve(user, a.id, a.artifactSha256, true, {
      expectedRevision: 0,
      requestId: REQ,
    });
    expect(p1).toMatchObject({ approved: true, revision: 1 });
    // Controlled instant: performed EXACTLY at the approval instant (the earliest valid declaration).
    const r1 = (await receipt(user, a.id, p1.approvedAt as string)) as { id: string };
    expect(await listedCurrent(a.id, r1.id)).toBe(true);
    const v1 = await saveChange(changeRecord(a, user), bindingOf(a, r1));
    expect(v1).toMatchObject({
      version: 1,
      verificationStatus: "receipt_recorded",
      verifiedEligible: false,
    });
    expect((await readRow(String(v1.id))).changeBinding).toMatchObject({
      receiptId: r1.id,
      receiptCurrent: true,
    });
    // An unchanged decision (identical owner re-approval at the current head) keeps the instant: no demotion.
    const p1b = await approve(user, a.id, a.artifactSha256, true);
    expect(p1b).toMatchObject({ approved: true, revision: 1, approvedAt: p1.approvedAt });
    // A frozen retry of the original request replays history: no demotion either.
    const replay = await approve(user, a.id, a.artifactSha256, true, {
      expectedRevision: 0,
      requestId: REQ,
    });
    expect(replay).toMatchObject({ replayed: true, revision: 1, approvedAt: p1.approvedAt });
    expect(await listedCurrent(a.id, r1.id)).toBe(true);
    expect((await readRow(String(v1.id))).verificationStatus).toBe("receipt_recorded");
    // The identical frozen improvement payload still resolves to the same row (idempotent retry intact).
    expect((await saveChange(changeRecord(a, user), bindingOf(a, r1))).id).toBe(v1.id);
    // Revoke → explicit re-approve: a NEW approval epoch (revision 3, a later instant).
    await approve(user, a.id, a.artifactSha256, false);
    const p3 = await approve(user, a.id, a.artifactSha256, true);
    expect(p3).toMatchObject({ approved: true, revision: 3 });
    expect(String(p3.approvedAt) > String(p1.approvedAt)).toBe(true);
    // Owner read: the old receipt stays listed (audit) but is not current.
    expect(await listedCurrent(a.id, r1.id)).toBe(false);
    // The EXISTING binding holds at approval_bound live (never receipt_recorded) and names the stale receipt.
    let live = await readRow(String(v1.id));
    expect(live).toMatchObject({ verificationStatus: "approval_bound", verifiedEligible: false });
    expect(live.changeBinding).toMatchObject({ receiptId: r1.id, receiptCurrent: false });
    // A NEW binding of the old receipt — plain, or carrying a positive owner inspection — is refused.
    const observedAt = await isoAt("+ interval '2 seconds'");
    await expect(
      saveChange(changeRecord(a, user, { description: "re-bound" }), bindingOf(a, r1), {
        expectedVersion: 1,
        expectedHeadId: String(v1.id),
      }),
    ).rejects.toThrow("citation_improvement_binding_receipt_stale");
    await expect(
      saveChange(
        changeRecord(a, user, {
          verification: {
            method: "owner_inspection",
            receipt: "x",
            verifiedAt: observedAt,
            reviewer: user,
          },
        }),
        bindingOf(a, r1, {
          checkResult: "shows_approved_content",
          observedReference: a.reference,
          observedAt,
        }),
        { expectedVersion: 1, expectedHeadId: String(v1.id) },
        [(await findingHead()).id],
      ),
    ).rejects.toThrow("citation_improvement_binding_receipt_stale");
    // An independent positive on the bound row is labelled but NEVER qualifies the stale performance.
    await grant(String(v1.id), delegate);
    await inspect(
      delegate,
      String(v1.id),
      await recordSha256(String(v1.id)),
      "shows_approved_content",
      observedAt,
    );
    live = await readRow(String(v1.id));
    expect(live).toMatchObject({
      verificationStatus: "approval_bound",
      independentStatus: "independently_inspected",
      verifiedEligible: false,
      verifiedAt: null,
    });
    // A fresh declaration under the renewed approval restores the forward path on a new version…
    const r2 = (await receipt(user, a.id, await isoAt("+ interval '1 second'"))) as { id: string };
    expect(await listedCurrent(a.id, r2.id)).toBe(true);
    const v2 = await saveChange(changeRecord(a, user), bindingOf(a, r2), {
      expectedVersion: 1,
      expectedHeadId: String(v1.id),
    });
    expect(v2).toMatchObject({
      version: 2,
      verificationStatus: "receipt_recorded",
      verifiedEligible: false,
    });
    expect((await readRow(String(v2.id))).changeBinding).toMatchObject({
      receiptId: r2.id,
      receiptCurrent: true,
    });
    // …and a fresh independent positive on THAT row qualifies; the old row's inspection stays on the old row.
    await grant(String(v2.id), delegate);
    await inspect(
      delegate,
      String(v2.id),
      await recordSha256(String(v2.id)),
      "shows_approved_content",
      await isoAt("+ interval '3 seconds'"),
    );
    expect(await readRow(String(v2.id))).toMatchObject({
      verificationStatus: "receipt_recorded",
      independentStatus: "independently_inspected",
      verifiedEligible: true,
    });
    expect(await readRow(String(v1.id))).toMatchObject({
      verificationStatus: "approval_bound",
      verifiedEligible: false,
    });
  });
  it("U (Codex T follow-up): a permitted +2 min declared instant never survives an immediate revoke → re-approve; the receipt's recorded approval revision is the epoch identity (owner and delegate paths); retries of the old declaration never manufacture a current one; unchanged/frozen decisions keep it; a fresh declaration restores eligibility", async () => {
    await seedTeam([[delegate, "reviewer"]]);
    const receiptsOf = async (artifactId: string) =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_change_receipts WHERE user_id=$1 AND project_id='p' AND artifact_id=$2",
          [user, artifactId],
        )
      ).rows[0].n;
    // ---- owner path: the declared instant leads the server clock by the permitted 2 minutes.
    const a = (await artifact()) as { id: string; artifactSha256: string; reference: string };
    const REQ = crypto.randomUUID();
    const p1 = await approve(user, a.id, a.artifactSha256, true, {
      expectedRevision: 0,
      requestId: REQ,
    });
    const future = await isoAt("+ interval '2 minutes'");
    const r1 = (await receipt(user, a.id, future)) as { id: string };
    expect(await listedCurrent(a.id, r1.id)).toBe(true);
    const v1 = await saveChange(changeRecord(a, user), bindingOf(a, r1));
    expect(v1).toMatchObject({ version: 1, verificationStatus: "receipt_recorded" });
    // Unchanged decision and a frozen replay keep the epoch: still current.
    expect(await approve(user, a.id, a.artifactSha256, true)).toMatchObject({
      revision: 1,
      approvedAt: p1.approvedAt,
    });
    expect(
      await approve(user, a.id, a.artifactSha256, true, { expectedRevision: 0, requestId: REQ }),
    ).toMatchObject({ replayed: true, revision: 1 });
    expect(await listedCurrent(a.id, r1.id)).toBe(true);
    expect((await readRow(String(v1.id))).changeBinding).toMatchObject({ receiptCurrent: true });
    // Immediate revoke → re-approve (revision 3): the new instant is STILL before the declared instant, so a
    // timestamp rule alone would keep the old receipt; the recorded revision retires it.
    await approve(user, a.id, a.artifactSha256, false);
    const p3 = await approve(user, a.id, a.artifactSha256, true);
    expect(p3).toMatchObject({ approved: true, revision: 3 });
    expect(String(p3.approvedAt) < future).toBe(true);
    expect(await listedCurrent(a.id, r1.id)).toBe(false);
    let live = await readRow(String(v1.id));
    expect(live).toMatchObject({ verificationStatus: "approval_bound", verifiedEligible: false });
    expect(live.changeBinding).toMatchObject({ receiptCurrent: false });
    await expect(
      saveChange(changeRecord(a, user, { description: "re-bound" }), bindingOf(a, r1), {
        expectedVersion: 1,
        expectedHeadId: String(v1.id),
      }),
    ).rejects.toThrow("citation_improvement_binding_receipt_stale");
    const observedAt = await isoAt("+ interval '3 minutes'");
    await expect(
      saveChange(
        changeRecord(a, user, {
          verification: {
            method: "owner_inspection",
            receipt: "x",
            verifiedAt: observedAt,
            reviewer: user,
          },
        }),
        bindingOf(a, r1, {
          checkResult: "shows_approved_content",
          observedReference: a.reference,
          observedAt,
        }),
        { expectedVersion: 1, expectedHeadId: String(v1.id) },
        [(await findingHead()).id],
      ),
    ).rejects.toThrow("citation_improvement_binding_receipt_stale");
    // A retry of the OLD declaration (same instant) returns that same retired receipt and creates nothing.
    expect((await receipt(user, a.id, future)).id).toBe(r1.id);
    expect(await receiptsOf(a.id)).toBe(1);
    expect(await listedCurrent(a.id, r1.id)).toBe(false);
    // An independent positive on the bound row is labelled but never qualifies the retired performance.
    await grant(String(v1.id), delegate);
    await inspect(
      delegate,
      String(v1.id),
      await recordSha256(String(v1.id)),
      "shows_approved_content",
      observedAt,
    );
    live = await readRow(String(v1.id));
    expect(live).toMatchObject({
      verificationStatus: "approval_bound",
      independentStatus: "independently_inspected",
      verifiedEligible: false,
    });
    // A genuinely fresh declaration under revision 3 (a new instant, still within tolerance) restores the path.
    const r2 = (await receipt(user, a.id, await isoAt("+ interval '2 minutes 30 seconds'"))) as {
      id: string;
    };
    expect(r2.id).not.toBe(r1.id);
    expect(await listedCurrent(a.id, r2.id)).toBe(true);
    const v2 = await saveChange(changeRecord(a, user), bindingOf(a, r2), {
      expectedVersion: 1,
      expectedHeadId: String(v1.id),
    });
    expect(v2).toMatchObject({ version: 2, verificationStatus: "receipt_recorded" });
    await grant(String(v2.id), delegate);
    await inspect(
      delegate,
      String(v2.id),
      await recordSha256(String(v2.id)),
      "shows_approved_content",
      await isoAt("+ interval '4 minutes'"),
    );
    expect(await readRow(String(v2.id))).toMatchObject({
      verificationStatus: "receipt_recorded",
      independentStatus: "independently_inspected",
      verifiedEligible: true,
    });
    // ---- delegate path: a re-decision under moved authority is a new revision and retires the declaration.
    const b = (await artifact({ p_reference: "google-business-profile:codex-u-delegate" })) as {
      id: string;
      artifactSha256: string;
      reference: string;
    };
    const d1 = await approve(delegate, b.id, b.artifactSha256, true);
    expect(d1).toMatchObject({ approved: true, approverKind: "delegate", revision: 1 });
    const bFuture = await isoAt("+ interval '2 minutes'");
    const rb = (await receipt(delegate, b.id, bFuture)) as { id: string };
    expect(await listedCurrent(b.id, rb.id)).toBe(true);
    const w1 = await saveChange(
      changeRecord(b, delegate, { improvementId: IMP2 }),
      bindingOf(b, rb),
    );
    expect(w1).toMatchObject({ version: 1, verificationStatus: "receipt_recorded" });
    await db.query("UPDATE project_team_members SET revision=revision+1 WHERE actor_id=$1", [
      delegate,
    ]);
    // Moved authority: not currently approved → the row collapses live; the receipt is not current.
    expect((await readRow(String(w1.id))).verificationStatus).toBe("unverified");
    expect(await listedCurrent(b.id, rb.id)).toBe(false);
    // Explicit delegate re-approval at the current head: revision 2, and the old declaration stays retired.
    const d2 = await approve(delegate, b.id, b.artifactSha256, true, { expectedRevision: 1 });
    expect(d2).toMatchObject({ approved: true, revision: 2, replayed: false });
    expect(String(d2.approvedAt) < bFuture).toBe(true);
    expect(await listedCurrent(b.id, rb.id)).toBe(false);
    expect(await readRow(String(w1.id))).toMatchObject({
      verificationStatus: "approval_bound",
      verifiedEligible: false,
    });
    await expect(
      saveChange(
        changeRecord(b, delegate, { improvementId: IMP2, description: "re-bound" }),
        bindingOf(b, rb),
        { expectedVersion: 1, expectedHeadId: String(w1.id) },
      ),
    ).rejects.toThrow("citation_improvement_binding_receipt_stale");
    const rb2 = (await receipt(
      delegate,
      b.id,
      await isoAt("+ interval '2 minutes 30 seconds'"),
    )) as {
      id: string;
    };
    expect(await listedCurrent(b.id, rb2.id)).toBe(true);
    expect(
      await saveChange(changeRecord(b, delegate, { improvementId: IMP2 }), bindingOf(b, rb2), {
        expectedVersion: 1,
        expectedHeadId: String(w1.id),
      }),
    ).toMatchObject({ version: 2, verificationStatus: "receipt_recorded" });
  });
});

describe("BB (PR157 finding 4125916509): actor and target admission precede the owner locks", () => {
  // The two owner locks (assert_knowledge_project(...,true) → workspace FOR UPDATE; citation_lock_account →
  // account FOR UPDATE) are wrapped, for THIS block only, with a probe that records every locking call and can
  // run an injected statement at the account lock — i.e. AFTER the optimistic admission and BEFORE the
  // authoritative re-checks. PGlite is one connection, so a genuinely concurrent revoke cannot be scheduled; the
  // injection models the interleaving at the exact point where it matters. The original definitions are restored
  // and verified byte-for-byte afterwards. This proves ORDER (what is reached), not production lock waits.
  const saved: Array<{ name: string; def: string }> = [];
  // Sequences, not rows: a refused RPC rolls its statement back, and a probe row would vanish with it, whereas
  // nextval() is never rolled back — so the counters truthfully show the locks a FAILING call reached.
  const counters = async () => {
    const r = await db.query<{ a: string; c: string }>(
      "SELECT (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.bb_probe_workspace_lock) a, (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.bb_probe_account_lock) c",
    );
    return { a: Number(r.rows[0].a), c: Number(r.rows[0].c) };
  };
  let base = { a: 0, c: 0 };
  const probe = async () => {
    const now = await counters();
    const out: Record<string, number> = {};
    if (now.a - base.a) out.assert_knowledge_project = now.a - base.a;
    if (now.c - base.c) out.citation_lock_account = now.c - base.c;
    return out;
  };
  const clearProbe = async () => {
    await db.exec("DELETE FROM bb_lock_injection;");
    base = await counters();
  };
  const inject = (sql: string) => db.query("INSERT INTO bb_lock_injection(sql) VALUES($1)", [sql]);
  const raw = async (name: string, args: Record<string, unknown>) => {
    try {
      await call(name, args);
      return "ok";
    } catch (e) {
      return String((e as Error).message);
    }
  };
  const NONE = {};
  const BOTH = { assert_knowledge_project: 1, citation_lock_account: 1 };
  const approveArgs = (actor: string, artifactId: string, sha: string, approved = true) => ({
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_artifact: artifactId,
    p_expected_sha: sha,
    p_approved: approved,
    p_expected_revision: 1,
    p_request: crypto.randomUUID(),
  });
  const receiptArgs = (actor: string, artifactId: string, performedAt: string) => ({
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_artifact: artifactId,
    p_performed_at: performedAt,
  });
  const inspectArgs = (actor: string, rowId: string, sha: string, observedAt: string) => ({
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_row: rowId,
    p_expected_sha: sha,
    p_check: "shows_approved_content",
    p_observed_at: observedAt,
    p_expected_version: 0,
    p_expected_head: null,
  });
  /** Owner-approved and owner-performed artifact bound to an improvement row; the delegate is assigned. */
  const delivered = async () => {
    await seedTeam();
    const a = await artifact();
    const sha = String(a.artifactSha256);
    await approve(user, String(a.id), sha);
    const r = await receipt(user, String(a.id), await isoAt("+ interval '1 second'"));
    const v1 = await saveChange(changeRecord(a as never, user), {
      artifactId: a.id,
      artifactSha256: a.artifactSha256,
      receiptId: r.id,
      ownerInspection: null,
    });
    const rowSha = await recordSha(String(v1.id));
    await grant(String(v1.id), delegate);
    const observedAt = await isoAt("+ interval '2 seconds'");
    return { a, sha, rowId: String(v1.id), rowSha, observedAt };
  };
  beforeAll(async () => {
    await db.exec(
      "CREATE SEQUENCE public.bb_probe_workspace_lock; CREATE SEQUENCE public.bb_probe_account_lock; CREATE TABLE public.bb_lock_injection(sql text NOT NULL);",
    );
    for (const sig of [
      "assert_knowledge_project(uuid,text,boolean)",
      "citation_lock_account(uuid)",
    ]) {
      const def = (
        await db.query<{ d: string }>(`SELECT pg_get_functiondef('public.${sig}'::regprocedure) d`)
      ).rows[0].d;
      saved.push({ name: sig, def });
    }
    const wrap = (def: string, prologue: string, declare = "") => {
      const marker = "AS $function$\nBEGIN\n";
      expect(def.split(marker)).toHaveLength(2);
      return def.replace(marker, `AS $function$\n${declare}BEGIN\n${prologue}`);
    };
    // Same bodies as released, plus the probe (and, for the account lock, the injected interleaving).
    await db.exec(
      wrap(
        saved[0].def,
        "  IF p_lock THEN PERFORM nextval('public.bb_probe_workspace_lock'); END IF;\n",
      ),
    );
    await db.exec(
      wrap(
        saved[1].def,
        "  PERFORM nextval('public.bb_probe_account_lock');\n  FOR inj IN DELETE FROM public.bb_lock_injection RETURNING sql LOOP EXECUTE inj.sql; END LOOP;\n",
        "DECLARE inj record;\n",
      ),
    );
  });
  afterAll(async () => {
    for (const s of saved) await db.exec(s.def);
    for (const s of saved)
      expect(
        (
          await db.query<{ d: string }>(
            `SELECT pg_get_functiondef('public.${s.name}'::regprocedure) d`,
          )
        ).rows[0].d,
      ).toBe(s.def);
    await db.exec(
      "DROP SEQUENCE public.bb_probe_workspace_lock; DROP SEQUENCE public.bb_probe_account_lock; DROP TABLE public.bb_lock_injection;",
    );
  });
  beforeEach(clearProbe);

  it("positive control: valid owner and delegate mutations, frozen replays and identical declarations still take BOTH owner locks and are re-checked there", async () => {
    const { a, sha, rowId, rowSha, observedAt } = await delivered();
    // Assigned inspector (while the owner is still the approver and performer): admitted lock-free, receipt
    // written under the locks.
    await clearProbe();
    expect(
      await call(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, rowId, rowSha, observedAt),
      ),
    ).toMatchObject({ version: 1, checkResult: "shows_approved_content" });
    expect(await probe()).toEqual(BOTH);
    // Owner approval (a real mutation: approve → revoke) reaches both locks.
    await clearProbe();
    const revoke = approveArgs(user, String(a.id), sha, false);
    await call("set_ai_citation_change_approval", revoke);
    expect(await probe()).toEqual(BOTH);
    // Frozen replay of that decision: the historical result, decided UNDER the locks as before (no pre-lock
    // idempotency was added — the R2/1 live-authorization-before-replay order is untouched).
    await clearProbe();
    expect(await call("set_ai_citation_change_approval", revoke)).toMatchObject({
      approved: false,
      replayed: true,
    });
    expect(await probe()).toEqual(BOTH);
    // Delegate re-approval at the new head: admitted lock-free, then serialized and stamped under the locks.
    await clearProbe();
    const again = await call("set_ai_citation_change_approval", {
      ...approveArgs(delegate, String(a.id), sha, true),
      p_expected_revision: 2,
    });
    expect(again).toMatchObject({ approved: true, approverKind: "delegate", revision: 3 });
    expect(await probe()).toEqual(BOTH);
    // Delegate performed declaration, and its identical (lost-response) retry: one receipt, locks taken twice.
    const performedAt = await isoAt("+ interval '3 seconds'");
    await clearProbe();
    const r1 = await call(
      "save_ai_citation_change_receipt",
      receiptArgs(delegate, String(a.id), performedAt),
    );
    expect(r1).toMatchObject({ performerKind: "delegate" });
    expect(await probe()).toEqual(BOTH);
    await clearProbe();
    expect(
      (
        await call(
          "save_ai_citation_change_receipt",
          receiptArgs(delegate, String(a.id), performedAt),
        )
      ).id,
    ).toBe(r1.id);
    expect(await probe()).toEqual(BOTH);
  });

  it("a non-member, another owner, a revoked/expired/banned/deleted member, a disabled policy, a foreign project or an unknown owner never reach either owner lock (forbidden, no oracle)", async () => {
    const { a, sha, rowId, rowSha, observedAt } = await delivered();
    const withOver = (args: Record<string, unknown>, over: Record<string, unknown>) => ({
      ...args,
      ...Object.fromEntries(Object.entries(over).filter(([k]) => k in args)),
    });
    const attempt = async (actor: string, over: Record<string, unknown> = {}) => {
      await clearProbe();
      const ap = await raw(
        "set_ai_citation_change_approval",
        withOver(approveArgs(actor, String(a.id), sha, false), over),
      );
      expect(await probe()).toEqual(NONE);
      const rc = await raw(
        "save_ai_citation_change_receipt",
        withOver(receiptArgs(actor, String(a.id), await isoAt("+ interval '1 second'")), over),
      );
      expect(await probe()).toEqual(NONE);
      const ins = await raw(
        "save_ai_citation_improvement_inspection",
        withOver(inspectArgs(actor, rowId, rowSha, observedAt), over),
      );
      expect(await probe()).toEqual(NONE);
      return [ap, rc, ins];
    };
    const FORBIDDEN = [
      "citation_change_forbidden",
      "citation_change_forbidden",
      "citation_inspection_forbidden",
    ];
    expect(await attempt(stranger)).toEqual(FORBIDDEN);
    expect(await attempt(other)).toEqual(FORBIDDEN);
    // The SAME refusal for a random artifact/row id from a non-member: existence is never disclosed.
    expect(
      await attempt(stranger, { p_artifact: crypto.randomUUID(), p_row: crypto.randomUUID() }),
    ).toEqual(FORBIDDEN);
    // An unknown owner id / a project the actor is not a member of.
    expect(await attempt(delegate, { p_owner: "00000000-0000-4000-8000-0000000000ff" })).toEqual(
      FORBIDDEN,
    );
    expect(await attempt(delegate, { p_project: "q" })).toEqual(FORBIDDEN);
    // Revoked, expired, banned, deleted, policy disabled — each refused lock-free, each restored after.
    await db.query(
      "UPDATE project_team_members SET active=false,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    expect(await attempt(delegate)).toEqual(FORBIDDEN);
    await db.query(
      "UPDATE project_team_members SET active=true,expires_at=clock_timestamp() - interval '1 second',revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    expect(await attempt(delegate)).toEqual(FORBIDDEN);
    await db.query(
      "UPDATE project_team_members SET expires_at=NULL,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp() + interval '1 day' WHERE id=$1",
      [delegate],
    );
    expect(await attempt(delegate)).toEqual(FORBIDDEN);
    await db.query(
      "UPDATE auth.users SET banned_until=NULL,deleted_at=clock_timestamp() WHERE id=$1",
      [delegate],
    );
    expect(await attempt(delegate)).toEqual(FORBIDDEN);
    await db.query("UPDATE auth.users SET deleted_at=NULL WHERE id=$1", [delegate]);
    await db.query(
      "UPDATE project_team_approval_policy SET mode='disabled',revision=revision+1 WHERE owner_id=$1",
      [user],
    );
    expect(await attempt(delegate)).toEqual(FORBIDDEN);
    await db.query(
      "UPDATE project_team_approval_policy SET mode='separate_reviewers',revision=revision+1 WHERE owner_id=$1",
      [user],
    );
    // Restored authority: the same delegate is admitted again and the locks are reached (control).
    await clearProbe();
    expect(
      await raw("set_ai_citation_change_approval", approveArgs(delegate, String(a.id), sha, false)),
    ).toBe("ok");
    expect(await probe()).toEqual(BOTH);
  });

  it("an admitted actor with a random/foreign/stale target, an unapproved artifact, an out-of-window instant or no row assignment is refused BEFORE the locks with the locked section's own errors", async () => {
    const { a, sha, rowId, rowSha, observedAt } = await delivered();
    const refused = async (name: string, args: Record<string, unknown>, error: string) => {
      await clearProbe();
      expect(await raw(name, args)).toMatch(error);
      expect(await probe()).toEqual(NONE);
    };
    const random = crypto.randomUUID();
    // Approval: unknown artifact (delegate AND owner), foreign owner's artifact id, stale digest.
    await refused(
      "set_ai_citation_change_approval",
      approveArgs(delegate, random, sha, false),
      "citation_change_unavailable",
    );
    await refused(
      "set_ai_citation_change_approval",
      approveArgs(user, random, sha, false),
      "citation_change_unavailable",
    );
    const foreign = await call("save_ai_citation_change_artifact", {
      p_user: other,
      p_project: "p",
      p_kind: "listing",
      p_reference: "google-business-profile:other",
      p_fields: LISTING_FIELDS,
    });
    await refused(
      "set_ai_citation_change_approval",
      approveArgs(delegate, String(foreign.id), String(foreign.artifactSha256), false),
      "citation_change_unavailable",
    );
    await refused(
      "set_ai_citation_change_approval",
      approveArgs(delegate, String(a.id), "b".repeat(64), false),
      "citation_change_stale",
    );
    // Receipt: unknown artifact, an artifact that was never approved, an instant before the approval, an instant
    // too far in the future.
    const t = await isoAt("+ interval '1 second'");
    await refused(
      "save_ai_citation_change_receipt",
      receiptArgs(delegate, random, t),
      "citation_change_unavailable",
    );
    const unapproved = await artifact({ p_reference: "google-business-profile:acme-lund" });
    await refused(
      "save_ai_citation_change_receipt",
      receiptArgs(delegate, String(unapproved.id), t),
      "citation_change_unapproved",
    );
    await refused(
      "save_ai_citation_change_receipt",
      receiptArgs(delegate, String(a.id), "2020-01-01T00:00:00Z"),
      "citation_change_receipt_invalid",
    );
    await refused(
      "save_ai_citation_change_receipt",
      receiptArgs(delegate, String(a.id), await isoAt("+ interval '1 hour'")),
      "citation_change_receipt_invalid",
    );
    // Inspection: an eligible member WITHOUT an assignment, an assigned member on a random row (same error), a
    // stale digest, and a revoked assignment.
    await refused(
      "save_ai_citation_improvement_inspection",
      inspectArgs(inspector2, rowId, rowSha, observedAt),
      "citation_improvement_unavailable",
    );
    await refused(
      "save_ai_citation_improvement_inspection",
      inspectArgs(delegate, random, rowSha, observedAt),
      "citation_improvement_unavailable",
    );
    await refused(
      "save_ai_citation_improvement_inspection",
      inspectArgs(delegate, rowId, "c".repeat(64), observedAt),
      "citation_inspection_stale",
    );
    await call("revoke_ai_citation_inspection_assignment", {
      p_owner: user,
      p_project: "p",
      p_row: rowId,
      p_inspector: delegate,
    });
    await refused(
      "save_ai_citation_improvement_inspection",
      inspectArgs(delegate, rowId, rowSha, observedAt),
      "citation_improvement_unavailable",
    );
    // Missing-workspace tripwire (the established convention): with the owner's account row gone, a refused
    // request still fails with ITS error, while an admitted mutation fails at the (now unavailable) lock.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    await refused(
      "set_ai_citation_change_approval",
      approveArgs(stranger, String(a.id), sha, false),
      "citation_change_forbidden",
    );
    await clearProbe();
    expect(
      await raw("set_ai_citation_change_approval", approveArgs(delegate, String(a.id), sha, false)),
    ).toMatch("citation_record_unavailable");
    expect(await probe()).toEqual(BOTH);
  });

  it("authority revoked BETWEEN the optimistic admission and the locked check is caught under the lock: membership revoke, account ban and assignment revoke each refuse the write with nothing recorded", async () => {
    const { a, sha, rowId, rowSha, observedAt } = await delivered();
    const decisions = async () =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_change_approval_decisions WHERE artifact_id=$1",
          [a.id],
        )
      ).rows[0].n;
    const receipts = async () =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_change_receipts WHERE artifact_id=$1",
          [a.id],
        )
      ).rows[0].n;
    const inspections = async () =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_improvement_inspections WHERE improvement_row_id=$1",
          [rowId],
        )
      ).rows[0].n;
    const before = { d: await decisions(), r: await receipts(), i: await inspections() };
    // 1. Membership revoked at the lock: the delegate's approval was admitted optimistically, reached BOTH locks,
    //    and was refused by the authoritative re-check — no decision, no approval change.
    await clearProbe();
    await inject(
      "UPDATE public.project_team_members SET active=false,revision=revision+1 WHERE actor_id='" +
        delegate +
        "'",
    );
    expect(
      await raw("set_ai_citation_change_approval", approveArgs(delegate, String(a.id), sha, false)),
    ).toMatch("citation_change_forbidden");
    expect(await probe()).toEqual(BOTH);
    expect(await decisions()).toBe(before.d);
    expect(await provenance(String(a.id))).toMatchObject({
      approved: true,
      approverKind: "owner",
      revision: 1,
    });
    await db.query(
      "UPDATE project_team_members SET active=true,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    // 2. Actor banned at the lock: the receipt was admitted optimistically and refused by the FOR SHARE probe
    //    under the lock — no receipt.
    await clearProbe();
    await inject(
      "UPDATE auth.users SET banned_until=clock_timestamp() + interval '1 day' WHERE id='" +
        delegate +
        "'",
    );
    expect(
      await raw(
        "save_ai_citation_change_receipt",
        receiptArgs(delegate, String(a.id), await isoAt("+ interval '1 second'")),
      ),
    ).toMatch(/team_project_unavailable|citation_change_forbidden/);
    expect(await probe()).toEqual(BOTH);
    expect(await receipts()).toBe(before.r);
    await db.query("UPDATE auth.users SET banned_until=NULL WHERE id=$1", [delegate]);
    // 3. Assignment revoked at the lock: the inspection was admitted optimistically and refused by the
    //    authoritative assignment read — no inspection receipt.
    await clearProbe();
    await inject(
      "UPDATE public.ai_citation_inspection_assignments SET active=false,revoked_at=clock_timestamp() WHERE improvement_row_id='" +
        rowId +
        "' AND inspector_id='" +
        delegate +
        "'",
    );
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, rowId, rowSha, observedAt),
      ),
    ).toMatch("citation_improvement_unavailable");
    expect(await probe()).toEqual(BOTH);
    expect(await inspections()).toBe(before.i);
    // A refused call rolls the injection's DELETE back too, so the row is cleared explicitly; with the authority
    // restored the same requests succeed (control).
    await clearProbe();
    await grant(rowId, delegate);
    await clearProbe();
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, rowId, rowSha, observedAt),
      ),
    ).toBe("ok");
    expect(await probe()).toEqual(BOTH);
    await clearProbe();
    expect(
      await raw("set_ai_citation_change_approval", approveArgs(delegate, String(a.id), sha, false)),
    ).toBe("ok");
    expect(await probe()).toEqual(BOTH);
  });
});

describe("BE (finding 4126249230): receipt writes are bounded to the readable per-artifact capacity", () => {
  const readState = () =>
    call("read_ai_citation_change_artifacts", { p_user: user, p_project: "p" });
  const receiptsOf = async (artifactId: string, owner = user) =>
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM ai_citation_change_receipts WHERE user_id=$1 AND artifact_id=$2 AND artifact_deleted_at IS NULL",
        [owner, artifactId],
      )
    ).rows[0].n;
  /** The approval instant the receipt chronology is measured against (approvals.updated_at, server clock). */
  const approvalAt = async (artifactId: string, owner = user) =>
    new Date(
      (
        await db.query<{ t: string }>(
          "SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') t FROM ai_citation_change_approvals WHERE user_id=$1 AND artifact_id=$2",
          [owner, artifactId],
        )
      ).rows[0].t,
    );
  /** A declared instant `ms` after a given approval instant (millisecond precision, always after it). */
  const after = (base: Date, ms: number) => new Date(base.getTime() + ms).toISOString();
  it("1000 distinct declarations read and parse; the 1001st is refused without a row; a frozen retry, revoke/re-approve chronology, the owner's removal, a second artifact and another owner behave as designed", async () => {
    // DETERMINISTIC CHRONOLOGY (BH): every declared instant is derived from the approval instant it must follow
    // (read back from the database), never from the test's wall clock, so the admission rule
    // `performed_at >= approvals.updated_at` holds by construction however long the run takes. Instants stay far
    // below the +5-minute upper bound (at most approval + 2 minutes; the whole test runs in seconds).
    await seedTeam();
    const a = await artifact();
    const sha = String(a.artifactSha256);
    await approve(user, String(a.id), sha);
    const appr1 = await approvalAt(String(a.id));
    // 999 distinct instants 1.000–1.998 s after the approval, plus ONE deliberately skewed declaration (index 999)
    // 2 minutes after it — a permitted clock-skew instant that will still satisfy chronology after a later
    // re-approval and therefore replays its OLD stamped receipt (the U rule: stamped revision, never current).
    const instant = (i: number) => (i === 999 ? after(appr1, 120_000) : after(appr1, 1000 + i));
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++)
      ids.push(String((await receipt(delegate, String(a.id), instant(i))).id));
    expect(new Set(ids).size).toBe(1000);
    expect(await receiptsOf(String(a.id))).toBe(1000);
    const state = await readState();
    const target = (state.artifacts as Array<{ id: string; receipts: unknown[] }>).find(
      (x) => x.id === a.id,
    )!;
    expect(target.receipts).toHaveLength(1000);
    expect(changeArtifactsStateSchema.safeParse(state).success).toBe(true);
    // The 1001st DISTINCT declaration — delegate or owner, fresh eligible instants — is refused at capacity with
    // no extra row, and the state stays readable.
    await expect(receipt(delegate, String(a.id), after(appr1, 3000))).rejects.toThrow(
      "citation_change_receipt_capacity",
    );
    await expect(receipt(user, String(a.id), after(appr1, 3001))).rejects.toThrow(
      "citation_change_receipt_capacity",
    );
    expect(await receiptsOf(String(a.id))).toBe(1000);
    expect(changeArtifactsStateSchema.safeParse(await readState()).success).toBe(true);
    // A frozen (lost-response) retry of an existing declaration at full capacity, under the UNCHANGED approval,
    // returns ITS receipt unchanged.
    expect(String((await receipt(delegate, String(a.id), instant(500))).id)).toBe(ids[500]);
    expect(await receiptsOf(String(a.id))).toBe(1000);
    // Live approval semantics are untouched: revoke → every receipt reads as not current.
    await approve(user, String(a.id), sha, false);
    const revoked = (
      (await readState()).artifacts as Array<{ id: string; receipts: Array<{ current: boolean }> }>
    ).find((x) => x.id === a.id)!;
    expect(revoked.receipts).toHaveLength(1000);
    expect(revoked.receipts.every((r) => r.current === false)).toBe(true);
    // Re-approve, then PIN the renewed approval instant to exactly 30 s after the first one (an explicit fixture
    // timestamp: the re-approval's real server instant would fall an unpredictable few seconds after appr1, which
    // is what made the old wall-clock chronology flaky). Every ordinary instant (≤ appr1 + 2 s) is now BEFORE the
    // renewed approval; only the skewed one (appr1 + 120 s) is after it.
    await approve(user, String(a.id), sha, true);
    await db.query(
      "UPDATE ai_citation_change_approvals SET updated_at=$2::timestamptz WHERE user_id=$1 AND artifact_id=$3",
      [user, after(appr1, 30_000), a.id],
    );
    const appr2 = await approvalAt(String(a.id));
    expect(appr2.getTime()).toBe(appr1.getTime() + 30_000);
    // (a) The old declaration's instant is before the renewed approval: its retry is refused by chronology
    //     admission — before the digest lookup — with no row, exactly as a fresh out-of-window declaration.
    await expect(receipt(delegate, String(a.id), instant(500))).rejects.toThrow(
      "citation_change_receipt_invalid",
    );
    expect(await receiptsOf(String(a.id))).toBe(1000);
    // (b) The permitted clock-skew declaration still passes chronology and returns only its OLD stamped receipt
    //     (same id, the first approval revision), which reads as NOT current under the renewed approval; it never
    //     becomes current and never mints a new receipt.
    const skew = await receipt(delegate, String(a.id), instant(999));
    expect(String(skew.id)).toBe(ids[999]);
    expect(await receiptsOf(String(a.id))).toBe(1000);
    const skewRow = (
      await db.query<{ approval_revision: number }>(
        "SELECT approval_revision::int FROM ai_citation_change_receipts WHERE id=$1",
        [ids[999]],
      )
    ).rows[0];
    expect(skewRow.approval_revision).toBe(1);
    const renewed = (
      (await readState()).artifacts as Array<{
        id: string;
        receipts: Array<{ id: string; current: boolean }>;
      }>
    ).find((x) => x.id === a.id)!;
    expect(renewed.receipts.find((r) => r.id === ids[999])?.current).toBe(false);
    expect(renewed.receipts.every((r) => r.current === false)).toBe(true);
    // (c) A genuinely NEW declaration under the renewed approval (fresh eligible instant) is still refused at
    //     capacity — history is never truncated.
    await expect(receipt(delegate, String(a.id), after(appr2, 1000))).rejects.toThrow(
      "citation_change_receipt_capacity",
    );
    // A second artifact of the same project and another owner's artifact are unaffected (each declared after
    // its OWN approval instant).
    const b = await artifact({ p_reference: "google-business-profile:acme-lund" });
    await approve(user, String(b.id), String(b.artifactSha256));
    expect(
      (await receipt(delegate, String(b.id), after(await approvalAt(String(b.id)), 1000)))
        .artifactId,
    ).toBe(b.id);
    const foreign = await call("save_ai_citation_change_artifact", {
      p_user: other,
      p_project: "p",
      p_kind: "listing",
      p_reference: "google-business-profile:other",
      p_fields: LISTING_FIELDS,
    });
    await call("set_ai_citation_change_approval", {
      p_actor: other,
      p_owner: other,
      p_project: "p",
      p_artifact: foreign.id,
      p_expected_sha: foreign.artifactSha256,
      p_approved: true,
      p_expected_revision: 0,
      p_request: crypto.randomUUID(),
    });
    expect(
      (
        await call("save_ai_citation_change_receipt", {
          p_actor: other,
          p_owner: other,
          p_project: "p",
          p_artifact: foreign.id,
          p_performed_at: after(await approvalAt(String(foreign.id), other), 1000),
        })
      ).artifactId,
    ).toBe(foreign.id);
    expect(await receiptsOf(String(a.id))).toBe(1000);
    // The owner's existing explicit removal frees ONE slot: a fresh distinct declaration under the current
    // (renewed) approval succeeds, the state parses again at 1000, and the next distinct one is refused again.
    await call("remove_ai_citation_change_receipt", { p_user: user, p_project: "p", p_id: ids[0] });
    expect(await receiptsOf(String(a.id))).toBe(999);
    const fresh = await receipt(delegate, String(a.id), after(appr2, 2000));
    expect(ids).not.toContain(String(fresh.id));
    expect(await receiptsOf(String(a.id))).toBe(1000);
    const recovered = (
      (await readState()).artifacts as Array<{
        id: string;
        receipts: Array<{ id: string; current: boolean }>;
      }>
    ).find((x) => x.id === a.id)!;
    expect(recovered.receipts.find((r) => r.id === fresh.id)?.current).toBe(true);
    expect(changeArtifactsStateSchema.safeParse(await readState()).success).toBe(true);
    await expect(receipt(delegate, String(a.id), after(appr2, 3000))).rejects.toThrow(
      "citation_change_receipt_capacity",
    );
    // BB admission is intact at capacity: a revoked member is refused BEFORE the owner locks (missing-workspace
    // tripwire: the lock would fail with citation_record_unavailable if it were reached), and so is a stranger.
    await db.query(
      "UPDATE project_team_members SET active=false,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    await expect(receipt(delegate, String(a.id), after(appr2, 4000))).rejects.toThrow(
      "citation_change_forbidden",
    );
    await expect(receipt(stranger, String(a.id), after(appr2, 4000))).rejects.toThrow(
      "citation_change_forbidden",
    );
    // …while an ADMITTED distinct declaration at capacity reaches the lock (refused there by the tripwire, not
    // silently accepted) — the capacity decision itself lives under the lock.
    await expect(receipt(user, String(a.id), after(appr2, 5000))).rejects.toThrow(
      "citation_record_unavailable",
    );
    expect(await receiptsOf(String(a.id))).toBe(1000);
  }, 60000);
});

describe("BF (finding 4126284415): inspection writes are admitted under finite quota and retained capacity", () => {
  // Rollback-proof lock probes (sequences survive a refused statement) and an injection point at the account
  // lock, as in the BB block; PGlite is one connection, so the "concurrent" head is injected deterministically at
  // the lock — this proves the authoritative re-check, not real multi-session load.
  const saved: Array<{ name: string; def: string }> = [];
  const counters = async () => {
    const r = await db.query<{ a: string; c: string }>(
      "SELECT (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.bf_probe_workspace_lock) a, (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.bf_probe_account_lock) c",
    );
    return { a: Number(r.rows[0].a), c: Number(r.rows[0].c) };
  };
  let base = { a: 0, c: 0 };
  const probe = async () => {
    const now = await counters();
    const out: Record<string, number> = {};
    if (now.a - base.a) out.assert_knowledge_project = now.a - base.a;
    if (now.c - base.c) out.citation_lock_account = now.c - base.c;
    return out;
  };
  const clearProbe = async () => {
    await db.exec("DELETE FROM bf_lock_injection;");
    base = await counters();
  };
  const NONE = {};
  const BOTH = { assert_knowledge_project: 1, citation_lock_account: 1 };
  const raw = async (name: string, args: Record<string, unknown>) => {
    try {
      await call(name, args);
      return "ok";
    } catch (e) {
      return String((e as Error).message);
    }
  };
  const extra = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-0000000000b${i + 1}`);
  const heads = new Map<string, { version: number; id: string | null }>();
  const key = (actor: string, row: string) => `${actor}|${row}`;
  /** One real inspection write against the actor's tracked chain head; tracks the new head on success. */
  const record = async (
    actor: string,
    row: string,
    sha: string,
    check: string,
    observedAt: string | null,
  ) => {
    const h = heads.get(key(actor, row)) ?? { version: 0, id: null };
    const r = await call(
      "save_ai_citation_improvement_inspection",
      inspectArgs(actor, row, sha, check, observedAt, h),
    );
    heads.set(key(actor, row), { version: Number(r.version), id: String(r.id) });
    return r;
  };
  const inspectArgs = (
    actor: string,
    row: string,
    sha: string,
    check: string,
    observedAt: string | null,
    h = heads.get(key(actor, row)) ?? { version: 0, id: null },
  ) => ({
    p_actor: actor,
    p_owner: user,
    p_project: "p",
    p_row: row,
    p_expected_sha: sha,
    p_check: check,
    p_observed_at: observedAt,
    p_expected_version: h.version,
    p_expected_head: h.id,
  });
  const count = async (where: string, params: unknown[]) =>
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM ai_citation_improvement_inspections WHERE user_id=$1 AND project_id='p' AND ${where}`,
        [user, ...params],
      )
    ).rows[0].n;
  /** Moves every inspection of the owner's project out of the rolling hour (server-clock quota reset). */
  const ageOut = () =>
    db.query(
      "UPDATE ai_citation_improvement_inspections SET created_at=created_at - interval '2 hours' WHERE user_id=$1 AND project_id='p' AND created_at > clock_timestamp() - interval '1 hour'",
      [user],
    );
  /** BO: a subject's observation instant is derived from THAT subject's own chronology — the later of its receipt
   * anchor and current approval, read back from the database at microsecond precision — never from an instant the
   * test captured earlier. `isoAt` is whole seconds and 300 sequential writes exceeded its 2 s lead on CI, so an
   * instant captured before a subject was created predated that subject's anchor/approval and the applied guard
   * (`observed_at < greatest(anchor_at, approval_at)`) rightly refused it. */
  const subjectAt = async (owner: string, row: string, delta = "") =>
    (
      await db.query<{ t: string }>(
        `SELECT to_char((greatest(anchor_at,approval_at) ${delta}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') t FROM citation_improvement_actors($1::uuid,'p',$2::uuid)`,
        [owner, row],
      )
    ).rows[0].t;
  /** Owner-approved and owner-performed artifact bound to N improvement rows; every inspector assigned. */
  const rows = async (n: number, inspectors: string[]) => {
    const a = await artifact();
    await approve(user, String(a.id), String(a.artifactSha256));
    const r = await receipt(user, String(a.id), await isoAt("+ interval '1 second'"));
    const out: Array<{ id: string; sha: string }> = [];
    for (let i = 0; i < n; i++) {
      const v = await saveChange(
        changeRecord(a as never, user, {
          improvementId: `70000000-0000-4000-8000-0000000000${(10 + i).toString(16).padStart(2, "0")}`,
        }),
        {
          artifactId: a.id,
          artifactSha256: a.artifactSha256,
          receiptId: r.id,
          ownerInspection: null,
        },
      );
      const id = String(v.id);
      for (const insp of inspectors) await grant(id, insp);
      out.push({ id, sha: await recordSha(id) });
    }
    return out;
  };
  beforeAll(async () => {
    await db.query(
      `INSERT INTO auth.users(id) VALUES ${extra.map((_, i) => `($${i + 1})`).join(",")} ON CONFLICT DO NOTHING`,
      extra,
    );
    await db.exec(
      "CREATE SEQUENCE public.bf_probe_workspace_lock; CREATE SEQUENCE public.bf_probe_account_lock; CREATE TABLE public.bf_lock_injection(sql text NOT NULL);",
    );
    for (const sig of [
      "assert_knowledge_project(uuid,text,boolean)",
      "citation_lock_account(uuid)",
    ]) {
      const def = (
        await db.query<{ d: string }>(`SELECT pg_get_functiondef('public.${sig}'::regprocedure) d`)
      ).rows[0].d;
      saved.push({ name: sig, def });
    }
    const wrap = (def: string, prologue: string, declare = "") => {
      const marker = "AS $function$\nBEGIN\n";
      expect(def.split(marker)).toHaveLength(2);
      return def.replace(marker, `AS $function$\n${declare}BEGIN\n${prologue}`);
    };
    await db.exec(
      wrap(
        saved[0].def,
        "  IF p_lock THEN PERFORM nextval('public.bf_probe_workspace_lock'); END IF;\n",
      ),
    );
    await db.exec(
      wrap(
        saved[1].def,
        "  PERFORM nextval('public.bf_probe_account_lock');\n  FOR inj IN DELETE FROM public.bf_lock_injection RETURNING sql LOOP EXECUTE inj.sql; END LOOP;\n",
        "DECLARE inj record;\n",
      ),
    );
  });
  afterAll(async () => {
    for (const s of saved) await db.exec(s.def);
    for (const s of saved)
      expect(
        (
          await db.query<{ d: string }>(
            `SELECT pg_get_functiondef('public.${s.name}'::regprocedure) d`,
          )
        ).rows[0].d,
      ).toBe(s.def);
    await db.exec(
      "DROP SEQUENCE public.bf_probe_workspace_lock; DROP SEQUENCE public.bf_probe_account_lock; DROP TABLE public.bf_lock_injection;",
    );
  });
  beforeEach(async () => {
    heads.clear();
    await clearProbe();
  });

  it("actor quota: 60 heads in an hour, the 61st refused BEFORE the locks; a frozen retry replays at quota; another inspector is unaffected; a revoked actor is refused; ageing out resets", async () => {
    await seedTeam([
      [delegate, "reviewer"],
      [inspector2, "reviewer"],
    ]);
    const [{ id: row, sha }] = await rows(1, [delegate, inspector2]);
    const at = await isoAt("+ interval '2 seconds'");
    const ids: string[] = [];
    for (let i = 0; i < 60; i++)
      ids.push(
        String(
          (await record(delegate, row, sha, i % 2 ? "inconclusive" : "shows_approved_content", at))
            .id,
        ),
      );
    expect(await count("inspector_id=$2", [delegate])).toBe(60);
    // 61st distinct head: refused lock-free, no row, no lock.
    await clearProbe();
    const next = inspectArgs(delegate, row, sha, "inconclusive", at);
    expect(await raw("save_ai_citation_improvement_inspection", next)).toBe(
      "citation_inspection_quota",
    );
    expect(await probe()).toEqual(NONE);
    expect(await count("inspector_id=$2", [delegate])).toBe(60);
    // Frozen retry of the 60th declaration (its recorded head as the request identity): the original receipt,
    // decided under the locks, no new row, nothing spent.
    await clearProbe();
    const sixtieth = inspectArgs(delegate, row, sha, "inconclusive", at, {
      version: 59,
      id: ids[58],
    });
    expect(String((await call("save_ai_citation_improvement_inspection", sixtieth)).id)).toBe(
      ids[59],
    );
    expect(await probe()).toEqual(BOTH);
    expect(await count("inspector_id=$2", [delegate])).toBe(60);
    // Actor isolation: another assigned inspector still records (project quota not reached).
    await clearProbe();
    expect((await record(inspector2, row, sha, "does_not_show", at)).version).toBe(1);
    expect(await probe()).toEqual(BOTH);
    // Revoked member at quota: refused as forbidden before the locks (authorization precedes admission).
    await db.query(
      "UPDATE project_team_members SET active=false,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    await clearProbe();
    expect(await raw("save_ai_citation_improvement_inspection", next)).toBe(
      "citation_inspection_forbidden",
    );
    expect(await probe()).toEqual(NONE);
    await db.query(
      "UPDATE project_team_members SET active=true,revision=revision+1 WHERE actor_id=$1",
      [delegate],
    );
    // Server-clock reset: once the earlier heads are older than an hour the same request is admitted.
    await ageOut();
    await clearProbe();
    expect((await record(delegate, row, sha, "inconclusive", at)).version).toBe(61);
    expect(await probe()).toEqual(BOTH);
  });

  it("project quota: 300 heads across five inspectors in an hour, a sixth inspector's first head refused before the locks; another owner's project unaffected; ageing out resets", async () => {
    const five = extra;
    await seedTeam([
      [delegate, "reviewer"],
      ...five.map((x) => [x, "reviewer"] as [string, string]),
    ]);
    const [{ id: row, sha }] = await rows(1, [delegate, ...five]);
    const at = await isoAt("+ interval '2 seconds'");
    for (const insp of five)
      for (let i = 0; i < 60; i++)
        await record(insp, row, sha, i % 2 ? "inconclusive" : "shows_approved_content", at);
    expect(await count("true", [])).toBe(300);
    await clearProbe();
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, row, sha, "inconclusive", at),
      ),
    ).toBe("citation_inspection_quota");
    expect(await probe()).toEqual(NONE);
    expect(await count("true", [])).toBe(300);
    // Tenant isolation: the other owner's project counts nothing of this one (a member of other's project records
    // against other's own accepted finding).
    const scopeOther = { ownerId: other, projectId: "p" };
    await saveEvidencePrompt(
      scopeOther,
      PROMPT,
      0,
      {
        prompt: "Where can I book a massage in Lund?",
        intent: "discovery",
        source: "manual" as const,
        market: "Sweden",
        language: "sv-SE",
        brand: "Other Massage",
        websiteUrl: "https://other.example.com/",
        competitorUrls: [] as string[],
        active: true,
      },
      rpc,
    );
    const answerOther = await importAnswerEvidence(
      scopeOther,
      {
        promptId: PROMPT,
        promptRevision: 1,
        surface: "ChatGPT web",
        mode: "search" as const,
        method: "manual consumer session",
        modelVersion: null,
        capturedAt: "2024-03-01T00:00:00Z",
        status: "complete" as const,
        rawAnswer: "Other Massage in Lund is a good option to book.",
        citations: [] as string[],
        citationsComplete: true,
        failure: null,
        reportedCostUsd: null,
        sourceUrl: null,
        supersedesId: null,
      },
      rpc,
    );
    const baselineOther = await importAnswerEvidence(
      scopeOther,
      {
        promptId: PROMPT,
        promptRevision: 1,
        surface: "ChatGPT web",
        mode: "search" as const,
        method: "manual consumer session",
        modelVersion: null,
        capturedAt: "2024-04-01T00:00:00Z",
        status: "complete" as const,
        rawAnswer: "Other Massage in Lund is worth comparing.",
        citations: [] as string[],
        citationsComplete: true,
        failure: null,
        reportedCostUsd: null,
        sourceUrl: null,
        supersedesId: null,
      },
      rpc,
    );
    await saveCitationFinding(
      scopeOther,
      {
        scope: panelScope,
        finding: {
          ...finding(),
          evidence: [{ kind: "answer" as const, id: answerOther }],
          review: { reviewer: other, reviewedAt: now },
        },
        expectedVersion: 0,
        expectedHeadId: null,
      },
      rpc,
    );
    await db.query(
      "INSERT INTO project_team_approval_policy(owner_id,project_id,mode,revision) VALUES($1::uuid,'p','separate_reviewers',4)",
      [other],
    );
    await db.query(
      "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active,expires_at) VALUES($1::uuid,'p',$2::uuid,'reviewer',2,true,NULL)",
      [other, delegate],
    );
    const fa = await call("save_ai_citation_change_artifact", {
      p_user: other,
      p_project: "p",
      p_kind: "listing",
      p_reference: "google-business-profile:other",
      p_fields: LISTING_FIELDS,
    });
    await call("set_ai_citation_change_approval", {
      p_actor: other,
      p_owner: other,
      p_project: "p",
      p_artifact: fa.id,
      p_expected_sha: fa.artifactSha256,
      p_approved: true,
      p_expected_revision: 0,
      p_request: crypto.randomUUID(),
    });
    const fr = await call("save_ai_citation_change_receipt", {
      p_actor: other,
      p_owner: other,
      p_project: "p",
      p_artifact: fa.id,
      p_performed_at: await isoAt("+ interval '1 second'"),
    });
    const fv = await call("save_ai_citation_improvement_v4", {
      p_user: other,
      p_project: "p",
      p_record: changeRecord(fa as never, other, { baselineCaptureIds: [baselineOther] }),
      p_scope: panelScope,
      p_binding: null,
      p_change_binding: {
        artifactId: fa.id,
        artifactSha256: fa.artifactSha256,
        receiptId: fr.id,
        ownerInspection: null,
      },
      p_expected_version: 0,
      p_expected_head: null,
      p_expected_findings: null,
    });
    await call("grant_ai_citation_inspection_assignment", {
      p_owner: other,
      p_project: "p",
      p_row: fv.id,
      p_inspector: delegate,
    });
    const fsha = (
      await db.query<{ s: string }>(
        "SELECT record_sha256 s FROM ai_citation_improvements WHERE id=$1",
        [fv.id],
      )
    ).rows[0].s;
    // BO: this subject was created AFTER `at`, so its observation instant must follow ITS OWN anchor and approval
    // (server clock) and is derived from the subject, not reused from the earlier capture. Deterministic
    // regression, independent of host speed: an instant one second before that subject's chronology — what the
    // earlier capture became on a slow host — is refused under the locks as citation_inspection_invalid with no
    // row; the derived instant is admitted.
    const otherAt = await subjectAt(other, String(fv.id));
    const otherCount = async () =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM ai_citation_improvement_inspections WHERE user_id=$1",
          [other],
        )
      ).rows[0].n;
    await clearProbe();
    expect(
      await raw("save_ai_citation_improvement_inspection", {
        ...inspectArgs(
          delegate,
          String(fv.id),
          fsha,
          "inconclusive",
          await subjectAt(other, String(fv.id), "- interval '1 second'"),
          { version: 0, id: null },
        ),
        p_owner: other,
      }),
    ).toBe("citation_inspection_invalid");
    expect(await probe()).toEqual(BOTH);
    expect(await otherCount()).toBe(0);
    await clearProbe();
    expect(
      (
        await call("save_ai_citation_improvement_inspection", {
          ...inspectArgs(delegate, String(fv.id), fsha, "inconclusive", otherAt, {
            version: 0,
            id: null,
          }),
          p_owner: other,
        })
      ).version,
    ).toBe(1);
    expect(await probe()).toEqual(BOTH);
    expect(await otherCount()).toBe(1);
    expect(await count("true", [])).toBe(300);
    await ageOut();
    await clearProbe();
    expect((await record(delegate, row, sha, "inconclusive", at)).version).toBe(1);
    expect(await probe()).toEqual(BOTH);
  });

  it("under-lock re-check: a head committed between the optimistic admission and the lock (injected at the account lock) makes the admitted request refuse at quota with no overshoot", async () => {
    await seedTeam([[delegate, "reviewer"]]);
    const [{ id: row, sha }] = await rows(1, [delegate]);
    const at = await isoAt("+ interval '2 seconds'");
    for (let i = 0; i < 59; i++)
      await record(delegate, row, sha, i % 2 ? "inconclusive" : "shows_approved_content", at);
    const h = heads.get(key(delegate, row))!;
    // The "other session's" 60th head, inserted at the lock with a fresh digest and the next version.
    await clearProbe();
    await db.query("INSERT INTO bf_lock_injection(sql) VALUES($1)", [
      `INSERT INTO public.ai_citation_improvement_inspections(user_id,project_id,improvement_row_id,improvement_sha256,inspector_id,inspector_role,policy_mode,policy_revision,membership_revision,assignment_revision,version,supersedes_id,expected_version,expected_head,check_result,observed_at,observed_reference,digest) VALUES('${user}','p','${row}','${sha}','${delegate}','reviewer','separate_reviewers',4,2,1,60,'${h.id}',59,'${h.id}','inconclusive',clock_timestamp(),'x',encode(sha256(convert_to('${crypto.randomUUID()}','UTF8')),'hex'))`,
    ]);
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, row, sha, "shows_approved_content", at),
      ),
    ).toBe("citation_inspection_quota");
    expect(await probe()).toEqual(BOTH);
    // The refused statement rolls back — including the head injected inside it (a real other session's head
    // would be its own committed transaction) — so 59 remain and the 60th slot was never overshot to 61.
    expect(await count("inspector_id=$2", [delegate])).toBe(59);
    await db.exec("DELETE FROM bf_lock_injection"); // the rolled-back DELETE left the injection row; clear it
  });

  it("row and project capacity: observations stop at 900 per row and 9000 per project while withdrawals keep the reserved 10 %; dissent, heads and the owner/inspector reads stay intact and parseable", async () => {
    await seedTeam([
      [delegate, "reviewer"],
      [inspector2, "reviewer"],
    ]);
    const ten = await rows(10, [delegate, inspector2]);
    const at = await isoAt("+ interval '2 seconds'");
    // Active dissent on the first row, recorded before capacity.
    const dissent = await record(inspector2, ten[0].id, ten[0].sha, "does_not_show", at);
    // Row 0 is filled with REAL writes by the delegate to exactly 900 heads (every 60 writes the hour is aged
    // out so only capacity gates); rows 1..9 carry schema-valid retained history inserted directly (900 delegate
    // heads each, older than an hour) so the project reaches 9000 without 8100 more RPC round trips.
    for (let i = 1, n = 0; i < 900; i++) {
      if (n++ % 60 === 0) await ageOut();
      await record(
        delegate,
        ten[0].id,
        ten[0].sha,
        i % 2 ? "inconclusive" : "shows_approved_content",
        at,
      );
    }
    expect(await count("improvement_row_id=$2", [ten[0].id])).toBe(900);
    for (const { id, sha } of ten.slice(1))
      await db.query(
        `INSERT INTO ai_citation_improvement_inspections(user_id,project_id,improvement_row_id,improvement_sha256,inspector_id,inspector_role,policy_mode,policy_revision,membership_revision,assignment_revision,version,expected_version,expected_head,check_result,observed_at,observed_reference,digest,created_at)
         SELECT $1::uuid,'p',$2::uuid,$3::text,$4::uuid,'reviewer','separate_reviewers',4,2,1,v,v-1,NULL,CASE WHEN v%2=0 THEN 'inconclusive' ELSE 'shows_approved_content' END,$5::timestamptz,'x',encode(sha256(convert_to($2::text||':'||v,'UTF8')),'hex'),clock_timestamp()-interval '2 hours' FROM generate_series(1,900) v`,
        [user, id, sha, delegate, at],
      );
    expect(await count("true", [])).toBe(9000);
    await ageOut();
    // Row capacity: a new observation on the full row 0 (delegate AND inspector2) is refused before the locks;
    // the frozen retry of the delegate's last real head still replays under the locks.
    await clearProbe();
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, ten[0].id, ten[0].sha, "inconclusive", at),
      ),
    ).toBe("citation_inspection_capacity");
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(inspector2, ten[0].id, ten[0].sha, "inconclusive", at),
      ),
    ).toBe("citation_inspection_capacity");
    expect(await probe()).toEqual(NONE);
    const last = heads.get(key(delegate, ten[0].id))!;
    const prev = (
      await db.query<{ id: string }>(
        "SELECT supersedes_id id FROM ai_citation_improvement_inspections WHERE id=$1",
        [last.id],
      )
    ).rows[0].id;
    await clearProbe();
    expect(
      String(
        (
          await call(
            "save_ai_citation_improvement_inspection",
            inspectArgs(
              delegate,
              ten[0].id,
              ten[0].sha,
              last.version % 2 ? "inconclusive" : "shows_approved_content",
              at,
              { version: last.version - 1, id: prev },
            ),
          )
        ).id,
      ),
    ).toBe(last.id);
    expect(await probe()).toEqual(BOTH);
    expect(await count("improvement_row_id=$2", [ten[0].id])).toBe(900);
    // Withdrawal reserve: the delegate can still retire their head on the full row (and full project).
    await clearProbe();
    expect((await record(delegate, ten[0].id, ten[0].sha, "withdrawn", null)).checkResult).toBe(
      "withdrawn",
    );
    expect(await probe()).toEqual(BOTH);
    expect(await count("improvement_row_id=$2", [ten[0].id])).toBe(901);
    // Project capacity: an 11th, empty row refuses a new observation at 9001 project heads (lock-free)…
    const a11 = await artifact({ p_reference: "google-business-profile:acme-eleven" });
    await approve(user, String(a11.id), String(a11.artifactSha256));
    const r11 = await receipt(user, String(a11.id), await isoAt("+ interval '1 second'"));
    const v11 = await saveChange(
      changeRecord(a11 as never, user, { improvementId: "70000000-0000-4000-8000-0000000000ee" }),
      {
        artifactId: a11.id,
        artifactSha256: a11.artifactSha256,
        receiptId: r11.id,
        ownerInspection: null,
      },
    );
    await grant(String(v11.id), delegate);
    await clearProbe();
    expect(
      await raw(
        "save_ai_citation_improvement_inspection",
        inspectArgs(delegate, String(v11.id), await recordSha(String(v11.id)), "inconclusive", at),
      ),
    ).toBe("citation_inspection_capacity");
    expect(await probe()).toEqual(NONE);
    // …while the dissenting inspector's active negative head is still effective and disputes row 0, the owner
    // and inspector reads parse in full, and the dissent can still be withdrawn truthfully at project capacity
    // (reserve), after which the dispute clears. Nothing recorded before capacity was deleted or replaced.
    const detail = citationImprovementDetailSchema.parse(await readRow(ten[0].id));
    expect(detail.independentStatus).toBe("disputed");
    expect(detail.inspections).toHaveLength(901);
    expect(detail.inspections!.find((i) => i.id === dissent.id)).toMatchObject({ effective: true });
    const view = await call("read_ai_citation_improvement_for_inspection", {
      p_actor: inspector2,
      p_owner: user,
      p_project: "p",
      p_row: ten[0].id,
    });
    expect(inspectionViewSchema.parse(view).myHead).toMatchObject({
      id: dissent.id,
      effective: true,
    });
    await record(inspector2, ten[0].id, ten[0].sha, "withdrawn", null);
    const after = citationImprovementDetailSchema.parse(await readRow(ten[0].id));
    expect(after.independentStatus).not.toBe("disputed");
    expect(after.inspections).toHaveLength(902);
    expect(await count("true", [])).toBe(9002);
    expect(await count("improvement_row_id=$2 AND check_result<>'withdrawn'", [ten[0].id])).toBe(
      900,
    );
  }, 180000);
});

describe("privileges", () => {
  it("every new RPC is service_role-only; the predicates are granted to no role", async () => {
    const rows = await db.query<{
      name: string;
      anon: boolean;
      authenticated: boolean;
      service: boolean;
    }>(
      `SELECT p.proname name, has_function_privilege('anon',p.oid,'EXECUTE') anon, has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated, has_function_privilege('service_role',p.oid,'EXECUTE') service
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE '%citation_change%' OR p.proname LIKE '%inspection%' OR p.proname IN ('record_publication_actor','save_ai_citation_improvement_v4','read_ai_citation_improvements_v4','read_ai_citation_improvement_v4','citation_improvement_live_v2','citation_independent_status','citation_improvement_actors','citation_improvement_finding_gate','citation_improvement_baselines_resolve','citation_inspector_effective','read_ai_citation_improvement_v4_summary')) ORDER BY 1`,
    );
    const rpcs = new Set([
      "record_publication_actor",
      "save_ai_citation_change_artifact",
      "read_ai_citation_change_artifacts",
      "remove_ai_citation_change_artifact",
      "set_ai_citation_change_approval",
      "read_ai_citation_change_approval_provenance",
      "save_ai_citation_change_receipt",
      "remove_ai_citation_change_receipt",
      "grant_ai_citation_inspection_assignment",
      "revoke_ai_citation_inspection_assignment",
      "read_ai_citation_improvement_for_inspection",
      "save_ai_citation_improvement_inspection",
      "read_ai_citation_improvement_inspections",
      "save_ai_citation_improvement_v4",
      "read_ai_citation_improvements_v4",
      "read_ai_citation_improvement_v4",
    ]);
    expect(rows.rows.length).toBeGreaterThanOrEqual(24);
    for (const r of rows.rows) {
      expect(r.anon, r.name).toBe(false);
      expect(r.authenticated, r.name).toBe(false);
      expect(r.service, r.name).toBe(rpcs.has(r.name));
    }
  });
});
