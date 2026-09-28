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

/**
 * The exact fields the evaluator receives — the CANONICAL evaluated asset. These
 * all publish (title, markdown body, and metaDescription reach every target;
 * metaTitle reaches the custom endpoint and is a legitimate SEO field). The
 * evaluator must NOT be given side-fields that do not publish (`faq[]`, `cta`,
 * `internalLinks[]`) — grading those would award points for unpublished
 * information (P0.2). Those components are graded from the article BODY instead.
 */
export const CANONICAL_EVALUATED_FIELDS = [
  "title",
  "markdown",
  "metaTitle",
  "metaDescription",
] as const;

/**
 * The Milo Score component matrix: every scored category, its weight, the input
 * the evaluator reads to grade it, and confirmation that the input is part of the
 * canonical (published) evaluated asset. `gradesPublishedContent` is `true` for
 * every row by construction: no component may award points for unavailable or
 * unpublished information (P0.2). Asserted in quality-matrix.test.ts.
 */
export interface MiloScoreComponent {
  key: QualityCategoryKey;
  weight: number;
  /** What the evaluator actually reads — always part of the published asset. */
  input: string;
  gradesPublishedContent: true;
}

export const MILO_SCORE_MATRIX: MiloScoreComponent[] = [
  {
    key: "searchReadiness",
    weight: QUALITY_WEIGHTS.searchReadiness,
    input: "title + article body + metaTitle + metaDescription",
    gradesPublishedContent: true,
  },
  {
    key: "aiAnswerReadiness",
    weight: QUALITY_WEIGHTS.aiAnswerReadiness,
    input: "article body — direct answer + FAQ as written in the body",
    gradesPublishedContent: true,
  },
  {
    key: "brandFit",
    weight: QUALITY_WEIGHTS.brandFit,
    input: "article body + project brand profile",
    gradesPublishedContent: true,
  },
  {
    key: "structure",
    weight: QUALITY_WEIGHTS.structure,
    input: "article body headings/formatting + title",
    gradesPublishedContent: true,
  },
  {
    key: "conversion",
    weight: QUALITY_WEIGHTS.conversion,
    input: "article body — CTA/next step as written in the body",
    gradesPublishedContent: true,
  },
  {
    key: "trustSafety",
    weight: QUALITY_WEIGHTS.trustSafety,
    input: "article body claims + tone",
    gradesPublishedContent: true,
  },
  {
    key: "localRelevance",
    weight: QUALITY_WEIGHTS.localRelevance,
    input: "article body + project location/market",
    gradesPublishedContent: true,
  },
  {
    key: "internalLinks",
    weight: QUALITY_WEIGHTS.internalLinks,
    input: "internal links present in the article body (markdown)",
    gradesPublishedContent: true,
  },
];

/**
 * Round an INTERNALLY computed weighted total (already a finite number in 0–100 up to
 * floating-point residue). Never used on raw evaluator input — see parseCategoryScore.
 */
const roundInternalScore = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

/**
 * Validate one RAW category score from the evaluator. Accepted: a finite number in
 * 0–100, or (compatibility) a trimmed plain decimal numeric string wholly matching a
 * value in 0–100 ("85", "72.5"). Rejected — returns null, never a guessed number:
 * percent/suffix text ("85%"), blanks, booleans, objects/arrays, non-finite and
 * out-of-range values (250, -1). Rounding happens only after validation.
 */
export function parseCategoryScore(raw: unknown): number | null {
  let v: number;
  if (typeof raw === "number") v = raw;
  else if (typeof raw === "string") {
    const s = raw.trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    v = Number(s);
  } else return null;
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return Math.round(v);
}

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

/**
 * Conservative-evidence rule (scenario 4, 28 Sep 2026): a category the evaluator did not
 * assess with a valid score earns NO positive credit. It is stored as 0 / needsWork with
 * an explanation that says "insufficient evidence", so the zero is never read as a
 * measured negative fact. Bounded original caveats/suggestions are kept as context,
 * never as a verified assessment.
 */
export const UNASSESSED_EXPLANATION =
  "Not assessed: the evaluator returned no valid score for this category (insufficient evidence, not a measured problem).";
/** Separator between the system fallback and a bounded model-authored note (display helper splits on it). */
export const EVALUATOR_NOTE_SEPARATOR = " Evaluator note: ";
/** System fallback when a valid score arrived without any explanation text. */
export const NO_EXPLANATION_RETURNED = "No explanation was returned for this category.";

