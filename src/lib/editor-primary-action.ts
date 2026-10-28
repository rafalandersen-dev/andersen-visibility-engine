import type { ContentAsset } from "./types";
import type {
  PublicationApprovalSnapshot,
  PublicationApprovalState,
} from "@/components/PublicationApprovalStatus";

export type EditorPrimaryAction = "save" | "markInReview" | "approve" | "reviewPublication";

type EditorActionState = Pick<
  ContentAsset,
  "status" | "publishStatus" | "livePublishStatus" | "liveUrl" | "scheduledPublishStatus"
>;

/** Fail closed for presentation until this exact editor context has been checked. */
export function editorApprovalState(
  snapshot: PublicationApprovalSnapshot | null,
  context: Omit<PublicationApprovalSnapshot, "state">,
): PublicationApprovalState {
  return snapshot?.asset === context.asset &&
    snapshot.project === context.project &&
    snapshot.paths === context.paths &&
    snapshot.revision === context.revision &&
    snapshot.userId === context.userId
    ? snapshot.state
    : "loading";
}

/** Presentation only: editorial status never proves exact-version approval.
 * Distribution states lead to the existing publication controls, without
 * sending, publishing, rescheduling, or changing approval as a side effect.
 */
export function editorPrimaryAction(
  asset: EditorActionState,
  dirty: boolean,
  approval: PublicationApprovalState = "loading",
): EditorPrimaryAction {
  if (dirty) return "save";
  if (
    (asset.publishStatus && asset.publishStatus !== "notSent") ||
    (asset.livePublishStatus && asset.livePublishStatus !== "notPublished") ||
    asset.liveUrl ||
    (asset.scheduledPublishStatus && asset.scheduledPublishStatus !== "cancelled")
  ) {
    return "reviewPublication";
  }
  if (asset.status === "Draft" || asset.status === "Rejected") return "markInReview";
  if (asset.status === "In Review") return "approve";
  return approval === "current" ? "reviewPublication" : "approve";
}
