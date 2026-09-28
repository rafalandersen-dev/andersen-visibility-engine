/**
 * Codex R4/2: the two live MANUAL publisher endpoints (WordPress, Shopify) pass the server-authenticated actor
 * (`context.userId`, interactive) into the publication-evidence wrapper — never a connector owner or a client
 * payload value — so genuine new manual publications carry performer provenance for independent inspection.
 * The wrapper's ordering/failure behaviour is covered in `publication-evidence.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  manual: vi.fn(),
  wpPlan: vi.fn(),
  shopifyPlan: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const b = {
      middleware: () => b,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return b;
  },
}));
vi.mock("./connector-guard.server", () => ({
  serverWpPublication: h.wpPlan,
  serverShopifyPublication: h.shopifyPlan,
}));
vi.mock("./publication-evidence.server", () => ({ withManualPublicationEvidence: h.manual }));
import { publishWordPressContentFn } from "./wordpress.functions";
import { publishShopifyContentFn } from "./shopify.functions";

const USER = "00000000-0000-4000-8000-000000000001";
const CONNECTOR_OWNER = "00000000-0000-4000-8000-0000000000c0";
const plan = (args: Record<string, unknown>) => ({
  asset: { id: "asset-1", projectId: "p", title: "t", markdown: "# t", status: "Approved" },
  project: { id: "p", name: "P", websiteUrl: "https://example.com", ownerId: CONNECTOR_OWNER },
  paths: [],
  args,
});

describe("manual publisher endpoints carry the authenticated actor", () => {
  it("WordPress: actor = context.userId (interactive), taken from the session, not from the plan/project", async () => {
    h.wpPlan.mockResolvedValue(
      plan({
        siteUrl: "https://example.com",
        username: "u",
        applicationPassword: "x",
        title: "t",
        html: "<p>t</p>",
        slug: "t",
        postType: "post",
      }),
    );
    h.manual.mockResolvedValue({ success: true, liveUrl: "https://example.com/t" });
    const result = await publishWordPressContentFn({
      data: {
        projectId: "p",
        assetId: "asset-1",
        siteUrl: "https://example.com",
        username: "u",
        applicationPassword: "x",
        title: "t",
        html: "<p>t</p>",
        slug: "t",
      },
      context: { userId: USER },
    } as never);
    expect(result).toMatchObject({ success: true });
    expect(h.manual).toHaveBeenCalledTimes(1);
    const args = h.manual.mock.calls[0][0] as { ownerId: string; actor: unknown };
    expect(args.ownerId).toBe(USER);
    expect(args.actor).toEqual({ actorId: USER, initiator: "interactive" });
  });
  it("Shopify: actor = context.userId (interactive); a missing blog short-circuits before any evidence", async () => {
    h.manual.mockClear();
    h.shopifyPlan.mockResolvedValue(
      plan({
        shopDomain: "fixture.myshopify.com",
        blogGid: "gid://shopify/Blog/1",
        title: "t",
        html: "<p>t</p>",
        handle: "t",
      }),
    );
    h.manual.mockResolvedValue({
      success: true,
      liveUrl: "https://fixture.myshopify.com/blogs/news/t",
    });
    await publishShopifyContentFn({
      data: {
        projectId: "p",
        assetId: "asset-1",
        shopDomain: "fixture.myshopify.com",
        adminAccessToken: "synthetic-private-value",
        blogGid: "gid://shopify/Blog/1",
        title: "t",
        contentMarkdown: "t",
      },
      context: { userId: USER },
    } as never);
    expect(h.manual).toHaveBeenCalledTimes(1);
    const args = h.manual.mock.calls[0][0] as { ownerId: string; actor: unknown };
    expect(args.ownerId).toBe(USER);
    expect(args.actor).toEqual({ actorId: USER, initiator: "interactive" });
    h.manual.mockClear();
    h.shopifyPlan.mockResolvedValue(
      plan({ shopDomain: "fixture.myshopify.com", title: "t", html: "<p>t</p>", handle: "t" }),
    );
    const noBlog = await publishShopifyContentFn({
      data: {
        projectId: "p",
        assetId: "asset-1",
        shopDomain: "fixture.myshopify.com",
        adminAccessToken: "synthetic-private-value",
        blogGid: "",
        title: "t",
        contentMarkdown: "t",
      },
      context: { userId: USER },
    } as never);
    expect(noBlog).toMatchObject({ success: false });
    expect(h.manual).not.toHaveBeenCalled();
  });
});
