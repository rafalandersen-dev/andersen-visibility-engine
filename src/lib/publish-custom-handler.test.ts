import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  read: vi.fn(),
  approval: vi.fn(),
  sources: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: unknown) => fn,
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: h.read }));
vi.mock("./publish-secret.server", () => ({
  resolvePublishSecret: async () => "synthetic-test-secret",
}));
vi.mock("./publication-approval.server", () => ({ assertPublicationApproved: h.approval }));
vi.mock("./source-publication.server", () => ({ assertAssetSourcesCurrent: h.sources }));
import { publishLiveFn } from "./publish.functions";
const run = publishLiveFn as unknown as (args: {
  data: Record<string, string>;
  context: { userId: string };
}) => Promise<unknown>;
const input = {
  data: {
    projectId: "p",
    assetId: "a",
    slug: "attacker-slug",
    destinationType: "landingPage",
    externalId: "unapproved-page",
  },
  context: { userId: "owner" },
};
beforeEach(() => {
  vi.resetAllMocks();
  h.read.mockResolvedValue({
    data: {
      projects: [
        {
          id: "p",
          publishEndpoint: "https://example.com/draft",
          livePublishEndpoint: "https://example.com/live",
          defaultDestinationType: "blogPost",
        },
      ],
      content: [
        {
          id: "a",
          projectId: "p",
          title: "Approved title",
          markdown: "Approved body",
          publishSlug: "approved-slug",
          publishDestinationType: "faq",
          publishExternalId: "saved-page",
        },
      ],
    },
    rev: 1,
  });
  vi.stubGlobal("fetch", h.fetch);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("manual custom live publishing derives every target from approved server context", () => {
  it.each(["returned-page", ""])(
    "ignores request targets and uses the saved or returned draft identity: %s",
    async (draftId) => {
      h.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, externalId: draftId })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, liveUrl: "https://example.com/approved-slug" })),
        );
      await run(input);
      expect(h.approval).toHaveBeenCalledTimes(1);
      expect(h.fetch).toHaveBeenCalledTimes(2);
      const draft = JSON.parse(h.fetch.mock.calls[0][1].body);
      const live = JSON.parse(h.fetch.mock.calls[1][1].body);
      expect(draft).toMatchObject({
        projectId: "p",
        assetId: "a",
        slug: "approved-slug",
        destinationType: "faq",
      });
      expect(live).toMatchObject({
        projectId: "p",
        assetId: "a",
        slug: "approved-slug",
        destinationType: "faq",
        externalId: draftId || "saved-page",
      });
      expect(JSON.stringify(h.fetch.mock.calls)).not.toContain("unapproved-page");
      expect(h.sources.mock.invocationCallOrder[0]).toBeLessThan(
        h.fetch.mock.invocationCallOrder[0],
      );
    },
  );
  it("does not send a draft or live request after approval refusal", async () => {
    h.approval.mockRejectedValueOnce(new Error("publication_approval_required"));
    await expect(run(input)).rejects.toThrow("publication_approval_required");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("refuses an asset from a different project before approval or transport", async () => {
    const row = await h.read();
    row.data.content[0].projectId = "other";
    h.read.mockResolvedValueOnce(row);
    await expect(run(input)).rejects.toThrow("Content not found");
    expect(h.approval).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
