/**
 * Calendar scheduling helpers — readiness mirrors the fire-time gate, the
 * default slot lands on the owner's 09:00 rule (or the nearest valid slot on
 * the dropped day), and the risk selector flags everything dated soon that
 * would fail to publish — including armed go-lives that regressed after arming.
 */
import { describe, it, expect } from "vitest";
import { publishReadiness, defaultGoLiveLocal, upcomingPublishRisks } from "./calendar-schedule";
import type { ContentAsset, Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://site.com",
    publishMode: "manualLive",
    ...over,
  }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    status: "Approved",
    markdown: "## Body\n\ntext",
    ...over,
  }) as ContentAsset;

describe("publishReadiness — mirrors the fire-time contract", () => {
  it("approved + live mode + no blockers → ready", () => {
    const a = asset();
    expect(publishReadiness(a, project(), [a])).toEqual({ ready: true, reasons: [] });
  });

  it("Exported also counts as approved (fire-time accepts both)", () => {
    const a = asset({ status: "Exported" });
    expect(publishReadiness(a, project(), [a]).ready).toBe(true);
  });

  it("no draft at all → not ready, says so", () => {
    const r = publishReadiness(undefined, project(), []);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/No draft/);
  });

  it("unapproved draft → not ready", () => {
    const a = asset({ status: "In Review" });
    const r = publishReadiness(a, project(), [a]);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Not approved/);
  });

  it("draft-only project → not ready even when the draft is approved", () => {
    const a = asset();
    const r = publishReadiness(a, project({ publishMode: "draftOnly" }), [a]);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/publish mode/);
  });

  it("a checklist blocker (unresolved internal link) → not ready, reason surfaced", () => {
    const a = asset({ markdown: "See [x](/made-up-page)." });
    const r = publishReadiness(a, project(), [a]);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/unresolved internal link/i);
  });

  it("already live → not ready to schedule again", () => {
    const a = asset({ livePublishStatus: "published" });
    expect(publishReadiness(a, project(), [a]).ready).toBe(false);
  });
});

describe("defaultGoLiveLocal — the 09:00 rule", () => {
  const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi);

  it("a future day → 09:00 local on that day", () => {
    const slot = defaultGoLiveLocal(local(2026, 6, 25), local(2026, 6, 22, 10, 0));
    expect(slot).toBe("2026-07-25T09:00");
  });

  it("today before the lead window → still 09:00", () => {
    const slot = defaultGoLiveLocal(local(2026, 6, 22), local(2026, 6, 22, 6, 0));
    expect(slot).toBe("2026-07-22T09:00");
  });

  it("today after 09:00 → nearest future slot on the 5-minute grid", () => {
    // now 10:23 → +15 min = 10:38 → rounded up to 10:40
    const slot = defaultGoLiveLocal(local(2026, 6, 22), local(2026, 6, 22, 10, 23));
    expect(slot).toBe("2026-07-22T10:40");
  });

  it("a past day → null (cannot be armed)", () => {
    expect(defaultGoLiveLocal(local(2026, 6, 20), local(2026, 6, 22, 10, 0))).toBeNull();
  });

  it("today with no room left before midnight → null, never silently tomorrow", () => {
    expect(defaultGoLiveLocal(local(2026, 6, 22), local(2026, 6, 22, 23, 50))).toBeNull();
  });

  it("a reschedule keeps the original time-of-day on the new date (preferred slot)", () => {
    const slot = defaultGoLiveLocal(local(2026, 6, 25), local(2026, 6, 22, 10, 0), {
      hours: 14,
      minutes: 30,
    });
    expect(slot).toBe("2026-07-25T14:30");
  });

  it("a preferred slot inside the lead window falls back to 09:00, then to the nearest slot", () => {
    // preferred 06:00 today at 10:00 now → past; 09:00 also past → nearest 10:20
    const slot = defaultGoLiveLocal(local(2026, 6, 22), local(2026, 6, 22, 10, 2), {
      hours: 6,
      minutes: 0,
    });
    expect(slot).toBe("2026-07-22T10:20");
  });
});

describe("upcomingPublishRisks — dated soon but will not publish", () => {
  const now = new Date(2026, 6, 22, 10, 0).getTime();

  it("a target within the horizon with no draft is a risk; a ready one is not", () => {
    const ready = asset({ id: "ok1" });
    const risks = upcomingPublishRisks({
      ghosts: [
        { id: "o1", title: "No draft yet", dueAt: "2026-07-24" },
        { id: "o2", title: "Ready one", dueAt: "2026-07-24", assetId: "ok1" },
      ],
      armed: [],
      assets: [ready],
      project: project(),
      now,
    });
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ kind: "target", opportunityId: "o1" });
  });

  it("a target beyond the horizon is ignored", () => {
    const risks = upcomingPublishRisks({
      ghosts: [{ id: "o1", title: "Far", dueAt: "2026-08-20" }],
      armed: [],
      assets: [],
      project: project(),
      now,
    });
    expect(risks).toHaveLength(0);
  });

  it("an ARMED go-live whose asset regressed after arming is flagged (the dangerous case)", () => {
    const regressed = asset({
      id: "arm1",
      status: "In Review", // un-approved after arming — cron will park it
      scheduledPublishAt: "2026-07-24T07:00:00.000Z",
      scheduledPublishStatus: "pending",
    });
    const risks = upcomingPublishRisks({
      ghosts: [],
      armed: [regressed],
      assets: [regressed],
      project: project(),
      now,
    });
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ kind: "armed", assetId: "arm1" });
    expect(risks[0].reasons.join(" ")).toMatch(/Not approved/);
  });

  it("an armed go-live that is still ready is not a risk; results sort soonest first", () => {
    const okArmed = asset({
      id: "arm2",
      scheduledPublishAt: "2026-07-23T07:00:00.000Z",
      scheduledPublishStatus: "pending",
    });
    const risks = upcomingPublishRisks({
      ghosts: [
        { id: "o1", title: "Later", dueAt: "2026-07-27" },
        { id: "o2", title: "Sooner", dueAt: "2026-07-23" },
      ],
      armed: [okArmed],
      assets: [okArmed],
      project: project(),
      now,
    });
    expect(risks.map((r) => r.opportunityId)).toEqual(["o2", "o1"]);
  });
});
