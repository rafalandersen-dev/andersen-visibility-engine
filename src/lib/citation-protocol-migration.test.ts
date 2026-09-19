import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveEvidencePrompt, readAnswerEvidence } from "./answer-evidence.server";
import {
  approveBrandRun,
  importManualCapture,
  lockCitationPanel,
  readCitationProtocol,
  saveCitationPanelDraft,
} from "./citation-protocol.server";
import { resolveStoredCaptures } from "./citation-protocol";
import type { KnowledgeRpc } from "./project-knowledge.server";
/** Real Postgres (PGlite) round trips over the CI-2 storage. Fixtures only; no live client data,
 * no provider or URL calls. Covers isolation, auth, revoked/missing project, reference forgery,
 * approval version, protocol binding, capacity, deletion and idempotency. */
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { ownerId: user, projectId: "p" };
const discoveryPromptId = uuid(101),
  brandPromptId = uuid(201);
const discoveryPanelId = uuid(1),
  brandPanelId = uuid(2);
const discoveryText = "FIXTURE Var kan jag boka massage i Limhamn?";
const brandText = "FIXTURE Vad är Synergy Massage i Malmö?";
const surface = {
  service: "ChatGPT",
  interface: "consumer web app",
  mode: "search",
  searchMode: "Search",
  modelLabel: null,
  webSearchEvidenced: "evidenced",
};
const panelSession = {
  freshSession: true,
  personalisation: "non_personalised",
  signedIn: "signed_in",
  memory: "off",
  customInstructions: "none",
  connectedTools: "none",
  extraInstruction: null,
  priorMessages: 0,
};
const collection = { country: "Sweden", city: "Malmö", devicePermission: "granted", vpn: false };
const promptData = (text: string) => ({
  prompt: text,
  intent: "discovery",
  source: "manual",
  market: "Sweden",
  language: "Swedish",
  brand: "Synergy",
  websiteUrl: "https://synergymassage.se",
  competitorUrls: [],
  active: true,
});
const draftDiscovery = (over: Record<string, unknown> = {}) => ({
  panelId: discoveryPanelId,
  version: 1,
  kind: "discovery",
  client: { name: "FIXTURE Synergy", market: "Sweden — Malmö/Limhamn" },
  questionLanguage: "sv",
  interfaceLanguage: "en",
  surface,
  session: panelSession,
  collection,
  questions: [
    {
      id: "SY-D01",
      promptId: discoveryPromptId,
      promptRevision: 1,
      text: discoveryText,
      language: "sv",
    },
  ],
  rounds: 4,
  status: "draft",
  approval: null,
  ...over,
});
const draftBrand = (over: Record<string, unknown> = {}) => ({
  ...draftDiscovery(),
  panelId: brandPanelId,
  kind: "brand",
  questions: [
    { id: "SY-B01", promptId: brandPromptId, promptRevision: 1, text: brandText, language: "sv" },
  ],
  rounds: 0,
  ...over,
});
const ctxBase = {
  session: {
    freshSession: true,
    personalisation: "non_personalised",
    signedIn: "signed_in",
    memory: "off",
    customInstructions: "none",
    connectedTools: "none",
    temporaryChat: "yes",
  },
  location: {
    inQuestion: "Limhamn",
    collectionCountry: "Sweden",
    collectionCity: "Malmö",
    devicePermission: "granted",
    vpn: false,
  },
  language: { prompt: "sv", interface: "en", answer: "sv" },
  surface,
  capture: { screenshotRef: null, missingReason: null },
  deviationNotes: [] as string[],
};
const answerBase = {
  surface: "ChatGPT",
  mode: "search",
  method: "manual copy v1",
  modelVersion: null,
  status: "complete",
  rawAnswer: "FIXTURE answer",
  citations: [] as string[],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
};
/** A discovery capture bound to the LOCKED panel version (draft v1 → locked v2). */
function discoveryCapture(
  ctxOver: Record<string, unknown> = {},
  answerOver: Record<string, unknown> = {},
) {
  const time = {
    capturedAt: "2026-09-08T10:00:00Z",
    intendedSlotAt: "2026-09-08T09:00:00Z",
    delayMinutes: 60,
    ...((ctxOver.time as object) || {}),
  };
  const ctx = {
    ...ctxBase,
    panelId: discoveryPanelId,
    panelVersion: 2,
    slot: { round: 1, questionId: "SY-D01" },
    brandRunId: null,
    instructions: { questionText: discoveryText, extraInstruction: null, priorMessages: 0 },
    ...ctxOver,
    time,
  };
  return {
    ...answerBase,
    promptId: discoveryPromptId,
    promptRevision: 1,
    capturedAt: time.capturedAt,
    captureContext: ctx,
    ...answerOver,
  };
}
function brandCapture(
  ctxOver: Record<string, unknown> = {},
  answerOver: Record<string, unknown> = {},
) {
  const time = {
    capturedAt: "2026-09-08T10:00:00Z",
    intendedSlotAt: "2026-09-08T09:00:00Z",
    delayMinutes: 60,
    ...((ctxOver.time as object) || {}),
  };
  const ctx = {
    ...ctxBase,
    panelId: brandPanelId,
    panelVersion: 2,
    slot: { round: 1, questionId: "SY-B01" },
    brandRunId: uuid(50),
    instructions: { questionText: brandText, extraInstruction: null, priorMessages: 0 },
    ...ctxOver,
    time,
  };
  return {
    ...answerBase,
    promptId: brandPromptId,
    promptRevision: 1,
    capturedAt: time.capturedAt,
    captureContext: ctx,
    ...answerOver,
  };
}
async function insertBrandRun(runId: string, over: Record<string, unknown> = {}) {
  const doc = {
    id: runId,
    panelId: brandPanelId,
    panelVersion: 2,
    approvedBy: user,
    approvedAt: "2026-09-01T00:00:00Z",
    observationBudget: 2,
    rounds: 1,
    ...over,
  };
  await db.query(
    "INSERT INTO citation_brand_runs(user_id,project_id,run_id,panel_id,panel_version,document) VALUES($1,'p',$2,$3,$4,$5)",
    [user, runId, doc.panelId, doc.panelVersion, doc],
  );
  return doc;
}
/** Fixture: stamp a locked panel version with an explicit HISTORICAL owner-approval instant so a
 * capture dated after it is legitimately post-approval (spec Appendix A). This models a panel
 * approved on a past date; it is a raw test-fixture write, never a product path, and does not touch
 * the immutability of the lock RPC (which mints approval at the live DB clock). */
