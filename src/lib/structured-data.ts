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
}

export interface FaqPair {
  question: string;
  answer: string;
}

/**
 * Extract FAQ Q&A pairs from the VISIBLE markdown body. A heading (##–######)
 * whose text ends in "?" is a question; the text up to the next heading is its
 * answer. Only pairs with both a question and a non-empty answer are returned,
 * so nothing is invented and every schema entry is visible on the page.
 */
export function extractFaqFromMarkdown(md: string): FaqPair[] {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const faqs: FaqPair[] = [];
  let i = 0;
  while (i < lines.length) {
    const h = lines[i].trim().match(/^#{2,6}\s+(.*\?)\s*$/);
    if (h) {
      const question = h[1].trim();
      const answerLines: string[] = [];
      i++;
      while (i < lines.length && !/^#{1,6}\s+/.test(lines[i].trim())) {
        const t = lines[i].trim();
        if (t) answerLines.push(t);
        i++;
      }
      const answer = answerLines.join(" ").trim();
      if (question && answer) faqs.push({ question, answer });
      continue;
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
