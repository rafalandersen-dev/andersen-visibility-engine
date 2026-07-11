/**
 * Phase 1B.4 — pure, client-safe presentation logic for the Pending Actions
 * inbox. The page component stays thin; everything testable lives here (the
 * repo's test environment is node-only, so UI behavior is covered at this
 * layer). STRICTLY read-only: nothing in this module mutates state or calls
 * server functions.
 */
import type { Opportunity, PendingAction, PendingActionStatus, PendingActionType, Project } from "./types";
import { isPendingActionExpired, OPPORTUNITY_UPDATE_FIELDS, PROJECT_SETUP_PROJECT_FIELDS, type OpportunityUpdateField } from "./pending-actions";

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

/** Proposed field NAMES for the card summary line (sorted, safe). Type-aware:
 * opportunity updates keys, or project_setup projectFields keys. */
export function proposedFieldNames(action: PendingAction): string[] {
  const group =
    action.type === "project_setup_proposal"
      ? (action.payload as { projectFields?: Record<string, unknown> }).projectFields
      : (action.payload as { updates?: Record<string, unknown> }).updates;
  return group && typeof group === "object" && !Array.isArray(group) ? Object.keys(group).sort() : [];
}

// ---- Phase 1C.4 — project_setup_proposal presentation ----------------------

export interface ProjectSetupProfileRow {
  field: string;
  /** undefined when the target project no longer exists. */
  current: string | undefined;
  proposed: string;
  /** True when a non-empty current value would be replaced (decision §12.3 —
   * overwrites are surfaced explicitly before approval). */
  overwrite: boolean;
}
export interface ProjectSetupServiceRow {
  name: string;
  kind?: string;
  priority?: string;
}
export interface ProjectSetupOpportunityRow {
  title: string;
  contentType?: string;
  priority?: string;
}
export interface ProjectSetupView {
  /** False when the target project no longer exists — the UI warns. */
  targetExists: boolean;
  profile: ProjectSetupProfileRow[];
  services: ProjectSetupServiceRow[];
  opportunities: ProjectSetupOpportunityRow[];
  /** competitorUrls, shown as plain text (never links). */
  competitors: string[];
}

/** Arrays render comma-joined; everything else via String(). */
function fieldToDisplay(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  return v === undefined || v === null ? "" : String(v);
}
function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Structured render model for a project_setup_proposal, computed against the
 * CURRENT project at render time. projectFields become a before/after profile
 * diff (competitorUrls split out as the competitors list); services and
 * opportunities are additive create-lists. Only whitelisted fields appear.
 */
export function projectSetupView(action: PendingAction, projects: readonly Project[]): ProjectSetupView | null {
  if (action.type !== "project_setup_proposal") return null;
  const payload = action.payload as {
    projectFields?: Record<string, unknown>;
    services?: unknown[];
    opportunities?: unknown[];
  };
  const target = projects.find((p) => p.id === action.projectId);
  const pf = payload.projectFields && typeof payload.projectFields === "object" && !Array.isArray(payload.projectFields) ? payload.projectFields : {};

  const profile: ProjectSetupProfileRow[] = [];
  for (const field of PROJECT_SETUP_PROJECT_FIELDS) {
    if (field === "competitorUrls") continue; // shown separately, as plain text
    if (!(field in pf)) continue;
    const proposed = fieldToDisplay(pf[field]);
    const current = target ? fieldToDisplay((target as unknown as Record<string, unknown>)[field]) : undefined;
    profile.push({ field, current, proposed, overwrite: !!target && (current ?? "").trim().length > 0 });
  }

  const services: ProjectSetupServiceRow[] = Array.isArray(payload.services)
    ? payload.services.map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return { name: fieldToDisplay(o.name), kind: optStr(o.kind), priority: optStr(o.priority) };
      })
    : [];
  const opportunities: ProjectSetupOpportunityRow[] = Array.isArray(payload.opportunities)
    ? payload.opportunities.map((o) => {
        const x = (o ?? {}) as Record<string, unknown>;
        return { title: fieldToDisplay(x.title), contentType: optStr(x.contentType), priority: optStr(x.priority) };
      })
    : [];
  const competitors: string[] = Array.isArray(pf.competitorUrls) ? (pf.competitorUrls as unknown[]).filter((u) => typeof u === "string").map((u) => u as string) : [];

  return { targetExists: !!target, profile, services, opportunities, competitors };
}

/** Cheap counts (no projects needed) for the card summary + approve dialog. */
export function projectSetupCounts(action: PendingAction): { fields: number; services: number; opportunities: number; competitors: number } {
  const p = action.payload as { projectFields?: Record<string, unknown>; services?: unknown[]; opportunities?: unknown[] };
  const pf = p.projectFields && typeof p.projectFields === "object" && !Array.isArray(p.projectFields) ? p.projectFields : {};
  return {
    fields: Object.keys(pf).filter((k) => k !== "competitorUrls").length,
    services: Array.isArray(p.services) ? p.services.length : 0,
    opportunities: Array.isArray(p.opportunities) ? p.opportunities.length : 0,
    competitors: Array.isArray(pf.competitorUrls) ? (pf.competitorUrls as unknown[]).length : 0,
  };
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
