/**
 * CW — weekly prepared work asks for the owner's review through the existing inbox
 * and digest (23 October 2026).
 *
 * The accepted weekly cycle (AGENT_WEEKLY_PLAN step 4) summarises prepared work and
 * the decisions it needs once in-app, with optional digest delivery under existing
 * recipient settings. Weekly drafts had no reminder: approval_due needed an
 * opportunity dueAt or a queued publication, and weekly topics have neither in
 * approve-first. The weekly rule derives one approval_due per saved, delivered
 * weekly draft from the stage records (never a summary action), with a stable key so
 * the inbox upsert and the once-per-notification digest deduplicate it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  operationalNotifications,
  type WeeklyNotificationStage,
} from "./operational-notifications";
import type { ContentAsset, Project, ScheduledPublish } from "./types";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rpc: vi.fn(), query: vi.fn() }));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: mocks.workspace }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from(table: string) {
      const q = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          return mocks.query(table).then(resolve, reject);
        },
      };
      return q;
    },
  },
}));
import { refreshOperationalNotifications } from "./operational-notifications.server";

const owner = "00000000-0000-4000-8000-0000000000a1";
const now = new Date("2026-10-23T15:00:00Z"); // Friday, after preparation
const SAT = "2026-10-31T08:00:00.000Z"; // 09:00 Europe/Stockholm (CET)
const period = "week:2026-10-26";
// Real stage output ids (weekly drafts, opportunities, images) are UUIDs.
const DRAFT = "00000000-0000-4000-8000-0000000000d1";
const OPPORTUNITY = "00000000-0000-4000-8000-0000000000e1";
const IMAGE = "00000000-0000-4000-8000-0000000000f1";
const project = {
  id: "synergy",
  name: "Synergy",
  businessName: "Synergy Massage",
  autoScheduler: {
    enabled: true,
    weekdays: [2, 4, 6],
    publishTime: "09:00",
    timeZone: "Europe/Stockholm",
    mode: "approve_first",
  },
} as unknown as Project;
const draft = (over: Partial<ContentAsset> = {}) =>
  ({
    id: DRAFT,
    projectId: "synergy",
    title: "Desk, neck and shoulder guide",
    status: "Draft",
    updatedAt: "2026-10-23T14:20:00Z",
    ...over,
  }) as unknown as ContentAsset;
const stage = (
  kind: WeeklyNotificationStage["stage"],
  over: Partial<WeeklyNotificationStage> = {},
): WeeklyNotificationStage => ({
  projectId: "synergy",
  period,
  publishAt: SAT,
  stage: kind,
  state: "retained",
  requestId: `00000000-0000-4000-8000-00000000000${["research", "content", "image"].indexOf(kind) + 1}`,
  outputId: kind === "content" ? DRAFT : kind === "image" ? IMAGE : OPPORTUNITY,
  deliveredAt: "2026-10-23T14:20:00Z",
  ...over,
});
const complete = () => [stage("research"), stage("content"), stage("image")];
const weeklyEvents = (
  stages: WeeklyNotificationStage[],
  assets: ContentAsset[] = [draft()],
  extra: { scheduled?: ScheduledPublish[]; at?: Date; projects?: Project[] } = {},
) =>
  operationalNotifications({
    projects: extra.projects ?? [project],
    assets,
    opportunities: [],
    scheduled: extra.scheduled ?? [],
    weeklyStages: stages,
    now: extra.at ?? now,
  }).filter((e) => e.kind === "approval_due");

describe("CW weekly review reminder (pure rule)", () => {
  it("asks once for a saved, delivered weekly draft, due at its slot, with full coverage", () => {
    const events = weeklyEvents(complete());
    expect(events).toEqual([
      {
        key: JSON.stringify([
          "synergy",
          "approval_due",
          DRAFT,
          `weekly:${stage("content").requestId}`,
        ]),
        kind: "approval_due",
        projectId: "synergy",
        targetId: DRAFT,
        title: "Desk, neck and shoulder guide",
        dueAt: SAT,
        detail: { timeZone: "Europe/Stockholm", plannedPeriod: period, total: 3, missing: 0 },
      },
    ]);
  });

  it("keeps one stable key across rescans, owner edits and in-review status (dedup)", () => {
    const first = weeklyEvents(complete())[0].key;
    const later = weeklyEvents(
      complete(),
      [draft({ status: "In Review", updatedAt: "2026-10-24T09:00:00Z" })],
      { at: new Date("2026-10-24T10:00:00Z") },
    );
    expect(later.map((e) => e.key)).toEqual([first]);
  });

  it("reports partial coverage truthfully when the visual was held or is unknown", () => {
    // Stored stage states are running | unknown | retained | cancelled.
    for (const image of [
      stage("image", { state: "unknown", deliveredAt: null }),
      stage("image", { state: "running", deliveredAt: null }),
    ]) {
      const [event] = weeklyEvents([stage("research"), stage("content"), image]);
      expect(event.detail).toMatchObject({ total: 3, missing: 1 });
    }
    expect(weeklyEvents([stage("research"), stage("content")])[0].detail).toMatchObject({
      missing: 1,
    });
  });

  it("never claims prepared work that was not saved and delivered", () => {
    for (const stages of [
      [stage("research")], // research only: no draft
      [stage("research"), stage("content", { state: "unknown", deliveredAt: null })],
      [stage("research"), stage("content", { state: "running", deliveredAt: null })],
      [stage("research"), stage("content", { deliveredAt: null })], // retained but not delivered
      [], // source refresh held before research: nothing saved
    ])
      expect(weeklyEvents(stages)).toEqual([]);
  });

  it.each([
    ["approved", { status: "Approved" }],
    ["rejected", { status: "Rejected" }],
    ["exported", { status: "Exported" }],
    ["published", { livePublishStatus: "published" }],
  ] as const)("resolves once the owner has decided: %s", (_, change) => {
    expect(weeklyEvents(complete(), [draft(change as Partial<ContentAsset>)])).toEqual([]);
  });

  it("resolves when the draft is removed, the slot is cancelled or the slot has passed", () => {
    expect(weeklyEvents(complete(), [])).toEqual([]);
    expect(weeklyEvents([...complete(), stage("image", { state: "cancelled" })])).toEqual([]);
    expect(weeklyEvents(complete(), [draft()], { at: new Date("2026-10-31T08:00:00Z") })).toEqual(
      [],
    );
  });

  it("does not cross projects: a stage cannot name another project's draft", () => {
    const foreign = draft({ projectId: "other" });
    expect(weeklyEvents(complete(), [foreign])).toEqual([]);
    expect(weeklyEvents(complete().map((s) => ({ ...s, projectId: "other" })))).toEqual([]);
  });

  it("does not duplicate a queue-based approval reminder for the same draft", () => {
    const queued = {
      id: "00000000-0000-4000-8000-0000000000q1",
      projectId: "synergy",
      assetId: DRAFT,
      publishAt: "2026-10-24T14:00:00Z",
      status: "pending",
      attempts: 0,
      createdAt: "2026-10-23T14:30:00Z",
    } as unknown as ScheduledPublish;
    const events = weeklyEvents(complete(), [draft()], { scheduled: [queued] });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].key)[3]).toBe(
      `${queued.id}:${queued.publishAt}:${draft().updatedAt}`,
    );
  });
});

describe("CW weekly review reminder (server scan)", () => {
  const workspace = (engineProjects: Project[] = [project], assets = [draft()]) =>
    mocks.workspace.mockResolvedValue({
      rev: 9,
      data: { projects: engineProjects, content: assets, opportunities: [] },
    });
  const rpcFor = (engine: "weekly" | "paused" | "monthly", stages: (period: string) => unknown) =>
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "read_workspace_scheduler_controls")
        return { data: [{ projectId: "synergy", engine }], error: null };
      if (name === "read_weekly_preparation_stages") return stages(args.p_period as string);
      return { data: true, error: null };
    });
  const stageRows = () =>
    complete().map((s) => ({
      publishAt: s.publishAt,
      stage: s.stage,
      requestId: s.requestId,
      outputId: s.outputId,
      inputHash: "a".repeat(64),
      state: s.state,
      result: {},
      deliveredAt: s.deliveredAt,
      outputChanged: false,
    }));
  const synced = () =>
    mocks.rpc.mock.calls.find((c) => c[0] === "sync_operational_notifications")?.[1].p_events as
      Array<{ kind: string; targetId: string }> | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "false");
    mocks.query.mockResolvedValue({ data: [], error: null, count: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["weekly", "paused"] as const)(
    "reads the current and next local week and reminds about saved drafts (engine %s)",
    async (engine) => {
      workspace();
      rpcFor(engine, (p) => ({ data: p === period ? stageRows() : [], error: null }));
      expect(await refreshOperationalNotifications(owner, now)).toBe(true);
      const reads = mocks.rpc.mock.calls.filter((c) => c[0] === "read_weekly_preparation_stages");
      expect(reads.map((c) => c[1])).toEqual([
        { p_user: owner, p_project: "synergy", p_period: "week:2026-10-19" },
        { p_user: owner, p_project: "synergy", p_period: period },
      ]);
      expect(
        synced()!
          .filter((e) => e.kind === "approval_due")
          .map((e) => e.targetId),
      ).toEqual([DRAFT]);
    },
  );

  it("a monthly engine reads no weekly stages", async () => {
    workspace();
    rpcFor("monthly", () => ({ data: stageRows(), error: null }));
    await refreshOperationalNotifications(owner, now);
    expect(mocks.rpc.mock.calls.some((c) => c[0] === "read_weekly_preparation_stages")).toBe(false);
  });

  it("a failed stage read aborts the scan, so existing reminders are not resolved by omission", async () => {
    workspace();
    rpcFor("paused", () => ({ data: null, error: { message: "unavailable" } }));
    await expect(refreshOperationalNotifications(owner, now)).rejects.toThrow();
    expect(synced()).toBeUndefined();
  });

  it.each([
    [true, true],
    [true, false],
    [false, true],
  ])(
    "queues a digest only through the existing owner gate (enabled=%s, allowlisted=%s)",
    async (enabled, allowlisted) => {
      vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", enabled ? "true" : "false");
      vi.stubEnv(
        "OPERATIONAL_EMAIL_ALLOWED_USER_IDS",
        allowlisted ? owner : "00000000-0000-4000-8000-0000000000ff",
      );
      workspace();
      rpcFor("weekly", (p) => ({ data: p === period ? stageRows() : [], error: null }));
      await refreshOperationalNotifications(owner, now);
      const digests = mocks.rpc.mock.calls.filter((c) => c[0] === "queue_operational_email_digest");
      expect(digests).toEqual(
        enabled && allowlisted ? [["queue_operational_email_digest", { p_user: owner }]] : [],
      );
    },
  );
});
