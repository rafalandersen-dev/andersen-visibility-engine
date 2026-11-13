import { describe, expect, it } from "vitest";
import { buildPanelDraft, emptyPanelDraftForm } from "./citation-panel-ui";
import { protocolDeviations, type CaptureContext, type PanelProtocol } from "./citation-panel";
import { manualCaptureCopy } from "@/i18n/manual-capture";
import {
  citationReports,
  panelVersionKey,
  type ErasedSlot,
  type ResolvedCapture,
} from "./citation-protocol";
import {
  MANUAL_CAPTURE_METHOD,
  buildManualCapture,
  capturedAtFromForm,
  delayMinutes,
  MANUAL_CAPTURE_FIELD_LIMITS,
  MANUAL_CAPTURE_FIELD_PLACE,
  emptyManualCaptureForm,
  firstSendIssues,
  issueField,
  issueStep,
  leaveKind,
  manualCaptureChoices,
  manualCaptureFormDirty,
  sameStoredInput,
  settleCheck,
  settleSend,
  type ManualCaptureForm,
  type Submission,
} from "./manual-capture-ui";

const OWNER = "00000000-0000-4000-8000-000000000001";
const PANEL = "abcdef00-0000-4000-8000-0000000000d1";
const prompts = Array.from({ length: 10 }, (_, i) => ({
  id: `c0c0c0c0-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
  revision: 1,
  text: `FIXTURE Who services heat pumps in Oslo? (#${i + 1})`,
  language: "en",
}));
/** Weekly slots at 10:00 Stockholm from 7 September 2026 (CEST: 08:00Z): rounds on 7, 14, 21 and 28 Sept. */
function panel(version: number, over: Partial<PanelProtocol> = {}): PanelProtocol {
  const built = buildPanelDraft(
    {
      ...emptyPanelDraftForm({ clientName: "Nordlys", market: "NO", language: "en" }),
      surface: {
        service: "Synthetic chat app",
        interface: "web",
        mode: "consumer-web",
        searchMode: "",
        modelLabel: "",
        webSearchEvidenced: "unknown",
      },
      questionKeys: prompts.map((p) => `${p.id}:1`),
      firstSlot: { date: "2026-09-07", time: "10:00" },
    },
    PANEL,
    version - 1,
    prompts,
  );
  if (!built.ok) throw Error(built.issues.join(","));
  return {
    ...built.draft,
    status: "locked",
    approval: { approvedBy: OWNER, approvedAt: "2026-09-01T08:00:00.000Z" },
    ...over,
  } as PanelProtocol;
}
const NOW = Date.parse("2026-09-22T12:00:00Z");
/** Defaults: every scoped read current, every prompt revision present, every version's occupancy complete. */
const choicesFor = (
  panels: PanelProtocol[],
  extra: Partial<Parameters<typeof manualCaptureChoices>[0]> = {},
) =>
  manualCaptureChoices({
    panels,
    reports: panels.map((p) => ({
      panelId: p.panelId,
      panelVersion: p.version,
      coverageComplete: true,
    })),
    prompts,
    readsCurrent: true,
    captures: [],
    erasedSlots: [],
    nowMs: NOW,
    ...extra,
  });
const form = (over: Partial<ManualCaptureForm> = {}): ManualCaptureForm => ({
  ...emptyManualCaptureForm(),
  affirmQuestion: true,
  status: "complete",
  rawAnswer: "Nordlys is one option.",
  citations: "https://nordlys.example.com/a\nhttps://rival.example.org/b",
  capturedDate: "2026-09-14",
  capturedTime: "11:42:17",
  utcOffset: "+02:00",
  service: "  Synthetic chat app  ",
  interfaceName: "web",
  mode: "consumer-web",
  freshSession: "yes",
  priorMessages: "0",
  ...over,
});

describe("eligible choices", () => {
  it("offers only locked, approved discovery versions with a valid schedule, older locked ones included", () => {
    const panels = [
      panel(1),
      panel(2),
      panel(3, { status: "draft", approval: null }),
      panel(4, { schedule: null }),
      { ...panel(5), kind: "brand", rounds: 0, schedule: null } as PanelProtocol,
    ];
    expect(choicesFor(panels).map((v) => v.panel.version)).toEqual([2, 1]);
  });

  it("marks future rounds not due and known occupied or deleted originals unavailable", () => {
    const [v1] = choicesFor([panel(1)], {
      captures: [
        {
          panelId: PANEL.toUpperCase(),
          panelVersion: 1,
          brandRunId: null,
          slot: { questionId: "NO-D01", round: 1 },
        },
      ],
      erasedSlots: [
        { panelId: PANEL, panelVersion: 1, brandRunId: null, questionId: "NO-D01", round: 2 },
      ],
    });
    const q1 = v1.slots.filter((s) => s.questionId === "NO-D01").map((s) => [s.round, s.state]);
    expect(q1).toEqual([
      [1, "occupied"],
      [2, "erased"],
      [3, "available"],
      [4, "notDue"],
    ]);
    const slot = v1.slots.find((s) => s.questionId === "NO-D02" && s.round === 2)!;
    // Verbatim approved instant, stored question text and binding.
    expect(slot.intendedSlotAt).toBe(panel(1).schedule!.slots[1].intendedAt);
    expect(slot.questionText).toBe(prompts[1].text);
    expect([slot.promptId, slot.promptRevision]).toEqual([prompts[1].id, 1]);
  });
});

describe("authoritative eligibility for a NEW original", () => {
  const capture = (over: Partial<ResolvedCapture>): ResolvedCapture => ({
    answerId: "5a5a5a5a-0000-4000-8000-000000000001",
    panelId: PANEL,
    panelVersion: 1,
    kind: "discovery",
    outcome: "complete",
    deviations: [],
    panelResolved: true,
    brandRunResolved: null,
    contextMalformed: false,
    slot: { questionId: "NO-D01", round: 1 },
    brandRunId: null,
    captureContext: null,
    ...over,
  });
  /** The real report computation the service runs, from the given resolved captures and erasure facts. */
  const reportsFor = (
    panels: PanelProtocol[],
    captures: ResolvedCapture[],
    erasedSlots: ErasedSlot[] = [],
    coverageCompleteByVersion: Record<string, boolean> = {},
  ) =>
    citationReports(panels, [], captures, {
      slots: erasedSlots,
      consumedByRun: {},
      excludedByVersion: {},
      coverageCompleteByVersion,
      extraAttemptsByVersion: {},
    });
  const states = (
    v: { slots: { questionId: string; round: number; state: string }[] },
    q: string,
  ) => v.slots.filter((s) => s.questionId === q).map((s) => s.state);

  it("truncated erasure rows for one version make only that version's free slots unknown", () => {
    const panels = [panel(1), panel(2)];
    const erased: ErasedSlot = {
      answerId: "5a5a5a5a-0000-4000-8000-0000000000e1",
      panelId: PANEL,
      panelVersion: 1,
      brandRunId: null,
      questionId: "NO-D02",
      round: 1,
      panelResolved: true,
      brandRunResolved: null,
    };
    // Fewer tombstones transmitted than the version's grid rows: the service reports it incomplete.
    const reports = reportsFor(panels, [], [erased], { [panelVersionKey(PANEL, 1)]: false });
    expect(reports.map((r) => [r.panelVersion, r.coverageComplete])).toEqual([
      [1, false],
      [2, true],
    ]);
    const [v2, v1] = choicesFor(panels, { reports, erasedSlots: [erased] });
    // Known facts keep their own reason; only a free-looking due slot is unknown.
    expect(states(v1, "NO-D02")).toEqual([
      "erased",
      "occupancyUnknown",
      "occupancyUnknown",
      "notDue",
    ]);
    expect(states(v1, "NO-D01")).toEqual([
      "occupancyUnknown",
      "occupancyUnknown",
      "occupancyUnknown",
      "notDue",
    ]);
    // The other version is unaffected.
    expect(states(v2, "NO-D01")).toEqual(["available", "available", "available", "notDue"]);
  });

  it("a malformed capture with an unrecognizable slot makes only its own version unknown", () => {
    const panels = [panel(1), panel(2)];
    const captures = [
      capture({ panelVersion: 2, contextMalformed: true, slot: null, outcome: "protocol_deviant" }),
    ];
    const reports = reportsFor(panels, captures);
    const [v2, v1] = choicesFor(panels, { reports, captures });
    expect(states(v2, "NO-D03")).toEqual([
      "occupancyUnknown",
      "occupancyUnknown",
      "occupancyUnknown",
      "notDue",
    ]);
    expect(states(v1, "NO-D03")).toEqual(["available", "available", "available", "notDue"]);
  });

  it("a known-slot failed or malformed record occupies only its own slot, never the version", () => {
    const panels = [panel(1)];
    const captures = [
      capture({ outcome: "failed", slot: { questionId: "NO-D01", round: 1 } }),
      capture({
        answerId: "5a5a5a5a-0000-4000-8000-000000000002",
        outcome: "truncated",
        contextMalformed: true,
        slot: { questionId: "NO-D02", round: 2 },
      }),
    ];
    const reports = reportsFor(panels, captures);
    expect(reports[0].coverageComplete).toBe(true);
    const [v1] = choicesFor(panels, { reports, captures });
    expect(states(v1, "NO-D01")).toEqual(["occupied", "available", "available", "notDue"]);
    expect(states(v1, "NO-D02")).toEqual(["available", "occupied", "available", "notDue"]);
  });

  it("a missing report, or reads that are not currently successful, never offer a free slot", () => {
    const [noReport] = choicesFor([panel(1)], { reports: [] });
    expect(states(noReport, "NO-D01")).toEqual([
      "occupancyUnknown",
      "occupancyUnknown",
      "occupancyUnknown",
      "notDue",
    ]);
    // A failed read is not an empty one: nothing is offered, whatever the cached facts say.
    const [failed] = choicesFor([panel(1)], { readsCurrent: false });
    expect(new Set(failed.slots.map((s) => s.state))).toEqual(new Set(["readsUnavailable"]));
  });

  it("requires the question's exact prompt id and integer revision in the current scoped prompt set", () => {
    const without = (i: number) => prompts.filter((_, n) => n !== i);
    // Deleted prompt.
    let [v] = choicesFor([panel(1)], { prompts: without(1) });
    expect(states(v, "NO-D02")).toEqual([
      "promptMissing",
      "promptMissing",
      "promptMissing",
      "promptMissing",
    ]);
    expect(states(v, "NO-D01")).toEqual(["available", "available", "available", "notDue"]);
    // Only a newer revision is current: the approved revision 1 is no longer there.
    [v] = choicesFor([panel(1)], { prompts: [...without(0), { ...prompts[0], revision: 2 }] });
    expect(states(v, "NO-D01")[0]).toBe("promptMissing");
    // A non-integer spelling of the revision is not the integer revision.
    [v] = choicesFor([panel(1)], {
      prompts: [...without(0), { id: prompts[0].id, revision: "1" as unknown as number }],
    });
    expect(states(v, "NO-D01")[0]).toBe("promptMissing");
    // Another project's prompt (a different id) is not this question's prompt.
    [v] = choicesFor([panel(1)], {
      prompts: [...without(0), { id: "c0c0c0c0-0000-4000-8000-0000000000ff", revision: 1 }],
    });
    expect(states(v, "NO-D01")[0]).toBe("promptMissing");
    // A UUID case variant is the same prompt.
    [v] = choicesFor([panel(1)], {
      prompts: [...without(0), { id: prompts[0].id.toUpperCase(), revision: 1 }],
    });
    expect(states(v, "NO-D01")).toEqual(["available", "available", "available", "notDue"]);
  });

  it("refuses a new original with the specific reason, before anything is sent", () => {
    const reason = (extra: Partial<Parameters<typeof manualCaptureChoices>[0]>) => {
      const [v] = choicesFor([panel(1)], extra);
      const s = v.slots.find((x) => x.questionId === "NO-D01" && x.round === 2)!;
      const out = buildManualCapture({
        version: v,
        slot: s,
        form: form(),
        answerCount: 0,
        nowMs: NOW,
      });
      return out.ok ? [] : out.issues;
    };
    expect(reason({ readsCurrent: false })).toEqual(["readsUnavailable"]);
    expect(reason({ reports: [] })).toEqual(["occupancyUnknown"]);
    expect(reason({ prompts: prompts.slice(1) })).toEqual(["promptMissing"]);
    for (const i of [
      "readsUnavailable",
      "promptMissing",
      "occupancyUnknown",
      "slotUnavailable",
    ] as const)
      expect(issueStep(i)).toBe(1);
    expect(issueStep("rawAnswer")).toBe(2);
    expect(issueStep("freshSession")).toBe(3);
  });

  it("an exact resend is never re-checked for eligibility and never resets earlier uncertainty", () => {
    const [v] = choicesFor([panel(1)]);
    const s = v.slots.find((x) => x.questionId === "NO-D01" && x.round === 2)!;
    const built = buildManualCapture({
      version: v,
      slot: s,
      form: form(),
      answerCount: 0,
      nowMs: NOW,
    });
    if (!built.ok) throw Error("fixture");
    // Eligibility has since changed (the slot now holds a record and reads failed) ...
    const [later] = choicesFor([panel(1)], {
      readsCurrent: false,
      captures: [capture({ slot: { questionId: "NO-D01", round: 2 } })],
    });
    expect(later.slots.find((x) => x.questionId === "NO-D01" && x.round === 2)!.state).toBe(
      "readsUnavailable",
    );
    // ... yet the resend settles only on what the response proves, with the same frozen object.
    const resend = {
      phase: "sending" as const,
      frozen: built.frozen,
      attempt: "resend" as const,
      uncertain: true,
    };
    expect(settleSend(resend, { ok: false })).toEqual({
      phase: "unconfirmed",
      frozen: built.frozen,
      note: "resend",
    });
    const id = "5a5a5a5a-0000-4000-8000-000000000009";
    expect(settleSend(resend, { ok: true, value: id })).toMatchObject({
      phase: "confirmed",
      id,
    });
    expect(Object.isFrozen(built.frozen)).toBe(true);
  });
});

describe("R2: first-send capacity, status recovery, field limits and truthful labels", () => {
  const v = () => choicesFor([panel(1)])[0];
  const slot2 = () => v().slots.find((s) => s.questionId === "NO-D01" && s.round === 2)!;
  const build = (over: Partial<ManualCaptureForm>, answerCount = 0) =>
    buildManualCapture({ version: v(), slot: slot2(), form: form(over), answerCount, nowMs: NOW });
  const issuesOf = (over: Partial<ManualCaptureForm>) => {
    const out = build(over);
    return out.ok ? [] : out.issues;
  };
  const pick = { key: `${PANEL}:1`, questionId: "NO-D01", round: 2 };

  it("rechecks the current answer count before a NEW first send; reviewed at 99, blocked at 100", () => {
    expect(build({}, 99).ok).toBe(true); // reviewed with 99 stored records
    const choices = choicesFor([panel(1)]);
    expect(firstSendIssues({ choices, pick, answerCount: 99 })).toEqual([]);
    // An unrelated (non-panel) record arrived: the slot is still free, the project is full.
    expect(firstSendIssues({ choices, pick, answerCount: 100 })).toEqual(["capacity"]);
    expect(issueStep("capacity")).toBe(1);
    // An unknown count is not a free one.
    expect(firstSendIssues({ choices, pick, answerCount: null })).toEqual(["readsUnavailable"]);
    const taken = choicesFor([panel(1)], {
      captures: [
        {
          panelId: PANEL,
          panelVersion: 1,
          brandRunId: null,
          slot: { questionId: "NO-D01", round: 2 },
        },
      ],
    });
    expect(firstSendIssues({ choices: taken, pick, answerCount: 100 })).toEqual([
      "slotUnavailable",
      "capacity",
    ]);
  });

  it("keeps a no-longer-applicable failure reason attributable to the visible answer-step field", () => {
    for (const status of ["failed", "truncated"] as const) {
      expect(issuesOf({ status, failure: "Timed out", rawAnswer: "" })).toEqual([]);
      const switched = issuesOf({ status: "complete", failure: "Timed out" });
      expect(switched).toEqual(["failureNotAllowed"]);
      expect(issueField("failureNotAllowed")).toBe("failure");
      expect(issueStep("failureNotAllowed")).toBe(2);
      // Removing the reason (the visible recovery action) makes the complete answer valid.
      expect(issuesOf({ status: "complete", failure: "" })).toEqual([]);
      // Back to a failing status: a reason is required again.
      expect(issuesOf({ status, failure: "" })).toEqual(["failureRequired"]);
    }
  });

  it("names each schema limit at its field and step: exact limits pass, one more is refused, nothing is cut", () => {
    const fill = (field: keyof typeof MANUAL_CAPTURE_FIELD_LIMITS, n: number) =>
      ({
        [field]: "x".repeat(n),
        ...(field === "failure" ? { status: "failed" as const } : {}),
      }) as Partial<ManualCaptureForm>;
    for (const field of Object.keys(
      MANUAL_CAPTURE_FIELD_LIMITS,
    ) as (keyof typeof MANUAL_CAPTURE_FIELD_LIMITS)[]) {
      const max = MANUAL_CAPTURE_FIELD_LIMITS[field];
      const ok = build(fill(field, max));
      expect(ok.ok, `${field} at ${max}`).toBe(true);
      if (ok.ok && field === "rawAnswer") expect(ok.frozen.rawAnswer).toHaveLength(50000);
      expect(issuesOf(fill(field, max + 1)), `${field} at ${max + 1}`).toEqual([
        `tooLong:${field}`,
      ]);
      expect(issueStep(`tooLong:${field}`)).toBe(MANUAL_CAPTURE_FIELD_PLACE[field].step);
    }
    expect(MANUAL_CAPTURE_FIELD_LIMITS).toMatchObject({ rawAnswer: 50000, failure: 2000 });
    // An oversized answer is reported on step 2 even while the later context is still empty.
    const early = buildManualCapture({
      version: v(),
      slot: slot2(),
      form: {
        ...emptyManualCaptureForm(),
        affirmQuestion: true,
        status: "complete",
        rawAnswer: "x".repeat(50001),
      },
      answerCount: 0,
      nowMs: NOW,
    });
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.issues.filter((i) => issueStep(i) <= 2)).toEqual(["tooLong:rawAnswer"]);
      expect(early.issues).not.toContain("invalid");
    }
    expect(issuesOf({ status: "failed", failure: "x".repeat(2001), rawAnswer: "" })).toEqual([
      "tooLong:failure",
    ]);
    // Other limits name their field (and optional group) instead of a generic refusal.
    expect(MANUAL_CAPTURE_FIELD_PLACE.collectionCountry).toEqual({ step: 3, group: "place" });
    expect(issuesOf({ accountTier: "Plus\tPro" })).toEqual(["invalid:accountTier"]);
    // Surrounding whitespace (tabs included) is trimmed exactly as the stored schema trims it.
    const tier = (accountTier: string) => {
      const out = build({ accountTier });
      if (!out.ok) throw Error(out.issues.join(","));
      return (out.frozen.captureContext as CaptureContext).session;
    };
    expect(tier("\tFree\t").accountTier).toBe("Free");
    expect("accountTier" in tier("\t \t")).toBe(false); // whitespace only: omitted, i.e. not known
    expect(issuesOf({ accountTier: "\tPlus\u0007\t" })).toEqual(["invalid:accountTier"]);
    expect(
      issuesOf({ deviationNotes: Array.from({ length: 21 }, (_, i) => `n${i}`).join("\n") }),
    ).toEqual(["deviationNotes"]);
    expect(issuesOf({ deviationNotes: "x".repeat(501) })).toEqual(["deviationNotes"]);
    expect(issuesOf({ citations: `https://nordlys.example.com/${"a".repeat(2030)}` })).toEqual([
      "citations",
    ]);
  });

  it("mismatch labels describe the recorded details, covering known-different, unknown and both-unknown", () => {
    const pinned = panel(1, {
      collection: { country: "NO", city: null, devicePermission: "unknown", vpn: null },
    } as Partial<PanelProtocol>);
    const [pv] = choicesFor([pinned]);
    const s = pv.slots.find((x) => x.questionId === "NO-D01" && x.round === 2)!;
    const codes = (over: Partial<ManualCaptureForm>, p = pinned, version = pv, sl = s) => {
      const out = buildManualCapture({
        version,
        slot: sl,
        form: form(over),
        answerCount: 0,
        nowMs: NOW,
      });
      if (!out.ok) throw Error(out.issues.join(","));
      return protocolDeviations(p, out.frozen.captureContext as CaptureContext);
    };
    // Known and different, and observed-unknown against a planned value: the same canonical code.
    expect(codes({ collectionCountry: "SE" })).toContain("collection_country_differs");
    expect(codes({ collectionCountry: "" })).toContain("collection_country_differs");
    expect(codes({ collectionCountry: "NO" })).not.toContain("collection_country_differs");
    // Both unknown (the plan pins no country, nothing recorded): no code.
    const [v1] = choicesFor([panel(1)]);
    const s1 = v1.slots.find((x) => x.questionId === "NO-D01" && x.round === 2)!;
    expect(codes({ collectionCountry: "" }, panel(1), v1, s1)).not.toContain(
      "collection_country_differs",
    );
    // So the label must cover both readings, in every language, and never assert an observed difference.
    const words = {
      en: ["recorded", "not recorded"],
      pl: ["zapisane", "brak zapisu"],
      sv: ["registrerade", "inte registrerat"],
      da: ["registrerede", "ikke registreret"],
    } as const;
    for (const [locale, [recorded, unknown]] of Object.entries(words)) {
      const copy = manualCaptureCopy[locale as keyof typeof manualCaptureCopy] as Record<
        string,
        string
      >;
      for (const code of ["collection_country_differs", "model_label_differs"]) {
        expect(copy[`manualCapture.deviation.${code}`]).toContain(recorded);
        expect(copy[`manualCapture.deviation.${code}`]).toContain(unknown);
      }
      expect(copy["manualCapture.noDeviations"]).toContain(
        { en: "recorded", pl: "zapisanych", sv: "registrerade", da: "registrerede" }[locale]!,
      );
    }
  });
});

