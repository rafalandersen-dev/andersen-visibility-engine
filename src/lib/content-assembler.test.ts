/**
 * Canonical assembler (Article Studio 2.0 / P1.1 B).
 *
 * Pins the two guarantees the assembler exists to provide:
 *  1. Parity — for a legacy asset it is byte-identical to the pre-P1.1 path, and
 *     the ONE assembler output is what preview, export, publish and scoring share
 *     (so "what you see is what publishes"). (T1, T10)
 *  2. Composition — TL;DR + key-takeaways fold into the canonical body, JSON-LD
 *     derives from the assembled body (schema == visible content), and nothing is
 *     double-composed.
 */
import { describe, it, expect } from "vitest";
import { assembleContentAsset, composeCanonicalMarkdown } from "./content-assembler";
import { markdownToHtml } from "./markdown";
import type { ContentAsset, Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({ id: "p1", name: "Synergy", businessName: "Synergy Massage", ...over }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Deep tissue",
    slug: "deep-tissue",
    markdown: "",
    ...over,
  }) as ContentAsset;

describe("parity — legacy asset (no Article-Studio-2.0 fields)", () => {
  const md =
    "# Deep tissue\n\nBody with [a link](/services) and **bold**.\n\n## FAQ\n\n### Does it hurt?\n\nA little pressure.";
  const a = asset({ markdown: md, metaDescription: "d" });
  const active = new Set(["/services"]);

  it("markdown is byte-identical to the raw body", () => {
    expect(assembleContentAsset(a, project(), { activeInternalPaths: active }).markdown).toBe(md);
  });

  it("html is byte-identical to markdownToHtml(body) with the same active set", () => {
    const out = assembleContentAsset(a, project(), { activeInternalPaths: active });
    expect(out.html).toBe(markdownToHtml(md, { knownInternalPaths: active }));
  });

  it("emits Article + FAQPage JSON-LD from the body", () => {
    const out = assembleContentAsset(a, project());
    const types = out.jsonLd.map((o) => o["@type"]);
    expect(types).toContain("Article");
    expect(types).toContain("FAQPage");
    expect(out.jsonLdScript).toContain("application/ld+json");
  });
});

describe("composition — TL;DR and key takeaways fold into the canonical body", () => {
  it("prepends a visible TL;DR section", () => {
    const out = assembleContentAsset(
      asset({ tldr: "Quick summary.", markdown: "## Body\n\ntext" }),
      project(),
    );
    expect(out.markdown.startsWith("## TL;DR\n\nQuick summary.")).toBe(true);
    expect(out.markdown).toContain("## Body");
    expect(out.html).toContain("<h2>TL;DR</h2>");
  });

  it("renders key takeaways as a bullet list", () => {
    const out = assembleContentAsset(
      asset({ keyTakeaways: ["one", "two"], markdown: "body" }),
      project(),
    );
    expect(out.markdown).toContain("## Key takeaways");
    expect(out.html).toContain("<li>one</li>");
    expect(out.html).toContain("<li>two</li>");
  });

  it("an asset with no lead fields composes to exactly its body (no stray headings)", () => {
    expect(composeCanonicalMarkdown(asset({ markdown: "just a body" }), project())).toBe(
      "just a body",
    );
  });
});

describe("schema-content consistency — FAQPage comes from the assembled body, not the faq[] side field", () => {
  it("uses the body FAQ and ignores an orphaned faq[] side field", () => {
    const a = asset({
      faq: [{ q: "orphan question?", a: "never published" }],
      markdown: "## FAQ\n\n### Real question?\n\nReal answer.",
    });
    const faqPage = assembleContentAsset(a, project()).jsonLd.find((o) => o["@type"] === "FAQPage");
    const json = JSON.stringify(faqPage);
    expect(json).toContain("Real question?");
    expect(json).not.toContain("orphan question?");
  });

  it("does not double-compose a FAQ already authored in the body", () => {
    const a = asset({
      faq: [{ q: "x", a: "y" }],
      markdown: "## FAQ\n\n### Only once?\n\nYes.",
    });
    const occurrences =
      assembleContentAsset(a, project()).markdown.split("### Only once?").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("preview == publish parity (T1 / T10)", () => {
  it("one assembler output serves both; table/link/bold/ordered-list/FAQ render identically", () => {
    const md =
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n**bold** and [svc](/services)\n\n1. one\n2. two\n\n## FAQ\n\n### Q?\n\nA.";
    const a = asset({ markdown: md });
    const active = new Set(["/services"]);
    // "Preview" and "publish" are now the SAME function with the SAME active set.
    const preview = assembleContentAsset(a, project(), { activeInternalPaths: active }).html;
    const publish = assembleContentAsset(a, project(), { activeInternalPaths: active }).html;
    expect(preview).toBe(publish);
    expect(preview).toContain("<table>");
    expect(preview).toContain('<a href="/services">svc</a>');
    expect(preview).toContain("<strong>bold</strong>");
    expect(preview).toContain("<ol>");
  });

  it("an unverified internal link stays inactive in the assembled html (link-safety preserved)", () => {
    const a = asset({ markdown: "See [invented](/made-up)." });
    const html = assembleContentAsset(a, project(), {
      activeInternalPaths: new Set(["/services"]),
    }).html;
    expect(html).not.toContain('href="/made-up"');
    expect(html).toContain("invented"); // text kept
  });
});
