import { assertImageGenerationAllowed } from "./ai-usage.server";
import { dispatchWeeklyBatch } from "./weekly-dispatch";
import { z } from "zod";
import { localWeekStart } from "./weekly-preparation";
import {
  readWeeklyPreparation as readWeeklyPreparationRaw,
  readSchedulerControl,
} from "./weekly-preparation.server";
import { readWeeklyStages, runWeeklyStage } from "./weekly-stage.server";
import { refreshWeeklySources, WeeklySourceReviewRequiredError } from "./weekly-sources.server";
import {
  acquireSchedulerLease as acquireSchedulerLeaseRaw,
  assertSchedulerLease as assertSchedulerLeaseRaw,
  releaseSchedulerLease as releaseSchedulerLeaseRaw,
} from "./auto-scheduler-lease.server";
import {
  readWorkspaceRow as readWorkspaceRowRaw,
  updateWorkspaceRow as updateWorkspaceRowRaw,
} from "./workspace.server";
import { generateContentCore, generateOpportunitiesCore, projectBrief } from "./ai.functions";
import { generateArticleImageCore } from "./image-gen.functions";
import { readGenerationResult } from "./generation-result.server";
import { recoverGeneratedResultMutation } from "./generation-recovery.server";
import { loadProjectKnowledgeContext as loadProjectKnowledgeContextRaw } from "./project-knowledge.server";
import { normalizeAutoSchedulerConfig, selectCandidates } from "./auto-scheduler";
import {
  weeklyInputHash,
  weeklyResearchSchema,
  weeklyReceiptSchema,
  pinnedOpportunity,
  weeklySummarySchema,
  weeklyOpportunitySchema,
} from "./weekly-executor";
import { attachBestHook } from "./auto-scheduler.server";
import { assertPublicationApproved } from "./publication-approval.server";
import { buildActiveInternalPaths } from "./publish-targets";
import { armSchedulerPublication } from "./scheduler-approval.server";
import type { ContentAsset, Opportunity, Project, ServiceItem } from "./types";

class WeeklyOperationTimeoutError extends Error {
  constructor() {
    super("weekly_operation_timeout");
  }
}

/** A timed-out write/provider may still finish. The durable stage and delivery
 * transaction retain that uncertainty; this visit never retries the operation. */
