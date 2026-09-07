import { describe, expect, it } from "vitest";
import { unfilledSchedulerSlots } from "./auto-scheduler";
const slots = [1, 2, 3, 4].map((day) => ({
  publishAt: `2026-10-0${day}T07:00:00.000Z`,
  localDate: `2026-10-0${day}`,
}));
describe("resumed cadence capacity", () => {
  it("counts a queued draft once and preserves later free places", () => {
    expect(
      unfilledSchedulerSlots(
        slots,
        [slots[0].publishAt],
        [{ autoSchedulerPlannedAt: slots[0].publishAt, scheduledPublishAt: slots[0].publishAt }],
      ),
    ).toEqual(slots.slice(1));
  });
  it("reserves held drafts separately from unrelated bookings", () => {
    expect(
      unfilledSchedulerSlots(
        slots,
        [slots[0].publishAt],
        [{ autoSchedulerPlannedAt: slots[2].publishAt }],
      ),
    ).toEqual([slots[1], slots[3]]);
  });
  it("reserves old month-only drafts in available slots", () => {
    expect(unfilledSchedulerSlots(slots, [slots[0].publishAt], [{}])).toEqual(slots.slice(2));
  });
  it("recognizes equivalent timestamps and old scheduled drafts", () => {
    expect(
      unfilledSchedulerSlots(
        slots,
        [slots[0].publishAt],
        [{ scheduledPublishAt: "2026-10-01T09:00:00+02:00" }],
      ),
    ).toEqual(slots.slice(1));
  });
  it("returns no new work when legacy drafts fill capacity", () => {
    expect(unfilledSchedulerSlots(slots, [], [{}, {}, {}, {}, {}])).toEqual([]);
  });
});
