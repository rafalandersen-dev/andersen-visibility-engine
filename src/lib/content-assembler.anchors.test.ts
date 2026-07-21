/**
 * Anchored inline-image weaving through the canonical assembler (P1.2C).
 *
 * Proves the assembler weaves resolved images at their semantic anchor, orders
 * deterministically, excludes broken anchors, preserves legacy byte-behaviour when
 * no anchors exist, is idempotent, and never mutates the asset.
 */
import { describe, it, expect } from "vitest";
import { composeCanonicalMarkdown, assembleContentAsset } from "./content-assembler";
import { reconcileSectionIndex } from "./section-index";
import { serializeAnchor } from "./anchors";
import type { ContentAsset, ContentImage, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

let idc = 0;
const alloc = () => `sec_${(idc++).toString().padStart(4, "0")}`;

const img = (over: Partial<ContentImage> = {}): ContentImage =>
  ({
    id: "i0",
    concept: "c",
    url: "https://site.com/a.png",
    alt: "ALT",
    placement: "inline",
    status: "accepted",
    ...over,
  }) as ContentImage;

const v3 = (
  body: string,
  images: ContentImage[],
  extra: Partial<ContentAsset> = {},
): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: body,
    visualModelVersion: 3,
    sectionIndex: reconcileSectionIndex(undefined, body, alloc),
    images,
    ...extra,
  }) as ContentAsset;

const sid = (a: ContentAsset, heading: string) =>
  a.sectionIndex!.find((s) => s.heading === heading)!.id;
const at = (s: string, sub: string) => s.indexOf(sub);

describe("weaving at anchors", () => {
  it("before-section places the image before the target heading", () => {
    const a = v3("## Intro\n\nintro\n\n## Details\n\ndetail", [
      img({ url: "https://site.com/x.png" }),
    ]);
    a.images![0].anchor = serializeAnchor({ kind: "before-section", sectionId: sid(a, "Details") });
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "x.png")).toBeGreaterThan(at(md, "## Intro"));
    expect(at(md, "x.png")).toBeLessThan(at(md, "## Details"));
  });

  it("after-section places the image after the full subtree, including nested subsections (test 4)", () => {
    const a = v3("## Parent\n\npar\n\n### Child\n\nchildbody\n\n## Next\n\nnext", [
      img({ url: "https://site.com/x.png" }),
    ]);
    a.images![0].anchor = serializeAnchor({ kind: "after-section", sectionId: sid(a, "Parent") });
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "x.png")).toBeGreaterThan(at(md, "childbody")); // past the nested child
    expect(at(md, "x.png")).toBeLessThan(at(md, "## Next"));
  });

  it("before-hook / after-hook place images around the composed hook", () => {
    const a = v3("## Body\n\ntext", [
      img({ id: "bh", url: "https://site.com/bh.png" }),
      img({ id: "ah", url: "https://site.com/ah.png" }),
    ]);
    a.hook = {
      id: "h1",
      text: "Sore muscles?",
      type: "question",
      provenance: "generated",
      approval: "approved",
    } as never;
    a.images![0].anchor = serializeAnchor({ kind: "before-hook" });
    a.images![1].anchor = serializeAnchor({ kind: "after-hook" });
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "bh.png")).toBeLessThan(at(md, "Sore muscles?"));
    expect(at(md, "Sore muscles?")).toBeLessThan(at(md, "ah.png"));
  });

  it("article-end places the image at the end of the body", () => {
    const a = v3("## Body\n\ntext", [img({ url: "https://site.com/end.png" })]);
    a.images![0].anchor = serializeAnchor({ kind: "article-end" });
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "end.png")).toBeGreaterThan(at(md, "text"));
  });

  it("before-faq resolves to the body FAQ heading fallback (test 13)", () => {
    const a = v3("## Intro\n\nintro\n\n## FAQ\n\n### Q?\n\nA.", [
      img({ url: "https://site.com/f.png" }),
    ]);
    a.images![0].anchor = serializeAnchor({ kind: "before-faq" });
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "f.png")).toBeGreaterThan(at(md, "## Intro"));
    expect(at(md, "f.png")).toBeLessThan(at(md, "## FAQ"));
  });

  it("before-faq resolves a localized (Swedish) FAQ heading (review #3)", () => {
    const a = v3("## Intro\n\nintro\n\n## Vanliga frågor\n\n### Q?\n\nA.", [
      img({ url: "https://site.com/f.png" }),
    ]);
    a.images![0].anchor = serializeAnchor({ kind: "before-faq" });
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "f.png")).toBeGreaterThan(at(md, "## Intro"));
    expect(at(md, "f.png")).toBeLessThan(at(md, "## Vanliga frågor"));
  });
});

