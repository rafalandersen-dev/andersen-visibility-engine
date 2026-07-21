/**
 * Broken/ambiguous inline-image anchor enforcement (P1.2C) via the shared publish
 * gate. Required → hard block; optional → warning (never blocks); an invalid state
 * (featured image + inline anchor) → hard block. Legacy assets (no anchors) are
 * unaffected. Statuses are recomputed from the current body — never persisted.
 */
import { describe, it, expect } from "vitest";
import { buildPublishingChecklist } from "./checklist";
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

const asset = (
  body: string,
  images: ContentImage[],
  extra: Partial<ContentAsset> = {},
): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Studio sessions",
    slug: "s",
    markdown: body,
    sectionIndex: reconcileSectionIndex(undefined, body, alloc),
    images,
    ...extra,
  }) as ContentAsset;

const item = (a: ContentAsset, key: string) =>
  buildPublishingChecklist(a, project(), [a]).find((i) => i.key === key);

describe("broken-anchor enforcement", () => {
  it("a REQUIRED image with a broken anchor hard-blocks", () => {
    const a = asset("## Present\n\nhere", [
      img({ required: true, anchor: "after-section:sec_9999" }),
    ]);
    expect(item(a, "brokenRequiredAnchor")!.passed).toBe(false);
  });

  it("an OPTIONAL image with a broken anchor only warns (non-blocking) and is excluded", () => {
    const a = asset("## Present\n\nhere", [
      img({ required: false, anchor: "after-section:sec_9999" }),
    ]);
    const list = buildPublishingChecklist(a, project(), [a]);
    const warnItem = list.find((i) => i.key === "brokenOptionalAnchor")!;
    expect(warnItem.passed).toBe(false);
    expect(warnItem.blocking).toBe(false);
    expect(item(a, "brokenRequiredAnchor")!.passed).toBe(true); // optional never trips the blocker
  });

  it("an AMBIGUOUS required anchor also hard-blocks (fails safe)", () => {
    // Persisted id built from a single FAQ; body now has two identical FAQ sections.
    const sectionIndex = reconcileSectionIndex(undefined, "## FAQ\n\nidentical faq body", alloc);
    const a = asset(
      "## FAQ\n\nidentical faq body\n\n## FAQ\n\nidentical faq body",
      [
        img({
          required: true,
          anchor: serializeAnchor({ kind: "after-section", sectionId: sectionIndex[0].id }),
        }),
      ],
      { sectionIndex },
    );
    expect(item(a, "brokenRequiredAnchor")!.passed).toBe(false);
  });

  it("a resolved anchor does not trip the anchor blockers", () => {
    const a = asset("## Details\n\ndetail body", [img({ required: true })]);
    a.images![0].anchor = serializeAnchor({
      kind: "before-section",
      sectionId: a.sectionIndex!.find((s) => s.heading === "Details")!.id,
    });
    expect(item(a, "brokenRequiredAnchor")!.passed).toBe(true);
    expect(item(a, "brokenOptionalAnchor")!.passed).toBe(true);
  });

  it("a featured image carrying an inline anchor is an invalid state and hard-blocks (test 8)", () => {
    const a = asset("## Body\n\ntext", [
      img({ placement: "featured", anchor: serializeAnchor({ kind: "article-end" }) }),
    ]);
    expect(item(a, "imageAnchorValid")!.passed).toBe(false);
  });

  it("a legacy asset with no anchors passes the anchor checks", () => {
    const a = asset("## Body\n\ntext", [img()]); // no anchor
    expect(item(a, "brokenRequiredAnchor")!.passed).toBe(true);
    expect(item(a, "brokenOptionalAnchor")!.passed).toBe(true);
    expect(item(a, "imageAnchorValid")!.passed).toBe(true);
  });
});
