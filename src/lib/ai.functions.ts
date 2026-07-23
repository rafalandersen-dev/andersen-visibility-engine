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
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { normalizeQualityScore } from "./quality";
import { normalizeHookProposals } from "./hook";
import { internalLinkRule } from "./internal-link-prompt";
import { brandIntelligenceBlock } from "./brand";
import { candidateUsesOpenRouter, getRouterStatus } from "./ai-router";
import {
  extractAuditSignals,
  normalizePublicAudit,
  deterministicFallbackAudit,
  normalizeAuditUrl,
} from "./public-audit";
import {
  isDataForSeoConfigured,
  extractDomain,
  fetchBacklinkSummary,
  fetchTopReferringDomains,
  fetchBacklinkGap,
  getDataForSeoHealth,
} from "./backlinks.server";
import type { Project, ServiceItem, Opportunity } from "./types";

import { claimAiUsage, type UsageBucket } from "./ai-usage.server";

const MODEL = "google/gemini-3-flash-preview";

const LANGUAGES = ["Polish", "Swedish", "English", "Danish"] as const;
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

const AUDIT_CATEGORIES = [
  "Business Clarity",
  "SEO Basics",
  "Local Visibility",
  "AI Readiness",
  "Conversion & Trust",
] as const;

const COMPETITOR_GAP_CATEGORIES = [
  "Service Coverage",
  "FAQ & Answers",
  "Local Positioning",
  "Trust & Authority",
  "Conversion & Offer",
  "Content Themes",
] as const;

const AUTHORITY_CATEGORIES = [
  "Local Directories & Citations",
  "Industry Directories",
  "Review & Reputation",
  "Partner & Supplier Links",
  "Associations & Communities",
  "PR & Story",
  "Trust Signals",
  "Outreach",
] as const;

const AI_VISIBILITY_CATEGORIES = [
  "Discovery Prompts",
  "Comparison Prompts",
  "Problem / Solution Prompts",
  "Local-Intent Prompts",
  "Trust & Citation Readiness",
  "Content Gaps for AI Answers",
  "Authority Gaps for AI Answers",
] as const;

const LanguageEnum = normalizedEnum(LANGUAGES);
const ContentTypeEnum = normalizedEnum(CONTENT_TYPES);
const SearchIntentEnum = normalizedEnum(SEARCH_INTENTS);
const PriorityEnum = normalizedEnum(PRIORITIES);
const AuditCategoryEnum = normalizedEnum(AUDIT_CATEGORIES);
const CompetitorGapCategoryEnum = normalizedEnum(COMPETITOR_GAP_CATEGORIES);
const AuthorityCategoryEnum = normalizedEnum(AUTHORITY_CATEGORIES);
const AiVisibilityCategoryEnum = normalizedEnum(AI_VISIBILITY_CATEGORIES);

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

// Site Audit finding (id assigned client-side, like opportunities/calendar).
const AuditFindingOutputSchema = z.object({
  title: cleanString(120),
  category: AuditCategoryEnum,
  severity: PriorityEnum,
  explanation: cleanString(400),
  recommendation: cleanString(400),
  suggestedOpportunityTitle: cleanString(120),
  suggestedContentType: ContentTypeEnum,
  suggestedSearchIntent: SearchIntentEnum,
  suggestedCta: cleanString(60),
  priority: PriorityEnum,
});

// Competitor Gap (id assigned client-side).
const CompetitorGapOutputSchema = z.object({
  title: cleanString(120),
  category: CompetitorGapCategoryEnum,
  severity: PriorityEnum,
  competitorEvidence: cleanString(400),
  explanation: cleanString(400),
  recommendation: cleanString(400),
  suggestedOpportunityTitle: cleanString(120),
  suggestedContentType: ContentTypeEnum,
  suggestedSearchIntent: SearchIntentEnum,
  suggestedCta: cleanString(60),
  priority: PriorityEnum,
});

const CompetitorSnapshotOutputSchema = z.object({
  competitorUrl: cleanString(300),
  title: cleanString(200),
  detectedPositioning: cleanString(300),
  notableStrengths: z.array(cleanString(160)),
  fetchStatus: z.enum(["fetched", "failed"]),
});

// Authority item (id assigned client-side).
const AuthorityItemOutputSchema = z.object({
  title: cleanString(120),
  category: AuthorityCategoryEnum,
  priority: PriorityEnum,
  effort: PriorityEnum,
  expectedImpact: PriorityEnum,
  explanation: cleanString(400),
  recommendation: cleanString(400),
  suggestedPlatformOrTarget: cleanString(200),
  outreachAngle: cleanString(300),
  suggestedOpportunityTitle: cleanString(120),
  suggestedContentType: ContentTypeEnum,
  suggestedSearchIntent: SearchIntentEnum,
  suggestedCta: cleanString(60),
});

// AI Visibility (ids assigned client-side). Planning/readiness only — never live AI results.
const AiVisibilityPromptSetOutputSchema = z.object({
  category: AiVisibilityCategoryEnum,
  prompt: cleanString(200),
  language: LanguageEnum,
  intent: SearchIntentEnum,
  targetAudience: cleanString(160),
  whyItMatters: cleanString(300),
  readiness: PriorityEnum,
  recommendedSourcePageOrAsset: cleanString(200),
});

const AiVisibilityGapOutputSchema = z.object({
  title: cleanString(120),
  category: AiVisibilityCategoryEnum,
  priority: PriorityEnum,
  explanation: cleanString(400),
  likelyReason: cleanString(400),
  recommendation: cleanString(400),
  suggestedPrompt: cleanString(200),
  suggestedOpportunityTitle: cleanString(120),
  suggestedContentType: ContentTypeEnum,
  suggestedSearchIntent: SearchIntentEnum,
  suggestedCta: cleanString(60),
});

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI Gateway is not configured.");
  return createLovableAiGatewayProvider(key);
}

/**
 * Resolve the AI SDK model callable for a request. With no override → the
 * production model via the Lovable gateway (unchanged). With a candidate model
 * id → OpenRouter when its key is set, otherwise the same gateway with that id.
 * Secrets are read server-side only and never returned or logged.
 */
function modelFor(modelId?: string) {
  if (!modelId || modelId === MODEL) return getGateway()(MODEL);
  if (candidateUsesOpenRouter()) {
    const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
    if (!key) throw new Error("Candidate model is not configured.");
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
    return provider(modelId);
  }
  return getGateway()(modelId);
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

const pickNumber = (record: UnknownRecord, keys: string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(parseFloat(value)))
      return value;
  }
  return undefined;
};

const clampScore = (value: unknown, fallback = 60): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
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
    values.find(
      (option) => input.includes(normalize(option)) || normalize(option).includes(input),
    ) ??
    fallback
  );
}

function normalizeLanguage(value: unknown, project?: Project) {
  const raw = asString(value).toLowerCase();
  if (/svensk|svenska|swedish|sverige|sweden/.test(raw)) return "Swedish";
  if (/polsk|polska|polski|polish|poland|polska/.test(raw)) return "Polish";
  if (/dansk|danish|danmark|denmark/.test(raw)) return "Danish";
  if (/engelsk|english|angielski/.test(raw)) return "English";
  return normalizeValue(
    value,
    LANGUAGES,
    project?.primaryLanguage && LANGUAGES.includes(project.primaryLanguage)
      ? project.primaryLanguage
      : "English",
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
  if (/transaction|transaktion|buy|köp|kop|book|boka|bokning|order|quote|offert|hire/.test(raw))
    return "Transactional";
  if (
    /commercial|kommersi|compare|jämför|jamfor|best|pricing|price|pris|cost|service|tjänst|tjanst/.test(
      raw,
    )
  )
    return "Commercial";
  if (/navigation|brand|contact|kontakt|address|adress/.test(raw)) return "Navigational";
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

  const tryParse = (candidate: string) => {
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
  };

  for (const start of starts.sort((a, b) => a - b)) {
    const stack: string[] = [];
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

      if (char === "{") stack.push("}");
      if (char === "[") stack.push("]");
      if ((char === "}" || char === "]") && stack.pop() !== char) break;

      if (stack.length === 0) {
        try {
          return tryParse(cleaned.slice(start, i + 1));
        } catch {
          break;
        }
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
  const title = pickString(
    item,
    ["title", "topicTitle", "topic_title", "topic", "name", "headline", "primary_keyword"],
    `SEO opportunity ${index + 1}`,
  );
  return OpportunityItemSchema.parse({
    title,
    language: normalizeLanguage(item.language ?? item.lang, project),
    contentType: normalizeContentType(
      item.contentType ??
        item.content_type ??
        item.type ??
        item.format ??
        item.assetType ??
        item.asset_type,
    ),
    searchIntent: normalizeSearchIntent(item.searchIntent ?? item.search_intent ?? item.intent),
    targetAudience: pickString(
      item,
      ["targetAudience", "target_audience", "audience", "who", "persona"],
      project.targetAudience || "Potential customers",
    ),
    businessValue: pickString(
      item,
      ["businessValue", "business_value", "value", "why", "why_it_works", "rationale", "strategy"],
      "Build qualified search visibility for the business.",
    ),
    recommendedCta: pickString(
      item,
      [
        "recommendedCta",
        "recommended_cta",
        "suggested_cta",
        "cta",
        "callToAction",
        "call_to_action",
      ],
      "Contact us",
    ),
    priority: normalizePriority(item.priority ?? item.impact),
  });
}

function normalizeCalendarItem(value: unknown, project: Project, index: number) {
  const item = isRecord(value) ? value : {};
  return CalendarItemSchema.parse({
    opportunityIndex: item.opportunityIndex ?? item.sourceIndex ?? item.index ?? index + 1,
    daysFromToday:
      item.daysFromToday ??
      item.days_from_today ??
      item.dayOffset ??
      item.day_offset ??
      item.day ??
      (index + 1) * 4,
    topicTitle: pickString(
      item,
      ["topicTitle", "topic_title", "title", "topic", "name"],
      `Planned content ${index + 1}`,
    ),
    language: normalizeLanguage(item.language ?? item.lang, project),
    contentType: normalizeContentType(
      item.contentType ?? item.content_type ?? item.type ?? item.format,
    ),
    searchIntent: normalizeSearchIntent(item.searchIntent ?? item.search_intent ?? item.intent),
    recommendedCta: pickString(
      item,
      [
        "recommendedCta",
        "recommended_cta",
        "suggested_cta",
        "cta",
        "callToAction",
        "call_to_action",
      ],
      "Contact us",
    ),
  });
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n|,|;/)
      : [];
  const items = source
    .map((item) =>
      isRecord(item) ? pickString(item, ["title", "text", "label", "name"]) : asString(item),
    )
    .filter(Boolean);
  return items.length ? items : fallback;
}

function normalizeFaq(value: unknown) {
  const source =
    isRecord(value) && Array.isArray(value.faq)
      ? value.faq
      : isRecord(value) && Array.isArray(value.faqs)
        ? value.faqs
        : isRecord(value) && Array.isArray(value.questions)
          ? value.questions
          : Array.isArray(value)
            ? value
            : [];
  const items = source
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const q = pickString(item, ["q", "question", "title", "heading"], `Question ${index + 1}`);
      const a = pickString(
        item,
        ["a", "answer", "response", "body", "text"],
        "Contact the business for details.",
      );
      return { q, a };
    })
    .filter((item): item is { q: string; a: string } => Boolean(item));
  return items.length
    ? items
    : [
        {
          q: "How can I get started?",
          a: "Contact the team to discuss your needs and the next practical step.",
        },
      ];
}

function normalizeContentAsset(payload: unknown, project: Project, opp: Opportunity) {
  const root = isRecord(payload) ? payload : {};
  const item =
    ["contentAsset", "content_asset", "asset", "page", "article", "draft"]
      .map((key) => root[key])
      .find(isRecord) ?? root;
  const markdown = pickString(
    item,
    [
      "markdown",
      "content",
      "body",
      "draftMarkdown",
      "draft_markdown",
      "article",
      "pageDraft",
      "page_draft",
    ],
    `## ${opp.title}\n\nCreate a focused page for ${project.businessName || project.name} that answers the search intent clearly and guides readers toward ${opp.recommendedCta}.`,
  );
  const parsed = ContentAssetSchema.parse({
    metaTitle: pickString(
      item,
      ["metaTitle", "meta_title", "seoTitle", "seo_title", "title"],
      opp.title,
    ),
    metaDescription: pickString(
      item,
      ["metaDescription", "meta_description", "seoDescription", "seo_description", "description"],
      opp.businessValue,
    ),
    h1: pickString(item, ["h1", "headline", "pageTitle"], opp.title),
    outline: normalizeStringArray(item.outline ?? item.sections, [
      "Introduction",
      "Key information",
      "Next step",
    ]),
    faq: normalizeFaq(item.faq ?? item.faqs ?? item.questions),
    cta: pickString(
      item,
      ["cta", "recommendedCta", "recommended_cta", "callToAction", "call_to_action"],
      opp.recommendedCta || "Contact us",
    ),
    markdown,
    internalLinks: normalizeStringArray(
      item.internalLinks ?? item.internal_links ?? item.links,
      [],
    ),
    schemaSuggestions: normalizeStringArray(
      item.schemaSuggestions ??
        item.schema_suggestions ??
        item.schema ??
        item.structuredData ??
        item.structured_data,
      [],
    ),
    editorNotes: pickString(item, ["editorNotes", "editor_notes", "notes"], ""),
  });
  // Article Studio 3.0 / P1.2A — up to three opening-hook proposals, when the
  // generation returned any. Additive + optional: an older/other generation path
  // that does not request them simply yields none, and the result is unchanged.
  const hookProposals = normalizeHookProposals(
    item.hookProposals ?? item.hooks ?? item.hook_proposals,
  );
  return hookProposals.length ? { ...parsed, hookProposals } : parsed;
}

