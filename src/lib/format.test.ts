/**
 * Schedule instants render LOCAL (the wall-clock the user typed into the
 * datetime-local picker); audit timestamps stay UTC-deterministic. The MEDIUM
 * review finding this pins: "schedule 09:00" must never echo back as "07:00".
 */
import { describe, it, expect } from "vitest";
import { formatDateTimeLocal, formatTimeLocal, formatDateTime, formatTime } from "./format";

describe("local formatters echo the picked wall-clock time", () => {
  // Built from LOCAL components, so the expectation holds in every timezone.
  const picked = new Date(2026, 6, 25, 9, 0);

  it("formatTimeLocal returns exactly the picked local time", () => {
    expect(formatTimeLocal(picked)).toBe("09:00");
    expect(formatTimeLocal(picked.toISOString())).toBe("09:00"); // ISO round-trip too
  });

  it("formatDateTimeLocal returns the picked local day + time", () => {
    expect(formatDateTimeLocal(picked)).toBe("25 Jul 2026 · 09:00");
  });

  it("invalid input degrades to a dash, matching the UTC formatters", () => {
    expect(formatTimeLocal("not-a-date")).toBe("—");
    expect(formatDateTimeLocal("not-a-date")).toBe("—");
  });

  it("UTC formatters are unchanged (audit timestamps stay SSR-deterministic)", () => {
    expect(formatTime("2026-07-25T07:00:00.000Z")).toBe("07:00");
    expect(formatDateTime("2026-07-25T07:00:00.000Z")).toBe("25 Jul 2026 · 07:00");
  });
});
