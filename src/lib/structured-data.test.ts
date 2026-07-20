/**
 * P0.5 — deterministic structured data from visible content.
 *
 * Pins: Article + FAQPage JSON-LD is generated deterministically from the
 * published title/meta and the FAQ that appears IN THE BODY — never fabricated,
 * never from a non-published side-field. Schema and visible content stay
 * consistent.
 */
import { describe, it, expect } from "vitest";
import {
  extractFaqFromMarkdown,
  buildContentJsonLd,
  renderJsonLdScript,
  contentJsonLdScript,
} from "./structured-data";

describe("extractFaqFromMarkdown (P0.5)", () => {
  it("extracts question headings + their body answers", () => {
    const md = "## FAQ\n\n### How long does it take?\n\nUsually two weeks.\n\n### Do you offer refunds?\n\nYes, within 14 days.";
    const faqs = extractFaqFromMarkdown(md);
    expect(faqs).toEqual([
      { question: "How long does it take?", answer: "Usually two weeks." },
      { question: "Do you offer refunds?", answer: "Yes, within 14 days." },
    ]);
  });

  it("ignores non-question headings and questions with no answer", () => {
    const md = "## Overview\n\nSome intro.\n\n### What is included?\n\n### Next\n\nBody.";
    // No FAQ section, and "What is included?" has no answer → excluded.
    expect(extractFaqFromMarkdown(md)).toEqual([]);
  });

  it("does NOT treat a CTA/rhetorical heading outside an FAQ section as an FAQ (P0-review fix)", () => {
    const md = "## Ready to start?\n\nBook a consultation today.\n\n## Why choose us?\n\nWe care.";
    expect(extractFaqFromMarkdown(md)).toEqual([]);
  });

  it("only extracts questions INSIDE the FAQ section, not after it ends", () => {
    const md =
      "## FAQ\n\n### Does it hurt?\n\nA little.\n\n## Ready to start?\n\nCall us.";
    const faqs = extractFaqFromMarkdown(md);
    expect(faqs.map((f) => f.question)).toEqual(["Does it hurt?"]);
  });

  it("strips markdown from question/answer so schema matches the visible text", () => {
    const md = "## FAQ\n\n### Is it **safe**?\n\nYes — see [our guide](/guide) and `notes`.";
    const [faq] = extractFaqFromMarkdown(md);
    expect(faq.question).toBe("Is it safe?");
    expect(faq.answer).toBe("Yes — see our guide and notes.");
  });
});

describe("buildContentJsonLd (P0.5)", () => {
  const base = {
    title: "Deep tissue massage in Malmö",
    description: "What to expect from a deep tissue session.",
    businessName: "Synergy Massage",
    url: "https://synergymassage.se/guides/deep-tissue",
    datePublished: "2026-07-19T19:00:00Z",
  };

  it("always emits a consistent Article from the published title/meta", () => {
    const [article] = buildContentJsonLd({ ...base, bodyMarkdown: "# H\n\nBody." });
    expect(article["@type"]).toBe("Article");
    expect(article.headline).toBe(base.title);
    expect(article.description).toBe(base.description);
    expect(article.mainEntityOfPage).toBe(base.url);
    expect(article.publisher).toEqual({ "@type": "Organization", name: "Synergy Massage" });
  });

  it("emits FAQPage ONLY from FAQ present in the body (schema–content consistency)", () => {
    const withFaq = buildContentJsonLd({
      ...base,
      bodyMarkdown: "## FAQ\n\n### Does it hurt?\n\nA little pressure, no sharp pain.",
    });
    const faqPage = withFaq.find((o) => o["@type"] === "FAQPage");
    expect(faqPage).toBeTruthy();
    expect((faqPage!.mainEntity as unknown[]).length).toBe(1);
    expect((faqPage!.mainEntity as { name: string }[])[0].name).toBe("Does it hurt?");
  });

  it("emits NO FAQPage when the body has no FAQ (never fabricates)", () => {
    const objs = buildContentJsonLd({ ...base, bodyMarkdown: "# Title\n\nJust prose, no FAQ." });
    expect(objs.find((o) => o["@type"] === "FAQPage")).toBeUndefined();
  });

  it("does not include a question that is not visible in the body", () => {
    // A side-field FAQ that never made it into the body must not appear in schema.
    const objs = buildContentJsonLd({
      ...base,
      bodyMarkdown: "## FAQ\n\n### Visible question?\n\nVisible answer.",
    });
    const faqPage = objs.find((o) => o["@type"] === "FAQPage")!;
    const names = (faqPage.mainEntity as { name: string }[]).map((q) => q.name);
    expect(names).toEqual(["Visible question?"]);
    expect(names).not.toContain("Invisible side-field question?");
  });

  it("is deterministic", () => {
    const md = "## FAQ\n\n### Q?\n\nA.";
    expect(JSON.stringify(buildContentJsonLd({ ...base, bodyMarkdown: md }))).toBe(
      JSON.stringify(buildContentJsonLd({ ...base, bodyMarkdown: md })),
    );
  });
});

describe("renderJsonLdScript (P0.5)", () => {
  it("returns empty string for no objects", () => {
    expect(renderJsonLdScript([])).toBe("");
  });

  it("wraps in a script tag and escapes < so JSON cannot break out", () => {
    const s = contentJsonLdScript({ title: "T", bodyMarkdown: "x", description: "a<b" });
    expect(s).toContain('<script type="application/ld+json">');
    expect(s).not.toContain("a<b");
    expect(s).toContain("a\\u003cb");
  });
});
