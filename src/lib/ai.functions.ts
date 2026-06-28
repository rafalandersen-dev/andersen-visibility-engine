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

const LANGUAGES = ["Polish", "Swedish", "English"] as const;
const CONTENT_TYPES = [
  "Landing Page",
  "Service Page",
  "Blog Article",
  "Guide",
  "FAQ Page",
  "Comparison",
  "Location Page",
] as const;
const SEARCH_INTENTS = ["Informational", "Commercial", "Transactional", "Navigational"] as const;
const PRIORITIES = ["Low", "Medium", "High"] as const;

function normalizedEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const key = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const input = key(value);
    return (
      values.find((option) => key(option) === input) ??
      values.find((option) => input.includes(key(option))) ??
      value
    );
  }, z.enum(values));
}

const cleanString = (min: number, max: number) =>
  z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(min))
    .transform((value) => (value.length > max ? value.slice(0, max).trim() : value));

const LanguageEnum = normalizedEnum(LANGUAGES);
const ContentTypeEnum = normalizedEnum(CONTENT_TYPES);
const SearchIntentEnum = normalizedEnum(SEARCH_INTENTS);
const PriorityEnum = normalizedEnum(PRIORITIES);

const OpportunityOutputSchema = z
  .array(
    z.object({
      title: cleanString(4, 120),
      language: LanguageEnum,
      contentType: ContentTypeEnum,
      searchIntent: SearchIntentEnum,
      targetAudience: cleanString(2, 160),
      businessValue: cleanString(2, 200),
      recommendedCta: cleanString(2, 60),
      priority: PriorityEnum,
    }),
  )
  .min(1)
  .max(8);

const OpportunitiesEnvelopeSchema = z.object({ opportunities: OpportunityOutputSchema });

const CalendarOutputSchema = z
  .array(
    z.object({
      opportunityIndex: z.coerce.number().int().min(1),
      daysFromToday: z.coerce.number().int().min(1).max(60),
      topicTitle: cleanString(4, 140),
      language: LanguageEnum,
      contentType: ContentTypeEnum,
      searchIntent: SearchIntentEnum,
      recommendedCta: cleanString(2, 60),
    }),
  )
  .min(1)
  .max(8);

const CalendarEnvelopeSchema = z.object({ calendar_items: CalendarOutputSchema });

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractArray(value: unknown, keys: string[]): unknown {
  if (Array.isArray(value)) return value;
  const object = getObject(value);
  if (!object) return value;
  for (const key of [...keys, "items", "elements", "data"]) {
    if (Array.isArray(object[key])) return object[key];
  }
  return value;
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const source = fenced?.trim() || trimmed;
  try {
    return JSON.parse(source);
  } catch {
    const firstObject = source.indexOf("{");
    const firstArray = source.indexOf("[");
    const first = [firstObject, firstArray].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    const last = Math.max(source.lastIndexOf("}"), source.lastIndexOf("]"));
    if (first >= 0 && last > first) return JSON.parse(source.slice(first, last + 1));
    throw new Error("AI response was not valid JSON.");
  }
}

const pickString = (object: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

function normalizeOpportunityItem(item: unknown): unknown {
  const object = getObject(item);
  if (!object) return item;
  return {
    title: pickString(object, ["title", "topicTitle", "topic", "name", "targetKeyword", "target_keyword"]),
    language: pickString(object, ["language", "lang"]),
    contentType: pickString(object, ["contentType", "content_type", "type", "format"]),
    searchIntent: pickString(object, ["searchIntent", "search_intent", "intent"]),
    targetAudience: pickString(object, ["targetAudience", "target_audience", "audience"]),
    businessValue: pickString(object, ["businessValue", "business_value", "value", "why", "rationale", "strategy"]),
    recommendedCta: pickString(object, ["recommendedCta", "recommended_cta", "cta", "callToAction", "call_to_action"]),
    priority: pickString(object, ["priority", "importance"]),
  };
}

function normalizeCalendarItem(item: unknown): unknown {
  const object = getObject(item);
  if (!object) return item;
  return {
    opportunityIndex: object.opportunityIndex ?? object.opportunity_index ?? object.index,
    daysFromToday: object.daysFromToday ?? object.days_from_today ?? object.dayOffset ?? object.day_offset,
    topicTitle: pickString(object, ["topicTitle", "topic_title", "title", "topic"]),
    language: pickString(object, ["language", "lang"]),
    contentType: pickString(object, ["contentType", "content_type", "type", "format"]),
    searchIntent: pickString(object, ["searchIntent", "search_intent", "intent"]),
    recommendedCta: pickString(object, ["recommendedCta", "recommended_cta", "cta", "callToAction", "call_to_action"]),
  };
}

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
  if (/not valid JSON|unexpected token|no opportunities|no calendar/i.test(msg))
    return new Error("AI returned an unexpected format. Please try again.");
  return new Error("AI generation failed. Please try again.");
}

