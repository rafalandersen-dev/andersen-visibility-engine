import { workspaceWriteTimestamp } from "./workspace-time";
import type { ContentAsset, ContentImage, Opportunity, Project, ServiceItem } from "./types";
import type { WorkspaceData, WorkspaceMutation } from "./workspace.server";
import {
  buildBenchmarkSnapshot,
  parseBenchmarkRun,
  type BenchmarkRun,
  type BenchmarkStage,
} from "./owner-benchmark-plan.server";
import { DEFAULT_MODEL_ID } from "./ai-router";
import { OPENAI_IMAGE_MODEL } from "./image-gen.server";
import {
  NATIVE_TEXT_RESERVE_MICROUSD,
  NATIVE_IMAGE_RESERVE_MICROUSD,
} from "./ai-provider-expense.server";
import type { scanWebsiteCore, generateContentCore } from "./ai.functions";
import type { generateArticleImageCore } from "./image-gen.functions";

type RpcResult = { data: unknown; error: unknown };
export interface BenchmarkDeps {
  configured(): boolean;
  readRun(userId: string, runId: string): Promise<unknown>;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  readWorkspace(userId: string): Promise<{ data: WorkspaceData } | null>;
  mutateWorkspace(userId: string, mutate: WorkspaceMutation<void>): Promise<unknown>;
  scan: typeof scanWebsiteCore;
  article: typeof generateContentCore;
  image: typeof generateArticleImageCore;
  buildAsset: typeof import("./auto-scheduler.server").buildAssetFromGeneration;
}
const READ_TIMEOUT = 10000;
async function bounded<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("benchmark_storage_timeout")), READ_TIMEOUT);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function liveDeps(): Promise<BenchmarkDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    from(name: string): {
      select(columns: string): {
        eq(
          column: string,
          value: string,
        ): { eq(column: string, value: string): { maybeSingle(): PromiseLike<RpcResult> } };
      };
    };
    rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  };
  const workspace = await import("./workspace.server");
  const ai = await import("./ai.functions");
  const images = await import("./image-gen.functions");
  const { buildAssetFromGeneration } = await import("./auto-scheduler.server");
  return {
    configured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
    readRun: async (userId, runId) => {
      const result = await bounded(
        db
          .from("owner_ai_benchmark_runs")
          .select(
            "id,user_id,project_id,opportunity_id,asset_id,image_id,snapshot,scan_request,article_request,image_request,stage,state,claimed_at,expires_at,results",
          )
          .eq("user_id", userId)
          .eq("id", runId)
          .maybeSingle(),
      );
      if (result.error) throw new Error("benchmark_read_failed");
      return result.data;
    },
    rpc: (name, args) => db.rpc(name, args),
    readWorkspace: workspace.readWorkspaceRow,
    mutateWorkspace: workspace.mutateWorkspace,
    scan: ai.scanWebsiteCore,
    article: ai.generateContentCore,
    image: images.generateArticleImageCore,
    buildAsset: buildAssetFromGeneration,
  };
}
function records<T>(data: WorkspaceData, key: string): T[] {
  if (!Array.isArray(data[key])) throw new Error("invalid_workspace");
  return data[key] as T[];
}
function assertTargets(data: WorkspaceData, run: BenchmarkRun, compareSnapshot: boolean) {
  const project = records<Project>(data, "projects").find((p) => p.id === run.project_id);
  const opportunity = records<Opportunity>(data, "opportunities").find(
    (o) => o.id === run.opportunity_id && o.projectId === run.project_id,
  );
  if (
    !project ||
    !opportunity ||
    opportunity.archivedAt ||
    opportunity.deletedAt ||
    ["archived", "Discarded"].includes(opportunity.status)
  )
    throw new Error("benchmark_target_unavailable");
  if (
    compareSnapshot &&
    JSON.stringify(
      buildBenchmarkSnapshot(
        project,
        records<ServiceItem>(data, "services"),
        opportunity,
        run.snapshot.imageConcept,
      ),
    ) !== JSON.stringify(run.snapshot)
  )
    throw new Error("benchmark_plan_changed");
}
function persistArticle(run: BenchmarkRun, asset: ContentAsset): WorkspaceMutation<void> {
  return (data) => {
    assertTargets(data, run, false);
    const content = records<ContentAsset>(data, "content");
    const existing = content.find((a) => a.id === run.asset_id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset))
      throw new Error("benchmark_draft_conflict");
    return { data: existing ? data : { ...data, content: [...content, asset] }, result: undefined };
  };
}
function persistImage(run: BenchmarkRun, image: ContentImage): WorkspaceMutation<void> {
  const updatedAt = new Date().toISOString();
  return (data) => {
    assertTargets(data, run, false);
    const content = records<ContentAsset>(data, "content");
    const asset = content.find(
      (a) =>
        a.id === run.asset_id &&
        a.projectId === run.project_id &&
        a.opportunityId === run.opportunity_id,
    );
    if (
      !asset ||
      asset.status !== "Draft" ||
      asset.scheduledPublishAt ||
      asset.livePublishStatus === "published"
    )
      throw new Error("benchmark_draft_changed");
    const existing = asset.images?.find((i) => i.id === run.image_id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(image))
      throw new Error("benchmark_image_conflict");
    return {
      data: existing
        ? data
        : {
            ...data,
            content: content.map((a) =>
              a.id === asset.id
                ? {
                    ...a,
                    images: [...(a.images ?? []), image],
                    updatedAt: workspaceWriteTimestamp(a.updatedAt, updatedAt),
                  }
                : a,
            ),
          },
      result: undefined,
    };
  };
}
export type BenchmarkResult = {
  outcome: "completed_stage" | "not_started" | "stopped" | "uncertain";
};
/** One explicitly named stage per call. Replays never choose the next stage,
 * mint an attempt, retry a provider, send mail, approve or publish content. */
