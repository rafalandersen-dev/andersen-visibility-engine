import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  refreshOperationalNotifications,
  listOperationalNotifications,
  runOperationalNotificationSweep,
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
