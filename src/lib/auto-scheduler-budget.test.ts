import { GenerationResultUnavailableError } from "./generation-result.server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { runMonthlyAutoScheduler } from "./auto-scheduler.server";
import { UsageLimitError, UsageUnavailableError } from "./ai-usage.server";
import { AiExpenseUnavailableError } from "./ai-expense.server";
import type { WorkspaceData } from "./workspace.server";
import type { ContentAsset, Opportunity } from "./types";

const mocks = vi.hoisted(() => ({
  control: vi.fn(),
  remaining: vi.fn(),
  generate: vi.fn(),
  discover: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  heartbeat: vi.fn(),
  acquire: vi.fn(),
  assertLease: vi.fn(),
  releaseLease: vi.fn(),
  insert: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("./weekly-preparation.server", () => ({ readSchedulerControl: mocks.control }));
vi.mock("./scheduler-approval.server", () => ({
  armSchedulerPublication: async () => {
    const result = await mocks.insert();
    if (result.error) throw new Error("queue_failed");
  },
}));
vi.mock("./auto-scheduler-lease.server", () => ({
  acquireSchedulerLease: mocks.acquire,
  assertSchedulerLease: mocks.assertLease,
  releaseSchedulerLease: mocks.releaseLease,
}));
vi.mock("./checklist", () => ({ publishBlockers: () => [] }));
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
        insert: mocks.insert,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve(mocks.queue()).then(resolve);
        },
      };
    },
  },
}));

