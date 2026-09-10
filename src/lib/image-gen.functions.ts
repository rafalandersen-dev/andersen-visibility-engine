/**
 * In-app AI image generation — server functions (owner scope 2026-07-24).
 *
 * generate → validate (SAME magic-byte check as uploads) → stage in the
 * PRIVATE bucket → the client attaches it as an ordinary proposed
 * ContentImage (source "generated"). Everything downstream — accept,
 * promote-to-public, anchors, presentation, featured — is the existing
 * pipeline untouched; a generated image is never publishable until the user
 * approves it like any upload.
 *
 * Direct OpenAI generates images (image-gen.server.ts). Pro/Agency-only (hard plan gate, active even
 * while AI_METERING_ENFORCED is off) and metered via the imageGeneration
 * bucket — both checked BEFORE the model call so a refusal costs nothing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Project } from "./types";
import { assertImageGenerationAllowed } from "./ai-usage.server";
import { withGenerationUsage } from "./generation-usage.server";
import { imageRecoveryTarget, retainImageGeneration } from "./generation-result.server";
import { ImageGenError } from "./image-gen.server";
import { generateBudgetedImage, type NativeExpenseContext } from "./ai-provider-expense.server";
import { AiExpenseUnavailableError } from "./ai-expense.server";
import { AiProviderConfigurationError } from "./ai-provider.server";
import { buildImagePrompt, draftAltText } from "./image-gen";
import { stageValidatedImageBytes } from "./image-storage.functions";

export interface GeneratedArticleImage {
  knowledgeReferences?: import("./project-knowledge").KnowledgeReference[];
  sourceDependencies?: import("./source-refresh").OutputDependency[];
  generationReceiptId?: string;
  resultId?: string;
  path: string;
  previewUrl: string;
  alt: string;
}

/**
 * Core, callable from the cron/auto-scheduler runner later (no request
 * context — the caller supplies the authenticated userId).
 */
export async function generateArticleImageCore(
  userId: string,
  args: {
    projectId: string;
    assetId: string;
    concept: string;
    articleTitle?: string;
    project: Pick<Project, "businessName" | "businessType" | "toneOfVoice">;
  },
  execution: { attempt?: NativeExpenseContext["attempt"]; imageId?: string } = {},
): Promise<GeneratedArticleImage> {
  // Pro/Agency plan gate first (active even while metering enforcement is off),
  // then the metered claim — both before the model call so a refusal costs nothing.
  await assertImageGenerationAllowed({ userId });
  let target: ReturnType<typeof imageRecoveryTarget>;
  return withGenerationUsage(
    {
      userId,
      bucket: "imageGeneration",
      operation: "generateArticleImageCore",
      attempt: execution.attempt,
    },
    async (attempt, receiptId) => {
      target = imageRecoveryTarget({
        projectId: args.projectId,
        assetId: args.assetId,
        title: args.articleTitle || args.concept,
        concept: args.concept,
      });
      const { loadProjectKnowledgeContext } = await import("./project-knowledge.server");
      const knowledge = await loadProjectKnowledgeContext(
        { ownerId: userId, projectId: args.projectId },
        "visual",
        undefined,
        undefined,
        5500,
      );
      const basePrompt = buildImagePrompt({
        concept: args.concept,
        ...(args.articleTitle ? { articleTitle: args.articleTitle } : {}),
        project: knowledge.toneOfVoice !== undefined ? { ...args.project, toneOfVoice: knowledge.toneOfVoice.slice(0, 400) } : args.project,
      });
      const prompt = [basePrompt, knowledge.context].filter(Boolean).join("\n\n");
      let bytes: Uint8Array;
      try {
        bytes = await generateBudgetedImage(
          { userId, operation: "generateArticleImageCore", attempt },
          prompt,
        );
      } catch (e) {
        if (
          e instanceof ImageGenError ||
          e instanceof AiExpenseUnavailableError ||
          e instanceof AiProviderConfigurationError
        )
          throw new Error(e.message);
        throw new Error("Image generation failed. Please try again.");
      }
      const { path, previewUrl } = await stageValidatedImageBytes(
        userId,
        args.projectId,
        args.assetId,
        bytes,
      );
      return {
        path,
        previewUrl,
        alt: draftAltText(args.concept, args.project.businessName),
        generationReceiptId: receiptId,
        knowledgeReferences: knowledge.references,
        sourceDependencies: knowledge.sourceDependencies,
        resultId: execution.imageId ?? receiptId,
      };
    },
    (result) => retainImageGeneration(userId, target, result),
  );
}

export const generateArticleImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().min(1),
        assetId: z.string().min(1),
        concept: z.string().min(3).max(500),
        articleTitle: z.string().max(300).optional(),
        project: z.object({
          businessName: z.string().max(200).default(""),
          businessType: z.string().max(200).default(""),
          toneOfVoice: z.string().max(400).default(""),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    generateArticleImageCore(context.userId as string, {
      projectId: data.projectId,
      assetId: data.assetId,
      concept: data.concept,
      ...(data.articleTitle ? { articleTitle: data.articleTitle } : {}),
      project: data.project as Pick<Project, "businessName" | "businessType" | "toneOfVoice">,
    }),
  );
