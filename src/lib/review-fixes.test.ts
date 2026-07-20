/**
 * Adversarial-review fixes (Phase 2b) — pins the concrete defects the review found.
 */
import { describe, it, expect } from "vitest";
import { assembleContentAsset, composeCanonicalMarkdown } from "./content-assembler";
import { buildContentJsonLd } from "./structured-data";
import { assessReadiness } from "./readiness";
import type { ContentAsset, ContentImage, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;
const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;
const img = (over: Partial<ContentImage> = {}): ContentImage =>
  ({
    id: "i1",
    concept: "hero",
    url: "https://site.com/media/a.jpg",
    alt: "A studio",
    placement: "featured",
    status: "accepted",
    ...over,
  }) as ContentImage;

describe("image allow-list bypass fixed", () => {
  it("a body reference to an approved URL with EMPTY alt does not render an alt-less img", () => {
    const a = asset({
      markdown: "Body ![](https://site.com/media/a.jpg) more.",
      images: [img()],
    });
    const html = assembleContentAsset(a, project()).html;
    // The one composed image (with its approved alt) renders; the alt-less body
    // reference does not.
    expect((html.match(/<img /g) || []).length).toBe(1);
    expect(html).not.toContain('alt="" ');
  });

  it("an approved URL reused in the body does not render a duplicate image", () => {
    const a = asset({
      markdown: "Body ![dup](https://site.com/media/a.jpg) more.",
      images: [img()],
    });
    const html = assembleContentAsset(a, project()).html;
    expect((html.match(/<img /g) || []).length).toBe(1);
  });
});

describe("section dedup normalisation", () => {
  it("a singular body heading suppresses the composed plural section (Key Takeaway)", () => {
    const a = asset({
      keyTakeaways: ["one", "two"],
      markdown: "## Key Takeaway\n\nExisting.\n\n## Body\n\nx",
    });
    const md = composeCanonicalMarkdown(a, project());
    expect((md.match(/key takeaway/gi) || []).length).toBe(1);
  });

  it('an ordinary "Summary" section no longer silently suppresses a real TL;DR', () => {
    const a = asset({
      tldr: "Quick summary line.",
      markdown: "## Summary\n\nA section.\n\n## Body\n\nx",
    });
    const md = composeCanonicalMarkdown(a, project());
    expect(md).toContain("## TL;DR");
    expect(md).toContain("Quick summary line.");
    expect(md).toContain("## Summary");
  });
});

describe("schema visibility gate", () => {
  it("author Person JSON-LD is NOT emitted when the visible byline is suppressed", () => {
    const a = asset({
      author: { name: "Dr Lena", credentials: "PT" },
      markdown: "Body.\n\n## About the author\n\n**Someone else entirely**",
    });
    const article = assembleContentAsset(a, project()).jsonLd.find((o) => o["@type"] === "Article");
    // Byline suppressed → schema falls back to the Organization, not the unseen Person.
    expect((article?.author as Record<string, unknown>)["@type"]).toBe("Organization");
  });

  it("BreadcrumbList is emitted WITH a visible trail, and omitted when there are none", () => {
    const withCrumbs = assembleContentAsset(
      asset({
        breadcrumbs: [
          { name: "Home", url: "https://site.com" },
          { name: "Guides", url: "https://site.com/guides" },
        ],
      }),
      project(),
    );
    expect(withCrumbs.markdown).toContain("Home › Guides"); // visible counterpart
    expect(withCrumbs.jsonLd.some((o) => o["@type"] === "BreadcrumbList")).toBe(true);

    const noCrumbs = assembleContentAsset(asset(), project());
    expect(noCrumbs.jsonLd.some((o) => o["@type"] === "BreadcrumbList")).toBe(false);
  });
});

describe("FAQ question de-duplication", () => {
  it("a repeated question heading emits only one Question entity", () => {
    const objs = buildContentJsonLd({
      title: "T",
      bodyMarkdown: "## FAQ\n\n### Does it hurt?\n\nA little.\n\n### Does it hurt?\n\nRepeated.",
    });
    const faqPage = objs.find((o) => o["@type"] === "FAQPage");
    expect((faqPage?.mainEntity as unknown[]).length).toBe(1);
  });
});

describe("YMYL hardening (Phase 2c)", () => {
  it("detects broadened medical / financial / legal claims", () => {
    for (const claim of [
      "This supplement lowers blood pressure fast.",
      "Grow your investment with guaranteed dividends.",
      "You can sue for full liability in this lawsuit.",
    ]) {
      expect(
        assessReadiness(asset({ markdown: claim }), project(), []).ymyl.signals.length,
      ).toBeGreaterThan(0);
    }
  });

  it("catches a YMYL claim placed only in the title/meta (not just the body)", () => {
    const a = asset({ title: "A natural cure for diabetes", markdown: "Our friendly studio." });
    const r = assessReadiness(a, project(), []);
    expect(r.ymyl.signals).toContain("medical");
    expect(r.ymyl.level).toBe("fail"); // unsupported
  });

  it("a bare name + URL author is NOT sufficient support (fail); a credential is (review)", () => {
    const claim = "This treatment reduces chronic pain and inflammation.";
    const bare = asset({
      markdown: claim,
      author: { name: "Joe", url: "https://x.com/joe" } as never,
    });
    expect(assessReadiness(bare, project(), []).ymyl.level).toBe("fail");

    const credentialed = asset({
      markdown: claim,
      author: { name: "Dr Lena", credentials: "PT, MSc" } as never,
    });
    expect(assessReadiness(credentialed, project(), []).ymyl.level).toBe("review");
  });

  it("ordinary non-medical content still passes", () => {
    expect(
      assessReadiness(
        asset({ markdown: "Our studio offers a calm, welcoming space." }),
        project(),
        [],
      ).ymyl.level,
    ).toBe("pass");
  });
});
