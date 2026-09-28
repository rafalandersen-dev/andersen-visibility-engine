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
