/**
 * In-app image generation — pure helpers (owner scope 2026-07-24).
 *
 * Prompt + alt-text construction only; the provider call lives in
 * image-gen.server.ts behind ONE seam (Lovable gateway now, OpenAI
 * gpt-image-1 pre-launch — owner decision, see the pre-launch checklist).
 */
import type { Project } from "./types";

export interface ImagePromptArgs {
  /** What the image should show — the ContentImage concept or a user prompt. */
  concept: string;
  articleTitle?: string;
  project: Pick<Project, "businessName" | "businessType" | "toneOfVoice">;
}

/**
 * Deterministic prompt: photographic default, brand-toned, and NO text in the
 * image — text-in-image is where models embarrass themselves in Swedish/Polish,
 * and the article already carries its own words.
 */
export function buildImagePrompt(args: ImagePromptArgs): string {
  const tone = args.project.toneOfVoice?.trim();
  const brand = [args.project.businessName, args.project.businessType]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" — ");
  return [
    `High-quality, natural photograph for a business article: ${args.concept.trim()}.`,
    args.articleTitle ? `Article topic: ${args.articleTitle.trim()}.` : "",
    brand ? `Business: ${brand}.` : "",
    tone ? `Visual mood: ${tone}.` : "",
    "No text, no words, no letters, no logos, no watermarks anywhere in the image.",
    "Realistic lighting, professional composition, suitable as editorial imagery.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** A serviceable draft alt text — the user reviews it before approval. */
export function draftAltText(concept: string, businessName?: string): string {
  const base = concept.trim().replace(/\s+/g, " ");
  const branded = businessName?.trim() ? `${base} at ${businessName.trim()}` : base;
  // Alt text should stay short; hard-cap without mid-word cuts.
  if (branded.length <= 120) return branded;
  const cut = branded.slice(0, 120);
  return cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : 120);
}
