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
import type { ContentAsset, ContentImage, Project } from "./types";
import { markdownToHtml, MILO_IMAGE_TOKEN_PREFIX } from "./markdown";
import {
  compileFigureHtml,
  presentationMarkdown,
  normalizePresentation,
} from "./presentation-compiler";
import {
  compileFeaturedHeroHtml,
  featuredImageActive,
  featuredMarkdown,
  featuredOgImageUrl,
} from "./featured-image";
import { buildContentJsonLd, renderJsonLdScript } from "./structured-data";
import { sourcesBlockMarkdown } from "./sources";
import { authorBlockMarkdown, authorSchemaInput } from "./author";
import { publishableImages, publishableImageUrls, imageMarkdown } from "./images";
import { composeHookMarkdown } from "./hook";
import {
  resolveImageAnchors,
  type ResolvedImageAnchor,
  type ImageAnchorResolution,
} from "./image-anchors";
import type { AnchorKind } from "./anchors";

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

/** Normalise a heading for dedup: lowercase, trim, drop a trailing plural "s". */
function normalizeHeading(h: string): string {
  return h.trim().toLowerCase().replace(/s$/, "");
}

// Aliases are stored ALREADY normalised (singular). Deliberately NOT "summary" or
// "in short" for TL;DR — those are ordinary sections and must not silently
// suppress a real TL;DR (review fix).
export const SECTION_RULES: SectionRule[] = [
  {
    key: "breadcrumb",
    position: "lead",
    headingAliases: ["breadcrumb"],
    build: (a) => {
      const trail = (a.breadcrumbs ?? []).map((b) => b.name?.trim()).filter(Boolean);
      return trail.length ? trail.join(" › ") : "";
    },
  },
  {
    // Article Studio 3.0 / P1.2A — the opening hook composes as a lead PARAGRAPH
    // immediately before the TL;DR. It has no heading, so there is no heading
    // alias to dedup against: the v3 contract keeps the hook out of the generated
    // body, so the assembler emits `asset.hook` exactly once here. (Legacy upgrade
    // uses the explicit detectPossibleHookDuplicate check, never a fuzzy match.)
    key: "hook",
    position: "lead",
    headingAliases: [],
    build: (a) => composeHookMarkdown(a.hook),
  },
  {
    key: "tldr",
    position: "lead",
    headingAliases: ["tl;dr", "tldr"],
    build: (a) => (a.tldr && a.tldr.trim() ? `## TL;DR\n\n${a.tldr.trim()}` : ""),
  },
  {
    key: "keyTakeaways",
    position: "lead",
    headingAliases: ["key takeaway", "key point", "takeaway"],
    build: (a) => {
      const items = (a.keyTakeaways ?? []).map((k) => k.trim()).filter(Boolean);
      return items.length ? `## Key takeaways\n\n${items.map((k) => `- ${k}`).join("\n")}` : "";
    },
  },
  {
    key: "sources",
    position: "tail",
    headingAliases: ["source", "reference", "citation"],
    build: (a) => sourcesBlockMarkdown(a.sources),
  },
  {
    key: "author",
    position: "tail",
    headingAliases: ["about the author", "author", "the author"],
    build: (a) => authorBlockMarkdown(a.author),
  },
];

/** Normalised set of the body's heading texts — used to suppress duplicate sections. */
function bodyHeadingSet(md: string): Set<string> {
  const set = new Set<string>();
  for (const line of (md || "").split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) set.add(normalizeHeading(m[1]));
  }
  return set;
}

/**
 * Which composed sections a rule set includes for an asset, and why. Drives the
 * editor's transparency, the publishing checklist AND the schema-visibility gate
 * (author/breadcrumb JSON-LD is only emitted when its section is actually
 * composed). A section is `included` only when it has content AND is not already
 * present in the body.
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
 * A token id must round-trip the `[^)\s]+` capture used by every resolver (the
 * markdown block/inline branches and detokenizeMarkdown), so it must contain no
 * `)` or whitespace and be non-empty. Ids are `crypto.randomUUID()` today (always
 * safe); this guard is defence-in-depth — an unsafe id degrades to a legacy image
 * (no token, no leak) rather than emitting an unresolvable token.
 */
