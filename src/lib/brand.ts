/**
 * Brand Intelligence / Content Memory v1 — prompt block builder + helpers.
 *
 * Produces a compact "Brand Intelligence" block injected into the shared
 * project brief so content generation, Improve draft and Milo Score all become
 * brand-aware. Kept short on purpose: lists are capped so prompts stay lean.
 */
import type { Project, BrandIntelligence, BrandOffer, BrandInternalLink } from "./types";

const CAP = 10;

const list = (arr: string[] | undefined, cap = CAP): string =>
  (arr ?? []).map((s) => s.trim()).filter(Boolean).slice(0, cap).join("; ");

function offerLine(o: BrandOffer): string {
  const parts = [`${o.name} (${o.type}, ${o.priority})`];
  if (o.description) parts.push(`— ${o.description}`);
  if (o.url) parts.push(`[${o.url}]`);
  return parts.join(" ");
}

function linkLine(l: BrandInternalLink): string {
  return `${l.label} -> ${l.url} (${l.type}, ${l.priority})`;
}

/** True when a project has any meaningful Brand Intelligence to inject. */
export function hasBrandIntelligence(p: Project): boolean {
  const b = p.brandIntelligence;
  if (!b) return false;
  return Boolean(
    b.voice?.tone ||
      b.voice?.styleNotes ||
      b.voice?.wordsToUse?.length ||
      b.voice?.wordsToAvoid?.length ||
      b.claims?.allowedClaims?.length ||
      b.claims?.forbiddenClaims?.length ||
      b.claims?.requiredCaveats?.length ||
      b.offers?.primaryOffers?.length ||
      b.offers?.secondaryOffers?.length ||
      b.proof?.proofPoints?.length ||
      b.proof?.credentials?.length ||
      b.proof?.trustSignals?.length ||
      b.proof?.testimonialsNotes ||
      b.ctas?.primaryCtaLabel ||
      b.ctas?.secondaryCtaLabel ||
      b.ctas?.ctaStyleNotes ||
      b.internalLinks?.length ||
      b.marketLanguageRules?.length ||
      b.avoid?.length,
  );
}

/**
 * Compact Brand Intelligence prompt block. Returns "" when the project has no
 * brand data (so older projects produce identical prompts to before).
 */
export function brandIntelligenceBlock(p: Project): string {
  const b: BrandIntelligence | undefined = p.brandIntelligence;
  if (!b || !hasBrandIntelligence(p)) return "";

  const lines: string[] = [];
  if (b.voice?.tone) lines.push(`Tone: ${b.voice.tone}`);
  if (b.voice?.styleNotes) lines.push(`Style notes: ${b.voice.styleNotes}`);
  if (b.voice?.wordsToUse?.length) lines.push(`Words to use: ${list(b.voice.wordsToUse)}`);
  if (b.voice?.wordsToAvoid?.length) lines.push(`Words to avoid: ${list(b.voice.wordsToAvoid)}`);
  if (b.claims?.allowedClaims?.length) lines.push(`Allowed claims: ${list(b.claims.allowedClaims)}`);
  if (b.claims?.forbiddenClaims?.length) lines.push(`Forbidden claims (NEVER make these): ${list(b.claims.forbiddenClaims)}`);
  if (b.claims?.requiredCaveats?.length) lines.push(`Required caveats (include where relevant): ${list(b.claims.requiredCaveats)}`);

  const primary = (b.offers?.primaryOffers ?? []).slice(0, 6).map(offerLine);
  if (primary.length) lines.push(`Primary offers (prefer these): ${primary.join(" | ")}`);
  const secondary = (b.offers?.secondaryOffers ?? []).slice(0, 4).map(offerLine);
  if (secondary.length) lines.push(`Secondary offers: ${secondary.join(" | ")}`);

  if (b.proof?.proofPoints?.length) lines.push(`Proof points (do NOT invent beyond these): ${list(b.proof.proofPoints)}`);
  if (b.proof?.credentials?.length) lines.push(`Credentials: ${list(b.proof.credentials)}`);
  if (b.proof?.trustSignals?.length) lines.push(`Trust signals: ${list(b.proof.trustSignals)}`);
  if (b.proof?.testimonialsNotes) lines.push(`Testimonials notes: ${b.proof.testimonialsNotes}`);

  const cta: string[] = [];
  if (b.ctas?.primaryCtaLabel) cta.push(`primary "${b.ctas.primaryCtaLabel}"${b.ctas.primaryCtaUrl ? ` -> ${b.ctas.primaryCtaUrl}` : ""}`);
  if (b.ctas?.secondaryCtaLabel) cta.push(`secondary "${b.ctas.secondaryCtaLabel}"${b.ctas.secondaryCtaUrl ? ` -> ${b.ctas.secondaryCtaUrl}` : ""}`);
  if (b.ctas?.ctaStyleNotes) cta.push(`style: ${b.ctas.ctaStyleNotes}`);
  if (cta.length) lines.push(`CTA preferences: ${cta.join("; ")}`);

  const links = (b.internalLinks ?? [])
    .slice()
    .sort((a, c) => (a.priority === "high" ? -1 : 0) - (c.priority === "high" ? -1 : 0))
    .slice(0, 8)
    .map(linkLine);
  if (links.length) lines.push(`Internal link targets (prefer high priority, only where relevant): ${links.join(" | ")}`);

  const rules = (b.marketLanguageRules ?? [])
    .slice(0, 6)
    .map((r) => `[${[r.market, r.language].filter(Boolean).join("/") || "all"}] ${r.notes ?? ""}`.trim())
    .filter((s) => s.length > 4);
  if (rules.length) lines.push(`Market/language rules: ${rules.join(" | ")}`);

  if (b.avoid?.length) lines.push(`Things to avoid: ${list(b.avoid)}`);

  if (!lines.length) return "";

  return `\nBrand Intelligence (follow strictly):\n${lines.map((l) => `- ${l}`).join("\n")}
Brand rules: obey forbidden claims and the avoid list strictly; prefer primary offers and high-priority internal links; use the CTA preferences; never invent proof points, credentials or testimonials; do not add medical/legal/financial claims unless explicitly supported above.`;
}
