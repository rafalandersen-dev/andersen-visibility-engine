/**
 * P0.3 — preview / export / publish parity.
 *
 * The bug this pins: the editor used its OWN weaker converter for Preview and
 * "Export HTML" (headings + `-` bullets + bold only) while publishing used
 * src/lib/markdown.ts (tables, links, ordered lists, italics). So a comparison
 * table showed as raw pipes in preview but a real <table> on the live site, and
 * every inline link/bold run was invisible in preview.
 *
 * The fix routes Preview and Export through the SAME canonical converter as
 * publishing. These fixtures prove the canonical converter renders every element
 * the old editor converter dropped — so what the user sees is what publishes.
 * (The editor now imports this exact function; see app.editor.tsx.)
 */
import { describe, it, expect } from "vitest";
import { markdownToHtml } from "./markdown";

describe("canonical converter — parity fixtures (P0.3)", () => {
  it("headings", () => {
    const html = markdownToHtml("# H1\n## H2\n### H3");
    expect(html).toContain("<h1>H1</h1>");
    expect(html).toContain("<h2>H2</h2>");
    expect(html).toContain("<h3>H3</h3>");
  });

  it("bold and italic (invisible in the old preview)", () => {
    const html = markdownToHtml("This is **bold** and *italic* text.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("links (raw text in the old preview)", () => {
    const html = markdownToHtml("See [our services](https://example.com/services).");
    expect(html).toContain('href="https://example.com/services"');
    expect(html).toContain(">our services</a>");
  });

  it("unordered list", () => {
    const html = markdownToHtml("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("ordered list (dropped by the old preview)", () => {
    const html = markdownToHtml("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
  });

  it("comparison table (raw pipes in the old preview, real <table> on publish)", () => {
    const md = ["| Plan | Price |", "| --- | --- |", "| Basic | 10 |", "| Pro | 20 |"].join("\n");
    const html = markdownToHtml(md);
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("Basic");
    expect(html).toContain("Pro");
  });

  it("FAQ content in the body renders as headings + paragraphs", () => {
    const md = "## FAQ\n\n### How long does it take?\n\nUsually two weeks.";
    const html = markdownToHtml(md);
    expect(html).toContain("<h2>FAQ</h2>");
    expect(html).toContain("<h3>How long does it take?</h3>");
    expect(html).toContain("Usually two weeks");
  });

  it("CTA content in the body renders with its link", () => {
    const md = "## Ready to start?\n\n[Book a consultation](https://example.com/book) today.";
    const html = markdownToHtml(md);
    expect(html).toContain("<h2>Ready to start?</h2>");
    expect(html).toContain('href="https://example.com/book"');
  });

  it("is deterministic — same markdown yields identical HTML (preview === export === publish)", () => {
    const md = "# T\n\nBody with **bold**, [a link](https://e.com) and:\n\n- a\n- b";
    expect(markdownToHtml(md)).toBe(markdownToHtml(md));
  });
});
