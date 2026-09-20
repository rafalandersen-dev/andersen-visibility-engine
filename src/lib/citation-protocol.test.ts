import { describe, expect, it, vi } from "vitest";
import type { AnswerEvidence } from "./answer-evidence";
import type { BrandRun, CaptureContext, PanelProtocol } from "./citation-panel";
import { panelCounts } from "./citation-panel";
import {
  citationProtocolStateSchema,
  citationReport,
  parseManualCaptureInput,
  panelDraftSchema,
  lockedPanelSchema,
  resolveErasedSlots,
  resolveStoredCaptures,
  type BrandRunApproval,
  type ErasedSlot,
  type ErasedSlotFact,
} from "./citation-protocol";
import {
  approveBrandRun,
  importManualCapture,
  lockCitationPanel,
  readCitationProtocol,
  readResolvedCaptures,
  saveCitationPanelDraft,
} from "./citation-protocol.server";
/** Fixtures only. Synthetic placeholder text, never the owner-reviewed Appendix A/B panels and
 * never a collected observation (spec §12). Nothing here is saved to the live client project. */
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const discoveryText = "FIXTURE Var kan jag boka massage i Limhamn?";
const brandText = "FIXTURE Vad är Synergy Massage i Malmö?";
const surface = {
  service: "ChatGPT",
  interface: "consumer web app",
  mode: "search" as const,
  searchMode: "Search",
  modelLabel: null,
  webSearchEvidenced: "evidenced" as const,
};
const panelSession = {
  freshSession: true as const,
  personalisation: "non_personalised" as const,
  signedIn: "signed_in" as const,
  memory: "off" as const,
  customInstructions: "none" as const,
  connectedTools: "none" as const,
  extraInstruction: null,
  priorMessages: 0 as const,
};
const collection = {
  country: "Sweden",
  city: "Malmö",
  devicePermission: "granted" as const,
  vpn: false,
};
// The v1 discovery grid: exactly 10 distinct, prompt-bound questions (SY-D01 keeps the fixture prompt
// the captures reference). Distinct texts/prompt ids across SY-D01..SY-D10.
const discoveryQuestions = Array.from({ length: 10 }, (_, i) => ({
  id: `SY-D${String(i + 1).padStart(2, "0")}`,
  promptId: uuid(101 + i),
  promptRevision: 1,
  text: i === 0 ? discoveryText : `${discoveryText} (#${i + 1})`,
  language: "sv",
}));
const brandQuestion = {
  id: "SY-B01",
  promptId: uuid(201),
  promptRevision: 1,
  text: brandText,
  language: "sv",
};
const discoveryPanel = (over: Partial<PanelProtocol> = {}): PanelProtocol => ({
  panelId: uuid(1),
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
  status: "locked",
  approval: { approvedBy: owner, approvedAt: "2026-09-01T00:00:00Z" },
  ...over,
});
const brandPanel = (): PanelProtocol => ({
  ...discoveryPanel(),
  panelId: uuid(2),
  kind: "brand",
  questions: [brandQuestion],
  rounds: 0,
});
const brandRun = (over: Partial<BrandRun> = {}): BrandRun => ({
  id: uuid(50),
  panelId: uuid(2),
  panelVersion: 1,
  approvedBy: owner,
  approvedAt: "2026-09-01T00:00:00Z",
  observationBudget: 5,
  rounds: 1,
  ...over,
});
const context = (over: Partial<CaptureContext> = {}): CaptureContext => ({
  panelId: uuid(1),
  panelVersion: 1,
  slot: { round: 1, questionId: "SY-D01" },
  brandRunId: null,
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
  time: {
    capturedAt: "2026-09-08T10:00:00Z",
    intendedSlotAt: "2026-09-08T09:00:00Z",
    delayMinutes: 60,
  },
  instructions: { questionText: discoveryText, extraInstruction: null, priorMessages: 0 },
  capture: { screenshotRef: null, missingReason: null },
  deviationNotes: [],
  ...over,
});
const answer = (over: Partial<AnswerEvidence> = {}): AnswerEvidence => ({
  promptId: uuid(101),
  promptRevision: 1,
  surface: "ChatGPT consumer web app",
  mode: "search",
  method: "manual copy v1",
  modelVersion: null,
  capturedAt: "2026-09-08T10:00:00Z",
  status: "complete",
  rawAnswer: "FIXTURE answer text",
  citations: [],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
  captureContext: context(),
  ...over,
});
const promptRow = {
  id: uuid(101),
  revision: 1,
  createdAt: "2026-08-01T00:00:00Z",
  data: {
    prompt: discoveryText,
    intent: "discovery",
    source: "manual" as const,
    market: "Sweden",
    language: "Swedish",
    brand: "Synergy",
    websiteUrl: "https://synergymassage.se",
    competitorUrls: [] as string[],
    active: true,
  },
};

