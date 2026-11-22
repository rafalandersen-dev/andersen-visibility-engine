import { describe, expect, it } from "vitest";
import {
  EMPTY_CHATGPT_FORM,
  MAX_CHATGPT_REPORTS,
  MAX_DISCOVERY_TOPICS,
  applyBusinessHubPaste,
  applyGa4ApiSnapshot,
  buildChatGptReport,
  chatGptPeriodStart,
  chatGptReportToForm,
  normalizeChatGptReports,
  parseBusinessHubPaste,
  parseChatGptCount,
  parseDiscoveryTopics,
  removeChatGptReport,
  upsertChatGptReport,
  type ChatGptReportForm,
} from "@/lib/chatgpt-channel";
import type { Ga4ApiSnapshot } from "@/lib/types";

const NOW = new Date("2026-11-21T10:00:00Z");
const form = (patch: Partial<ChatGptReportForm> = {}): ChatGptReportForm => ({
  ...EMPTY_CHATGPT_FORM,
  periodEnd: "2026-11-20",
  sessions: "12",
  ...patch,
});
function build(patch?: Partial<ChatGptReportForm>) {
  const res = buildChatGptReport(form(patch), NOW);
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.report;
}

describe("chatGptPeriodStart", () => {
  it("spans exactly 28 inclusive days", () => {
    expect(chatGptPeriodStart("2026-11-20")).toBe("2026-10-24");
    expect(chatGptPeriodStart("2024-03-01")).toBe("2024-02-03");
  });
  it("rejects malformed and impossible dates", () => {
    expect(chatGptPeriodStart("2026-02-30")).toBeNull();
    expect(chatGptPeriodStart("20-11-2026")).toBeNull();
    expect(chatGptPeriodStart("")).toBeNull();
  });
});

describe("parseChatGptCount", () => {
  it("distinguishes unknown (blank) from a measured zero", () => {
    expect(parseChatGptCount("")).toEqual({ ok: true, value: null });
    expect(parseChatGptCount("  ")).toEqual({ ok: true, value: null });
    expect(parseChatGptCount("0")).toEqual({ ok: true, value: 0 });
    expect(parseChatGptCount(" 42 ")).toEqual({ ok: true, value: 42 });
  });
  it("rejects negatives, decimals, text and oversized values", () => {
    for (const bad of ["-1", "1.5", "1,000", "abc", "1e3", "1234567890"]) {
      expect(parseChatGptCount(bad)).toEqual({ ok: false });
    }
  });
});

describe("parseDiscoveryTopics", () => {
  it("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(parseDiscoveryTopics(" Spa  weekends \n\nspa weekends\nCity breaks\r\n")).toEqual([
      "Spa weekends",
      "City breaks",
    ]);
    expect(parseDiscoveryTopics("")).toEqual([]);
  });
  it("rejects too many or too long topics", () => {
    const many = Array.from({ length: MAX_DISCOVERY_TOPICS + 1 }, (_, i) => `t${i}`).join("\n");
    expect(parseDiscoveryTopics(many)).toBeNull();
    expect(parseDiscoveryTopics("x".repeat(81))).toBeNull();
  });
});

