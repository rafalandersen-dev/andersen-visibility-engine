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
import { sourcesBlockMarkdown } from "./sources";
import { authorBlockMarkdown, authorSchemaInput } from "./author";
import { publishableImages, publishableImageUrls, imageMarkdown } from "./images";

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
 * The deterministic section-composition rules (E). Each rule has an explicit
 * PURPOSE (`key`), a deterministic inclusion predicate (`build` returns "" to
 * skip — no empty/filler sections, and no heading is ever added just to lift a
 * score), and heading aliases that SUPPRESS the section when the body already
 * contains one, so a section is never duplicated (TL;DR / key-takeaways /
 * sources / author). FAQ and CTA are authored into the body by generation and
 * are never re-composed here.
 */
export interface SectionRule {
  key: string;
  position: "lead" | "tail";
  /** Lowercased heading texts that, if present in the body, suppress this section. */
  headingAliases: string[];
  build: (asset: ContentAsset, project: Project) => string;
}

export const SECTION_RULES: SectionRule[] = [
  {
    key: "tldr",
    position: "lead",
    headingAliases: ["tl;dr", "tldr", "summary", "in short"],
    build: (a) => (a.tldr && a.tldr.trim() ? `## TL;DR\n\n${a.tldr.trim()}` : ""),
  },
  {
    key: "keyTakeaways",
    position: "lead",
    headingAliases: ["key takeaways", "key points", "takeaways"],
    build: (a) => {
      const items = (a.keyTakeaways ?? []).map((k) => k.trim()).filter(Boolean);
      return items.length ? `## Key takeaways\n\n${items.map((k) => `- ${k}`).join("\n")}` : "";
    },
  },
  {
    key: "sources",
    position: "tail",
    headingAliases: ["sources", "references", "citations"],
    build: (a) => sourcesBlockMarkdown(a.sources),
  },
  {
    key: "author",
    position: "tail",
    headingAliases: ["about the author", "author", "the author"],
    build: (a) => authorBlockMarkdown(a.author),
  },
];

/** Lowercased set of the body's heading texts — used to suppress duplicate sections. */
function bodyHeadingSet(md: string): Set<string> {
  const set = new Set<string>();
  for (const line of (md || "").split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) set.add(m[1].trim().toLowerCase());
  }
  return set;
}

/**
 * Which composed sections a rule set includes for an asset, and why. Drives the
 * editor's transparency + the publishing checklist. A section is `included` only
 * when it has content AND is not already present in the body.
 */
export function assemblySections(
  asset: ContentAsset,
  project: Project,
): { key: string; included: boolean; reason: string }[] {
  const existing = bodyHeadingSet(asset.markdown ?? "");
  return SECTION_RULES.map((rule) => {
    if (rule.headingAliases.some((h) => existing.has(h))) {
      return { key: rule.key, included: false, reason: "already in body" };
    }
    const md = rule.build(asset, project);
    return { key: rule.key, included: Boolean(md), reason: md ? "composed" : "no content" };
  });
}

/**
 * Compose the canonical body markdown from the asset's typed fields via the
 * deterministic SECTION_RULES. A section is added only when it has content AND is
 * not already present in the body (no duplication, no filler headings). With no
 * composed section the output is byte-identical to the pre-P1.1 body.
 */
export function composeCanonicalMarkdown(asset: ContentAsset, project: Project): string {
  const body = asset.markdown ?? "";
  const existing = bodyHeadingSet(body);
  const lead: string[] = [];
  const tail: string[] = [];
  for (const rule of SECTION_RULES) {
    if (rule.headingAliases.some((h) => existing.has(h))) continue; // never duplicate a section
    const md = rule.build(asset, project);
    if (!md) continue; // deterministic inclusion — skip empty/filler
    (rule.position === "lead" ? lead : tail).push(md);
  }
  // Images (G): only PUBLISHABLE (approved + alt + controlled-origin) images
  // compose — a featured image at the very top, inline images right after the
  // body. A legacy asset has none, so this is a no-op (parity preserved).
  const pub = publishableImages(asset.images, project);
  const featured = pub
    .filter((i) => i.placement === "featured")
    .slice(0, 1)
    .map(imageMarkdown);
  const inlineImages = pub.filter((i) => i.placement === "inline").map(imageMarkdown);
  if (!lead.length && !tail.length && !featured.length && !inlineImages.length) return body;
  return [...featured, ...lead, body.trim(), ...inlineImages, ...tail].filter(Boolean).join("\n\n");
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
  const html = markdownToHtml(markdown, {
    ...(opts.activeInternalPaths ? { knownInternalPaths: opts.activeInternalPaths } : {}),
    // Only assembler-vetted images render as <img>; everything else is stripped.
    allowedImageUrls: new Set(publishableImageUrls(asset.images, project)),
  });
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
    author: authorSchemaInput(asset.author),
    breadcrumbs: asset.breadcrumbs,
  });
  const jsonLdScript = renderJsonLdScript(jsonLd);
  return { markdown, html, jsonLd, jsonLdScript };
}
