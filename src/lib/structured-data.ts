import { markdownToHtml } from "./markdown";

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
  /** Internal assembler output, never raw client HTML. FAQ follows this exact rendered body. */
  renderedBodyHtml?: string;
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
  /**
   * The article's representative image URL (P1.2B featured image — social
   * physical asset or the one approved object). Emitted as Article.image only
   * when present; never a signed/preview URL (the assembler guarantees that).
   */
  image?: string;
}

export interface FaqPair {
  question: string;
  answer: string;
}

/** Exact heading aliases across the 24 supported EU content languages. */
export const FAQ_HEADINGS = [
  "FAQ",
  "FAQs",
  "Frequently asked questions",
  "Често задавани въпроси",
  "Često postavljana pitanja",
  "Často kladené otázky",
  "Ofte stillede spørgsmål",
  "Veelgestelde vragen",
  "Korduma kippuvad küsimused",
  "Usein kysytyt kysymykset",
  "Questions fréquentes",
  "Foire aux questions",
  "Häufig gestellte Fragen",
  "Συχνές ερωτήσεις",
  "Gyakran ismételt kérdések",
  "Ceisteanna coitianta",
  "Domande frequenti",
  "Biežāk uzdotie jautājumi",
  "Dažniausiai užduodami klausimai",
  "Mistoqsijiet frekwenti",
  "Najczęściej zadawane pytania",
  "Perguntas frequentes",
  "Întrebări frecvente",
  "Pogosta vprašanja",
  "Preguntas frecuentes",
  "Vanliga frågor",
];
const faqHeadings = new Set(FAQ_HEADINGS.map((h) => h.normalize("NFC").toLowerCase()));

/** Text of our own safe renderer's HTML, not a general-purpose HTML sanitizer.
 * Remove markup BEFORE decoding entities so escaped user tags remain visible text.
 * Block/cell boundaries separate words; inline formatting never inserts spaces.
 */
function renderedText(html: string): string {
  return (
    html
      .replace(/<\/(?:p|li|tr|td|th|h[1-6]|figcaption|figure|div)>|<br\s*\/?>/gi, " ")
      // Quoted URL attributes can contain literal >; those are not tag ends.
      .replace(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g, "")
      .replace(
        /&(amp|lt|gt|quot|#39|apos);/g,
        (_, entity: string) =>
          ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" })[entity]!,
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** FAQ structure and text are read from the exact HTML used by preview/export/CMS.
 * Only actual heading elements open a section; a heading at the same/higher level
 * closes it. Any next heading ends an answer. No side-field questions are added.
 */
export function extractFaqFromRenderedHtml(html: string): FaqPair[] {
  const headings = [...html.matchAll(/<h([1-6])>([\s\S]*?)<\/h\1>/g)];
  const faqs: FaqPair[] = [];
  const seen = new Set<string>();
  let faqLevel = 0;
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const level = Number(heading[1]);
    const text = renderedText(heading[2]);
    if (faqHeadings.has(text.normalize("NFC").toLowerCase())) {
      faqLevel = level;
      continue;
    }
    if (faqLevel && level <= faqLevel) faqLevel = 0;
    if (!faqLevel || !(/[?;]$/.test(text) || (/\p{Script=Greek}/u.test(text) && /;$/.test(text))))
      continue;
    const answer = renderedText(
      html.slice(heading.index! + heading[0].length, headings[i + 1]?.index ?? html.length),
    );
    const key = text.normalize("NFC").toLowerCase();
    if (answer && !seen.has(key)) {
      seen.add(key);
      faqs.push({ question: text, answer });
    }
    if (faqs.length === 20) break;
  }
  return faqs;
}

/** Compatibility entry point uses the same outbound renderer, never another Markdown parser. */
export function extractFaqFromMarkdown(md: string): FaqPair[] {
  return extractFaqFromRenderedHtml(markdownToHtml(md));
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
    if (input.image?.trim()) article.image = input.image.trim();
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

  const faqs = extractFaqFromRenderedHtml(
    input.renderedBodyHtml ?? markdownToHtml(input.bodyMarkdown),
  );
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
