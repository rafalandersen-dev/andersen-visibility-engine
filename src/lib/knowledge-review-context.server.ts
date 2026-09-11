import { z } from "zod";
import {
  knowledgeRecordSchema,
  knowledgeSourceSchema,
  knowledgeReferencesSchema,
  type KnowledgeScope,
} from "./project-knowledge";
import type { KnowledgeRpc } from "./project-knowledge.server";
import type { BrandProfile } from "./knowledge-brand";
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const contextSchema = z
  .object({
    knowledge: z
      .object({
        sources: z.array(knowledgeSourceSchema).max(100),
        records: z.array(knowledgeRecordSchema).max(300),
      })
      .strict(),
    brand: z
      .object({
        brandIntelligence: z.record(z.unknown()).nullable(),
        brandOwnerFields: z.array(z.string().max(100)).max(100),
        toneOfVoice: z.string().max(2000),
      })
      .strict(),
    registry: z
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
      .max(1000),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export async function knowledgeReviewRpc(
  name: string,
  args: Record<string, unknown>,
  injected?: KnowledgeRpc,
): Promise<unknown> {
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
        timer = setTimeout(() => reject(new Error("knowledge_review_unavailable")), 10000);
      }),
    ]);
    if (!result || result.error) throw new Error("knowledge_review_unavailable");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}

/** This RPC returns knowledge, owner overrides and retained references under
 * the same database lock; callers must still bind the workspace revision. */
export async function readKnowledgeReviewContext(
  scope: KnowledgeScope,
  assetId: string,
  rpc?: KnowledgeRpc,
) {
  z.string().uuid().parse(scope.ownerId);
  identity.parse(scope.projectId);
  identity.parse(assetId);
  const context = contextSchema.parse(
    await knowledgeReviewRpc(
      "read_output_knowledge_review_context",
      {
        p_user: scope.ownerId,
        p_project: scope.projectId,
        p_asset: assetId,
      },
      rpc,
    ),
  );
  if (
    [...context.knowledge.records, ...context.knowledge.sources].some(
      (row) => row.ownerId !== scope.ownerId || row.projectId !== scope.projectId,
    ) ||
    context.registry.some((row) => row.assetId !== assetId) ||
    new Set(context.registry.map((row) => `${row.kind}:${row.outputId}`)).size !==
      context.registry.length
  )
    throw new Error("knowledge_review_scope");
  return { ...context, brand: context.brand as BrandProfile };
}

export async function readKnowledgeReviewBatch(
  scope: KnowledgeScope,
  assets: string[],
  rpc?: KnowledgeRpc,
) {
  z.string().uuid().parse(scope.ownerId);
  identity.parse(scope.projectId);
  z.array(identity).max(100).parse(assets);
  if (new Set(assets).size !== assets.length) throw new Error("knowledge_review_scope");
  const batch = z
    .object({
      knowledge: contextSchema.shape.knowledge,
      brand: contextSchema.shape.brand,
      outputs: z
        .array(
          z
            .object({
              assetId: identity,
              registry: contextSchema.shape.registry,
              contextHash: contextSchema.shape.contextHash,
              activeReview: z
                .object({
                  versionHash: contextSchema.shape.contextHash,
                  contextHash: contextSchema.shape.contextHash,
                })
                .strict()
                .nullable(),
              hasHistory: z.boolean(),
            })
            .strict(),
        )
        .max(100),
    })
    .strict()
    .parse(
      await knowledgeReviewRpc(
        "read_output_knowledge_review_batch",
        { p_user: scope.ownerId, p_project: scope.projectId, p_assets: assets },
        rpc,
      ),
    );
  if (
    batch.outputs.length !== assets.length ||
    new Set(batch.outputs.map((row) => row.assetId)).size !== assets.length ||
    batch.outputs.some(
      (row) =>
        !assets.includes(row.assetId) ||
        row.registry.some((entry) => entry.assetId !== row.assetId) ||
        new Set(row.registry.map((entry) => `${entry.kind}:${entry.outputId}`)).size !==
          row.registry.length,
    ) ||
    batch.outputs.reduce((total, row) => total + row.registry.length, 0) > 1000 ||
    [...batch.knowledge.sources, ...batch.knowledge.records].some(
      (row) => row.ownerId !== scope.ownerId || row.projectId !== scope.projectId,
    )
  )
    throw new Error("knowledge_review_scope");
  return { ...batch, brand: batch.brand as BrandProfile };
}
