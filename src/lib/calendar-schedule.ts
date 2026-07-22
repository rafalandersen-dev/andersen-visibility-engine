/**
 * Calendar scheduling — drop-to-schedule readiness, default go-live time, and
 * the "dated soon but not ready" risk selector.
 *
 * The calendar arms REAL go-lives (same queue as the editor's schedule control),
 * so it needs one client-side answer to "can this publish?". This mirrors the
 * fire-time contract in publish.server.ts — status Approved|Exported, a live
 * publish mode, and zero checklist blockers — so what the popup promises is
 * exactly what the cron runner will enforce. The server remains the authority:
 * an asset that regresses after arming is refused at fire time regardless of
 * what any UI said.
 *
 * Pure — no I/O, no store access; `now` injectable for tests.
 */
import type { ContentAsset, Project } from "./types";
import { publishBlockers } from "./checklist";
import { effectivePublishMode } from "./publish-targets";

/**
 * Runner tick (5 min — see schedule.functions.ts SCHEDULE_TICK_MS; duplicated
 * here so this module never imports the server-fn module) plus breathing room:
 * a default slot only 5 minutes out would expire while the dialog is open.
 */
const TICK_MS = 5 * 60_000;
const DEFAULT_LEAD_MS = 15 * 60_000;

export interface PublishReadiness {
  ready: boolean;
  /** Why not — editor-checklist vocabulary, shown verbatim in the drop dialog. */
  reasons: string[];
}

/**
 * Can this asset be armed for a scheduled go-live right now? Reasons align with
 * the fire-time gate (publish.server.ts): approval state, live publish mode and
 * the SAME deterministic publishBlockers the cron re-checks before publishing.
 */
export function publishReadiness(
  asset: ContentAsset | undefined,
  project: Project | undefined,
  corpus: ContentAsset[],
): PublishReadiness {
  const reasons: string[] = [];
  if (!asset) {
    return { ready: false, reasons: ["No draft exists yet — create the content first."] };
  }
  if (asset.livePublishStatus === "published") {
    reasons.push("Already live — edit or rewrite the published page instead.");
  }
  if (asset.status !== "Approved" && asset.status !== "Exported") {
    reasons.push("Not approved yet — review and approve the draft in the editor.");
  }
  if (!project || effectivePublishMode(project) === "draftOnly") {
    reasons.push("No live publish mode is set — configure one in Project Setup.");
  }
  if (project) {
    for (const blocker of publishBlockers(asset, project, corpus)) {
      reasons.push(blocker.detail || blocker.label);
    }
  }
  return { ready: reasons.length === 0, reasons };
}

const pad = (n: number) => String(n).padStart(2, "0");

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * The default go-live slot for a calendar-day drop, as a datetime-local string
 * ("YYYY-MM-DDTHH:mm", browser-local — the dialog input's format).
 *
 * 09:00 local on the dropped day (the owner's chosen default). When 09:00 is
 * already inside the lead window (dropping on today mid-morning), the nearest
 * future slot on that day is offered instead: now + 15 min, rounded UP to the
 * runner's 5-minute grid. Returns null when the day cannot host a valid slot at
 * all (a past day, or today with no room left before midnight) — the dialog
 * then refuses to arm rather than silently scheduling tomorrow.
 */
export function defaultGoLiveLocal(date: Date, now: Date = new Date()): string | null {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nine = new Date(day);
  nine.setHours(9, 0, 0, 0);
  const earliest = now.getTime() + DEFAULT_LEAD_MS;

  let chosen: Date | null = nine.getTime() >= earliest ? nine : null;
  if (!chosen) {
    const rounded = new Date(Math.ceil(earliest / TICK_MS) * TICK_MS);
    if (sameLocalDay(rounded, day)) chosen = rounded;
  }
  if (!chosen) return null;
  return `${chosen.getFullYear()}-${pad(chosen.getMonth() + 1)}-${pad(chosen.getDate())}T${pad(
    chosen.getHours(),
  )}:${pad(chosen.getMinutes())}`;
}

/** A calendar-dated item that will NOT publish successfully as things stand. */
export interface PublishRisk {
  /** target = dashed ghost (dueAt); armed = a queued go-live that has regressed. */
  kind: "target" | "armed";
  title: string;
  /** The date it is heading for — dueAt (target) or scheduledPublishAt (armed). */
  when: string;
  opportunityId?: string;
  assetId?: string;
  reasons: string[];
}

export interface UpcomingRiskArgs {
  /** Calendar ghosts: pre-armed targets carrying a dueAt. */
  ghosts: Array<{ id: string; title: string; dueAt?: string; assetId?: string }>;
  /** Armed go-lives (already filtered to pipelineStage "armed" by the caller). */
  armed: ContentAsset[];
  /** Full asset corpus — blocker context (cannibalisation, links). */
  assets: ContentAsset[];
  project: Project | undefined;
  now?: number;
  horizonDays?: number;
}

/**
 * Everything dated within the horizon (default 7 days) that is not ready to
 * publish: dashed targets whose draft is missing/unready, and — the dangerous
 * one — ARMED go-lives whose asset regressed after arming (un-approved, new
 * blockers). The cron will refuse those at fire time; this surfaces them now
 * instead of the morning after. Sorted soonest first.
 */
export function upcomingPublishRisks(args: UpcomingRiskArgs): PublishRisk[] {
  const now = args.now ?? Date.now();
  const horizonDays = args.horizonDays ?? 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + (horizonDays + 1) * 24 * 60 * 60_000 - 1;

  const byId = new Map(args.assets.map((a) => [a.id, a]));
  const risks: PublishRisk[] = [];

  for (const ghost of args.ghosts) {
    if (!ghost.dueAt) continue;
    // Noon-local anchor for a date-only string — the calendar's own convention.
    const at = new Date(`${ghost.dueAt.slice(0, 10)}T12:00:00`).getTime();
    if (Number.isNaN(at) || at < start.getTime() || at > end) continue;
    const readiness = publishReadiness(
      ghost.assetId ? byId.get(ghost.assetId) : undefined,
      args.project,
      args.assets,
    );
    if (readiness.ready) continue;
    risks.push({
      kind: "target",
      title: ghost.title,
      when: ghost.dueAt,
      opportunityId: ghost.id,
      ...(ghost.assetId ? { assetId: ghost.assetId } : {}),
      reasons: readiness.reasons,
    });
  }

  for (const asset of args.armed) {
    if (!asset.scheduledPublishAt) continue;
    const at = new Date(asset.scheduledPublishAt).getTime();
    if (Number.isNaN(at) || at < start.getTime() || at > end) continue;
    const readiness = publishReadiness(asset, args.project, args.assets);
    if (readiness.ready) continue;
    risks.push({
      kind: "armed",
      title: asset.title,
      when: asset.scheduledPublishAt,
      assetId: asset.id,
      reasons: readiness.reasons,
    });
  }

  return risks.sort((a, b) => a.when.localeCompare(b.when));
}
