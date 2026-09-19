import { describe, expect, it } from "vitest";
import { parseGenerationResult, CONTENT_BODY_MAX_CHARS } from "./generation-result";
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

  it("retains a full article body well beyond the old 8000-char limit", () => {
    const longBody =
      "## Full article\n\n" +
      "Paragraph content. ".repeat(600) +
      "\n\n## Conclusion\n\nFinal sentence with proper ending.";
    expect(longBody.length).toBeGreaterThan(8000);
    expect(longBody.length).toBeLessThan(CONTENT_BODY_MAX_CHARS);
    const result = parseGenerationResult(
      { ...content, output: { ...content.output, markdown: longBody } },
      "owner",
    );
    expect(result.kind).toBe("content");
    if (result.kind === "content") {
      expect(result.output.markdown).toBe(longBody);
      expect(result.output.markdown).toContain("Final sentence with proper ending.");
    }
  });

  it("retains a body at the maximum allowed length", () => {
    const prefix = "# Title\n\n",
      ending = "\n\nThe end.";
    const maxBody =
      prefix + "x".repeat(CONTENT_BODY_MAX_CHARS - prefix.length - ending.length) + ending;
    expect(maxBody.length).toBe(CONTENT_BODY_MAX_CHARS);
    const result = parseGenerationResult(
      { ...content, output: { ...content.output, markdown: maxBody } },
      "owner",
    );
    if (result.kind === "content") {
      expect(result.output.markdown).toBe(maxBody);
    }
  });

  it("rejects an oversized body rather than silently truncating", () => {
    const oversized = "# Too long\n\n" + "x".repeat(CONTENT_BODY_MAX_CHARS + 1);
    expect(() =>
      parseGenerationResult(
        { ...content, output: { ...content.output, markdown: oversized } },
        "owner",
      ),
    ).toThrow();
  });

  it("round-trips a full generation result for recovery", () => {
    const fullArticle = {
      ...content,
      output: {
        ...content.output,
        markdown:
          "## Introduction\n\n" +
          "This is a comprehensive guide covering multiple topics. ".repeat(200) +
          "\n\n## Key Factors\n\n" +
          "Important considerations for your business. ".repeat(100) +
          "\n\n## Conclusion\n\nContact us today for a consultation.",
      },
    };
    expect(fullArticle.output.markdown.length).toBeGreaterThan(8000);
    const parsed = parseGenerationResult(fullArticle, "owner");
    expect(parsed).toEqual(fullArticle);
    if (parsed.kind === "content") {
      expect(parsed.output.markdown).toContain("Contact us today for a consultation.");
    }
  });
});