describe("buildChatGptReport", () => {
  it("keeps unknown as null and zero as 0 in every field", () => {
    const report = build({ mentions: "0", clicks: "", bookingClicks: "", bookingCompleted: "0" });
    expect(report.businessHub.mentions).toBe(0);
    expect(report.businessHub.clicks).toBeNull();
    expect(report.ga4.chatgptSessions).toBe(12);
    expect(report.ga4.bookingClicks).toBeNull();
    expect(report.ga4.bookingCompleted).toBe(0);
  });
  it("records the period, id and source labels", () => {
    const report = build();
    expect(report.periodStart).toBe("2026-10-24");
    expect(report.periodEnd).toBe("2026-11-20");
    expect(report.id).toBe("2026-10-24_2026-11-20");
    expect(report.businessHub.source).toBe("chatgpt_business_hub");
    expect(report.ga4.source).toBe("ga4");
  });
  it("rejects a report with nothing entered", () => {
    expect(buildChatGptReport(form({ sessions: "" }), NOW)).toEqual({ ok: false, error: "empty" });
  });
  it("accepts topics alone as a measurement", () => {
    expect(build({ sessions: "", topics: "Spa weekends" }).businessHub.discoveryTopics).toEqual([
      "Spa weekends",
    ]);
  });
  it("validates period, future dates, counts and topics", () => {
    const err = (patch: Partial<ChatGptReportForm>) => {
      const res = buildChatGptReport(form(patch), NOW);
      return res.ok ? "ok" : res.error;
    };
    expect(err({ periodEnd: "" })).toBe("period");
    expect(err({ periodEnd: "2019-01-31" })).toBe("period");
    expect(err({ periodEnd: "2026-11-22" })).toBe("future");
    expect(err({ periodEnd: "2026-11-21" })).toBe("ok");
    expect(err({ clicks: "-3" })).toBe("count");
    expect(err({ topics: "x".repeat(81) })).toBe("topics");
  });
});

describe("history upsert / edit", () => {
  it("adds newest first and replaces the same period in place", () => {
    const older = build({ periodEnd: "2026-10-23", sessions: "5" });
    const newer = build({ periodEnd: "2026-11-20", sessions: "12" });
    let list = upsertChatGptReport([], older);
    expect(list.ok && list.reports.map((r) => r.periodEnd)).toEqual(["2026-10-23"]);
    list = upsertChatGptReport(list.ok ? list.reports : [], newer);
    expect(list.ok && list.reports.map((r) => r.periodEnd)).toEqual(["2026-11-20", "2026-10-23"]);

    const edited = {
      ...build({ periodEnd: "2026-11-20", sessions: "0", mentions: "3" }),
      createdAt: "2099-01-01T00:00:00.000Z",
    };
    const res = upsertChatGptReport(list.ok ? list.reports : [], edited);
    if (!res.ok) throw new Error("unexpected");
    expect(res.replaced).toBe(true);
    expect(res.reports).toHaveLength(2);
    expect(res.reports[0].ga4.chatgptSessions).toBe(0);
    expect(res.reports[0].businessHub.mentions).toBe(3);
    expect(res.reports[0].createdAt).toBe(newer.createdAt);
  });
  it("round-trips a report through the edit form", () => {
    const report = build({ mentions: "0", topics: "A\nB", bookingCompleted: "2" });
    const again = buildChatGptReport(chatGptReportToForm(report), NOW);
    expect(again.ok && again.report.businessHub).toEqual(report.businessHub);
    expect(again.ok && again.report.ga4).toEqual(report.ga4);
  });
  it("enforces capacity for new periods but not for edits", () => {
    const reports = Array.from({ length: MAX_CHATGPT_REPORTS }, (_, i) => {
      const day = new Date(Date.UTC(2024, 0, 1) + i * 28 * 86_400_000).toISOString().slice(0, 10);
      return build({ periodEnd: day });
    });
    expect(upsertChatGptReport(reports, build({ periodEnd: "2026-11-20" }))).toEqual({
      ok: false,
      error: "capacity",
    });
    expect(upsertChatGptReport(reports, reports[0]).ok).toBe(true);
  });
  it("removes by id", () => {
    const report = build();
    expect(removeChatGptReport([report], report.id)).toEqual([]);
  });
});

describe("normalizeChatGptReports", () => {
  it("returns [] for non-arrays and drops malformed entries", () => {
    expect(normalizeChatGptReports(undefined)).toEqual([]);
    expect(normalizeChatGptReports({})).toEqual([]);
    expect(normalizeChatGptReports([null, 3, { periodEnd: "nope" }])).toEqual([]);
  });
  it("preserves valid reports and turns invalid counts into unknown, not zero", () => {
    const report = build({ mentions: "0" });
    const dirty = {
      ...report,
      ga4: { ...report.ga4, chatgptSessions: -4, bookingClicks: "7" },
    };
    const [out] = normalizeChatGptReports([dirty]);
    expect(out.businessHub.mentions).toBe(0);
    expect(out.ga4.chatgptSessions).toBeNull();
    expect(out.ga4.bookingClicks).toBeNull();
  });
});

