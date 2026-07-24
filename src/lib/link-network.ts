/**
 * Link Growth Network — pure logic (owner scope 2026-07-24: "backlinks
 * exchange or whatever will make us stand out").
 *
 * Milo projects OPT IN to a cross-project partner directory; matches are
 * scored by topic/language/locale relevance; introductions go out through the
 * existing outreach machinery; and — the differentiator — a placement is only
 * ever called LIVE after Milo has re-fetched the partner page and actually
 * found the link (four-state honesty, applied to link building).
 *
 * Google-policy stance, deliberately encoded here: relevance-first matching,
 * a reciprocity advisory when two sites simply swap links, and NO automatic
 * placement anywhere — Milo introduces and verifies; humans decide.
 *
 * Pure — no I/O, no store access. The directory/table lives server-side.
 */
import type { Project, ServiceItem } from "./types";

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

const TOPIC_STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "for",
  "with",
  "your",
  "our",
  "of",
  "in",
  "on",
  "a",
  "an",
  "to",
  "i",
  "och",
  "för",
  "med",
  "din",
  "vår",
  "av",
  "på",
  "en",
  "ett",
  "att",
  "dla",
  "z",
  "na",
  "w",
  "i",
  "o",
  "do",
  "się",
  "og",
  "til",
  "med",
  "din",
  "vores",
  "af",
  "på",
  "et",
]);

/** Fold diacritics so "återhämtning" and "aterhamtning" meet in the middle. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[łŁ]/g, "l")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .toLowerCase();
}

/**
 * Deterministic topic tokens for a project's listing: business type +
 * service names, folded, stop-worded, deduped, capped. Editable by the user
 * before opting in — this is only the seed.
 */
