import { describe, expect, it } from "vitest";
import { publicationVersion, samePublicationVersion } from "./publication-version";
import type { ContentAsset, Project } from "./types";
const project = {
  id: "p",
  name: "Business",
  businessName: "Business",
  websiteUrl: "https://example.com",
  connectorType: "wordpress",
  wordpress: { siteUrl: "https://example.com" },
} as Project;
const asset = {
  id: "a",
  projectId: "p",
  title: "Title",
  slug: "title",
  markdown: "Owner body with [service](/service)",
  metaTitle: "Meta",
  metaDescription: "Description",
  status: "Draft",
} as ContentAsset;
describe("publication version identity", () => {
  it("changes for visible content, destination and source evidence edits", async () => {
    const original = await publicationVersion(asset, project, ["/service"]);
    for (const changed of [
      { ...asset, markdown: "Other body" },
      { ...asset, metaTitle: "Different" },
      { ...asset, publishSlug: "other" },
      {
        ...asset,
        sourceDependencies: [
          {
            ownerId: "00000000-0000-4000-8000-000000000001",
            projectId: "p",
            sourceId: "00000000-0000-4000-8000-000000000002",
            key: "price",
            fingerprint: "a".repeat(64),
            critical: true,
          },
        ],
      },
    ] as ContentAsset[])
      expect(
        samePublicationVersion(original, await publicationVersion(changed, project, ["/service"])),
      ).toBe(false);
    expect(
      samePublicationVersion(
        original,
        await publicationVersion(
          asset,
          { ...project, wordpress: { siteUrl: "https://other.example" } },
          ["/service"],
        ),
      ),
    ).toBe(false);
    expect(samePublicationVersion(original, await publicationVersion(asset, project, []))).toBe(
      false,
    );
  });
  it("does not invalidate review for status, schedule or editor timestamp changes", async () => {
    const original = await publicationVersion(asset, project);
    expect(
      await publicationVersion(
        {
          ...asset,
          status: "Approved",
          updatedAt: "2026-09-15T07:00:00Z",
          scheduledPublishAt: "2026-09-16T07:00:00Z",
          sourceHeldPublishAt: "2026-09-14T07:00:00Z",
        },
        project,
      ),
    ).toEqual(original);
  });
  it("rederives assembly, ignores credential changes and validates scope", async () => {
    const original = await publicationVersion(asset, project);
    expect(
      await publicationVersion(
        { ...asset, assembled: { markdown: "stale" } as ContentAsset["assembled"] },
        {
          ...project,
          wordpress: { ...project.wordpress, applicationPassword: "synthetic-test-value" },
        },
      ),
    ).toEqual(original);
    await expect(publicationVersion(asset, { ...project, id: "foreign" })).rejects.toThrow(
      "publication_version_scope",
    );
    expect(samePublicationVersion(original, { ...original, algorithm: "unknown" })).toBe(false);
  });
});