async function backdatePanelApproval(
  panelId: string,
  version = 2,
  approvedAt = "2026-09-01T00:00:00.000Z",
) {
  await db.query(
    "UPDATE citation_panels SET document=jsonb_set(document,'{approval,approvedAt}',to_jsonb($4::text)) WHERE user_id=$1 AND project_id='p' AND panel_id=$2 AND version=$3",
    [user, panelId, version, approvedAt],
  );
  return approvedAt;
}
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
    "20260919170000_citation_protocol.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q'),($2,'projects','p')",
    [user, other],
  );
  await saveEvidencePrompt(scope, discoveryPromptId, 0, promptData(discoveryText), rpc);
  await saveEvidencePrompt(scope, brandPromptId, 0, promptData(brandText), rpc);
});
afterAll(async () => {
  await db?.close();
});

describe("CI-2 panel storage, versioning and owner lock", () => {
  it("saves an immutable draft, locks it with a server-derived approval, and freezes content", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    const locked = await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    expect(locked).toMatchObject({ version: 2, status: "locked" });
    expect(locked.approval?.approvedBy).toBe(user);
    expect(Date.parse(locked.approval!.approvedAt)).toBeGreaterThan(0);
    // Frozen reviewed content carried verbatim from the draft.
    expect(locked.collection).toEqual(collection);
    expect(locked.interfaceLanguage).toBe("en");
    const state = await readCitationProtocol(scope, rpc);
    expect(state.panels).toHaveLength(2); // draft v1 and locked v2, both immutable
    expect(state.panels.map((p) => p.version).sort()).toEqual([1, 2]);
  });
  it("rejects a stale draft version and a second lock of an already-locked panel", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await expect(
      saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery({ version: 1 }), rpc),
    ).rejects.toThrow();
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await expect(lockCitationPanel(scope, discoveryPanelId, 1, rpc)).rejects.toThrow();
  });
  it("refuses reference forgery: a question with no saved prompt or drifted text", async () => {
    await expect(
      saveCitationPanelDraft(
        scope,
        discoveryPanelId,
        0,
        draftDiscovery({
          questions: [
            {
              id: "SY-D01",
              promptId: uuid(999),
              promptRevision: 1,
              text: discoveryText,
              language: "sv",
            },
          ],
        }),
        rpc,
      ),
    ).rejects.toThrow();
    await expect(
      saveCitationPanelDraft(
        scope,
        discoveryPanelId,
        0,
        draftDiscovery({
          questions: [
            {
              id: "SY-D01",
              promptId: discoveryPromptId,
              promptRevision: 1,
              text: "FIXTURE drifted text not matching the prompt",
              language: "sv",
            },
          ],
        }),
        rpc,
      ),
    ).rejects.toThrow();
  });
  it("refuses to lock a discovery draft that plans no rounds", async () => {
    await saveCitationPanelDraft(
      scope,
      uuid(3),
      0,
      draftDiscovery({ panelId: uuid(3), rounds: 0 }),
      rpc,
    );
    await expect(lockCitationPanel(scope, uuid(3), 1, rpc)).rejects.toThrow();
  });
});

