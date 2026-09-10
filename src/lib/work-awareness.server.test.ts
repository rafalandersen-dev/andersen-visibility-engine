import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({
  workspace: vi.fn(),
  approval: vi.fn(),
  control: vi.fn(),
  weekly: vi.fn(),
  query: vi.fn(),
  eq: vi.fn(),
  statuses: vi.fn(),
  select: vi.fn(),
}));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: m.workspace }));
vi.mock("./publication-approval.server", () => ({ readPublicationApproval: m.approval }));
vi.mock("./weekly-preparation.server", () => ({
  readSchedulerControl: m.control,
  readWeeklyPreparation: m.weekly,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "scheduled_publishes") throw new Error("unexpected_table");
      const q = {
        select: (...args: unknown[]) => {
          m.select(...args);
          return q;
        },
        in: (...args: unknown[]) => {
          m.statuses(...args);
          return q;
        },
        eq: (...args: unknown[]) => {
          m.eq(...args);
          return q;
        },
        order: () => q,
        limit: m.query,
      };
      return q;
    },
  },
}));
import { readWorkAwareness } from "./work-awareness.server";
const owner = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-10T12:00:00Z");
const asset = { id: "a", projectId: "p", title: "Saved draft", status: "Approved" };
const row = () => ({
  rev: 1,
  data: {
    projects: [{ id: "p", autoScheduler: { enabled: true, timeZone: "UTC" } }],
    content: [asset],
  },
});
const qrow = (status = "review_required", day = "01") => ({
  id: "00000000-0000-4000-8000-000000000002",
  asset_id: "a",
  publish_at: `2026-09-${day}T12:00:00Z`,
  status,
});
beforeEach(() => {
  vi.clearAllMocks();
  m.workspace.mockResolvedValue(row());
  m.approval.mockResolvedValue({ approved: false });
  m.control.mockResolvedValue({ engine: "monthly" });
  m.query.mockResolvedValue({ data: [qrow()], count: 1, error: null });
  m.weekly.mockImplementation(async (_scope, week) => ({
    period: `week:${week}`,
    summary: null,
    readiness: [],
    stages: [],
  }));
});
describe("private live awareness", () => {
  it("filters terminal history before the cap and requests an exact relevant count", async () => {
    await readWorkAwareness(owner, { projectId: "p", page: 0 }, now);
    expect(m.statuses).toHaveBeenCalledWith("status", ["pending", "review_required"]);
    expect(m.select).toHaveBeenCalledWith("id,asset_id,publish_at,status", { count: "exact" });
  });
  it.each([1001, 2, null])(
    "rejects incomplete relevant data with exact count %s",
    async (count) => {
      m.query.mockResolvedValueOnce({ data: [qrow()], count, error: null });
      await expect(readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).rejects.toThrow(
        "awareness_unavailable",
      );
      expect(m.approval).not.toHaveBeenCalled();
    },
  );

  it("includes old review holds despite browser Approved and reads exact saved approval", async () => {
    const result = await readWorkAwareness(owner, { projectId: "p", page: 0 }, now);
    expect(result.approvals).toMatchObject([{ assetId: "a", state: "approval", late: true }]);
    expect(m.eq).toHaveBeenCalledWith("user_id", owner);
    expect(m.eq).toHaveBeenCalledWith("project_id", "p");
    const [scope, deps] = m.approval.mock.calls[0];
    expect(scope).toEqual({ ownerId: owner, projectId: "p", assetId: "a" });
    expect(await deps.read()).toEqual(row());
  });
  it("keeps a genuinely approved hold as resume, then clears it after queue transition", async () => {
    m.approval.mockResolvedValue({ approved: true });
    expect(
      (await readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).approvals[0].state,
    ).toBe("resume");
    m.query.mockResolvedValue({ data: [qrow("pending")], count: 1, error: null });
    expect((await readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).approvals).toEqual(
      [],
    );
  });
  it.each(["cancelled", "published", "publishing", "failed"])(
    "does not turn %s into an approval demand",
    async (status) => {
      m.query.mockResolvedValue({ data: [qrow(status)], count: 1, error: null });
      expect((await readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).approvals).toEqual(
        [],
      );
      expect(m.approval).not.toHaveBeenCalled();
    },
  );
  it("does not demand early approval for distant pending work", async () => {
    m.query.mockResolvedValue({ data: [qrow("pending", "25")], count: 1, error: null });
    expect((await readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).approvals).toEqual(
      [],
    );
  });
  it("denies foreign project before reading queue or approval", async () => {
    await expect(readWorkAwareness(owner, { projectId: "other", page: 0 }, now)).rejects.toThrow();
    expect(m.query).not.toHaveBeenCalled();
    expect(m.approval).not.toHaveBeenCalled();
  });
  it("rejects incomplete queue and unavailable approvals rather than inventing empty state", async () => {
    m.query.mockResolvedValueOnce({
      data: Array.from({ length: 1001 }, () => qrow()),
      error: null,
    });
    await expect(readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).rejects.toThrow();
    m.approval.mockRejectedValueOnce(new Error("unavailable"));
    await expect(readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).rejects.toThrow();
  });
  it("rejects a workspace edit during the read", async () => {
    m.workspace.mockResolvedValueOnce(row()).mockResolvedValueOnce({ ...row(), rev: 2 });
    await expect(readWorkAwareness(owner, { projectId: "p", page: 0 }, now)).rejects.toThrow(
      "awareness_changed",
    );
  });
  it("separates intentional pause from holds and does not fetch active weekly work", async () => {
    m.control.mockResolvedValue({ engine: "paused" });
    const result = await readWorkAwareness(owner, { projectId: "p", page: 0 }, now);
    expect(result.engine).toBe("paused");
    expect(result.approvals).toHaveLength(1);
    expect(m.weekly).not.toHaveBeenCalled();
  });
  it("reads current and next local week, preserving cancellations and dated historical summary", async () => {
    m.control.mockResolvedValue({ engine: "weekly" });
    const result = await readWorkAwareness(owner, { projectId: "p", page: 0 }, now);
    expect(result.weeks.map((w) => w.period)).toEqual(["week:2026-09-07", "week:2026-09-14"]);
    expect(m.weekly).toHaveBeenCalledWith({ ownerId: owner, projectId: "p" }, "2026-09-07", now);
  });
  it("bounds approval work per page and does not repeat queue identities", async () => {
    m.query.mockResolvedValue({
      count: 51,
      data: Array.from({ length: 51 }, (_, i) => ({
        ...qrow(),
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })),
      error: null,
    });
    const first = await readWorkAwareness(owner, { projectId: "p", page: 0 }, now);
    const second = await readWorkAwareness(owner, { projectId: "p", page: 1 }, now);
    expect(first.pages).toBe(2);
    expect(first.approvals).toHaveLength(50);
    expect(second.approvals).toHaveLength(1);
    expect(new Set([...first.approvals, ...second.approvals].map((a) => a.id)).size).toBe(51);
  });
  it("has an authenticated entry and no email or notification write path", () => {
    const handler = readFileSync(new URL("./work-awareness.functions.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("./work-awareness.server.ts", import.meta.url), "utf8");
    expect(handler).toContain(".middleware([requireSupabaseAuth])");
    expect(handler).toContain("context.userId as string");
    expect(server).not.toMatch(
      /sync_operational_notifications|queue_operational_email_digest|begin_operational_email_delivery|\.insert\(|\.update\(/,
    );
  });
});