describe("citation protocol pure contract", () => {
  it("treats a draft as unapproved and a saved-approval draft as invalid", () => {
    expect(
      panelDraftSchema.safeParse(discoveryPanel({ status: "draft", approval: null })).success,
    ).toBe(true);
    expect(panelDraftSchema.safeParse(discoveryPanel()).success).toBe(false); // locked, not a draft
    expect(
      panelDraftSchema.safeParse(
        discoveryPanel({
          status: "draft",
          approval: { approvedBy: owner, approvedAt: "2026-09-01T00:00:00Z" },
        }),
      ).success,
    ).toBe(false); // a draft may not carry an approval receipt
  });
  it("requires a present, time-consistent capture context on a manual capture", () => {
    expect(parseManualCaptureInput(answer()).captureContext.slot.questionId).toBe("SY-D01");
    const { captureContext, ...bare } = answer();
    void captureContext;
    expect(() => parseManualCaptureInput(bare)).toThrow("citation_capture_context_missing");
    expect(() => parseManualCaptureInput(answer({ capturedAt: "2026-09-08T11:00:00Z" }))).toThrow(
      "citation_capture_time_mismatch",
    );
  });
  it("refuses a capture whose own mode or model contradicts its capture context", () => {
    // A deviation from the panel stays storable evidence; a record contradicting ITSELF does not.
    // Here the context surface is consumer/search but the answer claims an API delivery mode, or a
    // different model label than the context records — the same record would otherwise be read two
    // ways (legacy analysis vs citation resolver), so it is refused at the input boundary.
    expect(() => parseManualCaptureInput(answer({ mode: "api" }))).toThrow(
      "citation_capture_mode_conflict",
    );
    expect(() => parseManualCaptureInput(answer({ modelVersion: "gpt-x" }))).toThrow(
      "citation_capture_model_conflict",
    );
  });
  it("resolves a clean discovery capture as a complete slot", () => {
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
        },
      ],
      [discoveryPanel()],
      [],
    );
    expect(r).toMatchObject({
      outcome: "complete",
      deviations: [],
      panelResolved: true,
      brandRunResolved: null,
    });
  });
  it("keeps a capture collected before the panel approval inspectable but never eligible", () => {
    // The panel's fixture approval instant is 2026-09-01; a 2026-08-15 capture predates the approved
    // protocol, so it resolves (inspectable) but is demoted from complete and flagged, not eligible.
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context({
            time: {
              capturedAt: "2026-08-15T10:00:00Z",
              intendedSlotAt: "2026-08-15T09:00:00Z",
              delayMinutes: 0,
            },
          }),
        },
      ],
      [discoveryPanel()],
      [],
    );
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("panel_approved_after_capture");
  });
  it("invalidates a capture whose locked panel version no longer resolves", () => {
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
        },
      ],
      [discoveryPanel({ version: 2 })],
      [],
    );
    expect(r).toMatchObject({
      outcome: "protocol_deviant",
      deviations: ["panel_unresolved"],
      panelResolved: false,
    });
  });
  it("binds a brand capture to its approved run and refuses a run-less approved set", () => {
    const brandContext = context({
      panelId: uuid(2),
      slot: { round: 1, questionId: "SY-B01" },
      brandRunId: uuid(50),
      instructions: { questionText: brandText, extraInstruction: null, priorMessages: 0 },
    });
    const store = [
      {
        id: "b1",
        status: "complete" as const,
        promptId: uuid(201),
        promptRevision: 1,
        captureContext: brandContext,
      },
    ];
    expect(resolveStoredCaptures(store, [brandPanel()], [brandRun()])[0]).toMatchObject({
      outcome: "complete",
      deviations: [],
      brandRunResolved: true,
    });
    const foreign = resolveStoredCaptures(store, [brandPanel()], [])[0];
    expect(foreign.brandRunResolved).toBe(false);
    expect(foreign.outcome).toBe("protocol_deviant");
    expect(foreign.deviations).toContain("brand_run_not_approved");
  });
  it("resolves only active correction-chain leaves and roundtrips into panelCounts without duplicate slots", () => {
    // A correction-of-correction chain a←b←c at round 1, plus an unrelated capture d at round 2.
    const at = (id: string, supersedesId: string | null, over = {}) => ({
      id,
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: context(over),
      supersedesId,
    });
    const resolved = resolveStoredCaptures(
      [
        at("a", null),
        at("b", "a"),
        at("c", "b"),
        at("d", null, { slot: { round: 2, questionId: "SY-D01" } }),
      ],
      [discoveryPanel()],
      [],
    );
    // Only the active leaf of the chain (c) and the unrelated capture (d) resolve; the superseded raw
    // records a and b remain in storage but are never re-counted.
    expect(resolved.map((r) => r.answerId).sort()).toEqual(["c", "d"]);
    const counts = panelCounts(
      discoveryPanel(),
      resolved.map((r) => ({
        questionId: r.captureContext.slot.questionId,
        round: r.captureContext.slot.round,
        outcome: r.outcome,
        citationsComplete: true,
        ownCitation: null,
        mention: null,
        recommended: null,
        brandRunId: r.captureContext.brandRunId,
      })),
    );
    // Two distinct slots, no duplicate-slot throw (pre-fix, a/b/c would all resolve to round 1).
    expect(counts).toMatchObject({ recorded: 2, outcomes: { complete: 2 } });
  });
  it("keeps a valid capture in resolved counts when a context-less or malformed successor supersedes it", () => {
    const cap = {
      id: "cap",
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: context(),
      supersedesId: null,
    };
    // A legacy Answer-panel "Correct" supersedes the capture but carries no captureContext; and a
    // separate successor whose captureContext is malformed. Neither is a resolvable capture, so
    // neither may erase the capture-bound observation from the resolved counts (the pre-fix bug:
    // original excluded as superseded, successor skipped as unresolvable → the observation vanished).
    const legacySuccessor = {
      id: "leg",
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: undefined,
      supersedesId: "cap",
    };
    const malformedSuccessor = {
      id: "bad",
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: { not: "a valid capture context" },
      supersedesId: "cap",
    };
    for (const successor of [legacySuccessor, malformedSuccessor]) {
      const resolved = resolveStoredCaptures([cap, successor], [discoveryPanel()], []);
      expect(resolved.map((r) => r.answerId)).toEqual(["cap"]);
      expect(resolved[0]).toMatchObject({ outcome: "complete", panelResolved: true });
    }
  });
  it("collapses an already-stored duplicate slot to one invalid entry so the report stays reportable", () => {
    const dup = (id: string) => ({
      id,
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: context(),
      supersedesId: null,
    });
    const resolved = resolveStoredCaptures([dup("a"), dup("b")], [discoveryPanel()], []);
    // Two independent originals share one slot: collapse to a single explicitly-invalid entry rather
    // than forward both (which would trip panelCounts' duplicate-slot guard) or silently pick one.
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ outcome: "protocol_deviant" });
    expect(resolved[0].deviations).toContain("duplicate_slot");
    const counts = panelCounts(
      discoveryPanel(),
      resolved.map((r) => ({
        questionId: r.captureContext.slot.questionId,
        round: r.captureContext.slot.round,
        outcome: r.outcome,
        citationsComplete: true,
        ownCitation: null,
        mention: null,
        recommended: null,
        brandRunId: r.captureContext.brandRunId,
      })),
    );
    expect(counts).toMatchObject({ recorded: 1, outcomes: { complete: 0, protocol_deviant: 1 } });
  });
  it("refuses an API-surface panel as draft or locked, and accepts a consumer surface (v1 §§2/5.2)", () => {
    const apiSurface = { ...surface, mode: "api" as const };
    expect(
      panelDraftSchema.safeParse(
        discoveryPanel({ status: "draft", approval: null, surface: apiSurface }),
      ).success,
    ).toBe(false);
    expect(lockedPanelSchema.safeParse(discoveryPanel({ surface: apiSurface })).success).toBe(
      false,
    );
    expect(
      panelDraftSchema.safeParse(discoveryPanel({ status: "draft", approval: null })).success,
    ).toBe(true); // consumer (search) surface remains valid
  });
  it("refuses an API-surface manual capture at the input boundary (v1 consumer-only)", () => {
    expect(() =>
      parseManualCaptureInput(
        answer({ mode: "api", captureContext: context({ surface: { ...surface, mode: "api" } }) }),
      ),
    ).toThrow("citation_non_consumer_surface");
  });
  it("flags an already-stored API capture as non-consumer, never a complete measurement", () => {
    const apiSurface = { ...surface, mode: "api" as const };
    // An API capture whose (historical) panel also records API would otherwise match and read
    // complete; the consumer-only guard independently demotes it and flags non_consumer_surface.
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context({ surface: apiSurface }),
          supersedesId: null,
        },
      ],
      [discoveryPanel({ surface: apiSurface })],
      [],
    );
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("non_consumer_surface");
  });
  it("locks only the exact v1 discovery grid (10 questions × 4 rounds); drafts stay editable", () => {
    // Under-sized (9 questions), too-few (3) and too-many (5) rounds never validate as a locked panel.
    expect(
      lockedPanelSchema.safeParse(discoveryPanel({ questions: discoveryQuestions.slice(0, 9) }))
        .success,
    ).toBe(false);
    expect(lockedPanelSchema.safeParse(discoveryPanel({ rounds: 3 })).success).toBe(false);
    expect(lockedPanelSchema.safeParse(discoveryPanel({ rounds: 5 })).success).toBe(false);
    // Exactly 10 × 4 is valid.
    expect(lockedPanelSchema.safeParse(discoveryPanel()).success).toBe(true);
    // A draft may still be incomplete/editable — the grid is enforced only at lock.
    expect(
      panelDraftSchema.safeParse(
        discoveryPanel({
          status: "draft",
          approval: null,
          questions: discoveryQuestions.slice(0, 3),
        }),
      ).success,
    ).toBe(true);
  });
  it("locks only ten DISTINCT discovery questions: refuses reused prompt bindings or copied text", () => {
    // Ten unique local ids all bound to ONE prompt (same promptId+revision, same text) is not ten
    // questions — a false ten-question experiment. Refused at lock even though ids are unique.
    const oneBinding = discoveryQuestions.map((q, i) => ({
      ...q,
      id: `SY-D${String(i + 1).padStart(2, "0")}`,
      promptId: uuid(101),
      promptRevision: 1,
      text: discoveryText,
    }));
    expect(lockedPanelSchema.safeParse(discoveryPanel({ questions: oneBinding })).success).toBe(
      false,
    );
    // Ten DISTINCT prompt ids but identical COPIED text is also not ten questions.
    const copiedText = discoveryQuestions.map((q) => ({ ...q, text: discoveryText }));
    expect(lockedPanelSchema.safeParse(discoveryPanel({ questions: copiedText })).success).toBe(
      false,
    );
    // The genuine ten-distinct grid (distinct bindings AND distinct texts) still locks.
    expect(lockedPanelSchema.safeParse(discoveryPanel()).success).toBe(true);
  });
  it("flags a capture against a historical non-distinct discovery grid as invalid, never complete", () => {
    // A locked panel already on disk whose ten questions carry identical copied text (a false
    // ten-question grid) must never read a capture as a complete v1 measurement.
    const copiedText = discoveryQuestions.map((q) => ({ ...q, text: discoveryText }));
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
          supersedesId: null,
        },
      ],
      [discoveryPanel({ questions: copiedText })],
      [],
    );
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("panel_grid_invalid");
  });
  it("plans exactly 40 discovery slots so one observed leaves 39 unobserved", () => {
    const counts = panelCounts(discoveryPanel(), [
      {
        questionId: "SY-D01",
        round: 1,
        outcome: "complete",
        citationsComplete: true,
        ownCitation: true,
        mention: true,
        recommended: null,
        brandRunId: null,
      },
    ]);
    expect(counts.planned).toBe(40); // 10 questions × 4 rounds
    expect(counts.recorded).toBe(1);
    expect(counts.planned - counts.recorded).toBe(39); // 39 slots unobserved, never fabricated
  });
  it("flags a capture against a historical under-sized discovery grid as invalid, never complete", () => {
    const undersized = discoveryPanel({ questions: discoveryQuestions.slice(0, 3) }); // 3, not 10
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
          supersedesId: null,
        },
      ],
      [undersized],
      [],
    );
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("panel_grid_invalid");
  });
});