const now = new Date("2026-09-25T06:00:00Z");
let workspace: WorkspaceData;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.control.mockResolvedValue({ engine: "monthly" });
  vi.stubEnv("RESEND_API_KEY", "");
  mocks.remaining.mockResolvedValue(3);
  mocks.queue.mockReturnValue({ data: [], error: null });
  mocks.acquire.mockResolvedValue("00000000-0000-4000-8000-000000000010");
  mocks.assertLease.mockResolvedValue(undefined);
  mocks.releaseLease.mockResolvedValue(undefined);
  mocks.insert.mockResolvedValue({ data: null, error: null });
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
    const next = change(workspace);
    workspace = next.data;
    return { result: next.result, rev: 1 };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("autopilot budget failures", () => {
  it.each(["weekly", "paused"])(
    "skips %s projects without generation or summary email",
    async (engine) => {
      mocks.control.mockResolvedValue({ engine });
      const summary = await runMonthlyAutoScheduler(now);
      expect(summary.projects).toEqual([]);
      expect(mocks.acquire).not.toHaveBeenCalled();
      expect(mocks.discover).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
    },
  );
  it("contains an unavailable control to its project and sends no unverified monthly email", async () => {
    const first = (workspace.projects as Array<Record<string, unknown>>)[0];
    workspace.projects = [first, { ...first, id: "p2" }];
    first.autoScheduler = { enabled: true, summaryEmail: "owner@example.com" };
    mocks.control
      .mockRejectedValueOnce(new Error("scheduler_control_unavailable"))
      .mockResolvedValue({ engine: "monthly" });
    mocks.remaining.mockResolvedValue(0);
    const summary = await runMonthlyAutoScheduler(now);
    expect(summary.projects).toHaveLength(2);
    expect(summary.projects[0]).toMatchObject({
      projectId: "p1",
      error: "scheduler_control_unavailable",
    });
    expect(summary.projects[0].summaryEmailTo).toBeUndefined();
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
    expect(mocks.acquire).toHaveBeenCalledWith("user", "p2", expect.any(String));
  });
  it.each([
    { data: null, error: { message: "unavailable" } },
    { data: null, error: null },
    { data: [{ publish_at: "invalid" }], error: null },
  ])("does not spend when existing bookings cannot be verified", async (result) => {
    mocks.queue.mockReturnValue(result);
    const summary = await runMonthlyAutoScheduler(now);
    expect(summary.projects[0].error).toContain("queue unavailable");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it("resumes with the remaining quota without subtracting prior usage again", async () => {
    workspace.content = [{ id: "old", projectId: "p1", autoScheduledFor: "2026-10" }];
    mocks.remaining.mockResolvedValue(2);
    mocks.generate.mockResolvedValue({ markdown: "Saved", hookProposals: [] });
    const summary = await runMonthlyAutoScheduler(now);
    expect(summary.projects[0]).toMatchObject({ target: 2, generated: 2 });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    const saved = (workspace.content as ContentAsset[]).filter((a) => a.id !== "old");
    expect(saved.every((a) => !!a.autoSchedulerPlannedAt && !a.scheduledPublishAt)).toBe(true);
    expect(new Set(saved.map((a) => a.autoSchedulerPlannedAt)).size).toBe(2);
  });
  it("does not generate when another scheduler owns the project", async () => {
    mocks.acquire.mockRejectedValueOnce(new Error("Scheduler already active"));
    const result = await runMonthlyAutoScheduler(now);
    expect(result.projects[0].error).toBe("Scheduler already active");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.releaseLease).not.toHaveBeenCalled();
  });
  it("retains the first saved draft when ownership is lost before the next generation", async () => {
    mocks.generate.mockResolvedValue({
      metaTitle: "First",
      metaDescription: "D",
      h1: "First",
      markdown: "Saved draft",
      hookProposals: [],
    });
    mocks.assertLease
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Ownership unknown"));
    const result = await runMonthlyAutoScheduler(now);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(workspace.content).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({ error: "Ownership unknown", generated: 1, held: 1 });
    expect(mocks.releaseLease).not.toHaveBeenCalled();
  });
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
    new GenerationResultUnavailableError(),
    new UsageUnavailableError("contentGeneration"),
    new UsageLimitError("contentGeneration", 3, 3, "Monthly content limit reached."),
    new AiExpenseUnavailableError("budget_exhausted"),
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

  it("persists a completed draft before waiting for the next provider call", async () => {
    let release: (value: unknown) => void = () => undefined;
    let started: () => void = () => undefined;
    const secondStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const second = new Promise((resolve) => {
      release = resolve;
    });
    mocks.generate
      .mockResolvedValueOnce({
        metaTitle: "First",
        metaDescription: "D",
        h1: "First",
        markdown: "Already delivered draft",
        hookProposals: [],
      })
      .mockImplementationOnce(() => {
        started();
        return second;
      })
      .mockResolvedValue(null);
    const running = runMonthlyAutoScheduler(now);
    await secondStarted;
    const savedWhileSecondPending = (workspace.content as ContentAsset[]).map((a) => a.markdown);
    release(null);
    await running;
    expect(savedWhileSecondPending).toEqual(["Already delivered draft"]);
  });

  it("does not spend on another generation after a workspace save fails", async () => {
    mocks.generate.mockResolvedValue({
      metaTitle: "First",
      metaDescription: "D",
      h1: "First",
      markdown: "Delivered draft",
      hookProposals: [],
    });
    mocks.mutate.mockRejectedValueOnce(new Error("workspace_write_failed"));
    const result = await runMonthlyAutoScheduler(now);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(result.projects[0].error).toBe("workspace_write_failed");
  });

  it("persists an automatic draft before its queue row and adds the mirror only afterwards", async () => {
    const project = (workspace.projects as Array<Record<string, unknown>>)[0];
    project.autoScheduler = { enabled: true, mode: "auto_publish" };
    project.publishMode = "autoPublishApproved";
    mocks.remaining.mockResolvedValue(1);
    mocks.generate.mockResolvedValue({
      metaTitle: "Calm sessions",
      metaDescription: "D",
      h1: "Calm sessions",
      markdown: "A relaxing article body about sessions in our studio.",
      hookProposals: [{ text: "Need a calmer studio session?", type: "question" }],
    });
    let storedBeforeQueue: ContentAsset[] = [];
    mocks.insert.mockImplementationOnce(async () => {
      storedBeforeQueue = structuredClone(workspace.content as ContentAsset[]);
      return { data: null, error: null };
    });
    const result = await runMonthlyAutoScheduler(now);
    expect(result.projects[0]).toMatchObject({ generated: 1, armed: 1, held: 0 });
    expect(storedBeforeQueue).toHaveLength(1);
    expect(storedBeforeQueue[0].scheduledPublishAt).toBeUndefined();
    expect((workspace.content as ContentAsset[])[0].scheduledPublishStatus).toBe("pending");
    expect(mocks.mutate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0],
    );
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.mutate.mock.invocationCallOrder[1],
    );
  });

  it("never queues or overwrites a draft already restored and edited while generation returned", async () => {
    const project = (workspace.projects as Array<Record<string, unknown>>)[0];
    project.autoScheduler = { enabled: true, mode: "auto_publish" };
    project.publishMode = "autoPublishApproved";
    mocks.remaining.mockResolvedValue(1);
    const recovered = {
      id: "recovered",
      projectId: "p1",
      opportunityId: "o1",
      markdown: "Owner correction",
      status: "Draft",
    };
    mocks.generate.mockImplementationOnce(async () => {
      workspace.content = [recovered];
      (workspace.opportunities as Array<Record<string, unknown>>)[0].currentContentAssetId =
        "owner-choice";
      return {
        resultId: "recovered",
        metaTitle: "Calm sessions",
        metaDescription: "D",
        h1: "Calm sessions",
        markdown: "A relaxing article body about sessions in our studio.",
        hookProposals: [{ text: "Need a calmer studio session?", type: "question" }],
      };
    });
    const result = await runMonthlyAutoScheduler(now);
    expect(result.projects[0]).toMatchObject({ generated: 1, armed: 0, held: 1 });
    expect(workspace.content).toEqual([recovered]);
    expect(
      (workspace.opportunities as Array<Record<string, unknown>>)[0].currentContentAssetId,
    ).toBe("owner-choice");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("keeps a saved automatic draft unarmed when queue insertion fails", async () => {
    const project = (workspace.projects as Array<Record<string, unknown>>)[0];
    project.autoScheduler = { enabled: true, mode: "auto_publish" };
    project.publishMode = "autoPublishApproved";
    mocks.remaining.mockResolvedValue(1);
    mocks.generate.mockResolvedValue({
      metaTitle: "Calm sessions",
      metaDescription: "D",
      h1: "Calm sessions",
      markdown: "A relaxing article body about sessions in our studio.",
      hookProposals: [{ text: "Need a calmer studio session?", type: "question" }],
    });
    mocks.insert.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    const result = await runMonthlyAutoScheduler(now);
    expect(result.projects[0]).toMatchObject({ generated: 1, armed: 0, held: 1 });
    expect(workspace.content).toHaveLength(1);
    expect((workspace.content as ContentAsset[])[0].scheduledPublishAt).toBeUndefined();
  });

  it.each([
    new UsageUnavailableError("aiCredits"),
    new AiExpenseUnavailableError("budget_unconfigured"),
  ])(
    "reports an unavailable discovery budget instead of hiding it as no ideas: %s",
    async (failure) => {
      workspace.opportunities = [];
      mocks.discover.mockRejectedValue(failure);
      const summary = await runMonthlyAutoScheduler(now);
      expect(mocks.discover.mock.calls[0][2]).toEqual({ enforceLimit: true });
      expect(summary.projects[0].error).toContain("AI work is paused");
      expect(mocks.generate).not.toHaveBeenCalled();
    },
  );
});
