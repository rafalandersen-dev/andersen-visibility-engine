import { describe, expect, it } from "vitest";
import {
  brandRunSchema,
  captureContextSchema,
  comparablePairs,
  discoveryScheduleDeviations,
  discoveryScheduleValid,
  panelCounts,
  panelProtocolSchema,
  plannedSlots,
  protocolDeviations,
  slotOutcome,
  type BrandRun,
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
  type LiveVerifiedImprovement,
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
  // The locked interface language matches the clean capture context() below ("en"); a capture on a
  // different interface language deviates.
  interfaceLanguage: "en",
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
  // The locked collection location matches the clean capture context() below: Sweden, no pinned
  // city, device location denied, no VPN. A capture that diverges on any of these is a deviation.
  collection: { country: "Sweden", city: null, devicePermission: "denied", vpn: false },
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
describe("weekly discovery schedule policy (spec §§5.1 Frequency, 5.2 Time, 5.3)", () => {
  // 09:00 Europe/Stockholm (CEST, 07:00Z) one week apart. Prospective vs approval is a lock concern
  // (tested in citation-protocol.test.ts); these cases exercise cadence and per-capture deviations only.
  const wk = (round: number) =>
    `2026-09-${String(7 + (round - 1) * 7).padStart(2, "0")}T07:00:00.000Z`;
  const scheduled = () =>
    panelProtocolSchema.parse({
      ...panel(),
      schedule: {
        timezone: "Europe/Stockholm",
        slots: [1, 2, 3, 4].map((round) => ({ round, intendedAt: wk(round) })),
      },
    });
  const capAt = (
    round: number,
    capturedAt: string,
    intendedSlotAt: string,
    delayMinutes: number | null,
  ) => context(round, 1, { time: { capturedAt, intendedSlotAt, delayMinutes } });
  it("accepts a valid four-week Stockholm schedule and rejects same-day/wrong-cadence/short ones", () => {
    expect(discoveryScheduleValid(scheduled())).toBe(true);
    const withSchedule = (slots: Array<{ round: number; intendedAt: string }>) =>
      panelProtocolSchema.parse({
        ...panel(),
        schedule: { timezone: "Europe/Stockholm", slots },
      });
    // Four SAME-DAY slots are never four weekly rounds.
    expect(
      discoveryScheduleValid(
        withSchedule([1, 2, 3, 4].map((round) => ({ round, intendedAt: wk(1) }))),
      ),
    ).toBe(false);
    // A six-day gap is not once-weekly.
    expect(
      discoveryScheduleValid(
        withSchedule([
          { round: 1, intendedAt: wk(1) },
          { round: 2, intendedAt: "2026-09-13T07:00:00.000Z" },
          { round: 3, intendedAt: wk(3) },
          { round: 4, intendedAt: wk(4) },
        ]),
      ),
    ).toBe(false);
    // Wrong slot count (3 for a 4-round panel), and a missing schedule, are both invalid for discovery.
    expect(
      discoveryScheduleValid(
        withSchedule([1, 2, 3].map((round) => ({ round, intendedAt: wk(round) }))),
      ),
    ).toBe(false);
    expect(discoveryScheduleValid(panel())).toBe(false);
  });
  it("keeps the weekly cadence correct across a DST transition (Stockholm wall clock)", () => {
    // DST ends 2026-10-25: 09:00 local is CEST (07:00Z) on Oct 18 and CET (08:00Z) on Oct 25 — one
    // Stockholm week apart at the same local time. A naive fixed-168h slot would be 08:00 local, rejected.
    const twoRound = { ...panel(), rounds: 2 };
    const dst = (round2Z: string) =>
      panelProtocolSchema.parse({
        ...twoRound,
        schedule: {
          timezone: "Europe/Stockholm",
          slots: [
            { round: 1, intendedAt: "2026-10-18T07:00:00.000Z" },
            { round: 2, intendedAt: round2Z },
          ],
        },
      });
    expect(discoveryScheduleValid(dst("2026-10-25T08:00:00.000Z"))).toBe(true); // 09:00 local, +7 days
    expect(discoveryScheduleValid(dst("2026-10-25T07:00:00.000Z"))).toBe(false); // 168h later = 08:00 local
  });
  it("flags per-capture schedule deviations and passes a truthful on-slot capture", () => {
    const p = scheduled();
    // On its round's slot with a truthful delay → no schedule deviation.
    expect(discoveryScheduleDeviations(p, capAt(1, "2026-09-07T08:00:00.000Z", wk(1), 60))).toEqual(
      [],
    );
    // An equivalent-offset spelling of the same instant still matches (09:00+02:00 == 07:00Z).
    expect(
      discoveryScheduleDeviations(
        p,
        capAt(1, "2026-09-07T09:00:00.000+02:00", "2026-09-07T09:00:00.000+02:00", 0),
      ),
    ).toEqual([]);
    // A missing schedule (historical panel) → not an eligible clean baseline.
    expect(discoveryScheduleDeviations(panel(), capAt(1, wk(1), wk(1), 0))).toEqual([
      "discovery_schedule_missing",
    ]);
    // An off-schedule intended slot (a second same-day "round 2") → mismatch.
    expect(
      discoveryScheduleDeviations(p, capAt(2, "2026-09-07T09:00:00.000Z", wk(1), 120)),
    ).toEqual(["intended_slot_mismatch"]);
    // An untruthful delay (claims 0 but ran 60 min late), or a run before its slot, is a deviation.
    expect(discoveryScheduleDeviations(p, capAt(1, "2026-09-07T08:00:00.000Z", wk(1), 0))).toEqual([
      "delay_untruthful",
    ]);
    expect(discoveryScheduleDeviations(p, capAt(1, "2026-09-06T08:00:00.000Z", wk(1), 0))).toEqual([
      "delay_untruthful",
    ]);
    // A run that slipped into the next week's slot overruns this round's window.
    expect(discoveryScheduleDeviations(p, capAt(1, wk(2), wk(1), 10080))).toEqual([
      "capture_window_overrun",
    ]);
    // Brand captures are unscheduled → no schedule deviations.
    const brand = panelProtocolSchema.parse({
      ...panel(),
      panelId: uuid(2),
      kind: "brand",
      rounds: 0,
      schedule: null,
      questions: Array.from({ length: 5 }, (_, i) => question(i + 1, "B")),
    });
    expect(
      discoveryScheduleDeviations(
        brand,
        context(1, 1, { slot: { round: 1, questionId: "SY-B01" } }),
      ),
    ).toEqual([]);
  });
  it("bounds the LAST round's window by one Stockholm wall-clock week across autumn DST (not fixed 168h)", () => {
    // Round 4 sits on 2026-10-18 (09:00 CEST, 07:00Z); DST ends 2026-10-25, so one Stockholm week later
    // is 2026-10-25 09:00 CET = 08:00Z — an hour past a naive 168h (07:00Z). A round-4 run at 07:30Z on
    // Oct 25 (08:30 local) is still within the week; a naive 168h window would wrongly flag it.
    const autumn = panelProtocolSchema.parse({
      ...panel(),
      schedule: {
        timezone: "Europe/Stockholm",
        slots: [
          { round: 1, intendedAt: "2026-09-27T07:00:00.000Z" },
          { round: 2, intendedAt: "2026-10-04T07:00:00.000Z" },
          { round: 3, intendedAt: "2026-10-11T07:00:00.000Z" },
          { round: 4, intendedAt: "2026-10-18T07:00:00.000Z" },
        ],
      },
    });
    const r4 = (
      p: PanelProtocol,
      capturedAt: string,
      intendedSlotAt: string,
      delayMinutes: number,
    ) =>
      discoveryScheduleDeviations(
        p,
        context(4, 1, { time: { capturedAt, intendedSlotAt, delayMinutes } }),
      );
    expect(r4(autumn, "2026-10-25T07:30:00.000Z", "2026-10-18T07:00:00.000Z", 10110)).toEqual([]);
    expect(r4(autumn, "2026-10-25T08:00:00.000Z", "2026-10-18T07:00:00.000Z", 10140)).toEqual([
      "capture_window_overrun",
    ]);
    // Spring: round 4 on 2026-03-22 (09:00 CET, 08:00Z); DST starts 2026-03-29, so one Stockholm week
    // later is 2026-03-29 09:00 CEST = 07:00Z — an hour BEFORE a naive 168h (08:00Z). A run at 07:00Z is
    // already the next week (overrun); one at 06:30Z is still within.
    const spring = panelProtocolSchema.parse({
      ...panel(),
      schedule: {
        timezone: "Europe/Stockholm",
        slots: [
          { round: 1, intendedAt: "2026-03-01T08:00:00.000Z" },
          { round: 2, intendedAt: "2026-03-08T08:00:00.000Z" },
          { round: 3, intendedAt: "2026-03-15T08:00:00.000Z" },
          { round: 4, intendedAt: "2026-03-22T08:00:00.000Z" },
        ],
      },
    });
    expect(r4(spring, "2026-03-29T06:30:00.000Z", "2026-03-22T08:00:00.000Z", 9990)).toEqual([]);
    expect(r4(spring, "2026-03-29T07:00:00.000Z", "2026-03-22T08:00:00.000Z", 10020)).toEqual([
      "capture_window_overrun",
    ]);
  });
  it("compares fractional seconds to the millisecond and refuses sub-millisecond precision", () => {
    const withSchedule = (slots: Array<{ round: number; intendedAt: string }>) =>
      panelProtocolSchema.parse({ ...panel(), schedule: { timezone: "Europe/Stockholm", slots } });
    const at = (round: number, frac: string) =>
      `2026-09-${String(7 * round).padStart(2, "0")}T07:00:00.${frac}`;
    // Same fractional second across all rounds (.500) is a consistent weekly cadence → valid.
    expect(
      discoveryScheduleValid(
        withSchedule([1, 2, 3, 4].map((r) => ({ round: r, intendedAt: at(r, "500Z") }))),
      ),
    ).toBe(true);
    // Differing fractional seconds (round 2 at .500, others .000) is a real MILLISECOND-level cadence
    // difference — pre-fix the whole-second wall clock dropped the fraction and wrongly accepted it; now
    // rejected, matching the SQL lock's full-precision comparison.
    expect(
      discoveryScheduleValid(
        withSchedule([
          { round: 1, intendedAt: at(1, "000Z") },
          { round: 2, intendedAt: at(2, "500Z") },
          { round: 3, intendedAt: at(3, "000Z") },
          { round: 4, intendedAt: at(4, "000Z") },
        ]),
      ),
    ).toBe(false);
    // Sub-millisecond (microsecond) precision is the unsupported precision → invalid (fail closed), even
    // when consistent across rounds — so a .000001 variant cannot slip past.
    expect(
      discoveryScheduleValid(
        withSchedule([1, 2, 3, 4].map((r) => ({ round: r, intendedAt: at(r, "000001Z") }))),
      ),
    ).toBe(false);
  });
  it("keeps fractional-second precision through equivalent offsets and the DST last-round window", () => {
    // Equivalent offsets: 09:00:00.500+02:00 == 07:00:00.500Z (same instant, same fraction) — an on-slot
    // capture spelling its intended slot with the local offset still matches its round's slot.
    const p = panelProtocolSchema.parse({
      ...panel(),
      schedule: {
        timezone: "Europe/Stockholm",
        slots: [1, 2, 3, 4].map((r) => ({
          round: r,
          intendedAt: `2026-09-${String(7 * r).padStart(2, "0")}T07:00:00.500Z`,
        })),
      },
    });
    expect(
      discoveryScheduleDeviations(
        p,
        context(1, 1, {
          time: {
            capturedAt: "2026-09-07T07:00:00.500Z",
            intendedSlotAt: "2026-09-07T09:00:00.500+02:00",
            delayMinutes: 0,
          },
        }),
      ),
    ).toEqual([]);
    // DST last-round window with a fraction: round 4 at .500 near the autumn transition; the window ends
    // one Stockholm wall-clock week later at the SAME fraction (2026-10-25T08:00:00.500Z, CET) — neither
    // shifted (a fixed 168h would give 07:00:00.500Z) nor stripped of its .500 millisecond.
    const autumn = panelProtocolSchema.parse({
      ...panel(),
      schedule: {
        timezone: "Europe/Stockholm",
        slots: [
          { round: 1, intendedAt: "2026-09-27T07:00:00.500Z" },
          { round: 2, intendedAt: "2026-10-04T07:00:00.500Z" },
          { round: 3, intendedAt: "2026-10-11T07:00:00.500Z" },
          { round: 4, intendedAt: "2026-10-18T07:00:00.500Z" },
        ],
      },
    });
    const r4 = (capturedAt: string, delayMinutes: number) =>
      discoveryScheduleDeviations(
        autumn,
        context(4, 1, {
          time: { capturedAt, intendedSlotAt: "2026-10-18T07:00:00.500Z", delayMinutes },
        }),
      );
    // One minute before the wall-clock week boundary (08:00:00.500Z) → still within the round's week.
    expect(r4("2026-10-25T07:59:00.500Z", 10139)).toEqual([]);
    // Exactly at the boundary (same .500 fraction) → the next week → overrun.
    expect(r4("2026-10-25T08:00:00.500Z", 10140)).toEqual(["capture_window_overrun"]);
  });
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
      id: uuid(500),
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
  it("records a bounded, optional ACTUAL account tier label on the panel and capture sessions (spec §5.2), backward compatible", () => {
    // Historical documents WITHOUT the field still parse (treated as not-known); no prior tier is invented.
    expect(panelProtocolSchema.safeParse(panel()).success).toBe(true);
    expect(captureContextSchema.safeParse(context(1, 1)).success).toBe(true);
    // The ACTUAL tier label is kept (no fixed provider list): Free/Plus/Pro and the "unknown" sentinel are
    // all accepted on both sessions — so Plus and Pro are distinguishable, not collapsed to "paid".
    for (const tier of ["Free", "Plus", "Pro", "Enterprise", "unknown"] as const) {
      expect(
        panelProtocolSchema.safeParse({
          ...panel(),
          session: { ...panel().session, accountTier: tier },
        }).success,
      ).toBe(true);
      expect(
        captureContextSchema.safeParse(
          context(1, 1, { session: { ...context(1, 1).session, accountTier: tier } }),
        ).success,
      ).toBe(true);
    }
    // Invalid bounds are refused on both sessions: blank/whitespace-only and oversized (>40) labels. The
    // bounded label constrains SYNTAX only (short, non-blank, control-free) and, by intended-use
    // instruction, records only the tier — not secrets, account ids or emails; no secret detection is
    // implied. (A valid label is exercised by the acceptance loop above; a control character is refused by
    // the explicit case below.)
    for (const bad of ["", " ".repeat(3), "x".repeat(41), "y".repeat(50)]) {
      expect(
        panelProtocolSchema.safeParse({
          ...panel(),
          session: { ...panel().session, accountTier: bad },
        }).success,
      ).toBe(false);
      expect(
        captureContextSchema.safeParse(
          context(1, 1, { session: { ...context(1, 1).session, accountTier: bad } }),
        ).success,
      ).toBe(false);
    }
    // A control character is explicitly refused on both sessions (invalid bounds). The bounded label
    // enforces syntax only; it does not detect or prevent secrets/account ids — that is an intended-use
    // rule, not a mechanism.
    const ctl = `Pro${String.fromCharCode(7)}`;
    expect(
      panelProtocolSchema.safeParse({
        ...panel(),
        session: { ...panel().session, accountTier: ctl },
      }).success,
    ).toBe(false);
    expect(
      captureContextSchema.safeParse(
        context(1, 1, { session: { ...context(1, 1).session, accountTier: ctl } }),
      ).success,
    ).toBe(false);
  });
  it("compares the ACTUAL account tier only when BOTH sides record a KNOWN tier (spec §5.2)", () => {
    const p = panel();
    const withTier = (panelTier?: string, captureTier?: string) =>
      protocolDeviations(
        {
          ...p,
          session: { ...p.session, ...(panelTier !== undefined ? { accountTier: panelTier } : {}) },
        },
        context(1, 1, {
          session: {
            ...context(1, 1).session,
            ...(captureTier !== undefined ? { accountTier: captureTier } : {}),
          },
        }),
      );
    // Two DIFFERENT known tiers that are both "paid" (Plus vs Pro) are NOT comparable — the coarse
    // free/paid class would have missed this; the exact label catches it.
    expect(withTier("Plus", "Pro")).toContain("account_tier_differs");
    expect(withTier("Free", "Plus")).toContain("account_tier_differs");
    // The SAME known label is comparable → no deviation.
    expect(withTier("Plus", "Plus")).not.toContain("account_tier_differs");
    // Not-known on EITHER side — historical (absent) or the explicit "unknown" — never fabricates a
    // deviation or invents account metadata.
    expect(withTier(undefined, undefined)).not.toContain("account_tier_differs");
    expect(withTier("Pro", undefined)).not.toContain("account_tier_differs");
    expect(withTier(undefined, "Pro")).not.toContain("account_tier_differs");
    expect(withTier("Pro", "unknown")).not.toContain("account_tier_differs");
    expect(withTier("unknown", "Pro")).not.toContain("account_tier_differs");
  });
  it("binds the collection location to the approved methodology and breaks on a known change (4053596302)", () => {
    const p = panel();
    const locOf = (over: Partial<CaptureContext["location"]>) =>
      protocolDeviations(p, context(1, 1, { location: { ...context(1, 1).location, ...over } }));
    // The clean capture matches the locked collection location (Sweden, no city, device denied,
    // no VPN) and deviates in none of the location dimensions.
    expect(protocolDeviations(p, context(1, 1))).toEqual([]);
    // A known collection-country change is a different collection context, not this baseline.
    expect(locOf({ collectionCountry: "Norway" })).toContain("collection_country_differs");
    // Unknown (null) where the methodology pins a definite country is never invented into a match.
    expect(locOf({ collectionCountry: null })).toContain("collection_country_differs");
    // A city recorded where the methodology pins none is a change; unpinned means "not recorded".
    expect(locOf({ collectionCity: "Malmö" })).toContain("collection_city_differs");
    // A device-location permission change breaks; unknown never satisfies the locked "denied".
    expect(locOf({ devicePermission: "granted" })).toContain("device_location_differs");
    expect(locOf({ devicePermission: "unknown" })).toContain("device_location_differs");
    // A VPN toggled from the locked "off" state — or unknown where a definite state is pinned —
    // is a collection-context change.
    expect(locOf({ vpn: true })).toContain("vpn_differs");
    expect(locOf({ vpn: null })).toContain("vpn_differs");
    // The location in the question is part of the question, not the collection context: changing
    // it alone raises no collection deviation here.
    expect(locOf({ inQuestion: "Malmö" })).toEqual([]);
    // A complete answer collected under a changed location is a protocol-deviant slot, never an
    // eligible complete capture.
    expect(
      slotOutcome(
        p,
        answerFor(1),
        context(1, 1, { location: { ...context(1, 1).location, vpn: true } }),
      ),
    ).toBe("protocol_deviant");
  });
  it("locks the interface language and breaks on a differing or unknown-recorded interface (4053687914)", () => {
    const p = panel();
    const langOf = (over: Partial<CaptureContext["language"]>) =>
      protocolDeviations(p, context(1, 1, { language: { ...context(1, 1).language, ...over } }));
    // The clean capture is collected on the locked interface language ("en") and does not deviate.
    expect(protocolDeviations(p, context(1, 1))).toEqual([]);
    // A capture on a different interface language is a methodology deviation.
    expect(langOf({ interface: "sv" })).toContain("interface_language_differs");
    // An interface language recorded as unknown is never invented into the locked expectation.
    expect(langOf({ interface: "unknown" })).toContain("interface_language_differs");
    // The prompt- and interface-language locks are independent: changing one does not raise the
    // other's deviation.
    expect(langOf({ prompt: "en" })).not.toContain("interface_language_differs");
    expect(langOf({ interface: "sv" })).not.toContain("prompt_language_differs");
    // A complete answer collected on a different interface language is a protocol-deviant slot.
    expect(
      slotOutcome(
        p,
        answerFor(1),
        context(1, 1, { language: { prompt: "sv", interface: "sv", answer: "sv" } }),
      ),
    ).toBe("protocol_deviant");
  });
  it("preserves an actual failure or truncation instead of masking it as protocol_deviant (4053596298)", () => {
    const p = panel();
    const deviant = context(1, 1, { session: { ...context(1, 1).session, freshSession: false } });
    // A failed attempt collected under a deviant protocol is still reported as failed — the
    // quality outcome is not under-reported as a mere methodology deviation.
    expect(slotOutcome(p, answerFor(1, "failed"), deviant)).toBe("failed");
    // A truncated attempt bound to the wrong prompt is still reported as truncated, not hidden.
    expect(
      slotOutcome(p, { ...answerFor(1, "truncated"), promptId: uuid(999) }, context(1, 1)),
    ).toBe("truncated");
    expect(slotOutcome(p, { ...answerFor(1, "failed"), promptRevision: 2 }, context(1, 1))).toBe(
      "failed",
    );
    // A COMPLETE answer under a deviant protocol, or bound to the wrong prompt, must NOT become
    // eligible: it stays protocol_deviant (no hiding of the methodology deviation as a success).
    expect(slotOutcome(p, answerFor(1), deviant)).toBe("protocol_deviant");
    expect(slotOutcome(p, { ...answerFor(1), promptId: uuid(999) }, context(1, 1))).toBe(
      "protocol_deviant",
    );
    // A clean complete answer is still complete.
    expect(slotOutcome(p, answerFor(1), context(1, 1))).toBe("complete");
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
): LiveVerifiedImprovement => ({
  // A fixture improvement paired with a LIVE owner_attested status — the only status a verified before/after
  // count/comparison accepts (finding 4063851250). Tests needing a downgraded live status build it explicitly.
  verificationStatus: "owner_attested",
  record: improvementSchema.parse({
    improvementId: uuid(id),
    findingIds: over.findingIds ?? [uuid(60)],
    taskId: over.taskId ?? uuid(81),
    change: {
      description: "FIXTURE change",
      approvedVersion: over.approvedVersion ?? "v1",
      approvedBy: owner,
      approvedAt: "2026-09-20T10:00:00Z",
    },
    destination: over.destination ?? {
      kind: "public_url",
      reference: "https://example.test/priser",
    },
    baselineCaptureIds: over.baselineCaptureIds ?? [captureUuid("SY-D01", 1)],
    verification: {
      method: "owner_inspection",
      receipt: "FIXTURE receipt",
      verifiedAt,
      reviewer: owner,
    },
  }),
});
/** A second, substantively distinct verified change (different task, destination and version). */
const secondChange = (
  id: number,
  verifiedAt: string,
  over: ImprovementOverrides = {},
): LiveVerifiedImprovement =>
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
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [verifiedImprovement(90, "2026-09-28T10:00:00Z")],
      },
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
      comparablePairs(
        brand,
        { captures: [], findings: [], improvements: [] },
        { baseline: 1, followUp: 2 },
      ),
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
  it("keeps a historical pair stable and needs two distinct changes verified before the follow-up (4053596307)", () => {
    const p = panel();
    const rounds = { baseline: 1, followUp: 4 };
    const caps = [captured("SY-D01", 1), captured("SY-D01", 4, { ownCitation: true })];
    // Follow-up (SY-D01 round 4) is 2026-10-05; two distinct changes verified 09-28 and 10-01 both
    // precede it, so the pair is comparable.
    const twoChanges = [
      verifiedImprovement(90, "2026-09-28T10:00:00Z"),
      secondChange(91, "2026-10-01T10:00:00Z"),
    ];
    const before = comparablePairs(
      p,
      { captures: caps, findings: scopedFindings, improvements: twoChanges },
      rounds,
    );
    expect(before.comparable).toBe(true);
    // A THIRD, genuinely distinct change verified AFTER the follow-up (2026-10-10) must not push a
    // max-of-all-verifications gate past the follow-up and invalidate the historical pair.
    const third = verifiedImprovement(92, "2026-10-10T10:00:00Z", {
      taskId: uuid(83),
      approvedVersion: "v3",
      destination: { kind: "configuration", reference: "config://example/third" },
      findingIds: [uuid(61)],
    });
    const after = comparablePairs(
      p,
      { captures: caps, findings: scopedFindings, improvements: [...twoChanges, third] },
      rounds,
    );
    expect(after.comparable).toBe(true);
    expect(after.pairs.map((x) => x.questionId)).toEqual(["SY-D01"]);
    // If only ONE distinct change is verified before the follow-up (the second is verified after
    // it), the pair is not yet comparable — two distinct changes must precede each follow-up.
    const oneBefore = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-28T10:00:00Z"),
          secondChange(91, "2026-10-08T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(oneBefore.comparable).toBe(false);
    expect(oneBefore.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "follow_up_before_both_improvements",
    );
    // Two verified COPIES of one change before the follow-up plus a distinct change after are not
    // two distinct changes before the follow-up: duplicates and clones never meet the gate.
    const clonesBefore = comparablePairs(
      p,
      {
        captures: caps,
        findings: scopedFindings,
        improvements: [
          verifiedImprovement(90, "2026-09-26T10:00:00Z"),
          verifiedImprovement(93, "2026-09-28T10:00:00Z"),
          secondChange(91, "2026-10-08T10:00:00Z"),
        ],
      },
      rounds,
    );
    expect(clonesBefore.comparable).toBe(false);
    expect(clonesBefore.missing.find((m) => m.questionId === "SY-D01")?.reason).toBe(
      "follow_up_before_both_improvements",
    );
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
describe("brand runs resolve to an approved run and cannot exceed its budget (4053687916)", () => {
  const brandPanel = (): PanelProtocol =>
    panelProtocolSchema.parse({
      ...panel(),
      panelId: uuid(2),
      kind: "brand",
      rounds: 0,
      questions: Array.from({ length: 5 }, (_, i) => question(i + 1, "B")),
    });
  const brandRun = (over: Record<string, unknown> = {}): BrandRun =>
    brandRunSchema.parse({
      id: uuid(500),
      panelId: uuid(2),
      panelVersion: 1,
      approvedBy: owner,
      approvedAt: "2026-09-15T08:00:00Z",
      observationBudget: 3,
      rounds: 2,
      ...over,
    });
  /** A brand capture bound to SY-B0n in a run round, matching the locked methodology otherwise. */
  const brandContext = (
    round: number,
    n: number,
    over: Partial<CaptureContext> = {},
  ): CaptureContext =>
    context(round, n, {
      panelId: uuid(2),
      brandRunId: uuid(500),
      slot: { round, questionId: `SY-B${String(n).padStart(2, "0")}` },
      instructions: {
        questionText: `FIXTURE fråga B${n}`,
        extraInstruction: null,
        priorMessages: 0,
      },
      ...over,
    });
  const brandReviewed = (
    n: number,
    round: number,
    over: Partial<ReviewedCapture> = {},
  ): ReviewedCapture => ({
    questionId: `SY-B${String(n).padStart(2, "0")}`,
    round,
    outcome: "complete",
    citationsComplete: true,
    ownCitation: false,
    mention: false,
    recommended: false,
    // Every brand capture carries the run it was collected under; the default is the approved run.
    brandRunId: uuid(500),
    ...over,
  });
  it("accepts a capture bound to the approved run and fails closed on any other run", () => {
    const bp = brandPanel();
    // A capture that resolves to the approved run for this panel and version, in an approved round,
    // is clean. The run is trusted evidence supplied to the helper, not asserted by the capture.
    expect(protocolDeviations(bp, brandContext(1, 1), [brandRun()])).toEqual([]);
    // With no approved run available, the asserted run cannot be authenticated: fail closed.
    expect(protocolDeviations(bp, brandContext(1, 1), [])).toContain("brand_run_not_approved");
    // A run id the capture asserts that is absent from the approved set (unknown / fabricated).
    expect(
      protocolDeviations(bp, brandContext(1, 1, { brandRunId: uuid(501) }), [brandRun()]),
    ).toContain("brand_run_not_approved");
    // A resolved run bound to another panel or version is foreign, not this baseline.
    expect(protocolDeviations(bp, brandContext(1, 1), [brandRun({ panelId: uuid(9) })])).toContain(
      "brand_run_panel_mismatch",
    );
    expect(protocolDeviations(bp, brandContext(1, 1), [brandRun({ panelVersion: 2 })])).toContain(
      "brand_run_panel_mismatch",
    );
    // A round outside the run's approved rounds (run.rounds = 2) is refused.
    expect(protocolDeviations(bp, brandContext(3, 1), [brandRun()])).toContain(
      "brand_round_out_of_run",
    );
    // A brand capture with no run id at all is still a deviation.
    expect(
      protocolDeviations(bp, brandContext(1, 1, { brandRunId: null }), [brandRun()]),
    ).toContain("brand_capture_without_run");
    // A brand run id on a discovery panel remains a deviation: discovery and brand stay separate.
    expect(protocolDeviations(panel(), context(1, 1, { brandRunId: uuid(500) }))).toContain(
      "brand_run_on_discovery",
    );
    // A run approved AFTER the capture (2026-09-25 > the round-1 capture's 2026-09-21) cannot
    // retroactively authorize the earlier observation, so it fails closed.
    const late = brandRun({ approvedAt: "2026-09-25T08:00:00Z" });
    expect(protocolDeviations(bp, brandContext(1, 1), [late])).toContain(
      "brand_run_approved_after_capture",
    );
    // A run approved before the capture (the default 2026-09-15) raises no approval-time deviation.
    expect(protocolDeviations(bp, brandContext(1, 1), [brandRun()])).not.toContain(
      "brand_run_approved_after_capture",
    );
    // slotOutcome downgrades an unresolved brand run to protocol_deviant even for a complete
    // answer, and promotes it only against the approved run.
    const answer = { status: "complete" as const, promptId: uuid(101), promptRevision: 1 };
    expect(slotOutcome(bp, answer, brandContext(1, 1), [])).toBe("protocol_deviant");
    expect(slotOutcome(bp, answer, brandContext(1, 1), [brandRun()])).toBe("complete");
    // A complete answer captured before its run was approved is protocol_deviant, but a failed
    // attempt keeps its own quality status — never masked and never promoted to complete.
    expect(slotOutcome(bp, answer, brandContext(1, 1), [late])).toBe("protocol_deviant");
    const failed = { status: "failed" as const, promptId: uuid(101), promptRevision: 1 };
    expect(slotOutcome(bp, failed, brandContext(1, 1), [late])).toBe("failed");
  });
  it("caps a brand count at the approved observation budget and rounds", () => {
    const bp = brandPanel();
    // Three captures within a budget of three and the run's two rounds count cleanly.
    const counts = panelCounts(
      bp,
      [brandReviewed(1, 1), brandReviewed(2, 1), brandReviewed(3, 2)],
      [brandRun()],
    );
    expect(counts.kind).toBe("brand");
    expect(counts.planned).toBe(0);
    expect(counts.recorded).toBe(3);
    // A fourth valid-looking capture would exceed the approved budget of three: refused, so the
    // owner-approved observation ceiling cannot be overrun by handing in more captures.
    expect(() =>
      panelCounts(
        bp,
        [brandReviewed(1, 1), brandReviewed(2, 1), brandReviewed(3, 1), brandReviewed(4, 1)],
        [brandRun()],
      ),
    ).toThrow(/observation budget/);
    // A capture on a round the run never approved (round 3 > run.rounds 2) is refused.
    expect(() => panelCounts(bp, [brandReviewed(1, 3)], [brandRun()])).toThrow(
      /outside the approved run/,
    );
    // A brand count with no approved run for this panel and version fails closed.
    expect(() => panelCounts(bp, [brandReviewed(1, 1)], [])).toThrow(/not an approved run/);
    // A discovery count is unaffected and needs no run.
    expect(panelCounts(panel(), [captured("SY-D01", 1)]).kind).toBe("discovery");
  });
  it("binds every counted capture to its own run and cannot borrow another run's budget", () => {
    const bp = brandPanel();
    // Positive control: a batch whose captures all name the approved run counts cleanly.
    expect(panelCounts(bp, [brandReviewed(1, 1), brandReviewed(2, 2)], [brandRun()]).recorded).toBe(
      2,
    );
    // A capture that lost its run id cannot be attributed to any budget: refused (missing identity).
    expect(() =>
      panelCounts(bp, [brandReviewed(1, 1, { brandRunId: null })], [brandRun()]),
    ).toThrow(/no approved run id/);
    // A capture naming a run absent from the approved set (foreign / fabricated) fails closed —
    // calling the input trusted does not repair a run identity that resolves to nothing.
    expect(() =>
      panelCounts(bp, [brandReviewed(1, 1, { brandRunId: uuid(99) })], [brandRun()]),
    ).toThrow(/not an approved run/);
    // Captures naming two different runs cannot be pooled into one budget (mixed / ambiguous): no
    // run's ceiling could bind the batch, so it is refused rather than picking a run arbitrarily.
    expect(() =>
      panelCounts(
        bp,
        [brandReviewed(1, 1), brandReviewed(2, 1, { brandRunId: uuid(501) })],
        [brandRun(), brandRun({ id: uuid(501) })],
      ),
    ).toThrow(/one approved run/);
    // A second, larger-budget approved run in the set cannot legitimize captures that belong to the
    // smaller run they name: the batch binds to its own run (budget 1), so a second capture overruns
    // it even though a budget-10 run is present — a batch cannot borrow a larger budget.
    const small = brandRun({ id: uuid(500), observationBudget: 1, rounds: 1 });
    const large = brandRun({ id: uuid(501), observationBudget: 10, rounds: 2 });
    expect(() =>
      panelCounts(bp, [brandReviewed(1, 1), brandReviewed(2, 1)], [small, large]),
    ).toThrow(/observation budget of 1/);
    // The presence of the larger run changes nothing: the same two captures overrun their own run.
    expect(() => panelCounts(bp, [brandReviewed(1, 1), brandReviewed(2, 1)], [small])).toThrow(
      /observation budget of 1/,
    );
    // A single capture bound to the small run is within its budget of one and counts.
    expect(panelCounts(bp, [brandReviewed(1, 1)], [small, large]).recorded).toBe(1);
    // Two legitimately distinct approved runs are counted separately, one count each.
    expect(panelCounts(bp, [brandReviewed(1, 1)], [small, large]).kind).toBe("brand");
    expect(
      panelCounts(bp, [brandReviewed(2, 1, { brandRunId: uuid(501) })], [small, large]).recorded,
    ).toBe(1);
    // A discovery capture carrying a brand run id is contradictory and refused before counting, so
    // discovery and brand diagnostics stay separate.
    expect(() => panelCounts(panel(), [captured("SY-D01", 1, { brandRunId: uuid(500) })])).toThrow(
      /discovery has no brand run/,
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
  selectedRecord: null,
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
  // Pair a record with its LIVE status for the status-gated verified helpers (finding 4063851250). Defaults to
  // owner_attested (a genuine live-verified before/after); pass a downgraded status to prove the SAME immutable
  // record no longer qualifies once the live status drops.
  const live = (
    record: Improvement,
    verificationStatus = "owner_attested",
  ): LiveVerifiedImprovement => ({ verificationStatus, record });
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
    expect(isVerifiedImprovement(live(draft))).toBe(false);
    expect(isVerifiedImprovement(live(verified))).toBe(true);
    expect(isVerifiedImprovement(live(stale))).toBe(false);
    // AUTHORITATIVE gate (finding 4063851250): the SAME verified record with a DOWNGRADED live status — what an
    // approval revoke / baseline delete / finding dismissal or dissent / source forget produces — is NOT a
    // verified before/after, though its immutable verification block is unchanged and still inspectable.
    expect(isVerifiedImprovement(live(verified, "connector_receipt"))).toBe(false);
    expect(isVerifiedImprovement(live(verified, "approval_bound"))).toBe(false);
    expect(isVerifiedImprovement(live(verified, "unverified"))).toBe(false);
    expect(verifiedImprovementCount([live(draft), live(verified), live(stale)])).toBe(1);
    // Two copies of one verified improvement are a single distinct change, never two.
    expect(verifiedImprovementCount([live(verified), live(structuredClone(verified))])).toBe(1);
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
    expect(verifiedImprovementCount([live(verified), live(clone)])).toBe(1);
    // Sharing only the destination and approved version (different task) is also one change.
    expect(
      verifiedImprovementCount([
        live(verified),
        live(
          improvementSchema.parse(
            improvement({
              improvementId: uuid(85),
              taskId: uuid(88),
              verification: verified.verification,
            }),
          ),
        ),
      ]),
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
    expect(verifiedImprovementCount([live(verified), live(second)])).toBe(2);
    // But if the second distinct change's LIVE status is downgraded, only the first counts — the count follows
    // the authoritative live status, never the bare immutable records (finding 4063851250).
    expect(verifiedImprovementCount([live(verified), live(second, "connector_receipt")])).toBe(1);
  });
  it("requires baseline captures for a verified improvement but allows a draft without them", () => {
    // An unverified draft may be recorded before its baseline evidence is assembled.
    const draftWithoutBaseline = improvementSchema.parse(improvement({ baselineCaptureIds: [] }));
    expect(isVerifiedImprovement(live(draftWithoutBaseline))).toBe(false);
    const liveVerification = {
      method: "owner_inspection" as const,
      receipt: "Owner inspected the live page",
      verifiedAt: "2026-09-26T10:00:00Z",
      reviewer: owner,
    };
    // A verified record with no baseline captures has no before/after evidence: the schema
    // refuses it.
    expect(() =>
      improvementSchema.parse(
        improvement({ baselineCaptureIds: [], verification: liveVerification }),
      ),
    ).toThrow(/baseline captures/);
    // And even bypassing the schema, the predicate does not treat it as a verified improvement.
    expect(
      isVerifiedImprovement(
        live(improvement({ baselineCaptureIds: [], verification: liveVerification })),
      ),
    ).toBe(false);
  });
  it("counts substantive changes by canonical destination identity, not the verbatim reference (4053596293)", () => {
    const verified = (id: number, over: Partial<Improvement>): LiveVerifiedImprovement =>
      live(
        improvementSchema.parse(
          improvement({
            improvementId: uuid(id),
            verification: {
              method: "owner_inspection",
              receipt: "Owner inspected the live page",
              verifiedAt: "2026-09-26T10:00:00Z",
              reviewer: owner,
            },
            ...over,
          }),
        ),
      );
    const publicUrl = (reference: string) => ({ kind: "public_url" as const, reference });
    // Two different tasks pointing at the SAME page (differing only by host case, the default port
    // and a fragment) at the same approved version are ONE substantive change, not two.
    const sameByCase = [
      verified(200, { taskId: uuid(90), destination: publicUrl("https://example.test/page") }),
      verified(201, {
        taskId: uuid(91),
        destination: publicUrl("HTTPS://EXAMPLE.TEST:443/page#section"),
      }),
    ];
    expect(verifiedImprovementCount(sameByCase)).toBe(1);
    // A distinct path (case-sensitive) or a distinct query is a different destination: two changes.
    expect(
      verifiedImprovementCount([
        verified(202, { taskId: uuid(90), destination: publicUrl("https://example.test/page") }),
        verified(203, { taskId: uuid(91), destination: publicUrl("https://example.test/Page") }),
      ]),
    ).toBe(2);
    expect(
      verifiedImprovementCount([
        verified(204, { taskId: uuid(90), destination: publicUrl("https://example.test/page") }),
        verified(205, {
          taskId: uuid(91),
          destination: publicUrl("https://example.test/page?ref=ai"),
        }),
      ]),
    ).toBe(2);
    // Non-URL destination kinds are opaque contract identifiers compared exactly: a case
    // difference in a listing is NOT folded, so these stay two distinct changes.
    expect(
      verifiedImprovementCount([
        verified(206, {
          taskId: uuid(90),
          destination: { kind: "listing", reference: "listing://Example/Synergy" },
        }),
        verified(207, {
          taskId: uuid(91),
          destination: { kind: "listing", reference: "listing://example/synergy" },
        }),
      ]),
    ).toBe(2);
    // An invalid public URL fails closed rather than silently colliding or counting.
    expect(() =>
      verifiedImprovementCount([verified(208, { destination: publicUrl("not-a-url") })]),
    ).toThrow(/not a valid URL/);
    expect(() =>
      verifiedImprovementCount([verified(209, { destination: publicUrl("ftp://example.test/x") })]),
    ).toThrow(/http\(s\) URL/);
  });
});
