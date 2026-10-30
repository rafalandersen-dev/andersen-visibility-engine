import type { Opportunity } from "./types";

/**
 * Task continuity (CG-02A). Pure decisions about whether a task reference (a
 * Plan opportunity id carried by a citation pin, a draft's source or a Plan
 * `?selected=` link) names exactly one task the signed-in actor can open in
 * Plan right now, and how Plan must explain a reference it cannot show.
 *
 * A reference never falls back to another task. Only the hydrated workspace of
 * this very actor counts, only within the project Plan currently shows, and a
 * deleted, missing or other-project task is reported as unavailable rather than
 * substituted. Navigation decides nothing else: it never consents, approves,
 * publishes, schedules, generates or writes.
 */

/** The minimal store projection: whose workspace is in memory and what it holds. */
export type TaskWorkspace = {
  userId: string | null;
  hydrated: boolean;
  activeProjectId: string;
  opportunities: readonly Pick<Opportunity, "id" | "projectId" | "status" | "deletedAt">[];
};

export type TaskTarget =
  /** An existing task Plan lists in active work. */
  | { kind: "active"; taskId: string }
  /** An existing task Plan lists only under Archived (same rule as Plan's lifecycle). */
  | { kind: "archived"; taskId: string }
  | {
      kind: "unavailable";
      reason:
        /** No reference at all. */
        | "none"
        /** The workspace in memory is not proven to be this actor's: decide nothing yet. */
        | "unverified"
        /** Not in this workspace. */
        | "missing"
        /** Soft-deleted. */
        | "deleted"
        /** Exists, but not in the project Plan currently shows. */
        | "otherProject";
    };

/** Plan's own archive rule (`opportunityLifecycleStatus`): archived or discarded. */
const ARCHIVED: ReadonlySet<string> = new Set(["archived", "Discarded"]);

/**
 * Resolve a task reference for the actor. `projectId` is the project the
 * reference belongs to (a draft's project, a citation panel's project); it must
 * be the project Plan currently shows, since Plan lists only that one.
 */
export function taskTarget(
  actorId: string | undefined,
  workspace: TaskWorkspace,
  projectId: string,
  taskId: string | null | undefined,
): TaskTarget {
  if (!taskId) return { kind: "unavailable", reason: "none" };
  if (!actorId || !workspace.hydrated || workspace.userId !== actorId)
    return { kind: "unavailable", reason: "unverified" };
  const task = workspace.opportunities.find((o) => o?.id === taskId);
  if (!task) return { kind: "unavailable", reason: "missing" };
  if (task.projectId !== projectId || projectId !== workspace.activeProjectId)
    return { kind: "unavailable", reason: "otherProject" };
  if (task.deletedAt) return { kind: "unavailable", reason: "deleted" };
  return ARCHIVED.has(task.status) ? { kind: "archived", taskId } : { kind: "active", taskId };
}

/** The Plan link of a task the actor can open, or undefined when there is none. */
export function taskPlanSearch(target: TaskTarget): { selected: string } | undefined {
  return target.kind === "unavailable" ? undefined : { selected: target.taskId };
}

/**
 * What Plan shows for a `?selected=` reference that its current list does not
 * render. `visible` is whether the selection is in the list Plan rendered (active
 * or archived view, after the search filter). An unverified workspace says
 * nothing yet; a selection hidden only by the owner's own filter or toggle stays
 * quiet; everything else is explained, and nothing else is selected instead.
 */
export type PlanSelectionNotice = "none" | "archived" | "unavailable";

export function planSelectionNotice(
  target: TaskTarget,
  visible: boolean,
  showingArchived: boolean,
): PlanSelectionNotice {
  if (visible) return "none";
  switch (target.kind) {
    case "archived":
      return showingArchived ? "none" : "archived";
    case "active":
      return "none";
    case "unavailable":
      return target.reason === "none" || target.reason === "unverified" ? "none" : "unavailable";
  }
}

/**
 * Which asset the editor shows. An explicit `?id=` is the selection, always: an
 * absent or foreign id is never replaced (the editor fails closed on it). Without
 * an id the editor shows a held default, kept while it still exists so a reorder
 * or a newly created asset never swaps the open draft; once that asset is gone
 * (deleted here or elsewhere) the default moves to the first remaining asset, so
 * a bare `/app/editor` never names a deleted asset.
 */
export function editorSelection(
  requestedId: string | undefined,
  heldDefault: string | undefined,
  assetIds: readonly string[],
): { selectedId: string | undefined; defaultId: string | undefined } {
  const defaultId =
    heldDefault !== undefined && assetIds.includes(heldDefault) ? heldDefault : assetIds[0];
  return { selectedId: requestedId || defaultId, defaultId };
}
