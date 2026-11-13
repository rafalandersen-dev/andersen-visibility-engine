import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ read: vi.fn(), approved: vi.fn(), blockers: vi.fn(), rpc: vi.fn() }));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: h.read }));
vi.mock("./publication-approval.server", () => ({ assertPublicationApproved: h.approved }));
vi.mock("./checklist", () => ({ publishBlockers: h.blockers }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { scheduleApprovedPublication } from "./schedule-approval.server";
const owner = "00000000-0000-4000-8000-000000000001";
const publishAt = "2099-09-17T07:00:00Z";
const schedule = () => scheduleApprovedPublication(owner, "p", "a", publishAt);
beforeEach(() => {
  vi.resetAllMocks();
  h.read.mockResolvedValue({
    rev: 7,
    data: {
      projects: [{ id: "p", websiteUrl: "https://example.com" }],
      content: [
        {
          id: "a",
          projectId: "p",
          title: "Reviewed title",
          markdown: "Reviewed text",
          status: "Approved",
        },
      ],
    },
  });
  h.approved.mockResolvedValue(undefined);
  h.blockers.mockReturnValue([]);
  h.rpc.mockResolvedValue({
    error: null,
    data: {
      id: "00000000-0000-4000-8000-000000000002",
      project_id: "p",
      asset_id: "a",
      publish_at: publishAt,
      status: "pending",
      attempts: 0,
      created_at: "2026-09-10T12:00:00Z",
    },
  });
});
describe("manual schedule exact-version admission", () => {
  it("refuses status-only approval before any queue mutation", async () => {
    h.approved.mockRejectedValue(new Error("publication_approval_required"));
    await expect(schedule()).rejects.toThrow("publication_approval_required");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuses current publication blockers before replacing the old schedule", async () => {
    h.blockers.mockReturnValue([{ id: "featured" }]);
    await expect(schedule()).rejects.toThrow("publication checks");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("uses the exact saved revision and one atomic queue replacement RPC", async () => {
    expect(await schedule()).toMatchObject({ status: "pending", publish_at: publishAt });
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith(
      "schedule_approved_publication",
      expect.objectContaining({
        p_user: owner,
        p_project: "p",
        p_asset: "a",
        p_expected: 7,
        p_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_publish: publishAt,
      }),
    );
  });
  it("binds an update intent to the new queue row only for an already-live article", async () => {
    expect((await schedule()).updateIntent).toBeUndefined();
    const row = await h.read();
    row.data.content[0] = { ...row.data.content[0], livePublishStatus: "published", liveUrl: "u" };
    h.read.mockResolvedValue(row);
    const { updateIntent } = await schedule();
    expect(updateIntent).toMatchObject({
      queueId: "00000000-0000-4000-8000-000000000002",
      versionHash: h.rpc.mock.calls.at(-1)![1].p_hash,
    });
  });
  describe("live article update target", () => {
    const seedLive = async (connectorType: string | undefined, over: Record<string, unknown>) => {
      const row = await h.read();
      row.data.projects[0] = { ...row.data.projects[0], connectorType };
      row.data.content[0] = {
        ...row.data.content[0],
        livePublishStatus: "published",
        liveUrl: "https://example.com/a",
        ...over,
      };
      h.read.mockResolvedValue(row);
    };
    it.each([
      ["wordpress", { publishExternalId: "77" }, "WordPress post"],
      ["shopify", { publishExternalId: "gid-less" }, "Shopify article"],
      ["wordpress", { liveUrl: undefined, wordpressPostId: undefined }, "second copy"],
    ])(
      "refuses a %s update without its existing id before any queue mutation",
      async (c, over, msg) => {
        await seedLive(c, over);
        await expect(schedule()).rejects.toThrow(msg);
        expect(h.rpc).not.toHaveBeenCalled();
      },
    );
    it.each([
      ["wordpress", { wordpressPostId: 77 }],
      ["shopify", { shopifyArticleGid: "gid://shopify/Article/9" }],
      [undefined, {}], // custom endpoint upserts by assetId/slug
    ])("arms a %s update that carries its existing identity", async (c, over) => {
      await seedLive(c, over);
      expect((await schedule()).updateIntent).toMatchObject({ queueId: expect.any(String) });
    });
  });
  it("does not retry after a race or uncertain queue response", async () => {
    h.rpc.mockResolvedValue({ data: null, error: "workspace_changed" });
    await expect(schedule()).rejects.toThrow("Refresh");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
