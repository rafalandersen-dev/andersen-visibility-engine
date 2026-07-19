/**
 * Server-side publish orchestration for the scheduled-publish runner.
 *
 * The browser path (`publishContentLive` in mock-ai.ts) reads the client store,
 * branches per connector, and writes the outcome back through the Zustand store
 * + `saveWorkspaceNow()`. The cron runner has neither a store nor a session, so
 * this module does the same job against the database: read the workspace blob,
 * branch on the same shared helpers, call the same connector transport, then
 * write the outcome back through the rev-guarded `mutateWorkspace`.
 *
 * The connector *transport* and the *target* decisions are deliberately shared
 * with the browser path (`publish-targets.ts`, `*Direct` functions) so a
 * scheduled publish and a manual one can never diverge.
 */
import { mutateWorkspace, type WorkspaceData } from "./workspace.server";
import { publishLiveDirect } from "./publish.functions";
import { publishWordPressLiveDirect } from "./wordpress.functions";
import { upsertArticle } from "./shopify.functions";
import { isShopify, isWordPress, shopifyArticleArgs, wpPublishArgs } from "./publish-targets";
import { applyOutcome, findAssetAndProject, PublishNotPossibleError } from "./publish-outcome";
import type { ContentAsset, Project } from "./types";

export { PublishNotPossibleError, findAssetAndProject } from "./publish-outcome";

export interface ServerPublishResult {
  liveUrl: string;
  publishedAt: string;
  platform: "wordpress" | "shopify" | "customEndpoint";
}

/**
 * Run the connector call for one asset. Pure I/O against the external site —
 * no workspace writes, so the caller decides how to record the outcome.
 */
async function runConnectorPublish(
  asset: ContentAsset,
  project: Project,
): Promise<{ result: ServerPublishResult; assetPatch: Partial<ContentAsset> }> {
  const publishedAt = new Date().toISOString();

  if (isWordPress(project)) {
    const res = await publishWordPressLiveDirect(wpPublishArgs(asset, project));
    if (!res.success || !res.liveUrl) {
      throw new Error(res.error || "WordPress published but did not return a live URL.");
    }
    return {
      result: { liveUrl: res.liveUrl, publishedAt, platform: "wordpress" },
      assetPatch: {
        liveUrl: res.liveUrl,
        livePublishedAt: publishedAt,
        publishExternalId: res.postId ? String(res.postId) : undefined,
        publishPlatform: "wordpress",
        wordpressPostId: res.postId,
        wordpressPostType: res.postType,
      },
    };
  }

  if (isShopify(project)) {
    const res = await upsertArticle(shopifyArticleArgs(asset, project), true);
    if (!res.success || !res.liveUrl) {
      throw new Error(res.error || "Shopify published but did not return a live URL.");
    }
    return {
      result: { liveUrl: res.liveUrl, publishedAt, platform: "shopify" },
      assetPatch: {
        liveUrl: res.liveUrl,
        livePublishedAt: publishedAt,
        publishExternalId: res.articleId || undefined,
        publishPlatform: "shopify",
        shopifyArticleId: res.articleId,
        shopifyArticleGid: res.articleGid,
        shopifyBlogId: res.blogId,
        shopifyBlogGid: res.blogGid,
        shopifyHandle: res.handle,
        shopifyStatus: "published",
      },
    };
  }

  // Custom endpoint. Mirrors the browser path's precondition: the draft has to
  // exist on the site before it can be flipped live.
  const liveEndpoint = (project.livePublishEndpoint ?? "").trim();
  const secret = (project.publishSecret ?? "").trim();
  if (!liveEndpoint) {
    throw new PublishNotPossibleError("No live-publish endpoint is configured for this project.");
  }
  if (!secret) {
    throw new PublishNotPossibleError("No publish secret is configured for this project.");
  }
  if (asset.publishStatus !== "sent") {
    throw new PublishNotPossibleError(
      "The draft was never sent to the website, so it cannot be published live.",
    );
  }

  const res = await publishLiveDirect({
    endpoint: liveEndpoint,
    secret,
    projectId: project.id,
    assetId: asset.id,
    externalId: asset.publishExternalId ?? "",
    slug: asset.publishSlug || asset.slug || "",
    destinationType: asset.publishDestinationType ?? project.defaultDestinationType ?? "blogPost",
  });

  return {
    result: { liveUrl: res.liveUrl, publishedAt: res.publishedAt, platform: "customEndpoint" },
    assetPatch: {
      liveUrl: res.liveUrl,
      livePublishedAt: res.publishedAt,
      publishExternalId: res.externalId || asset.publishExternalId,
    },
  };
}

/**
 * Publish one asset on behalf of `userId`, recording the outcome in the
 * workspace blob. Throws on failure; `PublishNotPossibleError` marks a
 * permanent failure the runner must not retry.
 */
export async function publishAssetServerSide(
  userId: string,
  assetId: string,
): Promise<ServerPublishResult> {
  // 1. Read-only pass to decide what to do (no write yet — the connector call
  //    is the slow part and we do not want to hold a rev across it).
  const { result, assetPatch } = await (async () => {
    const { readWorkspaceRow } = await import("./workspace.server");
    const row = await readWorkspaceRow(userId);
    if (!row) throw new PublishNotPossibleError("The workspace no longer exists.");
    const { asset, project } = findAssetAndProject(row.data, assetId);

    if (asset.livePublishStatus === "published" && asset.liveUrl) {
      // Already live (e.g. the user published manually before the slot came up).
      // Treat as success rather than publishing a second time.
      return {
        result: {
          liveUrl: asset.liveUrl,
          publishedAt: asset.livePublishedAt ?? new Date().toISOString(),
          platform: (asset.publishPlatform === "wordpress"
            ? "wordpress"
            : asset.publishPlatform === "shopify"
              ? "shopify"
              : "customEndpoint") as ServerPublishResult["platform"],
        },
        assetPatch: {} as Partial<ContentAsset>,
      };
    }
    return runConnectorPublish(asset, project);
  })();

  // 2. Record the outcome under the rev guard (retries on a lost race).
  await mutateWorkspace(userId, (data) => ({
    data: applyOutcome(data, assetId, {
      ...assetPatch,
      livePublishStatus: "published",
      livePublishError: undefined,
      scheduledPublishStatus: "published",
      scheduledPublishError: undefined,
    }),
    result: null,
  }));

  return result;
}

/** Record a failed scheduled publish on the asset so the editor can show it. */
export async function recordScheduledPublishFailure(
  userId: string,
  assetId: string,
  message: string,
): Promise<void> {
  await mutateWorkspace(userId, (data) => ({
    data: applyOutcome(data, assetId, {
      scheduledPublishStatus: "failed",
      scheduledPublishError: message,
    }),
    result: null,
  }));
}
