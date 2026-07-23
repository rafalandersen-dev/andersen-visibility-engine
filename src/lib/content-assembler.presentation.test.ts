/**
 * Presentation identity + assembly (Article Studio 3.0 / P1.2D).
 *
 * Proves image identity is the ContentImage.id token (not the URL), the token never
 * leaks, presented images render as their compiled <figure> in HTML and as degraded
 * markdown, a presented image sits at its stable anchor, assembly is pure/idempotent,
 * and a no-presentation asset is byte-identical to the pre-P1.2D output.
 */
import { describe, it, expect } from "vitest";
import { assembleContentAsset, composeCanonicalMarkdown } from "./content-assembler";
import { reconcileSectionIndex } from "./section-index";
import { serializeAnchor } from "./anchors";
import { DEFAULT_PRESENTATION } from "./presentation-compiler";
import type { ContentAsset, ContentImage, ImagePresentation, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const pres = (over: Partial<ImagePresentation> = {}): ImagePresentation => ({
  ...DEFAULT_PRESENTATION,
  ...over,
});

const img = (over: Partial<ContentImage> = {}): ContentImage =>
  ({
    id: "i1",
    concept: "c",
    url: "https://site.com/a.png",
    alt: "A",
    placement: "inline",
    status: "accepted",
    anchor: serializeAnchor({ kind: "article-end" }),
    ...over,
  }) as ContentImage;

const asset = (images: ContentImage[], markdown = "## Body\n\ntext"): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown,
    sectionIndex: reconcileSectionIndex(undefined, markdown, () => "sec_x0000"),
    images,
    ...({} as Record<string, never>),
  }) as ContentAsset;

const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("image identity is the id token, never the URL", () => {
  it("the same Storage URL used by two image ids renders two distinct presentations (test 1)", () => {
    const a = asset([
      img({ id: "iA", alt: "A", order: 0, presentation: pres({ size: "large" }) }),
      img({ id: "iB", alt: "B", order: 1, presentation: pres({ size: "small" }) }),
    ]);
    const out = assembleContentAsset(a, project());
    expect(count(out.html, "<figure")).toBe(2);
    expect(out.html).toContain("milo-size-large");
    expect(out.html).toContain("milo-size-small");
  });

  it("one image id renders exactly once (test 2)", () => {
    const out = assembleContentAsset(asset([img({ presentation: pres() })]), project());
    expect(count(out.html, "<figure")).toBe(1);
    expect(count(out.html, "https://site.com/a.png")).toBe(1);
  });

  it("a body-authored image with the same URL does not inherit presentation (test 3)", () => {
    const a = asset(
      [img({ id: "iC", presentation: pres({ visualStyle: "card" }) })],
      "## Body\n\n![body-authored](https://site.com/a.png)\n\ntext",
    );
    const out = assembleContentAsset(a, project());
    // The presented ContentImage renders as a figure; the body image is stripped and
    // never becomes a figure or inherits the card style.
    expect(count(out.html, "<figure")).toBe(1);
    expect(out.html).not.toContain('alt="body-authored"');
  });

  it("the internal token never leaks into markdown or HTML (test 4)", () => {
    const out = assembleContentAsset(asset([img({ presentation: pres() })]), project());
    expect(out.markdown).not.toContain("milo-image:");
    expect(out.html).not.toContain("milo-image:");
    expect(out.markdown).toContain("![A](https://site.com/a.png)"); // degraded real-URL markdown
  });
});

describe("anchoring, parity, purity", () => {
  it("a presented image stays at its stable semantic anchor (test 15)", () => {
    const md = "## Intro\n\nintro\n\n## Details\n\ndetail";
    const idx = reconcileSectionIndex(undefined, md, () => "sec_det001");
    const a = {
      ...asset([], md),
      sectionIndex: idx,
      images: [
        img({
          presentation: pres({ visualStyle: "card" }),
          anchor: serializeAnchor({
            kind: "before-section",
            sectionId: idx.find((s) => s.heading === "Details")!.id,
          }),
        }),
      ],
    } as ContentAsset;
    const html = assembleContentAsset(a, project()).html;
    expect(html.indexOf("<figure")).toBeGreaterThan(html.indexOf("Intro"));
    expect(html.indexOf("<figure")).toBeLessThan(html.indexOf("Details"));
  });

  it("repeated assembly is byte-identical (test 16)", () => {
    const a = asset([img({ presentation: pres({ focalPoint: { x: 0.2, y: 0.8 } }) })]);
    const first = assembleContentAsset(a, project());
    const second = assembleContentAsset(a, project());
    expect(second.markdown).toBe(first.markdown);
    expect(second.html).toBe(first.html);
  });

  it("the assembler does not mutate the asset (test 17)", () => {
    const a = asset([img({ presentation: pres() })]);
    const snap = JSON.stringify(a);
    assembleContentAsset(a, project());
    expect(JSON.stringify(a)).toBe(snap);
  });

  it("a no-presentation image is byte-identical to the pre-P1.2D output (test 18)", () => {
    const a = asset([img({ alt: "L", url: "https://site.com/leg.png" })]); // no presentation
    const out = assembleContentAsset(a, project());
    expect(out.markdown).toContain("![L](https://site.com/leg.png)"); // legacy markdown
    expect(out.html).toContain('<img src="https://site.com/leg.png" alt="L" loading="lazy" />');
    expect(out.html).not.toContain("<figure"); // no figure for an un-presented image
    // composeCanonicalMarkdown emits no token for an un-presented image.
    expect(composeCanonicalMarkdown(a, project())).not.toContain("milo-image:");
  });
});

describe("token robustness — hostile alt & exotic ids never leak the token", () => {
  it("alt containing ']' still renders one figure and never leaks the token (test 19)", () => {
    const a = asset([img({ id: "iZ", alt: "Figure [2] result]", presentation: pres() })]);
    const out = assembleContentAsset(a, project());
    expect(out.markdown).not.toContain("milo-image:");
    expect(out.html).not.toContain("milo-image:");
    expect(count(out.html, "<figure")).toBe(1);
    expect(out.html).toContain('alt="Figure [2] result]"'); // real alt in the figure
  });

  it("alt containing a newline renders a clean BLOCK figure, not one nested in <p> (test 20)", () => {
    const a = asset([img({ id: "iN", alt: "Line one\nLine two", presentation: pres() })]);
    const out = assembleContentAsset(a, project());
    expect(out.html).not.toContain("milo-image:");
    expect(count(out.html, "<figure")).toBe(1);
    expect(out.html).not.toContain("<p><figure");
  });

  it("a token-UNSAFE id degrades to a legacy <img> (no token, no crash, no figure) (test 21)", () => {
    const a = asset([
      img({
        id: "bad id)with paren",
        alt: "Z",
        url: "https://site.com/z.png",
        presentation: pres(),
      }),
    ]);
    const out = assembleContentAsset(a, project());
    expect(out.markdown).not.toContain("milo-image:");
    expect(out.html).not.toContain("milo-image:");
    expect(out.html).not.toContain("<figure"); // degraded — no presentation
    expect(out.html).toContain('<img src="https://site.com/z.png" alt="Z" loading="lazy" />');
  });
});
