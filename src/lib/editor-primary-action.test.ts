import { describe, expect, it } from "vitest";
import { editorApprovalState, editorPrimaryAction } from "./editor-primary-action";
import type { ContentAsset, ContentStatus, Project } from "./types";
import type { PublicationApprovalSnapshot } from "@/components/PublicationApprovalStatus";

const statuses: ContentStatus[] = ["Draft", "In Review", "Approved", "Rejected", "Exported"];

describe("editor approval result scope", () => {
  const checked: PublicationApprovalSnapshot = {
    state: "current",
    asset: { id: "article", status: "Approved" } as ContentAsset,
    project: { id: "project" } as Project,
    paths: ["/"],
    revision: 0,
    userId: "owner",
  };

  it("starts conservatively and only uses a result for the same checked context", () => {
    expect(editorApprovalState(null, checked)).toBe("loading");
    expect(editorApprovalState(checked, checked)).toBe("current");
  });

  it.each([
    { asset: { ...checked.asset, markdown: "Updated article" } },
    { asset: { ...checked.asset, id: "another-article" } },
    { project: { ...checked.project, publishEndpoint: "https://example.com/new-destination" } },
    { paths: ["/", "/new-page"] },
    { revision: 1 },
    { userId: "another-owner" },
  ])("never carries current approval into changed editor inputs: %j", (changed) => {
    const state = editorApprovalState(checked, { ...checked, ...changed });
    expect(state).toBe("loading");
    expect(editorPrimaryAction({ status: "Approved" }, false, state)).toBe("approve");
  });
});

describe("editor primary action", () => {
  it.each(statuses)("saves unsaved %s edits without advancing the workflow", (status) => {
    for (const approval of ["loading", "needed", "unavailable", "current"] as const) {
      expect(editorPrimaryAction({ status }, true, approval)).toBe("save");
    }
  });

  it.each(["Draft", "Rejected"] as const)("sends a clean %s to editorial review", (status) => {
    expect(editorPrimaryAction({ status, publishStatus: "notSent" }, false)).toBe("markInReview");
  });

  it("offers the explicit approval action only after editorial review", () => {
    expect(editorPrimaryAction({ status: "In Review" }, false)).toBe("approve");
  });

  it.each(["Approved", "Exported"] as const)(
    "%s requires a matching current approval before directing the user to publication",
    (status) => {
      expect(editorPrimaryAction({ status }, false, "current")).toBe("reviewPublication");
      // Initial state, a changed version being checked, and unavailable reads
      // must never hide the deliberate approval action behind More actions.
      expect(editorPrimaryAction({ status }, false)).toBe("approve");
      for (const approval of ["loading", "needed", "unavailable"] as const) {
        expect(editorPrimaryAction({ status }, false, approval)).toBe("approve");
      }
    },
  );

  it.each([
    { publishStatus: "sent" },
    { publishStatus: "failed" },
    { livePublishStatus: "published" },
    { livePublishStatus: "failed" },
    { liveUrl: "https://example.com/article" },
    { scheduledPublishStatus: "pending" },
    { scheduledPublishStatus: "publishing" },
    { scheduledPublishStatus: "published" },
    { scheduledPublishStatus: "review_required" },
    { scheduledPublishStatus: "failed" },
  ] satisfies Partial<ContentAsset>[])(
    "keeps distribution progress or recovery visible when editorial status lags: %j",
    (publication) => {
      for (const approval of ["loading", "needed", "unavailable", "current"] as const) {
        expect(editorPrimaryAction({ status: "Draft", ...publication }, false, approval)).toBe(
          "reviewPublication",
        );
        expect(editorPrimaryAction({ status: "In Review", ...publication }, false, approval)).toBe(
          "reviewPublication",
        );
        expect(editorPrimaryAction({ status: "Approved", ...publication }, true, approval)).toBe(
          "save",
        );
      }
    },
  );

  it("allows editorial review after a schedule has been cancelled before distribution", () => {
    expect(
      editorPrimaryAction({ status: "In Review", scheduledPublishStatus: "cancelled" }, false),
    ).toBe("approve");
  });
});