function normalizeAuditCategory(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/local|near me|map|gbp|google business|directory/.test(raw)) return "Local Visibility";
  if (/conver|trust|cta|testimonial|review|booking|pricing|offer/.test(raw))
    return "Conversion & Trust";
  if (/\bai\b|geo|answer|generative|llm|cited|citation|overview/.test(raw)) return "AI Readiness";
  if (/seo|search engine|on-?page|technical|meta|title|heading|keyword|internal link/.test(raw))
    return "SEO Basics";
  if (/clarity|business|messaging|value prop|positioning|who|what/.test(raw))
    return "Business Clarity";
  return normalizeValue(value, AUDIT_CATEGORIES, "SEO Basics");
}

function normalizeAuditFinding(value: unknown, index: number) {
  const item = isRecord(value) ? value : {};
  const title = pickString(
    item,
    ["title", "name", "issue", "heading", "finding"],
    `Finding ${index + 1}`,
  );
  return AuditFindingOutputSchema.parse({
    title,
    category: normalizeAuditCategory(item.category ?? item.area ?? item.group ?? item.section),
    severity: normalizePriority(item.severity ?? item.impact ?? item.priority),
    explanation: pickString(
      item,
      ["explanation", "detail", "details", "why", "description", "problem", "issue"],
      "This area could be clearer for both search engines and AI answers.",
    ),
    recommendation: pickString(
      item,
      [
        "recommendation",
        "fix",
        "action",
        "suggestion",
        "howToFix",
        "how_to_fix",
        "recommendedAction",
        "remedy",
      ],
      "Add a focused page or section that addresses this directly.",
    ),
    suggestedOpportunityTitle: pickString(
      item,
      [
        "suggestedOpportunityTitle",
        "suggested_opportunity_title",
        "opportunityTitle",
        "suggestedTitle",
        "contentTitle",
        "pageTitle",
      ],
      title,
    ),
    suggestedContentType: normalizeContentType(
      item.suggestedContentType ??
        item.contentType ??
        item.content_type ??
        item.type ??
        item.format,
    ),
    suggestedSearchIntent: normalizeSearchIntent(
      item.suggestedSearchIntent ?? item.searchIntent ?? item.search_intent ?? item.intent,
    ),
    suggestedCta: pickString(
      item,
      ["suggestedCta", "suggested_cta", "cta", "callToAction", "call_to_action"],
      "Contact us",
    ),
    priority: normalizePriority(item.priority ?? item.severity ?? item.impact),
  });
}

function normalizeCompetitorGapCategory(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/service|offering|product/.test(raw)) return "Service Coverage";
  if (/faq|question|answer/.test(raw)) return "FAQ & Answers";
  if (/local|location|area|city|neighbo|near me|geo/.test(raw)) return "Local Positioning";
  if (/trust|authority|review|testimonial|credential|about|founder|guarantee|proof/.test(raw))
    return "Trust & Authority";
  if (/conver|offer|cta|booking|pricing|package|subscription|checkout/.test(raw))
    return "Conversion & Offer";
  if (/content|blog|topic|theme|educational|seasonal|guide/.test(raw)) return "Content Themes";
  return normalizeValue(value, COMPETITOR_GAP_CATEGORIES, "Service Coverage");
}

function normalizeCompetitorGap(value: unknown, index: number) {
  const item = isRecord(value) ? value : {};
  const title = pickString(
    item,
    ["title", "name", "gap", "heading"],
    `Competitor gap ${index + 1}`,
  );
  return CompetitorGapOutputSchema.parse({
    title,
    category: normalizeCompetitorGapCategory(
      item.category ?? item.area ?? item.group ?? item.section,
    ),
    severity: normalizePriority(item.severity ?? item.impact ?? item.priority),
    competitorEvidence: pickString(
      item,
      [
        "competitorEvidence",
        "competitor_evidence",
        "evidence",
        "whatTheyDo",
        "observed",
        "example",
      ],
      "A competitor covers this more clearly than the business does.",
    ),
    explanation: pickString(
      item,
      ["explanation", "detail", "details", "why", "description", "gap"],
      "Competitors address this and the business currently does not.",
    ),
    recommendation: pickString(
      item,
      ["recommendation", "fix", "action", "suggestion", "howToClose", "how_to_close", "remedy"],
      "Create a focused page or section that closes this gap.",
    ),
    suggestedOpportunityTitle: pickString(
      item,
      [
        "suggestedOpportunityTitle",
        "suggested_opportunity_title",
        "opportunityTitle",
        "suggestedTitle",
        "contentTitle",
        "pageTitle",
      ],
      title,
    ),
    suggestedContentType: normalizeContentType(
      item.suggestedContentType ??
        item.contentType ??
        item.content_type ??
        item.type ??
        item.format,
    ),
    suggestedSearchIntent: normalizeSearchIntent(
      item.suggestedSearchIntent ?? item.searchIntent ?? item.search_intent ?? item.intent,
    ),
    suggestedCta: pickString(
      item,
      ["suggestedCta", "suggested_cta", "cta", "callToAction", "call_to_action"],
      "Contact us",
    ),
    priority: normalizePriority(item.priority ?? item.severity ?? item.impact),
  });
}

function normalizeCompetitorSnapshot(value: unknown, fallbackUrl: string, fetched: boolean) {
  const item = isRecord(value) ? value : {};
  return CompetitorSnapshotOutputSchema.parse({
    competitorUrl: pickString(
      item,
      ["competitorUrl", "competitor_url", "url", "website"],
      fallbackUrl,
    ),
    title: pickString(
      item,
      ["title", "name", "businessName"],
      fetched ? "Competitor" : "Competitor (not fetched)",
    ),
    detectedPositioning: pickString(
      item,
      ["detectedPositioning", "detected_positioning", "positioning", "summary", "description"],
      fetched ? "Positioning not clearly detected." : "Could not read this competitor's site.",
    ),
    notableStrengths: normalizeStringArray(
      item.notableStrengths ?? item.notable_strengths ?? item.strengths ?? item.highlights,
      [],
    ),
    fetchStatus: fetched ? "fetched" : "failed",
  });
}

function normalizeAuthorityCategory(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (
    /local.*(direct|citation|listing)|citation|nap|map|gbp|google business|yelp|near me/.test(raw)
  )
    return "Local Directories & Citations";
  if (
    /industry|niche|professional director|marketplace|vertical|trade director|profile director/.test(
      raw,
    )
  )
    return "Industry Directories";
  if (/review|reputation|testimonial|rating|trustpilot|feedback/.test(raw))
    return "Review & Reputation";
  if (/partner|supplier|manufacturer|collab|reseller|stockist|vendor/.test(raw))
    return "Partner & Supplier Links";
  if (/association|community|chamber|membership|guild|group|society|club|network/.test(raw))
    return "Associations & Communities";
  if (
    /\bpr\b|press|story|media|news|journalist|founder story|event|seasonal|commentary|publicity/.test(
      raw,
    )
  )
    return "PR & Story";
  if (
    /trust|credential|certification|accreditation|case study|proof|award|badge|about|guarantee/.test(
      raw,
    )
  )
    return "Trust Signals";
  if (/outreach|contact|pitch|email|reach out|approach/.test(raw)) return "Outreach";
  return normalizeValue(value, AUTHORITY_CATEGORIES, "Local Directories & Citations");
}

function normalizeAuthorityItem(value: unknown, index: number) {
  const item = isRecord(value) ? value : {};
  const title = pickString(
    item,
    ["title", "name", "opportunity", "heading", "action"],
    `Authority opportunity ${index + 1}`,
  );
  return AuthorityItemOutputSchema.parse({
    title,
    category: normalizeAuthorityCategory(
      item.category ?? item.area ?? item.group ?? item.section ?? item.type,
    ),
    priority: normalizePriority(item.priority ?? item.impact ?? item.severity),
    effort: normalizePriority(item.effort ?? item.difficulty ?? item.work),
    expectedImpact: normalizePriority(
      item.expectedImpact ?? item.expected_impact ?? item.impact ?? item.value,
    ),
    explanation: pickString(
      item,
      ["explanation", "detail", "details", "why", "description", "rationale"],
      "Building presence here can strengthen the business's credibility and discoverability.",
    ),
    recommendation: pickString(
      item,
      ["recommendation", "action", "suggestion", "howTo", "how_to", "steps", "nextStep"],
      "Claim or build a presence here, keeping business details consistent.",
    ),
    suggestedPlatformOrTarget: pickString(
      item,
      [
        "suggestedPlatformOrTarget",
        "suggested_platform_or_target",
        "platform",
        "target",
        "where",
        "site",
        "directory",
        "publication",
      ],
      "Relevant platform or directory",
    ),
    outreachAngle: pickString(
      item,
      ["outreachAngle", "outreach_angle", "angle", "pitch", "why_they_care", "whyTheyCare", "hook"],
      "Lead with what makes the business genuinely useful or interesting to their audience.",
    ),
    suggestedOpportunityTitle: pickString(
      item,
      [
        "suggestedOpportunityTitle",
        "suggested_opportunity_title",
        "opportunityTitle",
        "suggestedTitle",
        "contentTitle",
        "pageTitle",
      ],
      title,
    ),
    suggestedContentType: normalizeContentType(
      item.suggestedContentType ??
        item.contentType ??
        item.content_type ??
        item.type ??
        item.format,
    ),
    suggestedSearchIntent: normalizeSearchIntent(
      item.suggestedSearchIntent ?? item.searchIntent ?? item.search_intent ?? item.intent,
    ),
    suggestedCta: pickString(
      item,
      ["suggestedCta", "suggested_cta", "cta", "callToAction", "call_to_action"],
      "Contact us",
    ),
  });
}

function normalizeAiVisibilityCategory(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/discover|best .* in|where can|recommend|near|find a|looking for/.test(raw))
    return "Discovery Prompts";
  if (/compar|vs\b|versus|which|choose|best option|alternative/.test(raw))
    return "Comparison Prompts";
  if (/problem|solution|how to|what helps|what should|fix|solve|troubleshoot/.test(raw))
    return "Problem / Solution Prompts";
  if (/local|city|neighbo|area|near me|geo|location|language/.test(raw))
    return "Local-Intent Prompts";
  if (/trust|citation|cite|proof|fact|credential|source readiness|verif/.test(raw))
    return "Trust & Citation Readiness";
  if (
    /content gap|missing faq|missing service|missing comparison|missing content|expert content|helpful content/.test(
      raw,
    )
  )
    return "Content Gaps for AI Answers";
  if (/authority gap|third.?party|review|testimonial|director|external proof|profile/.test(raw))
    return "Authority Gaps for AI Answers";
  return normalizeValue(value, AI_VISIBILITY_CATEGORIES, "Discovery Prompts");
}

function normalizePromptSet(value: unknown, project: Project) {
  const item = isRecord(value) ? value : {};
  return AiVisibilityPromptSetOutputSchema.parse({
    category: normalizeAiVisibilityCategory(
      item.category ?? item.type ?? item.group ?? item.section,
    ),
    prompt: pickString(
      item,
      ["prompt", "question", "query", "text", "title"],
      `What is the best option for ${project.businessType || "this business"}?`,
    ),
    language: normalizeLanguage(item.language ?? item.lang, project),
    intent: normalizeSearchIntent(item.intent ?? item.searchIntent ?? item.search_intent),
    targetAudience: pickString(
      item,
      ["targetAudience", "target_audience", "audience", "who", "persona"],
      project.targetAudience || "Potential customers",
    ),
    whyItMatters: pickString(
      item,
      ["whyItMatters", "why_it_matters", "why", "rationale", "reason", "importance"],
      "Customers ask AI assistants this kind of question when choosing who to buy from.",
    ),
    readiness: normalizePriority(
      item.readiness ?? item.answerReadiness ?? item.answer_readiness ?? item.status,
    ),
    recommendedSourcePageOrAsset: pickString(
      item,
      [
        "recommendedSourcePageOrAsset",
        "recommended_source_page_or_asset",
        "sourcePage",
        "source",
        "recommendedSource",
        "page",
        "asset",
      ],
      "A clear, factual page that answers this directly",
    ),
  });
}

