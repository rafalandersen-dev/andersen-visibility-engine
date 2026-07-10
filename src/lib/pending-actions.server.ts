/**
 * Phase 1B.2 — server-side pending action operations (dark: nothing exposes
 * these yet; the MCP tools arrive in 1B.3 and the UI in 1B.4/1B.5).
 *
 * All writes go through the rev-guarded workspace write layer (mutateWorkspace)
 * with ids/timestamps minted BEFORE the mutation so conflict retries never
 * generate fresh identity (1A rule). Reads are pure and never persist; the
 * lazy-expiry sweep is persisted only on write paths (create — and resolve,
 * in 1B.5), while read paths report an EFFECTIVE status so stale items always
 * display as expired. Approval/reject/apply server functions are deliberately
 * deferred to 1B.5 (owner-UI work).
 */
import type { PendingAction, PendingActionStatus, PendingActionType } from "./types";
import type { Opportunity, Project } from "./types";
import {
  createPendingAction,
  expireStalePendingActions,
  isPendingActionExpired,
  type CreatePendingActionInput,
  type OpportunityUpdatePayload,
} from "./pending-actions";

/** Uniform not-found (unknown project/opportunity/action — callers map to -32011). */
export class PendingActionNotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "PendingActionNotFoundError";
  }
}

/** Effective status: stored status, except stale pending items read as expired. */
function effectiveStatus(a: PendingAction, nowMs: number): PendingActionStatus {
  return isPendingActionExpired(a, nowMs) ? "expired" : a.status;
}

function actionsFrom(data: Record<string, unknown>): PendingAction[] {
  return ((data.pendingActions as PendingAction[] | undefined) ?? []).filter(Boolean);
}

export interface CreatePendingActionResult {
  action: PendingAction;
  deduped: boolean;
  /** Ids flipped to expired by the lazy sweep that rode this write. */
  expiredIds: string[];
  rev: number;
}

/**
 * Create a pending action in the owner's workspace. Validates shape/size/cap
 * via the pure 1B.1 helpers, dedupes on requestId, verifies the target project
 * (and, for opportunity updates, the target opportunity) exists — unknown
 * targets throw the uniform PendingActionNotFoundError. The lazy expiry sweep
 * rides the same atomic mutation.
 */
export async function createPendingActionForWorkspace(
  userId: string,
  input: CreatePendingActionInput,
  deps?: { id?: string; nowIso?: string },
): Promise<CreatePendingActionResult> {
  const { mutateWorkspace } = await import("./workspace.server");
  const entityId = deps?.id ?? Math.random().toString(36).slice(2, 10);
  const nowIso = deps?.nowIso ?? new Date().toISOString();

  const { result, rev } = await mutateWorkspace<Omit<CreatePendingActionResult, "rev">>(userId, (data) => {
    const swept = expireStalePendingActions(actionsFrom(data), nowIso);
    const { actions, action, deduped } = createPendingAction(swept.actions, input, { id: entityId, nowIso });

    if (!deduped) {
      const projects = ((data.projects as Partial<Project>[] | undefined) ?? []).filter(Boolean);
      if (!projects.some((p) => p.id === action.projectId)) throw new PendingActionNotFoundError();
      if (action.type === "opportunity_update_proposal") {
        const payload = action.payload as unknown as OpportunityUpdatePayload;
        const opportunities = ((data.opportunities as Partial<Opportunity>[] | undefined) ?? []).filter(Boolean);
        if (!opportunities.some((o) => o.id === payload.opportunityId)) throw new PendingActionNotFoundError();
      }
    }

    return {
      data: { ...data, pendingActions: [...actions] },
      result: { action, deduped, expiredIds: swept.expiredIds },
    };
  });
  return { ...result, rev };
}

/** Bounded list item — no payload/preview bodies (get returns the full action). */
export interface PendingActionSummary {
  id: string;
  type: PendingActionType;
  projectId: string;
  title: string;
  summary: string;
  status: PendingActionStatus;
  riskLevel: PendingAction["riskLevel"];
  requiredScope: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  requestId?: string;
}

