import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyReadiness } from "./weekly-readiness";
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
vi.mock("./weekly-sources.server", () => ({ refreshWeeklySources: h.refresh }));
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