describe("CI-2 brand run approval", () => {
  beforeEach(async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
  });
  it("approves a run bound to a locked brand panel and is idempotent by run id", async () => {
    const approval = {
      runId: uuid(50),
      panelId: brandPanelId,
      panelVersion: 2,
      observationBudget: 5,
      rounds: 1,
    };
    const run = await approveBrandRun(scope, approval, rpc);
    expect(run).toMatchObject({
      id: uuid(50),
      panelId: brandPanelId,
      approvedBy: user,
      observationBudget: 5,
    });
    expect(await approveBrandRun(scope, approval, rpc)).toEqual(run); // same receipt, no duplicate
    await expect(
      approveBrandRun(scope, { ...approval, observationBudget: 9 }, rpc),
    ).rejects.toThrow(); // changed caps for an existing run id
  });
  it("refuses a run bound to a discovery, draft or missing panel version", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await expect(
      approveBrandRun(
        scope,
        {
          runId: uuid(51),
          panelId: discoveryPanelId,
          panelVersion: 2,
          observationBudget: 5,
          rounds: 1,
        },
        rpc,
      ),
    ).rejects.toThrow(); // discovery panel, not brand
    await expect(
      approveBrandRun(
        scope,
        {
          runId: uuid(52),
          panelId: brandPanelId,
          panelVersion: 1,
          observationBudget: 5,
          rounds: 1,
        },
        rpc,
      ),
    ).rejects.toThrow(); // version 1 is the unlocked draft
  });
});

