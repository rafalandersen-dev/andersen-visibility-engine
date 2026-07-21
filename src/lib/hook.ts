/**
 * Hook model & workflow — Article Studio 3.0 / P1.2A.
 *
 * Pure, deterministic hook composition + validation (mirrors images.ts). NO I/O,
 * NO AI calls. The canonical assembler emits `asset.hook` exactly once before the
 * TL;DR; this module supplies that markdown and the deterministic warnings /
 * blockers the checklist and editor consume.
 *
 * Safety posture (D-AS3-9): validation is CONSERVATIVE. A hard blocker fires only
 * on a clear unsupported factual claim — a statistic/outcome, an explicit
 * guarantee, a YMYL claim, or a result/testimonial stated as fact — with no
 * linked evidence. Content is NEVER labelled "fabricated": the system has no
 * evidence a claim is false, only that it is unsupported, so messages say
 * "unsupported" / "needs a source".
 */
import type {
  ArticleHook,
  ContentAsset,
  HookFinding,
  HookProposal,
  HookResolutionAction,
  HookType,
} from "./types";
import { articleVisualPolicy } from "./visual-model";

/** The seven supported hook types — single source for the editor selector + validation. */
export const HOOK_TYPES: readonly HookType[] = [
  "question",
  "problem-to-solution",
  "surprising-fact",
  "contrarian",
  "story",
  "result",
  "promise",
] as const;

/** Above this length (characters) the hook earns an "excessive-length" warning. */
export const HOOK_MAX_CHARS = 320;

/**
 * Normalise up to three hook proposals from a generation payload (P1.2A). Pure and
 * defensive: drops empty/malformed entries, coerces an unknown type to "question",
 * clamps text length, and caps the list at three. No proposal is ever approved.
 */
export function normalizeHookProposals(value: unknown): HookProposal[] {
  if (!Array.isArray(value)) return [];
  const out: HookProposal[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const text = String(r.text ?? r.hook ?? r.opening ?? "").trim();
    if (!text) continue;
    const typeRaw = String(r.type ?? r.kind ?? "")
      .toLowerCase()
      .trim();
    const type = (HOOK_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as HookType)
      : "question";
    const proposal: HookProposal = { text: text.slice(0, HOOK_MAX_CHARS), type };
    const purpose = String(r.purpose ?? r.intent ?? "").trim();
    if (purpose) proposal.purpose = purpose.slice(0, 200);
    out.push(proposal);
    if (out.length >= 3) break;
  }
  return out;
}

export function hasHookText(hook: ArticleHook | undefined): hook is ArticleHook {
  return Boolean(hook && hook.text && hook.text.trim());
}

/**
 * The canonical markdown for the hook — a single lead paragraph, emitted before
 * the TL;DR. Empty string when there is no hook text (so the assembler skips it).
 *
 * The NORMAL path does NO body-dedup: the v3 contract is that the generated body
 * never embeds a hook, so the assembler simply emits `asset.hook` once. Legacy
 * upgrade uses the explicit, conservative `detectPossibleHookDuplicate` — never a
 * fuzzy "body begins with the hook" similarity check.
 */
export function composeHookMarkdown(hook: ArticleHook | undefined): string {
  return hasHookText(hook) ? hook.text.trim() : "";
}

// ---------------------------------------------------------------------------
// Deterministic text helpers
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "your",
  "you",
  "our",
  "are",
  "was",
  "will",
  "can",
  "how",
  "why",
  "what",
  "when",
  "who",
  "from",
  "into",
  "out",
  "about",
  "have",
  "has",
  "but",
  "not",
  "all",
  "any",
  "get",
  "its",
  "their",
  "they",
  "them",
  "more",
  "most",
  "some",
  "than",
  "then",
  "here",
  "there",
  "over",
  "just",
  "like",
]);

