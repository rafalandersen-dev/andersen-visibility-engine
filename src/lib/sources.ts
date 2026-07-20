/**
 * Grounded sources — Article Studio 2.0 / P1.1 C.
 *
 * Milo never fabricates a source (`sharedRules` already forbids inventing
 * citations). A source is a real URL a human or the model attached to back a
 * specific claim; Milo validates it and labels the outcome. The honesty contract
 * (C9): an unreachable/unsupported source is LABELLED and retained on the asset,
 * never silently dropped and never treated as verified.
 *
 * "verified" here means the cited URL resolves (reachability — the honest bound
 * of what a fetch can confirm). Whether the page actually SUPPORTS the claim is
 * the human's attachment assertion or a later deeper check; a source the user
 * marks `unsupported` (loads but doesn't back the claim) is excluded from
 * citations exactly like an unreachable one.
 *
 * This module is pure (no I/O). The bounded network validation lives in
 * `sources.functions.ts`.
 */
import type { ContentSource } from "./types";
import { isSafePublicUrl } from "./safe-fetch";

/** Abuse controls for source attachment + validation (C follow-up), even without a paid API. */
export const SOURCE_MAX_PER_ASSET = 20; // hard cap on sources attached to one asset
export const SOURCE_MAX_PER_RUN = 12; // hard fan-out per validation run
export const SOURCE_MAX_REDIRECTS = 3;
export const SOURCE_FETCH_TIMEOUT_MS = 8000;
export const SOURCE_MAX_RESPONSE_BYTES = 64_000; // we don't read bodies, but cap defensively
export const SOURCE_RECHECK_COOLDOWN_MS = 10 * 60 * 1000; // don't re-hit a source within 10 min

/** Normalise a source URL for de-duplication: trim, drop the fragment, strip a trailing slash. */
export function normalizeSourceUrl(raw: string): string {
  try {
    const u = new URL((raw || "").trim());
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return (raw || "").trim();
  }
}

/** De-duplicate sources by normalised URL, keeping first occurrence, capped per asset. */
export function dedupeSources(sources: ContentSource[] | undefined): ContentSource[] {
  const seen = new Set<string>();
  const out: ContentSource[] = [];
  for (const s of sources ?? []) {
    const key = normalizeSourceUrl(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= SOURCE_MAX_PER_ASSET) break;
  }
  return out;
}

/**
 * Which sources a validation run should actually fetch: skip a human "unsupported"
 * verdict, skip anything checked within the cooldown, and cap the fan-out per run.
 */
export function selectSourcesToValidate(
  sources: ContentSource[] | undefined,
  nowMs: number,
  force = false,
): ContentSource[] {
  return dedupeSources(sources)
    .filter((s) => {
      if (s.status === "unsupported") return false;
      if (force) return true;
      if (s.status === "unchecked") return true;
      if (!s.checkedAt) return true;
      const t = Date.parse(s.checkedAt);
      return !Number.isFinite(t) || nowMs - t >= SOURCE_RECHECK_COOLDOWN_MS;
    })
    .slice(0, SOURCE_MAX_PER_RUN);
}

/** Map a fetch outcome to an explicit status + note (never counts a failure as verified). */
export function classifyReachability(outcome: {
  ok?: boolean;
  status?: number;
  kind?: "timeout" | "blocked" | "network";
}): { status: "verified" | "unreachable"; note: string } {
  if (outcome.kind === "timeout") return { status: "unreachable", note: "timeout" };
  if (outcome.kind === "blocked") return { status: "unreachable", note: "blocked" };
  if (outcome.kind === "network") return { status: "unreachable", note: "network" };
  if (outcome.ok || outcome.status === 206) return { status: "verified", note: "ok" };
  return { status: "unreachable", note: `http_${outcome.status ?? 0}` };
}

/**
 * http/https only, with a robust SSRF guard (full IP-literal canonicalisation
 * incl. IPv6-mapped/compat, trailing-dot, credentials — see `safe-fetch.ts`).
 * Used before any fetch AND as the gate on what may render as a live citation.
 */
export function isValidHttpSourceUrl(raw: string): boolean {
  return isSafePublicUrl(raw);
}

/** A source is CITABLE (renders as a published link) only when verified + valid. */
export function citableSources(sources: ContentSource[] | undefined): ContentSource[] {
  return (sources ?? []).filter((s) => s.status === "verified" && isValidHttpSourceUrl(s.url));
}

/**
 * Sources retained on the asset but NOT cited — unreachable, unsupported,
 * unchecked, or failing the URL guard. Surfaced in the editor so the drop is
 * never silent (C9), never published as a live citation.
 */
export function nonCitableSources(sources: ContentSource[] | undefined): ContentSource[] {
  return (sources ?? []).filter((s) => !(s.status === "verified" && isValidHttpSourceUrl(s.url)));
}

/** Anchor text for a source link — safe for markdown link syntax, length-capped. */
function sourceLinkText(s: ContentSource): string {
  const t = (s.title || "").trim();
  return (t || s.url).replace(/[[\]]/g, "").slice(0, 160);
}

/**
 * The "## Sources" section composed into the canonical body from the CITABLE
 * sources only. Empty string when there are none (so a legacy asset with no
 * sources composes byte-identically). External links → always active.
 */
export function sourcesBlockMarkdown(sources: ContentSource[] | undefined): string {
  const cite = citableSources(sources);
  if (!cite.length) return "";
  const items = cite.map((s) => `- [${sourceLinkText(s)}](${s.url})`).join("\n");
  return `## Sources\n\n${items}`;
}

/**
 * YMYL claims that still lack a verified source. These must be resolved (or
 * explicitly marked as requiring human review) before publish (C25) — the
 * publishing checklist (J) reads this.
 */
export function ymylClaimsNeedingReview(sources: ContentSource[] | undefined): ContentSource[] {
  return (sources ?? []).filter((s) => s.ymyl === true && s.status !== "verified");
}

/** True while any attached source is still unchecked (drives the "validate" affordance). */
export function hasUncheckedSources(sources: ContentSource[] | undefined): boolean {
  return (sources ?? []).some((s) => s.status === "unchecked");
}