describe("CI-2 manual capture resolution and binding", () => {
  beforeEach(async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    // Historical approval so the 2026-09-08 fixture captures are legitimately post-approval.
    await backdatePanelApproval(discoveryPanelId);
  });
  it("stores a discovery capture bound to the locked version and dedupes an identical import", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    const again = await importManualCapture(scope, discoveryCapture(), rpc);
    expect(again).toBe(first);
    const answers = (await readAnswerEvidence(scope, rpc)).answers;
    expect(answers).toHaveLength(1);
    const state = await readCitationProtocol(scope, rpc);
    const resolved = resolveStoredCaptures(
      answers.map((a) => ({
        id: a.id,
        status: a.input.status,
        promptId: a.input.promptId,
        promptRevision: a.input.promptRevision,
        captureContext: a.input.captureContext,
      })),
      state.panels,
      state.brandRuns,
    );
    expect(resolved[0]).toMatchObject({ outcome: "complete", panelResolved: true, deviations: [] });
  });
  it("refuses a capture collected before the panel version's approval and accepts one at or after it", async () => {
    const preApprovalTime = {
      capturedAt: "2026-08-15T10:00:00Z",
      intendedSlotAt: "2026-08-15T09:00:00Z",
      delayMinutes: 0,
    };
    // Public wrapper: a pre-approval capture is refused and nothing is inserted. The server maps the
    // DB guard to its generic unavailable error, so only the refusal (not the raw message) is asserted
    // here (spec Appendix A: owner review BEFORE USE).
    await expect(
      importManualCapture(scope, discoveryCapture({ time: preApprovalTime }), rpc),
    ).rejects.toThrow();
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]);
    // SQL guard specifically: assemble a valid stored document via the PGlite path, then move its
    // capture instant (input and context together) before the panel approval — the RPC raises the
    // exact guard error and stores nothing.
    const validId = await importManualCapture(scope, discoveryCapture(), rpc); // 2026-09-08, accepted
    const stored = (await readAnswerEvidence(scope, rpc)).answers[0];
    const preApproval = {
      input: {
        ...stored.input,
        capturedAt: preApprovalTime.capturedAt,
        captureContext: { ...stored.input.captureContext, time: preApprovalTime },
      },
      prompt: stored.prompt,
      analysis: stored.analysis,
    };
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", preApproval]),
    ).rejects.toThrow(/citation_panel_approved_after_capture/);
    // Exactly at the approval instant, and after it, are accepted with their correct timestamps.
    const at = "2026-09-01T00:00:00.000Z"; // equals the historical fixture approval
    expect(
      await importManualCapture(
        scope,
        discoveryCapture({ time: { capturedAt: at, intendedSlotAt: at, delayMinutes: 0 } }),
        rpc,
      ),
    ).toBeTypeOf("string");
    expect(validId).toBeTypeOf("string");
    // Only the 2026-09-08 and the at-approval captures persist; neither pre-approval attempt stored.
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(2);
  });
  it("rejects a capture against a draft version, a foreign version, a drifted question or an out-of-panel round", async () => {
    for (const capture of [
      discoveryCapture({ panelVersion: 1 }), // the unlocked draft
      discoveryCapture({ panelVersion: 9 }), // no such version
      discoveryCapture({
        instructions: {
          questionText: "FIXTURE different",
          extraInstruction: null,
          priorMessages: 0,
        },
      }),
      discoveryCapture({ slot: { round: 5, questionId: "SY-D01" } }),
      discoveryCapture({ slot: { round: 1, questionId: "SY-B01" } }), // question not in this panel
      discoveryCapture({ brandRunId: uuid(50) }), // discovery carries no brand run
    ])
      await expect(importManualCapture(scope, capture, rpc)).rejects.toThrow();
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]);
  });
  it("shares the 100-record answer capacity and refuses a capture at the ceiling", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,prompt_id,prompt_revision,document_hash,document) SELECT user_id,project_id,prompt_id,prompt_revision,'synthetic-'||g,document FROM ai_answer_evidence CROSS JOIN generate_series(1,99) g WHERE id=$1",
      [first],
    );
    expect(await importManualCapture(scope, discoveryCapture(), rpc)).toBe(first); // identical dedupes
    await expect(
      importManualCapture(scope, discoveryCapture({}, { rawAnswer: "one over the ceiling" }), rpc),
    ).rejects.toThrow(); // a genuinely new capture is blocked, never auto-deleted
  });
  it("rejects a document whose capture instant is tampered at the SQL boundary", async () => {
    await importManualCapture(scope, discoveryCapture(), rpc);
    const original = (await readAnswerEvidence(scope, rpc)).answers[0];
    const tampered = {
      input: { ...original.input, capturedAt: "2026-09-09T10:00:00Z" },
      prompt: original.prompt,
      analysis: original.analysis,
    };
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", tampered]),
    ).rejects.toThrow(/citation_capture_time_mismatch/);
  });
  it("refuses a record whose own mode or model contradicts its capture-context surface", async () => {
    // An API answer wearing a consumer/search capture context (or a mismatched model label) is a
    // self-contradiction, refused at the input boundary before any RPC. A deviation from the panel is
    // different: it would be stored and flagged by the read resolver, not rejected here.
    await expect(
      importManualCapture(scope, discoveryCapture({}, { mode: "api" }), rpc),
    ).rejects.toThrow(/citation_capture_mode_conflict/);
    await expect(
      importManualCapture(scope, discoveryCapture({}, { modelVersion: "gpt-x" }), rpc),
    ).rejects.toThrow(/citation_capture_model_conflict/);
    // SQL defence in depth: a document whose input mode is tampered to disagree with its context
    // surface is refused at the RPC boundary as well, and nothing is stored.
    await importManualCapture(scope, discoveryCapture(), rpc);
    const original = (await readAnswerEvidence(scope, rpc)).answers[0];
    const tampered = {
      input: { ...original.input, mode: "api" },
      prompt: original.prompt,
      analysis: original.analysis,
    };
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", tampered]),
    ).rejects.toThrow(/citation_capture_mode_conflict/);
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
  });
});