const TOKEN_SAFE_ID = /^[^)\s]+$/;

/**
 * The identity-token id for an ACTIVE featured image (P1.2B), namespaced so it
 * can never collide with an inline ContentImage id in the presented maps. Null
 * when the featured image is absent/unapproved/incomplete or its id is not
 * token-safe — every null falls back to the legacy featured rendering.
 */
function featuredTokenId(asset: ContentAsset): string | null {
  if (!featuredImageActive(asset)) return null;
  const id = asset.featuredImage!.imageId;
  return TOKEN_SAFE_ID.test(id) ? `feat-${id}` : null;
}

/**
 * Compose one image as markdown. A PRESENTED image (P1.2D) emits an internal
 * identity token `![](milo-image:<id>)` resolved BY ID at render time; every other
 * image keeps the legacy `![alt](url)` (byte-identical to before P1.2D). The token
 * never leaks — assembleContentAsset detokenizes it for the markdown output and the
 * HTML renderer swaps it for the compiled figure.
 *
 * The token carries NO alt on purpose: the real alt is supplied by the resolved
 * figure (compileFigureHtml) and the degraded markdown (presentationMarkdown), so
 * an EMPTY token alt keeps the `[^\]]*` alt capture matchable even when the real alt
 * contains `]` or a newline — which would otherwise break resolution and leak the
 * raw `milo-image:<id>` token (and silently drop the figure) into published output.
 */
function composeImage(image: ContentImage): string {
  // Ids beginning with "feat-" are reserved for the featured-hero namespace
  // (defence-in-depth: inline ids are randomUUIDs today, but a crafted id must
  // never be able to alias the featured map entry). Such an image degrades to
  // the legacy markdown path — rendered, just not token-presented.
  if (image.presentation && TOKEN_SAFE_ID.test(image.id) && !image.id.startsWith("feat-")) {
    return `![](${MILO_IMAGE_TOKEN_PREFIX}${image.id})`;
  }
  return imageMarkdown(image);
}

/** Publishable images resolved to one anchor kind, ordered by `order` asc then id asc (deterministic). */
function orderedImages(anchored: ResolvedImageAnchor[], kind: AnchorKind): string[] {
  return anchored
    .filter((a) => a.status === "resolved" && a.anchor?.kind === kind)
    .sort(
      (a, b) =>
        (a.image.order ?? 0) - (b.image.order ?? 0) ||
        (a.image.id < b.image.id ? -1 : a.image.id > b.image.id ? 1 : 0),
    )
    .map((a) => composeImage(a.image));
}

/**
 * Weave the resolved before/after-section + before-faq/before-cta images into the
 * (already image-stripped) body at deterministic character offsets. Same anchor
 * point → ordered by `order` then image id. Never mutates; broken/ambiguous images
 * are simply absent from the resolution's resolved set, so they are excluded.
 */
