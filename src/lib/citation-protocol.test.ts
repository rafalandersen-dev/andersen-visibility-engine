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
// v1 weekly discovery schedule (spec §§5.1 Frequency, 5.2 Time, 5.3): four owner-approved intended
// weekly slots at 09:00 Europe/Stockholm — 07:00Z in September (CEST, UTC+2) — one week apart, all
// after the fixture approval (2026-09-01, so prospective). No DST transition falls in this window.
const slotInstant = (round: number) =>
  `2026-09-${String(7 * round).padStart(2, "0")}T07:00:00.000Z`;
const discoverySchedule = {
  timezone: "Europe/Stockholm" as const,
  slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: slotInstant(round) })),
};
// A capture's truthful time for its round: the run happens `delayMinutes` after the intended weekly slot.
const slotTime = (round: number, delayMinutes = 60) => ({
  capturedAt: new Date(Date.parse(slotInstant(round)) + delayMinutes * 60000).toISOString(),
  intendedSlotAt: slotInstant(round),
  delayMinutes,
});
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
  schedule: discoverySchedule,
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
  schedule: null, // brand diagnostics are unscheduled (never inherit the discovery weekly schedule)
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
const context = (over: Partial<CaptureContext> = {}): CaptureContext => {
  const slot = over.slot ?? { round: 1, questionId: "SY-D01" };
  return {
    panelId: uuid(1),
    panelVersion: 1,
    slot,
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
    // Default the capture time to THIS round's owner-approved weekly slot (+ a truthful 60-min delay),
    // so a round-2/3/4 capture is schedule-consistent (spec §§5.1/5.2/5.3) unless a test overrides `time`.
    time: over.time ?? slotTime(slot.round),
    instructions: { questionText: discoveryText, extraInstruction: null, priorMessages: 0 },
    capture: { screenshotRef: null, missingReason: null },
    deviationNotes: [],
    ...over,
  };
};
const answer = (over: Partial<AnswerEvidence> = {}): AnswerEvidence => ({
  promptId: uuid(101),
  promptRevision: 1,
  surface: "ChatGPT consumer web app",
  mode: "search",
  method: "manual copy v1",
  modelVersion: null,
  capturedAt: slotTime(1).capturedAt, // matches context()'s round-1 weekly slot time (§5.2 consistency)
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
  it("flags a discovery capture as ambiguous when the project has more than one locked discovery baseline", () => {
    // v1 permits ONE locked discovery baseline. Two locked+approved discovery versions (here two panel
    // ids) is a parallel/change-midpilot ambiguity: the capture stays inspectable (resolved) but is never
    // a clean complete measurement.
    const cap = {
      id: uuid(900),
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      supersedesId: null,
      captureContext: context(),
    };
    const [r] = resolveStoredCaptures(
      [cap],
      [discoveryPanel(), discoveryPanel({ panelId: uuid(3) })],
      [],
    );
    expect(r.panelResolved).toBe(true);
    expect(r.outcome).toBe("protocol_deviant");
    expect(r.deviations).toContain("discovery_baseline_ambiguous");
  });
  it("keeps a discovery capture eligible with exactly one locked baseline (a draft sibling is not a baseline)", () => {
    const cap = {
      id: uuid(901),
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      supersedesId: null,
      captureContext: context(),
    };
    // A DRAFT sibling discovery panel is not a baseline, so the single-baseline capture stays complete.
    const draftSibling = discoveryPanel({ panelId: uuid(3), status: "draft", approval: null });
    const [r] = resolveStoredCaptures([cap], [discoveryPanel(), draftSibling], []);
    expect(r).toMatchObject({ outcome: "complete" });
    expect(r.deviations).not.toContain("discovery_baseline_ambiguous");
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
  it("resolves a mixed-case brand capture against a lowercase panel and run (semantic UUID identity)", () => {
    // The panel document id and approved-run id are canonical lowercase (the write path derives them from
    // ::text), but a validly-admitted capture stored an UPPERCASE panelId/brandRunId. It must RESOLVE and
    // stay ELIGIBLE (complete) — not read as panel_unresolved / brand_run_not_approved and get demoted.
    const panelLower = "0000abcd-0000-4000-8000-0000000000a1";
    const runLower = "0000abcd-0000-4000-8000-0000000000b2";
    const brandLower = { ...brandPanel(), panelId: panelLower };
    const run = brandRun({ id: runLower, panelId: panelLower });
    const store = [
      {
        id: "0000abcd-0000-4000-8000-0000000000c3",
        status: "complete" as const,
        promptId: uuid(201),
        promptRevision: 1,
        supersedesId: null,
        captureContext: context({
          panelId: panelLower.toUpperCase(),
          slot: { round: 1, questionId: "SY-B01" },
          brandRunId: runLower.toUpperCase(),
          instructions: { questionText: brandText, extraInstruction: null, priorMessages: 0 },
        }),
      },
    ];
    const [r] = resolveStoredCaptures(store, [brandLower], [run]);
    expect(r).toMatchObject({ panelResolved: true, brandRunResolved: true, outcome: "complete" });
    expect(r.deviations).toEqual([]); // no panel_mismatch / brand_run_not_approved from the case gap
    // The report groups the capture under its run by uuid VALUE (observed 1, never excluded).
    const report = citationReport(
      brandLower,
      [r],
      {
        slots: [],
        consumedByRun: { [runLower]: 1 },
        excludedByVersion: {},
        coverageCompleteByVersion: {},
        extraAttemptsByVersion: {},
      },
      [run],
    );
    expect(report.brandRuns[0]).toMatchObject({ runId: runLower, observed: 1, consumed: 1 });
    expect(report.excluded).toBe(0);
    expect(report.outcomes.complete).toBe(1);
  });
  it("links a correction chain across UUID case so only the active leaf resolves", () => {
    // The successor's supersedesId is the UPPERCASE spelling of the predecessor's lowercase id. Chain
    // identity must link by uuid VALUE, so only the leaf resolves — not both (which would collapse to a
    // spurious duplicate_slot).
    const origLower = "0000abcd-0000-4000-8000-0000000000d4";
    const orig = {
      id: origLower,
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      supersedesId: null,
      captureContext: context(),
    };
    const corr = {
      id: uuid(802),
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      supersedesId: origLower.toUpperCase(),
      captureContext: context(),
    };
    const resolved = resolveStoredCaptures([orig, corr], [discoveryPanel()], []);
    expect(resolved.map((c) => c.answerId)).toEqual([uuid(802)]); // only the active leaf
    expect(resolved[0].deviations).not.toContain("duplicate_slot");
  });
  it("flags a survivor sharing a slot with an erased original across UUID case", () => {
    // The known erased slot key (from a lowercase tombstone column) must match a survivor whose stored
    // brandRunId is UPPERCASE, so the ambiguous duplicate history is flagged rather than read as clean.
    const panelLower = "0000abcd-0000-4000-8000-0000000000a1";
    const runLower = "0000abcd-0000-4000-8000-0000000000b2";
    const brandLower = { ...brandPanel(), panelId: panelLower };
    const run = brandRun({ id: runLower, panelId: panelLower });
    const erasedKeys = new Set([JSON.stringify([panelLower, 1, runLower, "SY-B01", 1])]);
    const store = [
      {
        id: uuid(803),
        status: "complete" as const,
        promptId: uuid(201),
        promptRevision: 1,
        supersedesId: null,
        captureContext: context({
          panelId: panelLower.toUpperCase(),
          slot: { round: 1, questionId: "SY-B01" },
          brandRunId: runLower.toUpperCase(),
          instructions: { questionText: brandText, extraInstruction: null, priorMessages: 0 },
        }),
      },
    ];
    const [r] = resolveStoredCaptures(store, [brandLower], [run], erasedKeys);
    expect(r.outcome).toBe("protocol_deviant");
    expect(r.deviations).toContain("erased_duplicate_slot");
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

describe("weekly discovery schedule at lock and resolve (spec §§5.1 Frequency, 5.2 Time, 5.3)", () => {
  const cap = (round: number, over: Partial<CaptureContext> = {}) => ({
    id: `r${round}`,
    status: "complete" as const,
    promptId: uuid(101),
    promptRevision: 1,
    supersedesId: null,
    captureContext: context({ slot: { round, questionId: "SY-D01" }, ...over }),
  });
  it("locks only a discovery panel with a valid PROSPECTIVE weekly schedule", () => {
    // The fixture schedule (four weekly Stockholm slots after the 2026-09-01 approval) locks.
    expect(lockedPanelSchema.safeParse(discoveryPanel()).success).toBe(true);
    // No schedule cannot lock (a NEW discovery lock requires one).
    expect(lockedPanelSchema.safeParse(discoveryPanel({ schedule: null })).success).toBe(false);
    // A slot BEFORE the approval is not prospective (owner approves the schedule before running it).
    const backdated = {
      timezone: "Europe/Stockholm" as const,
      slots: [
        { round: 1, intendedAt: "2026-08-25T07:00:00.000Z" }, // before the 2026-09-01 approval
        { round: 2, intendedAt: "2026-09-01T07:00:00.000Z" },
        { round: 3, intendedAt: "2026-09-08T07:00:00.000Z" },
        { round: 4, intendedAt: "2026-09-15T07:00:00.000Z" },
      ],
    };
    expect(lockedPanelSchema.safeParse(discoveryPanel({ schedule: backdated })).success).toBe(
      false,
    );
    // Four SAME-DAY slots (all round 1's instant) can never be a four-week schedule.
    const sameDay = {
      timezone: "Europe/Stockholm" as const,
      slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: slotInstant(1) })),
    };
    expect(lockedPanelSchema.safeParse(discoveryPanel({ schedule: sameDay })).success).toBe(false);
  });
  it("refuses a locked BRAND panel carrying a weekly schedule; an unscheduled brand locks", () => {
    expect(
      lockedPanelSchema.safeParse({ ...brandPanel(), schedule: discoverySchedule }).success,
    ).toBe(false);
    expect(lockedPanelSchema.safeParse(brandPanel()).success).toBe(true);
  });
  it("resolves four DISTINCT weekly rounds as complete (a genuine four-week schedule)", () => {
    const resolved = resolveStoredCaptures(
      [cap(1), cap(2), cap(3), cap(4)],
      [discoveryPanel()],
      [],
    );
    expect(resolved.map((r) => r.outcome)).toEqual([
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
    expect(resolved.every((r) => r.deviations.length === 0)).toBe(true);
  });
  it("never lets four SAME-DAY captures pass as four weekly rounds", () => {
    // Rounds 2-4 all claim round 1's intended slot (same day). Only round 1 matches its weekly slot;
    // the others are off-schedule → protocol_deviant, never a clean weekly observation.
    const resolved = resolveStoredCaptures(
      [1, 2, 3, 4].map((round) => cap(round, { time: slotTime(1) })),
      [discoveryPanel()],
      [],
    );
    const byId = Object.fromEntries(resolved.map((r) => [r.answerId, r]));
    expect(byId.r1.outcome).toBe("complete"); // round 1 is on its own weekly slot
    for (const round of [2, 3, 4]) {
      expect(byId[`r${round}`].outcome).toBe("protocol_deviant");
      expect(byId[`r${round}`].deviations).toContain("intended_slot_mismatch");
    }
  });
  it("demotes a capture whose recorded delay is untruthful, and one before its slot", () => {
    const untruthful = resolveStoredCaptures(
      [
        cap(1, {
          time: {
            capturedAt: "2026-09-07T08:00:00.000Z",
            intendedSlotAt: slotInstant(1),
            delayMinutes: 0,
          },
        }),
      ],
      [discoveryPanel()],
      [],
    )[0];
    expect(untruthful.outcome).toBe("protocol_deviant");
    expect(untruthful.deviations).toContain("delay_untruthful");
    const beforeSlot = resolveStoredCaptures(
      [
        cap(1, {
          time: {
            capturedAt: "2026-09-06T08:00:00.000Z",
            intendedSlotAt: slotInstant(1),
            delayMinutes: 0,
          },
        }),
      ],
      [discoveryPanel()],
      [],
    )[0];
    expect(beforeSlot.deviations).toContain("delay_untruthful");
  });
  it("keeps a capture against a historical no-schedule panel inspectable but never complete", () => {
    const [r] = resolveStoredCaptures([cap(1)], [discoveryPanel({ schedule: null })], []);
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("discovery_schedule_missing");
  });
  it("matches a timezone-equivalent intended-slot spelling (same instant) as on-schedule", () => {
    // 09:00+02:00 is the same instant as 07:00Z, so a capture spelling its intended slot with the local
    // offset still lands on the owner-approved weekly slot and stays complete.
    const [r] = resolveStoredCaptures(
      [
        cap(1, {
          time: {
            capturedAt: "2026-09-07T09:00:00.000+02:00",
            intendedSlotAt: "2026-09-07T09:00:00.000+02:00",
            delayMinutes: 0,
          },
        }),
      ],
      [discoveryPanel()],
      [],
    );
    expect(r).toMatchObject({ outcome: "complete" });
    expect(r.deviations).toEqual([]);
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
      extraAttemptsByVersion: {},
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
  it("surfaces additional erased attempts at one slot as erasedExtra without double-counting coverage", () => {
    // Two historical originals erased at ONE discovery slot: the resolver collapses them to a single
    // erased slot (so planned coverage is counted once), and the EXACT SQL aggregate reports the extra
    // attempt via extraAttemptsByVersion. The extra attempt is neither hidden nor a new planned slot.
    const key = `${uuid(1)}:1`;
    const report = citationReport(discoveryPanel(), [], {
      slots: [es()], // one distinct erased slot (SY-D01 r1)
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: { [key]: true },
      extraAttemptsByVersion: { [key]: 1 }, // one additional erased attempt at an already-recorded slot
    });
    expect(report).toMatchObject({
      observed: 0,
      erased: 1, // distinct slot — planned coverage counted exactly once
      erasedExtra: 1, // the duplicate/extra historical practice, surfaced not silently dropped
      recorded: 1,
      neverObserved: 39, // 40 planned − 0 observed − 1 erased; the extra attempt is not a planned slot
      excluded: 0, // extra attempts are reported as erasedExtra, not folded into excluded
    });
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
        extraAttemptsByVersion: {},
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
        extraAttemptsByVersion: {},
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
        extraAttemptsByVersion: {},
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
      extraAttemptsByVersion: {},
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
      extraAttemptsByVersion: {},
    });
    expect(complete).toMatchObject({ coverageComplete: true, neverObserved: 38 });
    // Same inputs but coverage flagged incomplete (the read LIMIT truncated this version's tombstones):
    // neverObserved must be null — never derived from partial data — while erased stays a floor.
    const incomplete = citationReport(discoveryPanel(), liveComplete(), {
      slots: [es({ answerId: uuid(701), questionId: "SY-D02", round: 1 })],
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: { [key]: false },
      extraAttemptsByVersion: {},
    });
    expect(incomplete).toMatchObject({
      coverageComplete: false,
      neverObserved: null,
      observed: 1,
      erased: 1,
    });
  });
});

describe("citation report keys per-version erasure metadata by CANONICAL uuid (uppercase panel document)", () => {
  // A panel DOCUMENT keeps the client's original panelId spelling (uppercase is a valid uuid), while the
  // SQL producer of the per-version erasure metadata keys it by the CANONICAL (lowercase) panel_id column.
  // citationReport must derive the same version key via `panelVersionKey`/`canonicalUuid`, or an uppercase
  // panel silently drops its excluded/extra counts and defaults coverage `true` — a false definitive
  // `neverObserved`. All-digit uuid(n) fixtures cannot exercise case, so use a letter-bearing id.
  const UP = "0000ABCD-0000-4000-8000-000000000001"; // stored panel-document id (client spelling)
  const LO = "0000abcd-0000-4000-8000-000000000001"; // the SAME uuid as a canonical DB column value
  const key = `${LO}:1`; // exactly what the server producer emits from the lowercase panel_id column
  const erasedSlot = (over: Partial<ErasedSlot> = {}): ErasedSlot => ({
    answerId: uuid(701),
    panelId: LO, // erased-slot facts come from uuid columns → canonical lowercase
    panelVersion: 1,
    brandRunId: null,
    questionId: "SY-D01",
    round: 1,
    panelResolved: true,
    brandRunResolved: null,
    ...over,
  });
  it("attributes excluded (malformed) and erasedExtra (duplicate) to the uppercase panel; coverage complete", () => {
    const report = citationReport(discoveryPanel({ panelId: UP }), [], {
      slots: [erasedSlot()], // one distinct erased grid slot (SY-D01 r1)
      consumedByRun: {},
      excludedByVersion: { [key]: 2 }, // two malformed (non-grid) historical tombstones
      coverageCompleteByVersion: { [key]: true },
      extraAttemptsByVersion: { [key]: 1 }, // one additional erased attempt at an already-recorded slot
    });
    // Pre-fix the uppercase document key missed all three lowercase-keyed maps → excluded 0, erasedExtra 0
    // and coverage defaulting true. The canonical version key must resolve all three for the uppercase panel.
    expect(report).toMatchObject({
      panelId: UP, // the report echoes the immutable document id verbatim
      panelVersion: 1,
      observed: 0,
      erased: 1, // one distinct erased slot — planned coverage counted once
      erasedExtra: 1, // the duplicate/extra historical practice, surfaced not dropped
      excluded: 2, // the malformed tombstones, surfaced
      coverageComplete: true,
      neverObserved: 39, // 40 planned − 0 observed − 1 erased; the extra attempt is not a planned slot
    });
  });
  it("reads coverageComplete=false for the uppercase panel so neverObserved is null (no false definitive)", () => {
    const report = citationReport(discoveryPanel({ panelId: UP }), [], {
      slots: [erasedSlot()], // an erased floor exists but the read LIMIT truncated this version's rows
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion: { [key]: false },
      extraAttemptsByVersion: {},
    });
    // Pre-fix the uppercase key missed the lowercase coverage key and defaulted true → a definitive
    // neverObserved = 39. With the canonical key the incomplete coverage is read and neverObserved is null.
    expect(report).toMatchObject({
      panelId: UP,
      coverageComplete: false,
      neverObserved: null,
      observed: 0,
      erased: 1, // still a floor
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
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { answers: [], panels: [], brandRuns: [] }, error: null });
    // `answers` is REQUIRED (a payload omitting it fails the read — see the masquerade regression below);
    // the content-free erasure fields stay optional-with-default (absent → empty sets).
    expect(await readCitationProtocol(scope, rpc)).toEqual({
      answers: [],
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
  it("accepts a lock whose owner receipt is the SAME uuid spelled differently (case), still rejects a different owner", async () => {
    // Server-minted approvedBy is canonical lowercase; the caller's ownerId here is UPPERCASE — one uuid.
    const ownerLower = "0000abcd-0000-4000-8000-0000000000f1";
    const upperScope = { ownerId: ownerLower.toUpperCase(), projectId: "p" };
    const rpc = vi.fn().mockResolvedValue({
      data: discoveryPanel({
        approval: { approvedBy: ownerLower, approvedAt: "2026-09-01T00:00:00Z" },
      }),
      error: null,
    });
    expect(await lockCitationPanel(upperScope, uuid(1), 1, rpc)).toMatchObject({
      status: "locked",
    });
    // A genuinely different owner still fails closed.
    await expect(
      lockCitationPanel(
        upperScope,
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
  it("accepts a brand-run approval whose owner receipt is the same uuid spelled differently (case)", async () => {
    const ownerLower = "0000abcd-0000-4000-8000-0000000000f2";
    const upperScope = { ownerId: ownerLower.toUpperCase(), projectId: "p" };
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: brandRun({ approvedBy: ownerLower }), error: null });
    const approval: BrandRunApproval = {
      runId: uuid(50),
      panelId: uuid(2),
      panelVersion: 1,
      observationBudget: 5,
      rounds: 1,
    };
    expect((await approveBrandRun(upperScope, approval, rpc)).approvedBy).toBe(ownerLower);
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
  // Single-snapshot helpers: read_citation_protocol now returns the answer-evidence rows alongside the
  // panels/runs/tombstones from ONE snapshot, so readResolvedCaptures makes exactly ONE RPC call and no
  // capture/consumption can straddle two snapshot boundaries. `answers` mirror the row shape that
  // read_ai_answer_evidence and read_citation_protocol emit (document merged with id/createdAt/hash).
  const analysisFixture = {
    algorithm: "literal-mention-supplied-citations-v1" as const,
    verified: false as const,
    mention: null,
    ownCitation: null,
    citations: [] as { url: string; kind: "own" | "competitor" | "third-party" }[],
    cohort: "[]",
  };
  const answerRow = (id: string, over: Partial<AnswerEvidence> = {}) => ({
    id,
    createdAt: "2026-09-08T10:00:00Z",
    hash: `h-${id}`,
    input: answer(over),
    prompt: promptRow,
    analysis: analysisFixture,
  });
  const dTomb = (answerId: string) => ({
    answerId,
    panelId: uuid(1),
    panelVersion: 1,
    brandRunId: null,
    questionId: "SY-D01",
    round: 1,
  });
  const snapshotRpc = (answers: unknown[], tombstones: unknown[] = []) =>
    vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_citation_protocol"
            ? { answers, panels: [discoveryPanel()], brandRuns: [], tombstones }
            : (() => {
                throw new Error(`unexpected RPC ${name}`);
              })(),
        error: null,
      }),
    );
  it("reads the whole report from a SINGLE database snapshot (one RPC), never a second evidence read", async () => {
    // A capture and (would-be) consumption come from ONE payload, so consumed budget can never be
    // exposed without its evidence row via a second snapshot. Exactly one RPC is issued.
    const rpc = snapshotRpc([answerRow(uuid(500))]);
    const result = await readResolvedCaptures(scope, rpc);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["read_citation_protocol"]);
    expect(result.captures[0]).toMatchObject({
      answerId: uuid(500),
      panelResolved: true,
      outcome: "complete",
    });
  });
  it("reads an empty report from a single snapshot (one RPC)", async () => {
    const rpc = snapshotRpc([]);
    const result = await readResolvedCaptures(scope, rpc);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["read_citation_protocol"]);
    expect(result.panels).toEqual([discoveryPanel()]);
    expect(result.brandRuns).toEqual([]);
    expect(result.captures).toEqual([]);
    expect(result.erasedSlots).toEqual([]);
    expect(result.reports).toEqual([
      {
        panelId: discoveryPanel().panelId,
        panelVersion: 1,
        kind: "discovery",
        planned: 40,
        observed: 0,
        erased: 0,
        erasedExtra: 0,
        recorded: 0,
        neverObserved: 40,
        coverageComplete: true,
        excluded: 0,
        outcomes: { complete: 0, failed: 0, truncated: 0, missed: 0, protocol_deviant: 0 },
        brandRuns: [],
      },
    ]);
    expect(result.erasureOverflow).toBe(0);
  });
  it("fails a snapshot that reports consumed budget but omits answers (no empty-evidence masquerade)", async () => {
    // The observation payload is REQUIRED in the canonical snapshot. A payload that carries a nonzero
    // consumed budget yet OMITS `answers` (a wrong RPC or an older candidate version) must FAIL the read
    // loudly — never parse to an empty evidence set that would present consumed budget as "zero observed
    // / never-observed", defeating the atomic-report guarantee. `runConsumed` here is well-formed and
    // nonzero, so the ONLY reason the read fails is the missing observation payload.
    const missingAnswers = vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_citation_protocol"
            ? {
                panels: [discoveryPanel()],
                brandRuns: [],
                runConsumed: [{ runId: uuid(50), consumed: 2 }],
              }
            : (() => {
                throw new Error(`unexpected RPC ${name}`);
              })(),
        error: null,
      }),
    );
    await expect(readResolvedCaptures(scope, missingAnswers)).rejects.toThrow();
    // A genuinely empty snapshot (answers explicitly present as []) is still valid — empty, not failed.
    await expect(readResolvedCaptures(scope, snapshotRpc([]))).resolves.toMatchObject({
      captures: [],
    });
  });
  it("reads a deleted chain as an erased slot in a single snapshot (the erased original is absent; no stale positive)", async () => {
    // In one consistent snapshot a tombstoned original's chain is already deleted, so `answers` does not
    // contain it. It reads as an erased slot, never a live/positive one, and returns no stale content.
    const rpc = snapshotRpc([], [dTomb(uuid(500))]);
    const result = await readResolvedCaptures(scope, rpc);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["read_citation_protocol"]);
    expect(result.captures).toEqual([]);
    expect(result.erasedSlots.map((s) => s.answerId)).toEqual([uuid(500)]);
    expect(result.reports[0]).toMatchObject({ observed: 0, erased: 1 });
  });
  it("preserves an independent survivor sharing a slot with an erased original, flagged (single snapshot)", async () => {
    // Consistent post-erase state in ONE snapshot: original A is deleted (absent from `answers`), its
    // tombstone remains, and an independent original B still lives at the same slot. B must be preserved
    // AND flagged as ambiguous duplicate history — never silently turned into an erased-only slot.
    const rpc = snapshotRpc([answerRow(uuid(501))], [dTomb(uuid(500))]);
    const result = await readResolvedCaptures(scope, rpc);
    expect(result.captures.map((c) => c.answerId)).toEqual([uuid(501)]);
    expect(result.captures[0].outcome).toBe("protocol_deviant");
    expect(result.captures[0].deviations).toContain("erased_duplicate_slot");
  });
  it("preserves a surviving sibling's correction chain leaf sharing a slot with an erased original", async () => {
    // B and its correction B' live; the independent original A is deleted (absent) with its tombstone.
    // B's ACTIVE LEAF (B', whose id is not its root) is preserved and flagged, never dropped.
    const rpc = snapshotRpc(
      [
        answerRow(uuid(501)),
        answerRow(uuid(502), { supersedesId: uuid(501), rawAnswer: "B corrected" }),
      ],
      [dTomb(uuid(500))],
    );
    const result = await readResolvedCaptures(scope, rpc);
    expect(result.captures.map((c) => c.answerId)).toEqual([uuid(502)]);
    expect(result.captures[0].deviations).toContain("erased_duplicate_slot");
  });
});
