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

/**
 * Thrown when the connector call SUCCEEDED — the post is live — but recording
 * that outcome in the workspace failed (rev conflict exhausted, DB error).
 *
 * Must never be retried. A retry re-runs the connector call, and because the
 * returned post id was never persisted, WordPress and Shopify take their CREATE
 * branch and put a SECOND copy of the article on the customer's site. Parking
 * the row and telling the user what happened is the only safe outcome.
 */
export class PublishRecordingFailedError extends Error {
  readonly permanent = true;
  constructor(
    message: string,
    readonly liveUrl?: string,
  ) {
    super(message);
    this.name = "PublishRecordingFailedError";
  }
}

/** True for any error the runner must not retry, across module boundaries. */
export function isPermanentPublishError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { permanent?: unknown }).permanent === true);
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
 * Fields the scheduling queue mirrors onto the asset. Cleared together whenever
 * a schedule stops being live (cancelled, published, or failed) — a stale
 * `scheduledPublishAt` would keep deriving the item to "Scheduled" and keep
 * promising a go-live that will never happen.
 */
export const CLEARED_SCHEDULE_FIELDS: Partial<ContentAsset> = {
  scheduledPublishAt: undefined,
  scheduledPublishStatus: undefined,
};

/**
 * Patch one asset inside the blob, immutably. Touches nothing else.
 *
 * Use this for every write that is NOT a confirmed successful publish —
 * failures, cancellations, status mirroring. It deliberately cannot promote an
 * opportunity: see applyPublishSuccess for why that separation matters.
 */
export function applyAssetPatch(
  data: WorkspaceData,
  assetId: string,
  assetPatch: Partial<ContentAsset>,
): WorkspaceData {
  const content = asArray<ContentAsset>(data.content).map((c) =>
    c?.id === assetId ? { ...c, ...assetPatch } : c,
  );
  return { ...data, content };
}

/**
 * Patch the asset AND promote its linked opportunity to published — the same
 * bookkeeping the editor does after a manual publish. Without it the Plan board
 * would leave a shipped item sitting in "Approved".
 *
 * Split from applyAssetPatch deliberately. The previous combined version keyed
 * the opportunity promotion off `asset.liveUrl` being truthy, which meant that
 * recording a FAILED publish on an asset that had been live since an earlier
 * run silently re-stamped the opportunity as freshly published — resetting
 * measurementStatus and overwriting publishedAt with a stale timestamp. The
 * promotion is now driven by the caller knowing it succeeded, never inferred.
 */
export function applyPublishSuccess(
  data: WorkspaceData,
  assetId: string,
  assetPatch: Partial<ContentAsset>,
): WorkspaceData {
  const next = applyAssetPatch(data, assetId, assetPatch);
  const content = asArray<ContentAsset>(next.content);
  const asset = content.find((c) => c?.id === assetId);
  const oppId = asset?.opportunityId ?? asset?.sourceOpportunityId;
  if (!asset?.liveUrl || !oppId) return next;

  return {
    ...next,
    opportunities: asArray<Record<string, unknown>>(data.opportunities).map((o) =>
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
    ),
  };
}
