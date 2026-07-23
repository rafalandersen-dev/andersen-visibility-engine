/**
 * Featured image (Article Studio 3.0 / P1.2B) — spec §4.3 acceptance:
 * one Storage object with metadata-only variants; alt/approval hard gates for
 * v3 articles (legacy never retro-blocked); hero compiled through the SAME
 * P1.2D allow-listed boundary; JSON-LD Article.image from social||url; legacy
 * assets without a FeaturedImage render byte-identically to before.
 */
import { describe, it, expect } from "vitest";
import {
  compileFeaturedHeroHtml,
  featuredImageActive,
  featuredMarkdown,
  featuredOgImageUrl,
  validateFeaturedImage,
  variantPresentation,
} from "./featured-image";
import { assembleContentAsset } from "./content-assembler";
import { buildPublishingChecklist } from "./checklist";
import type { ContentAsset, FeaturedImage, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const featured = (over: Partial<FeaturedImage> = {}): FeaturedImage => ({
  imageId: "img1",
  storagePath: "uid/p/a/img1.jpg",
  url: "https://site.com/media/img1.jpg",
  alt: "A hero image",
  hero: { aspectRatio: "wide", fit: "cover" },
  approval: "approved",
  ...over,
});

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    status: "Approved",
    markdown: "## Body\n\ntext",
    ...over,
  }) as ContentAsset;

describe("activation + variants", () => {
  it("active only when approved with url + alt", () => {
    expect(featuredImageActive({ featuredImage: featured() })).toBe(true);
    expect(featuredImageActive({ featuredImage: featured({ approval: "draft" }) })).toBe(false);
    expect(featuredImageActive({ featuredImage: featured({ alt: " " }) })).toBe(false);
    expect(featuredImageActive({ featuredImage: featured({ url: "" }) })).toBe(false);
    expect(featuredImageActive({})).toBe(false);
  });

  it("a variant is crop metadata only: forced full/center, clamped focal", () => {
    const p = variantPresentation({
      aspectRatio: "square",
      fit: "contain",
      focalPoint: { x: 9, y: -1 },
    });
    expect(p.size).toBe("full");
    expect(p.alignment).toBe("center");
    expect(p.aspectRatio).toBe("square");
    expect(p.focalPoint).toEqual({ x: 1, y: 0 }); // clamped, never dropped silently
  });

  it("hero compiles through the P1.2D allow-listed boundary; mobile rides milo-m-*", () => {
    const html = compileFeaturedHeroHtml(
      featured({
        caption: "Cap <b>",
        hero: { aspectRatio: "wide", fit: "cover", focalPoint: { x: 0.25, y: 0.75 } },
        mobile: { aspectRatio: "square", fit: "cover" },
      }),
    );
    expect(html).toContain("milo-image milo-size-full milo-align-center milo-aspect-wide");
    expect(html).toContain('style="object-position:25% 75%"');
    expect(html).toContain("Cap &lt;b&gt;"); // caption escaped
    expect(html).toContain("milo-m-aspect-square"); // mobile crop, same object
    // ONE object: the url appears exactly once — variants add zero new sources.
    expect(html.split("https://site.com/media/img1.jpg").length - 1).toBe(1);
  });
});

describe("validation (checklist-facing)", () => {
  it("v3 without a featured image blocks; legacy without one passes", () => {
    expect(validateFeaturedImage(asset(), project(), true)[0]?.code).toBe("missing-featured");
    expect(validateFeaturedImage(asset(), project(), false)).toEqual([]);
  });

  it("a PRESENT featured image is validated regardless of vintage", () => {
    const bad = asset({ featuredImage: featured({ approval: "draft", alt: "" }) });
    const codes = validateFeaturedImage(bad, project(), false).map((f) => f.code);
    expect(codes).toContain("unapproved-featured");
    expect(codes).toContain("missing-alt");
  });

  it("hotlinked url and out-of-range focal block", () => {
    const hotlink = asset({ featuredImage: featured({ url: "https://evil.com/x.jpg" }) });
    expect(validateFeaturedImage(hotlink, project(), false).map((f) => f.code)).toContain(
      "uncontrolled-origin",
    );
    const focal = asset({
      featuredImage: featured({
        hero: { aspectRatio: "wide", fit: "cover", focalPoint: { x: 2, y: 0 } },
      }),
    });
    expect(validateFeaturedImage(focal, project(), false).map((f) => f.code)).toContain(
      "focal-out-of-range",
    );
  });

  it("checklist: v3 article without featured image is publish-blocked; legacy is not", () => {
    const v3 = asset({ visualModelVersion: 3, hook: undefined } as Partial<ContentAsset>);
    const item = buildPublishingChecklist(v3, project(), [v3]).find(
      (i) => i.key === "featuredImage",
    )!;
    expect(item.passed).toBe(false);
    expect(item.blocking).toBe(true);
    const legacy = asset();
    expect(
      buildPublishingChecklist(legacy, project(), [legacy]).find((i) => i.key === "featuredImage")!
        .passed,
    ).toBe(true);
  });
});

