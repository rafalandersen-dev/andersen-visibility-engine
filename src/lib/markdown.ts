/**
 * Minimal, safe Markdown → HTML conversion for outbound publishing.
 * Handles headings, paragraphs, bullet/numbered lists, tables, bold/italic and
 * links. Escapes HTML first so source markdown can't inject markup.
 *
 * Deliberately emits bare semantic HTML — no class, no style. The published page
 * is rendered by the CUSTOMER'S theme (WordPress theme, Shopify article
 * template), which is the strongest available way for an article to carry their
 * branding. Anything we injected here would be us overriding a design that
 * already matches.
 *
 * Images are deliberately NOT rendered. See stripImages.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Remove image markdown entirely.
 *
 * Previously `![alt](url)` fell through to the link rule, which matched the
 * `[alt](url)` half and left a stray "!" as body text on the live page.
 * We drop the whole construct rather than emitting <img>: the URL would be
 * whatever the model wrote — hallucinated, hotlinked or dead — and publishing is
 * upsert-only with no unpublish, so a bad <img> would be permanent. Real images
 * arrive with the image increment, restricted to origins we control.
 */
function stripImages(s: string): string {
  return s.replace(/!\[[^\]]*\]\([^)\s]*\)/g, "");
}

/** Inline formatting: links, bold, italic — applied to already-escaped text. */
function inline(s: string): string {
  return stripImages(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
      const safe = /^https?:\/\/|^\//.test(href) ? href : "#";
      return `<a href="${safe.replace(/"/g, "%22")}">${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
}

/** Split a markdown table row into cells, tolerating optional outer pipes. */
function tableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** True for a `| --- | :--: |` style separator, which is what makes a table a table. */
function isTableSeparator(line: string): boolean {
  if (!line.includes("|") || !line.includes("-")) return false;
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
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
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushPara();
      closeList();
      continue;
    }

    // Table: a header row followed by a separator row. Checked before every
    // other rule, because a pipe row otherwise falls through to <p> and the
    // comparison assets — which the generator is explicitly prompted to emit as
    // a markdown TABLE — publish as a wall of pipe characters.
    if (line.includes("|") && isTableSeparator((lines[i + 1] ?? "").trim())) {
      flushPara();
      closeList();
      const headers = tableCells(line);
      const body: string[][] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const row = lines[j].trim();
        if (!row || !row.includes("|")) break;
        body.push(tableCells(row));
      }
      const cell = (c: string) => inline(escapeHtml(c));
      out.push("<table>");
      out.push(`<thead><tr>${headers.map((c) => `<th>${cell(c)}</th>`).join("")}</tr></thead>`);
      if (body.length) {
        out.push("<tbody>");
        for (const row of body) {
          // Pad or trim to the header width so a ragged row cannot break the table.
          const cells = Array.from({ length: headers.length }, (_, k) => row[k] ?? "");
          out.push(`<tr>${cells.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`);
        }
        out.push("</tbody>");
      }
      out.push("</table>");
      i = j - 1;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const level = Math.min(6, h[1].length);
      out.push(`<h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(escapeHtml(ul[1].trim()))}</li>`);
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
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
