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
 * Images are stripped by default; only URLs the caller vetted as publishable
 * (MarkdownRenderOptions.allowedImageUrls, P1.1 G) render as <img>. See
 * stripImages + renderAllowedImages.
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
  return (
    s
      // Tolerates one level of bracket nesting in the alt text, a parenthesised
      // segment inside the destination, and an optional "title". The narrower
      // original missed all three and republished raw markdown as body text.
      .replace(/!\[(?:[^\][]|\[[^\]]*\])*\]\((?:[^()\s]|\([^)]*\))*(?:\s+"[^"]*")?\s*\)/g, "")
      // Reference-style images and their definitions.
      .replace(/!\[(?:[^\][]|\[[^\]]*\])*\]\[[^\]]*\]/g, "")
      .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
  );
}

export interface MarkdownRenderOptions {
  /**
   * Paths known to resolve on the target site. A relative internal link is only
   * published as an ACTIVE link when its path is in this set; otherwise the
   * anchor text is kept but the unverified/invented link is dropped (P0.4).
   * Without a set, NO relative internal link is active — Milo cannot confirm an
   * internal path resolves without a URL inventory, and must never publish an
   * invented internal URL. External absolute URLs are unaffected.
   */
  knownInternalPaths?: Set<string>;
  /**
   * Image URLs the caller has VETTED as publishable — approved, alt-text present,
   * hosted on a controlled origin (P1.1 G). Only these render as `<img>`; every
   * other image markdown is still stripped. Without a set, NO image renders
   * (the pre-P1.1 behaviour), so a model-hallucinated image never publishes.
   */
  allowedImageUrls?: Set<string>;
}

/** Normalise an internal href to a comparable path (strip query/hash, trailing slash). */
export function normalizeInternalPath(href: string): string {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

// A relative internal link `[text](/path)` — the leading `(?<!!)` excludes
// images `![alt](/x)`, which are not links.
const INTERNAL_LINK_RE = /(?<!!)\[([^\]]+)\]\((\/[^)\s]+)\)/g;

/**
 * The relative internal links written into a markdown body, as normalised paths.
 */
export function extractInternalLinkPaths(md: string): string[] {
  const paths = new Set<string>();
  const re = new RegExp(INTERNAL_LINK_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(md || ""))) paths.add(normalizeInternalPath(m[2]));
  return [...paths];
}

/** Which of a body's relative internal links are NOT in the active inventory. */
export function unresolvedInternalLinks(md: string, active: Set<string>): string[] {
  return extractInternalLinkPaths(md).filter((p) => !active.has(p));
}

/** True when the body contains a relative internal link outside the active set. */
export function hasUnresolvedInternalLinks(md: string, active: Set<string>): boolean {
  return unresolvedInternalLinks(md, active).length > 0;
}

export type InternalLinkState = "VERIFIED" | "USER_APPROVED" | "UNRESOLVED";

export interface ClassifiedInternalLink {
  anchor: string;
  /** Normalised path. */
  path: string;
  /** The raw href as written in the markdown. */
  href: string;
  /** Nearest preceding heading (the source section), or "". */
  section: string;
  /**
   * Which occurrence of THIS path this link is (0-based, document order).
   * The resolver actions are occurrence-scoped: five links sharing one bad
   * path are five separate decisions, never one global sweep.
   */
  occurrence: number;
  state: InternalLinkState;
  reason: string;
}

/**
 * Classify every relative internal link in the body into VERIFIED (in the known
 * inventory), USER_APPROVED (in the project's approved list) or UNRESOLVED, with
 * its anchor text and source section. Drives the editor's link-safety panel.
 */
