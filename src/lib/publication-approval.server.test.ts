import { describe, expect, it, vi } from "vitest";
import { setPublicationApproval, assertPublicationApproved } from "./publication-approval.server";
import { publicationVersion } from "./publication-version";
import { buildActiveInternalPaths } from "./publish-targets";
import type { ContentAsset, Project } from "./types";
import type { readWorkspaceRow } from "./workspace.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p", assetId: "a" };
const asset = {
  id: "a",
  projectId: "p",
  title: "Title",
  markdown: "Reviewed text",
  status: "Approved",
} as ContentAsset;
const project = {
  id: "p",
  websiteUrl: "https://example.com",
  connectorType: "wordpress",
} as Project;
const version = () =>
  publicationVersion(asset, project, buildActiveInternalPaths(project, [asset]));
const read = () =>
  vi.fn(async () => ({
    rev: 4,
    data: { projects: [project], content: [asset] },
  })) as unknown as typeof readWorkspaceRow;
describe("authenticated version approval boundary", () => {
  it("stores a server-derived version with the saved revision and owner scope", async () => {
    const expectedVersion = await version(),
      rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(
      await setPublicationApproval(
        scope,
        { expectedVersion, approved: true },
        { read: read(), rpc },
      ),
    ).toEqual({ version: expectedVersion, approved: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_publication_approval", {
      p_user: scope.ownerId,
      p_project: "p",
      p_asset: "a",
      p_expected: 4,
      p_hash: expectedVersion.hash,
      p_approved: true,
    });
  });
  it("refuses stale review before mutation, and never retries an uncertain save", async () => {
    const expectedVersion = await version(),
      rpc = vi.fn();
    await expect(
      setPublicationApproval(
        scope,
        { expectedVersion: { ...expectedVersion, hash: "f".repeat(64) }, approved: true },
        { read: read(), rpc },
      ),
    ).rejects.toThrow("publication_version_changed");
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: "lost acknowledgement" });
    await expect(
      setPublicationApproval(scope, { expectedVersion, approved: true }, { read: read(), rpc }),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not accept browser status or unavailable storage as approval", async () => {
    for (const response of [
      { data: false, error: null },
      { data: null, error: null },
      { data: true, error: "unavailable" },
    ])
      await expect(
        assertPublicationApproved(
          scope.ownerId,
          asset,
          project,
          [],
          vi.fn().mockResolvedValue(response),
        ),
      ).rejects.toThrow();
  });
  it("refuses a foreign asset before reading approval storage", async () => {
    const rpc = vi.fn();
    await expect(
      assertPublicationApproved(scope.ownerId, { ...asset, projectId: "other" }, project, [], rpc),
    ).rejects.toThrow("publication_version_scope");
    expect(rpc).not.toHaveBeenCalled();
  });
});
