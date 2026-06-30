/**
 * Content Quality Engine / Milo Score v1 — score model, weights, status
 * derivation and defensive normalization.
 *
 * Milo Score is a practical PUBLISHING READINESS score, not an SEO ranking
 * guarantee. The evaluator (ai.functions.ts) produces raw JSON; this module is
 * the single source of truth for weights, clamping and derived fields, so the
 * client and server agree on how a score is shaped.
 */
import type {
  QualityScore,
  QualityCategoryScore,
  QualityCategoryKey,
  QualityStatus,
  PublishingRecommendation,
} from "./types";

export const QUALITY_CATEGORY_KEYS: QualityCategoryKey[] = [
  "structure",
  "searchReadiness",
  "aiAnswerReadiness",
  "brandFit",
  "localRelevance",
  "conversion",
  "trustSafety",
  "internalLinks",
];

/** i18n label key per category (UI looks up t(`quality.cat.${key}`)). */
export const QUALITY_CATEGORY_ORDER = QUALITY_CATEGORY_KEYS;

/** Weights sum to 1.0 (12+16+16+14+10+12+12+8 = 100). */
export const QUALITY_WEIGHTS: Record<QualityCategoryKey, number> = {
  structure: 0.12,
  searchReadiness: 0.16,
  aiAnswerReadiness: 0.16,
  brandFit: 0.14,
  localRelevance: 0.1,
  conversion: 0.12,
  trustSafety: 0.12,
  internalLinks: 0.08,
};

const clamp = (n: unknown): number => {
  const v = typeof n === "number" ? n : typeof n === "string" ? parseFloat(n) : NaN;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
};

export function statusFromScore(score: number): QualityStatus {
  if (score >= 85) return "strong";
  if (score >= 65) return "okay";
  return "needsWork";
}

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
    .filter(Boolean)
    .slice(0, max);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

const FALLBACK_CATEGORY: QualityCategoryScore = {
  score: 50,
  status: "okay",
  explanation: "Not enough information to evaluate this fully.",
  suggestions: [],
};

function normalizeCategory(raw: unknown): QualityCategoryScore {
  if (!raw || typeof raw !== "object") return { ...FALLBACK_CATEGORY };
  const r = raw as Record<string, unknown>;
  const score = clamp(r.score);
  return {
    score,
    status: statusFromScore(score),
    explanation: asString(r.explanation).slice(0, 400) || FALLBACK_CATEGORY.explanation,
    suggestions: asStringArray(r.suggestions, 3),
  };
}

function deriveRecommendation(overall: number, trustScore: number): PublishingRecommendation {
  // A critical trust issue (low trust&safety) blocks "ready" even at a high overall.
  const criticalTrustIssue = trustScore < 50;
  if (overall >= 85 && !criticalTrustIssue) return "ready";
  if (overall >= 65) return "reviewFirst";
  return "notReady";
}

/**
 * Defensively normalize raw evaluator output into a complete, valid QualityScore.
 * Missing categories fall back; the overall is recomputed from the weighted
 * average of category scores so it can never disagree with the breakdown.
 */
export function normalizeQualityScore(raw: unknown, evaluatedAt: string, model?: string): QualityScore {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawCats = (r.categories && typeof r.categories === "object" ? r.categories : {}) as Record<string, unknown>;

  const categories = {} as Record<QualityCategoryKey, QualityCategoryScore>;
  for (const key of QUALITY_CATEGORY_KEYS) {
    categories[key] = normalizeCategory(rawCats[key]);
  }

  // Overall is always recomputed from weighted categories (ignores any AI-provided overall).
  const overall = clamp(
    QUALITY_CATEGORY_KEYS.reduce((sum, key) => sum + categories[key].score * QUALITY_WEIGHTS[key], 0),
  );
  const status = statusFromScore(overall);
  const publishingRecommendation = deriveRecommendation(overall, categories.trustSafety.score);

  return {
    overall,
    status,
    evaluatedAt,
    model,
    categories,
    topIssues: asStringArray(r.topIssues, 5),
    quickWins: asStringArray(r.quickWins, 5),
    publishingRecommendation,
    summary: asString(r.summary).slice(0, 280),
  };
}

/** Strip markdown to a rough word count, used to short-circuit empty/short drafts. */
export function draftWordCount(markdown: string): number {
  return markdown
    .replace(/[#>*_`~\-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Minimum words before a draft is worth a real evaluation. */
export const MIN_EVALUABLE_WORDS = 40;

/** A conservative low score for empty/too-short drafts (no AI call needed). */
export function tooShortScore(evaluatedAt: string): QualityScore {
  const cat: QualityCategoryScore = {
    score: 10,
    status: "needsWork",
    explanation: "The draft is empty or too short to evaluate.",
    suggestions: ["Add more complete content before evaluating."],
  };
  const categories = {} as Record<QualityCategoryKey, QualityCategoryScore>;
  for (const key of QUALITY_CATEGORY_KEYS) categories[key] = { ...cat };
  return {
    overall: 10,
    status: "needsWork",
    evaluatedAt,
    categories,
    topIssues: ["The draft is empty or too short to evaluate."],
    quickWins: ["Write a full draft, then evaluate again."],
    publishingRecommendation: "notReady",
    summary: "This draft is too short to evaluate. Add complete content and evaluate again.",
  };
}
