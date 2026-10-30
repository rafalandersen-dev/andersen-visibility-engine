import type { ContentAsset, ContentStatus } from "./types";

/**
 * First-use conversation context (CG-01A). Pure decisions about what the empty
 * conversation may suggest and which consent controls it may show.
 *
 * A suggestion only fills in the composer. It never sends, never consents and
 * never fetches or generates anything. Only data already in the signed-in
 * owner's own hydrated workspace can be named, and only for the exact
 * actor/owner/project scope; everything unproven stays generic.
 */

/** Longest draft title (in code points, ellipsis included) a suggestion may show. */
export const FIRST_USE_TITLE_LIMIT = 60;
/** Saved drafts that are still being worked on; published/exported work is not suggested. */
const WORKING_DRAFT: ReadonlySet<ContentStatus> = new Set(["Draft", "In Review"]);

export type FirstUseScope = { ownerId: string; projectId: string };
/** The minimal store projection: the workspace in memory and whose it is. */
export type FirstUseWorkspace = {
  userId: string | null;
  hydrated: boolean;
  content: readonly Pick<ContentAsset, "projectId" | "title" | "status" | "updatedAt">[];
};
export type FirstUseKind =
  /** Own project with a named working draft from the verified own workspace. */
  | "ownedDraft"
  /** Own project; the verified own workspace has no working draft for it. */
  | "ownedEmpty"
  /** Own project, but the workspace in memory is not proven to be the actor's. */
  | "ownedUnverified"
  /** Someone else's project: never local data, even for an identical project ID. */
  | "shared"
  /** No actor or project. */
  | "none";
export type FirstUseSuggestion =
  | { id: "draftReview"; key: "conversationStart.suggest.draftReview"; vars: { title: string } }
  | {
      id: "businessGaps" | "goal" | "sharedOverview";
      key: `conversationStart.suggest.${"businessGaps" | "goal" | "sharedOverview"}`;
      vars?: undefined;
    };

const businessGaps = {
  id: "businessGaps",
  key: "conversationStart.suggest.businessGaps",
} as const satisfies FirstUseSuggestion;
const goal = {
  id: "goal",
  key: "conversationStart.suggest.goal",
} as const satisfies FirstUseSuggestion;
const sharedOverview = {
  id: "sharedOverview",
  key: "conversationStart.suggest.sharedOverview",
} as const satisfies FirstUseSuggestion;

// Control, zero-width and bidirectional formatting characters cannot change how a
// title reads around the surrounding sentence.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** A displayable, bounded draft title, or undefined when nothing readable remains. */
export function firstUseTitle(title: unknown): string | undefined {
  if (typeof title !== "string") return undefined;
  const clean = title.replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const points = Array.from(clean);
  return points.length <= FIRST_USE_TITLE_LIMIT
    ? clean
    : `${points
        .slice(0, FIRST_USE_TITLE_LIMIT - 1)
        .join("")
        .trimEnd()}…`;
}

function latestWorkingDraft(content: FirstUseWorkspace["content"], projectId: string) {
  let best: { title: string; at: number } | undefined;
  for (const asset of content) {
    if (asset?.projectId !== projectId || !WORKING_DRAFT.has(asset.status)) continue;
    const title = firstUseTitle(asset.title);
    if (!title) continue;
    const parsed = Date.parse(asset.updatedAt);
    const at = Number.isNaN(parsed) ? -Infinity : parsed;
    // Earlier entries win ties, so equal or unreadable dates keep store order.
    if (!best || at > best.at) best = { title, at };
  }
  return best?.title;
}

export function firstUseContext(
  actorId: string | undefined,
  project: FirstUseScope | undefined,
  workspace: FirstUseWorkspace | undefined,
): { kind: FirstUseKind; suggestions: readonly FirstUseSuggestion[] } {
  if (!actorId || !project) return { kind: "none", suggestions: [goal] };
  if (project.ownerId !== actorId) return { kind: "shared", suggestions: [sharedOverview, goal] };
  // The workspace in memory belongs to `workspace.userId`; only a hydrated
  // workspace of this very actor (= this owner) may name one of its drafts.
  if (!workspace || !workspace.hydrated || workspace.userId !== actorId)
    return { kind: "ownedUnverified", suggestions: [businessGaps, goal] };
  const title = latestWorkingDraft(workspace.content, project.projectId);
  return title
    ? {
        kind: "ownedDraft",
        suggestions: [
          { id: "draftReview", key: "conversationStart.suggest.draftReview", vars: { title } },
          businessGaps,
        ],
      }
    : { kind: "ownedEmpty", suggestions: [businessGaps, goal] };
}

/**
 * Which per-message consent controls the composer shows. Mirrors the send
 * contract: draft generation is the owner's alone; site checks spend the owner's
 * quota, so only the owner or a working collaborator (editor/reviewer, derived
 * by the caller from the membership directory) may consent. The database
 * refuses anything else regardless.
 */
export function firstUseConsent(
  actorId: string,
  project: FirstUseScope,
  canConsentChecks: boolean,
): { generation: boolean; checks: boolean } {
  const owner = actorId === project.ownerId;
  return { generation: owner, checks: owner || canConsentChecks };
}