function contentWords(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function finding(
  code: HookFinding["code"],
  message: string,
  actions: HookResolutionAction[],
): HookFinding {
  return { code, message, actions };
}

// ---------------------------------------------------------------------------
// Deterministic claim / quality detectors (conservative)
// ---------------------------------------------------------------------------

const PERCENT_RE = /\b\d{1,3}(?:\.\d+)?\s?%/;
const MULTIPLIER_RE = /\b\d+(?:\.\d+)?\s?(?:x|times|×)\b/i;
const OUTCOME_NUMBER_RE =
  /\b(?:increase|increased|decrease|decreased|boost|boosted|grew|grow|reduce|reduced|double|doubled|triple|tripled|save|saved|gain|gained|improve|improved|convert|conversions?)\b[\s\S]{0,40}?\d/i;

function isStatisticClaim(text: string): boolean {
  return PERCENT_RE.test(text) || MULTIPLIER_RE.test(text) || OUTCOME_NUMBER_RE.test(text);
}

// An explicit guarantee is rejected regardless of evidence (D9/D16). "promise" the
// hook TYPE is fine — only explicit guarantee phrasing matches here.
const GUARANTEE_RE =
  /\bguarantee(?:d|s)?\b|\bwe promise\b|\bpromise (?:you|to)\b|\b100%\s?(?:guarantee\w*|money|refund|results?)\b|\brisk[-\s]?free\b/i;

const YMYL_RE =
  /\b(?:cure|cures|cured|treat|treats|treatment|diagnos\w+|clinically proven|fda[-\s]?approved|weight loss|lose \d+\s?(?:kg|kgs|lbs|pounds|kilos)|side effects?|guaranteed returns?|interest rate|tax[-\s]?(?:free|deduction)|lawsuit|liable|investment returns?)\b/i;

// Strong: a result / testimonial stated as fact (quote with attribution, or a
// concrete customer-outcome claim). Weak: mere testimonial-flavoured phrasing.
const TESTIMONIAL_STRONG_RE =
  /["“][^"”]{6,}["”]\s?[—-]\s?\w|\bour (?:customers?|clients?) (?:achieved|saw|got|earned|reported|gained)\b|\b\d+\s?(?:customers?|clients?|users?)\b[\s\S]{0,30}?(?:achieved|saw|report|earned)/i;
const TESTIMONIAL_WEAK_RE =
  /\b(?:customers?|clients?|users?) (?:love|say|said|call|rave)\b|\btestimonials?\b|\breviews? say\b/i;

const FILLER_RE =
  /^\s*(?:in today'?s (?:world|digital age|fast[-\s]?paced\b.*)|in this (?:article|post|guide|blog)|as we all know|it'?s no secret|when it comes to|in the (?:modern|current|digital) (?:era|world|age)|let'?s (?:dive|jump) (?:in|into))/i;

const CLICKBAIT_RE =
  /\b(?:you won'?t believe|shocking(?:ly)?|mind[-\s]?blowing|insane|this one (?:weird )?trick|jaw[-\s]?dropping|will blow your mind|doctors hate|number \d+ will (?:shock|surprise))\b|!{2,}/i;

const BROAD_PROMISE_RE =
  /\b(?:everything you need|the ultimate guide|anyone can|in (?:just )?\d+ (?:minutes|seconds|days)|effortlessly|with no effort|the only .{2,40} you'?ll ever need|instantly)\b/i;

function isTitleRepetition(hookText: string, title: string): boolean {
  const h = normalizeText(hookText);
  const t = normalizeText(title);
  if (!h || !t) return false;
  if (h === t) return true;
  if (h.length >= 12 && t.includes(h)) return true;
  if (t.length >= 12 && h.includes(t)) return true;
  return false;
}

/** Zero content-word overlap with title+body → weak relevance (conservative: only when NONE). */
function isWeakRelevance(hookText: string, asset: ContentAsset): boolean {
  const hookWords = new Set(contentWords(hookText));
  if (hookWords.size === 0) return false; // nothing to judge — don't false-warn
  const corpus = new Set(
    contentWords(`${asset.title ?? ""} ${asset.markdown ?? ""} ${asset.metaDescription ?? ""}`),
  );
  if (corpus.size === 0) return false; // no body yet — don't false-warn
  for (const w of hookWords) if (corpus.has(w)) return false;
  return true;
}

function isExcessiveLength(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return text.length > HOOK_MAX_CHARS || words > 50;
}

function normalizeEvidenceUrl(u: string): string {
  return (u || "").trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * A statistic / YMYL / testimonial claim counts as SUPPORTED only when the HOOK
 * carries an evidence ref whose URL matches a VERIFIED source already attached to
 * the same asset. Two independent gates must both hold:
 *   1. the reference is bound to the HOOK (not an unrelated body citation), and
 *   2. the referenced source is VERIFIED (a hand-typed / unverified URL never counts).
 * So an unrelated article source cannot silently unblock a bare claim, and pasting
 * an arbitrary URL into the hook does not mark it supported (adversarial-review
 * finding #1 + evidence-UI contract).
 */
function hookHasEvidence(asset: ContentAsset): boolean {
  const refs = (asset.hook?.evidence ?? []).map((e) => normalizeEvidenceUrl(e.url)).filter(Boolean);
  if (!refs.length) return false;
  const verified = new Set(
    (asset.sources ?? [])
      .filter((s) => s.status === "verified" && (s.url || "").trim())
      .map((s) => normalizeEvidenceUrl(s.url)),
  );
  return refs.some((r) => verified.has(r));
}

/** The asset's VERIFIED sources — the only sources the hook may cite as evidence. */
export function verifiedSourcesForHook(asset: ContentAsset): { url: string; title?: string }[] {
  return (asset.sources ?? [])
    .filter((s) => s.status === "verified" && (s.url || "").trim())
    .map((s) => ({ url: s.url, title: s.title }));
}

/** True when the hook's evidence ref resolves to a verified source (for the editor's view). */
export function hookEvidenceResolved(asset: ContentAsset): boolean {
  return hookHasEvidence(asset);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface HookValidation {
  warnings: HookFinding[];
  blockers: HookFinding[];
}

/**
 * Deterministic hook validation. Always recomputed (never trusts any cached
 * `hook.warnings`/`hook.blockers`). Returns empty lists when there is no hook.
 */
export function validateHook(asset: ContentAsset): HookValidation {
  const warnings: HookFinding[] = [];
  const blockers: HookFinding[] = [];
  const hook = asset.hook;
  if (!hasHookText(hook)) return { warnings, blockers };
  const text = hook.text.trim();
  const supported = hookHasEvidence(asset);

  // ---- HARD BLOCKERS (unsupported factual claims) ----
  if (isStatisticClaim(text) && !supported) {
    blockers.push(
      finding(
        "unsupported-statistic",
        "The hook states a statistic or outcome with no linked evidence. Attach a source or remove the figure.",
        ["attach-evidence", "remove-unsupported-claim", "edit-hook"],
      ),
    );
  }
  if (GUARANTEE_RE.test(text)) {
    blockers.push(
      finding(
        "explicit-guarantee",
        "The hook makes an explicit guarantee. Milo does not publish guarantees — rephrase without a promise of results.",
        ["remove-unsupported-claim", "edit-hook"],
      ),
    );
  }
  if (YMYL_RE.test(text) && !supported) {
    blockers.push(
      finding(
        "ymyl-unsupported",
        "The hook makes a health, finance or legal claim that needs a cited source. Attach evidence or request human confirmation.",
        ["attach-evidence", "remove-unsupported-claim", "request-human-confirmation"],
      ),
    );
  }
  if (TESTIMONIAL_STRONG_RE.test(text) && !supported) {
    blockers.push(
      finding(
        "unsupported-testimonial",
        "The hook presents a customer result or testimonial as fact with no declared evidence source. Attach evidence or remove the claim.",
        ["attach-evidence", "remove-unsupported-claim", "edit-hook"],
      ),
    );
  }

  // ---- WARNINGS (never block) ----
  if (FILLER_RE.test(text)) {
    warnings.push(
      finding(
        "generic-filler",
        "The hook opens with generic filler. Lead with something specific.",
        ["edit-hook", "change-hook-type"],
      ),
    );
  }
  if (isTitleRepetition(text, asset.title ?? "")) {
    warnings.push(
      finding("title-repetition", "The hook mostly repeats the title. Give it a distinct angle.", [
        "edit-hook",
        "change-hook-type",
      ]),
    );
  }
  if (isWeakRelevance(text, asset)) {
    warnings.push(
      finding(
        "weak-relevance",
        "The hook has little overlap with the article body. Tie it to the content.",
        ["edit-hook"],
      ),
    );
  }
  if (CLICKBAIT_RE.test(text)) {
    warnings.push(
      finding("excessive-clickbait", "The hook reads as clickbait. Tone down the hype.", [
        "edit-hook",
        "change-hook-type",
      ]),
    );
  }
  if (isExcessiveLength(text)) {
    warnings.push(
      finding(
        "excessive-length",
        `The hook is long (${text.length} characters). Tighten it to a punchy opener.`,
        ["edit-hook"],
      ),
    );
  }
  // Testimonial-LIKE phrasing (weak) only warns; a strong testimonial-as-fact is a
  // blocker above, so don't double-report it here.
  if (!TESTIMONIAL_STRONG_RE.test(text) && TESTIMONIAL_WEAK_RE.test(text)) {
    warnings.push(
      finding(
        "testimonial-like",
        "The hook uses testimonial-like phrasing without context. Add a source or reframe.",
        ["attach-evidence", "edit-hook"],
      ),
    );
  }
  if (BROAD_PROMISE_RE.test(text)) {
    warnings.push(
      finding("overly-broad-promise", "The hook makes an overly broad promise. Make it concrete.", [
        "edit-hook",
        "change-hook-type",
      ]),
    );
  }

  return { warnings, blockers };
}

// ---------------------------------------------------------------------------
// Publish gate (checklist-facing)
// ---------------------------------------------------------------------------

export interface HookPublishGate {
  /** True only for v3 / upgrading assets. Legacy → all-false (never blocks). */
  applies: boolean;
  /** No hook, or the hook text is empty. */
  missing: boolean;
  /** Hook has text but is not approved. */
  unapproved: boolean;
  /** Hook has unresolved hard blockers (unsupported claims). */
  blocked: boolean;
  blockers: HookFinding[];
}

/**
 * The hook's contribution to the publish gate. Only v3 (or explicitly upgrading)
 * assets are gated; a legacy asset returns `applies:false` and never blocks.
 */
export function hookPublishGate(asset: ContentAsset): HookPublishGate {
  if (articleVisualPolicy(asset) !== "v3") {
    return { applies: false, missing: false, unapproved: false, blocked: false, blockers: [] };
  }
  const present = hasHookText(asset.hook);
  const blockers = present ? validateHook(asset).blockers : [];
  return {
    applies: true,
    missing: !present,
    unapproved: present && asset.hook!.approval !== "approved",
    blocked: blockers.length > 0,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// Legacy-upgrade duplicate detection (NOT used in normal composition)
// ---------------------------------------------------------------------------

export interface HookDuplicateReport {
  duplicate: boolean;
  confidence: "exact" | "none";
}

/**
 * LEGACY-UPGRADE ONLY. Conservatively reports whether the body's first paragraph
 * already looks like the hook, so the upgrade flow can ASK the user rather than
 * silently emit the hook twice or delete body content. It REQUIRES a deterministic
 * match — exact normalised equality of the first non-empty block — never a fuzzy
 * similarity score, and it NEVER mutates the asset. Not called by the assembler.
 */
export function detectPossibleHookDuplicate(asset: ContentAsset): HookDuplicateReport {
  const hook = asset.hook;
  if (!hasHookText(hook)) return { duplicate: false, confidence: "none" };
  const firstBlock =
    (asset.markdown || "")
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)[0] || "";
  const a = normalizeText(firstBlock);
  const b = normalizeText(hook.text);
  if (a && b && a === b) return { duplicate: true, confidence: "exact" };
  return { duplicate: false, confidence: "none" };
}

// ---------------------------------------------------------------------------
// Lifecycle: generated → user-edited → approved (pure; the editor/generation
// wire these). Provenance and approval are tracked in SEPARATE fields and never
// conflated: selecting a proposal is `generated`/`draft`; any edit flips to
// `user-edited` and RE-DRAFTS (re-approval required); approval is only ever set
// by an explicit approveHook call. `now` is optional so the functions stay pure.
// ---------------------------------------------------------------------------

/** A selected generation proposal → a new draft hook. Never auto-approved. */
export function newHookFromProposal(proposal: HookProposal, id: string, now?: string): ArticleHook {
  const hook: ArticleHook = {
    id,
    text: proposal.text.trim(),
    type: proposal.type,
    provenance: "generated",
    approval: "draft",
  };
  if (proposal.purpose?.trim()) hook.purpose = proposal.purpose.trim();
  if (now) {
    hook.createdAt = now;
    hook.updatedAt = now;
  }
  return hook;
}

/** Any human edit → provenance `user-edited` and approval reset to `draft`. */
export function applyHookEdit(
  hook: ArticleHook,
  patch: Partial<Pick<ArticleHook, "text" | "type" | "purpose" | "evidence">>,
  now?: string,
): ArticleHook {
  const next: ArticleHook = { ...hook, ...patch, provenance: "user-edited", approval: "draft" };
  if (now) next.updatedAt = now;
  return next;
}

/** Explicit, deliberate approval. Provenance is unchanged (a generated hook stays generated). */
export function approveHook(hook: ArticleHook, now?: string): ArticleHook {
  if (!hasHookText(hook)) return hook; // cannot approve an empty hook
  const next: ArticleHook = { ...hook, approval: "approved" };
  if (now) next.updatedAt = now;
  return next;
}

/**
 * Reconcile the hook when the article body is regenerated. A hook that carries
 * text is PRESERVED (so an approved or user-edited hook — and a selected but
 * unapproved generated proposal — always survives regeneration); only an
 * absent/empty hook slot may take a fresh proposal.
 *
 * This is the DESIGNATED reconcile point for any future in-place full-body
 * regeneration path. P1.2A ships no such path — the partial regens (metadata /
 * FAQ / CTA) preserve the hook via object spread and `generateArticleDraft`
 * mints a NEW asset — so it is intentionally not yet wired (adversarial-review
 * finding #2). Wire it into a body-regeneration handler before adding one.
 */
export function reconcileHookOnRegeneration(
  existing: ArticleHook | undefined,
  proposal: HookProposal | undefined,
  id: string,
  now?: string,
): ArticleHook | undefined {
  if (hasHookText(existing)) return existing;
  return proposal ? newHookFromProposal(proposal, id, now) : existing;
}
