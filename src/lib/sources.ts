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

/**
 * http/https only, with a basic SSRF guard rejecting loopback / private /
 * link-local / cloud-metadata hosts. Used before any fetch AND as the gate on
 * what may render as a live citation.
 */
export function isValidHttpSourceUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL((raw || "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || host === "0.0.0.0") return false;
  if (host === "169.254.169.254") return false; // cloud instance metadata
  if (/^127\./.test(host)) return false; // loopback
  if (/^10\./.test(host)) return false; // private
  if (/^192\.168\./.test(host)) return false; // private
  if (/^169\.254\./.test(host)) return false; // link-local
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; // private
  if (/^fe80:/i.test(host) || /^fc00:/i.test(host) || /^fd/i.test(host)) return false; // ipv6 local
  return true;
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