describe("CI-2 brand capture budget and prospective approval", () => {
  beforeEach(async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    // Historical panel approval so the 2026-09-08 fixture captures are post-approval; the brand run's
    // own separate prospective-approval guard is still exercised below.
    await backdatePanelApproval(brandPanelId);
  });
  it("accepts a capture under an approved run and refuses a run-less, foreign or future-approved run", async () => {
    await insertBrandRun(uuid(50));
    expect(await importManualCapture(scope, brandCapture(), rpc)).toBeTypeOf("string");
    await expect(
      importManualCapture(scope, brandCapture({ brandRunId: null }), rpc),
    ).rejects.toThrow();
    await expect(
      importManualCapture(scope, brandCapture({ brandRunId: uuid(77) }), rpc),
    ).rejects.toThrow();
    await insertBrandRun(uuid(78), { approvedAt: "2027-01-01T00:00:00Z" });
    await expect(
      importManualCapture(
        scope,
        brandCapture({ brandRunId: uuid(78) }, { rawAnswer: "future run" }),
        rpc,
      ),
    ).rejects.toThrow(); // approved after the capture
  });
  it("bounds captures to the run's observation budget and rounds", async () => {
    await insertBrandRun(uuid(50), { observationBudget: 1, rounds: 1 });
    const first = await importManualCapture(scope, brandCapture(), rpc);
    // An exact re-import at an exhausted budget dedupes to the persisted id: hash dedup runs before
    // the new-observation budget check, so the identical capture is never re-charged or refused.
    expect(await importManualCapture(scope, brandCapture(), rpc)).toBe(first);
    await expect(
      importManualCapture(
        scope,
        brandCapture({}, { rawAnswer: "second distinct observation" }),
        rpc,
      ),
    ).rejects.toThrow(); // a genuinely new observation over budget is refused
    await expect(
      importManualCapture(scope, brandCapture({ slot: { round: 2, questionId: "SY-B01" } }), rpc),
    ).rejects.toThrow(); // round beyond the run
  });
});

describe("CI-2 brand correction binds to the same observation identity", () => {
  beforeEach(async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId); // historical approval; captures below are post-approval
    await insertBrandRun(uuid(50), { observationBudget: 1, rounds: 2 });
  });
  it("allows a same-observation correction at capacity but refuses cross-run, cross-slot, retimed, legacy or branching references", async () => {
    const first = await importManualCapture(scope, brandCapture(), rpc); // round 1, run 50 — budget spent
    // A genuine correction of THAT observation (same panel/run/slot/round/time/surface, changed
    // facts, new hash) is stored even though the run budget is exhausted: a correction is not a new
    // charge. It supersedes the original, which remains as the raw record.
    const corrected = await importManualCapture(
      scope,
      brandCapture({}, { supersedesId: first, rawAnswer: "corrected reading of the same capture" }),
      rpc,
    );
    expect(corrected).toBeTypeOf("string");
    expect(corrected).not.toBe(first);
    const answers = (await readAnswerEvidence(scope, rpc)).answers;
    expect(answers.map((a) => a.input.supersedesId).filter(Boolean)).toContain(first);
    // Branching is refused: a second record cannot also supersede the same original.
    await expect(
      importManualCapture(
        scope,
        brandCapture({}, { supersedesId: first, rawAnswer: "a second branch off the original" }),
        rpc,
      ),
    ).rejects.toThrow();
    // Cross-run: naming the original from a different approved run is a different observation.
    await insertBrandRun(uuid(51), { observationBudget: 1, rounds: 2 });
    await expect(
      importManualCapture(
        scope,
        brandCapture(
          { brandRunId: uuid(51) },
          { supersedesId: first, rawAnswer: "smuggled into another run" },
        ),
        rpc,
      ),
    ).rejects.toThrow();
    // Cross-slot: a different round is a different observation, even within the run's rounds.
    await expect(
      importManualCapture(
        scope,
        brandCapture(
          { slot: { round: 2, questionId: "SY-B01" } },
          { supersedesId: first, rawAnswer: "different round" },
        ),
        rpc,
      ),
    ).rejects.toThrow();
    // Retimed: a different capture instant is a different observation.
    await expect(
      importManualCapture(
        scope,
        brandCapture(
          {
            time: {
              capturedAt: "2026-09-09T10:00:00Z",
              intendedSlotAt: "2026-09-08T09:00:00Z",
              delayMinutes: 60,
            },
          },
          { supersedesId: first, rawAnswer: "different capture time" },
        ),
        rpc,
      ),
    ).rejects.toThrow();
    // A legacy, context-less answer cannot be laundered into the run as a "correction".
    const legacyId = uuid(700);
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document) VALUES($1,'p',$2,$3,1,'legacy-hash',$4)",
      [
        user,
        legacyId,
        brandPromptId,
        { input: { promptId: brandPromptId, promptRevision: 1 }, prompt: {}, analysis: {} },
      ],
    );
    await expect(
      importManualCapture(
        scope,
        brandCapture({}, { supersedesId: legacyId, rawAnswer: "correcting a legacy row" }),
        rpc,
      ),
    ).rejects.toThrow();
  });
});