export interface ListPendingActionsFilter {
  projectId?: string;
  status?: PendingActionStatus;
  type?: PendingActionType;
  /**
   * Own-proposal visibility for MCP callers: exact match on the proposing
   * client id. An empty string matches nothing (grants without a client id
   * see no proposals). Omit entirely for owner-side (UI) listings.
   */
  proposedByClientId?: string;
}

/**
 * List pending actions (summaries, newest first). Pure read — the effective
 * status reflects lazy expiry without persisting it; filters apply to the
 * effective status.
 */
export async function listPendingActionsForWorkspace(
  userId: string,
  filter?: ListPendingActionsFilter,
  deps?: { nowMs?: number },
): Promise<PendingActionSummary[]> {
  const { readWorkspaceRow, WorkspaceNotFoundError } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new WorkspaceNotFoundError();
  const nowMs = deps?.nowMs ?? Date.now();

  return actionsFrom(row.data)
    .map((a) => ({ a, status: effectiveStatus(a, nowMs) }))
    .filter(({ a, status }) => {
      if (filter?.projectId && a.projectId !== filter.projectId) return false;
      if (filter?.status && status !== filter.status) return false;
      if (filter?.type && a.type !== filter.type) return false;
      if (filter?.proposedByClientId !== undefined && a.proposedByClientId !== filter.proposedByClientId) return false;
      return true;
    })
    .sort((x, y) => Date.parse(y.a.createdAt) - Date.parse(x.a.createdAt))
    .map(({ a, status }) => ({
      id: a.id,
      type: a.type,
      projectId: a.projectId,
      title: a.title,
      summary: a.summary,
      status,
      riskLevel: a.riskLevel,
      requiredScope: a.requiredScope,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      ...(a.expiresAt ? { expiresAt: a.expiresAt } : {}),
      ...(a.requestId ? { requestId: a.requestId } : {}),
    }));
}

/** Get one pending action by id (full record, effective status). Uniform not-found. */
export async function getPendingActionForWorkspace(
  userId: string,
  actionId: string,
  deps?: { nowMs?: number },
): Promise<PendingAction> {
  const { readWorkspaceRow, WorkspaceNotFoundError } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new WorkspaceNotFoundError();
  const found = actionsFrom(row.data).find((a) => a.id === actionId);
  if (!found) throw new PendingActionNotFoundError();
  const status = effectiveStatus(found, deps?.nowMs ?? Date.now());
  return status === found.status ? found : { ...found, status };
}

// ---------------------------------------------------------------------------
// Audit event shape (design finalized in 1B.2; persisted by the 1B.3 dispatch
// hooks alongside the other connector events).
// ---------------------------------------------------------------------------

export interface PendingActionCreatedAudit {
  event: "pending_action_created";
  detail: Record<string, unknown>;
}

/**
 * Build the pending_action_created audit event. Names and ids ONLY — titles,
 * summaries, previews, payload values, tokens/hashes/family ids never enter
 * the detail. fieldsChanged carries the proposed update FIELD NAMES, sorted
 * (1A mcp_write convention).
 */
export function buildPendingActionCreatedAudit(
  action: PendingAction,
  opts: { deduped?: boolean; ok: boolean; error?: string },
): PendingActionCreatedAudit {
  const updates = (action.payload as { updates?: Record<string, unknown> }).updates ?? {};
  return {
    event: "pending_action_created",
    detail: {
      actionId: action.id,
      type: action.type,
      projectId: action.projectId,
      status: action.status,
      riskLevel: action.riskLevel,
      requiredScope: action.requiredScope,
      fieldsChanged: Object.keys(updates).sort(),
      ...(action.requestId ? { requestId: action.requestId } : {}),
      ...(opts.deduped ? { deduped: true } : {}),
      ...(opts.error ? { error: opts.error } : {}),
      ok: opts.ok,
    },
  };
}
