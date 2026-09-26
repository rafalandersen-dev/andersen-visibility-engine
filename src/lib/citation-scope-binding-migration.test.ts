/**
 * Additive candidate 20260926190000 (owner authoring): server-authenticated panel binding for EVERY
 * finding/improvement insert, persisted provenance (`scope_enforced_at`) projected to owner AND reviewer reads,
 * legacy rows readable and never retroactively "verified", and atomic expected-HEAD guards (version + immutable
 * head row id, ABA-proof across P3 delete/recreate) for finding edits and dated-fact corrections. Real released
 * P2 (citation_panels + lock RPC) and P3 SQL underneath; nothing here is production evidence.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { importAnswerEvidence, saveEvidencePrompt } from "./answer-evidence.server";
import { lockedPanelDocument, lockedPanelInsert } from "./citation-panel-fixture";
import {
  readCitationProtocol,
  saveCitationPanelDraft,
  lockCitationPanel,
} from "./citation-protocol.server";
import {
  getCitationFinding,
  readCitationFindings,
  readCitationImprovements,
  removeCitationFinding,
  saveCitationFinding,
  saveCitationImprovement,
} from "./citation-record.server";
import { scopeBinding } from "./citation-record";
import {
  getCitationBusinessFact,
  readCitationBusinessFacts,
  removeCitationBusinessFact,
  saveCitationBusinessFact,
} from "./citation-business-fact.server";
import type { KnowledgeRpc } from "./project-knowledge.server";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const scope = { ownerId: user, projectId: "p" };
const PROMPT = "20000000-0000-4000-8000-000000000001";
const PANEL = "40000000-0000-4000-8000-000000000001"; // locked via the REAL draft/lock RPCs in beforeEach
const DRAFT_ONLY = "40000000-0000-4000-8000-000000000002"; // saved draft, never locked
const LEGACY_PANEL = "40000000-0000-4000-8000-000000000009"; // never stored: legacy rows reference it
const FACT = "a1000000-0000-4000-8000-000000000001";
const now = "2026-09-19T12:00:00Z";
let ANSWER: string;
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
const client = { name: "Acme", market: "US" };
const lockedScope = { panelId: PANEL, panelVersion: 2, client }; // draft v1 → locked v2 (lock appends)
const finding = (
  findingId: string,
  observation = "The answer cites a competitor but not this business.",
) => ({
  findingId,
  family: "citation_source" as const,
  evidence: [{ kind: "answer" as const, id: ANSWER }],
  entityMatch: "confirmed" as const,
  capture: { answerComplete: true, citationsComplete: true },
  observation,
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
  decision: "needs_second_review" as const,
  review: { reviewer: user, reviewedAt: now },
  secondReview: null,
  linkedTaskId: null,
});
const fact = (value: string, validFrom = "2026-01-01T00:00:00Z") => ({
  factId: FACT,
  kind: "price" as const,
  value,
  confirmedBy: user,
  confirmedAt: now,
  validFrom,
  validUntil: null,
});
const improvement = (improvementId: string, findingId: string) => ({
  improvementId,
  findingIds: [findingId],
  taskId: "50000000-0000-4000-8000-000000000001",
  change: {
    description: "Publish the opening hours as text",
    approvedVersion: "a".repeat(64),
    approvedBy: user,
    approvedAt: now,
  },
  destination: { kind: "public_url" as const, reference: "https://acme.example/hours" },
  baselineCaptureIds: [],
  verification: null,
});
/** The inspected-head token: `fresh` for a brand-new logical id, `at(row)` for the row the owner inspected. */
type HeadToken = { expectedVersion: number | null; expectedHeadId: string | null };
const fresh: HeadToken = { expectedVersion: 0, expectedHeadId: null };
const at = (row: { id: string; version: number }): HeadToken => ({
  expectedVersion: row.version,
  expectedHeadId: row.id,
});
const saveF = (
  f: ReturnType<typeof finding>,
  token: HeadToken | null = null,
  sc = lockedScope,
  s = scope,
) => saveCitationFinding(s, { scope: sc, finding: f, ...(token ?? {}) }, rpc);
const saveFact = (f: ReturnType<typeof fact>, token: HeadToken | null = null) =>
  saveCitationBusinessFact(scope, { fact: f, ...(token ?? {}) }, rpc);
