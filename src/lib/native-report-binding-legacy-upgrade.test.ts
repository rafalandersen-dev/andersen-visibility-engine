import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { stageNativeArtifact } from "./native-ai-artifact.server";
import {
  persistNativeReport,
  readNativeReportBinding,
  readNativeReportParsed,
} from "./native-google-intake.server";
import {
  getCitationImprovement,
  readCitationFindings,
  saveCitationFinding,
  saveCitationImprovement,
} from "./citation-record.server";
import {
  getCitationFindingForReview,
  grantCitationReviewAssignment,
  grantCitationReviewNativeAssignment,
  saveCitationFindingReview,
} from "./citation-finding-review.server";
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import { nativeConsentSetDigest } from "./citation-review-ui";
import { headToken, headVersionQuery, lockedPanelInsert } from "./citation-panel-fixture";
import type { KnowledgeRpc } from "./project-knowledge.server";
/**
 * TWO-PHASE legacy-upgrade acceptance (R1-04 / legacy-upgrade-acceptance-plan.json). Phase 1 seeds SIX
 * legacy findings (native-only / mixed × owner-accepted / accepted+incomplete-independent-approval /
 * needs-second-review+incomplete-approval) WITH actual linked delivered improvements, plus a late-parse
 * control — all through the FROZEN pre-candidate SQL (so the historical native-only answer-flag shape is
 * preserved, never normalized away). It snapshots exact records/hashes/receipts/improvement status caps and
 * actorless inspectability. Phase 2 applies the candidate migration VERBATIM and asserts: history is byte
 * identical, legacy native-bearing findings stay globally uninspectable and improvement caps unchanged after
 * install + late-parse + read + regrant, reviewer detail is now denied without explicit consent (owner reads
 * unchanged), and only a conscious NEW fully-bound version + whole-set consent + a fresh complete review
 * completes inspection. No stubs/mocked gates; real server helpers throughout.
 */
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-0000000000a1";
const scope = { ownerId: user, projectId: "p" };
const PROMPT = "20000000-0000-4000-8000-000000000001";
const ACTION = "50000000-0000-4000-8000-000000000001";
const PUB = "90000000-0000-4000-8000-000000000001";
const ASSET = "content-asset-1";
const VERSION = "a".repeat(64);
const LIVE = "https://acme.example/services";
const now = "2026-09-19T12:00:00Z";
const later = "2026-09-19T18:00:00Z";
const ACC_CAP = "2024-03-01T00:00:00Z";
const panelScope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 1,
  client: { name: "Acme", market: "US" },
};
const CANDIDATE = "supabase/migrations/20261114120000_citation_native_review_binding.sql";
let ANSWER: string;
const rpc: KnowledgeRpc = async (name, args) => {
  try {
    const keys = Object.keys(args);
    const r = await db.query<{ data: unknown }>(
      `SELECT public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) data`,
      Object.values(args),
    );
    return { data: r.rows[0].data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
const gMeta = {
  source: "gsc_generative_ai_search" as const,
  declaredProperty: "https://example.test/",
  reportKind: "chart" as const,
  dimension: "date" as const,
  aggregation: "property" as const,
  period: { start: "2026-09-01", end: "2026-11-13", timezone: "America/Los_Angeles" },
  marketScope: { country: "SWE", exposed: true },
  filters: { "Search type": "Web (text-based)", Date: "Last 3 months", Country: "Sweden" },
  capturedAt: "2026-11-13T09:00:00Z",
  filename: "Chart.csv",
};
const stageParse = async (csv: string) => {
  const a = await stageNativeArtifact(
    scope,
    { metadata: gMeta, base64: Buffer.from(new TextEncoder().encode(csv)).toString("base64") },
    rpc,
  );
  await persistNativeReport(scope, a.id, "partial", "", rpc);
  return { id: a.id, binding: (await readNativeReportBinding(scope, a.id, rpc)).binding };
};
// A legacy finding record in the HISTORICAL shape (answer-flag fields the frozen schema allowed), seeded
// through the raw P3 RPC so the pre-candidate code path stores it exactly as it lived.
const legacyFinding = (
  findingId: string,
  decision: "accepted" | "needs_second_review",
  evidence: Array<{ kind: "answer" | "native" | "source"; id: string }>,
) => ({
  findingId,
  family: "citation_source" as const,
  evidence,
  entityMatch: "confirmed" as const,
  capture: { answerComplete: true, citationsComplete: true },
  observation: "Legacy finding citing a native export.",
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
  decision,
  review: { reviewer: user, reviewedAt: now },
  secondReview: null,
  linkedTaskId: null,
});
const seedFindingRaw = async (
  findingId: string,
  decision: "accepted" | "needs_second_review",
  evidence: Array<{ kind: "answer" | "native" | "source"; id: string }>,
) => {
  const r = await rpc("save_ai_citation_finding", {
    p_user: user,
    p_project: "p",
    p_record: legacyFinding(findingId, decision, evidence),
    p_scope: panelScope,
  });
  if (r.error || !r.data) throw new Error(`seed finding failed: ${JSON.stringify(r.error)}`);
  return r.data as { id: string };
};
const assign = (rowId: string) =>
  grantCitationReviewAssignment(
    user,
    { projectId: "p", findingRowId: rowId, reviewerId: reviewer },
    rpc,
  );
const submit = (
  rowId: string,
  expectedSha: string,
  decision: "approved" | "rejected" | "needs_changes",
) =>
  saveCitationFindingReview(
    reviewer,
    { projectId: "p", ownerId: user, findingRowId: rowId, expectedSha, decision, note: null },
    rpc,
  );
const seedApproval = () =>
  db.query(
    "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,updated_at) VALUES($1::uuid,'p',$2::text,'milo-publication-v1',$3::text,true,clock_timestamp() - interval '3 hours') ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=$3::text,approved=true,updated_at=clock_timestamp() - interval '3 hours'",
    [user, ASSET, VERSION],
  );
const seedPublication = () =>
  db.query(
    "INSERT INTO publication_evidence(user_id,project_id,id,asset_id,version_hash,snapshot,outcome,outcome_data,finished_at) VALUES($1::uuid,'p',$2::uuid,$3::text,$4::text,jsonb_build_object('actionId',$5::text,'assetId',$3::text,'version',$4::text),'published',$6::jsonb,clock_timestamp() - interval '2 hours') ON CONFLICT DO NOTHING",
    [
      user,
      PUB,
      ASSET,
      VERSION,
      ACTION,
      JSON.stringify({ liveUrl: LIVE, externalId: "x", publishedAt: "2026-09-19T17:00:00Z" }),
    ],
  );
const isoAt = async (delta: string) =>
  (
    await db.query<{ t: string }>(
      `SELECT to_char((clock_timestamp() ${delta}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') t`,
    )
  ).rows[0].t;
const attestImprovement = async (improvementId: string, findingId: string) => {
  const observedAt = await isoAt("- interval '1 hour'");
  const head = headToken(
    (
      await db.query<{ v: number; id: string | null }>(
        ...headVersionQuery("ai_citation_improvements", user, "p", improvementId),
      )
    ).rows[0],
  );
  return saveCitationImprovement(
    scope,
    {
      scope: panelScope,
      ...head,
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
const inspectableSql = async (rowId: string) =>
  (
    await db.query<{ ok: boolean }>(
      "SELECT public.citation_finding_inspectable($1::uuid,'p',record) ok FROM public.ai_citation_findings WHERE user_id=$1 AND project_id='p' AND id=$2::uuid",
      [user, rowId],
    )
  ).rows[0].ok;
const findingRow = async (rowId: string) =>
  (
    await db.query<{ sha: string; rec: unknown; erased: string | null }>(
      "SELECT record_sha256 sha, record rec, evidence_erased_at erased FROM public.ai_citation_findings WHERE user_id=$1 AND project_id='p' AND id=$2::uuid",
      [user, rowId],
    )
  ).rows[0];
const reviewReceiptRow = async (rowId: string, who: string) =>
  (
    await db.query(
      "SELECT id,record_sha256,decision,note,inspection_complete,finding_version,finding_id,reviewer_id,reviewer_role,policy_mode,policy_revision,membership_revision,withdrawn,withdrawn_at,created_at FROM public.ai_citation_finding_reviews WHERE user_id=$1 AND project_id='p' AND finding_row_id=$2::uuid AND reviewer_id=$3::uuid",
      [user, rowId, who],
    )
  ).rows[0];
const ownerReviewStatus = async (rowId: string) =>
  (await readCitationFindings(scope, rpc)).findings.find((f) => f.id === rowId)?.reviewStatus;
const importReal = (rawAnswer: string) =>
  importAnswerEvidence(
    scope,
    {
      promptId: PROMPT,
      promptRevision: 1,
      surface: "ChatGPT web",
      mode: "search" as const,
      method: "manual consumer session",
      modelVersion: null,
      capturedAt: ACC_CAP,
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

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;" +
      "CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);" +
      "CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);" +
      "CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2)", [user, reviewer]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1)", [user]);
  // PHASE-1 foundation: everything EXCEPT the candidate (applied mid-test in Phase 2).
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260910170000_publication_approval.sql",
    "20260910200000_publication_evidence.sql",
    "20260910210000_answer_evidence.sql",
    "20260919165000_native_report_artifacts.sql",
    "20260920190000_citation_protocol.sql",
    "20260920200000_citation_findings_improvements.sql",
    "20260911020000_project_team_reads.sql",
    "20260911060000_project_team_approval_policy.sql",
    "20260926190000_citation_scope_binding_versions.sql",
    "20260927190000_citation_improvement_head_guard.sql",
    "20260928120000_citation_change_evidence.sql",
    "20261113120000_native_report_parsed_interpretation.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  await db.exec(
    "CREATE TABLE public.scheduled_publishes(user_id uuid NOT NULL,project_id text NOT NULL,asset_id text NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());",
  );
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p')",
    [user],
  );
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'content',$2,jsonb_build_object('projectId','p'))",
    [user, ASSET],
  );
  await db.query(
    ...lockedPanelInsert({
      userId: user,
      projectId: "p",
      panelId: panelScope.panelId,
      version: 1,
      client: panelScope.client,
    }),
  );
  await db.query(
    "INSERT INTO project_team_approval_policy(owner_id,project_id,mode,revision) VALUES($1,'p','separate_reviewers',1)",
    [user],
  );
  await db.query(
    "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active) VALUES($1,'p',$2,'reviewer',1,true)",
    [user, reviewer],
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
  ANSWER = await importReal("Acme Massage in Malmö is a good option to book.");
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("two-phase legacy-upgrade: installing the candidate never promotes legacy native-bearing history", () => {
  it("preserves six legacy records/receipts/improvement caps + late-parse control, denies reviewer, allows a new bound version", async () => {
    // A legacy native id (opaque bytes, parsed-interpretation NOT installed yet; a bare reference).
    const NATIVE = "30000000-0000-4000-8000-000000000001";
    await db.query(
      "INSERT INTO ai_native_report_artifacts(user_id,project_id,id,scope_key,artifact_sha256,byte_length,bytes,metadata,actor_id) VALUES($1::uuid,'p',$2::uuid,'sk1',$3::text,1,'\\x00'::bytea,'{}'::jsonb,$1::uuid)",
      [user, NATIVE, "d".repeat(64)],
    );
    // SIX cases: {native-only, mixed} × {accepted-no-approval, accepted+approval, needs_second_review+approval}.
    const cases = [
      {
        id: "60000000-0000-4000-8000-000000000001",
        decision: "accepted" as const,
        mixed: false,
        approve: false,
      },
      {
        id: "60000000-0000-4000-8000-000000000002",
        decision: "accepted" as const,
        mixed: false,
        approve: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000003",
        decision: "needs_second_review" as const,
        mixed: false,
        approve: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000004",
        decision: "accepted" as const,
        mixed: true,
        approve: false,
      },
      {
        id: "60000000-0000-4000-8000-000000000005",
        decision: "accepted" as const,
        mixed: true,
        approve: true,
      },
      {
        id: "60000000-0000-4000-8000-000000000006",
        decision: "needs_second_review" as const,
        mixed: true,
        approve: true,
      },
    ];
    await seedApproval();
    await seedPublication();
    const snap: Record<
      string,
      {
        sha: string;
        rec: unknown;
        erased: string | null;
        inspectable: boolean;
        status: string | undefined;
        improvement: string;
        receiptComplete: boolean | null;
      }
    > = {};
    const improvementIds: Record<string, string> = {};
    const rowOf: Record<string, string> = {}; // logical finding id -> stored immutable ROW id
    const receiptSnap: Record<string, unknown> = {}; // ROW id -> exact immutable approval receipt row
    const impSnap: Record<string, unknown> = {}; // ROW id -> exact delivered-improvement detail (record/hash/pins)
    for (const [i, c] of cases.entries()) {
      const evidence = c.mixed
        ? [
            { kind: "answer" as const, id: ANSWER },
            { kind: "native" as const, id: NATIVE },
          ]
        : [{ kind: "native" as const, id: NATIVE }];
      const f = await seedFindingRaw(c.id, c.decision, evidence);
      let receiptComplete: boolean | null = null;
      if (c.approve) {
        await assign(f.id);
        const sha = (await findingRow(f.id)).sha;
        const receipt = await submit(f.id, sha, "approved");
        receiptComplete = (receipt as { inspectionComplete: boolean }).inspectionComplete;
      }
      // A linked DELIVERED improvement bound to this finding (owner inspection + approval + publication).
      // Improvement.findingIds are LOGICAL finding ids (resolved to the current head row by the save/gate).
      const impId = `70000000-0000-4000-8000-00000000000${i + 1}`;
      rowOf[c.id] = f.id;
      const imp = await attestImprovement(impId, c.id);
      improvementIds[f.id] = (imp as { id: string }).id; // improvement ROW id for the Phase-2 re-read
      const impDetail = await getCitationImprovement(scope, improvementIds[f.id], rpc);
      impSnap[f.id] = impDetail; // full delivered-improvement detail (record + hash + publication pins)
      if (c.approve) receiptSnap[f.id] = await reviewReceiptRow(f.id, reviewer);
      const row = await findingRow(f.id);
      snap[f.id] = {
        sha: row.sha,
        rec: row.rec,
        erased: row.erased,
        inspectable: await inspectableSql(f.id),
        status: await ownerReviewStatus(f.id),
        improvement: (impDetail as { verificationStatus: string }).verificationStatus,
        receiptComplete,
      };
      // Legacy native-bearing findings are NEVER inspectable and their approvals are never complete.
      expect(snap[f.id].inspectable).toBe(false);
      if (c.approve) expect(receiptComplete).toBe(false);
      // The delivered improvement is CAPPED below owner_attested by the uninspectable native gate.
      expect(snap[f.id].improvement).not.toBe("owner_attested");
    }
    // Late-parse control: a GENUINE synthetic report, staged but deliberately NOT parsed yet (distinct scope so
    // it never dedups/supersedes the positive-control artifact), cited by a BARE legacy accepted finding that
    // carries its own approval receipt and a delivered improvement. It is parsed for real in Phase 2.
    const lateArt = await stageNativeArtifact(
      scope,
      {
        metadata: { ...gMeta, declaredProperty: "https://example.test/late" },
        base64: Buffer.from(
          new TextEncoder().encode("Date,Impressions\n2026-09-01,4\n2026-09-02,0\n"),
        ).toString("base64"),
      },
      rpc,
    );
    expect((await readNativeReportParsed(scope, lateArt.id, rpc)).parseState).toBe("unparsed");
    const LATE_LOGICAL = "60000000-0000-4000-8000-000000000007";
    const lateF = await seedFindingRaw(LATE_LOGICAL, "accepted", [
      { kind: "native", id: lateArt.id },
    ]);
    await assign(lateF.id);
    const lateReceipt = await submit(lateF.id, (await findingRow(lateF.id)).sha, "approved");
    const lateImp = await attestImprovement("70000000-0000-4000-8000-000000000008", LATE_LOGICAL);
    const lateImpRow = (lateImp as { id: string }).id;
    const lateSnap = {
      sha: (await findingRow(lateF.id)).sha,
      rec: (await findingRow(lateF.id)).rec,
      inspectable: await inspectableSql(lateF.id),
      status: await ownerReviewStatus(lateF.id),
      receiptComplete: (lateReceipt as { inspectionComplete: boolean }).inspectionComplete,
      receiptRow: await reviewReceiptRow(lateF.id, reviewer),
      improvement: await getCitationImprovement(scope, lateImpRow, rpc),
    };
    expect(lateSnap.inspectable).toBe(false);
    expect(lateSnap.receiptComplete).toBe(false);

    // ============================ PHASE 2: apply the candidate migration VERBATIM ============================
    await db.exec(readFileSync(CANDIDATE, "utf8"));

    for (const c of cases) {
      const rowId = rowOf[c.id];
      const row = await findingRow(rowId);
      // Immutable history byte-identical: record, hash, erasure stamp all unchanged.
      expect(row.sha).toBe(snap[rowId].sha);
      expect(row.rec).toEqual(snap[rowId].rec);
      expect(row.erased).toBe(snap[rowId].erased);
      // Still globally uninspectable; owner reviewStatus unchanged; improvement cap unchanged.
      expect(await inspectableSql(rowId)).toBe(false);
      expect(await ownerReviewStatus(rowId)).toBe(snap[rowId].status);
      // The delivered-improvement detail (record + hash + publication pins + capped status) is byte-identical.
      expect(await getCitationImprovement(scope, improvementIds[rowId], rpc)).toEqual(
        impSnap[rowId],
      );
      // The immutable approval receipt (where one exists) is byte-identical too — installing the migration
      // neither upgrades nor rewrites a historic receipt.
      if (receiptSnap[rowId])
        expect(await reviewReceiptRow(rowId, reviewer)).toEqual(receiptSnap[rowId]);
      // The reviewer detail is now DENIED for a native-bearing finding without explicit native consent,
      // even where a generic assignment exists (intentional access reduction). Owner history is unaffected.
      await expect(
        getCitationFindingForReview(
          reviewer,
          { ownerId: user, projectId: "p", findingRowId: rowId },
          rpc,
        ),
      ).rejects.toThrow();
    }

    // Late-parse: ACTUALLY parse the previously-unparsed artifact now, AFTER the candidate installed. The bare
    // legacy reference (no embedded binding) is NOT promoted: it stays uninspectable, and its immutable record,
    // approval receipt and delivered-improvement detail are all byte-identical to the pre-parse snapshot.
    await persistNativeReport(scope, lateArt.id, "partial", "", rpc);
    expect((await readNativeReportParsed(scope, lateArt.id, rpc)).parseState).toBe("parsed");
    expect(await inspectableSql(lateF.id)).toBe(false);
    expect((await findingRow(lateF.id)).sha).toBe(lateSnap.sha);
    expect((await findingRow(lateF.id)).rec).toEqual(lateSnap.rec);
    expect(await ownerReviewStatus(lateF.id)).toBe(lateSnap.status);
    expect(await reviewReceiptRow(lateF.id, reviewer)).toEqual(lateSnap.receiptRow);
    expect(await getCitationImprovement(scope, lateImpRow, rpc)).toEqual(lateSnap.improvement);

    // Regrant (old 4-arg) still confers NO native consent: reviewer detail stays denied.
    const row1 = rowOf[cases[1].id];
    await assign(row1);
    await expect(
      getCitationFindingForReview(
        reviewer,
        { ownerId: user, projectId: "p", findingRowId: row1 },
        rpc,
      ),
    ).rejects.toThrow();

    // A legacy incomplete-approval fast-retry never upgrades the receipt.
    await expect(submit(row1, snap[row1].sha, "approved")).rejects.toThrow(); // native-bearing + unconsented: save gate denies before the idempotent return

    // POSITIVE CONTROL: a conscious NEW version OF AN EXISTING legacy logical finding (cases[0]) — saved against
    // its EXPECTED head, so it continues that finding's own version lineage — binds the now-available parsed
    // interpretation. The legacy row stays byte-identical (history preserved); the successor needs fresh
    // whole-set consent and a fresh complete review to become inspectable.
    const successorLogical = cases[0].id;
    const parsed = await stageParse("Date,Impressions\n2026-09-01,12\n2026-09-02,0\n");
    const head = (
      await db.query<{ v: number; id: string | null }>(
        ...headVersionQuery("ai_citation_findings", user, "p", successorLogical),
      )
    ).rows[0];
    const bound = await saveCitationFinding(
      scope,
      {
        scope: panelScope,
        finding: {
          findingId: successorLogical,
          family: "citation_source" as const,
          evidence: [{ kind: "native" as const, id: parsed.id, nativeBinding: parsed.binding }],
          entityMatch: "confirmed" as const,
          capture: { answerComplete: false, citationsComplete: false },
          observation: "A new version binding the exact parsed interpretation.",
          hypothesis: null,
          competitorCited: null,
          ownCited: null,
          recommendation: null,
          support: [],
          accuracy: [],
          priority: {
            harm: "medium" as const,
            relevance: "medium" as const,
            fixability: "medium" as const,
          },
          decision: "needs_second_review" as const,
          review: { reviewer: user, reviewedAt: now },
          secondReview: null,
          linkedTaskId: null,
        },
        ...headToken(head),
      },
      rpc,
    );
    // It is a genuine SUCCESSOR of the legacy finding (same logical id, next version), and the legacy row it
    // supersedes is itself unchanged — no history was rewritten.
    expect(bound.version).toBeGreaterThan(1);
    expect(bound.id).not.toBe(rowOf[successorLogical]);
    expect((await findingRow(rowOf[successorLogical])).rec).toEqual(
      snap[rowOf[successorLogical]].rec,
    );
    await assign(bound.id);
    const setSha = (await nativeConsentSetDigest([
      { id: parsed.id, parsedSha256: parsed.binding!.parsedSha256 },
    ]))!;
    await grantCitationReviewNativeAssignment(
      user,
      { projectId: "p", findingRowId: bound.id, reviewerId: reviewer, nativeSetSha256: setSha },
      rpc,
    );
    const view = await getCitationFindingForReview(
      reviewer,
      { ownerId: user, projectId: "p", findingRowId: bound.id },
      rpc,
    );
    expect(view.inspectionComplete).toBe(true);
    const receipt = await submit(bound.id, view.recordSha256!, "approved");
    expect((receipt as { inspectionComplete: boolean }).inspectionComplete).toBe(true);
  }, 60000);
});
