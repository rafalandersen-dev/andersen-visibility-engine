/**
 * P1.2F responsive preview — parity + warning heuristics.
 * The srcDoc test IS the spec's "preview markup === publish markup" guard.
 */
import { describe, it, expect } from "vitest";
import { buildPreviewSrcDoc, poorMobileCropWarnings } from "./responsive-preview";
import type { ContentAsset, ContentImage, FeaturedImage } from "./types";

describe("buildPreviewSrcDoc (parity guard)", () => {
  it("embeds the publish HTML byte-identical and never a script", () => {
    const body = '<h1>T</h1><figure class="milo-image milo-size-full"><img src="x"></figure>';
    const doc = buildPreviewSrcDoc(body, [".milo-preview{}", "@media(max-width:640px){}"]);
    expect(doc).toContain(body); // byte-identical embed = preview === publish
    expect(doc).toContain("width=device-width");
    expect(doc.split("<style>")).toHaveLength(3);
    expect(doc).not.toContain("<script");
  });
});

describe("poorMobileCropWarnings", () => {
  const featured = (over: Partial<FeaturedImage>): FeaturedImage => ({
    imageId: "img1",
    storagePath: "p",
    url: "https://site.com/i.jpg",
    alt: "Hero",
    hero: { aspectRatio: "wide", fit: "cover" },
    approval: "approved",
    ...over,
  });
  const asset = (over: Partial<ContentAsset>): Pick<ContentAsset, "images" | "featuredImage"> =>
    ({ id: "a1", ...over }) as ContentAsset;

  it("flags an aspect-changing cover mobile crop with no focal anywhere", () => {
    const a = asset({
      featuredImage: featured({ mobile: { aspectRatio: "square", fit: "cover" } }),
    });
    expect(poorMobileCropWarnings(a)).toEqual([{ target: "featured", label: "Hero" }]);
  });

  it("stays silent when a focal point exists, the aspect matches, or fit is contain", () => {
    expect(
      poorMobileCropWarnings(
        asset({
          featuredImage: featured({
            hero: { aspectRatio: "wide", fit: "cover", focalPoint: { x: 0.5, y: 0.3 } },
            mobile: { aspectRatio: "square", fit: "cover" },
          }),
        }),
      ),
    ).toEqual([]);
    expect(
      poorMobileCropWarnings(
        asset({ featuredImage: featured({ mobile: { aspectRatio: "wide", fit: "cover" } }) }),
      ),
    ).toEqual([]);
    expect(
      poorMobileCropWarnings(
        asset({ featuredImage: featured({ mobile: { aspectRatio: "square", fit: "contain" } }) }),
      ),
    ).toEqual([]);
  });

  it("flags inline accepted images the same way, by id", () => {
    const img: ContentImage = {
      id: "i9",
      concept: "team photo",
      url: "https://site.com/t.jpg",
      alt: "",
      placement: "inline",
      status: "accepted",
      presentation: { size: "large", alignment: "center", aspectRatio: "wide", fit: "cover" },
      mobilePresentation: { aspectRatio: "portrait" },
    } as unknown as ContentImage;
    expect(poorMobileCropWarnings(asset({ images: [img] }))).toEqual([
      { target: "i9", label: "team photo" },
    ]);
  });
});