describe("determinism, exclusion, legacy parity", () => {
  it("orders images at one anchor by order then image id (test 7)", () => {
    const a = v3("## S\n\nbody", [
      img({ id: "i_b", url: "https://site.com/b.png" }),
      img({ id: "i_a", url: "https://site.com/a.png" }),
    ]);
    const anchor = serializeAnchor({ kind: "after-section", sectionId: sid(a, "S") });
    a.images![0].anchor = anchor; // same order (unset → 0) → id tiebreak
    a.images![1].anchor = anchor;
    const md = composeCanonicalMarkdown(a, project());
    expect(at(md, "a.png")).toBeLessThan(at(md, "b.png")); // "i_a" < "i_b"
  });

  it("excludes an image whose anchored section no longer resolves (stale status recomputed — tests 9/broken)", () => {
    const a = v3("## Present\n\nhere", [img({ url: "https://site.com/gone.png" })]);
    // Anchor to a section id that isn't in the current body.
    a.images![0].anchor = "after-section:sec_9999";
    a.sectionIndex = [
      {
        id: "sec_9999",
        heading: "Deleted",
        normalized: "deleted",
        level: 2,
        order: 0,
        fingerprint: "deadbeef",
      },
    ];
    const md = composeCanonicalMarkdown(a, project());
    expect(md).not.toContain("gone.png"); // broken → excluded, never relocated
  });

  it("un-anchored inline images append after the body — byte-identical legacy behaviour (test 14)", () => {
    const a = v3("## Body\n\ntext", [img({ url: "https://site.com/leg.png", alt: "L" })]);
    // no anchor set
    const md = composeCanonicalMarkdown(a, project());
    expect(md).toBe("## Body\n\ntext\n\n![L](https://site.com/leg.png)");
  });

  it("preserves legacy blank-line byte-parity when a raw body image is stripped, no anchors (review #2)", () => {
    // Stripping the raw image leaves 4 newlines — the pre-P1.2C path kept them; the
    // fix must NOT collapse them when there is nothing to weave.
    const a = v3("Para one.\n\n![raw](https://site.com/raw.png)\n\nPara two.", [
      img({ placement: "featured", url: "https://site.com/f.png", alt: "F" }),
    ]);
    const md = composeCanonicalMarkdown(a, project());
    expect(md).toBe("![F](https://site.com/f.png)\n\nPara one.\n\n\n\nPara two.");
  });

  it("an asset with no images and no anchors is byte-identical to its raw body (legacy)", () => {
    const a = v3("# Title\n\nBody only.", []);
    expect(composeCanonicalMarkdown(a, project())).toBe("# Title\n\nBody only.");
  });

  it("repeated assembly is byte-identical (test 11)", () => {
    const a = v3("## S\n\nbody", [img({ url: "https://site.com/x.png" })]);
    a.images![0].anchor = serializeAnchor({ kind: "before-section", sectionId: sid(a, "S") });
    const first = assembleContentAsset(a, project());
    const second = assembleContentAsset(a, project());
    expect(second.markdown).toBe(first.markdown);
    expect(second.html).toBe(first.html);
    expect(a.markdown.split("x.png").length - 1).toBe(0); // source body untouched
  });

  it("the assembler does not mutate the asset (test 10)", () => {
    const a = v3("## S\n\nbody", [img({ url: "https://site.com/x.png" })]);
    a.images![0].anchor = serializeAnchor({ kind: "after-section", sectionId: sid(a, "S") });
    const snapshot = JSON.stringify(a);
    assembleContentAsset(a, project());
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it("a resolved image appears exactly once", () => {
    const a = v3("## S\n\nbody", [img({ url: "https://site.com/once.png" })]);
    a.images![0].anchor = serializeAnchor({ kind: "before-section", sectionId: sid(a, "S") });
    const md = composeCanonicalMarkdown(a, project());
    expect(md.split("once.png").length - 1).toBe(1);
  });
});