describe("citation protocol erased-slot resolution (content-free tombstones)", () => {
  const tombstone = (over: Partial<ErasedSlotFact> = {}): ErasedSlotFact => ({
    answerId: uuid(700),
    panelId: uuid(1),
    panelVersion: 1,
    brandRunId: null,
    questionId: "SY-D01",
    round: 1,
    ...over,
  });
  it("surfaces an erased discovery observation, distinct from a never-observed slot", () => {
    const erased = resolveErasedSlots([tombstone()], [discoveryPanel()], [], []);
    expect(erased).toHaveLength(1);
    expect(erased[0]).toMatchObject({
      questionId: "SY-D01",
      round: 1,
      panelResolved: true,
      brandRunResolved: null,
    });
    // A slot with neither a tombstone nor a capture is absent from both — never fabricated here as an
    // erased fact (that is a genuinely never-observed / missed slot for the report to count as such).
    expect(resolveErasedSlots([], [discoveryPanel()], [], [])).toEqual([]);
  });
  it("never double-counts a slot a surviving capture still occupies, and collapses duplicate tombstones", () => {
    const live = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
          supersedesId: null,
        },
      ],
      [discoveryPanel()],
      [],
    );
    // A tombstone for the SAME slot as a surviving resolved capture is excluded (no double count).
    expect(resolveErasedSlots([tombstone()], [discoveryPanel()], [], live)).toEqual([]);
    // Two tombstones for one slot collapse to a single erased fact.
    expect(
      resolveErasedSlots(
        [tombstone(), tombstone({ answerId: uuid(701) })],
        [discoveryPanel()],
        [],
        [],
      ),
    ).toHaveLength(1);
  });
  it("keeps a brand run's budget consumed after all its captures are erased", () => {
    const bt = tombstone({
      answerId: uuid(710),
      panelId: uuid(2),
      brandRunId: uuid(50),
      questionId: "SY-B01",
    });
    // The erased brand observation still stands (budget consumed) and resolves its run.
    expect(resolveErasedSlots([bt], [brandPanel()], [brandRun()], [])[0]).toMatchObject({
      brandRunId: uuid(50),
      panelResolved: true,
      brandRunResolved: true,
    });
    // Even if the run no longer resolves, the erased fact persists (the consumed attempt is immutable).
    expect(resolveErasedSlots([bt], [brandPanel()], [], [])[0]).toMatchObject({
      panelResolved: true,
      brandRunResolved: false,
    });
  });
  it("marks an erased slot whose panel version no longer resolves as unresolved, still not absent", () => {
    const [r] = resolveErasedSlots([tombstone({ panelVersion: 2 })], [discoveryPanel()], [], []);
    expect(r).toMatchObject({ panelResolved: false, brandRunResolved: null });
  });
});

