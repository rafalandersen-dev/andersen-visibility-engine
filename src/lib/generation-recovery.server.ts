import type { GenerationResult } from "./generation-result";
import { parseGenerationResult } from "./generation-result";
import { readGenerationResult } from "./generation-result.server";
import { applyExternalDraftEdits } from "./external-draft";
import { resolveContentLanguage } from "./content-languages";
import { autoResolveInternalLinks } from "./auto-scheduler";
import { buildActiveInternalPaths } from "./publish-targets";
import { slugifyForPublish } from "./markdown";
import { isArticleLikeAssetType } from "./visual-model";
import type { ContentAsset, ContentImage, Opportunity, Project } from "./types";
import type { WorkspaceData, WorkspaceMutationOutcome } from "./workspace.server";

type Recovered = { assetId: string; projectId: string; outcome: "existing" | "recovered" };
function records<T>(data: WorkspaceData, key: string): T[] {
  if (!Array.isArray(data[key])) throw new Error("recovery_workspace_unavailable");
  return data[key] as T[];
}
/** One pure application to one read revision. Never overwrite an existing
 * edited result, promote an image, approve a draft or schedule publication.
 */
export function recoverGeneratedResultMutation(
  data: WorkspaceData,
  result: GenerationResult,
  now: string,
  previewUrl?: string,
): WorkspaceMutationOutcome<Recovered> {
  const projects = records<Project>(data, "projects"),
    content = records<ContentAsset>(data, "content");
  const project = projects.find((p) => p.id === result.projectId);
  if (!project) throw new Error("recovery_target_unavailable");
  const existing = content.find((a) => a.id === result.assetId);
  const base = { assetId: result.assetId, projectId: result.projectId };
  if (existing && existing.projectId !== result.projectId)
    throw new Error("recovery_identity_conflict");
  if (result.kind === "content") {
    if (existing) {
      if (
        existing.opportunityId !== result.opportunityId &&
        existing.sourceOpportunityId !== result.opportunityId
      )
        throw new Error("recovery_identity_conflict");
      return { data, result: { ...base, outcome: "existing" } };
    }
    const opportunities = records<Opportunity>(data, "opportunities");
    const opp = opportunities.find(
      (o) => o.id === result.opportunityId && o.projectId === result.projectId,
    );
    if (!opp || opp.archivedAt || opp.deletedAt || ["archived", "Discarded"].includes(opp.status))
      throw new Error("recovery_target_unavailable");
    const language = resolveContentLanguage(result.language);
    if (!language) throw new Error("recovery_language_unavailable");
    let rewrite: Pick<ContentAsset, "publishSlug" | "republishTargetUrl"> = {};
    if (opp.canonicalUrl) {
      // The live destination survives the lost draft on the opportunity. Use
      // current authoritative provenance, never a title-derived duplicate URL.
      if (
        project.publishMode !== "manualLive" &&
        project.connectorType &&
        project.connectorType !== "custom"
      )
        throw new Error("recovery_rewrite_target_unavailable");
      let target: URL;
      try {
        target = new URL(opp.canonicalUrl);
      } catch {
        throw new Error("recovery_rewrite_target_unavailable");
      }
      const publishSlug = target.pathname.replace(/^\//, "");
      if (
        !["http:", "https:"].includes(target.protocol) ||
        target.username ||
        target.password ||
        !publishSlug
      )
        throw new Error("recovery_rewrite_target_unavailable");
      rewrite = { publishSlug, republishTargetUrl: opp.canonicalUrl };
    }
    const resolved = autoResolveInternalLinks(
      result.output.markdown,
      new Set(
        buildActiveInternalPaths(
          project,
          content.filter((a) => a.projectId === project.id),
        ),
      ),
    );
    const asset: ContentAsset = {
      ...result.output,
      markdown: resolved.markdown,
      ...rewrite,
      id: result.assetId,
      projectId: result.projectId,
      opportunityId: result.opportunityId,
      title: result.title,
      slug: slugifyForPublish(result.title),
      status: "Draft",
      assetType: result.assetType,
      language,
      createdAt: now,
      updatedAt: now,
      sourceOpportunityId: result.opportunityId,
      sourceOpportunityTitle: result.title,
      ...(isArticleLikeAssetType(result.assetType) ? { visualModelVersion: 3 as const } : {}),
    };
    // A later draft may have become primary while generation was running.
    // Keep its pointer; the recovered draft remains directly accessible.
    const ownsPointer =
      !opp.currentContentAssetId ||
      opp.currentContentAssetId === asset.id ||
      !content.some((a) => a.id === opp.currentContentAssetId);
    return {
      data: {
        ...data,
        content: [...content, asset],
        opportunities: ownsPointer
          ? opportunities.map((o) =>
              o.id === opp.id
                ? {
                    ...o,
                    status: "drafting",
                    currentContentAssetId: asset.id,
                    version: (o.version ?? 1) + 1,
                    updatedAt: now,
                  }
                : o,
            )
          : opportunities,
      },
      result: { ...base, outcome: "recovered" },
    };
  }
  if (!existing) throw new Error("recovery_target_unavailable");
  const present = existing.images?.find((i) => i.id === result.imageId);
  if (present) {
    if (present.storagePath !== result.output.path) throw new Error("recovery_identity_conflict");
    return { data, result: { ...base, outcome: "existing" } };
  }
  if (!previewUrl) throw new Error("recovery_image_unavailable");
  if ((existing.images?.length ?? 0) >= 30) throw new Error("recovery_image_limit");
  const image: ContentImage = {
    id: result.imageId,
    concept: result.concept,
    storagePath: result.output.path,
    previewUrl,
    alt: result.output.alt,
    knowledgeReferences: result.output.knowledgeReferences,
    sourceDependencies: result.output.sourceDependencies,
    placement: "inline",
    source: "generated",
    status: "proposed",
    required: false,
  };
  const updated = applyExternalDraftEdits(
    existing,
    { images: [...(existing.images ?? []), image] },
    now,
  );
  return {
    data: { ...data, content: content.map((a) => (a.id === existing.id ? updated : a)) },
    result: { ...base, outcome: "recovered" },
  };
}
interface RecoveryDeps {
  readResult: typeof readGenerationResult;
  readWorkspace(userId: string): Promise<{ data: WorkspaceData; rev: number } | null>;
  updateWorkspace(
    userId: string,
    next: WorkspaceData,
    rev: number,
    prev: WorkspaceData,
  ): Promise<number | null>;
  preview(userId: string, path: string): Promise<string>;
}
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("recovery_timeout")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function recoverGenerationResult(
  userId: string,
  receiptId: string,
  supplied?: RecoveryDeps,
): Promise<Recovered> {
  let deps = supplied;
  if (!deps) {
    const workspace = await import("./workspace.server"),
      image = await import("./image-preview.server");
    deps = {
      readResult: readGenerationResult,
      readWorkspace: workspace.readWorkspaceRow,
      updateWorkspace: workspace.updateWorkspaceRow,
      preview: image.readArticleImagePreview,
    };
  }
  const retained = await bounded(deps.readResult(userId, receiptId));
  if (!retained) throw new Error("recovery_result_unavailable");
  const result = parseGenerationResult(retained.result, userId);
  const row = await bounded(deps.readWorkspace(userId));
  if (!row) throw new Error("recovery_workspace_unavailable");
  let next;
  try {
    next = recoverGeneratedResultMutation(
      structuredClone(row.data),
      result,
      new Date().toISOString(),
    );
  } catch (error) {
    if (
      result.kind !== "image" ||
      !(error instanceof Error) ||
      error.message !== "recovery_image_unavailable"
    )
      throw error;
    const preview = await bounded(deps.preview(userId, result.output.path));
    next = recoverGeneratedResultMutation(
      structuredClone(row.data),
      result,
      new Date().toISOString(),
      preview,
    );
  }
  if (next.result.outcome === "existing") return next.result;
  const rev = await bounded(deps.updateWorkspace(userId, next.data, row.rev, row.data));
  // Do not automatically reapply after a revision conflict: a concurrent owner
  // deletion/edit must not be resurrected by an internal retry.
  if (rev === null) throw new Error("recovery_workspace_changed");
  return next.result;
}

/** Availability is checked against current owned targets; retained evaluation
 * output and removed targets remain downloadable without a broken Restore CTA.
 */
export function canRestoreGenerationResult(data: WorkspaceData, result: GenerationResult): boolean {
  try {
    recoverGeneratedResultMutation(
      structuredClone(data),
      result,
      new Date().toISOString(),
      "availability-check",
    );
    return true;
  } catch {
    return false;
  }
}
