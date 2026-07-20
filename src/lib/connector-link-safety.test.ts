/**
 * Link-safety P0 — connector-level contract.
 *
 * Every relative internal link has exactly one state: VERIFIED (root or a page
 * Milo has published), USER_APPROVED (an exact path the user approved for the
 * project) or UNRESOLVED. VERIFIED and USER_APPROVED publish as active links;
 * an UNRESOLVED link must NEVER be sent as active and must NEVER be silently
 * removed — publishing is BLOCKED until it is resolved, on WordPress, Shopify
 * AND the custom endpoint alike (the custom endpoint's old keepAllInternalLinks
 * escape hatch is gone).
 *
 * The "blocked" cases call the real connector functions: their link guard runs
 * BEFORE any network I/O, so an unresolved link throws/refuses without a fetch.
 * The "allowed" cases assert the shared decision layer + the canonical converter
 * (calling the real transport for a resolved link would hit the network).
 */
import { describe, it, expect } from "vitest";
import { publishWordPressLiveDirect } from "./wordpress.functions";
import { upsertArticle } from "./shopify.functions";
import {
  buildActiveInternalPaths,
  unresolvedLinksForPublish,
  wpPublishArgs,
  shopifyArticleArgs,
} from "./publish-targets";
import {
  markdownToHtml,
  unresolvedInternalLinks,
  classifyInternalLinks,
  replaceLinkPath,
  linkPathToText,
  removeLinkByPath,
} from "./markdown";
import type { ContentAsset, Project } from "./types";

const wpProject = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Site",
    websiteUrl: "https://site.com",
    connectorType: "wordpress",
    wordpress: { siteUrl: "https://site.com", username: "u", applicationPassword: "p" },
    ...over,
  }) as Project;

const shopifyProject = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Site",
    websiteUrl: "https://site.com",
    connectorType: "shopify",
    shopify: {
      shopDomain: "site.myshopify.com",
      adminAccessToken: "t",
      defaultBlogId: "gid://shopify/Blog/1",
    },
    ...over,
  }) as Project;

const customProject = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Site",
    websiteUrl: "https://site.com",
    connectorType: "custom",
    publishEndpoint: "https://site.com/hook",
    livePublishEndpoint: "https://site.com/hook/live",
    publishSecret: "s",
    ...over,
  }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({ id: "a1", projectId: "p1", title: "T", slug: "t", markdown: "body", ...over }) as ContentAsset;

// A page Milo published on this site → its path is VERIFIED.
const published = [asset({ id: "pub", liveUrl: "https://site.com/guides/x" })];

const activeSet = (project: Project, content: ContentAsset[]) =>
  new Set(buildActiveInternalPaths(project, content));

describe("verified link is allowed through every connector", () => {
  const a = asset({ markdown: "Read [our guide](/guides/x) today." });

  it.each([
    ["wordpress", wpProject()],
    ["shopify", shopifyProject()],
    ["custom", customProject()],
  ])("%s: verified path passes the gate and renders active", (_name, project) => {
    // The gate (shared by all three connectors) sees nothing unresolved…
    expect(unresolvedLinksForPublish(a, project, published)).toEqual([]);
    // …and the canonical converter every connector uses emits an active link.
    expect(
      markdownToHtml(a.markdown, { knownInternalPaths: activeSet(project, published) }),
    ).toContain('<a href="/guides/x">our guide</a>');
  });
});

describe("user-approved link is allowed through every connector", () => {
  const a = asset({ markdown: "See [our services](/services)." });

  it.each([
    ["wordpress", wpProject({ approvedInternalPaths: ["/services"] })],
    ["shopify", shopifyProject({ approvedInternalPaths: ["/services"] })],
    ["custom", customProject({ approvedInternalPaths: ["/services"] })],
  ])("%s: an explicitly approved path publishes as active", (_name, project) => {
    expect(unresolvedLinksForPublish(a, project, [])).toEqual([]);
    expect(markdownToHtml(a.markdown, { knownInternalPaths: activeSet(project, []) })).toContain(
      '<a href="/services">our services</a>',
    );
  });
});

