import { describe, it, expect } from "vitest";
import { inspectTechnicalPage, TECHNICAL_HTML_MAX_BYTES } from "./technical-page";
const inspect = (html: string) =>
  inspectTechnicalPage({
    url: "https://example.test/folder/page",
    status: 200,
    observedAt: "2026-09-11T00:00:00Z",
    html,
    headers: { "X-Robots-Tag": "googlebot: noindex" },
  });
describe("technical HTML observations", () => {
  it("parses markup and entities without treating scripts/comments as elements", () => {
    const r = inspect(
      '<title>A &amp; B</title><!-- <meta name=robots content=noindex> --><script>"<link rel=canonical href=/fake>"</script><h1>Main <em>heading</em></h1><meta content="Description" name=description>',
    );
    expect(r.title).toBe("A & B");
    expect(r.headings).toEqual(["Main heading"]);
    expect(r.descriptions).toEqual(["Description"]);
    expect(r.canonicals).toEqual([]);
    expect(r.robots).toEqual([
      { source: "header", agent: "header-scoped", value: "googlebot: noindex" },
    ]);
  });
  it("resolves first base, records duplicate canonical evidence and preserves query URLs", () => {
    const r = inspect(
      '<base href="/docs/"><base href="https://other.test/"><link rel=canonical href="a"><link rel=canonical href="b"><a href="next?q=1#anchor">Next</a><a href="mailto:x@example.test">Mail</a><link rel=alternate hreflang=sv href="/sv/">',
    );
    expect(r.canonicals).toEqual(["https://example.test/docs/a", "https://example.test/docs/b"]);
    expect(r.internalLinks).toEqual(["https://example.test/docs/next?q=1"]);
    expect(r.alternateLanguages).toEqual([{ language: "sv", url: "https://example.test/sv/" }]);
  });
  it("labels JSON syntax evidence without claiming schema validity", () => {
    const r = inspect(
      '<script type="application/ld+json">{"@graph":[{"@type":"Article"},{"@type":["Organization","Thing"]}]}</script><script type="application/ld+json">bad json</script>',
    );
    expect(r.structuredData[0].state).toBe("valid_json");
    expect(r.structuredData[0].types.sort()).toEqual(["Article", "Organization", "Thing"]);
    expect(r.structuredData[1].state).toBe("invalid_json");
  });
  it("marks bounded extraction incomplete instead of implying a complete site result", () => {
    expect(inspect("x".repeat(TECHNICAL_HTML_MAX_BYTES + 1)).complete).toBe(false);
    const r = inspect(Array.from({ length: 501 }, (_, i) => `<a href="/${i}">Page</a>`).join(""));
    expect(r.internalLinks).toHaveLength(500);
    expect(r.complete).toBe(false);
  });
  it("does not persist credentials or fetch external linked resources", () => {
    const r = inspect(
      '<a href="https://user:secret@example.test/private">Private</a><a href="https://other.test/">External</a>',
    );
    expect(r.internalLinks).toEqual([]);
    expect(r.externalLinkCount).toBe(1);
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});
