/**
 * markdownToHtml presentation-token rendering (P1.2D).
 * The renderer substitutes a pre-compiled (already-safe) <figure> for an identity
 * token as a BLOCK element, strips an unresolved token, and never disables the
 * surrounding escape-by-construction pipeline.
 */
import { describe, it, expect } from "vitest";
import { markdownToHtml } from "./markdown";

describe("presented-image token rendering", () => {
  const figure =
    '<figure class="milo-image milo-size-large"><img src="https://s/a.png" alt="x" loading="lazy" /></figure>';
  const presented = new Map([["i1", figure]]);

  it("renders a lone token line as a BLOCK figure (never wrapped in <p>)", () => {
    const html = markdownToHtml("![x](milo-image:i1)", { presentedImages: presented });
    expect(html).toBe(figure);
    expect(html).not.toContain("<p>");
  });

  it("an unresolved token renders nothing (never leaks the token)", () => {
    const html = markdownToHtml("![x](milo-image:missing)", { presentedImages: presented });
    expect(html).not.toContain("milo-image:");
    expect(html).not.toContain("<figure");
  });

  it("does not disable escaping of surrounding text (no sanitizer bypass)", () => {
    const html = markdownToHtml("<script>alert(1)</script>\n\n![x](milo-image:i1)", {
      presentedImages: presented,
    });
    expect(html).toContain("&lt;script&gt;"); // surrounding text still escaped
    expect(html).not.toContain("<script>");
    expect(html).toContain(figure); // figure inserted intact
  });

  it("without a presentedImages map, a token line renders nothing", () => {
    expect(markdownToHtml("![x](milo-image:i1)")).not.toContain("milo-image:");
  });
});
