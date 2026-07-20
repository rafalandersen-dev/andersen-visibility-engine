/**
 * Article Studio 2.0 acceptance — closing the previously-partial cases
 * (T9 mobile, T11 comparison, T14 refresh/idempotency, T16 WP/Woo payload) + the
 * cross-cutting invariants (no side field publishes; assembler is idempotent).
 */
import { describe, it, expect } from "vitest";
import { assembleContentAsset } from "./content-assembler";
import { wpPublishArgs, shopifyArticleArgs } from "./publish-targets";
import { buildContentJsonLd } from "./structured-data";
import type { ContentAsset, Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://site.com",
    connectorType: "wordpress",
    wordpress: { siteUrl: "https://site.com", username: "u", applicationPassword: "p" },
    ...over,
  }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;

describe("T9 — mobile rendering uses the same assembled HTML", () => {
  it("the assembler has no viewport parameter, so mobile == desktop content", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n**bold** and a list\n\n- one\n- two";
    const a = asset({ markdown: md });
    // The editor's mobile toggle only wraps THIS html in a narrower container.
    const html = assembleContentAsset(a, project()).html;
    const again = assembleContentAsset(a, project()).html;
    expect(html).toBe(again); // deterministic, viewport-independent
    expect(html).toContain("<table>");
    expect(html).not.toMatch(/style=|width:/); // no inline sizing that could differ by viewport
  });
});

describe("T11 — product comparison content", () => {
  it("renders a real comparison table (thead/tbody) + a CTA, not a wall of pipes", () => {
    const md = [
      "## Compare plans",
      "",
      "| Product | Price | Best for |",
      "| --- | --- | --- |",
      "| Basic | 10 | Starters |",
      "| Pro | 20 | Teams |",
      "",
      "[Book a consultation](https://site.com/book)",
    ].join("\n");
    const html = assembleContentAsset(asset({ markdown: md }), project()).html;
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<td>Basic</td>");
    expect(html).toContain("<td>Pro</td>");
    expect(html).not.toContain("| Product |"); // never a raw pipe wall
    expect(html).toContain('<a href="https://site.com/book">Book a consultation</a>');
  });
});

describe("T14 — refresh / republish idempotency", () => {
  it("re-assembling the same asset is deterministic and does not duplicate sections", () => {
    const a = asset({ tldr: "Summary.", markdown: "## FAQ\n\n### Q?\n\nA." });
    const first = assembleContentAsset(a, project());
    const second = assembleContentAsset(a, project());
    expect(first.markdown).toBe(second.markdown);
    expect((first.markdown.match(/## TL;DR/g) || []).length).toBe(1);
    expect(first.jsonLd.filter((o) => o["@type"] === "FAQPage")).toHaveLength(1);
  });

  it("removing FAQ / author / breadcrumb data removes the stale output", () => {
    const full = asset({
      markdown: "## FAQ\n\n### Q?\n\nA.",
      author: { name: "Dr Lena", credentials: "PT" },
      breadcrumbs: [{ name: "Home", url: "https://site.com" }],
    });
    const withAll = assembleContentAsset(full, project());
    expect(withAll.jsonLd.some((o) => o["@type"] === "FAQPage")).toBe(true);
    expect(withAll.jsonLd.some((o) => o["@type"] === "BreadcrumbList")).toBe(true);
    expect(
      (withAll.jsonLd.find((o) => o["@type"] === "Article")?.author as Record<string, unknown>)[
        "@type"
      ],
    ).toBe("Person");

    const stripped = assembleContentAsset(asset({ markdown: "Just prose now." }), project());
    expect(stripped.jsonLd.some((o) => o["@type"] === "FAQPage")).toBe(false);
    expect(stripped.jsonLd.some((o) => o["@type"] === "BreadcrumbList")).toBe(false);
    expect(
      (stripped.jsonLd.find((o) => o["@type"] === "Article")?.author as Record<string, unknown>)[
        "@type"
      ],
    ).toBe("Organization");
  });

  it("connector identity is preserved (update path, no duplicate post)", () => {
    const a = asset({
      markdown: "Body.",
      wordpressPostId: 42,
      shopifyArticleGid: "gid://s/Article/9",
    });
    const wp = wpPublishArgs(a, project(), ["/"]);
    expect(wp.postId).toBe(42); // updates in place, never creates
    const sh = shopifyArticleArgs(
      a,
      project({
        connectorType: "shopify",
        shopify: {
          shopDomain: "s.myshopify.com",
          adminAccessToken: "t",
          defaultBlogId: "gid://s/Blog/1",
        },
      }),
      ["/"],
    );
    expect(sh.articleGid).toBe("gid://s/Article/9");
  });
});

describe("T16 — WordPress/Shopify payload (assembled body + schema)", () => {
  it("WordPress args carry the ASSEMBLED body + JSON-LD script", () => {
    const a = asset({ tldr: "Quick.", markdown: "## FAQ\n\n### Q?\n\nA." });
    const assembled = assembleContentAsset(a, project(), { activeInternalPaths: new Set(["/"]) });
    const wp = wpPublishArgs(a, project(), ["/"]);
    expect(wp.contentMarkdown).toBe(assembled.markdown);
    expect(wp.contentMarkdown).toContain("## TL;DR");
    expect(wp.jsonLd).toContain("application/ld+json");
  });

  it("Shopify args carry the assembled body + JSON-LD (payload verification, not CMS retention)", () => {
    const a = asset({ markdown: "## FAQ\n\n### Q?\n\nA." });
    const sh = shopifyArticleArgs(
      a,
      project({
        connectorType: "shopify",
        shopify: {
          shopDomain: "s.myshopify.com",
          adminAccessToken: "t",
          defaultBlogId: "gid://s/Blog/1",
        },
      }),
      ["/"],
    );
    expect(sh.contentMarkdown).toBe(assembleContentAsset(a, project()).markdown);
    expect(sh.jsonLd).toContain("FAQPage");
  });
});

describe("no side field publishes without being assembled into the body", () => {
  it("a faq[] side field NOT written into the body never appears in schema or output", () => {
    const a = asset({
      faq: [{ q: "Orphan?", a: "Never published" }],
      markdown: "Just prose, no FAQ section.",
    });
    const out = assembleContentAsset(a, project());
    expect(out.markdown).not.toContain("Orphan?");
    expect(out.jsonLd.some((o) => o["@type"] === "FAQPage")).toBe(false);
    // FAQPage would exist ONLY if the FAQ is in the visible body.
    expect(
      buildContentJsonLd({ title: "T", bodyMarkdown: a.markdown }).some(
        (o) => o["@type"] === "FAQPage",
      ),
    ).toBe(false);
  });
});
