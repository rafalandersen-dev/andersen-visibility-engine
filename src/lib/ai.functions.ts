/**
 * Server functions wrapping Lovable AI Gateway for the Milo Growth.
 *
 * These return plain DTOs matching the shape the client store expects.
 * Auth is required (requireSupabaseAuth) so generation is scoped to
 * a signed-in user; usage is implicitly tied to that user's session.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import type {
  Project,
  ServiceItem,
  Opportunity,
  ContentAsset,
} from "./types";

const MODEL = "google/gemini-3-flash-preview";

const LanguageEnum = z.enum(["Polish", "Swedish", "English"]);
const ContentTypeEnum = z.enum([
  "Landing Page",
  "Service Page",
  "Blog Article",
  "Guide",
  "FAQ Page",
  "Comparison",
  "Location Page",
]);
const SearchIntentEnum = z.enum(["Informational", "Commercial", "Transactional", "Navigational"]);
const PriorityEnum = z.enum(["Low", "Medium", "High"]);

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI Gateway is not configured.");
  return createLovableAiGatewayProvider(key);
}

function mapGatewayError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  // Surface real cause to server logs so we can debug schema/truncation issues.
  console.error("[ai.functions] gateway/validation error:", msg);
  if (/429|rate limit/i.test(msg)) return new Error("AI is busy right now — please retry in a moment.");
  if (/402|credit|insufficient/i.test(msg)) return new Error("AI credits exhausted. Please top up in workspace billing.");
  if (/max_tokens|length|truncat/i.test(msg))
    return new Error("AI response was cut short. Please try again — it usually works on retry.");
  if (/schema|validation|zod|invalid_type|too_small|too_big|unrecognized/i.test(msg))
    return new Error("AI returned an unexpected format. Please try again.");
  return new Error("AI generation failed. Please try again.");
}

function projectBrief(p: Project, services: ServiceItem[]) {
  return [
    `Business: ${p.businessName || p.name}`,
    p.websiteUrl ? `Website: ${p.websiteUrl} (NOT crawled — base recommendations only on the context below)` : null,
    p.businessType ? `Type: ${p.businessType}` : null,
    p.description ? `Description: ${p.description}` : null,
    p.targetAudience ? `Audience: ${p.targetAudience}` : null,
    p.mainLocation ? `Main location: ${p.mainLocation}` : null,
    p.targetLocations?.length ? `Target locations: ${p.targetLocations.join(", ")}` : null,
    `Primary language: ${p.primaryLanguage}`,
    p.additionalLanguages?.length ? `Additional languages: ${p.additionalLanguages.join(", ")}` : null,
    p.toneOfVoice ? `Tone of voice: ${p.toneOfVoice}` : null,
    p.uniqueSellingPoints ? `USPs: ${p.uniqueSellingPoints}` : null,
    p.brandNotes ? `Brand notes: ${p.brandNotes}` : null,
    services.length
      ? `Services/products:\n${services
          .map((s) => `- [${s.kind}] ${s.name}${s.description ? ` — ${s.description}` : ""}${s.locationRelevance ? ` (loc: ${s.locationRelevance})` : ""}`)
          .join("\n")}`
      : "Services/products: (none provided)",
  ]
    .filter(Boolean)
    .join("\n");
}

const sharedRules = `
RULES:
- Output MUST match the requested JSON schema exactly.
- Do NOT claim you analyzed the website. Base recommendations only on the provided context.
- Do NOT invent metrics, search volumes, ranking guarantees, competitor data or external sources.
- Be specific to the given business — no generic SEO platitudes.
- Keep recommendations practical for a small business.
- Tone: professional, calm, clear.
- Write all generated text in the requested language. Do not mix languages.
`;

// ============================================================
// generateOpportunities
// ============================================================

export const generateOpportunitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        existingTitles: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);
    const existing = data.existingTitles.length
      ? `\nAvoid duplicating these existing titles:\n- ${data.existingTitles.join("\n- ")}`
      : "";

    try {
      const gateway = getGateway();
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({
          schema: z.object({
            opportunities: z
              .array(
                z.object({
                  title: z.string().min(4).max(120),
                  language: LanguageEnum,
                  contentType: ContentTypeEnum,
                  searchIntent: SearchIntentEnum,
                  targetAudience: z.string().min(2).max(160),
                  businessValue: z.string().min(2).max(200),
                  recommendedCta: z.string().min(2).max(60),
                  priority: PriorityEnum,
                }),
              )
              .min(1)
              .max(8),
          }),
        }),
        prompt: `You are an SEO and AI-visibility strategist for small businesses.

Generate 6 high-quality content opportunities for this business.

${brief}
${existing}

Mix content types (landing/service/blog/guide/location/comparison) and languages (use primary + additional). Each opportunity should be a specific, search-driven topic — not a vague theme. Each title should read like a real page or article a user could search for.
${sharedRules}`,
      });

      return output.opportunities;
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// generateCalendar
// ============================================================

export const generateCalendarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        opportunities: z.array(z.any()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const project = data.project as Project;
    const opps = data.opportunities as Opportunity[];

    const oppLines = opps
      .slice(0, 12)
      .map((o, i) => `${i + 1}. [${o.priority}] ${o.title} (${o.language}, ${o.contentType}, ${o.searchIntent}) — CTA: ${o.recommendedCta}`)
      .join("\n");

    try {
      const gateway = getGateway();
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({
          schema: z.object({
            items: z
              .array(
                z.object({
                  opportunityIndex: z.number().int().min(1),
                  daysFromToday: z.number().int().min(1).max(60),
                  topicTitle: z.string().min(4).max(140),
                  language: LanguageEnum,
                  contentType: ContentTypeEnum,
                  searchIntent: SearchIntentEnum,
                  recommendedCta: z.string().min(2).max(60),
                }),
              )
              .min(1)
              .max(8),
          }),
        }),
        prompt: `Build a realistic 1-month content calendar for "${project.businessName || project.name}" in ${project.primaryLanguage}.

Pick the strongest opportunities below and schedule them with sensible cadence (every 3–5 days, no clustering on one date). Prefer high-priority items first.

Opportunities:
${oppLines}

For each scheduled item, return the 1-based opportunityIndex it derives from.
${sharedRules}`,
      });

      return output.items;
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// generateContentAsset (landing brief / article draft)
// ============================================================

const ContentAssetSchema = z.object({
  metaTitle: z.string().min(10).max(70),
  metaDescription: z.string().min(40).max(170),
  h1: z.string().min(4).max(120),
  outline: z.array(z.string().min(3).max(140)).min(4).max(10),
  faq: z
    .array(z.object({ q: z.string().min(5).max(140), a: z.string().min(10).max(400) }))
    .min(1)
    .max(6),
  cta: z.string().min(2).max(60),
  markdown: z.string().min(120).max(6000),
  internalLinks: z.array(z.string().min(1).max(80)).max(8),
  schemaSuggestions: z.array(z.string().min(2).max(40)).max(8),
  editorNotes: z.string().max(400),
});

export const generateContentAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        opportunity: z.any(),
        kind: z.enum(["landing", "article"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const opp = data.opportunity as Opportunity;
    const brief = projectBrief(project, services);

    const kindInstruction =
      data.kind === "landing"
        ? `Generate a LANDING / SERVICE page brief. Outline should follow: problem → approach → what you get → proof → pricing/timing → FAQ → single CTA. Markdown should be a draft of the page in ${opp.language}.`
        : `Generate a BLOG ARTICLE draft. Lead with a 2–3 sentence direct answer (AI-overview friendly), then context, key factors, what to do next, and FAQ. Markdown should be the article body in ${opp.language}.`;

    try {
      const gateway = getGateway();
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({ schema: ContentAssetSchema }),
        prompt: `${kindInstruction}

Topic: ${opp.title}
Search intent: ${opp.searchIntent}
Audience: ${opp.targetAudience}
Suggested CTA: ${opp.recommendedCta}
Language: ${opp.language}

Business context:
${brief}

Markdown rules:
- Use real headings (##, ###) and short paragraphs.
- No fake statistics or invented citations.
- No keyword stuffing.
- Internal links: relative paths like "/services" or "/contact" only.
- schemaSuggestions: schema.org types only (e.g. "Service", "FAQPage").
${sharedRules}`,
      });

      return output;
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Small editor regen helpers (metadata / faq / cta)
// ============================================================

export const regenerateMetadataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string(),
        language: LanguageEnum,
        topic: z.string(),
        cta: z.string(),
        businessName: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const gateway = getGateway();
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({
          schema: z.object({
            metaTitle: z.string().min(10).max(65),
            metaDescription: z.string().min(50).max(165),
          }),
        }),
        prompt: `Write an SEO meta title (≤60 chars) and meta description (≤160 chars) in ${data.language} for the page titled "${data.title}" about "${data.topic}" for "${data.businessName}". One calm sentence for the description, including a soft next step toward "${data.cta}". No quotes, no emojis.${sharedRules}`,
      });
      return output;
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

export const regenerateFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string(),
        language: LanguageEnum,
        topic: z.string(),
        businessName: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const gateway = getGateway();
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({
          schema: z.object({
            faq: z
              .array(z.object({ q: z.string().min(5).max(140), a: z.string().min(10).max(400) }))
              .min(3)
              .max(5),
          }),
        }),
        prompt: `Write 4 realistic FAQ entries in ${data.language} that real customers of "${data.businessName}" would ask about "${data.topic}". Answers must be concrete, 2–4 sentences. No invented prices, no guarantees.${sharedRules}`,
      });
      return output.faq;
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

export const regenerateCtaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        language: LanguageEnum,
        topic: z.string(),
        businessName: z.string(),
        intent: SearchIntentEnum,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const gateway = getGateway();
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({
          schema: z.object({ cta: z.string().min(2).max(50) }),
        }),
        prompt: `Suggest ONE short, action-oriented CTA button label in ${data.language} for a ${data.intent.toLowerCase()} page about "${data.topic}" for "${data.businessName}". 2–5 words. No emojis, no quotes.${sharedRules}`,
      });
      return output.cta;
    } catch (e) {
      throw mapGatewayError(e);
    }
  });