function normalizeVisibilityGap(value: unknown, index: number) {
  const item = isRecord(value) ? value : {};
  const title = pickString(
    item,
    ["title", "name", "gap", "heading"],
    `AI visibility gap ${index + 1}`,
  );
  return AiVisibilityGapOutputSchema.parse({
    title,
    category: normalizeAiVisibilityCategory(
      item.category ?? item.area ?? item.group ?? item.section,
    ),
    priority: normalizePriority(item.priority ?? item.severity ?? item.impact),
    explanation: pickString(
      item,
      ["explanation", "detail", "details", "description", "gap", "why"],
      "The business may not yet have a clear source AI assistants could use to answer this.",
    ),
    likelyReason: pickString(
      item,
      ["likelyReason", "likely_reason", "reason", "cause", "rootCause", "root_cause", "why"],
      "There is likely no dedicated, factual page or proof source covering this topic yet.",
    ),
    recommendation: pickString(
      item,
      ["recommendation", "fix", "action", "suggestion", "howToClose", "how_to_close", "remedy"],
      "Create a focused, factual page or proof source that answers this clearly.",
    ),
    suggestedPrompt: pickString(
      item,
      ["suggestedPrompt", "suggested_prompt", "prompt", "question", "examplePrompt"],
      title,
    ),
    suggestedOpportunityTitle: pickString(
      item,
      [
        "suggestedOpportunityTitle",
        "suggested_opportunity_title",
        "opportunityTitle",
        "suggestedTitle",
        "contentTitle",
        "pageTitle",
      ],
      title,
    ),
    suggestedContentType: normalizeContentType(
      item.suggestedContentType ??
        item.contentType ??
        item.content_type ??
        item.type ??
        item.format,
    ),
    suggestedSearchIntent: normalizeSearchIntent(
      item.suggestedSearchIntent ?? item.searchIntent ?? item.search_intent ?? item.intent,
    ),
    suggestedCta: pickString(
      item,
      ["suggestedCta", "suggested_cta", "cta", "callToAction", "call_to_action"],
      "Contact us",
    ),
  });
}

// NOTE: GPT-5-class models are reasoning models — they spend output-token
// budget on internal reasoning before emitting the answer, so the cap must
// cover reasoning + the JSON payload or the response truncates mid-JSON.
// 16k leaves ample headroom for our small JSON/markdown outputs.
async function generateJsonText(prompt: string, maxOutputTokens = 16000, modelId?: string) {
  const { text } = await generateText({
    model: modelFor(modelId),
    maxOutputTokens,
    prompt,
  });
  return parseJsonFromText(text);
}

function mapGatewayError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  // Surface real cause to server logs so we can debug. The actionable signal
  // (429, 402, finish_reason=length, schema details) frequently lives on the
  // error's `cause` or `statusCode`, not the top-level message — so detect
  // across all of them. Never logs secrets (AI SDK errors omit the API key).
  const anyErr = e as { cause?: unknown; text?: unknown; statusCode?: unknown; status?: unknown };
  const causeMsg = anyErr?.cause instanceof Error ? anyErr.cause.message : anyErr?.cause;
  const text = typeof anyErr?.text === "string" ? anyErr.text.slice(0, 800) : undefined;
  const status = anyErr?.statusCode ?? anyErr?.status;
  const msg = [
    raw,
    typeof causeMsg === "string" ? causeMsg : "",
    status ? `status ${status}` : "",
  ].join(" ");
  console.error("[ai.functions] gateway/validation error:", raw, { cause: causeMsg, status, text });

  // 1. Rate limit — transient, retry shortly.
  if (/\b429\b|rate.?limit|too many requests|overloaded/i.test(msg))
    return new Error("AI is busy right now (rate limit). Please retry in a moment.");

  // 2. Credits / billing / quota — needs account action, not a retry.
  if (
    /\b402\b|credit|insufficient|quota|billing|payment required|out of funds|exceeded your/i.test(
      msg,
    )
  )
    return new Error("AI credits/quota exhausted. Please check your AI billing balance.");

  // 3. Truncation / incomplete — check BEFORE schema/JSON, since a cut-off
  //    response usually also fails those checks but the real cause is length.
  if (
    /max_?tokens|max output|length limit|truncat|incomplete|finish.?reason\W*length|unexpected end of (json|input|data)/i.test(
      msg,
    )
  )
    return new Error("AI response was cut short (incomplete). Please try again.");

  // 4. Schema / structured-output validation — model returned the wrong shape.
  if (
    /schema|validation|zod|invalid_type|too_small|too_big|unrecognized|did not match|no object generated/i.test(
      msg,
    )
  )
    return new Error("AI returned data in an unexpected structure. Please try again.");

  // 4b. JSON parse / empty payload — couldn't read the model output at all.
  if (/not valid json|unexpected token|no json|no opportunities|no calendar|empty/i.test(msg))
    return new Error("AI returned an unexpected format. Please try again.");

  // 5. Generic / unknown provider failure.
  return new Error("AI generation failed. Please try again.");
}

/**
 * Human-readable language for AI content generation. Prefers the project's
 * `primaryContentLanguage` (en/pl/sv/da, incl. Danish), then the legacy
 * `primaryLanguage` enum, then English. Used to tell generators which language
 * to write in — separate from the app UI language.
 */
export function contentLanguageLabel(p: Project): string {
  switch (p.primaryContentLanguage) {
    case "pl":
      return "Polish";
    case "sv":
      return "Swedish";
    case "da":
      return "Danish";
    case "en":
      return "English";
    default:
      return p.primaryLanguage || "English";
  }
}

function projectBrief(p: Project, services: ServiceItem[]) {
  const contentLang = contentLanguageLabel(p);
  return [
    `Business: ${p.businessName || p.name}`,
    p.websiteUrl
      ? `Website: ${p.websiteUrl} (NOT crawled — base recommendations only on the context below)`
      : null,
    p.businessType ? `Type: ${p.businessType}` : null,
    p.description ? `Description: ${p.description}` : null,
    p.targetAudience ? `Audience: ${p.targetAudience}` : null,
    p.mainLocation ? `Main location: ${p.mainLocation}` : null,
    p.targetLocations?.length ? `Target locations: ${p.targetLocations.join(", ")}` : null,
    `Primary language: ${p.primaryLanguage}`,
    `Content language (write ALL generated content in this language): ${contentLang}`,
    p.additionalLanguages?.length
      ? `Additional languages: ${p.additionalLanguages.join(", ")}`
      : null,
    p.toneOfVoice ? `Tone of voice: ${p.toneOfVoice}` : null,
    p.uniqueSellingPoints ? `USPs: ${p.uniqueSellingPoints}` : null,
    p.brandNotes ? `Brand notes: ${p.brandNotes}` : null,
    services.length
      ? `Services/products:\n${services
          .map(
            (s) =>
              `- [${s.kind}] ${s.name}${s.description ? ` — ${s.description}` : ""}${s.locationRelevance ? ` (loc: ${s.locationRelevance})` : ""}`,
          )
          .join("\n")}`
      : "Services/products: (none provided)",
    brandIntelligenceBlock(p) || null,
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
// Site Audit v1 — safe, limited homepage fetch + AI audit
// ============================================================

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch a single URL as text with a hard timeout. Returns "" on any failure. */
async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "MiloGrowthAuditBot/1.0 (+https://milogrowth.com)" },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/text\/html|application\/xhtml|text\/plain/i.test(ct)) return "";
    const body = await res.text();
    return body.slice(0, 300_000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

interface SiteContext {
  ok: boolean;
  title: string;
  metaDescription: string;
  text: string;
  links: string[];
}

/**
 * Best-effort, limited homepage read for the audit. Fetches ONLY the homepage,
 * extracts title/meta/visible text and discovers up to 5 same-domain internal
 * links (path + anchor text). Never throws — returns ok:false on any problem.
 */
async function fetchSiteContext(rawUrl: string): Promise<SiteContext> {
  const empty: SiteContext = { ok: false, title: "", metaDescription: "", text: "", links: [] };
  let url = (rawUrl || "").trim();
  if (!url) return empty;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    return empty;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return empty;

  const html = await fetchHtml(base.toString(), 8000);
  if (!html) return empty;

  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200);
  const metaDescription = (
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ??
    ""
  )
    .trim()
    .slice(0, 320);

  const links: string[] = [];
  const seen = new Set<string>();
  const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) && links.length < 5) {
    try {
      const u = new URL(match[1], base);
      if (u.hostname !== base.hostname) continue;
      const path = u.pathname.replace(/\/+$/, "") || "/";
      if (path === "/" || seen.has(path)) continue;
      seen.add(path);
      const anchor = stripTags(match[2]).slice(0, 60);
      links.push(anchor ? `${path} (${anchor})` : path);
    } catch {
      /* skip malformed href */
    }
  }

  const text = stripTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "),
  ).slice(0, 3500);

  return { ok: true, title, metaDescription, text, links };
}

/**
 * Minimum readable server-side text before we claim to have read a live site.
 * A CSR/JS app returns HTTP 200 with an empty shell, so `ok` alone is misleading.
 */
export const MIN_AUDIT_CONTENT_CHARS = 200;

/**
 * Honest read-state for the on-page review, so a failed OR partial (empty-shell
 * SPA) fetch is never presented as a confident measurement. Pure + exported for
 * test.
 */
export function auditSiteReadState(site: { ok: boolean; text: string }): {
  read: boolean;
  note: string;
} {
  if (site.ok && site.text.trim().length >= MIN_AUDIT_CONTENT_CHARS) {
    return { read: true, note: "" };
  }
  if (site.ok) {
    return {
      read: false,
      note: "Your site returned little readable server-side content (often a JavaScript app that renders in the browser), so this review reflects your business details rather than a read of your live pages.",
    };
  }
  return {
    read: false,
    note: "We couldn't reach your website, so this review reflects your business details rather than your live pages.",
  };
}

export const generateAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        websiteUrl: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "audit" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const url = (data.websiteUrl || project.websiteUrl || "").trim();
    const brief = projectBrief(project, services);

    // Limited, safe homepage read (never throws).
    const site = await fetchSiteContext(url);
    const websiteBlock = site.ok
      ? `WEBSITE CONTENT (fetched from ${url}):
Title: ${site.title || "(none)"}
Meta description: ${site.metaDescription || "(none)"}
Internal links discovered: ${site.links.length ? site.links.join(", ") : "(none found on homepage)"}
Visible homepage text (excerpt):
${site.text || "(no readable text extracted)"}`
      : `WEBSITE: could not be fetched${url ? ` (${url})` : " (no URL provided)"}. Base the audit ONLY on the business context below.`;

    try {
      console.info("[ai.functions] audit reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        websiteFetched: site.ok,
      });

      const payload = await generateJsonText(
        `You are a senior SEO, local-SEO and AI-visibility (GEO) auditor for small and medium businesses.

Produce a prioritized visibility audit across these five areas: Business Clarity, SEO Basics, Local Visibility, AI Readiness, Conversion & Trust.

Return exactly this JSON shape:
{"overallScore":0,"seoScore":0,"localScore":0,"aiReadinessScore":0,"conversionScore":0,"summary":"","topFixes":[""],"findings":[{"title":"","category":"Business Clarity|SEO Basics|Local Visibility|AI Readiness|Conversion & Trust","severity":"Low|Medium|High","explanation":"","recommendation":"","suggestedOpportunityTitle":"","suggestedContentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","suggestedSearchIntent":"Informational|Commercial|Transactional|Navigational","suggestedCta":"","priority":"Low|Medium|High"}]}

Scoring: 0–100 where higher is better (well-optimized). Be realistic, not generous.
Findings: provide 8–12 findings spread across ALL five categories. Each "suggestedOpportunityTitle" must read like a real page or article that would fix the gap and could feed a content plan.
topFixes: 3–5 short strings naming the highest-impact actions.

${websiteBlock}

BUSINESS CONTEXT:
${brief}
${sharedRules}`,
        7000,
      );

      const root = isRecord(payload) ? payload : {};
      const findings = extractArray(root, ["findings", "issues", "items", "audit", "results"]).map(
        (f, i) => normalizeAuditFinding(f, i),
      );
      if (findings.length === 0) throw new Error("AI returned no audit findings.");

      const seoScore = clampScore(pickNumber(root, ["seoScore", "seo_score", "seo"]));
      const localScore = clampScore(pickNumber(root, ["localScore", "local_score", "local"]));
      const aiReadinessScore = clampScore(
        pickNumber(root, [
          "aiReadinessScore",
          "ai_readiness_score",
          "aiReadiness",
          "geoScore",
          "geo",
        ]),
      );
      const conversionScore = clampScore(
        pickNumber(root, ["conversionScore", "conversion_score", "conversion"]),
      );
      const overallScore = clampScore(
        pickNumber(root, ["overallScore", "overall_score", "overall", "score"]),
        Math.round((seoScore + localScore + aiReadinessScore + conversionScore) / 4),
      );
      const summary = pickString(
        root,
        ["summary", "overview", "analysis", "assessment"],
        "Audit complete — review the findings below and turn the top fixes into opportunities.",
      );
      const topFixes = normalizeStringArray(
        root.topFixes ?? root.top_fixes ?? root.priorities ?? root.quickWins ?? root.quick_wins,
        findings.slice(0, 3).map((f) => f.title),
      ).slice(0, 5);

      const readState = auditSiteReadState(site);
      console.info("[ai.functions] audit parsed", {
        findings: findings.length,
        readSite: readState.read,
      });

      return {
        // "Did we actually read the live site?" — false for a failed fetch AND
        // for an empty-shell SPA, so the UI never shows indicative scores as
        // measured. See auditSiteReadState.
        fetchedWebsite: readState.read,
        note: readState.note,
        overallScore,
        seoScore,
        localScore,
        aiReadinessScore,
        conversionScore,
        summary,
        topFixes,
        findings,
      };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Competitor Gap v1 — fetch 1–3 competitor homepages + AI gap analysis