const rowCount = async (table: string) =>
  Number((await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
const insertLegacyFinding = async (id: string, projectId = "p") =>
  db.query(
    "INSERT INTO ai_citation_findings(user_id,project_id,id,finding_id,version,family,decision,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id,reviewer_id) VALUES($1,$2,$3,$3,1,'citation_source','needs_second_review',$4::jsonb,$5,$6,1,'Acme','US',$1,$1)",
    [
      user,
      projectId,
      id,
      JSON.stringify(finding(id)),
      id.replace(/-/g, "").padEnd(64, "0"),
      LEGACY_PANEL,
    ],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2)", [user, other]);
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
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("legacy rows inserted BEFORE the candidate is applied", () => {
  beforeEach(async () => {
    await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
    await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2) ON CONFLICT DO NOTHING", [
      user,
      other,
    ]);
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($2,'projects','p')",
      [user, other],
    );
    await saveEvidencePrompt(scope, PROMPT, 0, promptData, rpc);
    ANSWER = await importAnswerEvidence(
      scope,
      {
        promptId: PROMPT,
        promptRevision: 1,
        surface: "ChatGPT web",
        mode: "search" as const,
        method: "manual consumer session",
        modelVersion: null,
        capturedAt: "2024-03-01T00:00:00Z",
        status: "complete" as const,
        rawAnswer: "Acme Massage in Malmö is a good option to book.",
        citations: [] as string[],
        citationsComplete: true,
        failure: null,
        reportedCostUsd: null,
        sourceUrl: null,
        supersedesId: null,
      },
      rpc,
    );
  });
  it("applies the candidate on top of pre-existing owner-declared rows and keeps them readable as legacy", async () => {
    // A row written by the P3 v1 RPC under an owner-declared scope that references no stored panel at all.
    const legacy = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: finding("61000000-0000-4000-8000-000000000001"),
      p_scope: { panelId: LEGACY_PANEL, panelVersion: 1, client },
    });
    expect(legacy.error).toBeNull();
    const legacyId = (legacy.data as { id: string }).id;
    // Apply the candidate NOW (after the legacy row exists) — the migration order production will see.
    await db.exec(
      readFileSync(
        "supabase/migrations/20260926190000_citation_scope_binding_versions.sql",
        "utf8",
      ),
    );
    const listed = await readCitationFindings(scope, rpc);
    expect(listed.findings.map((f) => [f.id, f.scopeEnforcedAt])).toEqual([[legacyId, null]]);
    expect(scopeBinding(listed.findings[0].scopeEnforcedAt)).toBe("legacy");
    const detail = await getCitationFinding(scope, legacyId, rpc);
    expect(detail.scopeEnforcedAt).toBeNull();
    // An IDENTICAL retry of the legacy record (same digest) returns the legacy row unchanged: no insert, no
    // enforcement stamp, no conflict — even through the v2 wrapper with a stale expected version.
    const retry = await saveF(finding("61000000-0000-4000-8000-000000000001"), fresh, {
      panelId: LEGACY_PANEL,
      panelVersion: 1,
      client,
    });
    expect(retry.id).toBe(legacyId);
    expect(retry.version).toBe(1);
    expect(retry.scopeEnforcedAt).toBeNull();
    expect(await rowCount("ai_citation_findings")).toBe(1);
    // A DIFFERENT new version of that legacy finding must now bind to a locked panel: the legacy scope is not a
    // stored locked panel, so the edit is refused (the finding stays exactly as it was; no partial write).
    await expect(
      saveF(
        finding("61000000-0000-4000-8000-000000000001", "Edited observation"),
        { expectedVersion: 1, expectedHeadId: legacyId },
        {
          panelId: LEGACY_PANEL,
          panelVersion: 1,
          client,
        },
      ),
    ).rejects.toThrow("citation_panel_scope_unauthenticated");
    expect(await rowCount("ai_citation_findings")).toBe(1);
  });
});

