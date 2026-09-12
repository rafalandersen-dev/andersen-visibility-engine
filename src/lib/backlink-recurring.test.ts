import { expect, it } from "vitest";
import { backlinkMonitorSettings, planBacklinkMonitorRun } from "./backlink-recurring";
const settings = {
  enabled: true,
  cadence: "weekly" as const,
  lookbackDays: 7,
  includeSubdomains: false,
  monthlyCapMicrousd: 1_000_000,
};
it("does not plan collection for paused or future settings", () => {
  expect(
    planBacklinkMonitorRun(
      "example.test",
      { ...settings, enabled: false, monthlyCapMicrousd: 0 },
      "2026-09-12T10:00:00Z",
      new Date("2026-09-12T10:00:00Z"),
    ),
  ).toEqual({ state: "paused" });
  expect(
    planBacklinkMonitorRun(
      "example.test",
      settings,
      "2026-09-13T10:00:00Z",
      new Date("2026-09-12T10:00:00Z"),
    ),
  ).toEqual({ state: "not_due", nextDueAt: "2026-09-13T10:00:00.000Z" });
});
it("plans only completed UTC days with the exact saved hostname and bounded price", () => {
  const plan = planBacklinkMonitorRun(
    "www.example.test",
    settings,
    "2026-09-12T10:00:00Z",
    new Date("2026-09-12T10:00:00Z"),
  );
  expect(plan).toMatchObject({
    state: "due",
    occurrenceAt: "2026-09-12T10:00:00.000Z",
    nextDueAt: "2026-09-19T10:00:00.000Z",
    skippedOccurrences: 0,
    scope: {
      target: "www.example.test",
      dateFrom: "2026-09-05",
      dateTo: "2026-09-11",
      includeSubdomains: false,
    },
    expense: { maximumRows: 7, ceilingMicrousd: 24252 },
  });
});
it("skips missed occurrences without moving the saved weekly anchor", () => {
  const plan = planBacklinkMonitorRun(
    "example.test",
    settings,
    "2026-08-01T10:00:00Z",
    new Date("2026-09-12T23:59:59Z"),
  );
  expect(plan).toMatchObject({
    state: "due",
    occurrenceAt: "2026-09-12T10:00:00.000Z",
    nextDueAt: "2026-09-19T10:00:00.000Z",
    skippedOccurrences: 6,
  });
});
it("handles UTC midnight and leap days without local daylight-saving shifts", () => {
  const plan = planBacklinkMonitorRun(
    "example.test",
    { ...settings, cadence: "daily", lookbackDays: 2 },
    "2024-03-01T01:00:00+01:00",
    new Date("2024-03-01T00:00:00Z"),
  );
  expect(plan).toMatchObject({
    state: "due",
    occurrenceAt: "2024-03-01T00:00:00.000Z",
    nextDueAt: "2024-03-02T00:00:00.000Z",
    scope: { dateFrom: "2024-02-28", dateTo: "2024-02-29" },
  });
});
it.each([0, 93, 1.5])("rejects an invalid collection window: %s", (lookbackDays) => {
  expect(() => backlinkMonitorSettings.parse({ ...settings, lookbackDays })).toThrow();
});
it("requires an explicit cap covering one full request before enabling", () => {
  expect(() => backlinkMonitorSettings.parse({ ...settings, monthlyCapMicrousd: 24251 })).toThrow();
  expect(backlinkMonitorSettings.parse({ ...settings, monthlyCapMicrousd: 24252 }).enabled).toBe(
    true,
  );
  expect(() =>
    backlinkMonitorSettings.parse({ ...settings, monthlyCapMicrousd: 100_000_001 }),
  ).toThrow();
});
it.each(["userId", "target", "lease", "nextDueAt", "reservedMicrousd"])(
  "rejects operational authority in settings: %s",
  (key) => {
    expect(() => backlinkMonitorSettings.parse({ ...settings, [key]: "forged" })).toThrow();
  },
);
it("rejects invalid clocks and due times", () => {
  expect(() => planBacklinkMonitorRun("example.test", settings, "yesterday")).toThrow();
  expect(() =>
    planBacklinkMonitorRun("example.test", settings, "2026-09-12T10:00:00Z", new Date(NaN)),
  ).toThrow();
});
