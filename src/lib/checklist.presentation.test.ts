/**
 * Image-presentation enforcement via the publishing checklist (P1.2D).
 * Corrupt/unsafe/incompatible presets hard-block; an inactive focal warns; a
 * no-presentation (legacy) asset is unaffected.
 */
import { describe, it, expect } from "vitest";
import { buildPublishingChecklist } from "./checklist";
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
    ...over,
  }) as ContentImage;

const asset = (images: ContentImage[]): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "## B\n\ntext",
    images,
  }) as ContentAsset;

const item = (a: ContentAsset, key: string) =>
  buildPublishingChecklist(a, project(), [a]).find((i) => i.key === key);

describe("presentation checklist enforcement", () => {
  it("a valid presentation passes; legacy (no presentation) passes", () => {
    expect(item(asset([img({ presentation: pres() })]), "imagePresentation")!.passed).toBe(true);
    expect(item(asset([img()]), "imagePresentation")!.passed).toBe(true);
    expect(item(asset([img()]), "imagePresentationAdvisory")!.passed).toBe(true);
  });

  it("an out-of-enum preset hard-blocks", () => {
    const a = asset([img({ presentation: { ...pres(), size: "huge" as never } })]);
    expect(item(a, "imagePresentation")!.passed).toBe(false);
    expect(item(a, "imagePresentation")!.blocking).toBe(true);
  });

  it("a focal point outside 0..1 hard-blocks", () => {
    const a = asset([img({ presentation: pres({ focalPoint: { x: 2, y: 0 } }) })]);
    expect(item(a, "imagePresentation")!.passed).toBe(false);
  });

  it("a featured image aligned left is an incompatible state and hard-blocks", () => {
    const a = asset([
      img({ placement: "featured", presentation: pres({ size: "full", alignment: "left" }) }),
    ]);
    expect(item(a, "imagePresentation")!.passed).toBe(false);
  });

  it("a focal point under fit=contain warns (non-blocking)", () => {
    const a = asset([
      img({ presentation: pres({ fit: "contain", focalPoint: { x: 0.5, y: 0.5 } }) }),
    ]);
    const adv = item(a, "imagePresentationAdvisory")!;
    expect(adv.passed).toBe(false);
    expect(adv.blocking).toBe(false);
    expect(item(a, "imagePresentation")!.passed).toBe(true); // not a blocker
  });

  // ---- Review fixes: publishable scope + destination-capability honesty ----
  it("a bad preset on a NON-publishable image does not block (only publishing images gate)", () => {
    const a = asset([
      img({ status: "proposed", presentation: { ...pres(), size: "huge" as never } }),
    ]);
    expect(item(a, "imagePresentation")!.passed).toBe(true);
  });

  it("a bad preset on a publishable image still hard-blocks", () => {
    const a = asset([
      img({ status: "accepted", presentation: { ...pres(), size: "huge" as never } }),
    ]);
    expect(item(a, "imagePresentation")!.passed).toBe(false);
  });

  it("a presented image raises a NON-blocking destination-capability advisory", () => {
    const cap = item(asset([img({ presentation: pres() })]), "imagePresentationCapability")!;
    expect(cap.passed).toBe(false); // advisory surfaced
    expect(cap.blocking).toBe(false); // never blocks publishing
  });

  it("no presented image → capability advisory passes (nothing to disclose)", () => {
    expect(item(asset([img()]), "imagePresentationCapability")!.passed).toBe(true);
  });
});
