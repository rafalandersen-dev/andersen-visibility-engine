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
// A run id containing hex LETTERS, so its canonical (lowercase) spelling and an UPPERCASE spelling differ
// as text but are the SAME uuid value — exactly the case the raw-text brandRunId compare mishandled.
const runLower = "0000abcd-0000-4000-8000-0000000000ab";
const runUpper = "0000ABCD-0000-4000-8000-0000000000AB";
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
// v1 weekly discovery schedule (spec §§5.1 Frequency, 5.2 Time, 5.3): four owner-approved intended
// weekly slots at 09:00 Europe/Stockholm (07:00Z in a CEST month), one Stockholm week apart. The lock
// guard requires PROSPECTIVE slots, but a stored capture's `capturedAt` must be within 2020..now
// (answerEvidenceSchema). A real pilot locks with FUTURE weekly slots; then the weeks arrive and the
// captures land at those (now-past) slots. The fixtures model that coherent timeline with two anchors:
//   • futureSchedule — 2099 September (CEST, DST-free), always after the real lock clock, embedded in
//     the DRAFT so lock_citation_panel's prospective guard passes.
//   • pastSchedule   — July 2026 (CEST, DST-free), safely before the test clock, so captures at these
//     slots pass the 2020..now bound. backdatePanelApproval rewrites a locked discovery panel to this
//     historical state (past approval + past schedule), exactly as a panel whose scheduled weeks have
//     arrived. Weekly cadence within each anchor is DST-simple (one CEST month, no transition).
// Real Date arithmetic (never a "September 35"), so an out-of-panel round still yields a valid instant.
const weeklyInstant = (baseZ: string, round: number) =>
  new Date(Date.parse(baseZ) + (round - 1) * 7 * 86400000).toISOString();
