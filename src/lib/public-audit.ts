/**
 * Free AI Visibility Readiness Audit — pure score model, HTML signal extraction
 * and defensive normalization. No I/O, no secrets — safe to unit-test and to
 * import on the client (types) and server (logic).
 *
 * This estimates READINESS signals from public homepage content. It never
 * claims live rankings or AI-tool visibility.
 */

export type PublicAuditStatus = "strong" | "okay" | "needsWork";

export type PublicAuditCategoryKey =
  | "entityClarity"
  | "serviceClarity"
  | "localRelevance"
  | "answerReadiness"
  | "trustSignals"
  | "searchStructure"
  | "contentDepth"
  | "technicalBasics";

export interface PublicAuditCategoryScore {
  score: number;
  status: PublicAuditStatus;
  explanation: string;
  suggestions: string[];
}

export interface PublicAuditSignals {
  title?: string;
  metaDescription?: string;
  h1?: string;
  headings?: string[];
  detectedBusinessName?: string;
  detectedServices?: string[];
  detectedLocations?: string[];
  hasFaqSignals?: boolean;
  hasContactSignals?: boolean;
  hasTrustSignals?: boolean;
}

export interface PublicAiVisibilityAudit {
  id: string;
  url: string;
  normalizedUrl: string;
  auditedAt: string;
  overall: number;
  status: PublicAuditStatus;
  categories: Record<PublicAuditCategoryKey, PublicAuditCategoryScore>;
  topIssues: string[];
  quickWins: string[];
  recommendedActions: string[];
  summary: string;
  disclaimer: string;
  extractedSignals?: PublicAuditSignals;
}

export const PUBLIC_AUDIT_CATEGORY_KEYS: PublicAuditCategoryKey[] = [
  "entityClarity",
  "serviceClarity",
  "localRelevance",
  "answerReadiness",
  "trustSignals",
  "searchStructure",
  "contentDepth",
  "technicalBasics",
];

/** Weights sum to 1.0 (16+16+12+14+14+12+10+6 = 100). */
export const PUBLIC_AUDIT_WEIGHTS: Record<PublicAuditCategoryKey, number> = {
  entityClarity: 0.16,
  serviceClarity: 0.16,
  localRelevance: 0.12,
  answerReadiness: 0.14,
  trustSignals: 0.14,
  searchStructure: 0.12,
  contentDepth: 0.1,
  technicalBasics: 0.06,
};

export const PUBLIC_AUDIT_DISCLAIMER =
  "This audit estimates readiness signals based on your public website content. It does not check live rankings inside Google, ChatGPT, Gemini, Perplexity or other AI tools, and it does not guarantee traffic, rankings or citations.";

const clamp = (n: unknown): number => {
  const v = typeof n === "number" ? n : typeof n === "string" ? parseFloat(n) : NaN;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
};

export function publicAuditStatus(score: number): PublicAuditStatus {
  if (score >= 85) return "strong";
  if (score >= 65) return "okay";
  return "needsWork";
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asArr(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim())).filter(Boolean).slice(0, max);
}

const FALLBACK_CAT: PublicAuditCategoryScore = {
  score: 50,
  status: "okay",
  explanation: "Not enough information to evaluate this fully.",
  suggestions: [],
};

function normalizeCategory(raw: unknown): PublicAuditCategoryScore {
  if (!raw || typeof raw !== "object") return { ...FALLBACK_CAT };
  const r = raw as Record<string, unknown>;
  const score = clamp(r.score);
  return {
    score,
    status: publicAuditStatus(score),
    explanation: asString(r.explanation).slice(0, 400) || FALLBACK_CAT.explanation,
    suggestions: asArr(r.suggestions, 3),
  };
}

/** Normalize raw AI output into a complete audit. Overall is recomputed. */
export function normalizePublicAudit(
  raw: unknown,
  ctx: { id: string; url: string; normalizedUrl: string; auditedAt: string; extractedSignals?: PublicAuditSignals },
): PublicAiVisibilityAudit {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawCats = (r.categories && typeof r.categories === "object" ? r.categories : {}) as Record<string, unknown>;
  const categories = {} as Record<PublicAuditCategoryKey, PublicAuditCategoryScore>;
  for (const key of PUBLIC_AUDIT_CATEGORY_KEYS) categories[key] = normalizeCategory(rawCats[key]);

  const overall = clamp(
    PUBLIC_AUDIT_CATEGORY_KEYS.reduce((sum, k) => sum + categories[k].score * PUBLIC_AUDIT_WEIGHTS[k], 0),
  );

  // Merge AI-detected entities into the deterministic signals.
  const aiSig = (r.extractedSignals && typeof r.extractedSignals === "object" ? r.extractedSignals : {}) as Record<string, unknown>;
  const extractedSignals: PublicAuditSignals = {
    ...ctx.extractedSignals,
    detectedBusinessName: asString(aiSig.detectedBusinessName) || ctx.extractedSignals?.detectedBusinessName,
    detectedServices: asArr(aiSig.detectedServices, 8).length ? asArr(aiSig.detectedServices, 8) : ctx.extractedSignals?.detectedServices,
    detectedLocations: asArr(aiSig.detectedLocations, 8).length ? asArr(aiSig.detectedLocations, 8) : ctx.extractedSignals?.detectedLocations,
  };

  return {
    id: ctx.id,
    url: ctx.url,
    normalizedUrl: ctx.normalizedUrl,
    auditedAt: ctx.auditedAt,
    overall,
    status: publicAuditStatus(overall),
    categories,
    topIssues: asArr(r.topIssues, 5),
    quickWins: asArr(r.quickWins, 5),
    recommendedActions: asArr(r.recommendedActions ?? r.recommended_actions ?? r.nextActions, 5),
    summary: asString(r.summary).slice(0, 320),
    disclaimer: PUBLIC_AUDIT_DISCLAIMER,
    extractedSignals,
  };
}

