/**
 * Candidate migration 20260927190000 (UNAPPLIED): `save_ai_citation_improvement_v3` = the released v2 improvement
 * save wrapped in the same expected-head guard the finding/fact saves already carry. Exercised end to end through
 * the REAL server module (`saveCitationImprovement` now calls v3) against PGlite with the actual released chain:
 * a store-minted (non-UUID) Plan task id, idempotent lost-response retry, stale-token conflict with atomic
 * rollback, ABA row identity after a removal, wrong-task publication, owner inspection positive / negative /
 * forged, live downgrades the readiness gate reads (approval revoke, baseline deletion), and owner/project
 * isolation. The migration file is read from disk exactly as production would apply it.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getCitationImprovement,
  readCitationImprovements,
  removeCitationImprovement,
  saveCitationFinding,
  saveCitationImprovement,
} from "./citation-record.server";
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import { lockedPanelInsert } from "./citation-panel-fixture";
import {
  inspectionPayload,
  inspectionRequest,
  retestReadiness,
  type AttestedDetail,
} from "./citation-forward";
import { readPublicationApprovalProvenance } from "./citation-approval.server";
import type { Improvement } from "./citation-finding";
import type { KnowledgeRpc } from "./project-knowledge.server";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const delegate = "00000000-0000-4000-8000-0000000000a1"; // a team reviewer who may approve by policy
const scope = { ownerId: user, projectId: "p" };
const PROMPT = "20000000-0000-4000-8000-000000000001";
const FID = "60000000-0000-4000-8000-000000000001";
const IMP = "70000000-0000-4000-8000-000000000001";
const PUB = "90000000-0000-4000-8000-000000000001";
/** A REAL store-minted Plan task id shape (`uid()`: 8 base-36 chars), the value `capturePublicationSnapshot`
 * records as the attempt's `actionId`. Not a UUID — the repaired taskId contract accepts it as-is. */
const TASK = "k3j9x2ab";
const ASSET = "content-asset-1";
const VERSION = "a".repeat(64);
const LIVE = "https://acme.example/services";
const ACC_CAP = "2024-03-01T00:00:00Z";
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
type HeadToken = { expectedVersion: number | null; expectedHeadId: string | null };
const fresh: HeadToken = { expectedVersion: 0, expectedHeadId: null };
const at = (row: { id: string; version: number }): HeadToken => ({
  expectedVersion: row.version,
  expectedHeadId: row.id,
});
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
const improvement = (
  opts: { taskId?: string; description?: string; verified?: boolean } = {},
): Improvement => ({
  improvementId: IMP,
  findingIds: [FID],
  taskId: opts.taskId ?? TASK,
  change: {
    description: opts.description ?? "Added a service page.",
    approvedVersion: VERSION,
    approvedBy: user,
    approvedAt: now,
  },
  destination: { kind: "public_url", reference: LIVE },
  baselineCaptureIds: [BASELINE],
  verification: opts.verified
    ? { method: "owner_inspection", receipt: "owner_inspection", verifiedAt: now, reviewer: user }
    : null,
});
const binding = (
  inspection: null | {
    checkResult: "shows_approved_content" | "does_not_show" | "inconclusive";
    observedAt: string;
  } = null,
) => ({
  publicationId: PUB,
  assetId: ASSET,
  versionHash: VERSION,
  ownerInspection: inspection ? { ...inspection, observedUrl: LIVE } : null,
});
const saveI = (
  i: Improvement,
  b: ReturnType<typeof binding> | null,
  token: HeadToken | null,
  expectedFindingRowIds: string[] | null = null,
) =>
  saveCitationImprovement(
    scope,
    { scope: panelScope, improvement: i, binding: b, ...(token ?? {}), expectedFindingRowIds },
    rpc,
  );
const findingHead = async () =>
  (
    await db.query<{ id: string; version: number }>(
      "SELECT id,version FROM ai_citation_findings WHERE user_id=$1 AND project_id='p' AND finding_id=$2 ORDER BY version DESC LIMIT 1",
      [user, FID],
    )
  ).rows[0];
