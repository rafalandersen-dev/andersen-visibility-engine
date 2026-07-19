/**
 * Contract tests for scheduling inputs.
 *
 * These exist because both failure modes are invisible in testing and only show
 * up as "my article went live at the wrong time" in production: an ambiguous
 * timestamp silently shifts by the server/client offset, and a lead time
 * shorter than the runner's tick promises minute precision on a five-minute grid.
 */
import { describe, it, expect } from "vitest";
import { hasExplicitZone, SCHEDULE_TICK_MS } from "./schedule.functions";

describe("hasExplicitZone", () => {
  it("accepts UTC instants", () => {
    expect(hasExplicitZone("2026-07-21T09:00:00.000Z")).toBe(true);
    expect(hasExplicitZone("2026-07-21T09:00:00Z")).toBe(true);
  });

  it("accepts explicit offsets in both notations", () => {
    expect(hasExplicitZone("2026-07-21T09:00:00+02:00")).toBe(true);
    expect(hasExplicitZone("2026-07-21T09:00:00-0500")).toBe(true);
  });

  it("rejects zoneless local strings — the CEST/UTC trap", () => {
    // This is exactly what <input type="datetime-local"> hands you.
    expect(hasExplicitZone("2026-07-21T09:00")).toBe(false);
    expect(hasExplicitZone("2026-07-21T09:00:00")).toBe(false);
    expect(hasExplicitZone("2026-07-21")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(hasExplicitZone("  2026-07-21T09:00:00Z  ")).toBe(true);
  });

  it("does not mistake a date-only string with dashes for an offset", () => {
    expect(hasExplicitZone("2026-07-21")).toBe(false);
  });
});

describe("SCHEDULE_TICK_MS", () => {
  it("matches the pg_cron interval the runner is scheduled at", () => {
    // migration 20260719120000_scheduled_publishes.sql schedules '*/5 * * * *'.
    // If that interval changes, this constant and the user-facing copy
    // ("in the next five minutes") must change with it.
    expect(SCHEDULE_TICK_MS).toBe(5 * 60_000);
  });
});
