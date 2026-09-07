import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  refreshOperationalNotifications,
  listOperationalNotifications,
  runOperationalNotificationSweep,
  notificationRowSchema,
} from "./operational-notifications.server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rpc: vi.fn(), query: vi.fn(), eq: vi.fn() }));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: mocks.workspace }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from(table: string) {
      const q = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((...args: unknown[]) => {
          mocks.eq(table, ...args);
          return q;
        }),
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
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "false");
  mocks.workspace.mockResolvedValue({
    rev: 7,
    data: { projects: [], content: [], opportunities: [] },
  });
  mocks.query.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("server notification snapshot boundary", () => {
  it("does not render absent capacity evidence as zero", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000001",
      project_id: "p",
      kind: "generation_capacity_low",
      target_id: "p",
      target_title: "Project",
      due_at: null,
      active: true,
      read_at: null,
      created_at: "2026-09-07",
      detail: { timeZone: "UTC" },
    };
    expect(notificationRowSchema.safeParse(row).success).toBe(false);
    const detail = {
      ...row.detail,
      missing: 3,
      total: 5,
      remaining: 1,
      usagePeriod: "2026-09",
      plannedPeriod: "2026-10",
    };
    expect(notificationRowSchema.safeParse({ ...row, detail }).success).toBe(true);
    expect(
      notificationRowSchema.safeParse({ ...row, kind: "generation_capacity_unavailable", detail })
        .success,
    ).toBe(false);
    expect(
      notificationRowSchema.safeParse({ ...row, detail: { ...detail, total: 2 } }).success,
    ).toBe(false);
  });
  it("keeps other operational events available when the allowance source fails", async () => {
    mocks.workspace.mockResolvedValue({
      rev: 7,
      data: {
        projects: [
          {
            id: "p",
            name: "Project",
            businessName: "Business",
            autoScheduler: { enabled: true, weekdays: [2], publishTime: "09:00", timeZone: "UTC" },
          },
        ],
        content: [],
        opportunities: [],
      },
    });
    mocks.query.mockImplementation(async (table) =>
      table === "ai_usage" ? { data: null, error: {} } : { data: [], error: null },
    );
    expect(await refreshOperationalNotifications("owner", new Date("2026-09-07T10:00:00Z"))).toBe(
      true,
    );
    const events = mocks.rpc.mock.calls[0][1].p_events;
    expect(events.map((event: { kind: string }) => event.kind)).toContain("cadence_gap");
    expect(events.map((event: { kind: string }) => event.kind)).toContain(
      "generation_capacity_unavailable",
    );
    expect(events.map((event: { kind: string }) => event.kind)).not.toContain(
      "generation_capacity_low",
    );
  });
  it("scopes recovery reads to the verified owner without selecting ownership tokens", async () => {
    await refreshOperationalNotifications("owner");
    expect(mocks.eq).toHaveBeenCalledWith("auto_scheduler_leases", "user_id", "owner");
  });
  it.each([
    { data: null, error: { message: "private" } },
    { data: [{ project_id: "p" }], error: null },
    { data: Array(1001).fill({}), error: null },
  ])("preserves the inbox when recovery state is unavailable or malformed", async (response) => {
    mocks.query.mockImplementation(async (table) =>
      table === "auto_scheduler_leases" ? response : { data: [], error: null },
    );
    await expect(refreshOperationalNotifications("owner")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("queues email only after a fresh scan and explicit activation", async () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "true");
    await refreshOperationalNotifications("owner");
    expect(mocks.rpc).toHaveBeenLastCalledWith("queue_operational_email_digest", {
      p_user: "owner",
    });
    mocks.rpc.mockClear().mockResolvedValueOnce({ data: false, error: null });
    await refreshOperationalNotifications("owner");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps the inbox available when email queueing fails", async () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "true");
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "private" } });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await refreshOperationalNotifications("owner")).toBe(true);
    expect(log).toHaveBeenCalledWith("Operational digest could not be queued");
  });
  it("scopes queue reads and synchronization to the verified workspace owner", async () => {
    expect(await refreshOperationalNotifications("owner", new Date("2026-09-07T10:00:00Z"))).toBe(
      true,
    );
    expect(mocks.eq).toHaveBeenCalledWith("scheduled_publishes", "user_id", "owner");
    expect(mocks.rpc).toHaveBeenCalledWith("sync_operational_notifications", {
      p_user: "owner",
      p_workspace_rev: 7,
      p_scanned_at: "2026-09-07T10:00:00.000Z",
      p_events: [],
    });
  });
  it("does not clear notifications when a source read is unavailable", async () => {
    mocks.workspace.mockRejectedValue(new Error("unavailable"));
    await expect(refreshOperationalNotifications("owner")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not clear notifications when the queue read fails", async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: "private" } });
    await expect(refreshOperationalNotifications("owner")).rejects.toThrow(
      "notification_queue_unavailable",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refuses a truncated queue snapshot", async () => {
    mocks.query.mockResolvedValue({ data: Array(1001).fill({}), error: null });
    await expect(refreshOperationalNotifications("owner")).rejects.toThrow(
      "notification_queue_unavailable",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves old inbox state when the source revision has moved", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await refreshOperationalNotifications("owner")).toBe(false);
  });
  it("scopes inbox reads and refuses malformed stored events", async () => {
    mocks.query.mockResolvedValue({ data: [{ id: "bad" }], error: null });
    await expect(listOperationalNotifications("owner")).rejects.toThrow();
    expect(mocks.eq).toHaveBeenCalledWith("operational_notifications", "user_id", "owner");
  });
  it("continues past one failing account and only reports counts", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          { user_id: "00000000-0000-4000-8000-000000000041" },
          { user_id: "00000000-0000-4000-8000-000000000042" },
        ],
        error: null,
      })
      .mockResolvedValue({ data: true, error: null });
    mocks.workspace.mockRejectedValueOnce(new Error("private data"));
    expect(await runOperationalNotificationSweep()).toEqual({ scanned: 1, failed: 1, stale: 0 });
  });
});
