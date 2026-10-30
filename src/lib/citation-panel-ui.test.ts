import { describe, expect, it } from "vitest";
import {
  buildPanelDraft,
  currentPanelVersion,
  emptyPanelDraftForm,
  formFromPanel,
  lockIssues,
  lockedScopes,
  panelCoverageEntries,
  panelHeads,
  questionIdFor,
  questionIdPrefix,
  stockholmLocalInstant,
  stockholmLocalLabel,
  stockholmLocalToIso,
  weeklyStockholmSlotsResult,
  tzOffsetMinutes,
  weeklyStockholmSlots,
} from "./citation-panel-ui";
import { discoveryScheduleValid, type BrandRun, type PanelProtocol } from "./citation-panel";
import type { CitationReport } from "./citation-protocol";

const PANEL = "40000000-0000-4000-8000-000000000001";
const prompts = Array.from({ length: 10 }, (_, i) => ({
  id: `20000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
  revision: 1,
  text: `Question ${i + 1} about massage in Malmö?`,
  language: "sv-SE",
}));
const form = (over: Partial<ReturnType<typeof emptyPanelDraftForm>> = {}) => ({
  ...emptyPanelDraftForm({ clientName: "Acme Massage", market: "SE", language: "sv-SE" }),
  surface: {
    service: "ChatGPT",
    interface: "web",
    mode: "consumer-web" as const,
    searchMode: "",
    modelLabel: "",
    webSearchEvidenced: "unknown" as const,
  },
  questionKeys: prompts.map((p) => `${p.id}:${p.revision}`),
  firstSlot: { date: "2027-01-04", time: "10:00" },
  ...over,
});

describe("question ids and Stockholm schedule", () => {
  it("derives a two-letter prefix and grid-shaped ids", () => {
    expect(questionIdPrefix("Acme Massage")).toBe("AC");
    expect(questionIdPrefix("Ömer & Co")).toBe("OM"); // NFKD strips the diacritic; non-letters dropped
    expect(questionIdPrefix("42")).toBe("MG");
    expect(questionIdFor("AC", "discovery", 0)).toBe("AC-D01");
    expect(questionIdFor("AC", "brand", 9)).toBe("AC-B10");
  });
  it("converts Stockholm wall-clock to UTC across DST and keeps weekly slots at the same local time", () => {
    expect(tzOffsetMinutes(Date.parse("2027-01-04T09:00:00Z"), "Europe/Stockholm")).toBe(60);
    expect(tzOffsetMinutes(Date.parse("2027-07-05T08:00:00Z"), "Europe/Stockholm")).toBe(120);
    expect(stockholmLocalToIso("2027-01-04", "10:00")).toBe("2027-01-04T09:00:00.000Z");
    expect(stockholmLocalToIso("2027-07-05", "10:00")).toBe("2027-07-05T08:00:00.000Z");
    expect(stockholmLocalToIso("2027-13-04", "10:00")).toBeNull();
    // The read-only detail label renders the stored UTC instant as Stockholm wall-clock (winter / summer).
    expect(stockholmLocalLabel("2027-01-04T09:00:00.000Z")).toBe("2027-01-04 10:00");
    expect(stockholmLocalLabel("2027-07-05T08:00:00.000Z")).toBe("2027-07-05 10:00");
    expect(stockholmLocalLabel("garbage")).toBe("garbage");
    // Four weekly slots spanning the March DST change: local 10:00 every Monday, UTC offset shifts.
    const slots = weeklyStockholmSlots({ date: "2027-03-15", time: "10:00" }, 4)!;
    expect(slots.map((s) => s.round)).toEqual([1, 2, 3, 4]);
    expect(slots.map((s) => s.intendedAt)).toEqual([
      "2027-03-15T09:00:00.000Z",
      "2027-03-22T09:00:00.000Z",
      "2027-03-29T08:00:00.000Z",
      "2027-04-05T08:00:00.000Z",
    ]);
    expect(weeklyStockholmSlots({ date: "", time: "10:00" }, 4)).toBeNull();
  });
});

describe("buildPanelDraft — exact P2 draft document", () => {
  it("refuses nonexistent (spring gap), ambiguous (autumn fold) and impossible Stockholm times instead of shifting them (Codex C4)", () => {
    // 2027-03-28: Stockholm clocks jump 02:00 → 03:00; 02:30 never happens that day.
    expect(stockholmLocalInstant("2027-03-28", "02:30")).toEqual({
      ok: false,
      reason: "nonexistent",
    });
    expect(stockholmLocalToIso("2027-03-28", "02:30")).toBeNull(); // previously silently became 03:30
    expect(stockholmLocalInstant("2027-03-28", "01:59")).toEqual({
      ok: true,
      iso: "2027-03-28T00:59:00.000Z",
    });
    expect(stockholmLocalInstant("2027-03-28", "03:00")).toEqual({
      ok: true,
      iso: "2027-03-28T01:00:00.000Z",
    });
    // 2027-10-31: clocks fall back 03:00 → 02:00; 02:30 happens twice (CEST then CET) — refused, not guessed.
    expect(stockholmLocalInstant("2027-10-31", "02:30")).toEqual({
      ok: false,
      reason: "ambiguous",
    });
    expect(stockholmLocalInstant("2027-10-31", "01:30")).toEqual({
      ok: true,
      iso: "2027-10-30T23:30:00.000Z",
    });
    expect(stockholmLocalInstant("2027-10-31", "03:30")).toEqual({
      ok: true,
      iso: "2027-10-31T02:30:00.000Z",
    });
    // Ordinary times on both sides of the transitions, and impossible calendar dates.
    expect(stockholmLocalInstant("2027-03-27", "02:30")).toEqual({
      ok: true,
      iso: "2027-03-27T01:30:00.000Z",
    });
    expect(stockholmLocalInstant("2027-11-01", "02:30")).toEqual({
      ok: true,
      iso: "2027-11-01T01:30:00.000Z",
    });
    expect(stockholmLocalInstant("2027-02-30", "10:00")).toEqual({
      ok: false,
      reason: "invalidDate",
    });
    expect(stockholmLocalInstant("2027-04-31", "10:00")).toEqual({
      ok: false,
      reason: "invalidDate",
    });
    expect(stockholmLocalInstant("2027-13-01", "10:00")).toEqual({
      ok: false,
      reason: "invalidDate",
    });
    // A weekly schedule keeps the same wall-clock across a VALID transition (already covered above) but refuses
    // as a whole when a later round would land in the gap, naming that round.
    expect(weeklyStockholmSlotsResult({ date: "2027-03-21", time: "02:30" }, 4)).toEqual({
      ok: false,
      round: 2,
      reason: "nonexistent",
    });
    expect(weeklyStockholmSlotsResult({ date: "2027-10-24", time: "02:30" }, 2)).toEqual({
      ok: false,
      round: 2,
      reason: "ambiguous",
    });
    const fine = weeklyStockholmSlotsResult({ date: "2027-03-21", time: "10:00" }, 4);
    expect(fine.ok && fine.slots.map((s) => s.intendedAt)).toEqual([
      "2027-03-21T09:00:00.000Z",
      "2027-03-28T08:00:00.000Z",
      "2027-04-04T08:00:00.000Z",
      "2027-04-11T08:00:00.000Z",
    ]);
    // The draft builder surfaces the refusal with the round instead of building a shifted schedule.
    const refused = buildPanelDraft(
      form({ firstSlot: { date: "2027-03-28", time: "02:30" } }),
      PANEL,
      0,
      prompts,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.issues).toEqual(["schedule: round 1 nonexistent"]);
  });
  it("builds a valid discovery draft for the next version with bound questions and a weekly schedule", () => {
    const out = buildPanelDraft(form(), PANEL, 0, prompts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.version).toBe(1);
    expect(out.draft.status).toBe("draft");
    expect(out.draft.approval).toBeNull();
    expect(out.draft.questions.map((q) => q.id)).toEqual(
      prompts.map((_, i) => questionIdFor("AC", "discovery", i)),
    );
    expect(out.draft.questions[0].text).toBe(prompts[0].text); // copied verbatim from the bound prompt
    expect(out.draft.rounds).toBe(4);
    expect(out.draft.schedule?.slots).toHaveLength(4);
    expect(discoveryScheduleValid(out.draft)).toBe(true);
  });
  it("builds an unscheduled brand draft (rounds 0, B-series ids, no schedule key)", () => {
    const out = buildPanelDraft(
      form({ kind: "brand", questionKeys: [`${prompts[0].id}:1`] }),
      PANEL,
      2,
      prompts,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.version).toBe(3);
    expect(out.draft.rounds).toBe(0);
    expect("schedule" in out.draft).toBe(false);
    expect(out.draft.questions[0].id).toBe("AC-B01");
  });
  it("reports schema issues instead of inventing values (unknown prompt keys are dropped, empty surface refused)", () => {
    const out = buildPanelDraft(
      form({ questionKeys: ["not:1"], surface: { ...form().surface, service: "" } }),
      PANEL,
      0,
      prompts,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.startsWith("questions"))).toBe(true);
    expect(out.issues.some((i) => i.startsWith("surface.service"))).toBe(true);
  });
});

describe("lock readiness and stored heads", () => {
  const locked = (over: Partial<PanelProtocol> = {}): PanelProtocol => {
    const built = buildPanelDraft(form(), PANEL, 0, prompts);
    if (!built.ok) throw new Error("fixture");
    return {
      ...built.draft,
      status: "locked",
      version: 2,
      approval: {
        approvedBy: "00000000-0000-4000-8000-000000000001",
        approvedAt: "2026-09-26T10:00:00.000Z",
      },
      ...over,
    } as PanelProtocol;
  };
  it("lists the exact reasons a discovery draft cannot lock yet, and none when it can", () => {
    const now = Date.parse("2026-09-26T10:00:00Z");
    const ready = buildPanelDraft(form(), PANEL, 0, prompts);
    if (!ready.ok) throw new Error("fixture");
    expect(lockIssues(ready.draft, now)).toEqual([]);
    const nine = buildPanelDraft(
      form({ questionKeys: form().questionKeys.slice(0, 9) }),
      PANEL,
      0,
      prompts,
    );
    if (!nine.ok) throw new Error("fixture");
    expect(lockIssues(nine.draft, now)).toContain("tenQuestions");
    const past = buildPanelDraft(
      form({ firstSlot: { date: "2020-01-06", time: "10:00" } }),
      PANEL,
      0,
      prompts,
    );
    if (!past.ok) throw new Error("fixture");
    expect(lockIssues(past.draft, now)).toContain("scheduleProspective");
    expect(lockIssues(locked(), now)).toContain("notDraft");
    const dup = buildPanelDraft(
      form({ questionKeys: Array(10).fill(`${prompts[0].id}:1`) }),
      PANEL,
      0,
      prompts,
    );
    if (!dup.ok) throw new Error("fixture");
    expect(lockIssues(dup.draft, now)).toContain("distinctQuestions");
  });
  it("heads, current version and lockable scopes come from the stored versions only", () => {
    const d1 = buildPanelDraft(form(), PANEL, 0, prompts);
    if (!d1.ok) throw new Error("fixture");
    const v2 = locked();
    const other = locked({ panelId: "40000000-0000-4000-8000-000000000002", version: 1 });
    expect(currentPanelVersion([d1.draft, v2], PANEL)).toBe(2);
    expect(currentPanelVersion([d1.draft, v2], "40000000-0000-4000-8000-000000000009")).toBe(0);
    expect(panelHeads([d1.draft, v2, other]).map((p) => [p.panelId, p.version])).toEqual([
      [PANEL, 2],
      [other.panelId, 1],
    ]);
    expect(lockedScopes([d1.draft, v2, other]).map((s) => s.panelVersion)).toEqual([2, 1]);
    expect(lockedScopes([d1.draft])).toEqual([]);
  });
  it("round-trips a stored draft back into the edit form (first slot in Stockholm wall-clock)", () => {
    const d1 = buildPanelDraft(form(), PANEL, 0, prompts);
    if (!d1.ok) throw new Error("fixture");
    const f = formFromPanel(d1.draft);
    expect(f.firstSlot).toEqual({ date: "2027-01-04", time: "10:00" });
    expect(f.questionKeys).toEqual(form().questionKeys);
    expect(f.client).toEqual({ name: "Acme Massage", market: "SE" });
  });
});

describe("panel coverage entries (CG-03B)", () => {
  const OWNER = "00000000-0000-4000-8000-000000000001";
  const BRAND = "40000000-0000-4000-8000-0000000000b1";
  const RUN = "50000000-0000-4000-8000-0000000000aa";
  const discovery = (version: number, over: Partial<PanelProtocol> = {}): PanelProtocol => {
    const built = buildPanelDraft(form(), PANEL, 0, prompts);
    if (!built.ok) throw new Error("fixture");
    return {
      ...built.draft,
      version,
      status: "locked",
      approval: { approvedBy: OWNER, approvedAt: `2026-09-0${version}T10:00:00.000Z` },
      ...over,
    } as PanelProtocol;
  };
  const brand = (): PanelProtocol =>
    ({
      ...discovery(1),
      panelId: BRAND,
      kind: "brand",
      questions: [discovery(1).questions[0]],
      rounds: 0,
      schedule: null,
    }) as PanelProtocol;
  const report = (panelId: string, panelVersion: number, over: Partial<CitationReport> = {}) =>
    ({
      panelId,
      panelVersion,
      kind: "discovery",
      planned: 40,
      observed: 3,
      erased: 1,
      erasedExtra: 0,
      liveExtra: 0,
      recorded: 4,
      neverObserved: 36,
      coverageComplete: true,
      excluded: 0,
      outcomes: { complete: 2, failed: 1, truncated: 0, missed: 0, protocol_deviant: 0 },
      brandRuns: [],
      ...over,
    }) as CitationReport;
  const run: BrandRun = {
    id: RUN,
    panelId: BRAND,
    panelVersion: 1,
    approvedBy: OWNER,
    approvedAt: "2026-09-02T08:00:00.000Z",
    observationBudget: 5,
    rounds: 1,
  };

  it("shows every locked version, including one behind a newer draft head, and never a draft", () => {
    const panels = [discovery(1), discovery(2), discovery(3, { status: "draft", approval: null })];
    // The authoring list shows only the draft head; coverage still lists both locked versions.
    expect(panelHeads(panels).map((p) => [p.version, p.status])).toEqual([[3, "draft"]]);
    const entries = panelCoverageEntries({
      panels,
      brandRuns: [],
      reports: [report(PANEL, 1), report(PANEL, 2)],
    });
    expect(entries.map((e) => [e.panel.version, e.report?.panelVersion])).toEqual([
      [2, 2],
      [1, 1],
    ]);
  });

  it("joins reports by semantic panel id and keeps a missing report explicit", () => {
    const upper = report(PANEL.toUpperCase(), 2);
    const entries = panelCoverageEntries({
      panels: [discovery(1), discovery(2)],
      brandRuns: [],
      reports: [upper],
    });
    expect(entries[0].report).toBe(upper); // the server's object, not a re-derived copy
    expect(entries[0].key).toBe(`${PANEL.toLowerCase()}:2`);
    expect(entries[1].report).toBeNull();
  });

  it("joins brand rows to their approved run and keeps the authoritative consumption", () => {
    const row = {
      runId: RUN.toUpperCase(),
      approvedBudget: 5,
      consumed: 2,
      observed: 0,
      erased: 1,
    };
    const orphan = {
      runId: "50000000-0000-4000-8000-0000000000ff",
      approvedBudget: 3,
      consumed: 1,
      observed: 1,
      erased: 0,
    };
    const [entry] = panelCoverageEntries({
      panels: [brand()],
      brandRuns: [run],
      reports: [
        report(BRAND, 1, {
          kind: "brand",
          planned: 0,
          observed: 1,
          erased: 1,
          recorded: 2,
          neverObserved: 0,
          brandRuns: [row, orphan],
        }),
      ],
    });
    expect(entry.runs).toEqual([
      { row, run },
      { row: orphan, run: null },
    ]);
    // consumed (2) exceeds observed + erased (0 + 1) and is passed through untouched.
    expect(entry.runs[0].row.consumed).toBe(2);
  });

  it("orders panels by their newest locked version, then versions newest first", () => {
    const entries = panelCoverageEntries({
      panels: [discovery(1), brand(), discovery(2)],
      brandRuns: [run],
      reports: [report(PANEL, 1), report(PANEL, 2), report(BRAND, 1, { kind: "brand" })],
    });
    expect(entries.map((e) => `${e.panel.kind}:${e.panel.version}`)).toEqual([
      "discovery:2",
      "discovery:1",
      "brand:1",
    ]);
  });
});
