import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyReadiness } from "./weekly-readiness";
import { localWeekStart } from "./weekly-preparation";
import { normalizeAutoSchedulerConfig } from "./auto-scheduler";
import type { ContentAsset, Opportunity, Project } from "./types";
import type { GenerationResult } from "./generation-result";
const h = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  stages: vi.fn(),
  runStage: vi.fn(),
  readiness: vi.fn(),
  control: vi.fn(),
  rpc: vi.fn(),
  generate: vi.fn(),
  image: vi.fn(),
  imageAllowed: vi.fn(),
  discover: vi.fn(),
  archive: vi.fn(),
  active: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  refresh: vi.fn(),
  knowledge: vi.fn(),
  arm: vi.fn(),
  mirror: vi.fn(),
  approved: vi.fn(),
  testWindow: vi.fn(),
}));
// The bounded-observation policy is OPTIONAL. Every existing case below keeps
// `null` (project not registered) so ordinary behaviour is unchanged; the
// dedicated cases at the end supply a window and use the REAL guard.
vi.mock("./weekly-test-window.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./weekly-test-window.server")>()),
  readWeeklyTestWindow: h.testWindow,
}));
vi.mock("./ai-usage.server", () => ({ assertImageGenerationAllowed: h.imageAllowed }));
vi.mock("./publish.server", () => ({ writeScheduleMirror: h.mirror }));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: h.read, updateWorkspaceRow: h.update }));
vi.mock("./weekly-preparation.server", () => ({
  readWeeklyPreparation: h.readiness,
  readSchedulerControl: h.control,
}));
vi.mock("./weekly-stage.server", () => ({
  readWeeklyStages: h.stages,
  runWeeklyStage: h.runStage,
}));
vi.mock("./weekly-sources.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./weekly-sources.server")>()),
  refreshWeeklySources: h.refresh,
}));
vi.mock("./project-knowledge.server", () => ({ loadProjectKnowledgeContext: h.knowledge }));
vi.mock("./ai.functions", () => ({
  generateContentCore: h.generate,
  generateOpportunitiesCore: h.discover,
  projectBrief: (p: Project) => p.description || "business",
}));
vi.mock("./image-gen.functions", () => ({ generateArticleImageCore: h.image }));
vi.mock("./generation-result.server", () => ({ readGenerationResult: h.archive }));
vi.mock("./auto-scheduler.server", () => ({ attachBestHook: (a: ContentAsset) => a }));
vi.mock("./auto-scheduler-lease.server", () => ({
  acquireSchedulerLease: h.acquire,
  assertSchedulerLease: h.active,
  releaseSchedulerLease: h.release,
}));
vi.mock("./image-preview.server", () => ({
  readArticleImagePreview: async () => "private-preview",
}));
vi.mock("./scheduler-approval.server", () => ({ armSchedulerPublication: h.arm }));
vi.mock("./publication-approval.server", () => ({ assertPublicationApproved: h.approved }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { runWeeklyProject } from "./weekly-executor.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const now = new Date("2026-09-11T16:00:00Z");
const prep = { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 };
const control = { revision: 1, engine: "weekly", preparation: prep };
let workspace: {
  projects: Project[];
  content: ContentAsset[];
  opportunities: Opportunity[];
  services: [];
};
type Stage = {
  publishAt: string;
  stage: string;
  state: string;
  requestId: string;
  outputId: string;
  result: Record<string, unknown> | null;
  inputHash: string;
  deliveredAt: string | null;
  outputChanged: boolean;
  period: string;
};
let stages: Stage[];
let archives: Map<string, GenerationResult>;
let rev: number;
let queue: Array<{ assetId: string; publishAt: string; status: "pending" }>;
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.resetAllMocks();
  stages = [];
  queue = [];
  archives = new Map();
  rev = 0;
  workspace = {
    projects: [
      {
        id: "p",
        name: "Shop",
        businessName: "Shop",
        primaryLanguage: "English",
        autoScheduler: {
          enabled: true,
          weekdays: [2, 4],
          publishTime: "09:00",
          timeZone: "Europe/Stockholm",
          mode: "approve_first",
        },
      } as Project,
    ],
    content: [],
    services: [],
    opportunities: [1, 2].map(
      (i) =>
        ({
          id: `o${i}`,
          projectId: "p",
          title: `Practical guide ${i}`,
          language: "English",
          contentType: "Blog Article",
          searchIntent: "Informational",
          targetAudience: "Customers",
          businessValue: "Education",
          recommendedCta: "Learn more",
          priority: "High",
          status: "captured",
        }) as Opportunity,
    ),
  };
  h.read.mockImplementation(async () => ({ data: structuredClone(workspace), rev }));
  h.update.mockImplementation(async (_user, next, expected) => {
    if (expected !== rev) return null;
    workspace = structuredClone(next);
    rev++;
    for (const stage of stages) {
      if (stage.stage === "content" && workspace.content.some((a) => a.id === stage.outputId))
        stage.deliveredAt ??= now.toISOString();
      if (
        stage.stage === "image" &&
        workspace.content.some((a) => a.images?.some((i) => i.id === stage.outputId))
      )
        stage.deliveredAt ??= now.toISOString();
      if (
        stage.stage === "research" &&
        workspace.opportunities.some((o) => o.id === (stage.result?.opportunity as Opportunity)?.id)
      )
        stage.deliveredAt ??= now.toISOString();
    }
    return rev;
  });
  h.stages.mockImplementation(async (_scope, period) =>
    structuredClone(stages.filter((s) => s.period === period)),
  );
  h.control.mockResolvedValue(control);
  h.knowledge.mockResolvedValue({
    context: "accepted context",
    references: [],
    sourceDependencies: [],
  });
  h.refresh.mockResolvedValue([]);
  h.active.mockResolvedValue(undefined);
  h.acquire.mockResolvedValue("00000000-0000-4000-8000-000000000010");
  h.release.mockResolvedValue(undefined);
  h.rpc.mockResolvedValue({ data: true, error: null });
  h.testWindow.mockResolvedValue(null);
  h.readiness.mockImplementation(async (_scope, weekStart, date) => ({
    ...weeklyReadiness({
      projectId: "p",
      weekStart,
      now: date,
      schedule: normalizeAutoSchedulerConfig(workspace.projects[0].autoScheduler),
      preparation: prep,
      assets: workspace.content,
      booked: [],
      queue,
    }),
    enabled: workspace.projects[0].autoScheduler?.enabled,
    control,
    timeZone: "Europe/Stockholm",
  }));
  h.runStage.mockImplementation(async (args) => {
    const stage: Stage = {
      publishAt: args.publishAt,
      stage: args.stage,
      state: "running",
      requestId: crypto.randomUUID(),
      outputId: crypto.randomUUID(),
      result: null,
      inputHash: args.inputHash,
      deliveredAt: null,
      outputChanged: false,
      period: "week:2026-09-14",
    };
    stages.push(stage);
    try {
      stage.result = await args.work(stage);
      stage.state = "retained";
      return stage.result;
    } catch (error) {
      stage.state = "unknown";
      throw error;
    }
  });
  h.generate.mockImplementation(async (_user, args, execution) => {
    const receipt = crypto.randomUUID();
    archives.set(receipt, {
      version: 1,
      kind: "content",
      projectId: "p",
      opportunityId: args.opportunity.id,
      assetId: execution.assetId,
      title: args.opportunity.title,
      language: "English",
      assetType: "article",
      output: {
        metaTitle: "Guide",
        metaDescription: "Description",
        h1: "Guide",
        markdown: "Useful article content.",
        outline: [],
        faq: [],
        cta: "Learn more",
        internalLinks: [],
        schemaSuggestions: [],
        editorNotes: "",
      },
    });
    return { generationReceiptId: receipt, resultId: execution.assetId };
  });
  h.image.mockImplementation(async (_user, args, execution) => {
    const receipt = crypto.randomUUID();
    archives.set(receipt, {
      version: 1,
      kind: "image",
      projectId: "p",
      assetId: args.assetId,
      imageId: execution.imageId,
      title: args.articleTitle,
      concept: args.concept,
      output: {
        path: `${scope.ownerId}/p/${args.assetId}/image.png`,
        alt: "An illustrative image",
      },
    });
    return { generationReceiptId: receipt, resultId: execution.imageId };
  });
  h.archive.mockImplementation(async (_user, receipt) =>
    archives.has(receipt)
      ? { id: receipt, createdAt: now.toISOString(), result: archives.get(receipt) }
      : null,
  );
});
describe("weekly executor integrated orchestration without live providers", () => {
  it("prepares two distinct slots once across bounded visits and retains required proposed visuals", async () => {
    for (let i = 0; i < 6; i++) await runWeeklyProject(scope, now);
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.image).toHaveBeenCalledTimes(2);
    expect(h.discover).not.toHaveBeenCalled();
    expect(workspace.content).toHaveLength(2);
    expect(new Set(workspace.content.map((a) => a.autoSchedulerPlannedAt)).size).toBe(2);
    expect(
      workspace.content.every((a) => a.images?.[0].required && a.images[0].status === "proposed"),
    ).toBe(true);
    await runWeeklyProject(scope, now);
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.image).toHaveBeenCalledTimes(2);
    expect(h.arm).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "mirrors admitted weekly schedules and retains queue success if the mirror fails: %s",
    async (mirrorFails) => {
      for (let i = 0; i < 3; i++) await runWeeklyProject(scope, now);
      workspace.projects[0].autoScheduler!.mode = "auto_publish";
      const asset = workspace.content[0];
      asset.status = "Approved";
      h.arm.mockImplementation(async () => {
        queue.push({
          assetId: asset.id,
          publishAt: asset.autoSchedulerPlannedAt!,
          status: "pending",
        });
      });
      if (mirrorFails) h.mirror.mockRejectedValueOnce(new Error("workspace_unavailable"));
      expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "queued" });
      expect(h.mirror).toHaveBeenCalledWith(scope.ownerId, asset.id, asset.autoSchedulerPlannedAt);
      expect(h.arm.mock.invocationCallOrder[0]).toBeLessThan(h.mirror.mock.invocationCallOrder[0]);
      expect(queue).toHaveLength(1);
      expect(h.generate).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["approved", "arm"] as const)(
    "bounds a pending %s operation and stops the visit without further work",
    async (operation) => {
      for (let i = 0; i < 3; i++) await runWeeklyProject(scope, now);
      workspace.projects[0].autoScheduler!.mode = "auto_publish";
      workspace.content[0].status = "Approved";
      const stageCalls = h.runStage.mock.calls.length;
      let complete!: () => void;
      h[operation].mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      );
      vi.useFakeTimers();
      let settled = false;
      const pending = runWeeklyProject(scope, now).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(10001);
      expect(settled).toBe(true);
      expect(await pending).toMatchObject({ action: "recovery-required" });
      expect(h.runStage).toHaveBeenCalledTimes(stageCalls);
      expect(h.mirror).not.toHaveBeenCalled();
      expect(h.release).toHaveBeenCalled();
      expect(h.arm).toHaveBeenCalledTimes(operation === "arm" ? 1 : 0);
      if (operation === "arm") {
        const asset = workspace.content[0];
        queue.push({
          assetId: asset.id,
          publishAt: asset.autoSchedulerPlannedAt!,
          status: "pending",
        });
      }
      complete();
      await vi.advanceTimersByTimeAsync(0);
      expect(h.mirror).not.toHaveBeenCalled();
      expect(h.arm).toHaveBeenCalledTimes(operation === "arm" ? 1 : 0);
      if (operation === "arm") {
        vi.useRealTimers();
        await runWeeklyProject(scope, now);
        expect(h.arm).toHaveBeenCalledTimes(1);
        expect(queue).toHaveLength(1);
      }
    },
  );
  it("uses real queued current-week rows to move to next week even without display mirrors", async () => {
    for (let i = 0; i < 6; i++) await runWeeklyProject(scope, now);
    workspace.projects[0].autoScheduler!.mode = "auto_publish";
    for (const asset of workspace.content) {
      asset.status = "Approved";
      queue.push({
        assetId: asset.id,
        publishAt: asset.autoSchedulerPlannedAt!,
        status: "pending",
      });
    }
    expect(await runWeeklyProject(scope, new Date("2026-09-16T08:00:00Z"))).toMatchObject({
      period: "week:2026-09-21",
      action: "waiting",
    });
    expect(h.generate).toHaveBeenCalledTimes(2);
  });
  it("leaves image work unclaimed on entitlement refusal and resumes after eligibility changes", async () => {
    await runWeeklyProject(scope, now);
    await runWeeklyProject(scope, now);
    h.imageAllowed.mockRejectedValueOnce(new Error("Pro or Agency required"));
    expect(await runWeeklyProject(scope, now)).toMatchObject({
      action: "capacity-required",
      drafted: 1,
    });
    expect(stages.some((s) => s.stage === "image")).toBe(false);
    expect(h.image).not.toHaveBeenCalled();
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "review-required" });
    expect(h.image).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
  it("retains article when visual budget fails and never replays the uncertain visual", async () => {
    await runWeeklyProject(scope, now);
    await runWeeklyProject(scope, now);
    h.image.mockRejectedValueOnce(new Error("expense_budget_unavailable"));
    expect(await runWeeklyProject(scope, now)).toMatchObject({
      action: "capacity-required",
      drafted: 1,
    });
    await runWeeklyProject(scope, now);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.image).toHaveBeenCalledTimes(1);
    expect(workspace.content).toHaveLength(1);
  });
  it("yields after a slow recovered source and resumes on the next visit without paid replay", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const actual =
      await vi.importActual<typeof import("./weekly-sources.server")>("./weekly-sources.server");
    let saved = false;
    h.refresh.mockImplementationOnce((target, assertActive) =>
      actual.refreshWeeklySources(target, assertActive, {
        sources: async () => [{ id: "source", revision: 1, kind: "website", status: "active" }],
        refresh: async () => {
          vi.setSystemTime(Date.now() + 70_000);
          saved = true;
          return { status: "ok" };
        },
        observations: async () => [
          { sourceId: "source", sourceRevision: 1, status: "ok", lastAttempt: now.toISOString() },
        ],
      }),
    );
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "recovery-required" });
    expect(saved).toBe(true);
    expect(h.runStage).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.discover).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledTimes(1);
    // Normal following visit sees the persisted successful source during cooldown.
    h.refresh.mockImplementationOnce((target, assertActive) =>
      actual.refreshWeeklySources(target, assertActive, {
        sources: async () => [{ id: "source", revision: 1, kind: "website", status: "active" }],
        refresh: async () => ({ status: "cooldown" }),
        observations: async () => [
          { sourceId: "source", sourceRevision: 1, status: "ok", lastAttempt: now.toISOString() },
        ],
      }),
    );
    await runWeeklyProject(scope, now);
    expect(stages.filter((s) => s.stage === "research")).toHaveLength(1);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.image).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "replaced", "uncertain"])(
    "reports source review before generation when refresh evidence is %s",
    async (condition) => {
      const actual =
        await vi.importActual<typeof import("./weekly-sources.server")>("./weekly-sources.server");
      const sourceId = "00000000-0000-4000-8000-000000000099";
      const refresh = vi.fn(async () => {
        if (condition === "uncertain") throw new Error("refresh_unconfirmed");
        return { status: "ok" };
      });
      h.refresh.mockImplementationOnce((target, assertActive) =>
        actual.refreshWeeklySources(target, assertActive, {
          sources: async () => [{ id: sourceId, revision: 1, kind: "website", status: "active" }],
          refresh,
          observations: async () => [
            {
              sourceId,
              sourceRevision: condition === "replaced" ? 2 : 1,
              status: condition === "unavailable" ? "unknown" : "ok",
              lastAttempt: now.toISOString(),
            },
          ],
        }),
      );
      expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "review-required" });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(h.runStage).not.toHaveBeenCalled();
      expect(h.generate).not.toHaveBeenCalled();
      expect(h.discover).not.toHaveBeenCalled();
      expect(h.image).not.toHaveBeenCalled();
      expect(h.arm).not.toHaveBeenCalled();
    },
  );
  it("holds changed owner brief before any content call", async () => {
    await runWeeklyProject(scope, now);
    workspace.opportunities[0].title = "Owner changed topic";
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "context-changed" });
    expect(h.generate).not.toHaveBeenCalled();
  });
  it.each([
    { status: "Discarded" },
    { dueAt: "2026-09-18T09:00:00Z" },
    { currentContentAssetId: "owner-draft" },
  ])("holds an owner lifecycle change before generation: %s", async (change) => {
    await runWeeklyProject(scope, now);
    Object.assign(workspace.opportunities[0], change);
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "context-changed" });
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("holds changed context and does not silently redo research", async () => {
    await runWeeklyProject(scope, now);
    workspace.projects[0].description = "New business context";
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "context-changed" });
    expect(h.runStage).toHaveBeenCalledTimes(1);
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("does not restore an owner-deleted delivered article", async () => {
    await runWeeklyProject(scope, now);
    await runWeeklyProject(scope, now);
    workspace.content = [];
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "context-changed" });
    expect(workspace.content).toEqual([]);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.image).not.toHaveBeenCalled();
  });
  it("does not generate a visual after an owner edits delivered content", async () => {
    await runWeeklyProject(scope, now);
    await runWeeklyProject(scope, now);
    stages.find((s) => s.stage === "content")!.outputChanged = true;
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "context-changed" });
    expect(h.image).not.toHaveBeenCalled();
  });
  it("recovers after an archive read timeout without late delivery or paid replay", async () => {
    await runWeeklyProject(scope, now);
    const actual = await vi.importActual<typeof import("./generation-result.server")>(
      "./generation-result.server",
    );
    let complete!: (value: { data: unknown; error: null }) => void;
    let receiptId = "";
    const archiveRpc = vi.fn(
      () =>
        new Promise<{ data: unknown; error: null }>((resolve) => {
          complete = resolve;
        }),
    );
    h.archive.mockImplementationOnce((userId, receipt) => {
      receiptId = receipt;
      return actual.readGenerationResult(userId, receipt, archiveRpc);
    });
    vi.useFakeTimers();
    const visit = runWeeklyProject(scope, now);
    await vi.waitFor(() => expect(archiveRpc).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(actual.GENERATION_RESULT_TIMEOUT_MS + 1);
    expect(await visit).toMatchObject({ action: "recovery-required" });
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(workspace.content).toHaveLength(0);
    expect(h.image).not.toHaveBeenCalled();
    expect(archiveRpc).toHaveBeenCalledTimes(1);
    complete({
      data: [
        { receipt_id: receiptId, created_at: now.toISOString(), payload: archives.get(receiptId) },
      ],
      error: null,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.content).toHaveLength(0);
    expect(h.image).not.toHaveBeenCalled();
    vi.useRealTimers();
    await runWeeklyProject(scope, now);
    expect(workspace.content).toHaveLength(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(stages.filter((stage) => stage.stage === "content")).toHaveLength(1);
  });
  it("retains archived output on a workspace race and resumes without paid replay", async () => {
    await runWeeklyProject(scope, now);
    h.update.mockResolvedValueOnce(null);
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "recovery-required" });
    expect(workspace.content).toHaveLength(0);
    await runWeeklyProject(scope, now);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(workspace.content).toHaveLength(1);
  });
  it("does not claim or spend before configured preparation time or while disabled", async () => {
    await runWeeklyProject(scope, new Date("2026-09-10T08:00:00Z"));
    workspace.projects[0].autoScheduler!.enabled = false;
    await runWeeklyProject(scope, now);
    expect(h.acquire).not.toHaveBeenCalled();
    expect(h.runStage).not.toHaveBeenCalled();
  });
  it("never replays research after uncertain acknowledgement", async () => {
    await runWeeklyProject(scope, now);
    stages[0].state = "unknown";
    stages[0].result = null;
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "recovery-required" });
    expect(h.runStage).toHaveBeenCalledTimes(1);
    expect(h.generate).not.toHaveBeenCalled();
  });
});

