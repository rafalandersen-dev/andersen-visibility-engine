/**
 * Stable section identity + reconciliation — Article Studio 3.0 / P1.2C.
 *
 * A section's identity is a PERSISTED opaque id (`sec_…`), allocated once and kept
 * in `ContentAsset.sectionIndex`. Identity is NEVER derived solely from heading
 * text, position, or a content hash — those are separated reconciliation SIGNALS.
 * The reconciler re-maps persisted ids onto a freshly parsed body deterministically,
 * and FAILS SAFE: when confidence is below threshold or two candidates are too
 * close, it returns `ambiguous`/`missing` rather than guessing, so an anchored image
 * can never jump to an unrelated (or duplicate-heading) section.
 *
 * Two entry points:
 *   • `reconcileSectionIndex(prev, body, allocId)` — EDIT-TIME: returns the section
 *     index to PERSIST (keeps matched ids, allocates ids for genuinely new sections).
 *   • `resolveSectionPositions(sectionIndex, body)` — READ-TIME (assembler/checklist):
 *     maps each persisted id to its CURRENT parsed section or a resolved/ambiguous/
 *     missing status. Pure, allocation-free, never mutates the asset.
 *
 * Pure — no I/O.
 */
import type { SectionRef } from "./types";

// ---- Tunable reconciliation thresholds (documented; all deterministic) ----
/** Minimum match score (0–100) to reuse a persisted id for a parsed section. */
export const ASSIGN_THRESHOLD = 62;
/** If the best and second-best candidates are within this margin, the match is AMBIGUOUS. */
export const TIE_MARGIN = 12;
/** Minimum normalized-excerpt Jaccard similarity to treat two sections as the same when neither heading nor fingerprint matches. */
export const EXCERPT_SIM_THRESHOLD = 0.6;
/** Excerpt length (chars of normalized content) compared for similarity. */
const EXCERPT_LEN = 240;

