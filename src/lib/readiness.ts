/**
 * Readiness & safety scores — Article Studio 2.0 / P1.1 I.
 *
 * A SIBLING of the Milo Score (which stays an 8-category AI judgement and a SOFT
 * publish signal). These dimensions are computed DETERMINISTICALLY over the ONE
 * canonical assembled asset (so they never award points for unpublished content)
 * and, for duplication/cannibalisation, over the project's actual corpus.
 *
 * Each dimension declares its METHOD (deterministic / heuristic / ai-judgement /
 * measured) so the UI never presents a heuristic as measured truth. Duplication
 * and cannibalisation EXPOSE the conflicting assets + a confidence and an explicit
 * limitation — lexical overlap is a prompt to review, never proof.
 *
 * None of these hard-block scheduling. Only a deterministic SAFETY failure
 * (surfaced to the J checklist) blocks publishing; a low soft score does not.
 */
import type { ContentAsset, Project, ReadinessLevel, ReadinessScore } from "./types";
import { assembleContentAsset } from "./content-assembler";
import { citableSources } from "./sources";

export type ScoreMethod = "deterministic" | "heuristic" | "ai-judgement" | "measured";

export interface Conflict {
  assetId: string;
  title: string;
  /** Lexical similarity 0–1. */
  similarity: number;
}

export interface ReadinessAssessment {
  seoReadiness: { score: number; method: ScoreMethod; issues: string[] };
  aiReadability: { score: number; method: ScoreMethod; issues: string[] };
  ymyl: { level: ReadinessLevel; method: ScoreMethod; signals: string[]; supported: boolean };
  duplication: {
    level: ReadinessLevel;
    method: ScoreMethod;
    conflicts: Conflict[];
    confidence: number;
    limitation: string;
  };
  cannibalisation: {
    level: ReadinessLevel;
    method: ScoreMethod;
    conflicts: Conflict[];
    confidence: number;
    limitation: string;
  };
}

const LEXICAL_LIMITATION =
  "Lexical (trigram) overlap only — not semantic and not proof. A high value flags assets to review, it does not confirm duplication.";
const CANNIBAL_LIMITATION =
  "Based on title/slug overlap, not query data. Flags assets that MIGHT target the same query — confirm intent before treating as cannibalisation.";

/**
 * YMYL claim signals — health/medical, financial, legal. A deterministic HEURISTIC
 * net, not an exhaustive classifier: it errs toward flagging (a false positive only
 * asks for a source/credentialed author, which good content has anyway). The real
 * YMYL safeguard is the required human review the checklist enforces.
 */
const YMYL_PATTERNS: { key: string; re: RegExp }[] = [
  {
    key: "medical",
    re: /\b(cure[sd]?|cured|treat(s|ed|ment|ments|ing)?|therap(y|ies|eutic)|diagnos\w*|symptom\w*|dosage|doses?|prescription|prescrib\w*|medication|medicine|medical|drug|supplement|vitamin|side.?effects?|clinical\w*|heal(s|ed|ing)?|disease|illness|cancer|diabet\w*|blood.?pressure|cholesterol|weight.?loss|pain.?relief|inflammation|anti.?inflammatory|immun\w*|detox\w*|mental.?health|depression|anxiety|pregnan\w*|fertility|hormone\w*)\b/i,
  },
  {
    key: "financial",
    re: /\b(invest(s|ed|ing|ment|ments)?|guaranteed.?returns?|return.?on.?investment|roi|interest.?rates?|taxes?|tax.?(advice|return|deduction)|loans?|mortgage\w*|refinanc\w*|portfolio\w*|stocks?|shares?|crypto\w*|bitcoin|retirement|pension\w*|savings?|debt\w*|credit.?(score|card)|insurance|financial.?advice|profits?|dividend\w*|yield\w*)\b/i,
  },
  {
    key: "legal",
    re: /\b(legal.?advice|lawsuits?|\bsue\b|attorney|lawyer|liabilit\w*|contract.?law|statute\w*|litigation|settlement\w*|legally.?binding|gdpr|regulatory.?compliance)\b/i,
  },
];

function words(text: string): string[] {
  return (text || "").trim().split(/\s+/).filter(Boolean);
}