const futureSlotInstant = (round: number) => weeklyInstant("2099-09-07T07:00:00.000Z", round);
const futureSchedule = {
  timezone: "Europe/Stockholm",
  slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: futureSlotInstant(round) })),
};
const slotInstant = (round: number) => weeklyInstant("2026-07-06T07:00:00.000Z", round);
const pastSchedule = {
  timezone: "Europe/Stockholm",
  slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: slotInstant(round) })),
};
const PAST_APPROVAL = "2026-07-01T00:00:00.000Z";
// A capture's truthful time for its round on the PAST (historical) schedule: `delayMinutes` after the slot.
const slotTime = (round: number, delayMinutes = 60) => ({
  capturedAt: new Date(Date.parse(slotInstant(round)) + delayMinutes * 60000).toISOString(),
  intendedSlotAt: slotInstant(round),
  delayMinutes,
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
  questions: discoveryQuestions,
  rounds: 4,
  schedule: futureSchedule, // prospective at lock; backdatePanelApproval rewrites it to pastSchedule
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
  schedule: null, // brand diagnostics are unscheduled (never inherit the discovery weekly schedule)
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
  // Default the capture time to THIS round's owner-approved weekly slot (+ a truthful 60-min delay), so
  // a round-1..4 capture is schedule-consistent (spec §§5.1/5.2/5.3) unless a test overrides `time`.
  const slot = (ctxOver.slot as { round: number; questionId: string } | undefined) ?? {
    round: 1,
    questionId: "SY-D01",
  };
  const time = { ...slotTime(slot.round), ...((ctxOver.time as object) || {}) };
  const ctx = {
    ...ctxBase,
    panelId: discoveryPanelId,
    panelVersion: 2,
    slot,
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
/** Fixture: advance a just-locked panel to its HISTORICAL state — a past owner-approval instant so a
 * capture dated after it is legitimately post-approval (spec Appendix A), and, for a DISCOVERY panel,
 * the past weekly schedule whose scheduled weeks have now arrived (so on-schedule captures at those
 * now-past slots pass the 2020..now capture bound). The lock legitimately required a PROSPECTIVE future
 * schedule; this raw fixture write models the passage of time to the run weeks. It is never a product
 * path and does not touch the lock RPC's immutability (which mints approval and copies the schedule at
 * the live DB clock). A brand panel is unscheduled, so its schedule is left untouched (null). */
async function backdatePanelApproval(panelId: string, version = 2, approvedAt = PAST_APPROVAL) {
  await db.query(
    `UPDATE citation_panels SET document =
       jsonb_set(document,'{approval,approvedAt}',to_jsonb($4::text))
       || (CASE WHEN document->>'kind'='discovery' THEN jsonb_build_object('schedule',$5::jsonb) ELSE '{}'::jsonb END)
     WHERE user_id=$1 AND project_id='p' AND panel_id=$2 AND version=$3`,
    [user, panelId, version, approvedAt, JSON.stringify(pastSchedule)],
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
    // Advance to the historical state (past approval + past weekly schedule) so the fixture captures at
    // their now-past weekly slots are legitimately post-approval and on-schedule.
    await backdatePanelApproval(discoveryPanelId);
  });
  it("legacy intake: an UPPERCASE supersedesId cannot bypass the capture-correction guard; a legacy chain is allowed", async () => {
    // A capture-bound row (carries captureContext), created via the panel-aware path; its DB id is
    // canonical lowercase.
    const captureId = await importManualCapture(scope, discoveryCapture(), rpc);
    const legacyBase = {
      ...answerBase,
      promptId: discoveryPromptId,
      promptRevision: 1,
      capturedAt: "2026-09-08T10:00:00Z",
    };
    // A legacy (context-less) intake that supersedes the capture-bound row by its UPPERCASE spelling must
    // be REFUSED. Pre-fix the raw `a.id === input.supersedesId` missed the lowercase id, so the guard was
    // bypassed and the capture was silently superseded (then dropped by the resolver). Not resolver-only:
    // this is the write-guard on the legacy path.
    await expect(
      importAnswerEvidence(
        scope,
        {
          ...legacyBase,
          rawAnswer: "legacy correction of a capture",
          supersedesId: captureId.toUpperCase(),
        },
        rpc,
      ),
    ).rejects.toThrow(/evidence_capture_correction_requires_context/);
    // A legitimate legacy correction of a legacy (context-less) row remains allowed, even across case.
    const original = await importAnswerEvidence(
      scope,
      { ...legacyBase, capturedAt: "2026-09-08T11:00:00Z", rawAnswer: "legacy original" },
      rpc,
    );
    const corrected = await importAnswerEvidence(
      scope,
      {
        ...legacyBase,
        capturedAt: "2026-09-08T11:00:00Z",
        rawAnswer: "legacy corrected",
        supersedesId: original.toUpperCase(),
      },
      rpc,
    );
    expect(corrected).toBeTypeOf("string");
    expect(corrected).not.toBe(original);
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
    // Before the historical approval (PAST_APPROVAL, 2026-07-01) — so the approval guard, which runs
    // before the schedule binding, is what refuses it (and the instant stays within the 2020..now bound).
    const preApprovalTime = {
      capturedAt: "2026-06-15T10:00:00Z",
      intendedSlotAt: "2026-06-15T09:00:00Z",
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
    const validId = await importManualCapture(scope, discoveryCapture(), rpc); // on-schedule round 1, accepted
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
    // After the approval, a capture at a DISTINCT slot (round 2) on its owner-approved weekly slot is
    // accepted (distinct from validId's round 1 so acceptance is not masked by the one-per-slot guard).
    // A prospective weekly schedule means the earliest run is round 1's slot, well after the approval, so
    // the boundary this test proves is "before approval refused, on/after accepted", not an at-instant tie.
    expect(
      await importManualCapture(
        scope,
        discoveryCapture({ slot: { round: 2, questionId: "SY-D01" } }, { rawAnswer: "round 2" }),
        rpc,
      ),
    ).toBeTypeOf("string");
    expect(validId).toBeTypeOf("string");
    // Only the two accepted round-1 / round-2 captures persist; neither pre-approval attempt stored anything.
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
  // Semantic brandRunId identity (P2 4057410893 / 4057741410): save_citation_capture persists the
  // client's ORIGINAL brandRunId spelling verbatim, so a historical UPPERCASE / mixed-case one differs as
  // text from the canonical lowercase run id yet is the SAME uuid value. Budget, consumed reporting, the
  // same-slot guard and correction identity must all compare by uuid VALUE. The uppercase originals below
  // are inserted directly to reproduce persisted historical spelling, reusing a real
  // captured document's prompt/analysis so each still parses on read. A mixed-case spelling behaves
  // identically (same uuid value), so uppercase is the representative case.
  it("counts an UPPERCASE historical brand original against consumed budget, before and after deletion", async () => {
    await insertBrandRun(runLower, { observationBudget: 5, rounds: 2 });
    const o1 = await importManualCapture(scope, brandCapture({ brandRunId: runLower }), rpc); // lower, r1
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    const upperInput = brandCapture(
      { brandRunId: runUpper, slot: { round: 2, questionId: "SY-B01" } },
      { rawAnswer: "UPPER historical original" },
    );
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(760),
        brandPromptId,
        "hist-upper-760",
        { input: upperInput, prompt: base.prompt, analysis: base.analysis },
      ],
    );
    const consumed = async () =>
      (await readResolvedCaptures(scope, rpc)).reports.find((x) => x.panelId === brandPanelId)
        ?.brandRuns[0];
    expect(await consumed()).toMatchObject({ runId: runLower, consumed: 2 }); // both count (pre-fix: 1)
    await removeAnswerEvidence(scope, "answer", uuid(760), rpc); // erase the uppercase original
    expect(await consumed()).toMatchObject({ consumed: 2 }); // its content-free tombstone still counts
    await removeAnswerEvidence(scope, "answer", o1, rpc);
    expect(await consumed()).toMatchObject({ consumed: 2 }); // two tombstones; budget stays consumed
  });
  it("enforces the observation budget against an UPPERCASE historical original (no evasion)", async () => {
    await insertBrandRun(uuid(50), { observationBudget: 5, rounds: 2 }); // helper run to harvest a doc
    await importManualCapture(scope, brandCapture(), rpc); // run uuid(50), r1
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    await insertBrandRun(runLower, { observationBudget: 1, rounds: 2 }); // constrained run, budget 1
    const upperInput = brandCapture(
      { brandRunId: runUpper, slot: { round: 1, questionId: "SY-B01" } },
      { rawAnswer: "UPPER consumes the single budget" },
    );
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(761),
        brandPromptId,
        "hist-upper-761",
        { input: upperInput, prompt: base.prompt, analysis: base.analysis },
      ],
    );
    // The budget of one is consumed by the uppercase original (matched by uuid value). A NEW lowercase
    // capture at a distinct valid slot (r2) is refused — pre-fix it evaded the budget. Specific guard via
    // direct SQL; the public wrapper refuses generically.
    const next = brandCapture(
      { brandRunId: runLower, slot: { round: 2, questionId: "SY-B01" } },
      { rawAnswer: "over budget" },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [
        user,
        { input: next, prompt: base.prompt, analysis: base.analysis },
      ]),
    ).rejects.toThrow(/brand_run_budget_exceeded/);
    await expect(importManualCapture(scope, next, rpc)).rejects.toThrow();
  });
  it("detects an UPPERCASE historical original when refusing a duplicate at the same brand slot", async () => {
    await insertBrandRun(uuid(50), { observationBudget: 5, rounds: 2 });
    await importManualCapture(scope, brandCapture(), rpc);
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    await insertBrandRun(runLower, { observationBudget: 5, rounds: 2 }); // ample budget: the slot guard fires, not budget
    const upperInput = brandCapture(
      { brandRunId: runUpper, slot: { round: 1, questionId: "SY-B01" } },
      { rawAnswer: "UPPER original at r1" },
    );
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(762),
        brandPromptId,
        "hist-upper-762",
        { input: upperInput, prompt: base.prompt, analysis: base.analysis },
      ],
    );
    // A distinct NEW lowercase original at the SAME run/slot must be refused as occupied — pre-fix the raw
    // text compare treated the uppercase original as a different run and let the duplicate through.
    const dup = brandCapture(
      { brandRunId: runLower, slot: { round: 1, questionId: "SY-B01" } },
      { rawAnswer: "lowercase duplicate at r1" },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [
        user,
        { input: dup, prompt: base.prompt, analysis: base.analysis },
      ]),
    ).rejects.toThrow(/citation_slot_occupied/);
    await expect(importManualCapture(scope, dup, rpc)).rejects.toThrow();
  });
  it("accepts a correction whose UPPERCASE-run predecessor differs only in brandRunId case", async () => {
    await insertBrandRun(uuid(50), { observationBudget: 5, rounds: 2 });
    await importManualCapture(scope, brandCapture(), rpc);
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    await insertBrandRun(runLower, { observationBudget: 5, rounds: 2 });
    const predInput = brandCapture(
      { brandRunId: runUpper, slot: { round: 1, questionId: "SY-B01" } },
      { rawAnswer: "UPPER original to be corrected" },
    );
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(763),
        brandPromptId,
        "hist-upper-763",
        { input: predInput, prompt: base.prompt, analysis: base.analysis },
      ],
    );
    // A same-observation correction (supersedes the predecessor) with a LOWERCASE brandRunId must be
    // accepted — the run identity matches by uuid value. Pre-fix the raw text compare wrongly rejected it
    // as an identity mismatch. Raw history is preserved (predecessor + correction both stored).
    const correction = brandCapture(
      { brandRunId: runLower, slot: { round: 1, questionId: "SY-B01" } },
      { supersedesId: uuid(763), rawAnswer: "lowercase correction, same observation" },
    );
    const id = await importManualCapture(scope, correction, rpc);
    expect(id).toBeTypeOf("string");
    expect(
      (await readAnswerEvidence(scope, rpc)).answers
        .map((a) => a.input.supersedesId)
        .filter(Boolean),
    ).toContain(uuid(763));
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
  // Insert a second historical ORIGINAL (supersedes null) at the SAME discovery slot as `doc` — the write
  // gate now forbids a live duplicate, but historical data predates the one-per-slot guard.
  const insertHistoricalDuplicate = async (
    id: string,
    doc: { input: unknown; prompt: unknown; analysis: unknown },
  ) =>
    db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        id,
        discoveryPromptId,
        `hist-${id}`,
        { input: doc.input, prompt: doc.prompt, analysis: doc.analysis },
      ],
    );
  it("reports two erased originals at one discovery slot as erased 1 PLUS an explicit extra attempt", async () => {
    // The exact bug: two historical originals erased at ONE grid slot must not read as erased 1 / extra 0
    // (hiding the second attempt). The slot counts ONCE for planned coverage (erased 1) and the extra
    // erased attempt is surfaced explicitly (erasedExtra 1) from the exact SQL aggregate — no content
    // restored, planned coverage not double-counted.
    const o1 = await importManualCapture(scope, discoveryCapture(), rpc); // SY-D01 r1
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    await insertHistoricalDuplicate(uuid(740), doc);
    await removeAnswerEvidence(scope, "answer", o1, rpc);
    await removeAnswerEvidence(scope, "answer", uuid(740), rpc);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM citation_capture_tombstones WHERE user_id=$1",
          [user],
        )
      ).rows[0],
    ).toEqual({ n: 2 }); // two tombstone rows, one slot
    const { erasedSlots, reports } = await readResolvedCaptures(scope, rpc);
    expect(erasedSlots.map((s) => s.questionId)).toEqual(["SY-D01"]); // ONE distinct erased slot (coverage)
    const r = reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r).toMatchObject({
      observed: 0,
      erased: 1, // planned coverage counted once
      erasedExtra: 1, // the additional erased attempt, surfaced not hidden
      recorded: 1,
      neverObserved: 39, // 40 − 0 observed − 1 erased; the extra attempt is not a planned slot
      excluded: 0, // reported as erasedExtra, never folded into excluded or silently dropped
    });
  });
  it("computes the extra erased attempt from the exact SQL aggregate, order-independently", async () => {
    // Same two-original slot, but erase in the REVERSE order; the erased/extra counts are identical
    // because they derive from the content-free SQL aggregate over the final tombstone set, not from the
    // transmit order. The aggregate (erasureByVersion.duplicateRows/gridRows) is exact and complete here.
    const o1 = await importManualCapture(scope, discoveryCapture(), rpc);
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    await insertHistoricalDuplicate(uuid(741), doc);
    await removeAnswerEvidence(scope, "answer", uuid(741), rpc); // erase the historical duplicate FIRST
    await removeAnswerEvidence(scope, "answer", o1, rpc); // then the RPC original
    const protocol = await readCitationProtocol(scope, rpc);
    const v = protocol.erasureByVersion.find(
      (x) => x.panelId === discoveryPanelId && x.panelVersion === 2,
    );
    expect(v).toMatchObject({ gridRows: 2, duplicateRows: 1, excludedRows: 0 }); // exact SQL aggregate
    const r = (await readResolvedCaptures(scope, rpc)).reports.find(
      (x) => x.panelId === discoveryPanelId && x.panelVersion === 2,
    );
    expect(r).toMatchObject({
      erased: 1,
      erasedExtra: 1,
      coverageComplete: true,
      neverObserved: 39,
    });
  });
  it("does not inflate the extra count for a fully erased correction chain (root = one attempt)", async () => {
    // An original + its correction at one slot, both erased (deleting the original cascades the chain).
    // The trigger tombstones only the ORIGINAL (supersedes null), so there is ONE attempt at the slot:
    // erased 1 and erasedExtra 0 — corrections never look like duplicate practice.
    const original = await importManualCapture(scope, discoveryCapture(), rpc);
    await importManualCapture(
      scope,
      discoveryCapture({}, { supersedesId: original, rawAnswer: "corrected same-slot" }),
      rpc,
    );
    await removeAnswerEvidence(scope, "answer", original, rpc); // cascades the correction
    const r = (await readResolvedCaptures(scope, rpc)).reports.find(
      (x) => x.panelId === discoveryPanelId && x.panelVersion === 2,
    );
    expect(r).toMatchObject({ observed: 0, erased: 1, erasedExtra: 0, neverObserved: 39 });
  });
  it("surfaces an erased same-slot sibling of a SURVIVING live original via the deviant outcome, extra 0", async () => {
    // Mixed live/erased at one slot: a live original survives while a historical sibling at the same slot
    // is erased. The live capture holds the slot (erased 0), and its ambiguous duplicate history is
    // surfaced as a protocol_deviant OUTCOME (never silently dropped). The tombstone is not a duplicate
    // erased ROW at a distinct slot, so erasedExtra is 0 — the sibling is accounted for by the outcome.
    const live = await importManualCapture(scope, discoveryCapture(), rpc); // SY-D01 r1, survives
    void live;
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    await insertHistoricalDuplicate(uuid(742), doc);
    await removeAnswerEvidence(scope, "answer", uuid(742), rpc); // erase only the sibling
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    expect(captures[0]).toMatchObject({ outcome: "protocol_deviant" });
    expect(captures[0].deviations).toContain("erased_duplicate_slot");
    const r = reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r).toMatchObject({ observed: 1, erased: 0, erasedExtra: 0 });
    expect(r?.outcomes.protocol_deviant).toBe(1); // the erased sibling is surfaced via the deviant outcome
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

describe("CI-2 semantic UUID identity for mixed-case stored identifiers", () => {
  // Letter-containing ids so a canonical (lowercase) spelling and an UPPERCASE one differ as text but are
  // one uuid value. Panel document ids are canonical lowercase (the draft write enforces
  // `panelId = p_panel::text`); the brand-run document id/panelId are lowercase (built from `::text`); but
  // a capture's captureContext and a panel question's promptId keep the client's ORIGINAL spelling.
  const pPrompt = "0000abcd-0000-4000-8000-0000000000c1";
  const pPanel = "0000abcd-0000-4000-8000-0000000000c2";
  const pRun = "0000abcd-0000-4000-8000-0000000000c3";
  const brandCtx = (over: Record<string, unknown> = {}) => ({
    ...ctxBase,
    panelId: pPanel.toUpperCase(), // UPPERCASE captureContext panel id
    panelVersion: 2,
    slot: { round: 1, questionId: "SY-B01" },
    brandRunId: pRun.toUpperCase(), // UPPERCASE captureContext run id
    instructions: { questionText: brandText, extraInstruction: null, priorMessages: 0 },
    time: {
      capturedAt: "2026-09-08T10:00:00Z",
      intendedSlotAt: "2026-09-08T09:00:00Z",
      delayMinutes: 60,
    },
    ...over,
  });
  // The capture's own promptId is CANONICAL lowercase while the panel question stored it UPPERCASE — the
  // exact "uppercase question promptId vs DB-canonical answer promptId" gap: the SQL binds them by uuid
  // value, and the resolver must compare them by value too (not raw) so the capture stays eligible.
  const upperCapture = (
    answerOver: Record<string, unknown> = {},
    ctxOver: Record<string, unknown> = {},
  ) => ({
    ...answerBase,
    promptId: pPrompt, // canonical lowercase input promptId (panel question promptId is UPPERCASE)
    promptRevision: 1,
    capturedAt: "2026-09-08T10:00:00Z",
    captureContext: brandCtx(ctxOver),
    ...answerOver,
  });
  beforeEach(async () => {
    // A brand panel whose question binds to pPrompt but stores the promptId UPPERCASE (the lock validates
    // it by casting to uuid, then persists it verbatim). The panel document id is lowercase pPanel.
    await saveEvidencePrompt(scope, pPrompt, 0, promptData(brandText), rpc);
    const draft = {
      ...draftBrand(),
      panelId: pPanel,
      questions: [
        {
          id: "SY-B01",
          promptId: pPrompt.toUpperCase(),
          promptRevision: 1,
          text: brandText,
          language: "sv",
        },
      ],
    };
    await saveCitationPanelDraft(scope, pPanel, 0, draft, rpc);
    await lockCitationPanel(scope, pPanel, 1, rpc);
    await backdatePanelApproval(pPanel);
    // Approved run: id/panelId are lowercase (a direct insert with a backdated approval, like insertBrandRun).
    await db.query(
      "INSERT INTO citation_brand_runs(user_id,project_id,run_id,panel_id,panel_version,document) VALUES($1,'p',$2,$3,2,$4)",
      [
        user,
        pRun,
        pPanel,
        {
          id: pRun,
          panelId: pPanel,
          panelVersion: 2,
          approvedBy: user,
          approvedAt: "2026-09-01T00:00:00Z",
          observationBudget: 5,
          rounds: 2,
        },
      ],
    );
  });
  it("admits an UPPERCASE-identifier capture (question promptId, panelId, brandRunId) and reports it resolved + eligible", async () => {
    // The whole pipeline must accept the mixed-case capture — the SQL question-binding matches the
    // UPPERCASE panel promptId by uuid value, and panel/run resolve by cast — and the canonical report
    // must show it RESOLVED, eligible (complete) and COUNTED, never excluded or panel_unresolved.
    const id = await importManualCapture(scope, upperCapture(), rpc);
    expect(id).toBeTypeOf("string");
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      panelResolved: true,
      brandRunResolved: true,
      outcome: "complete", // eligible: bound to slot by uuid value despite the case gap
    });
    // The case gap must not surface as an identity deviation (panelId, run, or prompt binding).
    expect(captures[0].deviations).not.toContain("panel_mismatch");
    expect(captures[0].deviations).not.toContain("brand_run_not_approved");
    const report = reports.find((x) => x.panelId === pPanel);
    expect(report?.outcomes.complete).toBe(1); // counted as a complete observation, not excluded
    expect(report?.excluded).toBe(0);
    expect(report?.brandRuns[0]).toMatchObject({ runId: pRun, observed: 1, consumed: 1 });
    // Direct-SQL admission of a second distinct capture (round 2), so a ROOT SQL error (e.g. an
    // unqualified helper under search_path='') surfaces as a raw throw instead of being masked by the
    // wrapper's citation_protocol_unavailable.
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    const r2 = upperCapture(
      { rawAnswer: "r2 direct" },
      { slot: { round: 2, questionId: "SY-B01" } },
    );
    const direct = await db.query<{ id: string }>("SELECT save_citation_capture($1,'p',$2) id", [
      user,
      { input: r2, prompt: base.prompt, analysis: base.analysis },
    ]);
    expect(direct.rows[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
  it("refuses a lowercase duplicate original of the UPPERCASE-stored capture at the same slot", async () => {
    await importManualCapture(scope, upperCapture(), rpc); // UPPERCASE original at SY-B01 r1
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    // A distinct NEW capture at the SAME slot but spelled lowercase must be refused as occupied — the
    // same-slot guard matches panelId/brandRunId by uuid value across case. Specific guard via direct SQL,
    // generic via the wrapper.
    const lower = upperCapture(
      { rawAnswer: "lowercase duplicate", promptId: pPrompt },
      { panelId: pPanel, brandRunId: pRun },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [
        user,
        { input: lower, prompt: base.prompt, analysis: base.analysis },
      ]),
    ).rejects.toThrow(/citation_slot_occupied/);
    await expect(importManualCapture(scope, lower, rpc)).rejects.toThrow();
  });
  it("accepts a lowercase correction of the UPPERCASE-stored original (identity by uuid value)", async () => {
    const original = await importManualCapture(scope, upperCapture(), rpc);
    // Correction spelled lowercase for panelId/brandRunId/promptId; same observation identity by value.
    const correction = upperCapture(
      { supersedesId: original, rawAnswer: "lowercase correction", promptId: pPrompt },
      { panelId: pPanel, brandRunId: pRun },
    );
    const id = await importManualCapture(scope, correction, rpc);
    expect(id).toBeTypeOf("string");
    // Only the active leaf resolves; the run's budget is not double-charged (a correction is exempt).
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    expect(captures.map((c) => c.answerId)).toEqual([id]);
    expect(reports.find((x) => x.panelId === pPanel)?.brandRuns[0]).toMatchObject({
      consumed: 1,
      observed: 1,
    });
  });
  it("reconciles an erased UPPERCASE capture: erased slot + consumed preserved across case", async () => {
    const original = await importManualCapture(scope, upperCapture(), rpc);
    await removeAnswerEvidence(scope, "answer", original, rpc); // tombstone brand_run_id/panel_id lowercase
    const { captures, erasedSlots, reports } = await readResolvedCaptures(scope, rpc);
    expect(captures).toEqual([]);
    // The erased slot resolves (its lowercase tombstone matches the case-normalized coverage) and the
    // run's budget stays consumed.
    expect(erasedSlots).toHaveLength(1);
    expect(erasedSlots[0]).toMatchObject({ questionId: "SY-B01", brandRunResolved: true });
    expect(reports.find((x) => x.panelId === pPanel)?.brandRuns[0]).toMatchObject({
      consumed: 1,
      observed: 0,
      erased: 1,
    });
  });
});

describe("CI-2 single v1 discovery baseline per project (spec §§2/5.2/5.3)", () => {
  const lockedDiscovery = async () =>
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM citation_panels WHERE user_id=$1 AND project_id='p' AND document->>'kind'='discovery' AND document->>'status'='locked'",
        [user],
      )
    ).rows[0].n;
  it("refuses a SECOND discovery baseline at a different panel id (no parallel experiment)", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc); // the single v1 baseline (v2 locked)
    await saveCitationPanelDraft(scope, uuid(700), 0, draftDiscovery({ panelId: uuid(700) }), rpc);
    // Specific guard via direct SQL (surfaces under the account lock); public wrapper refuses generically.
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(700), 1]),
    ).rejects.toThrow(/citation_discovery_baseline_exists/);
    await expect(lockCitationPanel(scope, uuid(700), 1, rpc)).rejects.toThrow();
    expect(await lockedDiscovery()).toBe(1); // still exactly one locked discovery baseline
    // The refused panel stays an editable draft (nothing locked, history not deleted).
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM citation_panels WHERE user_id=$1 AND project_id='p' AND panel_id=$2",
          [user, uuid(700)],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("refuses a second discovery baseline even with a DIFFERENT surface (no surface change mid-pilot)", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    const otherSurface = { ...surface, service: "Gemini" }; // a different manual consumer surface
    await saveCitationPanelDraft(
      scope,
      uuid(701),
      0,
      draftDiscovery({ panelId: uuid(701), surface: otherSurface }),
      rpc,
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(701), 1]),
    ).rejects.toThrow(/citation_discovery_baseline_exists/);
    expect(await lockedDiscovery()).toBe(1);
  });
  it("refuses a change mid-pilot: a NEW locked version of the SAME discovery panel", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc); // v2 locked baseline
    // Editing the baseline is fine as a DRAFT (v3), but locking it would create a second baseline.
    await saveCitationPanelDraft(scope, discoveryPanelId, 2, draftDiscovery({ version: 3 }), rpc);
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, discoveryPanelId, 3]),
    ).rejects.toThrow(/citation_discovery_baseline_exists/);
    await expect(lockCitationPanel(scope, discoveryPanelId, 3, rpc)).rejects.toThrow();
    expect(await lockedDiscovery()).toBe(1); // still only the v2 baseline; v3 stays an editable draft
  });
  it("allows the single discovery baseline plus separate brand panels/runs", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    expect(await lockCitationPanel(scope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    // Brand is a separate opt-in and is exempt: locking a brand panel is allowed alongside the baseline.
    await saveCitationPanelDraft(scope, brandPanelId, 0, draftBrand(), rpc);
    expect(await lockCitationPanel(scope, brandPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    expect(await lockedDiscovery()).toBe(1);
  });
  it("scopes the single-baseline rule per owner and project (isolation)", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc); // baseline in user/p
    // A DIFFERENT project of the same owner can lock its own first discovery baseline.
    const qScope = { ownerId: user, projectId: "q" };
    for (let i = 0; i < 10; i++)
      await saveEvidencePrompt(qScope, uuid(101 + i), 0, promptData(discoveryQuestionText(i)), rpc);
    await saveCitationPanelDraft(qScope, discoveryPanelId, 0, draftDiscovery(), rpc);
    expect(await lockCitationPanel(qScope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
    // A DIFFERENT owner (same project id) can lock its own first baseline too.
    const otherScope = { ownerId: other, projectId: "p" };
    for (let i = 0; i < 10; i++)
      await saveEvidencePrompt(
        otherScope,
        uuid(101 + i),
        0,
        promptData(discoveryQuestionText(i)),
        rpc,
      );
    await saveCitationPanelDraft(otherScope, discoveryPanelId, 0, draftDiscovery(), rpc);
    expect(await lockCitationPanel(otherScope, discoveryPanelId, 1, rpc)).toMatchObject({
      status: "locked",
    });
  });
  it("reads HISTORICAL multiple discovery baselines as ambiguous, never a valid single-v1 experiment", async () => {
    // The lock guard prevents new second baselines, but pre-guard/direct-write projects may already hold
    // two locked discovery baselines. Insert a second locked+approved discovery version DIRECTLY (bypassing
    // the guard), alongside the legitimate one, then capture against the first. The read must keep the raw
    // data inspectable yet flag it ambiguous and never present a clean complete measurement.
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc); // baseline A (v2 locked, approved via lock)
    await backdatePanelApproval(discoveryPanelId);
    const capture = await importManualCapture(scope, discoveryCapture(), rpc); // valid against baseline A
    void capture;
    // A SECOND locked+approved discovery baseline (different panel id), inserted directly.
    const baselineB = {
      ...draftDiscovery({ panelId: uuid(702), version: 2, status: "locked" }),
      approval: { approvedBy: user, approvedAt: "2026-09-01T00:00:00.000Z" },
    };
    await db.query(
      "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,'p',$2,2,$3)",
      [user, uuid(702), baselineB],
    );
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    // The capture is still inspectable (resolved against its panel) but is NOT a clean measurement.
    expect(captures[0]).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(captures[0].deviations).toContain("discovery_baseline_ambiguous");
    // No discovery report presents a complete observation while the project is ambiguous.
    for (const r of reports.filter((x) => x.kind === "discovery"))
      expect(r.outcomes.complete).toBe(0);
  });
});