describe("assembler + JSON-LD integration", () => {
  it("an ACTIVE featured image renders ONE compiled hero, no token leak, degraded markdown", () => {
    const a = asset({ featuredImage: featured() });
    const out = assembleContentAsset(a, project());
    expect(out.html.split("<figure").length - 1).toBe(1);
    expect(out.html).toContain("milo-size-full");
    expect(out.html).not.toContain("milo-image:");
    expect(out.markdown).not.toContain("milo-image:");
    expect(out.markdown).toContain("![A hero image](https://site.com/media/img1.jpg)");
    // JSON-LD carries the representative image.
    expect(JSON.stringify(out.jsonLd)).toContain("https://site.com/media/img1.jpg");
  });

  it("social physicalUrl wins as the OG/JSON-LD image", () => {
    const a = asset({
      featuredImage: featured({ social: { physicalUrl: "https://site.com/media/og.jpg" } }),
    });
    expect(featuredOgImageUrl(a)).toBe("https://site.com/media/og.jpg");
    expect(JSON.stringify(assembleContentAsset(a, project()).jsonLd)).toContain(
      "https://site.com/media/og.jpg",
    );
  });

  it("draft/absent featured image → legacy rendering, byte-identical", () => {
    const legacyImg = {
      id: "img9",
      concept: "hero",
      url: "https://site.com/media/img9.jpg",
      alt: "Legacy",
      placement: "featured",
      status: "accepted",
    };
    const noFeat = asset({ images: [legacyImg] as never });
    const draftFeat = asset({
      images: [legacyImg] as never,
      featuredImage: featured({ approval: "draft" }),
    });
    const a = assembleContentAsset(noFeat, project());
    const b = assembleContentAsset(draftFeat, project());
    expect(b.markdown).toBe(a.markdown);
    expect(b.html).toBe(a.html);
    expect(a.html).toContain('<img src="https://site.com/media/img9.jpg" alt="Legacy"');
    expect(a.html).not.toContain("<figure");
    expect(JSON.stringify(a.jsonLd)).not.toContain("img9.jpg"); // no image claim without approval
  });

  // ---- Review-fix regressions ----
  it("a malformed record without alt never throws (guards, not crashes)", () => {
    const noAlt = { featuredImage: { ...featured(), alt: undefined } as never };
    expect(featuredImageActive(noAlt)).toBe(false);
    expect(() => validateFeaturedImage(noAlt, project(), true)).not.toThrow();
  });

  it("an unknown variant preset value hard-blocks (invalid-preset)", () => {
    const bad = asset({
      featuredImage: featured({ hero: { aspectRatio: "evil" as never, fit: "cover" } }),
    });
    expect(validateFeaturedImage(bad, project(), false).map((f) => f.code)).toContain(
      "invalid-preset",
    );
  });

  it("a token-unsafe imageId degrades to literal featured markdown — hero never dropped", () => {
    const a = asset({ featuredImage: featured({ imageId: "bad id)paren" }) });
    const out = assembleContentAsset(a, project());
    expect(out.markdown).toContain("![A hero image](https://site.com/media/img1.jpg)");
    expect(out.markdown).not.toContain("milo-image:");
    expect(out.html).not.toContain("milo-image:");
  });

  it("mobile focal is not bridged (P1.2D renders no mobile object-position)", () => {
    const html = compileFeaturedHeroHtml(
      featured({ mobile: { aspectRatio: "square", fit: "cover", focalPoint: { x: 0.1, y: 0.9 } } }),
    );
    expect(html).toContain("milo-m-aspect-square");
    expect(html.match(/object-position/g) ?? []).toHaveLength(0); // no hero focal set either
  });

  it("markdown degrade includes the caption", () => {
    expect(featuredMarkdown(featured({ caption: "The cap" }))).toBe(
      "![A hero image](https://site.com/media/img1.jpg)\n\n*The cap*",
    );
  });
});