describe("capture time", () => {
  it("keeps the entered time, seconds and offset; never the import time", () => {
    expect(
      capturedAtFromForm({
        capturedDate: "2026-09-14",
        capturedTime: "11:42:17",
        utcOffset: "+02:00",
      }),
    ).toBe("2026-09-14T11:42:17+02:00");
    expect(
      capturedAtFromForm({
        capturedDate: "2026-09-14",
        capturedTime: "11:42",
        utcOffset: "-05:30",
      }),
    ).toBe("2026-09-14T11:42:00-05:30");
    for (const bad of [
      { capturedDate: "2026-09-14", capturedTime: "11:42", utcOffset: "" },
      { capturedDate: "2026-09-14", capturedTime: "25:00", utcOffset: "+02:00" },
      { capturedDate: "14/09/2026", capturedTime: "11:42", utcOffset: "+02:00" },
    ])
      expect(capturedAtFromForm(bad)).toBeNull();
  });

  it("derives whole-minute lateness with the server's floor, across offset spellings", () => {
    const slot = "2026-09-14T08:00:00.000Z";
    expect(delayMinutes("2026-09-14T10:00:59+02:00", slot)).toBe(0);
    expect(delayMinutes("2026-09-14T10:01:00+02:00", slot)).toBe(1);
    expect(delayMinutes("2026-09-14T08:41:30Z", slot)).toBe(41);
  });
});