describe("CI-2 admission UUID identity boundaries (mixed-case panel / owner / run)", () => {
  // Letter-containing ids so an UPPERCASE spelling differs from canonical lowercase as text but is one
  // uuid value. Panel-document panelId and run-document panelId are stored VERBATIM (immutable); the
  // uuid COLUMNS are canonical. The admission comparisons must be by uuid VALUE, not raw text.
  it("accepts an UPPERCASE panelId in BOTH the document and the argument, then locks, reads and resolves", async () => {
    const pl = "0000abcd-0000-4000-8000-0000000000d1";
    // Pre-fix: the server wrapper passed (both uppercase) but the SQL raw-text check
    // (`p_document->>'panelId' <> p_panel::text`) failed with invalid_citation_panel.
    await saveCitationPanelDraft(
      scope,
      pl.toUpperCase(),
      0,
      draftDiscovery({ panelId: pl.toUpperCase() }),
      rpc,
    );
    const locked = await lockCitationPanel(scope, pl.toUpperCase(), 1, rpc);
    expect(locked).toMatchObject({ version: 2, status: "locked" });
    // The document keeps the uppercase spelling verbatim; the row's panel_id column is canonical.
    expect(
      (
        await db.query<{ p: string }>(
          "SELECT document->>'panelId' p FROM citation_panels WHERE user_id=$1 AND project_id='p' AND panel_id=$2 AND version=2",
          [user, pl],
        )
      ).rows[0].p,
    ).toBe(pl.toUpperCase());
    // Read + resolve: the panel resolves and a capture against it (uppercase panelId) is eligible.
    await backdatePanelApproval(pl);
    const capture = await importManualCapture(
      scope,
      discoveryCapture({ panelId: pl.toUpperCase() }),
      rpc,
    );
    const { captures } = await readResolvedCaptures(scope, rpc);
    expect(captures.map((c) => c.answerId)).toEqual([capture]);
    expect(captures[0]).toMatchObject({ panelResolved: true, outcome: "complete" });
  });
  it("attributes erased/erasedExtra/excluded/coverage to an UPPERCASE panel document via the canonical version key", async () => {
    // Round 23: read_citation_protocol produces the per-version erasure metadata keyed by the CANONICAL
    // (lowercase) panel_id COLUMN (the delete trigger casts captureContext.panelId into a uuid column),
    // while citationReport reads the immutable panel DOCUMENT whose panelId keeps the UPPERCASE client
    // spelling. Both must derive the version key identically (panelVersionKey/canonicalUuid) or the
    // uppercase panel drops its excluded/extra counts and defaults coverage true — a false definitive
    // neverObserved. Exercise the real producer→consumer (readResolvedCaptures → citationReport) with a
    // stored-uppercase panel and real deletions, not only isolated keys.
    const pl = "0000abcd-0000-4000-8000-0000000000d7";
    await saveCitationPanelDraft(
      scope,
      pl.toUpperCase(),
      0,
      draftDiscovery({ panelId: pl.toUpperCase() }),
      rpc,
    );
    await lockCitationPanel(scope, pl.toUpperCase(), 1, rpc); // the single discovery baseline
    await backdatePanelApproval(pl); // the panel_id COLUMN is canonical lowercase
    // A legitimate capture at SY-D01 r1 against the UPPERCASE panel.
    const o1 = await importManualCapture(
      scope,
      discoveryCapture({ panelId: pl.toUpperCase() }),
      rpc,
    );
    // A second historical ORIGINAL at the SAME slot (predates the one-per-slot guard), carrying the same
    // UPPERCASE-panel captureContext, inserted directly. Both erased → 2 grid tombstones at SY-D01
    // (gridRows 2, duplicateRows 1); each tombstone's panel_id column is canonical lowercase via ::uuid.
    const doc = (await readAnswerEvidence(scope, rpc)).answers[0];
    await db.query(
      "INSERT INTO ai_answer_evidence(user_id,project_id,id,prompt_id,prompt_revision,document_hash,document,supersedes_id) VALUES($1,'p',$2,$3,1,$4,$5,NULL)",
      [
        user,
        uuid(726),
        discoveryPromptId,
        "hist-726",
        { input: doc.input, prompt: doc.prompt, analysis: doc.analysis },
      ],
    );
    await removeAnswerEvidence(scope, "answer", o1, rpc);
    await removeAnswerEvidence(scope, "answer", uuid(726), rpc);
    // Two malformed content-free tombstones for the SAME version, keyed by the canonical lowercase column.
    for (const m of [
      { id: uuid(727), q: "" },
      { id: uuid(728), q: "arbitrary erased content" },
    ])
      await db.query(
        "INSERT INTO citation_capture_tombstones(user_id,project_id,answer_id,panel_id,panel_version,brand_run_id,question_id,round) VALUES($1,'p',$2,$3,2,NULL,$4,0)",
        [user, m.id, pl, m.q],
      );
    // The exact SQL aggregate over the canonical column (confirms the producer keys lowercase).
    const v = (await readCitationProtocol(scope, rpc)).erasureByVersion.find(
      (x) => x.panelId === pl && x.panelVersion === 2,
    );
    expect(v).toMatchObject({ gridRows: 2, duplicateRows: 1, excludedRows: 2 });
    const { erasedSlots, reports } = await readResolvedCaptures(scope, rpc);
    expect(erasedSlots.map((s) => s.questionId)).toEqual(["SY-D01"]); // ONE distinct erased grid slot
    const r = reports.find((x) => x.panelId === pl.toUpperCase() && x.panelVersion === 2);
    expect(r).toBeDefined();
    // Pre-fix the uppercase document key missed the lowercase-keyed maps → excluded 0, erasedExtra 0 and
    // coverage defaulting true. The canonical version key attributes all of them to the uppercase panel.
    expect(r).toMatchObject({
      observed: 0,
      erased: 1, // one distinct erased slot, counted once for planned coverage
      erasedExtra: 1, // the additional erased attempt at that slot, surfaced not hidden
      excluded: 2, // the malformed rows, visible not dropped
      coverageComplete: true, // 2 grid rows transmitted == 2 true grid rows
      neverObserved: 39, // definitive ONLY because coverage is complete: 40 − 0 observed − 1 erased
    });
  });
  it("accepts the same panel uuid spelled differently in the document vs the argument (both directions)", async () => {
    const a = "0000abcd-0000-4000-8000-0000000000d3";
    const b = "0000abcd-0000-4000-8000-0000000000d4";
    // doc UPPERCASE, arg lowercase — pre-fix the wrapper rejected (draft.panelId !== id).
    await saveCitationPanelDraft(scope, a, 0, draftDiscovery({ panelId: a.toUpperCase() }), rpc);
    // doc lowercase, arg UPPERCASE — the other direction.
    await saveCitationPanelDraft(scope, b.toUpperCase(), 0, draftDiscovery({ panelId: b }), rpc);
    // Both drafts stored; locking one establishes the single discovery baseline.
    expect(await lockCitationPanel(scope, a, 1, rpc)).toMatchObject({ status: "locked" });
  });
  it("refuses a draft whose document panelId is a DIFFERENT uuid than the argument (wrapper and SQL)", async () => {
    const a = "0000abcd-0000-4000-8000-0000000000d5";
    const bDoc = "0000abcd-0000-4000-8000-0000000000d6"; // a genuinely different uuid
    await expect(
      saveCitationPanelDraft(scope, a, 0, draftDiscovery({ panelId: bDoc }), rpc),
    ).rejects.toThrow(/citation_panel_draft_mismatch/);
    // Direct SQL (bypassing the wrapper): the SQL guard also refuses with the specific error, visibly.
    await expect(
      db.query("SELECT save_citation_panel_draft($1,'p',$2,$3,$4)", [
        user,
        a,
        0,
        draftDiscovery({ panelId: bDoc }),
      ]),
    ).rejects.toThrow(/invalid_citation_panel/);
  });
  it("brand-run approve is idempotent across a historical UPPERCASE stored panelId (retry)", async () => {
    const bl = "0000abcd-0000-4000-8000-0000000000e3"; // brand panel id with hex letters
    await saveCitationPanelDraft(scope, bl, 0, draftBrand({ panelId: bl }), rpc);
    await lockCitationPanel(scope, bl, 1, rpc); // brand v2 locked (exempt from the discovery baseline rule)
    const rid = "0000abcd-0000-4000-8000-0000000000e4";
    // A historical run doc whose STORED panelId is UPPERCASE, inserted directly (FK: bl v2 exists).
    await db.query(
      "INSERT INTO citation_brand_runs(user_id,project_id,run_id,panel_id,panel_version,document) VALUES($1,'p',$2,$3,2,$4)",
      [
        user,
        rid,
        bl,
        {
          id: rid,
          panelId: bl.toUpperCase(),
          panelVersion: 2,
          approvedBy: user,
          approvedAt: "2026-09-01T00:00:00Z",
          observationBudget: 5,
          rounds: 1,
        },
      ],
    );
    // A retry with canonical params returns the existing run idempotently — pre-fix the raw
    // `existing->>'panelId'=p_panel::text` mismatched the uppercase stored spelling and raised a conflict.
    const again = await approveBrandRun(
      scope,
      { runId: rid, panelId: bl, panelVersion: 2, observationBudget: 5, rounds: 1 },
      rpc,
    );
    expect(again).toMatchObject({ id: rid, panelId: bl.toUpperCase() }); // stored doc returned verbatim
    // A retry of the SAME run id with a DIFFERENT budget still conflicts (identity matched by value, but
    // the params differ) — the semantic panelId match does not weaken the conflict guard. Direct SQL so
    // the specific error is visible.
    await expect(
      db.query("SELECT approve_citation_brand_run($1,'p',$2,$3,$4,$5,$6)", [
        user,
        rid,
        bl,
        2,
        3,
        1,
      ]),
    ).rejects.toThrow(/citation_brand_run_conflict/);
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

describe("CI-2 weekly discovery schedule at lock and capture admission (spec §§5.1/5.2/5.3)", () => {
  it("locks a discovery panel only with a valid PROSPECTIVE weekly Stockholm schedule", async () => {
    // A draft with NO schedule saves (drafts may be incomplete) but never locks (grid passes, schedule
    // fails): the DB guard raises the specific error, the wrapper a generic one.
    const noSchedule = ((): Record<string, unknown> => {
      const d = draftDiscovery() as Record<string, unknown>;
      delete d.schedule;
      return d;
    })();
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, noSchedule, rpc);
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, discoveryPanelId, 1]),
    ).rejects.toThrow(/citation_panel_schedule_invalid/);
    await expect(lockCitationPanel(scope, discoveryPanelId, 1, rpc)).rejects.toThrow();
    // Same-day slots (all round 1's FUTURE instant, so prospective passes and the cadence guard is what
    // rejects) are never four weekly rounds → refused at the DB boundary.
    const sameDay = {
      timezone: "Europe/Stockholm",
      slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: futureSlotInstant(1) })),
    };
    await saveCitationPanelDraft(
      scope,
      uuid(710),
      0,
      draftDiscovery({ panelId: uuid(710), schedule: sameDay }),
      rpc,
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(710), 1]),
    ).rejects.toThrow(/citation_panel_schedule_invalid/);
    // A past (non-prospective) schedule is refused — the owner cannot approve a schedule already elapsed.
    const past = {
      timezone: "Europe/Stockholm",
      slots: [1, 2, 3, 4].map((round) => ({
        round,
        intendedAt: `2020-09-${String(7 * round).padStart(2, "0")}T07:00:00.000Z`,
      })),
    };
    await saveCitationPanelDraft(
      scope,
      uuid(711),
      0,
      draftDiscovery({ panelId: uuid(711), schedule: past }),
      rpc,
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(711), 1]),
    ).rejects.toThrow(/citation_panel_schedule_invalid/);
    // A brand panel carrying a schedule is contradictory (brand is unscheduled) and refused.
    await saveCitationPanelDraft(
      scope,
      brandPanelId,
      0,
      draftBrand({ schedule: futureSchedule }),
      rpc,
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, brandPanelId, 1]),
    ).rejects.toThrow(/citation_panel_schedule_invalid/);
    // The valid prospective fixture schedule locks; none of the above drafts locked, so this is the first
    // discovery baseline. The approved (future) schedule is copied verbatim (immutable).
    await saveCitationPanelDraft(scope, uuid(712), 0, draftDiscovery({ panelId: uuid(712) }), rpc);
    const locked = await lockCitationPanel(scope, uuid(712), 1, rpc);
    expect(locked.schedule?.slots.map((s) => s.intendedAt)).toEqual(
      [1, 2, 3, 4].map(futureSlotInstant),
    );
  });
  it("binds a discovery capture to its round's owner-approved weekly slot and a truthful delay", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId);
    // On-schedule round 1 is admitted.
    expect(await importManualCapture(scope, discoveryCapture(), rpc)).toBeTypeOf("string");
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    // An off-schedule intended slot (round 2 claiming round 1's slot — a same-day "round") is refused as
    // fabricated provenance: specific SQL error via the direct path, generic via the wrapper.
    const off = discoveryCapture(
      { slot: { round: 2, questionId: "SY-D01" }, time: slotTime(1) },
      { rawAnswer: "off-schedule round 2" },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [
        user,
        { input: off, prompt: base.prompt, analysis: base.analysis },
      ]),
    ).rejects.toThrow(/citation_intended_slot_mismatch/);
    await expect(importManualCapture(scope, off, rpc)).rejects.toThrow();
    // An untruthful delay (claims 0 minutes but ran 60 late) is refused.
    const badDelay = discoveryCapture(
      {
        slot: { round: 2, questionId: "SY-D01" },
        time: {
          capturedAt: new Date(Date.parse(slotInstant(2)) + 3600000).toISOString(),
          intendedSlotAt: slotInstant(2),
          delayMinutes: 0,
        },
      },
      { rawAnswer: "lying delay" },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [
        user,
        { input: badDelay, prompt: base.prompt, analysis: base.analysis },
      ]),
    ).rejects.toThrow(/citation_delay_untruthful/);
    // Only the one on-schedule round-1 capture persisted; no forged/off-schedule row was stored.
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
  });
  it("admits four DISTINCT weekly rounds and reads them all complete (a genuine four-week schedule)", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId);
    for (const round of [1, 2, 3, 4])
      await importManualCapture(
        scope,
        discoveryCapture(
          { slot: { round, questionId: "SY-D01" } },
          { rawAnswer: `round ${round}` },
        ),
        rpc,
      );
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    expect(captures.filter((c) => c.outcome === "complete")).toHaveLength(4);
    const r = reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2);
    expect(r?.outcomes.complete).toBe(4);
  });
  it("accepts a capture whose intended slot is spelled with an equivalent offset (same instant)", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId);
    // 2026-07-06T09:00+02:00 is the SAME instant as the round-1 slot 2026-07-06T07:00Z (CEST). It binds.
    const offsetSpelled = discoveryCapture({
      time: {
        capturedAt: "2026-07-06T09:00:00.000+02:00",
        intendedSlotAt: "2026-07-06T09:00:00.000+02:00",
        delayMinutes: 0,
      },
    });
    expect(await importManualCapture(scope, offsetSpelled, rpc)).toBeTypeOf("string");
    const r = (await readResolvedCaptures(scope, rpc)).reports.find(
      (x) => x.panelId === discoveryPanelId && x.panelVersion === 2,
    );
    expect(r?.outcomes.complete).toBe(1);
  });
  it("reads a capture against a schedule-stripped (historical) locked panel as never a clean baseline", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId);
    await importManualCapture(scope, discoveryCapture(), rpc); // on-schedule; would be complete
    // Simulate a pre-schedule historical panel: strip the schedule from the stored locked document. No
    // approval/date is ever backfilled; the capture stays inspectable but is never a clean measurement.
    await db.query(
      "UPDATE citation_panels SET document = document - 'schedule' WHERE user_id=$1 AND project_id='p' AND panel_id=$2 AND version=2",
      [user, discoveryPanelId],
    );
    const { captures, reports } = await readResolvedCaptures(scope, rpc);
    expect(captures[0]).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(captures[0].deviations).toContain("discovery_schedule_missing");
    expect(
      reports.find((x) => x.panelId === discoveryPanelId && x.panelVersion === 2)?.outcomes
        .complete,
    ).toBe(0);
  });
  it("freezes the approved schedule immutably: a stale draft over the locked version or a re-lock is refused", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    const locked = await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    expect(locked.schedule?.slots).toHaveLength(4);
    // The locked version is immutable: a draft at the locked version, or a re-lock, is refused.
    await expect(
      saveCitationPanelDraft(scope, discoveryPanelId, 1, draftDiscovery({ version: 2 }), rpc),
    ).rejects.toThrow();
    await expect(lockCitationPanel(scope, discoveryPanelId, 1, rpc)).rejects.toThrow();
    const stored = (await readCitationProtocol(scope, rpc)).panels.find((p) => p.version === 2);
    expect(stored?.schedule?.slots.map((s) => s.intendedAt)).toEqual(
      [1, 2, 3, 4].map(futureSlotInstant),
    );
  });
  it("refuses a malformed schedule at lock via direct SQL (no NULL/bool_and bypass)", async () => {
    // Direct-SQL forgeries that a JSON null / missing field might slip past a naive check: a missing
    // timezone, a slot missing its round, and a slot missing its intendedAt must each fail closed. None
    // of these can lock, and none read as a clean baseline (they never reach a capture).
    const malformed = [
      { timezone: "Europe/Stockholm", slots: [1, 2, 3, 4].map((round) => ({ round })) }, // no intendedAt
      {
        slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: futureSlotInstant(round) })),
      }, // no timezone
      {
        timezone: "Europe/Stockholm",
        slots: [
          { intendedAt: futureSlotInstant(1) }, // a slot missing its round
          { round: 2, intendedAt: futureSlotInstant(2) },
          { round: 3, intendedAt: futureSlotInstant(3) },
          { round: 4, intendedAt: futureSlotInstant(4) },
        ],
      },
      {
        timezone: "UTC",
        slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: futureSlotInstant(round) })),
      }, // wrong tz
    ];
    let n = 800;
    for (const schedule of malformed) {
      const pid = uuid((n += 1));
      // Save the draft directly (the client schema would reject these; the DB save does not validate the
      // schedule, so a direct write can carry a malformed one — exactly the forgery the lock must catch).
      await db.query(
        "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,'p',$2,1,$3)",
        [user, pid, draftDiscovery({ panelId: pid, schedule })],
      );
      await expect(
        db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, pid, 1]),
      ).rejects.toThrow(/citation_panel_schedule_invalid/);
    }
  });
  it("agrees with the TS validator on fractional-second precision (differing/sub-ms rejected, same-fraction locks)", async () => {
    // The reported bug: a schedule whose rounds differ in fractional seconds passed lockedPanelSchema
    // (whole-second TS wall clock) but the SQL lock rejected it (full-precision loc::time). Both now
    // reject differing fractions and sub-millisecond precision, and both accept a consistent fraction.
    // Rejected shapes are direct-SQL locked BEFORE any baseline exists, so the schedule guard is reached.
    const differing = {
      timezone: "Europe/Stockholm",
      slots: [
        { round: 1, intendedAt: "2099-09-07T07:00:00.000Z" },
        { round: 2, intendedAt: "2099-09-14T07:00:00.500Z" }, // half-second off → different local time
        { round: 3, intendedAt: "2099-09-21T07:00:00.000Z" },
        { round: 4, intendedAt: "2099-09-28T07:00:00.000Z" },
      ],
    };
    await db.query(
      "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,'p',$2,1,$3)",
      [user, uuid(741), draftDiscovery({ panelId: uuid(741), schedule: differing })],
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(741), 1]),
    ).rejects.toThrow(/citation_panel_schedule_invalid/);
    // Sub-millisecond (microsecond) slots — the ".000001" variants — are refused at the DB boundary.
    const subMs = {
      timezone: "Europe/Stockholm",
      slots: [1, 2, 3, 4].map((round) => ({
        round,
        intendedAt: `2099-09-${String(7 * round).padStart(2, "0")}T07:00:00.000001Z`,
      })),
    };
    await db.query(
      "INSERT INTO citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,'p',$2,1,$3)",
      [user, uuid(742), draftDiscovery({ panelId: uuid(742), schedule: subMs })],
    );
    await expect(
      db.query("SELECT lock_citation_panel($1,'p',$2,$3)", [user, uuid(742), 1]),
    ).rejects.toThrow(/citation_panel_schedule_invalid/);
    // A consistent fractional second (all .500) is a valid weekly cadence → locks, and the fraction is
    // preserved verbatim on read (weeklyInstant carries the base fraction across the 7-day steps).
    const sameFrac = {
      timezone: "Europe/Stockholm",
      slots: [1, 2, 3, 4].map((round) => ({
        round,
        intendedAt: weeklyInstant("2099-09-07T07:00:00.500Z", round),
      })),
    };
    await saveCitationPanelDraft(
      scope,
      uuid(743),
      0,
      draftDiscovery({ panelId: uuid(743), schedule: sameFrac }),
      rpc,
    );
    const locked = await lockCitationPanel(scope, uuid(743), 1, rpc);
    expect(locked.schedule?.slots.map((s) => s.intendedAt)).toEqual(
      [1, 2, 3, 4].map((round) => weeklyInstant("2099-09-07T07:00:00.500Z", round)),
    );
  });
  it("refuses a discovery capture whose intended slot or capture instant is sub-millisecond (SQL matches TS)", async () => {
    await saveCitationPanelDraft(scope, discoveryPanelId, 0, draftDiscovery(), rpc);
    await lockCitationPanel(scope, discoveryPanelId, 1, rpc);
    await backdatePanelApproval(discoveryPanelId); // past ms-precise schedule + approval
    await importManualCapture(scope, discoveryCapture(), rpc); // round 1, on-schedule (supplies prompt/analysis)
    const base = (await readAnswerEvidence(scope, rpc)).answers[0];
    const doc = (input: unknown) => ({ input, prompt: base.prompt, analysis: base.analysis });
    // A sub-millisecond intended slot (round 2) is refused — it cannot equal the millisecond-precise slot.
    const subMsIntended = discoveryCapture(
      {
        slot: { round: 2, questionId: "SY-D01" },
        time: {
          capturedAt: new Date(Date.parse(slotInstant(2)) + 60000).toISOString(),
          intendedSlotAt: `${slotInstant(2).slice(0, 19)}.000001Z`,
          delayMinutes: 1,
        },
      },
      { rawAnswer: "sub-ms intended slot" },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [user, doc(subMsIntended)]),
    ).rejects.toThrow(/citation_intended_slot_mismatch/);
    await expect(importManualCapture(scope, subMsIntended, rpc)).rejects.toThrow();
    // A sub-millisecond capture instant is refused — the recorded delay cannot be a truthful whole minute
    // at a precision the millisecond floor does not support.
    const subMsCaptured = discoveryCapture(
      {
        slot: { round: 2, questionId: "SY-D01" },
        time: {
          capturedAt: new Date(Date.parse(slotInstant(2)) + 60000)
            .toISOString()
            .replace(".000Z", ".000001Z"),
          intendedSlotAt: slotInstant(2),
          delayMinutes: 1,
        },
      },
      { rawAnswer: "sub-ms captured" },
    );
    await expect(
      db.query("SELECT save_citation_capture($1,'p',$2)", [user, doc(subMsCaptured)]),
    ).rejects.toThrow(/citation_delay_untruthful/);
    // Only the one valid round-1 capture persisted; no sub-millisecond row was stored.
    expect((await readAnswerEvidence(scope, rpc)).answers).toHaveLength(1);
  });
});