// ============================================================

export const generateCompetitorGapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        competitorUrls: z.array(z.string()).default([]),
        auditSummary: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);

    const urls = data.competitorUrls
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (urls.length === 0) throw new Error("Add at least one competitor URL to run the analysis.");

    // Fetch competitor homepages in parallel; one failure must not sink the rest.
    const fetches = await Promise.all(
      urls.map(async (url) => ({ url, ctx: await fetchSiteContext(url) })),
    );
    const fetchedCount = fetches.filter((f) => f.ctx.ok).length;
    if (fetchedCount === 0) {
      // Clear, friendly error (thrown before the AI call — never a silent empty).
      throw new Error(
        "Could not fetch any of the competitor websites. Please check the URLs and try again.",
      );
    }

    const competitorBlocks = fetches
      .map((f, i) =>
        f.ctx.ok
          ? `Competitor ${i + 1} (${f.url}):
Title: ${f.ctx.title || "(none)"}
Meta description: ${f.ctx.metaDescription || "(none)"}
Internal links: ${f.ctx.links.length ? f.ctx.links.join(", ") : "(none found)"}
Homepage text (excerpt):
${f.ctx.text || "(no readable text)"}`
          : `Competitor ${i + 1} (${f.url}): could not be fetched — ignore for evidence.`,
      )
      .join("\n\n");

    const auditBlock = data.auditSummary
      ? `EXISTING SITE AUDIT SUMMARY for the business (its own known gaps):\n${data.auditSummary}\n`
      : "";

    try {
      console.info("[ai.functions] competitor-gap reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        competitors: urls.length,
        fetched: fetchedCount,
      });

      const payload = await generateJsonText(
        `You are a competitive SEO and AI-visibility strategist for small and medium businesses.

Compare THIS business against the competitor websites and produce prioritized, actionable gaps the business should close. Compare across: Service Coverage, FAQ & Answers, Local Positioning, Trust & Authority, Conversion & Offer, Content Themes.

Return exactly this JSON shape:
{"overallGapScore":0,"serviceGapScore":0,"contentGapScore":0,"localGapScore":0,"trustGapScore":0,"conversionGapScore":0,"summary":"","competitorSnapshots":[{"competitorUrl":"","title":"","detectedPositioning":"","notableStrengths":[""]}],"topGaps":[""],"gaps":[{"title":"","category":"Service Coverage|FAQ & Answers|Local Positioning|Trust & Authority|Conversion & Offer|Content Themes","severity":"Low|Medium|High","competitorEvidence":"","explanation":"","recommendation":"","suggestedOpportunityTitle":"","suggestedContentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","suggestedSearchIntent":"Informational|Commercial|Transactional|Navigational","suggestedCta":"","priority":"Low|Medium|High"}]}

Scores are 0–100 where HIGHER means a BIGGER gap vs competitors (more for the business to gain). Provide one competitorSnapshot per fetched competitor. Provide 8–12 gaps spread across the categories. Each "competitorEvidence" must reference what a competitor actually does (only for fetched competitors — never invent data for ones that failed to fetch). Each "suggestedOpportunityTitle" must read like a real page/article that closes the gap. topGaps: 3–5 short strings naming the highest-impact gaps.

THIS BUSINESS:
${brief}
${auditBlock}
COMPETITORS:
${competitorBlocks}
${sharedRules}`,
        7000,
      );

      const root = isRecord(payload) ? payload : {};
      const gaps = extractArray(root, [
        "gaps",
        "competitorGaps",
        "findings",
        "items",
        "results",
      ]).map((g, i) => normalizeCompetitorGap(g, i));
      if (gaps.length === 0) throw new Error("AI returned no competitor gaps.");

      const aiSnapshots = extractArray(root, ["competitorSnapshots", "competitors", "snapshots"]);
      const competitorSnapshots = fetches.map((f, i) =>
        normalizeCompetitorSnapshot(
          aiSnapshots[i] ?? { competitorUrl: f.url, title: f.ctx.title },
          f.url,
          f.ctx.ok,
        ),
      );

      const serviceGapScore = clampScore(
        pickNumber(root, ["serviceGapScore", "service_gap_score", "service"]),
      );
      const contentGapScore = clampScore(
        pickNumber(root, ["contentGapScore", "content_gap_score", "content"]),
      );
      const localGapScore = clampScore(
        pickNumber(root, ["localGapScore", "local_gap_score", "local"]),
      );
      const trustGapScore = clampScore(
        pickNumber(root, ["trustGapScore", "trust_gap_score", "trust"]),
      );
      const conversionGapScore = clampScore(
        pickNumber(root, ["conversionGapScore", "conversion_gap_score", "conversion"]),
      );
      const overallGapScore = clampScore(
        pickNumber(root, ["overallGapScore", "overall_gap_score", "overall", "score"]),
        Math.round(
          (serviceGapScore + contentGapScore + localGapScore + trustGapScore + conversionGapScore) /
            5,
        ),
      );
      const summary = pickString(
        root,
        ["summary", "overview", "analysis", "assessment"],
        "Competitor analysis complete — review the gaps below and turn the top ones into opportunities.",
      );
      const topGaps = normalizeStringArray(
        root.topGaps ?? root.top_gaps ?? root.priorities ?? root.quickWins,
        gaps.slice(0, 3).map((g) => g.title),
      ).slice(0, 5);

      const failedCount = urls.length - fetchedCount;
      const note =
        failedCount > 0
          ? `${failedCount} of ${urls.length} competitor site${urls.length > 1 ? "s" : ""} could not be fetched — analysis used the ones that loaded plus your project details.`
          : "";

      console.info("[ai.functions] competitor-gap parsed", {
        gaps: gaps.length,
        fetched: fetchedCount,
      });

      return {
        note,
        overallGapScore,
        serviceGapScore,
        contentGapScore,
        localGapScore,
        trustGapScore,
        conversionGapScore,
        summary,
        competitorSnapshots,
        topGaps,
        gaps,
      };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Authority v1 — authority-building opportunity planner (no scraping)
// ============================================================

export const generateAuthorityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        auditSummary: z.string().default(""),
        competitorSummary: z.string().default(""),
        competitorStrengths: z.array(z.string()).default([]),
        existingOpportunityTitles: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "authority" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);

    const auditBlock = data.auditSummary
      ? `EXISTING SITE AUDIT SUMMARY (the business's own known gaps):\n${data.auditSummary}\n`
      : "";
    const competitorBlock = data.competitorSummary
      ? `EXISTING COMPETITOR ANALYSIS SUMMARY:\n${data.competitorSummary}\n`
      : "";
    const competitorStrengthsBlock = data.competitorStrengths.length
      ? `Competitor strengths observed (inspiration only — do not invent new data):\n- ${data.competitorStrengths.slice(0, 12).join("\n- ")}\n`
      : "";
    const oppBlock = data.existingOpportunityTitles.length
      ? `Existing content opportunities (avoid duplicating these as authority items):\n- ${data.existingOpportunityTitles.slice(0, 20).join("\n- ")}\n`
      : "";

    try {
      console.info("[ai.functions] authority reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        serviceCount: services.length,
      });

      const payload = await generateJsonText(
        `You are an off-site authority and digital-PR strategist for small and medium businesses.

Help this business build credibility BEYOND its own website: local directories & citations, industry directories, review & reputation platforms, partner & supplier links, associations & communities, PR & story angles, on-site trust signals, and outreach. This is opportunity PLANNING — do NOT claim any listing, link or contact has been created, and do NOT invent backlink counts, domain authority, traffic numbers or guaranteed rankings.

Return exactly this JSON shape:
{"overallAuthorityScore":0,"localCitationScore":0,"industryPresenceScore":0,"reputationScore":0,"partnerLinkScore":0,"prOpportunityScore":0,"trustSignalScore":0,"summary":"","topAuthorityActions":[""],"authorityItems":[{"title":"","category":"Local Directories & Citations|Industry Directories|Review & Reputation|Partner & Supplier Links|Associations & Communities|PR & Story|Trust Signals|Outreach","priority":"Low|Medium|High","effort":"Low|Medium|High","expectedImpact":"Low|Medium|High","explanation":"","recommendation":"","suggestedPlatformOrTarget":"","outreachAngle":"","suggestedOpportunityTitle":"","suggestedContentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","suggestedSearchIntent":"Informational|Commercial|Transactional|Navigational","suggestedCta":""}]}

Scoring: 0–100 where HIGHER means STRONGER existing authority in that area. Be realistic for a small business with limited off-site presence.
authorityItems: provide 10–14 items spread across ALL eight categories. Each "suggestedPlatformOrTarget" should name a realistic type of platform, directory, association or contact relevant to this business and location (e.g. "Local chamber of commerce", "Industry trade directory", "Google Business Profile", "Regional news outlet") — never fabricate exact URLs or claim specific sites accept the business. Each "outreachAngle" should be a short, honest reason the target might care. Each "suggestedOpportunityTitle" must read like a real task/page that could enter the content plan.
topAuthorityActions: 3–5 short strings naming the highest-impact authority moves.

THIS BUSINESS:
${brief}
${auditBlock}${competitorBlock}${competitorStrengthsBlock}${oppBlock}${sharedRules}`,
        7000,
      );

      const root = isRecord(payload) ? payload : {};
      const authorityItems = extractArray(root, [
        "authorityItems",
        "authority_items",
        "items",
        "opportunities",
        "actions",
        "results",
      ]).map((it, i) => normalizeAuthorityItem(it, i));
      if (authorityItems.length === 0) throw new Error("AI returned no authority items.");

      const localCitationScore = clampScore(
        pickNumber(root, ["localCitationScore", "local_citation_score", "localCitation", "local"]),
      );
      const industryPresenceScore = clampScore(
        pickNumber(root, [
          "industryPresenceScore",
          "industry_presence_score",
          "industryPresence",
          "industry",
        ]),
      );
      const reputationScore = clampScore(
        pickNumber(root, ["reputationScore", "reputation_score", "reputation", "review"]),
      );
      const partnerLinkScore = clampScore(
        pickNumber(root, ["partnerLinkScore", "partner_link_score", "partnerLink", "partner"]),
      );
      const prOpportunityScore = clampScore(
        pickNumber(root, ["prOpportunityScore", "pr_opportunity_score", "prOpportunity", "pr"]),
      );
      const trustSignalScore = clampScore(
        pickNumber(root, ["trustSignalScore", "trust_signal_score", "trustSignal", "trust"]),
      );
      const overallAuthorityScore = clampScore(
        pickNumber(root, ["overallAuthorityScore", "overall_authority_score", "overall", "score"]),
        Math.round(
          (localCitationScore +
            industryPresenceScore +
            reputationScore +
            partnerLinkScore +
            prOpportunityScore +
            trustSignalScore) /
            6,
        ),
      );
      const summary = pickString(
        root,
        ["summary", "overview", "analysis", "assessment"],
        "Authority analysis complete — review the opportunities below and turn the top ones into opportunities.",
      );
      const topAuthorityActions = normalizeStringArray(
        root.topAuthorityActions ??
          root.top_authority_actions ??
          root.topActions ??
          root.priorities ??
          root.quickWins,
        authorityItems.slice(0, 3).map((it) => it.title),
      ).slice(0, 5);

      console.info("[ai.functions] authority parsed", { items: authorityItems.length });

      return {
        overallAuthorityScore,
        localCitationScore,
        industryPresenceScore,
        reputationScore,
        partnerLinkScore,
        prOpportunityScore,
        trustSignalScore,
        summary,
        topAuthorityActions,
        authorityItems,
      };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// AI Visibility v1 — readiness + prompt planner (NO live AI checks)
// ============================================================

