import { describe, expect, it, vi, afterEach } from "vitest";
import { FAQ_HEADINGS, extractFaqFromMarkdown } from "./structured-data";
import { assembleContentAsset } from "./content-assembler";
import { wpPublishArgs, shopifyArticleArgs } from "./publish-targets";
import {
  publishWordPressLiveDirect,
  sendWordPressDraftDirect,
  ContentInput,
} from "./wordpress.functions";
import { upsertArticle, ArticleInput } from "./shopify.functions";
import { draftPayloadFor } from "./publish.functions";
import { DEFAULT_PRESENTATION } from "./presentation-compiler";
import type { ContentAsset, Project } from "./types";
const project = {
  id: "p",
  name: "Site",
  websiteUrl: "https://site.com",
  connectorType: "wordpress",
  wordpress: {
    siteUrl: "https://site.com",
    username: "fixture",
    applicationPassword: "offline-fixture",
  },
  shopify: {
    shopDomain: "site.myshopify.com",
    adminAccessToken: "offline-fixture",
    defaultBlogId: "gid://shopify/Blog/1",
  },
} as Project;
const asset = {
  id: "a",
  projectId: "p",
  title: "Title",
  slug: "title",
  markdown: "## FAQ\n### Options?\n- First\n- Second",
  images: [
    {
      id: "image1",
      concept: "c",
      url: "https://site.com/image.png",
      alt: "Approved image",
      placement: "inline",
      status: "accepted",
      caption: "Visible caption",
      presentation: { ...DEFAULT_PRESENTATION },
    },
  ],
} as unknown as ContentAsset;
afterEach(() => vi.unstubAllGlobals());
describe("rendered article and actual connector payload fidelity", () => {
  it("reads list/table boundaries, inline text and escaped source literally as rendered", () => {
    expect(
      extractFaqFromMarkdown(
        "## FAQ\n### **Choices?**\n- First\n- Second\n\n| Key | Value |\n| --- | --- |\n| A | B |\n\nUse `notes` & <b>literal</b>.",
      ),
    ).toEqual([
      { question: "Choices?", answer: "First Second Key Value A B Use `notes` & <b>literal</b>." },
    ]);
  });
  it("keeps quoted image URL delimiters out of visible FAQ text", () => {
    const output = assembleContentAsset(
      {
        ...asset,
        images: asset.images!.map((image) => ({
          ...image,
          url: "https://site.com/image>tail.png",
        })),
      },
      project,
    );
    expect(output.html).toContain('src="https://site.com/image>tail.png"');
    const faq = output.jsonLd.find((item) => item["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toEqual([
      {
        "@type": "Question",
        name: "Options?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "First Second Visible caption",
        },
      },
    ]);
  });
  it.each(FAQ_HEADINGS)("recognizes rendered FAQ heading %s", (heading) => {
    expect(
      extractFaqFromMarkdown(`## ${heading}\n### Question?\nAnswer.\n## CTA\n### Buy?\nNow.`),
    ).toEqual([{ question: "Question?", answer: "Answer." }]);
  });
  it("does not reinterpret escaped headings or discard literal nested-link remnants", () => {
    expect(extractFaqFromMarkdown("\\## FAQ\n### Q?\nA.")).toEqual([]);
    expect(extractFaqFromMarkdown("## FAQ\n### Q?\n[Text](https://site.com/a(b))")).toEqual([
      { question: "Q?", answer: "Text)" },
    ]);
  });
  it.each([false, true])(
    "WordPress transport preserves vetted figures and schema (live=%s)",
    async (live) => {
      const output = assembleContentAsset(asset, project);
      expect(output.html).toContain("<figure");
      expect(output.html).toContain("<figcaption>Visible caption</figcaption>");
      const fetch = vi.fn(async (_url: unknown, _init: RequestInit) => {
        // Capture only: transport error handling must never swallow a test assertion.
        return new Response(JSON.stringify({ id: 1, link: "https://site.com/title" }), {
          status: 200,
        });
      });
      vi.stubGlobal("fetch", fetch);
      const args = wpPublishArgs(asset, project);
      const result = await (live
        ? publishWordPressLiveDirect(args)
        : sendWordPressDraftDirect(args));
      expect(result.success).toBe(true);
      expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body)).content).toBe(
        output.html + output.jsonLdScript,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(
        ContentInput.parse({ ...args, assembledHtml: "<script>untrusted</script>" }),
      ).not.toHaveProperty("assembledHtml");
    },
  );
  it.each([false, true])(
    "Shopify transport preserves vetted figures and schema (live=%s)",
    async (live) => {
      const output = assembleContentAsset(asset, project);
      const fetch = vi.fn(async (_url: unknown, _init: RequestInit) => {
        return new Response(
          JSON.stringify({
            data: {
              articleCreate: {
                article: {
                  id: "gid://shopify/Article/1",
                  handle: "title",
                  blog: { id: "gid://shopify/Blog/1", handle: "news" },
                },
                userErrors: [],
              },
            },
          }),
          { status: 200 },
        );
      });
      vi.stubGlobal("fetch", fetch);
      const args = shopifyArticleArgs(asset, project);
      const result = await upsertArticle(args, live);
      expect(result.success).toBe(true);
      expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body)).variables.article.body).toBe(
        output.html + output.jsonLdScript,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(
        ArticleInput.parse({ ...args, assembledHtml: "<script>untrusted</script>" }),
      ).not.toHaveProperty("assembledHtml");
    },
  );
  it("custom contract remains canonical Markdown without HTML or JSON-LD", () => {
    const payload = draftPayloadFor(asset, { ...project, connectorType: "custom" });
    expect(payload.markdown).toBe(assembleContentAsset(asset, project).markdown);
    expect(payload).not.toHaveProperty("assembledHtml");
    expect(payload).not.toHaveProperty("jsonLd");
  });
});
