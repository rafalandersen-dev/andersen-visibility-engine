/**
 * The one vocabulary. A single DERIVED stage per piece of work, computed from
 * the workspace blob and nothing else.
 *
 * Why derived rather than stored: 153 of the 189 opportunities in production
 * carry a legacy status ("Linked" 77, "Discarded" 56, "New" 16, "Drafting" 4)
 * and roughly twenty ungoverned `updateOpportunity` call sites write status
 * directly with no validation. A stored stage would be wrong for most of the
 * board and would drift further with every write. Deriving it means the worst a
 * bug can do is show a wrong label — never corrupt a workspace.
 *
 * Why no Postgres lookup: `scheduled_publishes` is RLS deny-all behind a
 * per-project server fn that is not in the SSR snapshot, so reading it here
 * would make every armed item render as Ready until a fetch resolved. The queue
 * stays authoritative for EXECUTION; the asset's mirror fields
 * (scheduledPublishAt/Status) are what this function reads.
 *
 * No I/O, no store access, no clock beyond the `now` argument — so the whole
 * thing is a pure function under test.
 */
import type { ContentAsset } from "./types";

/**
 * Exactly the opportunity fields this module reads — nothing else.
 *
 * Deliberately a minimal structural shape rather than the full Opportunity:
 * `status` is widened to string because production holds legacy values the
 * union no longer advertises, and callers should not have to cast a real record
 * to pass it in.
 */
export interface StageOpportunity {
  id?: string;
  status?: string;
  dueAt?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  archivedAt?: string;
  deletedAt?: string;
  currentContentAssetId?: string;
}

