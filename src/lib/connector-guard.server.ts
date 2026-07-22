/**
 * Server-side publish guard for the WordPress & Shopify direct-connector RPCs.
 *
 * The manual "send to draft" / "publish live" server functions used to forward
 * whatever content + credentials the browser sent, running only the relative-link
 * check. That let a direct RPC call bypass EVERY other hard publishing blocker —
 * the duplicate-target guard, unresolved links introduced by a composed section,
 * a schema inconsistency, an unapproved v3 hook, … (the
 * client gates all of these in mock-ai, but a hand-rolled RPC call does not go
 * through the client).
 *
 * This closes that hole the same way the custom-endpoint fix did
 * (publish.functions.ts): the RPC handlers send only the project + asset ids, and
 * the server re-reads the CALLER'S OWN workspace, runs the SAME publishBlockers
 * checklist the editor and cron use, and re-derives the publish arguments (body,
 * JSON-LD, active internal paths, credentials, connector identity) from the stored
 * asset — never from the request. A blocked asset, or an id the caller does not
 * own, throws before any transport call is made.
 */
import type { ContentAsset, Project } from "./types";
import { publishBlockers } from "./checklist";
import { buildActiveInternalPaths, wpPublishArgs, shopifyArticleArgs } from "./publish-targets";

async function readAssetAndProject(
  userId: string,
  projectId: string,
  assetId: string,
): Promise<{ asset: ContentAsset; project: Project; corpus: ContentAsset[] }> {
  const { readWorkspaceRow } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("Workspace not found.");
  const projects = (row.data.projects as Project[] | undefined) ?? [];
  const content = (row.data.content as ContentAsset[] | undefined) ?? [];
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found in your workspace.");
  const asset = content.find((c) => c.id === assetId);
  if (!asset) throw new Error("Content not found in your workspace.");
  return { asset, project, corpus: content };
}

/**
 * Refuse to send OR publish while ANY deterministic hard blocker fails. Mirrors
 * mock-ai's `assertPublishable` and the custom-endpoint `assertPublishableServerSide`
 * so every connector — manual, live and scheduled — enforces the identical gate.
 */
function assertPublishable(asset: ContentAsset, project: Project, corpus: ContentAsset[]): void {
  const blockers = publishBlockers(asset, project, corpus);
  if (blockers.length) {
    throw new Error(
      `This draft is not publishable yet: ${blockers.map((b) => b.detail || b.label).join(" ")}`,
    );
  }
}

/** The active internal-path inventory, filtered to the project (== knownPathsForProject). */
function activePaths(project: Project, corpus: ContentAsset[]): string[] {
  return buildActiveInternalPaths(
    project,
    corpus.filter((c) => c.projectId === project.id),
  );
}

/** Authorise + re-derive the WordPress publish args for the caller's own asset. */
export async function serverWpArgs(userId: string, projectId: string, assetId: string) {
  const { asset, project, corpus } = await readAssetAndProject(userId, projectId, assetId);
  assertPublishable(asset, project, corpus);
  return wpPublishArgs(asset, project, activePaths(project, corpus));
}

/** Authorise + re-derive the Shopify article args for the caller's own asset. */
export async function serverShopifyArgs(userId: string, projectId: string, assetId: string) {
  const { asset, project, corpus } = await readAssetAndProject(userId, projectId, assetId);
  assertPublishable(asset, project, corpus);
  return shopifyArticleArgs(asset, project, activePaths(project, corpus));
}