export async function runOwnerBenchmarkStage(
  userId: string,
  runId: string,
  stage: BenchmarkStage,
  injected?: BenchmarkDeps,
): Promise<BenchmarkResult> {
  const deps = injected ?? (await liveDeps());
  const token = crypto.randomUUID();
  const binding = { p_run: runId, p_user: userId, p_stage: stage, p_token: token };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await bounded(deps.rpc(name, args));
    if (result.error || result.data !== true) throw new Error("benchmark_write_unconfirmed");
  };
  let run: BenchmarkRun;
  try {
    if (!deps.configured()) return { outcome: "not_started" };
    run = parseBenchmarkRun(await bounded(deps.readRun(userId, runId)));
    if (
      run.user_id !== userId ||
      run.id !== runId ||
      run.state !== "ready" ||
      run.stage !== stage ||
      Date.parse(run.expires_at) <= Date.now()
    )
      return { outcome: "not_started" };
    const workspace = await bounded(deps.readWorkspace(userId));
    if (!workspace) return { outcome: "not_started" };
    assertTargets(workspace.data, run, true);
    const asset = records<ContentAsset>(workspace.data, "content").find(
      (a) => a.id === run.asset_id,
    );
    if (stage !== "image" && asset) return { outcome: "not_started" };
    if (
      stage === "image" &&
      (!asset ||
        asset.projectId !== run.project_id ||
        asset.opportunityId !== run.opportunity_id ||
        asset.status !== "Draft" ||
        asset.scheduledPublishAt ||
        asset.livePublishStatus === "published" ||
        asset.title !== run.snapshot.opportunity.title ||
        asset.images?.some((i) => i.id === run.image_id))
    )
      return { outcome: "not_started" };
    await rpc("claim_owner_benchmark_stage", {
      ...binding,
      p_text_model: DEFAULT_MODEL_ID,
      p_image_model: OPENAI_IMAGE_MODEL,
      p_text_ceiling: NATIVE_TEXT_RESERVE_MICROUSD,
      p_image_ceiling: NATIVE_IMAGE_RESERVE_MICROUSD,
    });
  } catch {
    return { outcome: "not_started" };
  }
  const attempt = { requestId: run[`${stage}_request`], jobId: run.id };
  const started = Date.now();
  try {
    let result: Record<string, unknown>;
    let mutation: WorkspaceMutation<void> | undefined;
    if (stage === "scan") {
      const scan = await deps.scan(userId, run.snapshot.project.websiteUrl, {
        requireAi: true,
        attempt,
      });
      if (!scan.ok || !scan.aiGenerated || !scan.businessName.trim())
        throw new Error("incomplete_scan");
      result = { profile: scan };
    } else if (stage === "article") {
      const gen = await deps.article(
        userId,
        {
          project: run.snapshot.project,
          services: run.snapshot.services,
          opportunity: run.snapshot.opportunity,
          assetType: "article",
        },
        { enforceLimit: true, attempt },
      );
      if (!gen.markdown || gen.markdown.trim().length < 200) throw new Error("incomplete_article");
      const { autoScheduledFor: unused, ...draft } = deps.buildAsset(
        gen,
        run.snapshot.opportunity,
        run.snapshot.project,
        new Date().toISOString(),
        "",
      );
      void unused;
      const asset = { ...draft, id: run.asset_id, status: "Draft" as const };
      result = { asset };
      mutation = persistArticle(run, asset);
    } else {
      const generated = await deps.image(
        userId,
        {
          projectId: run.project_id,
          assetId: run.asset_id,
          concept: run.snapshot.imageConcept,
          articleTitle: run.snapshot.opportunity.title,
          project: run.snapshot.project,
        },
        { attempt },
      );
      if (
        !generated.path.startsWith(`${userId}/${run.project_id}/${run.asset_id}/`) ||
        !generated.alt.trim()
      )
        throw new Error("invalid_staged_image");
      const image: ContentImage = {
        id: run.image_id,
        concept: run.snapshot.imageConcept,
        storagePath: generated.path,
        alt: generated.alt,
        placement: "featured",
        source: "generated",
        status: "proposed",
        required: true,
      };
      result = { image };
      mutation = persistImage(run, { ...image, previewUrl: generated.previewUrl });
    }
    // Preserve paid output before trying the separately revisioned workspace
    // write. A failed save leaves evidence for recovery, never another AI call.
    await rpc("record_owner_benchmark_result", {
      ...binding,
      p_result: JSON.parse(
        JSON.stringify({
          ...result,
          generatedAt: new Date().toISOString(),
          elapsedMs: Date.now() - started,
        }),
      ),
    });
    if (mutation) await bounded(deps.mutateWorkspace(userId, mutation));
    await rpc("finish_owner_benchmark_stage", { ...binding, p_success: true });
    return { outcome: "completed_stage" };
  } catch {
    try {
      await rpc("finish_owner_benchmark_stage", { ...binding, p_success: false });
      return { outcome: "stopped" };
    } catch {
      return { outcome: "uncertain" };
    }
  }
}
export async function getOwnerBenchmarkStatus(
  userId: string,
  runId: string,
  injected?: BenchmarkDeps,
) {
  const deps = injected ?? (await liveDeps());
  const raw = await bounded(deps.readRun(userId, runId));
  if (!raw) return null;
  const run = parseBenchmarkRun(raw);
  if (run.user_id !== userId || run.id !== runId) return null;
  return {
    id: run.id,
    stage: run.stage,
    state: run.state,
    title: run.snapshot.opportunity.title,
    assetId: run.asset_id,
    configured: deps.configured(),
    expired: Date.parse(run.expires_at) <= Date.now(),
    completed: (["scan", "article", "image"] as const).filter(
      (_step, index) =>
        run.state === "completed" || index < ["scan", "article", "image"].indexOf(run.stage),
    ),
    recorded: (["scan", "article", "image"] as const).filter((step) =>
      Object.hasOwn(run.results, step),
    ),
    needsAttention:
      run.state === "stopped" ||
      (run.state === "running" &&
        (!run.claimed_at || Date.now() - Date.parse(run.claimed_at) > 180000)),
  };
}
