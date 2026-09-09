import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGenerationResult } from "./generation-result";
import {
  recoverGeneratedResultMutation,
  recoverGenerationResult,
} from "./generation-recovery.server";
import type { ContentAsset, Opportunity } from "./types";
import type { WorkspaceData } from "./workspace.server";
const user = "owner",
  now = "2026-09-09T14:00:00.000Z";
const output = {
  metaTitle: "Guide",
  metaDescription: "Description",
  h1: "Guide",
  outline: [],
  faq: [],
  cta: "Contact",
  markdown: "## Saved guide\n\nUseful text.",
  internalLinks: [],
  schemaSuggestions: [],
  editorNotes: "Review",
  hookProposals: [{ text: "A clear hook", type: "question" }],
};
const article = parseGenerationResult(
  {
    version: 1,
    kind: "content",
    projectId: "p",
    opportunityId: "o",
    assetId: "a",
    title: "Guide",
    language: "Polish",
    assetType: "article",
    output,
  },
  user,
);
const image = parseGenerationResult(
  {
    version: 1,
    kind: "image",
    projectId: "p",
    assetId: "a",
    imageId: "i",
    title: "Image",
    concept: "Studio",
    output: { path: "owner/p/a/image.webp", alt: "Studio" },
  },
  user,
);
const base = (): WorkspaceData => ({
  projects: [{ id: "p" }],
  opportunities: [{ id: "o", projectId: "p", status: "planned", version: 2 }],
  content: [],
  keep: { important: true },
});
const withArticle = () => recoverGeneratedResultMutation(base(), article, now).data;
afterEach(() => vi.useRealTimers());
describe("recovering one saved generation", () => {
  it("creates an unapproved draft with its stable original identity and preserves other workspace data", () => {
    const result = recoverGeneratedResultMutation(base(), article, now);
    const a = (result.data.content as ContentAsset[])[0];
    expect(a).toMatchObject({
      id: "a",
      status: "Draft",
      language: "Polish",
      visualModelVersion: 3,
      markdown: output.markdown,
      hookProposals: output.hookProposals,
    });
    expect(a).not.toHaveProperty("hook");
    expect(a).not.toHaveProperty("scheduledPublishAt");
    expect(a).not.toHaveProperty("liveUrl");
    expect(result.data.keep).toEqual({ important: true });
    expect((result.data.opportunities as Opportunity[])[0]).toMatchObject({
      version: 3,
      status: "drafting",
      currentContentAssetId: "a",
    });
  });
  it("opens an existing edited/approved result without overwriting it or creating another copy", () => {
    const data = withArticle();
    Object.assign((data.content as ContentAsset[])[0], {
      markdown: "Owner's later text",
      status: "Approved",
    });
    const before = structuredClone(data),
      result = recoverGeneratedResultMutation(data, article, now);
    expect(result.result.outcome).toBe("existing");
    expect(result.data).toEqual(before);
  });
  it("preserves a newer primary draft pointer", () => {
    const data = base();
    (data.content as Partial<ContentAsset>[]).push({ id: "newer", projectId: "p" });
    (data.opportunities as Opportunity[])[0].currentContentAssetId = "newer";
    const result = recoverGeneratedResultMutation(data, article, now);
    expect((result.data.content as ContentAsset[]).map((a) => a.id)).toEqual(["newer", "a"]);
    expect((result.data.opportunities as Opportunity[])[0].currentContentAssetId).toBe("newer");
  });
  it.each(["missing_project", "missing_opportunity", "archived", "deleted"])(
    "refuses %s targets",
    (kind) => {
      const data = base();
      if (kind === "missing_project") data.projects = [];
      if (kind === "missing_opportunity") data.opportunities = [];
      if (kind === "archived") (data.opportunities as Opportunity[])[0].archivedAt = now;
      if (kind === "deleted") (data.opportunities as Opportunity[])[0].deletedAt = now;
      expect(() => recoverGeneratedResultMutation(data, article, now)).toThrow(
        "target_unavailable",
      );
    },
  );
  it("does not open an unrelated artifact under the same ID", () => {
    const data = withArticle();
    (data.content as ContentAsset[])[0].projectId = "other";
    expect(() => recoverGeneratedResultMutation(data, article, now)).toThrow("identity_conflict");
  });
  it("attaches a proposed private image once and keeps later owner edits", () => {
    const first = recoverGeneratedResultMutation(withArticle(), image, now, "temporary-preview");
    const a = (first.data.content as ContentAsset[])[0];
    expect(a.images![0]).toMatchObject({
      id: "i",
      status: "proposed",
      source: "generated",
      placement: "inline",
      required: false,
      storagePath: "owner/p/a/image.webp",
    });
    expect(a.images![0]).not.toHaveProperty("url");
    a.images![0].alt = "Owner correction";
    a.images![0].status = "accepted";
    a.status = "Approved";
    const again = recoverGeneratedResultMutation(first.data, image, now);
    expect(again.result.outcome).toBe("existing");
    expect(again.data).toEqual(first.data);
  });
  it.each([
    { status: "Approved" },
    { liveUrl: "https://example.com/live" },
    { scheduledPublishAt: now, scheduledPublishStatus: "pending" },
  ])("does not change an armed/published target %#", (patch) => {
    const data = withArticle();
    Object.assign((data.content as ContentAsset[])[0], patch);
    expect(() => recoverGeneratedResultMutation(data, image, now, "preview")).toThrow(
      "external_draft_not_editable",
    );
  });
  it("keeps the newer timestamp and invalidates stale assessments when an image is recovered", () => {
    const data = withArticle();
    Object.assign((data.content as ContentAsset[])[0], {
      updatedAt: "2026-09-10T14:00:00.123456Z",
      qualityScore: { total: 80 },
      assembled: { old: true },
    });
    const result = recoverGeneratedResultMutation(data, image, now, "preview");
    const a = (result.data.content as ContentAsset[])[0];
    expect(a.updatedAt).toBe("2026-09-10T14:00:00.123456Z");
    expect(a.qualityScoreStale).toBe(true);
    expect(a).not.toHaveProperty("assembled");
  });
  it("a concurrent workspace change stops recovery without a hidden reapplication", async () => {
    const update = vi.fn().mockResolvedValue(null),
      read = vi.fn().mockResolvedValue({ data: base(), rev: 4 });
    await expect(
      recoverGenerationResult(user, "receipt", {
        readResult: vi.fn().mockResolvedValue({ id: "receipt", createdAt: now, result: article }),
        readWorkspace: read,
        updateWorkspace: update,
        preview: vi.fn(),
      }),
    ).rejects.toThrow("workspace_changed");
    expect(read).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][2]).toBe(4);
  });
  it("opening a recovered approved image does not depend on its old private preview", async () => {
    const data = recoverGeneratedResultMutation(withArticle(), image, now, "preview").data;
    Object.assign((data.content as ContentAsset[])[0], { status: "Approved" });
    const preview = vi.fn().mockRejectedValue(new Error("private object removed")),
      update = vi.fn();
    const result = await recoverGenerationResult(user, "receipt", {
      readResult: vi.fn().mockResolvedValue({ id: "receipt", createdAt: now, result: image }),
      readWorkspace: vi.fn().mockResolvedValue({ data, rev: 3 }),
      updateWorkspace: update,
      preview,
    });
    expect(result.outcome).toBe("existing");
    expect(preview).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("a missing image object prevents attachment", async () => {
    const update = vi.fn();
    await expect(
      recoverGenerationResult(user, "receipt", {
        readResult: vi.fn().mockResolvedValue({ id: "receipt", createdAt: now, result: image }),
        readWorkspace: vi.fn().mockResolvedValue({ data: withArticle(), rev: 3 }),
        updateWorkspace: update,
        preview: vi.fn().mockRejectedValue(new Error("missing image")),
      }),
    ).rejects.toThrow("missing image");
    expect(update).not.toHaveBeenCalled();
  });
  it("does not retry a timed-out physical workspace write", async () => {
    vi.useFakeTimers();
    let settle!: (v: number) => void;
    let entered!: () => void;
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    const update = vi.fn(
      () =>
        new Promise<number>((r) => {
          settle = r;
          entered();
        }),
    );
    const result = expect(
      recoverGenerationResult(user, "receipt", {
        readResult: vi.fn().mockResolvedValue({ id: "receipt", createdAt: now, result: article }),
        readWorkspace: vi.fn().mockResolvedValue({ data: base(), rev: 3 }),
        updateWorkspace: update,
        preview: vi.fn(),
      }),
    ).rejects.toThrow("timeout");
    await ready;
    await vi.advanceTimersByTimeAsync(10001);
    await result;
    settle(4);
    await vi.runAllTimersAsync();
    expect(update).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
