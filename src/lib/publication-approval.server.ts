import { z } from "zod";
import {
  publicationVersion,
  publicationVersionSchema,
  samePublicationVersion,
} from "./publication-version";
import { buildActiveInternalPaths } from "./publish-targets";
import type { ContentAsset, Project } from "./types";
import type { KnowledgeRpc } from "./project-knowledge.server";
import type { readWorkspaceRow } from "./workspace.server";
const scopeSchema = z
  .object({
    ownerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();
export const publicationApprovalInput = z
  .object({ expectedVersion: publicationVersionSchema, approved: z.boolean() })
  .strict();
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rpc =
      injected ??
      (async (method, params) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return (supabaseAdmin as unknown as { rpc: KnowledgeRpc }).rpc(method, params);
      });
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("publication_approval_unavailable")), 10000);
      }),
    ]);
    if (!result || result.error || typeof result.data !== "boolean")
      throw new Error("publication_approval_unavailable");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}
/** Authenticated handlers supply ownerId. The browser supplies the version it
 * reviewed, never a replacement asset or the version stored as approved. */
export async function setPublicationApproval(
  target: z.infer<typeof scopeSchema>,
  raw: z.infer<typeof publicationApprovalInput>,
  dependencies: { read?: typeof readWorkspaceRow; rpc?: KnowledgeRpc } = {},
) {
  const scope = scopeSchema.parse(target),
    input = publicationApprovalInput.parse(raw);
  const read = dependencies.read ?? (await import("./workspace.server")).readWorkspaceRow;
  const row = await read(scope.ownerId);
  const project = (row?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === scope.projectId,
  );
  const content = (row?.data.content as ContentAsset[] | undefined) ?? [];
  const asset = content.find((a) => a.id === scope.assetId && a.projectId === scope.projectId);
  if (!row || !project || !asset) throw new Error("publication_asset_unavailable");
  const current = await publicationVersion(
    asset,
    project,
    buildActiveInternalPaths(
      project,
      content.filter((a) => a.projectId === project.id),
    ),
  );
  if (!samePublicationVersion(current, input.expectedVersion))
    throw new Error("publication_version_changed");
  const result = await call(
    "set_publication_approval",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_asset: scope.assetId,
      p_expected: row.rev,
      p_hash: current.hash,
      p_approved: input.approved,
    },
    dependencies.rpc,
  );
  if (!result) throw new Error("publication_approval_unavailable");
  return { version: current, approved: input.approved };
}
/** The caller must publish this same immutable asset/project snapshot after this
 * check. Current source checks and publication entitlement are separate gates. */
export async function assertPublicationApproved(
  ownerId: string,
  asset: ContentAsset,
  project: Project,
  paths: string[],
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse({ ownerId, projectId: project.id, assetId: asset.id });
  const current = await publicationVersion(asset, project, paths);
  if (
    !(await call(
      "read_publication_approval",
      {
        p_user: scope.ownerId,
        p_project: scope.projectId,
        p_asset: scope.assetId,
        p_hash: current.hash,
      },
      rpc,
    ))
  )
    throw new Error("publication_approval_required");
}