export const generateAiVisibilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        auditSummary: z.string().default(""),
        competitorSummary: z.string().default(""),
        authoritySummary: z.string().default(""),
        existingOpportunityTitles: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);

    const auditBlock = data.auditSummary
      ? `EXISTING SITE AUDIT SUMMARY:\n${data.auditSummary}\n`
      : "";
    const competitorBlock = data.competitorSummary
      ? `EXISTING COMPETITOR ANALYSIS SUMMARY:\n${data.competitorSummary}\n`
      : "";
    const authorityBlock = data.authoritySummary
      ? `EXISTING AUTHORITY ANALYSIS SUMMARY:\n${data.authoritySummary}\n`
      : "";
    const oppBlock = data.existingOpportunityTitles.length
      ? `Existing content opportunities (avoid duplicating these as gaps):\n- ${data.existingOpportunityTitles.slice(0, 20).join("\n- ")}\n`
      : "";

    try {
      console.info("[ai.functions] ai-visibility reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        serviceCount: services.length,
      });

      const payload = await generateJsonText(
        `You are an AI-search readiness strategist for small and medium businesses. AI assistants (ChatGPT, Perplexity, Gemini, Google AI Overviews) answer user questions by drawing on clear, factual, well-sourced content. Your job is to plan how this business can become the kind of clear, citable source those assistants would draw from.

CRITICAL FRAMING — this is PLANNING and READINESS only. You have NOT checked any live AI engine. Never claim the business is currently mentioned, cited, ranked or shown by ChatGPT, Perplexity, Gemini or Google AI Overviews, and never invent citation positions or live results. Use only language like "likely gap", "readiness", "recommended prompt", "AI-answer opportunity", "content that could help AI understand or cite the business". Frame everything as opportunities, not measured facts.

Produce: (a) prompt SETS — the AI-search questions this business should be ready to be a good answer for, and (b) likely visibility GAPS — why it may not yet be a strong AI answer, and what to do.

Cover these categories: Discovery Prompts, Comparison Prompts, Problem / Solution Prompts, Local-Intent Prompts, Trust & Citation Readiness, Content Gaps for AI Answers, Authority Gaps for AI Answers.

Return exactly this JSON shape:
{"overallAiVisibilityScore":0,"promptCoverageScore":0,"answerReadinessScore":0,"localAiReadinessScore":0,"trustCitationScore":0,"contentGapScore":0,"authorityGapScore":0,"summary":"","topAiVisibilityActions":[""],"promptSets":[{"category":"Discovery Prompts|Comparison Prompts|Problem / Solution Prompts|Local-Intent Prompts|Trust & Citation Readiness|Content Gaps for AI Answers|Authority Gaps for AI Answers","prompt":"","language":"Polish|Swedish|English|Danish","intent":"Informational|Commercial|Transactional|Navigational","targetAudience":"","whyItMatters":"","readiness":"Low|Medium|High","recommendedSourcePageOrAsset":""}],"visibilityGaps":[{"title":"","category":"Discovery Prompts|Comparison Prompts|Problem / Solution Prompts|Local-Intent Prompts|Trust & Citation Readiness|Content Gaps for AI Answers|Authority Gaps for AI Answers","priority":"Low|Medium|High","explanation":"","likelyReason":"","recommendation":"","suggestedPrompt":"","suggestedOpportunityTitle":"","suggestedContentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","suggestedSearchIntent":"Informational|Commercial|Transactional|Navigational","suggestedCta":""}]}

Scores are 0–100 where HIGHER means BETTER current readiness (more likely to be a good AI answer). Be realistic for a small business.
promptSets: provide 10–14 realistic prompts a real person would type into an AI assistant, spread across the prompt-style categories (Discovery, Comparison, Problem/Solution, Local-Intent), using the business's real services, audience and location. "readiness" = how ready the business likely is to be cited for that prompt today. Use the primary language plus additional languages where relevant.
visibilityGaps: provide 8–12 likely gaps spread across the readiness/content/authority categories. Each "suggestedOpportunityTitle" must read like a real page/article that would make the business a better AI answer. Each "suggestedPrompt" is the AI-search question the gap is about.
topAiVisibilityActions: 3–5 short strings naming the highest-impact readiness moves.

THIS BUSINESS:
${brief}
${auditBlock}${competitorBlock}${authorityBlock}${oppBlock}${sharedRules}`,
        8000,
      );

      const root = isRecord(payload) ? payload : {};
      const promptSets = extractArray(root, [
        "promptSets",
        "prompt_sets",
        "prompts",
        "promptSet",
        "questions",
      ]).map((p) => normalizePromptSet(p, project));
      const visibilityGaps = extractArray(root, [
        "visibilityGaps",
        "visibility_gaps",
        "gaps",
        "items",
        "results",
      ]).map((g, i) => normalizeVisibilityGap(g, i));
      if (promptSets.length === 0 && visibilityGaps.length === 0) {
        throw new Error("AI returned no AI-visibility results.");
      }

      const promptCoverageScore = clampScore(
        pickNumber(root, [
          "promptCoverageScore",
          "prompt_coverage_score",
          "promptCoverage",
          "coverage",
        ]),
      );
      const answerReadinessScore = clampScore(
        pickNumber(root, [
          "answerReadinessScore",
          "answer_readiness_score",
          "answerReadiness",
          "readiness",
        ]),
      );
      const localAiReadinessScore = clampScore(
        pickNumber(root, [
          "localAiReadinessScore",
          "local_ai_readiness_score",
          "localAiReadiness",
          "local",
        ]),
      );
      const trustCitationScore = clampScore(
        pickNumber(root, [
          "trustCitationScore",
          "trust_citation_score",
          "trustCitation",
          "trust",
          "citation",
        ]),
      );
      const contentGapScore = clampScore(
        pickNumber(root, ["contentGapScore", "content_gap_score", "contentGap", "content"]),
      );
      const authorityGapScore = clampScore(
        pickNumber(root, ["authorityGapScore", "authority_gap_score", "authorityGap", "authority"]),
      );
      const overallAiVisibilityScore = clampScore(
        pickNumber(root, [
          "overallAiVisibilityScore",
          "overall_ai_visibility_score",
          "overall",
          "score",
        ]),
        Math.round(
          (promptCoverageScore +
            answerReadinessScore +
            localAiReadinessScore +
            trustCitationScore +
            contentGapScore +
            authorityGapScore) /
            6,
        ),
      );
      const summary = pickString(
        root,
        ["summary", "overview", "analysis", "assessment"],
        "AI visibility readiness analyzed — review the prompts and likely gaps below and turn the top ones into opportunities.",
      );
      const topAiVisibilityActions = normalizeStringArray(
        root.topAiVisibilityActions ??
          root.top_ai_visibility_actions ??
          root.topActions ??
          root.priorities ??
          root.quickWins,
        visibilityGaps.slice(0, 3).map((g) => g.title),
      ).slice(0, 5);

      console.info("[ai.functions] ai-visibility parsed", {
        prompts: promptSets.length,
        gaps: visibilityGaps.length,
      });

      return {
        overallAiVisibilityScore,
        promptCoverageScore,
        answerReadinessScore,
        localAiReadinessScore,
        trustCitationScore,
        contentGapScore,
        authorityGapScore,
        summary,
        topAiVisibilityActions,
        promptSets,
        visibilityGaps,
      };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Onboarding — safe homepage scan + light AI extraction
// ============================================================

export const scanWebsiteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().default("") }).parse(input))
  .handler(async ({ data }) => {
    // NOT metered. Onboarding website scan: metering it would block signup before the user has a plan.
    const site = await fetchSiteContext(data.url);
    if (!site.ok) {
      return {
        ok: false as const,
        title: "",
        metaDescription: "",
        businessName: "",
        businessType: "",
        description: "",
        primaryLanguage: "English",
        services: [] as { name: string; kind: "Service" | "Product"; description: string }[],
      };
    }

    // Best-effort AI extraction; if it fails we still return title/meta so the
    // wizard can pre-fill something and the user continues manually.
    try {
      const payload = await generateJsonText(
        `You are extracting a concise business profile from a website homepage for an onboarding form.

Return exactly this JSON shape:
{"businessName":"","businessType":"","description":"","primaryLanguage":"Polish|Swedish|English|Danish","services":[{"name":"","kind":"Service|Product","description":""}]}

Infer the business name, a short business type (e.g. "bakery", "massage studio"), a 1–2 sentence description, the primary language, and up to 6 real services/products the business offers. Leave fields empty (and services []) if not clearly implied. Do NOT invent offerings not present in the text.

WEBSITE CONTENT (from ${data.url}):
Title: ${site.title || "(none)"}
Meta description: ${site.metaDescription || "(none)"}
Visible homepage text (excerpt):
${site.text || "(no readable text)"}
${sharedRules}`,
        3000,
      );
      const root = isRecord(payload) ? payload : {};
      const services = extractArray(root, ["services", "products", "offerings", "items"])
        .slice(0, 6)
        .map((s) => {
          const it = isRecord(s) ? s : {};
          const name = pickString(it, ["name", "title", "service", "product"], "");
          const kindRaw = pickString(it, ["kind", "type"], "Service").toLowerCase();
          return {
            name,
            kind: (/product|shop|store|buy|goods/.test(kindRaw) ? "Product" : "Service") as
              "Service" | "Product",
            description: pickString(it, ["description", "detail", "summary"], ""),
          };
        })
        .filter((s) => s.name);

      return {
        ok: true as const,
        title: site.title,
        metaDescription: site.metaDescription,
        businessName: pickString(root, ["businessName", "business_name", "name"], ""),
        businessType: pickString(root, ["businessType", "business_type", "type", "category"], ""),
        description: pickString(
          root,
          ["description", "summary", "about"],
          site.metaDescription || "",
        ),
        primaryLanguage: normalizeLanguage(root.primaryLanguage ?? root.language),
        services,
      };
    } catch {
      return {
        ok: true as const,
        title: site.title,
        metaDescription: site.metaDescription,
        businessName: "",
        businessType: "",
        description: site.metaDescription || "",
        primaryLanguage: "English",
        services: [] as { name: string; kind: "Service" | "Product"; description: string }[],
      };
    }
  });

// ============================================================
// generateOpportunities
// ============================================================

/**
 * Core of opportunity generation, callable from the cron/auto-scheduler runner
 * (no request context — the caller supplies the authenticated userId). The
 * server fn below is a thin JWT-authenticated wrapper over this.
 */