async function bounded<T>(promise: PromiseLike<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WeeklyOperationTimeoutError()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const readWorkspaceRow = (...args: Parameters<typeof readWorkspaceRowRaw>) =>
  bounded(readWorkspaceRowRaw(...args));
const updateWorkspaceRow = (...args: Parameters<typeof updateWorkspaceRowRaw>) =>
  bounded(updateWorkspaceRowRaw(...args));
const readWeeklyPreparation = (...args: Parameters<typeof readWeeklyPreparationRaw>) =>
  bounded(readWeeklyPreparationRaw(...args));
const loadProjectKnowledgeContext = (...args: Parameters<typeof loadProjectKnowledgeContextRaw>) =>
  bounded(loadProjectKnowledgeContextRaw(...args));
const acquireSchedulerLease = (...args: Parameters<typeof acquireSchedulerLeaseRaw>) =>
  bounded(acquireSchedulerLeaseRaw(...args));
const assertSchedulerLease = (...args: Parameters<typeof assertSchedulerLeaseRaw>) =>
  bounded(assertSchedulerLeaseRaw(...args));
const releaseSchedulerLease = (...args: Parameters<typeof releaseSchedulerLeaseRaw>) =>
  bounded(releaseSchedulerLeaseRaw(...args));

const scopeSchema = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
type Scope = z.infer<typeof scopeSchema>;
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      db.rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("weekly_storage_unavailable")), 10000);
      }),
    ]);
    if (result.error) throw new Error("weekly_storage_unavailable");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function readWeeklySummary(scope: Scope, period: string) {
  const raw = await rpc("read_weekly_preparation_summary", {
    p_user: scope.ownerId,
    p_project: scope.projectId,
    p_period: period,
  });
  return z
    .object({ summary: weeklySummarySchema, updatedAt: z.string().datetime({ offset: true }) })
    .nullable()
    .parse(raw);
}
async function snapshot(scope: Scope) {
  const row = await readWorkspaceRow(scope.ownerId);
  const project = (row?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === scope.projectId,
  );
  if (!row || !project) throw new Error("weekly_project_unavailable");
  const content = (row.data.content as ContentAsset[] | undefined) ?? [];
  const opportunities = ((row.data.opportunities as Opportunity[] | undefined) ?? []).filter(
    (o) => o.projectId === project.id,
  );
  const services = ((row.data.services as ServiceItem[] | undefined) ?? []).filter(
    (s) => s.projectId === project.id,
  );
  if (content.length > 5000 || opportunities.length > 1000 || services.length > 100)
    throw new Error("weekly_input_too_large");
  return { row, project, content, opportunities, services };
}
async function context(scope: Scope, state: Awaited<ReturnType<typeof snapshot>>) {
  const knowledge = await loadProjectKnowledgeContext(scope, "text");
  const project = knowledge.brandIntelligence
    ? { ...state.project, brandIntelligence: knowledge.brandIntelligence }
    : state.project;
  const knowledgeHash = await weeklyInputHash(knowledge);
  const contextHash = await weeklyInputHash({
    brief: projectBrief(project, state.services),
    knowledgeHash,
    sitemap: project.sitemapInventory,
    schedule: normalizeAutoSchedulerConfig(project.autoScheduler),
  });
  return {
    knowledgeHash,
    contextHash,
    knowledgeReferences: knowledge.references,
    sourceDependencies: knowledge.sourceDependencies,
  };
}
/** At most twenty concurrent projects per tick, and one paid stage per project.
 * Native admission remains scoped/funded; unknown stages never authorize replay.
 * Project failures are isolated, and SQL selection skips active project leases. */
