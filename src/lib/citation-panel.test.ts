import { describe, expect, it } from "vitest";
import {
  brandRunSchema,
  captureContextSchema,
  comparablePairs,
  panelCounts,
  panelProtocolSchema,
  plannedSlots,
  protocolDeviations,
  slotOutcome,
  type CaptureContext,
  type PanelProtocol,
  type ReviewedCapture,
  type ScopedCapture,
  type ScopedFinding,
} from "./citation-panel";
import {
  accuracySchema,
  factAt,
  findingPriority,
  findingSchema,
  improvementSchema,
  isCompetitorOnlyCitationGap,
  isVerifiedImprovement,
  passageAfterAnswer,
  recommendationSchema,
  sourceSupportSchema,
  verifiedImprovementCount,
  type Finding,
  type Improvement,
} from "./citation-finding";
/** Fixtures only. The question texts are synthetic placeholders, not the owner-reviewed
 * Appendix A panel; nothing here is a collected observation (spec §12 CI11-T13…T31, T36…T38). */
const owner = "00000000-0000-4000-8000-000000000001";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const review = { reviewer: owner, reviewedAt: "2026-09-21T10:00:00Z" };
const question = (n: number, series: "D" | "B" = "D") => ({
  id: `SY-${series}${String(n).padStart(2, "0")}`,
  promptId: uuid(100 + n),
  promptRevision: 1,
  text: `FIXTURE fråga ${series}${n}`,
  language: "sv",
});
const panel = (): PanelProtocol => ({
  panelId: uuid(1),
  version: 1,
  kind: "discovery",
  client: { name: "FIXTURE client", market: "Sweden — Malmö/Limhamn" },
  questionLanguage: "sv",
  surface: {
    service: "ChatGPT",
    interface: "consumer web app",
    mode: "search",
    searchMode: "Search",
    modelLabel: null,
    webSearchEvidenced: "evidenced",
  },
  session: {
    freshSession: true,
    personalisation: "non_personalised",
    signedIn: "signed_in",
    memory: "off",
    customInstructions: "none",
    connectedTools: "none",
    extraInstruction: null,
    priorMessages: 0,
  },
  questions: Array.from({ length: 10 }, (_, i) => question(i + 1)),
  rounds: 4,
  status: "locked",
  approval: { approvedBy: owner, approvedAt: "2026-09-15T08:00:00Z" },
});
/** A minimal answer record bound to panel question n (its prompt id is uuid(100 + n)). */
const answerFor = (n: number, status: "complete" | "failed" | "truncated" = "complete") => ({
  status,
  promptId: uuid(100 + n),
  promptRevision: 1,
});
const context = (round: number, n: number, over: Partial<CaptureContext> = {}): CaptureContext => ({
  panelId: uuid(1),
  panelVersion: 1,
  slot: { round, questionId: `SY-D${String(n).padStart(2, "0")}` },
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
    collectionCity: null,
    devicePermission: "denied",
    vpn: false,
  },
  language: { prompt: "sv", interface: "en", answer: "sv" },
  surface: {
    service: "ChatGPT",
    interface: "consumer web app",
    mode: "search",
    searchMode: "Search",
    modelLabel: null,
    webSearchEvidenced: "evidenced",
  },
  time: {
    capturedAt: `2026-09-${String(14 + round * 7).padStart(2, "0")}T09:00:00Z`,
    intendedSlotAt: `2026-09-${String(14 + round * 7).padStart(2, "0")}T09:00:00Z`,
    delayMinutes: 0,
  },
  instructions: { questionText: `FIXTURE fråga D${n}`, extraInstruction: null, priorMessages: 0 },
  capture: { screenshotRef: null, missingReason: null },
  deviationNotes: [],
  ...over,
});
describe("panel protocol and planned observations (CI11-T13, T14)", () => {
  it("plans exactly forty discovery slots and includes the fourth-round re-test", () => {
    const slots = plannedSlots(panelProtocolSchema.parse(panel()));
    expect(slots).toHaveLength(40);
    expect(slots.filter((s) => s.round === 4)).toHaveLength(10);
    expect(new Set(slots.map((s) => `${s.round}:${s.questionId}`)).size).toBe(40);
  });
  it("keeps the brand panel unscheduled, separate and never pooled with discovery", () => {
    const brand = panelProtocolSchema.parse({
      ...panel(),
      panelId: uuid(2),
      kind: "brand",
      rounds: 0,
      questions: Array.from({ length: 5 }, (_, i) => question(i + 1, "B")),
    });
    expect(plannedSlots(brand)).toEqual([]);
    expect(() => panelProtocolSchema.parse({ ...brand, rounds: 4 })).toThrow(/unscheduled/);
    expect(() =>
      panelProtocolSchema.parse({
        ...panel(),
        questions: [...panel().questions.slice(0, 9), question(1, "B")],
      }),
    ).toThrow(/D-series/);
    expect(() =>
      panelProtocolSchema.parse({
        ...panel(),
        questions: Array.from({ length: 11 }, (_, i) => question(i + 1)),
      }),
    ).toThrow();
    const run = brandRunSchema.parse({
      panelId: uuid(2),
      panelVersion: 1,
      approvedBy: owner,
      approvedAt: "2026-09-15T08:00:00Z",
      observationBudget: 5,
      rounds: 1,
    });
    expect(run.observationBudget).toBe(5);
    // Counts refuse to mix: a brand capture on a discovery panel is a deviation.
    expect(protocolDeviations(panel(), context(1, 1, { brandRunId: uuid(3) }))).toContain(
      "brand_run_on_discovery",
    );
  });
  it("refuses locking without owner approval, translated questions and extra protocol instructions", () => {
    expect(() => panelProtocolSchema.parse({ ...panel(), approval: null })).toThrow(
      /owner approval/,
    );
    expect(() =>
      panelProtocolSchema.parse({
        ...panel(),
        questions: [{ ...question(1), language: "pl" }, ...panel().questions.slice(1)],
      }),
    ).toThrow(/reading aids/);
    expect(() =>
      panelProtocolSchema.parse({
        ...panel(),
        session: { ...panel().session, extraInstruction: "Cite sources" },
      }),
    ).toThrow();
    expect(panelProtocolSchema.parse({ ...panel(), status: "draft", approval: null }).status).toBe(
      "draft",
    );
  });
});
describe("session protocol deviations and slot outcomes (CI11-T15, T16, T31)", () => {
  it("keeps a draft available for planning without accepting it as an approved capture protocol", () => {
    const draft = { ...panel(), status: "draft" as const, approval: null };
    expect(plannedSlots(draft)).toHaveLength(40);
    expect(protocolDeviations(draft, context(1, 1))).toContain("panel_not_approved");
    expect(slotOutcome(draft, answerFor(1), context(1, 1))).toBe("protocol_deviant");
  });
  it("binds the answer's prompt id and revision to the panel slot's versioned question", () => {
    const p = panel();
    // A clean, matching answer resolves to its own status.
    expect(slotOutcome(p, answerFor(1), context(1, 1))).toBe("complete");
    // A different prompt id for the same slot is a different question, never this baseline.
    expect(slotOutcome(p, { ...answerFor(1), promptId: uuid(999) }, context(1, 1))).toBe(
      "protocol_deviant",
    );
    // A different revision of the same prompt is a different approved version, not the slot's.
    expect(slotOutcome(p, { ...answerFor(1), promptRevision: 2 }, context(1, 1))).toBe(
      "protocol_deviant",
    );
    // An answer bound to another question cannot stand in for this slot even with status complete.
    expect(slotOutcome(p, answerFor(2), context(1, 1))).toBe("protocol_deviant");
  });
  it("marks a personalised or continued conversation as a deviation, not a baseline", () => {
    const p = panel();
    expect(protocolDeviations(p, context(1, 1))).toEqual([]);
    expect(
      protocolDeviations(
        p,
        context(1, 1, { session: { ...context(1, 1).session, personalisation: "personalised" } }),
      ),
    ).toContain("personalisation_differs");
    expect(
      protocolDeviations(
        p,
        context(1, 1, {
          instructions: {
            questionText: "FIXTURE fråga D1",
            extraInstruction: null,
            priorMessages: 3,
          },
        }),
      ),
    ).toContain("prior_messages");
    expect(
      protocolDeviations(
        p,
        context(1, 1, {
          instructions: {
            questionText: "FIXTURE fråga D1",
            extraInstruction: "Nämn Synergy",
            priorMessages: 0,
          },
        }),
      ),
    ).toContain("extra_instruction");
    expect(
      slotOutcome(
        p,
        answerFor(1),
        context(1, 1, { session: { ...context(1, 1).session, freshSession: false } }),
      ),
    ).toBe("protocol_deviant");
  });
  it("breaks methodology on a known model-label change or a web-search-evidence change", () => {
    const p = panel();
    const withSurface = (over: Partial<CaptureContext["surface"]>) =>
      context(1, 1, { surface: { ...context(1, 1).surface, ...over } });
    // The clean capture matches the locked model (unpinned null) and evidence expectation.
    expect(protocolDeviations(p, context(1, 1))).toEqual([]);
    // A model label recorded where the methodology pins none is a change.
    expect(protocolDeviations(p, withSurface({ modelLabel: "gpt-x-2026-09" }))).toContain(
      "model_label_differs",
    );
    // A pinned model matches only its exact label; a different known model breaks.
    const pinned = { ...p, surface: { ...p.surface, modelLabel: "gpt-x-2026-09" } };
    expect(protocolDeviations(pinned, withSurface({ modelLabel: "gpt-x-2026-09" }))).not.toContain(
      "model_label_differs",
    );
    expect(protocolDeviations(pinned, withSurface({ modelLabel: "gpt-y-2026-10" }))).toContain(
      "model_label_differs",
    );
    // Losing a pinned model (capture records none) is also a break.
    expect(protocolDeviations(pinned, withSurface({ modelLabel: null }))).toContain(
      "model_label_differs",
    );
    // An unknown or negative web-search state never satisfies a locked "evidenced" expectation.
    expect(protocolDeviations(p, withSurface({ webSearchEvidenced: "unknown" }))).toContain(
      "web_search_evidence_differs",
    );
    expect(protocolDeviations(p, withSurface({ webSearchEvidenced: "not_evidenced" }))).toContain(
      "web_search_evidence_differs",
    );
    // slotOutcome downgrades any such methodology change to a protocol-deviant slot.
    expect(slotOutcome(p, answerFor(1), withSurface({ webSearchEvidenced: "unknown" }))).toBe(
      "protocol_deviant",
    );
  });
  it("flags surface, mode, language and question-text changes as breaks", () => {
    const p = panel();
    expect(
      protocolDeviations(
        p,
        context(1, 1, { surface: { ...context(1, 1).surface, searchMode: null } }),
      ),
    ).toContain("surface_or_mode_differs");
    expect(
      protocolDeviations(
        p,
        context(1, 1, { language: { prompt: "en", interface: "en", answer: null } }),
      ),
    ).toContain("prompt_language_differs");
    expect(
      protocolDeviations(
        p,
        context(1, 1, {
          instructions: {
            questionText: "Different wording",
            extraInstruction: null,
            priorMessages: 0,
          },
        }),
      ),
    ).toContain("question_text_changed");
    expect(
      protocolDeviations(p, context(1, 1, { deviationNotes: ["VPN switched on mid-session"] })),
    ).toEqual(["noted:VPN switched on mid-session"]);
  });
  it("keeps failed and truncated attempts and reports missing slots as missed", () => {
    const p = panel();
    expect(slotOutcome(p, answerFor(2, "failed"), context(1, 2))).toBe("failed");
    expect(slotOutcome(p, answerFor(3, "truncated"), context(1, 3))).toBe("truncated");
    expect(slotOutcome(p, null, null)).toBe("missed");
    expect(captureContextSchema.parse(context(2, 4)).slot.round).toBe(2);
  });
  it("rejects a different panel, version or round and each locked session difference", () => {
    const p = panel();
    expect(protocolDeviations(p, context(1, 1, { panelId: uuid(9) }))).toContain("panel_mismatch");
    expect(protocolDeviations(p, context(1, 1, { panelVersion: 2 }))).toContain(
      "panel_version_differs",
    );
    // Round 9 is outside the locked four discovery rounds.
    expect(protocolDeviations(p, context(9, 1))).toContain("round_out_of_panel");
    const sessionOf = (over: Partial<CaptureContext["session"]>) =>
      protocolDeviations(p, context(1, 1, { session: { ...context(1, 1).session, ...over } }));
    expect(sessionOf({ signedIn: "signed_out" })).toContain("signed_in_differs");
    expect(sessionOf({ memory: "on" })).toContain("memory_differs");
    expect(sessionOf({ customInstructions: "present" })).toContain("custom_instructions_differ");
    expect(sessionOf({ connectedTools: "present" })).toContain("connected_tools_differ");
    // An unknown-where-locked session state is also not the approved protocol.
    expect(sessionOf({ signedIn: "unknown" })).toContain("signed_in_differs");
    // The clean fixture still deviates in none of these ways.
    expect(protocolDeviations(p, context(1, 1))).toEqual([]);
  });
});
const fixtureClient = { name: "FIXTURE client", market: "Sweden — Malmö/Limhamn" };
/** Deterministic capture identity per slot, so baseline captures can be referenced by id. */
const captureUuid = (questionId: string, round: number) =>
  uuid(300 + round * 20 + Number(questionId.slice(-2)));
