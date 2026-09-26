import { describe, expect, it } from "vitest";
import {
  buildPanelDraft,
  currentPanelVersion,
  emptyPanelDraftForm,
  formFromPanel,
  lockIssues,
  lockedScopes,
  panelHeads,
  questionIdFor,
  questionIdPrefix,
  stockholmLocalLabel,
  stockholmLocalToIso,
  tzOffsetMinutes,
  weeklyStockholmSlots,
} from "./citation-panel-ui";
import { discoveryScheduleValid, type PanelProtocol } from "./citation-panel";

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