describe("invented internal link is BLOCKED through every connector", () => {
  const a = asset({ markdown: "Try [this](/made-up-page)." });

  it("wordpress: the transport refuses before any network call", async () => {
    const res = await publishWordPressLiveDirect(
      wpPublishArgs(a, wpProject(), buildActiveInternalPaths(wpProject(), [])),
    );
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false); // not a transient failure — never auto-retried
    expect(res.error).toMatch(/unverified internal link/i);
  });

  it("shopify: upsertArticle throws before any network call", async () => {
    await expect(
      upsertArticle(
        shopifyArticleArgs(a, shopifyProject(), buildActiveInternalPaths(shopifyProject(), [])),
        true,
      ),
    ).rejects.toThrow(/unverified internal link/i);
  });

  it("custom endpoint: the shared publish gate reports it unresolved", () => {
    // The custom endpoint sends raw markdown; publish.server.ts refuses on this
    // exact predicate before calling publishLiveDirect.
    expect(unresolvedInternalLinks(a.markdown, activeSet(customProject(), []))).toEqual([
      "/made-up-page",
    ]);
  });
});

describe("a valid-but-unknown existing link is BLOCKED, not silently removed", () => {
  // /services is a real page, but not one Milo published and not approved — so
  // it must be surfaced and blocked, never quietly dropped on republish.
  const a = asset({ markdown: "About [our clinic](/services)." });

  it("wordpress: refuses rather than dropping the link", async () => {
    const res = await publishWordPressLiveDirect(
      wpPublishArgs(a, wpProject(), buildActiveInternalPaths(wpProject(), [])),
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/unverified internal link/i);
  });

  it("shopify: refuses rather than dropping the link", async () => {
    await expect(
      upsertArticle(
        shopifyArticleArgs(a, shopifyProject(), buildActiveInternalPaths(shopifyProject(), [])),
        true,
      ),
    ).rejects.toThrow(/unverified internal link/i);
  });

  it("the classifier lists it as UNRESOLVED (so the editor can surface it)", () => {
    const links = classifyInternalLinks(a.markdown, new Set(["/"]), new Set());
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      anchor: "our clinic",
      path: "/services",
      state: "UNRESOLVED",
    });
  });
});

describe("preview / export / publish parity", () => {
  it("a link is active in the rendered HTML iff the gate does not flag it", () => {
    const md = "Verified [v](/guides/x) and invented [u](/nope).";
    const project = wpProject();
    const active = activeSet(project, published);
    const html = markdownToHtml(md, { knownInternalPaths: active });
    const unresolved = unresolvedLinksForPublish(asset({ markdown: md }), project, published);

    expect(html).toContain('<a href="/guides/x">v</a>'); // verified → active everywhere
    expect(html).not.toContain('href="/nope"'); // unresolved → never an active link
    expect(html).toContain("invented u."); // anchor text kept as plain text
    expect(unresolved).toEqual(["/nope"]); // exactly what preview showed as inactive
  });
});

describe("republishing an existing article", () => {
  it("keeps the article's own live path verified but blocks a newly-invented link", () => {
    const existing = asset({
      id: "a1",
      liveUrl: "https://site.com/blog/post",
      wordpressPostId: 42,
      markdown: "Back to [the post](/blog/post) and a [new one](/invented).",
    });
    const content = [existing];
    const active = buildActiveInternalPaths(wpProject(), content);
    expect(active).toContain("/blog/post"); // self-link verified
    expect(unresolvedLinksForPublish(existing, wpProject(), content)).toEqual(["/invented"]);
  });
});

describe("no global approval bypass", () => {
  it("approving one path activates ONLY that path", () => {
    const project = wpProject({ approvedInternalPaths: ["/services"] });
    const active = new Set(buildActiveInternalPaths(project, []));
    expect(active.has("/services")).toBe(true);
    expect(active.has("/other")).toBe(false);
  });

  it("persisted project-level approval is honoured by the publish gate", () => {
    const project = wpProject({ approvedInternalPaths: ["/contact"] });
    expect(unresolvedLinksForPublish(asset({ markdown: "[c](/contact)" }), project, [])).toEqual(
      [],
    );
  });
});

describe("resolver actions used by the editor's link-safety panel", () => {
  it("replace repoints only the matching path", () => {
    expect(replaceLinkPath("[a](/x) and [b](/y)", "/x", "/services")).toBe(
      "[a](/services) and [b](/y)",
    );
  });
  it("keep-as-text drops the link, keeps the anchor", () => {
    expect(linkPathToText("see [a](/x) now", "/x")).toBe("see a now");
  });
  it("remove drops the link and its text", () => {
    expect(removeLinkByPath("see [a](/x) now", "/x")).toBe("see  now");
  });
});