describe("optional bounded observation policy", () => {
  // The REAL guard runs here (only the policy READ is a seam), so the guard's
  // fresh database check and its forwarding into the three cores are exercised.
  const windowId = "00000000-0000-4000-8000-0000000000aa";
  const currentWeek = localWeekStart(now, "Europe/Stockholm");
  const nextWeek = new Date(Date.parse(currentWeek + "T00:00:00Z") + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  let plannedSlots: string[];
  const makeWindow = (slots: string[], overrides: Record<string, unknown> = {}) => ({
    windowId,
    ownerId: scope.ownerId,
    projectId: "p",
    startsAt: new Date(now.getTime() - 3600_000).toISOString(),
    endsAt: new Date(now.getTime() + 160 * 3600_000).toISOString(),
    expectedRevision: control.revision,
    expectedConfiguration: { ...workspace.projects[0].autoScheduler },
    lifetimeCeilingMicrousd: 2_200_000,
    revoked: false,
    revokedAt: null,
    state: "active",
    fresh: true,
    serverNow: now.toISOString(),
    remainingMs: 160 * 3600_000,
    slots,
    contracts: {
      research: {
        provider: "openai",
        model: "gpt-5.6-terra",
        operation: "generateOpportunitiesCore",
        ceilingMicrousd: 500_000,
      },
      content: {
        provider: "openai",
        model: "gpt-5.6-terra",
        operation: "generateContentCore",
        ceilingMicrousd: 500_000,
      },
      image: {
        provider: "openai",
        model: "gpt-image-2-2026-04-21",
        operation: "generateArticleImageCore",
        ceilingMicrousd: 100_000,
      },
    },
    authorizedMicrousd: 0,
    allowances: [],
  });
  const guardReply = (window: ReturnType<typeof makeWindow>) => ({
    data: {
      ok: true,
      windowId,
      serverNow: now.toISOString(),
      endsAt: window.endsAt,
      remainingMs: 160 * 3600_000,
    },
    error: null,
  });
  beforeEach(() => {
    vi.setSystemTime(now);
    plannedSlots = weeklyReadiness({
      projectId: "p",
      weekStart: nextWeek,
      now,
      schedule: normalizeAutoSchedulerConfig(workspace.projects[0].autoScheduler),
      preparation: prep,
      assets: [],
      booked: [],
      queue: [],
    }).slots.map((s) => s.publishAt);
    expect(plannedSlots.length).toBeGreaterThan(0);
    // No owner-planned opportunity, so research must reach the provider core.
    workspace.opportunities = [];
    h.discover.mockImplementation(async (_user, _args, execution) => {
      await execution.beforeDispatch?.();
      return {
        opportunities: [
          {
            id: "generated",
            projectId: "p",
            title: "Generated hypothesis",
            language: "English",
            contentType: "Blog Article",
            searchIntent: "Informational",
            targetAudience: "Customers",
            businessValue: "Education",
            recommendedCta: "Learn more",
            priority: "High",
          },
        ],
      };
    });
    const generate = h.generate.getMockImplementation()!;
    h.generate.mockImplementation(async (user, args, execution) => {
      await execution.beforeDispatch?.();
      return generate(user, args, execution);
    });
    const image = h.image.getMockImplementation()!;
    h.image.mockImplementation(async (user, args, execution) => {
      await execution.beforeDispatch?.();
      return image(user, args, execution);
    });
  });

  it("forwards the guard and its cancellation signal into all three provider cores", async () => {
    const window = makeWindow(plannedSlots.slice(0, 2));
    h.testWindow.mockResolvedValue(window);
    h.rpc.mockImplementation(async (name: string) =>
      name === "assert_weekly_test_window_dispatch"
        ? guardReply(window)
        : { data: true, error: null },
    );
    for (let i = 0; i < 3; i++) await runWeeklyProject(scope, now);
    for (const core of [h.discover, h.generate, h.image]) {
      expect(core).toHaveBeenCalledOnce();
      const execution = core.mock.calls[0][2];
      expect(typeof execution.beforeDispatch).toBe("function");
      expect(execution.signal).toBeInstanceOf(AbortSignal);
      expect(execution.signal.aborted).toBe(false);
    }
    // Each stage revalidated the bound window against a fresh server clock.
    expect(
      h.rpc.mock.calls.filter(([name]) => name === "assert_weekly_test_window_dispatch"),
    ).toHaveLength(3);
    expect(
      h.rpc.mock.calls.find(([name]) => name === "assert_weekly_test_window_dispatch")![1],
    ).toMatchObject({ p_user: scope.ownerId, p_project: "p", p_stage: "research" });
  });

  it("keeps the two authorized instants authoritative and prepares nothing else", async () => {
    // Ordinary planning offers this week's slots; the policy allows neither.
    h.testWindow.mockResolvedValue(
      makeWindow([
        new Date(now.getTime() + 120 * 3600_000).toISOString(),
        new Date(now.getTime() + 140 * 3600_000).toISOString(),
      ]),
    );
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "review-required" });
    expect(h.runStage).not.toHaveBeenCalled();
    expect(h.discover).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.image).not.toHaveBeenCalled();
  });

  it.each(["pending", "expired", "revoked"] as const)(
    "starts no work and claims no lease while the policy is %s",
    async (state) => {
      h.testWindow.mockResolvedValue({
        ...makeWindow(plannedSlots.slice(0, 2)),
        state,
        revoked: state === "revoked",
      });
      expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "recovery-required" });
      expect(h.acquire).not.toHaveBeenCalled();
      expect(h.runStage).not.toHaveBeenCalled();
      // Assertions outside the runner's own catch: no core was ever invoked.
      expect(h.discover).not.toHaveBeenCalled();
      expect(h.generate).not.toHaveBeenCalled();
      expect(h.image).not.toHaveBeenCalled();
    },
  );

  it("stops mid-visit when the policy is revoked between the repeated checks", async () => {
    const window = makeWindow(plannedSlots.slice(0, 2));
    h.testWindow
      .mockResolvedValueOnce(window)
      .mockResolvedValue({ ...window, state: "revoked", revoked: true });
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "recovery-required" });
    expect(h.discover).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.image).not.toHaveBeenCalled();
  });

  it("stops when the registered scheduler revision no longer matches", async () => {
    h.testWindow.mockResolvedValue({
      ...makeWindow(plannedSlots.slice(0, 2)),
      expectedRevision: control.revision + 1,
    });
    expect(await runWeeklyProject(scope, now)).toMatchObject({ action: "context-changed" });
    expect(h.acquire).not.toHaveBeenCalled();
    expect(h.runStage).not.toHaveBeenCalled();
  });

  it("leaves no publication queue entry, approval or mail for the controlled fixture", async () => {
    const window = makeWindow(plannedSlots.slice(0, 2));
    h.testWindow.mockResolvedValue(window);
    h.rpc.mockImplementation(async (name: string) =>
      name === "assert_weekly_test_window_dispatch"
        ? guardReply(window)
        : { data: true, error: null },
    );
    for (let i = 0; i < 6; i++) await runWeeklyProject(scope, now);
    expect(workspace.content.every((a) => a.status === "Draft")).toBe(true);
    expect(queue).toHaveLength(0);
    expect(h.arm).not.toHaveBeenCalled();
    expect(h.approved).not.toHaveBeenCalled();
    expect(h.mirror).not.toHaveBeenCalled();
    // Exactly the two authorized instants, three stages each, and no more.
    const identities = stages.map((s) => `${s.publishAt}|${s.stage}|${s.requestId}|${s.outputId}`);
    expect(stages).toHaveLength(6);
    expect(new Set(stages.map((s) => s.publishAt))).toEqual(new Set(plannedSlots.slice(0, 2)));
    // Repeated natural visits retain the same stage/output identities and never
    // advance to a third date.
    for (let i = 0; i < 3; i++) await runWeeklyProject(scope, now);
    expect(stages.map((s) => `${s.publishAt}|${s.stage}|${s.requestId}|${s.outputId}`)).toEqual(
      identities,
    );
    expect(h.discover).toHaveBeenCalledTimes(2);
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.image).toHaveBeenCalledTimes(2);
  });
});