export async function generateOpportunitiesCore(
  userId: string,
  data: { project: Project; services: ServiceItem[]; existingTitles: string[] },
) {
  {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId, bucket: "aiCredits" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);
    const existing = data.existingTitles.length
      ? `\nAvoid duplicating these existing titles:\n- ${data.existingTitles.join("\n- ")}`
      : "";

    try {
      console.info("[ai.functions] opportunities reached", {
        userIdPresent: Boolean(userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        serviceCount: services.length,
      });
      const payload = await generateJsonText(
        `You are an SEO and AI-visibility strategist for small businesses.

Generate 6 high-quality content opportunities for this business.
Return exactly this JSON shape:
{"opportunities":[{"title":"","language":"Polish|Swedish|English|Danish","contentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","searchIntent":"Informational|Commercial|Transactional|Navigational","targetAudience":"","businessValue":"","recommendedCta":"","priority":"Low|Medium|High"}]}

${brief}
${existing}

Mix content types (landing/service/blog/guide/location/comparison) and languages (use primary + additional). Each opportunity should be a specific, search-driven topic — not a vague theme. Each title should read like a real page or article a user could search for.
${sharedRules}`,
        3000,
      );

      const opportunities = extractArray(payload, [
        "opportunities",
        "ideas",
        "topics",
        "items",
        "results",
      ]).map((item, index) => normalizeOpportunityItem(item, project, index));
      if (opportunities.length === 0) throw new Error("AI returned no opportunities.");
      console.info("[ai.functions] opportunities parsed", { count: opportunities.length });
      return { opportunities };
    } catch (e) {
      throw mapGatewayError(e);
    }
  }
}

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
  .handler(async ({ data, context }) =>
    generateOpportunitiesCore(context.userId as string, {
      project: data.project as Project,
      services: data.services as ServiceItem[],
      existingTitles: data.existingTitles,
    }),
  );

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
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
    const project = data.project as Project;
    const opps = data.opportunities as Opportunity[];

    const oppLines = opps
      .slice(0, 12)
      .map(
        (o, i) =>
          `${i + 1}. [${o.priority}] ${o.title} (${o.language}, ${o.contentType}, ${o.searchIntent}) — CTA: ${o.recommendedCta}`,
      )
      .join("\n");

    try {
      console.info("[ai.functions] calendar reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        projectName: project.businessName || project.name,
        opportunityCount: opps.length,
      });
      const payload = await generateJsonText(
        `Build a realistic 1-month content calendar for "${project.businessName || project.name}" in ${project.primaryLanguage}.
Return exactly this JSON shape:
{"calendarItems":[{"opportunityIndex":1,"daysFromToday":4,"topicTitle":"","language":"Polish|Swedish|English|Danish","contentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","searchIntent":"Informational|Commercial|Transactional|Navigational","recommendedCta":""}]}

Pick the strongest opportunities below and schedule them with sensible cadence (every 3–5 days, no clustering on one date). Prefer high-priority items first.

Opportunities:
${oppLines}

For each scheduled item, return the 1-based opportunityIndex it derives from.
${sharedRules}`,
        3000,
      );

      const calendarItems = extractArray(payload, [
        "calendarItems",
        "calendar",
        "items",
        "schedule",
        "contentCalendar",
      ]).map((item, index) => normalizeCalendarItem(item, project, index));
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
    .preprocess((v) => (typeof v === "string" ? v.trim() : (v ?? "")), z.string())
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
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "contentGeneration" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const opp = data.opportunity as Opportunity;
    const brief = projectBrief(project, services);
    // Generate in the project's primary content language (covers Danish too),
    // falling back to the opportunity's language if none is set.
    const contentLang = contentLanguageLabel(project) || opp.language;

    const kindInstruction =
      data.kind === "landing"
        ? `Generate a LANDING / SERVICE page brief. Outline should follow: problem → approach → what you get → proof → pricing/timing → FAQ → single CTA. Markdown should be a draft of the page in ${contentLang}.`
        : `Generate a BLOG ARTICLE draft. Lead with a 2–3 sentence direct answer (AI-overview friendly), then context, key factors, what to do next, and FAQ. Markdown should be the article body in ${contentLang}.`;

    try {
      const payload = await generateJsonText(
        `${kindInstruction}

Return exactly this JSON shape:
{"metaTitle":"","metaDescription":"","h1":"","outline":[""],"faq":[{"q":"","a":""}],"cta":"","markdown":"","internalLinks":[""],"schemaSuggestions":[""],"editorNotes":"","hookProposals":[{"text":"","type":"question","purpose":""}]}

Topic: ${opp.title}
Search intent: ${opp.searchIntent}
Audience: ${opp.targetAudience}
Suggested CTA: ${opp.recommendedCta}
Language: ${contentLang}

Business context:
${brief}

Markdown rules:
- Use real headings (##, ###) and short paragraphs.
- No fake statistics or invented citations.
- No keyword stuffing.
${internalLinkRule(project)}
- schemaSuggestions: schema.org types only (e.g. "Service", "FAQPage").
- Do NOT open the markdown body with the hook — the hook is authored separately in hookProposals.

hookProposals: 2–3 alternative one-sentence opening hooks in ${contentLang}. Each has a "type" from: question, problem-to-solution, surprising-fact, contrarian, story, result, promise, and an optional short "purpose". Never invent statistics, testimonials, outcomes or guarantees in a hook.
${sharedRules}`,
        8000,
      );

      return normalizeContentAsset(payload, project, opp);
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Content Engine 2.0 — multi-type content generation from an opportunity
// ============================================================

const CONTENT_ASSET_TYPES = [
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

const ASSET_INSTRUCTIONS: Record<(typeof CONTENT_ASSET_TYPES)[number], string> = {
  brief:
    "Generate a CONTENT BRIEF for a writer. In `markdown`, include clearly-headed sections: Target audience, Search intent, Angle, Suggested H1, Outline (bulleted), Key points, FAQs to answer, Internal link ideas, CTA, and Notes for human review. Also fill: h1 (suggested H1), outline (outline headings), faq (FAQs to answer with a short suggested answer direction), cta, editorNotes.",
  article:
    "Generate a FULL ARTICLE. In `markdown`, write the complete article body in real markdown (##/###, short paragraphs): open with a 2–3 sentence direct answer (AI-overview friendly), then context, key factors, what to do next, an FAQ section, and a closing CTA section. Also fill: metaTitle (≤60 chars), metaDescription (≤160 chars), h1, outline (section headings), faq, cta, internalLinks (the relative paths of the internal links you actually wrote into the body — see the Internal links rule).",
  servicePage:
    "Generate a SERVICE PAGE section. In `markdown`, include: H1 and H2 suggestions, Service description, Who it is for, Benefits (bulleted), Process / what to expect, FAQ, CTA. Also fill: h1, outline (section headings), faq, cta.",
  landingPage:
    "Generate a LANDING PAGE draft. In `markdown`, include: Hero headline, Subheadline, Problem section, Solution section, Benefits (bulleted), Trust signals, FAQ, CTA. Also fill: h1 (hero headline), faq, cta.",
  faq: "Generate an FAQ SECTION with 6–10 concise, genuinely helpful FAQs. In `markdown`, render each as a `## question` followed by a short answer (schema-ready). Also fill: faq (the 6–10 q/a entries), h1, cta.",
  comparison:
    "Generate a COMPARISON PAGE section. In `markdown`, include: a comparison title, a framing paragraph, a markdown TABLE comparing the options across key points, a 'When to choose each option' section, a recommendation, and a CTA. Also fill: h1, cta.",
  gbpPost:
    "Generate a concise GOOGLE BUSINESS PROFILE post (offer/update/event style if relevant). In `markdown`, write the short post text (keep under ~1500 characters), a clear CTA line, and a few optional relevant hashtags. Keep it concise and local. Also fill: cta.",
  meta: "Generate META TITLE + META DESCRIPTION options. In `markdown`, list 3 title options and 3 meta-description options, then state the recommended pairing and one line on why it fits. Also fill: metaTitle (the recommended title, ≤60 chars), metaDescription (the recommended description, ≤160 chars).",
  socialPack:
    "Generate a SOCIAL POST PACK. In `markdown`, include clearly-headed sections: LinkedIn post, Facebook post, Instagram caption, a short CTA, and optional hashtags. Tailor tone per platform. Also fill: cta.",
};

/**
 * Core of content generation, callable from the cron/auto-scheduler runner (no
 * request context — the caller supplies the authenticated userId). Claims the
 * contentGeneration budget exactly like the interactive path. The server fn
 * below is a thin JWT-authenticated wrapper over this.
 */
export async function generateContentCore(
  userId: string,
  data: {
    project: Project;
    services: ServiceItem[];
    opportunity: Opportunity;
    assetType: (typeof CONTENT_ASSET_TYPES)[number];
    modelOverride?: string;
  },
) {
  {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId, bucket: "contentGeneration" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const opp = data.opportunity as Opportunity;
    const brief = projectBrief(project, services);
    const contentLang = contentLanguageLabel(project) || opp.language;
    const instruction = ASSET_INSTRUCTIONS[data.assetType] ?? ASSET_INSTRUCTIONS.article;
    const sourceLine = opp.source
      ? `Source: this opportunity came from ${opp.source === "audit" ? "a Site Audit finding" : opp.source === "competitor" ? "a Competitor Gap" : opp.source === "authority" ? "an Authority-building action" : opp.source === "aiVisibility" ? "an AI Visibility gap" : "manual planning"} — keep that intent in mind.`
      : "";

    try {
      const payload = await generateJsonText(
        `${instruction}

Return exactly this JSON shape. "markdown" is REQUIRED and must contain the full, formatted content for this asset type; fill the other fields that are relevant.
{"metaTitle":"","metaDescription":"","h1":"","outline":[""],"faq":[{"q":"","a":""}],"cta":"","markdown":"","internalLinks":[""],"schemaSuggestions":[""],"editorNotes":"","hookProposals":[{"text":"","type":"question","purpose":""}]}

Topic: ${opp.title}
Language: ${contentLang} (write ALL output in this language)
Search intent: ${opp.searchIntent}
Content type: ${opp.contentType}
Suggested CTA: ${opp.recommendedCta}
Audience: ${opp.targetAudience}
${sourceLine}

Business context:
${brief}

Markdown rules:
${internalLinkRule(project)}
- hookProposals: 2-3 alternative one-sentence opening hooks in ${contentLang} (types: question, problem-to-solution, surprising-fact, contrarian, story, result, promise). Never invent statistics, testimonials, outcomes or guarantees in a hook. Do NOT open the markdown body with the hook text.
${sharedRules}`,
        8000,
        data.modelOverride,
      );

      return normalizeContentAsset(payload, project, opp);
    } catch (e) {
      throw mapGatewayError(e);
    }
  }
}

export const generateContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        opportunity: z.any(),
        assetType: z.enum(CONTENT_ASSET_TYPES),
        modelOverride: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    generateContentCore(context.userId as string, {
      project: data.project as Project,
      services: data.services as ServiceItem[],
      opportunity: data.opportunity as Opportunity,
      assetType: data.assetType,
      ...(data.modelOverride ? { modelOverride: data.modelOverride } : {}),
    }),
  );

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
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
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
          metaDescription: pickString(
            item,
            ["metaDescription", "description", "seoDescription"],
            data.topic,
          ),
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
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
    try {
      const payload = await generateJsonText(
        `Write 4 realistic FAQ entries in ${data.language} that real customers of "${data.businessName}" would ask about "${data.topic}". Answers must be concrete, 2–4 sentences. No invented prices, no guarantees.

Return exactly this JSON shape:
{"faq":[{"q":"","a":""}]}
${sharedRules}`,
        1800,
      );
      const faq = normalizeFaq(
        isRecord(payload)
          ? (payload.faq ?? payload.faqs ?? payload.questions ?? payload.items)
          : payload,
      );
      return z
        .array(z.object({ q: cleanString(140), a: cleanString(400) }))
        .parse(faq)
        .slice(0, 5);
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
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
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

// ============================================================
// Content Quality Engine / Milo Score v1
// ============================================================

/** The production model id, exposed so the client can stamp it onto the score. */
export const QUALITY_MODEL = MODEL;

export const evaluateContentQualityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        title: z.string().default(""),
        markdown: z.string().default(""),
        assetType: z.string().default("article"),
        destinationType: z.string().default(""),
        metaTitle: z.string().default(""),
        metaDescription: z.string().default(""),
        contentLanguage: z.string().default("English"),
        explanationLanguage: z.string().default("English"),
        modelOverride: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "miloScore" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);

    try {
      const payload = await generateJsonText(
        `You are a careful content reviewer for a small-business website. Evaluate the DRAFT below and produce a practical PUBLISHING READINESS assessment — NOT an SEO ranking guarantee. Be conservative: do not inflate scores, and never imply guaranteed Google or AI rankings.

Score each of these 8 categories from 0–100 with a one-sentence explanation and up to 3 concrete suggestions:
- structure: clear title, logical H2/H3 sections, intro, conclusion/next step, scannable formatting.
- searchReadiness: clear topic, keyword/topic coverage, local/service intent where relevant, useful headings, meta title/description.
- aiAnswerReadiness: concise answer summary, FAQ coverage WRITTEN INTO THE ARTICLE BODY, direct answers to likely questions, entity clarity (who/what/where), avoids vague generic content.
- brandFit: matches project tone, reflects the business description, uses the services/products correctly, avoids forbidden/unsafe claims from brand notes.
- localRelevance: location/market relevance where applicable, local service/business context, correct country/language assumptions, local trust signals.
- conversion: a clear CTA and next step (booking/contact/product) WRITTEN INTO THE ARTICLE BODY, offer relevance, benefit clarity, not overly salesy.
- trustSafety: no unsupported guarantees, no risky medical/legal/financial claims, appropriate caveats, professional tone, no exaggerated AI/search ranking claims.
- internalLinks: internal links PRESENT IN THE ARTICLE BODY (markdown) to relevant services/products/pages; reward real, relevant in-body links; do not reward a mere suggestion of links or links that are not written into the body, and penalise forced/irrelevant links.

Grade ONLY what is present in the Title, Meta title, Meta description and article body below — these are the fields that actually publish. Do not assume any FAQ, CTA or link exists unless it is written into the body.

If the Business context includes a Brand Intelligence block, use it: lower trustSafety and brandFit when the draft uses any forbidden claim or breaks the avoid list, or is missing a required caveat; reward a correctly-used preferred CTA written into the body (conversion), real in-body internal links to the listed targets (internalLinks) and the market/language rules (localRelevance).

Also provide: topIssues (max 5 short bullets), quickWins (max 5 short bullets) and a summary (max 280 chars).
Write all explanations, suggestions, topIssues, quickWins and summary in ${data.explanationLanguage}.
The draft content is written in ${data.contentLanguage}.

Return EXACTLY this JSON shape (numbers are 0–100):
{"categories":{"structure":{"score":0,"explanation":"","suggestions":[""]},"searchReadiness":{"score":0,"explanation":"","suggestions":[""]},"aiAnswerReadiness":{"score":0,"explanation":"","suggestions":[""]},"brandFit":{"score":0,"explanation":"","suggestions":[""]},"localRelevance":{"score":0,"explanation":"","suggestions":[""]},"conversion":{"score":0,"explanation":"","suggestions":[""]},"trustSafety":{"score":0,"explanation":"","suggestions":[""]},"internalLinks":{"score":0,"explanation":"","suggestions":[""]}},"topIssues":[""],"quickWins":[""],"summary":""}

Asset type: ${data.assetType}${data.destinationType ? ` · destination: ${data.destinationType}` : ""}
Title: ${data.title}
Meta title: ${data.metaTitle}
Meta description: ${data.metaDescription}

Business context:
${brief}

DRAFT (markdown):
"""
${data.markdown.slice(0, 12000)}
"""
${sharedRules}`,
        4000,
        data.modelOverride,
      );
      // Normalize server-side so the return type is a concrete, serializable
      // QualityScore (defensive: clamps, recomputes overall, fills fallbacks).
      return normalizeQualityScore(payload, new Date().toISOString(), data.modelOverride || MODEL);
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

export const improveContentDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        title: z.string().default(""),
        markdown: z.string().default(""),
        assetType: z.string().default("article"),
        contentLanguage: z.string().default("English"),
        suggestions: z.array(z.string()).default([]),
        modelOverride: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "improveDraft" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);
    const suggestionList = data.suggestions
      .filter(Boolean)
      .slice(0, 12)
      .map((s) => `- ${s}`)
      .join("\n");

    try {
      const payload = await generateJsonText(
        `Improve the DRAFT below using the improvement suggestions. Keep the same topic, intent and language (${data.contentLanguage}). Keep the heading structure but improve clarity, structure, answer-readiness and a clear next step. Do NOT invent statistics, prices, guarantees or fake citations. Do NOT add exaggerated SEO/AI ranking claims. If the business context includes a Brand Intelligence block, follow it: improve tone to match the brand voice, remove any forbidden claims and avoid-list wording, add required caveats where appropriate, use the preferred CTA, prefer the listed internal link targets where relevant, and never invent proof points. Return ONLY the improved markdown body.

Improvement suggestions:
${suggestionList || "- Improve overall clarity, structure and a clear call to action."}

Return EXACTLY this JSON shape:
{"markdown":""}

Title: ${data.title}
Business context:
${brief}

Markdown rules:
${internalLinkRule(project)}

CURRENT DRAFT (markdown):
"""
${data.markdown.slice(0, 12000)}
"""
${sharedRules}`,
        8000,
        data.modelOverride,
      );
      const item = isRecord(payload) ? payload : {};
      const markdown = pickString(item, ["markdown", "content", "body", "draft"], data.markdown);
      return { markdown };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Authority Builder v2 / Safe Backlinks
// ============================================================

const AUTHORITY_TYPES = [
  "localDirectory",
  "industryDirectory",
  "reviewProfile",
  "citationNap",
  "partnerLink",
  "supplierLink",
  "association",
  "localPr",
  "guestContribution",
  "resourcePage",
  "community",
  "trustSignal",
  "other",
] as const;
const PRIORITY_LMH = ["high", "medium", "low"] as const;
const DIFFICULTY = ["easy", "medium", "hard"] as const;

function normalizeAuthorityOpportunity(value: unknown) {
  const it = isRecord(value) ? value : {};
  const lower = (v: unknown, fallback: string) => {
    const raw = asString(v)
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    return raw || fallback;
  };
  const typeRaw = lower(it.type ?? it.category, "other");
  const type = AUTHORITY_TYPES.find((t) => t.toLowerCase() === typeRaw) ?? "other";
  const prio = PRIORITY_LMH.find((p) => p === lower(it.priority, "medium")) ?? "medium";
  const value3 =
    PRIORITY_LMH.find((p) => p === lower(it.estimatedValue ?? it.value, "medium")) ?? "medium";
  const diff = DIFFICULTY.find((d) => d === lower(it.difficulty, "medium")) ?? "medium";
  return {
    type,
    title: pickString(it, ["title", "name"], "Authority opportunity").slice(0, 160),
    description: pickString(it, ["description", "explanation", "detail"], "").slice(0, 600),
    priority: prio,
    estimatedValue: value3,
    difficulty: diff,
    relevanceReason: pickString(it, ["relevanceReason", "relevance", "why"], "").slice(0, 400),
    nextStep: pickString(it, ["nextStep", "next_step", "action"], "").slice(0, 300),
    requirements: normalizeStringArray(it.requirements ?? it.requires, []).slice(0, 6),
    targetUrl: pickString(it, ["targetUrl", "target_url", "url"], "").slice(0, 400),
    suggestedPageToLink: pickString(
      it,
      ["suggestedPageToLink", "suggested_page_to_link", "pageToLink", "linkTo"],
      "",
    ).slice(0, 400),
    relatedServiceOrOffer: pickString(
      it,
      ["relatedServiceOrOffer", "relatedService", "offer"],
      "",
    ).slice(0, 200),
    anchorOrListingText: pickString(
      it,
      ["anchorOrListingText", "anchorText", "listingText"],
      "",
    ).slice(0, 200),
    outreachNote: pickString(it, ["outreachNote", "outreach_note", "note"], "").slice(0, 600),
    outreachTemplate: pickString(
      it,
      ["outreachTemplate", "outreach_template", "template", "message"],
      "",
    ).slice(0, 1200),
    safetyNotes: pickString(it, ["safetyNotes", "safety_notes", "safety"], "").slice(0, 400),
  };
}

export const generateAuthorityOpportunitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        existingTitles: z.array(z.string()).default([]),
        livePages: z.array(z.string()).default([]),
        explanationLanguage: z.string().default("English"),
        modelOverride: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "authority" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);
    const existingBlock = data.existingTitles.length
      ? `Existing authority opportunities (DO NOT duplicate these):\n- ${data.existingTitles.slice(0, 40).join("\n- ")}\n`
      : "";
    const liveBlock = data.livePages.length
      ? `Published live pages that could be linked to where genuinely relevant:\n- ${data.livePages.slice(0, 20).join("\n- ")}\n`
      : "";

    try {
      const payload = await generateJsonText(
        `You are a safe, ethical off-site authority and local-SEO strategist for a small business. Suggest TRUSTWORTHY authority-building opportunities — local directories, industry directories, review profiles, citation/NAP consistency, partner links, supplier listings, associations, local PR/story angles, guest contributions, resource pages, community pages and on-site trust signals.

STRICT SAFETY RULES:
- This is planning. Do NOT claim any listing, link or contact has been created.
- Do NOT invent live link URLs, specific email addresses, or that the business is certified/accredited/awarded unless the business context explicitly says so.
- Prefer local and genuinely relevant opportunities. If you are unsure of a specific website, describe a category-level opportunity instead of a fabricated URL.
- NEVER suggest buying backlinks, link exchanges/PBNs, blog-comment spam, fake reviews, paid review incentives that break platform rules, or adult/gambling/casino/crypto/spam targets.
- Do NOT promise rankings, traffic or revenue.
- Respect any Brand Intelligence block (forbidden claims, avoid list, tone, offers, CTAs).
Write all text fields in ${data.explanationLanguage}.

Generate 8–15 opportunities. Return EXACTLY this JSON shape:
{"opportunities":[{"type":"${AUTHORITY_TYPES.join("|")}","title":"","description":"","priority":"high|medium|low","estimatedValue":"high|medium|low","difficulty":"easy|medium|hard","relevanceReason":"","nextStep":"","requirements":[""],"targetUrl":"","suggestedPageToLink":"","relatedServiceOrOffer":"","anchorOrListingText":"","outreachNote":"","outreachTemplate":"","safetyNotes":""}]}

"outreachTemplate" must be a short, honest, human, specific message (no spam, no hype, no ranking claims). Leave "targetUrl" empty unless an obvious, generic, real platform applies (e.g. Google Business Profile). Use "suggestedPageToLink" only when a relevant service or live page exists.

THIS BUSINESS:
${brief}
${existingBlock}${liveBlock}${sharedRules}`,
        7000,
        data.modelOverride,
      );
      const root = isRecord(payload) ? payload : {};
      const opportunities = extractArray(root, [
        "opportunities",
        "authorityOpportunities",
        "items",
        "results",
        "actions",
      ]).map(normalizeAuthorityOpportunity);
      return { opportunities };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

/** UI-safe AI router status (no secrets) for the internal evaluation page. */
export const getAiRouterStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => getRouterStatus());

// ============================================================
// Backlinks v1 — DataForSEO link profile + link gap, AI-interpreted
// ============================================================

const BACKLINK_CATEGORIES = [
  "Link Gap Targets",
  "Content for Links",
  "Digital PR",
  "Partnerships & Sponsorships",
  "Directories & Profiles",
  "Link Hygiene",
] as const;

const BacklinkCategoryEnum = normalizedEnum(BACKLINK_CATEGORIES);

const BacklinkRecommendationOutputSchema = z.object({
  title: cleanString(120),
  category: BacklinkCategoryEnum,
  priority: PriorityEnum,
  effort: PriorityEnum,
  explanation: cleanString(400),
  recommendation: cleanString(400),
  targetDomainOrPlatform: cleanString(200),
  suggestedApproach: cleanString(300),
  suggestedOpportunityTitle: cleanString(120),
  suggestedContentType: ContentTypeEnum,
  suggestedSearchIntent: SearchIntentEnum,
  suggestedCta: cleanString(60),
});

function normalizeBacklinkCategory(value: unknown) {
  const raw = asString(value).toLowerCase();
  if (/gap|competitor.*(link|domain)|intersection|target domain/.test(raw))
    return "Link Gap Targets";
  if (/content|linkable asset|guide|resource|research|study|tool|data/.test(raw))
    return "Content for Links";
  if (/\bpr\b|press|media|news|journalist|story|expert comment/.test(raw)) return "Digital PR";
  if (/partner|sponsor|supplier|collab|association|community|event/.test(raw))
    return "Partnerships & Sponsorships";
  if (/director|profile|citation|listing|nap/.test(raw)) return "Directories & Profiles";
  if (/hygiene|broken|toxic|spam|disavow|lost|reclaim|redirect/.test(raw)) return "Link Hygiene";
  return normalizeValue(value, BACKLINK_CATEGORIES, "Link Gap Targets");
}

function normalizeBacklinkRecommendation(value: unknown, index: number) {
  const item = isRecord(value) ? value : {};
  const title = pickString(
    item,
    ["title", "name", "action", "heading"],
    `Link opportunity ${index + 1}`,
  );
  return BacklinkRecommendationOutputSchema.parse({
    title,
    category: normalizeBacklinkCategory(item.category ?? item.area ?? item.group ?? item.type),
    priority: normalizePriority(item.priority ?? item.impact ?? item.severity),
    effort: normalizePriority(item.effort ?? item.difficulty ?? item.work),
    explanation: pickString(
      item,
      ["explanation", "detail", "details", "why", "description", "rationale"],
      "Earning relevant links here can strengthen the domain's authority.",
    ),
    recommendation: pickString(
      item,
      ["recommendation", "action", "suggestion", "howTo", "how_to", "steps", "nextStep"],
      "Reach out with a genuinely useful, relevant reason to link.",
    ),
    targetDomainOrPlatform: pickString(
      item,
      [
        "targetDomainOrPlatform",
        "target_domain_or_platform",
        "targetDomain",
        "target",
        "domain",
        "platform",
        "site",
        "where",
      ],
      "Relevant website or platform",
    ),
    suggestedApproach: pickString(
      item,
      [
        "suggestedApproach",
        "suggested_approach",
        "approach",
        "method",
        "tactic",
        "outreachAngle",
        "angle",
      ],
      "Honest outreach with a relevant, useful asset.",
    ),
    suggestedOpportunityTitle: pickString(
      item,
      [
        "suggestedOpportunityTitle",
        "suggested_opportunity_title",
        "opportunityTitle",
        "suggestedTitle",
        "contentTitle",
        "pageTitle",
      ],
      title,
    ),
    suggestedContentType: normalizeContentType(
      item.suggestedContentType ??
        item.contentType ??
        item.content_type ??
        item.type ??
        item.format,
    ),
    suggestedSearchIntent: normalizeSearchIntent(
      item.suggestedSearchIntent ?? item.searchIntent ?? item.search_intent ?? item.intent,
    ),
    suggestedCta: pickString(
      item,
      ["suggestedCta", "suggested_cta", "cta", "callToAction", "call_to_action"],
      "Contact us",
    ),
  });
}

/** UI-safe, free provider health check. */
export const getBacklinksStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => getDataForSeoHealth());

