/**
 * Minimal, safe Markdown → HTML conversion for outbound publishing (WordPress).
 * Handles headings, paragraphs, bullet/numbered lists, bold/italic and links.
 * Escapes HTML first so source markdown can't inject markup. Not a full parser
 * (no tables/images/code fences) — enough for Milo content bodies in v1.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline formatting: links, bold, italic — applied to already-escaped text. */
function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
      const safe = /^https?:\/\/|^\//.test(href) ? href : "#";
      return `<a href="${safe.replace(/"/g, "%22")}">${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
}

export function markdownToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(escapeHtml(para.join(" ").trim()))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); closeList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const level = Math.min(6, h[1].length);
      out.push(`<h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(escapeHtml(ul[1].trim()))}</li>`);
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(escapeHtml(ol[1].trim()))}</li>`);
      continue;
    }

    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}

/** URL-safe slug from a string (lowercase, dashed, ascii-folded). */
export function slugifyForPublish(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