function logZodError(label: string, error: unknown) {
  if (error instanceof z.ZodError) {
    console.error(`[ai.functions] ${label} parse failed`, error.issues);
  } else {
    console.error(`[ai.functions] ${label} parse failed`, error);
  }
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
  .handler(async ({ data, context }) => {
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);
    const existing = data.existingTitles.length
      ? `\nAvoid duplicating these existing titles:\n- ${data.existingTitles.join("\n- ")}`
      : "";

    try {
      const gateway = getGateway();
      console.info("[ai.functions] opportunities reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        serviceCount: services.length,
      });
      const { text } = await generateText({
        model: gateway(MODEL),
        prompt: `You are an SEO and AI-visibility strategist for small businesses.

Generate 6 high-quality content opportunities for this business and return them as { "opportunities": [...] }.
Return JSON only. No markdown fences. No commentary.

${brief}
${existing}

Mix content types (landing/service/blog/guide/location/comparison) and languages (use primary + additional). Each opportunity should be a specific, search-driven topic — not a vague theme. Each title should read like a real page or article a user could search for.
${sharedRules}`,
      });

      console.info("[ai.functions] opportunities AI response received", { length: text.length });
      const raw = parseJsonFromText(text);
      const extracted = extractArray(raw, ["opportunities", "ideas", "topics", "recommendations"]);
      if (!Array.isArray(extracted)) throw new Error("AI returned no opportunities.");
      const normalized = extracted.map(normalizeOpportunityItem);
      const parsed = OpportunityOutputSchema.safeParse(normalized);
      if (!parsed.success) {
        logZodError("opportunities", parsed.error);
        throw parsed.error;
      }
      if (parsed.data.length === 0) throw new Error("AI returned no opportunities.");
      console.info("[ai.functions] opportunities parsed", { count: parsed.data.length });
      return parsed.data;
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
  .handler(async ({ data, context }) => {
    const project = data.project as Project;
    const opps = data.opportunities as Opportunity[];

    const oppLines = opps
      .slice(0, 12)
      .map((o, i) => `${i + 1}. [${o.priority}] ${o.title} (${o.language}, ${o.contentType}, ${o.searchIntent}) — CTA: ${o.recommendedCta}`)
      .join("\n");

    try {
      const gateway = getGateway();
      console.info("[ai.functions] calendar reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        opportunityCount: opps.length,
      });
      const { text } = await generateText({
        model: gateway(MODEL),
        prompt: `Build a realistic 1-month content calendar for "${project.businessName || project.name}" in ${project.primaryLanguage}.
Return JSON only as { "calendar_items": [...] }. No markdown fences. No commentary.

Pick the strongest opportunities below and schedule them with sensible cadence (every 3–5 days, no clustering on one date). Prefer high-priority items first.

Opportunities:
${oppLines}

For each scheduled item, return the 1-based opportunityIndex it derives from.
${sharedRules}`,
      });

      console.info("[ai.functions] calendar AI response received", { length: text.length });
      const raw = parseJsonFromText(text);
      const extracted = extractArray(raw, ["calendar_items", "items", "calendar", "calendarItems"]);
      if (!Array.isArray(extracted)) throw new Error("AI returned no calendar items.");
      const normalized = extracted.map(normalizeCalendarItem);
      const parsed = CalendarOutputSchema.safeParse(normalized);
      if (!parsed.success) {
        logZodError("calendar", parsed.error);
        throw parsed.error;
      }
      if (parsed.data.length === 0) throw new Error("AI returned no calendar items.");
      console.info("[ai.functions] calendar parsed", { count: parsed.data.length });
      return parsed.data;
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
              .min(1)
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
