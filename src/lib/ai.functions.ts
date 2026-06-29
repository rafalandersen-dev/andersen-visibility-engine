/**
 * Server functions wrapping Lovable AI Gateway for the Milo Growth.
 *
 * These return plain DTOs matching the shape the client store expects.
 * Auth is required (requireSupabaseAuth) so generation is scoped to
 * a signed-in user; usage is implicitly tied to that user's session.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import type {
  Project,
  ServiceItem,
  Opportunity,
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

const cleanString = (max: number) =>
  z
    .preprocess((value) => {
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return "";
    }, z.string())
    .transform((value) => (value.length > max ? value.slice(0, max).trim() : value));

const LanguageEnum = normalizedEnum(LANGUAGES);
const ContentTypeEnum = normalizedEnum(CONTENT_TYPES);
const SearchIntentEnum = normalizedEnum(SEARCH_INTENTS);
const PriorityEnum = normalizedEnum(PRIORITIES);

// Structured-output schemas. Keep them loose — strict min/max on every string
// makes the model fail validation often; we clip oversized strings in the
// transform instead.
const OpportunityItemSchema = z.object({
  title: cleanString(120),
  language: LanguageEnum,
  contentType: ContentTypeEnum,
  searchIntent: SearchIntentEnum,
  targetAudience: cleanString(160),
  businessValue: cleanString(200),
  recommendedCta: cleanString(60),
  priority: PriorityEnum,
});

const OpportunitiesResultSchema = z.object({
  opportunities: z.array(OpportunityItemSchema),
});

const CalendarItemSchema = z.object({
  opportunityIndex: z.coerce.number().int().min(1),
  daysFromToday: z.coerce.number().int().min(1).max(60),
  topicTitle: cleanString(140),
  language: LanguageEnum,
  contentType: ContentTypeEnum,
  searchIntent: SearchIntentEnum,
  recommendedCta: cleanString(60),
});

const CalendarResultSchema = z.object({
  calendarItems: z.array(CalendarItemSchema),
});

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI Gateway is not configured.");
  return createLovableAiGatewayProvider(key);
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return fallback;
};

const pickString = (record: UnknownRecord, keys: string[], fallback = "") => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return fallback;
};

function normalizeValue<const T extends readonly [string, ...string[]]>(
  value: unknown,
  values: T,
  fallback: T[number],
) {
  const normalize = (input: string) => input.toLowerCase().replace(/[^a-z]/g, "");
  const raw = asString(value);
  if (!raw) return fallback;
  const input = normalize(raw);
  return (
    values.find((option) => normalize(option) === input) ??
    values.find((option) => input.includes(normalize(option)) || normalize(option).includes(input)) ??
    fallback
  );
}

function normalizeLanguage(value: unknown, project?: Project) {
  return normalizeValue(
    value,
    LANGUAGES,
    project?.primaryLanguage && LANGUAGES.includes(project.primaryLanguage) ? project.primaryLanguage : "English",
  );
}

function normalizeContentType(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/blog|article|post/.test(raw)) return "Blog Article";
  if (/landing/.test(raw)) return "Landing Page";
  if (/service/.test(raw)) return "Service Page";
  if (/faq|question/.test(raw)) return "FAQ Page";
  if (/location|local|city|area/.test(raw)) return "Location Page";
  if (/compare|comparison|versus|vs/.test(raw)) return "Comparison";
  if (/guide|how|manual/.test(raw)) return "Guide";
  return normalizeValue(value, CONTENT_TYPES, "Blog Article");
}

function normalizeSearchIntent(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/transaction|buy|book|order|quote|hire/.test(raw)) return "Transactional";
  if (/commercial|compare|best|pricing|cost|service/.test(raw)) return "Commercial";
  if (/navigation|brand|contact|address/.test(raw)) return "Navigational";
  return normalizeValue(value, SEARCH_INTENTS, "Informational");
}

function normalizePriority(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/urgent|high|strong|top|1/.test(raw)) return "High";
  if (/low|later|3/.test(raw)) return "Low";
  return normalizeValue(value, PRIORITIES, "Medium");
}

function parseJsonFromText(text: string): unknown {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  if (!starts.length) throw new Error("AI returned no JSON payload.");

  const start = Math.min(...starts);
  const opener = cleaned[start];
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) {
      const candidate = cleaned.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return JSON.parse(
          candidate
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""),
        );
      }
    }
  }

  throw new Error("AI response appears truncated before valid JSON ended.");
}

function extractArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      const nested = extractArray(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeOpportunityItem(value: unknown, project: Project, index: number) {
  const item = isRecord(value) ? value : {};
  const title = pickString(item, ["title", "topicTitle", "topic", "name", "headline"], `SEO opportunity ${index + 1}`);
  return OpportunityItemSchema.parse({
    title,
    language: normalizeLanguage(item.language ?? item.lang, project),
    contentType: normalizeContentType(item.contentType ?? item.type ?? item.format ?? item.assetType),
    searchIntent: normalizeSearchIntent(item.searchIntent ?? item.intent),
    targetAudience: pickString(item, ["targetAudience", "audience", "who"], project.targetAudience || "Potential customers"),
    businessValue: pickString(item, ["businessValue", "value", "why", "rationale", "strategy"], "Build qualified search visibility for the business."),
    recommendedCta: pickString(item, ["recommendedCta", "cta", "callToAction"], "Contact us"),
    priority: normalizePriority(item.priority ?? item.impact),
  });
}

function normalizeCalendarItem(value: unknown, project: Project, index: number) {
  const item = isRecord(value) ? value : {};
  return CalendarItemSchema.parse({
    opportunityIndex: item.opportunityIndex ?? item.sourceIndex ?? item.index ?? index + 1,
    daysFromToday: item.daysFromToday ?? item.dayOffset ?? item.day ?? (index + 1) * 4,
    topicTitle: pickString(item, ["topicTitle", "title", "topic", "name"], `Planned content ${index + 1}`),
    language: normalizeLanguage(item.language ?? item.lang, project),
    contentType: normalizeContentType(item.contentType ?? item.type ?? item.format),
    searchIntent: normalizeSearchIntent(item.searchIntent ?? item.intent),
    recommendedCta: pickString(item, ["recommendedCta", "cta", "callToAction"], "Contact us"),
  });
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : [];
  const items = source.map((item) => asString(item)).filter(Boolean);
  return items.length ? items : fallback;
}

function normalizeFaq(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const items = source
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const q = pickString(item, ["q", "question", "title"], `Question ${index + 1}`);
      const a = pickString(item, ["a", "answer", "response"], "Contact the business for details.");
      return { q, a };
    })
    .filter((item): item is { q: string; a: string } => Boolean(item));
  return items.length ? items : [{ q: "How can I get started?", a: "Contact the team to discuss your needs and the next practical step." }];
}

function normalizeContentAsset(payload: unknown, project: Project, opp: Opportunity) {
  const item = isRecord(payload) ? payload : {};
  const markdown = pickString(
    item,
    ["markdown", "content", "body", "draft", "article", "pageDraft"],
    `## ${opp.title}\n\nCreate a focused page for ${project.businessName || project.name} that answers the search intent clearly and guides readers toward ${opp.recommendedCta}.`,
  );
  return ContentAssetSchema.parse({
    metaTitle: pickString(item, ["metaTitle", "seoTitle", "title"], opp.title),
    metaDescription: pickString(item, ["metaDescription", "seoDescription", "description"], opp.businessValue),
    h1: pickString(item, ["h1", "headline", "pageTitle"], opp.title),
    outline: normalizeStringArray(item.outline ?? item.sections, ["Introduction", "Key information", "Next step"]),
    faq: normalizeFaq(item.faq ?? item.faqs ?? item.questions),
    cta: pickString(item, ["cta", "recommendedCta", "callToAction"], opp.recommendedCta || "Contact us"),
    markdown,
    internalLinks: normalizeStringArray(item.internalLinks ?? item.links, []),
    schemaSuggestions: normalizeStringArray(item.schemaSuggestions ?? item.schema ?? item.structuredData, []),
    editorNotes: pickString(item, ["editorNotes", "notes"], ""),
  });
}

async function generateJsonText(prompt: string, maxOutputTokens = 5000) {
  const gateway = getGateway();
  const { text } = await generateText({
    model: gateway(MODEL),
    maxOutputTokens,
    prompt,
  });
  return parseJsonFromText(text);
}

function mapGatewayError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  // Surface real cause to server logs so we can debug schema/truncation issues.
  const anyErr = e as { cause?: unknown; text?: unknown };
  const cause = anyErr?.cause instanceof Error ? anyErr.cause.message : anyErr?.cause;
  const text = typeof anyErr?.text === "string" ? anyErr.text.slice(0, 800) : undefined;
  console.error("[ai.functions] gateway/validation error:", msg, { cause, text });
  if (/429|rate limit/i.test(msg)) return new Error("AI is busy right now — please retry in a moment.");
  if (/402|credit|insufficient/i.test(msg)) return new Error("AI credits exhausted. Please top up in workspace billing.");
  if (/max_tokens|length|truncat/i.test(msg))
    return new Error("AI response was cut short. Please try again — it usually works on retry.");
  if (/schema|validation|zod|invalid_type|too_small|too_big|unrecognized|did not match/i.test(msg))
    return new Error("AI returned an unexpected format. Please try again.");
  if (/not valid JSON|unexpected token|no JSON|truncated|no opportunities|no calendar/i.test(msg))
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
- Output ONLY valid JSON. No markdown fences, no prose before or after JSON.
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
      console.info("[ai.functions] opportunities reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        serviceCount: services.length,
      });
      const payload = await generateJsonText(`You are an SEO and AI-visibility strategist for small businesses.

Generate 6 high-quality content opportunities for this business.
Return exactly this JSON shape:
{"opportunities":[{"title":"","language":"Polish|Swedish|English","contentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","searchIntent":"Informational|Commercial|Transactional|Navigational","targetAudience":"","businessValue":"","recommendedCta":"","priority":"Low|Medium|High"}]}

${brief}
${existing}

Mix content types (landing/service/blog/guide/location/comparison) and languages (use primary + additional). Each opportunity should be a specific, search-driven topic — not a vague theme. Each title should read like a real page or article a user could search for.
${sharedRules}`,
      3000);

      const opportunities = extractArray(payload, ["opportunities", "ideas", "topics", "items", "results"])
        .map((item, index) => normalizeOpportunityItem(item, project, index));
      if (opportunities.length === 0) throw new Error("AI returned no opportunities.");
      console.info("[ai.functions] opportunities parsed", { count: opportunities.length });
      return { opportunities };
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
      console.info("[ai.functions] calendar reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        opportunityCount: opps.length,
      });
      const payload = await generateJsonText(`Build a realistic 1-month content calendar for "${project.businessName || project.name}" in ${project.primaryLanguage}.
Return exactly this JSON shape:
{"calendarItems":[{"opportunityIndex":1,"daysFromToday":4,"topicTitle":"","language":"Polish|Swedish|English","contentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","searchIntent":"Informational|Commercial|Transactional|Navigational","recommendedCta":""}]}

Pick the strongest opportunities below and schedule them with sensible cadence (every 3–5 days, no clustering on one date). Prefer high-priority items first.

Opportunities:
${oppLines}

For each scheduled item, return the 1-based opportunityIndex it derives from.
${sharedRules}`,
      3000);

      const calendarItems = extractArray(payload, ["calendarItems", "calendar", "items", "schedule", "contentCalendar"])
        .map((item, index) => normalizeCalendarItem(item, project, index));
      if (calendarItems.length === 0) throw new Error("AI returned no calendar items.");
      console.info("[ai.functions] calendar parsed", { count: calendarItems.length });
      return { calendarItems };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// generateContentAsset (landing brief / article draft)
// ============================================================

const ContentAssetSchema = z.object({
  metaTitle: cleanString(70),
  metaDescription: cleanString(170),
  h1: cleanString(120),
  outline: z.array(cleanString(140)),
  faq: z.array(z.object({ q: cleanString(140), a: cleanString(400) })),
  cta: cleanString(60),
  markdown: cleanString(8000),
  internalLinks: z.array(cleanString(80)).default([]),
  schemaSuggestions: z.array(cleanString(40)).default([]),
  editorNotes: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v ?? ""), z.string())
    .transform((v) => (v.length > 400 ? v.slice(0, 400) : v)),
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
      const payload = await generateJsonText(`${kindInstruction}

Return exactly this JSON shape:
{"metaTitle":"","metaDescription":"","h1":"","outline":[""],"faq":[{"q":"","a":""}],"cta":"","markdown":"","internalLinks":[""],"schemaSuggestions":[""],"editorNotes":""}

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
      8000);

      return normalizeContentAsset(payload, project, opp);
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
      const payload = await generateJsonText(
        `Write an SEO meta title (≤60 chars) and meta description (≤160 chars) in ${data.language} for the page titled "${data.title}" about "${data.topic}" for "${data.businessName}". One calm sentence for the description, including a soft next step toward "${data.cta}". No quotes, no emojis.

Return exactly this JSON shape:
{"metaTitle":"","metaDescription":""}
${sharedRules}`,
        1000,
      );
      const item = isRecord(payload) ? payload : {};
      return z
        .object({
          metaTitle: cleanString(65),
          metaDescription: cleanString(165),
        })
        .parse({
          metaTitle: pickString(item, ["metaTitle", "title", "seoTitle"], data.title),
          metaDescription: pickString(item, ["metaDescription", "description", "seoDescription"], data.topic),
        });
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
      const payload = await generateJsonText(
        `Write 4 realistic FAQ entries in ${data.language} that real customers of "${data.businessName}" would ask about "${data.topic}". Answers must be concrete, 2–4 sentences. No invented prices, no guarantees.

Return exactly this JSON shape:
{"faq":[{"q":"","a":""}]}
${sharedRules}`,
        1800,
      );
      const faq = normalizeFaq(
        isRecord(payload) ? payload.faq ?? payload.faqs ?? payload.questions ?? payload.items : payload,
      );
      return z.array(z.object({ q: cleanString(140), a: cleanString(400) })).parse(faq).slice(0, 5);
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
      const payload = await generateJsonText(
        `Suggest ONE short, action-oriented CTA button label in ${data.language} for a ${data.intent.toLowerCase()} page about "${data.topic}" for "${data.businessName}". 2–5 words. No emojis, no quotes.

Return exactly this JSON shape:
{"cta":""}
${sharedRules}`,
        700,
      );
      const item = isRecord(payload) ? payload : {};
      return cleanString(50).parse(pickString(item, ["cta", "label", "button"], "Contact us"));
    } catch (e) {
      throw mapGatewayError(e);
    }
  });