export async function runWeeklyAutoScheduler(now = new Date()) {
  const targets = await rpc("next_weekly_preparation_targets");
  return { projects: await dispatchWeeklyBatch(targets, (scope) => runWeeklyProject(scope, now)) };
}
export async function runWeeklyProject(scope: Scope, now = new Date()) {
  scope = scopeSchema.parse(scope);
  const started = Date.now();
  let state = await snapshot(scope);
  const cfg = normalizeAutoSchedulerConfig(state.project.autoScheduler);
  const currentWeek = localWeekStart(now, cfg.timeZone);
  const nextWeek = new Date(Date.parse(currentWeek + "T00:00:00Z") + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  // Finish an already-started current week before the next one; missed slots
  // remain held. Never backfill an unstarted current week after its review lead.
  const currentStages = await readWeeklyStages(scope, `week:${currentWeek}`);
  const currentReadiness = await readWeeklyPreparation(scope, currentWeek, now);
  const week = currentStages.some((s) => {
    const slot = currentReadiness.readiness.find(
      (r) => Date.parse(r.publishAt) === Date.parse(s.publishAt),
    );
    if (
      !slot ||
      ["queued", "publishing", "published", "cancelled"].includes(slot.state) ||
      s.state === "cancelled" ||
      Date.parse(s.publishAt) <= now.getTime()
    )
      return false;
    return (
      !currentStages.some(
        (other) => other.publishAt === s.publishAt && other.stage === "image" && other.deliveredAt,
      ) ||
      (cfg.mode === "auto_publish" &&
        state.content.some((a) => a.id === s.outputId && a.status === "Approved"))
    );
  })
    ? currentWeek
    : nextWeek;
  let readiness = await readWeeklyPreparation(scope, week, now);
  const period = readiness.period;
  let action: z.infer<typeof weeklySummarySchema>["action"] = "waiting";
  const report = async () => {
    readiness = await readWeeklyPreparation(scope, week, now);
    const summary = weeklySummarySchema.parse({
      slots: readiness.slots.length,
      drafted: readiness.readiness.filter((s) =>
        ["drafted", "queued", "publishing", "published"].includes(s.state),
      ).length,
      queued: readiness.readiness.filter((s) =>
        ["queued", "publishing", "published"].includes(s.state),
      ).length,
      uncovered: readiness.readiness.filter(
        (s) => !["drafted", "queued", "publishing", "published"].includes(s.state),
      ).length,
      action,
    });
    await rpc("save_weekly_preparation_summary", {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_period: period,
      p_summary: summary,
    });
    return { projectId: scope.projectId, period, ...summary };
  };
  if (!readiness.enabled || readiness.control.engine !== "weekly" || !readiness.due)
    return report();
  await rpc("reconcile_weekly_preparation", {
    p_user: scope.ownerId,
    p_project: scope.projectId,
    p_period: period,
  });
  let lease: string | undefined;
  try {
    lease = await acquireSchedulerLease(scope.ownerId, scope.projectId, period);
    const token = lease;
    async function assertActive() {
      if (Date.now() - started > 260000) throw new Error("weekly_visit_deadline");
      await assertSchedulerLease(scope.ownerId, scope.projectId, token);
      const control = await readSchedulerControl(scope);
      state = await snapshot(scope);
      if (
        control.engine !== "weekly" ||
        control.revision !== readiness.control.revision ||
        !state.project.autoScheduler?.enabled ||
        JSON.stringify(normalizeAutoSchedulerConfig(state.project.autoScheduler)) !==
          JSON.stringify(cfg)
      )
        throw new Error("weekly_context_changed");
    }
    await assertActive();
    let stages = await readWeeklyStages(scope, period);
    for (const completed of stages.filter(
      (s) => s.stage === "content" && s.deliveredAt && s.state === "retained",
    )) {
      if (Date.now() - started > 60000) break;
      const asset = state.content.find(
        (a) => a.id === completed.outputId && a.projectId === scope.projectId,
      );
      const scheduled = readiness.readiness.find(
        (s) => Date.parse(s.publishAt) === Date.parse(completed.publishAt),
      );
      if (
        cfg.mode !== "auto_publish" ||
        !asset ||
        asset.status !== "Approved" ||
        scheduled?.state !== "drafted" ||
        Date.parse(completed.publishAt) <= now.getTime()
      )
        continue;
      try {
        await bounded(
          assertPublicationApproved(
            scope.ownerId,
            asset,
            state.project,
            buildActiveInternalPaths(
              state.project,
              state.content.filter((a) => a.projectId === scope.projectId),
            ),
          ),
        );
        await bounded(
          armSchedulerPublication(
            scope.ownerId,
            asset,
            state.project,
            state.content,
            token,
            completed.publishAt,
          ),
        );
        const { writeScheduleMirror } = await import("./publish.server");
        await bounded(writeScheduleMirror(scope.ownerId, asset.id, completed.publishAt)).catch(
          () => undefined,
        );
        action = "queued";
        return await report();
      } catch (error) {
        // Admission may finish after timeout. Stop this visit; only a fresh
        // authoritative queue read can establish its outcome on the next visit.
        if (error instanceof WeeklyOperationTimeoutError) throw error;
        action = "review-required";
      }
    }
    const slot = readiness.slots.find((s) => {
      const owned = stages.filter(
        (stage) => Date.parse(stage.publishAt) === Date.parse(s.publishAt),
      );
      const row = readiness.readiness.find((r) => r.slotId === s.slotId)!;
      if (
        owned.some((stage) => stage.state === "cancelled") ||
        ["queued", "publishing", "published", "cancelled", "conflict"].includes(row.state)
      )
        return false;
      if (Date.parse(s.publishAt) <= now.getTime()) return false;
      if (owned.some((stage) => stage.stage === "image" && stage.deliveredAt)) return false;
      return owned.length > 0 || readiness.missing.some((m) => m.slotId === s.slotId);
    });
    if (!slot) {
      action = "review-required";
      return await report();
    }
    const sameSlot = () =>
      stages.filter((s) => Date.parse(s.publishAt) === Date.parse(slot.publishAt));
    const researchStage = sameSlot().find((s) => s.stage === "research");
    const stageArgs = {
      scope,
      lease: token,
      revision: readiness.control.revision,
      publishAt: slot.publishAt,
    };
    if (!researchStage) {
      const provenance = await refreshWeeklySources(scope, async () => {
        if (Date.now() - started > 60000) throw new Error("weekly_visit_deadline");
        await assertActive();
      });
      await assertActive();
      const ctx = await context(scope, state);
      const alreadyPinned = new Set(
        stages
          .filter((s) => s.stage === "research" && s.state === "retained")
          .map((s) => weeklyResearchSchema.parse(s.result).opportunity.id),
      );
      const candidate = selectCandidates(
        state.opportunities.filter(
          (o) =>
            !alreadyPinned.has(o.id) && !o.canonicalUrl && !o.currentContentAssetId && !o.dueAt,
        ),
        1,
      )[0];
      const inputHash = await weeklyInputHash({
        ...ctx,
        candidate: candidate ? weeklyOpportunitySchema.parse(candidate) : null,
      });
      await runWeeklyStage({
        ...stageArgs,
        stage: "research",
        inputHash,
        parseResult: (v) => weeklyResearchSchema.parse(v),
        work: async (identity) => {
          await assertActive();
          if ((await context(scope, state)).contextHash !== ctx.contextHash)
            throw new Error("weekly_context_changed");
          if (Date.now() - started > 60000) throw new Error("weekly_visit_deadline");
          const opportunity = candidate ?? {
            ...(
              await generateOpportunitiesCore(
                scope.ownerId,
                {
                  project: state.project,
                  services: state.services,
                  existingTitles: state.opportunities.map((o) => o.title).slice(0, 100),
                },
                {
                  enforceLimit: true,
                  expectedKnowledgeHash: ctx.knowledgeHash,
                  attempt: { requestId: identity.requestId, jobId: token },
                },
              )
            ).opportunities[0],
            id: identity.outputId,
            projectId: scope.projectId,
          };
          return {
            opportunity: weeklyOpportunitySchema.parse(opportunity),
            ...ctx,
            provenance,
            origin: candidate ? "owner-plan" : "generated-hypothesis",
          };
        },
      });
      action = "research-retained";
      return await report();
    }
    if (researchStage.state !== "retained") throw new Error("weekly_stage_recovery_required");
    const research = weeklyResearchSchema.parse(researchStage.result);
    const ctx = await context(scope, state);
    if (research.contextHash !== ctx.contextHash) throw new Error("weekly_context_changed");
    const opportunity = pinnedOpportunity(research.opportunity);
    const ownerOpportunity = state.opportunities.find((o) => o.id === opportunity.id);
    if (
      (research.origin === "owner-plan" && !ownerOpportunity) ||
      (ownerOpportunity &&
        (ownerOpportunity.archivedAt ||
          ownerOpportunity.deletedAt ||
          ["archived", "Discarded", "published", "scheduled"].includes(ownerOpportunity.status) ||
          ownerOpportunity.dueAt ||
          ownerOpportunity.canonicalUrl ||
          ownerOpportunity.publishedAt ||
          (await weeklyInputHash(weeklyOpportunitySchema.parse(ownerOpportunity))) !==
            (await weeklyInputHash(research.opportunity))))
    )
      throw new Error("weekly_context_changed");
    if (!ownerOpportunity) {
      if (researchStage.deliveredAt) throw new Error("weekly_owner_removed_output");
      // One CAS only: an owner edit/deletion never triggers a blind replay.
      const rev = await updateWorkspaceRow(
        scope.ownerId,
        {
          ...state.row.data,
          opportunities: [
            ...((state.row.data.opportunities as Opportunity[] | undefined) ?? []),
            opportunity,
          ],
        },
        state.row.rev,
        state.row.data,
      );
      if (rev === null) throw new Error("weekly_workspace_changed");
      state = await snapshot(scope);
    }
    let contentStage = sameSlot().find((s) => s.stage === "content");
    if (!contentStage) {
      await assertActive();
      const latestOpportunity = state.opportunities.find((o) => o.id === opportunity.id);
      if (
        !latestOpportunity ||
        latestOpportunity.currentContentAssetId ||
        !selectCandidates([latestOpportunity], 1).length ||
        latestOpportunity.dueAt ||
        (await context(scope, state)).contextHash !== research.contextHash
      )
        throw new Error("weekly_context_changed");
      await runWeeklyStage({
        ...stageArgs,
        stage: "content",
        inputHash: await weeklyInputHash(research),
        parseResult: (v) => weeklyReceiptSchema.parse(v),
        work: async (identity) => {
          if (Date.now() - started > 60000) throw new Error("weekly_visit_deadline");
          const gen = await bounded(
            generateContentCore(
              scope.ownerId,
              {
                project: state.project,
                services: state.services,
                opportunity,
                assetType: "article",
              },
              {
                enforceLimit: true,
                attempt: { requestId: identity.requestId, jobId: token },
                assetId: identity.outputId,
                expectedKnowledgeHash: research.knowledgeHash,
              },
            ),
            180000,
          );
          return weeklyReceiptSchema.parse({ receiptId: gen.generationReceiptId });
        },
      });
      action = "content-retained";
      stages = await readWeeklyStages(scope, period);
      contentStage = sameSlot().find((s) => s.stage === "content");
    }
    if (!contentStage || contentStage.state !== "retained")
      throw new Error("weekly_stage_recovery_required");
    if (contentStage.outputChanged) throw new Error("weekly_owner_changed_output");
    const receipt = weeklyReceiptSchema.parse(contentStage.result);
    const retained = await readGenerationResult(scope.ownerId, receipt.receiptId);
    if (
      !retained ||
      retained.result.kind !== "content" ||
      retained.result.projectId !== scope.projectId ||
      retained.result.assetId !== contentStage.outputId ||
      retained.result.opportunityId !== opportunity.id
    )
      throw new Error("weekly_result_unavailable");
    await assertActive();
    if ((await context(scope, state)).contextHash !== research.contextHash)
      throw new Error("weekly_context_changed");
    let asset = state.content.find(
      (a) => a.id === contentStage.outputId && a.projectId === scope.projectId,
    );
    if (!asset) {
      if (contentStage.deliveredAt) throw new Error("weekly_owner_removed_output");
      const next = recoverGeneratedResultMutation(
        state.row.data,
        retained.result,
        now.toISOString(),
      );
      next.data.content = (next.data.content as ContentAsset[]).map((a) =>
        a.id === retained.result.assetId
          ? {
              ...(attachBestHook(a, now.toISOString()) ?? a),
              autoScheduledFor: period,
              autoSchedulerPlannedAt: slot.publishAt,
            }
          : a,
      );
      if (
        (await updateWorkspaceRow(scope.ownerId, next.data, state.row.rev, state.row.data)) === null
      )
        throw new Error("weekly_workspace_changed");
      state = await snapshot(scope);
      asset = state.content.find(
        (a) => a.id === contentStage!.outputId && a.projectId === scope.projectId,
      );
    }
    if (!asset || asset.autoSchedulerPlannedAt !== slot.publishAt || asset.status !== "Draft")
      throw new Error("weekly_owner_changed_output");
    if (action === "content-retained") return await report();
    const imageStage = sameSlot().find((s) => s.stage === "image");
    if (!imageStage) {
      await assertActive();
      try {
        await bounded(assertImageGenerationAllowed({ userId: scope.ownerId }));
      } catch {
        throw new Error("weekly_image_entitlement_capacity_required");
      }
      const visual = await loadProjectKnowledgeContext(scope, "visual", undefined, undefined, 5500);
      const visualHash = await weeklyInputHash(visual);
      const concept = `${asset.title}. ${opportunity.targetAudience}`.slice(0, 500);
      await runWeeklyStage({
        ...stageArgs,
        stage: "image",
        inputHash: await weeklyInputHash({
          assetId: asset.id,
          title: asset.title,
          concept,
          visualHash,
        }),
        parseResult: (v) => weeklyReceiptSchema.parse(v),
        work: async (identity) => {
          if (Date.now() - started > 60000) throw new Error("weekly_visit_deadline");
          const gen = await bounded(
            generateArticleImageCore(
              scope.ownerId,
              {
                projectId: scope.projectId,
                assetId: asset!.id,
                articleTitle: asset!.title,
                concept,
                project: state.project,
              },
              {
                attempt: { requestId: identity.requestId, jobId: token },
                imageId: identity.outputId,
                expectedKnowledgeHash: visualHash,
              },
            ),
            180000,
          );
          return weeklyReceiptSchema.parse({ receiptId: gen.generationReceiptId });
        },
      });
      stages = await readWeeklyStages(scope, period);
      action = "image-retained";
    }
    const finalImage = sameSlot().find((s) => s.stage === "image");
    if (!finalImage || finalImage.state !== "retained")
      throw new Error("weekly_stage_recovery_required");
    const imageResult = await readGenerationResult(
      scope.ownerId,
      weeklyReceiptSchema.parse(finalImage.result).receiptId,
    );
    if (
      !imageResult ||
      imageResult.result.kind !== "image" ||
      imageResult.result.imageId !== finalImage.outputId ||
      imageResult.result.assetId !== asset.id ||
      imageResult.result.projectId !== scope.projectId
    )
      throw new Error("weekly_result_unavailable");
    if (!finalImage.deliveredAt) {
      const { readArticleImagePreview } = await import("./image-preview.server");
      const preview = await bounded(
        readArticleImagePreview(scope.ownerId, imageResult.result.output.path),
      );
      // Preserve any owner edit during image generation by holding on a CAS
      // mismatch. The private archive stays recoverable in the existing UI.
      await assertActive();
      const before = await snapshot(scope);
      const current = before.content.find((a) => a.id === asset!.id);
      if ((await weeklyInputHash(current)) !== (await weeklyInputHash(asset)))
        throw new Error("weekly_owner_changed_output");
      const next = recoverGeneratedResultMutation(
        before.row.data,
        imageResult.result,
        now.toISOString(),
        preview,
      );
      next.data.content = (next.data.content as ContentAsset[]).map((a) => {
        if (a.id !== asset!.id) return a;
        const proposed = {
          ...a,
          images: a.images?.map((i) =>
            i.id === finalImage.outputId
              ? { ...i, placement: "featured" as const, required: true }
              : i,
          ),
        };
        return proposed;
      });
      if (
        (await updateWorkspaceRow(scope.ownerId, next.data, before.row.rev, before.row.data)) ===
        null
      )
        throw new Error("weekly_workspace_changed");
    }
    action = "review-required";
    // Generated visuals remain proposed. A later visit queues only the exact
    // owner-approved completed version through the finalization path above.
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    action =
      error instanceof WeeklySourceReviewRequiredError
        ? "review-required"
        : /context_changed|owner_changed|owner_removed/.test(message)
          ? "context-changed"
          : /budget|expense|quota|limit|capacity/i.test(message)
            ? "capacity-required"
            : "recovery-required";
  } finally {
    if (lease)
      await releaseSchedulerLease(scope.ownerId, scope.projectId, lease).catch(() => undefined);
  }
  return report();
}
