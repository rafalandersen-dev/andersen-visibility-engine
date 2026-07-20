/**
 * The ONE canonical assembler — Article Studio 2.0 / P1.1, sub-epic B.
 *
 * Governing principle (DECISION-LOG D12, ARTICLE-STUDIO-2.0 §2): there is exactly
 * one assembled content asset, and it is the SOLE input to scoring, preview,
 * export, publishing and structured data. This module is that single producer:
 * it composes the canonical markdown from the asset's typed fields, then derives
 * the published/preview HTML and the JSON-LD from that SAME string — so "what you
 * see is what publishes", identically on every connector.
 *
 * Invariant (pinned by content-assembler.test.ts): for a legacy asset carrying
 * none of the Article-Studio-2.0 fields, the output is byte-identical to the
 * pre-P1.1 path (`markdownToHtml(asset.markdown)` + `contentStructuredData`).
 * Later sub-epics add composition by extending `composeCanonicalMarkdown` only —
 * every downstream consumer already reads the assembler, so a new composed
 * section flows to publish + score + preview + schema at once, with no second
 * source of truth.
 *
 * Composed as canonical markdown (ARTICLE-STUDIO-2.0 §2, implementation 1) rather
 * than a structured document model: it reuses the P0 deterministic renderers
 * (`markdownToHtml`, `buildContentJsonLd`) unchanged — only their INPUT changes
 * from hand-authored `asset.markdown` to assembled canonical markdown.
 */
import type { ContentAsset, Project } from "./types";
import { markdownToHtml } from "./markdown";
import { buildContentJsonLd, renderJsonLdScript } from "./structured-data";

export interface AssembleOptions {
  /**
   * Active internal-path set (VERIFIED ∪ USER_APPROVED) used to render relative
   * internal links (link-safety three-state, D26). Omitted → no relative internal
   * link renders active (fail-closed), which is correct for the JSON-LD-only path
   * where the HTML is not published.
   */
  activeInternalPaths?: Set<string>;
}

export interface AssembledOutput {
  /** The canonical composed markdown — the scorer input and custom-endpoint body. */
  markdown: string;
  /** `markdownToHtml(markdown)` — the preview/export/WordPress/Shopify body. */
  html: string;
  /** The deterministic schema.org JSON-LD objects (Article [+ FAQPage]). */
  jsonLd: Record<string, unknown>[];
  /** The rendered `<script type="application/ld+json">` block connectors append. */
  jsonLdScript: string;
}

/**
 * Compose the canonical body markdown from the asset's typed fields.
 *
 * B ships the visible TL;DR + key-takeaways composition (D11 — a visible summary
 * helps readers; the markup carries no "AI signal" claim) and a byte-identical
 * pass-through when neither is present. FAQ and CTA are already authored INTO
 * `markdown` by generation, so they are deliberately NOT re-appended here (no
 * double-composition). author (F), sources (C) and images (G) composition extend
 * this function in their sub-epics.
 */
export function composeCanonicalMarkdown(asset: ContentAsset, _project: Project): string {
  const lead: string[] = [];
  if (asset.tldr && asset.tldr.trim()) {
    lead.push(`## TL;DR\n\n${asset.tldr.trim()}`);
  }
  const takeaways = (asset.keyTakeaways ?? []).map((k) => k.trim()).filter(Boolean);
  if (takeaways.length) {
    lead.push(`## Key takeaways\n\n${takeaways.map((k) => `- ${k}`).join("\n")}`);
  }
  // Nothing to compose → exact byte parity with the pre-P1.1 published body.
  if (!lead.length) return asset.markdown ?? "";
  const body = (asset.markdown ?? "").trim();
  return [...lead, body].filter(Boolean).join("\n\n");
}

/**
 * Produce the canonical assembled output for an asset: composed markdown, its
 * HTML, and its JSON-LD. The single function every publish/score/preview/export
 * path calls. Pure — no I/O, no store access.
 */
export function assembleContentAsset(
  asset: ContentAsset,
  project: Project,
  opts: AssembleOptions = {},
): AssembledOutput {
  const markdown = composeCanonicalMarkdown(asset, project);
  const html = markdownToHtml(
    markdown,
    opts.activeInternalPaths ? { knownInternalPaths: opts.activeInternalPaths } : undefined,
  );
  // JSON-LD derives from the SAME composed markdown, so schema mirrors exactly
  // what publishes (schema-content consistency — C17). FAQPage is still extracted
  // from a real FAQ section in the body by buildContentJsonLd, unchanged.
  const jsonLd = buildContentJsonLd({
    title: asset.title,
    description: asset.metaDescription ?? "",
    bodyMarkdown: markdown,
    businessName: project.businessName || project.name,
    url: asset.liveUrl,
    datePublished: asset.livePublishedAt,
  });
  const jsonLdScript = renderJsonLdScript(jsonLd);
  return { markdown, html, jsonLd, jsonLdScript };
}
