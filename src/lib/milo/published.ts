// Public view of published Milo articles (pure helpers, no I/O).
import { SITE_ORIGIN } from "../locales";
import { isSafeImageSrc, type BlogSection } from "./markdown";

export interface PublishedRow {
  slug: string;
  title: string;
  meta_title: string;
  meta_description: string;
  published_at: string;
  updated_at: string;
  sections?: unknown;
}

export const LIST_COLUMNS = "slug,title,meta_title,meta_description,published_at,updated_at";
export const POST_COLUMNS = `${LIST_COLUMNS},sections`;

const SECTION_TYPES = new Set(["p", "h2", "h3", "ul", "ol", "table", "quote", "image"]);
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** Defensive re-validation of stored sections before they reach the page. */
export function safeSections(value: unknown): BlogSection[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is BlogSection => {
    if (!s || typeof s !== "object" || !SECTION_TYPES.has((s as { type: string }).type))
      return false;
    const x = s as Record<string, unknown>;
    switch (x.type) {
      case "ul":
      case "ol":
        return isStrArr(x.items);
      case "table":
        return isStrArr(x.headers) && Array.isArray(x.rows) && x.rows.every(isStrArr);
      case "image":
        return (
          isStr(x.src) &&
          isSafeImageSrc(x.src) &&
          isStr(x.alt) &&
          (x.caption === undefined || isStr(x.caption))
        );
      default:
        return isStr(x.text);
    }
  });
}

const plainText = (t: string) =>
  t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");

/** Description fallback when Milo sent none: first paragraph, at most 160 characters. */
export function excerpt(sections: BlogSection[]): string {
  const first = sections.find((s) => s.type === "p");
  if (!first || first.type !== "p") return "";
  const text = plainText(first.text);
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
}

/**
 * Question and answer pairs from an "FAQ" or "Frequently asked questions" h2:
 * each h3 is a question, the paragraphs and lists after it are the answer.
 */
export function faqFromSections(sections: BlogSection[]): { q: string; a: string }[] {
  const start = sections.findIndex(
    (s) => s.type === "h2" && /\b(faq|faqs|frequently asked)/i.test(s.text),
  );
  if (start < 0) return [];
  const out: { q: string; a: string }[] = [];
  let current: { q: string; parts: string[] } | null = null;
  const close = () => {
    if (current && current.parts.length) out.push({ q: current.q, a: current.parts.join(" ") });
  };
  for (const s of sections.slice(start + 1)) {
    if (s.type === "h2") break;
    if (s.type === "h3") {
      close();
      current = { q: s.text, parts: [] };
    } else if (current && (s.type === "p" || s.type === "quote")) {
      current.parts.push(plainText(s.text));
    } else if (current && (s.type === "ul" || s.type === "ol")) {
      current.parts.push(s.items.map(plainText).join("; "));
    }
  }
  close();
  return out;
}

export interface BlogPostView {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  sections: BlogSection[];
}

export function toPostView(row: PublishedRow): BlogPostView {
  const sections = safeSections(row.sections);
  const publishedAt = row.published_at.slice(0, 10);
  const updated = row.updated_at.slice(0, 10);
  return {
    slug: row.slug,
    title: row.title,
    seoTitle: row.meta_title.trim() || `${row.title} | Milo Growth`,
    description: row.meta_description.trim() || excerpt(sections),
    publishedAt,
    ...(updated > publishedAt ? { updatedAt: updated } : {}),
    sections,
  };
}

/** Article and (when the article has an FAQ block) FAQPage structured data. */
export function articleJsonLd(post: BlogPostView): Record<string, unknown>[] {
  const url = `${SITE_ORIGIN}/blog/${post.slug}`;
  const publisher = { "@type": "Organization", name: "Milo Growth" };
  const out: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      inLanguage: "en",
      datePublished: post.publishedAt,
      dateModified: post.updatedAt ?? post.publishedAt,
      author: publisher,
      publisher,
      mainEntityOfPage: url,
    },
  ];
  const faq = faqFromSections(post.sections);
  if (faq.length) {
    out.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  }
  return out;
}
