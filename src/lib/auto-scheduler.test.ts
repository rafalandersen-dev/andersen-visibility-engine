/**
 * Monthly Auto-Scheduler — pure planning logic. Pins the owner's guardrails:
 * quota is never exceeded, slots are never double-booked, timezone math is
 * DST-exact, candidate order is prioritized→captured by impact, and auto link
 * resolution remaps near-misses / unlinks the rest without ever going stale on
 * occurrence indices.
 */
import { describe, it, expect } from "vitest";
import {
  AUTO_SCHEDULER_DEFAULTS,
  autoResolveInternalLinks,
  closestKnownPath,
  computeMonthlySlots,
  nextMonthOf,
  normalizeAutoSchedulerConfig,
  refillableSuggestions,
  runTarget,
  selectCandidates,
  zonedTimeToUtc,
} from "./auto-scheduler";
import type { DiscoverySuggestion, Opportunity } from "./types";

const opp = (over: Partial<Opportunity>): Opportunity =>
  ({
    id: over.id ?? "o1",
    projectId: "p1",
    title: "T",
    language: "en",
    contentType: "Blog post",
    searchIntent: "informational",
    targetAudience: "aud",
    businessValue: "val",
    recommendedCta: "cta",
    priority: "Medium",
    status: "captured",
    ...over,
  }) as Opportunity;

describe("config normalization", () => {
  it("fills owner defaults and sanitizes junk", () => {
    const c = normalizeAutoSchedulerConfig(undefined);
    expect(c).toMatchObject({ enabled: false, ...AUTO_SCHEDULER_DEFAULTS });
    const dirty = normalizeAutoSchedulerConfig({
      enabled: true,
      weekdays: [9, 2, 2, 0, 4],
      publishTime: "morning",
      timeZone: "  ",
      mode: "yolo" as never,
      summaryEmail: " a@b.se ",
    });
    expect(dirty.weekdays).toEqual([2, 4]);
    expect(dirty.publishTime).toBe("09:00");
    expect(dirty.timeZone).toBe("Europe/Stockholm");
    expect(dirty.mode).toBe("approve_first"); // unknown mode NEVER becomes auto_publish
    expect(dirty.summaryEmail).toBe("a@b.se");
  });
});

describe("timezone math (DST-exact)", () => {
  it("09:00 Stockholm is 07:00Z in summer and 08:00Z in winter", () => {
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 9, day: 15, hour: 9, minute: 0 },
        "Europe/Stockholm",
      ).toISOString(),
    ).toBe("2026-09-15T07:00:00.000Z");
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 12, day: 15, hour: 9, minute: 0 },
        "Europe/Stockholm",
      ).toISOString(),
    ).toBe("2026-12-15T08:00:00.000Z");
  });

  it("throws on an unknown zone (runner reports per-project)", () => {
    expect(() =>
      zonedTimeToUtc({ year: 2026, month: 9, day: 1, hour: 9, minute: 0 }, "Not/AZone"),
    ).toThrow();
  });
});

describe("slot computation", () => {
  const cfg = { weekdays: [2, 4], publishTime: "09:00", timeZone: "Europe/Stockholm" };

  it("September 2026 Tue+Thu yields the 9 real slots at 07:00Z", () => {
    const slots = computeMonthlySlots(2026, 9, cfg);
    expect(slots.map((s) => s.localDate.slice(8))).toEqual([
      "01",
      "03",
      "08",
      "10",
      "15",
      "17",
      "22",
      "24",
      "29",
    ]);
    expect(slots[0].publishAt).toBe("2026-09-01T07:00:00.000Z");
  });

  it("drops already-booked instants (never double-book)", () => {
    const slots = computeMonthlySlots(2026, 9, cfg, ["2026-09-03T07:00:00.000Z"]);
    expect(slots).toHaveLength(8);
    expect(slots.some((s) => s.localDate === "2026-09-03")).toBe(false);
  });

  it("nextMonthOf rolls the year over", () => {
    expect(nextMonthOf(new Date("2026-12-25T06:00:00Z"))).toEqual({ year: 2027, month: 1 });
    expect(nextMonthOf(new Date("2026-08-25T06:00:00Z"))).toEqual({ year: 2026, month: 9 });
  });
});