const count = async () =>
  Number(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM ai_citation_improvements WHERE user_id=$1 AND improvement_id=$2",
        [user, IMP],
      )
    ).rows[0].n,
  );
const isoAt = async (delta: string) =>
  (
    await db.query<{ t: string }>(
      `SELECT to_char((clock_timestamp() ${delta}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') t`,
    )
  ).rows[0].t;
const seedApproval = (approved: boolean) =>
  db.query(
    "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,updated_at) VALUES($1::uuid,'p',$2::text,'milo-publication-v1',$3::text,$4::boolean,clock_timestamp() - interval '3 hours') ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=$3::text,approved=$4::boolean,updated_at=clock_timestamp() - interval '3 hours'",
    [user, ASSET, VERSION, approved],
  );
const seedPublication = (actionId: string) =>
  db.query(
    "INSERT INTO publication_evidence(user_id,project_id,id,asset_id,version_hash,snapshot,outcome,outcome_data,finished_at) VALUES($1::uuid,'p',$2::uuid,$3::text,$4::text,jsonb_build_object('actionId',$5::text,'assetId',$3::text,'version',$4::text),'published',$6::jsonb,clock_timestamp() - interval '2 hours')",
    [
      user,
      PUB,
      ASSET,
      VERSION,
      actionId,
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
const headOf = async () => {
  const list = await readCitationImprovements(scope, rpc);
  return list.improvements
    .filter((s) => s.improvementId === IMP)
    .reduce((m, s) => (!m || s.version > m.version ? s : m));
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2),($3)", [user, other, delegate]);
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
    // The candidate under test, applied last exactly as production would.
    "20260927190000_citation_improvement_head_guard.sql",
    // Candidate 20260928120000 (UNAPPLIED, R/R1/R2): the v4 wrappers the server now calls; additive over v3.
    "20260928120000_citation_change_evidence.sql",
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
  await saveEvidencePrompt(scope, PROMPT, 0, promptData(), rpc);
  ANSWER = await importReal(ACC_CAP, "Acme Massage in Malmö is a good option to book.");
  BASELINE = await importReal("2024-04-01T00:00:00Z", "Acme Massage in Malmö is worth comparing.");
  await saveCitationFinding(scope, { scope: panelScope, finding: finding(), ...fresh }, rpc);
  await seedApproval(true);
  await seedPublication(TASK);
});
afterAll(async () => {
  await db?.close();
});
const promptData = () => ({
  prompt: "Where can I book a massage in Malmö?",
  intent: "discovery",
  source: "manual" as const,
  market: "Sweden",
  language: "sv-SE",
  brand: "Acme Massage",
  websiteUrl: "https://acme.example.com/",
  competitorUrls: [] as string[],
  active: true,
});

