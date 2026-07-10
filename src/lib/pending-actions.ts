/**
 * Phase 1B.1 — pending actions (proposals) validation + pure lifecycle helpers.
 *
 * Claude proposes; the owner disposes. This module is deliberately INERT and
 * pure (no DB, no MCP, no OAuth imports): 1B.2+ wire it into the server write
 * layer, the MCP dispatch, and the UI. Everything here operates on plain
 * values so the callers (and tests) control ids and clocks.
 *
 * Design source: docs/CLAUDE-PHASE-1B-PENDING-ACTIONS-BLUEPRINT.md (§2–§3,
 * §6–§7, decisions §11). First implementation ships exactly one type:
 * opportunity_update_proposal — Claude suggests edits to an existing
 * opportunity, the owner approves in the Milo UI, apply merges only
 * whitelisted fields. No publish, no delete, no settings, no billing.
 */
import type {
  PendingAction,
  PendingActionRiskLevel,
  PendingActionStatus,
  PendingActionType,
} from "./types";

// ---- constants ----

/** The write-class scope that governs proposing (weaker than milo.*.write). */
export const MILO_ACTIONS_PROPOSE_SCOPE = "milo.actions.propose";

export const PENDING_ACTIONS_CAP = 200;
export const MAX_PENDING_ACTION_PAYLOAD_BYTES = 16 * 1024;
export const MAX_PENDING_ACTION_PREVIEW_BYTES = 4 * 1024;
/** Lazy expiry horizon (decision §11.6): 14 days, no cron. */
export const PENDING_ACTION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const PENDING_ACTION_TYPES = ["opportunity_update_proposal"] as const;

/** The ONLY fields an opportunity_update_proposal may touch. */
export const OPPORTUNITY_UPDATE_FIELDS = ["title", "businessValue", "priority", "contentType", "recommendedCta"] as const;
export type OpportunityUpdateField = (typeof OPPORTUNITY_UPDATE_FIELDS)[number];

// Runtime mirrors of erased unions (same values as the 1A write tools).
const PRIORITIES = ["High", "Medium", "Low"];
const CONTENT_TYPES = ["Landing Page", "Service Page", "Blog Article", "Guide", "FAQ Page", "Comparison", "Location Page"];

/** riskLevel is DERIVED from the type — callers never supply it. */
const RISK_BY_TYPE: Record<PendingActionType, PendingActionRiskLevel> = {
  opportunity_update_proposal: "medium", // mutates existing owner data on apply
};

export function derivePendingActionRisk(type: PendingActionType): PendingActionRiskLevel {
  return RISK_BY_TYPE[type];
}

// ---- errors ----

/** Invalid shape/field/size — callers map this to -32010. */
export class PendingActionValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "PendingActionValidationError";
  }
}

/** pendingActions[] is full — callers map this to -32013. */
export class PendingActionCapError extends Error {
  constructor() {
    super(`pending actions limit reached (${PENDING_ACTIONS_CAP})`);
    this.name = "PendingActionCapError";
  }
}

/** Disallowed status transition — resolve paths fail closed on these. */
export class PendingActionTransitionError extends Error {
  constructor(from: PendingActionStatus, to: PendingActionStatus) {
    super(`invalid pending action transition: ${from} -> ${to}`);
    this.name = "PendingActionTransitionError";
  }
}

// ---- validation ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Bounded trimmed string (1A style). Throws PendingActionValidationError. */
function str(field: string, v: unknown, min: number, max: number, required: boolean): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw new PendingActionValidationError(field, "is required");
    return undefined;
  }
  if (typeof v !== "string") throw new PendingActionValidationError(field, "must be a string");
  const t = v.trim();
  if (t.length < min) throw new PendingActionValidationError(field, `must be at least ${min} character(s)`);
  if (t.length > max) throw new PendingActionValidationError(field, `must be at most ${max} characters`);
  return t;
}

export interface OpportunityUpdatePayload {
  opportunityId: string;
  updates: Partial<Record<OpportunityUpdateField, string>>;
}

/**
 * Strict per-type payload validation. Unknown keys are rejected at every
 * level, so publish/delete/settings/billing-shaped payloads fail closed as
 * unknown fields. The serialized-size cap is checked FIRST (defense in depth
 * against oversized blobs, independent of field bounds).
 */