export function classifyInternalLinks(
  md: string,
  verified: Set<string>,
  approved: Set<string>,
): ClassifiedInternalLink[] {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: ClassifiedInternalLink[] = [];
  // Per-path occurrence counter, in document order — MUST count identically to
  // rewriteLinkOccurrence (same regex, same normalisation) so a panel row's
  // action lands on exactly the link the user clicked.
  const seen = new Map<string, number>();
  let section = "";
  for (const line of lines) {
    const h = line.trim().match(/^#{1,6}\s+(.*)$/);
    if (h) {
      section = h[1].trim();
      continue;
    }
    const re = new RegExp(INTERNAL_LINK_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const anchor = m[1];
      const href = m[2];
      const path = normalizeInternalPath(href);
      const occurrence = seen.get(path) ?? 0;
      seen.set(path, occurrence + 1);
      const state: InternalLinkState = verified.has(path)
        ? "VERIFIED"
        : approved.has(path)
          ? "USER_APPROVED"
          : "UNRESOLVED";
      const reason =
        state === "UNRESOLVED"
          ? "Not a page Milo has published and not approved for this project."
          : state === "VERIFIED"
            ? "Matches a known page on your site."
            : "You approved this path.";
      out.push({ anchor, path, href, section, occurrence, state, reason });
    }
  }
  return out;
}

/**
 * Rewrite exactly ONE link: the `occurrence`-th link (0-based, document order)
 * whose normalised path equals `targetPath`.
 *
 * This replaced the old path-global sweep. That version rewrote EVERY link
 * sharing the path, so an article with five different anchors all pointing at
 * one invented "/services" collapsed to a single target the moment the user
 * resolved the first row — and the panel then reported all clear. Five links
 * are five separate decisions.
 *
 * Counts line-by-line with heading lines skipped — IDENTICAL to
 * classifyInternalLinks — so the panel row's occurrence index always addresses
 * the link the user clicked. Out-of-range occurrence: no-op.
 */
function rewriteLinkOccurrence(
  md: string,
  targetPath: string,
  occurrence: number,
  build: (anchor: string, href: string) => string,
): string {
  const target = normalizeInternalPath(targetPath);
  let count = 0;
  return (md || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (line.trim().match(/^#{1,6}\s+/)) return line; // classify skips headings; so do we
      return line.replace(INTERNAL_LINK_RE, (whole, anchor: string, href: string) => {
        if (normalizeInternalPath(href) !== target) return whole;
        const isTarget = count === occurrence;
        count += 1;
        return isTarget ? build(anchor, href) : whole;
      });
    })
    .join("\n");
}

/** Convert ONE occurrence of a link to `path` into plain anchor text. */
export function linkPathToTextAt(md: string, path: string, occurrence: number): string {
  return rewriteLinkOccurrence(md, path, occurrence, (anchor) => anchor);
}

/** Remove ONE occurrence of a link to `path` entirely (text included). */
export function removeLinkAt(md: string, path: string, occurrence: number): string {
  return rewriteLinkOccurrence(md, path, occurrence, () => "");
}

/** Repoint ONE occurrence of a link from `oldPath` to `newPath`. */
export function replaceLinkPathAt(
  md: string,
  oldPath: string,
  occurrence: number,
  newPath: string,
): string {
  return rewriteLinkOccurrence(md, oldPath, occurrence, (anchor) => `[${anchor}](${newPath})`);
}

/**
 * Render ONLY the images whose URL the caller vetted as publishable (P1.1 G).
 * Everything else is left for stripImages to remove, so a hallucinated or
 * hotlinked image can never reach the page.
 */
function renderAllowedImages(s: string, allowed: Set<string>): string {
  return s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt: string, url: string) => {
    // Allow-listed URL AND non-empty alt (defence-in-depth for the C19 alt gate —
    // a body image reusing an approved URL with empty alt must not render).
    if (!allowed.has(url) || !alt.trim()) return whole;
    const safeUrl = url.replace(/"/g, "%22");
    const safeAlt = alt.replace(/"/g, "&quot;");
    return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" />`;
  });
}

/** Remove all image markdown from a string (exposed so the assembler can strip a
 *  raw body before composing only its own vetted images). */
export function stripImageMarkdown(s: string): string {
  return stripImages(s);
}

/** Inline formatting: images (allow-listed), links, bold, italic — on escaped text. */
function inline(s: string, opts?: MarkdownRenderOptions): string {
  const withImages = opts?.allowedImageUrls?.size
    ? renderAllowedImages(s, opts.allowedImageUrls)
    : s;
  return stripImages(withImages)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
      // External absolute URL — an explicit destination; keep as an active link.
      if (/^https?:\/\//.test(href)) {
        return `<a href="${href.replace(/"/g, "%22")}">${text}</a>`;
      }
      // Relative internal link — publish as active ONLY if it resolves against the
      // ACTIVE inventory (verified paths ∪ user-approved paths). Otherwise keep the
      // text and drop the link. This is a backstop: publishing is BLOCKED upstream
      // while any unresolved link remains, so at publish time nothing is stripped.
      if (/^\//.test(href)) {
        if (opts?.knownInternalPaths?.has(normalizeInternalPath(href))) {
          return `<a href="${href.replace(/"/g, "%22")}">${text}</a>`;
        }
        return text;
      }
      // Unsafe/other scheme (mailto:, javascript:, protocol-relative, bare word)
      // — drop the link, keep the text.
      return text;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
}

/** Split a markdown table row into cells, tolerating optional outer pipes. */
function tableCells(line: string): string[] {
  return (
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      // A backslash-escaped pipe is GFM's only way to put a "|" inside a cell.
      // Splitting on it silently deleted the rest of the cell — and comparison
      // tables are exactly where a model writes one.
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, "|"))
  );
}