describe("v3 expected-head guard around the unchanged v2 improvement save", () => {
  it("binds a store-minted task id to its published attempt under a fresh token, and an identical retry with a stale/absent token resolves to the SAME row", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    expect(v1).toMatchObject({
      improvementId: IMP,
      version: 1,
      verificationStatus: "connector_receipt",
    });
    const stored = await db.query<{ task: string }>(
      "SELECT record->>'taskId' task FROM ai_citation_improvements WHERE user_id=$1 AND id=$2",
      [user, v1.id],
    );
    expect(stored.rows[0].task).toBe(TASK);
    // Lost response: the identical frozen payload is re-sent — with no token at all and with a wrong one.
    expect((await saveI(improvement(), binding(), null)).id).toBe(v1.id);
    expect(
      (await saveI(improvement(), binding(), { expectedVersion: 7, expectedHeadId: PUB })).id,
    ).toBe(v1.id);
    expect(await count()).toBe(1);
  });
  it("refuses a DIFFERENT correction under a stale token atomically, and mints v2 under the inspected head", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    await expect(saveI(improvement({ description: "Edited" }), binding(), fresh)).rejects.toThrow(
      "citation_improvement_version_conflict",
    );
    await expect(saveI(improvement({ description: "Edited" }), binding(), null)).rejects.toThrow(
      "citation_improvement_version_conflict",
    );
    expect(await count()).toBe(1);
    const v2 = await saveI(improvement({ description: "Edited" }), binding(), at(v1));
    expect(v2).toMatchObject({ version: 2, supersedesId: v1.id });
    expect(await count()).toBe(2);
  });
  it("ABA: a removed head's row id no longer authorises even though its version number is reused", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    const v2 = await saveI(improvement({ description: "Edited" }), binding(), at(v1));
    await removeCitationImprovement(scope, v2.id, rpc);
    expect((await headOf()).id).toBe(v1.id);
    await expect(
      saveI(improvement({ description: "Edited again" }), binding(), at(v2)),
    ).rejects.toThrow("citation_improvement_version_conflict");
    const v2b = await saveI(improvement({ description: "Edited again" }), binding(), at(v1));
    expect(v2b.version).toBe(2);
    expect(v2b.id).not.toBe(v2.id);
  });
  it("a version number without its row id is refused at the server contract AND by the RPC itself", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    await expect(
      saveI(improvement({ description: "Edited" }), binding(), {
        expectedVersion: 1,
        expectedHeadId: null,
      }),
    ).rejects.toThrow();
    const direct = await rpc("save_ai_citation_improvement_v3", {
      p_user: user,
      p_project: "p",
      p_record: improvement({ description: "Edited" }),
      p_scope: panelScope,
      p_binding: binding(),
      p_expected_version: 1,
      p_expected_head: null,
      p_expected_findings: null,
    });
    expect(direct.error).toBeTruthy();
    expect(await count()).toBe(1);
    expect(v1.version).toBe(1);
  });
  it("refuses binding the attempt of ANOTHER task (no rebinding to whatever was published)", async () => {
    await expect(saveI(improvement({ taskId: "other001" }), binding(), fresh)).rejects.toThrow(
      "citation_improvement_binding_task_mismatch",
    );
    expect(await count()).toBe(0);
  });
});

describe("owner inspection through the forward payload helper", () => {
  it("positive → owner_attested as a new version; negative/inconclusive never carry a verification; a forged positive on a negative inspection is refused", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    const detail = await getCitationImprovement(scope, v1.id, rpc);
    const observedAt = await isoAt("- interval '1 hour'");
    const positive = inspectionPayload(detail, {
      checkResult: "shows_approved_content",
      observedAt,
      ownerId: user,
    });
    expect(positive.ok).toBe(true);
    if (!positive.ok) return;
    const v2 = await saveI(positive.improvement, positive.binding, at(v1));
    expect(v2).toMatchObject({
      version: 2,
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
    });
    const negative = inspectionPayload(await getCitationImprovement(scope, v2.id, rpc), {
      checkResult: "does_not_show",
      observedAt,
      ownerId: user,
    });
    expect(negative.ok && negative.improvement.verification).toBeNull();
    if (!negative.ok) return;
    const v3 = await saveI(negative.improvement, negative.binding, at(v2));
    expect(v3).toMatchObject({
      version: 3,
      verificationStatus: "connector_receipt",
      evidenceStatus: "baseline_absent",
    });
    // A hand-built verification block anchored to a negative inspection is refused by the unchanged v2 rules.
    await expect(
      saveI(
        improvement({ verified: true, description: "Forged" }),
        binding({ checkResult: "does_not_show", observedAt }),
        at(v3),
      ),
    ).rejects.toThrow("citation_improvement_verification_unbacked");
    expect(await count()).toBe(3);
  });
  it("live downgrades reach the readiness gate: an approval revoke and a baseline deletion drop owner_attested without touching the stored record", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    const observedAt = await isoAt("- interval '1 hour'");
    const positive = inspectionPayload(await getCitationImprovement(scope, v1.id, rpc), {
      checkResult: "shows_approved_content",
      observedAt,
      ownerId: user,
    });
    if (!positive.ok) throw new Error("payload");
    const v2 = await saveI(positive.improvement, positive.binding, at(v1));
    const readiness = async () => {
      const list = (await readCitationImprovements(scope, rpc)).improvements;
      const records = new Map<string, AttestedDetail>();
      for (const s of list)
        if (s.verificationStatus === "owner_attested")
          records.set(s.id, await getCitationImprovement(scope, s.id, rpc));
      return retestReadiness(list, records);
    };
    expect((await readiness()).distinctVerified).toBe(1);
    await seedApproval(false);
    expect((await headOf()).verificationStatus).toBe("unverified");
    expect((await readiness()).distinctVerified).toBe(0);
    await seedApproval(true);
    expect((await headOf()).verificationStatus).toBe("owner_attested");
    await db.query("DELETE FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p' AND id=$2", [
      user,
      BASELINE,
    ]);
    expect(await headOf()).toMatchObject({
      verificationStatus: "connector_receipt",
      evidenceStatus: "baseline_missing",
    });
    expect((await readiness()).distinctVerified).toBe(0);
    const stored = await getCitationImprovement(scope, v2.id, rpc);
    expect(stored.record.verification).not.toBeNull();
  });
});