export const generateBacklinksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        competitorUrls: z.array(z.string()).default([]),
        explanationLanguage: z.string().default("English"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    const brief = projectBrief(project, services);

    if (!isDataForSeoConfigured()) {
      throw new Error("Backlink data source is not configured yet.");
    }
    const ownDomain = extractDomain(project.websiteUrl);
    if (!ownDomain) {
      throw new Error(
        "Add your website URL in Project Setup before running the backlink analysis.",
      );
    }
    const competitorDomains = Array.from(
      new Set(data.competitorUrls.map(extractDomain).filter((d) => d && d !== ownDomain)),
    ).slice(0, 3);

    console.info("[ai.functions] backlinks reached", {
      userIdPresent: Boolean(context.userId),
      projectId: project.id,
      ownDomain,
      competitors: competitorDomains.length,
    });

    // 1. Raw index data. Own summary is required; everything else degrades.
    const own = await fetchBacklinkSummary(ownDomain);
    const [competitorResults, referringResult, gapResult] = await Promise.all([
      Promise.all(
        competitorDomains.map(async (domain) => {
          try {
            return await fetchBacklinkSummary(domain);
          } catch (e) {
            console.warn("[ai.functions] backlinks competitor summary failed", {
              domain,
              e: e instanceof Error ? e.message : e,
            });
            return {
              target: domain,
              fetchStatus: "failed" as const,
              rank: 0,
              backlinks: 0,
              referringDomains: 0,
              referringMainDomains: 0,
              brokenBacklinks: 0,
              spamScore: 0,
            };
          }
        }),
      ),
      fetchTopReferringDomains(ownDomain, 25).catch((e) => {
        console.warn(
          "[ai.functions] backlinks referring domains failed",
          e instanceof Error ? e.message : e,
        );
        return [];
      }),
      fetchBacklinkGap(ownDomain, competitorDomains, 30).catch((e) => {
        console.warn("[ai.functions] backlinks gap failed", e instanceof Error ? e.message : e);
        return [];
      }),
    ]);

    const fetchedCompetitors = competitorResults.filter((c) => c.fetchStatus === "fetched");
    const summaryLine = (s: typeof own) =>
      `${s.target}: domain rank ${s.rank}, backlinks ${s.backlinks}, referring domains ${s.referringDomains} (main: ${s.referringMainDomains}), broken backlinks ${s.brokenBacklinks}, spam score ${s.spamScore}${s.firstSeen ? `, first link seen ${s.firstSeen}` : ""}`;

    const competitorBlock = competitorResults.length
      ? `COMPETITOR LINK PROFILES (from the same index):\n${competitorResults
          .map((c) =>
            c.fetchStatus === "fetched"
              ? `- ${summaryLine(c)}`
              : `- ${c.target}: data could not be fetched — ignore.`,
          )
          .join("\n")}\n`
      : "COMPETITOR LINK PROFILES: none provided (no competitor URLs on the project).\n";

    const gapBlock = gapResult.length
      ? `LINK GAP — domains that link to competitors but NOT to ${ownDomain} (top ${Math.min(gapResult.length, 20)} by overlap/rank):\n${gapResult
          .slice(0, 20)
          .map((g) => `- ${g.domain} (rank ${g.rank}) links to: ${g.competitorsLinked.join(", ")}`)
          .join("\n")}\n`
      : "LINK GAP: no gap data available (no competitors fetched or no overlap found).\n";

    const referringBlock = referringResult.length
      ? `TOP REFERRING DOMAINS already linking to ${ownDomain}:\n${referringResult
          .slice(0, 15)
          .map((r) => `- ${r.domain} (rank ${r.rank}, links ${r.backlinks}, spam ${r.spamScore})`)
          .join("\n")}\n`
      : `TOP REFERRING DOMAINS: none found for ${ownDomain} in the index yet.\n`;

    try {
      const payload = await generateJsonText(
        `You are a white-hat link-building and digital-PR strategist for small and medium businesses.

You are given REAL backlink-index data (below). Interpret it and produce prioritized, safe, practical link-building recommendations. STRICT SAFETY RULES: never recommend link exchanges, PBNs, mass directory spam or buying links that pass ranking signals; any paid placement you suggest MUST be described as a sponsored publication that should be clearly labeled. Do NOT invent numbers beyond the data provided. Use the gap domains as inspiration for the TYPE of sites to target — only name a specific domain from the data, never fabricate other specific domains.

Return exactly this JSON shape:
{"overallLinkScore":0,"linkProfileScore":0,"linkGapScore":0,"linkQualityScore":0,"summary":"","topLinkActions":[""],"recommendations":[{"title":"","category":"Link Gap Targets|Content for Links|Digital PR|Partnerships & Sponsorships|Directories & Profiles|Link Hygiene","priority":"Low|Medium|High","effort":"Low|Medium|High","explanation":"","recommendation":"","targetDomainOrPlatform":"","suggestedApproach":"","suggestedOpportunityTitle":"","suggestedContentType":"Landing Page|Service Page|Blog Article|Guide|FAQ Page|Comparison|Location Page","suggestedSearchIntent":"Informational|Commercial|Transactional|Navigational","suggestedCta":""}]}

Scoring 0–100: linkProfileScore = how strong the business's own link profile is (higher = stronger). linkGapScore = how BIG the gap vs competitors is (higher = bigger gap, more to gain). linkQualityScore = quality/cleanliness of existing links (higher = cleaner, penalize high spam scores and broken backlinks). overallLinkScore = overall link-building position (higher = better). Be realistic given the numbers.
recommendations: 8–12 items spread across the categories. "Link Gap Targets" items should reference actual gap domains from the data when relevant. Each "suggestedOpportunityTitle" must read like a real linkable page/asset that could enter the content plan.
topLinkActions: 3–5 short strings naming the highest-impact link moves.
Write summary, explanations, recommendations and titles in ${data.explanationLanguage}.

BUSINESS LINK PROFILE (real index data for ${ownDomain}):
${summaryLine(own)}

${competitorBlock}
${gapBlock}
${referringBlock}
THIS BUSINESS:
${brief}
${sharedRules}`,
        8000,
      );

      const root = isRecord(payload) ? payload : {};
      const recommendations = extractArray(root, [
        "recommendations",
        "items",
        "actions",
        "opportunities",
        "results",
      ]).map((r, i) => normalizeBacklinkRecommendation(r, i));
      if (recommendations.length === 0) throw new Error("AI returned no backlink recommendations.");

      const linkProfileScore = clampScore(
        pickNumber(root, ["linkProfileScore", "link_profile_score", "profile"]),
      );
      const linkGapScore = clampScore(pickNumber(root, ["linkGapScore", "link_gap_score", "gap"]));
      const linkQualityScore = clampScore(
        pickNumber(root, ["linkQualityScore", "link_quality_score", "quality"]),
      );
      const overallLinkScore = clampScore(
        pickNumber(root, ["overallLinkScore", "overall_link_score", "overall", "score"]),
        Math.round((linkProfileScore + (100 - linkGapScore) + linkQualityScore) / 3),
      );
      const summary = pickString(
        root,
        ["summary", "overview", "analysis", "assessment"],
        "Backlink analysis complete — review the link gap and recommendations below.",
      );
      const topLinkActions = normalizeStringArray(
        root.topLinkActions ??
          root.top_link_actions ??
          root.topActions ??
          root.priorities ??
          root.quickWins,
        recommendations.slice(0, 3).map((r) => r.title),
      ).slice(0, 5);

      const failedCompetitors = competitorResults.length - fetchedCompetitors.length;
      const noteParts: string[] = [];
      if (!competitorDomains.length)
        noteParts.push(
          "No competitor URLs on the project — add them in Competitors to unlock the link gap.",
        );
      if (failedCompetitors > 0)
        noteParts.push(
          `${failedCompetitors} competitor domain(s) could not be fetched from the index.`,
        );

      console.info("[ai.functions] backlinks parsed", {
        recommendations: recommendations.length,
        gapDomains: gapResult.length,
        referring: referringResult.length,
      });

      return {
        note: noteParts.join(" "),
        ownDomain,
        own,
        competitors: competitorResults,
        topReferringDomains: referringResult,
        gapDomains: gapResult,
        overallLinkScore,
        linkProfileScore,
        linkGapScore,
        linkQualityScore,
        summary,
        topLinkActions,
        recommendations,
      };
    } catch (e) {
      throw mapGatewayError(e);
    }
  });

