import { z } from "zod";
import { isValidStorageObjectPath } from "./image-storage";
import { outputDependencySchema } from "./source-refresh";
import { knowledgeReferencesSchema } from "./project-knowledge";

const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const text = (max: number) => z.string().max(max);
const nonempty = (max: number) => text(max).refine((value) => value.trim().length > 0);
const strings = (max: number, count: number) => z.array(text(max)).max(count);
const assetTypes = [
  "brief",
  "article",
  "servicePage",
  "landingPage",
  "faq",
  "comparison",
  "gbpPost",
  "meta",
  "socialPack",
] as const;
const hookTypes = [
  "question",
  "problem-to-solution",
  "surprising-fact",
  "contrarian",
  "story",
  "result",
  "promise",
] as const;

/** Retain only normalized output and the minimum recovery target. Never store
 * preview credentials, full business snapshots, approval or publication fields.
 */
export const generatedContentResultSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("content"),
    projectId: identity,
    opportunityId: identity,
    assetId: identity,
    title: nonempty(300),
    language: nonempty(100),
    assetType: z.enum(assetTypes),
    output: z
      .object({
        metaTitle: text(70),
        metaDescription: text(180),
        h1: text(180),
        outline: strings(1000, 128),
        faq: z.array(z.object({ q: text(1000), a: text(4000) }).strict()).max(128),
        cta: text(1000),
        markdown: nonempty(8000),
        internalLinks: strings(2000, 200),
        schemaSuggestions: strings(200, 64),
        editorNotes: text(400),
        knowledgeReferences: knowledgeReferencesSchema.optional(),
        sourceDependencies: z.array(outputDependencySchema).max(100).optional(),
        hookProposals: z
          .array(
            z
              .object({
                text: nonempty(500),
                type: z.enum(hookTypes),
                purpose: text(500).optional(),
              })
              .strict(),
          )
          .max(3)
          .optional(),
      })
      .strict(),
  })
  .strict();

export const generatedImageResultSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("image"),
    projectId: identity,
    assetId: identity,
    imageId: identity,
    title: nonempty(300),
    concept: nonempty(500),
    output: z
      .object({
        path: z.string().max(280).refine(isValidStorageObjectPath),
        alt: nonempty(500),
        knowledgeReferences: knowledgeReferencesSchema.optional(),
        sourceDependencies: z.array(outputDependencySchema).max(100).optional(),
      })
      .strict(),
  })
  .strict();
export const generationResultSchema = z.discriminatedUnion("kind", [
  generatedContentResultSchema,
  generatedImageResultSchema,
]);
export type GenerationResult = z.infer<typeof generationResultSchema>;
export const GENERATION_RESULT_MAX_BYTES = 200_000;

export function parseGenerationResult(value: unknown, userId: string): GenerationResult {
  const result = generationResultSchema.parse(value);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > GENERATION_RESULT_MAX_BYTES)
    throw new Error("generation_result_too_large");
  if (
    result.kind === "image" &&
    !result.output.path.startsWith(`${userId}/${result.projectId}/${result.assetId}/`)
  )
    throw new Error("generation_result_image_owner_mismatch");
  if (
    result.output.sourceDependencies?.some(
      (d) => d.ownerId !== userId || d.projectId !== result.projectId,
    )
  )
    throw new Error("generation_result_source_owner_mismatch");
  return result;
}
