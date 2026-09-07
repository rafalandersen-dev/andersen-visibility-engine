import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { runMonthlyAutoScheduler } from "./auto-scheduler.server";
import { UsageLimitError, UsageUnavailableError } from "./ai-usage.server";
import type { WorkspaceData } from "./workspace.server";
import type { ContentAsset, Opportunity } from "./types";

const mocks = vi.hoisted(() => ({
  remaining: vi.fn(),
  generate: vi.fn(),
  discover: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  heartbeat: vi.fn(),
}));
vi.mock("./ai-usage.server", async (original) => ({
  ...(await original<typeof import("./ai-usage.server")>()),
  remainingAiUsage: mocks.remaining,
}));
vi.mock("./ai.functions", () => ({
  generateContentCore: mocks.generate,
  generateOpportunitiesCore: mocks.discover,
}));
vi.mock("./workspace.server", () => ({
  listWorkspaceUserIds: async () => ["user"],
  readWorkspaceRow: mocks.read,
  mutateWorkspace: mocks.mutate,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.heartbeat,
    from() {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
    },
  },
}));

const now = new Date("2026-09-25T06:00:00Z");
let workspace: WorkspaceData;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "");
  mocks.remaining.mockResolvedValue(3);
  mocks.heartbeat.mockResolvedValue({ data: null, error: null });
  mocks.discover.mockResolvedValue({ opportunities: [] });
  workspace = {
    // An intentionally forged blob is irrelevant to the server quota read.
    subscription: { planId: "agency", status: "active" },
    projects: [
      {
        id: "p1",
        name: "Sample",
        businessName: "Sample",
        websiteUrl: "",
        autoScheduler: { enabled: true, mode: "approve_first" },
      },
    ],
    opportunities: [1, 2, 3].map((id) => ({
      id: `o${id}`,
      projectId: "p1",
      title: `Topic ${id}`,
      status: "captured",
      language: "English",
    })),
    content: [],
  };
  mocks.read.mockImplementation(async () => ({ data: workspace }));
  mocks.mutate.mockImplementation(async (_user, change) => {
    workspace = change(workspace).data;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("autopilot budget failures", () => {
  it("stops before discovery or generation if the quota cannot be read", async () => {
    mocks.remaining.mockRejectedValue(new UsageUnavailableError("contentGeneration"));
    const summary = await runMonthlyAutoScheduler(now);
    expect(summary.projects[0].error).toContain("AI work is paused");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalled();
  });

  it("uses the authoritative quota reader, regardless of the workspace subscription", async () => {
    mocks.remaining.mockResolvedValue(0);
    const summary = await runMonthlyAutoScheduler(now);
    expect(summary.projects[0].target).toBe(0);
    expect(mocks.remaining).toHaveBeenCalledWith({
      userId: "user",
      bucket: "contentGeneration",
      now,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each([
    new UsageUnavailableError("contentGeneration"),
    new UsageLimitError("contentGeneration", 3, 3, "Monthly content limit reached."),
  ])("retains completed drafts and stops all remaining attempts after %s", async (failure) => {
    mocks.generate
      .mockResolvedValueOnce({
        metaTitle: "Draft",
        metaDescription: "Description",
        h1: "Draft",
        markdown: "A useful prepared article.",
        hookProposals: [],
      })
      .mockRejectedValue(failure);
    const summary = await runMonthlyAutoScheduler(now);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls.every((call) => call[2]?.enforceLimit === true)).toBe(true);
    expect(summary.projects[0]).toMatchObject({
      generated: 1,
      held: 1,
      armed: 0,
      flaggedEmpty: 2,
      error: failure.message,
    });
    expect(workspace.content).toHaveLength(1);
    expect((workspace.content as ContentAsset[])[0].markdown).toBe("A useful prepared article.");
    expect((workspace.opportunities as Opportunity[])[1].status).toBe("captured");
  });

  it("reports an unavailable discovery meter instead of hiding it as no ideas", async () => {
    workspace.opportunities = [];
    mocks.discover.mockRejectedValue(new UsageUnavailableError("aiCredits"));
    const summary = await runMonthlyAutoScheduler(now);
    expect(mocks.discover.mock.calls[0][2]).toEqual({ enforceLimit: true });
    expect(summary.projects[0].error).toContain("AI work is paused");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
