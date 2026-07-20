/**
 * Tests for the outbound markdown converter.
 *
 * This is the last thing that runs before text becomes HTML on a customer's
 * live site, and publishing is upsert-only with no unpublish — so a rendering
 * bug here is permanent and visible to their readers.
 */
import { describe, it, expect } from "vitest";
import { markdownToHtml, slugifyForPublish } from "./markdown";

describe("markdownToHtml — structure", () => {
  it("renders headings, paragraphs and both list types", () => {
    const html = markdownToHtml("# Title\n\nHello world\n\n- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Hello world</p>");
    expect(html).toContain("<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
    expect(html).toContain("<ol>\n<li>first</li>\n<li>second</li>\n</ol>");
  });

  it("emits no class or style attributes — the customer's theme owns styling", () => {
    const html = markdownToHtml(
      "# T\n\ntext **bold** [x](https://a.test)\n\n| a |\n| --- |\n| 1 |",
    );
    expect(html).not.toMatch(/\sclass=/);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("escapes source HTML so markdown cannot inject markup", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps external links, gates internal links on a known inventory, drops unsafe schemes (P0.4)", () => {
    // External absolute URLs stay active.
    expect(markdownToHtml("[a](https://x.test/p)")).toContain('<a href="https://x.test/p">a</a>');

    // An UNRESOLVED internal link must never publish as an active link — the
    // invented/unverified internal URL is dropped and only the text remains.
    const unresolved = markdownToHtml("[a](/local)");
    expect(unresolved).not.toContain("href=");
    expect(unresolved).toContain("<p>a</p>");

    // A RESOLVED internal link (present in the known URL inventory) is active.
    const resolved = markdownToHtml("[a](/local)", { knownInternalPaths: new Set(["/local"]) });
    expect(resolved).toContain('<a href="/local">a</a>');

    // Unsafe schemes are dropped, text kept — no dead href="#".
    const unsafe = markdownToHtml("[a](javascript:alert(1))");
    expect(unsafe).not.toContain("href=");
    expect(unsafe).not.toContain("javascript");
  });
});

describe("markdownToHtml — internal-link resolution (P0.4)", () => {
  it("resolves against the inventory ignoring trailing slash, query and hash", () => {
    const inv = new Set(["/services"]);
    expect(markdownToHtml("[s](/services/)", { knownInternalPaths: inv })).toContain(
      '<a href="/services/">s</a>',
    );
    expect(markdownToHtml("[s](/services?utm=1)", { knownInternalPaths: inv })).toContain(
      '<a href="/services?utm=1">s</a>',
    );
    expect(markdownToHtml("[s](/services#top)", { knownInternalPaths: inv })).toContain(
      '<a href="/services#top">s</a>',
    );
  });

  it("still drops an internal link that is NOT in the inventory", () => {
    const html = markdownToHtml("[x](/made-up-path)", { knownInternalPaths: new Set(["/real"]) });
    expect(html).not.toContain("href=");
    expect(html).toContain("<p>x</p>");
  });
});

describe("markdownToHtml — images", () => {
  // The bug this prevents: the link rule matched the "[alt](url)" half of an
  // image and left a bare "!" as body text on the published page.
  it("drops image markdown entirely, leaving no stray exclamation mark", () => {
    const html = markdownToHtml("![A therapist at work](https://x.test/a.jpg)");
    expect(html).not.toContain("!");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("a.jpg");
  });

  it("drops an image inside a sentence without eating the sentence", () => {
    const html = markdownToHtml("Before ![alt](https://x.test/a.png) after");
    expect(html).toContain("Before");
    expect(html).toContain("after");
    expect(html).not.toContain("!");
    expect(html).not.toContain("<img");
  });

  it("still renders a normal link that follows an image", () => {
    const html = markdownToHtml("![x](https://x.test/a.png) and [link](https://b.test)");
    expect(html).toContain('<a href="https://b.test">link</a>');
    expect(html).not.toContain("<img");
  });
});

describe("markdownToHtml — tables", () => {
  // Comparison assets are explicitly prompted to emit a markdown TABLE
  // (ai.functions.ts). Without this the pipes published as literal body text.
  const table = [
    "| Option | Price | Best for |",
    "| --- | --- | --- |",
    "| A | 100 | Beginners |",
    "| B | 200 | Studios |",
  ].join("\n");

  it("renders a header row and a body", () => {
    const html = markdownToHtml(table);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Option</th>");
    expect(html).toContain("<td>Beginners</td>");
    expect(html).toContain("</table>");
    expect(html).not.toContain("|");
  });

  it("applies inline formatting inside cells", () => {
    const html = markdownToHtml("| a | b |\n| --- | --- |\n| **bold** | [l](https://x.test) |");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://x.test">l</a>');
  });

  it("accepts alignment separators and rows without outer pipes", () => {
    const html = markdownToHtml("a | b\n:--- | ---:\n1 | 2");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("pads a ragged row instead of producing a broken table", () => {
    const html = markdownToHtml("| a | b | c |\n| --- | --- | --- |\n| 1 |");
    expect(html).toContain("<td>1</td><td></td><td></td>");
  });

  it("resumes normal parsing after the table ends", () => {
    const html = markdownToHtml(`${table}\n\n## After\n\nA paragraph.`);
    expect(html).toContain("</table>");
    expect(html).toContain("<h2>After</h2>");
    expect(html).toContain("<p>A paragraph.</p>");
  });

  it("does not treat a lone pipe line as a table", () => {
    // No separator row → this is prose that happens to contain a pipe.
    const html = markdownToHtml("Choose A | B depending on budget");
    expect(html).toContain("<p>");
    expect(html).not.toContain("<table>");
  });
});

describe("markdownToHtml — adversarial input a model actually writes", () => {
  it("keeps an escaped pipe inside a cell instead of eating the rest of it", () => {
    // GFM's only way to write "|" in a table. Splitting on it deleted the tail.
    const html = markdownToHtml("| Plan | Note |\n| --- | --- |\n| A | 10 \\| 20 sessions |");
    expect(html).toContain("<td>10 | 20 sessions</td>");
  });

  it("keeps every column when a body row is wider than the header", () => {
    const html = markdownToHtml("| a | b |\n| --- | --- |\n| 1 | 2 | 3 |");
    expect(html).toContain("<td>1</td><td>2</td><td>3</td>");
    // The header is padded rather than the row being trimmed.
    expect(html).toContain("<th>a</th><th>b</th><th></th>");
  });

  it("strips an image whose alt text contains brackets", () => {
    const html = markdownToHtml("![a [nested] label](https://x.test/a.png)");
    expect(html).not.toContain("!");
    expect(html).not.toContain("a.png");
  });

  it("strips an image carrying a title attribute", () => {
    const html = markdownToHtml('![alt](https://x.test/a.png "A title")');
    expect(html).not.toContain("!");
    expect(html).not.toContain("A title");
  });

  it("strips a destination containing parentheses", () => {
    const html = markdownToHtml("![alt](https://x.test/a_(1).png)");
    expect(html).not.toContain("!");
    expect(html).not.toContain("a_(1)");
  });

  it("strips reference-style images and their definitions", () => {
    const html = markdownToHtml("![alt][hero]\n\n[hero]: https://x.test/h.png");
    expect(html).not.toContain("!");
    expect(html).not.toContain("h.png");
  });

  it("leaves a legitimate exclamation mark alone", () => {
    expect(markdownToHtml("Book today!")).toContain("Book today!");
  });

  it("does not mistake a row of dashes without pipes for a table separator", () => {
    const html = markdownToHtml("Intro\n\n-----\n\nMore");
    expect(html).not.toContain("<table>");
  });
});

describe("slugifyForPublish", () => {
  it("folds accents, lowercases and dashes", () => {
    expect(slugifyForPublish("Djupgående Massage i Malmö")).toBe("djupgaende-massage-i-malmo");
  });
  it("trims leading and trailing dashes and caps length", () => {
    expect(slugifyForPublish("  --Hello, World!--  ")).toBe("hello-world");
    expect(slugifyForPublish("a".repeat(200)).length).toBe(80);
  });
});
