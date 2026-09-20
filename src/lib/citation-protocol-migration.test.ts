import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  saveEvidencePrompt,
  readAnswerEvidence,
  importAnswerEvidence,
  removeAnswerEvidence,
} from "./answer-evidence.server";
import {
  approveBrandRun,
  importManualCapture,
  lockCitationPanel,
  readCitationProtocol,
  readResolvedCaptures,
  saveCitationPanelDraft,
} from "./citation-protocol.server";
import { resolveStoredCaptures } from "./citation-protocol";
import { panelCounts } from "./citation-panel";
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
// The v1 discovery grid: exactly 10 distinct, prompt-bound questions (SY-D01 keeps discoveryPromptId
// so the capture fixtures still bind to it). Each question binds to its own saved prompt/text.
const discoveryQuestionText = (i: number) =>
  i === 0 ? discoveryText : `${discoveryText} (#${i + 1})`;
const discoveryQuestions = Array.from({ length: 10 }, (_, i) => ({
  id: `SY-D${String(i + 1).padStart(2, "0")}`,
  promptId: uuid(101 + i),
  promptRevision: 1,
  text: discoveryQuestionText(i),
  language: "sv",
}));
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
  questions: discoveryQuestions,
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
/** Fixture: fill a project with `count` distinct single-version panels at the given head status via a
 * direct write, to reach a near-capacity state cheaply. A locked head reserves no lock slot; a draft
 * head reserves one. These rows are never read back through the schema here — only their count and head
 * status feed the capacity reservation. `count` is an in-test literal, never external input. */
