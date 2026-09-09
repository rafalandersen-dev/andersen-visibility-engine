import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBenchmarkSnapshot,
  parseBenchmarkRun,
  type BenchmarkRun,
} from "./owner-benchmark-plan.server";
import {
  getOwnerBenchmarkStatus,
  runOwnerBenchmarkStage,
  type BenchmarkDeps,
} from "./owner-benchmark.server";
import type { ContentAsset, Opportunity, Project } from "./types";
import type { WorkspaceData } from "./workspace.server";
const user = "00000000-0000-4000-8000-000000000011",
  runId = "00000000-0000-4000-8000-000000000012";
const assetId = "00000000-0000-4000-8000-000000000013",
  imageId = "00000000-0000-4000-8000-000000000014";
const project: Project = {
  id: "project",
  name: "Bakery",
  websiteUrl: "https://example.com",
  businessName: "Bakery",
  businessType: "Bakery",
  primaryLanguage: "English",
  additionalLanguages: [],
  mainLocation: "Town",
  targetLocations: [],
  description: "Bread",
  targetAudience: "Neighbours",
  toneOfVoice: "Helpful",
  uniqueSellingPoints: "Fresh bread",
  brandNotes: "Calm",
};
const opportunity: Opportunity = {
  id: "topic",
  projectId: "project",
  title: "Choosing fresh bread",
  language: "English",
  contentType: "Blog Article",
  searchIntent: "Informational",
  targetAudience: "Neighbours",
  businessValue: "Explain bread",
  recommendedCta: "Visit the bakery",
  priority: "Medium",
  status: "captured",
};
const draft: ContentAsset = {
  id: "builder-id",
  projectId: project.id,
  opportunityId: opportunity.id,
  title: opportunity.title,
  slug: "fresh-bread",
  metaTitle: "Bread",
  metaDescription: "Bread guide",
  h1: "Bread",
  outline: [],
  faq: [],
  cta: "Visit",
  markdown: "Useful bread guidance. ".repeat(30),
  internalLinks: [],
  schemaSuggestions: [],
  editorNotes: "",
  status: "Draft",
  updatedAt: "2026-09-09T10:00:00Z",
  autoScheduledFor: "must-be-removed",
};
let run: BenchmarkRun, workspace: WorkspaceData, deps: BenchmarkDeps;
beforeEach(() => {
  run = {
    id: runId,
    user_id: user,
    project_id: project.id,
    opportunity_id: opportunity.id,
    asset_id: assetId,
    image_id: imageId,
    snapshot: buildBenchmarkSnapshot(project, [], opportunity, "Bread in a bakery"),
    scan_request: "00000000-0000-4000-8000-000000000021",
    article_request: "00000000-0000-4000-8000-000000000022",
    image_request: "00000000-0000-4000-8000-000000000023",
    stage: "scan",
    state: "ready",
    claimed_at: null,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    results: {},
  };
  workspace = {
    projects: [structuredClone(project)],
    opportunities: [structuredClone(opportunity)],
    services: [],
    content: [],
    untouched: { keep: true },
  };
  let claimToken: unknown;
  deps = {
    configured: vi.fn(() => true),
    readRun: vi.fn(async () => structuredClone(run)),
    readWorkspace: vi.fn(async () => ({ data: structuredClone(workspace) })),
    rpc: vi.fn(async (name, args) => {
      if (name === "claim_owner_benchmark_stage") {
        if (run.state !== "ready" || run.stage !== args.p_stage)
          return { data: false, error: null };
        run.state = "running";
        claimToken = args.p_token;
        run.claimed_at = new Date().toISOString();
      } else if (
        run.state !== "running" ||
        run.stage !== args.p_stage ||
        args.p_token !== claimToken
      )
        return { data: false, error: null };
      else if (name === "record_owner_benchmark_result") run.results[run.stage] = args.p_result;
      else if (name === "finish_owner_benchmark_stage") {
        run.state = args.p_success ? (run.stage === "image" ? "completed" : "ready") : "stopped";
        if (args.p_success) run.stage = run.stage === "scan" ? "article" : "image";
      }
      return { data: true, error: null };
    }),
    mutateWorkspace: vi.fn(async (_user, mutate) => {
      workspace = mutate(structuredClone(workspace)).data;
    }),
    scan: vi.fn().mockResolvedValue({ ok: true, aiGenerated: true, businessName: "Bakery" }),
    article: vi.fn().mockResolvedValue({ markdown: draft.markdown }),
    image: vi.fn().mockResolvedValue({
      path: `${user}/project/${assetId}/image.webp`,
      previewUrl: "https://private.example/temporary",
      alt: "Bread on a shelf",
    }),
    buildAsset: vi.fn(() => structuredClone(draft)),
  };
});
afterEach(() => {
  vi.useRealTimers();
});
describe("controlled benchmark orchestration", () => {
  it("uses the three existing cores once and leaves an unapproved draft with a private proposed image", async () => {
    for (const stage of ["scan", "article", "image"] as const) {
      expect(await runOwnerBenchmarkStage(user, runId, stage, deps)).toEqual({
        outcome: "completed_stage",
      });
      expect(await runOwnerBenchmarkStage(user, runId, stage, deps)).toEqual({
        outcome: "not_started",
      });
    }
    expect(deps.scan).toHaveBeenCalledExactlyOnceWith(user, project.websiteUrl, {
      requireAi: true,
      attempt: { requestId: run.scan_request, jobId: runId },
    });
    expect(deps.article).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.article).mock.calls[0][2]).toEqual({
      enforceLimit: true,
      attempt: { requestId: run.article_request, jobId: runId },
    });
    expect(deps.image).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.image).mock.calls[0][2]).toEqual({
      attempt: { requestId: run.image_request, jobId: runId },
    });
    const asset = (workspace.content as ContentAsset[])[0];
    expect(asset).toMatchObject({
      id: assetId,
      status: "Draft",
      images: [{ id: imageId, status: "proposed", source: "generated" }],
    });
    expect(asset).not.toHaveProperty("autoScheduledFor");
    expect(asset).not.toHaveProperty("hook");
    expect(asset.images?.[0]).not.toHaveProperty("url");
    expect(JSON.stringify(run.results)).not.toContain("private.example");
    expect(workspace.untouched).toEqual({ keep: true });
    expect(await getOwnerBenchmarkStatus(user, runId, deps)).toMatchObject({
      state: "completed",
      completed: ["scan", "article", "image"],
    });
  });
  it("never imports publishing secrets or schedules into a frozen plan", () => {
    const snapshot = buildBenchmarkSnapshot(
      {
        ...project,
        publishSecret: "must-not-copy",
        autoScheduler: {
          enabled: true,
          weekdays: [1],
          publishTime: "09:00",
          timeZone: "UTC",
          mode: "auto_publish",
        },
      },
      [],
      opportunity,
      "Bread photo",
    );
    expect(JSON.stringify(snapshot)).not.toContain("must-not-copy");
    expect(snapshot.project).not.toHaveProperty("autoScheduler");
    expect(() =>
      parseBenchmarkRun({
        ...run,
        snapshot: { ...snapshot, project: { ...snapshot.project, publishSecret: "injected" } },
      }),
    ).toThrow();
  });
  it.each(["configuration", "owner", "changed_topic", "changed_site", "missing_target"])(
    "stops before claim or provider for %s",
    async (reason) => {
      if (reason === "configuration") vi.mocked(deps.configured).mockReturnValue(false);
      if (reason === "owner") run.user_id = "00000000-0000-4000-8000-000000000099";
      if (reason === "changed_topic")
        (workspace.opportunities as Opportunity[])[0].title = "Owner changed this";
      if (reason === "changed_site")
        (workspace.projects as Project[])[0].websiteUrl = "https://different.example.com";
      if (reason === "missing_target") workspace.projects = [];
      expect(await runOwnerBenchmarkStage(user, runId, "scan", deps)).toEqual({
        outcome: "not_started",
      });
      expect(deps.rpc).not.toHaveBeenCalled();
      expect(deps.scan).not.toHaveBeenCalled();
    },
  );
  it("does not retry provider failure or proceed to the next stage", async () => {
    vi.mocked(deps.scan).mockRejectedValue(new Error("private provider response"));
    expect(await runOwnerBenchmarkStage(user, runId, "scan", deps)).toEqual({ outcome: "stopped" });
    expect(await runOwnerBenchmarkStage(user, runId, "scan", deps)).toEqual({
      outcome: "not_started",
    });
    expect(deps.scan).toHaveBeenCalledTimes(1);
    expect(deps.article).not.toHaveBeenCalled();
  });
  it("retains generated output before a failed workspace write without declaring delivery complete", async () => {
    run.stage = "article";
    run.results.scan = { profile: {} };
    vi.mocked(deps.mutateWorkspace).mockRejectedValue(new Error("save uncertain"));
    expect(await runOwnerBenchmarkStage(user, runId, "article", deps)).toEqual({
      outcome: "stopped",
    });
    expect(run.results.article).toHaveProperty("asset");
    expect(await getOwnerBenchmarkStatus(user, runId, deps)).toMatchObject({
      completed: ["scan"],
      recorded: ["scan", "article"],
      needsAttention: true,
    });
    expect(await runOwnerBenchmarkStage(user, runId, "article", deps)).toEqual({
      outcome: "not_started",
    });
    expect(deps.article).toHaveBeenCalledTimes(1);
  });
  it("does not call a provider after a late or unconfirmed claim", async () => {
    vi.useFakeTimers();
    let resolve!: (value: { data: boolean; error: null }) => void;
    vi.mocked(deps.rpc).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = runOwnerBenchmarkStage(user, runId, "scan", deps);
    await vi.advanceTimersByTimeAsync(10001);
    expect(await result).toEqual({ outcome: "not_started" });
    resolve({ data: true, error: null });
    await vi.runAllTimersAsync();
    expect(deps.scan).not.toHaveBeenCalled();
  });
  it("preserves concurrent owner edits while adding the image and never overwrites an approved draft", async () => {
    run.stage = "image";
    workspace.content = [{ ...draft, id: assetId, editorNotes: "Owner note" }];
    expect(await runOwnerBenchmarkStage(user, runId, "image", deps)).toEqual({
      outcome: "completed_stage",
    });
    expect((workspace.content as ContentAsset[])[0].editorNotes).toBe("Owner note");
    run.state = "ready";
    (workspace.content as ContentAsset[])[0].status = "Approved";
    expect(await runOwnerBenchmarkStage(user, runId, "image", deps)).toEqual({
      outcome: "not_started",
    });
    expect(deps.image).toHaveBeenCalledTimes(1);
  });
});