/** True for a `| --- | :--: |` style separator, which is what makes a table a table. */
function isTableSeparator(line: string): boolean {
  if (!line.includes("|") || !line.includes("-")) return false;
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

export function markdownToHtml(md: string, opts?: MarkdownRenderOptions): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const inl = (x: string) => inline(x, opts);
  let listType: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inl(escapeHtml(para.join(" ").trim()))}</p>`);
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
      const cell = (c: string) => inl(escapeHtml(c));
      // Width comes from the WIDEST row, not the header: trimming to the header
      // silently dropped columns a model had written into the body.
      const width = Math.max(headers.length, ...body.map((r) => r.length));
      const pad = (row: string[]) => Array.from({ length: width }, (_, k) => row[k] ?? "");
      out.push("<table>");
      out.push(
        `<thead><tr>${pad(headers)
          .map((c) => `<th>${cell(c)}</th>`)
          .join("")}</tr></thead>`,
      );
      if (body.length) {
        out.push("<tbody>");
        for (const row of body) {
          out.push(
            `<tr>${pad(row)
              .map((c) => `<td>${cell(c)}</td>`)
              .join("")}</tr>`,
          );
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
      out.push(`<h${level}>${inl(escapeHtml(h[2].trim()))}</h${level}>`);
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
      out.push(`<li>${inl(escapeHtml(ul[1].trim()))}</li>`);
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
      out.push(`<li>${inl(escapeHtml(ol[1].trim()))}</li>`);
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
/**
 * Letters NFD decomposition does NOT handle: they are distinct letters, not
 * base+combining-mark, so the old pipeline dropped them mid-word \u2014 Polish
 * "dzia\u0142aj\u0105" became "dzia-aja" in live URLs (\u0142 fell through to the
 * non-alphanumeric replacer and turned into a hyphen). Map them explicitly.
 */
const SLUG_TRANSLITERATIONS: Record<string, string> = {
  ł: "l",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  æ: "ae",
  œ: "oe",
  ß: "ss",
};

/**
 * One canonical slugifier (previously duplicated in mock-ai with a different
 * cap). Transliteration first (see above), then NFD strips ordinary diacritics
 * (\u0105 \u0107 \u0119 \u0144 \u00f3 \u015b \u017a \u017c \u00e5 \u00e4 \u00f6 \u2026), then hyphenation. Truncation lands on a WORD
 * BOUNDARY: the old hard `.slice()` cut words mid-syllable, shipping slugs like
 * "\u2026-i-technologi" (from "technologi\u0119") on live URLs. A single over-long word
 * still hard-cuts \u2014 there is no boundary to prefer.
 */
export function slugifyForPublish(s: string, max = 80): string {
  const full = (s || "")
    .toLowerCase()
    .replace(
      /[\u0142\u00f8\u0111\u00f0\u00fe\u00e6\u0153\u00df]/g,
      (ch) => SLUG_TRANSLITERATIONS[ch] ?? ch,
    )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (full.length <= max) return full;
  const cut = full.slice(0, max);
  // Cut landed mid-word (the char after the cut is not a separator): drop the
  // partial segment, unless that would leave nothing.
  if (full[max] !== "-" && cut.includes("-")) return cut.replace(/-[^-]*$/, "");
  return cut.replace(/-$/, "");
}