export function validatePendingActionPayload(type: PendingActionType, payload: unknown): Record<string, unknown> {
  if (!isPlainObject(payload)) throw new PendingActionValidationError("payload", "must be an object");
  if (utf8Bytes(JSON.stringify(payload)) > MAX_PENDING_ACTION_PAYLOAD_BYTES) {
    throw new PendingActionValidationError("payload", `must be at most ${MAX_PENDING_ACTION_PAYLOAD_BYTES} bytes`);
  }

  // Single type in the first implementation; extend with a switch when more land.
  if (type !== "opportunity_update_proposal") throw new PendingActionValidationError("type", "unknown pending action type");

  for (const k of Object.keys(payload)) {
    if (k !== "opportunityId" && k !== "updates") throw new PendingActionValidationError(`payload.${k}`, "unknown field");
  }
  const opportunityId = str("payload.opportunityId", payload.opportunityId, 1, 100, true)!;
  const rawUpdates = payload.updates;
  if (!isPlainObject(rawUpdates)) throw new PendingActionValidationError("payload.updates", "must be an object");
  const keys = Object.keys(rawUpdates);
  if (keys.length === 0) throw new PendingActionValidationError("payload.updates", "must contain at least one field");
  for (const k of keys) {
    if (!(OPPORTUNITY_UPDATE_FIELDS as readonly string[]).includes(k)) {
      throw new PendingActionValidationError(`payload.updates.${k}`, "unknown field");
    }
  }

  const updates: Partial<Record<OpportunityUpdateField, string>> = {};
  const title = str("payload.updates.title", rawUpdates.title, 1, 200, false);
  if (title !== undefined) updates.title = title;
  const businessValue = str("payload.updates.businessValue", rawUpdates.businessValue, 1, 2000, false);
  if (businessValue !== undefined) updates.businessValue = businessValue;
  const recommendedCta = str("payload.updates.recommendedCta", rawUpdates.recommendedCta, 1, 200, false);
  if (recommendedCta !== undefined) updates.recommendedCta = recommendedCta;
  const priority = str("payload.updates.priority", rawUpdates.priority, 1, 10, false);
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) throw new PendingActionValidationError("payload.updates.priority", "must be High, Medium or Low");
    updates.priority = priority;
  }
  const contentType = str("payload.updates.contentType", rawUpdates.contentType, 1, 40, false);
  if (contentType !== undefined) {
    if (!CONTENT_TYPES.includes(contentType)) throw new PendingActionValidationError("payload.updates.contentType", "must be a valid Milo content type");
    updates.contentType = contentType;
  }

  const validated: OpportunityUpdatePayload = { opportunityId, updates };
  return validated as unknown as Record<string, unknown>;
}

/** Caller-suppliable creation input. riskLevel/status/source are NOT here — derived. */
export interface CreatePendingActionInput {
  type: PendingActionType;
  projectId: string;
  title: string;
  summary: string;
  payload: unknown;
  preview: string;
  requestId?: string;
  proposedByClientId?: string;
}

const CREATE_INPUT_FIELDS = ["type", "projectId", "title", "summary", "payload", "preview", "requestId", "proposedByClientId"];

// ---- lifecycle ----

/** Allowed transitions (blueprint §6): approve→apply happens in one mutation,
 * modeled as two hops; approved→rejected is the apply-validation-failure path. */
const TRANSITIONS: Record<PendingActionStatus, readonly PendingActionStatus[]> = {
  pending: ["approved", "rejected", "expired"],
  approved: ["applied", "rejected"],
  rejected: [],
  applied: [],
  expired: [],
};