export interface ParsedSection {
  heading: string;
  /** Normalized heading (lowercased, punctuation-stripped, ws-collapsed) — a SIGNAL, not identity. */
  normalized: string;
  level: number;
  /** 0-based position among parsed sections — a SIGNAL, not identity. */
  order: number;
  /** Line index of the heading line in the body. */
  headingLineIdx: number;
  /** Exclusive line index where this section's SUBTREE ends (next heading of level ≤ this one). */
  subtreeEndLineIdx: number;
  /** FNV-1a hash of the section's immediate normalized content — for EQUALITY only, never similarity. */
  fingerprint: string;
  /** Normalized immediate content excerpt — the ONLY similarity signal. */
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function normalizeHeading(h: string): string {
  return (h || "")
    .toLowerCase()
    .replace(/[*_`~]/g, "") // strip markdown emphasis
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeContent(s: string): string {
  return (
    (s || "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // drop image markdown → fingerprint is image-independent,
      // so the editor's raw-body reconcile and the assembler's stripped-body resolve agree.
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** FNV-1a 32-bit hash → 8-char hex. Deterministic; used for EXACT fingerprint equality only. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(" ").filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Parse the body into heading-delimited sections, IGNORING headings inside fenced
 * code blocks (``` / ~~~). A conservative parser (indented 4-space code blocks are
 * not treated specially — documented limitation). Each section carries its immediate
 * content fingerprint/excerpt and its subtree end (for `after-section` insertion).
 */
export function parseSections(markdown: string): { lines: string[]; sections: ParsedSection[] } {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  let inFence = false;
  let fenceChar = "";
  const heads: { idx: number; level: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const fence = t.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;
    const h = lines[i].match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (h) heads.push({ idx: i, level: h[1].length, text: h[2].trim() });
  }
  const sections: ParsedSection[] = heads.map((h, k) => {
    const contentEnd = heads[k + 1] ? heads[k + 1].idx : lines.length; // immediate content
    let subtreeEnd = lines.length;
    for (let j = k + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        subtreeEnd = heads[j].idx;
        break;
      }
    }
    const immediate = normalizeContent(lines.slice(h.idx + 1, contentEnd).join(" "));
    return {
      heading: h.text,
      normalized: normalizeHeading(h.text),
      level: h.level,
      order: k,
      headingLineIdx: h.idx,
      subtreeEndLineIdx: subtreeEnd,
      fingerprint: fnv1a(immediate),
      excerpt: immediate.slice(0, EXCERPT_LEN),
    };
  });
  return { lines, sections };
}

/** Build a persisted SectionRef from a parsed section + an id. */
function toRef(id: string, s: ParsedSection): SectionRef {
  return {
    id,
    heading: s.heading,
    normalized: s.normalized,
    level: s.level,
    order: s.order,
    fingerprint: s.fingerprint,
    excerpt: s.excerpt,
  };
}

// ---------------------------------------------------------------------------
// Scoring — separated signals, documented weights (refinement 3)
// ---------------------------------------------------------------------------

/**
 * Match score (0–100) between a persisted SectionRef and a parsed section:
 *   100 — unchanged: normalized heading AND exact fingerprint both equal.
 *    82 — exact fingerprint equal, heading changed (a heading rename).
 *    76 — normalized heading equal, content edited (fingerprint differs).
 *  58–70 — neither, but normalized-excerpt Jaccard ≥ EXCERPT_SIM_THRESHOLD.
 *     0 — otherwise (no primary match → never a candidate).
 * Secondary signals add small deterministic bonuses: same heading level (+6),
 * previous-order proximity (+3). Heading text ALONE never reaches ASSIGN_THRESHOLD
 * for a duplicate-heading collision, because the fingerprint/excerpt separates them.
 */
export function scoreMatch(prev: SectionRef, s: ParsedSection): number {
  const headingEq = !!prev.normalized && prev.normalized === s.normalized;
  const fpEq = !!prev.fingerprint && prev.fingerprint === s.fingerprint;
  if (headingEq && fpEq) return 100;
  let base = 0;
  if (fpEq) base = 82;
  else if (headingEq) base = 76;
  else {
    const sim = jaccard(tokenSet(prev.excerpt ?? ""), tokenSet(s.excerpt));
    if (sim >= EXCERPT_SIM_THRESHOLD) base = 40 + Math.round(sim * 30);
    else return 0;
  }
  if (prev.level === s.level) base += 6;
  if (typeof prev.order === "number" && Math.abs(prev.order - s.order) <= 1) base += 3;
  return Math.min(base, 99);
}

export type MatchStatus = "resolved" | "ambiguous" | "missing";

export interface SectionMatch {
  ref: SectionRef;
  status: MatchStatus;
  /** The parsed section this id now maps to (only when `resolved`). */
  section: ParsedSection | null;
}

/**
 * Reconcile persisted section ids against the parsed body. Deterministic and
 * fail-safe: below threshold → `missing`; two candidates within TIE_MARGIN →
 * `ambiguous`; a parsed section claimed by two ids → the clear winner keeps it,
 * a near-tie makes BOTH ambiguous (a merge with two plausible continuations —
 * refinement 5). Never selects arbitrarily.
 */
export function matchSections(prev: SectionRef[], parsed: ParsedSection[]): SectionMatch[] {
  // Pass 1 — each id's best/second candidate.
  const tentative = prev.map((ref) => {
    const scored = parsed
      .map((section) => ({ section, score: scoreMatch(ref, section) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.section.order - b.section.order);
    const best = scored[0];
    const second = scored[1];
    if (!best || best.score < ASSIGN_THRESHOLD) {
      return { ref, status: "missing" as MatchStatus, section: null, score: 0 };
    }
    if (second && second.score >= ASSIGN_THRESHOLD && best.score - second.score < TIE_MARGIN) {
      return { ref, status: "ambiguous" as MatchStatus, section: null, score: best.score };
    }
    return { ref, status: "resolved" as MatchStatus, section: best.section, score: best.score };
  });
  // Pass 2 — merge conflicts: a parsed section claimed by >1 resolved id.
  const byOrder = new Map<number, typeof tentative>();
  for (const t of tentative) {
    if (t.status !== "resolved" || !t.section) continue;
    const arr = byOrder.get(t.section.order) ?? [];
    arr.push(t);
    byOrder.set(t.section.order, arr);
  }
  for (const claimants of byOrder.values()) {
    if (claimants.length < 2) continue;
    claimants.sort((a, b) => b.score - a.score);
    const top = claimants[0];
    for (let i = 1; i < claimants.length; i++) {
      const c = claimants[i];
      if (top.score - c.score < TIE_MARGIN) {
        // Two plausible continuations into one merged section → both ambiguous.
        top.status = "ambiguous";
        top.section = null;
        c.status = "ambiguous";
        c.section = null;
      } else {
        // Clear winner keeps the section; the loser merged away → missing.
        c.status = "missing";
        c.section = null;
      }
    }
  }
  return tentative.map(({ ref, status, section }) => ({ ref, status, section }));
}

/**
 * READ-TIME resolution for the assembler/checklist: a map from each persisted
 * section id to its current status + parsed section. Pure, allocation-free.
 */
export function resolveSectionPositions(
  sectionIndex: SectionRef[] | undefined,
  parsed: ParsedSection[],
): Map<string, SectionMatch> {
  const out = new Map<string, SectionMatch>();
  for (const m of matchSections(sectionIndex ?? [], parsed)) out.set(m.ref.id, m);
  return out;
}

/**
 * EDIT-TIME reconciliation returning the section index to PERSIST. Matched ids are
 * kept (and their metadata refreshed); a genuinely new parsed section (or an
 * ambiguous/split part) gets a fresh id from `allocId`. `allocId` is injected so
 * this stays pure/deterministic (the editor passes `crypto.randomUUID`-based ids;
 * tests pass a counter).
 */
export function reconcileSectionIndex(
  prev: SectionRef[] | undefined,
  markdown: string,
  allocId: () => string,
): SectionRef[] {
  const { sections } = parseSections(markdown);
  const matches = matchSections(prev ?? [], sections);
  // A parsed section keeps a prior id only when exactly one resolved match points at it.
  const keptIdByOrder = new Map<number, string>();
  for (const m of matches) {
    if (m.status === "resolved" && m.section) keptIdByOrder.set(m.section.order, m.ref.id);
  }
  return sections.map((s) => toRef(keptIdByOrder.get(s.order) ?? allocId(), s));
}
