import { describe, expect, it } from "vitest";
import { formatPlanningDate } from "./planning-date";

describe("localized planning date labels", () => {
  const cases = [
    ["en", "Jan 1, 2026", "Jan 1"],
    ["pl", "1 sty 2026", "1 sty"],
    ["sv", "1 jan. 2026", "1 jan."],
    ["da", "1. jan. 2026", "1. jan."],
  ] as const;

  it.each(cases)("%s retains the intended date-only target", (locale, full, short) => {
    expect(formatPlanningDate("2026-01-01", locale)).toBe(full);
    expect(formatPlanningDate("2026-01-01", locale, false)).toBe(short);
  });

  it.each(cases)("%s preserves the local day of a scheduled instant", (locale, full, short) => {
    const picked = new Date(2026, 0, 1, 0, 30);
    expect(formatPlanningDate(picked.toISOString(), locale)).toBe(full);
    expect(formatPlanningDate(picked, locale, false)).toBe(short);
    expect(picked.getHours()).toBe(0);
    expect(picked.getMinutes()).toBe(30);
  });

  it("retains invalid source text and handles an invalid Date without throwing", () => {
    expect(formatPlanningDate("not-a-date", "pl")).toBe("not-a-date");
    expect(formatPlanningDate(new Date("invalid"), "sv")).toBe("—");
  });
});