export const PIPELINE_STAGES = [
  "idea",
  "queued",
  "planned",
  "writing",
  "in_review",
  "ready",
  "armed",
  "sent",
  "live",
  "live_missing",
  "needs_fixing",
  "parked",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * How a stage behaves, which is what the UI must treat differently.
 * `armed` is the one that matters: something will happen without the user
 * touching it again, so it cannot look like every other inert card.
 */
export type StageExecution = "inert" | "armed" | "terminal" | "blocked";

export const STAGE_EXECUTION: Record<PipelineStage, StageExecution> = {
  idea: "inert",
  queued: "inert",
  planned: "inert",
  writing: "inert",
  in_review: "inert",
  ready: "inert",
  armed: "armed",
  sent: "inert",
  live: "terminal",
  // The page is live and fine — the missing draft is a maintenance concern, not
  // a task. Terminal so Up Next never nags about a working customer page.
  live_missing: "terminal",
  needs_fixing: "blocked",
  parked: "terminal",
};

/** Stages that represent an exception rather than forward progress. */
export const EXCEPTION_STAGES: PipelineStage[] = [
  "needs_fixing",
  "parked",
  "sent",
  "live_missing",
];

/**
 * A pending schedule this far past its time did not fire. Saying "Scheduled"
 * then is the exact lie the redesign exists to remove.
 */
export const OVERDUE_AFTER_MS = 15 * 60_000;

/** Legacy opportunity statuses that mean "the user put this aside". */
const PARKED_STATUSES = new Set(["Discarded", "archived"]);

function isParked(o: StageOpportunity): boolean {
  if (o.status && PARKED_STATUSES.has(o.status)) return true;
  return Boolean(o.archivedAt);
}

/** Soft-deleted records are not a stage — they are absent. */
export function isDropped(o: Pick<StageOpportunity, "deletedAt"> | undefined): boolean {
  return Boolean(o?.deletedAt);
}

export interface StageInput {
  opportunity?: StageOpportunity;
  asset?: ContentAsset;
  /** Injected so the pure function stays testable. */
  now?: number;
}

/**
 * Resolve the single stage for one piece of work.
 *
 * The order below IS the specification. Publish state is strictly dominant over
 * asset status: an article that is live stays "live" even if someone later
 * marks the draft Rejected, because the page is on the customer's site and
 * pretending otherwise hides it from every surface that could fix it.
 */
export function pipelineStage(input: StageInput): PipelineStage {
  const { opportunity: o, asset: a } = input;
  const now = input.now ?? Date.now();

  // 1. Live wins over everything, INCLUDING parked.
  //
  //    A page on the customer's site is a fact, not a preference. Checking
  //    parked first would hide a live article behind "you put this aside", and
  //    hiding it removes it from every surface that could update or unpublish
  //    it. Verified against production: publishing an asset promotes its linked
  //    opportunity, and one of the live articles on synergymassage.se belongs to
  //    an opportunity that had previously been discarded.
  //
  //    The opportunity side matters too: canonicalUrl can outlive the draft that
  //    produced it, and that page is still out there. When it does and there is
  //    NO resolvable asset, the stage is "live_missing", not "live": regenerating
  //    from scratch would let the connector CREATE a second post at a new URL
  //    (the external id lived on the deleted asset) — self-cannibalising duplicate
  //    content. Its action carries the prior canonicalUrl into a rewrite so the
  //    connector updates in place. With an asset present, "live" wins normally.
  if (a?.livePublishStatus === "published" || a?.liveUrl) return "live";
  if (o && (o.canonicalUrl || o.publishedAt)) return a ? "live" : "live_missing";

  // 2. Put aside by the user. Ahead of every WORKING stage, so archived items are
  //    never resurrected into a column that asks the user to do something.
  if (o && isParked(o)) return "parked";

  // 3. Anything that needs a human before it can move again.
  if (
    a?.livePublishStatus === "failed" ||
    a?.publishStatus === "failed" ||
    a?.scheduledPublishStatus === "failed" ||
    a?.status === "Rejected"
  ) {
    return "needs_fixing";
  }
  // An armed schedule well past its time did not fire.
  if (
    a?.scheduledPublishStatus === "pending" &&
    a.scheduledPublishAt &&
    now - new Date(a.scheduledPublishAt).getTime() > OVERDUE_AFTER_MS
  ) {
    return "needs_fixing";
  }

  // 4. Armed: the queue will publish this without further input.
  if (a?.scheduledPublishStatus === "pending" && a.scheduledPublishAt) return "armed";

  // 5. Sent to the site but not live. Its next action is "confirm it is live",
  //    not "schedule it" — the manual-publish shape (butelki-wodorowe) lives here.
  if (a?.publishStatus === "sent") return "sent";

  // 6. Editorial state of the draft.
  if (a) {
    if (a.status === "Approved" || a.status === "Exported") return "ready";
    if (a.status === "In Review") return "in_review";
    return "writing";
  }

  // 7. No asset yet — the opportunity's own state decides.
  if (o?.dueAt) return "planned";
  if (o?.status === "prioritized" || o?.status === "In Brief") return "queued";
  // Everything else active, including every legacy value, is an idea. Mapping by
  // EXCLUSION rather than enumeration: legacy statuses outnumber canonical ones
  // two to one in production, so an unlisted value must land somewhere sane.
  return "idea";
}

/**
 * The single next action for a stage. An exhaustive switch on purpose: adding a
 * stage without deciding what the user does there is a type error, not a card
 * with no button.
 */
export function nextAction(stage: PipelineStage): string {
  switch (stage) {
    case "idea":
      return "pipeline.action.prioritise";
    case "queued":
      return "pipeline.action.setDate";
    case "planned":
      return "pipeline.action.write";
    case "writing":
      return "pipeline.action.continueDraft";
    case "in_review":
      return "pipeline.action.review";
    case "ready":
      return "pipeline.action.schedule";
    case "armed":
      return "pipeline.action.viewSchedule";
    case "sent":
      return "pipeline.action.confirmLive";
    case "live":
      return "pipeline.action.viewImpact";
    case "live_missing":
      return "pipeline.action.rewrite";
    case "needs_fixing":
      return "pipeline.action.fix";
    case "parked":
      return "pipeline.action.unpark";
  }
}

/**
 * Pick the asset that represents an opportunity, by PRECEDENCE rather than
 * recency. An armed asset must never hide behind a newer inert one: the board
 * would show "Writing" with no cancel affordance while the cron published the
 * other one anyway.
 */
export function linkedAssetFor(
  opportunity: Pick<StageOpportunity, "id" | "currentContentAssetId">,
  assets: ContentAsset[],
): ContentAsset | undefined {
  const mine = assets.filter(
    (a) => a.opportunityId === opportunity.id || a.sourceOpportunityId === opportunity.id,
  );
  if (mine.length <= 1) return mine[0];

  // Among several armed assets, the one that fires FIRST is the one whose go-live
  // the card must advertise and whose schedule Cancel must target. Array order is
  // not a defensible tie-break for a publish time.
  const armed = mine
    .filter((a) => a.scheduledPublishStatus === "pending" && a.scheduledPublishAt)
    .sort((a, b) => (a.scheduledPublishAt ?? "").localeCompare(b.scheduledPublishAt ?? ""));
  if (armed.length) return armed[0];

  return (
    mine.find((a) => a.liveUrl || a.livePublishStatus === "published") ??
    mine.find((a) => a.id === opportunity.currentContentAssetId) ??
    mine.reduce(
      (newest, a) => ((a.updatedAt ?? "") > (newest.updatedAt ?? "") ? a : newest),
      mine[0],
    )
  );
}

/**
 * How loudly a stage asks for the user's attention.
 *
 * Lower sorts first. The ordering encodes a judgement: something BROKEN beats
 * something merely unfinished, because a failed publish is costing the customer
 * right now while an unwritten draft is not. `armed` sits low precisely because
 * it needs nothing — it is going to happen on its own, and surfacing it as a
 * task would teach the user to ignore the list.
 */
export const STAGE_URGENCY: Record<PipelineStage, number> = {
  needs_fixing: 0,
  sent: 1,
  ready: 2,
  in_review: 3,
  writing: 4,
  planned: 5,
  queued: 6,
  idea: 7,
  armed: 8,
  live: 9,
  // A live page with a lost draft is not urgent — it works. It sits below live
  // and above parked; being terminal, upNext excludes it regardless.
  live_missing: 10,
  parked: 11,
};

export interface UpNextItem<T> {
  item: T;
  stage: PipelineStage;
  /** i18n key for the single primary action. */
  actionKey: string;
}

/**
 * The "what needs me now" queue: at most `limit` items, each one thing with one
 * action.
 *
 * Deliberately capped and deliberately not a to-do list of everything. A
 * non-marketer who opens the app to twenty tasks does none of them; the whole
 * value is answering "what is the one thing" honestly. Terminal and armed
 * stages are excluded entirely — nothing there is waiting on a human.
 */
export function upNext<T>(
  entries: Array<{ item: T; stage: PipelineStage }>,
  limit = 3,
): Array<UpNextItem<T>> {
  return entries
    .filter((e) => STAGE_EXECUTION[e.stage] !== "terminal" && e.stage !== "armed")
    .sort((a, b) => STAGE_URGENCY[a.stage] - STAGE_URGENCY[b.stage])
    .slice(0, limit)
    .map((e) => ({ item: e.item, stage: e.stage, actionKey: nextAction(e.stage) }));
}