describe("candidate selection (Planned → Queued, ranked by impact)", () => {
  it("prioritized beats captured; impact then priority within a stage", () => {
    const picked = selectCandidates(
      [
        opp({ id: "cap-high", status: "captured", businessImpact: "high" }),
        opp({ id: "pri-low", status: "prioritized", businessImpact: "low" }),
        opp({ id: "pri-high", status: "prioritized", businessImpact: "high" }),
        opp({ id: "pri-high-P", status: "prioritized", businessImpact: "high", priority: "High" }),
      ],
      3,
    );
    expect(picked.map((o) => o.id)).toEqual(["pri-high-P", "pri-high", "pri-low"]);
  });

  it("never touches active work: drafting+, or anything already carrying a draft", () => {
    const picked = selectCandidates(
      [
        opp({ id: "drafting", status: "drafting" }),
        opp({ id: "scheduled", status: "scheduled" }),
        opp({ id: "has-draft", status: "prioritized", currentContentAssetId: "a1" }),
        opp({ id: "ok", status: "captured" }),
      ],
      10,
    );
    expect(picked.map((o) => o.id)).toEqual(["ok"]);
  });

  it("refill suggestions: suggested-only, deduped, capped", () => {
    const sug = (id: string, status: string, key?: string) =>
      ({ ...opp({ id }), status, deduplicationKey: key ?? id, generatedAt: "x" }) as never;
    const out = refillableSuggestions(
      [
        sug("s1", "suggested", "k"),
        sug("s2", "suggested", "k"), // dupe key
        sug("s3", "accepted"),
        sug("s4", "suggested"),
        sug("s5", "suggested"),
      ] as DiscoverySuggestion[],
      2,
    );
    expect(out.map((s) => s.id)).toEqual(["s1", "s4"]);
  });
});

describe("auto link resolution", () => {
  const active = new Set([
    "/treatments",
    "/massage-recovery/red-light-therapy",
    "/massage-recovery/swedish-massage",
  ]);

  it("near-miss remaps to the closest real page; hopeless links are unlinked", () => {
    expect(closestKnownPath("/massage-recovery/red-light", active)).toBe(
      "/massage-recovery/red-light-therapy",
    );
    expect(closestKnownPath("/pricing-page", active)).toBeNull();
  });

  it("rewrites the body: remap keeps the link, unknown becomes plain text", () => {
    const md = [
      "See [red light](/massage-recovery/red-light) for detail.",
      "Also [our prices](/pricing-page) here.",
      "And [treatments](/treatments) stays untouched.",
    ].join("\n\n");
    const out = autoResolveInternalLinks(md, active);
    expect(out.markdown).toContain("[red light](/massage-recovery/red-light-therapy)");
    expect(out.markdown).toContain("Also our prices here.");
    expect(out.markdown).toContain("[treatments](/treatments)");
    expect(out.remapped).toEqual([
      { from: "/massage-recovery/red-light", to: "/massage-recovery/red-light-therapy" },
    ]);
    expect(out.unlinked).toEqual(["/pricing-page"]);
  });

  it("multiple occurrences of the same broken path all resolve, one at a time", () => {
    const md = "[a](/services) and [b](/services) and [c](/services)";
    const out = autoResolveInternalLinks(md, active);
    expect(out.markdown).toBe("a and b and c");
    expect(out.unlinked).toHaveLength(3);
  });

  it("leaves a fully-resolved body byte-identical", () => {
    const md = "Only [good](/treatments) links here.";
    const out = autoResolveInternalLinks(md, active);
    expect(out.markdown).toBe(md);
    expect(out.remapped).toEqual([]);
    expect(out.unlinked).toEqual([]);
  });
});

describe("quota capping (never exceed)", () => {
  it("target = min(slots, remaining); unlimited (-1) means slots", () => {
    expect(runTarget(9, 4)).toBe(4);
    expect(runTarget(3, 40)).toBe(3);
    expect(runTarget(9, 0)).toBe(0);
    expect(runTarget(9, -1)).toBe(9);
  });
});