function trigrams(text: string): Set<string> {
  const t = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) grams.add(t.slice(i, i + 3));
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Deterministic on-page SEO checks over the canonical asset (never AI). */
function seoReadiness(
  asset: ContentAsset,
  canonicalMarkdown: string,
): {
  score: number;
  method: ScoreMethod;
  issues: string[];
} {
  const issues: string[] = [];
  const checks: boolean[] = [];
  const metaTitle = (asset.metaTitle || asset.title || "").trim();
  const metaDesc = (asset.metaDescription || "").trim();
  const wc = words(canonicalMarkdown).length;

  const push = (ok: boolean, issue: string) => {
    checks.push(ok);
    if (!ok) issues.push(issue);
  };
  push(metaTitle.length >= 20 && metaTitle.length <= 60, "Meta title should be 20–60 characters.");
  push(
    metaDesc.length >= 70 && metaDesc.length <= 160,
    "Meta description should be 70–160 characters.",
  );
  push(/^#\s+.+/m.test(canonicalMarkdown) || Boolean(asset.title?.trim()), "Add an H1 / title.");
  push(/^##\s+.+/m.test(canonicalMarkdown), "Add H2 section headings.");
  push(wc >= 300, "Body is thin (aim for 300+ words).");

  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { score, method: "deterministic", issues };
}

/** Heuristic AI-readability proxy — sentence length, heading density, structure. */
function aiReadability(canonicalMarkdown: string): {
  score: number;
  method: ScoreMethod;
  issues: string[];
} {
  const issues: string[] = [];
  const text = canonicalMarkdown || "";
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  const avgLen = sentences.length ? words(text).length / sentences.length : 0;
  const headings = (text.match(/^#{2,3}\s+/gm) || []).length;
  const hasList = /^\s*[-*]\s+/m.test(text) || /^\s*\d+[.)]\s+/m.test(text);

  const checks: boolean[] = [];
  const push = (ok: boolean, issue: string) => {
    checks.push(ok);
    if (!ok) issues.push(issue);
  };
  push(
    avgLen > 0 && avgLen <= 26,
    "Sentences are long — shorter sentences read better for AI answers.",
  );
  push(headings >= 2, "Add clear section headings so answers are extractable.");
  push(hasList, "Use a list or steps for scannable, answerable structure.");

  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return { score, method: "heuristic", issues };
}

/**
 * YMYL detection + support. `fail` = claims present but NOT adequately supported
 * (no verified source and no resolved author) → the J checklist turns this into a
 * hard block that requires a human. `review` = claims present but supported.
 */
function ymyl(
  asset: ContentAsset,
  canonicalMarkdown: string,
): {
  level: ReadinessLevel;
  method: ScoreMethod;
  signals: string[];
  supported: boolean;
} {
  // Scan the title + BOTH metas + the body — a YMYL claim placed only in the title
  // or meta (which publish as headline/description) must not evade the gate.
  const scanned = [
    asset.title ?? "",
    asset.metaTitle ?? "",
    asset.metaDescription ?? "",
    canonicalMarkdown,
  ].join("\n");
  const signals = YMYL_PATTERNS.filter((p) => p.re.test(scanned)).map((p) => p.key);
  if (!signals.length)
    return { level: "pass", method: "deterministic", signals: [], supported: true };
  // "Supported" for a YMYL claim requires a VERIFIED source or an author with a
  // real CREDENTIAL — a bare name + profile URL is not enough to back a health/
  // finance/legal claim. Unsupported → fail (the checklist turns this into a hard
  // human-review block).
  const supported =
    citableSources(asset.sources).length > 0 || Boolean(asset.author?.credentials?.trim());
  return { level: supported ? "review" : "fail", method: "deterministic", signals, supported };
}

function corpusConflicts(
  asset: ContentAsset,
  others: ContentAsset[],
  keyOf: (a: ContentAsset) => string,
  threshold: number,
): { conflicts: Conflict[]; confidence: number } {
  const mine = trigrams(keyOf(asset));
  const conflicts: Conflict[] = [];
  let max = 0;
  for (const o of others) {
    if (o.id === asset.id) continue;
    const sim = jaccard(mine, trigrams(keyOf(o)));
    max = Math.max(max, sim);
    if (sim >= threshold)
      conflicts.push({ assetId: o.id, title: o.title, similarity: Math.round(sim * 100) / 100 });
  }
  conflicts.sort((a, b) => b.similarity - a.similarity);
  return { conflicts, confidence: Math.round(max * 100) / 100 };
}

function level(confidence: number, reviewAt: number, failAt: number): ReadinessLevel {
  if (confidence >= failAt) return "fail";
  if (confidence >= reviewAt) return "review";
  return "pass";
}

/**
 * Assess a content asset's readiness over the CANONICAL assembled body and the
 * project corpus (its other assets). Pure — the caller supplies the corpus.
 */
export function assessReadiness(
  asset: ContentAsset,
  project: Project,
  corpus: ContentAsset[],
): ReadinessAssessment {
  const canonical = assembleContentAsset(asset, project).markdown;
  const others = corpus.filter((a) => a.projectId === asset.projectId && a.id !== asset.id);

  // Duplication compares the AUTHORED body, not the assembled output — otherwise a
  // shared house author byline + Sources block would inflate cross-asset similarity
  // between substantively different articles (review fix).
  const dup = corpusConflicts(asset, others, (a) => a.markdown ?? "", 0.5);
  const cannibal = corpusConflicts(asset, others, (a) => `${a.title} ${a.slug ?? ""}`, 0.6);

  return {
    seoReadiness: seoReadiness(asset, canonical),
    aiReadability: aiReadability(canonical),
    ymyl: ymyl(asset, canonical),
    duplication: {
      level: level(dup.confidence, 0.5, 0.85),
      method: "deterministic",
      conflicts: dup.conflicts,
      confidence: dup.confidence,
      limitation: LEXICAL_LIMITATION,
    },
    cannibalisation: {
      // Cannibalisation is advisory only — never "fail" on lexical title overlap.
      level: cannibal.conflicts.length ? "review" : "pass",
      method: "deterministic",
      conflicts: cannibal.conflicts,
      confidence: cannibal.confidence,
      limitation: CANNIBAL_LIMITATION,
    },
  };
}

/** Compact, storable summary (ReadinessScore) derived from a full assessment. */
export function toReadinessScore(a: ReadinessAssessment, evaluatedAt: string): ReadinessScore {
  return {
    seoReadiness: a.seoReadiness.score,
    aiReadability: a.aiReadability.score,
    ymylRisk: a.ymyl.level,
    duplicationRisk: a.duplication.level,
    cannibalisationRisk: a.cannibalisation.level,
    evaluatedAt,
  };
}
