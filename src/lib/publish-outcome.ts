/**
 * Pure workspace-blob transforms used by the scheduled-publish runner.
 *
 * Deliberately free of server imports (no createServerFn, no supabaseAdmin) so
 * the decision logic — which asset, which project, what the blob looks like
 * afterwards — is unit-testable without a database or a request context.
 */
import type { ContentAsset, Project } from "./types";
import type { WorkspaceData } from "./workspace.server";

/** Thrown when the asset/project cannot support a publish at all (never retried). */
export class PublishNotPossibleError extends Error {
  readonly permanent = true;
  constructor(message: string) {
    super(message);
    this.name = "PublishNotPossibleError";
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Locate an asset and its project inside the raw workspace blob. */
export function findAssetAndProject(
  data: WorkspaceData,
  assetId: string,
): { asset: ContentAsset; project: Project } {
  const asset = asArray<ContentAsset>(data.content).find((c) => c?.id === assetId);
  if (!asset) throw new PublishNotPossibleError("The content asset no longer exists.");
  const project = asArray<Project>(data.projects).find((p) => p?.id === asset.projectId);
  if (!project) throw new PublishNotPossibleError("The project for this content no longer exists.");
  return { asset, project };
}

/**
 * Apply a patch to one asset inside the blob, immutably, and keep the linked
 * opportunity in step when the asset went live — the same bookkeeping the
 * editor does after a manual publish. Without it the Plan board would leave a
 * published item sitting in "Approved".
 */
export function applyOutcome(
  data: WorkspaceData,
  assetId: string,
  assetPatch: Partial<ContentAsset>,
): WorkspaceData {
  const content = asArray<ContentAsset>(data.content).map((c) =>
    c?.id === assetId ? { ...c, ...assetPatch } : c,
  );
  const next: WorkspaceData = { ...data, content };

  const asset = content.find((c) => c?.id === assetId);
  const oppId = asset?.opportunityId ?? asset?.sourceOpportunityId;
  if (asset?.liveUrl && oppId) {
    next.opportunities = asArray<Record<string, unknown>>(data.opportunities).map((o) =>
      o?.id === oppId
        ? {
            ...o,
            status: "published",
            currentContentAssetId: asset.id,
            canonicalUrl: asset.liveUrl,
            publishedAt: asset.livePublishedAt,
            measurementStatus: "collecting",
          }
        : o,
    );
  }
  return next;
}
