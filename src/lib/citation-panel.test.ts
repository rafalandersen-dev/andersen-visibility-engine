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
        { status: "complete" },
        context(1, 1, { session: { ...context(1, 1).session, freshSession: false } }),
      ),
    ).toBe("protocol_deviant");
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
    expect(slotOutcome(p, { status: "failed" }, context(1, 2))).toBe("failed");
    expect(slotOutcome(p, { status: "truncated" }, context(1, 3))).toBe("truncated");
    expect(slotOutcome(p, null, null)).toBe("missed");
    expect(captureContextSchema.parse(context(2, 4)).slot.round).toBe(2);
  });
});
const captured = (
  questionId: string,
  round: number,
  over: Partial<ReviewedCapture> = {},
): ReviewedCapture & { capturedAt: string } => ({
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
    const none = comparablePairs(p, caps, rounds, ["2026-09-28T10:00:00Z"]);
    expect(none.comparable).toBe(false);
    expect(none.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "two_verified_improvements_required",
    );
    const ready = comparablePairs(p, caps, rounds, [
      "2026-09-28T10:00:00Z",
      "2026-10-01T10:00:00Z",
    ]);
    expect(ready.pairs.map((pair) => pair.questionId)).toEqual(["SY-D01"]);
    expect(ready.missing).toEqual(
      expect.arrayContaining([
        { questionId: "SY-D02", reason: "follow_up_not_eligible" },
        { questionId: "SY-D03", reason: "baseline_not_eligible" },
      ]),
    );
    expect(ready.missing).toHaveLength(9);
    const early = comparablePairs(p, caps, rounds, [
      "2026-10-06T10:00:00Z",
      "2026-10-07T10:00:00Z",
    ]);
    expect(early.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "follow_up_before_both_improvements",
    );
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
  });
});