// ---- HTML signal extraction (deterministic) ----

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAuditUrl(rawUrl: string): string {
  let url = (rawUrl || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, ""));
  } catch {
    return "";
  }
}

/** Extract title/meta/h1/headings + approximate boolean signals from homepage HTML. */
export function extractAuditSignals(html: string): { signals: PublicAuditSignals; text: string } {
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200);
  const metaDescription = (
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ??
    ""
  ).trim().slice(0, 320);
  const h1 = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").slice(0, 200);

  const headings: string[] = [];
  const hRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m: RegExpExecArray | null;
  while ((m = hRe.exec(cleaned)) && headings.length < 14) {
    const h = stripTags(m[1]).slice(0, 120);
    if (h) headings.push(h);
  }

  const text = stripTags(cleaned).slice(0, 3500);
  const hay = `${headings.join(" ")} ${text}`.toLowerCase();

  const hasFaqSignals = /\bfaq\b|frequently asked|vanliga frågor|ofte stillede|często zadawane/.test(hay) || headings.some((h) => h.trim().endsWith("?"));
  const hasContactSignals = /contact|kontakt|book|boka|appointment|email|e-mail|phone|telefon|call us|address|adress/.test(hay);
  const hasTrustSignals = /review|testimonial|rated|rating|certified|accredit|award|years of experience|trusted|guarantee|recension|omdöme|anmeldelse|opinie|certyfik/.test(hay);

  return {
    signals: { title, metaDescription, h1, headings, hasFaqSignals, hasContactSignals, hasTrustSignals },
    text,
  };
}

/** Conservative deterministic audit from signals — used when the AI call fails. */
export function deterministicFallbackAudit(
  signals: PublicAuditSignals,
  ctx: { id: string; url: string; normalizedUrl: string; auditedAt: string },
): PublicAiVisibilityAudit {
  const has = (b?: boolean) => (b ? 1 : 0);
  const headingCount = signals.headings?.length ?? 0;
  const base = (...parts: number[]) => clamp(parts.reduce((a, b) => a + b, 0));

  const cat = (score: number, explanation: string): PublicAuditCategoryScore => ({
    score: clamp(score),
    status: publicAuditStatus(clamp(score)),
    explanation,
    suggestions: [],
  });

  const categories: Record<PublicAuditCategoryKey, PublicAuditCategoryScore> = {
    entityClarity: cat(base(signals.title ? 30 : 0, signals.h1 ? 20 : 0, signals.metaDescription ? 15 : 0), "Based on whether your page clearly names the business in the title, H1 and description."),
    serviceClarity: cat(base(headingCount * 6, signals.detectedServices?.length ? 25 : 0), "Based on whether your homepage clearly lists what you offer."),
    localRelevance: cat(base(signals.detectedLocations?.length ? 50 : 20, signals.hasContactSignals ? 15 : 0), "Based on visible location and contact details."),
    answerReadiness: cat(base(signals.hasFaqSignals ? 45 : 15, headingCount * 4), "Based on FAQ-style headings and direct answers."),
    trustSignals: cat(base(signals.hasTrustSignals ? 50 : 15), "Based on visible reviews, credentials or guarantees."),
    searchStructure: cat(base(signals.title ? 25 : 0, signals.metaDescription ? 25 : 0, signals.h1 ? 20 : 0), "Based on title, meta description and heading structure."),
    contentDepth: cat(base(Math.min(60, headingCount * 8)), "Based on the amount of structured content on the homepage."),
    technicalBasics: cat(base(signals.title ? 35 : 0, signals.metaDescription ? 35 : 0), "Based on basic on-page elements being present."),
  };
  const overall = clamp(PUBLIC_AUDIT_CATEGORY_KEYS.reduce((s, k) => s + categories[k].score * PUBLIC_AUDIT_WEIGHTS[k], 0));

  return {
    ...ctx,
    overall,
    status: publicAuditStatus(overall),
    categories,
    topIssues: [
      !signals.metaDescription ? "No meta description found." : "",
      !signals.h1 ? "No clear H1 heading found." : "",
      !signals.hasFaqSignals ? "No FAQ-style content detected." : "",
      !signals.hasTrustSignals ? "No visible trust signals detected." : "",
    ].filter(Boolean).slice(0, 5),
    quickWins: [
      "Add a clear H1 that names your business and main service.",
      "Write a concise meta description (under 160 characters).",
      "Add an FAQ section answering common customer questions.",
    ].slice(0, 5),
    recommendedActions: [
      "Clarify who you are, what you offer and where you operate.",
      "Add trust signals such as reviews, credentials or guarantees.",
      "Create focused pages and FAQs that answer real customer questions.",
    ].slice(0, 5),
    summary: "We read your homepage but couldn’t complete the full AI analysis, so this is an approximate readiness estimate based on the page structure.",
    disclaimer: PUBLIC_AUDIT_DISCLAIMER,
    extractedSignals: signals,
  };
}