const captured = (
  questionId: string,
  round: number,
  over: Partial<ScopedCapture> = {},
): ScopedCapture => ({
  captureId: captureUuid(questionId, round),
  panelId: uuid(1),
  panelVersion: 1,
  client: fixtureClient,
  questionId,
  round,
  outcome: "complete",
  citationsComplete: true,
  ownCitation: false,
  mention: false,
  recommended: false,
  capturedAt: `2026-${round === 4 ? "10-05" : "09-14"}T09:00:00Z`,
  ...over,
});
/** A finding recorded for this panel and client (the scope an improvement resolves against). */
const scopedFinding = (id: number, over: Partial<ScopedFinding> = {}): ScopedFinding => ({
  findingId: uuid(id),
  panelId: uuid(1),
  panelVersion: 1,
  client: fixtureClient,
  ...over,
});
type ImprovementOverrides = {
  findingIds?: string[];
  taskId?: string;
  approvedVersion?: string;
  destination?: Improvement["destination"];
  baselineCaptureIds?: string[];
};
/** A destination-verified improvement for the comparable-pair gate. Defaults to one substantive
 * change (task uuid(81), pricing URL, v1) grounded in the round-1 SY-D01 baseline capture. */
const verifiedImprovement = (
  id: number,
  verifiedAt: string,
  over: ImprovementOverrides = {},
): Improvement =>
  improvementSchema.parse({
    improvementId: uuid(id),
    findingIds: over.findingIds ?? [uuid(60)],
    taskId: over.taskId ?? uuid(81),
    change: {
      description: "FIXTURE change",
      approvedVersion: over.approvedVersion ?? "v1",
      approvedBy: owner,
      approvedAt: "2026-09-20T10:00:00Z",
    },
    destination: over.destination ?? { kind: "public_url", reference: "https://example.test/priser" },
    baselineCaptureIds: over.baselineCaptureIds ?? [captureUuid("SY-D01", 1)],
    verification: {
      method: "owner_inspection",
      receipt: "FIXTURE receipt",
      verifiedAt,
      reviewer: owner,
    },
  });