describe("building and freezing the payload", () => {
  const v = () => choicesFor([panel(1)])[0];
  const slot = () => v().slots.find((s) => s.questionId === "NO-D01" && s.round === 2)!;

  it("freezes exactly what the server stores, bound to the stored question and slot", () => {
    const out = buildManualCapture({
      version: v(),
      slot: slot(),
      form: form(),
      answerCount: 3,
      nowMs: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const f = out.frozen;
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.captureContext)).toBe(true);
    expect(f).toMatchObject({
      promptId: prompts[0].id,
      promptRevision: 1,
      surface: "Synthetic chat app", // trimmed by the same schema the server applies
      mode: "consumer-web",
      method: MANUAL_CAPTURE_METHOD,
      modelVersion: null,
      capturedAt: "2026-09-14T11:42:17+02:00",
      status: "complete",
      citations: ["https://nordlys.example.com/a", "https://rival.example.org/b"],
      citationsComplete: false,
      failure: null,
      reportedCostUsd: null,
      supersedesId: null,
    });
    const ctx = f.captureContext as Record<string, Record<string, unknown>>;
    expect(ctx.time).toEqual({
      capturedAt: "2026-09-14T11:42:17+02:00",
      intendedSlotAt: slot().intendedSlotAt,
      delayMinutes: 102,
    });
    expect(ctx.instructions).toEqual({
      questionText: prompts[0].text,
      extraInstruction: null,
      priorMessages: 0,
    });
    expect(ctx.session).toMatchObject({
      freshSession: true,
      personalisation: "unknown",
      memory: "unknown",
    });
    expect(ctx.location).toEqual({
      inQuestion: null,
      collectionCountry: null,
      collectionCity: null,
      devicePermission: "unknown",
      vpn: null,
    });
    expect(ctx.language).toEqual({ prompt: "en", interface: "unknown", answer: null });
    expect((f.captureContext as Record<string, unknown>).brandRunId).toBeNull();
    expect(MANUAL_CAPTURE_METHOD).toBe("manual entry (MILO form) v1");
  });

  it("refuses locally (nothing sent) with the exact reasons", () => {
    const issues = (
      over: Partial<ManualCaptureForm>,
      extra: { answerCount?: number; round?: number } = {},
    ) => {
      const s = v().slots.find((x) => x.questionId === "NO-D01" && x.round === (extra.round ?? 2))!;
      const out = buildManualCapture({
        version: v(),
        slot: s,
        form: form(over),
        answerCount: extra.answerCount ?? 0,
        nowMs: NOW,
      });
      return out.ok ? [] : out.issues;
    };
    expect(issues({ affirmQuestion: false })).toEqual(["affirmQuestion"]);
    expect(issues({ freshSession: "", priorMessages: "" })).toEqual([
      "freshSession",
      "priorMessages",
    ]);
    expect(issues({ capturedTime: "09:59:00" })).toEqual(["beforeSlot"]); // slot is 10:00 Stockholm
    expect(issues({ capturedDate: "2026-09-23" })).toEqual(["inFuture"]);
    expect(issues({ status: "failed" })).toEqual(["failureRequired"]);
    expect(issues({ failure: "x" })).toEqual(["failureNotAllowed"]);
    expect(issues({ rawAnswer: "  " })).toEqual(["rawAnswer"]);
    expect(issues({ citations: "http://localhost/x" })).toEqual(["citations"]);
    expect(issues({ mode: "" })).toEqual(["mode"]);
    expect(issues({}, { answerCount: 100 })).toEqual(["capacity"]);
    expect(issues({ capturedDate: "2026-09-28" }, { round: 4 })).toContain("slotUnavailable");
  });

  it("an identical rebuild is the same entry; a matching stored record must be structurally identical", () => {
    const a = buildManualCapture({
      version: v(),
      slot: slot(),
      form: form(),
      answerCount: 0,
      nowMs: NOW,
    });
    const b = buildManualCapture({
      version: v(),
      slot: slot(),
      form: form(),
      answerCount: 0,
      nowMs: NOW,
    });
    if (!a.ok || !b.ok) throw Error("fixture");
    expect(sameStoredInput(b.frozen, a.frozen)).toBe(true);
    // JSONB returns keys in another order: still the same stored input.
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reverseKeys(x)]),
            )
          : v;
    const stored = reverseKeys(JSON.parse(JSON.stringify(a.frozen)));
    expect(Object.keys(stored as object)[0]).not.toBe(Object.keys(a.frozen)[0]);
    expect(sameStoredInput(stored, a.frozen)).toBe(true);
    const copy = () => JSON.parse(JSON.stringify(a.frozen));
    const swapped = copy();
    swapped.citations.reverse();
    const upper = copy();
    upper.promptId = upper.promptId.toUpperCase();
    const zulu = copy();
    zulu.capturedAt = "2026-09-14T09:42:17Z"; // same instant, different spelling: a different stored input
    const other = copy();
    other.rawAnswer = "Different answer at the same slot";
    for (const x of [swapped, upper, zulu, other]) expect(sameStoredInput(x, a.frozen)).toBe(false);
  });
});

