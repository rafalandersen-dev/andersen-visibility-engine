import { describe, expect, it } from "vitest";
import { markdownToSections } from "./markdown";
import { articleJsonLd, faqFromSections, safeSections, toPostView } from "./published";

const md = `# Title

Intro with [a link](/pricing) and **bold**.

## Frequently asked questions

### Is it free?

Yes, there is a free preview.

### Does it guarantee rankings?

- No
- Nobody can

## After
`;

describe("published articles", () => {
  it("derives FAQ pairs only from the FAQ block", () => {
    expect(faqFromSections(markdownToSections(md, "Title"))).toEqual([
      { q: "Is it free?", a: "Yes, there is a free preview." },
      { q: "Does it guarantee rankings?", a: "No; Nobody can" },
    ]);
    expect(faqFromSections(markdownToSections("## Steps\n\n### One\n\nText", "x"))).toEqual([]);
  });

  it("emits Article, and FAQPage only when there is an FAQ", () => {
    const row = {
      slug: "t",
      title: "Title",
      meta_title: "",
      meta_description: "",
      published_at: "2026-12-01T09:00:00Z",
      updated_at: "2026-12-03T09:00:00Z",
    };
    const withFaq = toPostView({ ...row, sections: markdownToSections(md, "Title") });
    expect(withFaq.seoTitle).toBe("Title | Milo Growth");
    expect(withFaq.description).toBe("Intro with a link and bold.");
    expect(withFaq.updatedAt).toBe("2026-12-03");
    const ld = articleJsonLd(withFaq);
    expect(ld.map((x) => x["@type"])).toEqual(["Article", "FAQPage"]);
    expect(ld[0].mainEntityOfPage).toBe("https://milogrowth.com/blog/t");
    const plain = toPostView({ ...row, sections: markdownToSections("Just text", "Title") });
    expect(articleJsonLd(plain).map((x) => x["@type"])).toEqual(["Article"]);
  });

  it("drops stored sections that are malformed or unsafe", () => {
    expect(
      safeSections([
        { type: "p", text: "ok" },
        { type: "image", src: "javascript:alert(1)", alt: "x" },
        { type: "script", text: "x" },
        { type: "ul", items: [1] },
      ]),
    ).toEqual([{ type: "p", text: "ok" }]);
  });
});