describe("CI-2 capacity, isolation, deletion and access control", () => {
  it("enforces the panel-version and brand-run capacities", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await db.query(
      "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) SELECT $1,'p',gen_random_uuid(),1,$2 FROM generate_series(1,198) g",
      [user, draftDiscovery({ panelId: uuid(600) })],
    );
    await expect(
      saveCitationPanelDraft(scope, uuid(601), 0, draftDiscovery({ panelId: uuid(601) }), rpc),
    ).rejects.toThrow(); // 200-version ceiling
    await db.query(
      "INSERT INTO citation_brand_runs(user_id,project_id,run_id,panel_id,panel_version,document) SELECT $1,'p',gen_random_uuid(),$2,2,'{}'::jsonb FROM generate_series(1,20) g",
      [user, brandPanelId],
    );
    await expect(
      approveBrandRun(
        scope,
        {
          runId: uuid(90),
          panelId: brandPanelId,
          panelVersion: 2,
          observationBudget: 5,
          rounds: 1,
        },
        rpc,
      ),
    ).rejects.toThrow(); // 20-run ceiling
  });
  it("isolates owners and projects and refuses a missing project", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    for (const foreign of [
      { ownerId: other, projectId: "p" },
      { ownerId: user, projectId: "q" },
    ])
      expect((await readCitationProtocol(foreign, rpc)).panels).toEqual([]);
    await expect(readCitationProtocol({ ...scope, projectId: "missing" }, rpc)).rejects.toThrow();
    await expect(
      saveCitationPanelDraft(
        { ...scope, projectId: "missing" },
        discoveryPanelId,
        0,
        draftDiscovery(),
        rpc,
      ),
    ).rejects.toThrow();
  });
  it("removes panels and runs when the project is deleted", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await insertBrandRun(uuid(50));
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect((await db.query("SELECT count(*) n FROM citation_panels")).rows[0]).toEqual({ n: 0 });
    expect((await db.query("SELECT count(*) n FROM citation_brand_runs")).rows[0]).toEqual({
      n: 0,
    });
  });
  it("has RLS and exposes only service-role RPCs, never direct table access", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of ["citation_panels", "citation_brand_runs"])
        await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      if (role !== "service_role")
        await expect(db.query("SELECT read_citation_protocol($1,$2)", [user, "p"])).rejects.toThrow(
          /permission denied/,
        );
      else
        expect(
          (await db.query("SELECT read_citation_protocol($1,$2) data", [user, "p"])).rows[0],
        ).toEqual({ data: { panels: [], brandRuns: [] } });
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query(
          "SELECT count(*) n FROM pg_class WHERE relname IN ('citation_panels','citation_brand_runs') AND relrowsecurity",
        )
      ).rows[0],
    ).toEqual({ n: 2 });
  });
});