function weaveBody(res: ImageAnchorResolution): string {
  const body = res.strippedBody;
  const lines = body.split("\n");
  const lineOffset: number[] = [];
  let acc = 0;
  for (const l of lines) {
    lineOffset.push(acc);
    acc += l.length + 1; // + newline
  }
  const offsetOfLine = (i: number) => (i < lineOffset.length ? lineOffset[i] : body.length);
  const inserts: { offset: number; md: string; rank: number; order: number; id: string }[] = [];
  for (const a of res.anchored) {
    if (a.status !== "resolved" || !a.anchor || !a.section) continue;
    const k = a.anchor.kind;
    let offset: number | null = null;
    if (k === "before-section" || k === "before-faq" || k === "before-cta") {
      offset = offsetOfLine(a.section.headingLineIdx);
    } else if (k === "after-section") {
      offset = offsetOfLine(a.section.subtreeEndLineIdx);
    }
    if (offset === null) continue;
    inserts.push({
      offset,
      md: composeImage(a.image),
      // A closing subtree's after-section images belong ABOVE the next
      // heading's before-* images when both land on the same character offset
      // — the order the Arrange surface displays (P1.2E review M2).
      rank: k === "after-section" ? 0 : 1,
      order: a.image.order ?? 0,
      id: a.image.id,
    });
  }
  // Legacy byte-parity (finding #2): with nothing to weave, return the stripped body
  // UNCHANGED — no `\n{3,}` collapse — so an asset with images but no anchors matches
  // the pre-P1.2C append-after-body output exactly. The collapse below only tidies the
  // blank lines that image INSERTIONS introduce.
  if (inserts.length === 0) return body;
  inserts.sort(
    (x, y) =>
      x.offset - y.offset ||
      x.rank - y.rank ||
      x.order - y.order ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  let cursor = 0;
  const parts: string[] = [];
  for (const ins of inserts) {
    parts.push(body.slice(cursor, ins.offset));
    parts.push(`\n\n${ins.md}\n\n`);
    cursor = ins.offset;
  }
  parts.push(body.slice(cursor));
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Compose the canonical body markdown from the asset's typed fields via the
 * deterministic SECTION_RULES, weaving anchored inline images (P1.2C) at their
 * resolved positions. A section is added only when it has content AND is not already
 * present in the body. With no composed section AND no images the output is
 * byte-identical to the pre-P1.1 body; with images but NO anchors it is byte-identical
 * to the P1.1 append-after-body behaviour (legacy parity).
 */
export function composeCanonicalMarkdown(asset: ContentAsset, project: Project): string {
  const body = asset.markdown ?? "";
  const existing = bodyHeadingSet(body);
  const lead: { key: string; md: string }[] = [];
  const tail: string[] = [];
  for (const rule of SECTION_RULES) {
    if (rule.headingAliases.some((h) => existing.has(h))) continue; // never duplicate a section
    const md = rule.build(asset, project);
    if (!md) continue; // deterministic inclusion — skip empty/filler
    if (rule.position === "lead") lead.push({ key: rule.key, md });
    else tail.push(md);
  }
  // Images: only PUBLISHABLE (approved + alt + controlled-origin) images compose.
  // A featured image sits at the very top; inline images are woven at their anchor
  // (P1.2C) or, when un-anchored, appended after the body (legacy). When any image
  // composes, RAW body images are stripped first so a body reference to an approved
  // URL can neither duplicate nor bypass the alt gate.
  const pub = publishableImages(asset.images, project);
  // P1.2B: an ACTIVE FeaturedImage renders as the compiled hero via the same
  // identity-token mechanism as presented inline images, REPLACING the legacy
  // placement:"featured" line. Absent/unapproved → legacy path, byte-identical.
  const featTok = featuredTokenId(asset);
  const featured = featTok
    ? [`![](${MILO_IMAGE_TOKEN_PREFIX}${featTok})`]
    : featuredImageActive(asset)
      ? // ACTIVE featured image with a token-unsafe id: degrade to its literal
        // markdown (image still renders) — never silently drop the hero while
        // JSON-LD keeps claiming it.
        [featuredMarkdown(asset.featuredImage!)]
      : pub
          .filter((i) => i.placement === "featured")
          .slice(0, 1)
          .map(composeImage);
  // Anchor resolution runs only when there are publishable images (so a legacy asset
  // with none keeps its raw body untouched).
  const res = pub.length ? resolveImageAnchors(asset, project) : null;
  const anchored = res?.anchored ?? [];

  // Lead: inject before-hook / after-hook images around the composed hook block.
  const beforeHook = orderedImages(anchored, "before-hook");
  const afterHook = orderedImages(anchored, "after-hook");
  const leadMd: string[] = [];
  for (const { key, md } of lead) {
    if (key === "hook") leadMd.push(...beforeHook, md, ...afterHook);
    else leadMd.push(md);
  }

  // Body: woven when there are publishable images, raw otherwise.
  const composedBody = res ? weaveBody(res) : body;
  // After the body: legacy un-anchored inline images, then article-end anchored images.
  const trailing = res
    ? [...res.unanchored.map(composeImage), ...orderedImages(anchored, "article-end")]
    : [];

  if (
    !leadMd.length &&
    !tail.length &&
    !featured.length &&
    !trailing.length &&
    composedBody === body
  ) {
    return body;
  }
  return [...featured, ...leadMd, composedBody.trim(), ...trailing, ...tail]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Produce the canonical assembled output for an asset: composed markdown, its
 * HTML, and its JSON-LD. The single function every publish/score/preview/export
 * path calls. Pure — no I/O, no store access.
 */
/** Replace every presentation identity token with its degraded real-URL markdown (no token leaks). */
function detokenizeMarkdown(tokenMarkdown: string, presentedMarkdown: Map<string, string>): string {
  return tokenMarkdown.replace(
    /!\[[^\]]*\]\(milo-image:([^)\s]+)\)/g,
    (_whole, id: string) => presentedMarkdown.get(id) ?? "",
  );
}

export function assembleContentAsset(
  asset: ContentAsset,
  project: Project,
  opts: AssembleOptions = {},
): AssembledOutput {
  // The intermediate composition carries `milo-image:<id>` identity tokens for
  // PRESENTED images (P1.2D); it is never the final output.
  const tokenMarkdown = composeCanonicalMarkdown(asset, project);
  // Compile each presented publishable image once (by id): a safe <figure> for HTML
  // and degraded `![alt](url)` for markdown.
  const presentedHtml = new Map<string, string>();
  const presentedMarkdown = new Map<string, string>();
  for (const img of publishableImages(asset.images, project)) {
    if (!img.presentation) continue;
    const p = normalizePresentation(img.presentation);
    presentedHtml.set(img.id, compileFigureHtml(img, p));
    presentedMarkdown.set(img.id, presentationMarkdown(img, p));
  }
  // P1.2B: the featured hero rides the same token channel under a namespaced id
  // (`feat-<imageId>`), so it can never collide with an inline image entry.
  const featTok = featuredTokenId(asset);
  if (featTok) {
    presentedHtml.set(featTok, compileFeaturedHeroHtml(asset.featuredImage!));
    presentedMarkdown.set(featTok, featuredMarkdown(asset.featuredImage!));
  }
  // Final canonical markdown = detokenized (real URLs + degraded caption); no token leaks.
  const markdown = detokenizeMarkdown(tokenMarkdown, presentedMarkdown);
  const html = markdownToHtml(tokenMarkdown, {
    ...(opts.activeInternalPaths ? { knownInternalPaths: opts.activeInternalPaths } : {}),
    // Only assembler-vetted images render as <img>; presented images render as their
    // compiled <figure>; everything else is stripped.
    allowedImageUrls: new Set(publishableImageUrls(asset.images, project)),
    presentedImages: presentedHtml,
  });
  // Schema-visibility gate (review fix): author Person + BreadcrumbList are only
  // emitted when their VISIBLE counterpart is actually composed into the body —
  // never claiming a byline or trail the reader cannot see. FAQPage is still
  // extracted from the visible FAQ in the body by buildContentJsonLd.
  const sections = assemblySections(asset, project);
  const composed = (key: string) => sections.some((s) => s.key === key && s.included);
  const jsonLd = buildContentJsonLd({
    title: asset.title,
    description: asset.metaDescription ?? "",
    bodyMarkdown: markdown,
    businessName: project.businessName || project.name,
    url: asset.liveUrl,
    datePublished: asset.livePublishedAt,
    author: composed("author") ? authorSchemaInput(asset.author) : undefined,
    breadcrumbs: composed("breadcrumb") ? asset.breadcrumbs : undefined,
    // P1.2B: the article's representative image (social physical asset wins,
    // else the one approved object). Empty/absent featured → no image claim.
    image: featuredOgImageUrl(asset) || undefined,
  });
  const jsonLdScript = renderJsonLdScript(jsonLd);
  return { markdown, html, jsonLd, jsonLdScript };
}