describe("citation canonical report folds live + trusted erasure facts (final counts)", () => {
  const es = (over: Partial<ErasedSlot> = {}): ErasedSlot => ({
    answerId: uuid(700),
    panelId: uuid(1),
    panelVersion: 1,
    brandRunId: null,
    questionId: "SY-D01",
    round: 1,
    panelResolved: true,
    brandRunResolved: null,
    ...over,
  });
  const liveComplete = () =>
    resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
          supersedesId: null,
        },
      ],
      [discoveryPanel()],
      [],
    );
  it("counts erased discovery slots as erased (not absent), with no eligible numerator from erasure", () => {
    const report = citationReport(discoveryPanel(), liveComplete(), {
      slots: [es({ answerId: uuid(701), questionId: "SY-D02", round: 1 })], // a different slot, erased
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: {},
    });
    expect(report).toMatchObject({
      planned: 40,
      observed: 1,
      erased: 1,
      recorded: 2,
      neverObserved: 38, // 40 planned − 1 observed − 1 erased
      excluded: 0,
    });
    expect(report.outcomes.complete).toBe(1); // only the live complete; erasure adds no complete
  });
  it("keeps a brand run's budget consumed after every capture is erased (live empty)", () => {
    const report = citationReport(
      brandPanel(),
      [],
      {
        slots: [
          es({
            answerId: uuid(710),
            panelId: uuid(2),
            brandRunId: uuid(50),
            questionId: "SY-B01",
            round: 1,
          }),
          es({
            answerId: uuid(711),
            panelId: uuid(2),
            brandRunId: uuid(50),
            questionId: "SY-B01",
            round: 2,
          }),
        ],
        consumedByRun: { [uuid(50)]: 2 }, // trusted: two erased tombstone rows
        excludedByVersion: {},
        coverageCompleteByVersion: {},
      },
      [brandRun({ observationBudget: 2, rounds: 2 })],
    );
    expect(report.brandRuns).toEqual([
      { runId: uuid(50), approvedBudget: 2, consumed: 2, observed: 0, erased: 2 },
    ]);
    expect(report.outcomes.complete).toBe(0);
  });
  it("counts two erased originals at ONE run/slot as consumed 2 but erased-unique 1", () => {
    // The trusted consumed (2 tombstone rows) is independent of the collapsed coverage slot (1).
    const report = citationReport(
      brandPanel(),
      [],
      {
        slots: [
          es({
            answerId: uuid(710),
            panelId: uuid(2),
            brandRunId: uuid(50),
            questionId: "SY-B01",
            round: 1,
          }),
        ],
        consumedByRun: { [uuid(50)]: 2 },
        excludedByVersion: {},
        coverageCompleteByVersion: {},
      },
      [brandRun({ observationBudget: 2, rounds: 2 })],
    );
    expect(report.brandRuns).toEqual([
      { runId: uuid(50), approvedBudget: 2, consumed: 2, observed: 0, erased: 1 },
    ]);
  });
  it("surfaces malformed historical tombstones as an excluded count; budget still consumed", () => {
    // Malformed tombstones arrive already reduced to content-free counts (no slots transmitted).
    const report = citationReport(
      brandPanel(),
      [],
      {
        slots: [],
        consumedByRun: { [uuid(50)]: 2 },
        excludedByVersion: { [`${uuid(2)}:1`]: 2 },
        coverageCompleteByVersion: {},
      },
      [brandRun({ observationBudget: 5, rounds: 2 })],
    );
    expect(report.erased).toBe(0);
    expect(report.excluded).toBe(2); // both malformed rows visible as an excluded count
    expect(report.brandRuns[0].consumed).toBe(2); // both consumed budget despite malformed slots
  });
  it("never double-counts a slot present as both a live capture and an erased fact", () => {
    const report = citationReport(discoveryPanel(), liveComplete(), {
      slots: [es()], // SY-D01 r1, same as the live capture
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: {},
    });
    expect(report.observed).toBe(1);
    expect(report.erased).toBe(0); // the live capture holds the slot; the erased fact is not re-counted
    expect(report.excluded).toBe(1); // surfaced as excluded, never silently dropped
    expect(report.recorded).toBe(1);
  });
  it("returns neverObserved = null (not a definitive count) when erased-slot coverage is incomplete", () => {
    const key = `${uuid(1)}:1`;
    const complete = citationReport(discoveryPanel(), liveComplete(), {
      slots: [es({ answerId: uuid(701), questionId: "SY-D02", round: 1 })],
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: { [key]: true },
    });
    expect(complete).toMatchObject({ coverageComplete: true, neverObserved: 38 });
    // Same inputs but coverage flagged incomplete (the read LIMIT truncated this version's tombstones):
    // neverObserved must be null — never derived from partial data — while erased stays a floor.
    const incomplete = citationReport(discoveryPanel(), liveComplete(), {
      slots: [es({ answerId: uuid(701), questionId: "SY-D02", round: 1 })],
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: { [key]: false },
    });
    expect(incomplete).toMatchObject({
      coverageComplete: false,
      neverObserved: null,
      observed: 1,
      erased: 1,
    });
  });
});