export function canTransitionPendingAction(from: PendingActionStatus, to: PendingActionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function transition(action: PendingAction, to: PendingActionStatus, nowIso: string, resolution?: Partial<PendingAction["resolution"]>): PendingAction {
  if (!canTransitionPendingAction(action.status, to)) throw new PendingActionTransitionError(action.status, to);
  return {
    ...action,
    status: to,
    updatedAt: nowIso,
    ...(resolution ? { resolution: { resolvedAt: nowIso, resolvedBy: "owner" as const, ...action.resolution, ...resolution } } : {}),
  };
}

export function findPendingActionByRequestId(actions: readonly PendingAction[], requestId: string): PendingAction | undefined {
  return actions.find((a) => a.requestId === requestId);
}

/**
 * Create a pending action (pure). Ids and timestamps are supplied by the
 * caller (minted BEFORE any retried mutation, per the 1A rule). requestId
 * dedupe returns the existing action untouched with deduped:true.
 */
export function createPendingAction(
  existing: readonly PendingAction[],
  input: CreatePendingActionInput & Record<string, unknown>,
  deps: { id: string; nowIso: string },
): { actions: PendingAction[]; action: PendingAction; deduped: boolean } {
  for (const k of Object.keys(input)) {
    if (!CREATE_INPUT_FIELDS.includes(k)) throw new PendingActionValidationError(k, "unknown field");
  }
  if (!(PENDING_ACTION_TYPES as readonly string[]).includes(input.type)) {
    throw new PendingActionValidationError("type", "unknown pending action type");
  }

  const requestId = str("requestId", input.requestId, 1, 100, false);
  if (requestId) {
    const found = findPendingActionByRequestId(existing, requestId);
    if (found) return { actions: [...existing], action: found, deduped: true };
  }

  if (existing.length >= PENDING_ACTIONS_CAP) throw new PendingActionCapError();

  const projectId = str("projectId", input.projectId, 1, 100, true)!;
  const title = str("title", input.title, 1, 200, true)!;
  const summary = str("summary", input.summary, 1, 500, true)!;
  const preview = str("preview", input.preview, 1, MAX_PENDING_ACTION_PREVIEW_BYTES, true)!;
  if (utf8Bytes(preview) > MAX_PENDING_ACTION_PREVIEW_BYTES) {
    throw new PendingActionValidationError("preview", `must be at most ${MAX_PENDING_ACTION_PREVIEW_BYTES} bytes`);
  }
  const proposedByClientId = str("proposedByClientId", input.proposedByClientId, 1, 200, false);
  const payload = validatePendingActionPayload(input.type, input.payload);

  const action: PendingAction = {
    id: deps.id,
    type: input.type,
    projectId,
    title,
    summary,
    status: "pending",
    source: "claude",
    createdAt: deps.nowIso,
    updatedAt: deps.nowIso,
    expiresAt: new Date(Date.parse(deps.nowIso) + PENDING_ACTION_TTL_MS).toISOString(),
    ...(requestId ? { requestId } : {}),
    ...(proposedByClientId ? { proposedByClientId } : {}),
    requiredScope: MILO_ACTIONS_PROPOSE_SCOPE,
    payload,
    preview,
    riskLevel: derivePendingActionRisk(input.type),
  };
  return { actions: [...existing, action], action, deduped: false };
}

/** pending → approved (owner, Milo UI only). Callers must expire stale items first. */
export function approvePendingAction(action: PendingAction, nowIso: string): PendingAction {
  return transition(action, "approved", nowIso, {});
}

/** pending/approved → rejected. `error` is the machine reason for apply-time failures. */
export function rejectPendingAction(action: PendingAction, nowIso: string, opts?: { note?: string; error?: string }): PendingAction {
  const note = str("note", opts?.note, 1, 500, false);
  return transition(action, "rejected", nowIso, {
    ...(note ? { note } : {}),
    ...(opts?.error ? { error: opts.error } : {}),
  });
}

/** approved → applied, recording what landed and at which workspace rev. */
export function markPendingActionApplied(action: PendingAction, nowIso: string, applied: { appliedEntityIds: string[]; appliedAtRev: number }): PendingAction {
  return transition(action, "applied", nowIso, applied);
}

/** True when a still-pending action is past its expiry horizon. */
export function isPendingActionExpired(action: PendingAction, nowMs: number): boolean {
  return action.status === "pending" && !!action.expiresAt && Date.parse(action.expiresAt) < nowMs;
}

/**
 * Lazy expiry sweep (no cron): flip stale pending items to expired. Returns
 * the same array identity when nothing changed so callers can skip a save.
 */
export function expireStalePendingActions(actions: readonly PendingAction[], nowIso: string): { actions: readonly PendingAction[]; expiredIds: string[] } {
  const nowMs = Date.parse(nowIso);
  const expiredIds: string[] = [];
  const next = actions.map((a) => {
    if (!isPendingActionExpired(a, nowMs)) return a;
    expiredIds.push(a.id);
    return transition(a, "expired", nowIso);
  });
  return expiredIds.length ? { actions: next, expiredIds } : { actions, expiredIds };
}