describe("isolation and privileges", () => {
  it("another owner and another project of the same owner see nothing, and cannot use the owner's head token", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    expect(
      (await readCitationImprovements({ ownerId: other, projectId: "p" }, rpc)).improvements,
    ).toEqual([]);
    expect(
      (await readCitationImprovements({ ownerId: user, projectId: "q" }, rpc)).improvements,
    ).toEqual([]);
    await expect(
      getCitationImprovement({ ownerId: other, projectId: "p" }, v1.id, rpc),
    ).rejects.toThrow();
    // The other owner's chain for the same logical id is empty: the owner's head token is meaningless there and
    // the owner's finding does not resolve for them (fails closed before any write).
    await expect(
      saveCitationImprovement(
        { ownerId: other, projectId: "p" },
        { scope: panelScope, improvement: improvement(), binding: null, ...at(v1) },
        rpc,
      ),
    ).rejects.toThrow();
    expect(await count()).toBe(1);
  });
  it("v3 is callable by service_role only", async () => {
    const r = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
      "SELECT has_function_privilege('anon','public.save_ai_citation_improvement_v3(uuid,text,jsonb,jsonb,jsonb,integer,uuid,jsonb)','EXECUTE') anon, has_function_privilege('authenticated','public.save_ai_citation_improvement_v3(uuid,text,jsonb,jsonb,jsonb,integer,uuid,jsonb)','EXECUTE') authenticated, has_function_privilege('service_role','public.save_ai_citation_improvement_v3(uuid,text,jsonb,jsonb,jsonb,integer,uuid,jsonb)','EXECUTE') service",
    );
    expect(r.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});

describe("Codex N1 corrections against the candidate v3 (R1–R3)", () => {
  it("R1: a finding version minted AFTER the frozen review is refused (finding_stale) with nothing written; the refreshed row set saves; identical retries stay idempotent; an inspection cannot rebind either", async () => {
    const old = await findingHead();
    const changed = await saveCitationFinding(
      scope,
      {
        scope: panelScope,
        finding: {
          ...finding(),
          observation: "A different revised claim after the owner's review.",
        },
        ...at(old),
      },
      rpc,
    );
    expect(changed.id).not.toBe(old.id);
    await expect(saveI(improvement(), binding(), fresh, [old.id])).rejects.toThrow(
      "citation_improvement_finding_stale",
    );
    expect(await count()).toBe(0);
    const v1 = await saveI(improvement(), binding(), fresh, [changed.id]);
    expect((await getCitationImprovement(scope, v1.id, rpc)).boundFindingRowIds).toEqual([
      changed.id,
    ]);
    // Codex N2/S1: the same frozen TEXT with a DIFFERENT reviewed pin is not a retry — the stored row is bound to
    // the newer finding row the owner never reviewed, so the idempotent return is refused (nothing written).
    await expect(saveI(improvement(), binding(), fresh, [old.id])).rejects.toThrow(
      "citation_improvement_finding_stale",
    );
    // A genuine lost-response retry carries the SAME frozen rows: idempotent, same row, no conflict.
    expect((await saveI(improvement(), binding(), fresh, [changed.id])).id).toBe(v1.id);
    expect((await saveI(improvement(), binding(), null, [changed.id])).id).toBe(v1.id);
    expect(await count()).toBe(1);
    // A legacy caller without the token keeps the released behaviour (current head resolution).
    const legacy = await saveI(
      improvement({ description: "Legacy caller" }),
      binding(),
      at(v1),
      null,
    );
    expect(legacy.version).toBe(2);
    // Inspection of an existing improvement after ANOTHER finding version: the displayed bound rows are sent and
    // the save is refused rather than silently re-pinning the newer head.
    const changed2 = await saveCitationFinding(
      scope,
      {
        scope: panelScope,
        finding: { ...finding(), observation: "A third revision." },
        ...at(changed),
      },
      rpc,
    );
    expect(changed2.version).toBe(3);
    const displayed = await getCitationImprovement(scope, legacy.id, rpc);
    const req = inspectionRequest(
      displayed,
      (await readCitationImprovements(scope, rpc)).improvements,
      {
        checkResult: "shows_approved_content",
        observedAt: await isoAt("- interval '1 hour'"),
        ownerId: user,
      },
    );
    if (!req.ok) throw new Error("request");
    await expect(saveCitationImprovement(scope, { ...req.request }, rpc)).rejects.toThrow(
      "citation_improvement_finding_stale",
    );
    expect(await count()).toBe(2);
    // Malformed expected rows are refused at the RPC boundary (no partial write).
    const bad = await rpc("save_ai_citation_improvement_v3", {
      p_user: user,
      p_project: "p",
      p_record: improvement({ description: "Bad token" }),
      p_scope: panelScope,
      p_binding: binding(),
      p_expected_version: legacy.version,
      p_expected_head: legacy.id,
      p_expected_findings: ["not-a-uuid"],
    });
    expect(bad.error).toBeTruthy();
    expect(await count()).toBe(2);
  });
  it("R2: an inspection built from a displayed OLDER row carries that row's token and is refused once a later correction exists; the stored correction is untouched; a frozen retry resolves to one row", async () => {
    const v1 = await saveI(
      improvement({ description: "Original reviewed change" }),
      binding(),
      fresh,
    );
    const displayed = await getCitationImprovement(scope, v1.id, rpc);
    const v2 = await saveI(
      improvement({ description: "Corrected change the other tab saved" }),
      binding(),
      at(v1),
    );
    const observedAt = await isoAt("- interval '1 hour'");
    const list = (await readCitationImprovements(scope, rpc)).improvements;
    // The client refuses locally (the displayed row is not the head) …
    expect(
      inspectionRequest(displayed, list, {
        checkResult: "shows_approved_content",
        observedAt,
        ownerId: user,
      }),
    ).toEqual({ ok: false, issue: "not_head" });
    // … and the server refuses the same request even if a stale client sent it with the displayed row's token.
    const stale = inspectionRequest(displayed, [list.find((s) => s.id === v1.id)!], {
      checkResult: "shows_approved_content",
      observedAt,
      ownerId: user,
    });
    if (!stale.ok) throw new Error("request");
    expect(stale.request).toMatchObject({ expectedVersion: 1, expectedHeadId: v1.id });
    await expect(saveCitationImprovement(scope, { ...stale.request }, rpc)).rejects.toThrow(
      "citation_improvement_version_conflict",
    );
    expect(await count()).toBe(2);
    expect((await getCitationImprovement(scope, v2.id, rpc)).record.change.description).toBe(
      "Corrected change the other tab saved",
    );
    // The current head, inspected with ITS token: one frozen request, sent twice (lost response), one row.
    const head = await getCitationImprovement(scope, v2.id, rpc);
    const req = inspectionRequest(head, list, {
      checkResult: "shows_approved_content",
      observedAt,
      ownerId: user,
    });
    if (!req.ok) throw new Error("request");
    const first = await saveCitationImprovement(scope, { ...req.request }, rpc);
    const retry = await saveCitationImprovement(scope, { ...req.request }, rpc);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ version: 3, verificationStatus: "owner_attested" });
    expect(await count()).toBe(3);
  });
  it("R3: a later negative (or inconclusive) inspection removes the earlier positive from readiness — heads only, history retained", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    const positive = inspectionPayload(await getCitationImprovement(scope, v1.id, rpc), {
      checkResult: "shows_approved_content",
      observedAt: await isoAt("- interval '1 hour'"),
      ownerId: user,
    });
    if (!positive.ok) throw new Error("fixture positive");
    const v2 = await saveI(
      positive.improvement,
      positive.binding,
      at(v1),
      positive.expectedFindingRowIds,
    );
    const readiness = async () => {
      const list = (await readCitationImprovements(scope, rpc)).improvements;
      const records = new Map<string, AttestedDetail>();
      for (const s of list)
        if (s.verificationStatus === "owner_attested")
          records.set(s.id, await getCitationImprovement(scope, s.id, rpc));
      return { list, r: retestReadiness(list, records) };
    };
    expect((await readiness()).r.distinctVerified).toBe(1);
    const negative = inspectionPayload(await getCitationImprovement(scope, v2.id, rpc), {
      checkResult: "does_not_show",
      observedAt: await isoAt("- interval '30 minutes'"),
      ownerId: user,
    });
    if (!negative.ok) throw new Error("fixture negative");
    const v3 = await saveI(
      negative.improvement,
      negative.binding,
      at(v2),
      negative.expectedFindingRowIds,
    );
    const after = await readiness();
    // History keeps its own status; the CURRENT head is not attested, so nothing counts.
    expect(after.list.find((s) => s.id === v2.id)?.verificationStatus).toBe("owner_attested");
    expect(after.list.find((s) => s.id === v3.id)?.verificationStatus).toBe("connector_receipt");
    expect(after.r).toMatchObject({ distinctVerified: 0, attested: 0 });
    const inconclusive = inspectionPayload(await getCitationImprovement(scope, v3.id, rpc), {
      checkResult: "inconclusive",
      observedAt: await isoAt("- interval '20 minutes'"),
      ownerId: user,
    });
    if (!inconclusive.ok) throw new Error("fixture inconclusive");
    await saveI(
      inconclusive.improvement,
      inconclusive.binding,
      at(v3),
      inconclusive.expectedFindingRowIds,
    );
    expect((await readiness()).r.distinctVerified).toBe(0);
  });
});

