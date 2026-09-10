import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAsset, Project } from "./types";
const h = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn(), blockers: vi.fn() }));
vi.mock("./workspace.server", () => ({ readWorkspaceRow: h.read }));
vi.mock("./checklist", () => ({ publishBlockers: h.blockers }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { armSchedulerPublication } from "./scheduler-approval.server";
const owner = "00000000-0000-4000-8000-000000000001";
const asset = {
  id: "a",
  projectId: "p",
  title: "Title",
  markdown: "Reviewed article",
  status: "Approved",
  autoSchedulerPlannedAt: "2099-09-15T07:00:00Z",
} as ContentAsset;
const project = {
  id: "p",
  websiteUrl: "https://example.com",
  autoScheduler: { enabled: true, mode: "auto_publish" },
  connectorType: "wordpress",
} as Project;
const arm = () =>
  armSchedulerPublication(
    owner,
    asset,
    project,
    [asset],
    "00000000-0000-4000-8000-000000000010",
    asset.autoSchedulerPlannedAt!,
  );
beforeEach(() => {
  vi.resetAllMocks();
  h.read.mockResolvedValue({
    rev: 4,
    data: { projects: [structuredClone(project)], content: [structuredClone(asset)] },
  });
  h.blockers.mockReturnValue([]);
  h.rpc.mockResolvedValue({ data: true, error: null });
});
describe("scheduler exact approval and atomic queue boundary", () => {
  it("passes current revision and rederived version to one atomic RPC", async () => {
    await arm();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith(
      "arm_scheduler_publication",
      expect.objectContaining({
        p_user: owner,
        p_project: "p",
        p_asset: "a",
        p_expected: 4,
        p_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
  it.each([
    { enabled: false, mode: "auto_publish" },
    { enabled: true, mode: "approve_first" },
  ])("refuses changed explicit authority: %s", async (autoScheduler) => {
    h.read.mockResolvedValue({
      rev: 5,
      data: { projects: [{ ...project, autoScheduler }], content: [asset] },
    });
    await expect(arm()).rejects.toThrow("scheduler_authority_changed");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuses owner edits before automatic approval", async () => {
    h.read.mockResolvedValue({
      rev: 5,
      data: { projects: [project], content: [{ ...asset, markdown: "Owner correction" }] },
    });
    await expect(arm()).rejects.toThrow("scheduler_publication_changed");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("does not approve content with a required visual or other blocker", async () => {
    h.blockers.mockReturnValue([{ id: "featured", label: "Featured image needs review" }]);
    await expect(arm()).rejects.toThrow("scheduler_publication_needs_review");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("never retries an uncertain atomic commit", async () => {
    h.rpc.mockResolvedValue({ data: null, error: "uncertain" });
    await expect(arm()).rejects.toThrow("scheduler_publication_needs_review");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
