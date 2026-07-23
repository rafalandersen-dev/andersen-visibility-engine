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
 * Provider is a seam (image-gen.server.ts): Lovable gateway now, gpt-image-1
 * pre-launch (owner decision). Metered via the imageGeneration bucket,
 * claimed BEFORE the model call so a refusal costs nothing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Project } from "./types";
import { claimAiUsage } from "./ai-usage.server";
import { generateImageBytes, ImageGenError } from "./image-gen.server";
import { buildImagePrompt, draftAltText } from "./image-gen";
import { stageValidatedImageBytes } from "./image-storage.functions";

export interface GeneratedArticleImage {
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
): Promise<GeneratedArticleImage> {
  await claimAiUsage({ userId, bucket: "imageGeneration" });
  const prompt = buildImagePrompt({
    concept: args.concept,
    ...(args.articleTitle ? { articleTitle: args.articleTitle } : {}),
    project: args.project,
  });
  let bytes: Uint8Array;
  try {
    bytes = await generateImageBytes(prompt);
  } catch (e) {
    if (e instanceof ImageGenError) throw new Error(e.message);
    throw new Error("Image generation failed. Please try again.");
  }
  const { path, previewUrl } = await stageValidatedImageBytes(
    userId,
    args.projectId,
    args.assetId,
    bytes,
  );
  return { path, previewUrl, alt: draftAltText(args.concept, args.project.businessName) };
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
