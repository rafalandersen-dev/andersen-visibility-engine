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
  it("ignores a body-nested XHTML head for every document metadata field", () => {
    const result = inspectTechnicalPage({
      url: "https://example.test/page",
      status: 200,
      observedAt: "2026-09-11T00:00:00Z",
      headers: { "content-type": "application/xhtml+xml" },
      html: '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><head><title>False</title><meta name="description" content="False"/><meta name="robots" content="noindex"/><link rel="canonical" href="/false"/><link rel="alternate" hreflang="sv" href="/sv"/><base href="https://evil.test/"/></head><a href="next">Next</a></body></html>',
    });
    expect(result).toMatchObject({
      title: "",
      descriptions: [],
      robots: [],
      canonicals: [],
      alternateLanguages: [],
      internalLinks: ["https://example.test/next"],
      complete: true,
    });
  });

  it.each(["text/html", "application/xhtml+xml"])("uses only head titles in %s", (contentType) => {
    for (const head of ["", "<title>Document title</title>"]) {
      const result = inspectTechnicalPage({
        url: "https://example.test/",
        status: 200,
        observedAt: "2026-09-11T00:00:00Z",
        headers: { "content-type": contentType },
        html: `<html xmlns="http://www.w3.org/1999/xhtml"><head>${head}</head><body><title>Body title</title></body></html>`,
      });
      expect(result.title).toBe(head ? "Document title" : "");
      expect(result.complete).toBe(true);
    }
  });
  it("parses markup and entities without treating scripts/comments as elements", () => {
    const r = inspect(
      '<title>A &amp; B</title><!-- <meta name=robots content=noindex> --><script>"<link rel=canonical href=/fake>"</script><meta content="Description" name=description><h1>Main <em>heading</em></h1>',
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
      '<base href="/docs/"><base href="https://other.test/"><link rel=canonical href="a"><link rel=canonical href="b"><link rel=alternate hreflang=sv href="/sv/"><a href="next?q=1#anchor">Next</a><a href="mailto:x@example.test">Mail</a>',
    );
    expect(r.canonicals).toEqual(["https://example.test/docs/a", "https://example.test/docs/b"]);
    expect(r.internalLinks).toEqual(["https://example.test/docs/next?q=1"]);
    expect(r.alternateLanguages).toEqual([{ language: "sv", url: "https://example.test/sv/" }]);
  });
  it("bounds resolved links, canonicals and language alternates without losing other evidence", () => {
    const long = "x".repeat(8192);
    const r = inspect(
      `<title>Retained</title><a href="${long}">Huge</a><link rel="canonical" href="${long}"><link rel="alternate" hreflang="sv" href="${long}"><a href="/safe">Safe</a>`,
    );
    expect(r.title).toBe("Retained");
    expect(r.complete).toBe(false);
    expect(r.internalLinks).toEqual(["https://example.test/safe"]);
    expect(r.canonicals).toEqual([]);
    expect(r.alternateLanguages).toEqual([]);
  });
  it("retains the exact absolute limit and rejects serialization expansion", () => {
    const prefix = "https://example.test/folder/";
    const exact = "x".repeat(8192 - prefix.length);
    expect(inspect(`<a href="${exact}">Exact</a>`).internalLinks).toEqual([prefix + exact]);
    const expanded = inspect(`<a href="${"é".repeat(2000)}">Encoded</a>`);
    expect(expanded.internalLinks).toEqual([]);
    expect(expanded.complete).toBe(false);
  });
  it("ignores an oversized base and resolves later references against the page", () => {
    const r = inspect(`<base href="${"x".repeat(8192)}"><a href="next">Next</a>`);
    expect(r.complete).toBe(false);
    expect(r.internalLinks).toEqual(["https://example.test/folder/next"]);
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

const xhtml = (html: string) =>
  inspectTechnicalPage({
    url: "https://example.test/",
    status: 200,
    observedAt: "2026-09-11T00:00:00Z",
    html,
    headers: { "Content-Type": "application/xhtml+xml; charset=utf-8" },
  });
it("uses XHTML case, namespace, self-closing and CDATA semantics", () => {
  const result = xhtml(
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><script/><Title>Ignored</Title><title>A &amp; B</title><link rel="canonical" href="/real"/><script type="application/ld+json"><![CDATA[{"@type":"Article"}]]></script></head><body><h1>Main</h1><a HREF="/wrong">Ignored attribute</a><a href="/right">Right</a><f:a xmlns:f="urn:foreign" href="/foreign"/><template><a href="/inert"/></template></body></html>`,
  );
  expect(result.complete).toBe(true);
  expect(result.title).toBe("A & B");
  expect(result.headings).toEqual(["Main"]);
  expect(result.canonicals).toEqual(["https://example.test/real"]);
  expect(result.internalLinks).toEqual(["https://example.test/right"]);
  expect(result.structuredData).toEqual([
    { state: "valid_json", types: ["Article"], complete: true },
  ]);
});
it.each([
  '<html xmlns="http://www.w3.org/1999/xhtml"><title>Broken</html>',
  '<!DOCTYPE html [<!ENTITY x "expanded">]><html xmlns="http://www.w3.org/1999/xhtml"><title>&x;</title></html>',
  '<html xmlns="http://www.w3.org/1999/xhtml">' +
    "<div>".repeat(101) +
    "</div>".repeat(101) +
    "</html>",
])("marks unusable XML incomplete without HTML recovery", (html) => {
  const result = xhtml(html);
  expect(result.complete).toBe(false);
  expect(result.title).toBe("");
});
it("accepts namespaced XHTML and external doctype without resolving external resources", () => {
  const result = xhtml(
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "https://example.invalid/xhtml.dtd"><h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head><h:title>Namespaced</h:title></h:head></h:html>',
  );
  expect(result.complete).toBe(true);
  expect(result.title).toBe("Namespaced");
});

it("ignores foreign SVG title metadata in an HTML document", () => {
  const result = inspect("<svg><title>Icon label</title></svg><p>Body</p>");
  expect(result.title).toBe("");
  expect(result.complete).toBe(true);
});
it.each(["<feed/>", "<html><title>Wrong namespace</title></html>", '<html xmlns="urn:foreign"/>'])(
  "marks a non-XHTML root incomplete: %s",
  (html) => {
    expect(xhtml(html).complete).toBe(false);
  },
);
it("bounds expanded URLs during traversal rather than after collecting them", () => {
  const base = "https://example.test/" + "x".repeat(7000) + "/";
  const html =
    `<base href="${base}">` +
    Array.from(
      { length: 4000 },
      (_, i) =>
        `<a href="${i}">x</a><link rel="canonical" href="c${i}"><link rel="alternate" hreflang="sv" href="s${i}">`,
    ).join("");
  expect(new TextEncoder().encode(html).byteLength).toBeLessThan(TECHNICAL_HTML_MAX_BYTES);
  const result = inspect(html);
  expect(result.complete).toBe(false);
  const urls = [
    ...result.internalLinks,
    ...result.canonicals,
    ...result.alternateLanguages.map((v) => v.url),
  ];
  expect(
    urls.reduce((sum, url) => sum + new TextEncoder().encode(JSON.stringify(url)).byteLength, 0),
  ).toBeLessThanOrEqual(256 * 1024);
  expect(result.internalLinks.length).toBeLessThan(500);
  expect(result.canonicals.length).toBeLessThanOrEqual(20);
});

it.each(["text/html", "application/xhtml+xml"])(
  "ignores body description and robots metadata for %s",
  (contentType) => {
    const r = inspectTechnicalPage({
      url: "https://example.test/",
      status: 200,
      observedAt: "2026-09-11T00:00:00Z",
      headers: { "content-type": contentType },
      html: '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="description" content="Head description"/><meta name="robots" content="index"/></head><body><meta name="description" content="Body description"/><meta name="robots" content="noindex"/><h1>Page</h1></body></html>',
    });
    expect(r.descriptions).toEqual(["Head description"]);
    expect(r.robots).toEqual([{ source: "meta", agent: "robots", value: "index" }]);
  },
);

it.each(["text/html", "application/xhtml+xml"])(
  "ignores canonical and hreflang links in the body for %s",
  (contentType) => {
    const r = inspectTechnicalPage({
      url: "https://example.test/",
      status: 200,
      observedAt: "2026-09-11T00:00:00Z",
      headers: { "content-type": contentType },
      html: '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="canonical" href="/head"/><link rel="alternate" hreflang="sv" href="/sv"/></head><body><link rel="canonical" href="/body"/><link rel="alternate" hreflang="da" href="/da"/></body></html>',
    });
    expect(r.canonicals).toEqual(["https://example.test/head"]);
    expect(r.alternateLanguages).toEqual([{ language: "sv", url: "https://example.test/sv" }]);
  },
);