describe("citation protocol server, no provider or URL calls", () => {
  const scope = { ownerId: owner, projectId: "p" };
  it("validates owner and project before any RPC", async () => {
    const rpc = vi.fn();
    await expect(readCitationProtocol({ ...scope, ownerId: "bad" }, rpc)).rejects.toThrow();
    await expect(
      saveCitationPanelDraft({ ...scope, projectId: "../p" }, uuid(1), 0, {}, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("parses protocol state and rejects an over-cap panel array", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { panels: [], brandRuns: [] }, error: null });
    // A protocol payload without the erasure fields still parses (optional-with-default → empty sets).
    expect(await readCitationProtocol(scope, rpc)).toEqual({
      panels: [],
      brandRuns: [],
      tombstones: [],
      runConsumed: [],
      erasureByVersion: [],
      erasureOverflow: 0,
    });
    expect(
      citationProtocolStateSchema.safeParse({
        panels: Array.from({ length: 201 }, () => discoveryPanel()),
        brandRuns: [],
      }).success,
    ).toBe(false);
  });
  it("refuses a draft whose id or version does not match the request before the RPC", async () => {
    const rpc = vi.fn();
    const draft = discoveryPanel({ status: "draft", approval: null });
    await expect(saveCitationPanelDraft(scope, uuid(9), 0, draft, rpc)).rejects.toThrow(
      "citation_panel_draft_mismatch",
    );
    await expect(saveCitationPanelDraft(scope, uuid(1), 5, draft, rpc)).rejects.toThrow(
      "citation_panel_draft_mismatch",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves a draft and passes the exact document to the RPC", async () => {
    const draft = discoveryPanel({ version: 1, status: "draft", approval: null });
    const rpc = vi.fn().mockResolvedValue({ data: draft, error: null });
    await saveCitationPanelDraft(scope, uuid(1), 0, draft, rpc);
    expect(rpc).toHaveBeenCalledWith("save_citation_panel_draft", {
      p_user: owner,
      p_project: "p",
      p_panel: uuid(1),
      p_expected: 0,
      p_document: draft,
    });
  });
  it("locks a panel and confirms the server-derived owner approval", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: discoveryPanel(), error: null });
    const locked = await lockCitationPanel(scope, uuid(1), 1, rpc);
    expect(locked.approval?.approvedBy).toBe(owner);
    await expect(
      lockCitationPanel(
        scope,
        uuid(1),
        1,
        vi.fn().mockResolvedValue({
          data: discoveryPanel({
            approval: { approvedBy: other, approvedAt: "2026-09-01T00:00:00Z" },
          }),
          error: null,
        }),
      ),
    ).rejects.toThrow("citation_panel_owner_mismatch");
  });
  it("approves a brand run through the server, never trusting a client owner", async () => {
    const run = brandRun();
    const rpc = vi.fn().mockResolvedValue({ data: run, error: null });
    const approval: BrandRunApproval = {
      runId: uuid(50),
      panelId: uuid(2),
      panelVersion: 1,
      observationBudget: 5,
      rounds: 1,
    };
    expect((await approveBrandRun(scope, approval, rpc)).approvedBy).toBe(owner);
    expect(rpc).toHaveBeenCalledWith("approve_citation_brand_run", {
      p_user: owner,
      p_project: "p",
      p_run: uuid(50),
      p_panel: uuid(2),
      p_version: 1,
      p_budget: 5,
      p_rounds: 1,
    });
  });
  it("builds the capture document from the saved prompt and routes it to the capture RPC", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { prompts: [promptRow], answers: [] }, error: null })
      .mockResolvedValueOnce({ data: uuid(500), error: null });
    await importManualCapture(scope, answer(), rpc);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "read_ai_answer_evidence",
      "save_citation_capture",
    ]);
    const document = (rpc.mock.calls[1][1] as { p_document: Record<string, unknown> }).p_document;
    expect(document).toMatchObject({
      prompt: { id: uuid(101), revision: 1 },
      analysis: { verified: false },
      input: { captureContext: { slot: { questionId: "SY-D01" } } },
    });
  });
  it("rejects a capture with no bound prompt without writing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { prompts: [], answers: [] }, error: null });
    await expect(importManualCapture(scope, answer(), rpc)).rejects.toThrow(
      "evidence_prompt_missing",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects a capture missing its context before any read", async () => {
    const { captureContext, ...bare } = answer();
    void captureContext;
    const rpc = vi.fn();
    await expect(importManualCapture(scope, bare, rpc)).rejects.toThrow(
      "citation_capture_context_missing",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reads panels, runs and answers together and resolves captures for the report layer", async () => {
    const rpc = vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_citation_protocol"
            ? { panels: [discoveryPanel()], brandRuns: [] }
            : { prompts: [], answers: [] },
        error: null,
      }),
    );
    const result = await readResolvedCaptures(scope, rpc);
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual([
      "read_ai_answer_evidence",
      "read_citation_protocol",
    ]);
    expect(result.panels).toEqual([discoveryPanel()]);
    expect(result.brandRuns).toEqual([]);
    expect(result.captures).toEqual([]);
    expect(result.erasedSlots).toEqual([]);
    // The service boundary always emits a canonical erased-aware report per locked panel version, so a
    // consumer cannot read `captures` and silently drop erased facts. Empty here: nothing observed yet.
    expect(result.reports).toEqual([
      {
        panelId: discoveryPanel().panelId,
        panelVersion: 1,
        kind: "discovery",
        planned: 40,
        observed: 0,
        erased: 0,
        recorded: 0,
        neverObserved: 40,
        coverageComplete: true, // no tombstones → coverage trivially complete
        excluded: 0,
        outcomes: { complete: 0, failed: 0, truncated: 0, missed: 0, protocol_deviant: 0 },
        brandRuns: [],
      },
    ]);
    expect(result.erasureOverflow).toBe(0); // no orphaned tombstones
  });
  it("reads evidence before the dependency protocol, so a concurrent lock/import cannot cause a false unresolved", async () => {
    // Deterministic, sleep-free ordering proof: the evidence RPC is held pending; the protocol RPC
    // (the capture's append-only dependency) must not start until the evidence result is in.
    let releaseEvidence!: (v: { data: unknown; error: null }) => void;
    const evidencePending = new Promise<{ data: unknown; error: null }>((res) => {
      releaseEvidence = res;
    });
    const order: string[] = [];
    const rpc = vi.fn((name: string) => {
      order.push(name);
      return name === "read_ai_answer_evidence"
        ? evidencePending
        : Promise.resolve({ data: { panels: [discoveryPanel()], brandRuns: [] }, error: null });
    });
    const pending = readResolvedCaptures(scope, rpc);
    // Flush microtasks while evidence stays pending: the protocol dependency must not be read yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["read_ai_answer_evidence"]);
    // Now the evidence resolves with a NEW capture. Only after this may the protocol be read, and the
    // capture must resolve against that (at-least-as-new) protocol — never a stale one.
    const answerRow = {
      id: uuid(500),
      createdAt: "2026-09-08T10:00:00Z",
      hash: "hash-500",
      input: answer(),
      prompt: promptRow,
      analysis: {
        algorithm: "literal-mention-supplied-citations-v1" as const,
        verified: false as const,
        mention: null,
        ownCitation: null,
        citations: [] as { url: string; kind: "own" | "competitor" | "third-party" }[],
        cohort: "[]",
      },
    };
    releaseEvidence({ data: { prompts: [], answers: [answerRow] }, error: null });
    const result = await pending;
    expect(order).toEqual(["read_ai_answer_evidence", "read_citation_protocol"]);
    expect(result.captures[0]).toMatchObject({
      answerId: uuid(500),
      panelResolved: true,
      outcome: "complete",
    });
  });
  it("invalidates a stale live capture when a newer tombstone shows it was deleted between the two reads", async () => {
    // Evidence (read first) still shows the capture as live; the protocol (read second) already carries
    // its tombstone for the SAME slot — i.e. the original was deleted between the two reads. The
    // tombstone is authoritative, so the capture must NOT be returned as a live/positive slot; it is
    // reported as an erased one. Deterministic, single-connection — a conservative boundary check, not a
    // claim of multi-connection atomicity.
    const answerRow = {
      id: uuid(500),
      createdAt: "2026-09-08T10:00:00Z",
      hash: "hash-500",
      input: answer(),
      prompt: promptRow,
      analysis: {
        algorithm: "literal-mention-supplied-citations-v1" as const,
        verified: false as const,
        mention: null,
        ownCitation: null,
        citations: [] as { url: string; kind: "own" | "competitor" | "third-party" }[],
        cohort: "[]",
      },
    };
    const rpc = vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_ai_answer_evidence"
            ? { prompts: [], answers: [answerRow] }
            : {
                panels: [discoveryPanel()],
                brandRuns: [],
                tombstones: [
                  {
                    answerId: uuid(500),
                    panelId: uuid(1),
                    panelVersion: 1,
                    brandRunId: null,
                    questionId: "SY-D01",
                    round: 1,
                  },
                ],
              },
        error: null,
      }),
    );
    const result = await readResolvedCaptures(scope, rpc);
    expect(result.captures).toEqual([]); // the stale live capture is dropped (it was deleted)
    expect(result.erasedSlots.map((s) => s.answerId)).toEqual([uuid(500)]);
    const [report] = result.reports;
    expect(report).toMatchObject({ observed: 0, erased: 1 }); // reported as erased, never a live positive
  });
  it("drops a whole correction chain by ROOT identity when its original was deleted between reads", async () => {
    // Stale evidence still shows original X and its correction X' live; the newer protocol has a
    // tombstone for the ROOT X (the erased original, supersedes null). The active leaf is X' (id != X),
    // so slot equality would be needed to catch it — but identity via the chain ROOT is exact: X' is
    // dropped because rootOf(X') === X ∈ tombstones. No stale positive content is returned.
    const analysis = {
      algorithm: "literal-mention-supplied-citations-v1" as const,
      verified: false as const,
      mention: null,
      ownCitation: null,
      citations: [] as { url: string; kind: "own" | "competitor" | "third-party" }[],
      cohort: "[]",
    };
    const original = {
      id: uuid(500),
      createdAt: "2026-09-08T10:00:00Z",
      hash: "h-root",
      input: answer(),
      prompt: promptRow,
      analysis,
    };
    const correction = {
      id: uuid(501),
      createdAt: "2026-09-08T11:00:00Z",
      hash: "h-leaf",
      input: answer({ supersedesId: uuid(500), rawAnswer: "corrected" }),
      prompt: promptRow,
      analysis,
    };
    const rpc = vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_ai_answer_evidence"
            ? { prompts: [], answers: [original, correction] }
            : {
                panels: [discoveryPanel()],
                brandRuns: [],
                tombstones: [
                  {
                    answerId: uuid(500), // the ROOT/original id, not the leaf
                    panelId: uuid(1),
                    panelVersion: 1,
                    brandRunId: null,
                    questionId: "SY-D01",
                    round: 1,
                  },
                ],
              },
        error: null,
      }),
    );
    const result = await readResolvedCaptures(scope, rpc);
    expect(result.captures).toEqual([]); // the active leaf X' dropped via its root X; no stale positive
    expect(result.erasedSlots.map((s) => s.answerId)).toEqual([uuid(500)]);
    expect(result.reports[0]).toMatchObject({ observed: 0, erased: 1 });
  });
  // Two-snapshot race helpers: stale evidence (older) still shows rows live; newer protocol has a
  // tombstone for one root. All rows sit at the ONE slot SY-D01 r1 so the collapse would otherwise fight
  // the reconciliation. These exercise the ordering combination the earlier fix missed.
  const raceAnalysis = {
    algorithm: "literal-mention-supplied-citations-v1" as const,
    verified: false as const,
    mention: null,
    ownCitation: null,
    citations: [] as { url: string; kind: "own" | "competitor" | "third-party" }[],
    cohort: "[]",
  };
  const raceRow = (id: string, over: Partial<AnswerEvidence> = {}) => ({
    id,
    createdAt: "2026-09-08T10:00:00Z",
    hash: `h-${id}`,
    input: answer(over),
    prompt: promptRow,
    analysis: raceAnalysis,
  });
  const raceRpc = (answers: unknown[], tombstonedRootIds: string[]) =>
    vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_ai_answer_evidence"
            ? { prompts: [], answers }
            : {
                panels: [discoveryPanel()],
                brandRuns: [],
                tombstones: tombstonedRootIds.map((id) => ({
                  answerId: id,
                  panelId: uuid(1),
                  panelVersion: 1,
                  brandRunId: null,
                  questionId: "SY-D01",
                  round: 1,
                })),
              },
        error: null,
      }),
    );
  it("preserves an independent survivor in the delete-between-reads race (A first in stale evidence, tombstone A)", async () => {
    // Older evidence still shows A and independent B live at one slot; newer protocol tombstones A.
    const rpc = raceRpc([raceRow(uuid(500)), raceRow(uuid(501))], [uuid(500)]);
    const result = await readResolvedCaptures(scope, rpc);
    // A's chain is dropped from the RAW set BEFORE resolution, so B is not discarded by the collapse.
    expect(result.captures.map((c) => c.answerId)).toEqual([uuid(501)]); // B survives
    expect(result.captures[0].outcome).toBe("protocol_deviant");
    expect(result.captures[0].deviations).toContain("erased_duplicate_slot"); // ambiguous history exposed
  });
  it("preserves the independent survivor regardless of stale order (B first in stale evidence, tombstone A)", async () => {
    // Same as above but the stable-first row is now the SURVIVOR — the earlier post-resolve filter would
    // have kept B here yet dropped it in the other order; raw-first reconciliation is order-independent.
    const rpc = raceRpc([raceRow(uuid(501)), raceRow(uuid(500))], [uuid(500)]);
    const result = await readResolvedCaptures(scope, rpc);
    expect(result.captures.map((c) => c.answerId)).toEqual([uuid(501)]); // B survives, order-independent
    expect(result.captures[0].deviations).toContain("erased_duplicate_slot");
  });
  it("preserves a surviving sibling's correction chain in the race when the independent original is erased", async () => {
    const rpc = raceRpc(
      [
        raceRow(uuid(500)), // independent original A (erased)
        raceRow(uuid(501)), // original B
        raceRow(uuid(502), { supersedesId: uuid(501), rawAnswer: "B corrected" }), // B's active leaf
      ],
      [uuid(500)],
    );
    const result = await readResolvedCaptures(scope, rpc);
    // A dropped by root; B's chain survives; its ACTIVE LEAF (502, not its root 501) is the resolved
    // capture, flagged as ambiguous duplicate history — no stale A content is returned.
    expect(result.captures.map((c) => c.answerId)).toEqual([uuid(502)]);
    expect(result.captures[0].deviations).toContain("erased_duplicate_slot");
  });
});