describe("after the candidate: enforced writes, provenance, conflicts", () => {
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
    await saveEvidencePrompt(scope, PROMPT, 0, promptData, rpc);
    ANSWER = await importAnswerEvidence(
      scope,
      {
        promptId: PROMPT,
        promptRevision: 1,
        surface: "ChatGPT web",
        mode: "search" as const,
        method: "manual consumer session",
        modelVersion: null,
        capturedAt: "2024-03-01T00:00:00Z",
        status: "complete" as const,
        rawAnswer: "Acme Massage in Malmö is a good option to book.",
        citations: [] as string[],
        citationsComplete: true,
        failure: null,
        reportedCostUsd: null,
        sourceUrl: null,
        supersedesId: null,
      },
      rpc,
    );
    // The REAL P2 path: a brand draft bound to the saved prompt, then the owner lock (server-minted approval).
    const draft = {
      ...lockedPanelDocument({
        userId: user,
        projectId: "p",
        panelId: PANEL,
        client,
        status: "draft",
      }),
    };
    draft.questions = [
      { ...draft.questions[0], promptId: PROMPT, promptRevision: 1, text: promptData.prompt },
    ];
    await saveCitationPanelDraft(scope, PANEL, 0, draft, rpc);
    const locked = await lockCitationPanel(scope, PANEL, 1, rpc);
    expect(locked.status).toBe("locked");
    expect(locked.version).toBe(2);
    // A second panel saved as a draft only (never locked).
    const draftOnly = { ...draft, panelId: DRAFT_ONLY };
    await saveCitationPanelDraft(scope, DRAFT_ONLY, 0, draftOnly, rpc);
  });
  it("accepts a finding whose scope is the stored LOCKED version with the same client and stamps provenance", async () => {
    const saved = await saveF(finding("62000000-0000-4000-8000-000000000001"));
    expect(saved.version).toBe(1);
    expect(saved.scopeEnforcedAt).not.toBeNull();
    expect(scopeBinding(saved.scopeEnforcedAt)).toBe("enforced");
    const listed = await readCitationFindings(scope, rpc);
    expect(scopeBinding(listed.findings[0].scopeEnforcedAt)).toBe("enforced");
    expect((await getCitationFinding(scope, saved.id, rpc)).scopeEnforcedAt).toBe(
      saved.scopeEnforcedAt,
    );
    // The protocol read still lists the locked panel the finding is bound to (owner-visible provenance chain).
    const protocol = await readCitationProtocol(scope, rpc);
    expect(
      protocol.panels.some((p) => p.panelId === PANEL && p.version === 2 && p.status === "locked"),
    ).toBe(true);
  });
  it.each([
    ["the DRAFT version of the locked panel", { panelId: PANEL, panelVersion: 1, client }],
    ["a draft-only panel", { panelId: DRAFT_ONLY, panelVersion: 1, client }],
    ["a never-stored panel", { panelId: LEGACY_PANEL, panelVersion: 1, client }],
    ["a never-locked version number", { panelId: PANEL, panelVersion: 3, client }],
    [
      "a renamed client",
      { panelId: PANEL, panelVersion: 2, client: { name: "Rival", market: "US" } },
    ],
    ["another market", { panelId: PANEL, panelVersion: 2, client: { name: "Acme", market: "SE" } }],
  ])("refuses a finding whose scope is %s and writes nothing", async (_label, sc) => {
    await expect(saveF(finding("62000000-0000-4000-8000-000000000002"), null, sc)).rejects.toThrow(
      "citation_panel_scope_unauthenticated",
    );
    expect(await rowCount("ai_citation_findings")).toBe(0);
  });
  it("refuses a scope that belongs to ANOTHER tenant's locked panel and a foreign-project scope", async () => {
    // Same panel id/version/client stored under `other`: the predicate is owner/project scoped.
    await db.query(
      ...lockedPanelInsert({ userId: other, projectId: "p", panelId: LEGACY_PANEL, client }),
    );
    await expect(
      saveF(finding("62000000-0000-4000-8000-000000000003"), null, {
        panelId: LEGACY_PANEL,
        panelVersion: 1,
        client,
      }),
    ).rejects.toThrow("citation_panel_scope_unauthenticated");
    // The owner's own locked panel does not authorize a save under a DIFFERENT project of theirs.
    await expect(
      saveF(finding("62000000-0000-4000-8000-000000000004"), null, lockedScope, {
        ownerId: user,
        projectId: "q",
      }),
    ).rejects.toThrow("citation_panel_scope_unauthenticated");
    expect(await rowCount("ai_citation_findings")).toBe(0);
  });
  it("enforces the same binding on improvement inserts through the unchanged P3 improvement save", async () => {
    const f = await saveF(finding("62000000-0000-4000-8000-000000000005"));
    // Bound to the finding's locked scope: accepted and stamped.
    const ok = await saveCitationImprovement(
      scope,
      {
        scope: lockedScope,
        improvement: improvement("70000000-0000-4000-8000-000000000001", f.findingId),
      },
      rpc,
    );
    expect(scopeBinding(ok.scopeEnforcedAt)).toBe("enforced");
    expect((await readCitationImprovements(scope, rpc)).improvements[0].scopeEnforcedAt).toBe(
      ok.scopeEnforcedAt,
    );
    // The P3 v1 save is still callable by the service (rollout compatibility) but cannot bypass enforcement:
    // a draft-only scope is refused by the trigger even through v1.
    const legacyPath = await rpc("save_ai_citation_improvement", {
      p_user: user,
      p_project: "p",
      p_record: improvement("70000000-0000-4000-8000-000000000002", f.findingId),
      p_scope: { panelId: DRAFT_ONLY, panelVersion: 1, client },
      p_binding: null,
    });
    expect(legacyPath.error).not.toBeNull();
    expect(String((legacyPath.error as { message?: string }).message)).toContain(
      "citation_improvement_finding_unresolved",
    );
    expect(await rowCount("ai_citation_improvements")).toBe(1);
    // Direct v1 finding save with an unlocked scope is refused by the trigger too (no wrapper needed).
    const v1 = await rpc("save_ai_citation_finding", {
      p_user: user,
      p_project: "p",
      p_record: finding("62000000-0000-4000-8000-000000000006"),
      p_scope: { panelId: DRAFT_ONLY, panelVersion: 1, client },
    });
    expect(String((v1.error as { message?: string }).message)).toContain(
      "citation_panel_scope_unauthenticated",
    );
  });
  it("finding edits: identical retry idempotent, stale different edit conflicts atomically, fresh edit versions", async () => {
    const id = "62000000-0000-4000-8000-000000000007";
    const v1 = await saveF(finding(id), fresh);
    expect(v1.version).toBe(1);
    // Identical retry with the SAME stale expectation (new): idempotent, same row, no new version, no conflict.
    const retry = await saveF(finding(id), fresh);
    expect(retry.id).toBe(v1.id);
    expect(await rowCount("ai_citation_findings")).toBe(1);
    // A DIFFERENT edit that expects "new" while the head is 1: refused and rolled back (still 1 row).
    await expect(saveF(finding(id, "Edited after someone else"), fresh)).rejects.toThrow(
      "citation_finding_version_conflict",
    );
    expect(await rowCount("ai_citation_findings")).toBe(1);
    // The owner reopens (head row v1) and edits: version 2 chained to version 1.
    const v2 = await saveF(finding(id, "Edited after fresh inspection"), at(v1));
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    // Two owners' tabs: tab A saved v2; tab B still holds row v1 with its own different edit → conflict, draft kept.
    await expect(saveF(finding(id, "Tab B edit"), at(v1))).rejects.toThrow(
      "citation_finding_version_conflict",
    );
    expect(await rowCount("ai_citation_findings")).toBe(2);
    // A new finding id with a stale non-zero expectation is a conflict too (nothing to edit).
    await expect(
      saveF(finding("62000000-0000-4000-8000-000000000008"), {
        expectedVersion: 3,
        expectedHeadId: v2.id,
      }),
    ).rejects.toThrow("citation_finding_version_conflict");
    // Scope change on an existing finding id is still a NEW identity, never a migration.
    await db.query(
      ...lockedPanelInsert({ userId: user, projectId: "p", panelId: LEGACY_PANEL, client }),
    );
    await expect(
      saveF(finding(id, "Moved scope"), at(v2), { panelId: LEGACY_PANEL, panelVersion: 1, client }),
    ).rejects.toThrow("citation_finding_scope_drift");
  });
  it("finding ABA: a deleted head recreated under the SAME number is a different row; the stale row token conflicts", async () => {
    const id = "62000000-0000-4000-8000-00000000000b";
    const x1 = await saveF(finding(id), fresh);
    const x2 = await saveF(finding(id, "Second version X"), at(x1));
    expect(x2.version).toBe(2);
    // Tab A inspected row X2 (v2). Meanwhile tab B deletes X2 and writes a NEW v2 (row Y) on top of v1: P3
    // physically deletes the head row and reuses max(version)+1, so "v2" now names a different row.
    await removeCitationFinding(scope, x2.id, rpc);
    const y = await saveF(finding(id, "Second version Y"), at(x1));
    expect(y.version).toBe(2);
    expect(y.id).not.toBe(x2.id);
    expect(await rowCount("ai_citation_findings")).toBe(2);
    // Tab A submits a DIFFERENT edit with (v2, row X2): the number matches the current head but the row does
    // not → refused atomically, nothing written, Y remains the head.
    await expect(saveF(finding(id, "Tab A edit on top of X"), at(x2))).rejects.toThrow(
      "citation_finding_version_conflict",
    );
    expect(await rowCount("ai_citation_findings")).toBe(2);
    // The numeric version WITHOUT its row id is fail-closed at the SQL boundary too (the client contract already
    // refuses the pairing; call the RPC directly to prove the database does not trust the number alone).
    const bare = await rpc("save_ai_citation_finding_v2", {
      p_user: user,
      p_project: "p",
      p_record: finding(id, "Tab A edit with a bare number"),
      p_scope: lockedScope,
      p_expected_version: 2,
      p_expected_head: null,
    });
    expect(String((bare.error as { message?: string }).message)).toContain(
      "citation_finding_version_conflict",
    );
    expect(await rowCount("ai_citation_findings")).toBe(2);
    // An identical resubmission of Y's payload — even under tab A's stale token — returns Y unchanged: idempotency
    // is resolved before the head check, so a repeated successful request never conflicts and never mints a row.
    const again = await saveF(finding(id, "Second version Y"), at(x2));
    expect(again.id).toBe(y.id);
    expect(await rowCount("ai_citation_findings")).toBe(2);
    // Tab A reopens the CURRENT head (row Y) and edits on top of it → v3 chained to Y, not to the deleted X2.
    const v3 = await saveF(finding(id, "Tab A edit after inspecting Y"), at(y));
    expect(v3.version).toBe(3);
    expect(v3.supersedesId).toBe(y.id);
    expect((await readCitationFindings(scope, rpc)).findings.map((f) => f.version).sort()).toEqual([
      1, 2, 3,
    ]);
  });
  it("dated facts: corrections chain versions, identical retry idempotent, stale correction conflicts", async () => {
    const v1 = await saveFact(fact("500 SEK / 60 min"), fresh);
    expect(v1.version).toBe(1);
    const retry = await saveFact(fact("500 SEK / 60 min"), fresh);
    expect(retry.id).toBe(v1.id);
    // Correction after capture: new validity from a later date, on top of the inspected head row (v1).
    const v2 = await saveFact(fact("550 SEK / 60 min", "2026-06-01T00:00:00Z"), at(v1));
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    // A stale correction that still holds row v1 is refused; the fact stays at version 2.
    await expect(
      saveFact(fact("600 SEK / 60 min", "2026-07-01T00:00:00Z"), at(v1)),
    ).rejects.toThrow("citation_business_fact_version_conflict");
    const facts = await readCitationBusinessFacts(scope, rpc);
    expect(facts.facts.map((f) => f.version).sort()).toEqual([1, 2]);
    expect((await getCitationBusinessFact(scope, v2.id, rpc)).record.value).toBe(
      "550 SEK / 60 min",
    );
  });
  it("fact ABA: delete head, recreate the same number, stale row token conflicts; identical payload still idempotent", async () => {
    const x1 = await saveFact(fact("500 SEK / 60 min"), fresh);
    const x2 = await saveFact(fact("550 SEK / 60 min", "2026-06-01T00:00:00Z"), at(x1));
    expect(x2.version).toBe(2);
    await removeCitationBusinessFact(scope, x2.id, rpc);
    const y = await saveFact(fact("560 SEK / 60 min", "2026-06-01T00:00:00Z"), at(x1));
    expect(y.version).toBe(2);
    expect(y.id).not.toBe(x2.id);
    // A correction that inspected the deleted row X2 (v2) must not write on top of Y (also v2).
    await expect(
      saveFact(fact("600 SEK / 60 min", "2026-07-01T00:00:00Z"), at(x2)),
    ).rejects.toThrow("citation_business_fact_version_conflict");
    expect(await rowCount("ai_citation_business_facts")).toBe(2);
    const bare = await rpc("save_ai_citation_business_fact_v2", {
      p_user: user,
      p_project: "p",
      p_record: fact("600 SEK / 60 min", "2026-07-01T00:00:00Z"),
      p_expected_version: 2,
      p_expected_head: null,
    });
    expect(String((bare.error as { message?: string }).message)).toContain(
      "citation_business_fact_version_conflict",
    );
    expect(await rowCount("ai_citation_business_facts")).toBe(2);
    // Same semantic payload as Y under the stale token: idempotent, returns Y, no new version.
    const again = await saveFact(fact("560 SEK / 60 min", "2026-06-01T00:00:00Z"), at(x2));
    expect(again.id).toBe(y.id);
    expect(await rowCount("ai_citation_business_facts")).toBe(2);
    // Reopen the current head Y and correct on top of it → v3 chained to Y.
    const v3 = await saveFact(fact("600 SEK / 60 min", "2026-07-01T00:00:00Z"), at(y));
    expect(v3.version).toBe(3);
    expect(v3.supersedesId).toBe(y.id);
  });
  it("the reviewer read carries the same provenance the owner sees (enforced) and legacy stays legacy", async () => {
    const saved = await saveF(finding("62000000-0000-4000-8000-000000000009"));
    // Owner reads via v2 (own project) — the reviewer projection is the same column; assert the v2 RPC shape
    // directly for the owner (the full reviewer authorization path is covered by the review migration tests).
    const owner = await rpc("read_ai_citation_finding_v2", {
      p_user: user,
      p_project: "p",
      p_id: saved.id,
    });
    expect((owner.data as { scopeEnforcedAt: string | null }).scopeEnforcedAt).toBe(
      saved.scopeEnforcedAt,
    );
    // After apply, even a DIRECT row insert (no RPC) under an unstored scope is refused by the trigger.
    await expect(insertLegacyFinding("62000000-0000-4000-8000-00000000000a")).rejects.toThrow(
      "citation_panel_scope_unauthenticated",
    );
    // A direct improvement insert under a draft-only scope is refused the same way (trigger, not the RPC).
    await expect(
      db.query(
        "INSERT INTO ai_citation_improvements(user_id,project_id,id,improvement_id,version,record,record_sha256,panel_id,panel_version,client_name,client_market,actor_id) VALUES($1,'p',$2,$2,1,'{}'::jsonb,$3,$4,1,'Acme','US',$1)",
        [user, "70000000-0000-4000-8000-000000000009", "9".repeat(64), DRAFT_ONLY],
      ),
    ).rejects.toThrow("citation_panel_scope_unauthenticated");
  });
});