/**
 * Result of one quality evaluation at the server boundary. `outcome: "model"` is a normalized
 * model result; `outcome: "skipped"` is a deterministic score returned WITHOUT any usage claim
 * or provider call (currently only the fixed too-short score). Callers persist `score` only;
 * the outcome is provenance for the caller and is never stored on the asset.
 */
export type QualityEvaluationResult =
  | { outcome: "model"; score: QualityScore }
  | { outcome: "skipped"; reason: "tooShort"; score: QualityScore };

/** Trust & safety below this is a critical issue: blocks "ready" and caps the headline. */
export const CRITICAL_TRUST_THRESHOLD = 50;

function normalizeCategory(raw: unknown): { category: QualityCategoryScore; assessed: boolean } {
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const score = r ? parseCategoryScore(r.score) : null;
  const explanation = r ? asString(r.explanation).slice(0, 400) : "";
  const suggestions = r ? asStringArray(r.suggestions, 3) : [];
  if (score === null) {
    return {
      assessed: false,
      category: {
        score: 0,
        status: "needsWork",
        explanation: explanation
          ? `${UNASSESSED_EXPLANATION}${EVALUATOR_NOTE_SEPARATOR}${explanation}`.slice(0, 400)
          : UNASSESSED_EXPLANATION,
        suggestions,
      },
    };
  }
  return {
    assessed: true,
    category: {
      score,
      status: statusFromScore(score),
      explanation: explanation || NO_EXPLANATION_RETURNED,
      suggestions,
    },
  };
}

function deriveRecommendation(
  overall: number,
  trust: { score: number; assessed: boolean },
  anyUnassessed: boolean,
): PublishingRecommendation {
  // "ready" requires every category assessed AND no critical trust issue. Advisory only:
  // this is not a publication block and never a claim of verified safety.
  const criticalTrustIssue = trust.assessed && trust.score < CRITICAL_TRUST_THRESHOLD;
  if (overall >= 85 && !criticalTrustIssue && !anyUnassessed) return "ready";
  if (overall >= 65) return "reviewFirst";
  return "notReady";
}

/** Headline status: the weighted number keeps its meaning, but "strong" is truthful
 * only when every category was assessed and trust & safety is not critical. */
function deriveHeadlineStatus(
  overall: number,
  trust: { score: number; assessed: boolean },
  anyUnassessed: boolean,
): QualityStatus {
  const status = statusFromScore(overall);
  if (status !== "strong") return status;
  const criticalTrustIssue = trust.assessed && trust.score < CRITICAL_TRUST_THRESHOLD;
  return anyUnassessed || criticalTrustIssue ? "okay" : "strong";
}

/**
 * Defensively normalize raw evaluator output into a complete, valid QualityScore.
 * Missing or invalid categories are stored as unassessed (0, needsWork, "insufficient
 * evidence"); the overall is recomputed from the weighted average of category scores so
 * it can never disagree with the breakdown; any unassessed category or a critical trust
 * & safety score prevents "ready" and caps a "strong" headline at "okay". The model's own
 * overall/status/recommendation fields are ignored. Applied at evaluation time only —
 * stored scores are not re-normalized when read.
 */
export function normalizeQualityScore(
  raw: unknown,
  evaluatedAt: string,
  model?: string,
): QualityScore {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawCats = (r.categories && typeof r.categories === "object" ? r.categories : {}) as Record<
    string,
    unknown
  >;

  const categories = {} as Record<QualityCategoryKey, QualityCategoryScore>;
  let anyUnassessed = false;
  let trustAssessed = false;
  for (const key of QUALITY_CATEGORY_KEYS) {
    const { category, assessed } = normalizeCategory(rawCats[key]);
    categories[key] = category;
    if (!assessed) anyUnassessed = true;
    if (key === "trustSafety") trustAssessed = assessed;
  }

  // Overall is always recomputed from weighted categories (ignores any AI-provided overall).
  // Unassessed categories score 0, so incomplete evidence can never add credit.
  const overall = roundInternalScore(
    QUALITY_CATEGORY_KEYS.reduce(
      (sum, key) => sum + categories[key].score * QUALITY_WEIGHTS[key],
      0,
    ),
  );
  const trust = { score: categories.trustSafety.score, assessed: trustAssessed };
  const status = deriveHeadlineStatus(overall, trust, anyUnassessed);
  const publishingRecommendation = deriveRecommendation(overall, trust, anyUnassessed);

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
    .replace(/[#>*_`~-]+/g, " ")
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
