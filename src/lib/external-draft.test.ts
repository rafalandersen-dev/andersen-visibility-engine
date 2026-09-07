import { describe, expect, it } from "vitest";
import { applyExternalDraftEdits, assertExternalDraftEditable } from "./external-draft";
import type { ContentAsset } from "./types";
const asset = (patch: Partial<ContentAsset> = {}) =>
  ({
    id: "a",
    projectId: "p",
    status: "Draft",
    markdown: "Original",
    title: "Original",
    updatedAt: "old",
    ...patch,
  }) as ContentAsset;
describe("external draft edit boundary", () => {
  it.each([
    { status: "Approved" },
    { status: "In Review" },
    { status: "Exported" },
    { status: "Rejected" },
    { livePublishStatus: "publishing" },
    { livePublishStatus: "failed" },
    { livePublishStatus: "published" },
    { publishStatus: "sent" },
    { publishStatus: "failed" },
    { liveUrl: "https://example.test" },
    { publishedDraftUrl: "https://example.test/draft" },
    { wordpressPostId: 123 },
    { scheduledPublishStatus: "pending" },
    { scheduledPublishStatus: "publishing" },
    { scheduledPublishStatus: "failed" },
    { scheduledPublishAt: "2026-09-10T12:00:00Z" },
  ] as Partial<ContentAsset>[])("refuses approval and known publication-state edits", (patch) => {
    expect(() => assertExternalDraftEditable(asset(patch))).toThrow("external_draft_not_editable");
  });
  it("allows a cancelled unpublished Draft without reactivating its schedule", () => {
    const current = asset({
      scheduledPublishAt: "2026-09-10T12:00:00Z",
      scheduledPublishStatus: "cancelled",
    });
    expect(applyExternalDraftEdits(current, { title: "New" }, "now").scheduledPublishStatus).toBe(
      "cancelled",
    );
  });
  it("invalidates assessments after content edits while preserving authored visuals and references", () => {
    const current = asset({
      qualityScore: { total: 80 } as never,
      qualityScoreStale: false,
      assembled: { markdown: "old output" } as never,
      readiness: { total: 80 } as never,
      checklist: [],
      images: [{ id: "im", status: "accepted", alt: "Keep" }] as never,
      sectionIndex: [{ id: "sec" }] as never,
    });
    const changed = applyExternalDraftEdits(
      current,
      { markdown: "New body", faq: [{ q: "Q", a: "A" }] },
      "now",
    );
    expect(changed).toMatchObject({
      status: "Draft",
      markdown: "New body",
      qualityScoreStale: true,
      updatedAt: "now",
      images: current.images,
      sectionIndex: current.sectionIndex,
    });
    for (const key of ["assembled", "readiness", "checklist"])
      expect(changed).not.toHaveProperty(key);
    expect(current.assembled).toBeDefined();
    expect(current.qualityScoreStale).toBe(false);
  });
  it("does not stale assessments for notes-only or identical content edits", () => {
    const current = asset({
      qualityScore: { total: 80 } as never,
      qualityScoreStale: false,
      assembled: { markdown: "output" } as never,
    });
    const changed = applyExternalDraftEdits(
      current,
      { editorNotes: "Note", markdown: "Original" },
      "now",
    );
    expect(changed.qualityScoreStale).toBe(false);
    expect(changed.assembled).toEqual(current.assembled);
  });
  it("rejects approval/identity fields even if a future caller skips its schema", () => {
    expect(() => applyExternalDraftEdits(asset(), { status: "Approved" }, "now")).toThrow(
      "external_draft_field_not_editable",
    );
  });
});