describe("Codex N2 residual corrections (S1–S3)", () => {
  it("S2: a downgrade that lands between the list read and the detail read is honoured — the fresh detail status decides, not the older list", async () => {
    const v1 = await saveI(improvement(), binding(), fresh);
    const positive = inspectionPayload(await getCitationImprovement(scope, v1.id, rpc), {
      checkResult: "shows_approved_content",
      observedAt: await isoAt("- interval '1 hour'"),
      ownerId: user,
    });
    if (!positive.ok) throw new Error("fixture");
    const v2 = await saveI(
      positive.improvement,
      positive.binding,
      at(v1),
      positive.expectedFindingRowIds,
    );
    // The list is read while the approval is current …
    const list = (await readCitationImprovements(scope, rpc)).improvements;
    expect(list.find((s) => s.id === v2.id)?.verificationStatus).toBe("owner_attested");
    // … then the approval is revoked before the details are fetched.
    await seedApproval(false);
    const details = new Map<string, AttestedDetail>();
    for (const s of list)
      if (s.verificationStatus === "owner_attested")
        details.set(s.id, await getCitationImprovement(scope, s.id, rpc));
    expect(details.get(v2.id)?.verificationStatus).toBe("unverified");
    expect(retestReadiness(list, details)).toMatchObject({ distinctVerified: 0, attested: 1 });
    // A baseline removal between the reads is handled the same way; an unchanged valid state still counts.
    await seedApproval(true);
    const fresh1 = new Map<string, AttestedDetail>();
    for (const s of list) fresh1.set(s.id, await getCitationImprovement(scope, s.id, rpc));
    expect(retestReadiness(list, fresh1).distinctVerified).toBe(1);
    await db.query("DELETE FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p' AND id=$2", [
      user,
      BASELINE,
    ]);
    const fresh2 = new Map<string, AttestedDetail>();
    for (const s of list) fresh2.set(s.id, await getCitationImprovement(scope, s.id, rpc));
    expect(fresh2.get(v2.id)?.evidenceStatus).toBe("baseline_missing");
    expect(retestReadiness(list, fresh2).distinctVerified).toBe(0);
  });
  it("S3: approval provenance names the ACTUAL approver (owner or delegate) only while the version is currently approved, and the improvement save accepts exactly that approver", async () => {
    const read = () =>
      readPublicationApprovalProvenance(
        { ownerId: user, projectId: "p", assetId: ASSET, versionHash: VERSION },
        rpc,
      );
    expect(await read()).toMatchObject({ approved: true, approverKind: "owner", approverId: user });
    expect(typeof (await read()).approvedAt).toBe("string");
    // Another version hash is not the approved one; a revoked approval returns no approver at all.
    expect(
      await readPublicationApprovalProvenance(
        { ownerId: user, projectId: "p", assetId: ASSET, versionHash: "b".repeat(64) },
        rpc,
      ),
    ).toEqual({ approved: false, approverKind: null, approverId: null, approvedAt: null });
    await seedApproval(false);
    expect(await read()).toEqual({
      approved: false,
      approverKind: null,
      approverId: null,
      approvedAt: null,
    });
    // A genuine DELEGATE approval (released delegated-approval shape: reviewer membership + policy + approval row
    // carrying the delegate and the revisions it was granted under).
    await db.query(
      "INSERT INTO project_team_approval_policy(owner_id,project_id,mode,revision) VALUES($1::uuid,'p','separate_reviewers',4)",
      [user],
    );
    await db.query(
      "INSERT INTO project_team_members(owner_id,project_id,actor_id,role,revision,active,expires_at) VALUES($1::uuid,'p',$2::uuid,'reviewer',2,true,NULL)",
      [user, delegate],
    );
    await db.query(
      "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,updated_at,delegate_actor_id,delegate_membership_revision,delegate_policy_revision) VALUES($1::uuid,'p',$2::text,'milo-publication-v1',$3::text,true,clock_timestamp() - interval '3 hours',$4::uuid,2,4) ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=EXCLUDED.version_hash,approved=EXCLUDED.approved,updated_at=EXCLUDED.updated_at,delegate_actor_id=EXCLUDED.delegate_actor_id,delegate_membership_revision=EXCLUDED.delegate_membership_revision,delegate_policy_revision=EXCLUDED.delegate_policy_revision",
      [user, ASSET, VERSION, delegate],
    );
    const p = await read();
    expect(p).toMatchObject({ approved: true, approverKind: "delegate", approverId: delegate });
    // The improvement save requires exactly that approver: the owner default is refused, the provenance value
    // is accepted (no actor id typed by the owner).
    await expect(saveI(improvement(), binding(), fresh)).rejects.toThrow(
      "citation_improvement_binding_approval_mismatch",
    );
    const saved = await saveI(
      { ...improvement(), change: { ...improvement().change, approvedBy: p.approverId! } },
      binding(),
      fresh,
    );
    expect(saved.verificationStatus).toBe("connector_receipt");
    // A banned delegate makes the approval invalid: no approver is reported and nothing is inferred from the row.
    await db.query(
      "UPDATE auth.users SET banned_until=clock_timestamp() + interval '1 day' WHERE id=$1",
      [delegate],
    );
    expect(await read()).toEqual({
      approved: false,
      approverKind: null,
      approverId: null,
      approvedAt: null,
    });
    await db.query("UPDATE auth.users SET banned_until=NULL WHERE id=$1", [delegate]);
    // Other owner / other project: refused (generic code), never a leaked approver.
    await expect(
      readPublicationApprovalProvenance(
        { ownerId: other, projectId: "p", assetId: ASSET, versionHash: VERSION },
        rpc,
      ),
    ).rejects.toThrow("publication_approval_unavailable");
    const priv = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
      "SELECT has_function_privilege('anon','public.read_publication_approval_provenance_v1(uuid,text,text,text)','EXECUTE') anon, has_function_privilege('authenticated','public.read_publication_approval_provenance_v1(uuid,text,text,text)','EXECUTE') authenticated, has_function_privilege('service_role','public.read_publication_approval_provenance_v1(uuid,text,text,text)','EXECUTE') service",
    );
    expect(priv.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});
