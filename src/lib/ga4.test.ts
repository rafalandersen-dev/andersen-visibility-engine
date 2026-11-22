import { describe, expect, it } from "vitest";
import { ga4Range, isGa4RolloutProject, summarizeGa4Batch } from "./ga4";

describe("isGa4RolloutProject", () => {
  it("accepts only the Synergy Massage site over https", () => {
    expect(isGa4RolloutProject({ websiteUrl: "https://synergymassage.se" })).toBe(true);
    expect(isGa4RolloutProject({ websiteUrl: "https://WWW.SynergyMassage.se/boka" })).toBe(true);
  });
  it.each([
    "http://synergymassage.se",
    "https://synergymassage.se.example.com",
    "https://evil-synergymassage.se",
    "https://example.com/?u=synergymassage.se",
    "synergymassage.se",
    "",
  ])("rejects %s", (websiteUrl) => {
    expect(isGa4RolloutProject({ websiteUrl })).toBe(false);
  });
  it("rejects missing projects and non-string urls", () => {
    expect(isGa4RolloutProject(undefined)).toBe(false);
    expect(isGa4RolloutProject({ websiteUrl: 1 })).toBe(false);
  });
});

describe("ga4Range", () => {
  it("ends yesterday in the property time zone and spans 28 days", () => {
    // 23:30 UTC on 21 Nov is already 22 Nov in Stockholm.
    const now = new Date("2026-11-21T23:30:00Z");
    expect(ga4Range("Europe/Stockholm", now)).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-11-21",
    });
    expect(ga4Range("UTC", now)).toEqual({ startDate: "2026-10-24", endDate: "2026-11-20" });
    expect(ga4Range("Not/AZone", now)).toBeNull();
  });
});

const report = (rows: [string[], string][], metadata = {}) => ({
  rows: rows.map(([dims, v]) => ({
    dimensionValues: dims.map((value) => ({ value })),
    metricValues: [{ value: v }],
  })),
  metadata,
});

describe("summarizeGa4Batch", () => {
  it("separates measured zero from not measured", () => {
    const f = summarizeGa4Batch({
      reports: [
        report([[["chatgpt.com"], "7"], [["chat.openai.com"], "2"]]),
        report([[["chatgpt.com", "booking_click"], "3"]]),
        // booking_completed recorded elsewhere in the property, booking_click too.
        report([[["booking_click"], "10"], [["booking_completed"], "4"]]),
      ],
    });
    expect(f).toEqual({ chatgptSessions: 9, bookingClicks: 3, bookingCompleted: 0, partial: false });
  });
  it("reports an event never recorded as not measured", () => {
    const f = summarizeGa4Batch({ reports: [report([]), report([]), report([])] });
    expect(f).toMatchObject({ chatgptSessions: 0, bookingClicks: null, bookingCompleted: null });
  });
  it("turns zeros into not measured when GA4 thresholded the data", () => {
    const f = summarizeGa4Batch({
      reports: [
        report([], { subjectToThresholding: true }),
        report([]),
        report([[["booking_completed"], "4"]]),
      ],
    });
    expect(f).toMatchObject({ chatgptSessions: null, bookingCompleted: null, partial: true });
  });
  it("rejects malformed responses", () => {
    expect(() => summarizeGa4Batch({ reports: [] })).toThrow();
    expect(() =>
      summarizeGa4Batch({ reports: [report([[["chatgpt.com"], "-1"]]), report([]), report([])] }),
    ).toThrow();
  });
});
