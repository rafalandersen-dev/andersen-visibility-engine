/**
 * Phase 1B.4 — pure, client-safe presentation logic for the Pending Actions
 * inbox. The page component stays thin; everything testable lives here (the
 * repo's test environment is node-only, so UI behavior is covered at this
 * layer). STRICTLY read-only: nothing in this module mutates state or calls
 * server functions.
 */
import type { Opportunity, PendingAction, PendingActionStatus, PendingActionType } from "./types";
import { isPendingActionExpired, OPPORTUNITY_UPDATE_FIELDS, type OpportunityUpdateField } from "./pending-actions";

/** Stored status, except stale pending items DISPLAY as expired (lazy expiry). */
export function effectivePendingStatus(action: PendingAction, nowMs: number): PendingActionStatus {
  return isPendingActionExpired(action, nowMs) ? "expired" : action.status;
}

export interface PendingActionsUiFilter {
  status?: PendingActionStatus | "all";
  projectId?: string | "all";
  type?: PendingActionType | "all";
}

/** Filter + sort (newest first) for the inbox. "all"/undefined = no filter. */
export function filterPendingActions(
  actions: readonly PendingAction[],
  filter: PendingActionsUiFilter,
  nowMs: number,
): PendingAction[] {
  return actions
    .filter((a) => {
      if (filter.status && filter.status !== "all" && effectivePendingStatus(a, nowMs) !== filter.status) return false;
      if (filter.projectId && filter.projectId !== "all" && a.projectId !== filter.projectId) return false;
      if (filter.type && filter.type !== "all" && a.type !== filter.type) return false;
      return true;
    })
    .slice()
    .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
}

/** Count for the nav badge: effectively-pending items only. */
export function countPendingForBadge(actions: readonly PendingAction[], nowMs: number): number {
  return actions.filter((a) => effectivePendingStatus(a, nowMs) === "pending").length;
}

export interface PendingDiffRow {
  field: OpportunityUpdateField;
  current: string | undefined;
  proposed: string;
}

export interface PendingActionDiff {
  opportunityId: string;
  /** False when the target no longer exists — the UI shows a warning. */
  targetExists: boolean;
  rows: PendingDiffRow[];
}

/**
 * Before/after rows for an opportunity_update_proposal, computed against the
 * CURRENT workspace state at render time. Only whitelisted fields appear.
 */
export function pendingActionDiff(action: PendingAction, opportunities: readonly Opportunity[]): PendingActionDiff | null {
  if (action.type !== "opportunity_update_proposal") return null;
  const payload = action.payload as { opportunityId?: unknown; updates?: Record<string, unknown> };
  const opportunityId = typeof payload.opportunityId === "string" ? payload.opportunityId : "";
  const target = opportunities.find((o) => o.id === opportunityId);
  const updates = payload.updates && typeof payload.updates === "object" ? payload.updates : {};
  const rows: PendingDiffRow[] = [];
  for (const field of OPPORTUNITY_UPDATE_FIELDS) {
    const proposed = updates[field];
    if (typeof proposed !== "string") continue;
    rows.push({ field, current: target ? String(target[field] ?? "") : undefined, proposed });
  }
  return { opportunityId, targetExists: !!target, rows };
}

/** Proposed update field NAMES for the card summary line (sorted, safe). */
export function proposedFieldNames(action: PendingAction): string[] {
  const updates = (action.payload as { updates?: Record<string, unknown> }).updates;
  return updates && typeof updates === "object" && !Array.isArray(updates) ? Object.keys(updates).sort() : [];
}

/**
 * Connected-apps pill tone (display only). Write-class scopes — direct
 * writes, publish, and propose — render amber; everything else neutral.
 */
export function scopePillTone(scope: string): "amber" | "neutral" {
  return scope.endsWith(".write") || scope.endsWith(".publish") || scope.endsWith(".propose") ? "amber" : "neutral";
}

/** Owner controls render only for effectively-pending items (1B.5). */
export function canResolvePendingAction(action: PendingAction, nowMs: number): boolean {
  return effectivePendingStatus(action, nowMs) === "pending";
}