/** A second, substantively distinct verified change (different task, destination and version). */
const secondChange = (id: number, verifiedAt: string, over: ImprovementOverrides = {}): Improvement =>
  verifiedImprovement(id, verifiedAt, {
    taskId: uuid(82),
    approvedVersion: "v2",
    destination: { kind: "listing", reference: "listing://example/synergy" },
    findingIds: [uuid(61)],
    ...over,
  });
/** Findings both default changes resolve against. */
const scopedFindings = [scopedFinding(60), scopedFinding(61)];
describe("descriptive counts and comparable pairs (CI11-T19, T20, T21, T38)", () => {
  it("counts eligible captures with explicit denominators and keeps unknowns out", () => {
    const p = panel();
    const counts = panelCounts(p, [
      captured("SY-D01", 1, { ownCitation: true, mention: true }),
      captured("SY-D02", 1),
      captured("SY-D03", 1, { citationsComplete: false, ownCitation: null }),
      captured("SY-D04", 1, {
        outcome: "truncated",
        ownCitation: null,
        mention: null,
        recommended: null,
        partialPositiveCitation: true,
      }),
      captured("SY-D05", 1, {
        outcome: "protocol_deviant",
        ownCitation: null,
        mention: null,
        recommended: null,
      }),
      captured("SY-D06", 1, { ownCitation: null, mention: null, recommended: null }),
    ]);
    expect(counts.planned).toBe(40);
    expect(counts.ownCitation).toEqual({ present: 1, eligible: 2, partialPositive: 1 });
    expect(counts.mention).toEqual({ present: 1, eligible: 3 });
    expect(counts.outcomes.truncated).toBe(1);
    expect(counts.outcomes.protocol_deviant).toBe(1);
    expect(counts.unreviewed).toBe(1);
  });
  it("forms comparable pairs only after two verified improvements and lists every missing pair", () => {
    const p = panel();
    const rounds = { baseline: 1, followUp: 4 };
    const caps = [
      captured("SY-D01", 1),
      captured("SY-D01", 4, { ownCitation: true }),
      captured("SY-D02", 1),
      captured("SY-D02", 4, { citationsComplete: false, ownCitation: null }),
      captured("SY-D03", 4),
    ];
    const none = comparablePairs(
      p,
      { captures: caps, findings: scopedFindings, improvements: [verifiedImprovement(90, "2026-09-28T10:00:00Z")] },
      rounds,
    );
    expect(none.comparable).toBe(false);
    expect(none.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "two_verified_improvements_required",
    );
    const ready = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          secondChange(91, "2026-10-01T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(ready.pairs.map((pair) => pair.questionId)).toEqual(["SY-D01"]);
    expect(ready.missing).toEqual(
      expect.arrayContaining([
        { questionId: "SY-D02", reason: "follow_up_not_eligible" },
        { questionId: "SY-D03", reason: "baseline_not_eligible" },
      ]),
    );
    expect(ready.missing).toHaveLength(9);
    const early = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-10-06T10:00:00Z"),
          secondChange(91, "2026-10-07T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(early.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "follow_up_before_both_improvements",
    );
  });
  it("refuses duplicate improvements, self-pairing rounds and malformed follow-up chronology", () => {
    const p = panel();
    const rounds = { baseline: 1, followUp: 4 };
    const caps = [captured("SY-D01", 1), captured("SY-D01", 4, { ownCitation: true })];
    // Two copies of one improvement are not two distinct verified changes.
    const dup = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          verifiedImprovement(90, "2026-10-01T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(dup.comparable).toBe(false);
    expect(dup.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "two_verified_improvements_required",
    );
    // A round is never compared with itself.
    const self = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          secondChange(91, "2026-10-01T10:00:00Z"),
        ],
      },
      { baseline: 4, followUp: 4 },
    );
    expect(self.comparable).toBe(false);
    expect(self.missing.every((m) => m.reason === "baseline_and_follow_up_same_round")).toBe(true);
    // A malformed follow-up timestamp cannot be ordered against the gate, so no pair is claimed.
    const badCaps = [captured("SY-D01", 1), captured("SY-D01", 4, { ownCitation: true })];
    badCaps[1] = { ...badCaps[1], capturedAt: "not-a-real-date" };
    const bad = comparablePairs(
      p,
      {
        captures: badCaps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          secondChange(91, "2026-10-01T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(bad.comparable).toBe(false);
    expect(bad.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "capture_timestamp_invalid",
    );
  });
  it("refuses duplicate, out-of-panel and out-of-range captures rather than inflate denominators", () => {
    const p = panel();
    expect(() =>
      panelCounts(p, [captured("SY-D01", 1), captured("SY-D01", 1, { ownCitation: true })]),
    ).toThrow(/duplicate/);
    expect(() => panelCounts(p, [captured("SY-B01", 1)])).toThrow(/not in this/);
    expect(() => panelCounts(p, [captured("SY-D01", 9)])).toThrow(/outside the panel/);
  });
  it("rejects ambiguous follow-up evidence without relying on a prior counts call", () => {
    const improvements = [
      verifiedImprovement(90, "2026-09-28T10:00:00Z"),
      secondChange(91, "2026-10-01T10:00:00Z"),
    ];
    expect(() =>
      comparablePairs(
        panel(),
        {
          captures: [
            captured("SY-D01", 1),
            captured("SY-D01", 4, { ownCitation: true }),
            captured("SY-D01", 4, { ownCitation: false }),
          ],
          findings: scopedFindings,
          improvements,
        },
        { baseline: 1, followUp: 4 },
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      comparablePairs(
        panel(),
        {
          captures: [captured("SY-D01", 1), { ...captured("SY-D01", 4), round: 9 }],
          findings: scopedFindings,
          improvements,
        },
        { baseline: 1, followUp: 9 },
      ),
    ).toThrow(/outside the panel/);
  });
  it.each([0, 1.5, 9, NaN, Infinity])("refuses an invalid comparison round %s", (round) => {
    const result = comparablePairs(
      panel(),
      { captures: [], findings: [], improvements: [] },
      { baseline: 1, followUp: round },
    );
    expect(result.comparable).toBe(false);
    expect(result.missing.every((item) => item.reason === "comparison_rounds_invalid")).toBe(true);
  });
  it("does not claim a discovery retest for an unapproved panel or a brand diagnostic", () => {
    const improvements = [
      verifiedImprovement(90, "2026-09-28T10:00:00Z"),
      secondChange(91, "2026-10-01T10:00:00Z"),
    ];
    const draft = { ...panel(), status: "draft" as const, approval: null };
    const result = comparablePairs(
      draft,
      {
        captures: [captured("SY-D01", 1), captured("SY-D01", 4)],
        findings: scopedFindings,
        improvements,
      },
      { baseline: 1, followUp: 4 },
    );
    expect(result.comparable).toBe(false);
    expect(result.missing.every((item) => item.reason === "panel_not_approved")).toBe(true);
    const brand = { ...panel(), kind: "brand" as const, rounds: 0, questions: [question(1, "B")] };
    expect(
      comparablePairs(brand, { captures: [], findings: [], improvements: [] }, { baseline: 1, followUp: 2 }),
    ).toMatchObject({
      comparable: false,
      missing: [{ questionId: "SY-B01", reason: "discovery_panel_required" }],
    });
  });
  it("accepts two substantively distinct panel-bound changes and rejects a cloned change", () => {
    const p = panel();
    const rounds = { baseline: 1, followUp: 4 };
    const caps = [captured("SY-D01", 1), captured("SY-D01", 4, { ownCitation: true })];
    // Two genuinely distinct changes (different task, destination and version) prove the retest.
    const two = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          secondChange(91, "2026-10-01T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(two.comparable).toBe(true);
    expect(two.pairs.map((x) => x.questionId)).toEqual(["SY-D01"]);
    // The same substantive change re-keyed with a fresh improvement id is still one change.
    const cloned = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          verifiedImprovement(91, "2026-10-01T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(cloned.comparable).toBe(false);
    expect(cloned.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "two_verified_improvements_required",
    );
    // Sharing only the destination and version (different task, fresh id) is also one change.
    const sameDestination = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          verifiedImprovement(91, "2026-10-01T10:00:00Z", { taskId: uuid(83) }),
        ],
      },
      rounds,
    );
    expect(sameDestination.comparable).toBe(false);
  });
  it("counts a verified change only after the actual baseline it improves on", () => {
    const p = panel();
    const rounds = { baseline: 1, followUp: 4 };
    const caps = [captured("SY-D01", 1), captured("SY-D01", 4, { ownCitation: true })];
    const evidence = (baselineOfNinety: string) => ({
      captures: caps,
      findings: scopedFindings,
      improvements: [
        verifiedImprovement(90, "2026-09-28T10:00:00Z", { baselineCaptureIds: [baselineOfNinety] }),
        secondChange(91, "2026-10-01T10:00:00Z"),
      ],
    });
    // 90 is verified 2026-09-28 but its baseline is the round-4 capture (2026-10-05): dropped,
    // leaving one distinct change, so the retest is not proven.
    const dropped = comparablePairs(p, evidence(captureUuid("SY-D01", 4)), rounds);
    expect(dropped.comparable).toBe(false);
    expect(dropped.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "two_verified_improvements_required",
    );
    // With 90's baseline the round-1 capture (2026-09-14), it is verified after its baseline.
    const kept = comparablePairs(p, evidence(captureUuid("SY-D01", 1)), rounds);
    expect(kept.comparable).toBe(true);
  });
  it("rejects evidence bound to another panel or client, missing records and duplicate aliases", () => {
    const p = panel();
    const rounds = { baseline: 1, followUp: 4 };
    const caps = [captured("SY-D01", 1), captured("SY-D01", 4, { ownCitation: true })];
    const distinct = [
      verifiedImprovement(90, "2026-09-28T10:00:00Z"),
      secondChange(91, "2026-10-01T10:00:00Z"),
    ];
    // A capture asserting another panel id is not this panel's evidence.
    expect(() =>
      comparablePairs(
        p,
        {
          captures: [...caps, captured("SY-D02", 1, { panelId: uuid(2) })],
          findings: scopedFindings,
          improvements: distinct,
        },
        rounds,
      ),
    ).toThrow(/another panel or client/);
    // A capture asserting another client is likewise out of scope.
    expect(() =>
      comparablePairs(
        p,
        {
          captures: [
            ...caps,
            captured("SY-D02", 1, { client: { name: "OTHER", market: "elsewhere" } }),
          ],
          findings: scopedFindings,
          improvements: distinct,
        },
        rounds,
      ),
    ).toThrow(/another panel or client/);
    // A finding recorded for another panel cannot ground this panel's improvement.
    expect(() =>
      comparablePairs(
        p,
        {
          captures: caps,
          findings: [scopedFinding(60, { panelId: uuid(2) }), scopedFinding(61)],
          improvements: distinct,
        },
        rounds,
      ),
    ).toThrow(/another panel or client/);
    // A baseline capture id with no matching record is rejected.
    expect(() =>
      comparablePairs(
        p,
        {
          captures: caps,
          findings: scopedFindings,
          improvements: [
            verifiedImprovement(90, "2026-09-28T10:00:00Z", {
              baselineCaptureIds: [captureUuid("SY-D07", 1)],
            }),
            secondChange(91, "2026-10-01T10:00:00Z"),
          ],
        },
        rounds,
      ),
    ).toThrow(/baseline capture .* not recorded/);
    // A finding id with no matching record is rejected.
    expect(() =>
      comparablePairs(
        p,
        {
          captures: caps,
          findings: scopedFindings,
          improvements: [
            verifiedImprovement(90, "2026-09-28T10:00:00Z", { findingIds: [uuid(62)] }),
            secondChange(91, "2026-10-01T10:00:00Z"),
          ],
        },
        rounds,
      ),
    ).toThrow(/finding .* not recorded/);
    // A duplicated baseline alias inside one improvement is rejected.
    expect(() =>
      comparablePairs(
        p,
        {
          captures: caps,
          findings: scopedFindings,
          improvements: [
            verifiedImprovement(90, "2026-09-28T10:00:00Z", {
              baselineCaptureIds: [captureUuid("SY-D01", 1), captureUuid("SY-D01", 1)],
            }),
          ],
        },
        rounds,
      ),
    ).toThrow(/duplicates a baseline capture id/);
  });
});
const support = (over: Partial<Parameters<typeof sourceSupportSchema.parse>[0] & object> = {}) => ({
  claimSpan: "60 minuters massage kostar 700 kr",
  citedUrl: "https://example.test/priser",
  answerCapturedAt: "2026-09-14T09:00:00Z",
  status: "supports" as const,
  sourcePassage: "60 min 700 kr",
  sourceCapturedAt: "2026-09-14T09:30:00Z",
  reason: null,
  review,
  ...over,
});
const facts = [
  {
    factId: uuid(50),
    kind: "price" as const,
    value: "60 min 700 SEK",
    confirmedBy: owner,
    confirmedAt: "2026-09-10T10:00:00Z",
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2026-09-20T00:00:00Z",
  },
  {
    factId: uuid(51),
    kind: "price" as const,
    value: "60 min 750 SEK",
    confirmedBy: owner,
    confirmedAt: "2026-09-20T10:00:00Z",
    validFrom: "2026-09-20T00:00:00Z",
    validUntil: null,
  },
];
const finding = (over: Partial<Finding> = {}): Finding => ({
  findingId: uuid(60),
  family: "citation_source",
  evidence: [{ kind: "answer", id: uuid(70) }],
  entityMatch: "confirmed",
  capture: { answerComplete: true, citationsComplete: true },
  observation: "Competitor page cited; own site absent.",
  hypothesis: null,
  competitorCited: true,
  ownCited: false,
  recommendation: null,
  support: [],
  accuracy: [],
  priority: { harm: "medium", relevance: "high", fixability: "medium" },
  decision: "accepted",
  review,
  secondReview: null,
  linkedTaskId: null,
  ...over,
});
describe("attribution, support and accuracy (CI11-T22…T29)", () => {
  it("keeps attribution as not checked until a passage with its date and reviewer is recorded", () => {
    const unchecked = sourceSupportSchema.parse(
      support({
        status: "not_checked",
        sourcePassage: null,
        sourceCapturedAt: null,
        review: null,
        reason: "source behind login",
      }),
    );
    expect(unchecked.status).toBe("not_checked");
    expect(() => sourceSupportSchema.parse(support({ status: "not_checked" }))).toThrow(
      /no passage/,
    );
    expect(() => sourceSupportSchema.parse(support({ sourcePassage: null }))).toThrow(/passage/);
    expect(() => sourceSupportSchema.parse(support({ review: null }))).toThrow(/reviewer/);
    expect(passageAfterAnswer(sourceSupportSchema.parse(support()))).toBe(true);
  });
  it("keeps support and factual truth separate and judges accuracy at capture time", () => {
    expect(factAt(facts, "price", "2026-09-14T09:00:00Z")?.value).toBe("60 min 700 SEK");
    expect(factAt(facts, "price", "2026-09-25T09:00:00Z")?.value).toBe("60 min 750 SEK");
    expect(factAt(facts, "hours", "2026-09-14T09:00:00Z")).toBeNull();
    const assessed = accuracySchema.parse({
      claimSpan: "60 minuters massage kostar 700 kr",
      factKind: "price",
      status: "accurate_at_capture",
      factId: uuid(50),
      review,
    });
    expect(assessed.status).toBe("accurate_at_capture");
    expect(() => accuracySchema.parse({ ...assessed, factId: null })).toThrow(/dated fact/);
    // A supporting source and a now-outdated fact coexist without overwriting each other.
    const f = finding({
      family: "recommendation_accuracy",
      competitorCited: null,
      ownCited: null,
      support: [support()],
      accuracy: [{ ...assessed, status: "outdated_now" }],
    });
    expect(findingSchema.parse(f).support[0].status).toBe("supports");
    expect(findingSchema.parse(f).accuracy[0].status).toBe("outdated_now");
  });
  it("treats recommendation, mention and citation as independent observations", () => {
    const recommended = recommendationSchema.parse({
      status: "recommended",
      passage: "Boka hos FIXTURE via bokningssidan",
      target: "booking listing",
      suitability: "fits",
      review,
    });
    const viaListing = findingSchema.parse(
      finding({
        family: "recommendation_accuracy",
        competitorCited: false,
        ownCited: false,
        recommendation: recommended,
      }),
    );
    expect(viaListing.recommendation?.status).toBe("recommended");
    expect(viaListing.ownCited).toBe(false);
    expect(isCompetitorOnlyCitationGap(viaListing)).toBe(false);
    expect(() => recommendationSchema.parse({ ...recommended, passage: null })).toThrow(/passage/);
    const competitorRecommended = findingSchema.parse(
      finding({
        family: "recommendation_accuracy",
        ownCited: true,
        competitorCited: false,
        recommendation: { ...recommended, target: "FIXTURE competitor" },
      }),
    );
    expect(competitorRecommended.ownCited).toBe(true);
    expect(isCompetitorOnlyCitationGap(competitorRecommended)).toBe(false);
  });
  it("requires a complete answer and citation list for negatives and a confirmed entity for acceptance", () => {
    expect(isCompetitorOnlyCitationGap(findingSchema.parse(finding()))).toBe(true);
    expect(() =>
      findingSchema.parse(finding({ capture: { answerComplete: true, citationsComplete: false } })),
    ).toThrow(/complete citation list/);
    expect(() =>
      findingSchema.parse(
        finding({
          family: "recommendation_accuracy",
          ownCited: null,
          competitorCited: null,
          capture: { answerComplete: false, citationsComplete: false },
          recommendation: {
            status: "not_present",
            passage: null,
            target: null,
            suitability: "unknown",
            review,
          },
        }),
      ),
    ).toThrow(/complete answer/);
    expect(() => findingSchema.parse(finding({ entityMatch: "ambiguous" }))).toThrow(
      /confirmed entity/,
    );
    expect(
      findingSchema.parse(finding({ entityMatch: "ambiguous", decision: "needs_second_review" }))
        .decision,
    ).toBe("needs_second_review");
    expect(() =>
      findingSchema.parse(
        finding({ family: "recommendation_accuracy", ownCited: null, competitorCited: null }),
      ),
    ).toThrow(/recommendation state/);
  });
  it("derives priority from harm, relevance and fixability equally for both families", () => {
    expect(findingPriority(finding())).toBe("medium");
    expect(
      findingPriority(
        finding({
          family: "recommendation_accuracy",
          priority: { harm: "high", relevance: "high", fixability: "medium" },
        }),
      ),
    ).toBe("high");
    expect(
      findingPriority(finding({ priority: { harm: "low", relevance: "low", fixability: "high" } })),
    ).toBe("low");
  });
});
describe("verified improvements (CI11-T36)", () => {
  const improvement = (over: Partial<Improvement> = {}): Improvement => ({
    improvementId: uuid(80),
    findingIds: [uuid(60)],
    taskId: uuid(81),
    change: {
      description: "Correct the 60-minute price on the pricing page",
      approvedVersion: "v7",
      approvedBy: owner,
      approvedAt: "2026-09-25T10:00:00Z",
    },
    destination: { kind: "public_url", reference: "https://example.test/priser" },
    baselineCaptureIds: [uuid(70)],
    verification: null,
    ...over,
  });
  it("counts only destination-verified changes, not drafts or acknowledgements", () => {
    const draft = improvementSchema.parse(improvement());
    const verified = improvementSchema.parse(
      improvement({
        improvementId: uuid(82),
        verification: {
          method: "owner_inspection",
          receipt: "Owner inspected the live page",
          verifiedAt: "2026-09-26T10:00:00Z",
          reviewer: owner,
        },
      }),
    );
    const stale = improvementSchema.parse(
      improvement({
        improvementId: uuid(83),
        verification: {
          method: "publication_receipt",
          receipt: "receipt-1",
          verifiedAt: "2026-09-20T10:00:00Z",
          reviewer: owner,
        },
      }),
    );
    expect(isVerifiedImprovement(draft)).toBe(false);
    expect(isVerifiedImprovement(verified)).toBe(true);
    expect(isVerifiedImprovement(stale)).toBe(false);
    expect(verifiedImprovementCount([draft, verified, stale])).toBe(1);
    // Two copies of one verified improvement are a single distinct change, never two.
    expect(verifiedImprovementCount([verified, structuredClone(verified)])).toBe(1);
    // A clone with a fresh improvement id but the same task, destination and version is still one
    // substantive change; a fresh UUID cannot manufacture a second.
    const clone = improvementSchema.parse(
      improvement({
        improvementId: uuid(84),
        verification: {
          method: "index_inspection",
          receipt: "Indexed copy inspected",
          verifiedAt: "2026-09-27T10:00:00Z",
          reviewer: owner,
        },
      }),
    );
    expect(verifiedImprovementCount([verified, clone])).toBe(1);
    // Sharing only the destination and approved version (different task) is also one change.
    expect(
      verifiedImprovementCount([verified, improvementSchema.parse(improvement({ improvementId: uuid(85), taskId: uuid(88), verification: verified.verification }))]),
    ).toBe(1);
    // Two genuinely distinct verified changes (different task, destination and version) count two.
    const second = improvementSchema.parse(
      improvement({
        improvementId: uuid(86),
        taskId: uuid(89),
        change: {
          description: "Add the booking listing",
          approvedVersion: "v8",
          approvedBy: owner,
          approvedAt: "2026-09-25T10:00:00Z",
        },
        destination: { kind: "listing", reference: "listing://example/synergy" },
        verification: {
          method: "index_inspection",
          receipt: "Indexed copy inspected",
          verifiedAt: "2026-09-27T10:00:00Z",
          reviewer: owner,
        },
      }),
    );
    expect(verifiedImprovementCount([verified, second])).toBe(2);
  });
  it("requires baseline captures for a verified improvement but allows a draft without them", () => {
    // An unverified draft may be recorded before its baseline evidence is assembled.
    const draftWithoutBaseline = improvementSchema.parse(improvement({ baselineCaptureIds: [] }));
    expect(isVerifiedImprovement(draftWithoutBaseline)).toBe(false);
    const liveVerification = {
      method: "owner_inspection" as const,
      receipt: "Owner inspected the live page",
      verifiedAt: "2026-09-26T10:00:00Z",
      reviewer: owner,
    };
    // A verified record with no baseline captures has no before/after evidence: the schema
    // refuses it.
    expect(() =>
      improvementSchema.parse(improvement({ baselineCaptureIds: [], verification: liveVerification })),
    ).toThrow(/baseline captures/);
    // And even bypassing the schema, the predicate does not treat it as a verified improvement.
    expect(
      isVerifiedImprovement(improvement({ baselineCaptureIds: [], verification: liveVerification })),
    ).toBe(false);
  });
});
