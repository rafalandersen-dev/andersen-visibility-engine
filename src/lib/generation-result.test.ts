import { describe, expect, it } from "vitest";
import { parseGenerationResult } from "./generation-result";
const content = {
  version: 1,
  kind: "content",
  projectId: "project",
  opportunityId: "opportunity",
  assetId: "asset",
  title: "Useful guide",
  language: "Polish",
  assetType: "article",
  output: {
    metaTitle: "Guide",
    metaDescription: "A useful guide",
    h1: "Guide",
    outline: [],
    faq: [],
    cta: "Contact",
    markdown: "## A retained article\n\nText.",
    internalLinks: [],
    schemaSuggestions: [],
    editorNotes: "",
  },
};
const image = {
  imageId: "image",
  version: 1,
  kind: "image",
  projectId: "project",
  assetId: "asset",
  title: "Image",
  concept: "A studio",
  output: { path: "owner/project/asset/image.webp", alt: "A quiet studio" },
};
describe("private generated result contract", () => {
  it("retains normalized text and image recovery targets", () => {
    expect(parseGenerationResult(content, "owner")).toEqual(content);
    expect(parseGenerationResult(image, "owner")).toEqual(image);
  });
  it.each(["previewUrl", "publicUrl", "approvedAt", "status", "userId", "apiKey"])(
    "rejects unapproved %s fields",
    (field) => {
      expect(() => parseGenerationResult({ ...image, [field]: "injected" }, "owner")).toThrow();
      expect(() =>
        parseGenerationResult(
          { ...image, output: { ...image.output, [field]: "injected" } },
          "owner",
        ),
      ).toThrow();
    },
  );
  it.each([
    "someone/project/asset/image.webp",
    "owner/wrong/asset/image.webp",
    "owner/project/wrong/image.webp",
    "owner/../asset/image.webp",
    "https://untrusted.example/image.png",
  ])("rejects an unrelated or remote image path %s", (path) => {
    expect(() =>
      parseGenerationResult({ ...image, output: { ...image.output, path } }, "owner"),
    ).toThrow();
  });
  it("rejects empty content and unknown target types", () => {
    expect(() =>
      parseGenerationResult({ ...content, output: { ...content.output, markdown: " " } }, "owner"),
    ).toThrow();
    expect(() =>
      parseGenerationResult({ ...content, assetType: "approvedArticle" }, "owner"),
    ).toThrow();
  });
  it("bounds arrays and the entire UTF-8 output separately", () => {
    expect(() =>
      parseGenerationResult(
        {
          ...content,
          output: {
            ...content.output,
            faq: Array.from({ length: 129 }, () => ({ q: "q", a: "a" })),
          },
        },
        "owner",
      ),
    ).toThrow();
    expect(() =>
      parseGenerationResult(
        {
          ...content,
          output: {
            ...content.output,
            outline: Array.from({ length: 128 }, () => "ą".repeat(1000)),
          },
        },
        "owner",
      ),
    ).toThrow("generation_result_too_large");
  });
});
