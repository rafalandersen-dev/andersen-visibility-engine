/**
 * Deterministic structured data (JSON-LD) built from the VISIBLE published
 * content — never from a side-field or an LLM (P0.5).
 *
 * Two guarantees:
 *  - Deterministic: same input → same output, no model call.
 *  - Schema–content consistency: FAQPage entries come ONLY from FAQ questions
 *    that appear in the article body, so the markup never describes content a
 *    reader cannot see. The Article headline/description are the published
 *    title/meta.
 *
 * This delivers structured-data IMPLEMENTATION (and, where the markup qualifies,
 * rich-result ELIGIBILITY). It never guarantees an actual rich-result APPEARANCE
 * — the search engine decides that.
 */

export interface ContentJsonLdInput {
  title: string;
  description?: string;
  bodyMarkdown: string;
  businessName?: string;
  /** Canonical live URL, when known. */
  url?: string;
  datePublished?: string;
  /**
   * Named author (E-E-A-T). When present, Article.author is a Person and the
   * Organization stays the publisher. Only real, user-supplied identity is used —
   * credentials are never invented (F).
   */
  author?: { name: string; url?: string; sameAs?: string[] };
  /** Breadcrumb trail → BreadcrumbList (H). */
  breadcrumbs?: { name: string; url: string }[];
}

export interface FaqPair {
  question: string;
  answer: string;
}

/** A heading that marks the start of a genuine FAQ section. */
const FAQ_SECTION = /^#{1,6}\s+(FAQs?|Frequently\s+asked\s+questions)\s*$/i;

/** Reduce inline markdown to the visible text, so schema text matches the page. */
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> link text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2") // italic
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract FAQ Q&A pairs from the VISIBLE markdown body — but ONLY from inside a
 * genuine FAQ section (a heading "FAQ"/"FAQs"/"Frequently asked questions"). A
 * heading ending in "?" within that section is a question; the text up to the
 * next heading is its answer. This prevents a rhetorical or CTA heading like
 * "## Ready to start?" from being published as FAQPage markup (against Google's
 * FAQ policy). Answer/question text is reduced to visible text so the schema
 * matches what a reader sees. Only pairs with both a question and answer count.
 */
export function extractFaqFromMarkdown(md: string): FaqPair[] {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const faqs: FaqPair[] = [];
  let inFaq = false;
  let faqLevel = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (FAQ_SECTION.test(line)) {
        inFaq = true;
        faqLevel = level;
        i++;
        continue;
      }
      // A heading at or above the FAQ section's level ends the FAQ section.
      if (inFaq && level <= faqLevel) inFaq = false;
      if (inFaq && /\?\s*$/.test(text)) {
        const question = stripInlineMarkdown(text);
        const answerLines: string[] = [];
        i++;
        while (i < lines.length && !/^#{1,6}\s+/.test(lines[i].trim())) {
          const t = lines[i].trim();
          if (t) answerLines.push(t);
          i++;
        }
        const answer = stripInlineMarkdown(answerLines.join(" ").trim());
        if (question && answer) faqs.push({ question, answer });
        continue;
      }
    }
    i++;
  }
  return faqs.slice(0, 20);
}

/** Build the JSON-LD objects (Article + optional FAQPage) for a content asset. */
export function buildContentJsonLd(input: ContentJsonLdInput): Record<string, unknown>[] {
  const objs: Record<string, unknown>[] = [];

  const title = (input.title || "").trim();
  if (title) {
    const article: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title.slice(0, 110),
    };
    if (input.description?.trim()) article.description = input.description.trim();
    if (input.url?.trim()) article.mainEntityOfPage = input.url.trim();
    if (input.datePublished?.trim()) article.datePublished = input.datePublished.trim();
    if (input.businessName?.trim()) {
      const org = { "@type": "Organization", name: input.businessName.trim() };
      article.publisher = org;
      article.author = org;
    }
    // A named human author (E-E-A-T) overrides the Organization as the author,
    // matching the visible "About the author" byline. Never invented (F).
    if (input.author && input.author.name.trim()) {
      const person: Record<string, unknown> = {
        "@type": "Person",
        name: input.author.name.trim(),
      };
      if (input.author.url?.trim()) person.url = input.author.url.trim();
      const sameAs = (input.author.sameAs ?? []).map((s) => s.trim()).filter(Boolean);
      if (sameAs.length) person.sameAs = sameAs;
      article.author = person;
    }
    objs.push(article);
  }

  const faqs = extractFaqFromMarkdown(input.bodyMarkdown);
  if (faqs.length) {
    objs.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  // BreadcrumbList (H) — the page's position in the site hierarchy. One list only.
  const crumbs = (input.breadcrumbs ?? []).filter((b) => b.name?.trim() && b.url?.trim());
  if (crumbs.length) {
    objs.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name.trim(),
        item: b.url.trim(),
      })),
    });
  }

  return objs;
}

/** Render JSON-LD objects to <script> tags, escaping "<" so the JSON can't break out. */
export function renderJsonLdScript(objs: Record<string, unknown>[]): string {
  if (!objs.length) return "";
  return objs
    .map(
      (o) =>
        `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`,
    )
    .join("");
}

/** Convenience: build + render in one call. Returns "" when there's nothing to emit. */
export function contentJsonLdScript(input: ContentJsonLdInput): string {
  return renderJsonLdScript(buildContentJsonLd(input));
}
