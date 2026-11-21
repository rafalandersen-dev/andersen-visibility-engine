// =============================================================================
// Safe Markdown to BlogSection[] conversion for Milo articles.
// Output is plain structured data rendered by <BlogArticleBody> through React
// (auto-escaped). Nothing is injected as HTML and nothing is fetched.
//
// Approved content is never silently dropped: anything that cannot be
// represented safely (raw HTML, unsafe link/image URLs, images in unsupported
// positions, oversize lists/tables/documents) rejects the whole draft with an
// explicit code so the sender can fix it.
// =============================================================================

/** Inline text supports a minimal markdown subset: [label](href) and **bold**. */
export type BlogSection =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "image"; src: string; alt: string; caption?: string };

export const MARKDOWN_LIMITS = {
  sections: 400,
  listItems: 100,
  tableRows: 200,
  tableColumns: 12,
  altLength: 300,
  captionLength: 500,
} as const;

export type MarkdownRejectCode =
  | "raw_html_not_supported"
  | "unsafe_link_url"
  | "unsafe_image_url"
  | "unsupported_image_position"
  | "content_too_long"
  | "list_too_long"
  | "table_too_long"
  | "table_too_wide"
  | "table_shape_invalid"
  | "image_text_too_long";

export class MarkdownRejected extends Error {
  code: MarkdownRejectCode;
  constructor(code: MarkdownRejectCode) {
    super(code);
    this.code = code;
  }
}

const reject = (code: MarkdownRejectCode): never => {
  throw new MarkdownRejected(code);
};

/** http(s), mailto, or a site-relative path ("/x", not "//host"). */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  if (/^\/(?!\/)/.test(h)) return !/[\s\\<>"'`]/.test(h);
  if (/^mailto:[^\s<>"']+$/i.test(h)) return true;
  try {
    const url = new URL(h);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname;
  } catch {
    return false;
  }
}

const RELATIVE_IMAGE_RE =
  /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]*(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;

/** Absolute http(s) URL with a host, or a validated site-relative path. */
export function isSafeImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s || s.length > 2000) return false;
  if (s.startsWith("/")) return RELATIVE_IMAGE_RE.test(s);
  if (/[\s\\<>"'`]/.test(s)) return false;
  try {
    const url = new URL(s);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname;
  } catch {
    return false;
  }
}

const IMAGE_RE = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"]*)")?\s*\)/g;
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;

function stripMarkdownText(raw: string): string {
  return raw
    .replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise inline markdown to the subset renderInline understands. */
export function sanitizeInline(raw: string): string {
  let t = raw.replace(/<!--[\s\S]*?-->/g, "");
  if (/!\[[^\]]*\]\(/.test(t)) reject("unsupported_image_position");
  // Autolinks <https://…>
  t = t.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/gi, (_m, url: string) =>
    isSafeHref(url) ? `[${url}](${url})` : reject("unsafe_link_url"),
  );
  t = t.replace(/<br\s*\/?>/gi, " ");
  if (HTML_TAG_RE.test(t)) reject("raw_html_not_supported");
  // Links: keep safe ones in canonical [label](href) form, refuse unsafe ones.
  t = t.replace(
    /\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
    (_m, label: string, href: string) =>
      isSafeHref(href) ? `[${label}](${href.trim()})` : reject("unsafe_link_url"),
  );
  t = t.replace(/__([^_]+)__/g, "**$1**");
  t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1$2");
  t = t.replace(/(^|\W)_([^_\s][^_]*?)_(?=\W|$)/g, "$1$2");
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, "$1");
  return t.replace(/\s+/g, " ").trim();
}

function plain(raw: string): string {
  // Headings/table headers: links keep their label, bold markers are removed.
  return sanitizeInline(raw)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Paragraph text to p/image sections, preserving order. */
function paragraphSections(text: string): BlogSection[] {
  const out: BlogSection[] = [];
  let last = 0;
  IMAGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const pushText = (chunk: string) => {
    const t = sanitizeInline(chunk);
    if (t) out.push({ type: "p", text: t });
  };
  while ((m = IMAGE_RE.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    const src = m[2].trim();
    if (!isSafeImageSrc(src)) reject("unsafe_image_url");
    if (HTML_TAG_RE.test(m[1]) || HTML_TAG_RE.test(m[3] ?? "")) reject("raw_html_not_supported");
    const alt = stripMarkdownText(m[1]);
    const caption = m[3] !== undefined ? stripMarkdownText(m[3]) : "";
    if (alt.length > MARKDOWN_LIMITS.altLength || caption.length > MARKDOWN_LIMITS.captionLength) {
      reject("image_text_too_long");
    }
    out.push(caption ? { type: "image", src, alt, caption } : { type: "image", src, alt });
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/**
 * Converts Milo markdown into structured sections.
 * @throws MarkdownRejected when content cannot be represented safely and completely.
 */
export function markdownToSections(markdown: string, title?: string): BlogSection[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections: BlogSection[] = [];
  let para: string[] = [];
  let skippedTitle = false;

  const push = (...items: BlogSection[]) => {
    sections.push(...items);
    if (sections.length > MARKDOWN_LIMITS.sections) reject("content_too_long");
  };
  const flush = () => {
    if (para.length) {
      push(...paragraphSections(para.join(" ")));
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }

    // Fenced code: contents kept as plain paragraph text (no HTML).
    if (/^(```|~~~)/.test(trimmed)) {
      flush();
      const fence = trimmed.slice(0, 3);
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence); i++) body.push(lines[i]);
      const text = body.join(" ").replace(/\s+/g, " ").trim();
      // Text is React-escaped; break link/bold syntax so code renders literally.
      if (text)
        push({ type: "p", text: text.replace(/\]\(/g, "]\u200b(").replace(/\*\*/g, "*\u200b*") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(trimmed);
    if (heading) {
      flush();
      const text = plain(heading[2]);
      if (!text) continue;
      if (heading[1].length === 1 && !skippedTitle && (!title || text === plain(title))) {
        skippedTitle = true; // the page already renders the title as <h1>
        continue;
      }
      push(heading[1].length <= 2 ? { type: "h2", text } : { type: "h3", text });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      continue;
    }

    if (trimmed.startsWith(">")) {
      flush();
      const body: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) {
        body.push(lines[i].trim().replace(/^>\s?/, ""));
      }
      i--;
      const text = sanitizeInline(body.join(" "));
      if (text) push({ type: "quote", text });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const marker = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/;
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const l = lines[i].trim();
        if (marker.test(l)) items.push(l.replace(marker, ""));
        else if (l && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += ` ${l}`;
        else break;
      }
      i--;
      if (items.length > MARKDOWN_LIMITS.listItems) reject("list_too_long");
      const clean = items.map(sanitizeInline).filter(Boolean);
      if (clean.length) push(ordered ? { type: "ol", items: clean } : { type: "ul", items: clean });
      continue;
    }

    if (trimmed.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const headers = splitRow(trimmed).map(plain);
      if (headers.length > MARKDOWN_LIMITS.tableColumns) reject("table_too_wide");
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim().includes("|"); i++) {
        const cells = splitRow(lines[i]).map(sanitizeInline);
        if (cells.length > headers.length) reject("table_shape_invalid");
        while (cells.length < headers.length) cells.push("");
        rows.push(cells);
        if (rows.length > MARKDOWN_LIMITS.tableRows) reject("table_too_long");
      }
      i--;
      push({ type: "table", headers, rows });
      continue;
    }

    para.push(trimmed);
  }
  flush();
  return sections;
}