async function seedPanelHeads(count: number, status: "locked" | "draft", ownerId = user) {
  await db.query(
    `INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) SELECT $1,'p',gen_random_uuid(),1,$2 FROM generate_series(1,${count}) g`,
    [ownerId, { status }],
  );
}
const panelRowCount = async (ownerId = user) =>
  (
    await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM citation_panels WHERE user_id=$1 AND project_id='p'",
      [ownerId],
    )
  ).rows[0].n;
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
    "20260920190000_citation_protocol.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q'),($2,'projects','p')",
    [user, other],
  );
  // Save the 10 distinct discovery prompts the v1 grid binds to (uuid(101..110)), plus the brand prompt.
  for (let i = 0; i < 10; i++)
    await saveEvidencePrompt(scope, uuid(101 + i), 0, promptData(discoveryQuestionText(i)), rpc);
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
    // The valid v1 grid locked: exactly 10 questions × 4 rounds = 40 planned slots.
    expect(locked.questions).toHaveLength(10);
    expect(locked.rounds).toBe(4);
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
  it("saves incomplete/oversized discovery drafts but never locks off the exact 10×4 grid", async () => {
    // Each incomplete/oversized draft still SAVES (drafts are editable) but can never LOCK.
    const cases = [
      { panelId: uuid(30), over: { questions: discoveryQuestions.slice(0, 9) } }, // 9 questions (under)
      { panelId: uuid(31), over: { rounds: 3 } }, // too few rounds
      { panelId: uuid(32), over: { rounds: 5 } }, // too many rounds
      { panelId: uuid(33), over: { rounds: 0 } }, // unscheduled discovery
    ];
    const versions = async (panelId: string) =>
      (
        await db.query(
          "SELECT count(*)::int n FROM citation_panels WHERE user_id=$1 AND project_id='p' AND panel_id=$2",
          [user, panelId],
        )
      ).rows[0];
    for (const c of cases) {
      await saveCitationPanelDraft(
        scope,
        c.panelId,
        0,
        draftDiscovery({ panelId: c.panelId, ...c.over }),
        rpc,
      );
      // Direct lock RPC surfaces the specific grid guard.
      await expect(
        db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, c.panelId, 1]),
      ).rejects.toThrow(/citation_panel_grid_invalid/);
      // The public wrapper refuses too, but normalizes DB errors to the generic unavailable error.
      await expect(lockCitationPanel(scope, c.panelId, 1, rpc)).rejects.toThrow();
      // No locked version was inserted; only the editable draft (version 1) remains.
      expect(await versions(c.panelId)).toEqual({ n: 1 });
    }
    // Over-sized questions (11) cannot pass the schema-validated save path; assert the SQL grid guard
    // directly by locking a directly-inserted 11-question draft (grid is checked before binding).
    const eleven = draftDiscovery({
      panelId: uuid(34),
      questions: [
        ...discoveryQuestions,
        {
          id: "SY-D11",
          promptId: uuid(111),
          promptRevision: 1,
          text: `${discoveryText} (#11)`,
          language: "sv",
        },
      ],
    });
    await db.query(
      "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,'p',$2,1,$3)",
      [user, uuid(34), eleven],
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(34), 1]),
    ).rejects.toThrow(/citation_panel_grid_invalid/);
    expect(await versions(uuid(34))).toEqual({ n: 1 }); // still only the draft; nothing locked
  });
  it("refuses to lock ten non-distinct discovery questions (reused prompt binding or copied text)", async () => {
    // Ten unique local ids all bound to ONE prompt with identical text is not ten questions. The save
    // path's binding guard would reject it (text must equal the bound prompt), so insert the draft
    // directly and assert the lock RPC's grid guard fires before binding. Both distinct-binding and
    // distinct-text collapse to 1 here.
    const oneBinding = draftDiscovery({
      panelId: uuid(35),
      questions: discoveryQuestions.map((_, i) => ({
        id: `SY-D${String(i + 1).padStart(2, "0")}`,
        promptId: discoveryPromptId,
        promptRevision: 1,
        text: discoveryText,
        language: "sv",
      })),
    });
    // Ten DISTINCT prompt ids but identical COPIED text — distinct-text collapses to 1.
    const copiedText = draftDiscovery({
      panelId: uuid(36),
      questions: discoveryQuestions.map((q) => ({ ...q, text: discoveryText })),
    });
    const count = async (panelId: string) =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM citation_panels WHERE user_id=$1 AND project_id='p' AND panel_id=$2",
          [user, panelId],
        )
      ).rows[0].n;
    for (const [panelId, draft] of [
      [uuid(35), oneBinding],
      [uuid(36), copiedText],
    ] as const) {
      await db.query(
        "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,'p',$2,1,$3)",
        [user, panelId, draft],
      );
      // Direct lock RPC surfaces the specific grid guard; the public wrapper normalizes to generic.
      await expect(
        db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, panelId, 1]),
      ).rejects.toThrow(/citation_panel_grid_invalid/);
      await expect(lockCitationPanel(scope, panelId, 1, rpc)).rejects.toThrow();
      expect(await count(panelId)).toBe(1); // only the editable draft; nothing locked
    }
    // Regression that the guard is not over-broad: the genuine ten-distinct grid still locks.
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    const locked = await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    expect(locked).toMatchObject({ version: 2, status: "locked" });
  });
  it("fails closed on all three write RPCs when the account workspace_meta row is missing, then permits them once restored", async () => {
    // save_citation_panel_draft, lock_citation_panel and approve_citation_brand_run all call
    // assert_knowledge_project(...,true), whose workspace_meta FOR UPDATE is a silent no-op when no row
    // exists — so their capacity guards could run unserialized. Each now re-takes the row lock, matching
    // save_citation_capture. Preconditions are built while meta is present so the ONLY obstacle below is
    // the missing serialization row, not any content/capacity guard.
    await saveCitationPanelDraft(scope, uuid(40), 0, draftBrand({ panelId: uuid(40) }), rpc); // a lockable brand draft
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc); // a locked brand v2 to approve a run against
    const panelCount = async (panelId: string) =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM citation_panels WHERE user_id=$1 AND project_id='p' AND panel_id=$2",
          [user, panelId],
        )
      ).rows[0].n;
    const runCount = async () =>
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM citation_brand_runs WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows[0].n;
    const brandVersions = await panelCount(brandPanelId); // 2 (draft v1 + locked v2)
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    try {
      // Each RPC surfaces the specific serialization guard via direct SQL (it fires before any capacity
      // count/insert), and the public wrapper refuses the same call (mapped to the generic error).
      await expect(
        db.query("SELECT save_citation_panel_draft($1,'p',$2,$3,$4)", [
          user,
          discoveryPanelId,
          0,
          draftDiscovery(),
        ]),
      ).rejects.toThrow(/citation_workspace_unavailable/);
      await expect(
        saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc),
      ).rejects.toThrow();
      await expect(
        db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(40), 1]),
      ).rejects.toThrow(/citation_workspace_unavailable/);
      await expect(lockCitationPanel(scope, uuid(40), 1, rpc)).rejects.toThrow();
      await expect(
        db.query("SELECT approve_citation_brand_run($1,'p',$2,$3,$4,$5,$6)", [
          user,
          uuid(51),
          brandPanelId,
          2,
          5,
          1,
        ]),
      ).rejects.toThrow(/citation_workspace_unavailable/);
      await expect(
        approveBrandRun(
          scope,
          {
            runId: uuid(52),
            panelId: brandPanelId,
            panelVersion: 2,
            observationBudget: 5,
            rounds: 1,
          },
          rpc,
        ),
      ).rejects.toThrow();
      // No mutation on any path: no discovery draft stored, no lock appended to the brand draft, no run.
      expect(await panelCount(discoveryPanelId)).toBe(0);
      expect(await panelCount(uuid(40))).toBe(1); // still only the editable draft, never locked
      expect(await panelCount(brandPanelId)).toBe(brandVersions);
      expect(await runCount()).toBe(0);
    } finally {
      // Restore the fixture (workspace_meta is not truncated between tests) so no later test is affected.
      await db.query("INSERT INTO workspace_meta(user_id) VALUES($1) ON CONFLICT DO NOTHING", [
        user,
      ]);
    }
    // Meta restored: each legitimate path now succeeds — proving the missing row, not a content guard,
    // was what blocked every write.
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    expect(await panelCount(discoveryPanelId)).toBe(1);
    const locked = await lockCitationPanel(scope, uuid(40), 1, rpc);
    expect(locked).toMatchObject({ version: 2, status: "locked" });
    const run = await approveBrandRun(
      scope,
      { runId: uuid(53), panelId: brandPanelId, panelVersion: 2, observationBudget: 5, rounds: 1 },
      rpc,
    );
    expect(run).toMatchObject({ id: uuid(53), approvedBy: user });
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
        supersedesId: a.input.supersedesId,
      })),
      state.panels,
      state.brandRuns,
    );
    expect(resolved[0]).toMatchObject({ outcome: "complete", panelResolved: true, deviations: [] });
  });
  it("resolves only the active correction leaf so a correction never double-counts a slot", async () => {
    const original = await importManualCapture(scope, discoveryCapture(), rpc);
    const correction = await importManualCapture(
      scope,
      discoveryCapture(
        {},
        { supersedesId: original, rawAnswer: "corrected same-observation reading" },
      ),
      rpc,
    );
    // Raw history is preserved: both the original and its correction remain stored.
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(2);
    // But the resolver returns only the active leaf (the correction) for that one slot.
    const { panels, captures } = await readResolvedCaptures(scope, rpc);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ answerId: correction, outcome: "complete" });
    // Roundtrip into panelCounts: the single leaf is one recorded observation, and the duplicate-slot
    // guard is never tripped (pre-fix, both records resolved to round 1 and this would throw).
    const locked = panels.find((p) => p.status === "locked")!;
    const counts = panelCounts(
      locked,
      captures.map((c) => ({
        questionId: c.captureContext.slot.questionId,
        round: c.captureContext.slot.round,
        outcome: c.outcome,
        citationsComplete: true,
        ownCitation: null,
        mention: null,
        recommended: null,
        brandRunId: c.captureContext.brandRunId,
      })),
    );
    expect(counts).toMatchObject({ recorded: 1, outcomes: { complete: 1 } });
  });
  it("enforces one observation per slot at the write boundary: refuses a second independent original, dedupes identical, still allows a correction", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc); // slot SY-D01 round 1
    expect(await importManualCapture(scope, discoveryCapture(), rpc)).toBe(first); // identical dedupes
    const stored = (await readAnswerEvidence(scope, rpc)).answers[0];
    const secondOriginal = {
      input: { ...stored.input, rawAnswer: "an independent second observation for the same slot" },
      prompt: stored.prompt,
      analysis: stored.analysis,
    };
    // Direct SQL: a distinct new original for the occupied slot fails closed with the specific guard.
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", secondOriginal]),
    ).rejects.toThrow(/citation_slot_occupied/);
    // The public wrapper refuses it too (generic mapped error); nothing new is stored.
    await expect(
      importManualCapture(
        scope,
        discoveryCapture({}, { rawAnswer: "another independent second" }),
        rpc,
      ),
    ).rejects.toThrow();
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
    // A same-observation correction (supersedes) is still allowed — it re-describes the one slot.
    const corrected = await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: first, rawAnswer: "corrected same-slot observation" }),
      rpc,
    );
    expect(corrected).not.toBe(first);
    expect((await readResolvedCaptures(scope, rpc)).captures.map((c) => c.answerId)).toEqual([
      corrected,
    ]);
  });
  it("keeps the report reportable when a slot duplicate is already stored: resolver collapses to one invalid slot", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc); // slot SY-D01 round 1
    const stored = (await readAnswerEvidence(scope, rpc)).answers[0];
    // Simulate a pre-guard duplicate: a second independent original for the same slot, inserted
    // directly (bypassing the write guard) with a distinct hash.
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,prompt_id,prompt_revision,document_hash,document) VALUES($1,'p',$2,1,'dupe-hash',$3)",
      [
        user,
        discoveryPromptId,
        {
          input: { ...stored.input, rawAnswer: "duplicate original" },
          prompt: stored.prompt,
          analysis: stored.analysis,
        },
      ],
    );
    const { panels, captures } = await readResolvedCaptures(scope, rpc);
    // The resolver collapses the conflicted slot to ONE explicitly-invalid entry, so the report layer
    // never receives two records for one slot (which would throw) and never a false complete.
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ outcome: "protocol_deviant" });
    expect(captures[0].deviations).toContain("duplicate_slot");
    void first;
    const locked = panels.find((p) => p.status === "locked")!;
    const counts = panelCounts(
      locked,
      captures.map((c) => ({
        questionId: c.captureContext.slot.questionId,
        round: c.captureContext.slot.round,
        outcome: c.outcome,
        citationsComplete: true,
        ownCitation: null,
        mention: null,
        recommended: null,
        brandRunId: c.captureContext.brandRunId,
      })),
    );
    expect(counts).toMatchObject({ recorded: 1, outcomes: { complete: 0, protocol_deviant: 1 } });
  });
  it("enforces the v1 consumer-only boundary at the SQL boundary: refuses an API panel and an API capture", async () => {
    // API panel draft is refused at the DB boundary (the client schema also refuses it before the RPC).
    const apiPanel = draftDiscovery({ panelId: uuid(4), surface: { ...surface, mode: "api" } });
    await expect(
      db.query("SELECT save_citation_panel_draft($1,'p',$2,0,$3)", [user, uuid(4), apiPanel]),
    ).rejects.toThrow(/citation_panel_not_consumer/);
    // An API capture is refused at the DB boundary too. Build a valid consumer capture, then flip both
    // the answer mode and the context surface mode to api (kept consistent, so the mode/model conflict
    // guard is not what fires) — the consumer-only guard is.
    const capId = await importManualCapture(scope, discoveryCapture(), rpc);
    const stored = (await readAnswerEvidence(scope, rpc)).answers[0];
    const apiCapture = {
      input: {
        ...stored.input,
        mode: "api",
        rawAnswer: "api attempt",
        captureContext: { ...stored.input.captureContext, surface: { ...surface, mode: "api" } },
      },
      prompt: stored.prompt,
      analysis: stored.analysis,
    };
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", apiCapture]),
    ).rejects.toThrow(/citation_non_consumer_surface/);
    // The stored consumer capture is the valid consumer path.
    expect((await readResolvedCaptures(scope, rpc)).captures.map((c) => c.answerId)).toEqual([
      capId,
    ]);
  });
  it("refuses a legacy context-less correction of a capture-bound row and keeps the capture resolved, while legacy-of-legacy corrections still work", async () => {
    const capId = await importManualCapture(scope, discoveryCapture(), rpc);
    // The Answer panel's Correct action submits supersedesId with NO captureContext through legacy
    // intake. Against the capture-bound row it must be refused with an actionable error, never stored
    // (which would orphan the capture from resolved counts).
    const legacyCorrection = {
      ...answerBase,
      promptId: discoveryPromptId,
      promptRevision: 1,
      capturedAt: "2026-09-08T10:00:00Z",
      rawAnswer: "legacy correction of a capture-bound row",
      supersedesId: capId,
    };
    await expect(importAnswerEvidence(scope, legacyCorrection, rpc)).rejects.toThrow(
      /evidence_capture_correction_requires_context/,
    );
    // The capture is untouched and still resolves as one active observation (no vanish).
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
    expect((await readResolvedCaptures(scope, rpc)).captures.map((c) => c.answerId)).toEqual([
      capId,
    ]);
    // A legacy correction of a LEGACY (context-less) row still works, unchanged.
    const legacyOriginal = await importAnswerEvidence(
      scope,
      {
        ...answerBase,
        promptId: discoveryPromptId,
        promptRevision: 1,
        capturedAt: "2026-09-08T10:00:00Z",
        rawAnswer: "legacy original",
      },
      rpc,
    );
    const legacyFix = await importAnswerEvidence(
      scope,
      {
        ...answerBase,
        promptId: discoveryPromptId,
        promptRevision: 1,
        capturedAt: "2026-09-08T10:00:00Z",
        rawAnswer: "legacy corrected",
        supersedesId: legacyOriginal,
      },
      rpc,
    );
    expect(legacyFix).toBeTypeOf("string");
    expect(legacyFix).not.toBe(legacyOriginal);
    // The capture-bound observation is still the only resolved capture; legacy rows never resolve.
    expect((await readResolvedCaptures(scope, rpc)).captures.map((c) => c.answerId)).toEqual([
      capId,
    ]);
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
    // Exactly at the approval instant, and after it, are accepted with their correct timestamps. Use
    // a distinct slot (round 2) from validId's round 1 so acceptance is not masked by the one-per-slot
    // guard — this test is about approval time, not slot occupancy.
    const at = "2026-09-01T00:00:00.000Z"; // equals the historical fixture approval
    expect(
      await importManualCapture(
        scope,
        discoveryCapture({
          slot: { round: 2, questionId: "SY-D01" },
          time: { capturedAt: at, intendedSlotAt: at, delayMinutes: 0 },
        }),
        rpc,
      ),
    ).toBeTypeOf("string");
    expect(validId).toBeTypeOf("string");
    // Only the round-1 (2026-09-08) and the at-approval round-2 captures persist; neither pre-approval
    // attempt stored anything.
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
    // A genuinely new capture at an UNOCCUPIED slot (round 2) is blocked by the 100-record capacity,
    // not the one-per-slot guard, so this still exercises the capacity ceiling; never auto-deleted.
    await expect(
      importManualCapture(
        scope,
        discoveryCapture(
          { slot: { round: 2, questionId: "SY-D01" } },
          { rawAnswer: "one over the ceiling" },
        ),
        rpc,
      ),
    ).rejects.toThrow();
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
    await insertBrandRun(uuid(50), { observationBudget: 1, rounds: 2 });
    const first = await importManualCapture(scope, brandCapture(), rpc); // round 1
    // An exact re-import at an exhausted budget dedupes to the persisted id: hash dedup runs before
    // the new-observation budget check, so the identical capture is never re-charged or refused.
    expect(await importManualCapture(scope, brandCapture(), rpc)).toBe(first);
    // A genuinely new observation at a DIFFERENT slot (round 2, within the run's rounds) is over the
    // budget of one — this exercises the budget, not the one-per-slot guard.
    await expect(
      importManualCapture(
        scope,
        brandCapture({ slot: { round: 2, questionId: "SY-B01" } }, { rawAnswer: "second slot" }),
        rpc,
      ),
    ).rejects.toThrow(); // budget of one is spent
    // A round beyond the run's rounds is refused regardless of budget.
    await expect(
      importManualCapture(scope, brandCapture({ slot: { round: 3, questionId: "SY-B01" } }), rpc),
    ).rejects.toThrow();
  });
  it("fails closed when the account workspace_meta row is missing, before any budget insert", async () => {
    await insertBrandRun(uuid(50), { rounds: 2 }); // valid approved run retained (budget 2, rounds 2)
    // Capture one valid observation (round 1) while meta is present, to obtain a real stored document.
    const first = await importManualCapture(scope, brandCapture(), rpc);
    const stored = (await readAnswerEvidence(scope, rpc)).answers[0];
    // The intended second observation is a genuinely DISTINCT, authorized slot (round 2) — a valid new
    // observation whose only obstacle is the missing serialization row, so the guard is what rejects it
    // (not the slot, budget or round guards).
    const another = {
      input: {
        ...stored.input,
        rawAnswer: "a second, distinct observation",
        captureContext: {
          ...stored.input.captureContext,
          slot: { round: 2, questionId: "SY-B01" },
        },
      },
      prompt: stored.prompt,
      analysis: stored.analysis,
    };
    // Remove the per-account serialization row while the project, locked panel and approved run all
    // remain valid. assert_knowledge_project's FOR UPDATE then locks nothing, so a new capture must
    // fail closed before the budget count/insert rather than race it.
    await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [user]);
    try {
      // Direct SQL: the specific fail-closed guard fires before the budget count/insert.
      await expect(
        db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", another]),
      ).rejects.toThrow(/citation_workspace_unavailable/);
      // The public wrapper likewise refuses the same valid distinct-slot observation (mapped to the
      // generic unavailable error).
      await expect(
        importManualCapture(
          scope,
          brandCapture(
            { slot: { round: 2, questionId: "SY-B01" } },
            { rawAnswer: "third distinct" },
          ),
          rpc,
        ),
      ).rejects.toThrow();
      // No data mutation: only the first observation exists.
      expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
    } finally {
      // Restore the fixture so no later test is contaminated.
      await db.query("INSERT INTO workspace_meta(user_id) VALUES($1) ON CONFLICT DO NOTHING", [
        user,
      ]);
    }
    // Meta restored: the same valid distinct-slot observation (round 2, within the run's budget 2 and
    // rounds 2) now succeeds — proving the missing row, not the slot/budget/round guards, was blocking.
    const second = await importManualCapture(
      scope,
      brandCapture(
        { slot: { round: 2, questionId: "SY-B01" } },
        { rawAnswer: "a second, distinct observation" },
      ),
      rpc,
    );
    expect(second).toBeTypeOf("string");
    expect(second).not.toBe(first);
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

describe("CI-2 erasure preserves the slot/budget fact (content-free tombstone)", () => {
  beforeEach(async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId);
  });
  it("denies any replacement at an erased discovery slot and never restores it; tombstone is content-free and tenant-scoped", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0]; // capture the document shape before erasure
    await removeAnswerEvidence(scope, "answer", first, rpc);
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]); // answer content erased
    // A content-free tombstone remains. Inspect the FULL row (row_to_json), not a chosen projection:
    // its columns are exactly the slot/budget identity + housekeeping — no answer text/citations.
    const rows = (
      await db.query<{ r: Record<string, unknown> }>(
        "SELECT row_to_json(t) r FROM citation_capture_tombstones t WHERE user_id=$1",
        [user],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    const tomb = rows[0].r;
    expect(tomb).toMatchObject({ question_id: "SY-D01", round: 1, brand_run_id: null });
    expect(Object.keys(tomb).sort()).toEqual(
      [
        "answer_id",
        "brand_run_id",
        "created_at",
        "panel_id",
        "panel_version",
        "project_collection",
        "project_id",
        "question_id",
        "round",
        "user_id",
      ].sort(),
    );
    expect(JSON.stringify(tomb)).not.toContain("FIXTURE answer"); // the erased rawAnswer is nowhere in the row
    // Tenant-scoped: no tombstone leaks to another owner (the write guards filter by user/project).
    expect(
      (
        await db.query("SELECT count(*)::int n FROM citation_capture_tombstones WHERE user_id=$1", [
          other,
        ])
      ).rows[0],
    ).toEqual({ n: 0 });
    // A distinct replacement at that slot is refused (direct SQL: specific guard; wrapper: generic).
    const replacement = {
      input: { ...doc.input, rawAnswer: "post-erasure replacement" },
      prompt: doc.prompt,
      analysis: doc.analysis,
    };
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", replacement]),
    ).rejects.toThrow(/citation_slot_occupied/);
    await expect(
      importManualCapture(scope, discoveryCapture({}, { rawAnswer: "wrapper replacement" }), rpc),
    ).rejects.toThrow();
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]); // still nothing stored
  });
  it("tombstones one slot when a whole correction chain is erased, and denies re-import", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: first, rawAnswer: "corrected same-slot" }),
      rpc,
    );
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(2); // original + correction
    await removeAnswerEvidence(scope, "answer", first, rpc); // deletes original → cascades correction
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]); // whole chain erased
    expect(
      (await db.query("SELECT count(*)::int n FROM citation_capture_tombstones")).rows[0],
    ).toEqual({
      n: 1,
    }); // one slot tombstone (the original), not one per chain link
    await expect(importManualCapture(scope, discoveryCapture(), rpc)).rejects.toThrow();
  });
  it("tombstones the slot when the bound prompt is erased (cascade bypass closed)", async () => {
    await importManualCapture(scope, discoveryCapture(), rpc);
    await removeAnswerEvidence(scope, "prompt", discoveryPromptId, rpc); // cascades the capture away
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]);
    expect(
      (await db.query("SELECT count(*)::int n FROM citation_capture_tombstones")).rows[0],
    ).toEqual({
      n: 1,
    });
    // Recreating the prompt does not reopen the slot — the tombstone still denies a re-import.
    await saveEvidencePrompt(scope, discoveryPromptId, 0, promptData(discoveryText), rpc);
    await expect(importManualCapture(scope, discoveryCapture(), rpc)).rejects.toThrow();
  });
  it("does not tombstone or impede legacy (context-less) answer erasure", async () => {
    const legacy = await importAnswerEvidence(
      scope,
      {
        ...answerBase,
        promptId: discoveryPromptId,
        promptRevision: 1,
        capturedAt: "2026-09-08T10:00:00Z",
        rawAnswer: "legacy answer",
      },
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", legacy, rpc);
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]);
    expect(
      (await db.query("SELECT count(*)::int n FROM citation_capture_tombstones")).rows[0],
    ).toEqual({
      n: 0,
    }); // legacy answers occupy no slot, so leave no tombstone
    const again = await importAnswerEvidence(
      scope,
      {
        ...answerBase,
        promptId: discoveryPromptId,
        promptRevision: 1,
        capturedAt: "2026-09-08T10:00:00Z",
        rawAnswer: "legacy again",
      },
      rpc,
    );
    expect(again).toBeTypeOf("string"); // legacy erasure/re-import remains fully functional
  });
  it("does not restore brand run budget after an observation is erased", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 1, rounds: 2 });
    const first = await importManualCapture(scope, brandCapture(), rpc); // round 1 — budget of one spent
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    await removeAnswerEvidence(scope, "answer", first, rpc); // erase the sole observation
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM citation_capture_tombstones WHERE brand_run_id=$1",
          [uuid(50)],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    // A new observation at a DIFFERENT slot (round 2) is still over budget — the tombstone counts.
    const round2 = {
      input: {
        ...doc.input,
        rawAnswer: "post-erasure round 2",
        captureContext: { ...doc.input.captureContext, slot: { round: 2, questionId: "SY-B01" } },
      },
      prompt: doc.prompt,
      analysis: doc.analysis,
    };
    await expect(
      db.query("SELECT save_citation_capture($1,$2,$3)", [user, "p", round2]),
    ).rejects.toThrow(/brand_run_budget_exceeded/);
    await expect(
      importManualCapture(
        scope,
        brandCapture(
          { slot: { round: 2, questionId: "SY-B01" } },
          { rawAnswer: "wrapper round 2" },
        ),
        rpc,
      ),
    ).rejects.toThrow();
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]); // nothing re-stored
  });
  it("erases a malformed historical capture without blocking erasure or fabricating a slot tombstone", async () => {
    // The released generic answer path stored arbitrary `input` fields, so a historical row may carry
    // a malformed captureContext. Erasing it must never fail on a cast, and must not fabricate a valid
    // occupied slot. These rows are inserted directly (the generic path's authority boundary — the
    // protocol path save_citation_capture would reject them via captureContextSchema and its guards).
    const malformed = [
      {
        id: uuid(700),
        ctx: {
          panelId: "not-a-uuid",
          panelVersion: 2,
          slot: { round: 1, questionId: "SY-D01" },
          brandRunId: null,
        },
      },
      { id: uuid(701), ctx: {} }, // missing keys entirely
      {
        id: uuid(702),
        ctx: {
          panelId: discoveryPanelId,
          panelVersion: "99999999999",
          slot: { round: 1, questionId: "SY-D01" },
        },
      }, // int overflow
      {
        id: uuid(703),
        ctx: {
          panelId: discoveryPanelId,
          panelVersion: 2,
          slot: { round: "NaN", questionId: "SY-D01" },
          brandRunId: "also-bad",
        },
      },
    ];
    for (const m of malformed) {
      await db.query(
        "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document) VALUES($1,'p',$2,$3,1,$4,$5)",
        [
          user,
          m.id,
          discoveryPromptId,
          `malformed-${m.id}`,
          { input: { captureContext: m.ctx }, prompt: {}, analysis: {} },
        ],
      );
      // Erasure succeeds (the trigger validates shape before casting, so no cast error blocks it).
      await expect(removeAnswerEvidence(scope, "answer", m.id, rpc)).resolves.toBe(true);
    }
    // No tombstone is fabricated for any invalid payload, and every malformed row is fully erased.
    expect(
      (await db.query("SELECT count(*)::int n FROM citation_capture_tombstones")).rows[0],
    ).toEqual({ n: 0 });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    // A well-formed protocol capture, by contrast, IS tombstoned on erasure (valid slot preserved).
    const valid = await importManualCapture(scope, discoveryCapture(), rpc);
    await removeAnswerEvidence(scope, "answer", valid, rpc);
    expect(
      (await db.query("SELECT count(*)::int n FROM citation_capture_tombstones")).rows[0],
    ).toEqual({ n: 1 });
  });
  it("surfaces an erased discovery observation as an erased slot (not absent); read RPC returns content-free tombstones", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    await removeAnswerEvidence(scope, "answer", first, rpc);
    // read_citation_protocol now returns the content-free tombstone (identity only, no answer text).
    const protocol = await readCitationProtocol(scope, rpc);
    expect(protocol.tombstones).toEqual([
      expect.objectContaining({
        answerId: first,
        panelId: discoveryPanelId,
        panelVersion: 2,
        questionId: "SY-D01",
        round: 1,
        brandRunId: null,
      }),
    ]);
    expect(JSON.stringify(protocol.tombstones)).not.toContain("FIXTURE"); // no erased answer content
    // readResolvedCaptures surfaces it as an erased slot; no live capture, and it is NOT absent/missed.
    const { captures, erasedSlots } = await readResolvedCaptures(scope, rpc);
    expect(captures).toEqual([]);
    expect(erasedSlots).toHaveLength(1);
    expect(erasedSlots[0]).toMatchObject({
      questionId: "SY-D01",
      round: 1,
      panelResolved: true,
      brandRunResolved: null,
    });
  });
  it("returns exactly one erased slot for a fully erased correction chain (no double count)", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: first, rawAnswer: "corrected same-slot" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", first, rpc); // cascade deletes the correction too
    const { captures, erasedSlots } = await readResolvedCaptures(scope, rpc);
    expect(captures).toEqual([]);
    expect(erasedSlots).toHaveLength(1); // one slot, not one per chain link
  });
  it("distinguishes an erased slot from a surviving capture at another slot (each counted once)", async () => {
    const r1 = await importManualCapture(scope, discoveryCapture(), rpc); // round 1
    await importManualCapture(
      scope,
      discoveryCapture({ slot: { round: 2, questionId: "SY-D01" } }, { rawAnswer: "round2 live" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", r1, rpc); // erase round 1 only
    const { captures, erasedSlots } = await readResolvedCaptures(scope, rpc);
    expect(captures.map((c) => c.captureContext.slot.round)).toEqual([2]); // live round-2 capture
    expect(erasedSlots).toHaveLength(1);
    expect(erasedSlots[0]).toMatchObject({ round: 1 });
  });
  it("keeps a brand run's erased observations as erased slots after every capture is deleted", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 2, rounds: 2 });
    const o1 = await importManualCapture(scope, brandCapture(), rpc); // round 1
    const o2 = await importManualCapture(
      scope,
      brandCapture({ slot: { round: 2, questionId: "SY-B01" } }, { rawAnswer: "obs2" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", o1, rpc);
    await removeAnswerEvidence(scope, "answer", o2, rpc);
    const { captures, erasedSlots } = await readResolvedCaptures(scope, rpc);
    expect(captures).toEqual([]);
    const brandErased = erasedSlots.filter((s) => s.brandRunId === uuid(50));
    expect(brandErased).toHaveLength(2); // both consumed attempts persist as erased slots
    expect(brandErased.every((s) => s.brandRunResolved === true)).toBe(true);
  });
  it("does not leak an erased slot across owners", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc);
    await removeAnswerEvidence(scope, "answer", first, rpc);
    // Another owner with the same project id sees none of this owner's erased slots.
    const otherResolved = await readResolvedCaptures({ ownerId: other, projectId: "p" }, rpc);
    expect(otherResolved.erasedSlots).toEqual([]);
    expect((await readResolvedCaptures(scope, rpc)).erasedSlots).toHaveLength(1);
  });
  it("reads capture, consumption, a correction leaf and a deletion coherently from one snapshot (real storage)", async () => {
    // Round 16: readResolvedCaptures reads the whole report from a SINGLE read_citation_protocol snapshot.
    // Exercise all four dimensions against real PGlite storage in ONE call: a live discovery capture, a
    // correction leaf superseding an original, a consumed+erased brand observation, and a live brand
    // observation — all mutually consistent because they come from one snapshot.
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 3, rounds: 2 });
    // Discovery: an original capture that is then corrected (only the leaf should resolve).
    const dOriginal = await importManualCapture(scope, discoveryCapture(), rpc); // SY-D01 r1
    const dLeaf = await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: dOriginal, rawAnswer: "corrected discovery reading" }),
      rpc,
    );
    // Brand: one live observation (r1) and one that is erased (r2) — consumption must survive the delete.
    await importManualCapture(scope, brandCapture(), rpc); // SY-B01 r1 (live)
    const bErased = await importManualCapture(
      scope,
      brandCapture({ slot: { round: 2, questionId: "SY-B01" } }, { rawAnswer: "obs2" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", bErased, rpc);
    const { captures, erasedSlots, reports } = await readResolvedCaptures(scope, rpc);
    // Capture + correction: the discovery slot resolves to the active LEAF, never the superseded original.
    const discovery = captures.filter((c) => c.captureContext.slot.questionId === "SY-D01");
    expect(discovery.map((c) => c.answerId)).toEqual([dLeaf]);
    // The live brand observation survives; the erased one is not returned as a live capture.
    expect(captures.some((c) => c.captureContext.slot.questionId === "SY-B01")).toBe(true);
    expect(captures.map((c) => c.answerId)).not.toContain(bErased);
    // Deletion: the erased brand slot is reported as erased, not absent.
    expect(erasedSlots.map((s) => s.questionId)).toEqual(["SY-B01"]);
    // Consumption: the write gate counts both the live original and the erased sibling for the run.
    const brand = reports.find((x) => x.panelId === brandPanelId);
    expect(brand?.brandRuns).toEqual([
      { runId: uuid(50), approvedBudget: 3, consumed: 2, observed: 1, erased: 1 },
    ]);
  });
  it("reports an erased discovery slot as erased and the rest as never-observed (final report counts)", async () => {
    const first = await importManualCapture(scope, discoveryCapture(), rpc); // SY-D01 r1
    await importManualCapture(
      scope,
      discoveryCapture({ slot: { round: 2, questionId: "SY-D01" } }, { rawAnswer: "r2 live" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", first, rpc); // erase round 1 only
    const { reports } = await readResolvedCaptures(scope, rpc);
    const r = reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r).toMatchObject({
      planned: 40,
      observed: 1, // the surviving round-2 capture
      erased: 1, // the erased round-1 slot — counted as erased, not absent
      recorded: 2,
      neverObserved: 38,
      excluded: 0,
    });
    expect(r?.outcomes.complete).toBe(1); // only the live capture; erasure contributes no complete
  });
  it("reports a brand run's budget as consumed after every capture is erased (final report counts)", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 2, rounds: 2 });
    const o1 = await importManualCapture(scope, brandCapture(), rpc);
    const o2 = await importManualCapture(
      scope,
      brandCapture({ slot: { round: 2, questionId: "SY-B01" } }, { rawAnswer: "obs2" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", o1, rpc);
    await removeAnswerEvidence(scope, "answer", o2, rpc);
    const { reports } = await readResolvedCaptures(scope, rpc);
    const brand = reports.find((x) => x.panelId === brandPanelId);
    expect(brand?.brandRuns).toEqual([
      { runId: uuid(50), approvedBudget: 2, consumed: 2, observed: 0, erased: 2 },
    ]);
    expect(brand?.outcomes.complete).toBe(0); // no eligible numerator survives erasure
  });
  it("tolerates malformed historical tombstones on read: never throws, excluded count visible, legit facts still count", async () => {
    // A prior looser trigger stored captureContext.slot.questionId verbatim, so a historical tombstone
    // can carry an ARBITRARY / EMPTY / OVERLENGTH questionId. Erase one legitimate capture, then insert
    // malformed content-free tombstones directly: empty, overlength (2001 chars) and arbitrary text.
    const legit = await importManualCapture(scope, discoveryCapture(), rpc); // SY-D01 r1
    await removeAnswerEvidence(scope, "answer", legit, rpc);
    const malformedIds = [
      { id: uuid(720), q: "" }, // empty
      { id: uuid(721), q: "Z".repeat(2001) }, // overlength (would blow a min1/max2000 schema)
      { id: uuid(722), q: "arbitrary deleted content that must never be transmitted" },
    ];
    for (const m of malformedIds)
      await db.query(
        "INSERT INTO citation_capture_tombstones(user_id,project_id,answer_id,panel_id,panel_version,brand_run_id,question_id,round) VALUES($1,'p',$2,$3,2,NULL,$4,0)",
        [user, m.id, discoveryPanelId, m.q],
      );
    // The read does NOT throw; malformed questionIds are never transmitted (only the grid-shaped legit
    // slot is), and the malformed rows surface as a content-free excluded count while the legitimate
    // erased slot still counts as erased. legitimate panels still read.
    const protocol = await readCitationProtocol(scope, rpc);
    expect(protocol.panels).toHaveLength(2); // the draft + locked discovery panel still read
    expect(protocol.tombstones.map((t) => t.questionId)).toEqual(["SY-D01"]); // only the grid-shaped slot
    expect(JSON.stringify(protocol)).not.toContain("arbitrary deleted content"); // no content leaked
    const { erasedSlots, reports } = await readResolvedCaptures(scope, rpc);
    expect(erasedSlots.map((s) => s.questionId)).toEqual(["SY-D01"]);
    const r = reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r).toMatchObject({ observed: 0, erased: 1, excluded: 3 }); // 3 malformed rows, visible count
  });
  it("counts two erased originals at one brand run/slot as consumed 2 but erased-unique 1 (write-gate faithful)", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 5, rounds: 2 });
    // One real observation via the RPC, then a SECOND distinct original at the SAME run/slot inserted
    // directly (the write gate forbids this now, but historical data predates the one-per-slot guard).
    const o1 = await importManualCapture(scope, brandCapture(), rpc);
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(730),
        brandPromptId,
        "hist-dup-hash",
        { input: doc.input, prompt: doc.prompt, analysis: doc.analysis },
      ],
    );
    // Erase BOTH originals → two tombstone rows at one slot.
    await removeAnswerEvidence(scope, "answer", o1, rpc);
    await removeAnswerEvidence(scope, "answer", uuid(730), rpc);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM citation_capture_tombstones WHERE brand_run_id=$1",
          [uuid(50)],
        )
      ).rows[0],
    ).toEqual({ n: 2 }); // two rows, one slot
    const { reports } = await readResolvedCaptures(scope, rpc);
    const brand = reports.find((x) => x.panelId === brandPanelId);
    // Consumed counts each tombstone row (2 attempts), erased counts distinct slots (1 unique observation).
    expect(brand?.brandRuns).toEqual([
      { runId: uuid(50), approvedBudget: 5, consumed: 2, observed: 0, erased: 1 },
    ]);
  });
  it("consumed counts a SURVIVING live original AND its erased same-slot sibling (write gate = 2)", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 5, rounds: 2 });
    const o1 = await importManualCapture(scope, brandCapture(), rpc); // SY-B01 r1
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    // A second original at the SAME run/slot inserted directly (historical), then erase ONLY it — the
    // first original SURVIVES. The write gate would count budget = 1 live original + 1 tombstone = 2.
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(731),
        brandPromptId,
        "sibling-hash",
        { input: doc.input, prompt: doc.prompt, analysis: doc.analysis },
      ],
    );
    await removeAnswerEvidence(scope, "answer", uuid(731), rpc); // erase the sibling; o1 survives
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    // P1: the SURVIVING original o1 is preserved as inspectable live evidence — NOT hidden just because
    // its slot was tombstoned by the erased sibling. It is flagged as ambiguous duplicate history.
    expect(captures.map((c) => c.answerId)).toEqual([o1]);
    expect(captures[0].deviations).toContain("erased_duplicate_slot");
    const brand = reports.find((x) => x.panelId === brandPanelId);
    // consumed is the write-gate count (live o1 + sibling tombstone = 2); the survivor is observed once;
    // the sibling's slot is held by o1 so it is not a separate erased slot (folded into consumed).
    expect(brand?.brandRuns).toEqual([
      { runId: uuid(50), approvedBudget: 5, consumed: 2, observed: 1, erased: 0 },
    ]);
  });
  it("preserves a surviving independent original at a historically-duplicated slot when its sibling is erased", async () => {
    const a = await importManualCapture(scope, discoveryCapture(), rpc); // original A, SY-D01 r1
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    // A second INDEPENDENT original at the same slot (historical; the write gate forbids it now).
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(740),
        discoveryPromptId,
        "indep-dup-hash",
        { input: doc.input, prompt: doc.prompt, analysis: doc.analysis },
      ],
    );
    // While BOTH are live, the shared slot is explicit duplicate-deviation evidence (collapsed to one).
    const both = await readResolvedCaptures(scope, rpc);
    expect(both.captures).toHaveLength(1);
    expect(both.captures[0].deviations).toContain("duplicate_slot");
    // Erase ONE original; the OTHER is a real surviving live capture and must stay inspectable — never
    // silently turned into an erased-only slot. It is preserved AND flagged as ambiguous duplicate
    // history (a co-located original was erased), never promoted to a clean single success.
    await removeAnswerEvidence(scope, "answer", a, rpc);
    const after = await readResolvedCaptures(scope, rpc);
    expect(after.captures.map((c) => c.answerId)).toEqual([uuid(740)]); // survivor preserved
    expect(after.captures[0].outcome).toBe("protocol_deviant");
    expect(after.captures[0].deviations).toContain("erased_duplicate_slot");
    const r = after.reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r).toMatchObject({ observed: 1 }); // inspectable (observed slot), but a flagged deviation
  });
  it("preserves a surviving sibling's live correction chain when a duplicate sibling is erased", async () => {
    const b = await importManualCapture(scope, discoveryCapture(), rpc); // original B, SY-D01 r1
    const bPrime = await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: b, rawAnswer: "B corrected" }),
      rpc,
    ); // B's correction (active leaf)
    const doc = (await readAnswerEvidence(scope, rpc)).answers.find((x) => x.id === b);
    if (!doc) throw new Error("fixture: original B not found");
    // An independent duplicate original at B's slot (historical), then erase it. B's chain survives.
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(741),
        discoveryPromptId,
        "dup-of-chain-hash",
        { input: doc.input, prompt: doc.prompt, analysis: doc.analysis },
      ],
    );
    await removeAnswerEvidence(scope, "answer", uuid(741), rpc); // erase the duplicate; B chain survives
    const { captures } = await readResolvedCaptures(scope, rpc);
    // The surviving chain's ACTIVE LEAF (bPrime) is preserved — its ROOT (b) is not the erased original,
    // so it is never dropped merely because the erased sibling shared its slot. It is flagged as
    // ambiguous duplicate history (a co-located original was erased), never a silent clean success.
    expect(captures.map((c) => c.answerId)).toEqual([bPrime]);
    expect(captures[0].outcome).toBe("protocol_deviant");
    expect(captures[0].deviations).toContain("erased_duplicate_slot");
  });
  it("consumed counts a malformed-context live original (write-gate parity) and never charges corrections", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    await insertBrandRun(uuid(50), { observationBudget: 5, rounds: 2 });
    const o1 = await importManualCapture(scope, brandCapture(), rpc); // valid original, run uuid(50)
    await importManualCapture(
      scope,
      brandCapture({}, { supersedesId: o1, rawAnswer: "corrected" }),
      rpc,
    ); // a correction of o1 (supersedes set) — must never be charged
    // Corrupt o1's STORED captureContext to a shape captureContextSchema rejects, keeping only its
    // brandRunId — exactly what the write gate keys on. The strict resolver now drops o1 from coverage,
    // but the authoritative SQL consumed must still count it, as the write gate does.
    await db.query(
      "UPDATE ai_answer_evidence SET document=jsonb_set(document,'{input,captureContext}',$3::jsonb) WHERE user_id=$1 AND id=$2",
      [user, o1, JSON.stringify({ brandRunId: uuid(50), junk: true })],
    );
    const { reports } = await readResolvedCaptures(scope, rpc);
    const brand = reports.find((x) => x.panelId === brandPanelId);
    // consumed = 1: the malformed original is counted (else 0), and the correction is not charged (else 2).
    expect(brand?.brandRuns[0].consumed).toBe(1);
    // Owner isolation: another owner's original for the same run id never affects this owner's consumed
    // (the SQL aggregate is owner/project scoped). This row is never read by the user's scoped read.
    await saveEvidencePrompt(
      { ownerId: other, projectId: "p" },
      uuid(940),
      0,
      promptData(brandText),
      rpc,
    );
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        other,
        uuid(941),
        uuid(940),
        "other-run-hash",
        { input: { captureContext: { brandRunId: uuid(50) } }, prompt: {}, analysis: {} },
      ],
    );
    expect(
      (await readResolvedCaptures(scope, rpc)).reports.find((x) => x.panelId === brandPanelId)
        ?.brandRuns[0].consumed,
    ).toBe(1);
  });
  it("survives a canonical-but-non-RFC historical tombstone identity on read (mixed with a valid erased slot)", async () => {
    // A historical capture whose captureContext ids are PostgreSQL-valid uuids WITHOUT RFC version/
    // variant bits (the deletion trigger's hex regex and the uuid column accept them; Zod `.uuid()`
    // would not). Insert it directly (the write RPC's input schema rejects a non-RFC id), then erase it
    // via the released path so the trigger writes a content-free tombstone carrying that identity.
    const nonRfcPanel = "00000000-0000-0000-0000-000000000001"; // valid Postgres uuid, not RFC v4
    const nonRfcAnswer = "00000000-0000-0000-0000-0000000000aa";
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        nonRfcAnswer,
        discoveryPromptId,
        "nonrfc-hash",
        {
          input: {
            captureContext: {
              panelId: nonRfcPanel,
              panelVersion: 2,
              slot: { round: 1, questionId: "SY-D01" },
              brandRunId: null,
            },
          },
          prompt: {},
          analysis: {},
        },
      ],
    );
    await removeAnswerEvidence(scope, "answer", nonRfcAnswer, rpc); // trigger writes the non-RFC tombstone
    // Also a NORMAL, valid, RFC capture erased at a real locked panel/slot (mixed valid row).
    const valid = await importManualCapture(
      scope,
      discoveryCapture({ slot: { round: 2, questionId: "SY-D01" } }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", valid, rpc);
    // The whole protocol read must SURVIVE (the RFC-strict schema previously threw on the non-RFC id).
    const protocol = await readCitationProtocol(scope, rpc);
    expect(protocol.tombstones.map((t) => t.panelId).sort()).toEqual(
      [nonRfcPanel, discoveryPanelId].sort(),
    );
    // readResolvedCaptures also survives: the non-RFC id resolves to no real panel (bounded overflow),
    // the valid one is a real erased slot. Consumed/erased facts are honest, no answer content present.
    const resolved = await readResolvedCaptures(scope, rpc);
    expect(resolved.erasureOverflow).toBe(1); // the non-RFC tombstone is not attributable to a real panel
    const r = resolved.reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r?.erased).toBe(1); // the valid erased slot (SY-D01 r2) still counts
    // No leakage to another owner (the read is owner/project scoped).
    const otherResolved = await readResolvedCaptures({ ownerId: other, projectId: "p" }, rpc);
    expect(otherResolved.erasedSlots).toEqual([]);
    expect(otherResolved.erasureOverflow).toBe(0);
  });
  it("survives a non-RFC brandRunId tombstone bound to a valid panel", async () => {
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    await lockCitationPanel(scope, brandPanelId, 1, rpc);
    await backdatePanelApproval(brandPanelId);
    const nonRfcRun = "00000000-0000-0000-0000-0000000000bb"; // valid Postgres uuid, not RFC v4
    const ans = "00000000-0000-0000-0000-0000000000cc";
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        ans,
        brandPromptId,
        "nonrfc-run-hash",
        {
          input: {
            captureContext: {
              panelId: brandPanelId,
              panelVersion: 2,
              slot: { round: 1, questionId: "SY-B01" },
              brandRunId: nonRfcRun,
            },
          },
          prompt: {},
          analysis: {},
        },
      ],
    );
    await removeAnswerEvidence(scope, "answer", ans, rpc); // trigger: valid panel id, non-RFC run id
    const protocol = await readCitationProtocol(scope, rpc);
    const t = protocol.tombstones.find((x) => x.brandRunId === nonRfcRun);
    expect(t?.panelId).toBe(brandPanelId); // valid panel id AND non-RFC run id both parse
    // The read survives end to end (a non-RFC run resolves to no approved run, so it is content-free
    // history — not promoted to any approved run's consumed budget).
    await expect(readResolvedCaptures(scope, rpc)).resolves.toBeDefined();
  });
  it("does not derive a definitive neverObserved from truncated tombstone coverage, and bounds overflow", async () => {
    // Synthesize > the 10000 read LIMIT of grid tombstones for the locked discovery version (all one
    // slot, distinct answer ids) so the transmitted coverage is truncated for that version.
    await db.query(
      `INSERT INTO citation_capture_tombstones(user_id,project_id,answer_id,panel_id,panel_version,brand_run_id,question_id,round)
       SELECT $1,'p',gen_random_uuid(),$2,2,NULL,'SY-D01',1 FROM generate_series(1,10001) g`,
      [user, discoveryPanelId],
    );
    const protocol = await readCitationProtocol(scope, rpc);
    expect(protocol.tombstones).toHaveLength(10000); // LIMIT-bounded, not unbounded
    const { reports } = await readResolvedCaptures(scope, rpc);
    const r = reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    // Coverage is incomplete (10000 transmitted < 10001 true grid rows) → neverObserved must be unknown.
    expect(r?.coverageComplete).toBe(false);
    expect(r?.neverObserved).toBeNull();
    // An orphaned tombstone (a panel version that no longer exists) is a bounded overflow count, not a
    // random-id group and not silently dropped.
    await db.query(
      "INSERT INTO citation_capture_tombstones(user_id,project_id,answer_id,panel_id,panel_version,brand_run_id,question_id,round) VALUES($1,'p',$2,$3,9,NULL,'SY-D01',1)",
      [user, uuid(750), uuid(999)],
    );
    expect((await readResolvedCaptures(scope, rpc)).erasureOverflow).toBe(1);
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
  it("reserves a lock slot for a pending draft head: admits the final draft, then locks it", async () => {
    // 198 locked panels leave two free slots. A new discovery draft is admitted because it fits its own
    // row PLUS its reserved eventual-lock slot (198 rows + 0 pending + 1 new head = 199 < 200); the head
    // then locks by consuming that reservation. Before the fix the draft filled the project to 200 and
    // the lock — which appends the locked version row — was rejected, stranding the owner.
    await seedPanelHeads(198, "locked");
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc); // rows 199, pending 1
    const locked = await lockCitationPanel(scope, discoveryPanelId, 1, rpc); // consumes the reservation
    expect(locked).toMatchObject({ version: 2, status: "locked" });
    expect(await panelRowCount()).toBe(200); // exactly at the cap, no overflow, nothing deleted
  });
  it("does not let a new panel consume the lock slot reserved for another pending head", async () => {
    // 198 locked + one pending discovery draft = 199 rows fully reserved to 200 (row + eventual lock). A
    // brand-new panel needs two more slots (its draft row + a lock reservation), so it is refused — its
    // admission must not steal the slot reserved for the pending discovery head, which stays lockable.
    await seedPanelHeads(198, "locked");
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc); // rows 199, pending 1
    // Specific DB guard via direct SQL; the public wrapper refuses the same call (generic error).
    await expect(
      db.query("SELECT save_citation_panel_draft($1,'p',$2,$3,$4)", [
        user,
        brandPanelId,
        0,
        draftBrand(),
      ]),
    ).rejects.toThrow(/citation_panel_capacity/);
    await expect(
      saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc),
    ).rejects.toThrow();
    // The protected pending head still locks (its reservation was preserved).
    expect(await lockCitationPanel(scope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await panelRowCount()).toBe(200);
  });
  it("keeps multiple pending draft heads lockable up to the reserved capacity", async () => {
    // 196 locked leave four slots. Two pending draft heads (discovery + brand) reserve two rows plus two
    // eventual locks = exactly four. Both must remain lockable; opening the second head must not have
    // consumed the first head's reserved lock slot.
    await seedPanelHeads(196, "locked");
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc); // rows 197, pending 1
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc); // rows 198, pending 2
    expect(await lockCitationPanel(scope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await lockCitationPanel(scope, brandPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await panelRowCount()).toBe(200); // 196 locked + 2 drafts + 2 locks, exactly at the cap
  });
  it("a draft revision cannot consume another pending head's reserved lock slot; both still lock", async () => {
    // 196 locked + two pending heads (discovery + brand) fully reserve to 200 (198 rows + 2 reserved
    // locks). Revising the discovery draft keeps it a SINGLE head (no new reservation) but needs a free
    // physical row — and every remaining slot is reserved for the two eventual locks, so the revision is
    // refused rather than stealing the brand head's reservation. Both heads then lock intact.
    await seedPanelHeads(196, "locked");
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc); // rows 197, pending 1
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc); // rows 198, pending 2
    // Specific guard via direct SQL; public wrapper refuses generically. Revision = expected version 1.
    await expect(
      db.query("SELECT save_citation_panel_draft($1,'p',$2,$3,$4)", [
        user,
        discoveryPanelId,
        1,
        draftDiscovery({ version: 2 }),
      ]),
    ).rejects.toThrow(/citation_panel_capacity/);
    await expect(
      saveCitationPanelDraft(scope, discoveryPanelId, 1, draftDiscovery({ version: 2 }), rpc),
    ).rejects.toThrow();
    // The brand head's reservation was preserved, and the discovery head still locks too.
    expect(await lockCitationPanel(scope, brandPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await lockCitationPanel(scope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await panelRowCount()).toBe(200);
  });
  it("admits a revision when a free slot remains, without opening a second reservation", async () => {
    // 196 locked + one pending discovery head = 197 rows, one reserved lock (free = 200 - 197 - 1 = 2).
    // A revision spends one physical row but stays a single head (no new reservation), so it is admitted
    // while a free slot exists; the head still locks afterwards.
    await seedPanelHeads(196, "locked");
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc); // rows 197, pending 1
    await saveCitationPanelDraft(scope, discoveryPanelId, 1, draftDiscovery({ version: 2 }), rpc); // rows 198, pending 1
    expect(await panelRowCount()).toBe(198);
    // Locking the revised head (now at version 2) still fits its preserved reservation.
    expect(await lockCitationPanel(scope, discoveryPanelId, 2, rpc)).toMatchObject({
      version: 3,
      status: "locked",
    });
    expect(await panelRowCount()).toBe(199);
  });
  it("scopes the reserved capacity per project: a full project does not block a fresh one", async () => {
    // Fill user's project 'p' to the cap with locked panels; a DIFFERENT project 'q' for the same owner
    // is unaffected — the row count and pending-head reservation are project-scoped, unchanged from
    // before this fix.
    await seedPanelHeads(200, "locked");
    await expect(
      saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc),
    ).rejects.toThrow(); // 'p' is full
    const qScope = { ownerId: user, projectId: "q" };
    for (let i = 0; i < 10; i++)
      await saveEvidencePrompt(qScope, uuid(101 + i), 0, promptData(discoveryQuestionText(i)), rpc);
    await saveCitationPanelDraft(qScope, discoveryPanelId, 0, draftDiscovery(), rpc);
    expect(await lockCitationPanel(qScope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await panelRowCount()).toBe(200); // 'p' unchanged
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
  it("cascades a project deletion with LIVE captures + an existing tombstone, without the trigger blocking or recreating tombstones, and preserves other tenants", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId);
    // A LIVE original + correction chain (slot round 1), still present at delete time.
    const live = await importManualCapture(scope, discoveryCapture(), rpc);
    await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: live, rawAnswer: "corrected" }),
      rpc,
    );
    // A separately erased capture (slot round 2) that already left a tombstone.
    const erased = await importManualCapture(
      scope,
      discoveryCapture({ slot: { round: 2, questionId: "SY-D01" } }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", erased, rpc);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows[0],
    ).toEqual({ n: 2 }); // original + correction live
    expect(
      (
        await db.query("SELECT count(*)::int n FROM citation_capture_tombstones WHERE user_id=$1", [
          user,
        ])
      ).rows[0],
    ).toEqual({ n: 1 });
    // Another tenant with its own evidence, untouched by this project's deletion.
    const otherScope = { ownerId: other, projectId: "p" };
    await saveEvidencePrompt(otherScope, uuid(900), 0, promptData(discoveryText), rpc);
    await importAnswerEvidence(
      otherScope,
      {
        ...answerBase,
        promptId: uuid(900),
        promptRevision: 1,
        capturedAt: "2026-09-08T10:00:00Z",
        rawAnswer: "other tenant answer",
      },
      rpc,
    );
    // Delete the whole project directly while live captures remain. The trigger must neither block the
    // cascade nor recreate a tombstone (the project row is gone, so it skips).
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p'",
          [user],
        )
      ).rows[0],
    ).toEqual({ n: 0 }); // all content erased
    expect(
      (await db.query("SELECT count(*)::int n FROM citation_panels WHERE user_id=$1", [user]))
        .rows[0],
    ).toEqual({ n: 0 });
    expect(
      (
        await db.query("SELECT count(*)::int n FROM citation_capture_tombstones WHERE user_id=$1", [
          user,
        ])
      ).rows[0],
    ).toEqual({ n: 0 }); // tombstones cascade; none recreated by the trigger
    // Other tenant preserved.
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM ai_answer_evidence WHERE user_id=$1 AND project_id='p'",
          [other],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("has RLS and exposes only service-role RPCs, never direct table access", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of ["citation_panels", "citation_brand_runs", "citation_capture_tombstones"])
        await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      if (role !== "service_role")
        await expect(db.query("SELECT read_citation_protocol($1,$2)", [user, "p"])).rejects.toThrow(
          /permission denied/,
        );
      else
        expect(
          (await db.query("SELECT read_citation_protocol($1,$2) data", [user, "p"])).rows[0],
        ).toEqual({
          data: {
            answers: [],
            panels: [],
            brandRuns: [],
            tombstones: [],
            runConsumed: [],
            erasureByVersion: [],
            erasureOverflow: 0,
          },
        });
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query(
          "SELECT count(*) n FROM pg_class WHERE relname IN ('citation_panels','citation_brand_runs','citation_capture_tombstones') AND relrowsecurity",
        )
      ).rows[0],
    ).toEqual({ n: 3 });
  });
});
