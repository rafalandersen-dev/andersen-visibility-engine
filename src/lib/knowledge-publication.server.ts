import { z } from "zod";
import type { ContentAsset } from "./types";
import {
  knowledgeReferencesSchema,
  selectProjectKnowledge,
  type KnowledgeReference,
} from "./project-knowledge";
import {
  readProjectKnowledge,
  type KnowledgeRpc,
  KnowledgeUnavailableError,
} from "./project-knowledge.server";

const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const registrySchema = z
  .array(
    z
      .object({
        assetId: identity,
        outputId: identity,
        kind: z.enum(["content", "image"]),
        references: knowledgeReferencesSchema,
        forgotten: z.boolean(),
      })
      .strict(),
  )
  .max(1000);
export type KnowledgeRegistry = z.infer<typeof registrySchema>;
export type KnowledgePublicationIssue = {
  sourceId: string;
  key: string;
  critical: true;
  reason: "unavailable" | "changed";
  evidence: "knowledge";
};
export async function readOutputKnowledgeDependencies(
  userId: string,
  projectId: string,
  assets: string[],
  rpc?: KnowledgeRpc,
) {
  z.string().uuid().parse(userId);
  identity.parse(projectId);
  z.array(identity).max(100).parse(assets);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      rpc = (name, args) => (supabaseAdmin as unknown as { rpc: KnowledgeRpc }).rpc(name, args);
    }
    const result = await Promise.race([
      rpc("read_output_knowledge_dependencies", {
        p_user: userId,
        p_project: projectId,
        p_assets: assets,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new KnowledgeUnavailableError()), 10000);
      }),
    ]);
    if (result.error) throw new KnowledgeUnavailableError();
    const rows = registrySchema.parse(result.data);
    if (
      rows.some((r) => !assets.includes(r.assetId)) ||
      new Set(rows.map((r) => `${r.assetId}:${r.kind}:${r.outputId}`)).size !== rows.length
    )
      throw new KnowledgeUnavailableError();
    return rows;
  } catch {
    throw new KnowledgeUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

/** Exact original references, not current values substituted into old output.
 * Archive-backed registry references survive browser omissions and discard.
 * Missing/forgotten evidence holds; removing a specific image removes its use.
 */
export function evaluateAssetKnowledge(
  userId: string,
  asset: ContentAsset,
  state: Awaited<ReturnType<typeof readProjectKnowledge>>,
  registry: KnowledgeRegistry,
  now: string,
): KnowledgePublicationIssue[] {
  if (!Array.isArray(asset.images ?? []) || (asset.images?.length ?? 0) > 30)
    throw new KnowledgeUnavailableError();
  const relevant = registry.filter(
    (r) =>
      r.assetId === asset.id &&
      (r.kind === "content" || asset.images?.some((i) => i.id === r.outputId)),
  );
  const issues: KnowledgePublicationIssue[] = relevant.some((r) => r.forgotten)
    ? [
        {
          sourceId: "",
          key: "forgotten-knowledge",
          critical: true,
          reason: "unavailable",
          evidence: "knowledge",
        },
      ]
    : [];
  const groups = [
    {
      output: "text" as const,
      refs: [
        ...knowledgeReferencesSchema.parse(asset.knowledgeReferences ?? []),
        ...relevant.filter((r) => r.kind === "content").flatMap((r) => r.references),
      ],
    },
    {
      output: "visual" as const,
      refs: [
        ...(asset.images ?? []).flatMap((i) =>
          knowledgeReferencesSchema.parse(i.knowledgeReferences ?? []),
        ),
        ...relevant.filter((r) => r.kind === "image").flatMap((r) => r.references),
      ],
    },
  ];
  const key = (r: KnowledgeReference) =>
    JSON.stringify([
      r.recordId,
      r.recordRevision,
      r.sourceId,
      r.sourceRevision,
      r.sourceFingerprint,
    ]);
  for (const group of groups) {
    if (!group.refs.length) continue;
    const selection = selectProjectKnowledge(
      state.sources,
      state.records,
      { ownerId: userId, projectId: asset.projectId },
      group.output,
      now,
    );
    const current = new Set(selection.references.map(key));
    for (const ref of new Map(group.refs.map((r) => [key(r), r])).values()) {
      if (!current.has(key(ref)))
        issues.push({
          sourceId: ref.sourceId,
          key: ref.recordId,
          critical: true,
          reason: selection.references.some((r) => r.recordId === ref.recordId)
            ? "changed"
            : "unavailable",
          evidence: "knowledge",
        });
    }
  }
  return [...new Map(issues.map((i) => [`${i.key}:${i.reason}`, i])).values()];
}

export async function knowledgeIssuesForAsset(
  userId: string,
  asset: ContentAsset,
  now = new Date().toISOString(),
  rpc?: KnowledgeRpc,
) {
  const registry = await readOutputKnowledgeDependencies(userId, asset.projectId, [asset.id], rpc);
  const hasRefs =
    (asset.knowledgeReferences?.length ?? 0) > 0 ||
    (asset.images ?? []).some((i) => (i.knowledgeReferences?.length ?? 0) > 0) ||
    registry.length > 0;
  const state = hasRefs
    ? await readProjectKnowledge({ ownerId: userId, projectId: asset.projectId }, rpc)
    : { sources: [], records: [] };
  return evaluateAssetKnowledge(userId, asset, state, registry, now);
}
