/**
 * P0 review fixes — internal-link inventory (B1) and structured-data parity (B2).
 */
import { describe, it, expect } from "vitest";
import { buildKnownInternalPaths, contentStructuredData } from "./publish-targets";
import { markdownToHtml } from "./markdown";
import type { ContentAsset, Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Synergy",
    websiteUrl: "https://synergymassage.se",
    connectorType: "wordpress",
    ...over,
  }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({ id: "a1", projectId: "p1", title: "T", slug: "t", markdown: "body", ...over }) as ContentAsset;

describe("buildKnownInternalPaths (B1)", () => {
  it("includes the site root and this project's Milo-published same-origin paths", () => {
    const content = [
      asset({ id: "a1", liveUrl: "https://synergymassage.se/guides/deep-tissue" }),
      asset({ id: "a2", liveUrl: "https://synergymassage.se/blog/back-pain/" }),
      asset({ id: "a3" }), // not published — no liveUrl
    ];
    const paths = new Set(buildKnownInternalPaths(project(), content));
    expect(paths.has("/")).toBe(true);
    expect(paths.has("/guides/deep-tissue")).toBe(true);
    expect(paths.has("/blog/back-pain")).toBe(true); // trailing slash normalised
  });

  it("excludes published URLs on a DIFFERENT origin", () => {
    const content = [asset({ liveUrl: "https://someone-else.com/x" })];
    const paths = new Set(buildKnownInternalPaths(project(), content));
    expect(paths.has("/x")).toBe(false);
  });

  it("resolves a real link when its path is in the inventory, drops an invented one", () => {
    const known = new Set(buildKnownInternalPaths(project(), [
      asset({ liveUrl: "https://synergymassage.se/guides/deep-tissue" }),
    ]));
    const html = markdownToHtml(
      "[real](/guides/deep-tissue) and [fake](/made-up)",
      { knownInternalPaths: known },
    );
    expect(html).toContain('<a href="/guides/deep-tissue">real</a>');
    expect(html).not.toContain("/made-up");
    expect(html).toContain("fake"); // text kept
  });

  it("keepAllInternalLinks keeps relative links active (custom-endpoint preview)", () => {
    const html = markdownToHtml("[x](/anything)", { keepAllInternalLinks: true });
    expect(html).toContain('<a href="/anything">x</a>');
  });
});

describe("structured-data parity in the arg builders (B2)", () => {
  const withFaq = asset({
    title: "Deep tissue",
    markdown: "## FAQ\n\n### Does it hurt?\n\nA little pressure.\n\n### How long?\n\nAbout an hour.",
    metaDescription: "d",
  });

  it("contentStructuredData emits Article + FAQPage for an asset with body FAQ", () => {
    const s = contentStructuredData(withFaq, project());
    expect(s).toContain('"@type":"Article"');
    expect(s).toContain('"@type":"FAQPage"');
  });

  it("empty for an asset with no title/body", () => {
    expect(contentStructuredData(asset({ title: "", markdown: "" }), project())).toBe("");
  });
});
