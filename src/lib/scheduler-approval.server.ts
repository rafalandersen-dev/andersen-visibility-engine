import { readWorkspaceRow } from "./workspace.server";
import { publicationVersion, samePublicationVersion } from "./publication-version";
import { buildActiveInternalPaths } from "./publish-targets";
import { publishBlockers } from "./checklist";
import { normalizeAutoSchedulerConfig } from "./auto-scheduler";
import type { ContentAsset, Project } from "./types";
/** Caller supplies its immutable prepared snapshot. Current authority and the
 * exact saved version must still agree before the atomic grant/queue commit. */
export async function armSchedulerPublication(
  userId: string,
  asset: ContentAsset,
  project: Project,
  corpus: ContentAsset[],
  lease: string,
  publishAt: string,
) {
  const expected = await publicationVersion(
    asset,
    project,
    buildActiveInternalPaths(
      project,
      corpus.filter((a) => a.projectId === project.id),
    ),
  );
  const row = await readWorkspaceRow(userId);
  const currentProject = (row?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === project.id,
  );
  const content = (row?.data.content as ContentAsset[] | undefined) ?? [];
  const currentAsset = content.find((a) => a.id === asset.id && a.projectId === project.id);
  if (!row || !currentProject || !currentAsset) throw new Error("scheduler_publication_changed");
  const cfg = normalizeAutoSchedulerConfig(currentProject.autoScheduler);
  if (
    !cfg.enabled ||
    cfg.mode !== "auto_publish" ||
    JSON.stringify(cfg) !== JSON.stringify(normalizeAutoSchedulerConfig(project.autoScheduler))
  )
    throw new Error("scheduler_authority_changed");
  const paths = buildActiveInternalPaths(
    currentProject,
    content.filter((a) => a.projectId === project.id),
  );
  if (
    currentAsset.status !== "Approved" ||
    publishBlockers(currentAsset, currentProject, content).length
  )
    throw new Error("scheduler_publication_needs_review");
  const version = await publicationVersion(currentAsset, currentProject, paths);
  if (!samePublicationVersion(expected, version)) throw new Error("scheduler_publication_changed");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
  const result = await db.rpc("arm_scheduler_publication", {
    p_user: userId,
    p_project: project.id,
    p_asset: asset.id,
    p_expected: row.rev,
    p_hash: version.hash,
    p_publish: publishAt,
    p_token: lease,
  });
  if (result.error || result.data !== true) throw new Error("scheduler_publication_needs_review");
}