describe("Business Hub paste", () => {
  const SUMMARY =
    "Overview\nMentions\nUnavailable\nProfile views\nUnavailable\nWebsite clicks\nUnavailable\n";
  it("reads the real English summary: Unavailable is not measured, never zero", () => {
    expect(parseBusinessHubPaste(SUMMARY)).toEqual({ mentions: null, clicks: null });
  });
  it("reads displayed whole numbers, inline or on the next line, and ignores Profile views", () => {
    expect(parseBusinessHubPaste("Mentions 1,204\nProfile views 88\nWebsite clicks:\n0")).toEqual({
      mentions: 1204,
      clicks: 0,
    });
  });
  it("distinguishes a missing label from an unreadable or conflicting value", () => {
    expect(parseBusinessHubPaste("Profile views 5")).toEqual({
      mentions: "missing",
      clicks: "missing",
    });
    expect(parseBusinessHubPaste("Mentions 1.2K\nWebsite clicks 3\nWebsite clicks 4")).toEqual({
      mentions: "unreadable",
      clicks: "unreadable",
    });
  });
  it("ignores chart captions next to a summary value", () => {
    expect(parseBusinessHubPaste("Mentions 12\nMentions over time\nJan Feb")).toMatchObject({
      mentions: 12,
    });
  });
  it("fills only readable fields and reports replaced entries instead of overwriting silently", () => {
    const res = applyBusinessHubPaste(
      { ...EMPTY_CHATGPT_FORM, periodEnd: "2026-11-20", mentions: "5", clicks: "" },
      { mentions: null, clicks: "missing" },
    );
    expect(res.form).toMatchObject({ periodEnd: "2026-11-20", mentions: "", clicks: "" });
    expect(res).toMatchObject({ filled: ["mentions"], replaced: ["mentions"], missing: ["clicks"] });
    const same = applyBusinessHubPaste({ ...EMPTY_CHATGPT_FORM, clicks: "7" }, { mentions: 3, clicks: 7 });
    expect(same.replaced).toEqual([]);
  });
});

describe("applyGa4ApiSnapshot", () => {
  const snap = (): Ga4ApiSnapshot => ({
    source: "ga4_api",
    propertyId: "123",
    propertyName: "Synergy",
    timeZone: "Europe/Stockholm",
    chatgptSessions: 4,
    bookingClicks: null,
    bookingCompleted: 0,
    partial: false,
    fetchedAt: NOW.toISOString(),
  });
  const period = (periodStart: string, periodEnd: string) => ({ periodStart, periodEnd });
  it("keeps manual figures of the same period and never invents a period", () => {
    const manual = build({ periodEnd: "2026-11-20", sessions: "12" });
    const res = applyGa4ApiSnapshot([manual], manual, snap(), NOW);
    expect(res.ok && res.reports[0]).toMatchObject({ ga4: manual.ga4, ga4Api: snap() });
    expect(applyGa4ApiSnapshot([], period("2026-10-01", "2026-11-20"), snap(), NOW)).toEqual({
      ok: false,
      error: "period",
    });
  });
  it("supersedes API-only reports of older windows but never manual ones", () => {
    const manual = build({ periodEnd: "2026-11-10" });
    const older = applyGa4ApiSnapshot([manual], period("2026-10-22", "2026-11-18"), snap(), NOW);
    if (!older.ok) throw new Error("expected ok");
    const next = applyGa4ApiSnapshot(older.reports, period("2026-10-24", "2026-11-20"), snap(), NOW);
    expect(next.ok && next.reports.map((r) => r.periodEnd)).toEqual(["2026-11-20", "2026-11-10"]);
  });
  it("a manual save keeps the API figures of its period", () => {
    const res = upsertChatGptReport([{ ...build(), ga4Api: snap() }], build({ sessions: "20" }));
    expect(res.ok && res.reports[0]).toMatchObject({
      ga4: { chatgptSessions: 20 },
      ga4Api: snap(),
    });
  });
});
