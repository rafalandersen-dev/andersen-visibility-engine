import { readWorkspaceRow } from "./workspace.server";
import { publicationVersion } from "./publication-version";
import { assertPublicationApproved } from "./publication-approval.server";
import { buildActiveInternalPaths } from "./publish-targets";
import { publishBlockers } from "./checklist";
import type { ContentAsset, Project } from "./types";
import { z } from "zod";
/** The authenticated owner's manual scheduling action uses the saved exact
 * approval. Validate before replacing an existing schedule; the SQL transaction
 * then rechecks revision/approval and cancels+inserts atomically. */
export async function scheduleApprovedPublication(
  ownerId: string,
  projectId: string,
  assetId: string,
  publishAt: string,
) {
  const row = await readWorkspaceRow(ownerId);
  const content = (row?.data.content as ContentAsset[] | undefined) ?? [];
  const asset = content.find((a) => a.id === assetId && a.projectId === projectId);
  const project = (row?.data.projects as Project[] | undefined)?.find((p) => p.id === projectId);
  if (!row || !asset || !project) throw new Error("Content asset not found in your workspace.");
  const paths = buildActiveInternalPaths(
    project,
    content.filter((a) => a.projectId === projectId),
  );
  await assertPublicationApproved(ownerId, asset, project, paths);
  if (publishBlockers(asset, project, content).length)
    throw new Error("Resolve the article's publication checks before scheduling it.");
  const version = await publicationVersion(asset, project, paths);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
  const result = await db.rpc("schedule_approved_publication", {
    p_user: ownerId,
    p_project: projectId,
    p_asset: assetId,
    p_expected: row.rev,
    p_hash: version.hash,
    p_publish: publishAt,
  });
  if (result.error)
    throw new Error(
      "The article or its schedule changed. Refresh and check its approval before scheduling again.",
    );
  return z
    .object({
      id: z.string().uuid(),
      project_id: z.literal(projectId),
      asset_id: z.literal(assetId),
      publish_at: z.string().datetime({ offset: true }),
      status: z.literal("pending"),
      attempts: z.number().int().nonnegative(),
      created_at: z.string().datetime({ offset: true }),
      last_error: z.string().nullable().optional(),
      published_at: z.string().nullable().optional(),
    })
    .parse(result.data);
}