export function deriveTopics(
  project: Pick<Project, "businessType" | "description">,
  services: Pick<ServiceItem, "name">[],
): string[] {
  const raw = [project.businessType ?? "", ...services.map((s) => s.name ?? "")]
    .join(" ")
    .split(/[^\p{L}\p{N}]+/u);
  const out: string[] = [];
  for (const w of raw) {
    const t = fold(w.trim());
    if (t.length < 3 || TOPIC_STOPWORDS.has(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface NetworkListingLike {
  siteUrl: string;
  topics: string[];
  language: string;
  locale: string;
}

export interface MatchScore {
  /** 0-100; below MIN_MATCH_SCORE a pair is never suggested. */
  score: number;
  sharedTopics: string[];
}

export const MIN_MATCH_SCORE = 25;

/**
 * Relevance-first scoring: topic overlap dominates (60), same content
 * language (25), overlapping locale tokens (15). Two sites with zero topic
 * overlap can never reach the threshold on language alone — that is the
 * anti-link-farm property, pinned by test.
 */
export function scoreListingMatch(a: NetworkListingLike, b: NetworkListingLike): MatchScore {
  const at = new Set(a.topics.map(fold));
  const shared = [...new Set(b.topics.map(fold))].filter((t) => at.has(t));
  // HARD relevance precondition: no shared topic → score 0, full stop.
  // Language + locale alone must never suggest a pair (anti-link-farm).
  if (shared.length === 0) return { score: 0, sharedTopics: [] };
  const denom = Math.max(1, Math.min(at.size, new Set(b.topics.map(fold)).size));
  const topicScore = Math.round((shared.length / denom) * 60);
  const langScore = a.language && a.language === b.language ? 25 : 0;
  const aLoc = new Set(
    fold(a.locale)
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 3),
  );
  const localeScore = fold(b.locale)
    .split(/[^\p{L}]+/u)
    .some((w) => w.length >= 3 && aLoc.has(w))
    ? 15
    : 0;
  return { score: Math.min(100, topicScore + langScore + localeScore), sharedTopics: shared };
}

/** Same registrable site? (never suggest a site to itself, www-insensitive). */
export function sameSite(aUrl: string, bUrl: string): boolean {
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return u.trim().toLowerCase();
    }
  };
  return host(aUrl) === host(bUrl) && host(aUrl) !== "";
}

// ---------------------------------------------------------------------------
// Status machine (forward-only; declined is terminal)
// ---------------------------------------------------------------------------

export type MatchStatus = "suggested" | "contacted" | "agreed" | "live_verified" | "declined";

const NEXT: Record<MatchStatus, MatchStatus[]> = {
  suggested: ["contacted", "declined"],
  contacted: ["agreed", "declined"],
  agreed: ["live_verified", "declined"],
  live_verified: [],
  declined: [],
};

export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  return (NEXT[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// Live-placement verification (the differentiator)
// ---------------------------------------------------------------------------

/**
 * Does this HTML contain a real anchor to `partnerSiteUrl`'s host? Regex over
 * <a href> values with host normalization (www/protocol-insensitive). Used on
 * a safe-fetched page — a match is the ONLY way a placement becomes
 * live_verified. Nofollow/sponsored links count as present (honesty about
 * rel is surfaced separately via `relOfFirstMatch`).
 */
export function containsLinkToSite(
  html: string,
  partnerSiteUrl: string,
): { found: boolean; rel: string | null } {
  let partnerHost: string;
  try {
    partnerHost = new URL(partnerSiteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { found: false, rel: null };
  }
  const anchorRe = /<a\b([^>]*)>/gi;
  const hrefRe = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
  const relRe = /rel\s*=\s*("([^"]*)"|'([^']*)')/i;
  for (let m = anchorRe.exec(html); m; m = anchorRe.exec(html)) {
    const attrs = m[1] ?? "";
    const href = hrefRe.exec(attrs);
    let value = (href?.[2] ?? href?.[3] ?? href?.[4] ?? "").replace(/&amp;/g, "&");
    if (value.startsWith("//")) value = "https:" + value; // protocol-relative
    if (!/^https?:\/\//i.test(value)) continue;
    try {
      const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
      if (host === partnerHost) {
        const rel = relRe.exec(attrs);
        const relValue = rel?.[2] ?? rel?.[3] ?? null;
        // Hostile pages can carry megabyte rel attributes — cap before storage.
        return { found: true, rel: relValue ? relValue.slice(0, 120) : null };
      }
    } catch {
      /* malformed href — keep scanning */
    }
  }
  return { found: false, rel: null };
}

// ---------------------------------------------------------------------------
// Reciprocity advisory (Google "excessive link exchanges" guard)
// ---------------------------------------------------------------------------

/**
 * True when a would-be placement completes a plain A↔B swap that is already
 * live in the other direction. Advisory, never a hard block — the UI shows
 * the policy note and lets the human decide.
 */
export function isReciprocalSwap(
  matches: { partnerSite: string; direction: "outbound" | "inbound"; status: MatchStatus }[],
  partnerSite: string,
  direction: "outbound" | "inbound",
): boolean {
  const other = direction === "outbound" ? "inbound" : "outbound";
  return matches.some(
    (m) =>
      sameSite(m.partnerSite, partnerSite) && m.direction === other && m.status === "live_verified",
  );
}

// ---------------------------------------------------------------------------
// Introduction email (per recipient language; plain text, human-editable)
// ---------------------------------------------------------------------------

const INTRO: Record<
  string,
  (a: { fromName: string; fromSite: string; toSite: string; topics: string[] }) => {
    subject: string;
    body: string;
  }
> = {
  en: (a) => ({
    subject: `Content partnership idea: ${a.fromName} × ${hostOf(a.toSite)}`,
    body: `Hi,\n\nI run ${a.fromName} (${a.fromSite}). We publish practical content around ${a.topics.slice(0, 3).join(", ")} — close to what you cover on ${hostOf(a.toSite)}.\n\nWould you be open to referencing each other where it genuinely helps readers — a relevant guide of yours we can cite, and a page of ours that fits your content? No mass exchanges — one good, relevant link each way at most.\n\nHappy to suggest concrete pages.\n\nBest regards`,
  }),
  pl: (a) => ({
    subject: `Pomysł na partnerstwo treści: ${a.fromName} × ${hostOf(a.toSite)}`,
    body: `Dzień dobry,\n\nprowadzę ${a.fromName} (${a.fromSite}). Publikujemy praktyczne treści o ${a.topics.slice(0, 3).join(", ")} — blisko tematów z ${hostOf(a.toSite)}.\n\nCzy byliby Państwo otwarci na wzajemne odwołania tam, gdzie realnie pomagają czytelnikom — Państwa poradnik, który możemy zacytować, i nasza strona pasująca do Państwa treści? Bez masowej wymiany — maksymalnie jeden dobry, trafny link w każdą stronę.\n\nChętnie zaproponuję konkretne strony.\n\nPozdrawiam`,
  }),
  sv: (a) => ({
    subject: `Idé om innehållssamarbete: ${a.fromName} × ${hostOf(a.toSite)}`,
    body: `Hej,\n\njag driver ${a.fromName} (${a.fromSite}). Vi publicerar praktiskt innehåll om ${a.topics.slice(0, 3).join(", ")} — nära det ni täcker på ${hostOf(a.toSite)}.\n\nSkulle ni vara öppna för att hänvisa till varandra där det verkligen hjälper läsarna — en relevant guide från er som vi kan citera, och en sida från oss som passar ert innehåll? Inga massutbyten — högst en bra, relevant länk åt varje håll.\n\nJag föreslår gärna konkreta sidor.\n\nVänliga hälsningar`,
  }),
  da: (a) => ({
    subject: `Idé til indholdssamarbejde: ${a.fromName} × ${hostOf(a.toSite)}`,
    body: `Hej,\n\njeg driver ${a.fromName} (${a.fromSite}). Vi udgiver praktisk indhold om ${a.topics.slice(0, 3).join(", ")} — tæt på det, I dækker på ${hostOf(a.toSite)}.\n\nVille I være åbne for at henvise til hinanden, hvor det reelt hjælper læserne — en relevant guide fra jer, som vi kan citere, og en side fra os, der passer til jeres indhold? Ingen masseudveksling — højst ét godt, relevant link hver vej.\n\nJeg foreslår gerne konkrete sider.\n\nVenlig hilsen`,
  }),
};

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export function introEmail(args: {
  language: string;
  fromName: string;
  fromSite: string;
  toSite: string;
  topics: string[];
}): { subject: string; body: string } {
  const make = INTRO[args.language] ?? INTRO.en;
  return make(args);
}
