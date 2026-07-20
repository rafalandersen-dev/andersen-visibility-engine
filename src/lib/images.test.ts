/**
 * Images — non-paid MVP (Article Studio 2.0 / P1.1 G).
 *
 * T7 — a missing/rejected image yields no broken <img> and no decorative filler.
 * T8 — publish is blocked if any (publishing) image lacks alt text.
 * Plus: no hotlinking (only controlled origins publish), and the publishable
 * predicate (approved + alt + controlled origin).
 */
import { describe, it, expect } from "vitest";
import {
  isControlledImageOrigin,
  isImagePublishable,
  publishableImages,
  imagesMissingAlt,
  requiredImagesUnresolved,
} from "./images";
import { assembleContentAsset } from "./content-assembler";
import type { ContentAsset, ContentImage, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const img = (over: Partial<ContentImage> = {}): ContentImage =>
  ({
    id: "i1",
    concept: "hero",
    url: "https://site.com/media/a.jpg",
    alt: "A calm treatment room",
    placement: "featured",
    status: "accepted",
    ...over,
  }) as ContentImage;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;

describe("controlled origin — no hotlinking", () => {
  it("accepts the project's own https site and Milo/Lovable storage; rejects third parties + http", () => {
    expect(isControlledImageOrigin("https://site.com/media/a.jpg", project())).toBe(true);
    expect(isControlledImageOrigin("https://abc.supabase.co/storage/a.jpg", project())).toBe(true);
    expect(isControlledImageOrigin("https://cdn.thirdparty.com/a.jpg", project())).toBe(false);
    expect(isControlledImageOrigin("http://site.com/media/a.jpg", project())).toBe(false);
  });
});

describe("isImagePublishable — approved + alt + controlled origin", () => {
  it("publishable only when all conditions hold", () => {
    expect(isImagePublishable(img(), project())).toBe(true);
    expect(isImagePublishable(img({ status: "proposed" }), project())).toBe(false);
    expect(isImagePublishable(img({ alt: "" }), project())).toBe(false);
    expect(isImagePublishable(img({ url: "https://cdn.evil.com/a.jpg" }), project())).toBe(false);
    expect(isImagePublishable(img({ url: "" }), project())).toBe(false);
  });
});

describe("publish gates (T8 / required-content)", () => {
  it("imagesMissingAlt flags approved images with no alt (T8 block)", () => {
    const missing = imagesMissingAlt([
      img({ id: "ok", alt: "has alt" }),
      img({ id: "bad", status: "generated", alt: "  " }),
      img({ id: "proposed", status: "proposed", alt: "" }), // not publishing → not a block
    ]);
    expect(missing.map((i) => i.id)).toEqual(["bad"]);
  });

  it("requiredImagesUnresolved flags a required image that isn't publishable; optional never blocks", () => {
    const unresolved = requiredImagesUnresolved(
      [
        img({ id: "req-missing", required: true, status: "proposed", url: "" }),
        img({ id: "req-ok", required: true }),
        img({ id: "optional-missing", required: false, status: "proposed", url: "" }),
      ],
      project(),
    );
    expect(unresolved.map((i) => i.id)).toEqual(["req-missing"]);
  });
});

describe("assembler renders only publishable images (T7 — no broken img)", () => {
  it("renders an approved controlled-origin image as <img> with alt", () => {
    const out = assembleContentAsset(
      asset({ markdown: "Body.", images: [img({ caption: "Our studio" })] }),
      project(),
    );
    expect(out.html).toContain(
      '<img src="https://site.com/media/a.jpg" alt="A calm treatment room"',
    );
    expect(out.html).toContain("Our studio"); // caption
    expect(publishableImages([img()], project())).toHaveLength(1);
  });

  it("does NOT render a hotlinked or unapproved image — no broken <img>", () => {
    const out = assembleContentAsset(
      asset({
        markdown: "Body.",
        images: [
          img({ id: "hot", url: "https://cdn.evil.com/x.jpg" }),
          img({ id: "prop", status: "proposed" }),
        ],
      }),
      project(),
    );
    expect(out.html).not.toContain("<img");
    expect(out.html).not.toContain("evil.com");
  });

  it("strips a model-hallucinated image left in the body markdown (no vetted URL)", () => {
    const out = assembleContentAsset(
      asset({ markdown: "Body ![fake](https://hallucinated.example/x.jpg) more." }),
      project(),
    );
    expect(out.html).not.toContain("<img");
    expect(out.html).not.toContain("hallucinated.example");
  });

  it("a missing/rejected image degrades gracefully — output identical to no image (T7)", () => {
    const withMissing = assembleContentAsset(
      asset({ markdown: "Body.", images: [img({ status: "missing", url: "" })] }),
      project(),
    ).html;
    const without = assembleContentAsset(asset({ markdown: "Body." }), project()).html;
    expect(withMissing).toBe(without);
  });
});