// ============================================================
// Free AI Visibility Readiness Audit (PUBLIC — no auth)
// ============================================================

export const runPublicAiVisibilityAuditFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ url: z.string(), language: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    // NOT metered. Public marketing audit: there is no signed-in user to meter. Rate limiting for this path is tracked separately.
    const normalizedUrl = normalizeAuditUrl(data.url);
    if (!normalizedUrl)
      throw new Error("Please enter a valid website URL (for example: yourbusiness.com).");

    const html = await fetchHtml(normalizedUrl, 8000);
    if (!html) {
      throw new Error(
        "Couldn’t read that website. Check the URL is public and reachable, then try again.",
      );
    }

    const { signals, text } = extractAuditSignals(html);
    const id = `audit_${Date.now().toString(36)}`;
    const auditedAt = new Date().toISOString();
    const lang = data.language?.trim() || "English";

    try {
      const payload = await generateJsonText(
        `You are a website readiness reviewer for small businesses. Using ONLY the extracted homepage content below, estimate how READY this website is for modern search and AI-assisted discovery. This is a readiness estimate based on public content — do NOT claim live rankings, do NOT claim visibility inside specific AI tools, and do NOT invent facts that are not present in the content.

Score each category 0–100 (higher = clearer/more ready), with one short explanation and up to 3 practical suggestions:
- entityClarity: does the page clearly say who the business is (name, what it is)?
- serviceClarity: does it clearly explain what it offers and for whom?
- localRelevance: is location/market and contact info clear (if relevant)?
- answerReadiness: does it directly answer likely customer questions (FAQ, concise answers)?
- trustSignals: visible reviews, credentials, guarantees, proof?
- searchStructure: title, meta description, clear headings?
- contentDepth: enough useful, specific content (not thin/generic)?
- technicalBasics: basic on-page essentials present (title, description, H1)?

Also return topIssues (max 5), quickWins (max 5), recommendedActions (max 5), a summary (max 320 chars) written for a small-business owner, and extractedSignals with detectedBusinessName, detectedServices (array), detectedLocations (array) inferred only from the content.
Write all explanations, suggestions, issues, wins, actions and summary in ${lang}.

Return EXACTLY this JSON shape (numbers 0–100):
{"categories":{"entityClarity":{"score":0,"explanation":"","suggestions":[""]},"serviceClarity":{"score":0,"explanation":"","suggestions":[""]},"localRelevance":{"score":0,"explanation":"","suggestions":[""]},"answerReadiness":{"score":0,"explanation":"","suggestions":[""]},"trustSignals":{"score":0,"explanation":"","suggestions":[""]},"searchStructure":{"score":0,"explanation":"","suggestions":[""]},"contentDepth":{"score":0,"explanation":"","suggestions":[""]},"technicalBasics":{"score":0,"explanation":"","suggestions":[""]}},"topIssues":[""],"quickWins":[""],"recommendedActions":[""],"summary":"","extractedSignals":{"detectedBusinessName":"","detectedServices":[""],"detectedLocations":[""]}}

EXTRACTED HOMEPAGE CONTENT (${normalizedUrl}):
Title: ${signals.title || "(none)"}
Meta description: ${signals.metaDescription || "(none)"}
H1: ${signals.h1 || "(none)"}
Headings: ${(signals.headings ?? []).join(" | ") || "(none)"}
FAQ signals: ${signals.hasFaqSignals ? "yes" : "no"} · Contact signals: ${signals.hasContactSignals ? "yes" : "no"} · Trust signals: ${signals.hasTrustSignals ? "yes" : "no"}
Visible text (truncated):
"""
${text}
"""
${sharedRules}`,
        4000,
      );
      return normalizePublicAudit(payload, {
        id,
        url: data.url,
        normalizedUrl,
        auditedAt,
        extractedSignals: signals,
      });
    } catch (e) {
      // AI failed — return a conservative deterministic estimate instead of crashing.
      console.warn(
        "[ai.functions] public audit AI failed, using deterministic fallback:",
        e instanceof Error ? e.message : e,
      );
      return deterministicFallbackAudit(signals, { id, url: data.url, normalizedUrl, auditedAt });
    }
  });

// ============================================================
// AI Outreach v1 — draft generation only (never sends email)
// ============================================================

const OutreachFollowUpSchema = z.object({
  delayDays: z.coerce.number().int().min(2).max(14),
  subject: cleanString(160),
  body: cleanString(2500),
});

const OutreachDraftOutputSchema = z.object({
  subject: cleanString(160),
  body: cleanString(3500),
  suggestedAsset: cleanString(240),
  rationale: cleanString(500),
  followUps: z.array(OutreachFollowUpSchema).max(2),
});

export const generateOutreachDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project: z.any(),
        services: z.array(z.any()).default([]),
        targetDomain: z.string().trim().min(3).max(253),
        contactName: z.string().trim().max(100).default(""),
        reason: z.string().trim().max(600).default(""),
        suggestedAsset: z.string().trim().max(240).default(""),
        language: z.string().trim().max(30).default("English"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Spend limit, claimed before any model call so a refusal costs nothing.
    await claimAiUsage({ userId: context.userId as string, bucket: "aiCredits" });
    const project = data.project as Project;
    const services = data.services as ServiceItem[];
    try {
      console.info("[ai.functions] outreach reached", {
        userIdPresent: Boolean(context.userId),
        projectId: project.id,
        targetDomain: data.targetDomain,
      });
      const payload = await generateJsonText(
        `You are an ethical digital-PR outreach writer. Draft one concise, genuinely personalized email and two optional follow-ups for a potential editorial relationship.

Return exactly this JSON shape:
{"subject":"","body":"","suggestedAsset":"","rationale":"","followUps":[{"delayDays":4,"subject":"","body":""},{"delayDays":8,"subject":"","body":""}]}

NON-NEGOTIABLE RULES:
- Write in ${data.language}.
- Never offer money, reciprocal links, gifts, ranking manipulation or a dofollow link.
- Never claim you visited or read the target website unless the supplied context explicitly says so.
- Do not invent a person, article, statistic, relationship, award or fact.
- Be transparent about the sender and why the proposed resource may help the target's audience.
- Ask whether the resource is useful; do not demand or pressure for a link.
- Keep the first email under 160 words and each follow-up under 90 words.
- Follow-ups must be polite, add no invented facts and make it easy to decline.
- Do not include tracking language, fake urgency or manipulative phrasing.

BUSINESS:
${projectBrief(project, services)}

TARGET DOMAIN: ${data.targetDomain}
CONTACT NAME: ${data.contactName || "Unknown — use a neutral greeting"}
REAL REASON FOR CONTACT: ${data.reason || "Potentially relevant editorial audience; confirm fit before proposing anything."}
RESOURCE/ASSET TO OFFER: ${data.suggestedAsset || "Suggest one realistic, useful resource based only on the business context."}

The email must be a draft for human review. It will not be sent automatically.`,
        4000,
      );
      const root = isRecord(payload) ? payload : {};
      const followUps = extractArray(root, ["followUps", "follow_ups", "followups"])
        .slice(0, 2)
        .map((item, index) => {
          const followUp = isRecord(item) ? item : {};
          return OutreachFollowUpSchema.parse({
            delayDays: followUp.delayDays ?? followUp.delay_days ?? (index === 0 ? 4 : 8),
            subject: pickString(
              followUp,
              ["subject", "title"],
              `Following up: ${data.targetDomain}`,
            ),
            body: pickString(
              followUp,
              ["body", "message", "email"],
              "Just checking whether this resource could be useful for your audience. No worries if it is not a fit.",
            ),
          });
        });
      return OutreachDraftOutputSchema.parse({
        subject: pickString(root, ["subject", "title"], `Resource idea for ${data.targetDomain}`),
        body: pickString(root, ["body", "message", "email"], ""),
        suggestedAsset: pickString(
          root,
          ["suggestedAsset", "suggested_asset", "asset", "resource"],
          data.suggestedAsset || "Useful expert resource",
        ),
        rationale: pickString(
          root,
          ["rationale", "reason", "why"],
          data.reason || "Potential editorial relevance",
        ),
        followUps,
      });
    } catch (e) {
      throw mapGatewayError(e);
    }
  });
