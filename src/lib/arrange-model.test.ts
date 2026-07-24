/**
 * Arrange model (P1.2E) — pins the spec §5.1 hard rules:
 * - drop zones are SEMANTIC anchors only (no pixel/index ever stored);
 * - block order mirrors the assembler's weave (before-section before the
 *   heading, after-section at the end of the section's SUBTREE);
 * - repeated movement never duplicates an image or its metadata (acceptance 8);
 * - broken/unplaced/invalid images surface in one attention bucket.
 */
import { describe, it, expect } from "vitest";
import {
  buildArrangeModel,
  moveImageToAnchor,
  anchorFromDropzone,
  type ArrangeBlock,
} from "./arrange-model";
import { reconcileSectionIndex } from "./section-index";
import type { ContentAsset, ContentImage, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const MD = [
  "Intro paragraph.",
  "",
  "## Alpha",
  "Alpha body.",
  "",
  "### Alpha child",
  "Child body.",
  "",
  "## Beta",
  "Beta body.",
  "",
  "## FAQ",
  "Q and A.",
].join("\n");

let n = 0;
const sectionIndex = reconcileSectionIndex(
  undefined,
  MD,
  () => `sec_test${String(n++).padStart(4, "0")}`,
);
const [alphaId, childId, betaId] = sectionIndex.map((s) => s.id);

const img = (id: string, anchor?: string, over: Partial<ContentImage> = {}): ContentImage =>
  ({
    id,
    concept: id,
    url: `https://site.com/${id}.jpg`,
    alt: `alt ${id}`,
    placement: "inline",
    status: "accepted",
    ...(anchor ? { anchor } : {}),
    ...over,
  }) as ContentImage;

const asset = (images: ContentImage[]): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: MD,
    sectionIndex,
    visualModelVersion: 3,
    images,
  }) as ContentAsset;

const kinds = (blocks: ArrangeBlock[]) =>
  blocks.map((b) =>
    b.kind === "section"
      ? `section:${b.heading}`
      : b.kind === "image"
        ? `image:${b.entry.image.id}`
        : b.kind === "dropzone"
          ? `zone:${b.serialized}`
          : b.kind,
  );

describe("buildArrangeModel", () => {
  it("orders blocks like the weave: before-section before the heading, after-section after the SUBTREE", () => {
    const blocks = buildArrangeModel(
      asset([
        img("i-before-beta", `before-section:${betaId}`),
        img("i-after-alpha", `after-section:${alphaId}`),
      ]),
      project(),
    );
    const k = kinds(blocks);
    // after-alpha renders after Alpha's whole subtree (i.e. after "Alpha child"),
    // and before-beta renders immediately before the Beta heading.
    const afterAlphaIdx = k.indexOf("image:i-after-alpha");
    expect(afterAlphaIdx).toBeGreaterThan(k.indexOf("section:Alpha child"));
    expect(k.indexOf("image:i-before-beta")).toBeGreaterThan(afterAlphaIdx);
    expect(k.indexOf("image:i-before-beta")).toBeLessThan(k.indexOf("section:Beta"));
  });

  it("emits stable semantic drop zones (round-trippable, never positional)", () => {
    const blocks = buildArrangeModel(asset([]), project());
    const zones = blocks.filter((b) => b.kind === "dropzone");
    expect(zones.map((z) => (z.kind === "dropzone" ? z.serialized : ""))).toEqual(
      expect.arrayContaining([
        "before-hook",
        "after-hook",
        `before-section:${alphaId}`,
        `after-section:${childId}`,
        "before-faq",
        "article-end",
      ]),
    );
    for (const z of zones) {
      if (z.kind !== "dropzone") continue;
      expect(anchorFromDropzone(z.serialized)).not.toBeNull(); // valid semantic anchor
      expect(z.serialized).not.toMatch(/\d+px|@\d/); // nothing positional, ever
    }
  });

  it("groups broken/unplaced images into one attention bucket (excluded from assembly)", () => {
    const blocks = buildArrangeModel(
      asset([
        img("i-broken", "before-section:sec_gone9999"),
        img("i-legacy"), // no anchor — legacy unplaced
      ]),
      project(),
    );
    const attention = blocks.find((b) => b.kind === "attention");
    expect(attention && attention.kind === "attention" ? attention.entries : []).toHaveLength(2);
    expect(kinds(blocks)).not.toContain("image:i-broken");
  });
});

describe("moveImageToAnchor (drop)", () => {
  it("stores only the serialized anchor + appended order; repeated moves never duplicate", () => {
    let images = [img("a", "article-end", { order: 1 }), img("b")];
    images = moveImageToAnchor(images, "b", { kind: "before-section", sectionId: betaId });
    images = moveImageToAnchor(images, "b", { kind: "article-end" });
    images = moveImageToAnchor(images, "b", { kind: "article-end" });
    expect(images).toHaveLength(2); // acceptance 8: no duplicates, ever
    const b = images.find((i) => i.id === "b")!;
    expect(b.anchor).toBe("article-end");
    expect(b.order).toBe(2); // appended after "a"
    expect(Object.keys(b)).not.toEqual(expect.arrayContaining(["x", "y", "lineIdx"]));
    const a = images.find((i) => i.id === "a")!;
    expect(a).toEqual(img("a", "article-end", { order: 1 })); // untouched sibling
  });
});
