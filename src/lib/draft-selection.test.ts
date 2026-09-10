import { describe, expect, it } from "vitest";
import { assertSavedDraftSelection, draftSelectionChanged } from "./draft-selection";
import { publicationVersion } from "./publication-version";
import { draftPayloadFor } from "./publish.functions";
import type { ContentAsset, Project } from "./types";
const project = { id: "p", defaultDestinationType: "blogPost" } as Project;
const asset = {
  id: "a",
  projectId: "p",
  slug: "original",
  title: "Guide",
  markdown: "Body",
  status: "Approved",
} as ContentAsset;
describe("custom draft selections bind to the saved approved version", () => {
  it.each([
    { slug: "chosen", destinationType: "blogPost" as const },
    { slug: "original", destinationType: "faq" as const },
  ])("requires a saved new approval for changed selection %j", async (selection) => {
    expect(draftSelectionChanged(asset, project, selection)).toBe(true);
    expect(() => assertSavedDraftSelection(asset, project, selection)).toThrow(
      "publication_approval_required",
    );
    const saved = {
      ...asset,
      publishSlug: selection.slug,
      publishDestinationType: selection.destinationType,
    };
    expect(() => assertSavedDraftSelection(saved, project, selection)).not.toThrow();
    expect((await publicationVersion(saved, project)).hash).not.toBe(
      (await publicationVersion(asset, project)).hash,
    );
    expect(draftPayloadFor(saved, project)).toMatchObject(selection);
  });
  it("uses prior asset selections over project defaults and keeps repeated sends on that destination", () => {
    const saved = { ...asset, publishSlug: "chosen", publishDestinationType: "faq" as const };
    expect(draftSelectionChanged(saved, project, { slug: "chosen", destinationType: "faq" })).toBe(
      false,
    );
    expect(draftPayloadFor(saved, project)).toMatchObject({
      slug: "chosen",
      destinationType: "faq",
    });
  });
});
