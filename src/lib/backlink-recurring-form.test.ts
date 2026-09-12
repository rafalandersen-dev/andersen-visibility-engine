import { expect, it } from "vitest";
import { backlinkMonitorCap, backlinkMonitorForm } from "./backlink-recurring-form";
import { backlinkRecurringCopy } from "@/i18n/backlink-recurring";
it.each([
  ["0", 0],
  ["100", 100000000],
  ["0.024252", 24252],
  ["0,024252", 24252],
  [" 1.2 ", 1200000],
])("parses the exact decimal USD entry %s", (raw, expected) => {
  expect(backlinkMonitorCap(String(raw))).toBe(expected);
});
it.each([
  "",
  "1e2",
  "-1",
  "100.000001",
  "0.0000001",
  "1,000.00",
  "01",
  "Infinity",
  "NaN",
  ".5",
  "1.",
])("rejects ambiguous or out-of-range money %s", (value) => {
  expect(() => backlinkMonitorCap(value)).toThrow();
});
it("allows zero while paused but requires the complete request ceiling when enabled", () => {
  const draft = {
    enabled: false,
    cadence: "weekly" as const,
    lookbackDays: "7",
    includeSubdomains: false,
    cap: "0",
  };
  expect(backlinkMonitorForm(draft).monthlyCapMicrousd).toBe(0);
  expect(() => backlinkMonitorForm({ ...draft, enabled: true })).toThrow();
  expect(() => backlinkMonitorForm({ ...draft, enabled: true, cap: "0.024251" })).toThrow();
  expect(backlinkMonitorForm({ ...draft, enabled: true, cap: "0.024252" }).monthlyCapMicrousd).toBe(
    24252,
  );
  expect(() => backlinkMonitorForm({ ...draft, lookbackDays: "1.5" })).toThrow();
});
it("keeps all owner controls and amount/date placeholders available in every current UI language", () => {
  const base = backlinkRecurringCopy.en;
  for (const dict of Object.values(backlinkRecurringCopy)) {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(base).sort());
    for (const key of Object.keys(base)) {
      expect(dict[key].length).toBeGreaterThan(0);
      expect(dict[key].match(/\{\w+\}/g)?.sort()).toEqual(base[key].match(/\{\w+\}/g)?.sort());
    }
  }
});