describe("what responses prove (sticky uncertainty)", () => {
  const frozen = Object.freeze({ rawAnswer: "x" }) as never;
  const sending = (attempt: "first" | "resend"): Extract<Submission, { phase: "sending" }> => ({
    phase: "sending",
    frozen,
    attempt,
    uncertain: attempt === "resend",
  });
  const ID = "11111111-0000-4000-8000-000000000001";

  it("only a valid UUID confirms; every other outcome after dispatch is unconfirmed", () => {
    expect(settleSend(sending("first"), { ok: true, value: ID })).toEqual({
      phase: "confirmed",
      frozen,
      id: ID,
      via: "response",
    });
    for (const outcome of [
      { ok: true as const, value: "not-a-uuid" },
      { ok: true as const, value: undefined },
      { ok: false as const },
    ])
      expect(settleSend(sending("first"), outcome)).toEqual({
        phase: "unconfirmed",
        frozen,
        note: "sent",
      });
    // A refused resend after an earlier timeout never turns the earlier attempt into "not saved".
    expect(settleSend(sending("resend"), { ok: false })).toEqual({
      phase: "unconfirmed",
      frozen,
      note: "resend",
    });
  });

  it("a check confirms only on an exact stored match", () => {
    const prior: Extract<Submission, { phase: "unconfirmed" }> = {
      phase: "unconfirmed",
      frozen,
      note: "sent",
    };
    expect(
      settleCheck(prior, { ok: true, answers: [{ id: ID, input: { rawAnswer: "x" } }] }),
    ).toEqual({
      phase: "confirmed",
      frozen,
      id: ID,
      via: "match",
    });
    // A different occupant of the same slot is not this submission.
    expect(
      settleCheck(prior, { ok: true, answers: [{ id: ID, input: { rawAnswer: "y" } }] }),
    ).toEqual({
      ...prior,
      note: "notFound",
    });
    expect(settleCheck(prior, { ok: false })).toEqual({ ...prior, note: "checkFailed" });
  });

  it("classifies what leaving would lose", () => {
    expect(leaveKind({ phase: "editing" }, false)).toBe("none");
    expect(leaveKind({ phase: "editing" }, true)).toBe("unsent");
    expect(leaveKind({ phase: "review", frozen }, true)).toBe("unsent");
    expect(leaveKind(sending("first"), true)).toBe("sending");
    expect(leaveKind({ phase: "unconfirmed", frozen, note: "sent" }, true)).toBe("unconfirmed");
    expect(leaveKind({ phase: "confirmed", frozen, id: ID, via: "match" }, true)).toBe("none");
    expect(manualCaptureFormDirty(emptyManualCaptureForm())).toBe(false);
    expect(manualCaptureFormDirty({ ...emptyManualCaptureForm(), rawAnswer: "a" })).toBe(true);
  });
});
