import { z } from "zod";
import type { ContentAsset, Project } from "./types";
import type { KnowledgeRpc } from "./project-knowledge.server";
import type { readWorkspaceRow } from "./workspace.server";
import { readProjectKnowledge, readProjectKnowledgeBrand } from "./project-knowledge.server";
import {
  evaluateAssetKnowledge,
  readOutputKnowledgeDependencies,
} from "./knowledge-publication.server";
import { knowledgeReferencesSchema } from "./project-knowledge";
import { publicationVersion } from "./publication-version";
import { buildActiveInternalPaths } from "./publish-targets";

export const knowledgeOutputReviewScope = z
  .object({
    ownerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();

/** Inspection only. This snapshot cannot approve publication or replace retained
 * provenance. A later review write must re-read and atomically bind its state. */
export async function readKnowledgeOutputReview(
  target: z.infer<typeof knowledgeOutputReviewScope>,
  dependencies: { read?: typeof readWorkspaceRow; rpc?: KnowledgeRpc; now?: string } = {},
) {
  const scope = knowledgeOutputReviewScope.parse(target);
  const read = dependencies.read ?? (await import("./workspace.server")).readWorkspaceRow;
  const workspace = await read(scope.ownerId);
  const project = (workspace?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === scope.projectId,
  );
  const content = (workspace?.data.content ?? []) as ContentAsset[];
  const asset = content.find((a) => a.id === scope.assetId && a.projectId === scope.projectId);
  if (!workspace || !project || !asset) throw new Error("knowledge_output_unavailable");
  if ((asset.images?.length ?? 0) > 30) throw new Error("knowledge_output_unavailable");
  const registry = await readOutputKnowledgeDependencies(
    scope.ownerId,
    scope.projectId,
    [asset.id],
    dependencies.rpc,
  );
  const knowledgeScope = { ownerId: scope.ownerId, projectId: scope.projectId };
  const state = await readProjectKnowledge(knowledgeScope, dependencies.rpc);
  const profile = await readProjectKnowledgeBrand(knowledgeScope, dependencies.rpc);
  const now = z
    .string()
    .datetime({ offset: true })
    .parse(dependencies.now ?? new Date().toISOString());
  const relevant = registry.filter(
    (r) => r.kind === "content" || asset.images?.some((i) => i.id === r.outputId),
  );
  const groups = [
    {
      kind: "content" as const,
      outputId: asset.id,
      references: knowledgeReferencesSchema.parse(asset.knowledgeReferences ?? []),
    },
    ...(asset.images ?? []).map((i) => ({
      kind: "image" as const,
      outputId: i.id,
      references: knowledgeReferencesSchema.parse(i.knowledgeReferences ?? []),
    })),
    ...relevant,
  ];
  const original = [
    ...new Map(
      groups.flatMap((group) =>
        group.references.map((reference) => {
          const item = { kind: group.kind, outputId: group.outputId, reference };
          return [JSON.stringify(item), item] as const;
        }),
      ),
    ).values(),
  ];
  if (original.length > 9300) throw new Error("knowledge_output_unavailable");
  const issues = evaluateAssetKnowledge(scope.ownerId, asset, state, registry, now, profile);
  const version = await publicationVersion(
    asset,
    project,
    buildActiveInternalPaths(
      project,
      content.filter((a) => a.projectId === project.id),
    ),
  );
  const facts = original.map((item) => {
    const record = state.records.find(
      (r) =>
        r.id === item.reference.recordId &&
        r.ownerId === scope.ownerId &&
        r.projectId === scope.projectId,
    );
    const source = state.sources.find(
      (s) =>
        s.id === item.reference.sourceId &&
        s.ownerId === scope.ownerId &&
        s.projectId === scope.projectId,
    );
    // Never reconstruct forgotten facts from archives or another project.
    return { ...item, record: record ?? null, source: source ?? null };
  });
  const result = {
    assetId: asset.id,
    title: asset.title,
    markdown: asset.markdown ?? "",
    version,
    checkedAt: now,
    facts,
    forgotten: relevant.some((r) => r.forgotten),
    issues,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2000000)
    throw new Error("knowledge_output_too_large");
  const latest = await read(scope.ownerId);
  if (!latest || latest.rev !== workspace.rev) throw new Error("knowledge_output_changed");
  return result;
}
