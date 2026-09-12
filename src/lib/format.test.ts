/**
 * Schedule instants render LOCAL (the wall-clock the user typed into the
 * datetime-local picker); audit timestamps stay UTC-deterministic. The MEDIUM
 * review finding this pins: "schedule 09:00" must never echo back as "07:00".
 */
import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateLocal,
  formatDateShort,
  formatDateTimeLocal,
  formatTimeLocal,
  formatDateTime,
  formatTime,
} from "./format";

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

describe("selected interface calendar text preserves the clock boundary", () => {
  const cases = [
    ["pl", "24 lip 2026", "25 lip 2026"],
    ["sv", "24 juli 2026", "25 juli 2026"],
    ["da", "24. jul. 2026", "25. jul. 2026"],
    ["fr", "24 juil. 2026", "25 juil. 2026"],
  ] as const;

  it.each(cases)(
    "%s audit dates use the UTC day, regardless of source offset",
    (locale, utcDay) => {
      const instant = "2026-07-25T00:30:00+02:00";
      expect(formatDate(instant, locale)).toBe(utcDay);
      expect(formatDateTime(instant, locale)).toBe(`${utcDay} · 22:30`);
    },
  );

  it.each(cases)(
    "%s schedules echo the selected local date and 24-hour time",
    (locale, _utc, localDay) => {
      const picked = new Date(2026, 6, 25, 0, 30);
      const serialized = picked.toISOString();
      expect(formatDateLocal(serialized, locale)).toBe(localDay);
      expect(formatDateTimeLocal(serialized, locale)).toBe(`${localDay} · 00:30`);
      expect(picked.getHours()).toBe(0);
    },
  );

  it("localizes abbreviated weekday text without changing the UTC date", () => {
    const instant = "2026-07-25T00:30:00+02:00";
    expect(formatDateShort(instant, "fr")).toBe("ven. 24 juil.");
  });

  it("keeps English callers and invalid-date output compatible", () => {
    const instant = "2026-07-25T00:30:00+02:00";
    expect(formatDate(instant)).toBe("24 Jul 2026");
    expect(formatDateShort(instant, "en")).toBe("Fri · 24 Jul");
    for (const locale of ["en", "pl", "sv", "da", "fr"]) {
      for (const format of [
        formatDate,
        formatDateShort,
        formatDateTime,
        formatDateLocal,
        formatDateTimeLocal,
      ]) {
        expect(format("not-a-date", locale)).toBe("—");
      }
    }
  });
});
