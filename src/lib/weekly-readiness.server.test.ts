import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  workspace: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
}));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: mocked.workspace }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocked.rpc,
    from: () => ({
      select: (...args: unknown[]) => {
        mocked.select(...args);
        return { eq: mocked.eq };
      },
    }),
  },
}));
import { readWeeklyPreparation } from "./weekly-preparation.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
beforeEach(() => {
  vi.clearAllMocks();
  mocked.eq.mockReturnValue({ eq: mocked.eq, limit: mocked.limit });
  mocked.limit.mockResolvedValue({ data: [], count: 0, error: null });
  mocked.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "read_weekly_preparation_stages"
        ? []
        : name === "read_weekly_preparation_summary"
          ? null
          : {
              revision: 0,
              engine: "monthly",
              preparation: { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 },
            },
    error: null,
  }));
  mocked.workspace.mockResolvedValue({
    data: {
      projects: [
        {
          id: "p",
          autoScheduler: {
            enabled: true,
            weekdays: [2, 4],
            publishTime: "09:00",
            timeZone: "Europe/Stockholm",
          },
        },
      ],
      content: [],
    },
  });
});
describe("weekly readiness authenticated storage boundary", () => {
  it.each([1001, 1, null])("refuses truncated or unknown weekly queue count %s", async (count) => {
    mocked.limit.mockResolvedValueOnce({ data: [], count, error: null });
    await expect(readWeeklyPreparation(scope, "2026-09-14")).rejects.toThrow(
      "scheduler_control_unavailable",
    );
    expect(mocked.select).toHaveBeenCalledWith("asset_id,publish_at,status", { count: "exact" });
    expect(mocked.rpc).not.toHaveBeenCalledWith(
      "read_weekly_preparation_stages",
      expect.anything(),
    );
  });
  it("retains terminal queue reservations when the complete source is available", async () => {
    mocked.limit.mockResolvedValueOnce({
      data: [{ asset_id: "a", publish_at: "2026-09-15T07:00:00Z", status: "cancelled" }],
      count: 1,
      error: null,
    });
    const result = await readWeeklyPreparation(
      scope,
      "2026-09-14",
      new Date("2026-09-11T14:00:00Z"),
    );
    expect(result.readiness[0].state).toBe("cancelled");
    expect(result.missing.some((s) => s.publishAt === "2026-09-15T07:00:00.000Z")).toBe(false);
  });

  it("scopes both control and publication queue to the owner/project", async () => {
    const result = await readWeeklyPreparation(
      scope,
      "2026-09-14",
      new Date("2026-09-11T14:00:00Z"),
    );
    expect(result.readiness.map((s) => s.state)).toEqual(["missing", "missing"]);
    expect(mocked.eq).toHaveBeenCalledWith("user_id", scope.ownerId);
    expect(mocked.eq).toHaveBeenCalledWith("project_id", "p");
    expect(mocked.rpc).toHaveBeenCalledWith("read_project_scheduler_control", {
      p_user: scope.ownerId,
      p_project: "p",
    });
  });
  it("shows permanent cancellation while retaining the linked draft", async () => {
    const data = (await mocked.workspace()).data;
    data.content = [
      {
        id: "asset",
        projectId: "p",
        title: "Retained draft",
        autoSchedulerPlannedAt: "2026-09-15T07:00:00Z",
      },
    ];
    mocked.rpc.mockImplementation(async (name) => ({
      data:
        name === "read_project_scheduler_control"
          ? {
              revision: 1,
              engine: "weekly",
              preparation: { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 },
            }
          : name === "read_weekly_preparation_summary"
            ? null
            : [
                {
                  publishAt: "2026-09-15T07:00:00Z",
                  stage: "content",
                  state: "cancelled",
                  requestId: "00000000-0000-4000-8000-000000000003",
                  outputId: "00000000-0000-4000-8000-000000000004",
                  inputHash: "a".repeat(64),
                  result: null,
                  deliveredAt: "2026-09-11T14:00:00Z",
                  outputChanged: false,
                },
              ],
      error: null,
    }));
    const result = await readWeeklyPreparation(
      scope,
      "2026-09-14",
      new Date("2026-09-11T14:00:00Z"),
    );
    expect(result.readiness[0]).toMatchObject({
      state: "cancelled",
      assetId: "asset",
      title: "Retained draft",
    });
    expect(result.missing.some((s) => s.publishAt === "2026-09-15T07:00:00.000Z")).toBe(false);
  });
  it("refuses missing project and incomplete queue reads", async () => {
    await expect(
      readWeeklyPreparation({ ...scope, projectId: "foreign" }, "2026-09-14"),
    ).rejects.toThrow("scheduler_control_unavailable");
    expect(mocked.rpc).not.toHaveBeenCalled();
    mocked.limit.mockResolvedValue({ data: Array.from({ length: 1001 }, () => ({})), error: null });
    await expect(readWeeklyPreparation(scope, "2026-09-14")).rejects.toThrow(
      "scheduler_control_unavailable",
    );
    mocked.limit.mockResolvedValue({ data: null, error: { message: "private" } });
    await expect(readWeeklyPreparation(scope, "2026-09-14")).rejects.toThrow(
      "scheduler_control_unavailable",
    );
  });
});
